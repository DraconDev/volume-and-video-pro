import { MediaProcessor } from "./media-processor";
import { SettingsHandler } from "./settings-handler";
import { MessageType } from "./types";

export async function initializeContentScript(
  settingsHandler: SettingsHandler,
  mediaProcessor: MediaProcessor,
  hostname: string
) {
  console.log(`[ContentScript] Initializing script for hostname: ${hostname}`);
  settingsHandler.initialize(hostname); // Initialize with the correct hostname

  // --- AudioContext Resume Handler ---
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
  const applySettingsToSingleElement = async (element: HTMLMediaElement) => {
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

  // Process media with current settings
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
      const elementListenerMap = new WeakMap<
        HTMLMediaElement,
        (event: Event) => Promise<void>
      >();

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

  // Listen for settings updates from the background script
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
        console.log("Content: Applying settings update received via message.");
        // Ensure settingsHandler is initialized before applying the update
        (async () => {
          try {
            await settingsHandler.ensureInitialized(); // Wait for initialization
            settingsHandler.updateSettings(message.settings); // Update local settings cache

            const newSettings = settingsHandler.getCurrentSettings(); // Get the just-updated settings
            const needsProcessingNow = settingsHandler.needsAudioProcessing(); // Check based on new settings

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
              if (mediaProcessor.canApplyAudioEffects()) {
                // Only apply audio effects if the AudioContext is already running
                if (managedMediaElements.length > 0) {
                  console.log(
                    `[ContentScript Listener] AudioContext is running. Processing audio effects for ${managedMediaElements.length} managed elements.`
                  );
                  await mediaProcessor.processMediaElements(
                    managedMediaElements,
                    newSettings,
                    needsProcessingNow
                  );
                } else {
                  console.log(
                    "[ContentScript Listener] AudioContext is running, but no managed media elements found. Attempting fallback to fresh scan."
                  );
                  const freshScanElements = mediaProcessor.findMediaElements();
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
                  "[ContentScript Listener] Audio effects needed, but AudioContext is not running. Deferring full audio effects application until user gesture (e.g., play)."
                );
                // No action needed here, the 'play' event listener will handle it.
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
                const freshScanElements = mediaProcessor.findMediaElements();
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

  // Initial setup
  // Apply settings immediately after DOMContentLoaded or if the DOM is already ready.
  const applyInitialSettings = async () => {
    console.log(
      `[ContentScript DEBUG] Applying initial settings for ${window.location.hostname} (immediately)`
    );
    await processMedia(); // processMedia handles finding elements and applying settings
  };

  if (document.readyState === "loading") {
    // Wait for DOMContentLoaded, then apply settings
    document.addEventListener("DOMContentLoaded", () => {
      console.log(
        `[ContentScript DEBUG] DOMContentLoaded event for ${window.location.hostname}. Applying initial settings.`
      );
      applyInitialSettings();
    });
  } else {
    // DOM is already ready, apply settings immediately
    console.log(
      `[ContentScript DEBUG] DOM already ready for ${window.location.hostname}. Applying initial settings.`
    );
    applyInitialSettings();
  }

:start_line:364
-------
  // Watch for dynamic changes
  const mediaObserver = MediaProcessor.setupMediaObserver( // Store the observer
    async (addedElements: HTMLMediaElement[]) => {
      console.log(
        `[ContentScript] Processing ${addedElements.length} newly added media elements.`
      );
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
      console.log(
        `[ContentScript] Cleaning up ${removedElements.length} removed media elements.`
      );
      removedElements.forEach((element: HTMLMediaElement) => {
        mediaProcessor.audioProcessor.disconnectElementNodes(element);
      });

      // After cleaning up removed elements, check if there are any managed elements left.
      // If not, and audio processing is not needed, clean up the AudioContext.
      const remainingManagedElements = mediaProcessor.getManagedMediaElements();
      if (
        remainingManagedElements.length === 0 &&
        !settingsHandler.needsAudioProcessing()
      ) {
        console.log(
          "[ContentScript] No managed media elements left and no audio processing needed. Cleaning up AudioProcessor."
        );
        mediaProcessor.audioProcessor.cleanup();
      }
    }
  );

  // Ensure AudioContext and MutationObserver are closed/disconnected when the page is hidden or navigated away from
  window.addEventListener("pagehide", () => {
    console.log(
      "[ContentScript] Page is hiding/unloading. Performing final cleanup."
    );
    mediaProcessor.audioProcessor.cleanup();
    mediaObserver.disconnect(); // Disconnect the observer
  });
}
