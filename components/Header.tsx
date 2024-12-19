import React from "react";
import "../entrypoints/popup/App.css";

interface HeaderProps {
    currentUrl: string;
    isSiteEnabled: boolean;
    onToggleSite: () => void;
    onReset: () => void;
}

export const Header: React.FC<HeaderProps> = ({
    currentUrl,
    isSiteEnabled,
    onToggleSite,
    onReset,
}) => {
    return (
        <div className="header">
            <div className="site-info">
                <h2>{currentUrl ? new URL(currentUrl).hostname : "No site"}</h2>
                <div className="site-controls">
                    <button
                        className={`toggle-button ${
                            isSiteEnabled ? "enabled" : "disabled"
                        }`}
                        onClick={onToggleSite}
                    >
                        {isSiteEnabled ? "Enabled" : "Disabled"}
                    </button>
                    <button className="reset-button" onClick={onReset}>
                        Reset
                    </button>
                </div>
            </div>
        </div>
    );
};
