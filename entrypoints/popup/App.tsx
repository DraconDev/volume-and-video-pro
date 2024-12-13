import { useState, useEffect } from "react";
import "./App.css";

interface AudioSettings {
    volume: number;
    bassBoost: number;
    voiceBoost: number;
    mono: boolean;
    speed: number;
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
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Load saved settings on mount
        console.log("Popup: Loading settings from storage");
        chrome.storage.sync.get(["audioSettings"], (result) => {
            console.log("Popup: Got settings from storage:", result);
            if (result.audioSettings) {
                console.log(
                    "Popup: Applying saved settings:",
                    result.audioSettings
                );
                setSettings(result.audioSettings);
            } else {
                console.log("Popup: No saved settings found, using defaults");
            }
        });

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes) => {
            console.log("Popup: Storage changed:", changes);
            if (changes.audioSettings) {
                const newSettings = changes.audioSettings.newValue;
                console.log(
                    "Popup: Updating settings from storage:",
                    newSettings
                );
                setSettings(newSettings);
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
            await chrome.storage.sync.set({ audioSettings: newSettings });
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
        window.open("https://www.buymeacoffee.com/volumebooster", "_blank");
    };

    const getBoostLabel = (value: number) => {
        const diff = value;
        if (diff === 0) return "0";
        return `${diff > 0 ? "" : ""}${diff}%`;
    };

    return (
        <div className="container">
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
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
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
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
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
                        Bass <span>{getBoostLabel(settings.bassBoost)}</span>
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
                        Voice <span>{getBoostLabel(settings.voiceBoost)}</span>
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
                    className={`mono-button ${settings.mono ? "active" : ""}`}
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

            <button onClick={handleReset} className="reset-all-button">
                Reset All Settings
            </button>

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
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                Support Development
            </button>
        </div>
    );
}

export default App;
