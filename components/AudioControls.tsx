import { AudioSettings } from "../src/types";
import "../entrypoints/popup/App.css";

interface AudioControlsProps {
    settings: AudioSettings;
    onSettingChange: (
        key: keyof AudioSettings,
        value: number | boolean
    ) => void;
    formatDiff: (value: number) => string;
}

export const AudioControls: React.FC<AudioControlsProps> = ({
    settings,
    onSettingChange,
    formatDiff,
}) => {
    return (
        <div className="controls-section">
            <div className="control-group">
                <label>Volume Boost</label>
                <input
                    type="range"
                    min="0"
                    max="600"
                    value={settings.volume}
                    onChange={(e) =>
                        onSettingChange("volume", parseInt(e.target.value))
                    }
                />
                <span className="value">{formatDiff(settings.volume)}</span>
            </div>

            <div className="control-group">
                <label>Bass Boost</label>
                <input
                    type="range"
                    min="0"
                    max="200"
                    value={settings.bassBoost}
                    onChange={(e) =>
                        onSettingChange("bassBoost", parseInt(e.target.value))
                    }
                />
                <span className="value">{formatDiff(settings.bassBoost)}</span>
            </div>

            <div className="control-group">
                <label>Voice Boost</label>
                <input
                    type="range"
                    min="0"
                    max="200"
                    value={settings.voiceBoost}
                    onChange={(e) =>
                        onSettingChange("voiceBoost", parseInt(e.target.value))
                    }
                />
                <span className="value">{formatDiff(settings.voiceBoost)}</span>
            </div>

            <div className="control-group">
                <label>Speed</label>
                <input
                    type="range"
                    min="25"
                    max="200"
                    value={settings.speed}
                    onChange={(e) =>
                        onSettingChange("speed", parseInt(e.target.value))
                    }
                />
                <span className="value">{formatDiff(settings.speed)}</span>
            </div>

            <div className="control-group checkbox">
                <label>
                    <input
                        type="checkbox"
                        checked={settings.mono}
                        onChange={(e) =>
                            onSettingChange("mono", e.target.checked)
                        }
                    />
                    Mono Audio
                </label>
            </div>
        </div>
    );
};
