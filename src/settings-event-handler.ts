import { settingsManager } from "./settings-manager";
import { AudioSettings, MessageType, UpdateSettingsMessage } from "./types"; // Added UpdateSettingsMessage

// Helper to get hostname safely and filter non-http(s) URLs
function getHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsedUrl = new URL(url);
    // Only allow http/https URLs to avoid chrome:// and other internal pages
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }
    return parsedUrl.hostname;
  } catch (e) {
    console.warn("SettingsEventHandler: Invalid URL:", url);
    return null;
  }
}


// Helper to send message to a specific tab, ignoring errors
async function sendMessageToTab(tabId: number, message: MessageType, frameId?: number) {
  try {
    // Check if tab exists before sending
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      console.debug(`SettingsEventHandler: Tab ${tabId} no longer exists`);
      return;
    }
    
    // If frameId is provided, send to specific frame, otherwise defaults to all frames.
    // For settings updates, we typically want to target the main frame (0).
    const options = frameId !== undefined ? { frameId } : {};
    await chrome.tabs.sendMessage(tabId, message, options);
  } catch (error) {
    const errorMessage = String(error);
    if (errorMessage.includes("Could not establish connection")) {
      console.debug(
        `SettingsEventHandler: Could not establish connection to tab ${tabId} for message type ${message.type}. Content script might not be ready. Error:`,
        error
      );
    } else if (error) { // Handle other errors as warnings
      console.warn(
        `SettingsEventHandler: Error sending message to tab ${tabId}. Type: ${message.type}. Error:`,
        error
      );
    }
  }
}

/**
 * Broadcasts updated site-specific settings to relevant tabs.
 * Exported to be called directly by SettingsManager.
 */
export async function broadcastSiteSettingsUpdate(
  hostname: string,
  newSiteSettings: AudioSettings
) {
  if (!hostname) {
    console.warn("SettingsEventHandler: broadcastSiteSettingsUpdate called with no hostname.");
    return;
  }
  console.log(`[!!!] Broadcasting site settings update for ${hostname}`);
  console.log(
    `SettingsEventHandler: Broadcasting site settings data for ${hostname}`,
    newSiteSettings
  );

  // Query for tabs that match the hostname directly
  const tabs = await chrome.tabs.query({ url: `*://${hostname}/*` });
  
  console.log(
    `[EventHandler] Found ${tabs.length} tabs matching hostname ${hostname} for site settings update.`
  );

  for (const tab of tabs) {
    // Double-check hostname just in case query is too broad or URL changes, though unlikely with specific query
    const tabHostname = getHostname(tab.url);
    if (tab.id && tabHostname === hostname) {
      const message: UpdateSettingsMessage = {
        type: "UPDATE_SETTINGS",
        settings: newSiteSettings,
        hostname: hostname,
      };
      console.log(
        `[EventHandler] Sending site settings update to tab ${tab.id} (${hostname})`,
        message
      );
      sendMessageToTab(tab.id as number, message, 0); // Specify main frame
    } else {
      // This case should ideally not be hit if chrome.tabs.query with URL pattern is accurate
      console.warn(`[EventHandler] Tab ${tab.id} matched query for ${hostname} but getHostname resolved to ${tabHostname}. Skipping.`);
    }
  }
}

/**
 * Broadcasts updated global settings to relevant tabs.
 * Exported to be called directly by SettingsManager.
 */
export async function broadcastGlobalSettingsUpdate(
  newGlobalSettings: AudioSettings
) {
  console.log(`[!!!] Broadcasting global settings update`); // ADDED LOG
  console.log(
    "SettingsEventHandler: Broadcasting global settings data",
    newGlobalSettings
  );
  const tabs = await chrome.tabs.query({});
  console.log(
    `[EventHandler] Found ${tabs.length} tabs to check for global update`
  ); // Log tab count
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      const tabHostname = getHostname(tab.url);
      if (tabHostname) {
        const siteConfig = settingsManager.getSettingsForSite(tabHostname);
        console.log(
          `[EventHandler] Checking tab ${tab.id} (${tabHostname}) for global update. Site config:`,
          siteConfig
        ); // Log check
        // Send update if no site config exists or if site is set to global mode
        if (!siteConfig || siteConfig.activeSetting === "global") {
          console.log(
            `[EventHandler] Tab ${tab.id} (${tabHostname}) qualifies for global update.`
          ); // Log qualification
          const message: UpdateSettingsMessage = {
            type: "UPDATE_SETTINGS",
            settings: newGlobalSettings,
            hostname: tabHostname,
          };
          console.log(
            `[EventHandler] Sending global update to tab ${tab.id} (${tabHostname})`,
            message
          ); // ADDED LOG
          sendMessageToTab(tab.id, message, 0); // Specify main frame
        }
      }
    }
  }
}

/**
 * Broadcasts updated site mode and the effective settings to relevant tabs.
 * Exported to be called directly by SettingsManager.
 */
export async function broadcastSiteModeUpdate(
  hostname: string,
  mode: string,
  effectiveSettings: AudioSettings
) {
  if (!hostname) {
    console.warn("SettingsEventHandler: broadcastSiteModeUpdate called with no hostname.");
    return;
  }
  console.log(`[!!!] Broadcasting site mode update for ${hostname} to ${mode}`);
  console.log(`SettingsEventHandler: Broadcasting mode data for ${hostname}`, {
    mode,
    effectiveSettings,
  });

  // Query for tabs that match the hostname directly
  const tabs = await chrome.tabs.query({ url: `*://${hostname}/*` });

  console.log(
    `[EventHandler] Found ${tabs.length} tabs matching hostname ${hostname} for site mode update.`
  );

  for (const tab of tabs) {
    // Double-check hostname
    const tabHostname = getHostname(tab.url);
    if (tab.id && tabHostname === hostname) {
      const message: UpdateSettingsMessage = {
        type: "UPDATE_SETTINGS", // Still send UPDATE_SETTINGS
        settings: effectiveSettings, // Send the settings appropriate for the new mode
        hostname: hostname,
      };
      console.log(
        `[EventHandler] Sending site mode update (as UPDATE_SETTINGS) to tab ${tab.id} (${hostname})`,
        message
      );
      sendMessageToTab(tab.id, message, 0); // Specify main frame
    } else {
      console.warn(`[EventHandler] Tab ${tab.id} matched query for ${hostname} (mode update) but getHostname resolved to ${tabHostname}. Skipping.`);
    }
  }
}

export function setupSettingsEventHandler() {
  console.log("SettingsEventHandler: Listeners are now handled directly by SettingsManager");
}
