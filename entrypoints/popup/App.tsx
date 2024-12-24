import { useState, useEffect } from "react";
import { AudioSettings } from "../../src/types";

import { SettingsToggle } from "../../components/SettingsToggle";
import { AudioControls } from "../../components/AudioControls";
import { settingsManager } from "../../src/settings-manager";

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
                if (!tab?.url) {
                    console.error("Popup: No active tab found");
                    return;
                }

                const hostname = new URL(tab.url).hostname;
                console.log("Popup: Loading settings for hostname:", hostname);

                // Initialize settings manager
                await settingsManager.initialize();

                // Get settings from settings manager
                const siteConfig = settingsManager.getSettingsForSite(hostname);

                // Set initial mode and settings
                if (siteConfig) {
                    const isDefault = siteConfig.activeSetting === "default";
                    const isGlobal = siteConfig.activeSetting === "global";
                    setIsUsingGlobalSettings(isGlobal);
                    setIsSiteEnabled(!isDefault);

                    if (isDefault) {
                        // Show default settings but keep actual settings in state
                        setSettings(siteConfig.settings || defaultSettings);
                    } else if (isGlobal) {
                        // Use global settings
                        setSettings(
                            settingsManager.globalSettings || defaultSettings
                        );
                    } else {
                        // Use site-specific settings
                        setSettings(siteConfig.settings || defaultSettings);
                    }
                } else {
                    // No site config exists, use global settings
                    setSettings(
                        settingsManager.globalSettings || defaultSettings
                    );
                    setIsUsingGlobalSettings(true);
                    setIsSiteEnabled(true);
                }
            } catch (error) {
                console.error("Popup: Error loading settings:", error, {
                    currentSettings: settings,
                    isUsingGlobalSettings,
                    isSiteEnabled,
                });
            }
        };

        loadSettings();
    }, []);

    // Debounce settings updates
    useEffect(() => {
        let settingsUpdateTimeout: number | null = null;
        const debouncedUpdateSettings = (
            updatedSettings: AudioSettings,
            updatedHostname: string | undefined
        ) => {
            if (settingsUpdateTimeout) {
                clearTimeout(settingsUpdateTimeout);
            }
            settingsUpdateTimeout = window.setTimeout(() => {
                console.log(
                    "Popup: Settings updated",
                    updatedSettings,
                    updatedHostname
                );

                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                        if (!tabs[0]?.url) {
                            console.error("Popup: No active tab found");
                            return;
                        }

                        const currentHostname = new URL(tabs[0].url).hostname;
                        if (
                            updatedHostname === undefined ||
                            updatedHostname === currentHostname
                        ) {
                            setSettings(updatedSettings);
                            if (updatedHostname) {
                                // Site-specific settings updated, adjust mode accordingly
                                setIsUsingGlobalSettings(false);
                                setIsSiteEnabled(true);
                            } else {
                                // Global settings updated
                                setIsUsingGlobalSettings(true);
                                setIsSiteEnabled(true);
                            }
                        }
                    }
                );
            }, 250);
        };

        const handleSettingsUpdated = (
            updatedSettings: AudioSettings,
            updatedHostname: string | undefined
        ) => {
            debouncedUpdateSettings(updatedSettings, updatedHostname);
        };

        settingsManager.on("settingsUpdated", handleSettingsUpdated);

        return () => {
            settingsManager.off("settingsUpdated", handleSettingsUpdated);
        };
    }, []);

    const handleSettingChange = async (
        key: keyof AudioSettings,
        value: number | boolean
    ) => {
        if (!isSiteEnabled) return; // Prevent changes when in default mode

        const newSettings = {
            ...settings,
            [key]: value,
        };

        setSettings(newSettings);

        // Update settings through settings manager
        if (isUsingGlobalSettings) {
            await settingsManager.updateGlobalSettings(newSettings);
        } else {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            if (tab?.url) {
                const hostname = new URL(tab.url).hostname;
                await settingsManager.updateSiteSettings(hostname, newSettings);
            }
        }
    };

    const formatDiff = (value: number) => {
        return `${value}%`;
    };

    const handleReset = () => {
        if (!isSiteEnabled) return; // Prevent reset when in default mode
        setSettings(defaultSettings);
    };

    const handleToggleMode = async (mode: "global" | "site" | "default") => {
        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            if (!tab?.url || !tab.id) {
                console.error("Popup: No active tab found");
                return;
            }

            const hostname = new URL(tab.url).hostname;

            if (mode === "default") {
                setIsUsingGlobalSettings(false);
                setIsSiteEnabled(false);
                await settingsManager.disableSite(hostname);
            } else if (mode === "global") {
                setIsUsingGlobalSettings(true);
                setIsSiteEnabled(true);
                await settingsManager.updateGlobalSettings(settings, hostname);
            } else {
                // site mode
                setIsUsingGlobalSettings(false);
                setIsSiteEnabled(true);
                await settingsManager.updateSiteSettings(hostname, settings);
            }
        } catch (error) {
            console.error("Popup: Error toggling mode:", error, {
                mode,
                currentSettings: settings,
                isUsingGlobalSettings,
                isSiteEnabled,
            });
        }
    };

    // Display settings should show default values when in default mode
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
                onClick={() => window.open("https://ko-fi.com/adamdracon")}
                className="w-full bg-primary text-white rounded py-2.5 text-sm font-medium border-none cursor-pointer hover:bg-[#1557b0] transition-colors duration-200"
            >
                Donate
            </button>
        </div>
    );
}

export default App;
