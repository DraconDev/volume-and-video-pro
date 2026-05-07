import { MediaProcessor } from "../media-processor";
import { SettingsHandler } from "../settings-handler";
import { MessageType, isSettingsDisabled } from "../types";

/**
 * Handles UPDATE_SETTINGS messages from background/popup.
 */
export function createMessageHandler(
  settingsHandler: SettingsHandler,
  mediaProcessor: MediaProcessor
) {
  return (
    message: MessageType,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) => {
      "[ContentScript Listener] Received message:",
      JSON.stringify(message)
    );
    if (message.type === "UPDATE_SETTINGS") {
        "[ContentScript Listener] Processing UPDATE_SETTINGS from background/popup"
      );
      (async () => {
        try {
          await settingsHandler.ensureInitialized();
          settingsHandler.updateSettings(message.settings);

          const newSettings = settingsHandler.getCurrentSettings();
          const needsProcessingNow = settingsHandler.needsAudioProcessing();

          const managedMediaElements =
            mediaProcessor.getManagedMediaElements();
          const isDisabled = isSettingsDisabled(newSettings);

          if (managedMediaElements.length > 0) {
            mediaProcessor.applySettingsImmediately(
              managedMediaElements,
              newSettings,
              isDisabled
            );
          }

          if (needsProcessingNow) {
            if (mediaProcessor.canApplyAudioEffects()) {
              if (managedMediaElements.length > 0) {
                await mediaProcessor.processMediaElements(
                  managedMediaElements,
                  newSettings,
                  needsProcessingNow
                );
              } else {
                const freshScanElements = mediaProcessor.findMediaElements();
                if (freshScanElements.length > 0) {
                  mediaProcessor.applySettingsImmediately(
                    freshScanElements,
                    newSettings,
                    isDisabled
                  );
                  if (!isDisabled && needsProcessingNow) {
                    await mediaProcessor.processMediaElements(
                      freshScanElements,
                      newSettings,
                      needsProcessingNow
                    );
                  }
                }
              }
            }
          } else {
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
        } catch (error) {
          console.error(
            "Content: Error during UPDATE_SETTINGS processing:",
            error
          );
        }
      })();
    }
    return false;
  };
}
