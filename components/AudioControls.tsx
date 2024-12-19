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
        input.style.setProperty('--range-progress', `${percentage}%`);
    };

    useEffect(() => {
        // Send settings to background script
        chrome.runtime.sendMessage({
            type: "UPDATE_SETTINGS",
            settings,
            enabled: isEnabled,
        });
    }, [settings, isEnabled]);

    useEffect(() => {
        // Initialize all range inputs
        controls.forEach(({ key }) => {
            const input = document.querySelector(
                `input[type="range"][data-key="${key}"]`
            ) as HTMLInputElement;
            if (input) {
                updateRangeProgress(input);
            }
        });
    }, [settings]);

    const controls = [
        {
            key: "volume" as keyof AudioSettings,
            label: "Volume",
            min: 0,
            max: 1000,
            defaultValue: 100,
            icon: (
                <svg
                    className="w-[18px] h-[18px] mr-2 opacity-70"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                >
                    <path d="M12 6L8 10H4V14H8L12 18V6Z" />
                    <path d="M17 7C17 7 19 9 19 12C19 15 17 17 17 17" />
                    <path d="M15.5 9C15.5 9 16.5 10 16.5 12C16.5 14 15.5 15 15.5 15" />
                </svg>
            ),
        },
        {
            key: "speed" as keyof AudioSettings,
            label: "Speed",
            min: 0,
            max: 1000,
            defaultValue: 100,
            icon: (
                <svg
                    className="w-[18px] h-[18px] mr-2 opacity-70"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8L12 12L16 14" />
                </svg>
            ),
        },
        {
            key: "bassBoost" as keyof AudioSettings,
            label: "Bass Boost",
            min: 0,
            max: 200,
            defaultValue: 100,
            icon: (
                <svg
                    className="w-[18px] h-[18px] mr-2 opacity-70"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                >
                    <path d="M12 3V21M5.5 7V17M3 10V14M18.5 7V17M21 10V14M8.5 4V20M15.5 4V20" />
                </svg>
            ),
        },
        {
            key: "voiceBoost" as keyof AudioSettings,
            label: "Voice Boost",
            min: 0,
            max: 200,
            defaultValue: 100,
            icon: (
                <svg
                    className="w-[18px] h-[18px] mr-2 opacity-70"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                >
                    <path d="M19 9V15" />
                    <path d="M15 5V19" />
                    <path d="M11 9V15" />
                    <path d="M7 6V18" />
                    <path d="M3 10V14" />
                </svg>
            ),
        },
    ];

    return (
        <div className="space-y-6 mb-2">
            {controls.map(({ key, label, min, max, icon, defaultValue }) => (
                <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            {icon}
                            <span
                                className={`text-sm font-medium ${
                                    !isEnabled ? "opacity-50" : ""
                                }`}
                            >
                                {label}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span
                                className={`text-sm font-medium ${
                                    !isEnabled ? "opacity-50" : ""
                                }`}
                            >
                                {formatDiff(settings[key] as number)}
                            </span>
                            <button
                                onClick={() => onSettingChange(key, defaultValue)}
                                disabled={!isEnabled}
                                className={`text-sm bg-primary/10 hover:bg-primary/20 text-gray-text px-2 py-0.5 rounded ${
                                    !isEnabled ? "opacity-50 cursor-not-allowed" : ""
                                }`}
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
                        data-key={key}
                        className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer ${
                            !isEnabled ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                        onChange={(e) => {
                            if (!isEnabled) return;
                            const input = e.target;
                            updateRangeProgress(input);
                            onSettingChange(key, parseInt(input.value));
                        }}
                        disabled={!isEnabled}
                        onInput={(e) => {
                            if (!isEnabled) return;
                            updateRangeProgress(e.target as HTMLInputElement);
                        }}
                    />
                </div>
            ))}
            <div
                className={`  rounded  m-[2px] mb-[2px] p-1 ${
                    settings.mono
                        ? "bg-primary text-white"
                        : "bg-primary/10 hover:bg-primary/20 text-gray-text"
                } appearance-none cursor-pointer ${
                    !isEnabled ? "opacity-50 cursor-not-allowed" : ""
                }`}
            >
                <button
                    onClick={() => onSettingChange("mono", !settings.mono)}
                    className={` flex items-center justify-center gap-2 py-2 px-4 rounded text-sm  mx-auto `}
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
        </div>
    );
};
