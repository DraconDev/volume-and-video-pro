import { storage } from "wxt/storage";
import { defineBackground } from "wxt/sandbox";

interface AudioSettings {
    volume: number;
    bassBoost: number;
    voiceBoost: number;
}

const defaultSettings: AudioSettings = {
    volume: 100,
    bassBoost: 100,
    voiceBoost: 100,
};

export default defineBackground(() => {
    chrome.runtime.onInstalled.addListener(() => {
        // Initialize default settings if not set
        console.log("Background: Extension installed/updated, checking settings");
        chrome.storage.sync.get(["audioSettings"], (result) => {
            console.log("Background: Current storage state:", result);
            if (!result.audioSettings) {
                console.log("Background: No settings found, initializing with defaults:", defaultSettings);
                chrome.storage.sync.set({ audioSettings: defaultSettings });
            } else {
                console.log("Background: Existing settings found:", result.audioSettings);
            }
        });
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
                        console.log("Background: Sending settings to tab", tab.id);
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
    console.log("Background: Loading initial settings for badge");
    chrome.storage.sync.get("audioSettings", (result) => {
        console.log("Background: Got settings for badge:", result);
        if (result.audioSettings) {
            updateBadge(result.audioSettings.volume);
        }
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
        console.log("Background: Storage changed:", changes);
        if (changes.audioSettings) {
            console.log("Background: Updating badge with new volume:", changes.audioSettings.newValue.volume);
            updateBadge(changes.audioSettings.newValue.volume);
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
