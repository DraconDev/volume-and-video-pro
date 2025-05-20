import { settingsManager } from "./settings-manager";
import {
  MessageType,
  defaultSettings,
  UpdateSettingsMessage,
  UpdateSiteModeMessage, // Make sure this is exported from types.ts if used directly
  ContentScriptReadyMessage, // Make sure this is exported from types.ts if used directly
  GetInitialSettingsMessage, // Make sure this is exported from types.ts
  AudioSettings,
} from "./types";

// Helper function to get hostname from URL
function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch (e) {
    console.warn("Message Handler: Invalid URL:", url); // Changed to warn
    return "";
  }
}

async function handleUpdateSettings(
  message: UpdateSettingsMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  try {
    // If sender is popup (no tab), get active tab info
    let targetTabId: number | undefined;
    let targetUrl: string | undefined;
    let hostname: string;

    if (!sender.tab) {
      // Message from popup - get active tab
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tabs[0]?.url || !tabs[0]?.id) {
        // It's possible no active tab is suitable (e.g., devtools, new tab page)
        // In this case, we might only be able to update global settings if intended
        // or settings for a hostname if explicitly provided in the message (though not current design)
        if (message.isGlobal) {
            // Allow global settings update even without a specific tab context
            hostname = "global_context"; // Placeholder or handle as truly global
            targetTabId = undefined; // No specific tab to target for this update, but SettingsManager handles broadcast
        } else {
            console.warn("Message Handler: UpdateSettings from popup, but no active suitable tab found and not a global update.");
            sendResponse({ success: false, error: "No active suitable tab found for non-global update from popup." });
            return;
        }
      } else {
        targetTabId = tabs[0].id;
        targetUrl = tabs[0].url;
        hostname = getHostname(targetUrl);
        if (!hostname && !message.isGlobal) { // if hostname is invalid and not global, error
            console.warn("Message Handler: UpdateSettings from popup, active tab URL invalid, and not a global update.");
            sendResponse({ success: false, error: "Active tab has an invalid URL for site-specific update." });
            return;
        }
      }
    } else {
      // Message from content script
      if (!sender.tab.url || !sender.tab.id) {
        throw new Error("Invalid sender tab for UpdateSettings");
      }
      targetTabId = sender.tab.id;
      targetUrl = sender.tab.url;
      hostname = getHostname(targetUrl);
      if (!hostname) { // if hostname is invalid (e.g. about:blank from content script)
          console.warn(`Message Handler: UpdateSettings from content script (tab ${targetTabId}) with invalid URL: ${targetUrl}. Settings update might not apply correctly if site-specific.`);
          // Potentially default to global or reject if hostname is critical
      }
    }

    console.log("Message Handler: Processing update for", {
      hostname: hostname || "N/A",
      tabId: targetTabId,
      isPopup: !sender.tab,
      settings: message.settings,
      enabled: message.enabled,
      isGlobalFlag: message.isGlobal,
    });

    // Get current site config for the resolved hostname (if any)
    // Note: hostname might be empty if URL was invalid. SettingsManager handles empty/null hostnames gracefully.
    const currentSiteConfig = settingsManager.getSettingsForSite(hostname);
    const isCurrentlyGlobal = currentSiteConfig?.activeSetting === "global";

    if (message.enabled === false) { // Explicitly disabling
      await settingsManager.disableSite(hostname, targetTabId);
      sendResponse({ success: true, message: `Site ${hostname} disabled.` });
      return;
    }

    if (!message.settings) {
      throw new Error("No settings provided in UpdateSettingsMessage");
    }

    // Update settings based on mode
    // If message.isGlobal is true, OR if the site is currently set to use global and no explicit site settings are being sent
    if (message.isGlobal || (isCurrentlyGlobal && !message.settings)) { // Refined condition
      await settingsManager.updateGlobalSettings(
        message.settings,
        targetTabId, // Pass tabId for potential targeted refresh if needed by manager
        hostname     // Pass hostname for context in manager
      );
    } else {
      // If hostname is empty/invalid here, updateSiteSettings might default or log an error,
      // depending on its implementation. It's important that SettingsManager can handle this.
      await settingsManager.updateSiteSettings(
        hostname,
        message.settings,
        targetTabId
      );
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
  const { hostname, mode } = message;
  let tabId = sender.tab?.id;

  if (!hostname) {
    // If hostname is not in message, try to get it from sender (if from content script)
    // This is a fallback, popup should ideally send it.
    if (sender.tab && sender.tab.url) {
        const derivedHostname = getHostname(sender.tab.url);
        if (!derivedHostname) {
            const error = "No hostname provided for site mode update and could not derive from sender.";
            console.error("Message Handler:", error);
            sendResponse({ success: false, error });
            return;
        }
        // Use derived hostname if message.hostname was missing
        // message.hostname = derivedHostname; // This would modify the message object, better to use a local var
        console.warn(`Message Handler: UpdateSiteMode - hostname missing in message, derived '${derivedHostname}' from sender tab ${sender.tab.id}`);
    } else {
        const error = "No hostname provided for site mode update and sender is not a tab or tab has no URL.";
        console.error("Message Handler:", error);
        sendResponse({ success: false, error });
        return;
    }
  }


  if (mode !== "global" && mode !== "site" && mode !== "disabled") {
    const error = `Invalid mode provided: ${mode}`;
    console.error("Message Handler:", error);
    sendResponse({ success: false, error });
    return;
  }

  // If message came from popup, tabId might be undefined.
  // We need to find the active tab to inform it if 'hostname' matches.
  if (!tabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id && tabs[0]?.url && getHostname(tabs[0].url) === hostname) {
        tabId = tabs[0].id;
    }
  }


  // SettingsManager.updateSiteMode will now handle the broadcast via SettingsEventHandler
  await settingsManager.updateSiteMode(
    hostname!, // We've validated hostname or derived it
    mode,
    tabId // Pass tabId for context, though broadcast is separate
  );

  // No need to directly send message here, SettingsManager->SettingsEventHandler handles it.
  sendResponse({ success: true });
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
    const hostname = message.hostname || getHostname(url);

    if (!hostname) {
        console.warn(`Message Handler: ContentScriptReady from tab ${tabId} (${url}) - could not determine hostname. Sending default settings.`);
        // Send default settings if hostname is indeterminable
        await chrome.tabs.sendMessage(tabId, {
            type: "UPDATE_SETTINGS",
            settings: defaultSettings,
            isGlobal: true, // Assuming default state is to use global settings
            enabled: true,  // Assuming enabled by default
            hostname: "", // No valid hostname
        } as UpdateSettingsMessage);
        sendResponse({ success: true, message: "Sent default settings as hostname was invalid." });
        return;
    }

    const siteConfig = settingsManager.getSettingsForSite(hostname);

    let settingsToSend: AudioSettings;
    let isEnabled = siteConfig.enabled;

    if (siteConfig.activeSetting === "global") {
      settingsToSend = settingsManager.globalSettings;
    } else if (siteConfig.activeSetting === "site" && siteConfig.settings) {
      settingsToSend = siteConfig.settings;
    } else { // disabled or uninitialized site settings within siteConfig
      settingsToSend = defaultSettings; // When disabled, UI might show defaults or be greyed out
                                        // The 'enabled' flag is more important here
    }


    console.log(`Message Handler (ContentScriptReady): For Hostname: ${hostname}, Tab ID: ${tabId}`);
    console.log(`  SiteConfig: `, siteConfig);
    console.log(`  Settings to send: `, settingsToSend);
    console.log(`  isEnabled: ${isEnabled}, isGlobal: ${siteConfig.activeSetting === "global"}`);


    await chrome.tabs.sendMessage(tabId, {
      type: "UPDATE_SETTINGS",
      settings: settingsToSend,
      isGlobal: siteConfig.activeSetting === "global",
      enabled: isEnabled,
      hostname: hostname, // Send back the resolved hostname
    } as UpdateSettingsMessage);

    sendResponse({ success: true });
  } catch (error) {
    console.error(
      "Message Handler: Error handling ContentScriptReady",
      error
    );
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
      console.warn("Message Handler (GetInitialSettings): Hostname not provided. Sending defaults.");
      sendResponse({
        success: true, // Technically success, but with default data
        settings: defaultSettings,
        enabled: true, // Default assumption
        isGlobal: true // Default assumption
      });
      return;
    }

    const siteConfig = settingsManager.getSettingsForSite(hostname);
    let settingsToUse: AudioSettings;
    let isEnabled = siteConfig.enabled;

    if (siteConfig.activeSetting === "global") {
        settingsToUse = settingsManager.globalSettings;
    } else if (siteConfig.activeSetting === "site" && siteConfig.settings) {
        settingsToUse = siteConfig.settings;
    } else { // Covers "disabled" or site config where settings might be undefined
        settingsToUse = defaultSettings; // If disabled, these are the "neutral" settings
    }

    console.log(`Message Handler (GetInitialSettings): For Hostname: ${hostname}`);
    console.log(`  SiteConfig: `, siteConfig);
    console.log(`  Settings to send: `, settingsToUse);
    console.log(`  isEnabled: ${isEnabled}, isGlobal: ${siteConfig.activeSetting === 'global'}`);

    sendResponse({
      success: true,
      settings: settingsToUse,
      enabled: isEnabled,
      isGlobal: siteConfig.activeSetting === "global",
      hostname: hostname,
    });
  } catch (error) {
    console.error("Message Handler: Error handling GetInitialSettings", error);
    sendResponse({
      success: false,
      error: String(error),
      settings: defaultSettings, // Send defaults on error
      enabled: true,
      isGlobal: true,
    });
  }
}

