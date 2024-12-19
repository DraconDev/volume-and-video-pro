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
        (message: MessageType, sender, sendResponse) => {
            console.log(
                "Background: Received message:",
                message,
                "from:",
                sender.tab?.id
            );

            if (message.type === "UPDATE_SETTINGS" && message.settings) {
                if (sender.tab?.url) {
                    const hostname = getHostname(sender.tab.url);
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

                        const siteSettingsObj =
                            Object.fromEntries(siteSettings);
                        chrome.storage.sync.set({
                            siteSettings: siteSettingsObj,
                        });
                    }
                    broadcastSettings();
                }
                sendResponse({ success: true });
            } else if (message.type === "CONTENT_SCRIPT_READY") {
                if (sender.tab?.id && sender.tab.url) {
                    console.log(
                        "Background: Content script ready in tab:",
                        sender.tab.id
                    );
                    activeTabs.add(sender.tab.id);
                    const hostname =
                        message.hostname || getHostname(sender.tab.url);
                    const settings = getSettingsForSite(hostname);
                    const siteConfig = siteSettings.get(hostname);

                    if (settings) {
                        chrome.tabs
                            .sendMessage(sender.tab.id, {
                                type: "UPDATE_SETTINGS",
                                settings,
                                isGlobal: siteConfig?.lastUsedType === "global",
                                enabled: true,
                            } as MessageType)
                            .catch((error) => {
                                console.warn(
                                    "Background: Failed to send settings to tab:",
                                    error
                                );
                                if (sender.tab?.id) {
                                    activeTabs.delete(sender.tab.id);
                                }
                            });
                    } else {
                        chrome.tabs
                            .sendMessage(sender.tab.id, {
                                type: "UPDATE_SETTINGS",
                                settings: defaultSettings,
                                enabled: false,
                            } as MessageType)
                            .catch((error) => {
                                console.warn(
                                    "Background: Failed to send settings to tab:",
                                    error
                                );
                                if (sender.tab?.id) {
                                    activeTabs.delete(sender.tab.id);
                                }
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
