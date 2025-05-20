// src/message-handler.ts

import { settingsManager } from "./settings-manager"; // Ensure settingsManager is initialized
import {
  MessageType,
  defaultSettings,
  UpdateSettingsMessage,
  UpdateSiteModeMessage,
  ContentScriptReadyMessage,
  GetInitialSettingsMessage,
  AudioSettings,
} from "./types"; // Adjust path to types.ts if needed

// Helper function to get hostname from URL
function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch (e) {
    // console.warn("Message Handler: Invalid URL for getHostname:", url);
    return "";
  }
}

async function handleUpdateSettings(
  message: UpdateSettingsMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  try {
    let targetTabId: number | undefined;
    let hostname: string; // Must be assigned

    if (!sender.tab) { // Message from popup or other extension context without a tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.url && tabs[0]?.id) {
        targetTabId = tabs[0].id;
        hostname = getHostname(tabs[0].url);
        // If popup intends to update site-specific settings for the active tab's site
        if (!hostname && !message.isGlobal) {
            console.warn("Message Handler: UpdateSettings from popup for active tab, but active tab has no valid hostname for site-specific update.");
            sendResponse({ success: false, error: "Active tab has no valid hostname for site-specific update." });
            return;
        }
      } else if (message.isGlobal) { // No active tab, but it's a global setting update
        hostname = "global_context"; // Special identifier or ""
        targetTabId = undefined;
      } else { // No active tab, and not a global update
        console.warn("Message Handler: UpdateSettings from popup, no active suitable tab, and not a global update.");
        sendResponse({ success: false, error: "No active suitable tab found for non-global update from popup." });
        return;
      }
    } else { // Message from content script with a tab
      if (!sender.tab.url || !sender.tab.id) { // Should not happen if sender.tab exists
        throw new Error("Invalid sender tab for UpdateSettings");
      }
      targetTabId = sender.tab.id;
      hostname = getHostname(sender.tab.url);
      if (!hostname && !message.isGlobal) { // Content script on a page like about:blank, not a global update
          console.warn(`Message Handler: UpdateSettings from content script (tab ${targetTabId}) on page with no hostname: ${sender.tab.url}. Cannot apply site-specific settings.`);
          // Decide if this should be an error or ignored for site-specific
           sendResponse({ success: false, error: "Content script on a page with no valid hostname for site-specific update." });
           return;
      }
    }

    // console.log("Message Handler: Processing UpdateSettings for", {
    //   hostname: hostname, // hostname is now guaranteed to be assigned or error thrown
    //   tabId: targetTabId,
    //   isPopup: !sender.tab,
    //   settings: message.settings,
    //   enabled: message.enabled,
    //   isGlobalFlag: message.isGlobal,
    // });

    const currentSiteConfig = settingsManager.getSettingsForSite(hostname); // Safe even if hostname is "global_context" or ""

    if (message.enabled === false) {
      await settingsManager.disableSite(hostname, targetTabId);
      sendResponse({ success: true, message: `Site ${hostname} disabled.` });
      return;
    }

    if (!message.settings) {
      throw new Error("No settings provided in UpdateSettingsMessage");
    }

    if (message.isGlobal) {
      await settingsManager.updateGlobalSettings(message.settings, targetTabId, hostname);
    } else {
      // For site-specific updates, hostname must be valid (not "global_context" or empty)
      if (!hostname || hostname === "global_context") {
        console.error("Message Handler: Attempted to update site settings without a valid site hostname.", message);
        sendResponse({ success: false, error: "Cannot update site-specific settings without a valid site hostname." });
        return;
      }
      await settingsManager.updateSiteSettings(hostname, message.settings, targetTabId);
    }

    sendResponse({ success: true });
  } catch (error) {
    console.error("Message Handler: Error processing UpdateSettings", error);
    sendResponse({ success: false, error: String(error) });
  }
}

async function handleUpdateSiteMode(
  message: UpdateSiteModeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  try {
    let { hostname, mode } = message; // mode can be undefined, handled below
    let tabId = sender.tab?.id;

    if (!hostname) {
      if (sender.tab?.url) {
        const derivedHostname = getHostname(sender.tab.url);
        if (derivedHostname) {
          hostname = derivedHostname;
          // console.warn(`Message Handler: UpdateSiteMode - hostname missing, derived '${hostname}' from sender tab ${tabId}`);
        }
      }
    }
    if (!hostname) { // Still no hostname
        const error = "No hostname provided or derivable for site mode update.";
        console.error("Message Handler:", error);
        sendResponse({ success: false, error });
        return;
    }
    if (!mode || (mode !== "global" && mode !== "site" && mode !== "disabled")) {
      const error = `Invalid mode provided: ${mode}`;
      console.error("Message Handler:", error);
      sendResponse({ success: false, error });
      return;
    }

    if (!tabId && hostname) { // From popup, try to find active tab matching hostname
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id && tabs[0]?.url && getHostname(tabs[0].url) === hostname) {
          tabId = tabs[0].id;
      }
    }

    await settingsManager.updateSiteMode(hostname, mode, tabId);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Message Handler: Error processing UpdateSiteMode", error);
    sendResponse({ success: false, error: String(error) });
  }
}

