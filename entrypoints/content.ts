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
      console.log(
        "Content: Media interaction detected, attempting to resume AudioContext."
       );
       // Attempt to resume the context via MediaProcessor -> AudioProcessor
       await mediaProcessor.attemptContextResume();
       // After attempting resume, re-process media to ensure settings are applied
       // with the potentially now-running context.
       console.log("Content: Context potentially resumed, reprocessing media...");
       await processMedia(); // Add this call
     };
     // --- End AudioContext Resume Handler ---

    // Process media with current settings
    const processMedia = async () => {
      console.log("Content: processMedia called");
      const mediaElements = mediaProcessor.findMediaElements();
      console.log("Content: Found media elements:", mediaElements.length);

      // Attach interaction listeners to each media element to resume AudioContext
      mediaElements.forEach((element) => {
        // Use { once: true } so the listener fires only once per event type per element
        element.addEventListener("play", resumeContextHandler, { once: true });
        element.addEventListener("click", resumeContextHandler, { once: true });
        element.addEventListener("mousedown", resumeContextHandler, {
          once: true,
        });
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
      console.log(
        "[ProcessMedia] Applying settings:",
        JSON.stringify(currentSettings)
      ); // ADDED LOG
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
      (
        message: MessageType,
        sender: chrome.runtime.MessageSender, // Added explicit type
        sendResponse: (response?: any) => void // Added explicit type
      ) => {
        console.log(
          "[ContentScript Listener] Received message:",
          JSON.stringify(message)
        ); // Log ALL received messages

        if (message.type === "UPDATE_SETTINGS") {
          const updateSettingsMessage = message as UpdateSettingsMessage;
          console.log(
            "[ContentScript Listener] Processing UPDATE_SETTINGS from background/popup"
            // No longer strictly checking hostname here, assuming background sent it correctly
          );

          // Apply the update since SettingsEventHandler should have targeted correctly
          console.log("Content: Applying settings update received via message.");
          settingsHandler.updateSettings(updateSettingsMessage.settings);

          // Now, re-run processMedia to apply the new settings
          console.log("Content: Settings updated via message, reprocessing media elements...");
           processMedia().catch(error => {
               console.error("Content: Error during processMedia after settings update:", error);
           });
        }
        // Return false or undefined if not sending an async response
        return false;
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
