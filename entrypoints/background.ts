import { storage } from "wxt/storage";
import { defineBackground } from "wxt/sandbox";

interface AudioSettings {
    volume: number;
    bassBoost: number;
    voiceBoost: number;
    mono: boolean;
    speed: number;
}

const defaultSettings: AudioSettings = {
    volume: 100,
    bassBoost: 100,
    voiceBoost: 100,
    mono: false,
    speed: 100,
};

export default defineBackground(() => {
    chrome.runtime.onInstalled.addListener(() => {
        // Initialize storage with default settings
        chrome.storage.sync.get(
            ["audioSettings", "disabledSites"],
            (result) => {
                if (!result.audioSettings) {
                    chrome.storage.sync.set({
                        audioSettings: defaultSettings,
                    });
                }
                if (!result.disabledSites) {
                    chrome.storage.sync.set({ disabledSites: [] });
                }
            }
        );
    });

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("Background: Received message:", message);
        if (message.type === "UPDATE_SETTINGS") {
            console.log("Background: Updating settings:", message.settings);
            const { settings } = message;
            chrome.storage.sync.set({ audioSettings: settings });

            // Update all tabs with new settings
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach((tab) => {
                    if (tab.id) {
                        console.log(
                            "Background: Sending settings to tab",
                            tab.id
                        );
                        chrome.tabs.sendMessage(tab.id, {
                            type: "UPDATE_SETTINGS",
                            settings,
                        });
                    }
                });
            });
        }
    });

    // Update badge when settings change
    // console.log("Background: Loading initial settings for badge");
    // chrome.storage.sync.get("audioSettings", (result) => {
    //     console.log("Background: Got settings for badge:", result);
    //     if (result.audioSettings) {
    //         updateBadge(result.audioSettings.volume);
    //     }
    // });

    // Listen for storage changes
    // chrome.storage.onChanged.addListener((changes) => {
    //     console.log("Background: Storage changed:", changes);
    //     if (changes.audioSettings) {
    //         console.log("Background: Updating badge with new volume:", changes.audioSettings.newValue.volume);
    //         updateBadge(changes.audioSettings.newValue.volume);
    //     }
    // });

    // Check if a site is enabled before injecting content script
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (changeInfo.status === "loading" && tab.url) {
            try {
                const url = new URL(tab.url);
                const hostname = url.hostname;

                // Skip chrome:// and other special URLs
                if (!url.protocol.startsWith("http")) {
                    return;
                }

                const result = await chrome.storage.sync.get(["disabledSites"]);
                const disabledSites = result.disabledSites || [];

                // Don't inject if site is disabled
                if (!disabledSites.includes(hostname)) {
                    chrome.scripting.executeScript({
                        target: { tabId },
                        files: ["content.js"],
                    });
                }
            } catch (error) {
                console.error("Error injecting content script:", error);
            }
        }
    });
});

function updateBadge(volume: number) {
    // Format the volume text (e.g., "150%" -> "150")
    const text = volume >= 999 ? "999" : volume.toString();

    // Set badge text
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: "#2563eb" }); // Blue for boost
}
