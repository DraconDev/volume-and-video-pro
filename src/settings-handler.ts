import { AudioSettings, defaultSettings } from "./types";

export class SettingsHandler {
    private currentSettings: AudioSettings;
    private hostname: string;
    private initializationComplete: Promise<void>;
    private resolveInitialization!: () => void; // Definite assignment assertion

    constructor() {
        this.currentSettings = { ...defaultSettings }; // Start with defaults
        this.hostname = window.location.hostname;
        this.initializationComplete = new Promise((resolve) => {
            this.resolveInitialization = resolve;
        });
        // Listener setup moved inside initialize to ensure it runs after first fetch
    }

    /**
     * Initializes the handler by requesting the correct settings
     * for the current page from the background script.
     */
    async initialize(): Promise<void> {
        console.log(`SettingsHandler (${this.hostname}): Requesting initial settings.`);
        try {
            const response = await chrome.runtime.sendMessage({
                type: "GET_INITIAL_SETTINGS",
                hostname: this.hostname,
            });

            if (response && response.settings) {
                console.log(`SettingsHandler (${this.hostname}): Received initial settings`, response.settings);
                this.currentSettings = response.settings;
            } else {
                console.warn(`SettingsHandler (${this.hostname}): No/invalid initial settings received, using defaults.`, response);
                this.currentSettings = { ...defaultSettings };
            }
        } catch (error) {
            console.error(`SettingsHandler (${this.hostname}): Error requesting initial settings:`, error, "Using defaults.");
            this.currentSettings = { ...defaultSettings };
        } finally {
            console.log(`SettingsHandler (${this.hostname}): Initialization complete.`);
            // Listener is no longer set up here; content.ts will handle updates
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
        // This method might be redundant if all updates come via the listener,
        // but keep it for now as content.ts uses it.
        console.log(`SettingsHandler (${this.hostname}): Settings updated directly`, settings);
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
