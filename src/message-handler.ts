import { settingsManager } from "./settings-manager";
import { MessageType, defaultSettings, UpdateSettingsMessage } from "./types";

// Helper function to get hostname from URL
function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch (e) {
    console.error("Message Handler: Invalid URL:", url);
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
        throw new Error("No active tab found");
      }
      targetTabId = tabs[0].id;
      targetUrl = tabs[0].url;
      hostname = getHostname(targetUrl);
    } else {
      // Message from content script
      if (!sender.tab.url || !sender.tab.id) {
        throw new Error("Invalid sender tab");
      }
      targetTabId = sender.tab.id;
      targetUrl = sender.tab.url;
      hostname = getHostname(targetUrl);
    }

    console.log("Message Handler: Processing update for", {
      hostname,
      tabId: targetTabId,
      isPopup: !sender.tab,
      settings: message.settings,
    });

    // Get current site config
    const currentSiteConfig = await settingsManager.getSettingsForSite(
      hostname
    );
    const isCurrentlyGlobal = currentSiteConfig?.activeSetting === "global";

    if (!message.enabled) {
      await settingsManager.disableSite(hostname, targetTabId);
      return sendResponse({ success: true });
    }

    if (!message.settings) {
      throw new Error("No settings provided");
    }

    // Update settings based on mode
    if (message.isGlobal || isCurrentlyGlobal) {
      await settingsManager.updateGlobalSettings(
        message.settings,
        targetTabId,
        hostname
      );
    } else {
      await settingsManager.updateSiteSettings(
        hostname,
        message.settings,
        targetTabId
      );
    }

    // SettingsEventHandler will now handle notifying the content script
    // based on events emitted by SettingsManager. No need to forward here.

    sendResponse({ success: true });
  } catch (error) {
    console.error("Message Handler: Error processing update", error);
    sendResponse({ success: false, error: String(error) });
  }
}

async function handleUpdateSiteMode(
  message: any, //MessageType, // TODO: Type this correctly
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  const { hostname, mode } = message;
  const tabId = sender.tab?.id;

  // Validate inputs
  if (!hostname) {
    const error = "No hostname provided for site mode update";
    console.error("Message Handler:", error);
    sendResponse({ success: false, error });
    return;
  }

  if (mode !== "global" && mode !== "site" && mode !== "disabled") {
    // Updated validation
    const error = `Invalid mode provided: ${mode}`;
    console.error("Message Handler:", error);
    sendResponse({ success: false, error });
    return;
  }

  const { settingsToUse, siteConfig } = await settingsManager.updateSiteMode(
    hostname,
    mode,
    tabId
  );

  // Broadcast settings to the tab
  if (tabId) {
    await chrome.tabs.sendMessage(tabId, {
      type: "UPDATE_SETTINGS",
      settings: settingsToUse,
      isGlobal: mode === "global",
    });
  }

  sendResponse({ success: true });
}

async function handleContentScriptReady(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  try {
    if (!sender.tab?.id || !sender.tab?.url) {
      throw new Error("Invalid sender tab");
    }

    const hostname = message.hostname || getHostname(sender.tab.url);
    const siteConfig = await settingsManager.getSettingsForSite(hostname);

    const settingsToSend = siteConfig?.settings || defaultSettings;
    const isGlobal = siteConfig?.activeSetting === "global";
    const isEnabled = siteConfig?.enabled ?? true;

    await chrome.tabs.sendMessage(sender.tab.id, {
      type: "UPDATE_SETTINGS",
      settings: settingsToSend,
      isGlobal,
      enabled: isEnabled,
      hostname,
    } as MessageType);

    sendResponse({ success: true });
  } catch (error) {
    console.error(
      "Message Handler: Error handling content script ready",
      error
    );
    sendResponse({ success: false, error: String(error) });
  }
}

export function setupMessageHandler() {
  chrome.runtime.onMessage.addListener(
    (message: MessageType, sender, sendResponse) => {
      console.log(
        "Message Handler: Received message:",
        message,
        "from tab:",
        sender.tab?.id,
        sender,
        "sender type:",
        sender.documentId ? "content" : "popup"
      );

      (async () => {
        try {
          if (message.type === "UPDATE_SETTINGS") {
            await handleUpdateSettings(message, sender, sendResponse);
          } else if (message.type === "UPDATE_SITE_MODE") {
            await handleUpdateSiteMode(message, sender, sendResponse);
          } else if (message.type === "CONTENT_SCRIPT_READY") {
            await handleContentScriptReady(message, sender, sendResponse);
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.error("Message Handler: Error processing message:", {
            error: errorMsg,
            message,
            stack: error instanceof Error ? error.stack : undefined,
          });
          sendResponse({ success: false, error: errorMsg });
        }
      })();

      return true; // Keep the message channel open for async response
    }
  );
}
