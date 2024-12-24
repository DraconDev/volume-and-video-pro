import { MediaProcessor } from "@/src/media-processor";
import { MessageHandler } from "@/src/message-handler";
import { SettingsHandler } from "@/src/settings-handler";
import { settingsManager } from "@/src/settings-manager";
import { MessageType, AudioSettings } from "@/src/types";

export default defineContentScript({
    matches: ["<all_urls>"],
    main: async () => {
        console.log("Content: Script starting");

        // Initialize core components
        const settingsHandler = new SettingsHandler();
        const mediaProcessor = new MediaProcessor();

        // Process media with current settings
        const processMedia = async () => {
            const mediaElements = mediaProcessor.findMediaElements();
            console.log("Content: Found media elements:", mediaElements.length);
            const currentSettings = settingsHandler.getCurrentSettings();
            const needsProcessing = settingsHandler.needsAudioProcessing();
            console.log(
                "Content: Processing media with settings:",
                currentSettings,
                "needsProcessing:",
                needsProcessing
            );
            await mediaProcessor.processMediaElements(
                mediaElements,
                currentSettings,
                needsProcessing
            );
        };

        // Initialize with debouncing
        let initializationTimeout: number | null = null;
        const debouncedInitialization = () => {
            if (initializationTimeout) {
                window.clearTimeout(initializationTimeout);
            }

            initializationTimeout = window.setTimeout(async () => {
                try {
                    await settingsHandler.initialize();
                    await processMedia();
                } catch (error) {
                    console.error(
                        "Content: Error during delayed initialization:",
                        error
                    );
                }
            }, 1000);
        };

        // Setup message handler
        new MessageHandler({
            onSettingsUpdate: async (message: MessageType) => {
                if (message.mode === "default") {
                    settingsHandler.resetToDefault();
                    await mediaProcessor.resetToDefault();
                } else if (message.settings) {
                    settingsHandler.updateSettings(message.settings);
                    await processMedia();
                }
            },
        });

        // Debounce settings updates
        let settingsUpdateTimeout: number | null = null;
        const debouncedProcessMedia = () => {
            if (settingsUpdateTimeout) {
                clearTimeout(settingsUpdateTimeout);
            }
            settingsUpdateTimeout = window.setTimeout(async () => {
                await processMedia();
            }, 250); // 250ms debounce time
        };

        // Listen for settings updates from settings manager
        settingsManager.on(
            "settingsUpdated",
            async (settings: AudioSettings) => {
                console.log("Content: Settings updated", settings);
                settingsHandler.updateSettings(settings);
                debouncedProcessMedia();
            }
        );

        // Initial setup
        if (document.readyState === "loading") {
            document.addEventListener(
                "DOMContentLoaded",
                debouncedInitialization
            );
        } else {
            debouncedInitialization();
        }

        // Watch for dynamic changes
        mediaProcessor.setupMediaObserver(processMedia);
    },
});
