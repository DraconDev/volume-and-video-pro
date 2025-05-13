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

    // Function to initialize settings and the rest of the script logic
    const initializeScript = async (hostname: string) => {
      console.log(
        `[ContentScript] Initializing script for hostname: ${hostname}`
      );
      settingsHandler.initialize(hostname); // Initialize with the correct hostname

      // --- AudioContext Resume Handler --- (Moved inside initializeScript)
      const resumeContextHandler = async () => {
        console.log(
          "Content: Media interaction detected, attempting to resume AudioContext."
        );
        await mediaProcessor.attemptContextResume();
        console.log(
          "Content: Context potentially resumed, reprocessing media..."
        );
        await processMedia();
      };
      // --- End AudioContext Resume Handler ---

      // Process media with current settings (Moved inside initializeScript)
      const processMedia = async () => {
        console.log(
          `[ContentScript DEBUG] processMedia called for ${window.location.hostname}`
        );
        try {
          await settingsHandler.ensureInitialized();
          console.log(`[ContentScript DEBUG] Settings initialized successfully in processMedia for ${window.location.hostname}. Current settings:`, JSON.stringify(settingsHandler.getCurrentSettings()));
        } catch (error) {
          console.error(`[ContentScript DEBUG] Error ensuring settings initialized in processMedia for ${window.location.hostname}:`, error);
          return false; // Indicate failure
        }

        const mediaElements = mediaProcessor.findMediaElements();
        console.log(
          `[ContentScript DEBUG] Found ${mediaElements.length} media elements:`,
          mediaElements.map((el) => ({
            src: el.src,
            tagName: el.tagName,
            id: el.id,
            classList: el.classList.toString(),
          }))
        );

        mediaElements.forEach((element) => {
          element.removeEventListener("play", resumeContextHandler); // Remove previous listener if any
          element.addEventListener("play", resumeContextHandler, {
            once: true,
          });
        });

        const currentSettings = settingsHandler.getCurrentSettings();
        const needsProcessing = settingsHandler.needsAudioProcessing();
        console.log(
          "Content: Processing media with settings:",
          currentSettings,
          "needsProcessing:",
          needsProcessing
        );
        console.log(
          "[ProcessMedia] Applying settings:",
          JSON.stringify(currentSettings)
        );
        await mediaProcessor.processMediaElements(
          mediaElements,
          currentSettings,
          needsProcessing
        );
        return true; // Indicate success
      };

      // Initialize with debouncing (Moved inside initializeScript)
      let initialAttemptTimeoutId: number | null = null;
      let fallbackAttemptTimeoutId: number | null = null;
      let fallbackScheduled = false;

      const debouncedInitialization = () => {
        if (initialAttemptTimeoutId) {
          window.clearTimeout(initialAttemptTimeoutId);
        }
        if (fallbackAttemptTimeoutId) {
          window.clearTimeout(fallbackAttemptTimeoutId);
        }
        fallbackScheduled = false; // Reset fallback flag

        initialAttemptTimeoutId = window.setTimeout(async () => {
          try {
            console.log(`[ContentScript DEBUG] Initial debounced attempt for ${window.location.hostname}. Calling processMedia.`);
            const success = await processMedia();
            if (!success && !fallbackScheduled) {
              fallbackScheduled = true; // Set flag to prevent multiple fallbacks
              console.log(`[ContentScript DEBUG] Initial attempt failed for ${window.location.hostname}. Scheduling fallback.`);
              fallbackAttemptTimeoutId = window.setTimeout(async () => {
                try {
                  console.log(`[ContentScript DEBUG] Fallback attempt for ${window.location.hostname}. Calling processMedia.`);
                  await processMedia(); // Final attempt
                } catch (error) {
                  console.error(`Content: Error during fallback delayed initialization on ${window.location.hostname}:`, error);
                }
              }, 1200); // Fallback delay
            }
          } catch (error) {
            // This catch is for errors thrown by processMedia itself, not just ensureInitialized
            console.error(`Content: Error during initial debounced initialization attempt on ${window.location.hostname}:`, error);
          }
        }, 50); // Initial short delay
      };

      // Listen for settings updates from the background script (Moved inside initializeScript)
      chrome.runtime.onMessage.addListener(
        (message: MessageType, sender, sendResponse) => {
          console.log(
            "[ContentScript Listener] Received message:",
            JSON.stringify(message)
          );
          if (message.type === "UPDATE_SETTINGS") {
            console.log(
              "[ContentScript Listener] Processing UPDATE_SETTINGS from background/popup"
            );
            console.log(
              "Content: Applying settings update received via message."
            );
            settingsHandler.updateSettings(message.settings);
            console.log(
              "Content: Settings updated via message, reprocessing media elements..."
            );
            processMedia().catch((error) => {
              console.error(
                "Content: Error during processMedia after settings update:",
                error
              );
            });
          }
          return false;
        }
      );

      // Initial setup (Moved inside initializeScript)
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", debouncedInitialization);
      } else {
        debouncedInitialization();
      }

      // Watch for dynamic changes (Moved inside initializeScript)
      mediaProcessor.setupMediaObserver(processMedia);
    }; // End of initializeScript function

    // --- Hostname Detection and Initialization Logic ---
    if (window.self === window.top) {
      // --- Running in the TOP window ---
      const topHostname = window.location.hostname;
      console.log(
        `[ContentScript] Running in TOP window. Hostname: ${topHostname}`
      );
      initializeScript(topHostname); // Initialize for the top window

      // Listen for requests from iframes
      window.addEventListener("message", (event: MessageEvent) => {
        // Basic security check - could be enhanced by checking event.origin
        if (
          event.source &&
          event.data &&
          event.data.type === "REQUEST_TOP_HOSTNAME"
        ) {
          console.log(
            `[ContentScript Top] Received hostname request from an iframe. Responding with: ${topHostname}`
          );
          // Respond directly to the iframe that sent the message
          (event.source as Window).postMessage(
            { type: "TOP_HOSTNAME_INFO", hostname: topHostname },
            "*"
          ); // Use '*' for simplicity, restrict if needed
        }
      });
    } else {
      // --- Running in an IFRAME ---
      console.log(
        `[ContentScript] Running in IFRAME. Own hostname: ${window.location.hostname}. Requesting hostname from top...`
      );
      let receivedHostname = false;
      let fallbackTimeout: number | null = null;

      // Listener for the response from the top window
      const responseListener = (event: MessageEvent) => {
        // Basic security check - could be enhanced by checking event.origin against window.top.origin (if accessible)
        if (
          event.source === window.top &&
          event.data &&
          event.data.type === "TOP_HOSTNAME_INFO" &&
          event.data.hostname
        ) {
          receivedHostname = true;
          if (fallbackTimeout) clearTimeout(fallbackTimeout); // Cancel fallback timeout
          console.log(
            `[ContentScript iFrame] Received hostname from top: ${event.data.hostname}`
          );
          window.removeEventListener("message", responseListener); // Clean up listener
          initializeScript(event.data.hostname); // Initialize with received hostname
        }
      };
      window.addEventListener("message", responseListener);

      // Request the hostname from the top window
      if (window.top) {
        window.top.postMessage({ type: "REQUEST_TOP_HOSTNAME" }, "*"); // Use '*' for simplicity
      } else {
        console.error(
          "[ContentScript iFrame] window.top is null, cannot request hostname."
        );
        // Initialize with own hostname immediately if top is inaccessible
        initializeScript(window.location.hostname);
        return; // Exit early
      }

      // Fallback timeout in case the message never arrives
      fallbackTimeout = window.setTimeout(() => {
        if (!receivedHostname) {
          console.warn(
            `[ContentScript iFrame] Did not receive hostname from top after timeout. Falling back to own hostname: ${window.location.hostname}`
          );
          window.removeEventListener("message", responseListener); // Clean up listener
          initializeScript(window.location.hostname); // Initialize with own hostname as fallback
        }
      }, 3000); // 3 second timeout (reduced from 5)
    }

  },
});
