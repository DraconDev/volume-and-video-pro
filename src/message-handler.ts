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
    const targetTabId = sender.tab?.id;
    const targetUrl = sender.tab?.url;

    if (targetUrl) {
        const hostname = getHostname(targetUrl);

        // Handle default state
        if (!message.enabled) {
            const defaultSettings = await settingsManager.disableSite(
                hostname,
                targetTabId
            );
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
        const currentSiteConfig = await settingsManager.getSettingsForSite(
            hostname
        );

        if (!currentSiteConfig) {
            const defaultSettings = await settingsManager.disableSite(
                hostname,
                targetTabId
            );
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

        const isCurrentlyGlobal = currentSiteConfig.activeSetting === "global";

        if (!message.settings) {
            console.error("Message Handler: No settings provided");
            sendResponse({ success: false });
            return;
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

        // Forward settings to content script
        if (targetTabId) {
            console.log(
                "Message Handler: Settings forwarded to content script"
            );
            await chrome.tabs.sendMessage(targetTabId, message);
        }

        sendResponse({ success: true });
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

    if (mode !== "global" && mode !== "site" && mode !== "default") {
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
    message: any, //MessageType, // TODO: Type this correctly
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
) {
    const tabId = sender.tab?.id;
    const url = sender.tab?.url;

    if (tabId && url) {
        console.log(
            "Message Handler: Content script ready in tab:",
            tabId,
            "for URL:",
            url
        );
        const hostname = message.hostname || getHostname(url);
        const settings = (await settingsManager.getSettingsForSite(hostname))
            ?.settings;

        if (settings) {
            console.log(
                "Message Handler: Sending initial settings to tab",
                tabId,
                ":",
                settings
            );
            chrome.tabs
                .sendMessage(tabId, {
                    type: "UPDATE_SETTINGS",
                    settings,
                    isGlobal:
                        (await settingsManager.getSettingsForSite(hostname))
                            ?.activeSetting === "global",
                    enabled: true,
                } as MessageType)
                .catch((error) => {
                    console.warn(
                        "Message Handler: Failed to send settings to tab:",
                        tabId,
                        error
                    );
                });
        } else {
            console.log(
                "Message Handler: Sending default settings to tab",
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
                        "Message Handler: Failed to send settings to tab:",
                        tabId,
                        error
                    );
                });
        }
        sendResponse({ success: true });
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
                "sender type:",
                sender.documentId ? "content" : "popup"
            );

            (async () => {
                try {
                    if (message.type === "UPDATE_SETTINGS") {
                        await handleUpdateSettings(
                            message,
                            sender,
                            sendResponse
                        );
                    } else if (message.type === "UPDATE_SITE_MODE") {
                        await handleUpdateSiteMode(
                            message,
                            sender,
                            sendResponse
                        );
                    } else if (message.type === "CONTENT_SCRIPT_READY") {
                        await handleContentScriptReady(
                            message,
                            sender,
                            sendResponse
                        );
                    }
                } catch (error) {
                    const errorMsg =
                        error instanceof Error ? error.message : String(error);
                    console.error(
                        "Message Handler: Error processing message:",
                        {
                            error: errorMsg,
                            message,
                            stack:
                                error instanceof Error
                                    ? error.stack
                                    : undefined,
                        }
                    );
                    sendResponse({ success: false, error: errorMsg });
                }
            })();

            return true; // Keep the message channel open for async response
        }
    );
}
