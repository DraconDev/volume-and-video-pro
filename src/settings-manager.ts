import { Settings } from "http2";
import {
  AudioSettings,
  SiteSettings,
  defaultSettings,
  defaultSiteSettings,
} from "./types";
import EventEmitter from "events";
// Import the broadcast functions directly
import {
  broadcastSiteSettingsUpdate,
  broadcastSiteModeUpdate,
  broadcastGlobalSettingsUpdate,
} from "./settings-event-handler";

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
      console.log(
        "[DEBUG] SettingsManager Initialized with stored site settings. SiteSettings Map:",
        this.siteSettings
      ); // Add log
    } else {
      this.siteSettings = new Map(); // Ensure map is empty if nothing in storage
      console.log(
        "[DEBUG] SettingsManager Initialized with no stored site settings."
      ); // Add log
    }
    console.log(
      "[DEBUG] SettingsManager Initialized. Global Settings:",
      this.globalSettings
    ); // Also log global settings
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
    }, 200); // Reduced debounce time to 200ms
  }

  getSettingsForSite(hostname: string): SiteSettings {
    // Changed return type to non-nullable
    let siteConfig = this.siteSettings.get(hostname);

    // If no site config exists, create a default one using global settings
    if (!siteConfig) {
      console.log(
        `SettingsManager: No config found for ${hostname}, creating default global config.`
      );
      siteConfig = {
        enabled: true, // Assume enabled by default
        activeSetting: "global",
        settings: { ...this.globalSettings }, // Use current global settings
      };
      // Note: We don't persist this default config immediately.
      // It only gets persisted if the user explicitly changes settings or mode for this site later.
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

    // Broadcast immediately before persistence
    broadcastGlobalSettingsUpdate(this.globalSettings);
    console.log(
      "SettingsManager: Updated global settings & called broadcast immediately"
    );

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

    // Broadcast immediately before persistence
    broadcastSiteSettingsUpdate(hostname, siteConfig.settings);
    console.log(
      "SettingsManager: Updated site settings & called broadcast immediately"
    );

    await this.persistSettings(hostname);
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
        : siteConfig.settings || { ...defaultSettings }; // Use defaults if site settings are somehow undefined

    // Ensure the object passed strictly matches AudioSettings type
    const settingsToBroadcast: AudioSettings = { ...displaySettings };

    // Directly call the broadcast function instead of emitting an event
    broadcastSiteModeUpdate(hostname, mode, settingsToBroadcast);
    console.log("SettingsManager: Updated site mode & called broadcast", {
      hostname,
      mode,
      settingsToBroadcast,
    }); // Updated log
    return { settingsToUse: settingsToBroadcast, siteConfig }; // Return the guaranteed object
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

    // Directly call the broadcast function instead of emitting an event
    // Ensure the passed object strictly matches AudioSettings type
    const disabledSettings: AudioSettings = { ...defaultSettings };
    broadcastSiteModeUpdate(hostname, "disabled", disabledSettings);
    console.log("SettingsManager: Disabled site & called broadcast", {
      hostname,
    }); // Added log

    return {
      actualSettings: siteConfig.settings, // Keep returning this for potential internal use
      displaySettings: { ...defaultSettings },
    };
  }
}

export const settingsManager = new SettingsManager();