export function setupMessageHandler() {
  if (chrome.runtime.onMessage.hasListeners()) {
    console.warn("Message Handler: Listeners already attached. Skipping setup to avoid duplicates.");
    return;
  }
  chrome.runtime.onMessage.addListener(
    (message: MessageType, sender, sendResponse) => {
      console.log(
        "Message Handler: Received message:",
        message,
        "from tab:",
        sender.tab?.id,
        "sender URL:",
        sender.url,
        "sender origin:",
        sender.origin,
        // sender, // Full sender object can be verbose
        "sender type:",
        sender.documentId ? "content script" : (sender.tab ? "popup/options in tab" : "popup/extension service worker")
      );

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
            console.warn("Message Handler: Unknown message type received:", message);
            // Optionally send a response for unknown types
            // sendResponse({ success: false, error: "Unknown message type" });
            // For now, let it be, as 'return true' is not hit, channel might close.
            // If we want to ensure channel stays open for all paths for some reason,
            // we would need to call sendResponse or return true explicitly here too.
            // However, for unknown types, usually no async response is expected.
            return false; // Explicitly indicate no async response for unknown types
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.error("Message Handler: Uncaught error processing message:", {
            error: errorMsg,
            message,
            stack: error instanceof Error ? error.stack : undefined,
          });
          // Ensure sendResponse is called in case of unhandled promise rejection inside the async IIFE
          if (typeof sendResponse === 'function') {
            try {
                sendResponse({ success: false, error: errorMsg });
            } catch (e) {
                console.error("Message Handler: Failed to send error response:", e);
            }
          }
        }
      })();

      return true; // Keep the message channel open for async response for known message types
    }
  );
  console.log("Message Handler: Event listener setup complete.");
}