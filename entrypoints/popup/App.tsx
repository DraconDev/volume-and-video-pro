import { useState, useEffect, useRef } from "react";
import { AudioSettings } from "../../src/types";

import { SettingsToggle } from "../../components/SettingsToggle";
import { AudioControls } from "../../components/AudioControls";
import { settingsManager } from "../../src/settings-manager";

function App() {
  const defaultSettings: AudioSettings = {
    volume: 100,
    speed: 100,
    bassBoost: 100,
    voiceBoost: 100,
    mono: false,
  };

  const [settings, setSettings] = useState<AudioSettings>(defaultSettings);
  const [isUsingGlobalSettings, setIsUsingGlobalSettings] = useState(true);
  const [isSiteEnabled, setIsSiteEnabled] = useState(true);

  // Load initial settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Get the current tab to get its hostname
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.url) {
          console.error("Popup: No active tab found");
          return;
        }

        const hostname = new URL(tab.url).hostname;
        console.log("Popup: Loading settings for hostname:", hostname);

        // Initialize settings manager
        await settingsManager.initialize();

        // Get settings from settings manager
        const siteConfig = settingsManager.getSettingsForSite(hostname);

        // Set initial mode and settings
        if (siteConfig) {
          const isDisabled = siteConfig.activeSetting === "disabled";
          const isGlobal = siteConfig.activeSetting === "global";
          setIsUsingGlobalSettings(isGlobal);
          setIsSiteEnabled(!isDisabled);

          if (isDisabled) {
            // Show disabled state settings but keep actual settings in state
            setSettings(siteConfig.settings || defaultSettings);
          } else if (isGlobal) {
            // Use global settings
            setSettings(settingsManager.globalSettings || defaultSettings);
          } else {
            // Use site-specific settings
            setSettings(siteConfig.settings || defaultSettings);
          }
        } else {
          // No site config exists, use global settings
          setSettings(settingsManager.globalSettings || defaultSettings);
          setIsUsingGlobalSettings(true);
          setIsSiteEnabled(true);
        }
      } catch (error) {
        console.error("Popup: Error loading settings:", error, {
          currentSettings: settings,
          isUsingGlobalSettings,
          isSiteEnabled,
        });
      }
    };

    loadSettings();
  }, []);

  // Removed incorrect useEffect listening for "settingsUpdated"

  const handleSettingChange = async (
    key: keyof AudioSettings,
    value: number | boolean
  ) => {
    if (!isSiteEnabled) return; // Prevent changes when site is disabled

    const newSettings = {
      ...settings,
      [key]: value,
    };

    // Update local state immediately for responsive UI
    setSettings(newSettings);

    // Use debounced update for storage operations
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = window.setTimeout(async () => {
      try {
        // Update settings through settings manager
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.url && tab.id) {
          const hostname = new URL(tab.url).hostname;
          if (isUsingGlobalSettings) {
            // Pass hostname even for global updates for consistency/logging
            await settingsManager.updateGlobalSettings(newSettings, tab.id, hostname);
          } else {
            await settingsManager.updateSiteSettings(
              hostname, // Pass hostname for site-specific updates
              newSettings,
              tab.id
            );
          }
        }
      } catch (error) {
        console.error("Failed to update settings:", error);
      }
    }, 500); // Debounce for 500ms
  };

  // Initialize updateTimeoutRef
  const updateTimeoutRef = useRef<number | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  const formatDiff = (value: number) => {
    return `${value}%`;
  };

  const handleReset = () => {
    if (!isSiteEnabled) return; // Prevent reset when site is disabled
    setSettings(defaultSettings);
  };

  const handleToggleMode = async (mode: "global" | "site" | "disabled") => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.url || !tab.id) {
        console.error("Popup: No active tab found");
        return;
      }

      const hostname = new URL(tab.url).hostname;

      // Don't update actual settings, just switch modes
      setIsUsingGlobalSettings(mode === "global");
      setIsSiteEnabled(mode !== "disabled");

      if (mode === "disabled") {
        await settingsManager.disableSite(hostname, tab.id);
      } else {
        await settingsManager.updateSiteMode(hostname, mode, tab.id);
      }
    } catch (error) {
      console.error("Popup: Error toggling mode:", error);
    }
  };

  // Only affect display, not actual settings
  const displaySettings = isSiteEnabled ? settings : defaultSettings;

  return (
    <div className="w-[280px] p-4 font-sans bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col space-y-4">
      <AudioControls
        settings={displaySettings}
        onSettingChange={handleSettingChange}
        formatDiff={formatDiff}
        onReset={handleReset}
        isEnabled={isSiteEnabled}
      />

      <SettingsToggle
        isUsingGlobalSettings={isUsingGlobalSettings}
        isSiteEnabled={isSiteEnabled}
        onToggle={handleToggleMode}
      />

      <button
        onClick={() => window.open("https://ko-fi.com/adamdracon")}
        className="w-full bg-[var(--color-primary)] text-[var(--color-text)] rounded py-2.5 text-sm font-medium border-none cursor-pointer hover:bg-[var(--color-primary-hover)] transition-colors duration-200"
      >
        Donate
      </button>
    </div>
  );
}

export default App;