async function handleContentScriptReady(
  message: ContentScriptReadyMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  try {
    if (!sender.tab?.id || !sender.tab?.url) {
      throw new Error("Invalid sender tab for ContentScriptReady");
    }
    const tabId = sender.tab.id;
    const url = sender.tab.url;
    // Use hostname from message if provided (e.g., iframe got it from top), else derive.
    const hostname = message.hostname || getHostname(url);

    if (!hostname) {
      // console.warn(`Message Handler: ContentScriptReady from tab ${tabId} (${url}) - no valid hostname. Sending default settings.`);
      await chrome.tabs.sendMessage(tabId, {
          type: "UPDATE_SETTINGS", settings: defaultSettings, isGlobal: true, enabled: true, hostname: "",
      } as UpdateSettingsMessage);
      sendResponse({ success: true, message: "Sent default settings as hostname was invalid." });
      return;
    }

    const siteConfig = settingsManager.getSettingsForSite(hostname);
    let settingsToSend: AudioSettings;
    const isEnabled = siteConfig.enabled; // This comes from SiteSettings.enabled

    if (!isEnabled) { // Site is explicitly disabled
        settingsToSend = defaultSettings; // Send defaults, content script uses 'enabled' flag
    } else if (siteConfig.activeSetting === "global") {
      settingsToSend = settingsManager.globalSettings;
    } else if (siteConfig.activeSetting === "site" && siteConfig.settings) {
      settingsToSend = siteConfig.settings;
    } else { // Fallback, should ideally not be hit if siteConfig is structured well
      settingsToSend = defaultSettings;
    }

    // console.log(`Message Handler (ContentScriptReady): Hostname: ${hostname}, Tab: ${tabId}`);
    // console.log(`  SiteConfig: `, JSON.stringify(siteConfig));
    // console.log(`  SettingsToSend: `, JSON.stringify(settingsToSend));
    // console.log(`  isEnabled: ${isEnabled}, isGlobal: ${siteConfig.activeSetting === "global"}`);

    await chrome.tabs.sendMessage(tabId, {
      type: "UPDATE_SETTINGS", settings: settingsToSend, isGlobal: siteConfig.activeSetting === "global", enabled: isEnabled, hostname: hostname,
    } as UpdateSettingsMessage);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Message Handler: Error handling ContentScriptReady", error);
    sendResponse({ success: false, error: String(error) });
  }
}

async function handleGetInitialSettings(
  message: GetInitialSettingsMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  try {
    const hostname = message.hostname;
    if (!hostname) {
      // console.warn("Message Handler (GetInitialSettings): Hostname not provided. Sending defaults.");
      sendResponse({ success: true, settings: defaultSettings, enabled: true, isGlobal: true });
      return;
    }

    const siteConfig = settingsManager.getSettingsForSite(hostname);
    let settingsToUse: AudioSettings;
    const isEnabled = siteConfig.enabled;

    if (!isEnabled) {
        settingsToUse = defaultSettings;
    } else if (siteConfig.activeSetting === "global") {
        settingsToUse = settingsManager.globalSettings;
    } else if (siteConfig.activeSetting === "site" && siteConfig.settings) {
        settingsToUse = siteConfig.settings;
    } else {
        settingsToUse = defaultSettings;
    }

    // console.log(`Message Handler (GetInitialSettings): Hostname: ${hostname}`);
    // console.log(`  SiteConfig: `, JSON.stringify(siteConfig));
    // console.log(`  SettingsToUse: `, JSON.stringify(settingsToUse));
    // console.log(`  isEnabled: ${isEnabled}, isGlobal: ${siteConfig.activeSetting === "global"}`);

    sendResponse({
      success: true, settings: settingsToUse, enabled: isEnabled, isGlobal: siteConfig.activeSetting === "global", hostname: hostname,
    });
  } catch (error) {
    console.error("Message Handler: Error handling GetInitialSettings", error);
    sendResponse({ success: false, error: String(error), settings: defaultSettings, enabled: true, isGlobal: true });
  }
}

export function setupMessageHandler() {
  settingsManager.initialize().then(() => {
    // console.log("Message Handler: SettingsManager initialized, proceeding to setup message listener.");

    if (chrome.runtime.onMessage.hasListeners()) {
      // console.warn("Message Handler: Listeners already attached. Skipping setup.");
      return;
    }
    chrome.runtime.onMessage.addListener(
      (message: MessageType, sender, sendResponse) => {
        // console.log("Message Handler: Received message:", message.type, "from tab:", sender.tab?.id, "origin:", sender.origin);

        (async () => {
          try {
            if (message.type === "UPDATE_SETTINGS") {
              await handleUpdateSettings(message, sender, sendResponse);
            } else if (message.type === "UPDATE_SITE_MODE") {
              await handleUpdateSiteMode(message, sender, sendResponse);
            } else if (message.type === "CONTENT_SCRIPT_READY") {
              await handleContentScriptReady(message, sender, sendResponse);
            } else if (message.type === "GET_INITIAL_SETTINGS") {
              await handleGetInitialSettings(message, sender, sendResponse);
            } else {
              // console.warn("Message Handler: Unknown message type received:", message);
              // Consider not returning false to let the channel close naturally for unhandled types.
              // If sendResponse is definitely not called, no need for 'return true'.
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error("Message Handler: Uncaught error processing message:", { error: errorMsg, messageType: message.type });
            if (typeof sendResponse === 'function') {
              try { sendResponse({ success: false, error: errorMsg }); }
              catch (e) { console.error("Message Handler: Failed to send error response:", e); }
            }
          }
        })();
        // Return true to keep the message channel open for an asynchronous sendResponse
        // Only return true if sendResponse MIGHT be called. If a message type guarantees no response, could return false/undefined.
        return true;
      }
    );
    console.log("Message Handler: Event listener setup complete.");
  }).catch(error => {
    console.error("Message Handler: CRITICAL - Failed to initialize SettingsManager. Message handling will be unreliable.", error);
    // Consider what to do if SM fails to init. Maybe setup listener anyway but handlers check SM status?
  });
}