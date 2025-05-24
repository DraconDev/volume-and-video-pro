import { SettingsHandler } from "./settings-handler";
import { MediaProcessor } from "./media-processor";

type InitializeScriptCallback = (hostname: string) => Promise<void>;

export function setupHostnameDetection(
  initializeScript: InitializeScriptCallback
) {
  if (window.self === window.top) {
    // --- Running in the TOP window ---
    const topHostname = window.location.hostname;
    console.log(
      `[ContentScript] Running in TOP window. Hostname: ${topHostname}`
    );
    initializeScript(topHostname); // Initialize for the top window

    // Listen for requests from iframes
    window.addEventListener("message", (event: MessageEvent) => {
      let parsedData;
      if (typeof event.data === "string") {
        try {
          parsedData = JSON.parse(event.data);
        } catch (e) {
          // Not a JSON string, or not one we care about.
          // console.log('[ContentScript Top] Received non-JSON string message or parse error:', event.data, e);
          return;
        }
      } else {
        // Not a string, so not our VVP_ message.
        // console.log('[ContentScript Top] Received non-string message:', event.data);
        return;
      }

      if (
        event.source && // Ensure source exists (source is the window object of the sender)
        parsedData &&
        parsedData.type === "VVP_REQUEST_TOP_HOSTNAME"
      ) {
        console.log(
          `[ContentScript Top] Received VVP_REQUEST_TOP_HOSTNAME from an iframe (Source origin: ${event.origin}). Responding with hostname: ${topHostname}. Parsed data:`,
          parsedData
        );
        // Respond directly to the iframe that sent the message, with stringified JSON
        (event.source as Window).postMessage(
          JSON.stringify({
            type: "VVP_TOP_HOSTNAME_INFO",
            hostname: topHostname,
            success: true,
          }),
          event.origin // Respond to the specific origin of the iframe
        );
      } else if (parsedData && parsedData.type) {
        // Log other parsed JSON messages received by top window for debugging if necessary
        // console.log(`[ContentScript Top] Received other parsed JSON message type: ${parsedData.type} from origin ${event.origin}`, parsedData);
      }
    });
  } else {
    // --- Running in an IFRAME ---
    const iframeOwnHostname = window.location.hostname;
    console.log(
      `[ContentScript iFrame] Running in IFRAME. Own hostname: ${iframeOwnHostname}. Attempting to request hostname from top window.`
    );
    let receivedHostname = false;
    let fallbackTimeout: number | null = null;

    // Listener for the response from the top window
    const responseListener = (event: MessageEvent) => {
      if (event.source !== window.top) return; // Message not from top

      let parsedData;
      if (typeof event.data === "string") {
        try {
          parsedData = JSON.parse(event.data);
        } catch (e) {
          // console.warn('[ContentScript iFrame] Failed to parse event.data string from top:', event.data, e);
          return;
        }
      } else {
        // console.warn('[ContentScript iFrame] Received non-string event.data from top:', event.data);
        return;
      }

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
          console.log(
            `[ContentScript iFrame] Already received hostname. Ignoring duplicate VVP_TOP_HOSTNAME_INFO from top. Origin: ${event.origin}. Parsed Data:`,
            parsedData
          );
          return;
        }
        receivedHostname = true;
        console.log(
          `[ContentScript iFrame] Successfully received VVP_TOP_HOSTNAME_INFO from top: ${parsedData.hostname}. Origin: ${event.origin}. Initializing script. Parsed data:`,
          parsedData
        );
        window.removeEventListener("message", responseListener);
        initializeScript(parsedData.hostname);
      } else if (parsedData && parsedData.type) {
        // console.log(`[ContentScript iFrame] Received other parsed JSON message type from top: ${parsedData.type} from origin ${event.origin}`, parsedData);
      }
    };
    window.addEventListener("message", responseListener);

    // Request the hostname from the top window, sending stringified JSON
    if (window.top && window.top !== window.self) {
      console.log(
        `[ContentScript iFrame] Sending VVP_REQUEST_TOP_HOSTNAME to top window (Origin: ${window.location.origin}).`
      );
      const messagePayload = JSON.stringify({
        type: "VVP_REQUEST_TOP_HOSTNAME",
        fromIframe: true,
        iframeOrigin: window.location.origin,
      });
      window.top.postMessage(messagePayload, "*");
    } else {
      console.warn(
        `[ContentScript iFrame] window.top is null, same as self, or inaccessible. Cannot request hostname from top. Initializing with own hostname: ${iframeOwnHostname}.`
      );
      // Initialize with own hostname immediately if top is inaccessible or is self
      initializeScript(iframeOwnHostname);
      window.removeEventListener("message", responseListener); // Clean up listener as it's not needed
      return; // Exit early
    }

    // Fallback timeout in case the message never arrives
    const TIMEOUT_DURATION = 10000; // Increased timeout to 10 seconds
    console.log(
      `[ContentScript iFrame] Setting fallback timeout for ${TIMEOUT_DURATION}ms.`
    );
    fallbackTimeout = window.setTimeout(() => {
      fallbackTimeout = null; // Clear the timeout ID
      if (!receivedHostname) {
        console.warn(
          `[ContentScript iFrame] Did not receive hostname from top after ${TIMEOUT_DURATION}ms. Falling back to own hostname: ${iframeOwnHostname}. Removing response listener.`
        );
        window.removeEventListener("message", responseListener); // Clean up listener
        initializeScript(iframeOwnHostname); // Initialize with own hostname as fallback
      } else {
        console.log(
          `[ContentScript iFrame] Fallback timeout triggered, but hostname was already received. No action needed.`
        );
      }
    }, TIMEOUT_DURATION);
  }
}
