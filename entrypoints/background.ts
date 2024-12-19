import { defineBackground } from "wxt/sandbox";
import {
    AudioSettings,
    SiteSettings,
    StateType,
    defaultSettings,
    defaultSiteSettings,
    MessageType,
    StorageData,
} from "../src/types";

export default defineBackground(() => {
    // Keep track of active tabs and settings
    const activeTabs = new Set<number>();
    const siteSettings = new Map<string, SiteSettings>();
    let globalSettings: AudioSettings = { ...defaultSettings };

    // Helper function to get hostname from URL
    const getHostname = (url: string): string => {
        try {
            return new URL(url).hostname;
        } catch (error) {
            console.error("Background: Error parsing URL:", error);
            return "";
        }
    };

    // Helper function to get settings for a site
    const getSettingsForSite = (hostname: string): AudioSettings | null => {
        const siteConfig = siteSettings.get(hostname);
        if (!siteConfig || siteConfig.lastUsedType === "disabled") {
            return null;
        }
        if (siteConfig.lastUsedType === "site" && siteConfig.settings) {
            return siteConfig.settings;
        }
        return globalSettings;
    };

    // Helper function to broadcast settings to all active tabs
    const broadcastSettings = () => {
        activeTabs.forEach(async (tabId) => {
            try {
                const tab = await chrome.tabs.get(tabId);
                if (tab.url) {
                    const hostname = getHostname(tab.url);
                    const settings = getSettingsForSite(hostname);
                    const siteConfig = siteSettings.get(hostname);

                    if (settings) {
                        await chrome.tabs.sendMessage(tabId, {
                            type: "UPDATE_SETTINGS",
                            settings,
                            isGlobal: siteConfig?.lastUsedType === "global",
                            enabled: true,
                        } as MessageType);
                    } else {
                        await chrome.tabs.sendMessage(tabId, {
                            type: "UPDATE_SETTINGS",
                            settings: defaultSettings,
                            enabled: false,
                        } as MessageType);
                    }
                }
            } catch (error) {
                console.warn("Background: Error broadcasting to tab:", error);
                activeTabs.delete(tabId);
            }
        });
    };

    // Initialize settings on startup
    const initializeSettings = async () => {
        const result = (await chrome.storage.sync.get([
            "globalSettings",
            "siteSettings",
        ])) as StorageData;

        if (result.globalSettings) {
            globalSettings = result.globalSettings;
            console.log("Background: Loaded global settings:", globalSettings);
        } else {
            await chrome.storage.sync.set({ globalSettings: defaultSettings });
            globalSettings = defaultSettings;
            console.log(
                "Background: Initialized default settings:",
                defaultSettings
            );
        }

        if (result.siteSettings) {
            Object.entries(result.siteSettings).forEach(
                ([hostname, settings]) => {
                    siteSettings.set(hostname, settings);
                }
            );
            console.log("Background: Loaded site settings:", siteSettings);
        }
    };

    // Start initialization
    initializeSettings().catch(console.error);

    // Listen for messages from popup and content scripts
    chrome.runtime.onMessage.addListener(
        async (message: MessageType, sender, sendResponse) => {
            const tabId = sender.tab?.id;
            const url = sender.tab?.url;

            // Only log meaningful messages
            if (message.type && Object.keys(message).length > 1) {
                console.log(
                    "Background: Received message:",
                    JSON.stringify({
                        type: message.type,
                        settings: message.settings,
                        isGlobal: message.isGlobal,
                        enabled: message.enabled,
                    }),
                    "from tab:",
                    tabId,
                    "sender type:",
                    sender.tab ? "content script" : "popup"
                );
            }

            if (message.type === "UPDATE_SETTINGS" && message.settings) {
                try {
                    // If message is from popup (no sender.tab), get the current active tab
                    let targetTabId = tabId;
                    let targetUrl = url;
                    
                    if (!sender.tab) {
                        console.log("Background: Message from popup, getting active tab");
                        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (!activeTab?.id || !activeTab.url) {
                            console.error("Background: No active tab found");
                            sendResponse({ success: false, error: "No active tab found" });
                            return;
                        }
                        targetTabId = activeTab.id;
                        targetUrl = activeTab.url;
                        console.log("Background: Found active tab:", targetTabId, targetUrl);
                    }

                    if (targetUrl) {
                        const hostname = getHostname(targetUrl);
                        const currentSettings = message.isGlobal
                            ? globalSettings
                            : siteSettings.get(hostname)?.settings;

                        // Check if settings have actually changed
                        const settingsChanged = !currentSettings ||
                            Object.entries(message.settings).some(
                                ([key, value]) =>
                                    currentSettings[key as keyof AudioSettings] !==
                                    value
                            );

                        if (settingsChanged) {
                            console.log(
                                `Background: Updating ${
                                    message.isGlobal ? "global" : "site"
                                } settings for`,
                                hostname
                            );

                            if (message.isGlobal) {
                                globalSettings = message.settings;
                                chrome.storage.sync.set({
                                    globalSettings: message.settings,
                                });
                            } else {
                                const siteConfig = siteSettings.get(hostname) || {
                                    ...defaultSiteSettings,
                                };
                                siteConfig.settings = message.settings;
                                siteConfig.lastUsedType = message.enabled
                                    ? "site"
                                    : "disabled";
                                siteSettings.set(hostname, siteConfig);

                                const siteSettingsObj = Object.fromEntries(
                                    siteSettings
                                );
                                chrome.storage.sync.set({
                                    siteSettings: siteSettingsObj,
                                });
                            }

                            // Send settings directly to the active tab
                            if (targetTabId) {
                                console.log("Background: Sending settings directly to tab:", targetTabId);
                                try {
                                    await chrome.tabs.sendMessage(targetTabId, {
                                        type: "UPDATE_SETTINGS",
                                        settings: message.settings,
                                        isGlobal: message.isGlobal,
                                        enabled: true,
                                    } as MessageType);
                                    console.log("Background: Settings sent successfully to tab:", targetTabId);
                                } catch (error) {
                                    console.error("Background: Failed to send settings to tab:", targetTabId, error);
                                }
                            }
                        } else {
                            console.log(
                                "Background: Settings unchanged, skipping update"
                            );
                        }
                    }
                    sendResponse({ success: true });
                } catch (error) {
                    console.error("Background: Error processing settings update:", error);
                    sendResponse({ success: false, error: String(error) });
                }
            } else if (message.type === "CONTENT_SCRIPT_READY") {
                if (tabId && url) {
                    console.log(
                        "Background: Content script ready in tab:",
                        tabId,
                        "for URL:",
                        url
                    );
                    activeTabs.add(tabId);
                    const hostname = message.hostname || getHostname(url);
                    const settings = getSettingsForSite(hostname);
                    const siteConfig = siteSettings.get(hostname);

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
                                isGlobal: siteConfig?.lastUsedType === "global",
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
});
