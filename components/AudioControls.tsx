import { AudioSettings } from "../src/types";
import { useEffect, useRef, useState } from "react"; // Added useState

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
    onSettingsToggle?: (type: "global" | "site" | "default") => void;
}
// Simple Info Tooltip Component
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    return (
        <span
            className="relative inline-flex items-center justify-center ml-1 cursor-help"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onFocus={() => setShowTooltip(true)} // For accessibility
            onBlur={() => setShowTooltip(false)}  // For accessibility
            tabIndex={0} // Make it focusable
        >
            <svg className="w-4 h-4 opacity-60" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm0 1A8 8 0 108 0a8 8 0 000 16zM8.93 6.588l.223.947c.11.469.222.929.334 1.374h.03c.112-.445.223-.905.334-1.374l.223-.947a1.02 1.02 0 00-.98-1.217 1.02 1.02 0 00-.98 1.217zM7 11.25a1 1 0 112 0 1 1 0 01-2 0z" clipRule="evenodd" />
            </svg>
            {showTooltip && (
                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max max-w-xs p-2 text-xs text-[var(--color-text)] bg-[var(--color-surface-hover)] rounded shadow-lg z-10">
                    {text}
                </span>
            )}
        </span>
    );
};


export const AudioControls: React.FC<AudioControlsProps> = ({
    settings,
    onSettingChange,
    formatDiff,
    onReset,
    isEnabled = true,
    // isCustomSettings and onSettingsToggle seem unused, removed for clarity
    // isCustomSettings = false,
    // onSettingsToggle,
}) => {
    const tooltipText = "Activates after player interaction (e.g., click play) due to browser rules.";
}) => {
    const updateRangeProgress = (input: HTMLInputElement) => {
        const value = parseInt(input.value);
        const min = parseInt(input.min);
        const max = parseInt(input.max);
        const percentage = ((value - min) * 100) / (max - min);
        // Ensure the progress stays within bounds
        const boundedPercentage = Math.max(0, Math.min(100, percentage));
        input.style.setProperty('--range-progress', `${boundedPercentage}%`);
    };

    useEffect(() => {
        const updateTimeout = setTimeout(() => {
            // Send settings to background script
            chrome.runtime.sendMessage({
                type: "UPDATE_SETTINGS",
                settings,
                enabled: isEnabled,
            });
            console.log("AudioControls: Settings update sent after debounce");
        }, 250); // Debounce settings updates

        return () => clearTimeout(updateTimeout);
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
        <div className="space-y-4 mb-2">
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
                                {/* Add tooltip conditionally */}
                                {key === 'volume' && settings.volume > 100 && <InfoTooltip text={tooltipText} />}
                                {(key === 'bassBoost' || key === 'voiceBoost') && <InfoTooltip text={tooltipText} />}
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
                                className={`text-sm bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text)] px-2 py-0.5 rounded ${
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
                            const value = parseInt(input.value);
                            if (!isNaN(value)) {
                                onSettingChange(key, value);
                            }
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
                className={`rounded mt-1 p-1 ${
                    settings.mono
                        ? "bg-[var(--color-primary)] text-[var(--color-text)]"
                        : "bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text)]"
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
                    <InfoTooltip text={tooltipText} />
                </button>
            </div>
        </div>
    );
};
