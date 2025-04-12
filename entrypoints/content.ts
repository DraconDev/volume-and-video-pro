import { defineContentScript } from "wxt/sandbox";
import { MessageType } from "../src/types"; // Keep type import

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true,
  runAt: "document_start",
  main: async () => {
    // Use a unique prefix for easier filtering
    const logPrefix = `[ContentScript DEBUG - ${window.location.hostname}]`;

    console.log(logPrefix, "Script starting.");

    // Simple message listener - just log everything received
    chrome.runtime.onMessage.addListener(
      (
        message: MessageType,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
      ) => {
        console.log(logPrefix, "Received message:", JSON.stringify(message), "from:", sender.url || sender.id);

        // No processing, just acknowledge receipt for debugging
        // Return false as we are not sending an async response
        return false;
      }
    );

    console.log(logPrefix, "Message listener attached.");

    // Comment out all original logic for now
    /*
    const settingsHandler = new SettingsHandler();
    const mediaProcessor = new MediaProcessor();
    settingsHandler.initialize();
    const resumeContextHandler = async () => { ... };
    const processMedia = async () => { ... };
    const debouncedInitialization = () => { ... };
    if (document.readyState === "loading") { ... } else { ... }
    mediaProcessor.setupMediaObserver(processMedia);
    */
  },
});
