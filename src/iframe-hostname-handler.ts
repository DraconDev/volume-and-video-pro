import { SettingsHandler } from "./settings-handler";
import { MediaProcessor } from "./media-processor";

type InitializeScriptCallback = (hostname: string) => Promise<void>;

export function setupHostnameDetection(
  initializeScript: InitializeScriptCallback
): () => void {
  let cleanupFunctions: (() => void)[] = [];

  if (window.self === window.top) {
    // --- Running in the TOP window ---
    const topHostname = window.location.hostname;
      `[ContentScript] Running in TOP window. Hostname: ${topHostname}`
    );
    initializeScript(topHostname); // Initialize for the top window

    // Listener for requests from iframes
    const topWindowMessageListener = (event: MessageEvent) => {
        `[ContentScript TOP] Received message. Origin: ${
          event.origin
        }, Data Type: ${typeof event.data}, Data: ${event.data}`
      );

      // Only process messages that are strings and look like our JSON messages
      if (
        typeof event.data !== "string" ||
        !event.data.startsWith("{") ||
        !event.data.endsWith("}")
      ) {
          "[ContentScript TOP] Ignoring non-JSON or non-VVP message from iframe (format mismatch)."
        );
        return;
      }

      // Add a check for our specific message types before parsing
      if (
        !event.data.includes("VVP_REQUEST_TOP_HOSTNAME") &&
        !event.data.includes("VVP_TOP_HOSTNAME_INFO")
      ) {
          "[ContentScript TOP] Ignoring non-VVP message from iframe (content mismatch)."
        );
        return;
      }
      let parsedData;
      try {
        parsedData = JSON.parse(event.data);
      } catch (e) {
        console.warn(
          "[ContentScript TOP] Failed to parse event.data string from iframe (likely not our message):",
          event.data,
          e
        );
        return;
      }

        `[ContentScript TOP] Parsed VVP message from iframe (Origin: ${event.origin}):`,
        parsedData
      );

      if (
        event.source && // Ensure source exists (source is the window object of the sender)
        parsedData &&
        parsedData.type === "VVP_REQUEST_TOP_HOSTNAME"
      ) {
          `[ContentScript TOP] Processing VVP_REQUEST_TOP_HOSTNAME from iframe (Source origin: ${event.origin}). Responding with hostname: ${topHostname}.`
        );
        const responsePayload = JSON.stringify({
          type: "VVP_TOP_HOSTNAME_INFO",
          hostname: topHostname,
          success: true,
        });
        // Handle sandboxed environments where event.origin might be "null"
        const targetOrigin = event.origin === "null" ? "*" : event.origin;
        (event.source as Window).postMessage(responsePayload, targetOrigin);
          `[ContentScript TOP] Sent VVP_TOP_HOSTNAME_INFO response to iframe at ${event.origin}.`
        );
      } else {
          `[ContentScript TOP] Received other parsed JSON message type (not VVP_REQUEST_TOP_HOSTNAME): ${parsedData.type} from origin ${event.origin}`,
          parsedData
        );
      }
    };
    window.addEventListener("message", topWindowMessageListener);
    const removeTopListener = () => window.removeEventListener("message", topWindowMessageListener);
    cleanupFunctions.push(removeTopListener);
  } else {
    // --- Running in an IFRAME ---
    const iframeOwnHostname = window.location.hostname;
      `[ContentScript iFrame] Running in IFRAME. Own hostname: ${iframeOwnHostname}. Attempting to request hostname from top window. Setting up message listener.`
    );
    let receivedHostname = false;
    let fallbackTimeout: number | null = null;

    // Listener for the response from the top window
    const responseListener = (event: MessageEvent) => {
        `[ContentScript iFrame] Received message. Origin: ${
          event.origin
        }, Data Type: ${typeof event.data}, Data: ${event.data}`
      );

      // Only process messages from the top window
      if (event.source !== window.top) {
          `[ContentScript iFrame] Received message from non-top source: ${event.origin}. Ignoring.`
        );
        return;
      }

      // Only process messages that are strings and look like our JSON messages
      if (
        typeof event.data !== "string" ||
        !event.data.startsWith("{") ||
        !event.data.endsWith("}")
      ) {
          "[ContentScript iFrame] Ignoring non-JSON or non-VVP message from top (format mismatch)."
        );
        return;
      }

      // Add a check for our specific message types before parsing
      if (
        !event.data.includes("VVP_REQUEST_TOP_HOSTNAME") &&
        !event.data.includes("VVP_TOP_HOSTNAME_INFO")
      ) {
          "[ContentScript iFrame] Ignoring non-VVP message from top (content mismatch)."
        );
        return;
      }

      let parsedData;
      try {
        parsedData = JSON.parse(event.data);
      } catch (e) {
        console.warn(
          "[ContentScript iFrame] Failed to parse event.data string from top:",
          event.data,
          e
        );
        return;
      }

        `[ContentScript iFrame] Parsed VVP message from top (Origin: ${event.origin}):`,
        parsedData
      );

      if (
        parsedData &&
        parsedData.type === "VVP_TOP_HOSTNAME_INFO" &&
        typeof parsedData.hostname === "string"
      ) {
        if (fallbackTimeout) {
          clearTimeout(fallbackTimeout);
          fallbackTimeout = null;
        }
        if (receivedHostname) {
            `[ContentScript iFrame] Already received hostname. Ignoring duplicate VVP_TOP_HOSTNAME_INFO from top. Origin: ${event.origin}. Parsed Data:`,
            parsedData
          );
          return;
        }
        receivedHostname = true;
          `[ContentScript iFrame] Successfully received VVP_TOP_HOSTNAME_INFO from top: ${parsedData.hostname}. Origin: ${event.origin}. Initializing script. Parsed data:`,
          parsedData
        );
        window.removeEventListener("message", responseListener);
        // Remove the cleanup function by filtering with the same reference
        cleanupFunctions = cleanupFunctions.filter((f) => f !== removeResponseListener);
        initializeScript(parsedData.hostname);
      } else if (parsedData && parsedData.type) {
          `[ContentScript iFrame] Received other parsed JSON message type from top: ${parsedData.type} from origin ${event.origin}`,
          parsedData
        );
      }
    };

    // Store the cleanup function in a variable so we can reference it for removal
    const removeResponseListener = () => window.removeEventListener("message", responseListener);

    window.addEventListener("message", responseListener);
    cleanupFunctions.push(removeResponseListener);

    // Request the hostname from the top window, sending stringified JSON
    if (window.top && window.top !== window.self) {
      // Add a small delay before sending the message to give the top window's script time to initialize
      const requestTimeout = setTimeout(() => {
        // Re-check window.top inside the timeout callback to satisfy TypeScript and ensure runtime safety
        if (window.top && window.top !== window.self) {
            `[ContentScript iFrame] Sending VVP_REQUEST_TOP_HOSTNAME to top window (Origin: ${window.location.origin}).`
          );
          const messagePayload = JSON.stringify({
            type: "VVP_REQUEST_TOP_HOSTNAME",
            fromIframe: true,
            iframeOrigin: window.location.origin,
          });
          window.top.postMessage(messagePayload, "*");
            `[ContentScript iFrame] Sent VVP_REQUEST_TOP_HOSTNAME to top window.`
          );
        } else {
          console.warn(
            `[ContentScript iFrame] window.top became null or self within setTimeout. Cannot send message.`
          );
        }
      }, 500); // Delay by 500ms
      cleanupFunctions.push(() => clearTimeout(requestTimeout));
    } else {
      console.warn(
        `[ContentScript iFrame] window.top is null, same as self, or inaccessible. Initializing with own hostname: ${iframeOwnHostname}.`
      );
      initializeScript(iframeOwnHostname);
      window.removeEventListener("message", responseListener); // Clean up listener as it's not needed
      cleanupFunctions = cleanupFunctions.filter((f) => f !== removeResponseListener);
      return () => cleanupFunctions.forEach((f) => f()); // Return cleanup immediately
    }

    // Fallback timeout in case the message never arrives
    const TIMEOUT_DURATION = 10000; // Increased timeout to 10 seconds
      `[ContentScript iFrame] Setting fallback timeout for ${TIMEOUT_DURATION}ms. Timeout ID: ${fallbackTimeout}`
    );
    fallbackTimeout = window.setTimeout(() => {
        `[ContentScript iFrame] Fallback timeout triggered. Timeout ID: ${fallbackTimeout}. receivedHostname: ${receivedHostname}`
      );
      fallbackTimeout = null; // Clear the timeout ID
      if (!receivedHostname) {
        console.warn(
          `[ContentScript iFrame] Did not receive hostname from top after ${TIMEOUT_DURATION}ms. Using own hostname: ${iframeOwnHostname}. Removing response listener.`
        );
        window.removeEventListener("message", responseListener); // Clean up listener
        cleanupFunctions = cleanupFunctions.filter((f) => f !== removeResponseListener);
        initializeScript(iframeOwnHostname); // Initialize with own hostname as fallback
      } else {
          `[ContentScript iFrame] Fallback timeout triggered, but hostname was already received. No action needed.`
        );
      }
    }, TIMEOUT_DURATION);
    cleanupFunctions.push(() => {
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
        fallbackTimeout = null;
      }
    });
  }
  return () => cleanupFunctions.forEach((f) => f());
}
