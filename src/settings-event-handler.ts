import { settingsManager } from "./settings-manager";
import { AudioSettings, MessageType } from "./types";

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
        // Ignore errors (e.g., tab closed, content script not ready)
        // console.debug(`SettingsEventHandler: Could not send to tab ${tabId}:`, error);
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
                            sendMessageToTab(tab.id, {
                                type: "UPDATE_SETTINGS",
                                settings: newGlobalSettings,
                                hostname: tabHostname, // Content script needs hostname to filter relevant messages
                                // isGlobal flag might be useful for UI, but content script uses hostname
                            });
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
             console.log(`SettingsEventHandler: siteSettingsChanged event for ${hostname}`, newSiteSettings);
             const tabs = await chrome.tabs.query({});
             for (const tab of tabs) {
                 if (tab.id && getHostname(tab.url) === hostname) {
                     sendMessageToTab(tab.id, {
                         type: "UPDATE_SETTINGS",
                         settings: newSiteSettings,
                         hostname: hostname,
                     });
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
                     sendMessageToTab(tab.id, {
                         type: "UPDATE_SETTINGS",
                         settings: effectiveSettings, // Send the settings appropriate for the new mode
                         hostname: hostname,
                     });
                 }
            }
        }
    );

    console.log("SettingsEventHandler: Listeners set up.");
}
