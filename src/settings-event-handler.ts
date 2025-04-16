import { settingsManager } from "./settings-manager";
import { AudioSettings, MessageType, UpdateSettingsMessage } from "./types"; // Added UpdateSettingsMessage

// Helper to get hostname safely
function getHostname(url: string | undefined): string | null {
    if (!url) return null;
    try {
        return new URL(url).hostname;
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
        console.warn(`SettingsEventHandler: Error sending message to tab ${tabId}. Type: ${message.type}. Error:`, error);
    }
}

export function setupSettingsEventHandler() {
    console.log("SettingsEventHandler: Setting up listeners...");

    // --- Listener for Global Settings Changes ---
    settingsManager.on(
        "globalSettingsChanged",
        async (newGlobalSettings: AudioSettings) => {
            console.log("SettingsEventHandler: globalSettingsChanged event", newGlobalSettings);
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.id && tab.url) {
                    const tabHostname = getHostname(tab.url);
                    if (tabHostname) {
                        const siteConfig = settingsManager.getSettingsForSite(tabHostname);
                        // Send update if no site config exists or if site is set to global mode
                        if (!siteConfig || siteConfig.activeSetting === "global") {
                            const message: UpdateSettingsMessage = {
                                type: "UPDATE_SETTINGS",
                                settings: newGlobalSettings,
                                hostname: tabHostname,
                            };
                            console.log(`[EventHandler] Sending global update to tab ${tab.id} (${tabHostname})`, message); // ADDED LOG
                            sendMessageToTab(tab.id, message);
                        }
                    }
                }
            }
        }
    );

    // --- Listener for Site-Specific Settings Changes ---
    settingsManager.on(
        "siteSettingsChanged",
        async (hostname: string, newSiteSettings: AudioSettings) => {
             console.log(`[!!!] SettingsEventHandler: siteSettingsChanged listener ENTERED for ${hostname}`); // ADDED VERY VISIBLE LOG
             console.log(`SettingsEventHandler: siteSettingsChanged event data for ${hostname}`, newSiteSettings);
             const tabs = await chrome.tabs.query({});
             console.log(`[EventHandler] Found ${tabs.length} tabs to check for hostname ${hostname}`); // Log tab count
             for (const tab of tabs) {
                 const tabHostname = getHostname(tab.url);
                 console.log(`[EventHandler] Checking tab ${tab.id} (${tabHostname}) against ${hostname}`); // Log each tab check
                 if (tab.id && tabHostname === hostname) {
                     const message: UpdateSettingsMessage = {
                         type: "UPDATE_SETTINGS",
                         settings: newSiteSettings, // Send the actual site-specific settings
                         hostname: hostname,
                     };
                     console.log(`[EventHandler] Sending site settings update to tab ${tab.id} (${hostname})`, message); // ADDED LOG
                     sendMessageToTab(tab.id, message);
                 }
             }
        }
    );

     // --- Listener for Site Mode Changes ---
    settingsManager.on(
        "siteModeChanged",
        async (hostname: string, mode: string, effectiveSettings: AudioSettings) => {
            console.log(`SettingsEventHandler: siteModeChanged event for ${hostname} to ${mode}`, effectiveSettings);
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.id && getHostname(tab.url) === hostname) {
                     const message: UpdateSettingsMessage = {
                         type: "UPDATE_SETTINGS",
                         settings: effectiveSettings, // Send the settings appropriate for the new mode
                         hostname: hostname,
                     };
                     console.log(`[EventHandler] Sending site mode update to tab ${tab.id} (${hostname})`, message); // ADDED LOG
                     sendMessageToTab(tab.id, message);
                 }
            }
        }
    );

    console.log("SettingsEventHandler: Listeners set up.");
}
