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

        // Start fetching settings from background immediately
        settingsHandler.initialize();

        // --- User Gesture Handling for AudioContext ---
        let hasUserInteracted = false;
        const interactionEvents: (keyof DocumentEventMap)[] = ['click', 'keydown', 'touchstart', 'mousedown'];

        const handleFirstInteraction = async () => {
            if (hasUserInteracted) return;
            hasUserInteracted = true;
            console.log("Content: User interaction detected, attempting to resume AudioContext.");
            // Remove listeners after first interaction
            interactionEvents.forEach(event => {
                document.removeEventListener(event, handleFirstInteraction, { capture: true });
            });
            // Attempt to resume the context via MediaProcessor -> AudioProcessor
            await mediaProcessor.audioProcessor.tryResumeContext();
        };

        // Add listeners to detect the first interaction
        interactionEvents.forEach(event => {
            // Use capture phase to catch events early
            document.addEventListener(event, handleFirstInteraction, { capture: true, once: false });
        });
        // --- End User Gesture Handling ---

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
                    // Wait for settings to be fetched before processing media
                    await settingsHandler.ensureInitialized();
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

                    // SettingsHandler updates internally via its own listener now.
                    // We might need a way for SettingsHandler to notify content.ts
                    // to re-run processMedia if an update requires immediate action,
                    // but for now, rely on MutationObserver or subsequent events.
                    console.log("Content: Received settings update message (handled internally by SettingsHandler)");
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
