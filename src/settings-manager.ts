import {
  AudioSettings,
  SiteSettings,
  defaultSettings,
} from "./types";
// Import the broadcast functions directly
import {
  broadcastSiteSettingsUpdate,
  broadcastSiteModeUpdate,
  broadcastGlobalSettingsUpdate,
} from "./settings-event-handler";

export class SettingsManager {
  globalSettings: AudioSettings;
  private siteSettings: Map<string, SiteSettings>;

  constructor() {
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
        "[DEBUG] SettingsManager Initialized with stored site settings. SiteSettings Map:",
        this.siteSettings
      ); // Add log
    } else {
      this.siteSettings = new Map(); // Ensure map is empty if nothing in storage
        "[DEBUG] SettingsManager Initialized with no stored site settings."
      ); // Add log
    }
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

    // Persist settings first to ensure data integrity
    await this.persistSettings(hostname);
      "SettingsManager: Global settings persisted successfully"
    );

    // Then broadcast the update to other tabs
    broadcastGlobalSettingsUpdate(this.globalSettings);
      "SettingsManager: Updated global settings & called broadcast"
    );
  }

  async updateSiteSettings(
    hostname: string,
    settings: AudioSettings,
    tabId?: number
  ) {
      tabId,
    });

    if (!settings) {
      return;
    }
    if (!hostname) {
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
        "SettingsManager: Created new site config with default settings"
      );
    }
    if (!siteConfig) {
      return;
    }
    // Update with new settings
    siteConfig.settings = { ...settings };
    siteConfig.activeSetting = "site";
    siteConfig.enabled = true;
    this.siteSettings.set(hostname, siteConfig);

    // Persist settings first to ensure data integrity
    await this.persistSettings(hostname);
      "SettingsManager: Site settings persisted successfully"
    );

    // Then broadcast the update to other tabs
    broadcastSiteSettingsUpdate(hostname, siteConfig.settings);
      "SettingsManager: Updated site settings & called broadcast"
    );
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
      hostname,
      mode,
      settingsToBroadcast,
    }); // Updated log
    return { settingsToUse: settingsToBroadcast, siteConfig }; // Return the guaranteed object
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
      hostname,
    }); // Added log

    return {
      actualSettings: siteConfig.settings, // Keep returning this for potential internal use
      displaySettings: { ...defaultSettings },
    };
  }
}

export const settingsManager = new SettingsManager();
