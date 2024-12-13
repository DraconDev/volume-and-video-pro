import { defineContentScript } from "wxt/sandbox";

export default defineContentScript({
    matches: ["<all_urls>"],
    runAt: "document_start",
    async main() {
        let volumeBoost = 100;
        const audioContexts = new WeakMap();

        // Get initial volume setting
        chrome.storage.sync.get(["volumeBoost"], (result) => {
            if (result.volumeBoost) {
                volumeBoost = result.volumeBoost;
                updateVolume(volumeBoost);
            }
        });

        // Function to setup audio context for an element
        const setupAudioContext = (element: HTMLMediaElement) => {
            if (!audioContexts.has(element)) {
                try {
                    const context = new AudioContext();
                    const source = context.createMediaElementSource(element);
                    const gain = context.createGain();

                    // Connect the audio graph
                    source.connect(gain);
                    gain.connect(context.destination);

                    // Store the context and gain node
                    audioContexts.set(element, { context, gain });
                } catch (error) {
                    console.error("Error setting up audio context:", error);
                }
            }
        };

        // Function to update volume for all audio/video elements
        const updateVolume = (volume: number) => {
            const gainValue = volume / 100;
            const mediaElements = document.querySelectorAll("audio, video");

            mediaElements.forEach((element) => {
                if (element instanceof HTMLMediaElement) {
                    setupAudioContext(element);
                    const audioContext = audioContexts.get(element);
                    if (audioContext) {
                        audioContext.gain.gain.value = gainValue;
                        console.log("Updated gain to:", gainValue);
                    }
                }
            });
        };

        // Listen for new media elements
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLMediaElement) {
                        setupAudioContext(node);
                        updateVolume(volumeBoost);
                    }
                });
            });
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        // Listen for volume update messages
        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === "UPDATE_VOLUME") {
                volumeBoost = message.volume;
                updateVolume(volumeBoost);
            }
            return true; // Keep the message channel open
        });

        // Initial volume update
        updateVolume(volumeBoost);
    },
});
