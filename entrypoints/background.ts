import { settingsManager } from "@/src/settings-manager";
import { MessageType, defaultSettings } from "@/src/types";
import { defineBackground } from "wxt/sandbox";

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

// Helper function to broadcast settings to all active tabs
async function broadcastSettings(
    settings: any,
    isGlobal: boolean,
    enabled: boolean
) {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (tab.id && tab.url) {
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    type: "UPDATE_SETTINGS",
                    settings,
                    isGlobal,
                    enabled,
                } as MessageType);
            } catch (error) {
                // Ignore errors for inactive tabs
                console.debug(
                    "Background: Could not send to tab:",
                    tab.id,
                    error
                );
            }
        }
    }
}

// Message handler
chrome.runtime.onMessage.addListener(
    (message: MessageType, sender, sendResponse) => {
        console.log(
            "Background: Received message:",
            message,
            "from tab:",
            sender.tab?.id,
            "sender type:",
            sender.documentId ? "content" : "popup"
        );

        (async () => {
            try {
                const targetTabId = sender.tab?.id;
                const targetUrl =
                    sender.tab?.url ||
                    (
                        await chrome.tabs.query({
                            active: true,
                            currentWindow: true,
                        })
                    )[0]?.url;

                if (message.type === "UPDATE_SETTINGS") {
                    if (targetUrl) {
                        const hostname = getHostname(targetUrl);

                        // Handle default state
                        if (!message.enabled) {
                            const defaultSettings =
                                await settingsManager.disableSite(hostname);
                            if (targetTabId) {
                                await chrome.tabs.sendMessage(targetTabId, {
                                    type: "UPDATE_SETTINGS",
                                    settings: defaultSettings,
                                    isGlobal: false,
                                    enabled: false,
                                } as MessageType);
                            }
                            sendResponse({ success: true });
                            return;
                        }

                        // Get current site config to check the mode
                        const currentSiteConfig =
                            await settingsManager.getSettingsForSite(hostname);

                        if (!currentSiteConfig) {
                            const defaultSettings =
                                await settingsManager.disableSite(hostname);
                            if (targetTabId) {
                                await chrome.tabs.sendMessage(targetTabId, {
                                    type: "UPDATE_SETTINGS",
                                    settings: defaultSettings,
                                    isGlobal: false,
                                    enabled: false,
                                } as MessageType);
                            }
                            sendResponse({ success: true });
                            return;
                        }

                        const isCurrentlyGlobal =
                            currentSiteConfig.activeSetting === "global";

                        if (!message.settings) {
                            console.error("Background: No settings provided");
                            sendResponse({ success: false });
                            return;
                        }

                        // Update settings based on mode
                        if (message.isGlobal || isCurrentlyGlobal) {
                            await settingsManager.updateGlobalSettings(
                                message.settings,
                                hostname
                            );
                        } else {
                            await settingsManager.updateSiteSettings(
                                hostname,
                                message.settings
                            );
                        }

                        // Forward settings to content script
                        if (targetTabId) {
                            console.log(
                                "Background: Settings forwarded to content script"
                            );
                            await chrome.tabs.sendMessage(targetTabId, message);
                        }

                        sendResponse({ success: true });
                    }
                } else if (message.type === "UPDATE_SITE_MODE") {
                    const { hostname, mode } = message;

                    // Validate inputs
                    if (!hostname) {
                        const error =
                            "No hostname provided for site mode update";
                        console.error("Background:", error);
                        sendResponse({ success: false, error });
                        return;
                    }

                    if (
                        mode !== "global" &&
                        mode !== "site" &&
                        mode !== "default"
                    ) {
                        const error = `Invalid mode provided: ${mode}`;
                        console.error("Background:", error);
                        sendResponse({ success: false, error });
                        return;
                    }

                    const { settingsToUse, siteConfig } =
                        await settingsManager.updateSiteMode(hostname, mode);

                    // Broadcast settings to the tab
                    if (targetTabId) {
                        await chrome.tabs.sendMessage(targetTabId, {
                            type: "UPDATE_SETTINGS",
                            settings: settingsToUse,
                            isGlobal: mode === "global",
                        });
                    }

                    sendResponse({ success: true });
                }
            } catch (error) {
                const errorMsg =
                    error instanceof Error ? error.message : String(error);
                console.error("Background: Error processing message:", {
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

// Keep track of active tabs and settings
const activeTabs = new Set<number>();

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener(
    async (message: MessageType, sender, sendResponse) => {
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
                        } as MessageType)
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
                        } as MessageType)
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

    // Broadcast settings to all active tabs
    broadcastSettings(defaultSettings, false, false).catch(console.error);
});
