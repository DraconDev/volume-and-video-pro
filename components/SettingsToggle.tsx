import React from "react";

interface SettingsToggleProps {
    isUsingGlobalSettings: boolean;
    isSiteEnabled: boolean;
    onToggle: (mode: "global" | "site" | "default") => void;
}

export const SettingsToggle: React.FC<SettingsToggleProps> = ({
    isUsingGlobalSettings,
    isSiteEnabled,
    onToggle,
}) => {
    return (
        <div className="flex bg-[var(--color-surface)] rounded p-0.5 mb-2 gap-1">
            <button
                className={`settings-button ${
                    isUsingGlobalSettings ? "active" : ""
                } bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]`}
                onClick={() => onToggle("global")}
            >
                Global
            </button>
            <button
                className={`settings-button ${
                    !isUsingGlobalSettings && isSiteEnabled ? "active" : ""
                } bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]`}
                onClick={() => onToggle("site")}
            >
                Site
            </button>
            <button
                className={`settings-button ${
                    !isSiteEnabled ? "active" : ""
                } bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]`}
                onClick={() => onToggle("default")}
            >
                Default
            </button>
        </div>
    );
};
