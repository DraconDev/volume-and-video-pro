const content = {
    matches: ["<all_urls>"],
    runAt: "document_start",
    async main(context: any) {
        // Default settings with clear naming
        const defaultSettings = {
            volume: 100,
            speed: 100,
            bassBoost: 100,
            voiceBoost: 100,
            mono: false,
        };

        // Track current settings state
        let currentSettings = { ...defaultSettings };
        let isUsingGlobalSettings = true;
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

        // Function to safely access storage
        const safeStorageGet = async (keys: string[]) => {
            try {
                return await chrome.storage.sync.get(keys);
            } catch (error) {
                console.warn("Content: Storage access not available:", error);
                return {};
            }
        };

        // Function to safely send messages
        const safeSendMessage = async (message: any) => {
            try {
                return await new Promise((resolve) => {
                    chrome.runtime.sendMessage(message, (response) => {
                        const error = chrome.runtime.lastError;
                        if (error) {
                            console.warn(
                                "Content: Message sending failed:",
                                error
                            );
                            resolve(null);
                        } else {
                            resolve(response);
                        }
                    });
                });
            } catch (error) {
                console.warn("Content: Message sending failed:", error);
                return null;
            }
        };

        // Initialize settings and notify background script that we're ready
        const initializeSettings = async () => {
            try {
                console.log("Content: Starting initialization");
                const storage = await safeStorageGet(["globalSettings", "siteSettings"]);
                const hostname = window.location.hostname;

                // First check for site-specific settings
                if (storage.siteSettings?.[hostname]) {
                    console.log("Content: Found site-specific settings");
                    currentSettings = storage.siteSettings[hostname];
                    isUsingGlobalSettings = false;
                }
                // Then check for global settings
                else if (storage.globalSettings) {
                    console.log("Content: Using global settings");
                    currentSettings = storage.globalSettings;
                    isUsingGlobalSettings = true;
                }
                // Finally fall back to defaults
                else {
                    console.log("Content: No settings found, using defaults");
                    currentSettings = defaultSettings;
                    isUsingGlobalSettings = true;
                }

                // Apply initial settings before notifying background
                updateAudioEffects();

                // Notify background script we're ready
                await safeSendMessage({
                    type: "CONTENT_SCRIPT_READY",
                    hostname: window.location.hostname,
                    usingGlobal: isUsingGlobalSettings
                });

                console.log("Content: Initialization complete with settings:", {
                    settings: currentSettings,
                    isGlobal: isUsingGlobalSettings
                });

            } catch (error) {
                console.error("Content: Error during initialization:", error);
                currentSettings = defaultSettings;
                isUsingGlobalSettings = true;
                updateAudioEffects();
            }
        };

        // Update settings when received from background
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log("Content: Received message:", message);
            
            if (message.type === "UPDATE_SETTINGS") {
                const settingsType = message.isGlobal ? "global" : "site-specific";
                console.log(`Content: Applying ${settingsType} settings:`, message.settings);
                
                currentSettings = message.settings;
                isUsingGlobalSettings = message.isGlobal;
                updateAudioEffects();
                
                sendResponse({ success: true });
            }
            return true;
        });

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes) => {
            const hostname = window.location.hostname;
            
            if (changes.siteSettings?.newValue?.[hostname] && !isUsingGlobalSettings) {
                console.log("Content: Site settings changed:", changes.siteSettings.newValue[hostname]);
                currentSettings = changes.siteSettings.newValue[hostname];
                updateAudioEffects();
            } 
            else if (changes.globalSettings?.newValue && isUsingGlobalSettings) {
                console.log("Content: Global settings changed:", changes.globalSettings.newValue);
                currentSettings = changes.globalSettings.newValue;
                updateAudioEffects();
            }
        });

        // Function to update audio effects with current settings
        const updateAudioEffects = () => {
            console.log("Content: Updating all audio effects with settings:", currentSettings);
            
            audioElementMap.forEach(({ element, gain, bassFilter, voiceFilter }) => {
                try {
                    // Update volume
                    if (gain) {
                        const volumeMultiplier = currentSettings.volume / 100;
                        gain.gain.setValueAtTime(volumeMultiplier, gain.context.currentTime);
                        console.log("Content: Set volume to", volumeMultiplier);
                    }

                    // Update filters
                    if (bassFilter) {
                        const bassBoostGain = currentSettings.bassBoost > 100 
                            ? (currentSettings.bassBoost - 100) / 2 
                            : (currentSettings.bassBoost - 100);
                        bassFilter.gain.setValueAtTime(bassBoostGain, bassFilter.context.currentTime);
                        console.log("Content: Set bass boost to", bassBoostGain);
                    }

                    if (voiceFilter) {
                        const voiceBoostGain = currentSettings.voiceBoost > 100 
                            ? (currentSettings.voiceBoost - 100) / 2 
                            : (currentSettings.voiceBoost - 100);
                        voiceFilter.gain.setValueAtTime(voiceBoostGain, voiceFilter.context.currentTime);
                        console.log("Content: Set voice boost to", voiceBoostGain);
                    }

                    // Update speed
                    if (element) {
                        const speed = currentSettings.speed / 100;
                        safeSetPlaybackRate(element, currentSettings.speed);
                        console.log("Content: Set playback rate to", speed);
                    }

                    console.log("Content: Updated audio effects for element:", {
                        volume: gain?.gain.value,
                        bassBoost: currentSettings.bassBoost,
                        bassGain: bassFilter?.gain.value,
                        voiceBoost: currentSettings.voiceBoost,
                        voiceGain: voiceFilter?.gain.value,
                        speed: currentSettings.speed,
                        mono: currentSettings.mono
                    });
                } catch (error) {
                    console.error("Content: Error updating audio effects:", error);
                }
            });
        };

        const setupAudioContext = (mediaElement: HTMLMediaElement) => {
            if (!audioElementMap.has(mediaElement)) {
                try {
                    if (!audioContext) {
                        audioContext = new AudioContext();
                        console.log("Content: Audio context setup complete", audioContext);
                    }

                    const source = audioContext.createMediaElementSource(mediaElement);
                    const gain = audioContext.createGain();
                    const bassFilter = audioContext.createBiquadFilter();
                    const voiceFilter = audioContext.createBiquadFilter();
                    const merger = audioContext.createChannelMerger(2);
                    const splitter = audioContext.createChannelSplitter(2);

                    bassFilter.type = "lowshelf";
                    bassFilter.frequency.value = 100;

                    voiceFilter.type = "highshelf";
                    voiceFilter.frequency.value = 3000;

                    // Create the audio processing chain
                    source.connect(bassFilter);
                    bassFilter.connect(voiceFilter);
                    voiceFilter.connect(gain);
                    gain.connect(audioContext.destination);

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

                    // Apply current settings immediately
                    updateAudioEffects();

                    // Add event listeners for media events
                    const handleMediaEvent = () => {
                        console.log("Content: Media event triggered, ensuring settings are applied");
                        updateAudioEffects();
                    };

                    // Listen for events that might indicate a new video/audio stream
                    mediaElement.addEventListener('loadstart', handleMediaEvent);
                    mediaElement.addEventListener('loadeddata', handleMediaEvent);
                    mediaElement.addEventListener('play', handleMediaEvent);
                    mediaElement.addEventListener('seeking', handleMediaEvent);

                    // Clean up when the element is removed
                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            if (!document.contains(mediaElement)) {
                                console.log("Content: Media element removed, cleaning up");
                                observer.disconnect();
                                audioElementMap.delete(mediaElement);
                                mediaElement.removeEventListener('loadstart', handleMediaEvent);
                                mediaElement.removeEventListener('loadeddata', handleMediaEvent);
                                mediaElement.removeEventListener('play', handleMediaEvent);
                                mediaElement.removeEventListener('seeking', handleMediaEvent);
                            }
                        });
                    });

                    observer.observe(document.documentElement, {
                        childList: true,
                        subtree: true
                    });

                } catch (error) {
                    console.error("Content: Error setting up audio context:", error);
                }
            }
        };

        // Function to safely set playback rate
        const safeSetPlaybackRate = (
            mediaElement: HTMLMediaElement,
            speed: number
        ) => {
            try {
                const normalizedSpeed = speed / 100;
                // Check if the element is a VideoJS player
                const isVideoJS = mediaElement.closest(".video-js") !== null;

                if (isVideoJS) {
                    // For VideoJS, we need to wait for the player to be ready
                    const videoJsPlayer = (window as any).videojs?.(mediaElement);
                    if (videoJsPlayer) {
                        // Wait for player to be ready
                        videoJsPlayer.ready(() => {
                            try {
                                videoJsPlayer.playbackRate(normalizedSpeed);
                                console.log("Content: Set VideoJS playback rate to", normalizedSpeed);
                            } catch (error) {
                                console.warn("Content: VideoJS playbackRate error:", error);
                                // Fallback to standard HTML5 video
                                mediaElement.playbackRate = normalizedSpeed;
                            }
                        });
                    } else {
                        mediaElement.playbackRate = normalizedSpeed;
                    }
                } else {
                    // For standard HTML5 video/audio elements
                    mediaElement.defaultPlaybackRate = normalizedSpeed;
                    mediaElement.playbackRate = normalizedSpeed;
                    console.log("Content: Set HTML5 playback rate to", normalizedSpeed);
                }

                // Add event listener to maintain speed after seeking/loading
                const maintainSpeed = () => {
                    if (mediaElement.playbackRate !== normalizedSpeed) {
                        mediaElement.playbackRate = normalizedSpeed;
                    }
                };

                mediaElement.addEventListener('ratechange', maintainSpeed);
                mediaElement.addEventListener('loadeddata', maintainSpeed);
                mediaElement.addEventListener('play', maintainSpeed);
                mediaElement.addEventListener('seeking', maintainSpeed);

            } catch (error) {
                console.warn("Content: Error setting playback rate:", error);
            }
        };

        // Set up mutation observer to watch for new media elements
        const setupMutationObserver = () => {
            const processNode = (node: Node) => {
                if (node instanceof HTMLMediaElement) {
                    console.log("Content: New media element found, applying settings");
                    setupAudioContext(node);
                } else if (node instanceof Element) {
                    // Check for video/audio elements within the node
                    node.querySelectorAll("video, audio").forEach((mediaElement) => {
                        console.log("Content: New media element found in subtree, applying settings");
                        setupAudioContext(mediaElement as HTMLMediaElement);
                    });

                    // Special handling for YouTube's player
                    if (window.location.hostname.includes('youtube.com')) {
                        const ytPlayer = node.querySelector('.html5-main-video');
                        if (ytPlayer instanceof HTMLVideoElement) {
                            console.log("Content: YouTube player found, applying settings");
                            setupAudioContext(ytPlayer);
                        }
                    }
                }
            };

            // Process existing media elements
            document.querySelectorAll("video, audio").forEach((mediaElement) => {
                console.log("Content: Found existing media element, applying settings");
                setupAudioContext(mediaElement as HTMLMediaElement);
            });

            // Watch for new media elements
            new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach(processNode);
                });
            }).observe(document.documentElement, {
                childList: true,
                subtree: true,
            });
        };

        // Start initialization when document is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                initializeSettings().catch((error) => {
                    console.error("Content: Error during initialization:", error);
                    currentSettings = defaultSettings;
                    isUsingGlobalSettings = true;
                    updateAudioEffects();
                });
            });
        } else {
            initializeSettings().catch((error) => {
                console.error("Content: Error during initialization:", error);
                currentSettings = defaultSettings;
                isUsingGlobalSettings = true;
                updateAudioEffects();
            });
        }

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
