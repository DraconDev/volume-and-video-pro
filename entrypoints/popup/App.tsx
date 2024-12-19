import { useState, useEffect } from "react";
import { AudioSettings } from "../../src/types";

import { SettingsToggle } from "../../components/SettingsToggle";
import { AudioControls } from "../../components/AudioControls";

function App() {
    const [settings, setSettings] = useState<AudioSettings>({
        volume: 100,
        speed: 100,
        bassBoost: 100,
        voiceBoost: 100,
        mono: false,
    });

    const [isUsingGlobalSettings, setIsUsingGlobalSettings] = useState(true);
    const [isSiteEnabled, setIsSiteEnabled] = useState(true);

    // Load initial settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // Get the current tab to get its hostname
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab?.url) return;

                const hostname = new URL(tab.url).hostname;
                console.log("Popup: Loading settings for hostname:", hostname);

                // Get settings from storage
                const storage = await chrome.storage.sync.get(["globalSettings", "siteSettings"]);
                const siteConfig = storage.siteSettings?.[hostname];

                console.log("Popup: Storage data:", {
                    globalSettings: storage.globalSettings,
                    siteConfig
                });

                // Set initial mode
                if (siteConfig) {
                    setIsUsingGlobalSettings(siteConfig.lastUsedType === "global");
                    setIsSiteEnabled(siteConfig.lastUsedType !== "disabled");
                    if (siteConfig.lastUsedType === "site" && siteConfig.settings) {
                        setSettings(siteConfig.settings);
                    } else if (storage.globalSettings) {
                        setSettings(storage.globalSettings);
                    }
                } else if (storage.globalSettings) {
                    setSettings(storage.globalSettings);
                    setIsUsingGlobalSettings(true);
                    setIsSiteEnabled(true);
                }
            } catch (error) {
                console.error("Popup: Error loading settings:", error);
            }
        };

        loadSettings();
    }, []);

    const handleSettingChange = (
        key: keyof AudioSettings,
        value: number | boolean
    ) => {
        setSettings((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    const formatDiff = (value: number) => {
        return `${value}%`;
    };

    const handleReset = () => {
        setSettings({
            volume: 100,
            speed: 100,
            bassBoost: 100,
            voiceBoost: 100,
            mono: false,
        });
    };

    const handleToggleMode = async (mode: "global" | "site" | "disabled") => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url) return;

            const hostname = new URL(tab.url).hostname;
            const storage = await chrome.storage.sync.get(["globalSettings", "siteSettings"]);

            if (mode === "global") {
                setIsUsingGlobalSettings(true);
                setIsSiteEnabled(true);
                if (storage.globalSettings) {
                    setSettings(storage.globalSettings);
                }
            } else if (mode === "site") {
                setIsUsingGlobalSettings(false);
                setIsSiteEnabled(true);
                const siteSettings = storage.siteSettings?.[hostname]?.settings;
                if (siteSettings) {
                    setSettings(siteSettings);
                }
            } else {
                setIsUsingGlobalSettings(false);
                setIsSiteEnabled(false);
            }
        } catch (error) {
            console.error("Popup: Error toggling mode:", error);
        }
    };

    return (
        <div className="w-[280px] p-4 font-sans">
            <AudioControls
                settings={settings}
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
