import { settingsManager } from "../src/settings-manager";
import { defaultSettings } from "../src/types";
import { defineBackground } from "wxt/sandbox";
import { setupMessageHandler } from "../src/message-handler";
import { setupSettingsEventHandler } from "../src/settings-event-handler";

// Initialize settings on extension startup or first install
chrome.runtime.onInstalled.addListener(async () => {
  console.log(
    "Background: onInstalled event triggered. Initializing settings..."
  );
  await settingsManager.initialize();
  console.log("Background: Settings initialized via onInstalled.");
});

// Helper function to get hostname from URL
function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch (e) {
    console.error("Background: Invalid URL:", url);
    return "";
  }
}

// Keep track of active tabs and settings
const activeTabs = new Set<number>();

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener(
  async (message: any, sender: chrome.runtime.MessageSender, sendResponse) => {
    // Make async
    const tabId = sender.tab?.id;
    const url = sender.tab?.url;
    const hostname = message.hostname || (url ? getHostname(url) : null);

    if (message.type === "GET_INITIAL_SETTINGS") {
      if (!hostname) {
        console.warn(
          "Background: GET_INITIAL_SETTINGS received without hostname."
        );
        sendResponse({ settings: { ...defaultSettings } });
        return false; // Still synchronous for this error case
      }

      try {
        // Ensure settings are loaded before proceeding
        await settingsManager.initialize(); // Await initialization
        console.log(
          `Background: Settings initialized. Getting settings for ${hostname}`
        );

        const siteConfig = settingsManager.getSettingsForSite(hostname);
        // Add detailed log for the retrieved siteConfig
        console.log(
          `[DEBUG] Background (GET_INITIAL_SETTINGS): Retrieved siteConfig for ${hostname}:`,
          JSON.stringify(siteConfig, null, 2)
        );
        let effectiveSettings: any;

        // Determine the correct settings based on site config and mode
        if (siteConfig?.activeSetting === "site" && siteConfig.settings) {
          effectiveSettings = siteConfig.settings;
        } else if (siteConfig?.activeSetting === "disabled") {
          // For disabled, send default settings so audio processing is bypassed/neutral
          effectiveSettings = { ...defaultSettings, speed: 100 }; // Ensure speed is neutral too
        } else {
          // Use global settings (guaranteed to be loaded or defaults now)
          effectiveSettings = settingsManager.globalSettings;
        }

        console.log(
          `Background: Sending initial settings for ${hostname} to tab ${tabId}:`,
          effectiveSettings
        );
        sendResponse({ settings: { ...effectiveSettings } });
      } catch (error) {
        console.error(
          `Background: Error processing GET_INITIAL_SETTINGS for ${hostname}:`,
          error
        );
        // Send defaults on error
        sendResponse({ settings: { ...defaultSettings, speed: 100 } });
      }
      return true; // Indicate async response is being sent
    } else if (message.type === "CONTENT_SCRIPT_READY") {
      if (tabId && url) {
        console.log(
          `Background: Content script ready in tab ${tabId} for URL: ${url} (hostname: ${hostname})`
        );
        if (hostname) {
          activeTabs.add(tabId);
        }
      }
      // No response needed for this message type
      return false; // Can be synchronous
    }

    // IMPORTANT: If setupMessageHandler handles other message types AND uses sendResponse,
    // it might need to return true as well. Assuming it doesn't for now.
    // If no handler intends to send a response for a given message, return false or undefined.
  }
);

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log("Background: Tab closed:", tabId);
  activeTabs.delete(tabId);
});

export default defineBackground(() => {
  console.log("Background: Script executing.");

  // Initialize settings manager (fire-and-forget, handles its own errors)
  // This ensures it starts loading ASAP. Listeners below might initially get defaults.
  settingsManager
    .initialize()
    .catch((err) =>
      console.error(
        "Background: Initial settingsManager.initialize() failed:",
        err
      )
    );

  // Set up listeners within the defineBackground context
  // This might help ensure they are correctly attached/reattached during reloads.
  setupMessageHandler();
  setupSettingsEventHandler(); // Ensure this runs within the defined context

  console.log("Background: Main execution finished, listeners set up.");
});
