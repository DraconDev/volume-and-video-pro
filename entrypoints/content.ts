import { defineContentScript } from "wxt/sandbox";
import { MediaProcessor } from "./../src/media-processor";
import { SettingsHandler } from "../src/settings-handler";
import { setupHostnameDetection } from "../src/iframe-hostname-handler";
import { initializeContentScript } from "../src/content-script-init";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*", "file://*/*"],
  allFrames: true,
  runAt: "document_idle",
  main: async () => {
    console.log(
      "Content: Script starting - This log should always appear",
      window.location.href
    );

    // Initialize core components
    const settingsHandler = new SettingsHandler();
    const mediaProcessor = new MediaProcessor();

    let hostnameDetectionCleanup: (() => void) | null = null;
    let contentScriptCleanup: (() => void) | null = null;

    // Start the hostname detection and script initialization process
    hostnameDetectionCleanup = setupHostnameDetection(async (hostname: string) => {
      contentScriptCleanup = await initializeContentScript(settingsHandler, mediaProcessor, hostname);
    });

    // Add a listener for page unload to perform cleanup
    const beforeUnloadListener = () => {
      console.log("[ContentScript] Page is unloading. Performing overall cleanup.");
      if (hostnameDetectionCleanup) {
        hostnameDetectionCleanup();
        hostnameDetectionCleanup = null;
      }
      if (contentScriptCleanup) {
        contentScriptCleanup();
        contentScriptCleanup = null;
      }
    };
    window.addEventListener('beforeunload', beforeUnloadListener);
  },
});
