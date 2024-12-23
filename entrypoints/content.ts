import { AudioSettings, defaultSettings, MessageType } from "@/src/types";
import { AudioProcessor } from "@/src/audio-processor";
import { MediaManager } from "@/src/media-manager";

export default defineContentScript({
    matches: ["<all_urls>"],
    main: async () => {
        console.log("Content: Script starting");

        // Initialize state
        let currentSettings: AudioSettings = defaultSettings;
        let isUsingGlobalSettings = true;
        const audioProcessor = new AudioProcessor();

        const initializeSettings = async () => {
            try {
                console.log("Content: Starting initialization");
                const storage = await chrome.storage.sync.get([
                    "globalSettings",
                    "siteSettings",
                ]);
                const hostname = window.location.hostname;

                // First check for site-specific settings
                if (storage.siteSettings?.[hostname]) {
                    currentSettings = storage.siteSettings[hostname];
                    isUsingGlobalSettings = false;
                    console.log("Content: Using site-specific settings");
                } else if (storage.globalSettings) {
                    currentSettings = storage.globalSettings;
                    isUsingGlobalSettings = true;
                    console.log("Content: Using global settings");
                } else {
                    currentSettings = defaultSettings;
                    isUsingGlobalSettings = true;
                    console.log("Content: Using default settings");
                }

                // Notify background script
                await chrome.runtime.sendMessage({
                    type: "CONTENT_SCRIPT_READY",
                    hostname: window.location.hostname,
                    usingGlobal: isUsingGlobalSettings,
                });

                console.log("Content: Initialization complete with settings:", {
                    settings: currentSettings,
                    isGlobal: isUsingGlobalSettings,
                });
            } catch (error) {
                console.error("Content: Error during initialization:", error);
                currentSettings = defaultSettings;
                isUsingGlobalSettings = true;
            }
        };

        // Update playback speed for a media element
        const updatePlaybackSpeed = (element: HTMLMediaElement) => {
            try {
                const wasPlaying = !element.paused;
                const currentTime = element.currentTime;

                if (currentSettings.speed !== 100) {
                    element.playbackRate = currentSettings.speed / 100;
                    element.defaultPlaybackRate = currentSettings.speed / 100;
                } else {
                    element.playbackRate = 1;
                    element.defaultPlaybackRate = 1;
                }

                // Restore state
                element.currentTime = currentTime;
                if (wasPlaying) {
                    element.play().catch(e => console.warn("Failed to resume playback:", e));
                }
            } catch (e) {
                console.error("Content: Error setting speed:", e);
            }
        };

        // Process all media elements
        const processMediaElements = async (mediaElements: HTMLMediaElement[]) => {
            // Update speed for all elements
            mediaElements.forEach(updatePlaybackSpeed);

            // Handle audio processing
            const needsAudioProcessing =
                currentSettings.volume !== 100 ||
                currentSettings.bassBoost !== 100 ||
                currentSettings.voiceBoost !== 100 ||
                currentSettings.mono;

            if (!needsAudioProcessing) {
                await audioProcessor.resetAllToDefault();
                return;
            }

            // Setup or update audio processing for each element
            for (const element of mediaElements) {
                try {
                    if (!audioProcessor.hasProcessing(element)) {
                        await audioProcessor.setupAudioContext(element, currentSettings);
                    }
                } catch (e) {
                    console.error("Content: Failed to process media element:", e);
                }
            }

            // Update effects for all elements
            await audioProcessor.updateAudioEffects(currentSettings);
        };

        // Initialize with debouncing
        let initializationTimeout: number | null = null;
        const debouncedInitialization = () => {
            if (initializationTimeout) {
                window.clearTimeout(initializationTimeout);
            }
            
            initializationTimeout = window.setTimeout(async () => {
                try {
                    await initializeSettings();
                    console.log("Content: Searching for media elements...");
                    const mediaElements = MediaManager.findMediaElements();
                    console.log("Content: Found media elements:", mediaElements.length);
                    await processMediaElements(mediaElements);
                } catch (error) {
                    console.error("Content: Error during delayed initialization:", error);
                }
            }, 1000);
        };

        // Setup message listener
        chrome.runtime.onMessage.addListener(
            (
                message: MessageType,
                _sender: chrome.runtime.MessageSender,
                sendResponse: (response?: any) => void
            ) => {
                if (message.type === "UPDATE_SETTINGS") {
                    console.log(
                        "Content: Received settings update:",
                        message.settings,
                        "Global:",
                        message.isGlobal,
                        "Mode:",
                        message.mode
                    );

                    (async () => {
                        try {
                            if (message.mode === "default") {
                                currentSettings = defaultSettings;
                                await audioProcessor.resetAllToDefault();
                            } else if (message.settings) {
                                currentSettings = message.settings;
                                const mediaElements = MediaManager.findMediaElements();
                                await processMediaElements(mediaElements);
                            }
                            sendResponse({ success: true });
                        } catch (error) {
                            console.error("Content: Error handling message:", error);
                            sendResponse({ success: false, error });
                        }
                    })();
                }
                return true;
            }
        );

        // Initial setup
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", debouncedInitialization);
        } else {
            debouncedInitialization();
        }

        // Watch for dynamic changes
        MediaManager.setupMediaElementObserver(async (elements) => {
            await processMediaElements(elements);
        });
    },
});
