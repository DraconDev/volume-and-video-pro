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

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener(
    async (
        message: any,
        sender: chrome.runtime.MessageSender,
        sendResponse
    ) => {
        const tabId = sender.tab?.id;
        const url = sender.tab?.url;

        if (message.type === "CONTENT_SCRIPT_READY") {
            if (tabId && url) {
                console.log(
                    "Background: Content script ready in tab:",
                    tabId,
                    "for URL:",
                    url
                );
                activeTabs.add(tabId);
                const hostname = message.hostname || getHostname(url);
                const settings = (
                    await settingsManager.getSettingsForSite(hostname)
                )?.settings;

                if (settings) {
                    console.log(
                        "Background: Sending initial settings to tab",
                        tabId,
                        ":",
                        settings
                    );
                    chrome.tabs
                        .sendMessage(tabId, {
                            type: "UPDATE_SETTINGS",
                            settings,
                            isGlobal:
                                (
                                    await settingsManager.getSettingsForSite(
                                        hostname
                                    )
                                )?.activeSetting === "global",
                            enabled: true,
                        })
                        .catch((error) => {
                            console.warn(
                                "Background: Failed to send settings to tab:",
                                tabId,
                                error
                            );
                            activeTabs.delete(tabId);
                        });
                } else {
                    console.log(
                        "Background: Sending default settings to tab",
                        tabId
                    );
                    chrome.tabs
                        .sendMessage(tabId, {
                            type: "UPDATE_SETTINGS",
                            settings: defaultSettings,
                            enabled: false,
                        })
                        .catch((error) => {
                            console.warn(
                                "Background: Failed to send settings to tab:",
                                tabId,
                                error
                            );
                            activeTabs.delete(tabId);
                        });
                }
                sendResponse({ success: true });
            }
        }

        return true;
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
