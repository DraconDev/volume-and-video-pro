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
      // Defined outside to allow consistent reference for add/remove event listeners
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

          // Use a WeakMap to store bound functions for each element to ensure stable references
          const elementListenerMap = new WeakMap<HTMLMediaElement, (event: Event) => Promise<void>>();

          mediaElements.forEach((element) => {
            let boundApplySettings = elementListenerMap.get(element);
            if (!boundApplySettings) {
              boundApplySettings = (event: Event) =>
                applySettingsToSingleElement(event.target as HTMLMediaElement);
              elementListenerMap.set(element, boundApplySettings);
            }

            // Remove previous listeners to prevent duplicates (now this will work correctly)
            element.removeEventListener(
              "play",
              resumeContextHandler as EventListener
            );
            element.removeEventListener("loadedmetadata", boundApplySettings);
            element.removeEventListener("canplay", boundApplySettings);
            element.removeEventListener("loadstart", boundApplySettings);

            // Add listeners
            element.addEventListener(
              "play",
              resumeContextHandler as EventListener,
              {
                once: false,
              }
            );
            element.addEventListener("loadedmetadata", boundApplySettings);
            element.addEventListener("canplay", boundApplySettings);
            element.addEventListener("loadstart", boundApplySettings);

            // Apply settings immediately to the element after adding listeners.
            applySettingsToSingleElement(element);
          });
        } catch (processingError) {
          console.error(
            `[ContentScript DEBUG] Error during media processing steps on ${window.location.hostname} (after initialization succeeded):`,
            processingError
          );
        }
        return true;
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
            // Ensure settingsHandler is initialized before applying the update
            (async () => {
              try {
                await settingsHandler.ensureInitialized(); // Wait for initialization
                settingsHandler.updateSettings(message.settings); // Update local settings cache

                const newSettings = settingsHandler.getCurrentSettings(); // Get the just-updated settings
                const needsProcessingNow =
                  settingsHandler.needsAudioProcessing(); // Check based on new settings

                console.log(
                  `Content: Settings updated via message. New effective settings: ${JSON.stringify(
                    newSettings
                  )}. Needs audio processing: ${needsProcessingNow}. Reprocessing media elements...`
                );

                // Get the list of currently managed media elements from MediaProcessor
                const managedMediaElements =
                  mediaProcessor.getManagedMediaElements();
                console.log(
                  `[ContentScript Listener] Found ${managedMediaElements.length} managed media elements to re-process with new settings.`
                );

                // Apply immediate settings (speed, volume) to all managed elements first
                if (managedMediaElements.length > 0) {
                  console.log(
                    `[ContentScript Listener] Applying immediate settings to ${managedMediaElements.length} managed elements.`
                  );
                  mediaProcessor.applySettingsImmediately(
                    managedMediaElements,
                    newSettings
                  );
                }

                // Then, process audio effects if needed
                if (needsProcessingNow) {
                  if (managedMediaElements.length > 0) {
                    console.log(
                      `[ContentScript Listener] Processing audio effects for ${managedMediaElements.length} managed elements.`
                    );
                    await mediaProcessor.processMediaElements(
                      managedMediaElements,
                      newSettings,
                      needsProcessingNow
                    );
                  } else {
                    console.log(
                      "[ContentScript Listener] No managed media elements found for audio effects. Attempting fallback to fresh scan."
                    );
                    const freshScanElements =
                      mediaProcessor.findMediaElements();
                    if (freshScanElements.length > 0) {
                      console.log(
                        `[ContentScript Listener] Fallback: Found ${freshScanElements.length} elements on fresh scan for audio effects. Processing them.`
                      );
                      mediaProcessor.applySettingsImmediately(
                        freshScanElements,
                        newSettings
                      ); // Apply immediate settings to fallback elements too
                      await mediaProcessor.processMediaElements(
                        freshScanElements,
                        newSettings,
                        needsProcessingNow
                      );
                    } else {
                      console.log(
                        "[ContentScript Listener] Fallback: No elements found on fresh scan either for audio effects."
                      );
                    }
                  }
                } else {
                  console.log(
                    "[ContentScript Listener] Audio effects not needed. Ensuring any existing processing for managed elements is disconnected/bypassed."
                  );
                  // If audio effects are turned off, ensure they are properly disconnected
                  if (managedMediaElements.length > 0) {
                    await mediaProcessor.processMediaElements(
                      managedMediaElements,
                      newSettings,
                      needsProcessingNow
                    );
                  } else {
                    const freshScanElements =
                      mediaProcessor.findMediaElements();
                    if (freshScanElements.length > 0) {
                      await mediaProcessor.processMediaElements(
                        freshScanElements,
                        newSettings,
                        needsProcessingNow
                      );
                    }
                  }
                }

                console.log(
                  "[ContentScript Listener] Finished applying settings and processing media elements after settings update."
                );
              } catch (error) {
                console.error(
                  "Content: Error during UPDATE_SETTINGS processing (after ensuring initialized):",
                  error
                );
              }
            })();
          }
          return false;
        }
      );

      // Initial setup (Moved inside initializeScript)
      // Apply settings after a short delay to allow the host page to initialize
      const applyInitialSettings = () => {
        // No longer async itself, schedules async work
        console.log(
          `[ContentScript DEBUG] Scheduling initial settings application for ${window.location.hostname}`
        );
        setTimeout(async () => {
          console.log(
            `[ContentScript DEBUG] Applying initial settings for ${window.location.hostname} (after 500ms delay)`
          );
          await processMedia(); // processMedia handles finding elements and applying settings
        }, 500); // Increased delay to 500 milliseconds
      };

      if (document.readyState === "loading") {
        // Wait for DOMContentLoaded, then schedule the delayed application
        document.addEventListener("DOMContentLoaded", () => {
          console.log(
            `[ContentScript DEBUG] DOMContentLoaded event for ${window.location.hostname}. Scheduling initial settings.`
          );
          applyInitialSettings();
        });
      } else {
        // DOM is already ready, schedule the delayed application
        console.log(
          `[ContentScript DEBUG] DOM already ready for ${window.location.hostname}. Scheduling initial settings.`
        );
        applyInitialSettings();
      }

      // Watch for dynamic changes (Moved inside initializeScript)
      MediaProcessor.setupMediaObserver(
        async (addedElements: HTMLMediaElement[]) => {
          console.log(`[ContentScript] Processing ${addedElements.length} newly added media elements.`);
          // Ensure settings are initialized before processing new elements
          await settingsHandler.ensureInitialized();
          const currentSettings = settingsHandler.getCurrentSettings();
          const needsProcessing = settingsHandler.needsAudioProcessing();

          // Process only the newly added elements
          await mediaProcessor.processMediaElements(
            addedElements,
            currentSettings,
            needsProcessing
          );
          // Also apply immediate settings to them
          mediaProcessor.applySettingsImmediately(addedElements, currentSettings);
        },
        (removedElements: HTMLMediaElement[]) => {
          console.log(`[ContentScript] Cleaning up ${removedElements.length} removed media elements.`);
          removedElements.forEach((element: HTMLMediaElement) => {
            mediaProcessor.audioProcessor.disconnectElementNodes(element);
          });

          // After cleaning up removed elements, check if there are any managed elements left.
          // If not, and audio processing is not needed, clean up the AudioContext.
          const remainingManagedElements = mediaProcessor.getManagedMediaElements();
          if (remainingManagedElements.length === 0 && !settingsHandler.needsAudioProcessing()) {
            console.log("[ContentScript] No managed media elements left and no audio processing needed. Cleaning up AudioProcessor.");
            mediaProcessor.audioProcessor.cleanup();
          }
        }
      );

      // Ensure AudioContext is closed when the page unloads
      window.addEventListener('unload', () => {
        console.log("[ContentScript] Page is unloading. Performing final AudioProcessor cleanup.");
        mediaProcessor.audioProcessor.cleanup();
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
        let parsedData;
        if (typeof event.data === "string") {
          try {
            parsedData = JSON.parse(event.data);
          } catch (e) {
            // Not a JSON string, or not one we care about.
            // console.log('[ContentScript Top] Received non-JSON string message or parse error:', event.data, e);
            return;
          }
        } else {
          // Not a string, so not our VVP_ message.
          // console.log('[ContentScript Top] Received non-string message:', event.data);
          return;
        }

        if (
          event.source && // Ensure source exists (source is the window object of the sender)
          parsedData &&
          parsedData.type === "VVP_REQUEST_TOP_HOSTNAME"
        ) {
          console.log(
            `[ContentScript Top] Received VVP_REQUEST_TOP_HOSTNAME from an iframe (Source origin: ${event.origin}). Responding with hostname: ${topHostname}. Parsed data:`,
            parsedData
          );
          // Respond directly to the iframe that sent the message, with stringified JSON
          (event.source as Window).postMessage(
            JSON.stringify({
              type: "VVP_TOP_HOSTNAME_INFO",
              hostname: topHostname,
              success: true,
            }),
            event.origin // Respond to the specific origin of the iframe
          );
        } else if (parsedData && parsedData.type) {
          // Log other parsed JSON messages received by top window for debugging if necessary
          // console.log(`[ContentScript Top] Received other parsed JSON message type: ${parsedData.type} from origin ${event.origin}`, parsedData);
        }
      });
    } else {
      // --- Running in an IFRAME ---
      const iframeOwnHostname = window.location.hostname;
      console.log(
        `[ContentScript iFrame] Running in IFRAME. Own hostname: ${iframeOwnHostname}. Attempting to request hostname from top window.`
      );
      let receivedHostname = false;
      let fallbackTimeout: number | null = null;

      // Listener for the response from the top window
      const responseListener = (event: MessageEvent) => {
        if (event.source !== window.top) return; // Message not from top

        let parsedData;
        if (typeof event.data === "string") {
          try {
            parsedData = JSON.parse(event.data);
          } catch (e) {
            // console.warn('[ContentScript iFrame] Failed to parse event.data string from top:', event.data, e);
            return;
          }
        } else {
          // console.warn('[ContentScript iFrame] Received non-string event.data from top:', event.data);
          return;
        }

        if (
          parsedData &&
          parsedData.type === "VVP_TOP_HOSTNAME_INFO" &&
          typeof parsedData.hostname === "string"
        ) {
          if (fallbackTimeout) {
            clearTimeout(fallbackTimeout);
            fallbackTimeout = null;
          }
          if (receivedHostname) {
            console.log(
              `[ContentScript iFrame] Already received hostname. Ignoring duplicate VVP_TOP_HOSTNAME_INFO from top. Origin: ${event.origin}. Parsed Data:`,
              parsedData
            );
            return;
          }
          receivedHostname = true;
          console.log(
            `[ContentScript iFrame] Successfully received VVP_TOP_HOSTNAME_INFO from top: ${parsedData.hostname}. Origin: ${event.origin}. Initializing script. Parsed data:`,
            parsedData
          );
          window.removeEventListener("message", responseListener);
          initializeScript(parsedData.hostname);
        } else if (parsedData && parsedData.type) {
          // console.log(`[ContentScript iFrame] Received other parsed JSON message type from top: ${parsedData.type} from origin ${event.origin}`, parsedData);
        }
      };
      window.addEventListener("message", responseListener);

      // Request the hostname from the top window, sending stringified JSON
      if (window.top && window.top !== window.self) {
        console.log(
          `[ContentScript iFrame] Sending VVP_REQUEST_TOP_HOSTNAME to top window (Origin: ${window.location.origin}).`
        );
        const messagePayload = JSON.stringify({
          type: "VVP_REQUEST_TOP_HOSTNAME",
          fromIframe: true,
          iframeOrigin: window.location.origin,
        });
        window.top.postMessage(messagePayload, "*");
      } else {
        console.warn(
          `[ContentScript iFrame] window.top is null, same as self, or inaccessible. Cannot request hostname from top. Initializing with own hostname: ${iframeOwnHostname}.`
        );
        // Initialize with own hostname immediately if top is inaccessible or is self
        initializeScript(iframeOwnHostname);
        window.removeEventListener("message", responseListener); // Clean up listener as it's not needed
        return; // Exit early
      }

      // Fallback timeout in case the message never arrives
      const TIMEOUT_DURATION = 5000; // Reduced timeout to 5 seconds
      console.log(
        `[ContentScript iFrame] Setting fallback timeout for ${TIMEOUT_DURATION}ms.`
      );
      fallbackTimeout = window.setTimeout(() => {
        fallbackTimeout = null; // Clear the timeout ID
        if (!receivedHostname) {
          console.warn(
            `[ContentScript iFrame] Did not receive hostname from top after ${TIMEOUT_DURATION}ms. Falling back to own hostname: ${iframeOwnHostname}. Removing response listener.`
          );
          window.removeEventListener("message", responseListener); // Clean up listener
          initializeScript(iframeOwnHostname); // Initialize with own hostname as fallback
        } else {
          console.log(
            `[ContentScript iFrame] Fallback timeout triggered, but hostname was already received. No action needed.`
          );
        }
      }, TIMEOUT_DURATION);
    }
  },
});
