import { MediaProcessor } from "./media-processor";
import { SettingsHandler } from "./settings-handler";
import { MessageType, isSettingsDisabled } from "./types";
import { createMediaEventHandlers } from "./content-script/media-events";
import { createMessageHandler } from "./content-script/message-handler";
import { setupDomLifecycle } from "./content-script/dom-lifecycle";

export async function initializeContentScript(
  settingsHandler: SettingsHandler,
  mediaProcessor: MediaProcessor,
  hostname: string
): Promise<() => void> {
  console.log(`[ContentScript] Initializing script for hostname: ${hostname}`);
  settingsHandler.initialize(hostname);

  const cleanupFunctions: (() => void)[] = [];

  // Create stable event handlers
  const { applySettingsToSingleElement, attachListeners } =
    createMediaEventHandlers(settingsHandler, mediaProcessor);

  // Process media with current settings
  const processMedia = async () => {
    console.log(
      `[ContentScript DEBUG] processMedia called for ${window.location.hostname}`
    );
    try {
      console.time("ensureInitialized");
      await settingsHandler.ensureInitialized();
      console.timeEnd("ensureInitialized");
    } catch (error) {
      console.timeEnd("ensureInitialized");
      console.error(
        `[ContentScript DEBUG] Error ensuring settings initialized:`
      );
      return false;
    }

    try {
      const currentSettings = settingsHandler.getCurrentSettings();
      const isDisabled = isSettingsDisabled(currentSettings);

      const mediaElements = mediaProcessor.findMediaElements();
      console.log(
        `[ContentScript DEBUG] Found ${mediaElements.length} media elements`
      );

      mediaElements.forEach((element) => {
        attachListeners(element);
        if (!isDisabled) {
          applySettingsToSingleElement(element);
        }
      });
    } catch (processingError) {
      console.error(
        `[ContentScript DEBUG] Error during media processing steps:`
      );
    }
    return true;
  };

  // Set up message listener
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.onMessage
  ) {
    const messageHandler = createMessageHandler(settingsHandler, mediaProcessor);
    chrome.runtime.onMessage.addListener(messageHandler);
    cleanupFunctions.push(() =>
      chrome.runtime.onMessage.removeListener(messageHandler)
    );
  } else {
    console.debug(
      "[ContentScript] chrome.runtime.onMessage not available - skipping message listener setup"
    );
  }

  // Set up DOM lifecycle (initial settings, mutation observer, beforeunload)
  const domCleanup = setupDomLifecycle(
    settingsHandler,
    mediaProcessor,
    processMedia
  );
  cleanupFunctions.push(...domCleanup);

  return () => {
    console.log("[ContentScript] Running cleanup functions.");
    cleanupFunctions.forEach((cleanup) => cleanup());
  };
}
