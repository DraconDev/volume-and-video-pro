import React from "react";
import "../entrypoints/popup/App.css";

interface SettingsToggleProps {
    isUsingGlobalSettings: boolean;
    isSiteEnabled: boolean;
    onToggle: (type: "global" | "site" | "disabled") => void;
}

export const SettingsToggle: React.FC<SettingsToggleProps> = ({
    isUsingGlobalSettings,
    isSiteEnabled,
    onToggle,
}) => {
    return (
        <div className="settings-toggle">
            <button
                className={`toggle-button ${
                    isUsingGlobalSettings ? "active" : ""
                }`}
                onClick={() => onToggle("global")}
            >
                Global
            </button>
            <button
                className={`toggle-button ${
                    !isUsingGlobalSettings && isSiteEnabled ? "active" : ""
                }`}
                onClick={() => onToggle("site")}
            >
                Site
            </button>
            <button
                className={`toggle-button ${!isSiteEnabled ? "active" : ""}`}
                onClick={() => onToggle("disabled")}
            >
                Disabled
            </button>
        </div>
    );
};
