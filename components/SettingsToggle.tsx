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
        value={!isSiteEnabled ? "disabled" : isUsingGlobalSettings ? "global" : "site"}
        onChange={(e) => handleModeChange(e.target.value as "global" | "site" | "disabled")}
      >
        <option value="global">Global Settings</option>
        <option value="site">Site Settings</option>
        <option value="disabled">Disabled</option>
      </select>
    </div>
  );
};
