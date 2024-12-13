import { useState, useEffect } from "react";
import "./App.css";

interface AudioSettings {
    volume: number;
    bassBoost: number;
    voiceBoost: number;
}

const defaultSettings: AudioSettings = {
    volume: 100,
    bassBoost: 100,
    voiceBoost: 100,
};

function App() {
    const [settings, setSettings] = useState<AudioSettings>(defaultSettings);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Load saved settings on mount
        chrome.storage.sync.get(["audioSettings"], (result) => {
            if (result.audioSettings) {
                console.log("Loading saved settings:", result.audioSettings);
                setSettings(result.audioSettings);
            }
        });
    }, []);

    const updateSettings = async (newSettings: AudioSettings) => {
        setSettings(newSettings);
        setSaving(true);

        // Update content script
        const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });
        const activeTab = tabs[0];
        if (activeTab?.id) {
            console.log("Sending settings update:", newSettings);
            await chrome.tabs.sendMessage(activeTab.id, {
                type: "UPDATE_SETTINGS",
                settings: newSettings,
            });
        }

        // Save to storage
        await chrome.storage.sync.set({ audioSettings: newSettings });
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

    const handleReset = () => {
        updateSettings(defaultSettings);
    };

    const getBoostLabel = (value: number) => {
        const diff = value - 100;
        if (diff === 0) return "0";
        return `${diff > 0 ? "+" : ""}${diff}%`;
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
                    max="300"
                    value={settings.bassBoost}
                    onChange={(e) => handleBassBoostChange(Number(e.target.value))}
                    className="slider"
                    style={
                        {
                            "--percentage": `${settings.bassBoost / 3}%`,
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
                    max="300"
                    value={settings.voiceBoost}
                    onChange={(e) => handleVoiceBoostChange(Number(e.target.value))}
                    className="slider"
                    style={
                        {
                            "--percentage": `${settings.voiceBoost / 3}%`,
                        } as React.CSSProperties
                    }
                />
            </div>

            <button onClick={handleReset} className="reset-all-button">
                Reset All
            </button>
        </div>
    );
}

export default App;
