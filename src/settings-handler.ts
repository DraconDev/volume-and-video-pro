import { AudioSettings, defaultSettings } from "./types";

export class SettingsHandler {
    private currentSettings: AudioSettings;
    private targetHostname: string | null = null; // Store the hostname we should use
    private initializationComplete: Promise<void>;
    private resolveInitialization!: () => void; // Definite assignment assertion

    constructor() {
        this.currentSettings = { ...defaultSettings }; // Start with defaults
        // Don't set hostname here, wait for initialize
        this.initializationComplete = new Promise((resolve) => {
            this.resolveInitialization = resolve;
        });
    }

    /**
     * Initializes the handler by requesting the correct settings
     * for the target hostname from the background script.
     * @param hostname The hostname to fetch settings for (ideally top-level).
     */
    async initialize(hostname: string): Promise<void> {
        this.targetHostname = hostname; // Store the target hostname
        console.log(`SettingsHandler (Target: ${this.targetHostname}): Requesting initial settings.`);
        if (!this.targetHostname) {
             console.error("SettingsHandler: Initialization attempted without a valid target hostname.");
             this.currentSettings = { ...defaultSettings };
             this.resolveInitialization();
             return;
        }
        try {
            const response = await chrome.runtime.sendMessage({
                type: "GET_INITIAL_SETTINGS",
                hostname: this.targetHostname, // Use the provided hostname
            });

            if (response && response.settings) {
                console.log(`SettingsHandler (Target: ${this.targetHostname}): Received initial settings`, response.settings);
                this.currentSettings = response.settings;
            } else {
                console.warn(`SettingsHandler (Target: ${this.targetHostname}): No/invalid initial settings received, using defaults.`, response);
                this.currentSettings = { ...defaultSettings };
            }
        } catch (error) {
            console.error(`SettingsHandler (Target: ${this.targetHostname}): Error requesting initial settings:`, error, "Using defaults.");
            this.currentSettings = { ...defaultSettings };
        } finally {
            console.log(`SettingsHandler (Target: ${this.targetHostname}): Initialization complete.`);
            this.resolveInitialization(); // Signal that initialization is done
        }
    }

    /**
     * Returns a promise that resolves once initial settings have been
     * fetched (or failed to fetch) from the background script.
     */
    async ensureInitialized(): Promise<void> {
        return this.initializationComplete;
    }

    /**
     * Gets the currently loaded settings.
     */
    getCurrentSettings(): AudioSettings {
        return this.currentSettings;
    }

    /**
     * Updates settings locally. Should primarily be used when receiving
     * updates from the background script via messages.
     */
    updateSettings(settings: AudioSettings): void {
        console.log(`SettingsHandler (Target: ${this.targetHostname}): Settings updated directly`, settings);
        this.currentSettings = settings;
    }

    /**
     * Resets settings to the application defaults locally.
     */
    resetToDefault(): void {
        this.currentSettings = { ...defaultSettings };
    }

    /**
     * Determines if audio processing is needed based on current settings.
     */
    needsAudioProcessing(): boolean {
        // Check if settings are different from defaults, implying processing is needed
        const defaults = defaultSettings;
        const needsProcessing = !(
            this.currentSettings.volume === defaults.volume &&
            this.currentSettings.bassBoost === defaults.bassBoost &&
            this.currentSettings.voiceBoost === defaults.voiceBoost &&
            this.currentSettings.mono === defaults.mono
            // Add other relevant settings checks here if needed
        );
        // console.log(`SettingsHandler (${this.hostname}): needsAudioProcessing = ${needsProcessing}`);
        return needsProcessing;
    }
}
