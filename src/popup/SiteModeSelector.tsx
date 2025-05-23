import React from 'react';

interface SiteModeSelectorProps {
  isUsingGlobalSettings: boolean;
  isSiteEnabled: boolean;
  onToggle: (mode: "global" | "site" | "disabled") => void;
}

export const SiteModeSelector: React.FC<SiteModeSelectorProps> = ({
  isUsingGlobalSettings,
  isSiteEnabled,
  onToggle,
}) => {
  const getButtonClass = (
    buttonMode: "global" | "site" | "disabled",
    currentIsGlobal: boolean,
    currentIsEnabled: boolean
  ) => {
    let isActive = false;
    if (buttonMode === "disabled") {
      isActive = !currentIsEnabled;
    } else if (buttonMode === "global") {
      isActive = currentIsEnabled && currentIsGlobal;
    } else {
      // 'site' mode
      isActive = currentIsEnabled && !currentIsGlobal;
    }

    return `
      flex-1 py-2 text-sm font-medium rounded-md transition-colors duration-200
      ${isActive
        ? "bg-[var(--color-primary)] text-[var(--color-text-inverted)]"
        : "bg-[var(--color-bg-secondary)] text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)]"
      }
    `;
  };

  return (
    <div className="flex space-x-2 p-1 bg-[var(--color-bg-secondary)] rounded-lg shadow-inner">
      <button
        className={getButtonClass("global", isUsingGlobalSettings, isSiteEnabled)}
        onClick={() => onToggle("global")}
      >
        Global
      </button>
      <button
        className={getButtonClass("site", isUsingGlobalSettings, isSiteEnabled)}
        onClick={() => onToggle("site")}
      >
        Site-Specific
      </button>
      <button
        className={getButtonClass("disabled", isUsingGlobalSettings, isSiteEnabled)}
        onClick={() => onToggle("disabled")}
      >
        Disabled
      </button>
    </div>
  );
};
