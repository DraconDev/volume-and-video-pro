import { settingsManager } from "../src/settings-manager";
import { defaultSettings } from "../src/types";
import { defineBackground } from "wxt/sandbox";
import { setupMessageHandler } from "../src/message-handler";
import { setupSettingsEventHandler } from "../src/settings-event-handler";

// Initialization will happen inside defineBackground now

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

// Listeners will be set up inside defineBackground after initialization

export default defineBackground(async () => {
    console.log("Background: Starting initialization...");
    try {
        await settingsManager.initialize();
        console.log("Background: SettingsManager initialized successfully.");
        console.log("Background: Initial Global Settings:", settingsManager.globalSettings); // Log initial settings

        // Setup listeners AFTER initialization is complete

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

                    // SettingsManager is already initialized here
                    try {
                        const siteConfig = settingsManager.getSettingsForSite(hostname);
                        let effectiveSettings: any;

                        if (siteConfig?.activeSetting === "site") {
                            effectiveSettings = siteConfig.settings;
                        } else if (siteConfig?.activeSetting === "disabled") {
                            effectiveSettings = { ...defaultSettings };
                        } else {
                            // Use the now-guaranteed-to-be-loaded global settings
                            effectiveSettings = settingsManager.globalSettings;
                        }

                        console.log(`Background: Sending initial settings for ${hostname} to tab ${tabId}:`, effectiveSettings);
                        // Ensure we send a copy to prevent mutation issues
                        sendResponse({ settings: { ...effectiveSettings } });

                    } catch (error) {
                        console.error(`Background: Error processing GET_INITIAL_SETTINGS for ${hostname}:`, error);
                        sendResponse({ settings: { ...defaultSettings } });
                    }
                    // No need for async IIFE or returning true here, as initialize() is already awaited.
                    // The sendResponse happens synchronously within this handler block.
                    return false; // Indicate synchronous response handled within the try/catch

                } else if (message.type === "CONTENT_SCRIPT_READY") {
                    if (tabId && url) {
                        console.log(`Background: Content script ready in tab ${tabId} for URL: ${url} (hostname: ${hostname})`);
                        if (hostname) {
                             activeTabs.add(tabId);
                        }
                    }
                     return false; // Synchronous response

                }
                // Allow other message handlers (like from setupMessageHandler) to potentially respond
                // If no handler sends a response, the channel might close.
                // Consider if setupMessageHandler needs async handling.
            }
        );

        // Clean up when tabs are closed
        chrome.tabs.onRemoved.addListener((tabId) => {
            console.log("Background: Tab closed:", tabId);
            activeTabs.delete(tabId);
        });

        // Set up other message handling (potentially async)
        setupMessageHandler(); // Assuming this might attach its own listeners

        // Set up settings event handling (potentially async)
        setupSettingsEventHandler(); // Assuming this might attach its own listeners

        console.log("Background: All listeners set up.");

    } catch (error) {
        console.error("Background: Failed to initialize SettingsManager:", error);
    }
});
