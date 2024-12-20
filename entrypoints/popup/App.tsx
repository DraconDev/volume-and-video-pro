import { useState, useEffect } from "react";
import { AudioSettings } from "../../src/types";

import { SettingsToggle } from "../../components/SettingsToggle";
import { AudioControls } from "../../components/AudioControls";

function App() {
    const defaultSettings: AudioSettings = {
        volume: 100,
        speed: 100,
        bassBoost: 100,
        voiceBoost: 100,
        mono: false,
    };

    const [settings, setSettings] = useState<AudioSettings>(defaultSettings);
    const [isUsingGlobalSettings, setIsUsingGlobalSettings] = useState(true);
    const [isSiteEnabled, setIsSiteEnabled] = useState(true);

    // Load initial settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // Get the current tab to get its hostname
                const [tab] = await chrome.tabs.query({
                    active: true,
                    currentWindow: true,
                });
                if (!tab?.url) return;

                const hostname = new URL(tab.url).hostname;
                console.log("Popup: Loading settings for hostname:", hostname);

                // Get settings from storage
                const storage = await chrome.storage.sync.get([
                    "globalSettings",
                    "siteSettings",
                ]);
                const siteConfig = storage.siteSettings?.[hostname];

                // Set initial mode and settings
                if (siteConfig) {
                    const isDisabled = siteConfig.lastUsedType === "disabled";
                    const isGlobal = siteConfig.lastUsedType === "global";
                    setIsUsingGlobalSettings(isGlobal);
                    setIsSiteEnabled(!isDisabled);

                    if (isDisabled) {
                        // Show default settings but keep actual settings in state
                        setSettings(
                            siteConfig.settings ||
                                storage.globalSettings ||
                                defaultSettings
                        );
                    } else if (isGlobal) {
                        // Use global settings
                        setSettings(storage.globalSettings || defaultSettings);
                    } else {
                        // Use site-specific settings
                        setSettings(
                            siteConfig.settings ||
                                storage.globalSettings ||
                                defaultSettings
                        );
                    }
                } else {
                    // No site config exists, use global settings
                    setSettings(storage.globalSettings || defaultSettings);
                    setIsUsingGlobalSettings(true);
                    setIsSiteEnabled(true);
                }

                // Send initial settings to content script
                if (tab.id) {
                    const settingsToApply =
                        siteConfig?.lastUsedType === "disabled"
                            ? defaultSettings
                            : siteConfig?.lastUsedType === "global"
                            ? storage.globalSettings || defaultSettings
                            : siteConfig?.settings ||
                              storage.globalSettings ||
                              defaultSettings;

                    await chrome.tabs.sendMessage(tab.id, {
                        type: "UPDATE_SETTINGS",
                        settings: settingsToApply,
                        isGlobal: siteConfig?.lastUsedType === "global",
                        enabled: siteConfig?.lastUsedType !== "disabled",
                    });
                }
            } catch (error) {
                console.error("Popup: Error loading settings:", error);
            }
        };

        loadSettings();
    }, []);

    const handleSettingChange = async (
        key: keyof AudioSettings,
        value: number | boolean
    ) => {
        if (!isSiteEnabled) return; // Prevent changes when disabled

        const newSettings = {
            ...settings,
            [key]: value,
        };
        setSettings(newSettings);

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url || !tab.id) return;

            // Send settings update
            await chrome.runtime.sendMessage({
                type: "UPDATE_SETTINGS",
                settings: newSettings,
                isGlobal: isUsingGlobalSettings,
                enabled: true
            });

            // Also send directly to content script for immediate effect
            await chrome.tabs.sendMessage(tab.id, {
                type: "UPDATE_SETTINGS",
                settings: newSettings,
                isGlobal: isUsingGlobalSettings,
                enabled: true
            });

        } catch (error) {
            console.error("Popup: Error updating settings:", error);
        }
    };

    const formatDiff = (value: number) => {
        return `${value}%`;
    };

    const handleReset = () => {
        if (!isSiteEnabled) return; // Prevent reset when disabled
        setSettings(defaultSettings);
    };

    /**
     * Handles switching between different modes (global, site-specific, or disabled)
     * and applies the appropriate settings for each mode.
     * 
     * @param mode - The mode to switch to ("global" | "site" | "disabled")
     * 
     * Global mode: Uses shared global settings across all sites, preserves site settings
     * Site mode: Uses site-specific settings, starts with defaults if none exist
     * Disabled mode: Uses default settings (100%) for playback
     */
    const handleToggleMode = async (mode: "global" | "site" | "disabled") => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url || !tab.id) {
                console.error("Popup: No active tab found");
                return;
            }

            const hostname = new URL(tab.url).hostname;
            const storage = await chrome.storage.sync.get(["globalSettings", "siteSettings"]);
            const siteConfig = storage.siteSettings?.[hostname];

            let settingsToApply: AudioSettings;
            
            if (mode === "disabled") {
                settingsToApply = defaultSettings;
                setIsUsingGlobalSettings(false);
                setIsSiteEnabled(false);
            } else if (mode === "global") {
                // Load global settings without modifying site settings
                settingsToApply = storage.globalSettings || defaultSettings;
                setIsUsingGlobalSettings(true);
                setIsSiteEnabled(true);

                // Only update the mode
                await chrome.runtime.sendMessage({
                    type: "UPDATE_SITE_MODE",
                    hostname,
                    mode: "global"
                });

                // Update UI with global settings
                setSettings(settingsToApply);

                // Update content script with global settings
                if (tab.id) {
                    await chrome.tabs.sendMessage(tab.id, {
                        type: "UPDATE_SETTINGS",
                        settings: settingsToApply,
                        isGlobal: true,
                        enabled: true
                    });
                }

                return;
            } else { // site mode
                if (siteConfig?.settings) {
                    // Use existing site settings
                    console.log("Popup: Loading existing site settings:", siteConfig.settings);
                    settingsToApply = siteConfig.settings;
                } else {
                    // Create new site settings with defaults
                    console.log("Popup: Creating new site settings with defaults");
                    settingsToApply = { ...defaultSettings };
                }

                setIsUsingGlobalSettings(false);
                setIsSiteEnabled(true);

                // Update mode and apply site settings
                await chrome.runtime.sendMessage({
                    type: "UPDATE_SITE_MODE",
                    hostname,
                    mode: "site"
                });

                // Only send settings update if we're creating new site settings
                if (!siteConfig?.settings) {
                    await chrome.runtime.sendMessage({
                        type: "UPDATE_SETTINGS",
                        settings: settingsToApply,
                        isGlobal: false,
                        enabled: true
                    });
                }
            }

            // Update UI
            setSettings(settingsToApply);

            // Update content script
            if (tab.id) {
                await chrome.tabs.sendMessage(tab.id, {
                    type: "UPDATE_SETTINGS",
                    settings: settingsToApply,
                    isGlobal: mode === "global",
                    enabled: mode !== "disabled"
                });
            }
        } catch (error) {
            console.error("Popup: Error toggling mode:", error, {
                mode,
                currentSettings: settings,
                isUsingGlobalSettings,
                isSiteEnabled
            });
        }
    };

    // Display settings should show default values when disabled
    const displaySettings = isSiteEnabled ? settings : defaultSettings;

    return (
        <div className="w-[280px] p-4 font-sans">
            <AudioControls
                settings={displaySettings}
                onSettingChange={handleSettingChange}
                formatDiff={formatDiff}
                onReset={handleReset}
                isEnabled={isSiteEnabled}
            />

            <SettingsToggle
                isUsingGlobalSettings={isUsingGlobalSettings}
                isSiteEnabled={isSiteEnabled}
                onToggle={handleToggleMode}
            />

            <button
                onClick={() => {}}
                className="w-full bg-primary text-white rounded py-2.5 text-sm font-medium border-none cursor-pointer hover:bg-[#1557b0] transition-colors duration-200"
            >
                Donate
            </button>
        </div>
    );
}

export default App;
