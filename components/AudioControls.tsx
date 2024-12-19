import { AudioSettings } from "../src/types";
import { useEffect, useRef } from "react";

interface AudioControlsProps {
    settings: AudioSettings;
    onSettingChange: (
        key: keyof AudioSettings,
        value: number | boolean
    ) => void;
    formatDiff: (value: number) => string;
    onReset: () => void;
    isEnabled?: boolean;
    isCustomSettings?: boolean;
    onSettingsToggle?: (type: "global" | "site" | "disabled") => void;
}

export const AudioControls: React.FC<AudioControlsProps> = ({
    settings,
    onSettingChange,
    formatDiff,
    onReset,
    isEnabled = true,
    isCustomSettings = false,
    onSettingsToggle,
}) => {
    const updateRangeProgress = (input: HTMLInputElement) => {
        const value = parseInt(input.value);
        const min = parseInt(input.min);
        const max = parseInt(input.max);
        const percentage = ((value - min) * 100) / (max - min);
        input.style.backgroundSize = `${percentage}% 100%`;
    };

    useEffect(() => {
        // Send settings to background script
        chrome.runtime.sendMessage({
            type: "UPDATE_SETTINGS",
            settings,
            enabled: isEnabled,
        });
    }, [settings, isEnabled]);

    const controls = [
        {
            key: "volume" as keyof AudioSettings,
            label: "Volume",
            min: 0,
            max: 1000,
            icon: (
                <svg
                    className="w-[18px] h-[18px] mr-2 opacity-70"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                >
                    <path d="M12 5v14M8 9v6M4 11v2M16 9v6M20 11v2" />
                </svg>
            ),
        },
        {
            key: "speed" as keyof AudioSettings,
            label: "Speed",
            min: 0,
            max: 1000,
            icon: (
                <svg
                    className="w-[18px] h-[18px] mr-2 opacity-70"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4l3 3" />
                </svg>
            ),
        },
        {
            key: "bassBoost" as keyof AudioSettings,
            label: "Bass Boost",
            min: 0,
            max: 200,
            icon: (
                <svg
                    className="w-[18px] h-[18px] mr-2 opacity-70"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                >
                    <path d="M12 3v18M8 7v10M4 10v4M16 7v10M20 10v4" />
                </svg>
            ),
        },
        {
            key: "voiceBoost" as keyof AudioSettings,
            label: "Voice Boost",
            min: 0,
            max: 200,
            icon: (
                <svg
                    className="w-[18px] h-[18px] mr-2 opacity-70"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
            ),
        },
    ];

    return (
        <>
            {controls.map(({ key, label, min, max, icon }) => (
                <div key={key} className="mb-4 relative">
                    <div className="flex items-center justify-between text-[13px] mb-1 text-gray-dark font-normal">
                        <div className="flex items-center">
                            {icon}
                            {label}
                        </div>
                        <div className="flex items-center">
                            <span className="text-gray-text mr-4">
                                {formatDiff(settings[key] as number)}
                            </span>
                            <button
                                className="border-none text-primary text-[11px] cursor-pointer hover:underline bg-primary/15 px-1 rounded-sm"
                                onClick={() => onSettingChange(key, 100)}
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                    <input
                        type="range"
                        min={min}
                        max={max}
                        value={settings[key] as number}
                        onChange={(e) => {
                            onSettingChange(key, parseInt(e.target.value));
                            updateRangeProgress(e.target);
                        }}
                        onInput={(e) =>
                            updateRangeProgress(e.target as HTMLInputElement)
                        }
                        ref={(el) => {
                            if (el) {
                                updateRangeProgress(el);
                            }
                        }}
                        className={!isEnabled ? "disabled" : ""}
                        disabled={!isEnabled}
                    />
                </div>
            ))}

            <div
                className={`  rounded  m-[2px] mb-[6px] p-1 ${
                    settings.mono
                        ? "bg-primary text-white"
                        : "bg-primary/10 hover:bg-primary/20 text-gray-text"
                }`}
            >
                <button
                    onClick={() => onSettingChange("mono", !settings.mono)}
                    className={` flex items-center justify-center gap-2 py-2 px-4 rounded text-sm  mx-auto`}
                    disabled={!isEnabled}
                >
                    <svg
                        className="w-[18px] h-[18px] opacity-70"
                        viewBox="0 0 24 24"
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
        </>
    );
};
