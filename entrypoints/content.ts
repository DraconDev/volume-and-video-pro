import { defineContentScript } from "wxt/sandbox";
import { MediaProcessor } from "./../src/media-processor";
import { SettingsHandler } from "../src/settings-handler";
import { MessageType, UpdateSettingsMessage } from "../src/types";

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true, // Add this line
  runAt: "document_idle", // Changed from document_start
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
      const resumeContextHandler = async (event: Event) => {
        console.log(
          "Content: Media interaction detected, attempting to resume AudioContext."
        );
        await mediaProcessor.attemptContextResume();
        console.log(
          "Content: Context potentially resumed, applying audio effects..."
        );
        const targetElement = event.target as HTMLMediaElement;
        if (targetElement) {
          try {
            // Ensure settings are initialized before applying effects
            await settingsHandler.ensureInitialized();
            const currentSettings = settingsHandler.getCurrentSettings();
            const needsProcessing = settingsHandler.needsAudioProcessing();
            console.log(
              `[ContentScript DEBUG] Applying audio effects for played element ${
                targetElement.src || "(no src)"
              } with settings:`,
              JSON.stringify(currentSettings)
            );
            // Apply audio effects specifically to the played element
            await mediaProcessor.processMediaElements(
              [targetElement],
              currentSettings,
              needsProcessing
            );
          } catch (error) {
            console.error(
              `Content: Error applying audio effects after context resume for ${
                targetElement.src || "(no src)"
              }:`,
              error
            );
          }
        }
      };
      // --- End AudioContext Resume Handler ---

      // Function to apply settings to a single media element
      const applySettingsToSingleElement = async (
        element: HTMLMediaElement
      ) => {
        console.log(
          `[ContentScript DEBUG] applySettingsToSingleElement called for ${
            element.src || "(no src)"
          }`
        );
        try {
          // Ensure settings are initialized
          await settingsHandler.ensureInitialized();
          const currentSettings = settingsHandler.getCurrentSettings();
          const needsProcessing = settingsHandler.needsAudioProcessing();

          console.log(
            `[ContentScript DEBUG] Applying settings to single element ${
              element.src || "(no src)"
            }:`,
            JSON.stringify(currentSettings)
          );

          // Apply immediate settings (speed, volume)
          mediaProcessor.applySettingsImmediately([element], currentSettings);

          // Apply audio effects if needed
          if (needsProcessing) {
            // Check if context is ready or can be resumed
            if (mediaProcessor.canApplyAudioEffects()) {
              console.log(
                `[ContentScript DEBUG] AudioContext ready for ${
                  element.src || "(no src)"
                }, applying audio effects.`
              );
              await mediaProcessor.processMediaElements(
                [element],
                currentSettings,
                needsProcessing
              );
            } else {
              console.log(
                `[ContentScript DEBUG] AudioContext not ready for ${
                  element.src || "(no src)"
                }. Attempting to resume and apply effects.`
              );
              // Attempt to resume context (requires user gesture)
              await mediaProcessor.attemptContextResume();
              // Check again after attempting resume
              if (mediaProcessor.canApplyAudioEffects()) {
                console.log(
                  `[ContentScript DEBUG] AudioContext resumed for ${
                    element.src || "(no src)"
                  }, applying audio effects.`
                );
                await mediaProcessor.processMediaElements(
                  [element],
                  currentSettings,
                  needsProcessing
                );
              } else {
                console.log(
                  `[ContentScript DEBUG] AudioContext still not ready for ${
                    element.src || "(no src)"
                  }, audio effects will apply on play gesture.`
                );
              }
            }
          }
        } catch (error) {
          console.error(
            `[ContentScript DEBUG] Error applying settings to single element ${
              element.src || "(no src)"
            }:`,
            error
          );
        }
      };

      // Process media with current settings (Moved inside initializeScript)
      const processMedia = async () => {
        console.log(
          `[ContentScript DEBUG] processMedia called for ${window.location.hostname}`
        );
        try {
          console.time("ensureInitialized"); // Start timing
          await settingsHandler.ensureInitialized();
          console.timeEnd("ensureInitialized"); // End timing on success
          console.log(
            `[ContentScript DEBUG] Settings initialized successfully in processMedia for ${window.location.hostname}. Current settings:`,
            JSON.stringify(settingsHandler.getCurrentSettings())
          );
        } catch (error) {
          console.timeEnd("ensureInitialized"); // End timing on failure
          console.error(
            `[ContentScript DEBUG] Error ensuring settings initialized in processMedia for ${window.location.hostname}:`,
            error
          );
          return false; // Indicate failure
        }

        // --- Start of processing steps after successful initialization ---
        try {
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
            // Remove previous listeners to prevent duplicates
            element.removeEventListener(
              "play",
              resumeContextHandler as EventListener
            ); // Cast to EventListener
            element.removeEventListener("loadedmetadata", (event) =>
              applySettingsToSingleElement(event.target as HTMLMediaElement)
            ); // Correct listener
            element.removeEventListener("canplay", (event) =>
              applySettingsToSingleElement(event.target as HTMLMediaElement)
            ); // Correct listener

            // Add listeners
            element.addEventListener(
              "play",
              resumeContextHandler as EventListener,
              {
                // Cast to EventListener
                once: false, // Changed from true to allow multiple triggers
              }
            );
            element.addEventListener("loadedmetadata", (event) =>
              applySettingsToSingleElement(event.target as HTMLMediaElement)
            ); // Correct listener
            element.addEventListener("canplay", (event) =>
              applySettingsToSingleElement(event.target as HTMLMediaElement)
            ); // Correct listener

            // Add loadstart listener for dynamically loaded videos
            element.addEventListener("loadstart", () => {
              console.log(
                `[ContentScript] loadstart detected on ${
                  element.src || "(no src)"
                }, reapplying settings`
              );
              // Reapply settings when new media starts loading
              applySettingsToSingleElement(element);
            });

            // Apply settings immediately to the element after adding listeners.
            // This handles elements present on initial load and newly added elements.
            applySettingsToSingleElement(element);

            // Removed the specific check for HAVE_METADATA and applySettingsImmediately here,
            // as applySettingsToSingleElement already handles immediate settings application.

            // Removed auto-play attempt to avoid interfering with user interactions
            // Settings will be applied when user manually plays the video via the play event listener
          });

          // The loop above now applies settings to all found elements immediately.
          // The following line is redundant and can be removed.
          // console.log(
          //   `[ContentScript] Applying settings to all elements immediately for ${window.location.hostname}`
          // );
          // mediaProcessor.applySettingsImmediately(
          //   mediaElements,
          //   settingsHandler.getCurrentSettings()
          // );
        } catch (processingError) {
          console.error(
            `[ContentScript DEBUG] Error during media processing steps on ${window.location.hostname} (after initialization succeeded):`,
            processingError
          );
          // Do not return false here, as initialization itself succeeded.
        }
        // --- End of processing steps ---

        return true; // Indicate initialization success, regardless of processing errors
      };

      // Initialize with debouncing (Moved inside initializeScript)
      let initializationTimeout: number | null = null;

      const debouncedInitialization = () => {
        // Reverted to non-async as it uses setTimeout
        if (initializationTimeout) {
          window.clearTimeout(initializationTimeout);
        }
        initializationTimeout = window.setTimeout(async () => {
          // Use setTimeout
          try {
            console.log(
              `[ContentScript DEBUG] Debounced initialization for ${window.location.hostname}. Calling processMedia after delay.`
            );
            await processMedia(); // processMedia handles its own errors and returns boolean for init success
          } catch (error) {
            // This catch is for unexpected errors from processMedia if it doesn't handle something
            console.error(
              `Content: Error during debounced initialization on ${window.location.hostname}:`,
              error
            );
          }
        }, 200); // Single, moderate delay (200ms)
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
              "Content: Settings updated via message, forcing audio effects update and reprocessing media elements..."
            );
            (async () => {
              try {
                // Force update audio effects on existing context
                await mediaProcessor.forceAudioEffectsUpdate(message.settings);

                // Apply settings immediately to all existing media elements
                const mediaElements = mediaProcessor.findMediaElements();
                console.log(
                  `[ContentScript Listener] Found ${mediaElements.length} media elements to update immediately.`
                );
                for (const element of mediaElements) {
                  await applySettingsToSingleElement(element);
                }
              } catch (error) {
                console.error(
                  "Content: Error during settings update processing:",
                  error
                );
              }
            })();
          }
          return false;
        }
      );

      // Initial setup (Moved inside initializeScript)
      // Apply settings immediately on DOM ready or if already ready
      const applyInitialSettings = async () => {
        console.log(
          `[ContentScript DEBUG] Applying initial settings for ${window.location.hostname}`
        );
        await processMedia(); // processMedia handles finding elements and applying settings
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyInitialSettings);
      } else {
        applyInitialSettings();
      }

      // Watch for dynamic changes (Moved inside initializeScript)
      mediaProcessor.setupMediaObserver(async () => {
        await processMedia();
      });
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
      }, 10000); // 10 second timeout
    }
  },
});
