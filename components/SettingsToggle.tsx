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
    <div className="flex rounded  py-0.5 mb-2 gap-2">
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
