import { AudioSettings, defaultSettings } from "@/src/types";

// Audio context and nodes map
let audioContext: AudioContext | null = null;
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

// Current settings state
let currentSettings: AudioSettings = defaultSettings;
let isUsingGlobalSettings = true;

export default defineContentScript({
    matches: ["<all_urls>"],
    main: async () => {
        console.log("Content: Script starting");

        const initializeSettings = async () => {
            try {
                console.log("Content: Starting initialization");
                const storage = await chrome.storage.sync.get([
                    "globalSettings",
                    "siteSettings",
                ]);
                const hostname = window.location.hostname;

                // First check for site-specific settings
                if (storage.siteSettings?.[hostname]) {
                    currentSettings = storage.siteSettings[hostname];
                    isUsingGlobalSettings = false;
                    console.log("Content: Using site-specific settings");
                } else if (storage.globalSettings) {
                    currentSettings = storage.globalSettings;
                    isUsingGlobalSettings = true;
                    console.log("Content: Using global settings");
                } else {
                    currentSettings = defaultSettings;
                    isUsingGlobalSettings = true;
                    console.log("Content: Using default settings");
                }

                // Notify background script that we're ready
                await chrome.runtime.sendMessage({
                    type: "CONTENT_SCRIPT_READY",
                    hostname: window.location.hostname,
                    usingGlobal: isUsingGlobalSettings,
                });

                console.log("Content: Initialization complete with settings:", {
                    settings: currentSettings,
                    isGlobal: isUsingGlobalSettings,
                });
            } catch (error) {
                console.error("Content: Error during initialization:", error);
                currentSettings = defaultSettings;
                isUsingGlobalSettings = true;
            }
        };

        // Update settings when received from background
        chrome.runtime.onMessage.addListener(
            (message, sender, sendResponse) => {
                if (message.type === "UPDATE_SETTINGS") {
                    const settingsType = message.isGlobal
                        ? "global"
                        : "site-specific";
                    console.log(
                        `Content: Applying ${settingsType} settings:`,
                        message.settings
                    );

                    currentSettings = message.settings;
                    isUsingGlobalSettings = message.isGlobal;
                    updateAudioEffects();

                    sendResponse({ success: true });
                }
                return true;
            }
        );

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes) => {
            const hostname = window.location.hostname;
            console.log("Content: Storage changes detected:", changes);

            if (
                changes.siteSettings?.newValue?.[hostname] &&
                !isUsingGlobalSettings
            ) {
                console.log(
                    "Content: Site settings changed:",
                    changes.siteSettings.newValue[hostname]
                );
                currentSettings = changes.siteSettings.newValue[hostname];
                updateAudioEffects();
            } else if (
                changes.globalSettings?.newValue &&
                isUsingGlobalSettings
            ) {
                console.log(
                    "Content: Global settings changed:",
                    changes.globalSettings.newValue
                );
                currentSettings = changes.globalSettings.newValue;
                updateAudioEffects();
            }
        });

        // Function to update audio effects with current settings
        const updateAudioEffects = () => {
            console.log(
                "Content: Updating audio effects with settings:",
                currentSettings
            );

            // First, find any new media elements
            const mediaElements = document.querySelectorAll("video, audio");
            mediaElements.forEach((element) => {
                if (
                    element instanceof HTMLMediaElement &&
                    !audioElementMap.has(element)
                ) {
                    console.log(
                        "Content: Found new media element, setting up:",
                        element
                    );
                    setupAudioContext(element);
                }
            });

            // Update all audio elements
            audioElementMap.forEach(
                (
                    {
                        element,
                        gain,
                        bassFilter,
                        voiceFilter,
                        source,
                        merger,
                        splitter,
                    },
                    mediaElement
                ) => {
                    try {
                        console.log(
                            "Content: Updating audio effects for element:",
                            mediaElement.src,
                            "Current state:",
                            {
                                readyState: mediaElement.readyState,
                                paused: mediaElement.paused,
                                currentTime: mediaElement.currentTime,
                                volume: mediaElement.volume,
                                settings: currentSettings,
                                audioContextState: audioContext?.state,
                                gainValue: gain.gain.value,
                                bassBoostValue: bassFilter.gain.value,
                                voiceBoostValue: voiceFilter.gain.value
                            }
                        );

                        // Disconnect existing connections
                        console.log("Content: Disconnecting existing connections");
                        source.disconnect();
                        bassFilter.disconnect();
                        voiceFilter.disconnect();
                        gain.disconnect();

                        // Reconnect nodes based on mono setting
                        console.log("Content: Reconnecting nodes, mono:", currentSettings.mono);
                        if (currentSettings.mono) {
                            source.connect(bassFilter);
                            console.log("Content: Connected source -> bassFilter");
                            bassFilter.connect(voiceFilter);
                            console.log("Content: Connected bassFilter -> voiceFilter");
                            voiceFilter.connect(splitter);
                            console.log("Content: Connected voiceFilter -> splitter");
                            splitter.connect(merger, 0, 0);
                            splitter.connect(merger, 0, 1);
                            console.log("Content: Connected splitter -> merger (both channels)");
                            merger.connect(gain);
                            console.log("Content: Connected merger -> gain");
                        } else {
                            source.connect(bassFilter);
                            console.log("Content: Connected source -> bassFilter");
                            bassFilter.connect(voiceFilter);
                            console.log("Content: Connected bassFilter -> voiceFilter");
                            voiceFilter.connect(gain);
                            console.log("Content: Connected voiceFilter -> gain");
                        }

                        // Check if audioContext exists before using it
                        if (!audioContext) {
                            throw new Error("Audio context is not initialized");
                        }
                        gain.connect(audioContext.destination);
                        console.log("Content: Connected gain -> destination");

                        // Update volume
                        const volumeMultiplier = currentSettings.volume / 100;
                        gain.gain.setValueAtTime(
                            volumeMultiplier,
                            gain.context.currentTime
                        );
                        console.log("Content: Set volume to", volumeMultiplier);

                        // Update filters
                        const bassBoostGain =
                            ((currentSettings.bassBoost - 100) / 100) * 15;
                        bassFilter.gain.setValueAtTime(
                            bassBoostGain,
                            bassFilter.context.currentTime
                        );
                        console.log(
                            "Content: Set bass boost to",
                            bassBoostGain
                        );

                        const voiceBoostGain =
                            ((currentSettings.voiceBoost - 100) / 100) * 24;
                        voiceFilter.gain.setValueAtTime(
                            voiceBoostGain,
                            voiceFilter.context.currentTime
                        );
                        console.log(
                            "Content: Set voice boost to",
                            voiceBoostGain
                        );

                        // Update speed
                        const speed = currentSettings.speed / 100;
                        element.playbackRate = speed;
                        element.defaultPlaybackRate = speed;
                        console.log("Content: Set playback rate to", speed);

                        // Verify settings were applied
                        setTimeout(() => {
                            console.log(
                                "Content: Verifying settings for element:",
                                {
                                    volume: gain.gain.value,
                                    bassBoost: bassFilter.gain.value,
                                    voiceBoost: voiceFilter.gain.value,
                                    speed: element.playbackRate,
                                    mono: currentSettings.mono,
                                }
                            );
                        }, 100);
                    } catch (error) {
                        console.error(
                            "Content: Error updating audio effects:",
                            error
                        );
                        // Try to reconnect if there was an error
                        try {
                            setupAudioContext(mediaElement);
                        } catch (reconnectError) {
                            console.error(
                                "Content: Failed to reconnect:",
                                reconnectError
                            );
                        }
                    }
                }
            );
        };

        const setupAudioContext = (mediaElement: HTMLMediaElement) => {
            if (!audioElementMap.has(mediaElement)) {
                try {
                    console.log(
                        "Content: Setting up new audio context for:",
                        mediaElement,
                        "Element state:",
                        {
                            readyState: mediaElement.readyState,
                            paused: mediaElement.paused,
                            currentTime: mediaElement.currentTime,
                            src: mediaElement.src,
                            volume: mediaElement.volume
                        }
                    );

                    if (!audioContext || audioContext.state === "closed") {
                        audioContext = new AudioContext();
                        console.log("Content: Created new AudioContext, state:", audioContext.state);
                    }

                    // Resume audio context if suspended
                    if (audioContext.state === "suspended") {
                        console.log("Content: Resuming suspended AudioContext");
                        audioContext.resume().catch((error) => {
                            console.error("Content: Failed to resume AudioContext:", error);
                        });
                    }

                    console.log("Content: Creating audio nodes");
                    const source = audioContext.createMediaElementSource(mediaElement);
                    console.log("Content: Created source node");
                    const gain = audioContext.createGain();
                    console.log("Content: Created gain node");
                    const bassFilter = audioContext.createBiquadFilter();
                    console.log("Content: Created bass filter node");
                    const voiceFilter = audioContext.createBiquadFilter();
                    console.log("Content: Created voice filter node");
                    const merger = audioContext.createChannelMerger(2);
                    console.log("Content: Created merger node");
                    const splitter = audioContext.createChannelSplitter(2);
                    console.log("Content: Created splitter node");

                    // Configure filters
                    console.log("Content: Configuring filters");
                    bassFilter.type = "lowshelf";
                    bassFilter.frequency.value = 150;
                    bassFilter.gain.value = 0;
                    console.log("Content: Configured bass filter:", {
                        type: bassFilter.type,
                        frequency: bassFilter.frequency.value,
                        gain: bassFilter.gain.value
                    });

                    voiceFilter.type = "peaking";
                    voiceFilter.frequency.value = 2500;
                    voiceFilter.Q.value = 1.5;
                    voiceFilter.gain.value = 0;
                    console.log("Content: Configured voice filter:", {
                        type: voiceFilter.type,
                        frequency: voiceFilter.frequency.value,
                        Q: voiceFilter.Q.value,
                        gain: voiceFilter.gain.value
                    });

                    // Initial connections based on mono setting
                    console.log("Content: Setting up audio node connections, mono:", currentSettings.mono);
                    if (currentSettings.mono) {
                        source.connect(bassFilter);
                        console.log("Content: Connected source -> bassFilter");
                        bassFilter.connect(voiceFilter);
                        console.log("Content: Connected bassFilter -> voiceFilter");
                        voiceFilter.connect(splitter);
                        console.log("Content: Connected voiceFilter -> splitter");
                        splitter.connect(merger, 0, 0);
                        splitter.connect(merger, 0, 1);
                        console.log("Content: Connected splitter -> merger (both channels)");
                        merger.connect(gain);
                        console.log("Content: Connected merger -> gain");
                    } else {
                        source.connect(bassFilter);
                        console.log("Content: Connected source -> bassFilter");
                        bassFilter.connect(voiceFilter);
                        console.log("Content: Connected bassFilter -> voiceFilter");
                        voiceFilter.connect(gain);
                        console.log("Content: Connected voiceFilter -> gain");
                    }

                    // Check if audioContext exists before using it
                    if (!audioContext) {
                        throw new Error("Audio context is not initialized");
                    }
                    gain.connect(audioContext.destination);
                    console.log("Content: Connected gain -> destination");

                    console.log("Content: Setting up audio node map for element");
                    audioElementMap.set(mediaElement, {
                        context: audioContext,
                        source,
                        gain,
                        bassFilter,
                        voiceFilter,
                        merger,
                        splitter,
                        element: mediaElement,
                    });

                    // Apply current settings
                    console.log("Content: Applying initial audio effects");
                    updateAudioEffects();

                    // Add event listeners for media events
                    const handleMediaEvent = () => {
                        console.log(
                            "Content: Media event triggered for element:",
                            mediaElement.src,
                            "State:",
                            {
                                readyState: mediaElement.readyState,
                                paused: mediaElement.paused,
                                currentTime: mediaElement.currentTime,
                                volume: mediaElement.volume
                            }
                        );
                        updateAudioEffects();
                    };

                    console.log("Content: Adding media event listeners");
                    mediaElement.addEventListener("play", handleMediaEvent);
                    mediaElement.addEventListener("loadeddata", handleMediaEvent);
                    mediaElement.addEventListener("ratechange", handleMediaEvent);

                    // Cleanup on removal
                    console.log("Content: Setting up mutation observer for cleanup");
                    new MutationObserver((mutations) => {
                        if (!document.contains(mediaElement)) {
                            console.log(
                                "Content: Cleaning up removed media element"
                            );
                            const audioData = audioElementMap.get(mediaElement);
                            if (audioData) {
                                try {
                                    audioData.source.disconnect();
                                    audioData.gain.disconnect();
                                    audioData.bassFilter.disconnect();
                                    audioData.voiceFilter.disconnect();
                                    audioData.merger.disconnect();
                                    audioData.splitter.disconnect();
                                } catch (error) {
                                    console.warn(
                                        "Content: Cleanup error:",
                                        error
                                    );
                                }
                            }
                            audioElementMap.delete(mediaElement);
                            mediaElement.removeEventListener(
                                "play",
                                handleMediaEvent
                            );
                            mediaElement.removeEventListener(
                                "loadeddata",
                                handleMediaEvent
                            );
                            mediaElement.removeEventListener(
                                "ratechange",
                                handleMediaEvent
                            );
                        }
                    }).observe(document.documentElement, {
                        childList: true,
                        subtree: true,
                    });
                } catch (error) {
                    console.error("Content: Setup error:", error);
                }
            }
        };

        // Watch for new media elements
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLMediaElement) {
                        setupAudioContext(node);
                    } else if (node instanceof Element) {
                        node.querySelectorAll("video, audio").forEach(
                            (mediaElement) => {
                                setupAudioContext(
                                    mediaElement as HTMLMediaElement
                                );
                            }
                        );
                    }
                });
            });
        });

        // Start observing
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        // Process existing media elements
        document.querySelectorAll("video, audio").forEach((mediaElement) => {
            setupAudioContext(mediaElement as HTMLMediaElement);
        });

        // Initialize settings
        await initializeSettings();
    },
});
