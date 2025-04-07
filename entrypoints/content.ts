import { defineContentScript } from "wxt/sandbox";
import { MediaProcessor } from "./../src/media-processor";
import { SettingsHandler } from "../src/settings-handler";
import { MessageType, UpdateSettingsMessage } from "../src/types";

export default defineContentScript({
    matches: ["<all_urls>"],
    allFrames: true, // Add this line
    runAt: "document_start", // Add this line
    main: async () => {
        console.log(
            "Content: Script starting - This log should always appear",
            window.location.href
        );

        // Initialize core components
        const settingsHandler = new SettingsHandler();
        const mediaProcessor = new MediaProcessor();

        // Process media with current settings
        const processMedia = async () => {
            console.log("Content: processMedia called");
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
            }, 100); // Reduced initial delay from 1000ms
        };

        // Listen for settings updates from the background script
        chrome.runtime.onMessage.addListener(
            async (message: MessageType, sender, sendResponse) => {
                if (message.type === "UPDATE_SETTINGS") {
                    const updateSettingsMessage = message as UpdateSettingsMessage;
                    console.log(
                        "Content: Received settings update:",
                        updateSettingsMessage.settings
                    );

                    // Update internal settings
                    settingsHandler.updateSettings(updateSettingsMessage.settings);

                    // Apply settings update with proper logging
                    console.log("Content: Processing settings update", {
                        settings: updateSettingsMessage.settings,
                        isGlobal: updateSettingsMessage.isGlobal,
                        enabled: updateSettingsMessage.enabled
                    });

                    // Update settings without resetting audio context
                    await processMedia();
                }
                // Keep message channel open for async response
                return true;
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
