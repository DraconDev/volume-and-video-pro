import { Settings } from "http2";
import {
  AudioSettings,
  SiteSettings,
  defaultSettings,
  defaultSiteSettings,
} from "./types";
import EventEmitter from "events";

export class SettingsManager extends EventEmitter {
  globalSettings: AudioSettings;
  private siteSettings: Map<string, SiteSettings>;

  constructor() {
    super();
    this.globalSettings = { ...defaultSettings };
    this.siteSettings = new Map();
  }

  async initialize() {
    const storage = await chrome.storage.sync.get([
      "globalSettings",
      "siteSettings",
    ]);
    this.globalSettings = storage.globalSettings || { ...defaultSettings };

    if (storage.siteSettings) {
      this.siteSettings = new Map(Object.entries(storage.siteSettings));
    }
  }

  private persistTimeout: NodeJS.Timeout | null = null;
  private pendingSettings = {
    globalSettings: null as AudioSettings | null,
    siteSettings: null as { [hostname: string]: SiteSettings } | null,
  };

  private async persistSettings(hostname?: string) {
    // Clear any existing timeout
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
    }

    // Queue the current settings
    this.pendingSettings.globalSettings = { ...this.globalSettings };
    this.pendingSettings.siteSettings = Object.fromEntries(this.siteSettings);

    // Set a new timeout to batch write settings
    this.persistTimeout = setTimeout(async () => {
      try {
        const settings = {
          globalSettings: this.pendingSettings.globalSettings,
          siteSettings: this.pendingSettings.siteSettings,
        };
        await chrome.storage.sync.set(settings);
        console.log("SettingsManager: Settings persisted successfully", {
          hostname,
        });

        // Clear pending settings
        this.pendingSettings.globalSettings = null;
        this.pendingSettings.siteSettings = null;
      } catch (error) {
        console.error("SettingsManager: Failed to persist settings:", error);
      }
    }, 1000); // Debounce for 1 second
  }

  getSettingsForSite(hostname: string): SiteSettings | null {
    const siteConfig = this.siteSettings.get(hostname);
    if (!siteConfig) {
      return null;
    }

    // If in global mode, make sure we're using global settings
    if (siteConfig.activeSetting === "global") {
      return {
        ...siteConfig,
        settings: { ...this.globalSettings },
      };
    }

    // For disabled sites, return config but with disabled flag
    if (siteConfig.activeSetting === "disabled") {
      return {
        ...siteConfig,
        enabled: false,
      };
    }

    return siteConfig;
  }

  async updateGlobalSettings(
    settings: Partial<AudioSettings>,
    tabId?: number,
    hostname?: string
  ) {
    console.log("SettingsManager: Updating global settings", {
      oldSettings: { ...this.globalSettings },
      newSettings: settings,
      tabId,
      hostname,
    });

    // Update settings
    this.globalSettings = {
      ...this.globalSettings,
      ...settings,
    };

    // Emit a single event for global settings change
    this.emit("globalSettingsChanged", this.globalSettings);

    await this.persistSettings(hostname);
  }

  async updateSiteSettings(
    hostname: string,
    settings: AudioSettings,
    tabId?: number
  ) {
    console.log("SettingsManager: Updating site settings for", hostname, {
      tabId,
    });

    if (!settings) {
      console.log("SettingsManager: No settings provided");
      return;
    }
    if (!hostname) {
      console.log("SettingsManager: No hostname provided");
      return;
    }

    let siteConfig = this.siteSettings.get(hostname);
    const isNewSite = !siteConfig;

    if (isNewSite) {
      siteConfig = {
        enabled: true,
        activeSetting: "site",
        settings: { ...defaultSettings },
      };
      console.log(
        "SettingsManager: Created new site config with default settings"
      );
    }
    if (!siteConfig) {
      console.log("SettingsManager: Initializing site with default settings");
      return;
    }
    // Update with new settings
    siteConfig.settings = { ...settings };
    siteConfig.activeSetting = "site";
    siteConfig.enabled = true;
    this.siteSettings.set(hostname, siteConfig);

    await this.persistSettings(hostname);
    // Emit specific event for site settings change
    this.emit("siteSettingsChanged", hostname, siteConfig.settings); // Use the actual saved settings

    console.log("SettingsManager: Updated site settings", {
      isNewSite,
      oldConfig: this.siteSettings.get(hostname),
      newConfig: siteConfig,
    });
  }

  async updateSiteMode(
    hostname: string,
    mode: "global" | "site" | "disabled",
    tabId?: number
  ) {
    let siteConfig = this.siteSettings.get(hostname);
    const oldMode = siteConfig?.activeSetting;

    if (!siteConfig) {
      // Initialize with current global settings if no config exists
      siteConfig = {
        enabled: mode !== "disabled",
        activeSetting: mode,
        settings: { ...this.globalSettings },
      };
    }

    // Update mode and enabled state, but preserve settings
    siteConfig.activeSetting = mode;
    siteConfig.enabled = mode !== "disabled";

    this.siteSettings.set(hostname, siteConfig);
    await this.persistSettings(hostname);

    // Determine which settings to display (not modify)
    const displaySettings =
      mode === "disabled"
        ? { ...defaultSettings }
        : mode === "global"
        ? { ...this.globalSettings }
        : { ...siteConfig.settings };

    // Emit specific event for site mode change
    this.emit("siteModeChanged", hostname, mode, displaySettings);
    return { settingsToUse: displaySettings, siteConfig };
  }

  private getSettingsForPlayback(
    hostname: string,
    mode: string,
    siteConfig: SiteSettings
  ): AudioSettings {
    if (mode === "global") {
      console.log("SettingsManager: Using global settings for playback:", {
        ...this.globalSettings,
      });
      return { ...this.globalSettings };
    }

    if (mode === "site" && siteConfig.settings) {
      console.log("SettingsManager: Using site settings for playback:", {
        ...siteConfig.settings,
      });
      return { ...siteConfig.settings };
    }

    // Simplify to just return disabled settings
    console.log("SettingsManager: Using disabled settings for playback");
    return { ...defaultSettings };
  }

  async disableSite(hostname: string, tabId?: number) {
    let siteConfig = this.siteSettings.get(hostname);

    if (!siteConfig) {
      // If no config exists, create one with current global settings
      siteConfig = {
        enabled: false,
        activeSetting: "disabled",
        settings: { ...this.globalSettings },
      };
    } else {
      // Keep existing settings, just update the mode
      siteConfig.enabled = false;
      siteConfig.activeSetting = "disabled";
    }

    this.siteSettings.set(hostname, siteConfig);
    await this.persistSettings(hostname);

    // Emit default settings for display only, actual settings remain unchanged
    // Emit specific event for site mode change (to disabled)
    this.emit("siteModeChanged", hostname, "disabled", { ...defaultSettings });

    return {
      actualSettings: siteConfig.settings,
      displaySettings: { ...defaultSettings },
    };
  }
}

export const settingsManager = new SettingsManager();
