import { Settings } from "http2";
import {
  AudioSettings,
  SiteSettings,
  defaultSettings,
  defaultSiteSettings,
} from "./types";
import EventEmitter from "events";
// Import the broadcast functions directly
import { broadcastSiteSettingsUpdate, broadcastSiteModeUpdate, broadcastGlobalSettingsUpdate } from "./settings-event-handler";

export class SettingsManager extends EventEmitter {
  globalSettings: AudioSettings;
  private siteSettings: Map<string, SiteSettings>;
  private initializationPromise: Promise<void> | null = null; // Added initialization promise
  private isInitialized = false; // Added flag

  constructor() {
    super();
    this.globalSettings = { ...defaultSettings };
    this.siteSettings = new Map();
  }

  async initialize(): Promise<void> {
    // Prevent re-initialization
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Create the promise and store the resolver
    let resolveInit: () => void;
    this.initializationPromise = new Promise((resolve) => {
      resolveInit = resolve;
    });

    try {
      console.log("SettingsManager: Starting initialization..."); // Log start
      const storage = await chrome.storage.sync.get([
        "globalSettings",
        "siteSettings",
      ]);
      this.globalSettings = storage.globalSettings || { ...defaultSettings };

      if (storage.siteSettings) {
        // Ensure loaded data is correctly formed Map
        try {
          this.siteSettings = new Map(Object.entries(storage.siteSettings));
        } catch (mapError) {
          console.error("SettingsManager: Error parsing siteSettings from storage, resetting.", mapError);
          this.siteSettings = new Map(); // Reset if data is corrupt
        }
      } else {
        this.siteSettings = new Map(); // Ensure it's a map if nothing in storage
      }
      this.isInitialized = true; // Set flag
      console.log("SettingsManager: Initialization complete."); // Log success
    } catch (error) {
      console.error("SettingsManager: Initialization failed:", error);
      // Still initialize with defaults on error
      this.globalSettings = { ...defaultSettings };
      this.siteSettings = new Map();
      this.isInitialized = true; // Mark as initialized even on error to prevent blocking
    } finally {
      // @ts-ignore - resolveInit is guaranteed to be assigned
      resolveInit(); // Resolve the promise whether success or failure
    }
    return this.initializationPromise; // Return the promise
  }

  // Helper to ensure initialization is awaited
  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
       // If initialize was never called, call it now.
       // This might happen if background script startup logic changes.
       console.warn("SettingsManager: ensureInitialized called before initialize. Initializing now.");
       await this.initialize();
    } else {
       await this.initializationPromise; // Await the existing promise
    }
     if (!this.isInitialized) {
        // This case should ideally not happen if initialize resolves correctly
        console.error("SettingsManager: Initialization promise resolved, but manager not marked as initialized.");
        // Potentially throw an error or handle recovery
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

  // Note: getSettingsForSite is called by background script *after* awaiting initialize,
  // so we might not strictly need ensureInitialized here, but adding for safety.
  getSettingsForSite(hostname: string): SiteSettings { // Changed return type to non-nullable
    // Although background awaits, ensureInitialized check doesn't hurt
    if (!this.isInitialized) {
        console.warn("SettingsManager: getSettingsForSite called before initialization completed. Returning defaults.");
        // Return a default global config immediately without waiting
        return {
            enabled: true,
            activeSetting: "global",
            settings: { ...this.globalSettings }, // Use potentially uninitialized globalSettings
        };
    }

    let siteConfig = this.siteSettings.get(hostname);

    // If no site config exists, create a default one using global settings
    if (!siteConfig) {
      console.log(`SettingsManager: No config found for ${hostname}, creating default global config.`);
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
    await this.ensureInitialized(); // Wait for init
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

    // Directly call the broadcast function instead of emitting an event
    broadcastGlobalSettingsUpdate(this.globalSettings);
    console.log("SettingsManager: Updated global settings & called broadcast"); // Added log

    await this.persistSettings(hostname);
  }

  async updateSiteSettings(
    hostname: string,
    settings: AudioSettings,
    tabId?: number
  ) {
    await this.ensureInitialized(); // Wait for init
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
    // Directly call the broadcast function instead of emitting an event
    broadcastSiteSettingsUpdate(hostname, siteConfig.settings); // Use the actual saved settings

    console.log("SettingsManager: Updated site settings & called broadcast", { // Updated log
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
    await this.ensureInitialized(); // Wait for init
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
    console.log("SettingsManager: Updated site mode & called broadcast", { hostname, mode, settingsToBroadcast }); // Updated log
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
    await this.ensureInitialized(); // Wait for init
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
    console.log("SettingsManager: Disabled site & called broadcast", { hostname }); // Added log

    return {
      actualSettings: siteConfig.settings, // Keep returning this for potential internal use
      displaySettings: { ...defaultSettings },
    };
  }
}

export const settingsManager = new SettingsManager();
