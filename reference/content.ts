const content = {
    matches: ["<all_urls>"],
    runAt: "document_start",
    async main(context: any) {
        const defaultSettings = {
            volume: 100,
            bassBoost: 100,
            voiceBoost: 100,
            mono: false,
            speed: 100,
        };
        let currentSettings = { ...defaultSettings };
        const audioElementMap = new Map<
            HTMLMediaElement,
            {
                context: AudioContext;
                source: MediaElementAudioSourceNode;
                gain: GainNode;
                bassFilter: BiquadFilterNode;
                voiceFilter: BiquadFilterNode;
                merger: ChannelMergerNode;
                splitter: ChannelSplitterNode;
                element: HTMLMediaElement;
            }
        >();

        let audioContext: AudioContext | null = null;

        const setupAudioContext = (mediaElement: HTMLMediaElement) => {
            if (!audioElementMap.has(mediaElement)) {
                try {
                    if (!audioContext) {
                        audioContext = new AudioContext();
                    }
                    const source =
                        audioContext.createMediaElementSource(mediaElement);
                    const gainNode = audioContext.createGain();
                    gainNode.gain.value = 1;
                    const bassFilter = audioContext.createBiquadFilter();
                    bassFilter.type = "lowshelf";
                    bassFilter.frequency.value = 150;
                    bassFilter.gain.value = 0;
                    const voiceFilter = audioContext.createBiquadFilter();
                    voiceFilter.type = "peaking";
                    voiceFilter.frequency.value = 2500;
                    voiceFilter.Q.value = 1.5;
                    voiceFilter.gain.value = 0;
                    const merger = audioContext.createChannelMerger(2);
                    const splitter = audioContext.createChannelSplitter(2);
                    source.connect(splitter);
                    splitter.connect(merger, 0, 0);
                    splitter.connect(merger, 0, 1);
                    merger
                        .connect(bassFilter)
                        .connect(voiceFilter)
                        .connect(gainNode)
                        .connect(audioContext.destination);
                    audioElementMap.set(mediaElement, {
                        context: audioContext,
                        source,
                        gain: gainNode,
                        bassFilter,
                        voiceFilter,
                        merger,
                        splitter,
                        element: mediaElement,
                    });
                    console.log("Content: Audio context setup complete", {
                        gain: gainNode.gain.value,
                        bassGain: bassFilter.gain.value,
                        voiceGain: voiceFilter.gain.value,
                        mono: currentSettings.mono,
                        speed: currentSettings.speed,
                    });
                } catch (error) {
                    console.error(
                        "Content: Error setting up audio context:",
                        error
                    );
                }
            }
        };

        const updateAudioEffects = () => {
            console.log(
                "Content: Updating all audio effects with settings:",
                currentSettings
            );
            document
                .querySelectorAll<HTMLMediaElement>("audio, video")
                .forEach((mediaElement) => {
                    setupAudioContext(mediaElement);
                    const audioElementData = audioElementMap.get(mediaElement);
                    if (audioElementData) {
                        const volume = currentSettings.volume / 100;
                        audioElementData.gain.gain.value = volume;
                        const bassGain =
                            ((currentSettings.bassBoost - 100) / 100) * 15;
                        audioElementData.bassFilter.gain.value = bassGain;
                        const voiceGain =
                            ((currentSettings.voiceBoost - 100) / 100) * 24;
                        audioElementData.voiceFilter.gain.value = voiceGain;
                        if (currentSettings.mono) {
                            audioElementData.source.disconnect();
                            audioElementData.source.connect(
                                audioElementData.splitter
                            );
                            audioElementData.splitter.connect(
                                audioElementData.merger,
                                0,
                                0
                            );
                            audioElementData.splitter.connect(
                                audioElementData.merger,
                                0,
                                1
                            );
                        } else {
                            audioElementData.source.disconnect();
                            audioElementData.source.connect(
                                audioElementData.bassFilter
                            );
                        }
                        const playbackRate = currentSettings.speed / 100;
                        audioElementData.element.playbackRate = playbackRate;
                        console.log(
                            "Content: Updated audio effects for element:",
                            {
                                volume,
                                bassBoost: currentSettings.bassBoost,
                                bassGain,
                                voiceBoost: currentSettings.voiceBoost,
                                voiceGain,
                                mono: currentSettings.mono,
                                speed: currentSettings.speed,
                                playbackRate:
                                    audioElementData.element.playbackRate,
                            }
                        );
                    }
                });
        };

        new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLMediaElement) {
                        console.log(
                            "Content: New media element found, applying settings"
                        );
                        setupAudioContext(node);
                        updateAudioEffects();
                    }
                });
            });
        }).observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        chrome.runtime.onMessage.addListener((message) => {
            console.log("Content: Received message:", message);
            if (message.type === "UPDATE_SETTINGS") {
                console.log(
                    "Content: Updating settings from message:",
                    message.settings
                );
                currentSettings = message.settings;
                updateAudioEffects();
            }
            return true;
        });

        chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
            if (message.type === "TOGGLE_EXTENSION" && !message.enabled) {
                for (const [
                    mediaElement,
                    audioElementData,
                ] of audioElementMap.entries()) {
                    if (audioElementData.gain)
                        audioElementData.gain.disconnect();
                    if (audioElementData.bassFilter)
                        audioElementData.bassFilter.disconnect();
                    if (audioElementData.voiceFilter)
                        audioElementData.voiceFilter.disconnect();
                    if (audioElementData.merger)
                        audioElementData.merger.disconnect();
                    if (audioElementData.splitter)
                        audioElementData.splitter.disconnect();
                    if (audioElementData.source) {
                        audioElementData.source.disconnect();
                        audioElementData.source.connect(
                            audioElementData.context.destination
                        );
                    }
                    audioElementMap.delete(mediaElement);
                }
            }
        });

        chrome.storage.onChanged.addListener((changes) => {
            console.log("Content: Storage changed:", changes);
            if (changes.audioSettings) {
                console.log(
                    "Content: Updating settings from storage:",
                    changes.audioSettings.newValue
                );
                currentSettings = changes.audioSettings.newValue;
                updateAudioEffects();
            }
        });

        console.log("Content: Loading initial settings from storage");
        chrome.storage.sync.get(["audioSettings"], (storage) => {
            console.log("Content: Got initial settings from storage:", storage);
            if (storage.audioSettings) {
                console.log(
                    "Content: Applying initial settings:",
                    storage.audioSettings
                );
                currentSettings = storage.audioSettings;
                updateAudioEffects();
            } else {
                console.log(
                    "Content: No initial settings found, using defaults:",
                    defaultSettings
                );
            }
        });

        console.log(
            "Content: Performing initial update with settings:",
            currentSettings
        );
        updateAudioEffects();

        // Initialize AudioContext on first user interaction
        const initAudioContext = () => {
            if (!audioContext) {
                audioContext = new AudioContext();
                console.log(
                    "Content: AudioContext initialized after user gesture"
                );
                document.removeEventListener("click", initAudioContext);
                document.removeEventListener("keydown", initAudioContext);
            }
        };
        document.addEventListener("click", initAudioContext);
        document.addEventListener("keydown", initAudioContext);
    },
};

export default content;
