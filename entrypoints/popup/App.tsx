import { useState, useEffect, useCallback } from "react";
import "./App.css";

interface AudioSettings {
    volume: number;
    bassBoost: number;
    voiceBoost: number;
    mono: boolean;
    speed: number;
}

interface SiteConfig {
    enabled: boolean;
    settings?: AudioSettings;
}

interface SiteSettingsMap {
    [hostname: string]: SiteConfig;
}

const defaultSettings: AudioSettings = {
    volume: 100,
    bassBoost: 100,
    voiceBoost: 100,
    mono: false,
    speed: 100,
};

function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: number | undefined;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = window.setTimeout(() => func(...args), wait);
    };
}

function App() {
    const [settings, setSettings] = useState<AudioSettings>(defaultSettings);
    const [siteConfigs, setSiteConfigs] = useState<SiteSettingsMap>({});
    const [currentUrl, setCurrentUrl] = useState<string>("");
    const [disabledSites, setDisabledSites] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [showSiteEditor, setShowSiteEditor] = useState(false);
    const [newSite, setNewSite] = useState("");
    const [isEnabled, setIsEnabled] = useState(false);
    const [isCustomSettings, setIsCustomSettings] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const handleSettingsToggle = (type: "default" | "custom") => {
        setIsCustomSettings(type === "custom");
        if (
            type === "custom" &&
            currentUrl &&
            siteConfigs[currentUrl]?.settings
        ) {
            setSettings(siteConfigs[currentUrl].settings!);
        } else {
            chrome.storage.sync.get({ defaultSettings }, (result) => {
                setSettings(result.defaultSettings);
            });
        }
    };

    const debouncedSaveSettings = useCallback(
        debounce(async (newSettings: AudioSettings) => {
            console.log("Saving settings to storage:", newSettings);
            if (isCustomSettings && currentUrl) {
                const newSiteConfigs = { ...siteConfigs };
                newSiteConfigs[currentUrl] = {
                    ...newSiteConfigs[currentUrl],
                    settings: newSettings,
                };
                await chrome.storage.sync.set({ siteConfigs: newSiteConfigs });
            } else {
                await chrome.storage.sync.set({ defaultSettings: newSettings });
            }
        }, 200),
        [isCustomSettings, currentUrl, siteConfigs]
    );

    useEffect(() => {
        console.log("Initial load - fetching from storage");
        // Load saved settings on mount
        chrome.storage.sync.get(
            {
                defaultSettings,
                siteConfigs: {},
                disabledSites: [],
            },
            (result) => {
                console.log("Initial load - received data:", {
                    defaultSettings: result.defaultSettings,
                    siteConfigs: result.siteConfigs,
                    currentUrl,
                });

                setSettings(result.defaultSettings);
                setSiteConfigs(result.siteConfigs);
                setDisabledSites(result.disabledSites);

                // Set initial custom/default mode based on current URL
                if (currentUrl && result.siteConfigs[currentUrl]?.settings) {
                    console.log(
                        "Initial load - found custom settings for URL:",
                        currentUrl
                    );
                    setIsCustomSettings(true);
                    setSettings(result.siteConfigs[currentUrl].settings!);
                } else {
                    console.log("Initial load - using default settings");
                }
            }
        );

        // Get current tab URL
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.url) {
                try {
                    const url = new URL(tabs[0].url);
                    console.log("Setting current URL to:", url.hostname);
                    setCurrentUrl(url.hostname);
                } catch (e) {
                    console.error("Invalid URL:", e);
                }
            }
        });
    }, []);

    useEffect(() => {
        const loadAppropriateSettings = async () => {
            if (isCustomSettings && currentUrl) {
                if (siteConfigs[currentUrl]?.settings) {
                    console.log("Loading custom settings for URL:", currentUrl);
                    setSettings(siteConfigs[currentUrl].settings!);
                }
            } else {
                console.log("Loading default settings");
                const { defaultSettings: savedDefaults } =
                    await chrome.storage.sync.get({
                        defaultSettings: defaultSettings,
                    });
                console.log("Loaded default settings:", savedDefaults);
                setSettings(savedDefaults);
            }
        };

        loadAppropriateSettings();
    }, [isCustomSettings, currentUrl, siteConfigs]);

    const getCurrentSettings = (): AudioSettings => {
        if (currentUrl && siteConfigs[currentUrl]?.settings) {
            return { ...siteConfigs[currentUrl].settings! };
        }
        return { ...settings };
    };

    const isSiteEnabled = currentUrl
        ? siteConfigs[currentUrl]?.enabled !== false
        : true;

    const handleSettingChange = async (
        key: keyof AudioSettings,
        value: number | boolean,
        isDragging = false
    ) => {
        console.log("handleSettingChange called:", { key, value, isDragging });

        // Create new settings object
        const newSettings = {
            ...settings,
            [key]: value,
        };

        // Always update local state immediately
        setSettings(newSettings);

        // Always update content script immediately
        chrome.tabs.query(
            { active: true, currentWindow: true },
            async (tabs) => {
                if (tabs[0]?.id) {
                    console.log(
                        "Updating content script with settings:",
                        newSettings
                    );
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: "UPDATE_SETTINGS",
                        settings: newSettings,
                    });
                }
            }
        );

        // If dragging, use debounced save, otherwise save immediately
        if (isDragging) {
            debouncedSaveSettings(newSettings);
        } else {
            if (isCustomSettings && currentUrl) {
                const newSiteConfigs = { ...siteConfigs };
                newSiteConfigs[currentUrl] = {
                    ...newSiteConfigs[currentUrl],
                    settings: newSettings,
                };
                setSiteConfigs(newSiteConfigs);
                await chrome.storage.sync.set({ siteConfigs: newSiteConfigs });
            } else {
                await chrome.storage.sync.set({ defaultSettings: newSettings });
            }
        }
    };

    const handleVolumeChange = (newVolume: number) => {
        console.log("Volume changed to:", newVolume);
        handleSettingChange("volume", newVolume, true);
    };

    const handleSpeedChange = (newSpeed: number) => {
        console.log("Speed changed to:", newSpeed);
        handleSettingChange("speed", newSpeed, true);
    };

    const handleBassBoostChange = (newBassBoost: number) => {
        console.log("Bass boost changed to:", newBassBoost);
        handleSettingChange("bassBoost", newBassBoost, true);
    };

    const handleVoiceBoostChange = (newVoiceBoost: number) => {
        console.log("Voice boost changed to:", newVoiceBoost);
        handleSettingChange("voiceBoost", newVoiceBoost, true);
    };

    const handleMonoToggle = () => {
        console.log("Mono toggle clicked");
        handleSettingChange("mono", !settings.mono, false);
    };

    const updateSettings = async (newSettings: AudioSettings) => {
        console.log("Popup: Updating settings:", newSettings);
        setSettings(newSettings);
        setSaving(true);

        try {
            // Save to storage first
            console.log("Popup: Saving settings to storage");
            await chrome.storage.sync.set({ defaultSettings: newSettings });
            console.log("Popup: Settings saved to storage");

            // Then update content script
            const tabs = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            const activeTab = tabs[0];
            if (activeTab?.id) {
                console.log(
                    "Popup: Sending settings to content script:",
                    newSettings
                );
                await chrome.tabs.sendMessage(activeTab.id, {
                    type: "UPDATE_SETTINGS",
                    settings: newSettings,
                });
                console.log("Popup: Settings sent to content script");
            }
        } catch (error) {
            console.error("Popup: Error updating settings:", error);
        }

        setTimeout(() => setSaving(false), 500);
    };

    const toggleSite = async () => {
        console.log("Toggling site:", currentUrl);
        const newSiteConfigs = { ...siteConfigs };
        newSiteConfigs[currentUrl] = {
            ...newSiteConfigs[currentUrl],
            enabled: !isSiteEnabled,
        };

        await chrome.storage.sync.set({
            defaultSettings: settings,
            siteConfigs: newSiteConfigs,
        });
        setSiteConfigs(newSiteConfigs);

        // Send message to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                console.log("Sending toggle message to content script");
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: "TOGGLE_EXTENSION",
                    enabled: !isSiteEnabled,
                });
            }
        });
    };

    const resetSiteSettings = async (site: string) => {
        console.log("Resetting site settings:", site);
        const newSiteConfigs = { ...siteConfigs };
        delete newSiteConfigs[site];

        await chrome.storage.sync.set({
            defaultSettings: settings,
            siteConfigs: newSiteConfigs,
        });
        setSiteConfigs(newSiteConfigs);
    };

    const handleAddSite = async () => {
        console.log("Adding new site:", newSite);
        if (!newSite) return;

        try {
            // Try to parse the URL to get the hostname
            const url = new URL(
                newSite.startsWith("http") ? newSite : `http://${newSite}`
            );
            const hostname = url.hostname;

            if (!disabledSites.includes(hostname)) {
                const newDisabledSites = [...disabledSites, hostname];
                await chrome.storage.sync.set({
                    disabledSites: newDisabledSites,
                });
                setDisabledSites(newDisabledSites);
                setNewSite("");
            }
        } catch (e) {
            console.error("Invalid URL:", e);
            // You might want to show an error message to the user here
        }
    };

    const handleRemoveSite = async (site: string) => {
        console.log("Removing site:", site);
        const newDisabledSites = disabledSites.filter((s) => s !== site);
        await chrome.storage.sync.set({ disabledSites: newDisabledSites });
        setDisabledSites(newDisabledSites);
    };

    const handleReset = () => {
        console.log("Resetting all settings");
        updateSettings(defaultSettings);
    };

    const handleDonate = () => {
        console.log("Donate button clicked");
        window.open("https://ko-fi.com/adamdracon", "_blank");
    };

    const getBoostLabel = (value: number) => {
        const diff = value;
        if (diff === 0) return "0";
        return `${diff > 0 ? "" : ""}${diff}%`;
    };

    useEffect(() => {
        setIsEnabled(!disabledSites.includes(currentUrl));
    }, [disabledSites, currentUrl]);

    return (
        <div className="container">
            <div className="controls-section main-controls">
                <div className="controls-section">
                    <div className="control-header">
                        <label htmlFor="volume-slider">
                            <svg
                                className="icon"
                                viewBox="0 0 24 24"
                                width="24"
                                height="24"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                            >
                                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                                <path d="M15.54 8.46a5 5.5 5 0 0 1 0 7.07" />
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                            </svg>
                            Volume <span>{settings.volume}%</span>
                        </label>
                        <button
                            onClick={() => handleVolumeChange(100)}
                            className="reset-button"
                            title="Reset volume to 100%"
                        >
                            Reset
                        </button>
                    </div>
                    <input
                        type="range"
                        id="volume-slider"
                        min="0"
                        max="1000"
                        step="1"
                        value={settings.volume}
                        onChange={(e) =>
                            handleVolumeChange(Number(e.target.value))
                        }
                        className="slider"
                        style={
                            {
                                "--percentage": `${
                                    (settings.volume / 1000) * 100
                                }%`,
                            } as React.CSSProperties
                        }
                    />
                </div>

                <div className="controls-section">
                    <div className="control-header">
                        <label htmlFor="speed-slider">
                            <svg
                                className="icon"
                                viewBox="0 0 24 24"
                                width="24"
                                height="24"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                            >
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                            </svg>
                            Speed <span>{settings.speed}%</span>
                        </label>
                        <button
                            onClick={() => handleSpeedChange(100)}
                            className="reset-button"
                            title="Reset speed to 100%"
                        >
                            Reset
                        </button>
                    </div>
                    <input
                        type="range"
                        id="speed-slider"
                        min="25"
                        max="500"
                        step="5"
                        value={settings.speed}
                        onChange={(e) =>
                            handleSpeedChange(Number(e.target.value))
                        }
                        className="slider"
                        style={
                            {
                                "--percentage": `${
                                    ((settings.speed - 25) / 475) * 100
                                }%`,
                            } as React.CSSProperties
                        }
                    />
                </div>

                <div className="controls-section">
                    <div className="control-header">
                        <label htmlFor="bass-slider">
                            <svg
                                className="icon"
                                viewBox="0 0 24 24"
                                width="24"
                                height="24"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                            >
                                <path d="M12 3v18M8 7v10M4 10v4M16 7v10M20 10v4" />
                            </svg>
                            Bass{" "}
                            <span>{getBoostLabel(settings.bassBoost)}</span>
                        </label>
                        <button
                            onClick={() => handleBassBoostChange(100)}
                            className="reset-button"
                            title="Reset bass boost to 0%"
                        >
                            Reset
                        </button>
                    </div>
                    <input
                        type="range"
                        id="bass-slider"
                        min="0"
                        max="200"
                        value={settings.bassBoost}
                        onChange={(e) =>
                            handleBassBoostChange(Number(e.target.value))
                        }
                        className="slider"
                        style={
                            {
                                "--percentage": `${settings.bassBoost / 2}%`,
                            } as React.CSSProperties
                        }
                    />
                </div>

                <div className="controls-section">
                    <div className="control-header">
                        <label htmlFor="voice-slider">
                            <svg
                                className="icon"
                                viewBox="0 0 24 24"
                                width="24"
                                height="24"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                            >
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                <line x1="12" y1="19" x2="12" y2="23" />
                                <line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                            Voice{" "}
                            <span>{getBoostLabel(settings.voiceBoost)}</span>
                        </label>
                        <button
                            onClick={() => handleVoiceBoostChange(100)}
                            className="reset-button"
                            title="Reset voice boost to 0%"
                        >
                            Reset
                        </button>
                    </div>
                    <input
                        type="range"
                        id="voice-slider"
                        min="0"
                        max="200"
                        value={settings.voiceBoost}
                        onChange={(e) =>
                            handleVoiceBoostChange(Number(e.target.value))
                        }
                        className="slider"
                        style={
                            {
                                "--percentage": `${settings.voiceBoost / 2}%`,
                            } as React.CSSProperties
                        }
                    />
                </div>

                <div className="controls-section">
                    <button
                        onClick={handleMonoToggle}
                        className={`mono-button ${
                            settings.mono ? "active" : ""
                        }`}
                        title="Toggle mono audio"
                    >
                        <svg
                            className="icon"
                            viewBox="0 0 24 24"
                            width="24"
                            height="24"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                        >
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="4" />
                        </svg>
                        Mono {settings.mono ? "On" : "Off"}
                    </button>
                </div>
                {/* 
                <button
                    onClick={handleReset}
                    className="reset-all-button controls-section"
                >
                    Reset All Settings
                </button>

                <div className="site-controls">
                    <button
                        onClick={toggleSite}
                        className={`toggle-button ${
                            isSiteEnabled ? "enabled" : "disabled"
                        }`}
                    >
                        <div className="toggle-button-content">
                            <svg
                                className="status-icon"
                                viewBox="0 0 24 24"
                                width="20"
                                height="20"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                            >
                                {isSiteEnabled ? (
                                    <path d="M20 6L9 17l-5-5" />
                                ) : (
                                    <>
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </>
                                )}
                            </svg>
                            <div className="site-url">{currentUrl}</div>
                        </div>
                    </button>

                    <button
                        onClick={() => setShowSiteEditor(true)}
                        className="edit-button bg-[#f0f0f0] text-black"
                    >
                        <svg
                            className="icon"
                            viewBox="0 0 24 24"
                            width="24"
                            height="24"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                        >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                    </button>
                </div> */}

                {currentUrl && (
                    <div className="">
                        <div className="">
                            <div className="settings-type-toggle">
                                <button
                                    className={`settings-toggle-btn ${
                                        !isCustomSettings ? "active" : ""
                                    }`}
                                    onClick={() =>
                                        handleSettingsToggle("default")
                                    }
                                >
                                    Default settings
                                </button>
                                <button
                                    className={`settings-toggle-btn ${
                                        isCustomSettings ? "active" : ""
                                    }`}
                                    onClick={() =>
                                        handleSettingsToggle("custom")
                                    }
                                >
                                    Custom settings
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showSiteEditor && (
                    <div className="modal-overlay">
                        <div className="modal">
                            <div className="modal-header">
                                <h2>Site Settings</h2>
                                <button
                                    onClick={() => setShowSiteEditor(false)}
                                    className="close-button"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="modal-content">
                                <div className="sites-list-container">
                                    <h3 className="sites-list-title">
                                        Site-Specific Settings
                                    </h3>
                                    {Object.entries(siteConfigs).length ===
                                    0 ? (
                                        <div className="empty-message">
                                            No custom site settings
                                        </div>
                                    ) : (
                                        <ul className="site-list">
                                            {Object.entries(siteConfigs).map(
                                                ([site, config]) => (
                                                    <li
                                                        key={site}
                                                        className="site-item"
                                                    >
                                                        <div className="site-item-content">
                                                            <span className="site-name">
                                                                {site}
                                                            </span>
                                                            <div className="site-item-settings">
                                                                {!config.enabled && (
                                                                    <span className="site-disabled">
                                                                        Disabled
                                                                    </span>
                                                                )}
                                                                {config.settings && (
                                                                    <span className="custom-settings">
                                                                        Custom
                                                                        Settings
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="site-item-actions">
                                                            <button
                                                                onClick={() =>
                                                                    resetSiteSettings(
                                                                        site
                                                                    )
                                                                }
                                                                className="reset-button"
                                                                title="Reset to default settings"
                                                            >
                                                                Reset
                                                            </button>
                                                        </div>
                                                    </li>
                                                )
                                            )}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <div className="donate-button">
                <a
                    href="https://ko-fi.com/adamdracon"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Support ❤️
                </a>
            </div>
        </div>
    );
}

export default App;
