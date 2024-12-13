import { useState, useEffect } from "react";

import "./App.css";

function App() {
    const [volume, setVolume] = useState(100);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Load saved volume on mount
        chrome.storage.sync.get("volumeBoost").then((result) => {
            if (result.volumeBoost) {
                console.log("Loading saved volume:", result.volumeBoost);
                setVolume(result.volumeBoost);
            }
        });
    }, []);

    const handleVolumeChange = (newVolume: number) => {
        console.log("Volume change requested:", newVolume);
        setVolume(newVolume);
        setSaving(true);

        // Update volume in content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab?.id) {
                console.log("Sending volume update:", newVolume);
                chrome.tabs.sendMessage(activeTab.id, {
                    type: "UPDATE_VOLUME",
                    volume: newVolume,
                });
            }
        });

        // Save to storage
        chrome.storage.sync.set({ volumeBoost: newVolume }).then(() => {
            setTimeout(() => setSaving(false), 500);
            setSaving(false);
        });
    };

    const handleReset = () => {
        handleVolumeChange(100);
    };

    return (
        <div className="container">
            <div className="volume-control">
                <div className="volume-header">
                    <label htmlFor="volume-slider">
                        Volume Boost <span>{volume}%</span>
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
                    value={volume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="volume-slider"
                    style={
                        {
                            "--volume-percentage": `${volume / 10}%`,
                        } as React.CSSProperties
                    }
                />
            </div>
        </div>
    );
}

export default App;
