import { defineContentScript } from "wxt/sandbox";

interface AudioSettings {
    volume: number;
    bassBoost: number;
    voiceBoost: number;
}

export default defineContentScript({
    matches: ["<all_urls>"],
    runAt: "document_start",
    async main() {
        const defaultSettings: AudioSettings = {
            volume: 100,
            bassBoost: 100,
            voiceBoost: 100,
        };

        let settings = { ...defaultSettings };
        const audioContexts = new WeakMap();

        // Get initial settings
        chrome.storage.sync.get(["audioSettings"], (result) => {
            if (result.audioSettings) {
                settings = result.audioSettings;
                updateAllEffects();
            }
        });

        // Function to setup audio context for an element
        const setupAudioContext = (element: HTMLMediaElement) => {
            if (!audioContexts.has(element)) {
                try {
                    const context = new AudioContext();
                    const source = context.createMediaElementSource(element);

                    // Create gain node for volume
                    const gainNode = context.createGain();
                    gainNode.gain.value = 1.0;

                    // Create bass boost filter
                    const bassFilter = context.createBiquadFilter();
                    bassFilter.type = 'lowshelf';
                    bassFilter.frequency.value = 150;
                    bassFilter.gain.value = 0;

                    // Create voice boost filter
                    const voiceFilter = context.createBiquadFilter();
                    voiceFilter.type = 'peaking';
                    voiceFilter.frequency.value = 2500;
                    voiceFilter.Q.value = 1.5;
                    voiceFilter.gain.value = 0;

                    // Connect the audio graph
                    source
                        .connect(bassFilter)
                        .connect(voiceFilter)
                        .connect(gainNode)
                        .connect(context.destination);

                    // Store the nodes
                    audioContexts.set(element, {
                        context,
                        gain: gainNode,
                        bassFilter,
                        voiceFilter,
                    });

                    console.log('Audio context setup complete', {
                        gain: gainNode.gain.value,
                        bassGain: bassFilter.gain.value,
                        voiceGain: voiceFilter.gain.value
                    });
                } catch (error) {
                    console.error('Error setting up audio context:', error);
                }
            }
        };

        // Function to update all audio effects
        const updateAllEffects = () => {
            const mediaElements = document.querySelectorAll("audio, video");
            mediaElements.forEach((element) => {
                if (element instanceof HTMLMediaElement) {
                    setupAudioContext(element);
                    const audioContext = audioContexts.get(element);
                    if (audioContext) {
                        // Update volume
                        const volumeGain = settings.volume / 100;
                        audioContext.gain.gain.value = volumeGain;

                        // Update bass boost (max 45dB boost, -15dB cut)
                        const bassGain = ((settings.bassBoost - 100) / 100) * 45;
                        audioContext.bassFilter.gain.value = bassGain;

                        // Update voice boost (max 36dB boost, -12dB cut)
                        const voiceGain = ((settings.voiceBoost - 100) / 100) * 36;
                        audioContext.voiceFilter.gain.value = voiceGain;

                        console.log('Updated audio effects:', {
                            volume: volumeGain,
                            bassBoost: settings.bassBoost,
                            bassGain,
                            voiceBoost: settings.voiceBoost,
                            voiceGain
                        });
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
                        updateAllEffects();
                    }
                });
            });
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        // Listen for settings update messages
        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === "UPDATE_SETTINGS") {
                settings = message.settings;
                updateAllEffects();
            }
            return true;
        });

        // Initial update
        updateAllEffects();
    },
});
