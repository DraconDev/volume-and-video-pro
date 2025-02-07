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
  const buttonClassName = (isActive: boolean) => `
    flex-1 px-3 py-2 text-sm font-medium rounded
    ${
      isActive
        ? "bg-[var(--color-primary)] text-[var(--color-text)]"
        : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]"
    }
    border-none cursor-pointer hover:bg-[var(--color-primary-hover)] transition-colors duration-200
  `;

  return (
    <div className="flex space-x-2">
      <button
        onClick={() => onToggle("global")}
        className={buttonClassName(isUsingGlobalSettings && isSiteEnabled)}
      >
        Global
      </button>
      <button
        onClick={() => onToggle("site")}
        className={buttonClassName(!isUsingGlobalSettings && isSiteEnabled)}
      >
        Site
      </button>
      <button
        onClick={() => onToggle("disabled")}
        className={buttonClassName(!isSiteEnabled)}
      >
        Off
      </button>
    </div>
  );
};
