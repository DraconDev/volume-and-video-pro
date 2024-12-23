import { AudioSettings, defaultSettings, SiteSettings } from "./types";

export class SettingsHandler {
    private currentSettings: AudioSettings;
    private isUsingGlobalSettings: boolean;

    constructor() {
        this.currentSettings = defaultSettings;
        this.isUsingGlobalSettings = true;
    }

    async initialize(): Promise<void> {
        try {
            console.log("Settings: Starting initialization");
            const storage = await chrome.storage.sync.get([
                "globalSettings",
                "siteSettings",
            ]);
            const hostname = window.location.hostname;

            // First check for site-specific settings
            if (storage.siteSettings?.[hostname]) {
                this.currentSettings = storage.siteSettings[hostname];
                this.isUsingGlobalSettings = false;
                console.log("Settings: Using site-specific settings");
            } else if (storage.globalSettings) {
                this.currentSettings = storage.globalSettings;
                this.isUsingGlobalSettings = true;
                console.log("Settings: Using global settings");
            } else {
                this.currentSettings = defaultSettings;
                this.isUsingGlobalSettings = true;
                console.log("Settings: Using default settings");
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
    }

    private async notifyReady(): Promise<void> {
        await chrome.runtime.sendMessage({
            type: "CONTENT_SCRIPT_READY",
            hostname: window.location.hostname,
            usingGlobal: this.isUsingGlobalSettings,
        });
    }

    getCurrentSettings(): AudioSettings {
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
        return (
            this.currentSettings.volume !== 100 ||
            this.currentSettings.bassBoost !== 100 ||
            this.currentSettings.voiceBoost !== 100 ||
            this.currentSettings.mono
        );
    }

    setupStorageListener(callback: (settings: AudioSettings) => void): void {
        chrome.storage.onChanged.addListener((changes) => {
            const hostname = window.location.hostname;
            console.log("Settings: Storage changes detected:", changes);

            if (changes.siteSettings?.newValue?.[hostname] && !this.isUsingGlobalSettings) {
                console.log("Settings: Site settings changed:", changes.siteSettings.newValue[hostname]);
                this.currentSettings = changes.siteSettings.newValue[hostname];
                callback(this.currentSettings);
            } else if (changes.globalSettings?.newValue && this.isUsingGlobalSettings) {
                console.log("Settings: Global settings changed:", changes.globalSettings.newValue);
                this.currentSettings = changes.globalSettings.newValue;
                callback(this.currentSettings);
            }
        });
    }
}
