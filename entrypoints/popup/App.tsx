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

  // Debounce settings updates
  useEffect(() => {
    let settingsUpdateTimeout: number | null = null;
    const debouncedUpdateSettings = async (
      updatedSettings: AudioSettings,
      updatedHostname: string | undefined,
      updatedTabId: number | undefined
    ) => {
      if (settingsUpdateTimeout) {
        clearTimeout(settingsUpdateTimeout);
      }

      settingsUpdateTimeout = window.setTimeout(async () => {
        try {
          console.log(
            "Popup: Settings updated",
            updatedSettings,
            updatedHostname,
            updatedTabId
          );

          const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });

          if (!tabs[0]?.url) {
            console.error("Popup: No active tab found");
            return;
          }

          const currentHostname = new URL(tabs[0].url).hostname;
          if (
            updatedHostname === undefined ||
            updatedHostname === currentHostname
          ) {
            // Ensure settings are properly synced before updating state
            await chrome.storage.sync.set({
              lastUpdated: Date.now(),
              lastSettings: updatedSettings,
            });

            setSettings(updatedSettings);
            if (updatedTabId) {
              // Keep current mode, just update settings
              // The mode (global vs site) should only change via explicit toggle
            }

            // Force refresh settings in content script
            if (tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: "UPDATE_SETTINGS",
                settings: updatedSettings,
                isGlobal: !updatedTabId,
                enabled: true,
                forceUpdate: true,
              });
            }
          }
        } catch (error) {
          console.error("Failed to update settings:", error);
        }
      }, 500);
    };

    const handleSettingsUpdated = (
      updatedSettings: AudioSettings,
      updatedHostname: string | undefined,
      updatedTabId: number | undefined
    ) => {
      debouncedUpdateSettings(updatedSettings, updatedHostname, updatedTabId);
    };

    settingsManager.on("settingsUpdated", handleSettingsUpdated);

    return () => {
      settingsManager.off("settingsUpdated", handleSettingsUpdated);
    };
  }, []);

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
            await settingsManager.updateGlobalSettings(newSettings, tab.id);
          } else {
            await settingsManager.updateSiteSettings(
              hostname,
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
      const previousSettings = settings; // Store current settings

      switch (mode) {
        case "disabled":
          setIsUsingGlobalSettings(false);
          setIsSiteEnabled(false);
          // Keep settings in state while disabled
          await settingsManager.disableSite(hostname, tab.id);
          break;

        case "global":
          setIsUsingGlobalSettings(true);
          setIsSiteEnabled(true);
          // Restore previous settings when switching to global
          await settingsManager.updateGlobalSettings(previousSettings, tab.id, hostname);
          break;

        case "site":
          setIsUsingGlobalSettings(false);
          setIsSiteEnabled(true);
          // Restore previous settings when switching to site mode
          await settingsManager.updateSiteSettings(hostname, previousSettings, tab.id);
          break;
      }
    } catch (error) {
      console.error("Popup: Error toggling mode:", error);
    }
  };

  // Use displaySettings for UI only, keep actual settings in state
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
