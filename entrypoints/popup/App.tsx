import { useState, useEffect, useRef, useCallback } from "react";
import { AudioSettings, debugLog } from "../../src/types";

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
        debugLog("Popup: Loading settings for hostname:", hostname);

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
        }
        // The 'else' block previously here is now unreachable because getSettingsForSite always returns a config.
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

  const handleSettingChange = useCallback(async (
    key: keyof AudioSettings,
    value: number | boolean
  ) => {
    if (!isSiteEnabled) return; // Prevent changes when site is disabled

    const newSettings = {
      ...settings,
      [key]: value,
    };
    debugLog(
      `[Popup] handleSettingChange: Key=${key}, Value=${value}. New settings object:`,
      newSettings
    ); // Log immediate change intent

    // Update local state immediately for responsive UI
    setSettings(newSettings);

    // Clear any existing debounce timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Set a new timeout, passing both the settings AND the mode flag to avoid stale closure
    updateTimeoutRef.current = window.setTimeout(
      async (payload: { settingsToSend: AudioSettings; isGlobal: boolean }) => {
        const { settingsToSend, isGlobal } = payload;
        debugLog("[Popup] Debounce triggered. Sending update..."); // Log debounce execution
        try {
          debugLog("[Popup] Debounce - Final state to send:", {
            settingsToSend,
            isGlobal,
          }); // Log state being sent

          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (tab?.url && tab.id) {
            const hostname = new URL(tab.url).hostname;

            if (isGlobal) {
              await settingsManager.updateGlobalSettings(
                settingsToSend,
                tab.id,
                hostname
              );
              debugLog("[Popup] Debounce - Called updateGlobalSettings"); // Log which function was called
            } else {
              await settingsManager.updateSiteSettings(
                hostname,
                settingsToSend,
                tab.id
              );
              debugLog("[Popup] Debounce - Called updateSiteSettings"); // Log which function was called
            }
          } else {
            console.warn(
              "[Popup] Debounce - No active tab found to send update."
            );
          }
        } catch (error) {
          console.error("Failed to update settings via debounce:", error); // Clarify error source
        }
      },
      300,
      { settingsToSend: newSettings, isGlobal: isUsingGlobalSettings }
    ); // Pass both settings and current mode flag
  }, [settings, isSiteEnabled, isUsingGlobalSettings]);

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

  const formatDiff = useCallback((value: number) => {
    return `${value}%`;
  }, []);

  const handleReset = useCallback(() => {
    if (!isSiteEnabled) return; // Prevent reset when site is disabled
    setSettings(defaultSettings);
  }, [isSiteEnabled]);

  const handleToggleMode = useCallback(async (mode: "global" | "site" | "disabled") => {
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

      let settingsForUI: AudioSettings;
      if (mode === "disabled") {
        const result = await settingsManager.disableSite(hostname, tab.id);
        // When disabling, update UI to show default settings
        settingsForUI = result.displaySettings;
        setSettings(settingsForUI);
      } else {
        // For 'global' or 'site' mode
        const result = await settingsManager.updateSiteMode(
          hostname,
          mode,
          tab.id
        );
        // After changing mode, update UI to show the settings for that mode
        settingsForUI = result.settingsToUse;
        setSettings(settingsForUI);
      }
      debugLog(
        `Popup: Mode toggled to ${mode}, UI settings updated to:`,
        settingsForUI
      ); // Corrected log
    } catch (error) {
      console.error("Popup: Error toggling mode:", error);
    }
  }, [isSiteEnabled]);

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

      <div className="text-xs text-[var(--color-text-secondary)] text-center mt-2">
        On some sites, settings may only apply after a new video starts or the page is refreshed.
      </div>

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
