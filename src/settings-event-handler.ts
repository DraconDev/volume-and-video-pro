import { settingsManager } from "./settings-manager";
import { MessageType } from "./types";

// Helper function to broadcast settings to all active tabs
// Update the broadcastSettings function to accept hostname
async function broadcastSettings(
    settings: any,
    isGlobal: boolean,
    enabled: boolean,
    hostname?: string
) {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (tab.id && tab.url) {
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    type: "UPDATE_SETTINGS",
                    settings,
                    isGlobal,
                    enabled,
                    hostname
                } as MessageType);
            } catch (error) {
                // Ignore errors for inactive tabs
                console.debug(
                    "Settings Event Handler: Could not send to tab:",
                    tab.id,
                    error
                );
            }
        }
    }
}

export function setupSettingsEventHandler() {
    settingsManager.on(
        "settingsUpdated",
        async (settings: any, hostname?: string, tabId?: number) => {
            console.log(
                "Settings Event Handler: settingsUpdated event received",
                {
                    settings,
                    hostname,
                    tabId,
                }
            );

            const isGlobal = hostname ? 
                settingsManager.getSettingsForSite(hostname)?.activeSetting === "global" 
                : false;

            if (tabId) {
                await chrome.tabs.sendMessage(tabId, {
                    type: "UPDATE_SETTINGS",
                    settings,
                    isGlobal,
                    enabled: true,
                    hostname
                } as MessageType).catch((error) =>
                    console.error(
                        "Settings Event Handler: Error sending settings to tab",
                        tabId,
                        error
                    )
                );
            } else {
                await broadcastSettings(settings, isGlobal, true, hostname).catch(console.error);
            }
        }
    );
}
