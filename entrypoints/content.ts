import { defineContentScript } from "wxt/sandbox";
import { MediaProcessor } from "./../src/media-processor";
import { SettingsHandler } from "../src/settings-handler";
import { MessageType, UpdateSettingsMessage } from "../src/types";

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true, // Add this line
  runAt: "document_start", // Add this line
  main: async () => {
    console.log(
      "Content: Script starting - This log should always appear",
      window.location.href
    );

    // Initialize core components
    const settingsHandler = new SettingsHandler();
    const mediaProcessor = new MediaProcessor();

    // Function to initialize settings and the rest of the script logic
    const initializeScript = async (hostname: string) => {
        console.log(`[ContentScript] Initializing script for hostname: ${hostname}`);
        settingsHandler.initialize(hostname); // Initialize with the correct hostname

        // --- AudioContext Resume Handler --- (Moved inside initializeScript)
        const resumeContextHandler = async () => {
          console.log(
            "Content: Media interaction detected, attempting to resume AudioContext."
          );
          await mediaProcessor.attemptContextResume();
          console.log(
            "Content: Context potentially resumed, reprocessing media..."
          );
          await processMedia();
        };
        // --- End AudioContext Resume Handler ---

        // Process media with current settings (Moved inside initializeScript)
        const processMedia = async () => {
          console.log(`[ContentScript DEBUG] processMedia called for ${window.location.hostname}`);
          const mediaElements = mediaProcessor.findMediaElements();
          console.log(`[ContentScript DEBUG] Found ${mediaElements.length} media elements:`, mediaElements.map(el => ({ src: el.src, tagName: el.tagName, id: el.id, classList: el.classList.toString() })));

          mediaElements.forEach((element) => {
            element.removeEventListener("play", resumeContextHandler); // Remove previous listener if any
            element.addEventListener("play", resumeContextHandler, { once: true });
          });

          const currentSettings = settingsHandler.getCurrentSettings();
          const needsProcessing = settingsHandler.needsAudioProcessing();
          console.log(
            "Content: Processing media with settings:",
            currentSettings,
            "needsProcessing:",
            needsProcessing
          );
          console.log(
            "[ProcessMedia] Applying settings:",
            JSON.stringify(currentSettings)
          );
          await mediaProcessor.processMediaElements(
            mediaElements,
            currentSettings,
            needsProcessing
          );
        };

        // Initialize with debouncing (Moved inside initializeScript)
        let initializationTimeout: number | null = null;
        const debouncedInitialization = () => {
          if (initializationTimeout) {
            window.clearTimeout(initializationTimeout);
          }
          initializationTimeout = window.setTimeout(async () => {
            try {
              await settingsHandler.ensureInitialized();
              console.log(`[ContentScript DEBUG] Initialization complete for ${window.location.hostname}. Settings to use initially:`, JSON.stringify(settingsHandler.getCurrentSettings()));
              await processMedia();
            } catch (error) {
              console.error(`Content: Error during delayed initialization on ${window.location.hostname}:`, error);
            }
          }, 100);
        };

        // Listen for settings updates from the background script (Moved inside initializeScript)
        chrome.runtime.onMessage.addListener(
          (message: MessageType, sender, sendResponse) => {
            console.log("[ContentScript Listener] Received message:", JSON.stringify(message));
            if (message.type === "UPDATE_SETTINGS") {
              console.log("[ContentScript Listener] Processing UPDATE_SETTINGS from background/popup");
              console.log("Content: Applying settings update received via message.");
              settingsHandler.updateSettings(message.settings);
              console.log("Content: Settings updated via message, reprocessing media elements...");
              processMedia().catch((error) => {
                console.error("Content: Error during processMedia after settings update:", error);
              });
            }
            return false;
          }
        );

        // Initial setup (Moved inside initializeScript)
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", debouncedInitialization);
        } else {
          debouncedInitialization();
        }

        // Watch for dynamic changes (Moved inside initializeScript)
        mediaProcessor.setupMediaObserver(processMedia);

    }; // End of initializeScript function

    // --- Hostname Detection and Initialization Logic ---
    if (window.self === window.top) {
        // Running in the top-level window
        const topHostname = window.location.hostname;
        console.log(`[ContentScript] Running in TOP window. Hostname: ${topHostname}`);
        initializeScript(topHostname); // Initialize for the top window

        // Send hostname to potential iframes after a short delay to allow them to load
        // TODO: Improve iframe detection/targeting if possible
        setTimeout(() => {
            const iframes = document.querySelectorAll('iframe');
             console.log(`[ContentScript Top] Found ${iframes.length} iframes. Attempting to post hostname...`);
            iframes.forEach(iframe => {
                if (iframe.contentWindow) {
                    // Use '*' for targetOrigin for simplicity, but ideally restrict this
                    iframe.contentWindow.postMessage({ type: "TOP_HOSTNAME_INFO", hostname: topHostname }, '*');
                }
            });
        }, 1000); // Delay sending message slightly

    } else {
        // Running in an iframe
        console.log(`[ContentScript] Running in IFRAME. Own hostname: ${window.location.hostname}. Waiting for hostname from top...`);
        let receivedHostname = false;
        const messageListener = (event: MessageEvent) => {
            // TODO: Add origin check for security: if (event.origin !== 'expected_top_origin') return;
            if (event.data && event.data.type === "TOP_HOSTNAME_INFO" && event.data.hostname) {
                receivedHostname = true;
                console.log(`[ContentScript iFrame] Received hostname from top: ${event.data.hostname}`);
                window.removeEventListener('message', messageListener); // Clean up listener
                initializeScript(event.data.hostname); // Initialize with received hostname
            }
        };
        window.addEventListener('message', messageListener);

        // Fallback timeout in case the message never arrives
        setTimeout(() => {
            if (!receivedHostname) {
                console.warn(`[ContentScript iFrame] Did not receive hostname from top after timeout. Falling back to own hostname: ${window.location.hostname}`);
                window.removeEventListener('message', messageListener); // Clean up listener
                initializeScript(window.location.hostname); // Initialize with own hostname as fallback
            }
        }, 5000); // 5 second timeout
    }

    // --- AudioContext Resume Handler --- (Moved inside initializeScript)
    // This function will be called once when the user interacts with a media element
    const resumeContextHandler = async () => {
      console.log(
        "Content: Media interaction detected, attempting to resume AudioContext."
      );
      // Attempt to resume the context via MediaProcessor -> AudioProcessor
      await mediaProcessor.attemptContextResume();
      // After attempting resume, re-process media to ensure settings are applied
      // with the potentially now-running context.
      console.log(
        "Content: Context potentially resumed, reprocessing media..."
      );
      await processMedia(); // Add this call
    };
    // --- End AudioContext Resume Handler ---

    // Process media with current settings
    const processMedia = async () => {
      console.log(`[ContentScript DEBUG] processMedia called for ${window.location.hostname}`); // Add hostname
      const mediaElements = mediaProcessor.findMediaElements();
      // ADD LOG: Log details about found elements
      console.log(`[ContentScript DEBUG] Found ${mediaElements.length} media elements:`, mediaElements.map(el => ({ src: el.src, tagName: el.tagName, id: el.id, classList: el.classList.toString() })));

      // Attach interaction listeners to each media element to resume AudioContext
      mediaElements.forEach((element) => {
        // Use { once: true } so the listener fires only once per event type per element
        // Only listen for 'play' to resume context, avoiding interference with click-to-pause.
        element.addEventListener("play", resumeContextHandler, { once: true });
        // 'touchstart' could also be added if needed for mobile
      });

      const currentSettings = settingsHandler.getCurrentSettings();
      const needsProcessing = settingsHandler.needsAudioProcessing();
      console.log(
        "Content: Processing media with settings:",
        currentSettings,
        "needsProcessing:",
        needsProcessing
      );
      // Apply settings (speed is applied here, audio effects setup happens here too)
      console.log(
        "[ProcessMedia] Applying settings:",
        JSON.stringify(currentSettings)
      ); // ADDED LOG
      await mediaProcessor.processMediaElements(
        mediaElements,
        currentSettings,
        needsProcessing
      );
    };

    // Initialize with debouncing
    let initializationTimeout: number | null = null;
    const debouncedInitialization = () => {
      if (initializationTimeout) {
        window.clearTimeout(initializationTimeout);
      }

      initializationTimeout = window.setTimeout(async () => {
        try {
          // Wait for settings to be fetched before processing media
          await settingsHandler.ensureInitialized();
          // ADD LOG: Log the settings obtained after initialization
          console.log(`[ContentScript DEBUG] Initialization complete for ${window.location.hostname}. Settings to use initially:`, JSON.stringify(settingsHandler.getCurrentSettings()));
          await processMedia();
        } catch (error) {
          console.error(`Content: Error during delayed initialization on ${window.location.hostname}:`, error); // Add hostname
        }
      }, 100); // Reduced initial delay from 1000ms
    };

    // Listen for settings updates from the background script
    chrome.runtime.onMessage.addListener(
      (
        message: MessageType,
        sender: chrome.runtime.MessageSender, // Added explicit type
        sendResponse: (response?: any) => void // Added explicit type
      ) => {
        console.log(
          "[ContentScript Listener] Received message:",
          JSON.stringify(message)
        ); // Log ALL received messages

        if (message.type === "UPDATE_SETTINGS") {
          const updateSettingsMessage = message as UpdateSettingsMessage;
          console.log(
            "[ContentScript Listener] Processing UPDATE_SETTINGS from background/popup"
            // No longer strictly checking hostname here, assuming background sent it correctly
          );

          // Apply the update since SettingsEventHandler should have targeted correctly
          console.log(
            "Content: Applying settings update received via message."
          );
          settingsHandler.updateSettings(updateSettingsMessage.settings);

          // Now, re-run processMedia to apply the new settings
          console.log(
            "Content: Settings updated via message, reprocessing media elements..."
          );
          processMedia().catch((error) => {
            console.error(
              "Content: Error during processMedia after settings update:",
              error
            );
          });
        }
        // Return false or undefined if not sending an async response
        return false;
      }
    );

    // Initial setup
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", debouncedInitialization);
    } else {
      debouncedInitialization();
    }

    // Watch for dynamic changes
    mediaProcessor.setupMediaObserver(processMedia);
  },
});
