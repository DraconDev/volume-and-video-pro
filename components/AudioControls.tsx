import { AudioSettings } from "../src/types";
import { useEffect, useRef, useState } from "react";

interface AudioControlsProps {
    settings: AudioSettings;
    onSettingChange: (
        key: keyof AudioSettings,
        value: number | boolean
    ) => void;
    formatDiff: (value: number) => string;
    onReset: () => void;
    isEnabled?: boolean;
    // Removed unused props:
    // isCustomSettings?: boolean;
    // onSettingsToggle?: (type: "global" | "site" | "default") => void;
}

// Simple Info Tooltip Component (Defined outside AudioControls for clarity)
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
            {/* Info Icon SVG */}
            {/* Better Question Mark Icon SVG */}
            <svg className="w-4 h-4 opacity-70" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"></path>
            </svg>
            {/* Tooltip Text Box */}
            {showTooltip && (
                {/* Improved Tooltip Box Styling */}
                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max max-w-[200px] px-3 py-2 text-xs font-medium text-[var(--color-text-tooltip)] bg-[var(--color-bg-tooltip)] rounded-md shadow-lg z-10 whitespace-normal text-center">
                    {text}
                    {/* Optional: Add a small triangle pointer */}
                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-[var(--color-bg-tooltip)]"></span>
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
}) => {

    // --- Start: Moved inside component ---
    const tooltipText = "Activates after player interaction (e.g., click play) due to browser rules.";

    const updateRangeProgress = (input: HTMLInputElement) => {
        const value = parseInt(input.value);
        const min = parseInt(input.min);
        const max = parseInt(input.max);
        const percentage = ((value - min) * 100) / (max - min);
        const boundedPercentage = Math.max(0, Math.min(100, percentage));
        input.style.setProperty('--range-progress', `${boundedPercentage}%`);
    };

    // Effect for sending settings updates (debounced)
    // Note: This useEffect seems redundant if App.tsx already handles debounced updates via settingsManager.
    // Consider removing if App.tsx's debouncing is sufficient.
    useEffect(() => {
        const updateTimeout = setTimeout(() => {
            // Send settings to background script - Is this needed here AND in App.tsx?
            // chrome.runtime.sendMessage({
            //     type: "UPDATE_SETTINGS", // This message type might not be handled by background
            //     settings,
            //     enabled: isEnabled,
            // });
            // console.log("AudioControls: Settings update sent after debounce (Potentially redundant)");
        }, 250); // Debounce settings updates

        return () => clearTimeout(updateTimeout);
    }, [settings, isEnabled]); // Dependencies: settings, isEnabled

    // Effect for initializing range input styles
    useEffect(() => {
        controls.forEach(({ key }) => {
            const input = document.querySelector(
                `input[type="range"][data-key="${key}"]`
            ) as HTMLInputElement;
            if (input) {
                updateRangeProgress(input);
            }
        });
        // Run only when settings initially load or change significantly enough to warrant style update
    }, [settings]); // Dependency: settings

    // --- End: Moved inside component ---


    const controls = [
        {
            key: "volume" as keyof AudioSettings,
            label: "Volume",
            min: 0,
            max: 1000,
            defaultValue: 100,
            icon: ( /* SVG Icon */
                <svg className="w-[18px] h-[18px] mr-2 opacity-70" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                    <path d="M12 6L8 10H4V14H8L12 18V6Z" /> <path d="M17 7C17 7 19 9 19 12C19 15 17 17 17 17" /> <path d="M15.5 9C15.5 9 16.5 10 16.5 12C16.5 14 15.5 15 15.5 15" />
                </svg>
            ),
        },
        {
            key: "speed" as keyof AudioSettings,
            label: "Speed",
            min: 0,
            max: 1000,
            defaultValue: 100,
            icon: ( /* SVG Icon */
                <svg className="w-[18px] h-[18px] mr-2 opacity-70" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                     <circle cx="12" cy="12" r="10" /> <path d="M12 8L12 12L16 14" />
                </svg>
            ),
        },
        {
            key: "bassBoost" as keyof AudioSettings,
            label: "Bass Boost",
            min: 0,
            max: 200,
            defaultValue: 100,
            icon: ( /* SVG Icon */
                <svg className="w-[18px] h-[18px] mr-2 opacity-70" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
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
            icon: ( /* SVG Icon */
                <svg className="w-[18px] h-[18px] mr-2 opacity-70" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                    <path d="M19 9V15" /> <path d="M15 5V19" /> <path d="M11 9V15" /> <path d="M7 6V18" /> <path d="M3 10V14" />
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
                            <span className={`text-sm font-medium ${!isEnabled ? "opacity-50" : ""}`}>
                                {label}
                                {/* Add tooltip conditionally */}
                                {key === 'volume' && settings.volume > 100 && <InfoTooltip text={tooltipText} />}
                                {(key === 'bassBoost' || key === 'voiceBoost') && <InfoTooltip text={tooltipText} />}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${!isEnabled ? "opacity-50" : ""}`}>
                                {formatDiff(settings[key] as number)}
                            </span>
                            <button
                                onClick={() => onSettingChange(key, defaultValue)}
                                disabled={!isEnabled}
                                className={`text-sm bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text)] px-2 py-0.5 rounded ${!isEnabled ? "opacity-50 cursor-not-allowed" : ""}`}
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
                        className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer ${!isEnabled ? "opacity-50 cursor-not-allowed" : ""}`}
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
            {/* Mono Button Section */}
            <div
                className={`rounded mt-1 p-1 ${settings.mono ? "bg-[var(--color-primary)] text-[var(--color-text)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text)]"} appearance-none cursor-pointer ${!isEnabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
                <button
                    onClick={() => onSettingChange("mono", !settings.mono)}
                    className={` flex items-center justify-center gap-2 py-2 px-4 rounded text-sm mx-auto `}
                    disabled={!isEnabled}
                >
                     {/* Mono Icon SVG */}
                    <svg className="w-[18px] h-[18px] opacity-70" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                        <circle cx="12" cy="12" r="10" /> <circle cx="12" cy="12" r="4" />
                    </svg>
                    Mono {settings.mono ? "On" : "Off"}
                    <InfoTooltip text={tooltipText} />
                </button>
            </div>
        </div>
    );
}; // End of AudioControls component
