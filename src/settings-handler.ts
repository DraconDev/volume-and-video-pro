import { AudioSettings, defaultSettings, SiteSettings } from "./types";
import { settingsManager } from "./settings-manager";

export class SettingsHandler {
    private currentSettings: AudioSettings;
    private isUsingGlobalSettings: boolean;
    private hostname: string;

    constructor() {
        this.currentSettings = defaultSettings;
        this.isUsingGlobalSettings = true;
        this.hostname = window.location.hostname;
    }

    async initialize(): Promise<void> {
        try {
            console.log("Settings: Starting initialization");
            const storage = await chrome.storage.sync.get([
                "globalSettings",
                "siteSettings",
            ]);

            // Initialize with global settings if available
            if (storage.globalSettings) {
                this.currentSettings = storage.globalSettings;
                this.isUsingGlobalSettings = true;
            } else {
                this.currentSettings = defaultSettings;
                this.isUsingGlobalSettings = true;
            }

            // Check for site-specific settings
            const siteConfig = storage.siteSettings?.[this.hostname];
            if (siteConfig) {
                if (siteConfig.activeSetting === "site") {
                    // Only use site settings if specifically in site mode
                    this.currentSettings = siteConfig.settings;
                    this.isUsingGlobalSettings = false;
                    console.log("Settings: Using site-specific settings");
                } else {
                    // For global or default mode, use global settings
                    console.log("Settings: Using global settings (site in global mode)");
                }
            } else {
                console.log("Settings: Using global settings (no site config)");
            }

            // Notify background script
            await this.notifyReady();

            console.log("Settings: Initialization complete", {
                settings: this.currentSettings,
                isGlobal: this.isUsingGlobalSettings,
            });
        } catch (error) {
            console.error("Settings: Error during initialization:", error);
            this.currentSettings = defaultSettings;
            this.isUsingGlobalSettings = true;
            throw error;
        }

        // Listen for settings updates
        settingsManager.on(
            "settingsUpdated",
            (settings: AudioSettings, hostname: string | undefined) => {
                if (this.isUsingGlobalSettings || hostname === this.hostname) {
                    this.currentSettings = settings;
                    this.isUsingGlobalSettings =
                        hostname === undefined || hostname === this.hostname;
                    console.log("Settings: Updated settings", {
                        settings: this.currentSettings,
                        isGlobal: this.isUsingGlobalSettings,
                    });
                }
            }
        );
    }

    private async notifyReady(): Promise<void> {
        await chrome.runtime.sendMessage({
            type: "CONTENT_SCRIPT_READY",
            hostname: this.hostname,
            usingGlobal: this.isUsingGlobalSettings,
        });
    }

    getCurrentSettings(): AudioSettings {
        console.log(
            "Settings: Getting current settings:",
            this.currentSettings
        );
        return this.currentSettings;
    }

    isGlobal(): boolean {
        return this.isUsingGlobalSettings;
    }

    updateSettings(settings: AudioSettings): void {
        this.currentSettings = settings;
    }

    resetToDefault(): void {
        this.currentSettings = defaultSettings;
    }

    needsAudioProcessing(): boolean {
        // Always return true to maintain audio processing chain
        // This ensures the Web Audio API nodes stay connected and ready to handle changes
        return true;
    }

    setupStorageListener(callback: (settings: AudioSettings) => void): void {
        chrome.storage.onChanged.addListener((changes) => {
            console.log("Settings: Storage changes detected:", changes);
        });
    }
}
