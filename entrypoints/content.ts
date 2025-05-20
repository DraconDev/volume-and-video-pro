// This is what your ACTUAL settings-handler.ts should contain
// (or a file with a similar purpose that content.ts imports)

import { AudioSettings, defaultSettings } from "...//types"; // Adjust path if needed

export class SettingsHandler {
    private currentSettings: AudioSettings;
    private targetHostname: string | null = null;
    private initializationComplete: Promise<void>;
    private resolveInitialization!: () => void;

    constructor() {
        this.currentSettings = { ...defaultSettings };
        this.initializationComplete = new Promise((resolve) => {
            this.resolveInitialization = resolve;
        });
    }

    async initialize(hostname: string): Promise<void> {
        this.targetHostname = hostname;
        console.log(`SettingsHandler (Target: ${this.targetHostname}): Initializing...`);

        if (!this.targetHostname) {
             console.error(`SettingsHandler (Target: ${this.targetHostname}): Initialization aborted - no valid target hostname.`);
             this.currentSettings = { ...defaultSettings };
             this.resolveInitialization();
             return;
        }

        console.log(`SettingsHandler (Target: ${this.targetHostname}): Attempting to send GET_INITIAL_SETTINGS.`);
        try {
            // Ensure your MessageType in types.ts includes GET_INITIAL_SETTINGS
            // and your background message handler (the code you just posted)
            // actually handles GET_INITIAL_SETTINGS.
            const response = await chrome.runtime.sendMessage({
                type: "GET_INITIAL_SETTINGS",
                hostname: this.targetHostname,
            });

            console.log(`SettingsHandler (Target: ${this.targetHostname}): GET_INITIAL_SETTINGS response received:`, response);

            if (response && response.success && response.settings) {
                this.currentSettings = response.settings;
                console.log(`SettingsHandler (Target: ${this.targetHostname}): Applied initial settings:`, JSON.stringify(this.currentSettings));
            } else {
                this.currentSettings = { ...defaultSettings };
                console.warn(`SettingsHandler (Target: ${this.targetHostname}): No valid settings in response. Using defaults. Response:`, response);
            }
        } catch (error) {
            this.currentSettings = { ...defaultSettings };
            console.error(`SettingsHandler (Target: ${this.targetHostname}): Error during GET_INITIAL_SETTINGS:`, error, "Using defaults.");
        } finally {
            this.resolveInitialization();
        }
    }

    async ensureInitialized(): Promise<void> {
        return this.initializationComplete;
    }

    getCurrentSettings(): AudioSettings {
        return { ...this.currentSettings }; // Return a copy
    }

    updateSettings(settings: AudioSettings): void {
        console.log(`SettingsHandler (Target: ${this.targetHostname}): Settings updated locally`, settings);
        this.currentSettings = { ...settings }; // Store a copy
    }

    resetToDefault(): void {
        this.currentSettings = { ...defaultSettings };
    }

    needsAudioProcessing(): boolean {
        const defaults = defaultSettings;
        return !(
            this.currentSettings.volume === defaults.volume &&
            this.currentSettings.bassBoost === defaults.bassBoost &&
            this.currentSettings.voiceBoost === defaults.voiceBoost &&
            this.currentSettings.mono === defaults.mono
            // speed is not an audio processing effect controlled by AudioContext nodes here
        );
    }
}