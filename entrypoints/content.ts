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

        // Function to find media elements, including in Shadow DOM
        const findMediaElements = (root: ParentNode): HTMLMediaElement[] => {
            const elements: HTMLMediaElement[] = [];
            const debugInfo: string[] = [];

            const processElement = (el: Element) => {
                // Check if element itself is a media element
                if (el instanceof HTMLMediaElement) {
                    debugInfo.push(`Found direct media element: ${el.tagName}`);
                    elements.push(el);
                    return;
                }

                // Check for video elements within the element
                const mediaElements = el.getElementsByTagName("video");
                if (mediaElements.length > 0) {
                    debugInfo.push(
                        `Found ${mediaElements.length} video elements in ${el.tagName}`
                    );
                    Array.from(mediaElements).forEach((media) => {
                        if (media instanceof HTMLMediaElement) {
                            elements.push(media);
                        }
                    });
                }

                // Check for plyr and other common video players
                if (
                    el.classList.contains("plyr") ||
                    el.classList.contains("video-player") ||
                    el.classList.contains("player") ||
                    el.classList.contains("video-container") ||
                    el.hasAttribute("data-player") ||
                    el.id?.includes("player") ||
                    el.id?.includes("video")
                ) {
                    debugInfo.push(
                        `Found player container: ${el.tagName} with classes: ${el.className}`
                    );
                    const playerVideo = el.querySelector("video");
                    if (playerVideo instanceof HTMLMediaElement) {
                        elements.push(playerVideo);
                    }
                }

                // Check for Shadow DOM
                if (el.shadowRoot) {
                    debugInfo.push(`Checking Shadow DOM of ${el.tagName}`);
                    const shadowElements = findMediaElements(el.shadowRoot);
                    elements.push(...shadowElements);
                }

                // Check for iframes
                if (el.tagName === "IFRAME") {
                    try {
                        const iframeDoc = (el as HTMLIFrameElement)
                            .contentDocument;
                        if (iframeDoc) {
                            debugInfo.push(`Checking iframe content`);
                            const iframeElements = findMediaElements(iframeDoc);
                            elements.push(...iframeElements);
                        }
                    } catch (e) {
                        if (e instanceof DOMException) {
                            debugInfo.push(
                                `Cannot access iframe content: ${e.message}`
                            );
                        }
                    }
                }
            };

            // Process all elements in the root
            const allElements = root.querySelectorAll("*");
            debugInfo.push(
                `Scanning ${allElements.length} elements in document`
            );

            allElements.forEach((el) => {
                try {
                    processElement(el);
                } catch (e) {
                    if (e instanceof DOMException) {
                        debugInfo.push(
                            `Cannot access iframe content: ${e.message}`
                        );
                    }
                }
            });

            // Log debug information if elements were found or if in debug mode
            if (elements.length > 0 || debugInfo.length > 5) {
                console.log("Content: Media element search results:", {
                    elementsFound: elements.length,
                    debugInfo: debugInfo,
                });
            }

            return elements;
        };

        // Function to update audio effects with current settings
        const updateAudioEffects = () => {
            console.log(
                "Content: Updating audio effects with settings:",
                currentSettings
            );
            const mediaElements = findMediaElements(document);

            // First pass: Update speed for all media elements
            mediaElements.forEach((element) => {
                try {
                    const speed = currentSettings.speed / 100;
                    element.playbackRate = speed;
                    element.defaultPlaybackRate = speed;
                    console.log(
                        "Content: Updated speed for element:",
                        element.src,
                        "Speed:",
                        speed
                    );
                } catch (e) {
                    console.error("Content: Error setting speed:", e);
                }
            });

            // Second pass: Handle audio effects only if needed
            const needsAudioProcessing =
                currentSettings.volume !== 100 ||
                currentSettings.bassBoost !== 100 ||
                currentSettings.voiceBoost !== 100 ||
                currentSettings.mono;

            // If we don't need audio processing, clean up all audio contexts
            if (!needsAudioProcessing) {
                audioElementMap.forEach(({ source, gain, bassFilter, voiceFilter, merger, splitter }, element) => {
                    try {
                        source?.disconnect();
                        gain?.disconnect();
                        bassFilter?.disconnect();
                        voiceFilter?.disconnect();
                        if (merger) merger.disconnect();
                        if (splitter) splitter.disconnect();
                    } catch (e) {
                        console.warn("Content: Error cleaning up audio nodes:", e);
                    }
                });
                audioElementMap.clear();
                if (audioContext) {
                    audioContext.close();
                    audioContext = null;
                }
                return;
            }

            // Only process audio if we need to
            mediaElements.forEach((element) => {
                // Add audio processing if needed and not already set up
                if (needsAudioProcessing && !audioElementMap.has(element)) {
                    console.log(
                        "Content: Setting up audio processing for:",
                        element.src
                    );
                    setupAudioContext(element).catch((e) => {
                        console.error(
                            "Content: Failed to setup audio context:",
                            e
                        );
                    });
                }
            });

            // Update existing audio effects
            audioElementMap.forEach(
                ({ gain, bassFilter, voiceFilter, source, merger, splitter }, mediaElement) => {
                    try {
                        console.log(
                            "Content: Updating audio effects for element:",
                            mediaElement.src
                        );

                        // Update audio processing chain
                        source.disconnect();
                        bassFilter.disconnect();
                        voiceFilter.disconnect();
                        gain.disconnect();

                        if (currentSettings.mono) {
                            source.connect(bassFilter);
                            bassFilter.connect(voiceFilter);
                            voiceFilter.connect(splitter);
                            splitter.connect(merger, 0, 0);
                            splitter.connect(merger, 0, 1);
                            merger.connect(gain);
                        } else {
                            source.connect(bassFilter);
                            bassFilter.connect(voiceFilter);
                            voiceFilter.connect(gain);
                        }

                        if (!audioContext) {
                            throw new Error("Audio context is not initialized");
                        }
                        gain.connect(audioContext.destination);

                        // Update effect values
                        const volumeMultiplier = currentSettings.volume / 100;
                        gain.gain.setValueAtTime(
                            volumeMultiplier,
                            gain.context.currentTime
                        );

                        const bassBoostGain =
                            ((currentSettings.bassBoost - 100) / 100) * 15;
                        bassFilter.gain.setValueAtTime(
                            bassBoostGain,
                            bassFilter.context.currentTime
                        );

                        const voiceBoostGain =
                            ((currentSettings.voiceBoost - 100) / 100) * 24;
                        voiceFilter.gain.setValueAtTime(
                            voiceBoostGain,
                            voiceFilter.context.currentTime
                        );
                    } catch (error) {
                        console.error(
                            "Content: Error updating audio effects:",
                            error
                        );
                    }
                }
            );
        };

        // Function to initialize media element observation
        const initMediaElementObserver = () => {
            console.log("Content: Setting up media element observer");

            // Initial check with delay to allow for dynamic content
            setTimeout(() => {
                const initialElements = findMediaElements(document);
                const needsAudioProcessing =
                    currentSettings.volume !== 100 ||
                    currentSettings.bassBoost !== 100 ||
                    currentSettings.voiceBoost !== 100 ||
                    currentSettings.mono;

                if (needsAudioProcessing) {
                    initialElements.forEach((element) => {
                        if (!audioElementMap.has(element)) {
                            console.log(
                                "Content: Found initial media element:",
                                element
                            );
                            setupAudioContext(element);
                        }
                    });
                }
                // Always update speed settings
                updateAudioEffects();
            }, 1000); // 1 second delay

            // Set up mutation observer for dynamic content
            const observer = new MutationObserver((mutations) => {
                let needsUpdate = false;

                mutations.forEach((mutation) => {
                    if (mutation.type === "childList") {
                        // Check added nodes
                        mutation.addedNodes.forEach((node) => {
                            if (node instanceof Element) {
                                const mediaElements = findMediaElements(node);
                                if (mediaElements.length > 0) {
                                    needsUpdate = true;
                                }
                            }
                        });

                        // Also check the parent element and its siblings
                        if (mutation.target instanceof Element) {
                            const mediaElements = findMediaElements(mutation.target);
                            if (mediaElements.length > 0) {
                                needsUpdate = true;
                            }
                        }
                    }
                });

                if (needsUpdate) {
                    updateAudioEffects();
                }
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["src", "class", "data-player"],
            });

            // Additional periodic check for dynamically loaded content
            setInterval(() => {
                updateAudioEffects();
            }, 5000); // Check every 5 seconds
        };

        const setupAudioContext = async (mediaElement: HTMLMediaElement) => {
            if (!mediaElement || !(mediaElement instanceof HTMLMediaElement)) {
                throw new Error("Invalid media element provided");
            }

            // Check if extension context is still valid
            if (!chrome.runtime?.id) {
                throw new Error("Extension context invalid");
            }

            // Clean up existing audio context if any
            if (audioElementMap.has(mediaElement)) {
                const existing = audioElementMap.get(mediaElement)!;
                try {
                    existing.source?.disconnect();
                    existing.gain?.disconnect();
                    existing.bassFilter?.disconnect();
                    existing.voiceFilter?.disconnect();
                    if (existing.merger) existing.merger.disconnect();
                    if (existing.splitter) existing.splitter.disconnect();
                } catch (e) {
                    console.warn("Content: Error during cleanup:", e);
                }
                audioElementMap.delete(mediaElement);
            }

            // Create/resume audio context
            try {
                if (!audioContext || audioContext.state === "closed") {
                    audioContext = new AudioContext();
                }
                if (audioContext.state === "suspended") {
                    await audioContext.resume();
                }
            } catch (e) {
                throw new Error(`Failed to create/resume AudioContext: ${e}`);
            }

            // Create audio nodes
            const source = audioContext.createMediaElementSource(mediaElement);
            const gain = audioContext.createGain();
            const bassFilter = audioContext.createBiquadFilter();
            const voiceFilter = audioContext.createBiquadFilter();
            const merger = audioContext.createChannelMerger(2);
            const splitter = audioContext.createChannelSplitter(2);

            // Configure filters
            bassFilter.type = "lowshelf";
            bassFilter.frequency.value = 150;
            bassFilter.gain.value = 0;

            voiceFilter.type = "peaking";
            voiceFilter.frequency.value = 2500;
            voiceFilter.Q.value = 1.5;
            voiceFilter.gain.value = 0;

            // Connect nodes
            if (currentSettings.mono) {
                source.connect(bassFilter);
                bassFilter.connect(voiceFilter);
                voiceFilter.connect(splitter);
                splitter.connect(merger, 0, 0);
                splitter.connect(merger, 0, 1);
                merger.connect(gain);
            } else {
                source.connect(bassFilter);
                bassFilter.connect(voiceFilter);
                voiceFilter.connect(gain);
            }
            gain.connect(audioContext.destination);

            // Store audio nodes
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

            // Set initial values
            const volumeMultiplier = currentSettings.volume / 100;
            gain.gain.setValueAtTime(
                volumeMultiplier,
                audioContext.currentTime
            );

            const bassBoostGain =
                ((currentSettings.bassBoost - 100) / 100) * 15;
            bassFilter.gain.setValueAtTime(
                bassBoostGain,
                audioContext.currentTime
            );

            const voiceBoostGain =
                ((currentSettings.voiceBoost - 100) / 100) * 24;
            voiceFilter.gain.setValueAtTime(
                voiceBoostGain,
                audioContext.currentTime
            );
        };

        // Initialize observers after settings are loaded
        await initializeSettings();
        initMediaElementObserver();
    },
});
