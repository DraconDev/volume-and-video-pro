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

    private async persistSettings() {
        const siteSettingsObj = Object.fromEntries(this.siteSettings);
        await chrome.storage.sync.set({
            globalSettings: this.globalSettings,
            siteSettings: siteSettingsObj,
        });
    }

    getSettingsForSite(hostname: string): SiteSettings | null {
        const siteConfig = this.siteSettings.get(hostname);
        if (!siteConfig || siteConfig.activeSetting === "default") {
            return null;
        }
        return siteConfig;
    }

    async updateGlobalSettings(settings: AudioSettings, hostname?: string) {
        console.log("SettingsManager: Updating global settings", {
            oldSettings: { ...this.globalSettings },
            newSettings: { ...settings },
        });

        this.globalSettings = { ...settings };

        // If hostname provided, update site config mode
        if (hostname) {
            const siteConfig = this.siteSettings.get(hostname);
            if (siteConfig) {
                // Keep existing site settings, just ensure we're in global mode
                siteConfig.activeSetting = "global";
                siteConfig.enabled = true;
                this.siteSettings.set(hostname, siteConfig);

                console.log(
                    "SettingsManager: Updated to global mode for",
                    hostname,
                    {
                        siteConfig: this.siteSettings.get(hostname),
                        globalSettings: this.globalSettings,
                        preservedSiteSettings: siteConfig?.settings
                            ? { ...siteConfig.settings }
                            : "none",
                    }
                );
            }
        }

        await this.persistSettings();
        this.emit("settingsUpdated", this.globalSettings, hostname);
    }

    async updateSiteSettings(hostname: string, settings: AudioSettings) {
        console.log("SettingsManager: Updating site settings for", hostname);

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
            console.log(
                "SettingsManager: Initializing site with default settings"
            );
            return;
        }
        // Update with new settings
        siteConfig.settings = { ...settings };
        siteConfig.activeSetting = "site";
        siteConfig.enabled = true;
        this.siteSettings.set(hostname, siteConfig);

        await this.persistSettings();
        this.emit("settingsUpdated", settings, hostname);

        console.log("SettingsManager: Updated site settings", {
            isNewSite,
            oldConfig: this.siteSettings.get(hostname),
            newConfig: siteConfig,
        });
    }

    async updateSiteMode(
        hostname: string,
        mode: "global" | "site" | "default"
    ) {
        let siteConfig = this.siteSettings.get(hostname);
        const oldMode = siteConfig?.activeSetting;

        if (!siteConfig) {
            siteConfig = {
                enabled: true,
                activeSetting: mode,
                settings: undefined,
            };
        }

        console.log("SettingsManager: Mode transition", {
            oldMode,
            newMode: mode,
            hasExistingSettings: !!siteConfig.settings,
        });

        if (mode === "site" && !siteConfig.settings) {
            // Initialize with default settings for new site mode
            console.log(
                "SettingsManager: Initializing site with default settings"
            );
            siteConfig.settings = { ...defaultSettings };
        }

        // Update mode and enabled state
        siteConfig.activeSetting = mode;
        siteConfig.enabled = mode !== "default";
        this.siteSettings.set(hostname, siteConfig);

        await this.persistSettings();
        this.emit(
            "settingsUpdated",
            this.getSettingsForPlayback(hostname, mode, siteConfig),
            hostname
        );

        return {
            settingsToUse: this.getSettingsForPlayback(
                hostname,
                mode,
                siteConfig
            ),
            siteConfig,
        };
    }

    private getSettingsForPlayback(
        hostname: string,
        mode: string,
        siteConfig: SiteSettings
    ): AudioSettings {
        if (mode === "global") {
            console.log(
                "SettingsManager: Using global settings for playback:",
                { ...this.globalSettings }
            );
            return { ...this.globalSettings };
        }

        if (mode === "site" && siteConfig.settings) {
            console.log("SettingsManager: Using site settings for playback:", {
                ...siteConfig.settings,
            });
            return { ...siteConfig.settings };
        }

        console.log("SettingsManager: Using default settings for playback");
        return { ...defaultSettings };
    }

    async disableSite(hostname: string) {
        const siteConfig = this.siteSettings.get(hostname) || {
            ...defaultSiteSettings,
        };

        // Only update the activeSetting, preserve the settings
        siteConfig.activeSetting = "default";
        this.siteSettings.set(hostname, siteConfig);

        await this.persistSettings();
        this.emit("settingsUpdated", { ...defaultSettings }, hostname);
        return { ...defaultSettings };
    }
}

export const settingsManager = new SettingsManager();
