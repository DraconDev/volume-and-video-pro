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

    // --- AudioContext Resume Handler ---
    // This function will be called once when the user interacts with a media element
    const resumeContextHandler = async () => {
        console.log("Content: Media interaction detected, attempting to resume AudioContext.");
        // Attempt to resume the context via MediaProcessor -> AudioProcessor
        // No need to remove listeners here as we use { once: true } below
        await mediaProcessor.attemptContextResume();
    };
    // --- End AudioContext Resume Handler ---

    // Process media with current settings
    const processMedia = async () => {
        console.log("Content: processMedia called");
        const mediaElements = mediaProcessor.findMediaElements();
        console.log("Content: Found media elements:", mediaElements.length);

        // Attach interaction listeners to each media element to resume AudioContext
        mediaElements.forEach(element => {
            // Use { once: true } so the listener fires only once per event type per element
            element.addEventListener('play', resumeContextHandler, { once: true });
            element.addEventListener('click', resumeContextHandler, { once: true });
            element.addEventListener('mousedown', resumeContextHandler, { once: true });
            // 'touchstart' could also be added if needed for mobile
        });

        const currentSettings = settingsHandler.getCurrentSettings();
        const needsProcessing = settingsHandler.needsAudioProcessing();
        console.log(
            "Content: Processing media with settings:",
            currentSettings,
            "needsProcessing:",
            needsProcessing
        );
        // Apply settings (speed is applied here, audio effects setup happens here too)
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
          console.error("Content: Error during delayed initialization:", error);
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

          // Explicitly update the SettingsHandler with the new settings
          settingsHandler.updateSettings(updateSettingsMessage.settings);

          // Now, re-run processMedia to apply the new settings
          console.log("Content: Settings updated via message, reprocessing media elements...");
          await processMedia();
        }
        // Keep message channel open for async response
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
    mediaProcessor.setupMediaObserver(processMedia);
  },
});
