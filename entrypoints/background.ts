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
        if (!siteConfig || siteConfig.activeSetting === "disabled") {
            return null;
        }
        if (siteConfig.activeSetting === "site" && siteConfig.settings) {
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
                            isGlobal: siteConfig?.activeSetting === "global",
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
                        console.log(
                            "Background: Message from popup, getting active tab"
                        );
                        const [activeTab] = await chrome.tabs.query({
                            active: true,
                            currentWindow: true,
                        });
                        if (!activeTab?.id || !activeTab.url) {
                            console.error("Background: No active tab found");
                            sendResponse({
                                success: false,
                                error: "No active tab found",
                            });
                            return;
                        }
                        targetTabId = activeTab.id;
                        targetUrl = activeTab.url;
                        console.log(
                            "Background: Found active tab:",
                            targetTabId,
                            targetUrl
                        );
                    }

                    if (targetUrl) {
                        const hostname = getHostname(targetUrl);

                        // If disabled, use default settings for playback but don't modify stored settings
                        if (!message.enabled) {
                            console.log(
                                "Background: Site disabled, using default settings for playback"
                            );
                            const siteConfig = siteSettings.get(hostname) || {
                                ...defaultSiteSettings,
                            };

                            // Only update the activeSetting, preserve the settings
                            siteConfig.activeSetting = "disabled";
                            siteSettings.set(hostname, siteConfig);

                            const siteSettingsObj =
                                Object.fromEntries(siteSettings);
                            await chrome.storage.sync.set({
                                siteSettings: siteSettingsObj,
                            });

                            // Send default settings to content script for playback
                            if (targetTabId) {
                                console.log(
                                    "Background: Sending default settings to disabled tab:",
                                    targetTabId
                                );
                                try {
                                    await chrome.tabs.sendMessage(targetTabId, {
                                        type: "UPDATE_SETTINGS",
                                        settings: defaultSettings,
                                        isGlobal: false,
                                        enabled: false,
                                    } as MessageType);
                                    console.log(
                                        "Background: Default settings sent successfully to tab:",
                                        targetTabId
                                    );
                                } catch (error) {
                                    console.error(
                                        "Background: Failed to send default settings to tab:",
                                        targetTabId,
                                        error
                                    );
                                }
                            }
                            sendResponse({ success: true });
                            return;
                        }

                        // Handle settings update based on mode
                        if (message.isGlobal) {
                            console.log("Background: Updating global settings", {
                                oldSettings: { ...globalSettings },
                                newSettings: { ...message.settings }
                            });
                            
                            // Update global settings
                            globalSettings = { ...message.settings };
                            await chrome.storage.sync.set({ globalSettings });

                            // Update site config to reflect we're using global settings
                            const siteConfig = siteSettings.get(hostname) || {
                                enabled: true,
                                activeSetting: "global",
                                settings: undefined
                            };
                            siteConfig.activeSetting = "global";
                            siteConfig.enabled = true;
                            siteSettings.set(hostname, siteConfig);
                            
                            const siteSettingsObj = Object.fromEntries(siteSettings);
                            await chrome.storage.sync.set({ siteSettings: siteSettingsObj });
                            
                            console.log("Background: Updated to global mode for", hostname, {
                                siteConfig,
                                globalSettings
                            });
                        } else {
                            // Update site-specific settings
                            console.log("Background: Updating site-specific settings for", hostname);
                            
                            const siteConfig = siteSettings.get(hostname) || {
                                enabled: true,
                                activeSetting: "site",
                                settings: undefined
                            };
                            
                            // Deep clone the settings
                            siteConfig.settings = {
                                volume: message.settings.volume,
                                bassBoost: message.settings.bassBoost,
                                voiceBoost: message.settings.voiceBoost,
                                mono: message.settings.mono,
                                speed: message.settings.speed
                            };
                            siteConfig.activeSetting = "site";
                            siteConfig.enabled = true;
                            siteSettings.set(hostname, siteConfig);

                            const siteSettingsObj = Object.fromEntries(siteSettings);
                            await chrome.storage.sync.set({ siteSettings: siteSettingsObj });
                            
                            console.log("Background: Updated site settings for", hostname, {
                                oldConfig: siteSettings.get(hostname),
                                newConfig: siteConfig
                            });
                        }

                        // Forward settings to content script
                        if (targetTabId) {
                            try {
                                await chrome.tabs.sendMessage(targetTabId, {
                                    type: "UPDATE_SETTINGS",
                                    settings: message.settings,
                                    isGlobal: message.isGlobal,
                                    enabled: true,
                                } as MessageType);
                                console.log(
                                    "Background: Settings forwarded to content script"
                                );
                            } catch (error) {
                                console.error(
                                    "Background: Failed to forward settings to content script:",
                                    error
                                );
                            }
                        }

                        sendResponse({ success: true });
                    }
                } catch (error) {
                    console.error(
                        "Background: Error processing settings update:",
                        error
                    );
                    sendResponse({ success: false, error: String(error) });
                }
            } else if (message.type === "UPDATE_SITE_MODE") {
                const { hostname, mode } = message;
                
                // Validate inputs
                if (!hostname) {
                    const error = "No hostname provided for site mode update";
                    console.error("Background:", error);
                    sendResponse({ success: false, error });
                    return;
                }
                
                if (mode !== "global" && mode !== "site" && mode !== "disabled") {
                    const error = `Invalid mode provided: ${mode}`;
                    console.error("Background:", error);
                    sendResponse({ success: false, error });
                    return;
                }

                try {
                    console.log("Background: Starting site mode update", {
                        hostname,
                        mode,
                        existingGlobalSettings: { ...globalSettings },
                        existingSiteConfig: siteSettings.get(hostname) ? {
                            activeSetting: siteSettings.get(hostname)?.activeSetting,
                            enabled: siteSettings.get(hostname)?.enabled,
                            hasSettings: !!siteSettings.get(hostname)?.settings,
                            settings: siteSettings.get(hostname)?.settings ? 
                                { ...siteSettings.get(hostname)!.settings! } : 
                                undefined
                        } : "none"
                    });

                    // Get existing site config or create new one
                    let siteConfig = siteSettings.get(hostname);
                    
                    // If no site config exists, create a new one
                    if (!siteConfig) {
                        console.log("Background: Creating new site config");
                        siteConfig = {
                            enabled: true,
                            activeSetting: mode,
                            settings: undefined
                        };
                    }

                    const oldMode = siteConfig.activeSetting;
                    console.log("Background: Mode transition", {
                        oldMode,
                        newMode: mode,
                        hasExistingSettings: !!siteConfig.settings
                    });

                    if (mode === "site") {
                        // When switching to site mode:
                        // 1. If site settings exist, keep them
                        // 2. If no site settings, initialize with current global settings
                        if (!siteConfig.settings) {
                            console.log("Background: No existing site settings, initializing with global:", { ...globalSettings });
                            try {
                                siteConfig.settings = {
                                    volume: globalSettings.volume,
                                    bassBoost: globalSettings.bassBoost,
                                    voiceBoost: globalSettings.voiceBoost,
                                    mono: globalSettings.mono,
                                    speed: globalSettings.speed
                                };
                            } catch (error) {
                                console.error("Background: Error copying global settings:", error);
                                throw new Error("Failed to initialize site settings");
                            }
                        } else {
                            console.log("Background: Keeping existing site settings:", { ...siteConfig.settings });
                        }
                    } else if (mode === "global") {
                        // When switching to global mode:
                        // 1. Keep site settings in storage for future use
                        // 2. But use global settings for actual playback
                        console.log("Background: Switching to global mode", {
                            preservedSiteSettings: siteConfig.settings ? { ...siteConfig.settings } : "none",
                            globalSettings: { ...globalSettings }
                        });
                    }

                    // Update the mode and enabled state
                    siteConfig.activeSetting = mode;
                    siteConfig.enabled = mode !== "disabled";
                    
                    // Store updated config
                    siteSettings.set(hostname, siteConfig);
                    console.log("Background: Updated site config:", {
                        oldMode,
                        newMode: mode,
                        enabled: siteConfig.enabled,
                        settings: siteConfig.settings ? { ...siteConfig.settings } : undefined
                    });

                    // Save to storage
                    const siteSettingsObj = Object.fromEntries(siteSettings);
                    await chrome.storage.sync.set({ siteSettings: siteSettingsObj });

                    // Determine which settings to use for playback
                    let settingsToUse: AudioSettings;
                    if (mode === "global") {
                        console.log("Background: Using global settings for playback:", { ...globalSettings });
                        settingsToUse = {
                            volume: globalSettings.volume,
                            bassBoost: globalSettings.bassBoost,
                            voiceBoost: globalSettings.voiceBoost,
                            mono: globalSettings.mono,
                            speed: globalSettings.speed
                        };
                    } else if (mode === "site" && siteConfig.settings) {
                        console.log("Background: Using site settings for playback:", { ...siteConfig.settings });
                        settingsToUse = {
                            volume: siteConfig.settings.volume,
                            bassBoost: siteConfig.settings.bassBoost,
                            voiceBoost: siteConfig.settings.voiceBoost,
                            mono: siteConfig.settings.mono,
                            speed: siteConfig.settings.speed
                        };
                    } else {
                        console.log("Background: Using default settings for playback");
                        settingsToUse = { ...defaultSettings };
                    }

                    // Verify settings integrity
                    const settingsValid = [
                        typeof settingsToUse.volume === 'number',
                        typeof settingsToUse.bassBoost === 'number',
                        typeof settingsToUse.voiceBoost === 'number',
                        typeof settingsToUse.speed === 'number',
                        typeof settingsToUse.mono === 'boolean'
                    ].every(Boolean);

                    if (!settingsValid) {
                        throw new Error(`Invalid settings detected: ${JSON.stringify(settingsToUse)}`);
                    }

                    console.log("Background: Final settings to broadcast:", {
                        mode,
                        settings: { ...settingsToUse },
                        isGlobal: mode === "global"
                    });

                    // Broadcast settings to the tab
                    if (tabId) {
                        await chrome.tabs.sendMessage(tabId, {
                            type: "UPDATE_SETTINGS",
                            settings: settingsToUse,
                            isGlobal: mode === "global"
                        });
                        console.log("Background: Settings broadcast to tab:", tabId);
                    } else {
                        console.log("Background: No tab ID available for broadcast");
                    }

                    sendResponse({ success: true });
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    console.error("Background: Error updating site mode:", {
                        error: errorMsg,
                        hostname,
                        mode,
                        stack: error instanceof Error ? error.stack : undefined
                    });
                    sendResponse({ success: false, error: errorMsg });
                }
                return;
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
                                isGlobal: siteConfig?.activeSetting === "global",
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
