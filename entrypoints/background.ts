import { storage } from "wxt/storage";
import { defineBackground } from "wxt/sandbox";

export default defineBackground(() => {
    chrome.runtime.onInstalled.addListener(() => {
        // Initialize default volume if not set
        chrome.storage.sync.get(["volumeBoost"], (result) => {
            if (result.volumeBoost === undefined) {
                chrome.storage.sync.set({ volumeBoost: 100 });
            }
        });
    });

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "SET_VOLUME") {
            const { volume } = message;
            chrome.storage.sync.set({ volumeBoost: volume });

            // Update all tabs with new volume
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach((tab) => {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            type: "UPDATE_VOLUME",
                            volume,
                        });
                    }
                });
            });
        }
    });

    // Update badge when volume changes
    chrome.storage.sync.get("volumeBoost", (result) => {
        if (result.volumeBoost) {
            updateBadge(result.volumeBoost);
        }
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.volumeBoost) {
            updateBadge(changes.volumeBoost.newValue);
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
