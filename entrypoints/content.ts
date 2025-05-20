// entrypoints/content.ts

import { defineContentScript } from "wxt/sandbox";
import { MediaProcessor } from "./../src/media-processor";     // Path relative to content.ts
import { SettingsHandler } from "../src/settings-handler";   // Path relative to content.ts
import { MessageType, UpdateSettingsMessage } from "../src/types"; // Path relative to content.ts

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true,
  runAt: "document_idle",
  main: async () => {
    const scriptInstanceId = Math.random().toString(36).substring(2, 7); // Unique ID for logging
    // console.log(
    //   `Content (${scriptInstanceId}): Script starting - ${window.location.href} (Top: ${window.self === window.top})`
    // );

    const settingsHandler = new SettingsHandler();
    const mediaProcessor = new MediaProcessor();

    // Store event handlers associated with each media element
    const elementEventHandlers = new WeakMap<
      HTMLMediaElement,
      {
        playHandler?: (event: Event) => void;
        metadataHandler?: (event: Event) => void;
        loadstartHandler?: (event: Event) => void;
      }
    >();

    const applySettingsAndEffectsToElement = async (element: HTMLMediaElement, reason: string) => {
      if (!element.isConnected) {
        // console.log(`Content (${scriptInstanceId}): Element ${element.src || '(no src)'} disconnected. Skipping apply from ${reason}.`);
        removeElementListeners(element);
        mediaProcessor.audioProcessor.disconnectElementNodes(element);
        return;
      }
      // console.log(`Content (${scriptInstanceId}): Applying settings to ${element.src || "(no src)"} due to: ${reason}`);
      try {
        await settingsHandler.ensureInitialized();
        const currentSettings = settingsHandler.getCurrentSettings();
        const needsAudioGraph = settingsHandler.needsAudioProcessing();

        mediaProcessor.applySettingsImmediately([element], currentSettings);
        await mediaProcessor.processMediaElements([element], currentSettings, needsAudioGraph);

      } catch (error) {
        console.error(`Content (${scriptInstanceId}): Error applying settings to ${element.src || "(no src)"} (Reason: ${reason}):`, error);
      }
    };

    const createPlayHandler = (element: HTMLMediaElement) => async (event: Event) => {
      // console.log(`Content (${scriptInstanceId}): "play" event on ${element.src || '(no src)'}`);
      await mediaProcessor.attemptContextResume();
      await applySettingsAndEffectsToElement(element, "play event");
    };

    const createMetadataHandler = (element: HTMLMediaElement) => async (event: Event) => {
      // console.log(`Content (${scriptInstanceId}): "loadedmetadata/canplay" on ${element.src || '(no src)'}`);
      await applySettingsAndEffectsToElement(element, "metadata/canplay event");
    };

    const createLoadstartHandler = (element: HTMLMediaElement) => async (event: Event) => {
      // console.log(`Content (${scriptInstanceId}): "loadstart" on ${element.src || '(no src)'} - potential src change.`);
      mediaProcessor.audioProcessor.disconnectElementNodes(element);
      await applySettingsAndEffectsToElement(element, "loadstart event");
    };

    const addElementListeners = (element: HTMLMediaElement) => {
      let handlers = elementEventHandlers.get(element);
      if (!handlers) {
        handlers = {};
        elementEventHandlers.set(element, handlers);
      }

      if (!handlers.playHandler) {
        handlers.playHandler = createPlayHandler(element);
        element.addEventListener("play", handlers.playHandler);
      }
      if (!handlers.metadataHandler) {
        handlers.metadataHandler = createMetadataHandler(element);
        element.addEventListener("loadedmetadata", handlers.metadataHandler);
        element.addEventListener("canplay", handlers.metadataHandler);
      }
      if (!handlers.loadstartHandler) {
        handlers.loadstartHandler = createLoadstartHandler(element);
        element.addEventListener("loadstart", handlers.loadstartHandler);
      }
    };

    const removeElementListeners = (element: HTMLMediaElement) => {
      const handlers = elementEventHandlers.get(element);
      if (handlers) {
        if (handlers.playHandler) element.removeEventListener("play", handlers.playHandler);
        if (handlers.metadataHandler) {
          element.removeEventListener("loadedmetadata", handlers.metadataHandler);
          element.removeEventListener("canplay", handlers.metadataHandler);
        }
        if (handlers.loadstartHandler) element.removeEventListener("loadstart", handlers.loadstartHandler);
        elementEventHandlers.delete(element);
      }
    };

    const initializeScriptLogic = async (effectiveHostname: string) => {
      // console.log(`Content (${scriptInstanceId}): Initializing script logic for effective hostname: ${effectiveHostname}`);
      await settingsHandler.initialize(effectiveHostname);

      const processAllMedia = async (reason: string) => {
        // console.log(`Content (${scriptInstanceId}): processAllMedia called due to: ${reason}`);
        await settingsHandler.ensureInitialized();

        const mediaElements = mediaProcessor.findMediaElements();
        // console.log(`Content (${scriptInstanceId}): Found ${mediaElements.length} media elements (${reason}).`);

        for (const element of mediaElements) {
          if (!element.isConnected) continue;
          removeElementListeners(element); // Always remove before adding to prevent duplicates if re-processed
          addElementListeners(element);
          await applySettingsAndEffectsToElement(element, `scan / ${reason}`);
        }
      };

      chrome.runtime.onMessage.addListener(
        (message: MessageType, sender, sendResponse) => {
          if (message.type === "UPDATE_SETTINGS") {
            // console.log(`Content (${scriptInstanceId}): Received UPDATE_SETTINGS from background:`, message);
            (async () => {
              await settingsHandler.ensureInitialized();
              settingsHandler.updateSettings(message.settings);
              // console.log(`Content (${scriptInstanceId}): Settings updated locally via message. Reprocessing all media...`);
              // Re-process all known *and newly found* media elements.
              // This covers elements that might have been added since the last scan/update.
              const allCurrentElements = mediaProcessor.findMediaElements();
              const currentSettings = settingsHandler.getCurrentSettings();
              const needsAudioGraph = settingsHandler.needsAudioProcessing();

              for (const el of allCurrentElements) {
                  if(el.isConnected) {
                    // Ensure listeners are current
                    removeElementListeners(el);
                    addElementListeners(el);
                    // Apply full settings
                    mediaProcessor.applySettingsImmediately([el], currentSettings);
                    await mediaProcessor.processMediaElements([el], currentSettings, needsAudioGraph);
                  }
              }
              if (allCurrentElements.length === 0) {
                // console.log(`Content (${scriptInstanceId}): No media elements found to apply updated settings to.`);
              }

            })();
          }
          return false; // We are not using sendResponse here
        }
      );

      const performInitialScan = async () => {
        // console.log(`Content (${scriptInstanceId}): Performing initial media scan for ${effectiveHostname}`);
        await processAllMedia("initial script load");
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => setTimeout(performInitialScan, 250));
      } else {
        setTimeout(performInitialScan, 250); // Delay for SPAs and late hydration
      }

      mediaProcessor.setupMediaObserver(async () => {
        // console.log(`Content (${scriptInstanceId}): MediaObserver triggered. Reprocessing media.`);
        await processAllMedia("media observer");
      });
    };

    // Hostname detection and script initialization
    if (window.self === window.top) {
      const topHostname = window.location.hostname || "unknown_top_host";
      // console.log(`Content (${scriptInstanceId}): Running in TOP window. Hostname: ${topHostname}`);
      initializeScriptLogic(topHostname);

      window.addEventListener("message", (event: MessageEvent) => {
        if (event.source && event.data && typeof event.data === 'string') {
          try {
            const parsedData = JSON.parse(event.data);
            if (parsedData.type === "VVP_REQUEST_TOP_HOSTNAME") {
              // console.log(`Content (${scriptInstanceId}): TOP received VVP_REQUEST_TOP_HOSTNAME from origin ${event.origin}. Responding.`);
              (event.source as Window).postMessage(
                JSON.stringify({ type: "VVP_TOP_HOSTNAME_INFO", hostname: topHostname, success: true }),
                event.origin // Important: respond to the specific origin
              );
            }
          } catch (e) { /* Not JSON or not our message */ }
        }
      });
    } else { // Running in an iframe
      const iframeOwnHostname = window.location.hostname || "unknown_iframe_host";
      // console.log(`Content (${scriptInstanceId}): Running in IFRAME. Own Hostname: ${iframeOwnHostname}. Requesting top hostname.`);
      let receivedTopHostname = false;
      let fallbackTimeoutId: number | null = null;

      const handleTopHostnameResponse = (event: MessageEvent) => {
        // Ensure message is from top window and is a string (our expected format)
        if (event.source === window.top && event.data && typeof event.data === 'string') {
          try {
            const parsedData = JSON.parse(event.data);
            if (parsedData.type === "VVP_TOP_HOSTNAME_INFO" && typeof parsedData.hostname === 'string') {
              if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
              fallbackTimeoutId = null;
              if (receivedTopHostname) return; // Already processed

              receivedTopHostname = true;
              window.removeEventListener("message", handleTopHostnameResponse);
              // console.log(`Content (${scriptInstanceId}): IFRAME received top hostname: ${parsedData.hostname} from origin ${event.origin}. Initializing.`);
              initializeScriptLogic(parsedData.hostname);
            }
          } catch (e) { /* Not JSON or not our message */ }
        }
      };
      window.addEventListener("message", handleTopHostnameResponse);

      if (window.top && window.top !== window.self) { // Check if top is accessible and different
        window.top.postMessage(JSON.stringify({ type: "VVP_REQUEST_TOP_HOSTNAME" }), "*"); // For this handshake, "*" is common. Be more specific if possible/needed.
      } else {
        // console.warn(`Content (${scriptInstanceId}): IFRAME - window.top is self or inaccessible. Using own hostname: ${iframeOwnHostname}.`);
        window.removeEventListener("message", handleTopHostnameResponse); // Cleanup
        initializeScriptLogic(iframeOwnHostname); // Fallback to own hostname
        return; // Exit early
      }

      fallbackTimeoutId = window.setTimeout(() => {
        fallbackTimeoutId = null;
        if (!receivedTopHostname) {
          // console.warn(`Content (${scriptInstanceId}): IFRAME - Did not receive hostname from top (timeout). Falling back to own: ${iframeOwnHostname}.`);
          window.removeEventListener("message", handleTopHostnameResponse);
          initializeScriptLogic(iframeOwnHostname);
        }
      }, 3000); // 3-second timeout
    }
  },
});