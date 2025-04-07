import { AudioSettings, defaultSettings } from "./types";
// NOTE: Removed direct import of settingsManager

export class SettingsHandler {
    private currentSettings: AudioSettings;
    // isUsingGlobalSettings might become less relevant if background sends effective settings
    // private isUsingGlobalSettings: boolean;
    private hostname: string;
    private initializationComplete: Promise<void>; // Promise to track initialization
    private resolveInitialization: () => void = () => {}; // Resolver for the promise

    constructor() {
        this.currentSettings = { ...defaultSettings }; // Start with defaults
        // this.isUsingGlobalSettings = true; // Assume global initially
        this.hostname = window.location.hostname;
        this.initializationComplete = new Promise((resolve) => {
            this.resolveInitialization = resolve;
        });
        // Setup listener for updates *after* initial settings are received
        this.setupUpdateListener();
    }

    /**
     * Initializes the handler by requesting the correct settings
     * for the current page from the background script.
     */
    async initialize(): Promise<void> {
        console.log("SettingsHandler: Requesting initial settings for", this.hostname);
        try {
            // Send message to background to get settings for this hostname
            const response = await chrome.runtime.sendMessage({
                type: "GET_INITIAL_SETTINGS",
                hostname: this.hostname,
            });

            if (response &amp;&amp; response.settings) {
                console.log("SettingsHandler: Received initial settings", response.settings);
                this.currentSettings = response.settings;
                // Optionally, background could also send the mode if needed
                // this.isUsingGlobalSettings = response.mode === 'global';
            } else {
                console.warn("SettingsHandler: No/invalid initial settings received from background, using defaults.", response);
                this.currentSettings = { ...defaultSettings };
            }
        } catch (error) {
            console.error("SettingsHandler: Error requesting initial settings:", error, "Using defaults.");
            this.currentSettings = { ...defaultSettings };
            // We might still resolve, allowing the page to function with defaults
        } finally {
            console.log("SettingsHandler: Initialization complete.");
            this.resolveInitialization(); // Signal that initialization is done
        }
    }

    /**
     * Returns a promise that resolves once initial settings have been
     * fetched from the background script.
     */
    async ensureInitialized(): Promise<void> {
        return this.initializationComplete;
    }

    /**
     * Sets up the listener for settings updates pushed from the background script.
     */
    private setupUpdateListener(): void {
         chrome.runtime.onMessage.addListener(
            (message: any, sender, sendResponse) => {
                // Only process updates specifically for this host pushed from background
                if (message.type === "UPDATE_SETTINGS" &amp;&amp; message.hostname === this.hostname) {
                     console.log("SettingsHandler: Received settings update via message", message.settings);
                     this.currentSettings = message.settings;
                     // TODO: Potentially trigger processMedia or notify content.ts
                     // This depends on how content.ts handles updates now
                }
                // Indicate async response potentially needed (good practice)
                // return true;
            }
        );
    }

    getCurrentSettings(): AudioSettings {
        // No change needed here, just returns the current state
        return this.currentSettings;
    }

    // This might be removed if background always sends effective settings
    // isGlobal(): boolean {
    //     return this.isUsingGlobalSettings;
    // }

    /**
     * Updates settings locally. Use with caution, updates should ideally
     * come from the background script via messages.
     */
    updateSettings(settings: AudioSettings): void {
        console.warn("SettingsHandler: updateSettings called directly. Prefer updates via background messages.");
        this.currentSettings = settings;
    }

    resetToDefault(): void {
        this.currentSettings = { ...defaultSettings };
    }

    /**
     * Determines if audio processing is needed based on current settings.
     * TODO: Refine this logic if background provides enabled/disabled state.
     */
    needsAudioProcessing(): boolean {
        // For now, assume processing is always needed if script is running
        // Check if settings are effectively "disabled" (e.g., all boosts/volume at default/100)
        const defaults = defaultSettings;
        return !(
            this.currentSettings.volume === defaults.volume &amp;&amp;
            this.currentSettings.bassBoost === defaults.bassBoost &amp;&amp;
            this.currentSettings.voiceBoost === defaults.voiceBoost &amp;&amp;
            this.currentSettings.mono === defaults.mono
            // Add other relevant settings checks here if needed
        );
    }

    // Removed setupStorageListener - don't listen to storage directly
}
