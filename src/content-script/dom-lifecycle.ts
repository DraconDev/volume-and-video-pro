import { MediaProcessor } from "../media-processor";
import { SettingsHandler } from "../settings-handler";
import { isSettingsDisabled } from "../types";

/**
 * Sets up DOM lifecycle observers and initial settings application.
 */
export function setupDomLifecycle(
  settingsHandler: SettingsHandler,
  mediaProcessor: MediaProcessor,
  processMedia: () => Promise<boolean>
): (() => void)[] {
  const cleanupFunctions: (() => void)[] = [];

  // Apply settings immediately after DOMContentLoaded or if DOM is already ready
  const applyInitialSettings = async () => {
    debugLog(
      `[ContentScript DEBUG] Applying initial settings for ${window.location.hostname}`
    );
    await processMedia();
  };

  const domContentLoadedListener = () => {
    debugLog(
      `[ContentScript DEBUG] DOMContentLoaded event for ${window.location.hostname}`
    );
    applyInitialSettings();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", domContentLoadedListener);
    cleanupFunctions.push(() =>
      document.removeEventListener("DOMContentLoaded", domContentLoadedListener)
    );
  } else {
    applyInitialSettings();
  }

  // Watch for dynamic changes
  const mediaObserver = MediaProcessor.setupMediaObserver(
    async (addedElements: HTMLMediaElement[]) => {
      debugLog(
        `[ContentScript] Processing ${addedElements.length} newly added media elements.`
      );
      await settingsHandler.ensureInitialized();
      const currentSettings = settingsHandler.getCurrentSettings();
      const needsProcessing = settingsHandler.needsAudioProcessing();

      await mediaProcessor.processMediaElements(
        addedElements,
        currentSettings,
        needsProcessing
      );

      const isDisabled = isSettingsDisabled(currentSettings);
      mediaProcessor.applySettingsImmediately(
        addedElements,
        currentSettings,
        isDisabled
      );
    },
    (removedElements: HTMLMediaElement[]) => {
      debugLog(
        `[ContentScript] Cleaning up ${removedElements.length} removed media elements.`
      );
      removedElements.forEach((element: HTMLMediaElement) => {
        mediaProcessor.audioProcessor.disconnectElementNodes(element);
      });

      const remainingManagedElements = mediaProcessor.getManagedMediaElements();
      if (
        remainingManagedElements.length === 0 &&
        !settingsHandler.needsAudioProcessing()
      ) {
        debugLog(
          "[ContentScript] No managed media elements left. Cleaning up AudioProcessor."
        );
        mediaProcessor.audioProcessor.cleanup();
      }
    }
  );
  cleanupFunctions.push(() => mediaObserver.disconnect());

  // Ensure AudioContext is closed when the page is unloaded
  const beforeUnloadListener = () => {
    debugLog(
      "[ContentScript] Page is unloading. Performing final AudioProcessor cleanup."
    );
    mediaProcessor.audioProcessor.cleanup();
  };
  window.addEventListener("beforeunload", beforeUnloadListener);
  cleanupFunctions.push(() =>
    window.removeEventListener("beforeunload", beforeUnloadListener)
  );

  return cleanupFunctions;
}
