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
    // Global safety check for Chrome extension APIs
    if (typeof chrome === 'undefined' || typeof chrome.runtime === 'undefined') {
      console.error('Chrome extension APIs are not available. Skipping content script execution.');
      return;
    }

    console.log(
      "Content: Script starting - This log should always appear",
      window.location.href
    );
    
    // Skip processing for file URLs
    if (window.location.protocol === 'file:') {
      console.log('Skipping content script for file URL');
      return;
    }

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
