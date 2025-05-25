import { defineContentScript } from "wxt/sandbox";
import { MediaProcessor } from "./../src/media-processor";
import { SettingsHandler } from "../src/settings-handler";
import { setupHostnameDetection } from "../src/iframe-hostname-handler";
import { initializeContentScript } from "../src/content-script-init";

export default defineContentScript({
  matches: ["<all_urls>"],
  exclude_matches: ["*://chrome.google.com/*", "*://extensions/*", "*://about.google/*", "*://edge.microsoft.com/*", "*://settings/*", "*://newtab/*", "*://*/*?*"],
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

    // Start the hostname detection and script initialization process
    setupHostnameDetection(async (hostname: string) => {
      await initializeContentScript(settingsHandler, mediaProcessor, hostname);
    });
  },
});
