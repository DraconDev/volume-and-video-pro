import { settingsManager } from "./settings-manager";
import { AudioSettings, MessageType, UpdateSettingsMessage } from "./types"; // Added UpdateSettingsMessage

// Helper to get hostname safely and filter non-http(s) URLs
function getHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsedUrl = new URL(url);
    // Only allow http/https URLs to avoid chrome:// and other internal pages
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }
    return parsedUrl.hostname;
  } catch (e) {
    console.warn("SettingsEventHandler: Invalid URL:", url);
    return null;
  }
}

// Helper to send message to a specific tab, ignoring errors
async function sendMessageToTab(tabId: number, message: MessageType) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    // Log errors more visibly for debugging
    console.warn(
      `SettingsEventHandler: Error sending message to tab ${tabId}. Type: ${message.type}. Error:`,
      error
    );
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
  console.log(`[!!!] Broadcasting site settings update for ${hostname}`); // ADDED LOG
  console.log(
    `SettingsEventHandler: Broadcasting site settings data for ${hostname}`,
    newSiteSettings
  );
  console.log("SettingsEventHandler: Broadcasting site settings data for all frames");
  const tabs = await chrome.tabs.query({});
  console.log(
    `[EventHandler] Found ${tabs.length} tabs to check for hostname ${hostname}`
  ); // Log tab count
  for (const tab of tabs) {
    const tabHostname = getHostname(tab.url);
    console.log(
      `[EventHandler] Checking tab ${tab.id} (${tabHostname}) against ${hostname}`
    ); // Log each tab check
    if (tab.id && tabHostname === hostname) {
      const message: UpdateSettingsMessage = {
        type: "UPDATE_SETTINGS",
        settings: newSiteSettings, // Send the actual site-specific settings
        hostname: hostname,
      };
      console.log(
        `[EventHandler] Sending site settings update to tab ${tab.id} (${hostname})`,
        message
      ); // ADDED LOG

          // Only send to main frame (frameId 0) to avoid subframe connection issues
          console.log(`[EventHandler] Sending settings to main frame (frameId 0) in tab ${tab.id} (${hostname})`);
          sendMessageToTab(tab.id as number, message);
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
          sendMessageToTab(tab.id, message);
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
  console.log(`[!!!] Broadcasting site mode update for ${hostname} to ${mode}`); // ADDED LOG
  console.log(`SettingsEventHandler: Broadcasting mode data for ${hostname}`, {
    mode,
    effectiveSettings,
  });
  const tabs = await chrome.tabs.query({});
  console.log(
    `[EventHandler] Found ${tabs.length} tabs to check for mode update on ${hostname}`
  ); // Log tab count
  for (const tab of tabs) {
    const tabHostname = getHostname(tab.url);
    console.log(
      `[EventHandler] Checking tab ${tab.id} (${tabHostname}) against ${hostname} for mode update`
    ); // Log each tab check
    if (tab.id && tabHostname === hostname) {
      const message: UpdateSettingsMessage = {
        type: "UPDATE_SETTINGS", // Still send UPDATE_SETTINGS
        settings: effectiveSettings, // Send the settings appropriate for the new mode
        hostname: hostname,
      };
      console.log(
        `[EventHandler] Sending site mode update (as UPDATE_SETTINGS) to tab ${tab.id} (${hostname})`,
        message
      ); // ADDED LOG
      sendMessageToTab(tab.id, message);
    }
  }
}

export function setupSettingsEventHandler() {
  console.log("SettingsEventHandler: Setting up listeners...");

  // --- Listener for Global Settings Changes --- (REMOVED - Now handled by direct call to broadcastGlobalSettingsUpdate)
  // settingsManager.on("globalSettingsChanged", broadcastGlobalSettingsUpdate); // Keep this commented out or remove

  // --- Listener for Site-Specific Settings Changes --- (REMOVED - Now handled by direct call to broadcastSiteSettingsUpdate)
  // settingsManager.on("siteSettingsChanged", broadcastSiteSettingsUpdate); // Keep this commented out or remove

  // --- Listener for Site Mode Changes --- (REMOVED - Now handled by direct call to broadcastSiteModeUpdate)
  // settingsManager.on("siteModeChanged", broadcastSiteModeUpdate); // Keep this commented out or remove

  console.log(
    "SettingsEventHandler: Listeners set up (only event emitters are no longer used for site/mode changes)."
  ); // Updated log
}
