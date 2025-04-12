import { settingsManager } from "../src/settings-manager";
import { defaultSettings } from "../src/types";
import { defineBackground } from "wxt/sandbox";
import { setupMessageHandler } from "../src/message-handler";
import { setupSettingsEventHandler } from "../src/settings-event-handler";

// Initialize settings on extension startup or first install
chrome.runtime.onInstalled.addListener(async () => {
    console.log("Background: onInstalled event triggered. Initializing settings...");
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
    (message: any, sender: chrome.runtime.MessageSender, sendResponse) => {
        const tabId = sender.tab?.id;
        const url = sender.tab?.url;
        const hostname = message.hostname || (url ? getHostname(url) : null);

        if (message.type === "GET_INITIAL_SETTINGS") {
            if (!hostname) {
                console.warn("Background: GET_INITIAL_SETTINGS received without hostname.");
                sendResponse({ settings: { ...defaultSettings } });
                return false;
            }

            // SettingsManager might not be initialized yet on first load after install/update
            // We handle this by calling initialize() here if needed, but don't await it
            // to keep the listener synchronous for sendResponse.
            // The actual settings retrieval logic inside getSettingsForSite should handle
            // returning defaults or loaded values correctly.
            settingsManager.initialize().catch(err => console.error("Background: Error during lazy init in GET_INITIAL_SETTINGS:", err)); // Fire-and-forget init

            try {
                const siteConfig = settingsManager.getSettingsForSite(hostname);
                let effectiveSettings: any;

                if (siteConfig?.activeSetting === "site") {
                    effectiveSettings = siteConfig.settings;
                } else if (siteConfig?.activeSetting === "disabled") {
                    effectiveSettings = { ...defaultSettings };
                } else {
                    // Use global settings (which might be defaults if init hasn't finished)
                    effectiveSettings = settingsManager.globalSettings;
                }

                console.log(`Background: Sending initial settings for ${hostname} to tab ${tabId}:`, effectiveSettings);
                sendResponse({ settings: { ...effectiveSettings } });

            } catch (error) {
                console.error(`Background: Error processing GET_INITIAL_SETTINGS for ${hostname}:`, error);
                sendResponse({ settings: { ...defaultSettings } });
            }
            return false; // Synchronous response

        } else if (message.type === "CONTENT_SCRIPT_READY") {
            if (tabId && url) {
                console.log(`Background: Content script ready in tab ${tabId} for URL: ${url} (hostname: ${hostname})`);
                if (hostname) {
                     activeTabs.add(tabId);
                }
            }
             return false; // Synchronous response
        }
        // Allow other handlers (setupMessageHandler) to potentially respond
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
    settingsManager.initialize().catch(err => console.error("Background: Initial settingsManager.initialize() failed:", err));

    // Set up listeners immediately (they might get default settings initially)
    setupMessageHandler();
    setupSettingsEventHandler();

    console.log("Background: Main execution finished, listeners set up.");
    // NOTE: The onMessage and onRemoved listeners are now defined outside defineBackground
});
