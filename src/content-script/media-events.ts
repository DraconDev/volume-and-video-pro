import { MediaProcessor } from "../media-processor";
import { SettingsHandler } from "../settings-handler";
import { isSettingsDisabled } from "../types";

/**
 * Creates stable event handlers for media elements to prevent listener leaks.
 */
export function createMediaEventHandlers(
  settingsHandler: SettingsHandler,
  mediaProcessor: MediaProcessor
) {
  // Track which elements have had listeners added to avoid duplicates
  const elementsWithListeners = new WeakSet<HTMLMediaElement>();

  const applySettingsToSingleElement = async (element: HTMLMediaElement) => {
    console.log(
      `[ContentScript DEBUG] applySettingsToSingleElement called for ${
        element.src || "(no src)"
      }`
    );
    try {
      await settingsHandler.ensureInitialized();
      const currentSettings = settingsHandler.getCurrentSettings();
      const needsProcessing = settingsHandler.needsAudioProcessing();

      console.log(
        `[ContentScript DEBUG] Applying settings to single element ${
          element.src || "(no src)"
        }:`
      );

      const isDisabled = isSettingsDisabled(currentSettings);

      // Apply immediate settings (speed, volume)
      mediaProcessor.applySettingsImmediately(
        [element],
        currentSettings,
        isDisabled
      );

      // Apply audio effects if needed
      if (needsProcessing) {
        if (mediaProcessor.canApplyAudioEffects()) {
          await mediaProcessor.processMediaElements(
            [element],
            currentSettings,
            needsProcessing
          );
        } else {
          await mediaProcessor.attemptContextResume();
          if (mediaProcessor.canApplyAudioEffects()) {
            await mediaProcessor.processMediaElements(
              [element],
              currentSettings,
              needsProcessing
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `[ContentScript DEBUG] Error applying settings to single element ${
          element.src || "(no src)"
        }:`
      );
    }
  };

  const onLoadedMetadata = (event: Event) => {
    applySettingsToSingleElement(event.target as HTMLMediaElement);
  };
  const onCanPlay = (event: Event) => {
    applySettingsToSingleElement(event.target as HTMLMediaElement);
  };
  const onLoadStart = (event: Event) => {
    applySettingsToSingleElement(event.target as HTMLMediaElement);
  };

  const resumeContextHandler = async (event: Event) => {
    console.log(
      "Content: Media interaction detected, attempting to resume AudioContext."
    );
    await mediaProcessor.attemptContextResume();
    const targetElement = event.target as HTMLMediaElement;
    if (targetElement) {
      try {
        await settingsHandler.ensureInitialized();
        const currentSettings = settingsHandler.getCurrentSettings();
        const needsProcessing = settingsHandler.needsAudioProcessing();
        await mediaProcessor.processMediaElements(
          [targetElement],
          currentSettings,
          needsProcessing
        );
      } catch (error) {
        console.error(
          `Content: Error applying audio effects after context resume:`
        );
      }
    }
  };

  function attachListeners(element: HTMLMediaElement) {
    if (!elementsWithListeners.has(element)) {
      elementsWithListeners.add(element);
      element.addEventListener("loadedmetadata", onLoadedMetadata);
      element.addEventListener("canplay", onCanPlay);
      element.addEventListener("loadstart", onLoadStart);
      element.addEventListener("play", resumeContextHandler as EventListener);
    }
  }

  return {
    applySettingsToSingleElement,
    attachListeners,
    resumeContextHandler,
  };
}
