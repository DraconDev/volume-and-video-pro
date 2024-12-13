import { defineContentScript } from "wxt/sandbox";

interface AudioSettings {
    volume: number;
    bassBoost: boolean;
    voiceBoost: boolean;
}

export default defineContentScript({
    matches: ["<all_urls>"],
    runAt: "document_start",
    async main() {
        const defaultSettings: AudioSettings = {
            volume: 100,
            bassBoost: false,
            voiceBoost: false
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
                    
                    // Create filters for voice and bass boost
                    const bassFilter = context.createBiquadFilter();
                    bassFilter.type = 'lowshelf';
                    bassFilter.frequency.value = 100;
                    bassFilter.gain.value = 0;

                    const voiceFilter = context.createBiquadFilter();
                    voiceFilter.type = 'peaking';
                    voiceFilter.frequency.value = 2000;
                    voiceFilter.Q.value = 1;
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
                        voiceFilter
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
                        audioContext.gain.gain.value = settings.volume / 100;
                        
                        // Update bass boost
                        audioContext.bassFilter.gain.value = settings.bassBoost ? 7.0 : 0;
                        
                        // Update voice boost
                        audioContext.voiceFilter.gain.value = settings.voiceBoost ? 5.0 : 0;
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
