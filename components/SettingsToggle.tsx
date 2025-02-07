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
    <div className="flex items-center space-x-2 mb-4">
      <select
        value={!isSiteEnabled ? "disabled" : isUsingGlobalSettings ? "global" : "site"}
        onChange={(e) => handleModeChange(e.target.value as "global" | "site" | "disabled")}
        className="flex-1 bg-[var(--color-primary)] text-[var(--color-text)] rounded py-2 px-3 text-sm font-medium border-none cursor-pointer hover:bg-[var(--color-primary-hover)] transition-colors duration-200"
      >
        <option value="global">Global Settings</option>
        <option value="site">Site Settings</option>
        <option value="disabled">Disabled</option>
      </select>
    </div>
  );
};
