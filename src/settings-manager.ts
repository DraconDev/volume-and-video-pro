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

    // For disabled sites
    if (siteConfig.activeSetting === "disabled" || !siteConfig.enabled) {
      return null;
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

    // For sites using global settings, emit update events
    this.siteSettings.forEach((siteConfig, site) => {
      if (siteConfig.activeSetting === "global") {
        this.emit("settingsUpdated", this.globalSettings, site, undefined);
      }
    });

    // Emit for the current site if specified
    if (hostname) {
      this.emit("settingsUpdated", this.globalSettings, hostname, tabId);
    }

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
    this.emit("settingsUpdated", settings, hostname, tabId);

    console.log("SettingsManager: Updated site settings", {
      isNewSite,
      oldConfig: this.siteSettings.get(hostname),
      newConfig: siteConfig,
    });
  }

  async updateSiteMode(
    hostname: string,
    mode: "global" | "site" | "disabled", // changed from 'default'
    tabId?: number
  ) {
    let siteConfig = this.siteSettings.get(hostname);
    const oldMode = siteConfig?.activeSetting;

    // Initialize siteConfig if it doesn't exist
    if (!siteConfig) {
      siteConfig = {
        enabled: mode !== "disabled",
        activeSetting: mode,
        settings: { ...defaultSettings }, // Always initialize with settings
      };
    }

    console.log("SettingsManager: Mode transition", {
      oldMode,
      newMode: mode,
      hasExistingSettings: !!siteConfig.settings,
      tabId,
    });

    // Update mode-specific settings
    switch (mode) {
      case "site":
        siteConfig.enabled = true;
        // Use existing site settings or initialize with defaults
        siteConfig.settings = siteConfig.settings || { ...defaultSettings };
        break;

      case "global":
        siteConfig.enabled = true;
        // Keep existing site settings but use global settings for now
        siteConfig.settings = siteConfig.settings || { ...defaultSettings };
        break;

      case "disabled":
        siteConfig.enabled = false;
        // Preserve site settings even when disabled
        break;
    }

    // Update mode
    siteConfig.activeSetting = mode;
    this.siteSettings.set(hostname, siteConfig);

    await this.persistSettings(hostname);

    // Get the appropriate settings based on mode
    const settingsToUse =
      mode === "global"
        ? { ...this.globalSettings }
        : mode === "site"
        ? { ...siteConfig.settings }
        : { ...defaultSettings };

    // Emit settings update event
    this.emit("settingsUpdated", settingsToUse, hostname, tabId);

    return { settingsToUse, siteConfig };
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
    const siteConfig = this.siteSettings.get(hostname) || {
      ...defaultSiteSettings,
    };

    // Preserve the settings but mark as disabled
    siteConfig.activeSetting = "disabled";
    siteConfig.enabled = false;
    this.siteSettings.set(hostname, siteConfig);

    await this.persistSettings(hostname);
    this.emit("settingsUpdated", { ...defaultSettings }, hostname, tabId);
    return { ...defaultSettings };
  }
}

export const settingsManager = new SettingsManager();
