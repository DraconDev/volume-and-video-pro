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
  const handleModeChange = (mode: "global" | "site" | "disabled") => {
    onToggle(mode);
  };

  return (
    <div className="settings-toggle">
      <select
        value={
          !isSiteEnabled
            ? "disabled"
            : isUsingGlobalSettings
            ? "global"
            : "site"
        }
        onChange={(e) =>
          handleModeChange(e.target.value as "global" | "site" | "disabled")
        }
        className="w-full bg-[var(--color-primary)] text-[var(--color-text)] rounded py-2.5 text-sm font-medium border-none cursor-pointer hover:bg-[var(--color-primary-hover)] transition-colors duration-200"
      >
        <option value="global">Global Settings</option>
        <option value="site">Site Settings</option>
        <option value="disabled">Disabled</option>
      </select>
    </div>
  );
};
