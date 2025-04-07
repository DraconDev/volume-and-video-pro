import { settingsManager } from "../src/settings-manager";
import { defaultSettings } from "../src/types";
import { defineBackground } from "wxt/sandbox";
import { setupMessageHandler } from "../src/message-handler";
import { setupSettingsEventHandler } from "../src/settings-event-handler";

// Initialize settings on extension startup
chrome.runtime.onInstalled.addListener(async () => {
    await settingsManager.initialize();
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
                sendResponse({ settings: { ...defaultSettings } }); // Send defaults if no hostname
                return false; // Indicate synchronous response
            }

            // Use a promise to handle async operation within the listener
            (async () => {
                try {
                    // Rely on initialization done at background script startup

                    const siteConfig = settingsManager.getSettingsForSite(hostname);
                    let effectiveSettings: any; // Use 'any' temporarily if type is complex

                    if (siteConfig?.activeSetting === "site") {
                        effectiveSettings = siteConfig.settings;
                    } else if (siteConfig?.activeSetting === "disabled") {
                        // Send defaults but maybe indicate disabled status?
                        // For now, send defaults as SettingsHandler might determine need based on values
                        effectiveSettings = { ...defaultSettings };
                    } else {
                        // Includes 'global' mode or no siteConfig exists
                        effectiveSettings = settingsManager.globalSettings;
                    }

                    console.log(`Background: Sending initial settings for ${hostname} to tab ${tabId}:`, effectiveSettings);
                    sendResponse({ settings: { ...effectiveSettings } }); // Send a copy

                } catch (error) {
                    console.error(`Background: Error getting initial settings for ${hostname}:`, error);
                    sendResponse({ settings: { ...defaultSettings } }); // Send defaults on error
                }
            })();

            return true; // Indicate asynchronous response

        } else if (message.type === "CONTENT_SCRIPT_READY") {
            // Content script is ready, log it. No need to send settings back anymore.
            if (tabId && url) {
                console.log(`Background: Content script ready in tab ${tabId} for URL: ${url} (hostname: ${hostname})`);
                if (hostname) {
                     activeTabs.add(tabId); // Track active tabs if needed
                }
            }
             // Optionally send a simple ack if needed by content script, otherwise nothing.
             // sendResponse({ success: true });
             return false; // No async response needed here

        }
        // Handle other message types if necessary (e.g., from popup)
        // Make sure other handlers also return true if they are async

        // Default: return false if message wasn't handled or response is synchronous
        // return false; // Be careful with the default return value
    }
);

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
    console.log("Background: Tab closed:", tabId);
    activeTabs.delete(tabId);
});

export default defineBackground(() => {
    // Initialize settings on startup
    settingsManager.initialize().catch(console.error);

    // Set up message handling
    setupMessageHandler();

    // Set up settings event handling
    setupSettingsEventHandler();
});
