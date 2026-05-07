import { settingsManager } from "../src/settings-manager";
import { defaultSettings } from "../src/types";
import { defineBackground } from "wxt/sandbox";
import { setupMessageHandler } from "../src/message-handler";
import { setupSettingsEventHandler } from "../src/settings-event-handler";

// Initialize settings on extension startup or first install
chrome.runtime.onInstalled.addListener(async () => {
  console.log(
    "Background: onInstalled event triggered. Initializing settings..."
  );
  await settingsManager.initialize();
  console.log("Background: Settings initialized via onInstalled.");
});

export default defineBackground(() => {
  console.log("Background: Script executing.");

  // Initialize settings manager (fire-and-forget, handles its own errors)
  // This ensures it starts loading ASAP. Listeners below might initially get defaults.
  settingsManager
    .initialize()
    .catch((err) =>
      console.error(
        "Background: Initial settingsManager.initialize() failed:",
        err
      )
    );

  // Set up listeners within the defineBackground context
  // This might help ensure they are correctly attached/reattached during reloads.
  setupMessageHandler();
  setupSettingsEventHandler(); // Ensure this runs within the defined context

  console.log("Background: Main execution finished, listeners set up.");
});
