import React from "react";

interface SettingsToggleProps {
    isUsingGlobalSettings: boolean;
    isSiteEnabled: boolean;
    onToggle: (mode: "global" | "site" | "disabled") => void;
}

export const SettingsToggle: React.FC<SettingsToggleProps> = ({
    isUsingGlobalSettings,
    isSiteEnabled,
    onToggle,
}) => {
    return (
        <div className="flex bg-gray-bg rounded p-0.5 mb-4 gap-1">
            <button
                className={`settings-button ${
                    isUsingGlobalSettings ? "active" : ""
                } bg-primary/10 hover:bg-primary/20`}
                onClick={() => onToggle("global")}
            >
                Global
            </button>
            <button
                className={`settings-button ${
                    !isUsingGlobalSettings && isSiteEnabled ? "active" : ""
                } bg-primary/10 hover:bg-primary/20`}
                onClick={() => onToggle("site")}
            >
                Site
            </button>
            <button
                className={`settings-button ${
                    !isSiteEnabled ? "active" : ""
                }  bg-primary/10 hover:bg-primary/20`}
                onClick={() => onToggle("disabled")}
            >
                Disable
            </button>
        </div>
    );
};
