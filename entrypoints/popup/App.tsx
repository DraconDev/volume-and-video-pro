import { useState, useEffect } from "react";

import "./App.css";

interface AudioSettings {
    volume: number;
    bassBoost: boolean;
    voiceBoost: boolean;
}

const defaultSettings: AudioSettings = {
    volume: 100,
    bassBoost: false,
    voiceBoost: false,
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

    const handleBassBoostToggle = () => {
        updateSettings({ ...settings, bassBoost: !settings.bassBoost });
    };

    const handleVoiceBoostToggle = () => {
        updateSettings({ ...settings, voiceBoost: !settings.voiceBoost });
    };

    const handleReset = () => {
        updateSettings(defaultSettings);
    };

    return (
        <div className="container">
            <div className="volume-control">
                <div className="volume-header">
                    <label htmlFor="volume-slider">
                        Volume Boost <span>{settings.volume}%</span>
                    </label>
                    <button
                        onClick={handleReset}
                        className="reset-button"
                        title="Reset to 100%"
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
                    className="volume-slider"
                    style={
                        {
                            "--volume-percentage": `${settings.volume / 10}%`,
                        } as React.CSSProperties
                    }
                />
            </div>

            <div className="boost-controls">
                <button
                    onClick={handleBassBoostToggle}
                    className={`${
                        settings.bassBoost
                            ? "boost-button active"
                            : "boost-button"
                    }`}
                    title="Enhance low frequencies"
                >
                    Bass Boost
                </button>
                <button
                    onClick={handleVoiceBoostToggle}
                    className={`${
                        settings.voiceBoost
                            ? "boost-button active"
                            : "boost-button"
                    }`}
                    title="Enhance voice frequencies"
                >
                    Voice Boost
                </button>
            </div>
        </div>
    );
}

export default App;
