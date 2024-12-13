import { useState, useEffect } from "react";
import "./App.css";

interface AudioSettings {
    volume: number;
    bassBoost: number;
    voiceBoost: number;
    mono: boolean;
    speed: number;
}

interface ExtensionSettings {
    audioSettings: AudioSettings;
    disabledSites: string[];
}

const defaultSettings: AudioSettings = {
    volume: 100,
    bassBoost: 100,
    voiceBoost: 100,
    mono: false,
    speed: 100,
};

function App() {
    const [settings, setSettings] = useState<AudioSettings>(defaultSettings);
    const [disabledSites, setDisabledSites] = useState<string[]>([]);
    const [currentUrl, setCurrentUrl] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [showSiteEditor, setShowSiteEditor] = useState(false);
    const [newSite, setNewSite] = useState("");
    const [isEnabled, setIsEnabled] = useState(false);

    useEffect(() => {
        // Load saved settings on mount
        chrome.storage.sync.get(
            {
                settings: defaultSettings,
                disabledSites: [],
            },
            (result) => {
                setSettings(result.settings);
                setDisabledSites(result.disabledSites);
            }
        );

        // Get current tab URL
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.url) {
                try {
                    const url = new URL(tabs[0].url);
                    setCurrentUrl(url.hostname);
                } catch (e) {
                    console.error("Invalid URL:", e);
                }
            }
        });
    }, []);

    const updateSettings = async (newSettings: AudioSettings) => {
        console.log("Popup: Updating settings:", newSettings);
        setSettings(newSettings);
        setSaving(true);

        try {
            // Save to storage first
            console.log("Popup: Saving settings to storage");
            await chrome.storage.sync.set({ settings: newSettings });
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
        let newDisabledSites;
        if (isEnabled) {
            newDisabledSites = [...disabledSites, currentUrl];
        } else {
            newDisabledSites = disabledSites.filter(site => site !== currentUrl);
        }
        
        await chrome.storage.sync.set({ disabledSites: newDisabledSites });
        setDisabledSites(newDisabledSites);

        // Send message to content script to update
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: "TOGGLE_EXTENSION",
                    enabled: !isEnabled,
                });
            }
        });
    };

    const handleAddSite = async () => {
        if (!newSite) return;
        
        try {
            // Try to parse the URL to get the hostname
            const url = new URL(newSite.startsWith('http') ? newSite : `http://${newSite}`);
            const hostname = url.hostname;
            
            if (!disabledSites.includes(hostname)) {
                const newDisabledSites = [...disabledSites, hostname];
                await chrome.storage.sync.set({ disabledSites: newDisabledSites });
                setDisabledSites(newDisabledSites);
                setNewSite("");
            }
        } catch (e) {
            console.error("Invalid URL:", e);
            // You might want to show an error message to the user here
        }
    };

    const handleRemoveSite = async (site: string) => {
        const newDisabledSites = disabledSites.filter((s) => s !== site);
        await chrome.storage.sync.set({ disabledSites: newDisabledSites });
        setDisabledSites(newDisabledSites);
    };

    const handleVolumeChange = (newVolume: number) => {
        updateSettings({ ...settings, volume: newVolume });
    };

    const handleBassBoostChange = (newBassBoost: number) => {
        updateSettings({ ...settings, bassBoost: newBassBoost });
    };

    const handleVoiceBoostChange = (newVoiceBoost: number) => {
        updateSettings({ ...settings, voiceBoost: newVoiceBoost });
    };

    const handleSpeedChange = (newSpeed: number) => {
        updateSettings({ ...settings, speed: newSpeed });
    };

    const handleMonoToggle = () => {
        updateSettings({ ...settings, mono: !settings.mono });
    };

    const handleReset = () => {
        updateSettings(defaultSettings);
    };

    const handleDonate = () => {
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
                                "--percentage": `${settings.volume / 10}%`,
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
                                "--percentage": `${settings.speed / 5}%`,
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
                            isEnabled ? "enabled" : "disabled"
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
                                {isEnabled ? (
                                    <path d="M20 6L9 17l-5-5" />
                                ) : (
                                    <>
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </>
                                )}
                            </svg>
                            <div className="site-url">
                                {currentUrl &&
                                    currentUrl[0].toUpperCase() +
                                        currentUrl.slice(1)}
                            </div>
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
                </div>

                {showSiteEditor && (
                    <div className="modal-overlay">
                        <div className="modal">
                            <div className="modal-header">
                                <h2>Manage Sites</h2>
                                <button
                                    onClick={() => setShowSiteEditor(false)}
                                    className="close-button"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="modal-content">
                                <div className="add-site-form">
                                    <input
                                        type="text"
                                        placeholder="Enter website URL (e.g., example.com)"
                                        value={newSite}
                                        onChange={(e) => setNewSite(e.target.value)}
                                        className="site-input"
                                    />
                                    <button
                                        onClick={handleAddSite}
                                        className="add-button"
                                        disabled={!newSite}
                                    >
                                        Add Site
                                    </button>
                                </div>
                                
                                <div className="sites-list-container">
                                    <h3 className="sites-list-title">Disabled Sites</h3>
                                    {disabledSites.length === 0 ? (
                                        <div className="empty-message">
                                            No sites are currently disabled
                                        </div>
                                    ) : (
                                        <ul className="site-list">
                                            {disabledSites.map((site) => (
                                                <li
                                                    key={site}
                                                    className="site-item"
                                                >
                                                    <span>{site}</span>
                                                    <button
                                                        onClick={() => handleRemoveSite(site)}
                                                        className="remove-button"
                                                        title="Remove from disabled sites"
                                                    >
                                                        <svg
                                                            className="icon"
                                                            viewBox="0 0 24 24"
                                                            width="16"
                                                            height="16"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                            fill="none"
                                                        >
                                                            <line
                                                                x1="18"
                                                                y1="6"
                                                                x2="6"
                                                                y2="18"
                                                            />
                                                            <line
                                                                x1="6"
                                                                y1="6"
                                                                x2="18"
                                                                y2="18"
                                                            />
                                                        </svg>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <button onClick={handleDonate} className="donate-button">
                    <svg
                        className="icon"
                        viewBox="0 0 24 24"
                        width="24"
                        height="24"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                    >
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    <div className="support-button">Support Development</div>
                </button>
            </div>
        </div>
    );
}

export default App;
