import { defineContentScript } from "wxt/sandbox";

interface AudioSettings {
    volume: number;
    bassBoost: number;
    voiceBoost: number;
    mono: boolean;
    speed: number;
}

export default defineContentScript({
    matches: ["<all_urls>"],
    runAt: "document_start",
    async main() {
        const defaultSettings: AudioSettings = {
            volume: 100,
            bassBoost: 100,
            voiceBoost: 100,
            mono: false,
            speed: 100,
        };

        let settings = { ...defaultSettings };
        const audioContexts = new WeakMap();

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
                    bassFilter.type = "lowshelf";
                    bassFilter.frequency.value = 150;
                    bassFilter.gain.value = 0;

                    // Create voice boost filter
                    const voiceFilter = context.createBiquadFilter();
                    voiceFilter.type = "peaking";
                    voiceFilter.frequency.value = 2500;
                    voiceFilter.Q.value = 1.5;
                    voiceFilter.gain.value = 0;

                    // Create channel merger for mono
                    const merger = context.createChannelMerger(2);
                    const splitter = context.createChannelSplitter(2);

                    // Connect the audio graph with mono support
                    source
                        .connect(splitter);
                    
                    // Connect both channels to merger for mono capability
                    splitter.connect(merger, 0, 0);
                    splitter.connect(merger, 0, 1);
                    
                    merger
                        .connect(bassFilter)
                        .connect(voiceFilter)
                        .connect(gainNode)
                        .connect(context.destination);

                    // Store the nodes and element
                    audioContexts.set(element, {
                        context,
                        source,
                        gain: gainNode,
                        bassFilter,
                        voiceFilter,
                        merger,
                        splitter,
                        element, // Store the element for playback rate control
                    });

                    console.log("Content: Audio context setup complete", {
                        gain: gainNode.gain.value,
                        bassGain: bassFilter.gain.value,
                        voiceGain: voiceFilter.gain.value,
                        mono: settings.mono,
                        speed: settings.speed,
                    });
                } catch (error) {
                    console.error("Content: Error setting up audio context:", error);
                }
            }
        };

        // Function to update all audio effects
        const updateAllEffects = () => {
            console.log("Content: Updating all audio effects with settings:", settings);
            const mediaElements = document.querySelectorAll("audio, video");
            mediaElements.forEach((element) => {
                if (element instanceof HTMLMediaElement) {
                    setupAudioContext(element);
                    const audioContext = audioContexts.get(element);
                    if (audioContext) {
                        // Update volume
                        const volumeGain = settings.volume / 100;
                        audioContext.gain.gain.value = volumeGain;

                        // Update bass boost (max 30db boost, -15dB cut)
                        const bassGain =
                            ((settings.bassBoost - 100) / 100) * 15;
                        audioContext.bassFilter.gain.value = bassGain;

                        // Update voice boost (max 24dB boost, -12dB cut)
                        const voiceGain =
                            ((settings.voiceBoost - 100) / 100) * 24;
                        audioContext.voiceFilter.gain.value = voiceGain;

                        // Update mono setting
                        if (settings.mono) {
                            // Disconnect stereo path
                            audioContext.source.disconnect();
                            audioContext.source.connect(audioContext.splitter);
                            audioContext.splitter.connect(audioContext.merger, 0, 0);
                            audioContext.splitter.connect(audioContext.merger, 0, 1);
                        } else {
                            // Restore stereo path
                            audioContext.source.disconnect();
                            audioContext.source.connect(audioContext.bassFilter);
                        }

                        // Update playback speed
                        const speedMultiplier = settings.speed / 100;
                        audioContext.element.playbackRate = speedMultiplier;

                        console.log("Content: Updated audio effects for element:", {
                            volume: volumeGain,
                            bassBoost: settings.bassBoost,
                            bassGain,
                            voiceBoost: settings.voiceBoost,
                            voiceGain,
                            mono: settings.mono,
                            speed: settings.speed,
                            playbackRate: audioContext.element.playbackRate,
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
                        console.log("Content: New media element found, applying settings");
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
            console.log("Content: Received message:", message);
            if (message.type === "UPDATE_SETTINGS") {
                console.log("Content: Updating settings from message:", message.settings);
                settings = message.settings;
                updateAllEffects();
            }
            return true;
        });

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes) => {
            console.log("Content: Storage changed:", changes);
            if (changes.audioSettings) {
                console.log("Content: Updating settings from storage:", changes.audioSettings.newValue);
                settings = changes.audioSettings.newValue;
                updateAllEffects();
            }
        });

        // Get initial settings
        console.log("Content: Loading initial settings from storage");
        chrome.storage.sync.get(["audioSettings"], (result) => {
            console.log("Content: Got initial settings from storage:", result);
            if (result.audioSettings) {
                console.log("Content: Applying initial settings:", result.audioSettings);
                settings = result.audioSettings;
                updateAllEffects();
            } else {
                console.log("Content: No initial settings found, using defaults:", defaultSettings);
            }
        });

        // Initial update with default settings
        console.log("Content: Performing initial update with settings:", settings);
        updateAllEffects();
    },
});
