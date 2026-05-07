var content = (function() {
  "use strict";var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  function defineContentScript(definition2) {
    return definition2;
  }
  class AudioProcessor {
    constructor() {
      __publicField(this, "audioContext", null);
      __publicField(this, "audioElementMap", /* @__PURE__ */ new Map());
    }
    async setupAudioContext(mediaElement, settings) {
      try {
        console.log(
          "AudioProcessor: Setting up audio context with settings:",
          settings
        );
        if (mediaElement.readyState < HTMLMediaElement.HAVE_METADATA) {
          console.warn(
            `AudioProcessor: Media element ${mediaElement.src || "(no src)"} is not ready (readyState: ${mediaElement.readyState}). Deferring audio context setup.`
          );
          return;
        }
        if (!this.audioContext) {
          this.audioContext = new AudioContext();
        }
        let nodes = this.audioElementMap.get(mediaElement);
        if (nodes) {
          console.log(
            `[AudioProcessor] Reusing existing audio nodes for element: ${mediaElement.src || "(no src)"}`
          );
          let sourceChanged = false;
          if (this.audioContext && (nodes.currentSrc !== mediaElement.currentSrc || !nodes.source)) {
            console.log(
              `[AudioProcessor] Media source changed from ${nodes.currentSrc} to ${mediaElement.src || "(no src)"} or source invalid. Recreating source node.`
            );
            if (nodes.source) {
              try {
                nodes.source.disconnect();
              } catch (e) {
              }
            }
            nodes.source = this.audioContext.createMediaElementSource(mediaElement);
            nodes.currentSrc = mediaElement.currentSrc;
            sourceChanged = true;
          }
          const monoChanged = nodes.mono !== settings.mono;
          if (sourceChanged || monoChanged) {
            console.log(
              `[AudioProcessor] Graph topology changed (sourceChanged=${sourceChanged}, monoChanged=${monoChanged}). Reconnecting nodes.`
            );
            await this.connectNodes(nodes, settings);
          } else {
            await this.updateNodeSettings(nodes, settings);
          }
        } else {
          console.log(
            `[AudioProcessor] Creating new audio nodes for element: ${mediaElement.src || "(no src)"}`
          );
          nodes = await this.createAudioNodes(mediaElement, settings);
          this.audioElementMap.set(mediaElement, nodes);
        }
        console.log("AudioProcessor: Setup complete for:", mediaElement.src);
      } catch (error) {
        console.error("AudioProcessor: Setup failed:", error);
        throw error;
      }
    }
    async createAudioNodes(mediaElement, settings) {
      if (!this.audioContext) {
        throw new Error("AudioContext not initialized");
      }
      const source = this.audioContext.createMediaElementSource(mediaElement);
      const gain = this.audioContext.createGain();
      const bassFilter = this.audioContext.createBiquadFilter();
      const voiceFilter = this.audioContext.createBiquadFilter();
      const splitter = this.audioContext.createChannelSplitter(2);
      const merger = this.audioContext.createChannelMerger(2);
      bassFilter.type = "lowshelf";
      bassFilter.frequency.value = 100;
      voiceFilter.type = "peaking";
      voiceFilter.frequency.value = 2e3;
      voiceFilter.Q.value = 1;
      const nodes = {
        context: this.audioContext,
        source,
        gain,
        bassFilter,
        voiceFilter,
        splitter,
        merger,
        element: mediaElement,
        mono: settings.mono,
        // Initialize mono setting, connectNodes will use settings.mono
        currentSrc: mediaElement.currentSrc
        // Initialize currentSrc
      };
      await this.connectNodes(nodes, settings);
      return nodes;
    }
    async updateNodeSettings(nodes, settings) {
      const { gain, bassFilter, voiceFilter, context, element } = nodes;
      try {
        const safeTimeValue = isFinite(context.currentTime) ? context.currentTime : 0;
        let elementVolume = 1;
        let gainNodeVolume = 1;
        if (settings.volume <= 100) {
          elementVolume = Math.max(0, settings.volume) / 100;
          gainNodeVolume = 1;
        } else {
          elementVolume = 1;
          gainNodeVolume = Math.max(1, Math.min(settings.volume, 1e3)) / 100;
        }
        if (isFinite(elementVolume)) {
          element.volume = elementVolume;
        }
        const clampedBass = Math.max(
          -15,
          Math.min((settings.bassBoost - 100) / 100 * 15, 15)
        );
        const clampedVoice = Math.max(
          -24,
          Math.min((settings.voiceBoost - 100) / 100 * 24, 24)
        );
        const timeConstant = 0.01;
        const currentTime = context.currentTime;
        gain.gain.value = gainNodeVolume;
        bassFilter.gain.value = clampedBass;
        voiceFilter.gain.value = clampedVoice;
        console.log(
          `[AudioProcessor] Applying Node Settings (immediate + setTargetAtTime) at ${currentTime}:`,
          {
            elementVolume: element.volume,
            // Log the directly set element volume
            targetGainNodeVolume: gainNodeVolume,
            // Log target values
            targetBassGain: clampedBass,
            targetVoiceGain: clampedVoice,
            voiceGain: clampedVoice,
            mono: settings.mono
            // Log mono setting as it affects connections
          }
        );
      } catch (error) {
        console.error("AudioProcessor: Failed to update settings:", error);
        throw error;
      }
    }
    async connectNodes(nodes, settings) {
      const { source, bassFilter, voiceFilter, gain, splitter, merger, context, element } = nodes;
      console.log(
        `[AudioProcessor] Connecting/Reconnecting nodes for ${element.src || "(no src)"}. Target Mono: ${settings.mono}, Current Node Mono: ${nodes.mono}`
      );
      console.log(
        `[AudioProcessor] connectNodes: Current mono state for element: ${nodes.mono}, Target mono state: ${settings.mono}`
      );
      const safeDisconnect = (node) => {
        if (node) {
          try {
            node.disconnect();
          } catch (e) {
          }
        }
      };
      safeDisconnect(source);
      safeDisconnect(bassFilter);
      safeDisconnect(voiceFilter);
      safeDisconnect(splitter);
      safeDisconnect(merger);
      safeDisconnect(gain);
      if (!source) {
        console.error(
          "[AudioProcessor] Source node is null in connectNodes. Cannot connect graph."
        );
        await this.updateNodeSettings(nodes, settings);
        return;
      }
      if (settings.mono) {
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
      gain.connect(context.destination);
      nodes.mono = settings.mono;
      await this.updateNodeSettings(nodes, settings);
    }
    /**
     * Disconnects audio nodes for a specific element and removes it from the map.
     * @param element The HTMLMediaElement to disconnect.
     * @returns True if nodes were found and disconnected, false otherwise.
     */
    disconnectElementNodes(element) {
      const nodes = this.audioElementMap.get(element);
      if (!nodes) return false;
      console.log(
        `[AudioProcessor] Disconnecting nodes for element: ${element.src || "(no src)"}`
      );
      try {
        const safeDisconnect = (node) => {
          try {
            node.disconnect();
          } catch (e) {
          }
        };
        safeDisconnect(nodes.gain);
        safeDisconnect(nodes.voiceFilter);
        safeDisconnect(nodes.bassFilter);
        safeDisconnect(nodes.splitter);
        safeDisconnect(nodes.merger);
        safeDisconnect(nodes.source);
        nodes.source = null;
        nodes.gain = null;
        nodes.bassFilter = null;
        nodes.voiceFilter = null;
        nodes.splitter = null;
        nodes.merger = null;
        this.audioElementMap.delete(element);
        return true;
      } catch (error) {
        console.error(
          `AudioProcessor: Error disconnecting nodes for ${element.src || "(no src)"}:`,
          error
        );
        this.audioElementMap.delete(element);
        return false;
      }
    }
    async updateAudioEffects(settings) {
      console.log(
        "[AudioProcessor] Updating audio effects with settings:",
        JSON.stringify(settings)
      );
      for (const [element, nodes] of this.audioElementMap.entries()) {
        if (!element.isConnected) {
          console.log(
            `[AudioProcessor] Element ${element.src || "(no src)"} is no longer connected to DOM. Disconnecting and removing.`
          );
          this.disconnectElementNodes(element);
          continue;
        }
        try {
          await this.setupAudioContext(element, settings);
          console.log(
            `[AudioProcessor] Updated settings for element: ${element.src || "(no src)"}.`
          );
        } catch (error) {
          console.error(
            "AudioProcessor: Update failed for element:",
            element.src,
            error
          );
        }
      }
    }
    async resetAllToDisabled() {
      this.audioElementMap.forEach((nodes, element) => {
        this.disconnectElementNodes(element);
      });
      this.audioElementMap.clear();
    }
    hasProcessing(mediaElement) {
      return this.audioElementMap.has(mediaElement);
    }
    cleanup() {
      this.audioElementMap.clear();
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }
      console.log("AudioProcessor: Cleanup completed");
    }
    /**
     * Attempts to resume the AudioContext if it's suspended.
     * Should be called after a user gesture.
     */
    async tryResumeContext() {
      if (this.audioContext && this.audioContext.state === "suspended") {
        try {
          await this.audioContext.resume();
          console.log("AudioProcessor: AudioContext resumed successfully.");
        } catch (error) {
          console.error("AudioProcessor: Failed to resume AudioContext:", error);
        }
      } else if (this.audioContext) ;
    }
  }
  content;
  const mediaConfig = {
    baseSelectors: [
      "video",
      "audio",
      // Essential player patterns
      "[class*='player']",
      "[class*='video']",
      "[id*='player']",
      "[id*='video']",
      // Common frameworks
      ".video-js",
      ".jwplayer",
      ".html5-video-player",
      ".plyr",
      // Key data attributes
      "[data-player]",
      "[data-video]",
      "[data-media]",
      // Key iframe sources
      "iframe[src*='youtube.com']",
      "iframe[src*='vimeo.com']",
      "iframe[src*='dailymotion.com']",
      "iframe[src*='twitch.tv']"
    ],
    siteSelectors: {
      "youtube.com": [".html5-video-player"],
      "netflix.com": ["[data-uia='video-player']"],
      "hulu.com": [".HuluPlayer"],
      "amazon.com": ["[data-player='AmazonVideo']"],
      "disneyplus.com": [".dp-video-player"]
    }
  };
  const _MediaManager = class _MediaManager {
    static isExtensionContext() {
      try {
        return window.location.protocol === "chrome-extension:" || window.location.protocol === "moz-extension:" || window.location.protocol === "edge-extension:";
      } catch (e) {
        return false;
      }
    }
    // Optimized visibility check
    static isElementVisible(element) {
      return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    }
    // Use the full siteSelectors configuration
    static getExtraSelectorsForSite() {
      const currentHostname = window.location.hostname;
      for (const siteHostname in mediaConfig.siteSelectors) {
        if (currentHostname === siteHostname) {
          return mediaConfig.siteSelectors[siteHostname];
        }
      }
      return [];
    }
    // Updated custom player detection with fallback dynamic scanning
    static findCustomPlayers(root) {
      const customPlayers = [];
      const baseSelectors = mediaConfig.baseSelectors;
      const siteSelectors = this.getExtraSelectorsForSite();
      const allSelectors = [...baseSelectors, ...siteSelectors];
      const selectorElements = /* @__PURE__ */ new Set();
      try {
        for (const selector of allSelectors) {
          try {
            const elements = root.querySelectorAll(selector);
            elements.forEach((el) => selectorElements.add(el));
          } catch (e) {
            console.warn(`Error with selector '${selector}':`, e);
          }
        }
        selectorElements.forEach((element) => {
          if (element instanceof HTMLElement && !this.processedElements.has(element)) {
            this.processedElements.add(element);
            customPlayers.push(element);
          }
        });
      } catch (e) {
        console.warn("Error finding custom players:", e);
      }
      return customPlayers;
    }
    static findMediaElements(root = document, depth = 0) {
      if (this.isExtensionContext() || depth > this.MAX_DEPTH) {
        return [];
      }
      const elements = [];
      try {
        const mediaElements = root.querySelectorAll("video, audio");
        mediaElements.forEach((element) => {
          if (element instanceof HTMLMediaElement) {
            elements.push(element);
          }
        });
        if (root instanceof Element && root.shadowRoot) {
          elements.push(...this.findMediaElements(root.shadowRoot, depth + 1));
        }
        if (depth === 0) {
          const customPlayers = this.findCustomPlayers(root);
          customPlayers.forEach((player) => {
            const mediaInPlayer = player.querySelectorAll("video, audio");
            mediaInPlayer.forEach((element) => {
              if (element instanceof HTMLMediaElement) {
                elements.push(element);
              }
            });
          });
        }
      } catch (e) {
        if (!this.isExtensionContext()) {
          console.warn("Error finding media elements:", e);
        }
      }
      return Array.from(new Set(elements));
    }
    static setupMediaElementObserver(onAdded, onRemoved) {
      const debouncedCheck = () => {
        if (_MediaManager.debounceTimeout) {
          clearTimeout(_MediaManager.debounceTimeout);
        }
        _MediaManager.debounceTimeout = setTimeout(() => {
          const elements = this.findMediaElements();
          if (elements.length > 0) {
            onAdded(elements);
          }
        }, _MediaManager.DEBOUNCE_DELAY);
      };
      if (!this.isExtensionContext()) {
        debouncedCheck();
      }
      const observer = new MutationObserver((mutations) => {
        const addedMediaElements = [];
        const removedMediaElements = [];
        mutations.forEach((mutation) => {
          if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => {
              if (node instanceof HTMLMediaElement) {
                addedMediaElements.push(node);
              } else if (node instanceof HTMLElement) {
                node.querySelectorAll("video, audio").forEach((el) => {
                  if (el instanceof HTMLMediaElement) {
                    addedMediaElements.push(el);
                  }
                });
              }
            });
            mutation.removedNodes.forEach((node) => {
              if (node instanceof HTMLMediaElement) {
                removedMediaElements.push(node);
              } else if (node instanceof HTMLElement) {
                node.querySelectorAll("video, audio").forEach((el) => {
                  if (el instanceof HTMLMediaElement) {
                    removedMediaElements.push(el);
                  }
                });
              }
            });
          }
        });
        if (addedMediaElements.length > 0) {
          console.log(
            "[MediaManager Observer] Added media elements detected, triggering debounced check."
          );
          debouncedCheck();
        }
        if (removedMediaElements.length > 0) {
          console.log(
            `[MediaManager Observer] Removed ${removedMediaElements.length} media elements, triggering cleanup.`
          );
          onRemoved(removedMediaElements);
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
      return observer;
    }
  };
  __publicField(_MediaManager, "debounceTimeout", null);
  __publicField(_MediaManager, "processedElements", /* @__PURE__ */ new WeakSet());
  // Keep for custom player containers
  __publicField(_MediaManager, "DEBOUNCE_DELAY", 500);
  __publicField(_MediaManager, "MAX_DEPTH", 10);
  let MediaManager = _MediaManager;
  content;
  class MediaProcessor {
    constructor() {
      __publicField(this, "audioProcessor");
      __publicField(this, "activeMediaElements", /* @__PURE__ */ new Set());
      __publicField(this, "elementSettings", /* @__PURE__ */ new WeakMap());
      __publicField(this, "elementListeners", /* @__PURE__ */ new WeakMap());
      /**
       * Apply settings directly to media elements without waiting for async operations
       * Useful for immediate UI feedback
       */
      __publicField(this, "lastAppliedSettings", null);
      this.audioProcessor = new AudioProcessor();
    }
    // Method to get currently managed media elements, filtering for connected ones
    getManagedMediaElements() {
      const disconnected = [];
      this.activeMediaElements.forEach((el) => {
        if (!el.isConnected) {
          disconnected.push(el);
        }
      });
      disconnected.forEach((el) => this.cleanupElement(el));
      return Array.from(this.activeMediaElements);
    }
    updatePlaybackSpeed(element, speed) {
      if (!element.isConnected) {
        console.warn(
          `[MediaProcessor] Attempted to update speed on disconnected element: ${element.src || "(no src)"}`
        );
        this.activeMediaElements.delete(element);
        return;
      }
      try {
        const wasPlaying = !element.paused;
        const currentTime = element.currentTime;
        element.playbackRate = speed / 100;
        element.defaultPlaybackRate = speed / 100;
        if (wasPlaying) {
        } else {
          element.currentTime = currentTime;
        }
      } catch (e) {
        console.error(
          `MediaProcessor: Error setting speed for ${element.src || "(no src)"}:`,
          e
        );
      }
    }
    async processMediaElements(mediaElements, settings, needsAudioEffectsSetup) {
      if (mediaElements.length > 0) {
        console.debug(
          `[MediaProcessor] Processing ${mediaElements.length} media element(s). Audio effects: ${needsAudioEffectsSetup}`
        );
      }
      mediaElements.forEach((element) => {
        if (element.isConnected) {
          this.updatePlaybackSpeed(element, settings.speed);
        } else {
          this.activeMediaElements.delete(element);
        }
      });
      if (needsAudioEffectsSetup) {
        await this.audioProcessor.tryResumeContext();
        for (const element of mediaElements) {
          if (!element.isConnected) {
            this.activeMediaElements.delete(element);
            continue;
          }
          try {
            await this.audioProcessor.setupAudioContext(element, settings);
            this.activeMediaElements.add(element);
          } catch (e) {
            console.error(
              `[MediaProcessor] Error setting up audio for ${element.src || "(no src)"}:`,
              e
            );
          }
        }
        if (this.audioProcessor.audioContext && this.audioProcessor.audioContext.state === "running") {
          await this.audioProcessor.updateAudioEffects(settings);
        }
      } else {
        for (const element of mediaElements) {
          if (!element.isConnected) {
            this.activeMediaElements.delete(element);
            continue;
          }
          try {
            if (this.audioProcessor.hasProcessing(element)) {
              this.audioProcessor.disconnectElementNodes(element);
              this.activeMediaElements.delete(element);
            }
          } catch (e) {
            console.error(
              `[MediaProcessor] Error disconnecting effects for ${element.src || "(no src)"}:`,
              e
            );
          }
        }
        if (this.activeMediaElements.size === 0) {
          this.audioProcessor.cleanup();
        }
      }
    }
    applySettingsImmediately(mediaElements, settings, disabled = false) {
      if (disabled) {
        console.log(
          "[MediaProcessor] Disabling media processing and pausing media elements"
        );
        mediaElements.forEach((element) => {
          if (this.elementSettings.has(element)) {
            try {
              if (!element.paused) {
                element.pause();
              }
              element.playbackRate = 1;
              element.defaultPlaybackRate = 1;
              this.cleanupElement(element);
            } catch (e) {
              console.error(
                `MediaProcessor: Error resetting element ${element.src || "(no src)"} in disabled mode:`,
                e
              );
            }
          }
        });
        return;
      }
      console.log(
        "[MediaProcessor] Applying settings immediately to media elements"
      );
      const targetSpeed = settings.speed / 100;
      for (const element of mediaElements) {
        try {
          if (!element.isConnected) {
            this.cleanupElement(element);
            continue;
          }
          element.playbackRate = targetSpeed;
          element.defaultPlaybackRate = targetSpeed;
          this.elementSettings.set(element, settings);
          if (!this.elementListeners.has(element)) {
            const playHandler = () => {
              console.log(`[MediaProcessor] Reapplying settings on play event for ${element.src || "(no src)"}`);
              const currentSettings = this.elementSettings.get(element);
              if (currentSettings) {
                this.updatePlaybackSpeed(element, currentSettings.speed);
              }
            };
            element.addEventListener("play", playHandler);
            this.elementListeners.set(element, playHandler);
          }
          if (!this.activeMediaElements.has(element)) {
            this.activeMediaElements.add(element);
          }
        } catch (e) {
          console.error(
            `MediaProcessor: Error applying settings to ${element.src || "(no src)"}:`,
            e
          );
        }
      }
    }
    cleanupElement(element) {
      if (this.activeMediaElements.has(element)) {
        this.activeMediaElements.delete(element);
      }
      const playHandler = this.elementListeners.get(element);
      if (playHandler) {
        element.removeEventListener("play", playHandler);
        this.elementListeners.delete(element);
      }
      this.elementSettings.delete(element);
    }
    applySettingsToVisibleMedia(settings, disabled = false) {
      const visibleMedia = this.getManagedMediaElements().filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0
      );
      if (visibleMedia.length > 0) {
        console.log(
          `[MediaProcessor] Applying settings to ${visibleMedia.length} visible media elements`
        );
        this.applySettingsImmediately(visibleMedia, settings, disabled);
      }
    }
    /**
     * Force update of audio effects even if context already exists
     * Useful for immediate application of filter/audio changes
     */
    async forceAudioEffectsUpdate(settings) {
      console.log("[MediaProcessor] Forcing audio effects update");
      if (this.audioProcessor["audioContext"] && this.audioProcessor["audioContext"].state !== "closed") {
        try {
          if (this.audioProcessor["audioContext"].state === "suspended") {
            await this.audioProcessor["audioContext"].resume();
          }
          await this.audioProcessor.updateAudioEffects(settings);
          console.log(
            "[MediaProcessor] Successfully forced audio effects update"
          );
        } catch (e) {
          console.error(
            "[MediaProcessor] Failed to force audio effects update:",
            e
          );
        }
      } else {
        console.log(
          "[MediaProcessor] Creating new audio context for forced update"
        );
        const mockElement = document.createElement("audio");
        await this.audioProcessor.setupAudioContext(mockElement, settings);
      }
    }
    static setupMediaObserver(onAdded, onRemoved) {
      return MediaManager.setupMediaElementObserver(onAdded, onRemoved);
    }
    findMediaElements() {
      return MediaManager.findMediaElements();
    }
    async resetToDisabled() {
      await this.audioProcessor.resetAllToDisabled();
    }
    /**
     * Public method to attempt resuming the AudioContext via the private AudioProcessor.
     */
    async attemptContextResume() {
      await this.audioProcessor.tryResumeContext();
    }
    /**
     * Public method to check if the AudioContext is ready for applying audio effects.
     */
    canApplyAudioEffects() {
      return !!this.audioProcessor["audioContext"] && this.audioProcessor["audioContext"].state === "running";
    }
  }
  content;
  const defaultSettings = {
    volume: 100,
    bassBoost: 100,
    voiceBoost: 100,
    mono: false,
    speed: 100
  };
  function isSettingsDisabled(settings) {
    return settings.speed === 100 && settings.volume === 100 && settings.bassBoost === 100 && settings.voiceBoost === 100 && !settings.mono;
  }
  content;
  class SettingsHandler {
    // Definite assignment assertion
    constructor() {
      __publicField(this, "currentSettings");
      __publicField(this, "targetHostname", null);
      // Store the hostname we should use
      __publicField(this, "initializationComplete");
      __publicField(this, "resolveInitialization");
      this.currentSettings = { ...defaultSettings };
      this.initializationComplete = new Promise((resolve) => {
        this.resolveInitialization = resolve;
      });
    }
    /**
     * Initializes the handler by requesting the correct settings
     * for the target hostname from the background script.
     * @param hostname The hostname to fetch settings for (ideally top-level).
     */
    async initialize(hostname) {
      this.targetHostname = hostname;
      console.log(
        `SettingsHandler (Target: ${this.targetHostname}): Initializing...`
      );
      if (!this.targetHostname) {
        console.error(
          `SettingsHandler (Target: ${this.targetHostname}): Initialization aborted - no valid target hostname provided.`
        );
        this.currentSettings = { ...defaultSettings };
        this.resolveInitialization();
        return;
      }
      console.log(
        `SettingsHandler (Target: ${this.targetHostname}): Attempting to send GET_INITIAL_SETTINGS.`
      );
      try {
        const response = await chrome.runtime.sendMessage({
          type: "GET_INITIAL_SETTINGS",
          hostname: this.targetHostname
        });
        console.log(
          `SettingsHandler (Target: ${this.targetHostname}): GET_INITIAL_SETTINGS response received:`,
          response
        );
        if (response && response.settings) {
          this.currentSettings = response.settings;
          console.log(
            `SettingsHandler (Target: ${this.targetHostname}): Successfully applied initial settings from background:`,
            JSON.stringify(this.currentSettings)
          );
        } else {
          this.currentSettings = { ...defaultSettings };
          console.warn(
            `SettingsHandler (Target: ${this.targetHostname}): No valid settings in response or response was null/undefined. Using defaults. Response:`,
            response,
            "Current settings now:",
            JSON.stringify(this.currentSettings)
          );
        }
      } catch (error) {
        this.currentSettings = { ...defaultSettings };
        console.error(
          `SettingsHandler (Target: ${this.targetHostname}): Error during GET_INITIAL_SETTINGS sendMessage or processing:`,
          error,
          "Using defaults. Current settings now:",
          JSON.stringify(this.currentSettings)
        );
      } finally {
        console.log(
          `SettingsHandler (Target: ${this.targetHostname}): Initialization promise resolving. Final currentSettings state for this init cycle:`,
          JSON.stringify(this.currentSettings)
        );
        this.resolveInitialization();
      }
    }
    /**
     * Returns a promise that resolves once initial settings have been
     * fetched (or failed to fetch) from the background script.
     */
    async ensureInitialized() {
      return this.initializationComplete;
    }
    /**
     * Gets the currently loaded settings.
     */
    getCurrentSettings() {
      return this.currentSettings;
    }
    /**
     * Updates settings locally. Should primarily be used when receiving
     * updates from the background script via messages.
     */
    updateSettings(settings) {
      console.log(
        `SettingsHandler (Target: ${this.targetHostname}): Settings updated directly`,
        settings
      );
      this.currentSettings = settings;
    }
    /**
     * Resets settings to the application defaults locally.
     */
    resetToDefault() {
      this.currentSettings = { ...defaultSettings };
    }
    /**
     * Determines if audio processing is needed based on current settings.
     */
    needsAudioProcessing() {
      const defaults = defaultSettings;
      const needsProcessing = !(this.currentSettings.volume === defaults.volume && this.currentSettings.bassBoost === defaults.bassBoost && this.currentSettings.voiceBoost === defaults.voiceBoost && this.currentSettings.mono === defaults.mono);
      return needsProcessing;
    }
  }
  content;
  function setupHostnameDetection(initializeScript) {
    let cleanupFunctions = [];
    if (window.self === window.top) {
      const topHostname = window.location.hostname;
      console.log(
        `[ContentScript] Running in TOP window. Hostname: ${topHostname}`
      );
      initializeScript(topHostname);
      const topWindowMessageListener = (event) => {
        console.log(
          `[ContentScript TOP] Received message. Origin: ${event.origin}, Data Type: ${typeof event.data}, Data: ${event.data}`
        );
        if (typeof event.data !== "string" || !event.data.startsWith("{") || !event.data.endsWith("}")) {
          console.log(
            "[ContentScript TOP] Ignoring non-JSON or non-VVP message from iframe (format mismatch)."
          );
          return;
        }
        if (!event.data.includes("VVP_REQUEST_TOP_HOSTNAME") && !event.data.includes("VVP_TOP_HOSTNAME_INFO")) {
          console.log(
            "[ContentScript TOP] Ignoring non-VVP message from iframe (content mismatch)."
          );
          return;
        }
        let parsedData;
        try {
          parsedData = JSON.parse(event.data);
        } catch (e) {
          console.warn(
            "[ContentScript TOP] Failed to parse event.data string from iframe (likely not our message):",
            event.data,
            e
          );
          return;
        }
        console.log(
          `[ContentScript TOP] Parsed VVP message from iframe (Origin: ${event.origin}):`,
          parsedData
        );
        if (event.source && // Ensure source exists (source is the window object of the sender)
        parsedData && parsedData.type === "VVP_REQUEST_TOP_HOSTNAME") {
          console.log(
            `[ContentScript TOP] Processing VVP_REQUEST_TOP_HOSTNAME from iframe (Source origin: ${event.origin}). Responding with hostname: ${topHostname}.`
          );
          const responsePayload = JSON.stringify({
            type: "VVP_TOP_HOSTNAME_INFO",
            hostname: topHostname,
            success: true
          });
          const targetOrigin = event.origin === "null" ? "*" : event.origin;
          event.source.postMessage(responsePayload, targetOrigin);
          console.log(
            `[ContentScript TOP] Sent VVP_TOP_HOSTNAME_INFO response to iframe at ${event.origin}.`
          );
        } else {
          console.log(
            `[ContentScript TOP] Received other parsed JSON message type (not VVP_REQUEST_TOP_HOSTNAME): ${parsedData.type} from origin ${event.origin}`,
            parsedData
          );
        }
      };
      window.addEventListener("message", topWindowMessageListener);
      const removeTopListener = () => window.removeEventListener("message", topWindowMessageListener);
      cleanupFunctions.push(removeTopListener);
    } else {
      const iframeOwnHostname = window.location.hostname;
      console.log(
        `[ContentScript iFrame] Running in IFRAME. Own hostname: ${iframeOwnHostname}. Attempting to request hostname from top window. Setting up message listener.`
      );
      let receivedHostname = false;
      let fallbackTimeout = null;
      const responseListener = (event) => {
        console.log(
          `[ContentScript iFrame] Received message. Origin: ${event.origin}, Data Type: ${typeof event.data}, Data: ${event.data}`
        );
        if (event.source !== window.top) {
          console.log(
            `[ContentScript iFrame] Received message from non-top source: ${event.origin}. Ignoring.`
          );
          return;
        }
        if (typeof event.data !== "string" || !event.data.startsWith("{") || !event.data.endsWith("}")) {
          console.log(
            "[ContentScript iFrame] Ignoring non-JSON or non-VVP message from top (format mismatch)."
          );
          return;
        }
        if (!event.data.includes("VVP_REQUEST_TOP_HOSTNAME") && !event.data.includes("VVP_TOP_HOSTNAME_INFO")) {
          console.log(
            "[ContentScript iFrame] Ignoring non-VVP message from top (content mismatch)."
          );
          return;
        }
        let parsedData;
        try {
          parsedData = JSON.parse(event.data);
        } catch (e) {
          console.warn(
            "[ContentScript iFrame] Failed to parse event.data string from top:",
            event.data,
            e
          );
          return;
        }
        console.log(
          `[ContentScript iFrame] Parsed VVP message from top (Origin: ${event.origin}):`,
          parsedData
        );
        if (parsedData && parsedData.type === "VVP_TOP_HOSTNAME_INFO" && typeof parsedData.hostname === "string") {
          if (fallbackTimeout) {
            clearTimeout(fallbackTimeout);
            fallbackTimeout = null;
          }
          if (receivedHostname) {
            console.log(
              `[ContentScript iFrame] Already received hostname. Ignoring duplicate VVP_TOP_HOSTNAME_INFO from top. Origin: ${event.origin}. Parsed Data:`,
              parsedData
            );
            return;
          }
          receivedHostname = true;
          console.log(
            `[ContentScript iFrame] Successfully received VVP_TOP_HOSTNAME_INFO from top: ${parsedData.hostname}. Origin: ${event.origin}. Initializing script. Parsed data:`,
            parsedData
          );
          window.removeEventListener("message", responseListener);
          cleanupFunctions = cleanupFunctions.filter((f) => f !== removeResponseListener);
          initializeScript(parsedData.hostname);
        } else if (parsedData && parsedData.type) {
          console.log(
            `[ContentScript iFrame] Received other parsed JSON message type from top: ${parsedData.type} from origin ${event.origin}`,
            parsedData
          );
        }
      };
      const removeResponseListener = () => window.removeEventListener("message", responseListener);
      window.addEventListener("message", responseListener);
      cleanupFunctions.push(removeResponseListener);
      if (window.top && window.top !== window.self) {
        const requestTimeout = setTimeout(() => {
          if (window.top && window.top !== window.self) {
            console.log(
              `[ContentScript iFrame] Sending VVP_REQUEST_TOP_HOSTNAME to top window (Origin: ${window.location.origin}).`
            );
            const messagePayload = JSON.stringify({
              type: "VVP_REQUEST_TOP_HOSTNAME",
              fromIframe: true,
              iframeOrigin: window.location.origin
            });
            window.top.postMessage(messagePayload, "*");
            console.log(
              `[ContentScript iFrame] Sent VVP_REQUEST_TOP_HOSTNAME to top window.`
            );
          } else {
            console.warn(
              `[ContentScript iFrame] window.top became null or self within setTimeout. Cannot send message.`
            );
          }
        }, 500);
        cleanupFunctions.push(() => clearTimeout(requestTimeout));
      } else {
        console.warn(
          `[ContentScript iFrame] window.top is null, same as self, or inaccessible. Initializing with own hostname: ${iframeOwnHostname}.`
        );
        initializeScript(iframeOwnHostname);
        window.removeEventListener("message", responseListener);
        cleanupFunctions = cleanupFunctions.filter((f) => f !== removeResponseListener);
        return () => cleanupFunctions.forEach((f) => f());
      }
      const TIMEOUT_DURATION = 1e4;
      console.log(
        `[ContentScript iFrame] Setting fallback timeout for ${TIMEOUT_DURATION}ms. Timeout ID: ${fallbackTimeout}`
      );
      fallbackTimeout = window.setTimeout(() => {
        console.log(
          `[ContentScript iFrame] Fallback timeout triggered. Timeout ID: ${fallbackTimeout}. receivedHostname: ${receivedHostname}`
        );
        fallbackTimeout = null;
        if (!receivedHostname) {
          console.warn(
            `[ContentScript iFrame] Did not receive hostname from top after ${TIMEOUT_DURATION}ms. Using own hostname: ${iframeOwnHostname}. Removing response listener.`
          );
          window.removeEventListener("message", responseListener);
          cleanupFunctions = cleanupFunctions.filter((f) => f !== removeResponseListener);
          initializeScript(iframeOwnHostname);
        } else {
          console.log(
            `[ContentScript iFrame] Fallback timeout triggered, but hostname was already received. No action needed.`
          );
        }
      }, TIMEOUT_DURATION);
      cleanupFunctions.push(() => {
        if (fallbackTimeout) {
          clearTimeout(fallbackTimeout);
          fallbackTimeout = null;
        }
      });
    }
    return () => cleanupFunctions.forEach((f) => f());
  }
  content;
  function createMediaEventHandlers(settingsHandler, mediaProcessor) {
    const elementsWithListeners = /* @__PURE__ */ new WeakSet();
    const applySettingsToSingleElement = async (element) => {
      console.log(
        `[ContentScript DEBUG] applySettingsToSingleElement called for ${element.src || "(no src)"}`
      );
      try {
        await settingsHandler.ensureInitialized();
        const currentSettings = settingsHandler.getCurrentSettings();
        const needsProcessing = settingsHandler.needsAudioProcessing();
        console.log(
          `[ContentScript DEBUG] Applying settings to single element ${element.src || "(no src)"}:`
        );
        const isDisabled = isSettingsDisabled(currentSettings);
        mediaProcessor.applySettingsImmediately(
          [element],
          currentSettings,
          isDisabled
        );
        if (needsProcessing) {
          if (mediaProcessor.canApplyAudioEffects()) {
            await mediaProcessor.processMediaElements(
              [element],
              currentSettings,
              needsProcessing
            );
          } else {
            await mediaProcessor.attemptContextResume();
            if (mediaProcessor.canApplyAudioEffects()) {
              await mediaProcessor.processMediaElements(
                [element],
                currentSettings,
                needsProcessing
              );
            }
          }
        }
      } catch (error) {
        console.error(
          `[ContentScript DEBUG] Error applying settings to single element ${element.src || "(no src)"}:`
        );
      }
    };
    const onLoadedMetadata = (event) => {
      applySettingsToSingleElement(event.target);
    };
    const onCanPlay = (event) => {
      applySettingsToSingleElement(event.target);
    };
    const onLoadStart = (event) => {
      applySettingsToSingleElement(event.target);
    };
    const resumeContextHandler = async (event) => {
      console.log(
        "Content: Media interaction detected, attempting to resume AudioContext."
      );
      await mediaProcessor.attemptContextResume();
      const targetElement = event.target;
      if (targetElement) {
        try {
          await settingsHandler.ensureInitialized();
          const currentSettings = settingsHandler.getCurrentSettings();
          const needsProcessing = settingsHandler.needsAudioProcessing();
          await mediaProcessor.processMediaElements(
            [targetElement],
            currentSettings,
            needsProcessing
          );
        } catch (error) {
          console.error(
            `Content: Error applying audio effects after context resume:`
          );
        }
      }
    };
    function attachListeners(element) {
      if (!elementsWithListeners.has(element)) {
        elementsWithListeners.add(element);
        element.addEventListener("loadedmetadata", onLoadedMetadata);
        element.addEventListener("canplay", onCanPlay);
        element.addEventListener("loadstart", onLoadStart);
        element.addEventListener("play", resumeContextHandler);
      }
    }
    return {
      applySettingsToSingleElement,
      attachListeners,
      resumeContextHandler
    };
  }
  content;
  function createMessageHandler(settingsHandler, mediaProcessor) {
    return (message, sender, sendResponse) => {
      console.log(
        "[ContentScript Listener] Received message:",
        JSON.stringify(message)
      );
      if (message.type === "UPDATE_SETTINGS") {
        console.log(
          "[ContentScript Listener] Processing UPDATE_SETTINGS from background/popup"
        );
        (async () => {
          try {
            await settingsHandler.ensureInitialized();
            settingsHandler.updateSettings(message.settings);
            const newSettings = settingsHandler.getCurrentSettings();
            const needsProcessingNow = settingsHandler.needsAudioProcessing();
            const managedMediaElements = mediaProcessor.getManagedMediaElements();
            const isDisabled = isSettingsDisabled(newSettings);
            if (managedMediaElements.length > 0) {
              mediaProcessor.applySettingsImmediately(
                managedMediaElements,
                newSettings,
                isDisabled
              );
            }
            if (needsProcessingNow) {
              if (mediaProcessor.canApplyAudioEffects()) {
                if (managedMediaElements.length > 0) {
                  await mediaProcessor.processMediaElements(
                    managedMediaElements,
                    newSettings,
                    needsProcessingNow
                  );
                } else {
                  const freshScanElements = mediaProcessor.findMediaElements();
                  if (freshScanElements.length > 0) {
                    mediaProcessor.applySettingsImmediately(
                      freshScanElements,
                      newSettings,
                      isDisabled
                    );
                    if (!isDisabled && needsProcessingNow) {
                      await mediaProcessor.processMediaElements(
                        freshScanElements,
                        newSettings,
                        needsProcessingNow
                      );
                    }
                  }
                }
              }
            } else {
              if (managedMediaElements.length > 0) {
                await mediaProcessor.processMediaElements(
                  managedMediaElements,
                  newSettings,
                  needsProcessingNow
                );
              } else {
                const freshScanElements = mediaProcessor.findMediaElements();
                if (freshScanElements.length > 0) {
                  await mediaProcessor.processMediaElements(
                    freshScanElements,
                    newSettings,
                    needsProcessingNow
                  );
                }
              }
            }
          } catch (error) {
            console.error(
              "Content: Error during UPDATE_SETTINGS processing:",
              error
            );
          }
        })();
      }
      return false;
    };
  }
  content;
  function setupDomLifecycle(settingsHandler, mediaProcessor, processMedia) {
    const cleanupFunctions = [];
    const applyInitialSettings = async () => {
      console.log(
        `[ContentScript DEBUG] Applying initial settings for ${window.location.hostname}`
      );
      await processMedia();
    };
    const domContentLoadedListener = () => {
      console.log(
        `[ContentScript DEBUG] DOMContentLoaded event for ${window.location.hostname}`
      );
      applyInitialSettings();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", domContentLoadedListener);
      cleanupFunctions.push(
        () => document.removeEventListener("DOMContentLoaded", domContentLoadedListener)
      );
    } else {
      applyInitialSettings();
    }
    const mediaObserver = MediaProcessor.setupMediaObserver(
      async (addedElements) => {
        console.log(
          `[ContentScript] Processing ${addedElements.length} newly added media elements.`
        );
        await settingsHandler.ensureInitialized();
        const currentSettings = settingsHandler.getCurrentSettings();
        const needsProcessing = settingsHandler.needsAudioProcessing();
        await mediaProcessor.processMediaElements(
          addedElements,
          currentSettings,
          needsProcessing
        );
        const isDisabled = isSettingsDisabled(currentSettings);
        mediaProcessor.applySettingsImmediately(
          addedElements,
          currentSettings,
          isDisabled
        );
      },
      (removedElements) => {
        console.log(
          `[ContentScript] Cleaning up ${removedElements.length} removed media elements.`
        );
        removedElements.forEach((element) => {
          mediaProcessor.audioProcessor.disconnectElementNodes(element);
        });
        const remainingManagedElements = mediaProcessor.getManagedMediaElements();
        if (remainingManagedElements.length === 0 && !settingsHandler.needsAudioProcessing()) {
          console.log(
            "[ContentScript] No managed media elements left. Cleaning up AudioProcessor."
          );
          mediaProcessor.audioProcessor.cleanup();
        }
      }
    );
    cleanupFunctions.push(() => mediaObserver.disconnect());
    const beforeUnloadListener = () => {
      console.log(
        "[ContentScript] Page is unloading. Performing final AudioProcessor cleanup."
      );
      mediaProcessor.audioProcessor.cleanup();
    };
    window.addEventListener("beforeunload", beforeUnloadListener);
    cleanupFunctions.push(
      () => window.removeEventListener("beforeunload", beforeUnloadListener)
    );
    return cleanupFunctions;
  }
  content;
  async function initializeContentScript(settingsHandler, mediaProcessor, hostname) {
    console.log(`[ContentScript] Initializing script for hostname: ${hostname}`);
    settingsHandler.initialize(hostname);
    const cleanupFunctions = [];
    const { applySettingsToSingleElement, attachListeners } = createMediaEventHandlers(settingsHandler, mediaProcessor);
    const processMedia = async () => {
      console.log(
        `[ContentScript DEBUG] processMedia called for ${window.location.hostname}`
      );
      try {
        console.time("ensureInitialized");
        await settingsHandler.ensureInitialized();
        console.timeEnd("ensureInitialized");
      } catch (error) {
        console.timeEnd("ensureInitialized");
        console.error(
          `[ContentScript DEBUG] Error ensuring settings initialized:`
        );
        return false;
      }
      try {
        const currentSettings = settingsHandler.getCurrentSettings();
        const isDisabled = isSettingsDisabled(currentSettings);
        const mediaElements = mediaProcessor.findMediaElements();
        console.log(
          `[ContentScript DEBUG] Found ${mediaElements.length} media elements`
        );
        mediaElements.forEach((element) => {
          attachListeners(element);
          if (!isDisabled) {
            applySettingsToSingleElement(element);
          }
        });
      } catch (processingError) {
        console.error(
          `[ContentScript DEBUG] Error during media processing steps:`
        );
      }
      return true;
    };
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
      const messageHandler = createMessageHandler(settingsHandler, mediaProcessor);
      chrome.runtime.onMessage.addListener(messageHandler);
      cleanupFunctions.push(
        () => chrome.runtime.onMessage.removeListener(messageHandler)
      );
    } else {
      console.debug(
        "[ContentScript] chrome.runtime.onMessage not available - skipping message listener setup"
      );
    }
    const domCleanup = setupDomLifecycle(
      settingsHandler,
      mediaProcessor,
      processMedia
    );
    cleanupFunctions.push(...domCleanup);
    return () => {
      console.log("[ContentScript] Running cleanup functions.");
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }
  content;
  const definition = defineContentScript({
    matches: ["http://*/*", "https://*/*", "file://*/*"],
    allFrames: true,
    runAt: "document_idle",
    main: async () => {
      if (typeof chrome === "undefined" || typeof chrome.runtime === "undefined" || typeof chrome.runtime.onMessage === "undefined") {
        console.error("Chrome extension APIs are not available. Skipping content script execution.");
        return;
      }
      console.log(
        "Content: Script starting - This log should always appear",
        window.location.href
      );
      if (window.location.protocol === "file:") {
        console.log("Skipping content script for file URL");
        return;
      }
      const settingsHandler = new SettingsHandler();
      const mediaProcessor = new MediaProcessor();
      let hostnameDetectionCleanup = null;
      let contentScriptCleanup = null;
      hostnameDetectionCleanup = setupHostnameDetection(async (hostname) => {
        contentScriptCleanup = await initializeContentScript(settingsHandler, mediaProcessor, hostname);
      });
      const beforeUnloadListener = () => {
        console.log("[ContentScript] Page is unloading. Performing overall cleanup.");
        if (hostnameDetectionCleanup) {
          hostnameDetectionCleanup();
          hostnameDetectionCleanup = null;
        }
        if (contentScriptCleanup) {
          contentScriptCleanup();
          contentScriptCleanup = null;
        }
      };
      window.addEventListener("beforeunload", beforeUnloadListener);
    }
  });
  content;
  function getDefaultExportFromCjs(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
  }
  var browserPolyfill$1 = { exports: {} };
  var browserPolyfill = browserPolyfill$1.exports;
  var hasRequiredBrowserPolyfill;
  function requireBrowserPolyfill() {
    if (hasRequiredBrowserPolyfill) return browserPolyfill$1.exports;
    hasRequiredBrowserPolyfill = 1;
    (function(module, exports) {
      (function(global, factory) {
        {
          factory(module);
        }
      })(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : browserPolyfill, function(module2) {
        if (!(globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.id)) {
          throw new Error("This script should only be loaded in a browser extension.");
        }
        if (!(globalThis.browser && globalThis.browser.runtime && globalThis.browser.runtime.id)) {
          const CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE = "The message port closed before a response was received.";
          const wrapAPIs = (extensionAPIs) => {
            const apiMetadata = {
              "alarms": {
                "clear": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "clearAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "get": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "getAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "bookmarks": {
                "create": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "get": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getChildren": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getRecent": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getSubTree": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getTree": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "move": {
                  "minArgs": 2,
                  "maxArgs": 2
                },
                "remove": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeTree": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "search": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "update": {
                  "minArgs": 2,
                  "maxArgs": 2
                }
              },
              "browserAction": {
                "disable": {
                  "minArgs": 0,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "enable": {
                  "minArgs": 0,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "getBadgeBackgroundColor": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getBadgeText": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getPopup": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getTitle": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "openPopup": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "setBadgeBackgroundColor": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "setBadgeText": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "setIcon": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "setPopup": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "setTitle": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                }
              },
              "browsingData": {
                "remove": {
                  "minArgs": 2,
                  "maxArgs": 2
                },
                "removeCache": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeCookies": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeDownloads": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeFormData": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeHistory": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeLocalStorage": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removePasswords": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removePluginData": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "settings": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "commands": {
                "getAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "contextMenus": {
                "remove": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "update": {
                  "minArgs": 2,
                  "maxArgs": 2
                }
              },
              "cookies": {
                "get": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getAll": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getAllCookieStores": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "remove": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "set": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "devtools": {
                "inspectedWindow": {
                  "eval": {
                    "minArgs": 1,
                    "maxArgs": 2,
                    "singleCallbackArg": false
                  }
                },
                "panels": {
                  "create": {
                    "minArgs": 3,
                    "maxArgs": 3,
                    "singleCallbackArg": true
                  },
                  "elements": {
                    "createSidebarPane": {
                      "minArgs": 1,
                      "maxArgs": 1
                    }
                  }
                }
              },
              "downloads": {
                "cancel": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "download": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "erase": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getFileIcon": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "open": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "pause": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeFile": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "resume": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "search": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "show": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                }
              },
              "extension": {
                "isAllowedFileSchemeAccess": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "isAllowedIncognitoAccess": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "history": {
                "addUrl": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "deleteAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "deleteRange": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "deleteUrl": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getVisits": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "search": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "i18n": {
                "detectLanguage": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getAcceptLanguages": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "identity": {
                "launchWebAuthFlow": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "idle": {
                "queryState": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "management": {
                "get": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "getSelf": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "setEnabled": {
                  "minArgs": 2,
                  "maxArgs": 2
                },
                "uninstallSelf": {
                  "minArgs": 0,
                  "maxArgs": 1
                }
              },
              "notifications": {
                "clear": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "create": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "getAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "getPermissionLevel": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "update": {
                  "minArgs": 2,
                  "maxArgs": 2
                }
              },
              "pageAction": {
                "getPopup": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getTitle": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "hide": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "setIcon": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "setPopup": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "setTitle": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "show": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                }
              },
              "permissions": {
                "contains": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "remove": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "request": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "runtime": {
                "getBackgroundPage": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "getPlatformInfo": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "openOptionsPage": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "requestUpdateCheck": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "sendMessage": {
                  "minArgs": 1,
                  "maxArgs": 3
                },
                "sendNativeMessage": {
                  "minArgs": 2,
                  "maxArgs": 2
                },
                "setUninstallURL": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "sessions": {
                "getDevices": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "getRecentlyClosed": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "restore": {
                  "minArgs": 0,
                  "maxArgs": 1
                }
              },
              "storage": {
                "local": {
                  "clear": {
                    "minArgs": 0,
                    "maxArgs": 0
                  },
                  "get": {
                    "minArgs": 0,
                    "maxArgs": 1
                  },
                  "getBytesInUse": {
                    "minArgs": 0,
                    "maxArgs": 1
                  },
                  "remove": {
                    "minArgs": 1,
                    "maxArgs": 1
                  },
                  "set": {
                    "minArgs": 1,
                    "maxArgs": 1
                  }
                },
                "managed": {
                  "get": {
                    "minArgs": 0,
                    "maxArgs": 1
                  },
                  "getBytesInUse": {
                    "minArgs": 0,
                    "maxArgs": 1
                  }
                },
                "sync": {
                  "clear": {
                    "minArgs": 0,
                    "maxArgs": 0
                  },
                  "get": {
                    "minArgs": 0,
                    "maxArgs": 1
                  },
                  "getBytesInUse": {
                    "minArgs": 0,
                    "maxArgs": 1
                  },
                  "remove": {
                    "minArgs": 1,
                    "maxArgs": 1
                  },
                  "set": {
                    "minArgs": 1,
                    "maxArgs": 1
                  }
                }
              },
              "tabs": {
                "captureVisibleTab": {
                  "minArgs": 0,
                  "maxArgs": 2
                },
                "create": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "detectLanguage": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "discard": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "duplicate": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "executeScript": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "get": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getCurrent": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "getZoom": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "getZoomSettings": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "goBack": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "goForward": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "highlight": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "insertCSS": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "move": {
                  "minArgs": 2,
                  "maxArgs": 2
                },
                "query": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "reload": {
                  "minArgs": 0,
                  "maxArgs": 2
                },
                "remove": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeCSS": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "sendMessage": {
                  "minArgs": 2,
                  "maxArgs": 3
                },
                "setZoom": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "setZoomSettings": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "update": {
                  "minArgs": 1,
                  "maxArgs": 2
                }
              },
              "topSites": {
                "get": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "webNavigation": {
                "getAllFrames": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getFrame": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "webRequest": {
                "handlerBehaviorChanged": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "windows": {
                "create": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "get": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "getAll": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "getCurrent": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "getLastFocused": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "remove": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "update": {
                  "minArgs": 2,
                  "maxArgs": 2
                }
              }
            };
            if (Object.keys(apiMetadata).length === 0) {
              throw new Error("api-metadata.json has not been included in browser-polyfill");
            }
            class DefaultWeakMap extends WeakMap {
              constructor(createItem, items = void 0) {
                super(items);
                this.createItem = createItem;
              }
              get(key) {
                if (!this.has(key)) {
                  this.set(key, this.createItem(key));
                }
                return super.get(key);
              }
            }
            const isThenable = (value) => {
              return value && typeof value === "object" && typeof value.then === "function";
            };
            const makeCallback = (promise, metadata) => {
              return (...callbackArgs) => {
                if (extensionAPIs.runtime.lastError) {
                  promise.reject(new Error(extensionAPIs.runtime.lastError.message));
                } else if (metadata.singleCallbackArg || callbackArgs.length <= 1 && metadata.singleCallbackArg !== false) {
                  promise.resolve(callbackArgs[0]);
                } else {
                  promise.resolve(callbackArgs);
                }
              };
            };
            const pluralizeArguments = (numArgs) => numArgs == 1 ? "argument" : "arguments";
            const wrapAsyncFunction = (name, metadata) => {
              return function asyncFunctionWrapper(target, ...args) {
                if (args.length < metadata.minArgs) {
                  throw new Error(`Expected at least ${metadata.minArgs} ${pluralizeArguments(metadata.minArgs)} for ${name}(), got ${args.length}`);
                }
                if (args.length > metadata.maxArgs) {
                  throw new Error(`Expected at most ${metadata.maxArgs} ${pluralizeArguments(metadata.maxArgs)} for ${name}(), got ${args.length}`);
                }
                return new Promise((resolve, reject) => {
                  if (metadata.fallbackToNoCallback) {
                    try {
                      target[name](...args, makeCallback({
                        resolve,
                        reject
                      }, metadata));
                    } catch (cbError) {
                      console.warn(`${name} API method doesn't seem to support the callback parameter, falling back to call it without a callback: `, cbError);
                      target[name](...args);
                      metadata.fallbackToNoCallback = false;
                      metadata.noCallback = true;
                      resolve();
                    }
                  } else if (metadata.noCallback) {
                    target[name](...args);
                    resolve();
                  } else {
                    target[name](...args, makeCallback({
                      resolve,
                      reject
                    }, metadata));
                  }
                });
              };
            };
            const wrapMethod = (target, method, wrapper) => {
              return new Proxy(method, {
                apply(targetMethod, thisObj, args) {
                  return wrapper.call(thisObj, target, ...args);
                }
              });
            };
            let hasOwnProperty = Function.call.bind(Object.prototype.hasOwnProperty);
            const wrapObject = (target, wrappers = {}, metadata = {}) => {
              let cache = /* @__PURE__ */ Object.create(null);
              let handlers = {
                has(proxyTarget2, prop) {
                  return prop in target || prop in cache;
                },
                get(proxyTarget2, prop, receiver) {
                  if (prop in cache) {
                    return cache[prop];
                  }
                  if (!(prop in target)) {
                    return void 0;
                  }
                  let value = target[prop];
                  if (typeof value === "function") {
                    if (typeof wrappers[prop] === "function") {
                      value = wrapMethod(target, target[prop], wrappers[prop]);
                    } else if (hasOwnProperty(metadata, prop)) {
                      let wrapper = wrapAsyncFunction(prop, metadata[prop]);
                      value = wrapMethod(target, target[prop], wrapper);
                    } else {
                      value = value.bind(target);
                    }
                  } else if (typeof value === "object" && value !== null && (hasOwnProperty(wrappers, prop) || hasOwnProperty(metadata, prop))) {
                    value = wrapObject(value, wrappers[prop], metadata[prop]);
                  } else if (hasOwnProperty(metadata, "*")) {
                    value = wrapObject(value, wrappers[prop], metadata["*"]);
                  } else {
                    Object.defineProperty(cache, prop, {
                      configurable: true,
                      enumerable: true,
                      get() {
                        return target[prop];
                      },
                      set(value2) {
                        target[prop] = value2;
                      }
                    });
                    return value;
                  }
                  cache[prop] = value;
                  return value;
                },
                set(proxyTarget2, prop, value, receiver) {
                  if (prop in cache) {
                    cache[prop] = value;
                  } else {
                    target[prop] = value;
                  }
                  return true;
                },
                defineProperty(proxyTarget2, prop, desc) {
                  return Reflect.defineProperty(cache, prop, desc);
                },
                deleteProperty(proxyTarget2, prop) {
                  return Reflect.deleteProperty(cache, prop);
                }
              };
              let proxyTarget = Object.create(target);
              return new Proxy(proxyTarget, handlers);
            };
            const wrapEvent = (wrapperMap) => ({
              addListener(target, listener, ...args) {
                target.addListener(wrapperMap.get(listener), ...args);
              },
              hasListener(target, listener) {
                return target.hasListener(wrapperMap.get(listener));
              },
              removeListener(target, listener) {
                target.removeListener(wrapperMap.get(listener));
              }
            });
            const onRequestFinishedWrappers = new DefaultWeakMap((listener) => {
              if (typeof listener !== "function") {
                return listener;
              }
              return function onRequestFinished(req) {
                const wrappedReq = wrapObject(req, {}, {
                  getContent: {
                    minArgs: 0,
                    maxArgs: 0
                  }
                });
                listener(wrappedReq);
              };
            });
            const onMessageWrappers = new DefaultWeakMap((listener) => {
              if (typeof listener !== "function") {
                return listener;
              }
              return function onMessage(message, sender, sendResponse) {
                let didCallSendResponse = false;
                let wrappedSendResponse;
                let sendResponsePromise = new Promise((resolve) => {
                  wrappedSendResponse = function(response) {
                    didCallSendResponse = true;
                    resolve(response);
                  };
                });
                let result2;
                try {
                  result2 = listener(message, sender, wrappedSendResponse);
                } catch (err) {
                  result2 = Promise.reject(err);
                }
                const isResultThenable = result2 !== true && isThenable(result2);
                if (result2 !== true && !isResultThenable && !didCallSendResponse) {
                  return false;
                }
                const sendPromisedResult = (promise) => {
                  promise.then((msg) => {
                    sendResponse(msg);
                  }, (error) => {
                    let message2;
                    if (error && (error instanceof Error || typeof error.message === "string")) {
                      message2 = error.message;
                    } else {
                      message2 = "An unexpected error occurred";
                    }
                    sendResponse({
                      __mozWebExtensionPolyfillReject__: true,
                      message: message2
                    });
                  }).catch((err) => {
                    console.error("Failed to send onMessage rejected reply", err);
                  });
                };
                if (isResultThenable) {
                  sendPromisedResult(result2);
                } else {
                  sendPromisedResult(sendResponsePromise);
                }
                return true;
              };
            });
            const wrappedSendMessageCallback = ({
              reject,
              resolve
            }, reply) => {
              if (extensionAPIs.runtime.lastError) {
                if (extensionAPIs.runtime.lastError.message === CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE) {
                  resolve();
                } else {
                  reject(new Error(extensionAPIs.runtime.lastError.message));
                }
              } else if (reply && reply.__mozWebExtensionPolyfillReject__) {
                reject(new Error(reply.message));
              } else {
                resolve(reply);
              }
            };
            const wrappedSendMessage = (name, metadata, apiNamespaceObj, ...args) => {
              if (args.length < metadata.minArgs) {
                throw new Error(`Expected at least ${metadata.minArgs} ${pluralizeArguments(metadata.minArgs)} for ${name}(), got ${args.length}`);
              }
              if (args.length > metadata.maxArgs) {
                throw new Error(`Expected at most ${metadata.maxArgs} ${pluralizeArguments(metadata.maxArgs)} for ${name}(), got ${args.length}`);
              }
              return new Promise((resolve, reject) => {
                const wrappedCb = wrappedSendMessageCallback.bind(null, {
                  resolve,
                  reject
                });
                args.push(wrappedCb);
                apiNamespaceObj.sendMessage(...args);
              });
            };
            const staticWrappers = {
              devtools: {
                network: {
                  onRequestFinished: wrapEvent(onRequestFinishedWrappers)
                }
              },
              runtime: {
                onMessage: wrapEvent(onMessageWrappers),
                onMessageExternal: wrapEvent(onMessageWrappers),
                sendMessage: wrappedSendMessage.bind(null, "sendMessage", {
                  minArgs: 1,
                  maxArgs: 3
                })
              },
              tabs: {
                sendMessage: wrappedSendMessage.bind(null, "sendMessage", {
                  minArgs: 2,
                  maxArgs: 3
                })
              }
            };
            const settingMetadata = {
              clear: {
                minArgs: 1,
                maxArgs: 1
              },
              get: {
                minArgs: 1,
                maxArgs: 1
              },
              set: {
                minArgs: 1,
                maxArgs: 1
              }
            };
            apiMetadata.privacy = {
              network: {
                "*": settingMetadata
              },
              services: {
                "*": settingMetadata
              },
              websites: {
                "*": settingMetadata
              }
            };
            return wrapObject(extensionAPIs, staticWrappers, apiMetadata);
          };
          module2.exports = wrapAPIs(chrome);
        } else {
          module2.exports = globalThis.browser;
        }
      });
    })(browserPolyfill$1);
    return browserPolyfill$1.exports;
  }
  var browserPolyfillExports = requireBrowserPolyfill();
  const originalBrowser = /* @__PURE__ */ getDefaultExportFromCjs(browserPolyfillExports);
  const browser = originalBrowser;
  function print$1(method, ...args) {
    if (typeof args[0] === "string") {
      const message = args.shift();
      method(`[wxt] ${message}`, ...args);
    } else {
      method("[wxt]", ...args);
    }
  }
  const logger$1 = {
    debug: (...args) => print$1(console.debug, ...args),
    log: (...args) => print$1(console.log, ...args),
    warn: (...args) => print$1(console.warn, ...args),
    error: (...args) => print$1(console.error, ...args)
  };
  const _WxtLocationChangeEvent = class _WxtLocationChangeEvent extends Event {
    constructor(newUrl, oldUrl) {
      super(_WxtLocationChangeEvent.EVENT_NAME, {});
      this.newUrl = newUrl;
      this.oldUrl = oldUrl;
    }
  };
  __publicField(_WxtLocationChangeEvent, "EVENT_NAME", getUniqueEventName("wxt:locationchange"));
  let WxtLocationChangeEvent = _WxtLocationChangeEvent;
  function getUniqueEventName(eventName) {
    var _a;
    return `${(_a = browser == null ? void 0 : browser.runtime) == null ? void 0 : _a.id}:${"content"}:${eventName}`;
  }
  function createLocationWatcher(ctx) {
    let interval;
    let oldUrl;
    return {
      /**
       * Ensure the location watcher is actively looking for URL changes. If it's already watching,
       * this is a noop.
       */
      run() {
        if (interval != null) return;
        oldUrl = new URL(location.href);
        interval = ctx.setInterval(() => {
          let newUrl = new URL(location.href);
          if (newUrl.href !== oldUrl.href) {
            window.dispatchEvent(new WxtLocationChangeEvent(newUrl, oldUrl));
            oldUrl = newUrl;
          }
        }, 1e3);
      }
    };
  }
  const _ContentScriptContext = class _ContentScriptContext {
    constructor(contentScriptName, options) {
      __publicField(this, "isTopFrame", window.self === window.top);
      __publicField(this, "abortController");
      __publicField(this, "locationWatcher", createLocationWatcher(this));
      __publicField(this, "receivedMessageIds", /* @__PURE__ */ new Set());
      this.contentScriptName = contentScriptName;
      this.options = options;
      this.abortController = new AbortController();
      if (this.isTopFrame) {
        this.listenForNewerScripts({ ignoreFirstEvent: true });
        this.stopOldScripts();
      } else {
        this.listenForNewerScripts();
      }
    }
    get signal() {
      return this.abortController.signal;
    }
    abort(reason) {
      return this.abortController.abort(reason);
    }
    get isInvalid() {
      if (browser.runtime.id == null) {
        this.notifyInvalidated();
      }
      return this.signal.aborted;
    }
    get isValid() {
      return !this.isInvalid;
    }
    /**
     * Add a listener that is called when the content script's context is invalidated.
     *
     * @returns A function to remove the listener.
     *
     * @example
     * browser.runtime.onMessage.addListener(cb);
     * const removeInvalidatedListener = ctx.onInvalidated(() => {
     *   browser.runtime.onMessage.removeListener(cb);
     * })
     * // ...
     * removeInvalidatedListener();
     */
    onInvalidated(cb) {
      this.signal.addEventListener("abort", cb);
      return () => this.signal.removeEventListener("abort", cb);
    }
    /**
     * Return a promise that never resolves. Useful if you have an async function that shouldn't run
     * after the context is expired.
     *
     * @example
     * const getValueFromStorage = async () => {
     *   if (ctx.isInvalid) return ctx.block();
     *
     *   // ...
     * }
     */
    block() {
      return new Promise(() => {
      });
    }
    /**
     * Wrapper around `window.setInterval` that automatically clears the interval when invalidated.
     */
    setInterval(handler, timeout) {
      const id = setInterval(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearInterval(id));
      return id;
    }
    /**
     * Wrapper around `window.setTimeout` that automatically clears the interval when invalidated.
     */
    setTimeout(handler, timeout) {
      const id = setTimeout(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearTimeout(id));
      return id;
    }
    /**
     * Wrapper around `window.requestAnimationFrame` that automatically cancels the request when
     * invalidated.
     */
    requestAnimationFrame(callback) {
      const id = requestAnimationFrame((...args) => {
        if (this.isValid) callback(...args);
      });
      this.onInvalidated(() => cancelAnimationFrame(id));
      return id;
    }
    /**
     * Wrapper around `window.requestIdleCallback` that automatically cancels the request when
     * invalidated.
     */
    requestIdleCallback(callback, options) {
      const id = requestIdleCallback((...args) => {
        if (!this.signal.aborted) callback(...args);
      }, options);
      this.onInvalidated(() => cancelIdleCallback(id));
      return id;
    }
    addEventListener(target, type, handler, options) {
      var _a;
      if (type === "wxt:locationchange") {
        if (this.isValid) this.locationWatcher.run();
      }
      (_a = target.addEventListener) == null ? void 0 : _a.call(
        target,
        type.startsWith("wxt:") ? getUniqueEventName(type) : type,
        handler,
        {
          ...options,
          signal: this.signal
        }
      );
    }
    /**
     * @internal
     * Abort the abort controller and execute all `onInvalidated` listeners.
     */
    notifyInvalidated() {
      this.abort("Content script context invalidated");
      logger$1.debug(
        `Content script "${this.contentScriptName}" context invalidated`
      );
    }
    stopOldScripts() {
      window.postMessage(
        {
          type: _ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE,
          contentScriptName: this.contentScriptName,
          messageId: Math.random().toString(36).slice(2)
        },
        "*"
      );
    }
    verifyScriptStartedEvent(event) {
      var _a, _b, _c;
      const isScriptStartedEvent = ((_a = event.data) == null ? void 0 : _a.type) === _ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE;
      const isSameContentScript = ((_b = event.data) == null ? void 0 : _b.contentScriptName) === this.contentScriptName;
      const isNotDuplicate = !this.receivedMessageIds.has((_c = event.data) == null ? void 0 : _c.messageId);
      return isScriptStartedEvent && isSameContentScript && isNotDuplicate;
    }
    listenForNewerScripts(options) {
      let isFirst = true;
      const cb = (event) => {
        if (this.verifyScriptStartedEvent(event)) {
          this.receivedMessageIds.add(event.data.messageId);
          const wasFirst = isFirst;
          isFirst = false;
          if (wasFirst && (options == null ? void 0 : options.ignoreFirstEvent)) return;
          this.notifyInvalidated();
        }
      };
      addEventListener("message", cb);
      this.onInvalidated(() => removeEventListener("message", cb));
    }
  };
  __publicField(_ContentScriptContext, "SCRIPT_STARTED_MESSAGE_TYPE", getUniqueEventName(
    "wxt:content-script-started"
  ));
  let ContentScriptContext = _ContentScriptContext;
  const nullKey = Symbol("null");
  let keyCounter = 0;
  class ManyKeysMap extends Map {
    constructor(...arguments_) {
      super();
      this._objectHashes = /* @__PURE__ */ new WeakMap();
      this._symbolHashes = /* @__PURE__ */ new Map();
      this._publicKeys = /* @__PURE__ */ new Map();
      const [pairs] = arguments_;
      if (pairs === null || pairs === void 0) {
        return;
      }
      if (typeof pairs[Symbol.iterator] !== "function") {
        throw new TypeError(typeof pairs + " is not iterable (cannot read property Symbol(Symbol.iterator))");
      }
      for (const [keys, value] of pairs) {
        this.set(keys, value);
      }
    }
    _getPublicKeys(keys, create = false) {
      if (!Array.isArray(keys)) {
        throw new TypeError("The keys parameter must be an array");
      }
      const privateKey = this._getPrivateKey(keys, create);
      let publicKey;
      if (privateKey && this._publicKeys.has(privateKey)) {
        publicKey = this._publicKeys.get(privateKey);
      } else if (create) {
        publicKey = [...keys];
        this._publicKeys.set(privateKey, publicKey);
      }
      return { privateKey, publicKey };
    }
    _getPrivateKey(keys, create = false) {
      const privateKeys = [];
      for (const key of keys) {
        const keyToPass = key === null ? nullKey : key;
        let hashes;
        if (typeof keyToPass === "object" || typeof keyToPass === "function") {
          hashes = "_objectHashes";
        } else if (typeof keyToPass === "symbol") {
          hashes = "_symbolHashes";
        } else {
          hashes = false;
        }
        if (!hashes) {
          privateKeys.push(keyToPass);
        } else if (this[hashes].has(keyToPass)) {
          privateKeys.push(this[hashes].get(keyToPass));
        } else if (create) {
          const privateKey = `@@mkm-ref-${keyCounter++}@@`;
          this[hashes].set(keyToPass, privateKey);
          privateKeys.push(privateKey);
        } else {
          return false;
        }
      }
      return JSON.stringify(privateKeys);
    }
    set(keys, value) {
      const { publicKey } = this._getPublicKeys(keys, true);
      return super.set(publicKey, value);
    }
    get(keys) {
      const { publicKey } = this._getPublicKeys(keys);
      return super.get(publicKey);
    }
    has(keys) {
      const { publicKey } = this._getPublicKeys(keys);
      return super.has(publicKey);
    }
    delete(keys) {
      const { publicKey, privateKey } = this._getPublicKeys(keys);
      return Boolean(publicKey && super.delete(publicKey) && this._publicKeys.delete(privateKey));
    }
    clear() {
      super.clear();
      this._symbolHashes.clear();
      this._publicKeys.clear();
    }
    get [Symbol.toStringTag]() {
      return "ManyKeysMap";
    }
    get size() {
      return super.size;
    }
  }
  new ManyKeysMap();
  function initPlugins() {
  }
  function print(method, ...args) {
    if (typeof args[0] === "string") {
      const message = args.shift();
      method(`[wxt] ${message}`, ...args);
    } else {
      method("[wxt]", ...args);
    }
  }
  const logger = {
    debug: (...args) => print(console.debug, ...args),
    log: (...args) => print(console.log, ...args),
    warn: (...args) => print(console.warn, ...args),
    error: (...args) => print(console.error, ...args)
  };
  const result = (async () => {
    try {
      initPlugins();
      const { main, ...options } = definition;
      const ctx = new ContentScriptContext("content", options);
      return await main(ctx);
    } catch (err) {
      logger.error(
        `The content script "${"content"}" crashed on startup!`,
        err
      );
      throw err;
    }
  })();
  return result;
})();
content;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3d4dEAwLjE5LjI5X0B0eXBlcytub2RlQDI1LjYuMV9yb2xsdXBANC42MC4zL25vZGVfbW9kdWxlcy93eHQvZGlzdC9zYW5kYm94L2RlZmluZS1jb250ZW50LXNjcmlwdC5tanMiLCIuLi8uLi8uLi9zcmMvYXVkaW8tcHJvY2Vzc29yLnRzIiwiLi4vLi4vLi4vc3JjL21lZGlhLW1hbmFnZXIudHMiLCIuLi8uLi8uLi9zcmMvbWVkaWEtcHJvY2Vzc29yLnRzIiwiLi4vLi4vLi4vc3JjL3R5cGVzLnRzIiwiLi4vLi4vLi4vc3JjL3NldHRpbmdzLWhhbmRsZXIudHMiLCIuLi8uLi8uLi9zcmMvaWZyYW1lLWhvc3RuYW1lLWhhbmRsZXIudHMiLCIuLi8uLi8uLi9zcmMvY29udGVudC1zY3JpcHQvbWVkaWEtZXZlbnRzLnRzIiwiLi4vLi4vLi4vc3JjL2NvbnRlbnQtc2NyaXB0L21lc3NhZ2UtaGFuZGxlci50cyIsIi4uLy4uLy4uL3NyYy9jb250ZW50LXNjcmlwdC9kb20tbGlmZWN5Y2xlLnRzIiwiLi4vLi4vLi4vc3JjL2NvbnRlbnQtc2NyaXB0LWluaXQudHMiLCIuLi8uLi8uLi9lbnRyeXBvaW50cy9jb250ZW50LnRzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3dlYmV4dGVuc2lvbi1wb2x5ZmlsbEAwLjEyLjAvbm9kZV9tb2R1bGVzL3dlYmV4dGVuc2lvbi1wb2x5ZmlsbC9kaXN0L2Jyb3dzZXItcG9seWZpbGwuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIvaW5kZXgubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3d4dEAwLjE5LjI5X0B0eXBlcytub2RlQDI1LjYuMV9yb2xsdXBANC42MC4zL25vZGVfbW9kdWxlcy93eHQvZGlzdC9zYW5kYm94L3V0aWxzL2xvZ2dlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2NsaWVudC9jb250ZW50LXNjcmlwdHMvY3VzdG9tLWV2ZW50cy5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2NsaWVudC9jb250ZW50LXNjcmlwdHMvbG9jYXRpb24td2F0Y2hlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2NsaWVudC9jb250ZW50LXNjcmlwdHMvY29udGVudC1zY3JpcHQtY29udGV4dC5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vbWFueS1rZXlzLW1hcEAzLjAuMy9ub2RlX21vZHVsZXMvbWFueS1rZXlzLW1hcC9pbmRleC5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9AMW5hdHN1K3dhaXQtZWxlbWVudEA0LjIuMC9ub2RlX21vZHVsZXMvQDFuYXRzdS93YWl0LWVsZW1lbnQvZGlzdC9pbmRleC5tanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIGRlZmluZUNvbnRlbnRTY3JpcHQoZGVmaW5pdGlvbikge1xuICByZXR1cm4gZGVmaW5pdGlvbjtcbn1cbiIsImltcG9ydCB7IEF1ZGlvU2V0dGluZ3MgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEF1ZGlvTm9kZXMge1xuICBjb250ZXh0OiBBdWRpb0NvbnRleHQ7XG4gIHNvdXJjZTogTWVkaWFFbGVtZW50QXVkaW9Tb3VyY2VOb2RlO1xuICBnYWluOiBHYWluTm9kZTtcbiAgYmFzc0ZpbHRlcjogQmlxdWFkRmlsdGVyTm9kZTtcbiAgdm9pY2VGaWx0ZXI6IEJpcXVhZEZpbHRlck5vZGU7XG4gIG1lcmdlcjogQ2hhbm5lbE1lcmdlck5vZGU7XG4gIHNwbGl0dGVyOiBDaGFubmVsU3BsaXR0ZXJOb2RlO1xuICBlbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50O1xuICBtb25vOiBib29sZWFuOyAvLyBUcmFjayB0aGUgY3VycmVudCBtb25vIHNldHRpbmcgZm9yIHRoaXMgZWxlbWVudFxuICBjdXJyZW50U3JjOiBzdHJpbmc7IC8vIFRyYWNrIHRoZSBzcmMgdGhhdCB0aGUgc291cmNlIG5vZGUgd2FzIGNyZWF0ZWQgd2l0aFxufVxuXG5leHBvcnQgY2xhc3MgQXVkaW9Qcm9jZXNzb3Ige1xuICBhdWRpb0NvbnRleHQ6IEF1ZGlvQ29udGV4dCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGF1ZGlvRWxlbWVudE1hcCA9IG5ldyBNYXA8SFRNTE1lZGlhRWxlbWVudCwgQXVkaW9Ob2Rlcz4oKTtcblxuICBhc3luYyBzZXR1cEF1ZGlvQ29udGV4dChcbiAgICBtZWRpYUVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQsXG4gICAgc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3NcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBcIkF1ZGlvUHJvY2Vzc29yOiBTZXR0aW5nIHVwIGF1ZGlvIGNvbnRleHQgd2l0aCBzZXR0aW5nczpcIixcbiAgICAgICAgc2V0dGluZ3NcbiAgICAgICk7XG5cbiAgICAgIC8vIENoZWNrIGlmIHRoZSBtZWRpYSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIHVzZWQgYXMgYW4gYXVkaW8gc291cmNlXG4gICAgICAvLyBIVE1MTWVkaWFFbGVtZW50LkhBVkVfTUVUQURBVEEgKDEpIG1lYW5zIGVub3VnaCBkYXRhIGlzIGF2YWlsYWJsZSB0aGF0IHRoZSBkdXJhdGlvbiBvZiB0aGUgcmVzb3VyY2UgaXMgYXZhaWxhYmxlLlxuICAgICAgLy8gY3JlYXRlTWVkaWFFbGVtZW50U291cmNlIHR5cGljYWxseSByZXF1aXJlcyBhdCBsZWFzdCBIQVZFX01FVEFEQVRBLlxuICAgICAgaWYgKG1lZGlhRWxlbWVudC5yZWFkeVN0YXRlIDwgSFRNTE1lZGlhRWxlbWVudC5IQVZFX01FVEFEQVRBKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBgQXVkaW9Qcm9jZXNzb3I6IE1lZGlhIGVsZW1lbnQgJHttZWRpYUVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIn0gaXMgbm90IHJlYWR5IChyZWFkeVN0YXRlOiAke21lZGlhRWxlbWVudC5yZWFkeVN0YXRlfSkuIERlZmVycmluZyBhdWRpbyBjb250ZXh0IHNldHVwLmBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuOyAvLyBEZWZlciBwcm9jZXNzaW5nIHVudGlsIHRoZSBlbGVtZW50IGlzIHJlYWR5XG4gICAgICB9XG5cbiAgICAgIC8vIEluaXRpYWxpemUgYXVkaW8gY29udGV4dCBpZiBuZWVkZWRcbiAgICAgIGlmICghdGhpcy5hdWRpb0NvbnRleHQpIHtcbiAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQgPSBuZXcgQXVkaW9Db250ZXh0KCk7XG4gICAgICAgIC8vIFJlc3VtZSB3aWxsIGJlIGNhbGxlZCBsYXRlciBhZnRlciBhIHVzZXIgZ2VzdHVyZVxuICAgICAgfVxuXG4gICAgICBsZXQgbm9kZXMgPSB0aGlzLmF1ZGlvRWxlbWVudE1hcC5nZXQobWVkaWFFbGVtZW50KTtcblxuICAgICAgaWYgKG5vZGVzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGBbQXVkaW9Qcm9jZXNzb3JdIFJldXNpbmcgZXhpc3RpbmcgYXVkaW8gbm9kZXMgZm9yIGVsZW1lbnQ6ICR7XG4gICAgICAgICAgICBtZWRpYUVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgICAgIH1gXG4gICAgICAgICk7XG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBtZWRpYSBzb3VyY2UgaGFzIGNoYW5nZWQgT1IgaWYgdGhlIHNvdXJjZSBub2RlIGlzIHNvbWVob3cgbnVsbFxuICAgICAgICAvLyBVc2UgY3VycmVudFNyYyBpbnN0ZWFkIG9mIHNyYyB0byBoYW5kbGUgYmxvYi9ITFMgVVJMcyBjb3JyZWN0bHlcbiAgICAgICAgbGV0IHNvdXJjZUNoYW5nZWQgPSBmYWxzZTtcbiAgICAgICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0ICYmIChub2Rlcy5jdXJyZW50U3JjICE9PSBtZWRpYUVsZW1lbnQuY3VycmVudFNyYyB8fCAhbm9kZXMuc291cmNlKSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gTWVkaWEgc291cmNlIGNoYW5nZWQgZnJvbSAke1xuICAgICAgICAgICAgICBub2Rlcy5jdXJyZW50U3JjXG4gICAgICAgICAgICB9IHRvICR7bWVkaWFFbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJ9IG9yIHNvdXJjZSBpbnZhbGlkLiBSZWNyZWF0aW5nIHNvdXJjZSBub2RlLmBcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChub2Rlcy5zb3VyY2UpIHtcbiAgICAgICAgICAgIC8vIElmIG9sZCBzb3VyY2UgZXhpc3RzLCBkaXNjb25uZWN0IGl0IGZ1bGx5XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBub2Rlcy5zb3VyY2UuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAvKiBJZ25vcmUgZGlzY29ubmVjdCBlcnJvcnMgaWYgYWxyZWFkeSBkaXNjb25uZWN0ZWQgb3IgaW52YWxpZCAqL1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBub2Rlcy5zb3VyY2UgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVNZWRpYUVsZW1lbnRTb3VyY2UobWVkaWFFbGVtZW50KTtcbiAgICAgICAgICBub2Rlcy5jdXJyZW50U3JjID0gbWVkaWFFbGVtZW50LmN1cnJlbnRTcmM7XG4gICAgICAgICAgc291cmNlQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBPbmx5IHJlY29ubmVjdCB0aGUgZ3JhcGggdG9wb2xvZ3kgaWYgbW9ubyBzZXR0aW5nIGNoYW5nZWQgb3Igc291cmNlIGNoYW5nZWQuXG4gICAgICAgIC8vIFJlY29ubmVjdGluZyBvbiBldmVyeSBwYXJhbWV0ZXIgY2hhbmdlIGNhdXNlcyBhdWRpYmxlIGNsaWNrcy9wb3BzLlxuICAgICAgICBjb25zdCBtb25vQ2hhbmdlZCA9IG5vZGVzLm1vbm8gIT09IHNldHRpbmdzLm1vbm87XG4gICAgICAgIGlmIChzb3VyY2VDaGFuZ2VkIHx8IG1vbm9DaGFuZ2VkKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBHcmFwaCB0b3BvbG9neSBjaGFuZ2VkIChzb3VyY2VDaGFuZ2VkPSR7c291cmNlQ2hhbmdlZH0sIG1vbm9DaGFuZ2VkPSR7bW9ub0NoYW5nZWR9KS4gUmVjb25uZWN0aW5nIG5vZGVzLmBcbiAgICAgICAgICApO1xuICAgICAgICAgIGF3YWl0IHRoaXMuY29ubmVjdE5vZGVzKG5vZGVzLCBzZXR0aW5ncyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSnVzdCB1cGRhdGUgcGFyYW1ldGVyIHZhbHVlcyB3aXRob3V0IGRpc2Nvbm5lY3RpbmcvcmVjb25uZWN0aW5nXG4gICAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVOb2RlU2V0dGluZ3Mobm9kZXMsIHNldHRpbmdzKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gQ3JlYXRpbmcgbmV3IGF1ZGlvIG5vZGVzIGZvciBlbGVtZW50OiAke1xuICAgICAgICAgICAgbWVkaWFFbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgICB9YFxuICAgICAgICApO1xuICAgICAgICAvLyBDcmVhdGUgYW5kIGNvbmZpZ3VyZSBuZXcgbm9kZXNcbiAgICAgICAgLy8gY3JlYXRlQXVkaW9Ob2RlcyBjYWxscyBjb25uZWN0Tm9kZXMgaW50ZXJuYWxseSwgd2hpY2ggd2lsbCBidWlsZCB0aGUgZ3JhcGguXG4gICAgICAgIG5vZGVzID0gYXdhaXQgdGhpcy5jcmVhdGVBdWRpb05vZGVzKG1lZGlhRWxlbWVudCwgc2V0dGluZ3MpO1xuICAgICAgICB0aGlzLmF1ZGlvRWxlbWVudE1hcC5zZXQobWVkaWFFbGVtZW50LCBub2Rlcyk7XG4gICAgICAgIC8vIE5vIG5lZWQgdG8gY2FsbCBjb25uZWN0Tm9kZXMgYWdhaW4gaGVyZSwgYXMgY3JlYXRlQXVkaW9Ob2RlcyBkb2VzIGl0LlxuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhcIkF1ZGlvUHJvY2Vzc29yOiBTZXR1cCBjb21wbGV0ZSBmb3I6XCIsIG1lZGlhRWxlbWVudC5zcmMpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiQXVkaW9Qcm9jZXNzb3I6IFNldHVwIGZhaWxlZDpcIiwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjcmVhdGVBdWRpb05vZGVzKFxuICAgIG1lZGlhRWxlbWVudDogSFRNTE1lZGlhRWxlbWVudCxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5nc1xuICApOiBQcm9taXNlPEF1ZGlvTm9kZXM+IHtcbiAgICBpZiAoIXRoaXMuYXVkaW9Db250ZXh0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBdWRpb0NvbnRleHQgbm90IGluaXRpYWxpemVkXCIpO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBub2Rlc1xuICAgIGNvbnN0IHNvdXJjZSA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZU1lZGlhRWxlbWVudFNvdXJjZShtZWRpYUVsZW1lbnQpO1xuICAgIGNvbnN0IGdhaW4gPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XG4gICAgY29uc3QgYmFzc0ZpbHRlciA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUJpcXVhZEZpbHRlcigpO1xuICAgIGNvbnN0IHZvaWNlRmlsdGVyID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XG4gICAgY29uc3Qgc3BsaXR0ZXIgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVDaGFubmVsU3BsaXR0ZXIoMik7XG4gICAgY29uc3QgbWVyZ2VyID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQ2hhbm5lbE1lcmdlcigyKTtcblxuICAgIC8vIENvbmZpZ3VyZSBmaWx0ZXJzXG4gICAgYmFzc0ZpbHRlci50eXBlID0gXCJsb3dzaGVsZlwiO1xuICAgIGJhc3NGaWx0ZXIuZnJlcXVlbmN5LnZhbHVlID0gMTAwO1xuICAgIHZvaWNlRmlsdGVyLnR5cGUgPSBcInBlYWtpbmdcIjtcbiAgICB2b2ljZUZpbHRlci5mcmVxdWVuY3kudmFsdWUgPSAyMDAwO1xuICAgIHZvaWNlRmlsdGVyLlEudmFsdWUgPSAxO1xuXG4gICAgY29uc3Qgbm9kZXM6IEF1ZGlvTm9kZXMgPSB7XG4gICAgICBjb250ZXh0OiB0aGlzLmF1ZGlvQ29udGV4dCxcbiAgICAgIHNvdXJjZSxcbiAgICAgIGdhaW4sXG4gICAgICBiYXNzRmlsdGVyLFxuICAgICAgdm9pY2VGaWx0ZXIsXG4gICAgICBzcGxpdHRlcixcbiAgICAgIG1lcmdlcixcbiAgICAgIGVsZW1lbnQ6IG1lZGlhRWxlbWVudCxcbiAgICAgIG1vbm86IHNldHRpbmdzLm1vbm8sIC8vIEluaXRpYWxpemUgbW9ubyBzZXR0aW5nLCBjb25uZWN0Tm9kZXMgd2lsbCB1c2Ugc2V0dGluZ3MubW9ub1xuICAgICAgY3VycmVudFNyYzogbWVkaWFFbGVtZW50LmN1cnJlbnRTcmMsIC8vIEluaXRpYWxpemUgY3VycmVudFNyY1xuICAgIH07XG5cbiAgICAvLyBDb25uZWN0IG5vZGVzIGJhc2VkIG9uIHNldHRpbmdzXG4gICAgYXdhaXQgdGhpcy5jb25uZWN0Tm9kZXMobm9kZXMsIHNldHRpbmdzKTtcblxuICAgIHJldHVybiBub2RlcztcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBkYXRlTm9kZVNldHRpbmdzKFxuICAgIG5vZGVzOiBBdWRpb05vZGVzLFxuICAgIHNldHRpbmdzOiBBdWRpb1NldHRpbmdzXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHsgZ2FpbiwgYmFzc0ZpbHRlciwgdm9pY2VGaWx0ZXIsIGNvbnRleHQsIGVsZW1lbnQgfSA9IG5vZGVzOyAvLyBBZGRlZCBlbGVtZW50XG5cbiAgICB0cnkge1xuICAgICAgY29uc3Qgc2FmZVRpbWVWYWx1ZSA9IGlzRmluaXRlKGNvbnRleHQuY3VycmVudFRpbWUpXG4gICAgICAgID8gY29udGV4dC5jdXJyZW50VGltZVxuICAgICAgICA6IDA7XG5cbiAgICAgIC8vIERldGVybWluZSB0YXJnZXQgdm9sdW1lIGZvciBlbGVtZW50IGFuZCBnYWluIG5vZGVcbiAgICAgIGxldCBlbGVtZW50Vm9sdW1lID0gMS4wOyAvLyBEZWZhdWx0IHRvIG1heCBmb3IgZWxlbWVudFxuICAgICAgbGV0IGdhaW5Ob2RlVm9sdW1lID0gMS4wOyAvLyBEZWZhdWx0IGdhaW5cblxuICAgICAgaWYgKHNldHRpbmdzLnZvbHVtZSA8PSAxMDApIHtcbiAgICAgICAgLy8gSWYgdm9sdW1lIGlzIDEwMCUgb3IgbGVzcywgY29udHJvbCB2aWEgZWxlbWVudC52b2x1bWVcbiAgICAgICAgZWxlbWVudFZvbHVtZSA9IE1hdGgubWF4KDAsIHNldHRpbmdzLnZvbHVtZSkgLyAxMDA7XG4gICAgICAgIGdhaW5Ob2RlVm9sdW1lID0gMS4wOyAvLyBLZWVwIEdhaW5Ob2RlIG5ldXRyYWxcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIHZvbHVtZSBpcyA+IDEwMCUsIHNldCBlbGVtZW50IHZvbHVtZSB0byBtYXggYW5kIHVzZSBHYWluTm9kZSBmb3IgYm9vc3RcbiAgICAgICAgZWxlbWVudFZvbHVtZSA9IDEuMDtcbiAgICAgICAgZ2Fpbk5vZGVWb2x1bWUgPSBNYXRoLm1heCgxLCBNYXRoLm1pbihzZXR0aW5ncy52b2x1bWUsIDEwMDApKSAvIDEwMDsgLy8gQXBwbHkgYm9vc3QgdmlhIEdhaW5Ob2RlXG4gICAgICB9XG5cbiAgICAgIC8vIEFwcGx5IGVsZW1lbnQgdm9sdW1lIGltbWVkaWF0ZWx5IChkb2VzIG5vdCByZXF1aXJlIHVzZXIgZ2VzdHVyZSlcbiAgICAgIGlmIChpc0Zpbml0ZShlbGVtZW50Vm9sdW1lKSkge1xuICAgICAgICBlbGVtZW50LnZvbHVtZSA9IGVsZW1lbnRWb2x1bWU7XG4gICAgICB9XG5cbiAgICAgIC8vIENsYW1wIHZhbHVlcyBmb3IgZmlsdGVyc1xuICAgICAgY29uc3QgY2xhbXBlZEJhc3MgPSBNYXRoLm1heChcbiAgICAgICAgLTE1LFxuICAgICAgICBNYXRoLm1pbigoKHNldHRpbmdzLmJhc3NCb29zdCAtIDEwMCkgLyAxMDApICogMTUsIDE1KVxuICAgICAgKTtcbiAgICAgIGNvbnN0IGNsYW1wZWRWb2ljZSA9IE1hdGgubWF4KFxuICAgICAgICAtMjQsXG4gICAgICAgIE1hdGgubWluKCgoc2V0dGluZ3Mudm9pY2VCb29zdCAtIDEwMCkgLyAxMDApICogMjQsIDI0KVxuICAgICAgKTtcblxuICAgICAgLy8gVXBkYXRlIFdlYiBBdWRpbyBBUEkgcGFyYW1ldGVycyB1c2luZyBzZXRUYXJnZXRBdFRpbWUgZm9yIHBvdGVudGlhbGx5IG1vcmUgcm9idXN0IGFwcGxpY2F0aW9uXG4gICAgICBjb25zdCB0aW1lQ29uc3RhbnQgPSAwLjAxOyAvLyBBcHBseSBxdWlja2x5XG4gICAgICBjb25zdCBjdXJyZW50VGltZSA9IGNvbnRleHQuY3VycmVudFRpbWU7IC8vIFVzZSBjdXJyZW50IGNvbnRleHQgdGltZSBhcyBzdGFydCB0aW1lXG5cbiAgICAgIC8vIFNldCBpbW1lZGlhdGUgdmFsdWVcbiAgICAgIGdhaW4uZ2Fpbi52YWx1ZSA9IGdhaW5Ob2RlVm9sdW1lO1xuXG4gICAgICBiYXNzRmlsdGVyLmdhaW4udmFsdWUgPSBjbGFtcGVkQmFzcztcblxuICAgICAgdm9pY2VGaWx0ZXIuZ2Fpbi52YWx1ZSA9IGNsYW1wZWRWb2ljZTtcblxuICAgICAgLy8gQURERUQgTE9HUzogTG9nIHRoZSB2YWx1ZXMgYmVpbmcgYXBwbGllZCB0byB0aGUgbm9kZXNcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBBcHBseWluZyBOb2RlIFNldHRpbmdzIChpbW1lZGlhdGUgKyBzZXRUYXJnZXRBdFRpbWUpIGF0ICR7Y3VycmVudFRpbWV9OmAsXG4gICAgICAgIHtcbiAgICAgICAgICBlbGVtZW50Vm9sdW1lOiBlbGVtZW50LnZvbHVtZSwgLy8gTG9nIHRoZSBkaXJlY3RseSBzZXQgZWxlbWVudCB2b2x1bWVcbiAgICAgICAgICB0YXJnZXRHYWluTm9kZVZvbHVtZTogZ2Fpbk5vZGVWb2x1bWUsIC8vIExvZyB0YXJnZXQgdmFsdWVzXG4gICAgICAgICAgdGFyZ2V0QmFzc0dhaW46IGNsYW1wZWRCYXNzLFxuICAgICAgICAgIHRhcmdldFZvaWNlR2FpbjogY2xhbXBlZFZvaWNlLFxuICAgICAgICAgIHZvaWNlR2FpbjogY2xhbXBlZFZvaWNlLFxuICAgICAgICAgIG1vbm86IHNldHRpbmdzLm1vbm8sIC8vIExvZyBtb25vIHNldHRpbmcgYXMgaXQgYWZmZWN0cyBjb25uZWN0aW9uc1xuICAgICAgICB9XG4gICAgICApO1xuXG4gICAgICAvLyBjb25zb2xlLmxvZyhcIkF1ZGlvUHJvY2Vzc29yOiBTZXR0aW5ncyB1cGRhdGVkIHN1Y2Nlc3NmdWxseVwiLCB7IC8vIFJlZHVjZWQgbG9nZ2luZ1xuICAgICAgLy8gICB2b2x1bWU6IGNsYW1wZWRWb2x1bWUsXG4gICAgICAvLyAgIGJhc3M6IGNsYW1wZWRCYXNzLFxuICAgICAgLy8gICB2b2ljZTogY2xhbXBlZFZvaWNlLFxuICAgICAgLy8gICBtb25vOiBzZXR0aW5ncy5tb25vLFxuICAgICAgLy8gfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJBdWRpb1Byb2Nlc3NvcjogRmFpbGVkIHRvIHVwZGF0ZSBzZXR0aW5nczpcIiwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb25uZWN0Tm9kZXMoXG4gICAgbm9kZXM6IEF1ZGlvTm9kZXMsXG4gICAgc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3NcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgeyBzb3VyY2UsIGJhc3NGaWx0ZXIsIHZvaWNlRmlsdGVyLCBnYWluLCBzcGxpdHRlciwgbWVyZ2VyLCBjb250ZXh0LCBlbGVtZW50IH0gPVxuICAgICAgbm9kZXM7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBbQXVkaW9Qcm9jZXNzb3JdIENvbm5lY3RpbmcvUmVjb25uZWN0aW5nIG5vZGVzIGZvciAke1xuICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgIH0uIFRhcmdldCBNb25vOiAke3NldHRpbmdzLm1vbm99LCBDdXJyZW50IE5vZGUgTW9ubzogJHtub2Rlcy5tb25vfWBcbiAgICApO1xuXG4gICAgLy8gTG9nIHRoZSBjdXJyZW50IG1vbm8gc3RhdGUgYmVmb3JlIHBvdGVudGlhbCBjaGFuZ2VcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBbQXVkaW9Qcm9jZXNzb3JdIGNvbm5lY3ROb2RlczogQ3VycmVudCBtb25vIHN0YXRlIGZvciBlbGVtZW50OiAke25vZGVzLm1vbm99LCBUYXJnZXQgbW9ubyBzdGF0ZTogJHtzZXR0aW5ncy5tb25vfWBcbiAgICApO1xuXG4gICAgLy8gRGlzY29ubmVjdCBhbGwgbm9kZXMgZnJvbSB0aGVpciBvdXRwdXRzIHRvIGVuc3VyZSBhIGNsZWFuIHNsYXRlIGJlZm9yZSByZS1jb25uZWN0aW5nLlxuICAgIC8vIEl0J3MgY3J1Y2lhbCB0byBkaXNjb25uZWN0IHRoZSBzb3VyY2UgZmlyc3QgZnJvbSBpdHMgcHJldmlvdXMgY29ubmVjdGlvbnMsXG4gICAgLy8gdGhlbiBvdGhlciBub2RlcyBpbiBhbnkgb3JkZXIsIGFzIGxvbmcgYXMgdGhleSBhcmUgZGlzY29ubmVjdGVkIGZyb20gdGhlaXIgb3V0cHV0cy5cbiAgICBjb25zdCBzYWZlRGlzY29ubmVjdCA9IChub2RlOiBBdWRpb05vZGUgfCBudWxsKSA9PiB7XG4gICAgICBpZiAobm9kZSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIERpc2Nvbm5lY3QgYWxsIGNvbm5lY3Rpb25zIGZyb20gdGhpcyBub2RlXG4gICAgICAgICAgbm9kZS5kaXNjb25uZWN0KCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAvLyBjb25zb2xlLndhcm4oYFtBdWRpb1Byb2Nlc3Nvcl0gRXJyb3IgZGlzY29ubmVjdGluZyBub2RlOmAsIGUpOyAvLyBPcHRpb25hbDogZm9yIGRlYnVnZ2luZ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vIERpc2Nvbm5lY3QgYWxsIG5vZGVzIGZyb20gdGhlaXIgb3V0cHV0cy4gT3JkZXIgbWF0dGVycyBmb3IgcHJldmVudGluZyBlcnJvcnMsXG4gICAgLy8gYnV0IGxlc3Mgc28gaWYgd2UgZGlzY29ubmVjdCBhbGwgb3V0cHV0cyBmcm9tIGEgbm9kZS5cbiAgICAvLyBEaXNjb25uZWN0aW5nIHNvdXJjZSBmaXJzdCBlbnN1cmVzIGl0J3Mgbm90IGNvbm5lY3RlZCB0byBhIHN0YWxlIGdyYXBoLlxuICAgIHNhZmVEaXNjb25uZWN0KHNvdXJjZSk7XG4gICAgc2FmZURpc2Nvbm5lY3QoYmFzc0ZpbHRlcik7XG4gICAgc2FmZURpc2Nvbm5lY3Qodm9pY2VGaWx0ZXIpO1xuICAgIHNhZmVEaXNjb25uZWN0KHNwbGl0dGVyKTtcbiAgICBzYWZlRGlzY29ubmVjdChtZXJnZXIpO1xuICAgIHNhZmVEaXNjb25uZWN0KGdhaW4pO1xuXG4gICAgLy8gRW5zdXJlIHNvdXJjZSBpcyB2YWxpZCBiZWZvcmUgcHJvY2VlZGluZ1xuICAgIGlmICghc291cmNlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBcIltBdWRpb1Byb2Nlc3Nvcl0gU291cmNlIG5vZGUgaXMgbnVsbCBpbiBjb25uZWN0Tm9kZXMuIENhbm5vdCBjb25uZWN0IGdyYXBoLlwiXG4gICAgICApO1xuICAgICAgLy8gQXR0ZW1wdCB0byBhcHBseSBzZXR0aW5ncyB0byBhdm9pZCBmdXJ0aGVyIGVycm9ycywgdGhvdWdoIGdyYXBoIGlzIGJyb2tlbi5cbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlTm9kZVNldHRpbmdzKG5vZGVzLCBzZXR0aW5ncyk7XG4gICAgICByZXR1cm47IC8vIENhbm5vdCBwcm9jZWVkIHdpdGggY29ubmVjdGlvbnNcbiAgICB9XG5cblxuICAgIC8vIENyZWF0ZSBuZXcgY29ubmVjdGlvbnMgYmFzZWQgb24gY3VycmVudCBzZXR0aW5nc1xuICAgIGlmIChzZXR0aW5ncy5tb25vKSB7XG4gICAgICBzb3VyY2UuY29ubmVjdChiYXNzRmlsdGVyKTtcbiAgICAgIGJhc3NGaWx0ZXIuY29ubmVjdCh2b2ljZUZpbHRlcik7XG4gICAgICB2b2ljZUZpbHRlci5jb25uZWN0KHNwbGl0dGVyKTtcbiAgICAgIHNwbGl0dGVyLmNvbm5lY3QobWVyZ2VyLCAwLCAwKTsgLy8gQ29ubmVjdCBsZWZ0IGNoYW5uZWwgb2Ygc3BsaXR0ZXIgdG8gbGVmdCBpbnB1dCBvZiBtZXJnZXJcbiAgICAgIHNwbGl0dGVyLmNvbm5lY3QobWVyZ2VyLCAwLCAxKTsgLy8gQ29ubmVjdCBsZWZ0IGNoYW5uZWwgb2Ygc3BsaXR0ZXIgdG8gcmlnaHQgaW5wdXQgb2YgbWVyZ2VyIChtb25vKVxuICAgICAgbWVyZ2VyLmNvbm5lY3QoZ2Fpbik7XG4gICAgfSBlbHNlIHsgLy8gU3RlcmVvXG4gICAgICBzb3VyY2UuY29ubmVjdChiYXNzRmlsdGVyKTtcbiAgICAgIGJhc3NGaWx0ZXIuY29ubmVjdCh2b2ljZUZpbHRlcik7XG4gICAgICB2b2ljZUZpbHRlci5jb25uZWN0KGdhaW4pO1xuICAgIH1cbiAgICBnYWluLmNvbm5lY3QoY29udGV4dC5kZXN0aW5hdGlvbik7XG5cbiAgICAvLyBVcGRhdGUgdGhlIHN0b3JlZCBtb25vIHNldHRpbmcgZm9yIHRoaXMgZWxlbWVudCB0byByZWZsZWN0IHRoZSBhcHBsaWVkIHNldHRpbmdcbiAgICBub2Rlcy5tb25vID0gc2V0dGluZ3MubW9ubztcblxuICAgIC8vIEFsd2F5cyBhcHBseS91cGRhdGUgb3RoZXIgYXVkaW8gcGFyYW1ldGVyc1xuICAgIGF3YWl0IHRoaXMudXBkYXRlTm9kZVNldHRpbmdzKG5vZGVzLCBzZXR0aW5ncyk7XG4gIH1cblxuICAvKipcbiAgICogRGlzY29ubmVjdHMgYXVkaW8gbm9kZXMgZm9yIGEgc3BlY2lmaWMgZWxlbWVudCBhbmQgcmVtb3ZlcyBpdCBmcm9tIHRoZSBtYXAuXG4gICAqIEBwYXJhbSBlbGVtZW50IFRoZSBIVE1MTWVkaWFFbGVtZW50IHRvIGRpc2Nvbm5lY3QuXG4gICAqIEByZXR1cm5zIFRydWUgaWYgbm9kZXMgd2VyZSBmb3VuZCBhbmQgZGlzY29ubmVjdGVkLCBmYWxzZSBvdGhlcndpc2UuXG4gICAqL1xuICBwdWJsaWMgZGlzY29ubmVjdEVsZW1lbnROb2RlcyhlbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50KTogYm9vbGVhbiB7XG4gICAgY29uc3Qgbm9kZXMgPSB0aGlzLmF1ZGlvRWxlbWVudE1hcC5nZXQoZWxlbWVudCk7XG4gICAgaWYgKCFub2RlcykgcmV0dXJuIGZhbHNlO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBEaXNjb25uZWN0aW5nIG5vZGVzIGZvciBlbGVtZW50OiAke1xuICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgIH1gXG4gICAgKTsgLy8gQURERUQgTE9HXG5cbiAgICB0cnkge1xuICAgICAgLy8gU2FmZWx5IGRpc2Nvbm5lY3QgZWFjaCBub2RlXG4gICAgICBjb25zdCBzYWZlRGlzY29ubmVjdCA9IChub2RlOiBBdWRpb05vZGUpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBub2RlLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIElnbm9yZSBkaXNjb25uZWN0IGVycm9yc1xuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICBzYWZlRGlzY29ubmVjdChub2Rlcy5nYWluKTtcbiAgICAgIHNhZmVEaXNjb25uZWN0KG5vZGVzLnZvaWNlRmlsdGVyKTtcbiAgICAgIHNhZmVEaXNjb25uZWN0KG5vZGVzLmJhc3NGaWx0ZXIpO1xuICAgICAgc2FmZURpc2Nvbm5lY3Qobm9kZXMuc3BsaXR0ZXIpO1xuICAgICAgc2FmZURpc2Nvbm5lY3Qobm9kZXMubWVyZ2VyKTtcbiAgICAgIHNhZmVEaXNjb25uZWN0KG5vZGVzLnNvdXJjZSk7XG5cbiAgICAgIC8vIEV4cGxpY2l0bHkgbnVsbGlmeSByZWZlcmVuY2VzIHRvIGhlbHAgZ2FyYmFnZSBjb2xsZWN0aW9uXG4gICAgICAvLyBDYXN0IHRvIGFueSBzaW5jZSB3ZSdyZSBpbnRlbnRpb25hbGx5IGRlc3Ryb3lpbmcgdGhlc2Ugbm9kZXNcbiAgICAgIChub2RlcyBhcyBhbnkpLnNvdXJjZSA9IG51bGw7XG4gICAgICAobm9kZXMgYXMgYW55KS5nYWluID0gbnVsbDtcbiAgICAgIChub2RlcyBhcyBhbnkpLmJhc3NGaWx0ZXIgPSBudWxsO1xuICAgICAgKG5vZGVzIGFzIGFueSkudm9pY2VGaWx0ZXIgPSBudWxsO1xuICAgICAgKG5vZGVzIGFzIGFueSkuc3BsaXR0ZXIgPSBudWxsO1xuICAgICAgKG5vZGVzIGFzIGFueSkubWVyZ2VyID0gbnVsbDtcbiAgICAgIC8vIERvIG5vdCBudWxsaWZ5IGNvbnRleHQgb3IgZWxlbWVudCBhcyB0aGV5IGFyZSBtYW5hZ2VkIGVsc2V3aGVyZVxuXG4gICAgICB0aGlzLmF1ZGlvRWxlbWVudE1hcC5kZWxldGUoZWxlbWVudCk7XG4gICAgICByZXR1cm4gdHJ1ZTsgLy8gSW5kaWNhdGUgc3VjY2Vzc1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBgQXVkaW9Qcm9jZXNzb3I6IEVycm9yIGRpc2Nvbm5lY3Rpbmcgbm9kZXMgZm9yICR7XG4gICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgIH06YCxcbiAgICAgICAgZXJyb3JcbiAgICAgICk7XG4gICAgICAvLyBBdHRlbXB0IHRvIHJlbW92ZSBmcm9tIG1hcCBldmVuIGlmIGRpc2Nvbm5lY3QgZmFpbGVkIHBhcnRpYWxseVxuICAgICAgdGhpcy5hdWRpb0VsZW1lbnRNYXAuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgcmV0dXJuIGZhbHNlOyAvLyBJbmRpY2F0ZSBmYWlsdXJlXG4gICAgfVxuICB9XG5cbiAgYXN5bmMgdXBkYXRlQXVkaW9FZmZlY3RzKHNldHRpbmdzOiBBdWRpb1NldHRpbmdzKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBcIltBdWRpb1Byb2Nlc3Nvcl0gVXBkYXRpbmcgYXVkaW8gZWZmZWN0cyB3aXRoIHNldHRpbmdzOlwiLFxuICAgICAgSlNPTi5zdHJpbmdpZnkoc2V0dGluZ3MpXG4gICAgKTtcblxuICAgIGZvciAoY29uc3QgW2VsZW1lbnQsIG5vZGVzXSBvZiB0aGlzLmF1ZGlvRWxlbWVudE1hcC5lbnRyaWVzKCkpIHtcbiAgICAgIC8vIENoZWNrIGlmIHRoZSBlbGVtZW50IGlzIHN0aWxsIGNvbm5lY3RlZCB0byB0aGUgRE9NIGJlZm9yZSBwcm9jZXNzaW5nXG4gICAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gRWxlbWVudCAke1xuICAgICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgfSBpcyBubyBsb25nZXIgY29ubmVjdGVkIHRvIERPTS4gRGlzY29ubmVjdGluZyBhbmQgcmVtb3ZpbmcuYFxuICAgICAgICApO1xuICAgICAgICB0aGlzLmRpc2Nvbm5lY3RFbGVtZW50Tm9kZXMoZWxlbWVudCk7IC8vIENsZWFuIHVwIGRpc2Nvbm5lY3RlZCBlbGVtZW50c1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gQ2FsbCBzZXR1cEF1ZGlvQ29udGV4dCwgd2hpY2ggbm93IGhhbmRsZXMgcmV1c2luZyBleGlzdGluZyBub2RlcyBhbmQgcmVjb25uZWN0aW5nIHRoZW1cbiAgICAgICAgYXdhaXQgdGhpcy5zZXR1cEF1ZGlvQ29udGV4dChlbGVtZW50LCBzZXR0aW5ncyk7XG5cbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gVXBkYXRlZCBzZXR0aW5ncyBmb3IgZWxlbWVudDogJHtcbiAgICAgICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgICAgIH0uYFxuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICBcIkF1ZGlvUHJvY2Vzc29yOiBVcGRhdGUgZmFpbGVkIGZvciBlbGVtZW50OlwiLFxuICAgICAgICAgIGVsZW1lbnQuc3JjLFxuICAgICAgICAgIGVycm9yXG4gICAgICAgICk7XG4gICAgICAgIC8vIElmIHVwZGF0ZSBmYWlscywgZG8gTk9UIGRpc2Nvbm5lY3QgdGhlIGVsZW1lbnQgbm9kZXMsIGFzIHRoZXkgc2hvdWxkIHJlbWFpbiByZXVzYWJsZS5cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyByZXNldEFsbFRvRGlzYWJsZWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gUmVzZXQgYWxsIGF1ZGlvIGNvbnRleHRzIGFuZCBkaXNjb25uZWN0IG5vZGVzXG4gICAgdGhpcy5hdWRpb0VsZW1lbnRNYXAuZm9yRWFjaCgobm9kZXMsIGVsZW1lbnQpID0+IHtcbiAgICAgIHRoaXMuZGlzY29ubmVjdEVsZW1lbnROb2RlcyhlbGVtZW50KTtcbiAgICAgIC8vIERvbid0IGNsb3NlIGNvbnRleHQgaGVyZSwgbGV0IGNsZWFudXAgaGFuZGxlIGl0IG9yIHJldXNlIGl0XG4gICAgICAvLyBub2Rlcy5jb250ZXh0LmNsb3NlKCk7XG4gICAgfSk7XG4gICAgdGhpcy5hdWRpb0VsZW1lbnRNYXAuY2xlYXIoKTtcbiAgfVxuXG4gIGhhc1Byb2Nlc3NpbmcobWVkaWFFbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuYXVkaW9FbGVtZW50TWFwLmhhcyhtZWRpYUVsZW1lbnQpO1xuICB9XG5cbiAgY2xlYW51cCgpOiB2b2lkIHtcbiAgICB0aGlzLmF1ZGlvRWxlbWVudE1hcC5jbGVhcigpO1xuICAgIGlmICh0aGlzLmF1ZGlvQ29udGV4dCkge1xuICAgICAgdGhpcy5hdWRpb0NvbnRleHQuY2xvc2UoKTtcbiAgICAgIHRoaXMuYXVkaW9Db250ZXh0ID0gbnVsbDtcbiAgICB9XG4gICAgY29uc29sZS5sb2coXCJBdWRpb1Byb2Nlc3NvcjogQ2xlYW51cCBjb21wbGV0ZWRcIik7XG4gIH1cblxuICAvKipcbiAgICogQXR0ZW1wdHMgdG8gcmVzdW1lIHRoZSBBdWRpb0NvbnRleHQgaWYgaXQncyBzdXNwZW5kZWQuXG4gICAqIFNob3VsZCBiZSBjYWxsZWQgYWZ0ZXIgYSB1c2VyIGdlc3R1cmUuXG4gICAqL1xuICBhc3luYyB0cnlSZXN1bWVDb250ZXh0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLmF1ZGlvQ29udGV4dCAmJiB0aGlzLmF1ZGlvQ29udGV4dC5zdGF0ZSA9PT0gXCJzdXNwZW5kZWRcIikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5hdWRpb0NvbnRleHQucmVzdW1lKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiQXVkaW9Qcm9jZXNzb3I6IEF1ZGlvQ29udGV4dCByZXN1bWVkIHN1Y2Nlc3NmdWxseS5cIik7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQXVkaW9Qcm9jZXNzb3I6IEZhaWxlZCB0byByZXN1bWUgQXVkaW9Db250ZXh0OlwiLCBlcnJvcik7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0aGlzLmF1ZGlvQ29udGV4dCkge1xuICAgICAgLy8gY29uc29sZS5sb2coYEF1ZGlvUHJvY2Vzc29yOiBBdWRpb0NvbnRleHQgc3RhdGUgaXMgYWxyZWFkeSBcIiR7dGhpcy5hdWRpb0NvbnRleHQuc3RhdGV9XCIsIG5vIHJlc3VtZSBuZWVkZWQuYCk7IC8vIFJlZHVjZWQgbG9nZ2luZ1xuICAgIH1cbiAgfVxufSAvLyBFbmQgb2YgQXVkaW9Qcm9jZXNzb3IgY2xhc3NcbiIsImNvbnN0IG1lZGlhQ29uZmlnID0ge1xuICBiYXNlU2VsZWN0b3JzOiBbXG4gICAgXCJ2aWRlb1wiLFxuICAgIFwiYXVkaW9cIixcbiAgICAvLyBFc3NlbnRpYWwgcGxheWVyIHBhdHRlcm5zXG4gICAgXCJbY2xhc3MqPSdwbGF5ZXInXVwiLFxuICAgIFwiW2NsYXNzKj0ndmlkZW8nXVwiLFxuICAgIFwiW2lkKj0ncGxheWVyJ11cIixcbiAgICBcIltpZCo9J3ZpZGVvJ11cIixcbiAgICAvLyBDb21tb24gZnJhbWV3b3Jrc1xuICAgIFwiLnZpZGVvLWpzXCIsXG4gICAgXCIuandwbGF5ZXJcIixcbiAgICBcIi5odG1sNS12aWRlby1wbGF5ZXJcIixcbiAgICBcIi5wbHlyXCIsXG4gICAgLy8gS2V5IGRhdGEgYXR0cmlidXRlc1xuICAgIFwiW2RhdGEtcGxheWVyXVwiLFxuICAgIFwiW2RhdGEtdmlkZW9dXCIsXG4gICAgXCJbZGF0YS1tZWRpYV1cIixcbiAgICAvLyBLZXkgaWZyYW1lIHNvdXJjZXNcbiAgICBcImlmcmFtZVtzcmMqPSd5b3V0dWJlLmNvbSddXCIsXG4gICAgXCJpZnJhbWVbc3JjKj0ndmltZW8uY29tJ11cIixcbiAgICBcImlmcmFtZVtzcmMqPSdkYWlseW1vdGlvbi5jb20nXVwiLFxuICAgIFwiaWZyYW1lW3NyYyo9J3R3aXRjaC50diddXCJcbiAgXSxcbiAgc2l0ZVNlbGVjdG9yczoge1xuICAgIFwieW91dHViZS5jb21cIjogW1wiLmh0bWw1LXZpZGVvLXBsYXllclwiXSxcbiAgICBcIm5ldGZsaXguY29tXCI6IFtcIltkYXRhLXVpYT0ndmlkZW8tcGxheWVyJ11cIl0sXG4gICAgXCJodWx1LmNvbVwiOiBbXCIuSHVsdVBsYXllclwiXSxcbiAgICBcImFtYXpvbi5jb21cIjogW1wiW2RhdGEtcGxheWVyPSdBbWF6b25WaWRlbyddXCJdLFxuICAgIFwiZGlzbmV5cGx1cy5jb21cIjogW1wiLmRwLXZpZGVvLXBsYXllclwiXVxuICB9XG59O1xuXG5leHBvcnQgY2xhc3MgTWVkaWFNYW5hZ2VyIHtcbiAgcHJpdmF0ZSBzdGF0aWMgZGVib3VuY2VUaW1lb3V0OiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHN0YXRpYyBwcm9jZXNzZWRFbGVtZW50cyA9IG5ldyBXZWFrU2V0PEhUTUxFbGVtZW50PigpOyAvLyBLZWVwIGZvciBjdXN0b20gcGxheWVyIGNvbnRhaW5lcnNcbiAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVCT1VOQ0VfREVMQVkgPSA1MDA7XG4gIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9ERVBUSCA9IDEwO1xuXG4gIHByaXZhdGUgc3RhdGljIGlzRXh0ZW5zaW9uQ29udGV4dCgpOiBib29sZWFuIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLnByb3RvY29sID09PSBcImNocm9tZS1leHRlbnNpb246XCIgfHxcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLnByb3RvY29sID09PSBcIm1vei1leHRlbnNpb246XCIgfHxcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLnByb3RvY29sID09PSBcImVkZ2UtZXh0ZW5zaW9uOlwiXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvLyBPcHRpbWl6ZWQgdmlzaWJpbGl0eSBjaGVja1xuICBwcml2YXRlIHN0YXRpYyBpc0VsZW1lbnRWaXNpYmxlKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuICEhKFxuICAgICAgZWxlbWVudC5vZmZzZXRXaWR0aCB8fFxuICAgICAgZWxlbWVudC5vZmZzZXRIZWlnaHQgfHxcbiAgICAgIGVsZW1lbnQuZ2V0Q2xpZW50UmVjdHMoKS5sZW5ndGhcbiAgICApO1xuICB9XG5cbiAgLy8gVXNlIHRoZSBmdWxsIHNpdGVTZWxlY3RvcnMgY29uZmlndXJhdGlvblxuICBwcml2YXRlIHN0YXRpYyBnZXRFeHRyYVNlbGVjdG9yc0ZvclNpdGUoKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IGN1cnJlbnRIb3N0bmFtZSA9IHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZTtcbiAgICBmb3IgKGNvbnN0IHNpdGVIb3N0bmFtZSBpbiBtZWRpYUNvbmZpZy5zaXRlU2VsZWN0b3JzKSB7XG4gICAgICAvLyBFeGFjdCBtYXRjaCBmb3IgaG9zdG5hbWUgKG5vIHN1YmRvbWFpbiBtYXRjaGluZylcbiAgICAgIGlmIChjdXJyZW50SG9zdG5hbWUgPT09IHNpdGVIb3N0bmFtZSkge1xuICAgICAgICAvLyBUeXBlIGFzc2VydGlvbiBuZWVkZWQgYXMga2V5cyBhcmUgc3RyaW5nc1xuICAgICAgICByZXR1cm4gbWVkaWFDb25maWcuc2l0ZVNlbGVjdG9yc1tcbiAgICAgICAgICBzaXRlSG9zdG5hbWUgYXMga2V5b2YgdHlwZW9mIG1lZGlhQ29uZmlnLnNpdGVTZWxlY3RvcnNcbiAgICAgICAgXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIFtdOyAvLyBSZXR1cm4gZW1wdHkgYXJyYXkgaWYgbm8gbWF0Y2ggZm91bmRcbiAgfVxuXG4gIC8vIFVwZGF0ZWQgY3VzdG9tIHBsYXllciBkZXRlY3Rpb24gd2l0aCBmYWxsYmFjayBkeW5hbWljIHNjYW5uaW5nXG4gIHByaXZhdGUgc3RhdGljIGZpbmRDdXN0b21QbGF5ZXJzKHJvb3Q6IFBhcmVudE5vZGUpOiBIVE1MRWxlbWVudFtdIHtcbiAgICBjb25zdCBjdXN0b21QbGF5ZXJzOiBIVE1MRWxlbWVudFtdID0gW107XG4gICAgY29uc3QgYmFzZVNlbGVjdG9ycyA9IG1lZGlhQ29uZmlnLmJhc2VTZWxlY3RvcnM7XG4gICAgY29uc3Qgc2l0ZVNlbGVjdG9ycyA9IHRoaXMuZ2V0RXh0cmFTZWxlY3RvcnNGb3JTaXRlKCk7XG4gICAgY29uc3QgYWxsU2VsZWN0b3JzID0gWy4uLmJhc2VTZWxlY3RvcnMsIC4uLnNpdGVTZWxlY3RvcnNdO1xuICAgIFxuICAgIC8vIFVzZSBhIFNldCB0byBhdm9pZCBkdXBsaWNhdGUgZWxlbWVudHNcbiAgICBjb25zdCBzZWxlY3RvckVsZW1lbnRzID0gbmV3IFNldDxFbGVtZW50PigpO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICAvLyBQcm9jZXNzIGVhY2ggc2VsZWN0b3IgaW5kaXZpZHVhbGx5IHRvIGF2b2lkIG1hc3NpdmUgY29tYmluZWQgc2VsZWN0b3JcbiAgICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2YgYWxsU2VsZWN0b3JzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgZWxlbWVudHMgPSByb290LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpO1xuICAgICAgICAgIGVsZW1lbnRzLmZvckVhY2goZWwgPT4gc2VsZWN0b3JFbGVtZW50cy5hZGQoZWwpKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGNvbnNvbGUud2FybihgRXJyb3Igd2l0aCBzZWxlY3RvciAnJHtzZWxlY3Rvcn0nOmAsIGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIFByb2Nlc3MgY29sbGVjdGVkIGVsZW1lbnRzXG4gICAgICBzZWxlY3RvckVsZW1lbnRzLmZvckVhY2goZWxlbWVudCA9PiB7XG4gICAgICAgIGlmIChlbGVtZW50IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQgJiYgIXRoaXMucHJvY2Vzc2VkRWxlbWVudHMuaGFzKGVsZW1lbnQpKSB7XG4gICAgICAgICAgdGhpcy5wcm9jZXNzZWRFbGVtZW50cy5hZGQoZWxlbWVudCk7XG4gICAgICAgICAgY3VzdG9tUGxheWVycy5wdXNoKGVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLndhcm4oXCJFcnJvciBmaW5kaW5nIGN1c3RvbSBwbGF5ZXJzOlwiLCBlKTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGN1c3RvbVBsYXllcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGZpbmRNZWRpYUVsZW1lbnRzKFxuICAgIHJvb3Q6IFBhcmVudE5vZGUgPSBkb2N1bWVudCxcbiAgICBkZXB0aDogbnVtYmVyID0gMFxuICApOiBIVE1MTWVkaWFFbGVtZW50W10ge1xuICAgIGlmICh0aGlzLmlzRXh0ZW5zaW9uQ29udGV4dCgpIHx8IGRlcHRoID4gdGhpcy5NQVhfREVQVEgpIHtcbiAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cbiAgICBjb25zdCBlbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdID0gW107XG5cbiAgICB0cnkge1xuICAgICAgLy8gRGlyZWN0IG1lZGlhIGVsZW1lbnRzXG4gICAgICBjb25zdCBtZWRpYUVsZW1lbnRzID0gcm9vdC5xdWVyeVNlbGVjdG9yQWxsKFwidmlkZW8sIGF1ZGlvXCIpO1xuICAgICAgbWVkaWFFbGVtZW50cy5mb3JFYWNoKChlbGVtZW50KSA9PiB7XG4gICAgICAgIGlmIChlbGVtZW50IGluc3RhbmNlb2YgSFRNTE1lZGlhRWxlbWVudCkge1xuICAgICAgICAgIGVsZW1lbnRzLnB1c2goZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBIYW5kbGUgU2hhZG93IERPTVxuICAgICAgaWYgKHJvb3QgaW5zdGFuY2VvZiBFbGVtZW50ICYmIHJvb3Quc2hhZG93Um9vdCkge1xuICAgICAgICBlbGVtZW50cy5wdXNoKC4uLnRoaXMuZmluZE1lZGlhRWxlbWVudHMocm9vdC5zaGFkb3dSb290LCBkZXB0aCArIDEpKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ3VzdG9tIHBsYXllcnMgKG9ubHkgYXQgdG9wIGxldmVsKVxuICAgICAgaWYgKGRlcHRoID09PSAwKSB7XG4gICAgICAgIGNvbnN0IGN1c3RvbVBsYXllcnMgPSB0aGlzLmZpbmRDdXN0b21QbGF5ZXJzKHJvb3QpO1xuICAgICAgICBjdXN0b21QbGF5ZXJzLmZvckVhY2goKHBsYXllcikgPT4ge1xuICAgICAgICAgIGNvbnN0IG1lZGlhSW5QbGF5ZXIgPSBwbGF5ZXIucXVlcnlTZWxlY3RvckFsbChcInZpZGVvLCBhdWRpb1wiKTtcbiAgICAgICAgICBtZWRpYUluUGxheWVyLmZvckVhY2goKGVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgIGlmIChlbGVtZW50IGluc3RhbmNlb2YgSFRNTE1lZGlhRWxlbWVudCkge1xuICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoIXRoaXMuaXNFeHRlbnNpb25Db250ZXh0KCkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFwiRXJyb3IgZmluZGluZyBtZWRpYSBlbGVtZW50czpcIiwgZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIEFycmF5LmZyb20obmV3IFNldChlbGVtZW50cykpO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBzZXR1cE1lZGlhRWxlbWVudE9ic2VydmVyKFxuICAgIG9uQWRkZWQ6IChlbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiB2b2lkLFxuICAgIG9uUmVtb3ZlZDogKGVsZW1lbnRzOiBIVE1MTWVkaWFFbGVtZW50W10pID0+IHZvaWRcbiAgKTogTXV0YXRpb25PYnNlcnZlciB7XG4gICAgY29uc3QgZGVib3VuY2VkQ2hlY2sgPSAoKSA9PiB7XG4gICAgICBpZiAoTWVkaWFNYW5hZ2VyLmRlYm91bmNlVGltZW91dCkge1xuICAgICAgICBjbGVhclRpbWVvdXQoTWVkaWFNYW5hZ2VyLmRlYm91bmNlVGltZW91dCk7XG4gICAgICB9XG4gICAgICBNZWRpYU1hbmFnZXIuZGVib3VuY2VUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGNvbnN0IGVsZW1lbnRzID0gdGhpcy5maW5kTWVkaWFFbGVtZW50cygpO1xuICAgICAgICBpZiAoZWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIG9uQWRkZWQoZWxlbWVudHMpO1xuICAgICAgICB9XG4gICAgICB9LCBNZWRpYU1hbmFnZXIuREVCT1VOQ0VfREVMQVkpO1xuICAgIH07XG5cbiAgICAvLyBJbml0aWFsIGNoZWNrXG4gICAgaWYgKCF0aGlzLmlzRXh0ZW5zaW9uQ29udGV4dCgpKSB7XG4gICAgICBkZWJvdW5jZWRDaGVjaygpO1xuICAgIH1cblxuICAgIC8vIE11dGF0aW9uIG9ic2VydmVyIHRvIGRldGVjdCBhZGRlZC9yZW1vdmVkIG5vZGVzXG4gICAgY29uc3Qgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigobXV0YXRpb25zKSA9PiB7XG4gICAgICBjb25zdCBhZGRlZE1lZGlhRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSA9IFtdO1xuICAgICAgY29uc3QgcmVtb3ZlZE1lZGlhRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSA9IFtdO1xuXG4gICAgICBtdXRhdGlvbnMuZm9yRWFjaCgobXV0YXRpb24pID0+IHtcbiAgICAgICAgaWYgKG11dGF0aW9uLnR5cGUgPT09IFwiY2hpbGRMaXN0XCIpIHtcbiAgICAgICAgICBtdXRhdGlvbi5hZGRlZE5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTE1lZGlhRWxlbWVudCkge1xuICAgICAgICAgICAgICBhZGRlZE1lZGlhRWxlbWVudHMucHVzaChub2RlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB7XG4gICAgICAgICAgICAgIC8vIENoZWNrIGZvciBtZWRpYSBlbGVtZW50cyB3aXRoaW4gYWRkZWQgbm9uLW1lZGlhIGVsZW1lbnRzXG4gICAgICAgICAgICAgIG5vZGUucXVlcnlTZWxlY3RvckFsbChcInZpZGVvLCBhdWRpb1wiKS5mb3JFYWNoKChlbCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlbCBpbnN0YW5jZW9mIEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgIGFkZGVkTWVkaWFFbGVtZW50cy5wdXNoKGVsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbXV0YXRpb24ucmVtb3ZlZE5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTE1lZGlhRWxlbWVudCkge1xuICAgICAgICAgICAgICByZW1vdmVkTWVkaWFFbGVtZW50cy5wdXNoKG5vZGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIG1lZGlhIGVsZW1lbnRzIHdpdGhpbiByZW1vdmVkIG5vbi1tZWRpYSBlbGVtZW50c1xuICAgICAgICAgICAgICBub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoXCJ2aWRlbywgYXVkaW9cIikuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZWwgaW5zdGFuY2VvZiBIVE1MTWVkaWFFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICByZW1vdmVkTWVkaWFFbGVtZW50cy5wdXNoKGVsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgaWYgKGFkZGVkTWVkaWFFbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIFwiW01lZGlhTWFuYWdlciBPYnNlcnZlcl0gQWRkZWQgbWVkaWEgZWxlbWVudHMgZGV0ZWN0ZWQsIHRyaWdnZXJpbmcgZGVib3VuY2VkIGNoZWNrLlwiXG4gICAgICAgICk7XG4gICAgICAgIGRlYm91bmNlZENoZWNrKCk7IC8vIFRyaWdnZXIgZGVib3VuY2VkIGNoZWNrIGZvciBhZGRlZCBlbGVtZW50c1xuICAgICAgfVxuXG4gICAgICBpZiAocmVtb3ZlZE1lZGlhRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBgW01lZGlhTWFuYWdlciBPYnNlcnZlcl0gUmVtb3ZlZCAke3JlbW92ZWRNZWRpYUVsZW1lbnRzLmxlbmd0aH0gbWVkaWEgZWxlbWVudHMsIHRyaWdnZXJpbmcgY2xlYW51cC5gXG4gICAgICAgICk7XG4gICAgICAgIG9uUmVtb3ZlZChyZW1vdmVkTWVkaWFFbGVtZW50cyk7IC8vIEltbWVkaWF0ZWx5IGNhbGwgb25SZW1vdmVkIGZvciBjbGVhbnVwXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwge1xuICAgICAgY2hpbGRMaXN0OiB0cnVlLFxuICAgICAgc3VidHJlZTogdHJ1ZSxcbiAgICB9KTtcblxuICAgIHJldHVybiBvYnNlcnZlcjtcbiAgfVxufVxuIiwiaW1wb3J0IHsgQXVkaW9TZXR0aW5ncyB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb1Byb2Nlc3NvciB9IGZyb20gXCIuL2F1ZGlvLXByb2Nlc3NvclwiO1xuaW1wb3J0IHsgTWVkaWFNYW5hZ2VyIH0gZnJvbSBcIi4vbWVkaWEtbWFuYWdlclwiO1xuXG5leHBvcnQgY2xhc3MgTWVkaWFQcm9jZXNzb3Ige1xuICBhdWRpb1Byb2Nlc3NvcjogQXVkaW9Qcm9jZXNzb3I7XG4gIHByaXZhdGUgYWN0aXZlTWVkaWFFbGVtZW50cyA9IG5ldyBTZXQ8SFRNTE1lZGlhRWxlbWVudD4oKTtcbiAgcHJpdmF0ZSBlbGVtZW50U2V0dGluZ3MgPSBuZXcgV2Vha01hcDxIVE1MTWVkaWFFbGVtZW50LCBBdWRpb1NldHRpbmdzPigpO1xuICBwcml2YXRlIGVsZW1lbnRMaXN0ZW5lcnMgPSBuZXcgV2Vha01hcDxIVE1MTWVkaWFFbGVtZW50LCAoKSA9PiB2b2lkPigpO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3IgPSBuZXcgQXVkaW9Qcm9jZXNzb3IoKTtcbiAgfVxuXG4gIC8vIE1ldGhvZCB0byBnZXQgY3VycmVudGx5IG1hbmFnZWQgbWVkaWEgZWxlbWVudHMsIGZpbHRlcmluZyBmb3IgY29ubmVjdGVkIG9uZXNcbiAgcHVibGljIGdldE1hbmFnZWRNZWRpYUVsZW1lbnRzKCk6IEhUTUxNZWRpYUVsZW1lbnRbXSB7XG4gICAgY29uc3QgZGlzY29ubmVjdGVkOiBIVE1MTWVkaWFFbGVtZW50W10gPSBbXTtcbiAgICBcbiAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIGlmICghZWwuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgZGlzY29ubmVjdGVkLnB1c2goZWwpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIGRpc2Nvbm5lY3RlZC5mb3JFYWNoKGVsID0+IHRoaXMuY2xlYW51cEVsZW1lbnQoZWwpKTtcbiAgICBcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMpO1xuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGVQbGF5YmFja1NwZWVkKGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQsIHNwZWVkOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFtNZWRpYVByb2Nlc3Nvcl0gQXR0ZW1wdGVkIHRvIHVwZGF0ZSBzcGVlZCBvbiBkaXNjb25uZWN0ZWQgZWxlbWVudDogJHtcbiAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgfWBcbiAgICAgICk7XG4gICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpOyAvLyBDbGVhbiB1cCBpZiBmb3VuZCBpbiBhY3RpdmUgbGlzdFxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBjb25zb2xlLmxvZyggLy8gVGhpcyBsb2cgY2FuIGJlIHZlcnkgbm9pc3ksIGVuYWJsZSBpZiBuZWVkZWQgZm9yIHNwZWNpZmljIHNwZWVkIGRlYnVnZ2luZ1xuICAgIC8vICAgYFtNZWRpYVByb2Nlc3Nvcl0gVXBkYXRpbmcgc3BlZWQgZm9yIGVsZW1lbnQgJHtcbiAgICAvLyAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgLy8gICB9IHRvICR7c3BlZWR9YFxuICAgIC8vICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHdhc1BsYXlpbmcgPSAhZWxlbWVudC5wYXVzZWQ7XG4gICAgICBjb25zdCBjdXJyZW50VGltZSA9IGVsZW1lbnQuY3VycmVudFRpbWU7XG5cbiAgICAgIGVsZW1lbnQucGxheWJhY2tSYXRlID0gc3BlZWQgLyAxMDA7XG4gICAgICBlbGVtZW50LmRlZmF1bHRQbGF5YmFja1JhdGUgPSBzcGVlZCAvIDEwMDtcblxuICAgICAgLy8gUmVzdG9yZSBzdGF0ZVxuICAgICAgaWYgKHdhc1BsYXlpbmcpIHtcbiAgICAgICAgLy8gSWYgcGxheWluZywgY2hhbmdpbmcgcGxheWJhY2tSYXRlIHNob3VsZCBpZGVhbGx5IG5vdCBzdG9wIGl0LlxuICAgICAgICAvLyBBdm9pZCByZXNldHRpbmcgY3VycmVudFRpbWUgd2hpY2ggY2FuIGNhdXNlIGEgc3R1dHRlci5cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIGl0IHdhcyBwYXVzZWQsIHNldCB0aGUgY3VycmVudFRpbWUgdG8gZW5zdXJlIGl0IHN0YXlzIGF0IHRoZSBzYW1lIHNwb3QuXG4gICAgICAgIGVsZW1lbnQuY3VycmVudFRpbWUgPSBjdXJyZW50VGltZTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBgTWVkaWFQcm9jZXNzb3I6IEVycm9yIHNldHRpbmcgc3BlZWQgZm9yICR7ZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwifTpgLFxuICAgICAgICBlXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NNZWRpYUVsZW1lbnRzKFxuICAgIG1lZGlhRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncyxcbiAgICBuZWVkc0F1ZGlvRWZmZWN0c1NldHVwOiBib29sZWFuXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vIE9ubHkgbG9nIGlmIHdlIGhhdmUgZWxlbWVudHMgdG8gcHJvY2Vzc1xuICAgIGlmIChtZWRpYUVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUuZGVidWcoXG4gICAgICAgIGBbTWVkaWFQcm9jZXNzb3JdIFByb2Nlc3NpbmcgJHttZWRpYUVsZW1lbnRzLmxlbmd0aH0gbWVkaWEgZWxlbWVudChzKS4gQXVkaW8gZWZmZWN0czogJHtuZWVkc0F1ZGlvRWZmZWN0c1NldHVwfWBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gQXBwbHkgc3BlZWQgc2V0dGluZ3MgaW1tZWRpYXRlbHlcbiAgICBtZWRpYUVsZW1lbnRzLmZvckVhY2goKGVsZW1lbnQpID0+IHtcbiAgICAgIGlmIChlbGVtZW50LmlzQ29ubmVjdGVkKSB7XG4gICAgICAgIHRoaXMudXBkYXRlUGxheWJhY2tTcGVlZChlbGVtZW50LCBzZXR0aW5ncy5zcGVlZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKG5lZWRzQXVkaW9FZmZlY3RzU2V0dXApIHtcbiAgICAgIGF3YWl0IHRoaXMuYXVkaW9Qcm9jZXNzb3IudHJ5UmVzdW1lQ29udGV4dCgpO1xuXG4gICAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbWVkaWFFbGVtZW50cykge1xuICAgICAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci5zZXR1cEF1ZGlvQ29udGV4dChlbGVtZW50LCBzZXR0aW5ncyk7XG4gICAgICAgICAgdGhpcy5hY3RpdmVNZWRpYUVsZW1lbnRzLmFkZChlbGVtZW50KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICBgW01lZGlhUHJvY2Vzc29yXSBFcnJvciBzZXR0aW5nIHVwIGF1ZGlvIGZvciAke1xuICAgICAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgICAgIH06YCxcbiAgICAgICAgICAgIGVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgdGhpcy5hdWRpb1Byb2Nlc3Nvci5hdWRpb0NvbnRleHQgJiZcbiAgICAgICAgdGhpcy5hdWRpb1Byb2Nlc3Nvci5hdWRpb0NvbnRleHQuc3RhdGUgPT09IFwicnVubmluZ1wiXG4gICAgICApIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci51cGRhdGVBdWRpb0VmZmVjdHMoc2V0dGluZ3MpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBObyBhdWRpbyBlZmZlY3RzIG5lZWRlZCAtIGRpc2Nvbm5lY3QgZXhpc3RpbmcgYXVkaW8gbm9kZXMgZm9yIHRoZXNlIGVsZW1lbnRzXG4gICAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbWVkaWFFbGVtZW50cykge1xuICAgICAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgLy8gRGlzY29ubmVjdCBhdWRpbyBwcm9jZXNzaW5nIGZvciB0aGlzIGVsZW1lbnQgc2luY2UgZWZmZWN0cyBhcmUgbm8gbG9uZ2VyIG5lZWRlZFxuICAgICAgICAgIGlmICh0aGlzLmF1ZGlvUHJvY2Vzc29yLmhhc1Byb2Nlc3NpbmcoZWxlbWVudCkpIHtcbiAgICAgICAgICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3IuZGlzY29ubmVjdEVsZW1lbnROb2RlcyhlbGVtZW50KTtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5kZWxldGUoZWxlbWVudCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgIGBbTWVkaWFQcm9jZXNzb3JdIEVycm9yIGRpc2Nvbm5lY3RpbmcgZWZmZWN0cyBmb3IgJHtcbiAgICAgICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgICB9OmAsXG4gICAgICAgICAgICBlXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBJZiBubyBtb3JlIGFjdGl2ZSBlbGVtZW50cyB3aXRoIHByb2Nlc3NpbmcsIGNsZWFuIHVwIHRoZSBhdWRpbyBjb250ZXh0XG4gICAgICBpZiAodGhpcy5hY3RpdmVNZWRpYUVsZW1lbnRzLnNpemUgPT09IDApIHtcbiAgICAgICAgdGhpcy5hdWRpb1Byb2Nlc3Nvci5jbGVhbnVwKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFwcGx5IHNldHRpbmdzIGRpcmVjdGx5IHRvIG1lZGlhIGVsZW1lbnRzIHdpdGhvdXQgd2FpdGluZyBmb3IgYXN5bmMgb3BlcmF0aW9uc1xuICAgKiBVc2VmdWwgZm9yIGltbWVkaWF0ZSBVSSBmZWVkYmFja1xuICAgKi9cbiAgcHJpdmF0ZSBsYXN0QXBwbGllZFNldHRpbmdzOiBBdWRpb1NldHRpbmdzIHwgbnVsbCA9IG51bGw7XG5cbiAgYXBwbHlTZXR0aW5nc0ltbWVkaWF0ZWx5KFxuICAgIG1lZGlhRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncyxcbiAgICBkaXNhYmxlZDogYm9vbGVhbiA9IGZhbHNlXG4gICk6IHZvaWQge1xuICAgIGlmIChkaXNhYmxlZCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIFwiW01lZGlhUHJvY2Vzc29yXSBEaXNhYmxpbmcgbWVkaWEgcHJvY2Vzc2luZyBhbmQgcGF1c2luZyBtZWRpYSBlbGVtZW50c1wiXG4gICAgICApO1xuICAgICAgXG4gICAgICAvLyBSZXNldCBhbnkgcHJldmlvdXNseSBhcHBsaWVkIHNldHRpbmdzIGFuZCBwYXVzZSBlbGVtZW50c1xuICAgICAgbWVkaWFFbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAvLyBPbmx5IHJlc2V0IGlmIHdlIGhhZCBhcHBsaWVkIHNldHRpbmdzIHRvIHRoaXMgZWxlbWVudFxuICAgICAgICBpZiAodGhpcy5lbGVtZW50U2V0dGluZ3MuaGFzKGVsZW1lbnQpKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFBhdXNlIHRoZSBlbGVtZW50IGlmIGl0J3MgcGxheWluZ1xuICAgICAgICAgICAgaWYgKCFlbGVtZW50LnBhdXNlZCkge1xuICAgICAgICAgICAgICBlbGVtZW50LnBhdXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGVsZW1lbnQucGxheWJhY2tSYXRlID0gMS4wO1xuICAgICAgICAgICAgZWxlbWVudC5kZWZhdWx0UGxheWJhY2tSYXRlID0gMS4wO1xuICAgICAgICAgICAgdGhpcy5jbGVhbnVwRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgICBgTWVkaWFQcm9jZXNzb3I6IEVycm9yIHJlc2V0dGluZyBlbGVtZW50ICR7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgICAgIH0gaW4gZGlzYWJsZWQgbW9kZTpgLFxuICAgICAgICAgICAgICBlXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBcIltNZWRpYVByb2Nlc3Nvcl0gQXBwbHlpbmcgc2V0dGluZ3MgaW1tZWRpYXRlbHkgdG8gbWVkaWEgZWxlbWVudHNcIlxuICAgICk7XG5cbiAgICBjb25zdCB0YXJnZXRTcGVlZCA9IHNldHRpbmdzLnNwZWVkIC8gMTAwO1xuICAgIFxuICAgIC8vIFByb2Nlc3MgYWxsIGVsZW1lbnRzIHN5bmNocm9ub3VzbHkgZm9yIGltbWVkaWF0ZSBlZmZlY3RcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbWVkaWFFbGVtZW50cykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKCFlbGVtZW50LmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgdGhpcy5jbGVhbnVwRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQXBwbHkgcGxheWJhY2sgc3BlZWQgaW1tZWRpYXRlbHlcbiAgICAgICAgZWxlbWVudC5wbGF5YmFja1JhdGUgPSB0YXJnZXRTcGVlZDtcbiAgICAgICAgZWxlbWVudC5kZWZhdWx0UGxheWJhY2tSYXRlID0gdGFyZ2V0U3BlZWQ7XG4gICAgICAgIFxuICAgICAgICAvLyBTdG9yZSBjdXJyZW50IHNldHRpbmdzIGZvciB0aGlzIGVsZW1lbnRcbiAgICAgICAgdGhpcy5lbGVtZW50U2V0dGluZ3Muc2V0KGVsZW1lbnQsIHNldHRpbmdzKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEFkZCBwbGF5IGV2ZW50IGxpc3RlbmVyIGlmIG5vdCBhbHJlYWR5IGFkZGVkXG4gICAgICAgIGlmICghdGhpcy5lbGVtZW50TGlzdGVuZXJzLmhhcyhlbGVtZW50KSkge1xuICAgICAgICAgIGNvbnN0IHBsYXlIYW5kbGVyID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYFtNZWRpYVByb2Nlc3Nvcl0gUmVhcHBseWluZyBzZXR0aW5ncyBvbiBwbGF5IGV2ZW50IGZvciAke2VsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIn1gKTtcbiAgICAgICAgICAgIC8vIFJlYWQgY3VycmVudCBzZXR0aW5ncyBmcm9tIFdlYWtNYXAgaW5zdGVhZCBvZiBjYXB0dXJpbmcgc3RhbGUgY2xvc3VyZVxuICAgICAgICAgICAgY29uc3QgY3VycmVudFNldHRpbmdzID0gdGhpcy5lbGVtZW50U2V0dGluZ3MuZ2V0KGVsZW1lbnQpO1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRTZXR0aW5ncykge1xuICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXliYWNrU3BlZWQoZWxlbWVudCwgY3VycmVudFNldHRpbmdzLnNwZWVkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncGxheScsIHBsYXlIYW5kbGVyKTtcbiAgICAgICAgICB0aGlzLmVsZW1lbnRMaXN0ZW5lcnMuc2V0KGVsZW1lbnQsIHBsYXlIYW5kbGVyKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gVHJhY2sgY29ubmVjdGVkIGVsZW1lbnRzXG4gICAgICAgIGlmICghdGhpcy5hY3RpdmVNZWRpYUVsZW1lbnRzLmhhcyhlbGVtZW50KSkge1xuICAgICAgICAgIHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5hZGQoZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICBgTWVkaWFQcm9jZXNzb3I6IEVycm9yIGFwcGx5aW5nIHNldHRpbmdzIHRvICR7XG4gICAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgICB9OmAsXG4gICAgICAgICAgZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBcbiAgcHJpdmF0ZSBjbGVhbnVwRWxlbWVudChlbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50KTogdm9pZCB7XG4gICAgaWYgKHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5oYXMoZWxlbWVudCkpIHtcbiAgICAgIHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5kZWxldGUoZWxlbWVudCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHBsYXlIYW5kbGVyID0gdGhpcy5lbGVtZW50TGlzdGVuZXJzLmdldChlbGVtZW50KTtcbiAgICBpZiAocGxheUhhbmRsZXIpIHtcbiAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigncGxheScsIHBsYXlIYW5kbGVyKTtcbiAgICAgIHRoaXMuZWxlbWVudExpc3RlbmVycy5kZWxldGUoZWxlbWVudCk7XG4gICAgfVxuICAgIFxuICAgIHRoaXMuZWxlbWVudFNldHRpbmdzLmRlbGV0ZShlbGVtZW50KTtcbiAgfVxuXG4gIGFwcGx5U2V0dGluZ3NUb1Zpc2libGVNZWRpYShcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncyxcbiAgICBkaXNhYmxlZDogYm9vbGVhbiA9IGZhbHNlXG4gICk6IHZvaWQge1xuICAgIC8vIEdldCBhbGwgbWVkaWEgZWxlbWVudHMgYW5kIGZpbHRlciBmb3IgdmlzaWJsZSBvbmVzXG4gICAgY29uc3QgdmlzaWJsZU1lZGlhID0gdGhpcy5nZXRNYW5hZ2VkTWVkaWFFbGVtZW50cygpLmZpbHRlcihlbCA9PlxuICAgICAgZWwub2Zmc2V0V2lkdGggPiAwIHx8IGVsLm9mZnNldEhlaWdodCA+IDBcbiAgICApO1xuICAgIFxuICAgIGlmICh2aXNpYmxlTWVkaWEubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBbTWVkaWFQcm9jZXNzb3JdIEFwcGx5aW5nIHNldHRpbmdzIHRvICR7dmlzaWJsZU1lZGlhLmxlbmd0aH0gdmlzaWJsZSBtZWRpYSBlbGVtZW50c2BcbiAgICAgICk7XG4gICAgICB0aGlzLmFwcGx5U2V0dGluZ3NJbW1lZGlhdGVseSh2aXNpYmxlTWVkaWEsIHNldHRpbmdzLCBkaXNhYmxlZCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEZvcmNlIHVwZGF0ZSBvZiBhdWRpbyBlZmZlY3RzIGV2ZW4gaWYgY29udGV4dCBhbHJlYWR5IGV4aXN0c1xuICAgKiBVc2VmdWwgZm9yIGltbWVkaWF0ZSBhcHBsaWNhdGlvbiBvZiBmaWx0ZXIvYXVkaW8gY2hhbmdlc1xuICAgKi9cbiAgYXN5bmMgZm9yY2VBdWRpb0VmZmVjdHNVcGRhdGUoc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zb2xlLmxvZyhcIltNZWRpYVByb2Nlc3Nvcl0gRm9yY2luZyBhdWRpbyBlZmZlY3RzIHVwZGF0ZVwiKTtcblxuICAgIGlmIChcbiAgICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3JbXCJhdWRpb0NvbnRleHRcIl0gJiZcbiAgICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3JbXCJhdWRpb0NvbnRleHRcIl0uc3RhdGUgIT09IFwiY2xvc2VkXCJcbiAgICApIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIENyZWF0ZSBuZXcgYXVkaW8gY29udGV4dCBpZiBuZWVkZWRcbiAgICAgICAgaWYgKHRoaXMuYXVkaW9Qcm9jZXNzb3JbXCJhdWRpb0NvbnRleHRcIl0uc3RhdGUgPT09IFwic3VzcGVuZGVkXCIpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmF1ZGlvUHJvY2Vzc29yW1wiYXVkaW9Db250ZXh0XCJdLnJlc3VtZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRm9yY2UgdXBkYXRlIG9mIGF1ZGlvIGVmZmVjdHNcbiAgICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci51cGRhdGVBdWRpb0VmZmVjdHMoc2V0dGluZ3MpO1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBcIltNZWRpYVByb2Nlc3Nvcl0gU3VjY2Vzc2Z1bGx5IGZvcmNlZCBhdWRpbyBlZmZlY3RzIHVwZGF0ZVwiXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgXCJbTWVkaWFQcm9jZXNzb3JdIEZhaWxlZCB0byBmb3JjZSBhdWRpbyBlZmZlY3RzIHVwZGF0ZTpcIixcbiAgICAgICAgICBlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBcIltNZWRpYVByb2Nlc3Nvcl0gQ3JlYXRpbmcgbmV3IGF1ZGlvIGNvbnRleHQgZm9yIGZvcmNlZCB1cGRhdGVcIlxuICAgICAgKTtcbiAgICAgIGNvbnN0IG1vY2tFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImF1ZGlvXCIpO1xuICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci5zZXR1cEF1ZGlvQ29udGV4dChtb2NrRWxlbWVudCwgc2V0dGluZ3MpO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgc2V0dXBNZWRpYU9ic2VydmVyKFxuICAgIG9uQWRkZWQ6IChlbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiBQcm9taXNlPHZvaWQ+LFxuICAgIG9uUmVtb3ZlZDogKGVsZW1lbnRzOiBIVE1MTWVkaWFFbGVtZW50W10pID0+IHZvaWRcbiAgKTogTXV0YXRpb25PYnNlcnZlciB7XG4gICAgLy8gQ2hhbmdlIHJldHVybiB0eXBlIHRvIE11dGF0aW9uT2JzZXJ2ZXJcbiAgICByZXR1cm4gTWVkaWFNYW5hZ2VyLnNldHVwTWVkaWFFbGVtZW50T2JzZXJ2ZXIob25BZGRlZCwgb25SZW1vdmVkKTsgLy8gUmV0dXJuIHRoZSBvYnNlcnZlclxuICB9XG5cbiAgZmluZE1lZGlhRWxlbWVudHMoKTogSFRNTE1lZGlhRWxlbWVudFtdIHtcbiAgICAvLyBBc3N1bWluZyBNZWRpYU1hbmFnZXIuZmluZE1lZGlhRWxlbWVudHMgaXMgbWFkZSBwdWJsaWNcbiAgICByZXR1cm4gTWVkaWFNYW5hZ2VyLmZpbmRNZWRpYUVsZW1lbnRzKCk7XG4gIH1cblxuICBhc3luYyByZXNldFRvRGlzYWJsZWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci5yZXNldEFsbFRvRGlzYWJsZWQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQdWJsaWMgbWV0aG9kIHRvIGF0dGVtcHQgcmVzdW1pbmcgdGhlIEF1ZGlvQ29udGV4dCB2aWEgdGhlIHByaXZhdGUgQXVkaW9Qcm9jZXNzb3IuXG4gICAqL1xuICBwdWJsaWMgYXN5bmMgYXR0ZW1wdENvbnRleHRSZXN1bWUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gQWNjZXNzIHRoZSBwcml2YXRlIG1lbWJlciB1c2luZyBicmFja2V0IG5vdGF0aW9uIGlmIG5lZWRlZCwgb3IgbWFrZSBpdCBwdWJsaWMvaW50ZXJuYWxcbiAgICBhd2FpdCB0aGlzLmF1ZGlvUHJvY2Vzc29yLnRyeVJlc3VtZUNvbnRleHQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQdWJsaWMgbWV0aG9kIHRvIGNoZWNrIGlmIHRoZSBBdWRpb0NvbnRleHQgaXMgcmVhZHkgZm9yIGFwcGx5aW5nIGF1ZGlvIGVmZmVjdHMuXG4gICAqL1xuICBwdWJsaWMgY2FuQXBwbHlBdWRpb0VmZmVjdHMoKTogYm9vbGVhbiB7XG4gICAgLy8gQ2hlY2sgaWYgYXVkaW9Qcm9jZXNzb3IgYW5kIGl0cyBhdWRpb0NvbnRleHQgZXhpc3QgYW5kIGFyZSBpbiAncnVubmluZycgc3RhdGVcbiAgICByZXR1cm4gKFxuICAgICAgISF0aGlzLmF1ZGlvUHJvY2Vzc29yW1wiYXVkaW9Db250ZXh0XCJdICYmXG4gICAgICB0aGlzLmF1ZGlvUHJvY2Vzc29yW1wiYXVkaW9Db250ZXh0XCJdLnN0YXRlID09PSBcInJ1bm5pbmdcIlxuICAgICk7XG4gIH1cbn0gLy8gRW5kIG9mIE1lZGlhUHJvY2Vzc29yIGNsYXNzXG4iLCJleHBvcnQgaW50ZXJmYWNlIEF1ZGlvU2V0dGluZ3Mge1xuICB2b2x1bWU6IG51bWJlcjtcbiAgYmFzc0Jvb3N0OiBudW1iZXI7XG4gIHZvaWNlQm9vc3Q6IG51bWJlcjtcbiAgbW9ubzogYm9vbGVhbjtcbiAgc3BlZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlU2V0dGluZ3Mge1xuICBlbmFibGVkOiBib29sZWFuO1xuICBzZXR0aW5ncz86IEF1ZGlvU2V0dGluZ3M7XG4gIGFjdGl2ZVNldHRpbmc6IFwiZ2xvYmFsXCIgfCBcInNpdGVcIiB8IFwiZGlzYWJsZWRcIjtcbn1cblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRTZXR0aW5nczogQXVkaW9TZXR0aW5ncyA9IHtcbiAgdm9sdW1lOiAxMDAsXG4gIGJhc3NCb29zdDogMTAwLFxuICB2b2ljZUJvb3N0OiAxMDAsXG4gIG1vbm86IGZhbHNlLFxuICBzcGVlZDogMTAwLFxufTtcblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRTaXRlU2V0dGluZ3M6IFNpdGVTZXR0aW5ncyA9IHtcbiAgZW5hYmxlZDogdHJ1ZSxcbiAgc2V0dGluZ3M6IHsgLi4uZGVmYXVsdFNldHRpbmdzIH0sXG4gIGFjdGl2ZVNldHRpbmc6IFwiZ2xvYmFsXCIsIC8vIFN0YXJ0cyBpbiBnbG9iYWwgbW9kZSwgY2FuIGJlIGNoYW5nZWQgdG8gXCJzaXRlXCIgb3IgXCJkaXNhYmxlZFwiXG59O1xuXG5leHBvcnQgdHlwZSBTdGF0ZVR5cGUgPSB7XG4gIGdsb2JhbFNldHRpbmdzOiBBdWRpb1NldHRpbmdzO1xuICBzaXRlU2V0dGluZ3M6IE1hcDxzdHJpbmcsIFNpdGVTZXR0aW5ncz47XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFVwZGF0ZVNldHRpbmdzTWVzc2FnZSB7XG4gIHR5cGU6IFwiVVBEQVRFX1NFVFRJTkdTXCI7XG4gIHNldHRpbmdzOiBBdWRpb1NldHRpbmdzO1xuICBlbmFibGVkPzogYm9vbGVhbjtcbiAgaXNHbG9iYWw/OiBib29sZWFuO1xuICBob3N0bmFtZT86IHN0cmluZzsgLy8gQWRkIG9wdGlvbmFsIGhvc3RuYW1lXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udGVudFNjcmlwdFJlYWR5TWVzc2FnZSB7XG4gIHR5cGU6IFwiQ09OVEVOVF9TQ1JJUFRfUkVBRFlcIjtcbiAgaG9zdG5hbWU/OiBzdHJpbmc7XG4gIHVzaW5nR2xvYmFsPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBVcGRhdGVTaXRlTW9kZU1lc3NhZ2Uge1xuICB0eXBlOiBcIlVQREFURV9TSVRFX01PREVcIjtcbiAgaG9zdG5hbWU/OiBzdHJpbmc7XG4gIG1vZGU/OiBcImdsb2JhbFwiIHwgXCJzaXRlXCIgfCBcImRpc2FibGVkXCI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2V0SW5pdGlhbFNldHRpbmdzTWVzc2FnZSB7XG4gIHR5cGU6IFwiR0VUX0lOSVRJQUxfU0VUVElOR1NcIjtcbiAgaG9zdG5hbWU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIE1lc3NhZ2VUeXBlID1cbiAgfCBVcGRhdGVTZXR0aW5nc01lc3NhZ2VcbiAgfCBDb250ZW50U2NyaXB0UmVhZHlNZXNzYWdlXG4gIHwgVXBkYXRlU2l0ZU1vZGVNZXNzYWdlXG4gIHwgR2V0SW5pdGlhbFNldHRpbmdzTWVzc2FnZTtcblxuZXhwb3J0IHR5cGUgU3RvcmFnZURhdGEgPSB7XG4gIGdsb2JhbFNldHRpbmdzPzogQXVkaW9TZXR0aW5ncztcbiAgc2l0ZVNldHRpbmdzPzogeyBbaG9zdG5hbWU6IHN0cmluZ106IFNpdGVTZXR0aW5ncyB9O1xufTtcblxuLyoqXG4gKiBDaGVjayBpZiBhbGwgYXVkaW8gc2V0dGluZ3MgYXJlIGF0IHRoZWlyIGRlZmF1bHQgKGRpc2FibGVkKSB2YWx1ZXMuXG4gKiBUaGlzIGlzIGEgcHVyZSBmdW5jdGlvbiB1c2VkIGFjcm9zcyBjb250ZW50IHNjcmlwdCBhbmQgcG9wdXAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1NldHRpbmdzRGlzYWJsZWQoc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MpOiBib29sZWFuIHtcbiAgcmV0dXJuIChcbiAgICBzZXR0aW5ncy5zcGVlZCA9PT0gMTAwICYmXG4gICAgc2V0dGluZ3Mudm9sdW1lID09PSAxMDAgJiZcbiAgICBzZXR0aW5ncy5iYXNzQm9vc3QgPT09IDEwMCAmJlxuICAgIHNldHRpbmdzLnZvaWNlQm9vc3QgPT09IDEwMCAmJlxuICAgICFzZXR0aW5ncy5tb25vXG4gICk7XG59XG5cbiIsImltcG9ydCB7IEF1ZGlvU2V0dGluZ3MsIGRlZmF1bHRTZXR0aW5ncyB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc0hhbmRsZXIge1xuICBwcml2YXRlIGN1cnJlbnRTZXR0aW5nczogQXVkaW9TZXR0aW5ncztcbiAgcHJpdmF0ZSB0YXJnZXRIb3N0bmFtZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7IC8vIFN0b3JlIHRoZSBob3N0bmFtZSB3ZSBzaG91bGQgdXNlXG4gIHByaXZhdGUgaW5pdGlhbGl6YXRpb25Db21wbGV0ZTogUHJvbWlzZTx2b2lkPjtcbiAgcHJpdmF0ZSByZXNvbHZlSW5pdGlhbGl6YXRpb24hOiAoKSA9PiB2b2lkOyAvLyBEZWZpbml0ZSBhc3NpZ25tZW50IGFzc2VydGlvblxuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0geyAuLi5kZWZhdWx0U2V0dGluZ3MgfTsgLy8gU3RhcnQgd2l0aCBkZWZhdWx0c1xuICAgIC8vIERvbid0IHNldCBob3N0bmFtZSBoZXJlLCB3YWl0IGZvciBpbml0aWFsaXplXG4gICAgdGhpcy5pbml0aWFsaXphdGlvbkNvbXBsZXRlID0gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIHRoaXMucmVzb2x2ZUluaXRpYWxpemF0aW9uID0gcmVzb2x2ZTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplcyB0aGUgaGFuZGxlciBieSByZXF1ZXN0aW5nIHRoZSBjb3JyZWN0IHNldHRpbmdzXG4gICAqIGZvciB0aGUgdGFyZ2V0IGhvc3RuYW1lIGZyb20gdGhlIGJhY2tncm91bmQgc2NyaXB0LlxuICAgKiBAcGFyYW0gaG9zdG5hbWUgVGhlIGhvc3RuYW1lIHRvIGZldGNoIHNldHRpbmdzIGZvciAoaWRlYWxseSB0b3AtbGV2ZWwpLlxuICAgKi9cbiAgYXN5bmMgaW5pdGlhbGl6ZShob3N0bmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy50YXJnZXRIb3N0bmFtZSA9IGhvc3RuYW1lOyAvLyBTdG9yZSB0aGUgdGFyZ2V0IGhvc3RuYW1lXG4gICAgY29uc29sZS5sb2coXG4gICAgICBgU2V0dGluZ3NIYW5kbGVyIChUYXJnZXQ6ICR7dGhpcy50YXJnZXRIb3N0bmFtZX0pOiBJbml0aWFsaXppbmcuLi5gXG4gICAgKTtcblxuICAgIGlmICghdGhpcy50YXJnZXRIb3N0bmFtZSkge1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogSW5pdGlhbGl6YXRpb24gYWJvcnRlZCAtIG5vIHZhbGlkIHRhcmdldCBob3N0bmFtZSBwcm92aWRlZC5gXG4gICAgICApO1xuICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9O1xuICAgICAgdGhpcy5yZXNvbHZlSW5pdGlhbGl6YXRpb24oKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IEF0dGVtcHRpbmcgdG8gc2VuZCBHRVRfSU5JVElBTF9TRVRUSU5HUy5gXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgIHR5cGU6IFwiR0VUX0lOSVRJQUxfU0VUVElOR1NcIixcbiAgICAgICAgaG9zdG5hbWU6IHRoaXMudGFyZ2V0SG9zdG5hbWUsXG4gICAgICB9KTtcblxuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IEdFVF9JTklUSUFMX1NFVFRJTkdTIHJlc3BvbnNlIHJlY2VpdmVkOmAsXG4gICAgICAgIHJlc3BvbnNlXG4gICAgICApO1xuXG4gICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uuc2V0dGluZ3MpIHtcbiAgICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSByZXNwb25zZS5zZXR0aW5ncztcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogU3VjY2Vzc2Z1bGx5IGFwcGxpZWQgaW5pdGlhbCBzZXR0aW5ncyBmcm9tIGJhY2tncm91bmQ6YCxcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh0aGlzLmN1cnJlbnRTZXR0aW5ncylcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0geyAuLi5kZWZhdWx0U2V0dGluZ3MgfTtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IE5vIHZhbGlkIHNldHRpbmdzIGluIHJlc3BvbnNlIG9yIHJlc3BvbnNlIHdhcyBudWxsL3VuZGVmaW5lZC4gVXNpbmcgZGVmYXVsdHMuIFJlc3BvbnNlOmAsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgXCJDdXJyZW50IHNldHRpbmdzIG5vdzpcIixcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh0aGlzLmN1cnJlbnRTZXR0aW5ncylcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9O1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogRXJyb3IgZHVyaW5nIEdFVF9JTklUSUFMX1NFVFRJTkdTIHNlbmRNZXNzYWdlIG9yIHByb2Nlc3Npbmc6YCxcbiAgICAgICAgZXJyb3IsXG4gICAgICAgIFwiVXNpbmcgZGVmYXVsdHMuIEN1cnJlbnQgc2V0dGluZ3Mgbm93OlwiLFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh0aGlzLmN1cnJlbnRTZXR0aW5ncylcbiAgICAgICk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgU2V0dGluZ3NIYW5kbGVyIChUYXJnZXQ6ICR7dGhpcy50YXJnZXRIb3N0bmFtZX0pOiBJbml0aWFsaXphdGlvbiBwcm9taXNlIHJlc29sdmluZy4gRmluYWwgY3VycmVudFNldHRpbmdzIHN0YXRlIGZvciB0aGlzIGluaXQgY3ljbGU6YCxcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5jdXJyZW50U2V0dGluZ3MpXG4gICAgICApO1xuICAgICAgdGhpcy5yZXNvbHZlSW5pdGlhbGl6YXRpb24oKTsgLy8gU2lnbmFsIHRoYXQgaW5pdGlhbGl6YXRpb24gaXMgZG9uZVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIG9uY2UgaW5pdGlhbCBzZXR0aW5ncyBoYXZlIGJlZW5cbiAgICogZmV0Y2hlZCAob3IgZmFpbGVkIHRvIGZldGNoKSBmcm9tIHRoZSBiYWNrZ3JvdW5kIHNjcmlwdC5cbiAgICovXG4gIGFzeW5jIGVuc3VyZUluaXRpYWxpemVkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmluaXRpYWxpemF0aW9uQ29tcGxldGU7XG4gIH1cblxuICAvKipcbiAgICogR2V0cyB0aGUgY3VycmVudGx5IGxvYWRlZCBzZXR0aW5ncy5cbiAgICovXG4gIGdldEN1cnJlbnRTZXR0aW5ncygpOiBBdWRpb1NldHRpbmdzIHtcbiAgICByZXR1cm4gdGhpcy5jdXJyZW50U2V0dGluZ3M7XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlcyBzZXR0aW5ncyBsb2NhbGx5LiBTaG91bGQgcHJpbWFyaWx5IGJlIHVzZWQgd2hlbiByZWNlaXZpbmdcbiAgICogdXBkYXRlcyBmcm9tIHRoZSBiYWNrZ3JvdW5kIHNjcmlwdCB2aWEgbWVzc2FnZXMuXG4gICAqL1xuICB1cGRhdGVTZXR0aW5ncyhzZXR0aW5nczogQXVkaW9TZXR0aW5ncyk6IHZvaWQge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogU2V0dGluZ3MgdXBkYXRlZCBkaXJlY3RseWAsXG4gICAgICBzZXR0aW5nc1xuICAgICk7XG4gICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNldHMgc2V0dGluZ3MgdG8gdGhlIGFwcGxpY2F0aW9uIGRlZmF1bHRzIGxvY2FsbHkuXG4gICAqL1xuICByZXNldFRvRGVmYXVsdCgpOiB2b2lkIHtcbiAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyA9IHsgLi4uZGVmYXVsdFNldHRpbmdzIH07XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lcyBpZiBhdWRpbyBwcm9jZXNzaW5nIGlzIG5lZWRlZCBiYXNlZCBvbiBjdXJyZW50IHNldHRpbmdzLlxuICAgKi9cbiAgbmVlZHNBdWRpb1Byb2Nlc3NpbmcoKTogYm9vbGVhbiB7XG4gICAgLy8gQ2hlY2sgaWYgc2V0dGluZ3MgYXJlIGRpZmZlcmVudCBmcm9tIGRlZmF1bHRzLCBpbXBseWluZyBwcm9jZXNzaW5nIGlzIG5lZWRlZFxuICAgIGNvbnN0IGRlZmF1bHRzID0gZGVmYXVsdFNldHRpbmdzO1xuICAgIGNvbnN0IG5lZWRzUHJvY2Vzc2luZyA9ICEoXG4gICAgICAoXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzLnZvbHVtZSA9PT0gZGVmYXVsdHMudm9sdW1lICYmXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzLmJhc3NCb29zdCA9PT0gZGVmYXVsdHMuYmFzc0Jvb3N0ICYmXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzLnZvaWNlQm9vc3QgPT09IGRlZmF1bHRzLnZvaWNlQm9vc3QgJiZcbiAgICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MubW9ubyA9PT0gZGVmYXVsdHMubW9ub1xuICAgICAgKVxuICAgICAgLy8gQWRkIG90aGVyIHJlbGV2YW50IHNldHRpbmdzIGNoZWNrcyBoZXJlIGlmIG5lZWRlZFxuICAgICk7XG4gICAgLy8gY29uc29sZS5sb2coYFNldHRpbmdzSGFuZGxlciAoJHt0aGlzLmhvc3RuYW1lfSk6IG5lZWRzQXVkaW9Qcm9jZXNzaW5nID0gJHtuZWVkc1Byb2Nlc3Npbmd9YCk7XG4gICAgcmV0dXJuIG5lZWRzUHJvY2Vzc2luZztcbiAgfVxufVxuIiwiaW1wb3J0IHsgU2V0dGluZ3NIYW5kbGVyIH0gZnJvbSBcIi4vc2V0dGluZ3MtaGFuZGxlclwiO1xuaW1wb3J0IHsgTWVkaWFQcm9jZXNzb3IgfSBmcm9tIFwiLi9tZWRpYS1wcm9jZXNzb3JcIjtcblxudHlwZSBJbml0aWFsaXplU2NyaXB0Q2FsbGJhY2sgPSAoaG9zdG5hbWU6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPjtcblxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwSG9zdG5hbWVEZXRlY3Rpb24oXG4gIGluaXRpYWxpemVTY3JpcHQ6IEluaXRpYWxpemVTY3JpcHRDYWxsYmFja1xuKTogKCkgPT4gdm9pZCB7XG4gIGxldCBjbGVhbnVwRnVuY3Rpb25zOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG4gIGlmICh3aW5kb3cuc2VsZiA9PT0gd2luZG93LnRvcCkge1xuICAgIC8vIC0tLSBSdW5uaW5nIGluIHRoZSBUT1Agd2luZG93IC0tLVxuICAgIGNvbnN0IHRvcEhvc3RuYW1lID0gd2luZG93LmxvY2F0aW9uLmhvc3RuYW1lO1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYFtDb250ZW50U2NyaXB0XSBSdW5uaW5nIGluIFRPUCB3aW5kb3cuIEhvc3RuYW1lOiAke3RvcEhvc3RuYW1lfWBcbiAgICApO1xuICAgIGluaXRpYWxpemVTY3JpcHQodG9wSG9zdG5hbWUpOyAvLyBJbml0aWFsaXplIGZvciB0aGUgdG9wIHdpbmRvd1xuXG4gICAgLy8gTGlzdGVuZXIgZm9yIHJlcXVlc3RzIGZyb20gaWZyYW1lc1xuICAgIGNvbnN0IHRvcFdpbmRvd01lc3NhZ2VMaXN0ZW5lciA9IChldmVudDogTWVzc2FnZUV2ZW50KSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IFRPUF0gUmVjZWl2ZWQgbWVzc2FnZS4gT3JpZ2luOiAke1xuICAgICAgICAgIGV2ZW50Lm9yaWdpblxuICAgICAgICB9LCBEYXRhIFR5cGU6ICR7dHlwZW9mIGV2ZW50LmRhdGF9LCBEYXRhOiAke2V2ZW50LmRhdGF9YFxuICAgICAgKTtcblxuICAgICAgLy8gT25seSBwcm9jZXNzIG1lc3NhZ2VzIHRoYXQgYXJlIHN0cmluZ3MgYW5kIGxvb2sgbGlrZSBvdXIgSlNPTiBtZXNzYWdlc1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgZXZlbnQuZGF0YSAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgICAhZXZlbnQuZGF0YS5zdGFydHNXaXRoKFwie1wiKSB8fFxuICAgICAgICAhZXZlbnQuZGF0YS5lbmRzV2l0aChcIn1cIilcbiAgICAgICkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBcIltDb250ZW50U2NyaXB0IFRPUF0gSWdub3Jpbmcgbm9uLUpTT04gb3Igbm9uLVZWUCBtZXNzYWdlIGZyb20gaWZyYW1lIChmb3JtYXQgbWlzbWF0Y2gpLlwiXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIGEgY2hlY2sgZm9yIG91ciBzcGVjaWZpYyBtZXNzYWdlIHR5cGVzIGJlZm9yZSBwYXJzaW5nXG4gICAgICBpZiAoXG4gICAgICAgICFldmVudC5kYXRhLmluY2x1ZGVzKFwiVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FXCIpICYmXG4gICAgICAgICFldmVudC5kYXRhLmluY2x1ZGVzKFwiVlZQX1RPUF9IT1NUTkFNRV9JTkZPXCIpXG4gICAgICApIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgXCJbQ29udGVudFNjcmlwdCBUT1BdIElnbm9yaW5nIG5vbi1WVlAgbWVzc2FnZSBmcm9tIGlmcmFtZSAoY29udGVudCBtaXNtYXRjaCkuXCJcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbGV0IHBhcnNlZERhdGE7XG4gICAgICB0cnkge1xuICAgICAgICBwYXJzZWREYXRhID0gSlNPTi5wYXJzZShldmVudC5kYXRhKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIFwiW0NvbnRlbnRTY3JpcHQgVE9QXSBGYWlsZWQgdG8gcGFyc2UgZXZlbnQuZGF0YSBzdHJpbmcgZnJvbSBpZnJhbWUgKGxpa2VseSBub3Qgb3VyIG1lc3NhZ2UpOlwiLFxuICAgICAgICAgIGV2ZW50LmRhdGEsXG4gICAgICAgICAgZVxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgW0NvbnRlbnRTY3JpcHQgVE9QXSBQYXJzZWQgVlZQIG1lc3NhZ2UgZnJvbSBpZnJhbWUgKE9yaWdpbjogJHtldmVudC5vcmlnaW59KTpgLFxuICAgICAgICBwYXJzZWREYXRhXG4gICAgICApO1xuXG4gICAgICBpZiAoXG4gICAgICAgIGV2ZW50LnNvdXJjZSAmJiAvLyBFbnN1cmUgc291cmNlIGV4aXN0cyAoc291cmNlIGlzIHRoZSB3aW5kb3cgb2JqZWN0IG9mIHRoZSBzZW5kZXIpXG4gICAgICAgIHBhcnNlZERhdGEgJiZcbiAgICAgICAgcGFyc2VkRGF0YS50eXBlID09PSBcIlZWUF9SRVFVRVNUX1RPUF9IT1NUTkFNRVwiXG4gICAgICApIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IFRPUF0gUHJvY2Vzc2luZyBWVlBfUkVRVUVTVF9UT1BfSE9TVE5BTUUgZnJvbSBpZnJhbWUgKFNvdXJjZSBvcmlnaW46ICR7ZXZlbnQub3JpZ2lufSkuIFJlc3BvbmRpbmcgd2l0aCBob3N0bmFtZTogJHt0b3BIb3N0bmFtZX0uYFxuICAgICAgICApO1xuICAgICAgICBjb25zdCByZXNwb25zZVBheWxvYWQgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdHlwZTogXCJWVlBfVE9QX0hPU1ROQU1FX0lORk9cIixcbiAgICAgICAgICBob3N0bmFtZTogdG9wSG9zdG5hbWUsXG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIEhhbmRsZSBzYW5kYm94ZWQgZW52aXJvbm1lbnRzIHdoZXJlIGV2ZW50Lm9yaWdpbiBtaWdodCBiZSBcIm51bGxcIlxuICAgICAgICBjb25zdCB0YXJnZXRPcmlnaW4gPSBldmVudC5vcmlnaW4gPT09IFwibnVsbFwiID8gXCIqXCIgOiBldmVudC5vcmlnaW47XG4gICAgICAgIChldmVudC5zb3VyY2UgYXMgV2luZG93KS5wb3N0TWVzc2FnZShyZXNwb25zZVBheWxvYWQsIHRhcmdldE9yaWdpbik7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBUT1BdIFNlbnQgVlZQX1RPUF9IT1NUTkFNRV9JTkZPIHJlc3BvbnNlIHRvIGlmcmFtZSBhdCAke2V2ZW50Lm9yaWdpbn0uYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IFRPUF0gUmVjZWl2ZWQgb3RoZXIgcGFyc2VkIEpTT04gbWVzc2FnZSB0eXBlIChub3QgVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FKTogJHtwYXJzZWREYXRhLnR5cGV9IGZyb20gb3JpZ2luICR7ZXZlbnQub3JpZ2lufWAsXG4gICAgICAgICAgcGFyc2VkRGF0YVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH07XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIHRvcFdpbmRvd01lc3NhZ2VMaXN0ZW5lcik7XG4gICAgY29uc3QgcmVtb3ZlVG9wTGlzdGVuZXIgPSAoKSA9PiB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgdG9wV2luZG93TWVzc2FnZUxpc3RlbmVyKTtcbiAgICBjbGVhbnVwRnVuY3Rpb25zLnB1c2gocmVtb3ZlVG9wTGlzdGVuZXIpO1xuICB9IGVsc2Uge1xuICAgIC8vIC0tLSBSdW5uaW5nIGluIGFuIElGUkFNRSAtLS1cbiAgICBjb25zdCBpZnJhbWVPd25Ib3N0bmFtZSA9IHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZTtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFJ1bm5pbmcgaW4gSUZSQU1FLiBPd24gaG9zdG5hbWU6ICR7aWZyYW1lT3duSG9zdG5hbWV9LiBBdHRlbXB0aW5nIHRvIHJlcXVlc3QgaG9zdG5hbWUgZnJvbSB0b3Agd2luZG93LiBTZXR0aW5nIHVwIG1lc3NhZ2UgbGlzdGVuZXIuYFxuICAgICk7XG4gICAgbGV0IHJlY2VpdmVkSG9zdG5hbWUgPSBmYWxzZTtcbiAgICBsZXQgZmFsbGJhY2tUaW1lb3V0OiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICAgIC8vIExpc3RlbmVyIGZvciB0aGUgcmVzcG9uc2UgZnJvbSB0aGUgdG9wIHdpbmRvd1xuICAgIGNvbnN0IHJlc3BvbnNlTGlzdGVuZXIgPSAoZXZlbnQ6IE1lc3NhZ2VFdmVudCkgPT4ge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFJlY2VpdmVkIG1lc3NhZ2UuIE9yaWdpbjogJHtcbiAgICAgICAgICBldmVudC5vcmlnaW5cbiAgICAgICAgfSwgRGF0YSBUeXBlOiAke3R5cGVvZiBldmVudC5kYXRhfSwgRGF0YTogJHtldmVudC5kYXRhfWBcbiAgICAgICk7XG5cbiAgICAgIC8vIE9ubHkgcHJvY2VzcyBtZXNzYWdlcyBmcm9tIHRoZSB0b3Agd2luZG93XG4gICAgICBpZiAoZXZlbnQuc291cmNlICE9PSB3aW5kb3cudG9wKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFJlY2VpdmVkIG1lc3NhZ2UgZnJvbSBub24tdG9wIHNvdXJjZTogJHtldmVudC5vcmlnaW59LiBJZ25vcmluZy5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gT25seSBwcm9jZXNzIG1lc3NhZ2VzIHRoYXQgYXJlIHN0cmluZ3MgYW5kIGxvb2sgbGlrZSBvdXIgSlNPTiBtZXNzYWdlc1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgZXZlbnQuZGF0YSAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgICAhZXZlbnQuZGF0YS5zdGFydHNXaXRoKFwie1wiKSB8fFxuICAgICAgICAhZXZlbnQuZGF0YS5lbmRzV2l0aChcIn1cIilcbiAgICAgICkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBcIltDb250ZW50U2NyaXB0IGlGcmFtZV0gSWdub3Jpbmcgbm9uLUpTT04gb3Igbm9uLVZWUCBtZXNzYWdlIGZyb20gdG9wIChmb3JtYXQgbWlzbWF0Y2gpLlwiXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIGEgY2hlY2sgZm9yIG91ciBzcGVjaWZpYyBtZXNzYWdlIHR5cGVzIGJlZm9yZSBwYXJzaW5nXG4gICAgICBpZiAoXG4gICAgICAgICFldmVudC5kYXRhLmluY2x1ZGVzKFwiVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FXCIpICYmXG4gICAgICAgICFldmVudC5kYXRhLmluY2x1ZGVzKFwiVlZQX1RPUF9IT1NUTkFNRV9JTkZPXCIpXG4gICAgICApIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgXCJbQ29udGVudFNjcmlwdCBpRnJhbWVdIElnbm9yaW5nIG5vbi1WVlAgbWVzc2FnZSBmcm9tIHRvcCAoY29udGVudCBtaXNtYXRjaCkuXCJcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsZXQgcGFyc2VkRGF0YTtcbiAgICAgIHRyeSB7XG4gICAgICAgIHBhcnNlZERhdGEgPSBKU09OLnBhcnNlKGV2ZW50LmRhdGEpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgXCJbQ29udGVudFNjcmlwdCBpRnJhbWVdIEZhaWxlZCB0byBwYXJzZSBldmVudC5kYXRhIHN0cmluZyBmcm9tIHRvcDpcIixcbiAgICAgICAgICBldmVudC5kYXRhLFxuICAgICAgICAgIGVcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gUGFyc2VkIFZWUCBtZXNzYWdlIGZyb20gdG9wIChPcmlnaW46ICR7ZXZlbnQub3JpZ2lufSk6YCxcbiAgICAgICAgcGFyc2VkRGF0YVxuICAgICAgKTtcblxuICAgICAgaWYgKFxuICAgICAgICBwYXJzZWREYXRhICYmXG4gICAgICAgIHBhcnNlZERhdGEudHlwZSA9PT0gXCJWVlBfVE9QX0hPU1ROQU1FX0lORk9cIiAmJlxuICAgICAgICB0eXBlb2YgcGFyc2VkRGF0YS5ob3N0bmFtZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgKSB7XG4gICAgICAgIGlmIChmYWxsYmFja1RpbWVvdXQpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQoZmFsbGJhY2tUaW1lb3V0KTtcbiAgICAgICAgICBmYWxsYmFja1RpbWVvdXQgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZWNlaXZlZEhvc3RuYW1lKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBBbHJlYWR5IHJlY2VpdmVkIGhvc3RuYW1lLiBJZ25vcmluZyBkdXBsaWNhdGUgVlZQX1RPUF9IT1NUTkFNRV9JTkZPIGZyb20gdG9wLiBPcmlnaW46ICR7ZXZlbnQub3JpZ2lufS4gUGFyc2VkIERhdGE6YCxcbiAgICAgICAgICAgIHBhcnNlZERhdGFcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICByZWNlaXZlZEhvc3RuYW1lID0gdHJ1ZTtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gU3VjY2Vzc2Z1bGx5IHJlY2VpdmVkIFZWUF9UT1BfSE9TVE5BTUVfSU5GTyBmcm9tIHRvcDogJHtwYXJzZWREYXRhLmhvc3RuYW1lfS4gT3JpZ2luOiAke2V2ZW50Lm9yaWdpbn0uIEluaXRpYWxpemluZyBzY3JpcHQuIFBhcnNlZCBkYXRhOmAsXG4gICAgICAgICAgcGFyc2VkRGF0YVxuICAgICAgICApO1xuICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgcmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgICAgIC8vIFJlbW92ZSB0aGUgY2xlYW51cCBmdW5jdGlvbiBieSBmaWx0ZXJpbmcgd2l0aCB0aGUgc2FtZSByZWZlcmVuY2VcbiAgICAgICAgY2xlYW51cEZ1bmN0aW9ucyA9IGNsZWFudXBGdW5jdGlvbnMuZmlsdGVyKChmKSA9PiBmICE9PSByZW1vdmVSZXNwb25zZUxpc3RlbmVyKTtcbiAgICAgICAgaW5pdGlhbGl6ZVNjcmlwdChwYXJzZWREYXRhLmhvc3RuYW1lKTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VkRGF0YSAmJiBwYXJzZWREYXRhLnR5cGUpIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gUmVjZWl2ZWQgb3RoZXIgcGFyc2VkIEpTT04gbWVzc2FnZSB0eXBlIGZyb20gdG9wOiAke3BhcnNlZERhdGEudHlwZX0gZnJvbSBvcmlnaW4gJHtldmVudC5vcmlnaW59YCxcbiAgICAgICAgICBwYXJzZWREYXRhXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vIFN0b3JlIHRoZSBjbGVhbnVwIGZ1bmN0aW9uIGluIGEgdmFyaWFibGUgc28gd2UgY2FuIHJlZmVyZW5jZSBpdCBmb3IgcmVtb3ZhbFxuICAgIGNvbnN0IHJlbW92ZVJlc3BvbnNlTGlzdGVuZXIgPSAoKSA9PiB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgcmVzcG9uc2VMaXN0ZW5lcik7XG5cbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgcmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgY2xlYW51cEZ1bmN0aW9ucy5wdXNoKHJlbW92ZVJlc3BvbnNlTGlzdGVuZXIpO1xuXG4gICAgLy8gUmVxdWVzdCB0aGUgaG9zdG5hbWUgZnJvbSB0aGUgdG9wIHdpbmRvdywgc2VuZGluZyBzdHJpbmdpZmllZCBKU09OXG4gICAgaWYgKHdpbmRvdy50b3AgJiYgd2luZG93LnRvcCAhPT0gd2luZG93LnNlbGYpIHtcbiAgICAgIC8vIEFkZCBhIHNtYWxsIGRlbGF5IGJlZm9yZSBzZW5kaW5nIHRoZSBtZXNzYWdlIHRvIGdpdmUgdGhlIHRvcCB3aW5kb3cncyBzY3JpcHQgdGltZSB0byBpbml0aWFsaXplXG4gICAgICBjb25zdCByZXF1ZXN0VGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAvLyBSZS1jaGVjayB3aW5kb3cudG9wIGluc2lkZSB0aGUgdGltZW91dCBjYWxsYmFjayB0byBzYXRpc2Z5IFR5cGVTY3JpcHQgYW5kIGVuc3VyZSBydW50aW1lIHNhZmV0eVxuICAgICAgICBpZiAod2luZG93LnRvcCAmJiB3aW5kb3cudG9wICE9PSB3aW5kb3cuc2VsZikge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gU2VuZGluZyBWVlBfUkVRVUVTVF9UT1BfSE9TVE5BTUUgdG8gdG9wIHdpbmRvdyAoT3JpZ2luOiAke3dpbmRvdy5sb2NhdGlvbi5vcmlnaW59KS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBtZXNzYWdlUGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHR5cGU6IFwiVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FXCIsXG4gICAgICAgICAgICBmcm9tSWZyYW1lOiB0cnVlLFxuICAgICAgICAgICAgaWZyYW1lT3JpZ2luOiB3aW5kb3cubG9jYXRpb24ub3JpZ2luLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHdpbmRvdy50b3AucG9zdE1lc3NhZ2UobWVzc2FnZVBheWxvYWQsIFwiKlwiKTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFNlbnQgVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FIHRvIHRvcCB3aW5kb3cuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gd2luZG93LnRvcCBiZWNhbWUgbnVsbCBvciBzZWxmIHdpdGhpbiBzZXRUaW1lb3V0LiBDYW5ub3Qgc2VuZCBtZXNzYWdlLmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9LCA1MDApOyAvLyBEZWxheSBieSA1MDBtc1xuICAgICAgY2xlYW51cEZ1bmN0aW9ucy5wdXNoKCgpID0+IGNsZWFyVGltZW91dChyZXF1ZXN0VGltZW91dCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIHdpbmRvdy50b3AgaXMgbnVsbCwgc2FtZSBhcyBzZWxmLCBvciBpbmFjY2Vzc2libGUuIEluaXRpYWxpemluZyB3aXRoIG93biBob3N0bmFtZTogJHtpZnJhbWVPd25Ib3N0bmFtZX0uYFxuICAgICAgKTtcbiAgICAgIGluaXRpYWxpemVTY3JpcHQoaWZyYW1lT3duSG9zdG5hbWUpO1xuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIHJlc3BvbnNlTGlzdGVuZXIpOyAvLyBDbGVhbiB1cCBsaXN0ZW5lciBhcyBpdCdzIG5vdCBuZWVkZWRcbiAgICAgIGNsZWFudXBGdW5jdGlvbnMgPSBjbGVhbnVwRnVuY3Rpb25zLmZpbHRlcigoZikgPT4gZiAhPT0gcmVtb3ZlUmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgICByZXR1cm4gKCkgPT4gY2xlYW51cEZ1bmN0aW9ucy5mb3JFYWNoKChmKSA9PiBmKCkpOyAvLyBSZXR1cm4gY2xlYW51cCBpbW1lZGlhdGVseVxuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIHRpbWVvdXQgaW4gY2FzZSB0aGUgbWVzc2FnZSBuZXZlciBhcnJpdmVzXG4gICAgY29uc3QgVElNRU9VVF9EVVJBVElPTiA9IDEwMDAwOyAvLyBJbmNyZWFzZWQgdGltZW91dCB0byAxMCBzZWNvbmRzXG4gICAgY29uc29sZS5sb2coXG4gICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBTZXR0aW5nIGZhbGxiYWNrIHRpbWVvdXQgZm9yICR7VElNRU9VVF9EVVJBVElPTn1tcy4gVGltZW91dCBJRDogJHtmYWxsYmFja1RpbWVvdXR9YFxuICAgICk7XG4gICAgZmFsbGJhY2tUaW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIEZhbGxiYWNrIHRpbWVvdXQgdHJpZ2dlcmVkLiBUaW1lb3V0IElEOiAke2ZhbGxiYWNrVGltZW91dH0uIHJlY2VpdmVkSG9zdG5hbWU6ICR7cmVjZWl2ZWRIb3N0bmFtZX1gXG4gICAgICApO1xuICAgICAgZmFsbGJhY2tUaW1lb3V0ID0gbnVsbDsgLy8gQ2xlYXIgdGhlIHRpbWVvdXQgSURcbiAgICAgIGlmICghcmVjZWl2ZWRIb3N0bmFtZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gRGlkIG5vdCByZWNlaXZlIGhvc3RuYW1lIGZyb20gdG9wIGFmdGVyICR7VElNRU9VVF9EVVJBVElPTn1tcy4gVXNpbmcgb3duIGhvc3RuYW1lOiAke2lmcmFtZU93bkhvc3RuYW1lfS4gUmVtb3ZpbmcgcmVzcG9uc2UgbGlzdGVuZXIuYFxuICAgICAgICApO1xuICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgcmVzcG9uc2VMaXN0ZW5lcik7IC8vIENsZWFuIHVwIGxpc3RlbmVyXG4gICAgICAgIGNsZWFudXBGdW5jdGlvbnMgPSBjbGVhbnVwRnVuY3Rpb25zLmZpbHRlcigoZikgPT4gZiAhPT0gcmVtb3ZlUmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgICAgIGluaXRpYWxpemVTY3JpcHQoaWZyYW1lT3duSG9zdG5hbWUpOyAvLyBJbml0aWFsaXplIHdpdGggb3duIGhvc3RuYW1lIGFzIGZhbGxiYWNrXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBGYWxsYmFjayB0aW1lb3V0IHRyaWdnZXJlZCwgYnV0IGhvc3RuYW1lIHdhcyBhbHJlYWR5IHJlY2VpdmVkLiBObyBhY3Rpb24gbmVlZGVkLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9LCBUSU1FT1VUX0RVUkFUSU9OKTtcbiAgICBjbGVhbnVwRnVuY3Rpb25zLnB1c2goKCkgPT4ge1xuICAgICAgaWYgKGZhbGxiYWNrVGltZW91dCkge1xuICAgICAgICBjbGVhclRpbWVvdXQoZmFsbGJhY2tUaW1lb3V0KTtcbiAgICAgICAgZmFsbGJhY2tUaW1lb3V0ID0gbnVsbDtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gKCkgPT4gY2xlYW51cEZ1bmN0aW9ucy5mb3JFYWNoKChmKSA9PiBmKCkpO1xufVxuIiwiaW1wb3J0IHsgTWVkaWFQcm9jZXNzb3IgfSBmcm9tIFwiLi4vbWVkaWEtcHJvY2Vzc29yXCI7XG5pbXBvcnQgeyBTZXR0aW5nc0hhbmRsZXIgfSBmcm9tIFwiLi4vc2V0dGluZ3MtaGFuZGxlclwiO1xuaW1wb3J0IHsgaXNTZXR0aW5nc0Rpc2FibGVkIH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5cbi8qKlxuICogQ3JlYXRlcyBzdGFibGUgZXZlbnQgaGFuZGxlcnMgZm9yIG1lZGlhIGVsZW1lbnRzIHRvIHByZXZlbnQgbGlzdGVuZXIgbGVha3MuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNZWRpYUV2ZW50SGFuZGxlcnMoXG4gIHNldHRpbmdzSGFuZGxlcjogU2V0dGluZ3NIYW5kbGVyLFxuICBtZWRpYVByb2Nlc3NvcjogTWVkaWFQcm9jZXNzb3Jcbikge1xuICAvLyBUcmFjayB3aGljaCBlbGVtZW50cyBoYXZlIGhhZCBsaXN0ZW5lcnMgYWRkZWQgdG8gYXZvaWQgZHVwbGljYXRlc1xuICBjb25zdCBlbGVtZW50c1dpdGhMaXN0ZW5lcnMgPSBuZXcgV2Vha1NldDxIVE1MTWVkaWFFbGVtZW50PigpO1xuXG4gIGNvbnN0IGFwcGx5U2V0dGluZ3NUb1NpbmdsZUVsZW1lbnQgPSBhc3luYyAoZWxlbWVudDogSFRNTE1lZGlhRWxlbWVudCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYFtDb250ZW50U2NyaXB0IERFQlVHXSBhcHBseVNldHRpbmdzVG9TaW5nbGVFbGVtZW50IGNhbGxlZCBmb3IgJHtcbiAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICB9YFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHNldHRpbmdzSGFuZGxlci5lbnN1cmVJbml0aWFsaXplZCgpO1xuICAgICAgY29uc3QgY3VycmVudFNldHRpbmdzID0gc2V0dGluZ3NIYW5kbGVyLmdldEN1cnJlbnRTZXR0aW5ncygpO1xuICAgICAgY29uc3QgbmVlZHNQcm9jZXNzaW5nID0gc2V0dGluZ3NIYW5kbGVyLm5lZWRzQXVkaW9Qcm9jZXNzaW5nKCk7XG5cbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgW0NvbnRlbnRTY3JpcHQgREVCVUddIEFwcGx5aW5nIHNldHRpbmdzIHRvIHNpbmdsZSBlbGVtZW50ICR7XG4gICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgIH06YFxuICAgICAgKTtcblxuICAgICAgY29uc3QgaXNEaXNhYmxlZCA9IGlzU2V0dGluZ3NEaXNhYmxlZChjdXJyZW50U2V0dGluZ3MpO1xuXG4gICAgICAvLyBBcHBseSBpbW1lZGlhdGUgc2V0dGluZ3MgKHNwZWVkLCB2b2x1bWUpXG4gICAgICBtZWRpYVByb2Nlc3Nvci5hcHBseVNldHRpbmdzSW1tZWRpYXRlbHkoXG4gICAgICAgIFtlbGVtZW50XSxcbiAgICAgICAgY3VycmVudFNldHRpbmdzLFxuICAgICAgICBpc0Rpc2FibGVkXG4gICAgICApO1xuXG4gICAgICAvLyBBcHBseSBhdWRpbyBlZmZlY3RzIGlmIG5lZWRlZFxuICAgICAgaWYgKG5lZWRzUHJvY2Vzc2luZykge1xuICAgICAgICBpZiAobWVkaWFQcm9jZXNzb3IuY2FuQXBwbHlBdWRpb0VmZmVjdHMoKSkge1xuICAgICAgICAgIGF3YWl0IG1lZGlhUHJvY2Vzc29yLnByb2Nlc3NNZWRpYUVsZW1lbnRzKFxuICAgICAgICAgICAgW2VsZW1lbnRdLFxuICAgICAgICAgICAgY3VycmVudFNldHRpbmdzLFxuICAgICAgICAgICAgbmVlZHNQcm9jZXNzaW5nXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5hdHRlbXB0Q29udGV4dFJlc3VtZSgpO1xuICAgICAgICAgIGlmIChtZWRpYVByb2Nlc3Nvci5jYW5BcHBseUF1ZGlvRWZmZWN0cygpKSB7XG4gICAgICAgICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5wcm9jZXNzTWVkaWFFbGVtZW50cyhcbiAgICAgICAgICAgICAgW2VsZW1lbnRdLFxuICAgICAgICAgICAgICBjdXJyZW50U2V0dGluZ3MsXG4gICAgICAgICAgICAgIG5lZWRzUHJvY2Vzc2luZ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IERFQlVHXSBFcnJvciBhcHBseWluZyBzZXR0aW5ncyB0byBzaW5nbGUgZWxlbWVudCAke1xuICAgICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgICB9OmBcbiAgICAgICk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IG9uTG9hZGVkTWV0YWRhdGEgPSAoZXZlbnQ6IEV2ZW50KSA9PiB7XG4gICAgYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudChldmVudC50YXJnZXQgYXMgSFRNTE1lZGlhRWxlbWVudCk7XG4gIH07XG4gIGNvbnN0IG9uQ2FuUGxheSA9IChldmVudDogRXZlbnQpID0+IHtcbiAgICBhcHBseVNldHRpbmdzVG9TaW5nbGVFbGVtZW50KGV2ZW50LnRhcmdldCBhcyBIVE1MTWVkaWFFbGVtZW50KTtcbiAgfTtcbiAgY29uc3Qgb25Mb2FkU3RhcnQgPSAoZXZlbnQ6IEV2ZW50KSA9PiB7XG4gICAgYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudChldmVudC50YXJnZXQgYXMgSFRNTE1lZGlhRWxlbWVudCk7XG4gIH07XG5cbiAgY29uc3QgcmVzdW1lQ29udGV4dEhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IEV2ZW50KSA9PiB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBcIkNvbnRlbnQ6IE1lZGlhIGludGVyYWN0aW9uIGRldGVjdGVkLCBhdHRlbXB0aW5nIHRvIHJlc3VtZSBBdWRpb0NvbnRleHQuXCJcbiAgICApO1xuICAgIGF3YWl0IG1lZGlhUHJvY2Vzc29yLmF0dGVtcHRDb250ZXh0UmVzdW1lKCk7XG4gICAgY29uc3QgdGFyZ2V0RWxlbWVudCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MTWVkaWFFbGVtZW50O1xuICAgIGlmICh0YXJnZXRFbGVtZW50KSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBzZXR0aW5nc0hhbmRsZXIuZW5zdXJlSW5pdGlhbGl6ZWQoKTtcbiAgICAgICAgY29uc3QgY3VycmVudFNldHRpbmdzID0gc2V0dGluZ3NIYW5kbGVyLmdldEN1cnJlbnRTZXR0aW5ncygpO1xuICAgICAgICBjb25zdCBuZWVkc1Byb2Nlc3NpbmcgPSBzZXR0aW5nc0hhbmRsZXIubmVlZHNBdWRpb1Byb2Nlc3NpbmcoKTtcbiAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IucHJvY2Vzc01lZGlhRWxlbWVudHMoXG4gICAgICAgICAgW3RhcmdldEVsZW1lbnRdLFxuICAgICAgICAgIGN1cnJlbnRTZXR0aW5ncyxcbiAgICAgICAgICBuZWVkc1Byb2Nlc3NpbmdcbiAgICAgICAgKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgYENvbnRlbnQ6IEVycm9yIGFwcGx5aW5nIGF1ZGlvIGVmZmVjdHMgYWZ0ZXIgY29udGV4dCByZXN1bWU6YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBmdW5jdGlvbiBhdHRhY2hMaXN0ZW5lcnMoZWxlbWVudDogSFRNTE1lZGlhRWxlbWVudCkge1xuICAgIGlmICghZWxlbWVudHNXaXRoTGlzdGVuZXJzLmhhcyhlbGVtZW50KSkge1xuICAgICAgZWxlbWVudHNXaXRoTGlzdGVuZXJzLmFkZChlbGVtZW50KTtcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRlZG1ldGFkYXRhXCIsIG9uTG9hZGVkTWV0YWRhdGEpO1xuICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKFwiY2FucGxheVwiLCBvbkNhblBsYXkpO1xuICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKFwibG9hZHN0YXJ0XCIsIG9uTG9hZFN0YXJ0KTtcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcInBsYXlcIiwgcmVzdW1lQ29udGV4dEhhbmRsZXIgYXMgRXZlbnRMaXN0ZW5lcik7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBhcHBseVNldHRpbmdzVG9TaW5nbGVFbGVtZW50LFxuICAgIGF0dGFjaExpc3RlbmVycyxcbiAgICByZXN1bWVDb250ZXh0SGFuZGxlcixcbiAgfTtcbn1cbiIsImltcG9ydCB7IE1lZGlhUHJvY2Vzc29yIH0gZnJvbSBcIi4uL21lZGlhLXByb2Nlc3NvclwiO1xuaW1wb3J0IHsgU2V0dGluZ3NIYW5kbGVyIH0gZnJvbSBcIi4uL3NldHRpbmdzLWhhbmRsZXJcIjtcbmltcG9ydCB7IE1lc3NhZ2VUeXBlLCBpc1NldHRpbmdzRGlzYWJsZWQgfSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuLyoqXG4gKiBIYW5kbGVzIFVQREFURV9TRVRUSU5HUyBtZXNzYWdlcyBmcm9tIGJhY2tncm91bmQvcG9wdXAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNZXNzYWdlSGFuZGxlcihcbiAgc2V0dGluZ3NIYW5kbGVyOiBTZXR0aW5nc0hhbmRsZXIsXG4gIG1lZGlhUHJvY2Vzc29yOiBNZWRpYVByb2Nlc3NvclxuKSB7XG4gIHJldHVybiAoXG4gICAgbWVzc2FnZTogTWVzc2FnZVR5cGUsXG4gICAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyLFxuICAgIHNlbmRSZXNwb25zZTogKHJlc3BvbnNlPzogYW55KSA9PiB2b2lkXG4gICkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgXCJbQ29udGVudFNjcmlwdCBMaXN0ZW5lcl0gUmVjZWl2ZWQgbWVzc2FnZTpcIixcbiAgICAgIEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpXG4gICAgKTtcbiAgICBpZiAobWVzc2FnZS50eXBlID09PSBcIlVQREFURV9TRVRUSU5HU1wiKSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgXCJbQ29udGVudFNjcmlwdCBMaXN0ZW5lcl0gUHJvY2Vzc2luZyBVUERBVEVfU0VUVElOR1MgZnJvbSBiYWNrZ3JvdW5kL3BvcHVwXCJcbiAgICAgICk7XG4gICAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHNldHRpbmdzSGFuZGxlci5lbnN1cmVJbml0aWFsaXplZCgpO1xuICAgICAgICAgIHNldHRpbmdzSGFuZGxlci51cGRhdGVTZXR0aW5ncyhtZXNzYWdlLnNldHRpbmdzKTtcblxuICAgICAgICAgIGNvbnN0IG5ld1NldHRpbmdzID0gc2V0dGluZ3NIYW5kbGVyLmdldEN1cnJlbnRTZXR0aW5ncygpO1xuICAgICAgICAgIGNvbnN0IG5lZWRzUHJvY2Vzc2luZ05vdyA9IHNldHRpbmdzSGFuZGxlci5uZWVkc0F1ZGlvUHJvY2Vzc2luZygpO1xuXG4gICAgICAgICAgY29uc3QgbWFuYWdlZE1lZGlhRWxlbWVudHMgPVxuICAgICAgICAgICAgbWVkaWFQcm9jZXNzb3IuZ2V0TWFuYWdlZE1lZGlhRWxlbWVudHMoKTtcbiAgICAgICAgICBjb25zdCBpc0Rpc2FibGVkID0gaXNTZXR0aW5nc0Rpc2FibGVkKG5ld1NldHRpbmdzKTtcblxuICAgICAgICAgIGlmIChtYW5hZ2VkTWVkaWFFbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBtZWRpYVByb2Nlc3Nvci5hcHBseVNldHRpbmdzSW1tZWRpYXRlbHkoXG4gICAgICAgICAgICAgIG1hbmFnZWRNZWRpYUVsZW1lbnRzLFxuICAgICAgICAgICAgICBuZXdTZXR0aW5ncyxcbiAgICAgICAgICAgICAgaXNEaXNhYmxlZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAobmVlZHNQcm9jZXNzaW5nTm93KSB7XG4gICAgICAgICAgICBpZiAobWVkaWFQcm9jZXNzb3IuY2FuQXBwbHlBdWRpb0VmZmVjdHMoKSkge1xuICAgICAgICAgICAgICBpZiAobWFuYWdlZE1lZGlhRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIGF3YWl0IG1lZGlhUHJvY2Vzc29yLnByb2Nlc3NNZWRpYUVsZW1lbnRzKFxuICAgICAgICAgICAgICAgICAgbWFuYWdlZE1lZGlhRWxlbWVudHMsXG4gICAgICAgICAgICAgICAgICBuZXdTZXR0aW5ncyxcbiAgICAgICAgICAgICAgICAgIG5lZWRzUHJvY2Vzc2luZ05vd1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZnJlc2hTY2FuRWxlbWVudHMgPSBtZWRpYVByb2Nlc3Nvci5maW5kTWVkaWFFbGVtZW50cygpO1xuICAgICAgICAgICAgICAgIGlmIChmcmVzaFNjYW5FbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICBtZWRpYVByb2Nlc3Nvci5hcHBseVNldHRpbmdzSW1tZWRpYXRlbHkoXG4gICAgICAgICAgICAgICAgICAgIGZyZXNoU2NhbkVsZW1lbnRzLFxuICAgICAgICAgICAgICAgICAgICBuZXdTZXR0aW5ncyxcbiAgICAgICAgICAgICAgICAgICAgaXNEaXNhYmxlZFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIGlmICghaXNEaXNhYmxlZCAmJiBuZWVkc1Byb2Nlc3NpbmdOb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IucHJvY2Vzc01lZGlhRWxlbWVudHMoXG4gICAgICAgICAgICAgICAgICAgICAgZnJlc2hTY2FuRWxlbWVudHMsXG4gICAgICAgICAgICAgICAgICAgICAgbmV3U2V0dGluZ3MsXG4gICAgICAgICAgICAgICAgICAgICAgbmVlZHNQcm9jZXNzaW5nTm93XG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChtYW5hZ2VkTWVkaWFFbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIGF3YWl0IG1lZGlhUHJvY2Vzc29yLnByb2Nlc3NNZWRpYUVsZW1lbnRzKFxuICAgICAgICAgICAgICAgIG1hbmFnZWRNZWRpYUVsZW1lbnRzLFxuICAgICAgICAgICAgICAgIG5ld1NldHRpbmdzLFxuICAgICAgICAgICAgICAgIG5lZWRzUHJvY2Vzc2luZ05vd1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc3QgZnJlc2hTY2FuRWxlbWVudHMgPSBtZWRpYVByb2Nlc3Nvci5maW5kTWVkaWFFbGVtZW50cygpO1xuICAgICAgICAgICAgICBpZiAoZnJlc2hTY2FuRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIGF3YWl0IG1lZGlhUHJvY2Vzc29yLnByb2Nlc3NNZWRpYUVsZW1lbnRzKFxuICAgICAgICAgICAgICAgICAgZnJlc2hTY2FuRWxlbWVudHMsXG4gICAgICAgICAgICAgICAgICBuZXdTZXR0aW5ncyxcbiAgICAgICAgICAgICAgICAgIG5lZWRzUHJvY2Vzc2luZ05vd1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgIFwiQ29udGVudDogRXJyb3IgZHVyaW5nIFVQREFURV9TRVRUSU5HUyBwcm9jZXNzaW5nOlwiLFxuICAgICAgICAgICAgZXJyb3JcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH07XG59XG4iLCJpbXBvcnQgeyBNZWRpYVByb2Nlc3NvciB9IGZyb20gXCIuLi9tZWRpYS1wcm9jZXNzb3JcIjtcbmltcG9ydCB7IFNldHRpbmdzSGFuZGxlciB9IGZyb20gXCIuLi9zZXR0aW5ncy1oYW5kbGVyXCI7XG5pbXBvcnQgeyBpc1NldHRpbmdzRGlzYWJsZWQgfSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuLyoqXG4gKiBTZXRzIHVwIERPTSBsaWZlY3ljbGUgb2JzZXJ2ZXJzIGFuZCBpbml0aWFsIHNldHRpbmdzIGFwcGxpY2F0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBEb21MaWZlY3ljbGUoXG4gIHNldHRpbmdzSGFuZGxlcjogU2V0dGluZ3NIYW5kbGVyLFxuICBtZWRpYVByb2Nlc3NvcjogTWVkaWFQcm9jZXNzb3IsXG4gIHByb2Nlc3NNZWRpYTogKCkgPT4gUHJvbWlzZTxib29sZWFuPlxuKTogKCgpID0+IHZvaWQpW10ge1xuICBjb25zdCBjbGVhbnVwRnVuY3Rpb25zOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG4gIC8vIEFwcGx5IHNldHRpbmdzIGltbWVkaWF0ZWx5IGFmdGVyIERPTUNvbnRlbnRMb2FkZWQgb3IgaWYgRE9NIGlzIGFscmVhZHkgcmVhZHlcbiAgY29uc3QgYXBwbHlJbml0aWFsU2V0dGluZ3MgPSBhc3luYyAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBgW0NvbnRlbnRTY3JpcHQgREVCVUddIEFwcGx5aW5nIGluaXRpYWwgc2V0dGluZ3MgZm9yICR7d2luZG93LmxvY2F0aW9uLmhvc3RuYW1lfWBcbiAgICApO1xuICAgIGF3YWl0IHByb2Nlc3NNZWRpYSgpO1xuICB9O1xuXG4gIGNvbnN0IGRvbUNvbnRlbnRMb2FkZWRMaXN0ZW5lciA9ICgpID0+IHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gRE9NQ29udGVudExvYWRlZCBldmVudCBmb3IgJHt3aW5kb3cubG9jYXRpb24uaG9zdG5hbWV9YFxuICAgICk7XG4gICAgYXBwbHlJbml0aWFsU2V0dGluZ3MoKTtcbiAgfTtcblxuICBpZiAoZG9jdW1lbnQucmVhZHlTdGF0ZSA9PT0gXCJsb2FkaW5nXCIpIHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiRE9NQ29udGVudExvYWRlZFwiLCBkb21Db250ZW50TG9hZGVkTGlzdGVuZXIpO1xuICAgIGNsZWFudXBGdW5jdGlvbnMucHVzaCgoKSA9PlxuICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIkRPTUNvbnRlbnRMb2FkZWRcIiwgZG9tQ29udGVudExvYWRlZExpc3RlbmVyKVxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgYXBwbHlJbml0aWFsU2V0dGluZ3MoKTtcbiAgfVxuXG4gIC8vIFdhdGNoIGZvciBkeW5hbWljIGNoYW5nZXNcbiAgY29uc3QgbWVkaWFPYnNlcnZlciA9IE1lZGlhUHJvY2Vzc29yLnNldHVwTWVkaWFPYnNlcnZlcihcbiAgICBhc3luYyAoYWRkZWRFbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0XSBQcm9jZXNzaW5nICR7YWRkZWRFbGVtZW50cy5sZW5ndGh9IG5ld2x5IGFkZGVkIG1lZGlhIGVsZW1lbnRzLmBcbiAgICAgICk7XG4gICAgICBhd2FpdCBzZXR0aW5nc0hhbmRsZXIuZW5zdXJlSW5pdGlhbGl6ZWQoKTtcbiAgICAgIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzSGFuZGxlci5nZXRDdXJyZW50U2V0dGluZ3MoKTtcbiAgICAgIGNvbnN0IG5lZWRzUHJvY2Vzc2luZyA9IHNldHRpbmdzSGFuZGxlci5uZWVkc0F1ZGlvUHJvY2Vzc2luZygpO1xuXG4gICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5wcm9jZXNzTWVkaWFFbGVtZW50cyhcbiAgICAgICAgYWRkZWRFbGVtZW50cyxcbiAgICAgICAgY3VycmVudFNldHRpbmdzLFxuICAgICAgICBuZWVkc1Byb2Nlc3NpbmdcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IGlzRGlzYWJsZWQgPSBpc1NldHRpbmdzRGlzYWJsZWQoY3VycmVudFNldHRpbmdzKTtcbiAgICAgIG1lZGlhUHJvY2Vzc29yLmFwcGx5U2V0dGluZ3NJbW1lZGlhdGVseShcbiAgICAgICAgYWRkZWRFbGVtZW50cyxcbiAgICAgICAgY3VycmVudFNldHRpbmdzLFxuICAgICAgICBpc0Rpc2FibGVkXG4gICAgICApO1xuICAgIH0sXG4gICAgKHJlbW92ZWRFbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0XSBDbGVhbmluZyB1cCAke3JlbW92ZWRFbGVtZW50cy5sZW5ndGh9IHJlbW92ZWQgbWVkaWEgZWxlbWVudHMuYFxuICAgICAgKTtcbiAgICAgIHJlbW92ZWRFbGVtZW50cy5mb3JFYWNoKChlbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50KSA9PiB7XG4gICAgICAgIG1lZGlhUHJvY2Vzc29yLmF1ZGlvUHJvY2Vzc29yLmRpc2Nvbm5lY3RFbGVtZW50Tm9kZXMoZWxlbWVudCk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVtYWluaW5nTWFuYWdlZEVsZW1lbnRzID0gbWVkaWFQcm9jZXNzb3IuZ2V0TWFuYWdlZE1lZGlhRWxlbWVudHMoKTtcbiAgICAgIGlmIChcbiAgICAgICAgcmVtYWluaW5nTWFuYWdlZEVsZW1lbnRzLmxlbmd0aCA9PT0gMCAmJlxuICAgICAgICAhc2V0dGluZ3NIYW5kbGVyLm5lZWRzQXVkaW9Qcm9jZXNzaW5nKClcbiAgICAgICkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBcIltDb250ZW50U2NyaXB0XSBObyBtYW5hZ2VkIG1lZGlhIGVsZW1lbnRzIGxlZnQuIENsZWFuaW5nIHVwIEF1ZGlvUHJvY2Vzc29yLlwiXG4gICAgICAgICk7XG4gICAgICAgIG1lZGlhUHJvY2Vzc29yLmF1ZGlvUHJvY2Vzc29yLmNsZWFudXAoKTtcbiAgICAgIH1cbiAgICB9XG4gICk7XG4gIGNsZWFudXBGdW5jdGlvbnMucHVzaCgoKSA9PiBtZWRpYU9ic2VydmVyLmRpc2Nvbm5lY3QoKSk7XG5cbiAgLy8gRW5zdXJlIEF1ZGlvQ29udGV4dCBpcyBjbG9zZWQgd2hlbiB0aGUgcGFnZSBpcyB1bmxvYWRlZFxuICBjb25zdCBiZWZvcmVVbmxvYWRMaXN0ZW5lciA9ICgpID0+IHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIFwiW0NvbnRlbnRTY3JpcHRdIFBhZ2UgaXMgdW5sb2FkaW5nLiBQZXJmb3JtaW5nIGZpbmFsIEF1ZGlvUHJvY2Vzc29yIGNsZWFudXAuXCJcbiAgICApO1xuICAgIG1lZGlhUHJvY2Vzc29yLmF1ZGlvUHJvY2Vzc29yLmNsZWFudXAoKTtcbiAgfTtcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJiZWZvcmV1bmxvYWRcIiwgYmVmb3JlVW5sb2FkTGlzdGVuZXIpO1xuICBjbGVhbnVwRnVuY3Rpb25zLnB1c2goKCkgPT5cbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImJlZm9yZXVubG9hZFwiLCBiZWZvcmVVbmxvYWRMaXN0ZW5lcilcbiAgKTtcblxuICByZXR1cm4gY2xlYW51cEZ1bmN0aW9ucztcbn1cbiIsImltcG9ydCB7IE1lZGlhUHJvY2Vzc29yIH0gZnJvbSBcIi4vbWVkaWEtcHJvY2Vzc29yXCI7XG5pbXBvcnQgeyBTZXR0aW5nc0hhbmRsZXIgfSBmcm9tIFwiLi9zZXR0aW5ncy1oYW5kbGVyXCI7XG5pbXBvcnQgeyBNZXNzYWdlVHlwZSwgaXNTZXR0aW5nc0Rpc2FibGVkIH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGNyZWF0ZU1lZGlhRXZlbnRIYW5kbGVycyB9IGZyb20gXCIuL2NvbnRlbnQtc2NyaXB0L21lZGlhLWV2ZW50c1wiO1xuaW1wb3J0IHsgY3JlYXRlTWVzc2FnZUhhbmRsZXIgfSBmcm9tIFwiLi9jb250ZW50LXNjcmlwdC9tZXNzYWdlLWhhbmRsZXJcIjtcbmltcG9ydCB7IHNldHVwRG9tTGlmZWN5Y2xlIH0gZnJvbSBcIi4vY29udGVudC1zY3JpcHQvZG9tLWxpZmVjeWNsZVwiO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaW5pdGlhbGl6ZUNvbnRlbnRTY3JpcHQoXG4gIHNldHRpbmdzSGFuZGxlcjogU2V0dGluZ3NIYW5kbGVyLFxuICBtZWRpYVByb2Nlc3NvcjogTWVkaWFQcm9jZXNzb3IsXG4gIGhvc3RuYW1lOiBzdHJpbmdcbik6IFByb21pc2U8KCkgPT4gdm9pZD4ge1xuICBjb25zb2xlLmxvZyhgW0NvbnRlbnRTY3JpcHRdIEluaXRpYWxpemluZyBzY3JpcHQgZm9yIGhvc3RuYW1lOiAke2hvc3RuYW1lfWApO1xuICBzZXR0aW5nc0hhbmRsZXIuaW5pdGlhbGl6ZShob3N0bmFtZSk7XG5cbiAgY29uc3QgY2xlYW51cEZ1bmN0aW9uczogKCgpID0+IHZvaWQpW10gPSBbXTtcblxuICAvLyBDcmVhdGUgc3RhYmxlIGV2ZW50IGhhbmRsZXJzXG4gIGNvbnN0IHsgYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudCwgYXR0YWNoTGlzdGVuZXJzIH0gPVxuICAgIGNyZWF0ZU1lZGlhRXZlbnRIYW5kbGVycyhzZXR0aW5nc0hhbmRsZXIsIG1lZGlhUHJvY2Vzc29yKTtcblxuICAvLyBQcm9jZXNzIG1lZGlhIHdpdGggY3VycmVudCBzZXR0aW5nc1xuICBjb25zdCBwcm9jZXNzTWVkaWEgPSBhc3luYyAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBgW0NvbnRlbnRTY3JpcHQgREVCVUddIHByb2Nlc3NNZWRpYSBjYWxsZWQgZm9yICR7d2luZG93LmxvY2F0aW9uLmhvc3RuYW1lfWBcbiAgICApO1xuICAgIHRyeSB7XG4gICAgICBjb25zb2xlLnRpbWUoXCJlbnN1cmVJbml0aWFsaXplZFwiKTtcbiAgICAgIGF3YWl0IHNldHRpbmdzSGFuZGxlci5lbnN1cmVJbml0aWFsaXplZCgpO1xuICAgICAgY29uc29sZS50aW1lRW5kKFwiZW5zdXJlSW5pdGlhbGl6ZWRcIik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUudGltZUVuZChcImVuc3VyZUluaXRpYWxpemVkXCIpO1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IERFQlVHXSBFcnJvciBlbnN1cmluZyBzZXR0aW5ncyBpbml0aWFsaXplZDpgXG4gICAgICApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBjdXJyZW50U2V0dGluZ3MgPSBzZXR0aW5nc0hhbmRsZXIuZ2V0Q3VycmVudFNldHRpbmdzKCk7XG4gICAgICBjb25zdCBpc0Rpc2FibGVkID0gaXNTZXR0aW5nc0Rpc2FibGVkKGN1cnJlbnRTZXR0aW5ncyk7XG5cbiAgICAgIGNvbnN0IG1lZGlhRWxlbWVudHMgPSBtZWRpYVByb2Nlc3Nvci5maW5kTWVkaWFFbGVtZW50cygpO1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gRm91bmQgJHttZWRpYUVsZW1lbnRzLmxlbmd0aH0gbWVkaWEgZWxlbWVudHNgXG4gICAgICApO1xuXG4gICAgICBtZWRpYUVsZW1lbnRzLmZvckVhY2goKGVsZW1lbnQpID0+IHtcbiAgICAgICAgYXR0YWNoTGlzdGVuZXJzKGVsZW1lbnQpO1xuICAgICAgICBpZiAoIWlzRGlzYWJsZWQpIHtcbiAgICAgICAgICBhcHBseVNldHRpbmdzVG9TaW5nbGVFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChwcm9jZXNzaW5nRXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gRXJyb3IgZHVyaW5nIG1lZGlhIHByb2Nlc3Npbmcgc3RlcHM6YFxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgLy8gU2V0IHVwIG1lc3NhZ2UgbGlzdGVuZXJcbiAgaWYgKFxuICAgIHR5cGVvZiBjaHJvbWUgIT09IFwidW5kZWZpbmVkXCIgJiZcbiAgICBjaHJvbWUucnVudGltZSAmJlxuICAgIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZVxuICApIHtcbiAgICBjb25zdCBtZXNzYWdlSGFuZGxlciA9IGNyZWF0ZU1lc3NhZ2VIYW5kbGVyKHNldHRpbmdzSGFuZGxlciwgbWVkaWFQcm9jZXNzb3IpO1xuICAgIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihtZXNzYWdlSGFuZGxlcik7XG4gICAgY2xlYW51cEZ1bmN0aW9ucy5wdXNoKCgpID0+XG4gICAgICBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2UucmVtb3ZlTGlzdGVuZXIobWVzc2FnZUhhbmRsZXIpXG4gICAgKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmRlYnVnKFxuICAgICAgXCJbQ29udGVudFNjcmlwdF0gY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlIG5vdCBhdmFpbGFibGUgLSBza2lwcGluZyBtZXNzYWdlIGxpc3RlbmVyIHNldHVwXCJcbiAgICApO1xuICB9XG5cbiAgLy8gU2V0IHVwIERPTSBsaWZlY3ljbGUgKGluaXRpYWwgc2V0dGluZ3MsIG11dGF0aW9uIG9ic2VydmVyLCBiZWZvcmV1bmxvYWQpXG4gIGNvbnN0IGRvbUNsZWFudXAgPSBzZXR1cERvbUxpZmVjeWNsZShcbiAgICBzZXR0aW5nc0hhbmRsZXIsXG4gICAgbWVkaWFQcm9jZXNzb3IsXG4gICAgcHJvY2Vzc01lZGlhXG4gICk7XG4gIGNsZWFudXBGdW5jdGlvbnMucHVzaCguLi5kb21DbGVhbnVwKTtcblxuICByZXR1cm4gKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFwiW0NvbnRlbnRTY3JpcHRdIFJ1bm5pbmcgY2xlYW51cCBmdW5jdGlvbnMuXCIpO1xuICAgIGNsZWFudXBGdW5jdGlvbnMuZm9yRWFjaCgoY2xlYW51cCkgPT4gY2xlYW51cCgpKTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IGRlZmluZUNvbnRlbnRTY3JpcHQgfSBmcm9tIFwid3h0L3NhbmRib3hcIjtcbmltcG9ydCB7IE1lZGlhUHJvY2Vzc29yIH0gZnJvbSBcIi4vLi4vc3JjL21lZGlhLXByb2Nlc3NvclwiO1xuaW1wb3J0IHsgU2V0dGluZ3NIYW5kbGVyIH0gZnJvbSBcIi4uL3NyYy9zZXR0aW5ncy1oYW5kbGVyXCI7XG5pbXBvcnQgeyBzZXR1cEhvc3RuYW1lRGV0ZWN0aW9uIH0gZnJvbSBcIi4uL3NyYy9pZnJhbWUtaG9zdG5hbWUtaGFuZGxlclwiO1xuaW1wb3J0IHsgaW5pdGlhbGl6ZUNvbnRlbnRTY3JpcHQgfSBmcm9tIFwiLi4vc3JjL2NvbnRlbnQtc2NyaXB0LWluaXRcIjtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29udGVudFNjcmlwdCh7XG4gIG1hdGNoZXM6IFtcImh0dHA6Ly8qLypcIiwgXCJodHRwczovLyovKlwiLCBcImZpbGU6Ly8qLypcIl0sXG4gIGFsbEZyYW1lczogdHJ1ZSxcbiAgcnVuQXQ6IFwiZG9jdW1lbnRfaWRsZVwiLFxuICBtYWluOiBhc3luYyAoKSA9PiB7XG4gICAgLy8gR2xvYmFsIHNhZmV0eSBjaGVjayBmb3IgQ2hyb21lIGV4dGVuc2lvbiBBUElzXG4gICAgaWYgKHR5cGVvZiBjaHJvbWUgPT09ICd1bmRlZmluZWQnIHx8IFxuICAgICAgICB0eXBlb2YgY2hyb21lLnJ1bnRpbWUgPT09ICd1bmRlZmluZWQnIHx8IFxuICAgICAgICB0eXBlb2YgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc29sZS5lcnJvcignQ2hyb21lIGV4dGVuc2lvbiBBUElzIGFyZSBub3QgYXZhaWxhYmxlLiBTa2lwcGluZyBjb250ZW50IHNjcmlwdCBleGVjdXRpb24uJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBcIkNvbnRlbnQ6IFNjcmlwdCBzdGFydGluZyAtIFRoaXMgbG9nIHNob3VsZCBhbHdheXMgYXBwZWFyXCIsXG4gICAgICB3aW5kb3cubG9jYXRpb24uaHJlZlxuICAgICk7XG4gICAgXG4gICAgLy8gU2tpcCBwcm9jZXNzaW5nIGZvciBmaWxlIFVSTHNcbiAgICBpZiAod2luZG93LmxvY2F0aW9uLnByb3RvY29sID09PSAnZmlsZTonKSB7XG4gICAgICBjb25zb2xlLmxvZygnU2tpcHBpbmcgY29udGVudCBzY3JpcHQgZm9yIGZpbGUgVVJMJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSW5pdGlhbGl6ZSBjb3JlIGNvbXBvbmVudHNcbiAgICBjb25zdCBzZXR0aW5nc0hhbmRsZXIgPSBuZXcgU2V0dGluZ3NIYW5kbGVyKCk7XG4gICAgY29uc3QgbWVkaWFQcm9jZXNzb3IgPSBuZXcgTWVkaWFQcm9jZXNzb3IoKTtcblxuICAgIGxldCBob3N0bmFtZURldGVjdGlvbkNsZWFudXA6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICAgIGxldCBjb250ZW50U2NyaXB0Q2xlYW51cDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgICAvLyBTdGFydCB0aGUgaG9zdG5hbWUgZGV0ZWN0aW9uIGFuZCBzY3JpcHQgaW5pdGlhbGl6YXRpb24gcHJvY2Vzc1xuICAgIGhvc3RuYW1lRGV0ZWN0aW9uQ2xlYW51cCA9IHNldHVwSG9zdG5hbWVEZXRlY3Rpb24oYXN5bmMgKGhvc3RuYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgIGNvbnRlbnRTY3JpcHRDbGVhbnVwID0gYXdhaXQgaW5pdGlhbGl6ZUNvbnRlbnRTY3JpcHQoc2V0dGluZ3NIYW5kbGVyLCBtZWRpYVByb2Nlc3NvciwgaG9zdG5hbWUpO1xuICAgIH0pO1xuXG4gICAgLy8gQWRkIGEgbGlzdGVuZXIgZm9yIHBhZ2UgdW5sb2FkIHRvIHBlcmZvcm0gY2xlYW51cFxuICAgIGNvbnN0IGJlZm9yZVVubG9hZExpc3RlbmVyID0gKCkgPT4ge1xuICAgICAgY29uc29sZS5sb2coXCJbQ29udGVudFNjcmlwdF0gUGFnZSBpcyB1bmxvYWRpbmcuIFBlcmZvcm1pbmcgb3ZlcmFsbCBjbGVhbnVwLlwiKTtcbiAgICAgIGlmIChob3N0bmFtZURldGVjdGlvbkNsZWFudXApIHtcbiAgICAgICAgaG9zdG5hbWVEZXRlY3Rpb25DbGVhbnVwKCk7XG4gICAgICAgIGhvc3RuYW1lRGV0ZWN0aW9uQ2xlYW51cCA9IG51bGw7XG4gICAgICB9XG4gICAgICBpZiAoY29udGVudFNjcmlwdENsZWFudXApIHtcbiAgICAgICAgY29udGVudFNjcmlwdENsZWFudXAoKTtcbiAgICAgICAgY29udGVudFNjcmlwdENsZWFudXAgPSBudWxsO1xuICAgICAgfVxuICAgIH07XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JlZm9yZXVubG9hZCcsIGJlZm9yZVVubG9hZExpc3RlbmVyKTtcbiAgfSxcbn0pO1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwsIGZhY3RvcnkpIHtcbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kKSB7XG4gICAgZGVmaW5lKFwid2ViZXh0ZW5zaW9uLXBvbHlmaWxsXCIsIFtcIm1vZHVsZVwiXSwgZmFjdG9yeSk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICBmYWN0b3J5KG1vZHVsZSk7XG4gIH0gZWxzZSB7XG4gICAgdmFyIG1vZCA9IHtcbiAgICAgIGV4cG9ydHM6IHt9XG4gICAgfTtcbiAgICBmYWN0b3J5KG1vZCk7XG4gICAgZ2xvYmFsLmJyb3dzZXIgPSBtb2QuZXhwb3J0cztcbiAgfVxufSkodHlwZW9mIGdsb2JhbFRoaXMgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxUaGlzIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdGhpcywgZnVuY3Rpb24gKG1vZHVsZSkge1xuICAvKiB3ZWJleHRlbnNpb24tcG9seWZpbGwgLSB2MC4xMi4wIC0gVHVlIE1heSAxNCAyMDI0IDE4OjAxOjI5ICovXG4gIC8qIC0qLSBNb2RlOiBpbmRlbnQtdGFicy1tb2RlOiBuaWw7IGpzLWluZGVudC1sZXZlbDogMiAtKi0gKi9cbiAgLyogdmltOiBzZXQgc3RzPTIgc3c9MiBldCB0dz04MDogKi9cbiAgLyogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICAgKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gICAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uICovXG4gIFwidXNlIHN0cmljdFwiO1xuXG4gIGlmICghKGdsb2JhbFRoaXMuY2hyb21lICYmIGdsb2JhbFRoaXMuY2hyb21lLnJ1bnRpbWUgJiYgZ2xvYmFsVGhpcy5jaHJvbWUucnVudGltZS5pZCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGlzIHNjcmlwdCBzaG91bGQgb25seSBiZSBsb2FkZWQgaW4gYSBicm93c2VyIGV4dGVuc2lvbi5cIik7XG4gIH1cbiAgaWYgKCEoZ2xvYmFsVGhpcy5icm93c2VyICYmIGdsb2JhbFRoaXMuYnJvd3Nlci5ydW50aW1lICYmIGdsb2JhbFRoaXMuYnJvd3Nlci5ydW50aW1lLmlkKSkge1xuICAgIGNvbnN0IENIUk9NRV9TRU5EX01FU1NBR0VfQ0FMTEJBQ0tfTk9fUkVTUE9OU0VfTUVTU0FHRSA9IFwiVGhlIG1lc3NhZ2UgcG9ydCBjbG9zZWQgYmVmb3JlIGEgcmVzcG9uc2Ugd2FzIHJlY2VpdmVkLlwiO1xuXG4gICAgLy8gV3JhcHBpbmcgdGhlIGJ1bGsgb2YgdGhpcyBwb2x5ZmlsbCBpbiBhIG9uZS10aW1lLXVzZSBmdW5jdGlvbiBpcyBhIG1pbm9yXG4gICAgLy8gb3B0aW1pemF0aW9uIGZvciBGaXJlZm94LiBTaW5jZSBTcGlkZXJtb25rZXkgZG9lcyBub3QgZnVsbHkgcGFyc2UgdGhlXG4gICAgLy8gY29udGVudHMgb2YgYSBmdW5jdGlvbiB1bnRpbCB0aGUgZmlyc3QgdGltZSBpdCdzIGNhbGxlZCwgYW5kIHNpbmNlIGl0IHdpbGxcbiAgICAvLyBuZXZlciBhY3R1YWxseSBuZWVkIHRvIGJlIGNhbGxlZCwgdGhpcyBhbGxvd3MgdGhlIHBvbHlmaWxsIHRvIGJlIGluY2x1ZGVkXG4gICAgLy8gaW4gRmlyZWZveCBuZWFybHkgZm9yIGZyZWUuXG4gICAgY29uc3Qgd3JhcEFQSXMgPSBleHRlbnNpb25BUElzID0+IHtcbiAgICAgIC8vIE5PVEU6IGFwaU1ldGFkYXRhIGlzIGFzc29jaWF0ZWQgdG8gdGhlIGNvbnRlbnQgb2YgdGhlIGFwaS1tZXRhZGF0YS5qc29uIGZpbGVcbiAgICAgIC8vIGF0IGJ1aWxkIHRpbWUgYnkgcmVwbGFjaW5nIHRoZSBmb2xsb3dpbmcgXCJpbmNsdWRlXCIgd2l0aCB0aGUgY29udGVudCBvZiB0aGVcbiAgICAgIC8vIEpTT04gZmlsZS5cbiAgICAgIGNvbnN0IGFwaU1ldGFkYXRhID0ge1xuICAgICAgICBcImFsYXJtc1wiOiB7XG4gICAgICAgICAgXCJjbGVhclwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImNsZWFyQWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYm9va21hcmtzXCI6IHtcbiAgICAgICAgICBcImNyZWF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldENoaWxkcmVuXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0UmVjZW50XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0U3ViVHJlZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFRyZWVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlVHJlZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlYXJjaFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVwZGF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImJyb3dzZXJBY3Rpb25cIjoge1xuICAgICAgICAgIFwiZGlzYWJsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImVuYWJsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEJhZGdlQmFja2dyb3VuZENvbG9yXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QmFkZ2VUZXh0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0UG9wdXBcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRUaXRsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm9wZW5Qb3B1cFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldEJhZGdlQmFja2dyb3VuZENvbG9yXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0QmFkZ2VUZXh0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0SWNvblwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFBvcHVwXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0VGl0bGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJicm93c2luZ0RhdGFcIjoge1xuICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlQ2FjaGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVDb29raWVzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlRG93bmxvYWRzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlRm9ybURhdGFcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVIaXN0b3J5XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlTG9jYWxTdG9yYWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlUGFzc3dvcmRzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlUGx1Z2luRGF0YVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldHRpbmdzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY29tbWFuZHNcIjoge1xuICAgICAgICAgIFwiZ2V0QWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY29udGV4dE1lbnVzXCI6IHtcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVwZGF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNvb2tpZXNcIjoge1xuICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWxsQ29va2llU3RvcmVzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGV2dG9vbHNcIjoge1xuICAgICAgICAgIFwiaW5zcGVjdGVkV2luZG93XCI6IHtcbiAgICAgICAgICAgIFwiZXZhbFwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMixcbiAgICAgICAgICAgICAgXCJzaW5nbGVDYWxsYmFja0FyZ1wiOiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJwYW5lbHNcIjoge1xuICAgICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMyxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDMsXG4gICAgICAgICAgICAgIFwic2luZ2xlQ2FsbGJhY2tBcmdcIjogdHJ1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZWxlbWVudHNcIjoge1xuICAgICAgICAgICAgICBcImNyZWF0ZVNpZGViYXJQYW5lXCI6IHtcbiAgICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImRvd25sb2Fkc1wiOiB7XG4gICAgICAgICAgXCJjYW5jZWxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkb3dubG9hZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImVyYXNlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0RmlsZUljb25cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJvcGVuXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicGF1c2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVGaWxlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVzdW1lXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2VhcmNoXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2hvd1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVuc2lvblwiOiB7XG4gICAgICAgICAgXCJpc0FsbG93ZWRGaWxlU2NoZW1lQWNjZXNzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaXNBbGxvd2VkSW5jb2duaXRvQWNjZXNzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiaGlzdG9yeVwiOiB7XG4gICAgICAgICAgXCJhZGRVcmxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZWxldGVBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZWxldGVSYW5nZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRlbGV0ZVVybFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFZpc2l0c1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlYXJjaFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImkxOG5cIjoge1xuICAgICAgICAgIFwiZGV0ZWN0TGFuZ3VhZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBY2NlcHRMYW5ndWFnZXNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJpZGVudGl0eVwiOiB7XG4gICAgICAgICAgXCJsYXVuY2hXZWJBdXRoRmxvd1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImlkbGVcIjoge1xuICAgICAgICAgIFwicXVlcnlTdGF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcIm1hbmFnZW1lbnRcIjoge1xuICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0U2VsZlwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldEVuYWJsZWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1bmluc3RhbGxTZWxmXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwibm90aWZpY2F0aW9uc1wiOiB7XG4gICAgICAgICAgXCJjbGVhclwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImNyZWF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFBlcm1pc3Npb25MZXZlbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVwZGF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInBhZ2VBY3Rpb25cIjoge1xuICAgICAgICAgIFwiZ2V0UG9wdXBcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRUaXRsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRJY29uXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0UG9wdXBcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRUaXRsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNob3dcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJwZXJtaXNzaW9uc1wiOiB7XG4gICAgICAgICAgXCJjb250YWluc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlcXVlc3RcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJydW50aW1lXCI6IHtcbiAgICAgICAgICBcImdldEJhY2tncm91bmRQYWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0UGxhdGZvcm1JbmZvXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwib3Blbk9wdGlvbnNQYWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVxdWVzdFVwZGF0ZUNoZWNrXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2VuZE1lc3NhZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogM1xuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZW5kTmF0aXZlTWVzc2FnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFVuaW5zdGFsbFVSTFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInNlc3Npb25zXCI6IHtcbiAgICAgICAgICBcImdldERldmljZXNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRSZWNlbnRseUNsb3NlZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlc3RvcmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzdG9yYWdlXCI6IHtcbiAgICAgICAgICBcImxvY2FsXCI6IHtcbiAgICAgICAgICAgIFwiY2xlYXJcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZ2V0Qnl0ZXNJblVzZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJzZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWFuYWdlZFwiOiB7XG4gICAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZ2V0Qnl0ZXNJblVzZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzeW5jXCI6IHtcbiAgICAgICAgICAgIFwiY2xlYXJcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZ2V0Qnl0ZXNJblVzZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJzZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwidGFic1wiOiB7XG4gICAgICAgICAgXCJjYXB0dXJlVmlzaWJsZVRhYlwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImNyZWF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRldGVjdExhbmd1YWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZGlzY2FyZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImR1cGxpY2F0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImV4ZWN1dGVTY3JpcHRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRDdXJyZW50XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0Wm9vbVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFpvb21TZXR0aW5nc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdvQmFja1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdvRm9yd2FyZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hsaWdodFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImluc2VydENTU1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJxdWVyeVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbG9hZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUNTU1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlbmRNZXNzYWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDNcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0Wm9vbVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFpvb21TZXR0aW5nc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVwZGF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInRvcFNpdGVzXCI6IHtcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcIndlYk5hdmlnYXRpb25cIjoge1xuICAgICAgICAgIFwiZ2V0QWxsRnJhbWVzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0RnJhbWVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJ3ZWJSZXF1ZXN0XCI6IHtcbiAgICAgICAgICBcImhhbmRsZXJCZWhhdmlvckNoYW5nZWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJ3aW5kb3dzXCI6IHtcbiAgICAgICAgICBcImNyZWF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEN1cnJlbnRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRMYXN0Rm9jdXNlZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVwZGF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgaWYgKE9iamVjdC5rZXlzKGFwaU1ldGFkYXRhKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYXBpLW1ldGFkYXRhLmpzb24gaGFzIG5vdCBiZWVuIGluY2x1ZGVkIGluIGJyb3dzZXItcG9seWZpbGxcIik7XG4gICAgICB9XG5cbiAgICAgIC8qKlxuICAgICAgICogQSBXZWFrTWFwIHN1YmNsYXNzIHdoaWNoIGNyZWF0ZXMgYW5kIHN0b3JlcyBhIHZhbHVlIGZvciBhbnkga2V5IHdoaWNoIGRvZXNcbiAgICAgICAqIG5vdCBleGlzdCB3aGVuIGFjY2Vzc2VkLCBidXQgYmVoYXZlcyBleGFjdGx5IGFzIGFuIG9yZGluYXJ5IFdlYWtNYXBcbiAgICAgICAqIG90aGVyd2lzZS5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjcmVhdGVJdGVtXG4gICAgICAgKiAgICAgICAgQSBmdW5jdGlvbiB3aGljaCB3aWxsIGJlIGNhbGxlZCBpbiBvcmRlciB0byBjcmVhdGUgdGhlIHZhbHVlIGZvciBhbnlcbiAgICAgICAqICAgICAgICBrZXkgd2hpY2ggZG9lcyBub3QgZXhpc3QsIHRoZSBmaXJzdCB0aW1lIGl0IGlzIGFjY2Vzc2VkLiBUaGVcbiAgICAgICAqICAgICAgICBmdW5jdGlvbiByZWNlaXZlcywgYXMgaXRzIG9ubHkgYXJndW1lbnQsIHRoZSBrZXkgYmVpbmcgY3JlYXRlZC5cbiAgICAgICAqL1xuICAgICAgY2xhc3MgRGVmYXVsdFdlYWtNYXAgZXh0ZW5kcyBXZWFrTWFwIHtcbiAgICAgICAgY29uc3RydWN0b3IoY3JlYXRlSXRlbSwgaXRlbXMgPSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBzdXBlcihpdGVtcyk7XG4gICAgICAgICAgdGhpcy5jcmVhdGVJdGVtID0gY3JlYXRlSXRlbTtcbiAgICAgICAgfVxuICAgICAgICBnZXQoa2V5KSB7XG4gICAgICAgICAgaWYgKCF0aGlzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICB0aGlzLnNldChrZXksIHRoaXMuY3JlYXRlSXRlbShrZXkpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHN1cGVyLmdldChrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJucyB0cnVlIGlmIHRoZSBnaXZlbiBvYmplY3QgaXMgYW4gb2JqZWN0IHdpdGggYSBgdGhlbmAgbWV0aG9kLCBhbmQgY2FuXG4gICAgICAgKiB0aGVyZWZvcmUgYmUgYXNzdW1lZCB0byBiZWhhdmUgYXMgYSBQcm9taXNlLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHRlc3QuXG4gICAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgdmFsdWUgaXMgdGhlbmFibGUuXG4gICAgICAgKi9cbiAgICAgIGNvbnN0IGlzVGhlbmFibGUgPSB2YWx1ZSA9PiB7XG4gICAgICAgIHJldHVybiB2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIHZhbHVlLnRoZW4gPT09IFwiZnVuY3Rpb25cIjtcbiAgICAgIH07XG5cbiAgICAgIC8qKlxuICAgICAgICogQ3JlYXRlcyBhbmQgcmV0dXJucyBhIGZ1bmN0aW9uIHdoaWNoLCB3aGVuIGNhbGxlZCwgd2lsbCByZXNvbHZlIG9yIHJlamVjdFxuICAgICAgICogdGhlIGdpdmVuIHByb21pc2UgYmFzZWQgb24gaG93IGl0IGlzIGNhbGxlZDpcbiAgICAgICAqXG4gICAgICAgKiAtIElmLCB3aGVuIGNhbGxlZCwgYGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcmAgY29udGFpbnMgYSBub24tbnVsbCBvYmplY3QsXG4gICAgICAgKiAgIHRoZSBwcm9taXNlIGlzIHJlamVjdGVkIHdpdGggdGhhdCB2YWx1ZS5cbiAgICAgICAqIC0gSWYgdGhlIGZ1bmN0aW9uIGlzIGNhbGxlZCB3aXRoIGV4YWN0bHkgb25lIGFyZ3VtZW50LCB0aGUgcHJvbWlzZSBpc1xuICAgICAgICogICByZXNvbHZlZCB0byB0aGF0IHZhbHVlLlxuICAgICAgICogLSBPdGhlcndpc2UsIHRoZSBwcm9taXNlIGlzIHJlc29sdmVkIHRvIGFuIGFycmF5IGNvbnRhaW5pbmcgYWxsIG9mIHRoZVxuICAgICAgICogICBmdW5jdGlvbidzIGFyZ3VtZW50cy5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gcHJvbWlzZVxuICAgICAgICogICAgICAgIEFuIG9iamVjdCBjb250YWluaW5nIHRoZSByZXNvbHV0aW9uIGFuZCByZWplY3Rpb24gZnVuY3Rpb25zIG9mIGFcbiAgICAgICAqICAgICAgICBwcm9taXNlLlxuICAgICAgICogQHBhcmFtIHtmdW5jdGlvbn0gcHJvbWlzZS5yZXNvbHZlXG4gICAgICAgKiAgICAgICAgVGhlIHByb21pc2UncyByZXNvbHV0aW9uIGZ1bmN0aW9uLlxuICAgICAgICogQHBhcmFtIHtmdW5jdGlvbn0gcHJvbWlzZS5yZWplY3RcbiAgICAgICAqICAgICAgICBUaGUgcHJvbWlzZSdzIHJlamVjdGlvbiBmdW5jdGlvbi5cbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBtZXRhZGF0YVxuICAgICAgICogICAgICAgIE1ldGFkYXRhIGFib3V0IHRoZSB3cmFwcGVkIG1ldGhvZCB3aGljaCBoYXMgY3JlYXRlZCB0aGUgY2FsbGJhY2suXG4gICAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IG1ldGFkYXRhLnNpbmdsZUNhbGxiYWNrQXJnXG4gICAgICAgKiAgICAgICAgV2hldGhlciBvciBub3QgdGhlIHByb21pc2UgaXMgcmVzb2x2ZWQgd2l0aCBvbmx5IHRoZSBmaXJzdFxuICAgICAgICogICAgICAgIGFyZ3VtZW50IG9mIHRoZSBjYWxsYmFjaywgYWx0ZXJuYXRpdmVseSBhbiBhcnJheSBvZiBhbGwgdGhlXG4gICAgICAgKiAgICAgICAgY2FsbGJhY2sgYXJndW1lbnRzIGlzIHJlc29sdmVkLiBCeSBkZWZhdWx0LCBpZiB0aGUgY2FsbGJhY2tcbiAgICAgICAqICAgICAgICBmdW5jdGlvbiBpcyBpbnZva2VkIHdpdGggb25seSBhIHNpbmdsZSBhcmd1bWVudCwgdGhhdCB3aWxsIGJlXG4gICAgICAgKiAgICAgICAgcmVzb2x2ZWQgdG8gdGhlIHByb21pc2UsIHdoaWxlIGFsbCBhcmd1bWVudHMgd2lsbCBiZSByZXNvbHZlZCBhc1xuICAgICAgICogICAgICAgIGFuIGFycmF5IGlmIG11bHRpcGxlIGFyZSBnaXZlbi5cbiAgICAgICAqXG4gICAgICAgKiBAcmV0dXJucyB7ZnVuY3Rpb259XG4gICAgICAgKiAgICAgICAgVGhlIGdlbmVyYXRlZCBjYWxsYmFjayBmdW5jdGlvbi5cbiAgICAgICAqL1xuICAgICAgY29uc3QgbWFrZUNhbGxiYWNrID0gKHByb21pc2UsIG1ldGFkYXRhKSA9PiB7XG4gICAgICAgIHJldHVybiAoLi4uY2FsbGJhY2tBcmdzKSA9PiB7XG4gICAgICAgICAgaWYgKGV4dGVuc2lvbkFQSXMucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHByb21pc2UucmVqZWN0KG5ldyBFcnJvcihleHRlbnNpb25BUElzLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UpKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1ldGFkYXRhLnNpbmdsZUNhbGxiYWNrQXJnIHx8IGNhbGxiYWNrQXJncy5sZW5ndGggPD0gMSAmJiBtZXRhZGF0YS5zaW5nbGVDYWxsYmFja0FyZyAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHByb21pc2UucmVzb2x2ZShjYWxsYmFja0FyZ3NbMF0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm9taXNlLnJlc29sdmUoY2FsbGJhY2tBcmdzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgICAgY29uc3QgcGx1cmFsaXplQXJndW1lbnRzID0gbnVtQXJncyA9PiBudW1BcmdzID09IDEgPyBcImFyZ3VtZW50XCIgOiBcImFyZ3VtZW50c1wiO1xuXG4gICAgICAvKipcbiAgICAgICAqIENyZWF0ZXMgYSB3cmFwcGVyIGZ1bmN0aW9uIGZvciBhIG1ldGhvZCB3aXRoIHRoZSBnaXZlbiBuYW1lIGFuZCBtZXRhZGF0YS5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICAgICAgICogICAgICAgIFRoZSBuYW1lIG9mIHRoZSBtZXRob2Qgd2hpY2ggaXMgYmVpbmcgd3JhcHBlZC5cbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBtZXRhZGF0YVxuICAgICAgICogICAgICAgIE1ldGFkYXRhIGFib3V0IHRoZSBtZXRob2QgYmVpbmcgd3JhcHBlZC5cbiAgICAgICAqIEBwYXJhbSB7aW50ZWdlcn0gbWV0YWRhdGEubWluQXJnc1xuICAgICAgICogICAgICAgIFRoZSBtaW5pbXVtIG51bWJlciBvZiBhcmd1bWVudHMgd2hpY2ggbXVzdCBiZSBwYXNzZWQgdG8gdGhlXG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24uIElmIGNhbGxlZCB3aXRoIGZld2VyIHRoYW4gdGhpcyBudW1iZXIgb2YgYXJndW1lbnRzLCB0aGVcbiAgICAgICAqICAgICAgICB3cmFwcGVyIHdpbGwgcmFpc2UgYW4gZXhjZXB0aW9uLlxuICAgICAgICogQHBhcmFtIHtpbnRlZ2VyfSBtZXRhZGF0YS5tYXhBcmdzXG4gICAgICAgKiAgICAgICAgVGhlIG1heGltdW0gbnVtYmVyIG9mIGFyZ3VtZW50cyB3aGljaCBtYXkgYmUgcGFzc2VkIHRvIHRoZVxuICAgICAgICogICAgICAgIGZ1bmN0aW9uLiBJZiBjYWxsZWQgd2l0aCBtb3JlIHRoYW4gdGhpcyBudW1iZXIgb2YgYXJndW1lbnRzLCB0aGVcbiAgICAgICAqICAgICAgICB3cmFwcGVyIHdpbGwgcmFpc2UgYW4gZXhjZXB0aW9uLlxuICAgICAgICogQHBhcmFtIHtib29sZWFufSBtZXRhZGF0YS5zaW5nbGVDYWxsYmFja0FyZ1xuICAgICAgICogICAgICAgIFdoZXRoZXIgb3Igbm90IHRoZSBwcm9taXNlIGlzIHJlc29sdmVkIHdpdGggb25seSB0aGUgZmlyc3RcbiAgICAgICAqICAgICAgICBhcmd1bWVudCBvZiB0aGUgY2FsbGJhY2ssIGFsdGVybmF0aXZlbHkgYW4gYXJyYXkgb2YgYWxsIHRoZVxuICAgICAgICogICAgICAgIGNhbGxiYWNrIGFyZ3VtZW50cyBpcyByZXNvbHZlZC4gQnkgZGVmYXVsdCwgaWYgdGhlIGNhbGxiYWNrXG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24gaXMgaW52b2tlZCB3aXRoIG9ubHkgYSBzaW5nbGUgYXJndW1lbnQsIHRoYXQgd2lsbCBiZVxuICAgICAgICogICAgICAgIHJlc29sdmVkIHRvIHRoZSBwcm9taXNlLCB3aGlsZSBhbGwgYXJndW1lbnRzIHdpbGwgYmUgcmVzb2x2ZWQgYXNcbiAgICAgICAqICAgICAgICBhbiBhcnJheSBpZiBtdWx0aXBsZSBhcmUgZ2l2ZW4uXG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge2Z1bmN0aW9uKG9iamVjdCwgLi4uKil9XG4gICAgICAgKiAgICAgICBUaGUgZ2VuZXJhdGVkIHdyYXBwZXIgZnVuY3Rpb24uXG4gICAgICAgKi9cbiAgICAgIGNvbnN0IHdyYXBBc3luY0Z1bmN0aW9uID0gKG5hbWUsIG1ldGFkYXRhKSA9PiB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBhc3luY0Z1bmN0aW9uV3JhcHBlcih0YXJnZXQsIC4uLmFyZ3MpIHtcbiAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPCBtZXRhZGF0YS5taW5BcmdzKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGF0IGxlYXN0ICR7bWV0YWRhdGEubWluQXJnc30gJHtwbHVyYWxpemVBcmd1bWVudHMobWV0YWRhdGEubWluQXJncyl9IGZvciAke25hbWV9KCksIGdvdCAke2FyZ3MubGVuZ3RofWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPiBtZXRhZGF0YS5tYXhBcmdzKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGF0IG1vc3QgJHttZXRhZGF0YS5tYXhBcmdzfSAke3BsdXJhbGl6ZUFyZ3VtZW50cyhtZXRhZGF0YS5tYXhBcmdzKX0gZm9yICR7bmFtZX0oKSwgZ290ICR7YXJncy5sZW5ndGh9YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBpZiAobWV0YWRhdGEuZmFsbGJhY2tUb05vQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgLy8gVGhpcyBBUEkgbWV0aG9kIGhhcyBjdXJyZW50bHkgbm8gY2FsbGJhY2sgb24gQ2hyb21lLCBidXQgaXQgcmV0dXJuIGEgcHJvbWlzZSBvbiBGaXJlZm94LFxuICAgICAgICAgICAgICAvLyBhbmQgc28gdGhlIHBvbHlmaWxsIHdpbGwgdHJ5IHRvIGNhbGwgaXQgd2l0aCBhIGNhbGxiYWNrIGZpcnN0LCBhbmQgaXQgd2lsbCBmYWxsYmFja1xuICAgICAgICAgICAgICAvLyB0byBub3QgcGFzc2luZyB0aGUgY2FsbGJhY2sgaWYgdGhlIGZpcnN0IGNhbGwgZmFpbHMuXG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdKC4uLmFyZ3MsIG1ha2VDYWxsYmFjayh7XG4gICAgICAgICAgICAgICAgICByZXNvbHZlLFxuICAgICAgICAgICAgICAgICAgcmVqZWN0XG4gICAgICAgICAgICAgICAgfSwgbWV0YWRhdGEpKTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoY2JFcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgJHtuYW1lfSBBUEkgbWV0aG9kIGRvZXNuJ3Qgc2VlbSB0byBzdXBwb3J0IHRoZSBjYWxsYmFjayBwYXJhbWV0ZXIsIGAgKyBcImZhbGxpbmcgYmFjayB0byBjYWxsIGl0IHdpdGhvdXQgYSBjYWxsYmFjazogXCIsIGNiRXJyb3IpO1xuICAgICAgICAgICAgICAgIHRhcmdldFtuYW1lXSguLi5hcmdzKTtcblxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSB0aGUgQVBJIG1ldGhvZCBtZXRhZGF0YSwgc28gdGhhdCB0aGUgbmV4dCBBUEkgY2FsbHMgd2lsbCBub3QgdHJ5IHRvXG4gICAgICAgICAgICAgICAgLy8gdXNlIHRoZSB1bnN1cHBvcnRlZCBjYWxsYmFjayBhbnltb3JlLlxuICAgICAgICAgICAgICAgIG1ldGFkYXRhLmZhbGxiYWNrVG9Ob0NhbGxiYWNrID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgbWV0YWRhdGEubm9DYWxsYmFjayA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1ldGFkYXRhLm5vQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdKC4uLmFyZ3MpO1xuICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0YXJnZXRbbmFtZV0oLi4uYXJncywgbWFrZUNhbGxiYWNrKHtcbiAgICAgICAgICAgICAgICByZXNvbHZlLFxuICAgICAgICAgICAgICAgIHJlamVjdFxuICAgICAgICAgICAgICB9LCBtZXRhZGF0YSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgICAgfTtcblxuICAgICAgLyoqXG4gICAgICAgKiBXcmFwcyBhbiBleGlzdGluZyBtZXRob2Qgb2YgdGhlIHRhcmdldCBvYmplY3QsIHNvIHRoYXQgY2FsbHMgdG8gaXQgYXJlXG4gICAgICAgKiBpbnRlcmNlcHRlZCBieSB0aGUgZ2l2ZW4gd3JhcHBlciBmdW5jdGlvbi4gVGhlIHdyYXBwZXIgZnVuY3Rpb24gcmVjZWl2ZXMsXG4gICAgICAgKiBhcyBpdHMgZmlyc3QgYXJndW1lbnQsIHRoZSBvcmlnaW5hbCBgdGFyZ2V0YCBvYmplY3QsIGZvbGxvd2VkIGJ5IGVhY2ggb2ZcbiAgICAgICAqIHRoZSBhcmd1bWVudHMgcGFzc2VkIHRvIHRoZSBvcmlnaW5hbCBtZXRob2QuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IHRhcmdldFxuICAgICAgICogICAgICAgIFRoZSBvcmlnaW5hbCB0YXJnZXQgb2JqZWN0IHRoYXQgdGhlIHdyYXBwZWQgbWV0aG9kIGJlbG9uZ3MgdG8uXG4gICAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBtZXRob2RcbiAgICAgICAqICAgICAgICBUaGUgbWV0aG9kIGJlaW5nIHdyYXBwZWQuIFRoaXMgaXMgdXNlZCBhcyB0aGUgdGFyZ2V0IG9mIHRoZSBQcm94eVxuICAgICAgICogICAgICAgIG9iamVjdCB3aGljaCBpcyBjcmVhdGVkIHRvIHdyYXAgdGhlIG1ldGhvZC5cbiAgICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IHdyYXBwZXJcbiAgICAgICAqICAgICAgICBUaGUgd3JhcHBlciBmdW5jdGlvbiB3aGljaCBpcyBjYWxsZWQgaW4gcGxhY2Ugb2YgYSBkaXJlY3QgaW52b2NhdGlvblxuICAgICAgICogICAgICAgIG9mIHRoZSB3cmFwcGVkIG1ldGhvZC5cbiAgICAgICAqXG4gICAgICAgKiBAcmV0dXJucyB7UHJveHk8ZnVuY3Rpb24+fVxuICAgICAgICogICAgICAgIEEgUHJveHkgb2JqZWN0IGZvciB0aGUgZ2l2ZW4gbWV0aG9kLCB3aGljaCBpbnZva2VzIHRoZSBnaXZlbiB3cmFwcGVyXG4gICAgICAgKiAgICAgICAgbWV0aG9kIGluIGl0cyBwbGFjZS5cbiAgICAgICAqL1xuICAgICAgY29uc3Qgd3JhcE1ldGhvZCA9ICh0YXJnZXQsIG1ldGhvZCwgd3JhcHBlcikgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb3h5KG1ldGhvZCwge1xuICAgICAgICAgIGFwcGx5KHRhcmdldE1ldGhvZCwgdGhpc09iaiwgYXJncykge1xuICAgICAgICAgICAgcmV0dXJuIHdyYXBwZXIuY2FsbCh0aGlzT2JqLCB0YXJnZXQsIC4uLmFyZ3MpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgICAgbGV0IGhhc093blByb3BlcnR5ID0gRnVuY3Rpb24uY2FsbC5iaW5kKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkpO1xuXG4gICAgICAvKipcbiAgICAgICAqIFdyYXBzIGFuIG9iamVjdCBpbiBhIFByb3h5IHdoaWNoIGludGVyY2VwdHMgYW5kIHdyYXBzIGNlcnRhaW4gbWV0aG9kc1xuICAgICAgICogYmFzZWQgb24gdGhlIGdpdmVuIGB3cmFwcGVyc2AgYW5kIGBtZXRhZGF0YWAgb2JqZWN0cy5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gdGFyZ2V0XG4gICAgICAgKiAgICAgICAgVGhlIHRhcmdldCBvYmplY3QgdG8gd3JhcC5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gW3dyYXBwZXJzID0ge31dXG4gICAgICAgKiAgICAgICAgQW4gb2JqZWN0IHRyZWUgY29udGFpbmluZyB3cmFwcGVyIGZ1bmN0aW9ucyBmb3Igc3BlY2lhbCBjYXNlcy4gQW55XG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24gcHJlc2VudCBpbiB0aGlzIG9iamVjdCB0cmVlIGlzIGNhbGxlZCBpbiBwbGFjZSBvZiB0aGVcbiAgICAgICAqICAgICAgICBtZXRob2QgaW4gdGhlIHNhbWUgbG9jYXRpb24gaW4gdGhlIGB0YXJnZXRgIG9iamVjdCB0cmVlLiBUaGVzZVxuICAgICAgICogICAgICAgIHdyYXBwZXIgbWV0aG9kcyBhcmUgaW52b2tlZCBhcyBkZXNjcmliZWQgaW4ge0BzZWUgd3JhcE1ldGhvZH0uXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IFttZXRhZGF0YSA9IHt9XVxuICAgICAgICogICAgICAgIEFuIG9iamVjdCB0cmVlIGNvbnRhaW5pbmcgbWV0YWRhdGEgdXNlZCB0byBhdXRvbWF0aWNhbGx5IGdlbmVyYXRlXG4gICAgICAgKiAgICAgICAgUHJvbWlzZS1iYXNlZCB3cmFwcGVyIGZ1bmN0aW9ucyBmb3IgYXN5bmNocm9ub3VzLiBBbnkgZnVuY3Rpb24gaW5cbiAgICAgICAqICAgICAgICB0aGUgYHRhcmdldGAgb2JqZWN0IHRyZWUgd2hpY2ggaGFzIGEgY29ycmVzcG9uZGluZyBtZXRhZGF0YSBvYmplY3RcbiAgICAgICAqICAgICAgICBpbiB0aGUgc2FtZSBsb2NhdGlvbiBpbiB0aGUgYG1ldGFkYXRhYCB0cmVlIGlzIHJlcGxhY2VkIHdpdGggYW5cbiAgICAgICAqICAgICAgICBhdXRvbWF0aWNhbGx5LWdlbmVyYXRlZCB3cmFwcGVyIGZ1bmN0aW9uLCBhcyBkZXNjcmliZWQgaW5cbiAgICAgICAqICAgICAgICB7QHNlZSB3cmFwQXN5bmNGdW5jdGlvbn1cbiAgICAgICAqXG4gICAgICAgKiBAcmV0dXJucyB7UHJveHk8b2JqZWN0Pn1cbiAgICAgICAqL1xuICAgICAgY29uc3Qgd3JhcE9iamVjdCA9ICh0YXJnZXQsIHdyYXBwZXJzID0ge30sIG1ldGFkYXRhID0ge30pID0+IHtcbiAgICAgICAgbGV0IGNhY2hlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgbGV0IGhhbmRsZXJzID0ge1xuICAgICAgICAgIGhhcyhwcm94eVRhcmdldCwgcHJvcCkge1xuICAgICAgICAgICAgcmV0dXJuIHByb3AgaW4gdGFyZ2V0IHx8IHByb3AgaW4gY2FjaGU7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBnZXQocHJveHlUYXJnZXQsIHByb3AsIHJlY2VpdmVyKSB7XG4gICAgICAgICAgICBpZiAocHJvcCBpbiBjYWNoZSkge1xuICAgICAgICAgICAgICByZXR1cm4gY2FjaGVbcHJvcF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIShwcm9wIGluIHRhcmdldCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IHRhcmdldFtwcm9wXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAvLyBUaGlzIGlzIGEgbWV0aG9kIG9uIHRoZSB1bmRlcmx5aW5nIG9iamVjdC4gQ2hlY2sgaWYgd2UgbmVlZCB0byBkb1xuICAgICAgICAgICAgICAvLyBhbnkgd3JhcHBpbmcuXG5cbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB3cmFwcGVyc1twcm9wXSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgLy8gV2UgaGF2ZSBhIHNwZWNpYWwtY2FzZSB3cmFwcGVyIGZvciB0aGlzIG1ldGhvZC5cbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHdyYXBNZXRob2QodGFyZ2V0LCB0YXJnZXRbcHJvcF0sIHdyYXBwZXJzW3Byb3BdKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChoYXNPd25Qcm9wZXJ0eShtZXRhZGF0YSwgcHJvcCkpIHtcbiAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIGFuIGFzeW5jIG1ldGhvZCB0aGF0IHdlIGhhdmUgbWV0YWRhdGEgZm9yLiBDcmVhdGUgYVxuICAgICAgICAgICAgICAgIC8vIFByb21pc2Ugd3JhcHBlciBmb3IgaXQuXG4gICAgICAgICAgICAgICAgbGV0IHdyYXBwZXIgPSB3cmFwQXN5bmNGdW5jdGlvbihwcm9wLCBtZXRhZGF0YVtwcm9wXSk7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSB3cmFwTWV0aG9kKHRhcmdldCwgdGFyZ2V0W3Byb3BdLCB3cmFwcGVyKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIGEgbWV0aG9kIHRoYXQgd2UgZG9uJ3Qga25vdyBvciBjYXJlIGFib3V0LiBSZXR1cm4gdGhlXG4gICAgICAgICAgICAgICAgLy8gb3JpZ2luYWwgbWV0aG9kLCBib3VuZCB0byB0aGUgdW5kZXJseWluZyBvYmplY3QuXG4gICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5iaW5kKHRhcmdldCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmIHZhbHVlICE9PSBudWxsICYmIChoYXNPd25Qcm9wZXJ0eSh3cmFwcGVycywgcHJvcCkgfHwgaGFzT3duUHJvcGVydHkobWV0YWRhdGEsIHByb3ApKSkge1xuICAgICAgICAgICAgICAvLyBUaGlzIGlzIGFuIG9iamVjdCB0aGF0IHdlIG5lZWQgdG8gZG8gc29tZSB3cmFwcGluZyBmb3IgdGhlIGNoaWxkcmVuXG4gICAgICAgICAgICAgIC8vIG9mLiBDcmVhdGUgYSBzdWItb2JqZWN0IHdyYXBwZXIgZm9yIGl0IHdpdGggdGhlIGFwcHJvcHJpYXRlIGNoaWxkXG4gICAgICAgICAgICAgIC8vIG1ldGFkYXRhLlxuICAgICAgICAgICAgICB2YWx1ZSA9IHdyYXBPYmplY3QodmFsdWUsIHdyYXBwZXJzW3Byb3BdLCBtZXRhZGF0YVtwcm9wXSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGhhc093blByb3BlcnR5KG1ldGFkYXRhLCBcIipcIikpIHtcbiAgICAgICAgICAgICAgLy8gV3JhcCBhbGwgcHJvcGVydGllcyBpbiAqIG5hbWVzcGFjZS5cbiAgICAgICAgICAgICAgdmFsdWUgPSB3cmFwT2JqZWN0KHZhbHVlLCB3cmFwcGVyc1twcm9wXSwgbWV0YWRhdGFbXCIqXCJdKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIFdlIGRvbid0IG5lZWQgdG8gZG8gYW55IHdyYXBwaW5nIGZvciB0aGlzIHByb3BlcnR5LFxuICAgICAgICAgICAgICAvLyBzbyBqdXN0IGZvcndhcmQgYWxsIGFjY2VzcyB0byB0aGUgdW5kZXJseWluZyBvYmplY3QuXG4gICAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjYWNoZSwgcHJvcCwge1xuICAgICAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgIGdldCgpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0YXJnZXRbcHJvcF07XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgIHRhcmdldFtwcm9wXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhY2hlW3Byb3BdID0gdmFsdWU7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBzZXQocHJveHlUYXJnZXQsIHByb3AsIHZhbHVlLCByZWNlaXZlcikge1xuICAgICAgICAgICAgaWYgKHByb3AgaW4gY2FjaGUpIHtcbiAgICAgICAgICAgICAgY2FjaGVbcHJvcF0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRhcmdldFtwcm9wXSA9IHZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBkZWZpbmVQcm9wZXJ0eShwcm94eVRhcmdldCwgcHJvcCwgZGVzYykge1xuICAgICAgICAgICAgcmV0dXJuIFJlZmxlY3QuZGVmaW5lUHJvcGVydHkoY2FjaGUsIHByb3AsIGRlc2MpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZGVsZXRlUHJvcGVydHkocHJveHlUYXJnZXQsIHByb3ApIHtcbiAgICAgICAgICAgIHJldHVybiBSZWZsZWN0LmRlbGV0ZVByb3BlcnR5KGNhY2hlLCBwcm9wKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gUGVyIGNvbnRyYWN0IG9mIHRoZSBQcm94eSBBUEksIHRoZSBcImdldFwiIHByb3h5IGhhbmRsZXIgbXVzdCByZXR1cm4gdGhlXG4gICAgICAgIC8vIG9yaWdpbmFsIHZhbHVlIG9mIHRoZSB0YXJnZXQgaWYgdGhhdCB2YWx1ZSBpcyBkZWNsYXJlZCByZWFkLW9ubHkgYW5kXG4gICAgICAgIC8vIG5vbi1jb25maWd1cmFibGUuIEZvciB0aGlzIHJlYXNvbiwgd2UgY3JlYXRlIGFuIG9iamVjdCB3aXRoIHRoZVxuICAgICAgICAvLyBwcm90b3R5cGUgc2V0IHRvIGB0YXJnZXRgIGluc3RlYWQgb2YgdXNpbmcgYHRhcmdldGAgZGlyZWN0bHkuXG4gICAgICAgIC8vIE90aGVyd2lzZSB3ZSBjYW5ub3QgcmV0dXJuIGEgY3VzdG9tIG9iamVjdCBmb3IgQVBJcyB0aGF0XG4gICAgICAgIC8vIGFyZSBkZWNsYXJlZCByZWFkLW9ubHkgYW5kIG5vbi1jb25maWd1cmFibGUsIHN1Y2ggYXMgYGNocm9tZS5kZXZ0b29sc2AuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIFRoZSBwcm94eSBoYW5kbGVycyB0aGVtc2VsdmVzIHdpbGwgc3RpbGwgdXNlIHRoZSBvcmlnaW5hbCBgdGFyZ2V0YFxuICAgICAgICAvLyBpbnN0ZWFkIG9mIHRoZSBgcHJveHlUYXJnZXRgLCBzbyB0aGF0IHRoZSBtZXRob2RzIGFuZCBwcm9wZXJ0aWVzIGFyZVxuICAgICAgICAvLyBkZXJlZmVyZW5jZWQgdmlhIHRoZSBvcmlnaW5hbCB0YXJnZXRzLlxuICAgICAgICBsZXQgcHJveHlUYXJnZXQgPSBPYmplY3QuY3JlYXRlKHRhcmdldCk7XG4gICAgICAgIHJldHVybiBuZXcgUHJveHkocHJveHlUYXJnZXQsIGhhbmRsZXJzKTtcbiAgICAgIH07XG5cbiAgICAgIC8qKlxuICAgICAgICogQ3JlYXRlcyBhIHNldCBvZiB3cmFwcGVyIGZ1bmN0aW9ucyBmb3IgYW4gZXZlbnQgb2JqZWN0LCB3aGljaCBoYW5kbGVzXG4gICAgICAgKiB3cmFwcGluZyBvZiBsaXN0ZW5lciBmdW5jdGlvbnMgdGhhdCB0aG9zZSBtZXNzYWdlcyBhcmUgcGFzc2VkLlxuICAgICAgICpcbiAgICAgICAqIEEgc2luZ2xlIHdyYXBwZXIgaXMgY3JlYXRlZCBmb3IgZWFjaCBsaXN0ZW5lciBmdW5jdGlvbiwgYW5kIHN0b3JlZCBpbiBhXG4gICAgICAgKiBtYXAuIFN1YnNlcXVlbnQgY2FsbHMgdG8gYGFkZExpc3RlbmVyYCwgYGhhc0xpc3RlbmVyYCwgb3IgYHJlbW92ZUxpc3RlbmVyYFxuICAgICAgICogcmV0cmlldmUgdGhlIG9yaWdpbmFsIHdyYXBwZXIsIHNvIHRoYXQgIGF0dGVtcHRzIHRvIHJlbW92ZSBhXG4gICAgICAgKiBwcmV2aW91c2x5LWFkZGVkIGxpc3RlbmVyIHdvcmsgYXMgZXhwZWN0ZWQuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtEZWZhdWx0V2Vha01hcDxmdW5jdGlvbiwgZnVuY3Rpb24+fSB3cmFwcGVyTWFwXG4gICAgICAgKiAgICAgICAgQSBEZWZhdWx0V2Vha01hcCBvYmplY3Qgd2hpY2ggd2lsbCBjcmVhdGUgdGhlIGFwcHJvcHJpYXRlIHdyYXBwZXJcbiAgICAgICAqICAgICAgICBmb3IgYSBnaXZlbiBsaXN0ZW5lciBmdW5jdGlvbiB3aGVuIG9uZSBkb2VzIG5vdCBleGlzdCwgYW5kIHJldHJpZXZlXG4gICAgICAgKiAgICAgICAgYW4gZXhpc3Rpbmcgb25lIHdoZW4gaXQgZG9lcy5cbiAgICAgICAqXG4gICAgICAgKiBAcmV0dXJucyB7b2JqZWN0fVxuICAgICAgICovXG4gICAgICBjb25zdCB3cmFwRXZlbnQgPSB3cmFwcGVyTWFwID0+ICh7XG4gICAgICAgIGFkZExpc3RlbmVyKHRhcmdldCwgbGlzdGVuZXIsIC4uLmFyZ3MpIHtcbiAgICAgICAgICB0YXJnZXQuYWRkTGlzdGVuZXIod3JhcHBlck1hcC5nZXQobGlzdGVuZXIpLCAuLi5hcmdzKTtcbiAgICAgICAgfSxcbiAgICAgICAgaGFzTGlzdGVuZXIodGFyZ2V0LCBsaXN0ZW5lcikge1xuICAgICAgICAgIHJldHVybiB0YXJnZXQuaGFzTGlzdGVuZXIod3JhcHBlck1hcC5nZXQobGlzdGVuZXIpKTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVtb3ZlTGlzdGVuZXIodGFyZ2V0LCBsaXN0ZW5lcikge1xuICAgICAgICAgIHRhcmdldC5yZW1vdmVMaXN0ZW5lcih3cmFwcGVyTWFwLmdldChsaXN0ZW5lcikpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGNvbnN0IG9uUmVxdWVzdEZpbmlzaGVkV3JhcHBlcnMgPSBuZXcgRGVmYXVsdFdlYWtNYXAobGlzdGVuZXIgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICByZXR1cm4gbGlzdGVuZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogV3JhcHMgYW4gb25SZXF1ZXN0RmluaXNoZWQgbGlzdGVuZXIgZnVuY3Rpb24gc28gdGhhdCBpdCB3aWxsIHJldHVybiBhXG4gICAgICAgICAqIGBnZXRDb250ZW50KClgIHByb3BlcnR5IHdoaWNoIHJldHVybnMgYSBgUHJvbWlzZWAgcmF0aGVyIHRoYW4gdXNpbmcgYVxuICAgICAgICAgKiBjYWxsYmFjayBBUEkuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSByZXFcbiAgICAgICAgICogICAgICAgIFRoZSBIQVIgZW50cnkgb2JqZWN0IHJlcHJlc2VudGluZyB0aGUgbmV0d29yayByZXF1ZXN0LlxuICAgICAgICAgKi9cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG9uUmVxdWVzdEZpbmlzaGVkKHJlcSkge1xuICAgICAgICAgIGNvbnN0IHdyYXBwZWRSZXEgPSB3cmFwT2JqZWN0KHJlcSwge30gLyogd3JhcHBlcnMgKi8sIHtcbiAgICAgICAgICAgIGdldENvbnRlbnQ6IHtcbiAgICAgICAgICAgICAgbWluQXJnczogMCxcbiAgICAgICAgICAgICAgbWF4QXJnczogMFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxpc3RlbmVyKHdyYXBwZWRSZXEpO1xuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgICBjb25zdCBvbk1lc3NhZ2VXcmFwcGVycyA9IG5ldyBEZWZhdWx0V2Vha01hcChsaXN0ZW5lciA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgIHJldHVybiBsaXN0ZW5lcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBXcmFwcyBhIG1lc3NhZ2UgbGlzdGVuZXIgZnVuY3Rpb24gc28gdGhhdCBpdCBtYXkgc2VuZCByZXNwb25zZXMgYmFzZWQgb25cbiAgICAgICAgICogaXRzIHJldHVybiB2YWx1ZSwgcmF0aGVyIHRoYW4gYnkgcmV0dXJuaW5nIGEgc2VudGluZWwgdmFsdWUgYW5kIGNhbGxpbmcgYVxuICAgICAgICAgKiBjYWxsYmFjay4gSWYgdGhlIGxpc3RlbmVyIGZ1bmN0aW9uIHJldHVybnMgYSBQcm9taXNlLCB0aGUgcmVzcG9uc2UgaXNcbiAgICAgICAgICogc2VudCB3aGVuIHRoZSBwcm9taXNlIGVpdGhlciByZXNvbHZlcyBvciByZWplY3RzLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0geyp9IG1lc3NhZ2VcbiAgICAgICAgICogICAgICAgIFRoZSBtZXNzYWdlIHNlbnQgYnkgdGhlIG90aGVyIGVuZCBvZiB0aGUgY2hhbm5lbC5cbiAgICAgICAgICogQHBhcmFtIHtvYmplY3R9IHNlbmRlclxuICAgICAgICAgKiAgICAgICAgRGV0YWlscyBhYm91dCB0aGUgc2VuZGVyIG9mIHRoZSBtZXNzYWdlLlxuICAgICAgICAgKiBAcGFyYW0ge2Z1bmN0aW9uKCopfSBzZW5kUmVzcG9uc2VcbiAgICAgICAgICogICAgICAgIEEgY2FsbGJhY2sgd2hpY2gsIHdoZW4gY2FsbGVkIHdpdGggYW4gYXJiaXRyYXJ5IGFyZ3VtZW50LCBzZW5kc1xuICAgICAgICAgKiAgICAgICAgdGhhdCB2YWx1ZSBhcyBhIHJlc3BvbnNlLlxuICAgICAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICAgICAgICogICAgICAgIFRydWUgaWYgdGhlIHdyYXBwZWQgbGlzdGVuZXIgcmV0dXJuZWQgYSBQcm9taXNlLCB3aGljaCB3aWxsIGxhdGVyXG4gICAgICAgICAqICAgICAgICB5aWVsZCBhIHJlc3BvbnNlLiBGYWxzZSBvdGhlcndpc2UuXG4gICAgICAgICAqL1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gb25NZXNzYWdlKG1lc3NhZ2UsIHNlbmRlciwgc2VuZFJlc3BvbnNlKSB7XG4gICAgICAgICAgbGV0IGRpZENhbGxTZW5kUmVzcG9uc2UgPSBmYWxzZTtcbiAgICAgICAgICBsZXQgd3JhcHBlZFNlbmRSZXNwb25zZTtcbiAgICAgICAgICBsZXQgc2VuZFJlc3BvbnNlUHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgICAgd3JhcHBlZFNlbmRSZXNwb25zZSA9IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICBkaWRDYWxsU2VuZFJlc3BvbnNlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxldCByZXN1bHQ7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGxpc3RlbmVyKG1lc3NhZ2UsIHNlbmRlciwgd3JhcHBlZFNlbmRSZXNwb25zZSk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICByZXN1bHQgPSBQcm9taXNlLnJlamVjdChlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBpc1Jlc3VsdFRoZW5hYmxlID0gcmVzdWx0ICE9PSB0cnVlICYmIGlzVGhlbmFibGUocmVzdWx0KTtcblxuICAgICAgICAgIC8vIElmIHRoZSBsaXN0ZW5lciBkaWRuJ3QgcmV0dXJuZWQgdHJ1ZSBvciBhIFByb21pc2UsIG9yIGNhbGxlZFxuICAgICAgICAgIC8vIHdyYXBwZWRTZW5kUmVzcG9uc2Ugc3luY2hyb25vdXNseSwgd2UgY2FuIGV4aXQgZWFybGllclxuICAgICAgICAgIC8vIGJlY2F1c2UgdGhlcmUgd2lsbCBiZSBubyByZXNwb25zZSBzZW50IGZyb20gdGhpcyBsaXN0ZW5lci5cbiAgICAgICAgICBpZiAocmVzdWx0ICE9PSB0cnVlICYmICFpc1Jlc3VsdFRoZW5hYmxlICYmICFkaWRDYWxsU2VuZFJlc3BvbnNlKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gQSBzbWFsbCBoZWxwZXIgdG8gc2VuZCB0aGUgbWVzc2FnZSBpZiB0aGUgcHJvbWlzZSByZXNvbHZlc1xuICAgICAgICAgIC8vIGFuZCBhbiBlcnJvciBpZiB0aGUgcHJvbWlzZSByZWplY3RzIChhIHdyYXBwZWQgc2VuZE1lc3NhZ2UgaGFzXG4gICAgICAgICAgLy8gdG8gdHJhbnNsYXRlIHRoZSBtZXNzYWdlIGludG8gYSByZXNvbHZlZCBwcm9taXNlIG9yIGEgcmVqZWN0ZWRcbiAgICAgICAgICAvLyBwcm9taXNlKS5cbiAgICAgICAgICBjb25zdCBzZW5kUHJvbWlzZWRSZXN1bHQgPSBwcm9taXNlID0+IHtcbiAgICAgICAgICAgIHByb21pc2UudGhlbihtc2cgPT4ge1xuICAgICAgICAgICAgICAvLyBzZW5kIHRoZSBtZXNzYWdlIHZhbHVlLlxuICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UobXNnKTtcbiAgICAgICAgICAgIH0sIGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gU2VuZCBhIEpTT04gcmVwcmVzZW50YXRpb24gb2YgdGhlIGVycm9yIGlmIHRoZSByZWplY3RlZCB2YWx1ZVxuICAgICAgICAgICAgICAvLyBpcyBhbiBpbnN0YW5jZSBvZiBlcnJvciwgb3IgdGhlIG9iamVjdCBpdHNlbGYgb3RoZXJ3aXNlLlxuICAgICAgICAgICAgICBsZXQgbWVzc2FnZTtcbiAgICAgICAgICAgICAgaWYgKGVycm9yICYmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yIHx8IHR5cGVvZiBlcnJvci5tZXNzYWdlID09PSBcInN0cmluZ1wiKSkge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBlcnJvci5tZXNzYWdlO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIkFuIHVuZXhwZWN0ZWQgZXJyb3Igb2NjdXJyZWRcIjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBzZW5kUmVzcG9uc2Uoe1xuICAgICAgICAgICAgICAgIF9fbW96V2ViRXh0ZW5zaW9uUG9seWZpbGxSZWplY3RfXzogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgLy8gUHJpbnQgYW4gZXJyb3Igb24gdGhlIGNvbnNvbGUgaWYgdW5hYmxlIHRvIHNlbmQgdGhlIHJlc3BvbnNlLlxuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHNlbmQgb25NZXNzYWdlIHJlamVjdGVkIHJlcGx5XCIsIGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgLy8gSWYgdGhlIGxpc3RlbmVyIHJldHVybmVkIGEgUHJvbWlzZSwgc2VuZCB0aGUgcmVzb2x2ZWQgdmFsdWUgYXMgYVxuICAgICAgICAgIC8vIHJlc3VsdCwgb3RoZXJ3aXNlIHdhaXQgdGhlIHByb21pc2UgcmVsYXRlZCB0byB0aGUgd3JhcHBlZFNlbmRSZXNwb25zZVxuICAgICAgICAgIC8vIGNhbGxiYWNrIHRvIHJlc29sdmUgYW5kIHNlbmQgaXQgYXMgYSByZXNwb25zZS5cbiAgICAgICAgICBpZiAoaXNSZXN1bHRUaGVuYWJsZSkge1xuICAgICAgICAgICAgc2VuZFByb21pc2VkUmVzdWx0KHJlc3VsdCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNlbmRQcm9taXNlZFJlc3VsdChzZW5kUmVzcG9uc2VQcm9taXNlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBMZXQgQ2hyb21lIGtub3cgdGhhdCB0aGUgbGlzdGVuZXIgaXMgcmVwbHlpbmcuXG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHdyYXBwZWRTZW5kTWVzc2FnZUNhbGxiYWNrID0gKHtcbiAgICAgICAgcmVqZWN0LFxuICAgICAgICByZXNvbHZlXG4gICAgICB9LCByZXBseSkgPT4ge1xuICAgICAgICBpZiAoZXh0ZW5zaW9uQVBJcy5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICAgIC8vIERldGVjdCB3aGVuIG5vbmUgb2YgdGhlIGxpc3RlbmVycyByZXBsaWVkIHRvIHRoZSBzZW5kTWVzc2FnZSBjYWxsIGFuZCByZXNvbHZlXG4gICAgICAgICAgLy8gdGhlIHByb21pc2UgdG8gdW5kZWZpbmVkIGFzIGluIEZpcmVmb3guXG4gICAgICAgICAgLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9tb3ppbGxhL3dlYmV4dGVuc2lvbi1wb2x5ZmlsbC9pc3N1ZXMvMTMwXG4gICAgICAgICAgaWYgKGV4dGVuc2lvbkFQSXMucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSA9PT0gQ0hST01FX1NFTkRfTUVTU0FHRV9DQUxMQkFDS19OT19SRVNQT05TRV9NRVNTQUdFKSB7XG4gICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoZXh0ZW5zaW9uQVBJcy5ydW50aW1lLmxhc3RFcnJvci5tZXNzYWdlKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHJlcGx5ICYmIHJlcGx5Ll9fbW96V2ViRXh0ZW5zaW9uUG9seWZpbGxSZWplY3RfXykge1xuICAgICAgICAgIC8vIENvbnZlcnQgYmFjayB0aGUgSlNPTiByZXByZXNlbnRhdGlvbiBvZiB0aGUgZXJyb3IgaW50b1xuICAgICAgICAgIC8vIGFuIEVycm9yIGluc3RhbmNlLlxuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IocmVwbHkubWVzc2FnZSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc29sdmUocmVwbHkpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgY29uc3Qgd3JhcHBlZFNlbmRNZXNzYWdlID0gKG5hbWUsIG1ldGFkYXRhLCBhcGlOYW1lc3BhY2VPYmosIC4uLmFyZ3MpID0+IHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDwgbWV0YWRhdGEubWluQXJncykge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgYXQgbGVhc3QgJHttZXRhZGF0YS5taW5BcmdzfSAke3BsdXJhbGl6ZUFyZ3VtZW50cyhtZXRhZGF0YS5taW5BcmdzKX0gZm9yICR7bmFtZX0oKSwgZ290ICR7YXJncy5sZW5ndGh9YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gbWV0YWRhdGEubWF4QXJncykge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgYXQgbW9zdCAke21ldGFkYXRhLm1heEFyZ3N9ICR7cGx1cmFsaXplQXJndW1lbnRzKG1ldGFkYXRhLm1heEFyZ3MpfSBmb3IgJHtuYW1lfSgpLCBnb3QgJHthcmdzLmxlbmd0aH1gKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHdyYXBwZWRDYiA9IHdyYXBwZWRTZW5kTWVzc2FnZUNhbGxiYWNrLmJpbmQobnVsbCwge1xuICAgICAgICAgICAgcmVzb2x2ZSxcbiAgICAgICAgICAgIHJlamVjdFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGFyZ3MucHVzaCh3cmFwcGVkQ2IpO1xuICAgICAgICAgIGFwaU5hbWVzcGFjZU9iai5zZW5kTWVzc2FnZSguLi5hcmdzKTtcbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgICAgY29uc3Qgc3RhdGljV3JhcHBlcnMgPSB7XG4gICAgICAgIGRldnRvb2xzOiB7XG4gICAgICAgICAgbmV0d29yazoge1xuICAgICAgICAgICAgb25SZXF1ZXN0RmluaXNoZWQ6IHdyYXBFdmVudChvblJlcXVlc3RGaW5pc2hlZFdyYXBwZXJzKVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcnVudGltZToge1xuICAgICAgICAgIG9uTWVzc2FnZTogd3JhcEV2ZW50KG9uTWVzc2FnZVdyYXBwZXJzKSxcbiAgICAgICAgICBvbk1lc3NhZ2VFeHRlcm5hbDogd3JhcEV2ZW50KG9uTWVzc2FnZVdyYXBwZXJzKSxcbiAgICAgICAgICBzZW5kTWVzc2FnZTogd3JhcHBlZFNlbmRNZXNzYWdlLmJpbmQobnVsbCwgXCJzZW5kTWVzc2FnZVwiLCB7XG4gICAgICAgICAgICBtaW5BcmdzOiAxLFxuICAgICAgICAgICAgbWF4QXJnczogM1xuICAgICAgICAgIH0pXG4gICAgICAgIH0sXG4gICAgICAgIHRhYnM6IHtcbiAgICAgICAgICBzZW5kTWVzc2FnZTogd3JhcHBlZFNlbmRNZXNzYWdlLmJpbmQobnVsbCwgXCJzZW5kTWVzc2FnZVwiLCB7XG4gICAgICAgICAgICBtaW5BcmdzOiAyLFxuICAgICAgICAgICAgbWF4QXJnczogM1xuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBjb25zdCBzZXR0aW5nTWV0YWRhdGEgPSB7XG4gICAgICAgIGNsZWFyOiB7XG4gICAgICAgICAgbWluQXJnczogMSxcbiAgICAgICAgICBtYXhBcmdzOiAxXG4gICAgICAgIH0sXG4gICAgICAgIGdldDoge1xuICAgICAgICAgIG1pbkFyZ3M6IDEsXG4gICAgICAgICAgbWF4QXJnczogMVxuICAgICAgICB9LFxuICAgICAgICBzZXQ6IHtcbiAgICAgICAgICBtaW5BcmdzOiAxLFxuICAgICAgICAgIG1heEFyZ3M6IDFcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGFwaU1ldGFkYXRhLnByaXZhY3kgPSB7XG4gICAgICAgIG5ldHdvcms6IHtcbiAgICAgICAgICBcIipcIjogc2V0dGluZ01ldGFkYXRhXG4gICAgICAgIH0sXG4gICAgICAgIHNlcnZpY2VzOiB7XG4gICAgICAgICAgXCIqXCI6IHNldHRpbmdNZXRhZGF0YVxuICAgICAgICB9LFxuICAgICAgICB3ZWJzaXRlczoge1xuICAgICAgICAgIFwiKlwiOiBzZXR0aW5nTWV0YWRhdGFcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIHJldHVybiB3cmFwT2JqZWN0KGV4dGVuc2lvbkFQSXMsIHN0YXRpY1dyYXBwZXJzLCBhcGlNZXRhZGF0YSk7XG4gICAgfTtcblxuICAgIC8vIFRoZSBidWlsZCBwcm9jZXNzIGFkZHMgYSBVTUQgd3JhcHBlciBhcm91bmQgdGhpcyBmaWxlLCB3aGljaCBtYWtlcyB0aGVcbiAgICAvLyBgbW9kdWxlYCB2YXJpYWJsZSBhdmFpbGFibGUuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB3cmFwQVBJcyhjaHJvbWUpO1xuICB9IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZ2xvYmFsVGhpcy5icm93c2VyO1xuICB9XG59KTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWJyb3dzZXItcG9seWZpbGwuanMubWFwXG4iLCJpbXBvcnQgb3JpZ2luYWxCcm93c2VyIGZyb20gXCJ3ZWJleHRlbnNpb24tcG9seWZpbGxcIjtcbmV4cG9ydCBjb25zdCBicm93c2VyID0gb3JpZ2luYWxCcm93c2VyO1xuIiwiZnVuY3Rpb24gcHJpbnQobWV0aG9kLCAuLi5hcmdzKSB7XG4gIGlmIChpbXBvcnQubWV0YS5lbnYuTU9ERSA9PT0gXCJwcm9kdWN0aW9uXCIpIHJldHVybjtcbiAgaWYgKHR5cGVvZiBhcmdzWzBdID09PSBcInN0cmluZ1wiKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGFyZ3Muc2hpZnQoKTtcbiAgICBtZXRob2QoYFt3eHRdICR7bWVzc2FnZX1gLCAuLi5hcmdzKTtcbiAgfSBlbHNlIHtcbiAgICBtZXRob2QoXCJbd3h0XVwiLCAuLi5hcmdzKTtcbiAgfVxufVxuZXhwb3J0IGNvbnN0IGxvZ2dlciA9IHtcbiAgZGVidWc6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmRlYnVnLCAuLi5hcmdzKSxcbiAgbG9nOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5sb2csIC4uLmFyZ3MpLFxuICB3YXJuOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS53YXJuLCAuLi5hcmdzKSxcbiAgZXJyb3I6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmVycm9yLCAuLi5hcmdzKVxufTtcbiIsImltcG9ydCB7IGJyb3dzZXIgfSBmcm9tIFwid3h0L2Jyb3dzZXJcIjtcbmV4cG9ydCBjbGFzcyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50IGV4dGVuZHMgRXZlbnQge1xuICBjb25zdHJ1Y3RvcihuZXdVcmwsIG9sZFVybCkge1xuICAgIHN1cGVyKFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQuRVZFTlRfTkFNRSwge30pO1xuICAgIHRoaXMubmV3VXJsID0gbmV3VXJsO1xuICAgIHRoaXMub2xkVXJsID0gb2xkVXJsO1xuICB9XG4gIHN0YXRpYyBFVkVOVF9OQU1FID0gZ2V0VW5pcXVlRXZlbnROYW1lKFwid3h0OmxvY2F0aW9uY2hhbmdlXCIpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGdldFVuaXF1ZUV2ZW50TmFtZShldmVudE5hbWUpIHtcbiAgcmV0dXJuIGAke2Jyb3dzZXI/LnJ1bnRpbWU/LmlkfToke2ltcG9ydC5tZXRhLmVudi5FTlRSWVBPSU5UfToke2V2ZW50TmFtZX1gO1xufVxuIiwiaW1wb3J0IHsgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCB9IGZyb20gXCIuL2N1c3RvbS1ldmVudHMubWpzXCI7XG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTG9jYXRpb25XYXRjaGVyKGN0eCkge1xuICBsZXQgaW50ZXJ2YWw7XG4gIGxldCBvbGRVcmw7XG4gIHJldHVybiB7XG4gICAgLyoqXG4gICAgICogRW5zdXJlIHRoZSBsb2NhdGlvbiB3YXRjaGVyIGlzIGFjdGl2ZWx5IGxvb2tpbmcgZm9yIFVSTCBjaGFuZ2VzLiBJZiBpdCdzIGFscmVhZHkgd2F0Y2hpbmcsXG4gICAgICogdGhpcyBpcyBhIG5vb3AuXG4gICAgICovXG4gICAgcnVuKCkge1xuICAgICAgaWYgKGludGVydmFsICE9IG51bGwpIHJldHVybjtcbiAgICAgIG9sZFVybCA9IG5ldyBVUkwobG9jYXRpb24uaHJlZik7XG4gICAgICBpbnRlcnZhbCA9IGN0eC5zZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgIGxldCBuZXdVcmwgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpO1xuICAgICAgICBpZiAobmV3VXJsLmhyZWYgIT09IG9sZFVybC5ocmVmKSB7XG4gICAgICAgICAgd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQobmV3VXJsLCBvbGRVcmwpKTtcbiAgICAgICAgICBvbGRVcmwgPSBuZXdVcmw7XG4gICAgICAgIH1cbiAgICAgIH0sIDFlMyk7XG4gICAgfVxuICB9O1xufVxuIiwiaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gXCJ3eHQvYnJvd3NlclwiO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSBcIi4uLy4uL3NhbmRib3gvdXRpbHMvbG9nZ2VyLm1qc1wiO1xuaW1wb3J0IHsgZ2V0VW5pcXVlRXZlbnROYW1lIH0gZnJvbSBcIi4vY3VzdG9tLWV2ZW50cy5tanNcIjtcbmltcG9ydCB7IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlciB9IGZyb20gXCIuL2xvY2F0aW9uLXdhdGNoZXIubWpzXCI7XG5leHBvcnQgY2xhc3MgQ29udGVudFNjcmlwdENvbnRleHQge1xuICBjb25zdHJ1Y3Rvcihjb250ZW50U2NyaXB0TmFtZSwgb3B0aW9ucykge1xuICAgIHRoaXMuY29udGVudFNjcmlwdE5hbWUgPSBjb250ZW50U2NyaXB0TmFtZTtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgIHRoaXMuYWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgIGlmICh0aGlzLmlzVG9wRnJhbWUpIHtcbiAgICAgIHRoaXMubGlzdGVuRm9yTmV3ZXJTY3JpcHRzKHsgaWdub3JlRmlyc3RFdmVudDogdHJ1ZSB9KTtcbiAgICAgIHRoaXMuc3RvcE9sZFNjcmlwdHMoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5saXN0ZW5Gb3JOZXdlclNjcmlwdHMoKTtcbiAgICB9XG4gIH1cbiAgc3RhdGljIFNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcbiAgICBcInd4dDpjb250ZW50LXNjcmlwdC1zdGFydGVkXCJcbiAgKTtcbiAgaXNUb3BGcmFtZSA9IHdpbmRvdy5zZWxmID09PSB3aW5kb3cudG9wO1xuICBhYm9ydENvbnRyb2xsZXI7XG4gIGxvY2F0aW9uV2F0Y2hlciA9IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcih0aGlzKTtcbiAgcmVjZWl2ZWRNZXNzYWdlSWRzID0gLyogQF9fUFVSRV9fICovIG5ldyBTZXQoKTtcbiAgZ2V0IHNpZ25hbCgpIHtcbiAgICByZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuc2lnbmFsO1xuICB9XG4gIGFib3J0KHJlYXNvbikge1xuICAgIHJldHVybiB0aGlzLmFib3J0Q29udHJvbGxlci5hYm9ydChyZWFzb24pO1xuICB9XG4gIGdldCBpc0ludmFsaWQoKSB7XG4gICAgaWYgKGJyb3dzZXIucnVudGltZS5pZCA9PSBudWxsKSB7XG4gICAgICB0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNpZ25hbC5hYm9ydGVkO1xuICB9XG4gIGdldCBpc1ZhbGlkKCkge1xuICAgIHJldHVybiAhdGhpcy5pc0ludmFsaWQ7XG4gIH1cbiAgLyoqXG4gICAqIEFkZCBhIGxpc3RlbmVyIHRoYXQgaXMgY2FsbGVkIHdoZW4gdGhlIGNvbnRlbnQgc2NyaXB0J3MgY29udGV4dCBpcyBpbnZhbGlkYXRlZC5cbiAgICpcbiAgICogQHJldHVybnMgQSBmdW5jdGlvbiB0byByZW1vdmUgdGhlIGxpc3RlbmVyLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKGNiKTtcbiAgICogY29uc3QgcmVtb3ZlSW52YWxpZGF0ZWRMaXN0ZW5lciA9IGN0eC5vbkludmFsaWRhdGVkKCgpID0+IHtcbiAgICogICBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLnJlbW92ZUxpc3RlbmVyKGNiKTtcbiAgICogfSlcbiAgICogLy8gLi4uXG4gICAqIHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIoKTtcbiAgICovXG4gIG9uSW52YWxpZGF0ZWQoY2IpIHtcbiAgICB0aGlzLnNpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuICAgIHJldHVybiAoKSA9PiB0aGlzLnNpZ25hbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuICB9XG4gIC8qKlxuICAgKiBSZXR1cm4gYSBwcm9taXNlIHRoYXQgbmV2ZXIgcmVzb2x2ZXMuIFVzZWZ1bCBpZiB5b3UgaGF2ZSBhbiBhc3luYyBmdW5jdGlvbiB0aGF0IHNob3VsZG4ndCBydW5cbiAgICogYWZ0ZXIgdGhlIGNvbnRleHQgaXMgZXhwaXJlZC5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogY29uc3QgZ2V0VmFsdWVGcm9tU3RvcmFnZSA9IGFzeW5jICgpID0+IHtcbiAgICogICBpZiAoY3R4LmlzSW52YWxpZCkgcmV0dXJuIGN0eC5ibG9jaygpO1xuICAgKlxuICAgKiAgIC8vIC4uLlxuICAgKiB9XG4gICAqL1xuICBibG9jaygpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKCkgPT4ge1xuICAgIH0pO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnNldEludGVydmFsYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuICAgKi9cbiAgc2V0SW50ZXJ2YWwoaGFuZGxlciwgdGltZW91dCkge1xuICAgIGNvbnN0IGlkID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuaXNWYWxpZCkgaGFuZGxlcigpO1xuICAgIH0sIHRpbWVvdXQpO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjbGVhckludGVydmFsKGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnNldFRpbWVvdXRgIHRoYXQgYXV0b21hdGljYWxseSBjbGVhcnMgdGhlIGludGVydmFsIHdoZW4gaW52YWxpZGF0ZWQuXG4gICAqL1xuICBzZXRUaW1lb3V0KGhhbmRsZXIsIHRpbWVvdXQpIHtcbiAgICBjb25zdCBpZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuaXNWYWxpZCkgaGFuZGxlcigpO1xuICAgIH0sIHRpbWVvdXQpO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjbGVhclRpbWVvdXQoaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgLyoqXG4gICAqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2FuY2VscyB0aGUgcmVxdWVzdCB3aGVuXG4gICAqIGludmFsaWRhdGVkLlxuICAgKi9cbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGNhbGxiYWNrKSB7XG4gICAgY29uc3QgaWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKC4uLmFyZ3MpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGNhbGxiYWNrKC4uLmFyZ3MpO1xuICAgIH0pO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjYW5jZWxBbmltYXRpb25GcmFtZShpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5yZXF1ZXN0SWRsZUNhbGxiYWNrYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2FuY2VscyB0aGUgcmVxdWVzdCB3aGVuXG4gICAqIGludmFsaWRhdGVkLlxuICAgKi9cbiAgcmVxdWVzdElkbGVDYWxsYmFjayhjYWxsYmFjaywgb3B0aW9ucykge1xuICAgIGNvbnN0IGlkID0gcmVxdWVzdElkbGVDYWxsYmFjaygoLi4uYXJncykgPT4ge1xuICAgICAgaWYgKCF0aGlzLnNpZ25hbC5hYm9ydGVkKSBjYWxsYmFjayguLi5hcmdzKTtcbiAgICB9LCBvcHRpb25zKTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsSWRsZUNhbGxiYWNrKGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIGFkZEV2ZW50TGlzdGVuZXIodGFyZ2V0LCB0eXBlLCBoYW5kbGVyLCBvcHRpb25zKSB7XG4gICAgaWYgKHR5cGUgPT09IFwid3h0OmxvY2F0aW9uY2hhbmdlXCIpIHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIHRoaXMubG9jYXRpb25XYXRjaGVyLnJ1bigpO1xuICAgIH1cbiAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcj8uKFxuICAgICAgdHlwZS5zdGFydHNXaXRoKFwid3h0OlwiKSA/IGdldFVuaXF1ZUV2ZW50TmFtZSh0eXBlKSA6IHR5cGUsXG4gICAgICBoYW5kbGVyLFxuICAgICAge1xuICAgICAgICAuLi5vcHRpb25zLFxuICAgICAgICBzaWduYWw6IHRoaXMuc2lnbmFsXG4gICAgICB9XG4gICAgKTtcbiAgfVxuICAvKipcbiAgICogQGludGVybmFsXG4gICAqIEFib3J0IHRoZSBhYm9ydCBjb250cm9sbGVyIGFuZCBleGVjdXRlIGFsbCBgb25JbnZhbGlkYXRlZGAgbGlzdGVuZXJzLlxuICAgKi9cbiAgbm90aWZ5SW52YWxpZGF0ZWQoKSB7XG4gICAgdGhpcy5hYm9ydChcIkNvbnRlbnQgc2NyaXB0IGNvbnRleHQgaW52YWxpZGF0ZWRcIik7XG4gICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgYENvbnRlbnQgc2NyaXB0IFwiJHt0aGlzLmNvbnRlbnRTY3JpcHROYW1lfVwiIGNvbnRleHQgaW52YWxpZGF0ZWRgXG4gICAgKTtcbiAgfVxuICBzdG9wT2xkU2NyaXB0cygpIHtcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2UoXG4gICAgICB7XG4gICAgICAgIHR5cGU6IENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSxcbiAgICAgICAgY29udGVudFNjcmlwdE5hbWU6IHRoaXMuY29udGVudFNjcmlwdE5hbWUsXG4gICAgICAgIG1lc3NhZ2VJZDogTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMilcbiAgICAgIH0sXG4gICAgICBcIipcIlxuICAgICk7XG4gIH1cbiAgdmVyaWZ5U2NyaXB0U3RhcnRlZEV2ZW50KGV2ZW50KSB7XG4gICAgY29uc3QgaXNTY3JpcHRTdGFydGVkRXZlbnQgPSBldmVudC5kYXRhPy50eXBlID09PSBDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEU7XG4gICAgY29uc3QgaXNTYW1lQ29udGVudFNjcmlwdCA9IGV2ZW50LmRhdGE/LmNvbnRlbnRTY3JpcHROYW1lID09PSB0aGlzLmNvbnRlbnRTY3JpcHROYW1lO1xuICAgIGNvbnN0IGlzTm90RHVwbGljYXRlID0gIXRoaXMucmVjZWl2ZWRNZXNzYWdlSWRzLmhhcyhldmVudC5kYXRhPy5tZXNzYWdlSWQpO1xuICAgIHJldHVybiBpc1NjcmlwdFN0YXJ0ZWRFdmVudCAmJiBpc1NhbWVDb250ZW50U2NyaXB0ICYmIGlzTm90RHVwbGljYXRlO1xuICB9XG4gIGxpc3RlbkZvck5ld2VyU2NyaXB0cyhvcHRpb25zKSB7XG4gICAgbGV0IGlzRmlyc3QgPSB0cnVlO1xuICAgIGNvbnN0IGNiID0gKGV2ZW50KSA9PiB7XG4gICAgICBpZiAodGhpcy52ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpKSB7XG4gICAgICAgIHRoaXMucmVjZWl2ZWRNZXNzYWdlSWRzLmFkZChldmVudC5kYXRhLm1lc3NhZ2VJZCk7XG4gICAgICAgIGNvbnN0IHdhc0ZpcnN0ID0gaXNGaXJzdDtcbiAgICAgICAgaXNGaXJzdCA9IGZhbHNlO1xuICAgICAgICBpZiAod2FzRmlyc3QgJiYgb3B0aW9ucz8uaWdub3JlRmlyc3RFdmVudCkgcmV0dXJuO1xuICAgICAgICB0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG4gICAgICB9XG4gICAgfTtcbiAgICBhZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCBjYik7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IHJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIGNiKSk7XG4gIH1cbn1cbiIsImNvbnN0IG51bGxLZXkgPSBTeW1ib2woJ251bGwnKTsgLy8gYG9iamVjdEhhc2hlc2Aga2V5IGZvciBudWxsXG5cbmxldCBrZXlDb3VudGVyID0gMDtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTWFueUtleXNNYXAgZXh0ZW5kcyBNYXAge1xuXHRjb25zdHJ1Y3RvciguLi5hcmd1bWVudHNfKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX29iamVjdEhhc2hlcyA9IG5ldyBXZWFrTWFwKCk7XG5cdFx0dGhpcy5fc3ltYm9sSGFzaGVzID0gbmV3IE1hcCgpOyAvLyBodHRwczovL2dpdGh1Yi5jb20vdGMzOS9lY21hMjYyL2lzc3Vlcy8xMTk0XG5cdFx0dGhpcy5fcHVibGljS2V5cyA9IG5ldyBNYXAoKTtcblxuXHRcdGNvbnN0IFtwYWlyc10gPSBhcmd1bWVudHNfOyAvLyBNYXAgY29tcGF0XG5cdFx0aWYgKHBhaXJzID09PSBudWxsIHx8IHBhaXJzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHBhaXJzW1N5bWJvbC5pdGVyYXRvcl0gIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHRocm93IG5ldyBUeXBlRXJyb3IodHlwZW9mIHBhaXJzICsgJyBpcyBub3QgaXRlcmFibGUgKGNhbm5vdCByZWFkIHByb3BlcnR5IFN5bWJvbChTeW1ib2wuaXRlcmF0b3IpKScpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW2tleXMsIHZhbHVlXSBvZiBwYWlycykge1xuXHRcdFx0dGhpcy5zZXQoa2V5cywgdmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdF9nZXRQdWJsaWNLZXlzKGtleXMsIGNyZWF0ZSA9IGZhbHNlKSB7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KGtleXMpKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdUaGUga2V5cyBwYXJhbWV0ZXIgbXVzdCBiZSBhbiBhcnJheScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByaXZhdGVLZXkgPSB0aGlzLl9nZXRQcml2YXRlS2V5KGtleXMsIGNyZWF0ZSk7XG5cblx0XHRsZXQgcHVibGljS2V5O1xuXHRcdGlmIChwcml2YXRlS2V5ICYmIHRoaXMuX3B1YmxpY0tleXMuaGFzKHByaXZhdGVLZXkpKSB7XG5cdFx0XHRwdWJsaWNLZXkgPSB0aGlzLl9wdWJsaWNLZXlzLmdldChwcml2YXRlS2V5KTtcblx0XHR9IGVsc2UgaWYgKGNyZWF0ZSkge1xuXHRcdFx0cHVibGljS2V5ID0gWy4uLmtleXNdOyAvLyBSZWdlbmVyYXRlIGtleXMgYXJyYXkgdG8gYXZvaWQgZXh0ZXJuYWwgaW50ZXJhY3Rpb25cblx0XHRcdHRoaXMuX3B1YmxpY0tleXMuc2V0KHByaXZhdGVLZXksIHB1YmxpY0tleSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtwcml2YXRlS2V5LCBwdWJsaWNLZXl9O1xuXHR9XG5cblx0X2dldFByaXZhdGVLZXkoa2V5cywgY3JlYXRlID0gZmFsc2UpIHtcblx0XHRjb25zdCBwcml2YXRlS2V5cyA9IFtdO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRcdGNvbnN0IGtleVRvUGFzcyA9IGtleSA9PT0gbnVsbCA/IG51bGxLZXkgOiBrZXk7XG5cblx0XHRcdGxldCBoYXNoZXM7XG5cdFx0XHRpZiAodHlwZW9mIGtleVRvUGFzcyA9PT0gJ29iamVjdCcgfHwgdHlwZW9mIGtleVRvUGFzcyA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRoYXNoZXMgPSAnX29iamVjdEhhc2hlcyc7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBrZXlUb1Bhc3MgPT09ICdzeW1ib2wnKSB7XG5cdFx0XHRcdGhhc2hlcyA9ICdfc3ltYm9sSGFzaGVzJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhhc2hlcyA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWhhc2hlcykge1xuXHRcdFx0XHRwcml2YXRlS2V5cy5wdXNoKGtleVRvUGFzcyk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXNbaGFzaGVzXS5oYXMoa2V5VG9QYXNzKSkge1xuXHRcdFx0XHRwcml2YXRlS2V5cy5wdXNoKHRoaXNbaGFzaGVzXS5nZXQoa2V5VG9QYXNzKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNyZWF0ZSkge1xuXHRcdFx0XHRjb25zdCBwcml2YXRlS2V5ID0gYEBAbWttLXJlZi0ke2tleUNvdW50ZXIrK31AQGA7XG5cdFx0XHRcdHRoaXNbaGFzaGVzXS5zZXQoa2V5VG9QYXNzLCBwcml2YXRlS2V5KTtcblx0XHRcdFx0cHJpdmF0ZUtleXMucHVzaChwcml2YXRlS2V5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkocHJpdmF0ZUtleXMpO1xuXHR9XG5cblx0c2V0KGtleXMsIHZhbHVlKSB7XG5cdFx0Y29uc3Qge3B1YmxpY0tleX0gPSB0aGlzLl9nZXRQdWJsaWNLZXlzKGtleXMsIHRydWUpO1xuXHRcdHJldHVybiBzdXBlci5zZXQocHVibGljS2V5LCB2YWx1ZSk7XG5cdH1cblxuXHRnZXQoa2V5cykge1xuXHRcdGNvbnN0IHtwdWJsaWNLZXl9ID0gdGhpcy5fZ2V0UHVibGljS2V5cyhrZXlzKTtcblx0XHRyZXR1cm4gc3VwZXIuZ2V0KHB1YmxpY0tleSk7XG5cdH1cblxuXHRoYXMoa2V5cykge1xuXHRcdGNvbnN0IHtwdWJsaWNLZXl9ID0gdGhpcy5fZ2V0UHVibGljS2V5cyhrZXlzKTtcblx0XHRyZXR1cm4gc3VwZXIuaGFzKHB1YmxpY0tleSk7XG5cdH1cblxuXHRkZWxldGUoa2V5cykge1xuXHRcdGNvbnN0IHtwdWJsaWNLZXksIHByaXZhdGVLZXl9ID0gdGhpcy5fZ2V0UHVibGljS2V5cyhrZXlzKTtcblx0XHRyZXR1cm4gQm9vbGVhbihwdWJsaWNLZXkgJiYgc3VwZXIuZGVsZXRlKHB1YmxpY0tleSkgJiYgdGhpcy5fcHVibGljS2V5cy5kZWxldGUocHJpdmF0ZUtleSkpO1xuXHR9XG5cblx0Y2xlYXIoKSB7XG5cdFx0c3VwZXIuY2xlYXIoKTtcblx0XHR0aGlzLl9zeW1ib2xIYXNoZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9wdWJsaWNLZXlzLmNsZWFyKCk7XG5cdH1cblxuXHRnZXQgW1N5bWJvbC50b1N0cmluZ1RhZ10oKSB7XG5cdFx0cmV0dXJuICdNYW55S2V5c01hcCc7XG5cdH1cblxuXHRnZXQgc2l6ZSgpIHtcblx0XHRyZXR1cm4gc3VwZXIuc2l6ZTtcblx0fVxufVxuIiwiaW1wb3J0IE1hbnlLZXlzTWFwIGZyb20gJ21hbnkta2V5cy1tYXAnO1xuaW1wb3J0IHsgZGVmdSB9IGZyb20gJ2RlZnUnO1xuaW1wb3J0IHsgaXNFeGlzdCB9IGZyb20gJy4vZGV0ZWN0b3JzLm1qcyc7XG5cbmNvbnN0IGdldERlZmF1bHRPcHRpb25zID0gKCkgPT4gKHtcbiAgdGFyZ2V0OiBnbG9iYWxUaGlzLmRvY3VtZW50LFxuICB1bmlmeVByb2Nlc3M6IHRydWUsXG4gIGRldGVjdG9yOiBpc0V4aXN0LFxuICBvYnNlcnZlQ29uZmlnczoge1xuICAgIGNoaWxkTGlzdDogdHJ1ZSxcbiAgICBzdWJ0cmVlOiB0cnVlLFxuICAgIGF0dHJpYnV0ZXM6IHRydWVcbiAgfSxcbiAgc2lnbmFsOiB2b2lkIDAsXG4gIGN1c3RvbU1hdGNoZXI6IHZvaWQgMFxufSk7XG5jb25zdCBtZXJnZU9wdGlvbnMgPSAodXNlclNpZGVPcHRpb25zLCBkZWZhdWx0T3B0aW9ucykgPT4ge1xuICByZXR1cm4gZGVmdSh1c2VyU2lkZU9wdGlvbnMsIGRlZmF1bHRPcHRpb25zKTtcbn07XG5cbmNvbnN0IHVuaWZ5Q2FjaGUgPSBuZXcgTWFueUtleXNNYXAoKTtcbmZ1bmN0aW9uIGNyZWF0ZVdhaXRFbGVtZW50KGluc3RhbmNlT3B0aW9ucykge1xuICBjb25zdCB7IGRlZmF1bHRPcHRpb25zIH0gPSBpbnN0YW5jZU9wdGlvbnM7XG4gIHJldHVybiAoc2VsZWN0b3IsIG9wdGlvbnMpID0+IHtcbiAgICBjb25zdCB7XG4gICAgICB0YXJnZXQsXG4gICAgICB1bmlmeVByb2Nlc3MsXG4gICAgICBvYnNlcnZlQ29uZmlncyxcbiAgICAgIGRldGVjdG9yLFxuICAgICAgc2lnbmFsLFxuICAgICAgY3VzdG9tTWF0Y2hlclxuICAgIH0gPSBtZXJnZU9wdGlvbnMob3B0aW9ucywgZGVmYXVsdE9wdGlvbnMpO1xuICAgIGNvbnN0IHVuaWZ5UHJvbWlzZUtleSA9IFtcbiAgICAgIHNlbGVjdG9yLFxuICAgICAgdGFyZ2V0LFxuICAgICAgdW5pZnlQcm9jZXNzLFxuICAgICAgb2JzZXJ2ZUNvbmZpZ3MsXG4gICAgICBkZXRlY3RvcixcbiAgICAgIHNpZ25hbCxcbiAgICAgIGN1c3RvbU1hdGNoZXJcbiAgICBdO1xuICAgIGNvbnN0IGNhY2hlZFByb21pc2UgPSB1bmlmeUNhY2hlLmdldCh1bmlmeVByb21pc2VLZXkpO1xuICAgIGlmICh1bmlmeVByb2Nlc3MgJiYgY2FjaGVkUHJvbWlzZSkge1xuICAgICAgcmV0dXJuIGNhY2hlZFByb21pc2U7XG4gICAgfVxuICAgIGNvbnN0IGRldGVjdFByb21pc2UgPSBuZXcgUHJvbWlzZShcbiAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Bc3luY1Byb21pc2VFeGVjdXRvcjogYXZvaWQgbmVzdGluZyBwcm9taXNlXG4gICAgICBhc3luYyAocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGlmIChzaWduYWw/LmFib3J0ZWQpIHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KHNpZ25hbC5yZWFzb24pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoXG4gICAgICAgICAgYXN5bmMgKG11dGF0aW9ucykgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBfIG9mIG11dGF0aW9ucykge1xuICAgICAgICAgICAgICBpZiAoc2lnbmFsPy5hYm9ydGVkKSB7XG4gICAgICAgICAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNvbnN0IGRldGVjdFJlc3VsdDIgPSBhd2FpdCBkZXRlY3RFbGVtZW50KHtcbiAgICAgICAgICAgICAgICBzZWxlY3RvcixcbiAgICAgICAgICAgICAgICB0YXJnZXQsXG4gICAgICAgICAgICAgICAgZGV0ZWN0b3IsXG4gICAgICAgICAgICAgICAgY3VzdG9tTWF0Y2hlclxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgaWYgKGRldGVjdFJlc3VsdDIuaXNEZXRlY3RlZCkge1xuICAgICAgICAgICAgICAgIG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGRldGVjdFJlc3VsdDIucmVzdWx0KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgc2lnbmFsPy5hZGRFdmVudExpc3RlbmVyKFxuICAgICAgICAgIFwiYWJvcnRcIixcbiAgICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICByZXR1cm4gcmVqZWN0KHNpZ25hbC5yZWFzb24pO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgeyBvbmNlOiB0cnVlIH1cbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgZGV0ZWN0UmVzdWx0ID0gYXdhaXQgZGV0ZWN0RWxlbWVudCh7XG4gICAgICAgICAgc2VsZWN0b3IsXG4gICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgIGRldGVjdG9yLFxuICAgICAgICAgIGN1c3RvbU1hdGNoZXJcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChkZXRlY3RSZXN1bHQuaXNEZXRlY3RlZCkge1xuICAgICAgICAgIHJldHVybiByZXNvbHZlKGRldGVjdFJlc3VsdC5yZXN1bHQpO1xuICAgICAgICB9XG4gICAgICAgIG9ic2VydmVyLm9ic2VydmUodGFyZ2V0LCBvYnNlcnZlQ29uZmlncyk7XG4gICAgICB9XG4gICAgKS5maW5hbGx5KCgpID0+IHtcbiAgICAgIHVuaWZ5Q2FjaGUuZGVsZXRlKHVuaWZ5UHJvbWlzZUtleSk7XG4gICAgfSk7XG4gICAgdW5pZnlDYWNoZS5zZXQodW5pZnlQcm9taXNlS2V5LCBkZXRlY3RQcm9taXNlKTtcbiAgICByZXR1cm4gZGV0ZWN0UHJvbWlzZTtcbiAgfTtcbn1cbmFzeW5jIGZ1bmN0aW9uIGRldGVjdEVsZW1lbnQoe1xuICB0YXJnZXQsXG4gIHNlbGVjdG9yLFxuICBkZXRlY3RvcixcbiAgY3VzdG9tTWF0Y2hlclxufSkge1xuICBjb25zdCBlbGVtZW50ID0gY3VzdG9tTWF0Y2hlciA/IGN1c3RvbU1hdGNoZXIoc2VsZWN0b3IpIDogdGFyZ2V0LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICByZXR1cm4gYXdhaXQgZGV0ZWN0b3IoZWxlbWVudCk7XG59XG5jb25zdCB3YWl0RWxlbWVudCA9IGNyZWF0ZVdhaXRFbGVtZW50KHtcbiAgZGVmYXVsdE9wdGlvbnM6IGdldERlZmF1bHRPcHRpb25zKClcbn0pO1xuXG5leHBvcnQgeyBjcmVhdGVXYWl0RWxlbWVudCwgZ2V0RGVmYXVsdE9wdGlvbnMsIHdhaXRFbGVtZW50IH07XG4iXSwibmFtZXMiOlsiZGVmaW5pdGlvbiIsInRoaXMiLCJtb2R1bGUiLCJwcm94eVRhcmdldCIsInZhbHVlIiwicmVzdWx0IiwibWVzc2FnZSIsInByaW50IiwibG9nZ2VyIl0sIm1hcHBpbmdzIjoiOzs7OztBQUFPLFdBQVMsb0JBQW9CQSxhQUFZO0FBQzlDLFdBQU9BO0FBQUEsRUFDVDtBQUFBLEVDYU8sTUFBTSxlQUFlO0FBQUEsSUFBckI7QUFDTCwwQ0FBb0M7QUFDNUIsaUVBQXNCLElBQUE7QUFBQTtBQUFBLElBRTlCLE1BQU0sa0JBQ0osY0FDQSxVQUNlO0FBQ2YsVUFBSTtBQUNGLGdCQUFRO0FBQUEsVUFDTjtBQUFBLFVBQ0E7QUFBQSxRQUFBO0FBTUYsWUFBSSxhQUFhLGFBQWEsaUJBQWlCLGVBQWU7QUFDNUQsa0JBQVE7QUFBQSxZQUNOLGlDQUFpQyxhQUFhLE9BQU8sVUFBVSw4QkFBOEIsYUFBYSxVQUFVO0FBQUEsVUFBQTtBQUV0SDtBQUFBLFFBQ0Y7QUFHQSxZQUFJLENBQUMsS0FBSyxjQUFjO0FBQ3RCLGVBQUssZUFBZSxJQUFJLGFBQUE7QUFBQSxRQUUxQjtBQUVBLFlBQUksUUFBUSxLQUFLLGdCQUFnQixJQUFJLFlBQVk7QUFFakQsWUFBSSxPQUFPO0FBQ1Qsa0JBQVE7QUFBQSxZQUNOLDhEQUNFLGFBQWEsT0FBTyxVQUN0QjtBQUFBLFVBQUE7QUFJRixjQUFJLGdCQUFnQjtBQUNwQixjQUFJLEtBQUssaUJBQWlCLE1BQU0sZUFBZSxhQUFhLGNBQWMsQ0FBQyxNQUFNLFNBQVM7QUFDeEYsb0JBQVE7QUFBQSxjQUNOLDhDQUNFLE1BQU0sVUFDUixPQUFPLGFBQWEsT0FBTyxVQUFVO0FBQUEsWUFBQTtBQUV2QyxnQkFBSSxNQUFNLFFBQVE7QUFFaEIsa0JBQUk7QUFDRixzQkFBTSxPQUFPLFdBQUE7QUFBQSxjQUNmLFNBQVMsR0FBRztBQUFBLGNBRVo7QUFBQSxZQUNGO0FBQ0Esa0JBQU0sU0FBUyxLQUFLLGFBQWEseUJB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
