// src/settings-handler.ts

import { AudioSettings, defaultSettings } from "./types"; // Adjust path to types.ts if needed

export class SettingsHandler {
    private currentSettings: AudioSettings;
    private targetHostname: string | null = null;
    private initializationComplete: Promise<void>;
    private resolveInitialization!: () => void; // Definite assignment assertion

    constructor() {
        this.currentSettings = { ...defaultSettings }; // Start with defaults
        this.initializationComplete = new Promise((resolve) => {
            this.resolveInitialization = resolve;
        });
        // console.log("SettingsHandler instance created");
    }

    /**
     * Initializes the handler by requesting the correct settings
     * for the target hostname from the background script.
     * @param hostname The hostname to fetch settings for (ideally top-level).
     */
    async initialize(hostname: string): Promise<void> {
        this.targetHostname = hostname;
        // console.log(`SettingsHandler (Target: ${this.targetHostname}): Initializing...`);

        if (!this.targetHostname) {
             console.error(`SettingsHandler: Initialization aborted - no valid target hostname provided for ${this.targetHostname}.`);
             this.currentSettings = { ...defaultSettings };
             this.resolveInitialization();
             return;
        }

        // console.log(`SettingsHandler (Target: ${this.targetHostname}): Attempting to send GET_INITIAL_SETTINGS.`);
        try {
            const response = await chrome.runtime.sendMessage({
                type: "GET_INITIAL_SETTINGS", // This type must be handled by your background message handler
                hostname: this.targetHostname,
            });

            // console.log(`SettingsHandler (Target: ${this.targetHostname}): GET_INITIAL_SETTINGS response received:`, response);

            if (response && response.success && response.settings) {
                this.currentSettings = response.settings;
                // console.log(`SettingsHandler (Target: ${this.targetHostname}): Successfully applied initial settings from background:`, JSON.stringify(this.currentSettings));
            } else {
                this.currentSettings = { ...defaultSettings };
                console.warn(`SettingsHandler (Target: ${this.targetHostname}): No valid settings in response or response was unsuccessful. Using defaults. Response:`, response);
            }
        } catch (error) {
            this.currentSettings = { ...defaultSettings };
            console.error(`SettingsHandler (Target: ${this.targetHostname}): Error during GET_INITIAL_SETTINGS sendMessage or processing:`, error, "Using defaults.");
        } finally {
            // console.log(`SettingsHandler (Target: ${this.targetHostname}): Initialization promise resolving. Final currentSettings:`, JSON.stringify(this.currentSettings));
            this.resolveInitialization(); // Signal that initialization is done
        }
    }

    /**
     * Returns a promise that resolves once initial settings have been
     * fetched (or failed to fetch) from the background script.
     */
    async ensureInitialized(): Promise<void> {
        // console.log(`SettingsHandler (Target: ${this.targetHostname}): ensureInitialized called.`);
        return this.initializationComplete;
    }

    /**
     * Gets the currently loaded settings. Returns a copy to prevent external modification.
     */
    getCurrentSettings(): AudioSettings {
        // console.log(`SettingsHandler (Target: ${this.targetHostname}): getCurrentSettings returning:`, this.currentSettings);
        return { ...this.currentSettings };
    }

    /**
     * Updates settings locally. Should primarily be used when receiving
     * updates from the background script via messages. Stores a copy.
     */
    updateSettings(settings: AudioSettings): void {
        // console.log(`SettingsHandler (Target: ${this.targetHostname}): Settings updated directly with:`, settings);
        this.currentSettings = { ...settings };
    }

    /**
     * Resets settings to the application defaults locally.
     */
    resetToDefault(): void {
        this.currentSettings = { ...defaultSettings };
    }

    /**
     * Determines if audio processing (effects beyond basic volume/speed) is needed based on current settings.
     */
    needsAudioProcessing(): boolean {
        const defaults = defaultSettings;
        // Audio processing is needed if any relevant setting deviates from default OR if volume > 100%
        const needsProcessing = (
            this.currentSettings.bassBoost !== defaults.bassBoost ||
            this.currentSettings.voiceBoost !== defaults.voiceBoost ||
            this.currentSettings.mono !== defaults.mono ||
            this.currentSettings.volume > 100 // Volume boost requires the GainNode
        );
        // console.log(`SettingsHandler (Target: ${this.targetHostname}): needsAudioProcessing = ${needsProcessing}. Current Volume: ${this.currentSettings.volume}`);
        return needsProcessing;
    }
}