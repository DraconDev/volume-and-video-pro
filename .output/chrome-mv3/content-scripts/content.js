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
  typeof localStorage !== "undefined" && localStorage.getItem("debugVvp") === "true";
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3d4dEAwLjE5LjI5X0B0eXBlcytub2RlQDI1LjYuMV9yb2xsdXBANC42MC4zL25vZGVfbW9kdWxlcy93eHQvZGlzdC9zYW5kYm94L2RlZmluZS1jb250ZW50LXNjcmlwdC5tanMiLCIuLi8uLi8uLi9zcmMvYXVkaW8tcHJvY2Vzc29yLnRzIiwiLi4vLi4vLi4vc3JjL21lZGlhLW1hbmFnZXIudHMiLCIuLi8uLi8uLi9zcmMvbWVkaWEtcHJvY2Vzc29yLnRzIiwiLi4vLi4vLi4vc3JjL3R5cGVzLnRzIiwiLi4vLi4vLi4vc3JjL3NldHRpbmdzLWhhbmRsZXIudHMiLCIuLi8uLi8uLi9zcmMvaWZyYW1lLWhvc3RuYW1lLWhhbmRsZXIudHMiLCIuLi8uLi8uLi9zcmMvY29udGVudC1zY3JpcHQvbWVkaWEtZXZlbnRzLnRzIiwiLi4vLi4vLi4vc3JjL2NvbnRlbnQtc2NyaXB0L21lc3NhZ2UtaGFuZGxlci50cyIsIi4uLy4uLy4uL3NyYy9jb250ZW50LXNjcmlwdC9kb20tbGlmZWN5Y2xlLnRzIiwiLi4vLi4vLi4vc3JjL2NvbnRlbnQtc2NyaXB0LWluaXQudHMiLCIuLi8uLi8uLi9lbnRyeXBvaW50cy9jb250ZW50LnRzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3dlYmV4dGVuc2lvbi1wb2x5ZmlsbEAwLjEyLjAvbm9kZV9tb2R1bGVzL3dlYmV4dGVuc2lvbi1wb2x5ZmlsbC9kaXN0L2Jyb3dzZXItcG9seWZpbGwuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIvaW5kZXgubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3d4dEAwLjE5LjI5X0B0eXBlcytub2RlQDI1LjYuMV9yb2xsdXBANC42MC4zL25vZGVfbW9kdWxlcy93eHQvZGlzdC9zYW5kYm94L3V0aWxzL2xvZ2dlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2NsaWVudC9jb250ZW50LXNjcmlwdHMvY3VzdG9tLWV2ZW50cy5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2NsaWVudC9jb250ZW50LXNjcmlwdHMvbG9jYXRpb24td2F0Y2hlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2NsaWVudC9jb250ZW50LXNjcmlwdHMvY29udGVudC1zY3JpcHQtY29udGV4dC5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vbWFueS1rZXlzLW1hcEAzLjAuMy9ub2RlX21vZHVsZXMvbWFueS1rZXlzLW1hcC9pbmRleC5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9AMW5hdHN1K3dhaXQtZWxlbWVudEA0LjIuMC9ub2RlX21vZHVsZXMvQDFuYXRzdS93YWl0LWVsZW1lbnQvZGlzdC9pbmRleC5tanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIGRlZmluZUNvbnRlbnRTY3JpcHQoZGVmaW5pdGlvbikge1xuICByZXR1cm4gZGVmaW5pdGlvbjtcbn1cbiIsImltcG9ydCB7IEF1ZGlvU2V0dGluZ3MgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEF1ZGlvTm9kZXMge1xuICBjb250ZXh0OiBBdWRpb0NvbnRleHQ7XG4gIHNvdXJjZTogTWVkaWFFbGVtZW50QXVkaW9Tb3VyY2VOb2RlO1xuICBnYWluOiBHYWluTm9kZTtcbiAgYmFzc0ZpbHRlcjogQmlxdWFkRmlsdGVyTm9kZTtcbiAgdm9pY2VGaWx0ZXI6IEJpcXVhZEZpbHRlck5vZGU7XG4gIG1lcmdlcjogQ2hhbm5lbE1lcmdlck5vZGU7XG4gIHNwbGl0dGVyOiBDaGFubmVsU3BsaXR0ZXJOb2RlO1xuICBlbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50O1xuICBtb25vOiBib29sZWFuOyAvLyBUcmFjayB0aGUgY3VycmVudCBtb25vIHNldHRpbmcgZm9yIHRoaXMgZWxlbWVudFxuICBjdXJyZW50U3JjOiBzdHJpbmc7IC8vIFRyYWNrIHRoZSBzcmMgdGhhdCB0aGUgc291cmNlIG5vZGUgd2FzIGNyZWF0ZWQgd2l0aFxufVxuXG5leHBvcnQgY2xhc3MgQXVkaW9Qcm9jZXNzb3Ige1xuICBhdWRpb0NvbnRleHQ6IEF1ZGlvQ29udGV4dCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGF1ZGlvRWxlbWVudE1hcCA9IG5ldyBNYXA8SFRNTE1lZGlhRWxlbWVudCwgQXVkaW9Ob2Rlcz4oKTtcblxuICBhc3luYyBzZXR1cEF1ZGlvQ29udGV4dChcbiAgICBtZWRpYUVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQsXG4gICAgc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3NcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBcIkF1ZGlvUHJvY2Vzc29yOiBTZXR0aW5nIHVwIGF1ZGlvIGNvbnRleHQgd2l0aCBzZXR0aW5nczpcIixcbiAgICAgICAgc2V0dGluZ3NcbiAgICAgICk7XG5cbiAgICAgIC8vIENoZWNrIGlmIHRoZSBtZWRpYSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIHVzZWQgYXMgYW4gYXVkaW8gc291cmNlXG4gICAgICAvLyBIVE1MTWVkaWFFbGVtZW50LkhBVkVfTUVUQURBVEEgKDEpIG1lYW5zIGVub3VnaCBkYXRhIGlzIGF2YWlsYWJsZSB0aGF0IHRoZSBkdXJhdGlvbiBvZiB0aGUgcmVzb3VyY2UgaXMgYXZhaWxhYmxlLlxuICAgICAgLy8gY3JlYXRlTWVkaWFFbGVtZW50U291cmNlIHR5cGljYWxseSByZXF1aXJlcyBhdCBsZWFzdCBIQVZFX01FVEFEQVRBLlxuICAgICAgaWYgKG1lZGlhRWxlbWVudC5yZWFkeVN0YXRlIDwgSFRNTE1lZGlhRWxlbWVudC5IQVZFX01FVEFEQVRBKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBgQXVkaW9Qcm9jZXNzb3I6IE1lZGlhIGVsZW1lbnQgJHttZWRpYUVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIn0gaXMgbm90IHJlYWR5IChyZWFkeVN0YXRlOiAke21lZGlhRWxlbWVudC5yZWFkeVN0YXRlfSkuIERlZmVycmluZyBhdWRpbyBjb250ZXh0IHNldHVwLmBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuOyAvLyBEZWZlciBwcm9jZXNzaW5nIHVudGlsIHRoZSBlbGVtZW50IGlzIHJlYWR5XG4gICAgICB9XG5cbiAgICAgIC8vIEluaXRpYWxpemUgYXVkaW8gY29udGV4dCBpZiBuZWVkZWRcbiAgICAgIGlmICghdGhpcy5hdWRpb0NvbnRleHQpIHtcbiAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQgPSBuZXcgQXVkaW9Db250ZXh0KCk7XG4gICAgICAgIC8vIFJlc3VtZSB3aWxsIGJlIGNhbGxlZCBsYXRlciBhZnRlciBhIHVzZXIgZ2VzdHVyZVxuICAgICAgfVxuXG4gICAgICBsZXQgbm9kZXMgPSB0aGlzLmF1ZGlvRWxlbWVudE1hcC5nZXQobWVkaWFFbGVtZW50KTtcblxuICAgICAgaWYgKG5vZGVzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGBbQXVkaW9Qcm9jZXNzb3JdIFJldXNpbmcgZXhpc3RpbmcgYXVkaW8gbm9kZXMgZm9yIGVsZW1lbnQ6ICR7XG4gICAgICAgICAgICBtZWRpYUVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgICAgIH1gXG4gICAgICAgICk7XG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBtZWRpYSBzb3VyY2UgaGFzIGNoYW5nZWQgT1IgaWYgdGhlIHNvdXJjZSBub2RlIGlzIHNvbWVob3cgbnVsbFxuICAgICAgICAvLyBVc2UgY3VycmVudFNyYyBpbnN0ZWFkIG9mIHNyYyB0byBoYW5kbGUgYmxvYi9ITFMgVVJMcyBjb3JyZWN0bHlcbiAgICAgICAgbGV0IHNvdXJjZUNoYW5nZWQgPSBmYWxzZTtcbiAgICAgICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0ICYmIChub2Rlcy5jdXJyZW50U3JjICE9PSBtZWRpYUVsZW1lbnQuY3VycmVudFNyYyB8fCAhbm9kZXMuc291cmNlKSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gTWVkaWEgc291cmNlIGNoYW5nZWQgZnJvbSAke1xuICAgICAgICAgICAgICBub2Rlcy5jdXJyZW50U3JjXG4gICAgICAgICAgICB9IHRvICR7bWVkaWFFbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJ9IG9yIHNvdXJjZSBpbnZhbGlkLiBSZWNyZWF0aW5nIHNvdXJjZSBub2RlLmBcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChub2Rlcy5zb3VyY2UpIHtcbiAgICAgICAgICAgIC8vIElmIG9sZCBzb3VyY2UgZXhpc3RzLCBkaXNjb25uZWN0IGl0IGZ1bGx5XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBub2Rlcy5zb3VyY2UuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAvKiBJZ25vcmUgZGlzY29ubmVjdCBlcnJvcnMgaWYgYWxyZWFkeSBkaXNjb25uZWN0ZWQgb3IgaW52YWxpZCAqL1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBub2Rlcy5zb3VyY2UgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVNZWRpYUVsZW1lbnRTb3VyY2UobWVkaWFFbGVtZW50KTtcbiAgICAgICAgICBub2Rlcy5jdXJyZW50U3JjID0gbWVkaWFFbGVtZW50LmN1cnJlbnRTcmM7XG4gICAgICAgICAgc291cmNlQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBPbmx5IHJlY29ubmVjdCB0aGUgZ3JhcGggdG9wb2xvZ3kgaWYgbW9ubyBzZXR0aW5nIGNoYW5nZWQgb3Igc291cmNlIGNoYW5nZWQuXG4gICAgICAgIC8vIFJlY29ubmVjdGluZyBvbiBldmVyeSBwYXJhbWV0ZXIgY2hhbmdlIGNhdXNlcyBhdWRpYmxlIGNsaWNrcy9wb3BzLlxuICAgICAgICBjb25zdCBtb25vQ2hhbmdlZCA9IG5vZGVzLm1vbm8gIT09IHNldHRpbmdzLm1vbm87XG4gICAgICAgIGlmIChzb3VyY2VDaGFuZ2VkIHx8IG1vbm9DaGFuZ2VkKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBHcmFwaCB0b3BvbG9neSBjaGFuZ2VkIChzb3VyY2VDaGFuZ2VkPSR7c291cmNlQ2hhbmdlZH0sIG1vbm9DaGFuZ2VkPSR7bW9ub0NoYW5nZWR9KS4gUmVjb25uZWN0aW5nIG5vZGVzLmBcbiAgICAgICAgICApO1xuICAgICAgICAgIGF3YWl0IHRoaXMuY29ubmVjdE5vZGVzKG5vZGVzLCBzZXR0aW5ncyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSnVzdCB1cGRhdGUgcGFyYW1ldGVyIHZhbHVlcyB3aXRob3V0IGRpc2Nvbm5lY3RpbmcvcmVjb25uZWN0aW5nXG4gICAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVOb2RlU2V0dGluZ3Mobm9kZXMsIHNldHRpbmdzKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gQ3JlYXRpbmcgbmV3IGF1ZGlvIG5vZGVzIGZvciBlbGVtZW50OiAke1xuICAgICAgICAgICAgbWVkaWFFbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgICB9YFxuICAgICAgICApO1xuICAgICAgICAvLyBDcmVhdGUgYW5kIGNvbmZpZ3VyZSBuZXcgbm9kZXNcbiAgICAgICAgLy8gY3JlYXRlQXVkaW9Ob2RlcyBjYWxscyBjb25uZWN0Tm9kZXMgaW50ZXJuYWxseSwgd2hpY2ggd2lsbCBidWlsZCB0aGUgZ3JhcGguXG4gICAgICAgIG5vZGVzID0gYXdhaXQgdGhpcy5jcmVhdGVBdWRpb05vZGVzKG1lZGlhRWxlbWVudCwgc2V0dGluZ3MpO1xuICAgICAgICB0aGlzLmF1ZGlvRWxlbWVudE1hcC5zZXQobWVkaWFFbGVtZW50LCBub2Rlcyk7XG4gICAgICAgIC8vIE5vIG5lZWQgdG8gY2FsbCBjb25uZWN0Tm9kZXMgYWdhaW4gaGVyZSwgYXMgY3JlYXRlQXVkaW9Ob2RlcyBkb2VzIGl0LlxuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhcIkF1ZGlvUHJvY2Vzc29yOiBTZXR1cCBjb21wbGV0ZSBmb3I6XCIsIG1lZGlhRWxlbWVudC5zcmMpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiQXVkaW9Qcm9jZXNzb3I6IFNldHVwIGZhaWxlZDpcIiwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjcmVhdGVBdWRpb05vZGVzKFxuICAgIG1lZGlhRWxlbWVudDogSFRNTE1lZGlhRWxlbWVudCxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5nc1xuICApOiBQcm9taXNlPEF1ZGlvTm9kZXM+IHtcbiAgICBpZiAoIXRoaXMuYXVkaW9Db250ZXh0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBdWRpb0NvbnRleHQgbm90IGluaXRpYWxpemVkXCIpO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBub2Rlc1xuICAgIGNvbnN0IHNvdXJjZSA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZU1lZGlhRWxlbWVudFNvdXJjZShtZWRpYUVsZW1lbnQpO1xuICAgIGNvbnN0IGdhaW4gPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XG4gICAgY29uc3QgYmFzc0ZpbHRlciA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUJpcXVhZEZpbHRlcigpO1xuICAgIGNvbnN0IHZvaWNlRmlsdGVyID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XG4gICAgY29uc3Qgc3BsaXR0ZXIgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVDaGFubmVsU3BsaXR0ZXIoMik7XG4gICAgY29uc3QgbWVyZ2VyID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQ2hhbm5lbE1lcmdlcigyKTtcblxuICAgIC8vIENvbmZpZ3VyZSBmaWx0ZXJzXG4gICAgYmFzc0ZpbHRlci50eXBlID0gXCJsb3dzaGVsZlwiO1xuICAgIGJhc3NGaWx0ZXIuZnJlcXVlbmN5LnZhbHVlID0gMTAwO1xuICAgIHZvaWNlRmlsdGVyLnR5cGUgPSBcInBlYWtpbmdcIjtcbiAgICB2b2ljZUZpbHRlci5mcmVxdWVuY3kudmFsdWUgPSAyMDAwO1xuICAgIHZvaWNlRmlsdGVyLlEudmFsdWUgPSAxO1xuXG4gICAgY29uc3Qgbm9kZXM6IEF1ZGlvTm9kZXMgPSB7XG4gICAgICBjb250ZXh0OiB0aGlzLmF1ZGlvQ29udGV4dCxcbiAgICAgIHNvdXJjZSxcbiAgICAgIGdhaW4sXG4gICAgICBiYXNzRmlsdGVyLFxuICAgICAgdm9pY2VGaWx0ZXIsXG4gICAgICBzcGxpdHRlcixcbiAgICAgIG1lcmdlcixcbiAgICAgIGVsZW1lbnQ6IG1lZGlhRWxlbWVudCxcbiAgICAgIG1vbm86IHNldHRpbmdzLm1vbm8sIC8vIEluaXRpYWxpemUgbW9ubyBzZXR0aW5nLCBjb25uZWN0Tm9kZXMgd2lsbCB1c2Ugc2V0dGluZ3MubW9ub1xuICAgICAgY3VycmVudFNyYzogbWVkaWFFbGVtZW50LmN1cnJlbnRTcmMsIC8vIEluaXRpYWxpemUgY3VycmVudFNyY1xuICAgIH07XG5cbiAgICAvLyBDb25uZWN0IG5vZGVzIGJhc2VkIG9uIHNldHRpbmdzXG4gICAgYXdhaXQgdGhpcy5jb25uZWN0Tm9kZXMobm9kZXMsIHNldHRpbmdzKTtcblxuICAgIHJldHVybiBub2RlcztcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBkYXRlTm9kZVNldHRpbmdzKFxuICAgIG5vZGVzOiBBdWRpb05vZGVzLFxuICAgIHNldHRpbmdzOiBBdWRpb1NldHRpbmdzXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHsgZ2FpbiwgYmFzc0ZpbHRlciwgdm9pY2VGaWx0ZXIsIGNvbnRleHQsIGVsZW1lbnQgfSA9IG5vZGVzOyAvLyBBZGRlZCBlbGVtZW50XG5cbiAgICB0cnkge1xuICAgICAgY29uc3Qgc2FmZVRpbWVWYWx1ZSA9IGlzRmluaXRlKGNvbnRleHQuY3VycmVudFRpbWUpXG4gICAgICAgID8gY29udGV4dC5jdXJyZW50VGltZVxuICAgICAgICA6IDA7XG5cbiAgICAgIC8vIERldGVybWluZSB0YXJnZXQgdm9sdW1lIGZvciBlbGVtZW50IGFuZCBnYWluIG5vZGVcbiAgICAgIGxldCBlbGVtZW50Vm9sdW1lID0gMS4wOyAvLyBEZWZhdWx0IHRvIG1heCBmb3IgZWxlbWVudFxuICAgICAgbGV0IGdhaW5Ob2RlVm9sdW1lID0gMS4wOyAvLyBEZWZhdWx0IGdhaW5cblxuICAgICAgaWYgKHNldHRpbmdzLnZvbHVtZSA8PSAxMDApIHtcbiAgICAgICAgLy8gSWYgdm9sdW1lIGlzIDEwMCUgb3IgbGVzcywgY29udHJvbCB2aWEgZWxlbWVudC52b2x1bWVcbiAgICAgICAgZWxlbWVudFZvbHVtZSA9IE1hdGgubWF4KDAsIHNldHRpbmdzLnZvbHVtZSkgLyAxMDA7XG4gICAgICAgIGdhaW5Ob2RlVm9sdW1lID0gMS4wOyAvLyBLZWVwIEdhaW5Ob2RlIG5ldXRyYWxcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIHZvbHVtZSBpcyA+IDEwMCUsIHNldCBlbGVtZW50IHZvbHVtZSB0byBtYXggYW5kIHVzZSBHYWluTm9kZSBmb3IgYm9vc3RcbiAgICAgICAgZWxlbWVudFZvbHVtZSA9IDEuMDtcbiAgICAgICAgZ2Fpbk5vZGVWb2x1bWUgPSBNYXRoLm1heCgxLCBNYXRoLm1pbihzZXR0aW5ncy52b2x1bWUsIDEwMDApKSAvIDEwMDsgLy8gQXBwbHkgYm9vc3QgdmlhIEdhaW5Ob2RlXG4gICAgICB9XG5cbiAgICAgIC8vIEFwcGx5IGVsZW1lbnQgdm9sdW1lIGltbWVkaWF0ZWx5IChkb2VzIG5vdCByZXF1aXJlIHVzZXIgZ2VzdHVyZSlcbiAgICAgIGlmIChpc0Zpbml0ZShlbGVtZW50Vm9sdW1lKSkge1xuICAgICAgICBlbGVtZW50LnZvbHVtZSA9IGVsZW1lbnRWb2x1bWU7XG4gICAgICB9XG5cbiAgICAgIC8vIENsYW1wIHZhbHVlcyBmb3IgZmlsdGVyc1xuICAgICAgY29uc3QgY2xhbXBlZEJhc3MgPSBNYXRoLm1heChcbiAgICAgICAgLTE1LFxuICAgICAgICBNYXRoLm1pbigoKHNldHRpbmdzLmJhc3NCb29zdCAtIDEwMCkgLyAxMDApICogMTUsIDE1KVxuICAgICAgKTtcbiAgICAgIGNvbnN0IGNsYW1wZWRWb2ljZSA9IE1hdGgubWF4KFxuICAgICAgICAtMjQsXG4gICAgICAgIE1hdGgubWluKCgoc2V0dGluZ3Mudm9pY2VCb29zdCAtIDEwMCkgLyAxMDApICogMjQsIDI0KVxuICAgICAgKTtcblxuICAgICAgLy8gVXBkYXRlIFdlYiBBdWRpbyBBUEkgcGFyYW1ldGVycyB1c2luZyBzZXRUYXJnZXRBdFRpbWUgZm9yIHBvdGVudGlhbGx5IG1vcmUgcm9idXN0IGFwcGxpY2F0aW9uXG4gICAgICBjb25zdCB0aW1lQ29uc3RhbnQgPSAwLjAxOyAvLyBBcHBseSBxdWlja2x5XG4gICAgICBjb25zdCBjdXJyZW50VGltZSA9IGNvbnRleHQuY3VycmVudFRpbWU7IC8vIFVzZSBjdXJyZW50IGNvbnRleHQgdGltZSBhcyBzdGFydCB0aW1lXG5cbiAgICAgIC8vIFNldCBpbW1lZGlhdGUgdmFsdWVcbiAgICAgIGdhaW4uZ2Fpbi52YWx1ZSA9IGdhaW5Ob2RlVm9sdW1lO1xuXG4gICAgICBiYXNzRmlsdGVyLmdhaW4udmFsdWUgPSBjbGFtcGVkQmFzcztcblxuICAgICAgdm9pY2VGaWx0ZXIuZ2Fpbi52YWx1ZSA9IGNsYW1wZWRWb2ljZTtcblxuICAgICAgLy8gQURERUQgTE9HUzogTG9nIHRoZSB2YWx1ZXMgYmVpbmcgYXBwbGllZCB0byB0aGUgbm9kZXNcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBBcHBseWluZyBOb2RlIFNldHRpbmdzIChpbW1lZGlhdGUgKyBzZXRUYXJnZXRBdFRpbWUpIGF0ICR7Y3VycmVudFRpbWV9OmAsXG4gICAgICAgIHtcbiAgICAgICAgICBlbGVtZW50Vm9sdW1lOiBlbGVtZW50LnZvbHVtZSwgLy8gTG9nIHRoZSBkaXJlY3RseSBzZXQgZWxlbWVudCB2b2x1bWVcbiAgICAgICAgICB0YXJnZXRHYWluTm9kZVZvbHVtZTogZ2Fpbk5vZGVWb2x1bWUsIC8vIExvZyB0YXJnZXQgdmFsdWVzXG4gICAgICAgICAgdGFyZ2V0QmFzc0dhaW46IGNsYW1wZWRCYXNzLFxuICAgICAgICAgIHRhcmdldFZvaWNlR2FpbjogY2xhbXBlZFZvaWNlLFxuICAgICAgICAgIHZvaWNlR2FpbjogY2xhbXBlZFZvaWNlLFxuICAgICAgICAgIG1vbm86IHNldHRpbmdzLm1vbm8sIC8vIExvZyBtb25vIHNldHRpbmcgYXMgaXQgYWZmZWN0cyBjb25uZWN0aW9uc1xuICAgICAgICB9XG4gICAgICApO1xuXG4gICAgICAvLyBjb25zb2xlLmxvZyhcIkF1ZGlvUHJvY2Vzc29yOiBTZXR0aW5ncyB1cGRhdGVkIHN1Y2Nlc3NmdWxseVwiLCB7IC8vIFJlZHVjZWQgbG9nZ2luZ1xuICAgICAgLy8gICB2b2x1bWU6IGNsYW1wZWRWb2x1bWUsXG4gICAgICAvLyAgIGJhc3M6IGNsYW1wZWRCYXNzLFxuICAgICAgLy8gICB2b2ljZTogY2xhbXBlZFZvaWNlLFxuICAgICAgLy8gICBtb25vOiBzZXR0aW5ncy5tb25vLFxuICAgICAgLy8gfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJBdWRpb1Byb2Nlc3NvcjogRmFpbGVkIHRvIHVwZGF0ZSBzZXR0aW5nczpcIiwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb25uZWN0Tm9kZXMoXG4gICAgbm9kZXM6IEF1ZGlvTm9kZXMsXG4gICAgc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3NcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgeyBzb3VyY2UsIGJhc3NGaWx0ZXIsIHZvaWNlRmlsdGVyLCBnYWluLCBzcGxpdHRlciwgbWVyZ2VyLCBjb250ZXh0LCBlbGVtZW50IH0gPVxuICAgICAgbm9kZXM7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBbQXVkaW9Qcm9jZXNzb3JdIENvbm5lY3RpbmcvUmVjb25uZWN0aW5nIG5vZGVzIGZvciAke1xuICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgIH0uIFRhcmdldCBNb25vOiAke3NldHRpbmdzLm1vbm99LCBDdXJyZW50IE5vZGUgTW9ubzogJHtub2Rlcy5tb25vfWBcbiAgICApO1xuXG4gICAgLy8gTG9nIHRoZSBjdXJyZW50IG1vbm8gc3RhdGUgYmVmb3JlIHBvdGVudGlhbCBjaGFuZ2VcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBbQXVkaW9Qcm9jZXNzb3JdIGNvbm5lY3ROb2RlczogQ3VycmVudCBtb25vIHN0YXRlIGZvciBlbGVtZW50OiAke25vZGVzLm1vbm99LCBUYXJnZXQgbW9ubyBzdGF0ZTogJHtzZXR0aW5ncy5tb25vfWBcbiAgICApO1xuXG4gICAgLy8gRGlzY29ubmVjdCBhbGwgbm9kZXMgZnJvbSB0aGVpciBvdXRwdXRzIHRvIGVuc3VyZSBhIGNsZWFuIHNsYXRlIGJlZm9yZSByZS1jb25uZWN0aW5nLlxuICAgIC8vIEl0J3MgY3J1Y2lhbCB0byBkaXNjb25uZWN0IHRoZSBzb3VyY2UgZmlyc3QgZnJvbSBpdHMgcHJldmlvdXMgY29ubmVjdGlvbnMsXG4gICAgLy8gdGhlbiBvdGhlciBub2RlcyBpbiBhbnkgb3JkZXIsIGFzIGxvbmcgYXMgdGhleSBhcmUgZGlzY29ubmVjdGVkIGZyb20gdGhlaXIgb3V0cHV0cy5cbiAgICBjb25zdCBzYWZlRGlzY29ubmVjdCA9IChub2RlOiBBdWRpb05vZGUgfCBudWxsKSA9PiB7XG4gICAgICBpZiAobm9kZSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIERpc2Nvbm5lY3QgYWxsIGNvbm5lY3Rpb25zIGZyb20gdGhpcyBub2RlXG4gICAgICAgICAgbm9kZS5kaXNjb25uZWN0KCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAvLyBjb25zb2xlLndhcm4oYFtBdWRpb1Byb2Nlc3Nvcl0gRXJyb3IgZGlzY29ubmVjdGluZyBub2RlOmAsIGUpOyAvLyBPcHRpb25hbDogZm9yIGRlYnVnZ2luZ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vIERpc2Nvbm5lY3QgYWxsIG5vZGVzIGZyb20gdGhlaXIgb3V0cHV0cy4gT3JkZXIgbWF0dGVycyBmb3IgcHJldmVudGluZyBlcnJvcnMsXG4gICAgLy8gYnV0IGxlc3Mgc28gaWYgd2UgZGlzY29ubmVjdCBhbGwgb3V0cHV0cyBmcm9tIGEgbm9kZS5cbiAgICAvLyBEaXNjb25uZWN0aW5nIHNvdXJjZSBmaXJzdCBlbnN1cmVzIGl0J3Mgbm90IGNvbm5lY3RlZCB0byBhIHN0YWxlIGdyYXBoLlxuICAgIHNhZmVEaXNjb25uZWN0KHNvdXJjZSk7XG4gICAgc2FmZURpc2Nvbm5lY3QoYmFzc0ZpbHRlcik7XG4gICAgc2FmZURpc2Nvbm5lY3Qodm9pY2VGaWx0ZXIpO1xuICAgIHNhZmVEaXNjb25uZWN0KHNwbGl0dGVyKTtcbiAgICBzYWZlRGlzY29ubmVjdChtZXJnZXIpO1xuICAgIHNhZmVEaXNjb25uZWN0KGdhaW4pO1xuXG4gICAgLy8gRW5zdXJlIHNvdXJjZSBpcyB2YWxpZCBiZWZvcmUgcHJvY2VlZGluZ1xuICAgIGlmICghc291cmNlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBcIltBdWRpb1Byb2Nlc3Nvcl0gU291cmNlIG5vZGUgaXMgbnVsbCBpbiBjb25uZWN0Tm9kZXMuIENhbm5vdCBjb25uZWN0IGdyYXBoLlwiXG4gICAgICApO1xuICAgICAgLy8gQXR0ZW1wdCB0byBhcHBseSBzZXR0aW5ncyB0byBhdm9pZCBmdXJ0aGVyIGVycm9ycywgdGhvdWdoIGdyYXBoIGlzIGJyb2tlbi5cbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlTm9kZVNldHRpbmdzKG5vZGVzLCBzZXR0aW5ncyk7XG4gICAgICByZXR1cm47IC8vIENhbm5vdCBwcm9jZWVkIHdpdGggY29ubmVjdGlvbnNcbiAgICB9XG5cblxuICAgIC8vIENyZWF0ZSBuZXcgY29ubmVjdGlvbnMgYmFzZWQgb24gY3VycmVudCBzZXR0aW5nc1xuICAgIGlmIChzZXR0aW5ncy5tb25vKSB7XG4gICAgICBzb3VyY2UuY29ubmVjdChiYXNzRmlsdGVyKTtcbiAgICAgIGJhc3NGaWx0ZXIuY29ubmVjdCh2b2ljZUZpbHRlcik7XG4gICAgICB2b2ljZUZpbHRlci5jb25uZWN0KHNwbGl0dGVyKTtcbiAgICAgIHNwbGl0dGVyLmNvbm5lY3QobWVyZ2VyLCAwLCAwKTsgLy8gQ29ubmVjdCBsZWZ0IGNoYW5uZWwgb2Ygc3BsaXR0ZXIgdG8gbGVmdCBpbnB1dCBvZiBtZXJnZXJcbiAgICAgIHNwbGl0dGVyLmNvbm5lY3QobWVyZ2VyLCAwLCAxKTsgLy8gQ29ubmVjdCBsZWZ0IGNoYW5uZWwgb2Ygc3BsaXR0ZXIgdG8gcmlnaHQgaW5wdXQgb2YgbWVyZ2VyIChtb25vKVxuICAgICAgbWVyZ2VyLmNvbm5lY3QoZ2Fpbik7XG4gICAgfSBlbHNlIHsgLy8gU3RlcmVvXG4gICAgICBzb3VyY2UuY29ubmVjdChiYXNzRmlsdGVyKTtcbiAgICAgIGJhc3NGaWx0ZXIuY29ubmVjdCh2b2ljZUZpbHRlcik7XG4gICAgICB2b2ljZUZpbHRlci5jb25uZWN0KGdhaW4pO1xuICAgIH1cbiAgICBnYWluLmNvbm5lY3QoY29udGV4dC5kZXN0aW5hdGlvbik7XG5cbiAgICAvLyBVcGRhdGUgdGhlIHN0b3JlZCBtb25vIHNldHRpbmcgZm9yIHRoaXMgZWxlbWVudCB0byByZWZsZWN0IHRoZSBhcHBsaWVkIHNldHRpbmdcbiAgICBub2Rlcy5tb25vID0gc2V0dGluZ3MubW9ubztcblxuICAgIC8vIEFsd2F5cyBhcHBseS91cGRhdGUgb3RoZXIgYXVkaW8gcGFyYW1ldGVyc1xuICAgIGF3YWl0IHRoaXMudXBkYXRlTm9kZVNldHRpbmdzKG5vZGVzLCBzZXR0aW5ncyk7XG4gIH1cblxuICAvKipcbiAgICogRGlzY29ubmVjdHMgYXVkaW8gbm9kZXMgZm9yIGEgc3BlY2lmaWMgZWxlbWVudCBhbmQgcmVtb3ZlcyBpdCBmcm9tIHRoZSBtYXAuXG4gICAqIEBwYXJhbSBlbGVtZW50IFRoZSBIVE1MTWVkaWFFbGVtZW50IHRvIGRpc2Nvbm5lY3QuXG4gICAqIEByZXR1cm5zIFRydWUgaWYgbm9kZXMgd2VyZSBmb3VuZCBhbmQgZGlzY29ubmVjdGVkLCBmYWxzZSBvdGhlcndpc2UuXG4gICAqL1xuICBwdWJsaWMgZGlzY29ubmVjdEVsZW1lbnROb2RlcyhlbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50KTogYm9vbGVhbiB7XG4gICAgY29uc3Qgbm9kZXMgPSB0aGlzLmF1ZGlvRWxlbWVudE1hcC5nZXQoZWxlbWVudCk7XG4gICAgaWYgKCFub2RlcykgcmV0dXJuIGZhbHNlO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBEaXNjb25uZWN0aW5nIG5vZGVzIGZvciBlbGVtZW50OiAke1xuICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgIH1gXG4gICAgKTsgLy8gQURERUQgTE9HXG5cbiAgICB0cnkge1xuICAgICAgLy8gU2FmZWx5IGRpc2Nvbm5lY3QgZWFjaCBub2RlXG4gICAgICBjb25zdCBzYWZlRGlzY29ubmVjdCA9IChub2RlOiBBdWRpb05vZGUpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBub2RlLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIElnbm9yZSBkaXNjb25uZWN0IGVycm9yc1xuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICBzYWZlRGlzY29ubmVjdChub2Rlcy5nYWluKTtcbiAgICAgIHNhZmVEaXNjb25uZWN0KG5vZGVzLnZvaWNlRmlsdGVyKTtcbiAgICAgIHNhZmVEaXNjb25uZWN0KG5vZGVzLmJhc3NGaWx0ZXIpO1xuICAgICAgc2FmZURpc2Nvbm5lY3Qobm9kZXMuc3BsaXR0ZXIpO1xuICAgICAgc2FmZURpc2Nvbm5lY3Qobm9kZXMubWVyZ2VyKTtcbiAgICAgIHNhZmVEaXNjb25uZWN0KG5vZGVzLnNvdXJjZSk7XG5cbiAgICAgIC8vIEV4cGxpY2l0bHkgbnVsbGlmeSByZWZlcmVuY2VzIHRvIGhlbHAgZ2FyYmFnZSBjb2xsZWN0aW9uXG4gICAgICAvLyBDYXN0IHRvIGFueSBzaW5jZSB3ZSdyZSBpbnRlbnRpb25hbGx5IGRlc3Ryb3lpbmcgdGhlc2Ugbm9kZXNcbiAgICAgIChub2RlcyBhcyBhbnkpLnNvdXJjZSA9IG51bGw7XG4gICAgICAobm9kZXMgYXMgYW55KS5nYWluID0gbnVsbDtcbiAgICAgIChub2RlcyBhcyBhbnkpLmJhc3NGaWx0ZXIgPSBudWxsO1xuICAgICAgKG5vZGVzIGFzIGFueSkudm9pY2VGaWx0ZXIgPSBudWxsO1xuICAgICAgKG5vZGVzIGFzIGFueSkuc3BsaXR0ZXIgPSBudWxsO1xuICAgICAgKG5vZGVzIGFzIGFueSkubWVyZ2VyID0gbnVsbDtcbiAgICAgIC8vIERvIG5vdCBudWxsaWZ5IGNvbnRleHQgb3IgZWxlbWVudCBhcyB0aGV5IGFyZSBtYW5hZ2VkIGVsc2V3aGVyZVxuXG4gICAgICB0aGlzLmF1ZGlvRWxlbWVudE1hcC5kZWxldGUoZWxlbWVudCk7XG4gICAgICByZXR1cm4gdHJ1ZTsgLy8gSW5kaWNhdGUgc3VjY2Vzc1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBgQXVkaW9Qcm9jZXNzb3I6IEVycm9yIGRpc2Nvbm5lY3Rpbmcgbm9kZXMgZm9yICR7XG4gICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgIH06YCxcbiAgICAgICAgZXJyb3JcbiAgICAgICk7XG4gICAgICAvLyBBdHRlbXB0IHRvIHJlbW92ZSBmcm9tIG1hcCBldmVuIGlmIGRpc2Nvbm5lY3QgZmFpbGVkIHBhcnRpYWxseVxuICAgICAgdGhpcy5hdWRpb0VsZW1lbnRNYXAuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgcmV0dXJuIGZhbHNlOyAvLyBJbmRpY2F0ZSBmYWlsdXJlXG4gICAgfVxuICB9XG5cbiAgYXN5bmMgdXBkYXRlQXVkaW9FZmZlY3RzKHNldHRpbmdzOiBBdWRpb1NldHRpbmdzKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBcIltBdWRpb1Byb2Nlc3Nvcl0gVXBkYXRpbmcgYXVkaW8gZWZmZWN0cyB3aXRoIHNldHRpbmdzOlwiLFxuICAgICAgSlNPTi5zdHJpbmdpZnkoc2V0dGluZ3MpXG4gICAgKTtcblxuICAgIGZvciAoY29uc3QgW2VsZW1lbnQsIG5vZGVzXSBvZiB0aGlzLmF1ZGlvRWxlbWVudE1hcC5lbnRyaWVzKCkpIHtcbiAgICAgIC8vIENoZWNrIGlmIHRoZSBlbGVtZW50IGlzIHN0aWxsIGNvbm5lY3RlZCB0byB0aGUgRE9NIGJlZm9yZSBwcm9jZXNzaW5nXG4gICAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gRWxlbWVudCAke1xuICAgICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgfSBpcyBubyBsb25nZXIgY29ubmVjdGVkIHRvIERPTS4gRGlzY29ubmVjdGluZyBhbmQgcmVtb3ZpbmcuYFxuICAgICAgICApO1xuICAgICAgICB0aGlzLmRpc2Nvbm5lY3RFbGVtZW50Tm9kZXMoZWxlbWVudCk7IC8vIENsZWFuIHVwIGRpc2Nvbm5lY3RlZCBlbGVtZW50c1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gQ2FsbCBzZXR1cEF1ZGlvQ29udGV4dCwgd2hpY2ggbm93IGhhbmRsZXMgcmV1c2luZyBleGlzdGluZyBub2RlcyBhbmQgcmVjb25uZWN0aW5nIHRoZW1cbiAgICAgICAgYXdhaXQgdGhpcy5zZXR1cEF1ZGlvQ29udGV4dChlbGVtZW50LCBzZXR0aW5ncyk7XG5cbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gVXBkYXRlZCBzZXR0aW5ncyBmb3IgZWxlbWVudDogJHtcbiAgICAgICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgICAgIH0uYFxuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICBcIkF1ZGlvUHJvY2Vzc29yOiBVcGRhdGUgZmFpbGVkIGZvciBlbGVtZW50OlwiLFxuICAgICAgICAgIGVsZW1lbnQuc3JjLFxuICAgICAgICAgIGVycm9yXG4gICAgICAgICk7XG4gICAgICAgIC8vIElmIHVwZGF0ZSBmYWlscywgZG8gTk9UIGRpc2Nvbm5lY3QgdGhlIGVsZW1lbnQgbm9kZXMsIGFzIHRoZXkgc2hvdWxkIHJlbWFpbiByZXVzYWJsZS5cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyByZXNldEFsbFRvRGlzYWJsZWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gUmVzZXQgYWxsIGF1ZGlvIGNvbnRleHRzIGFuZCBkaXNjb25uZWN0IG5vZGVzXG4gICAgdGhpcy5hdWRpb0VsZW1lbnRNYXAuZm9yRWFjaCgobm9kZXMsIGVsZW1lbnQpID0+IHtcbiAgICAgIHRoaXMuZGlzY29ubmVjdEVsZW1lbnROb2RlcyhlbGVtZW50KTtcbiAgICAgIC8vIERvbid0IGNsb3NlIGNvbnRleHQgaGVyZSwgbGV0IGNsZWFudXAgaGFuZGxlIGl0IG9yIHJldXNlIGl0XG4gICAgICAvLyBub2Rlcy5jb250ZXh0LmNsb3NlKCk7XG4gICAgfSk7XG4gICAgdGhpcy5hdWRpb0VsZW1lbnRNYXAuY2xlYXIoKTtcbiAgfVxuXG4gIGhhc1Byb2Nlc3NpbmcobWVkaWFFbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuYXVkaW9FbGVtZW50TWFwLmhhcyhtZWRpYUVsZW1lbnQpO1xuICB9XG5cbiAgY2xlYW51cCgpOiB2b2lkIHtcbiAgICB0aGlzLmF1ZGlvRWxlbWVudE1hcC5jbGVhcigpO1xuICAgIGlmICh0aGlzLmF1ZGlvQ29udGV4dCkge1xuICAgICAgdGhpcy5hdWRpb0NvbnRleHQuY2xvc2UoKTtcbiAgICAgIHRoaXMuYXVkaW9Db250ZXh0ID0gbnVsbDtcbiAgICB9XG4gICAgY29uc29sZS5sb2coXCJBdWRpb1Byb2Nlc3NvcjogQ2xlYW51cCBjb21wbGV0ZWRcIik7XG4gIH1cblxuICAvKipcbiAgICogQXR0ZW1wdHMgdG8gcmVzdW1lIHRoZSBBdWRpb0NvbnRleHQgaWYgaXQncyBzdXNwZW5kZWQuXG4gICAqIFNob3VsZCBiZSBjYWxsZWQgYWZ0ZXIgYSB1c2VyIGdlc3R1cmUuXG4gICAqL1xuICBhc3luYyB0cnlSZXN1bWVDb250ZXh0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLmF1ZGlvQ29udGV4dCAmJiB0aGlzLmF1ZGlvQ29udGV4dC5zdGF0ZSA9PT0gXCJzdXNwZW5kZWRcIikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5hdWRpb0NvbnRleHQucmVzdW1lKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiQXVkaW9Qcm9jZXNzb3I6IEF1ZGlvQ29udGV4dCByZXN1bWVkIHN1Y2Nlc3NmdWxseS5cIik7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQXVkaW9Qcm9jZXNzb3I6IEZhaWxlZCB0byByZXN1bWUgQXVkaW9Db250ZXh0OlwiLCBlcnJvcik7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0aGlzLmF1ZGlvQ29udGV4dCkge1xuICAgICAgLy8gY29uc29sZS5sb2coYEF1ZGlvUHJvY2Vzc29yOiBBdWRpb0NvbnRleHQgc3RhdGUgaXMgYWxyZWFkeSBcIiR7dGhpcy5hdWRpb0NvbnRleHQuc3RhdGV9XCIsIG5vIHJlc3VtZSBuZWVkZWQuYCk7IC8vIFJlZHVjZWQgbG9nZ2luZ1xuICAgIH1cbiAgfVxufSAvLyBFbmQgb2YgQXVkaW9Qcm9jZXNzb3IgY2xhc3NcbiIsImNvbnN0IG1lZGlhQ29uZmlnID0ge1xuICBiYXNlU2VsZWN0b3JzOiBbXG4gICAgXCJ2aWRlb1wiLFxuICAgIFwiYXVkaW9cIixcbiAgICAvLyBFc3NlbnRpYWwgcGxheWVyIHBhdHRlcm5zXG4gICAgXCJbY2xhc3MqPSdwbGF5ZXInXVwiLFxuICAgIFwiW2NsYXNzKj0ndmlkZW8nXVwiLFxuICAgIFwiW2lkKj0ncGxheWVyJ11cIixcbiAgICBcIltpZCo9J3ZpZGVvJ11cIixcbiAgICAvLyBDb21tb24gZnJhbWV3b3Jrc1xuICAgIFwiLnZpZGVvLWpzXCIsXG4gICAgXCIuandwbGF5ZXJcIixcbiAgICBcIi5odG1sNS12aWRlby1wbGF5ZXJcIixcbiAgICBcIi5wbHlyXCIsXG4gICAgLy8gS2V5IGRhdGEgYXR0cmlidXRlc1xuICAgIFwiW2RhdGEtcGxheWVyXVwiLFxuICAgIFwiW2RhdGEtdmlkZW9dXCIsXG4gICAgXCJbZGF0YS1tZWRpYV1cIixcbiAgICAvLyBLZXkgaWZyYW1lIHNvdXJjZXNcbiAgICBcImlmcmFtZVtzcmMqPSd5b3V0dWJlLmNvbSddXCIsXG4gICAgXCJpZnJhbWVbc3JjKj0ndmltZW8uY29tJ11cIixcbiAgICBcImlmcmFtZVtzcmMqPSdkYWlseW1vdGlvbi5jb20nXVwiLFxuICAgIFwiaWZyYW1lW3NyYyo9J3R3aXRjaC50diddXCJcbiAgXSxcbiAgc2l0ZVNlbGVjdG9yczoge1xuICAgIFwieW91dHViZS5jb21cIjogW1wiLmh0bWw1LXZpZGVvLXBsYXllclwiXSxcbiAgICBcIm5ldGZsaXguY29tXCI6IFtcIltkYXRhLXVpYT0ndmlkZW8tcGxheWVyJ11cIl0sXG4gICAgXCJodWx1LmNvbVwiOiBbXCIuSHVsdVBsYXllclwiXSxcbiAgICBcImFtYXpvbi5jb21cIjogW1wiW2RhdGEtcGxheWVyPSdBbWF6b25WaWRlbyddXCJdLFxuICAgIFwiZGlzbmV5cGx1cy5jb21cIjogW1wiLmRwLXZpZGVvLXBsYXllclwiXVxuICB9XG59O1xuXG5leHBvcnQgY2xhc3MgTWVkaWFNYW5hZ2VyIHtcbiAgcHJpdmF0ZSBzdGF0aWMgZGVib3VuY2VUaW1lb3V0OiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHN0YXRpYyBwcm9jZXNzZWRFbGVtZW50cyA9IG5ldyBXZWFrU2V0PEhUTUxFbGVtZW50PigpOyAvLyBLZWVwIGZvciBjdXN0b20gcGxheWVyIGNvbnRhaW5lcnNcbiAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVCT1VOQ0VfREVMQVkgPSA1MDA7XG4gIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9ERVBUSCA9IDEwO1xuXG4gIHByaXZhdGUgc3RhdGljIGlzRXh0ZW5zaW9uQ29udGV4dCgpOiBib29sZWFuIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLnByb3RvY29sID09PSBcImNocm9tZS1leHRlbnNpb246XCIgfHxcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLnByb3RvY29sID09PSBcIm1vei1leHRlbnNpb246XCIgfHxcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLnByb3RvY29sID09PSBcImVkZ2UtZXh0ZW5zaW9uOlwiXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvLyBPcHRpbWl6ZWQgdmlzaWJpbGl0eSBjaGVja1xuICBwcml2YXRlIHN0YXRpYyBpc0VsZW1lbnRWaXNpYmxlKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuICEhKFxuICAgICAgZWxlbWVudC5vZmZzZXRXaWR0aCB8fFxuICAgICAgZWxlbWVudC5vZmZzZXRIZWlnaHQgfHxcbiAgICAgIGVsZW1lbnQuZ2V0Q2xpZW50UmVjdHMoKS5sZW5ndGhcbiAgICApO1xuICB9XG5cbiAgLy8gVXNlIHRoZSBmdWxsIHNpdGVTZWxlY3RvcnMgY29uZmlndXJhdGlvblxuICBwcml2YXRlIHN0YXRpYyBnZXRFeHRyYVNlbGVjdG9yc0ZvclNpdGUoKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IGN1cnJlbnRIb3N0bmFtZSA9IHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZTtcbiAgICBmb3IgKGNvbnN0IHNpdGVIb3N0bmFtZSBpbiBtZWRpYUNvbmZpZy5zaXRlU2VsZWN0b3JzKSB7XG4gICAgICAvLyBFeGFjdCBtYXRjaCBmb3IgaG9zdG5hbWUgKG5vIHN1YmRvbWFpbiBtYXRjaGluZylcbiAgICAgIGlmIChjdXJyZW50SG9zdG5hbWUgPT09IHNpdGVIb3N0bmFtZSkge1xuICAgICAgICAvLyBUeXBlIGFzc2VydGlvbiBuZWVkZWQgYXMga2V5cyBhcmUgc3RyaW5nc1xuICAgICAgICByZXR1cm4gbWVkaWFDb25maWcuc2l0ZVNlbGVjdG9yc1tcbiAgICAgICAgICBzaXRlSG9zdG5hbWUgYXMga2V5b2YgdHlwZW9mIG1lZGlhQ29uZmlnLnNpdGVTZWxlY3RvcnNcbiAgICAgICAgXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIFtdOyAvLyBSZXR1cm4gZW1wdHkgYXJyYXkgaWYgbm8gbWF0Y2ggZm91bmRcbiAgfVxuXG4gIC8vIFVwZGF0ZWQgY3VzdG9tIHBsYXllciBkZXRlY3Rpb24gd2l0aCBmYWxsYmFjayBkeW5hbWljIHNjYW5uaW5nXG4gIHByaXZhdGUgc3RhdGljIGZpbmRDdXN0b21QbGF5ZXJzKHJvb3Q6IFBhcmVudE5vZGUpOiBIVE1MRWxlbWVudFtdIHtcbiAgICBjb25zdCBjdXN0b21QbGF5ZXJzOiBIVE1MRWxlbWVudFtdID0gW107XG4gICAgY29uc3QgYmFzZVNlbGVjdG9ycyA9IG1lZGlhQ29uZmlnLmJhc2VTZWxlY3RvcnM7XG4gICAgY29uc3Qgc2l0ZVNlbGVjdG9ycyA9IHRoaXMuZ2V0RXh0cmFTZWxlY3RvcnNGb3JTaXRlKCk7XG4gICAgY29uc3QgYWxsU2VsZWN0b3JzID0gWy4uLmJhc2VTZWxlY3RvcnMsIC4uLnNpdGVTZWxlY3RvcnNdO1xuICAgIFxuICAgIC8vIFVzZSBhIFNldCB0byBhdm9pZCBkdXBsaWNhdGUgZWxlbWVudHNcbiAgICBjb25zdCBzZWxlY3RvckVsZW1lbnRzID0gbmV3IFNldDxFbGVtZW50PigpO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICAvLyBQcm9jZXNzIGVhY2ggc2VsZWN0b3IgaW5kaXZpZHVhbGx5IHRvIGF2b2lkIG1hc3NpdmUgY29tYmluZWQgc2VsZWN0b3JcbiAgICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2YgYWxsU2VsZWN0b3JzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgZWxlbWVudHMgPSByb290LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpO1xuICAgICAgICAgIGVsZW1lbnRzLmZvckVhY2goZWwgPT4gc2VsZWN0b3JFbGVtZW50cy5hZGQoZWwpKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGNvbnNvbGUud2FybihgRXJyb3Igd2l0aCBzZWxlY3RvciAnJHtzZWxlY3Rvcn0nOmAsIGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIFByb2Nlc3MgY29sbGVjdGVkIGVsZW1lbnRzXG4gICAgICBzZWxlY3RvckVsZW1lbnRzLmZvckVhY2goZWxlbWVudCA9PiB7XG4gICAgICAgIGlmIChlbGVtZW50IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQgJiYgIXRoaXMucHJvY2Vzc2VkRWxlbWVudHMuaGFzKGVsZW1lbnQpKSB7XG4gICAgICAgICAgdGhpcy5wcm9jZXNzZWRFbGVtZW50cy5hZGQoZWxlbWVudCk7XG4gICAgICAgICAgY3VzdG9tUGxheWVycy5wdXNoKGVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLndhcm4oXCJFcnJvciBmaW5kaW5nIGN1c3RvbSBwbGF5ZXJzOlwiLCBlKTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGN1c3RvbVBsYXllcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGZpbmRNZWRpYUVsZW1lbnRzKFxuICAgIHJvb3Q6IFBhcmVudE5vZGUgPSBkb2N1bWVudCxcbiAgICBkZXB0aDogbnVtYmVyID0gMFxuICApOiBIVE1MTWVkaWFFbGVtZW50W10ge1xuICAgIGlmICh0aGlzLmlzRXh0ZW5zaW9uQ29udGV4dCgpIHx8IGRlcHRoID4gdGhpcy5NQVhfREVQVEgpIHtcbiAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cbiAgICBjb25zdCBlbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdID0gW107XG5cbiAgICB0cnkge1xuICAgICAgLy8gRGlyZWN0IG1lZGlhIGVsZW1lbnRzXG4gICAgICBjb25zdCBtZWRpYUVsZW1lbnRzID0gcm9vdC5xdWVyeVNlbGVjdG9yQWxsKFwidmlkZW8sIGF1ZGlvXCIpO1xuICAgICAgbWVkaWFFbGVtZW50cy5mb3JFYWNoKChlbGVtZW50KSA9PiB7XG4gICAgICAgIGlmIChlbGVtZW50IGluc3RhbmNlb2YgSFRNTE1lZGlhRWxlbWVudCkge1xuICAgICAgICAgIGVsZW1lbnRzLnB1c2goZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBIYW5kbGUgU2hhZG93IERPTVxuICAgICAgaWYgKHJvb3QgaW5zdGFuY2VvZiBFbGVtZW50ICYmIHJvb3Quc2hhZG93Um9vdCkge1xuICAgICAgICBlbGVtZW50cy5wdXNoKC4uLnRoaXMuZmluZE1lZGlhRWxlbWVudHMocm9vdC5zaGFkb3dSb290LCBkZXB0aCArIDEpKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ3VzdG9tIHBsYXllcnMgKG9ubHkgYXQgdG9wIGxldmVsKVxuICAgICAgaWYgKGRlcHRoID09PSAwKSB7XG4gICAgICAgIGNvbnN0IGN1c3RvbVBsYXllcnMgPSB0aGlzLmZpbmRDdXN0b21QbGF5ZXJzKHJvb3QpO1xuICAgICAgICBjdXN0b21QbGF5ZXJzLmZvckVhY2goKHBsYXllcikgPT4ge1xuICAgICAgICAgIGNvbnN0IG1lZGlhSW5QbGF5ZXIgPSBwbGF5ZXIucXVlcnlTZWxlY3RvckFsbChcInZpZGVvLCBhdWRpb1wiKTtcbiAgICAgICAgICBtZWRpYUluUGxheWVyLmZvckVhY2goKGVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgIGlmIChlbGVtZW50IGluc3RhbmNlb2YgSFRNTE1lZGlhRWxlbWVudCkge1xuICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoIXRoaXMuaXNFeHRlbnNpb25Db250ZXh0KCkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFwiRXJyb3IgZmluZGluZyBtZWRpYSBlbGVtZW50czpcIiwgZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIEFycmF5LmZyb20obmV3IFNldChlbGVtZW50cykpO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBzZXR1cE1lZGlhRWxlbWVudE9ic2VydmVyKFxuICAgIG9uQWRkZWQ6IChlbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiB2b2lkLFxuICAgIG9uUmVtb3ZlZDogKGVsZW1lbnRzOiBIVE1MTWVkaWFFbGVtZW50W10pID0+IHZvaWRcbiAgKTogTXV0YXRpb25PYnNlcnZlciB7XG4gICAgY29uc3QgZGVib3VuY2VkQ2hlY2sgPSAoKSA9PiB7XG4gICAgICBpZiAoTWVkaWFNYW5hZ2VyLmRlYm91bmNlVGltZW91dCkge1xuICAgICAgICBjbGVhclRpbWVvdXQoTWVkaWFNYW5hZ2VyLmRlYm91bmNlVGltZW91dCk7XG4gICAgICB9XG4gICAgICBNZWRpYU1hbmFnZXIuZGVib3VuY2VUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGNvbnN0IGVsZW1lbnRzID0gdGhpcy5maW5kTWVkaWFFbGVtZW50cygpO1xuICAgICAgICBpZiAoZWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIG9uQWRkZWQoZWxlbWVudHMpO1xuICAgICAgICB9XG4gICAgICB9LCBNZWRpYU1hbmFnZXIuREVCT1VOQ0VfREVMQVkpO1xuICAgIH07XG5cbiAgICAvLyBJbml0aWFsIGNoZWNrXG4gICAgaWYgKCF0aGlzLmlzRXh0ZW5zaW9uQ29udGV4dCgpKSB7XG4gICAgICBkZWJvdW5jZWRDaGVjaygpO1xuICAgIH1cblxuICAgIC8vIE11dGF0aW9uIG9ic2VydmVyIHRvIGRldGVjdCBhZGRlZC9yZW1vdmVkIG5vZGVzXG4gICAgY29uc3Qgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigobXV0YXRpb25zKSA9PiB7XG4gICAgICBjb25zdCBhZGRlZE1lZGlhRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSA9IFtdO1xuICAgICAgY29uc3QgcmVtb3ZlZE1lZGlhRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSA9IFtdO1xuXG4gICAgICBtdXRhdGlvbnMuZm9yRWFjaCgobXV0YXRpb24pID0+IHtcbiAgICAgICAgaWYgKG11dGF0aW9uLnR5cGUgPT09IFwiY2hpbGRMaXN0XCIpIHtcbiAgICAgICAgICBtdXRhdGlvbi5hZGRlZE5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTE1lZGlhRWxlbWVudCkge1xuICAgICAgICAgICAgICBhZGRlZE1lZGlhRWxlbWVudHMucHVzaChub2RlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB7XG4gICAgICAgICAgICAgIC8vIENoZWNrIGZvciBtZWRpYSBlbGVtZW50cyB3aXRoaW4gYWRkZWQgbm9uLW1lZGlhIGVsZW1lbnRzXG4gICAgICAgICAgICAgIG5vZGUucXVlcnlTZWxlY3RvckFsbChcInZpZGVvLCBhdWRpb1wiKS5mb3JFYWNoKChlbCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlbCBpbnN0YW5jZW9mIEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgIGFkZGVkTWVkaWFFbGVtZW50cy5wdXNoKGVsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbXV0YXRpb24ucmVtb3ZlZE5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTE1lZGlhRWxlbWVudCkge1xuICAgICAgICAgICAgICByZW1vdmVkTWVkaWFFbGVtZW50cy5wdXNoKG5vZGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIG1lZGlhIGVsZW1lbnRzIHdpdGhpbiByZW1vdmVkIG5vbi1tZWRpYSBlbGVtZW50c1xuICAgICAgICAgICAgICBub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoXCJ2aWRlbywgYXVkaW9cIikuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZWwgaW5zdGFuY2VvZiBIVE1MTWVkaWFFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICByZW1vdmVkTWVkaWFFbGVtZW50cy5wdXNoKGVsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgaWYgKGFkZGVkTWVkaWFFbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIFwiW01lZGlhTWFuYWdlciBPYnNlcnZlcl0gQWRkZWQgbWVkaWEgZWxlbWVudHMgZGV0ZWN0ZWQsIHRyaWdnZXJpbmcgZGVib3VuY2VkIGNoZWNrLlwiXG4gICAgICAgICk7XG4gICAgICAgIGRlYm91bmNlZENoZWNrKCk7IC8vIFRyaWdnZXIgZGVib3VuY2VkIGNoZWNrIGZvciBhZGRlZCBlbGVtZW50c1xuICAgICAgfVxuXG4gICAgICBpZiAocmVtb3ZlZE1lZGlhRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBgW01lZGlhTWFuYWdlciBPYnNlcnZlcl0gUmVtb3ZlZCAke3JlbW92ZWRNZWRpYUVsZW1lbnRzLmxlbmd0aH0gbWVkaWEgZWxlbWVudHMsIHRyaWdnZXJpbmcgY2xlYW51cC5gXG4gICAgICAgICk7XG4gICAgICAgIG9uUmVtb3ZlZChyZW1vdmVkTWVkaWFFbGVtZW50cyk7IC8vIEltbWVkaWF0ZWx5IGNhbGwgb25SZW1vdmVkIGZvciBjbGVhbnVwXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwge1xuICAgICAgY2hpbGRMaXN0OiB0cnVlLFxuICAgICAgc3VidHJlZTogdHJ1ZSxcbiAgICB9KTtcblxuICAgIHJldHVybiBvYnNlcnZlcjtcbiAgfVxufVxuIiwiaW1wb3J0IHsgQXVkaW9TZXR0aW5ncyB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb1Byb2Nlc3NvciB9IGZyb20gXCIuL2F1ZGlvLXByb2Nlc3NvclwiO1xuaW1wb3J0IHsgTWVkaWFNYW5hZ2VyIH0gZnJvbSBcIi4vbWVkaWEtbWFuYWdlclwiO1xuXG5leHBvcnQgY2xhc3MgTWVkaWFQcm9jZXNzb3Ige1xuICBhdWRpb1Byb2Nlc3NvcjogQXVkaW9Qcm9jZXNzb3I7XG4gIHByaXZhdGUgYWN0aXZlTWVkaWFFbGVtZW50cyA9IG5ldyBTZXQ8SFRNTE1lZGlhRWxlbWVudD4oKTtcbiAgcHJpdmF0ZSBlbGVtZW50U2V0dGluZ3MgPSBuZXcgV2Vha01hcDxIVE1MTWVkaWFFbGVtZW50LCBBdWRpb1NldHRpbmdzPigpO1xuICBwcml2YXRlIGVsZW1lbnRMaXN0ZW5lcnMgPSBuZXcgV2Vha01hcDxIVE1MTWVkaWFFbGVtZW50LCAoKSA9PiB2b2lkPigpO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3IgPSBuZXcgQXVkaW9Qcm9jZXNzb3IoKTtcbiAgfVxuXG4gIC8vIE1ldGhvZCB0byBnZXQgY3VycmVudGx5IG1hbmFnZWQgbWVkaWEgZWxlbWVudHMsIGZpbHRlcmluZyBmb3IgY29ubmVjdGVkIG9uZXNcbiAgcHVibGljIGdldE1hbmFnZWRNZWRpYUVsZW1lbnRzKCk6IEhUTUxNZWRpYUVsZW1lbnRbXSB7XG4gICAgY29uc3QgZGlzY29ubmVjdGVkOiBIVE1MTWVkaWFFbGVtZW50W10gPSBbXTtcbiAgICBcbiAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIGlmICghZWwuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgZGlzY29ubmVjdGVkLnB1c2goZWwpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIGRpc2Nvbm5lY3RlZC5mb3JFYWNoKGVsID0+IHRoaXMuY2xlYW51cEVsZW1lbnQoZWwpKTtcbiAgICBcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMpO1xuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGVQbGF5YmFja1NwZWVkKGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQsIHNwZWVkOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFtNZWRpYVByb2Nlc3Nvcl0gQXR0ZW1wdGVkIHRvIHVwZGF0ZSBzcGVlZCBvbiBkaXNjb25uZWN0ZWQgZWxlbWVudDogJHtcbiAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgfWBcbiAgICAgICk7XG4gICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpOyAvLyBDbGVhbiB1cCBpZiBmb3VuZCBpbiBhY3RpdmUgbGlzdFxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBjb25zb2xlLmxvZyggLy8gVGhpcyBsb2cgY2FuIGJlIHZlcnkgbm9pc3ksIGVuYWJsZSBpZiBuZWVkZWQgZm9yIHNwZWNpZmljIHNwZWVkIGRlYnVnZ2luZ1xuICAgIC8vICAgYFtNZWRpYVByb2Nlc3Nvcl0gVXBkYXRpbmcgc3BlZWQgZm9yIGVsZW1lbnQgJHtcbiAgICAvLyAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgLy8gICB9IHRvICR7c3BlZWR9YFxuICAgIC8vICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHdhc1BsYXlpbmcgPSAhZWxlbWVudC5wYXVzZWQ7XG4gICAgICBjb25zdCBjdXJyZW50VGltZSA9IGVsZW1lbnQuY3VycmVudFRpbWU7XG5cbiAgICAgIGVsZW1lbnQucGxheWJhY2tSYXRlID0gc3BlZWQgLyAxMDA7XG4gICAgICBlbGVtZW50LmRlZmF1bHRQbGF5YmFja1JhdGUgPSBzcGVlZCAvIDEwMDtcblxuICAgICAgLy8gUmVzdG9yZSBzdGF0ZVxuICAgICAgaWYgKHdhc1BsYXlpbmcpIHtcbiAgICAgICAgLy8gSWYgcGxheWluZywgY2hhbmdpbmcgcGxheWJhY2tSYXRlIHNob3VsZCBpZGVhbGx5IG5vdCBzdG9wIGl0LlxuICAgICAgICAvLyBBdm9pZCByZXNldHRpbmcgY3VycmVudFRpbWUgd2hpY2ggY2FuIGNhdXNlIGEgc3R1dHRlci5cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIGl0IHdhcyBwYXVzZWQsIHNldCB0aGUgY3VycmVudFRpbWUgdG8gZW5zdXJlIGl0IHN0YXlzIGF0IHRoZSBzYW1lIHNwb3QuXG4gICAgICAgIGVsZW1lbnQuY3VycmVudFRpbWUgPSBjdXJyZW50VGltZTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBgTWVkaWFQcm9jZXNzb3I6IEVycm9yIHNldHRpbmcgc3BlZWQgZm9yICR7ZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwifTpgLFxuICAgICAgICBlXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NNZWRpYUVsZW1lbnRzKFxuICAgIG1lZGlhRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncyxcbiAgICBuZWVkc0F1ZGlvRWZmZWN0c1NldHVwOiBib29sZWFuXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vIE9ubHkgbG9nIGlmIHdlIGhhdmUgZWxlbWVudHMgdG8gcHJvY2Vzc1xuICAgIGlmIChtZWRpYUVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUuZGVidWcoXG4gICAgICAgIGBbTWVkaWFQcm9jZXNzb3JdIFByb2Nlc3NpbmcgJHttZWRpYUVsZW1lbnRzLmxlbmd0aH0gbWVkaWEgZWxlbWVudChzKS4gQXVkaW8gZWZmZWN0czogJHtuZWVkc0F1ZGlvRWZmZWN0c1NldHVwfWBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gQXBwbHkgc3BlZWQgc2V0dGluZ3MgaW1tZWRpYXRlbHlcbiAgICBtZWRpYUVsZW1lbnRzLmZvckVhY2goKGVsZW1lbnQpID0+IHtcbiAgICAgIGlmIChlbGVtZW50LmlzQ29ubmVjdGVkKSB7XG4gICAgICAgIHRoaXMudXBkYXRlUGxheWJhY2tTcGVlZChlbGVtZW50LCBzZXR0aW5ncy5zcGVlZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKG5lZWRzQXVkaW9FZmZlY3RzU2V0dXApIHtcbiAgICAgIGF3YWl0IHRoaXMuYXVkaW9Qcm9jZXNzb3IudHJ5UmVzdW1lQ29udGV4dCgpO1xuXG4gICAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbWVkaWFFbGVtZW50cykge1xuICAgICAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci5zZXR1cEF1ZGlvQ29udGV4dChlbGVtZW50LCBzZXR0aW5ncyk7XG4gICAgICAgICAgdGhpcy5hY3RpdmVNZWRpYUVsZW1lbnRzLmFkZChlbGVtZW50KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICBgW01lZGlhUHJvY2Vzc29yXSBFcnJvciBzZXR0aW5nIHVwIGF1ZGlvIGZvciAke1xuICAgICAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgICAgIH06YCxcbiAgICAgICAgICAgIGVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgdGhpcy5hdWRpb1Byb2Nlc3Nvci5hdWRpb0NvbnRleHQgJiZcbiAgICAgICAgdGhpcy5hdWRpb1Byb2Nlc3Nvci5hdWRpb0NvbnRleHQuc3RhdGUgPT09IFwicnVubmluZ1wiXG4gICAgICApIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci51cGRhdGVBdWRpb0VmZmVjdHMoc2V0dGluZ3MpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBObyBhdWRpbyBlZmZlY3RzIG5lZWRlZCAtIGRpc2Nvbm5lY3QgZXhpc3RpbmcgYXVkaW8gbm9kZXMgZm9yIHRoZXNlIGVsZW1lbnRzXG4gICAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbWVkaWFFbGVtZW50cykge1xuICAgICAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgLy8gRGlzY29ubmVjdCBhdWRpbyBwcm9jZXNzaW5nIGZvciB0aGlzIGVsZW1lbnQgc2luY2UgZWZmZWN0cyBhcmUgbm8gbG9uZ2VyIG5lZWRlZFxuICAgICAgICAgIGlmICh0aGlzLmF1ZGlvUHJvY2Vzc29yLmhhc1Byb2Nlc3NpbmcoZWxlbWVudCkpIHtcbiAgICAgICAgICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3IuZGlzY29ubmVjdEVsZW1lbnROb2RlcyhlbGVtZW50KTtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5kZWxldGUoZWxlbWVudCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgIGBbTWVkaWFQcm9jZXNzb3JdIEVycm9yIGRpc2Nvbm5lY3RpbmcgZWZmZWN0cyBmb3IgJHtcbiAgICAgICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgICB9OmAsXG4gICAgICAgICAgICBlXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBJZiBubyBtb3JlIGFjdGl2ZSBlbGVtZW50cyB3aXRoIHByb2Nlc3NpbmcsIGNsZWFuIHVwIHRoZSBhdWRpbyBjb250ZXh0XG4gICAgICBpZiAodGhpcy5hY3RpdmVNZWRpYUVsZW1lbnRzLnNpemUgPT09IDApIHtcbiAgICAgICAgdGhpcy5hdWRpb1Byb2Nlc3Nvci5jbGVhbnVwKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFwcGx5IHNldHRpbmdzIGRpcmVjdGx5IHRvIG1lZGlhIGVsZW1lbnRzIHdpdGhvdXQgd2FpdGluZyBmb3IgYXN5bmMgb3BlcmF0aW9uc1xuICAgKiBVc2VmdWwgZm9yIGltbWVkaWF0ZSBVSSBmZWVkYmFja1xuICAgKi9cbiAgcHJpdmF0ZSBsYXN0QXBwbGllZFNldHRpbmdzOiBBdWRpb1NldHRpbmdzIHwgbnVsbCA9IG51bGw7XG5cbiAgYXBwbHlTZXR0aW5nc0ltbWVkaWF0ZWx5KFxuICAgIG1lZGlhRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncyxcbiAgICBkaXNhYmxlZDogYm9vbGVhbiA9IGZhbHNlXG4gICk6IHZvaWQge1xuICAgIGlmIChkaXNhYmxlZCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIFwiW01lZGlhUHJvY2Vzc29yXSBEaXNhYmxpbmcgbWVkaWEgcHJvY2Vzc2luZyBhbmQgcGF1c2luZyBtZWRpYSBlbGVtZW50c1wiXG4gICAgICApO1xuICAgICAgXG4gICAgICAvLyBSZXNldCBhbnkgcHJldmlvdXNseSBhcHBsaWVkIHNldHRpbmdzIGFuZCBwYXVzZSBlbGVtZW50c1xuICAgICAgbWVkaWFFbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAvLyBPbmx5IHJlc2V0IGlmIHdlIGhhZCBhcHBsaWVkIHNldHRpbmdzIHRvIHRoaXMgZWxlbWVudFxuICAgICAgICBpZiAodGhpcy5lbGVtZW50U2V0dGluZ3MuaGFzKGVsZW1lbnQpKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFBhdXNlIHRoZSBlbGVtZW50IGlmIGl0J3MgcGxheWluZ1xuICAgICAgICAgICAgaWYgKCFlbGVtZW50LnBhdXNlZCkge1xuICAgICAgICAgICAgICBlbGVtZW50LnBhdXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGVsZW1lbnQucGxheWJhY2tSYXRlID0gMS4wO1xuICAgICAgICAgICAgZWxlbWVudC5kZWZhdWx0UGxheWJhY2tSYXRlID0gMS4wO1xuICAgICAgICAgICAgdGhpcy5jbGVhbnVwRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgICBgTWVkaWFQcm9jZXNzb3I6IEVycm9yIHJlc2V0dGluZyBlbGVtZW50ICR7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgICAgIH0gaW4gZGlzYWJsZWQgbW9kZTpgLFxuICAgICAgICAgICAgICBlXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBcIltNZWRpYVByb2Nlc3Nvcl0gQXBwbHlpbmcgc2V0dGluZ3MgaW1tZWRpYXRlbHkgdG8gbWVkaWEgZWxlbWVudHNcIlxuICAgICk7XG5cbiAgICBjb25zdCB0YXJnZXRTcGVlZCA9IHNldHRpbmdzLnNwZWVkIC8gMTAwO1xuICAgIFxuICAgIC8vIFByb2Nlc3MgYWxsIGVsZW1lbnRzIHN5bmNocm9ub3VzbHkgZm9yIGltbWVkaWF0ZSBlZmZlY3RcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbWVkaWFFbGVtZW50cykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKCFlbGVtZW50LmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgdGhpcy5jbGVhbnVwRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQXBwbHkgcGxheWJhY2sgc3BlZWQgaW1tZWRpYXRlbHlcbiAgICAgICAgZWxlbWVudC5wbGF5YmFja1JhdGUgPSB0YXJnZXRTcGVlZDtcbiAgICAgICAgZWxlbWVudC5kZWZhdWx0UGxheWJhY2tSYXRlID0gdGFyZ2V0U3BlZWQ7XG4gICAgICAgIFxuICAgICAgICAvLyBTdG9yZSBjdXJyZW50IHNldHRpbmdzIGZvciB0aGlzIGVsZW1lbnRcbiAgICAgICAgdGhpcy5lbGVtZW50U2V0dGluZ3Muc2V0KGVsZW1lbnQsIHNldHRpbmdzKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEFkZCBwbGF5IGV2ZW50IGxpc3RlbmVyIGlmIG5vdCBhbHJlYWR5IGFkZGVkXG4gICAgICAgIGlmICghdGhpcy5lbGVtZW50TGlzdGVuZXJzLmhhcyhlbGVtZW50KSkge1xuICAgICAgICAgIGNvbnN0IHBsYXlIYW5kbGVyID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYFtNZWRpYVByb2Nlc3Nvcl0gUmVhcHBseWluZyBzZXR0aW5ncyBvbiBwbGF5IGV2ZW50IGZvciAke2VsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIn1gKTtcbiAgICAgICAgICAgIC8vIFJlYWQgY3VycmVudCBzZXR0aW5ncyBmcm9tIFdlYWtNYXAgaW5zdGVhZCBvZiBjYXB0dXJpbmcgc3RhbGUgY2xvc3VyZVxuICAgICAgICAgICAgY29uc3QgY3VycmVudFNldHRpbmdzID0gdGhpcy5lbGVtZW50U2V0dGluZ3MuZ2V0KGVsZW1lbnQpO1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRTZXR0aW5ncykge1xuICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXliYWNrU3BlZWQoZWxlbWVudCwgY3VycmVudFNldHRpbmdzLnNwZWVkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncGxheScsIHBsYXlIYW5kbGVyKTtcbiAgICAgICAgICB0aGlzLmVsZW1lbnRMaXN0ZW5lcnMuc2V0KGVsZW1lbnQsIHBsYXlIYW5kbGVyKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gVHJhY2sgY29ubmVjdGVkIGVsZW1lbnRzXG4gICAgICAgIGlmICghdGhpcy5hY3RpdmVNZWRpYUVsZW1lbnRzLmhhcyhlbGVtZW50KSkge1xuICAgICAgICAgIHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5hZGQoZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICBgTWVkaWFQcm9jZXNzb3I6IEVycm9yIGFwcGx5aW5nIHNldHRpbmdzIHRvICR7XG4gICAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgICB9OmAsXG4gICAgICAgICAgZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBcbiAgcHJpdmF0ZSBjbGVhbnVwRWxlbWVudChlbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50KTogdm9pZCB7XG4gICAgaWYgKHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5oYXMoZWxlbWVudCkpIHtcbiAgICAgIHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5kZWxldGUoZWxlbWVudCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHBsYXlIYW5kbGVyID0gdGhpcy5lbGVtZW50TGlzdGVuZXJzLmdldChlbGVtZW50KTtcbiAgICBpZiAocGxheUhhbmRsZXIpIHtcbiAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigncGxheScsIHBsYXlIYW5kbGVyKTtcbiAgICAgIHRoaXMuZWxlbWVudExpc3RlbmVycy5kZWxldGUoZWxlbWVudCk7XG4gICAgfVxuICAgIFxuICAgIHRoaXMuZWxlbWVudFNldHRpbmdzLmRlbGV0ZShlbGVtZW50KTtcbiAgfVxuXG4gIGFwcGx5U2V0dGluZ3NUb1Zpc2libGVNZWRpYShcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncyxcbiAgICBkaXNhYmxlZDogYm9vbGVhbiA9IGZhbHNlXG4gICk6IHZvaWQge1xuICAgIC8vIEdldCBhbGwgbWVkaWEgZWxlbWVudHMgYW5kIGZpbHRlciBmb3IgdmlzaWJsZSBvbmVzXG4gICAgY29uc3QgdmlzaWJsZU1lZGlhID0gdGhpcy5nZXRNYW5hZ2VkTWVkaWFFbGVtZW50cygpLmZpbHRlcihlbCA9PlxuICAgICAgZWwub2Zmc2V0V2lkdGggPiAwIHx8IGVsLm9mZnNldEhlaWdodCA+IDBcbiAgICApO1xuICAgIFxuICAgIGlmICh2aXNpYmxlTWVkaWEubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBbTWVkaWFQcm9jZXNzb3JdIEFwcGx5aW5nIHNldHRpbmdzIHRvICR7dmlzaWJsZU1lZGlhLmxlbmd0aH0gdmlzaWJsZSBtZWRpYSBlbGVtZW50c2BcbiAgICAgICk7XG4gICAgICB0aGlzLmFwcGx5U2V0dGluZ3NJbW1lZGlhdGVseSh2aXNpYmxlTWVkaWEsIHNldHRpbmdzLCBkaXNhYmxlZCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEZvcmNlIHVwZGF0ZSBvZiBhdWRpbyBlZmZlY3RzIGV2ZW4gaWYgY29udGV4dCBhbHJlYWR5IGV4aXN0c1xuICAgKiBVc2VmdWwgZm9yIGltbWVkaWF0ZSBhcHBsaWNhdGlvbiBvZiBmaWx0ZXIvYXVkaW8gY2hhbmdlc1xuICAgKi9cbiAgYXN5bmMgZm9yY2VBdWRpb0VmZmVjdHNVcGRhdGUoc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zb2xlLmxvZyhcIltNZWRpYVByb2Nlc3Nvcl0gRm9yY2luZyBhdWRpbyBlZmZlY3RzIHVwZGF0ZVwiKTtcblxuICAgIGlmIChcbiAgICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3JbXCJhdWRpb0NvbnRleHRcIl0gJiZcbiAgICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3JbXCJhdWRpb0NvbnRleHRcIl0uc3RhdGUgIT09IFwiY2xvc2VkXCJcbiAgICApIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIENyZWF0ZSBuZXcgYXVkaW8gY29udGV4dCBpZiBuZWVkZWRcbiAgICAgICAgaWYgKHRoaXMuYXVkaW9Qcm9jZXNzb3JbXCJhdWRpb0NvbnRleHRcIl0uc3RhdGUgPT09IFwic3VzcGVuZGVkXCIpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmF1ZGlvUHJvY2Vzc29yW1wiYXVkaW9Db250ZXh0XCJdLnJlc3VtZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRm9yY2UgdXBkYXRlIG9mIGF1ZGlvIGVmZmVjdHNcbiAgICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci51cGRhdGVBdWRpb0VmZmVjdHMoc2V0dGluZ3MpO1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBcIltNZWRpYVByb2Nlc3Nvcl0gU3VjY2Vzc2Z1bGx5IGZvcmNlZCBhdWRpbyBlZmZlY3RzIHVwZGF0ZVwiXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgXCJbTWVkaWFQcm9jZXNzb3JdIEZhaWxlZCB0byBmb3JjZSBhdWRpbyBlZmZlY3RzIHVwZGF0ZTpcIixcbiAgICAgICAgICBlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBcIltNZWRpYVByb2Nlc3Nvcl0gQ3JlYXRpbmcgbmV3IGF1ZGlvIGNvbnRleHQgZm9yIGZvcmNlZCB1cGRhdGVcIlxuICAgICAgKTtcbiAgICAgIGNvbnN0IG1vY2tFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImF1ZGlvXCIpO1xuICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci5zZXR1cEF1ZGlvQ29udGV4dChtb2NrRWxlbWVudCwgc2V0dGluZ3MpO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgc2V0dXBNZWRpYU9ic2VydmVyKFxuICAgIG9uQWRkZWQ6IChlbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiBQcm9taXNlPHZvaWQ+LFxuICAgIG9uUmVtb3ZlZDogKGVsZW1lbnRzOiBIVE1MTWVkaWFFbGVtZW50W10pID0+IHZvaWRcbiAgKTogTXV0YXRpb25PYnNlcnZlciB7XG4gICAgLy8gQ2hhbmdlIHJldHVybiB0eXBlIHRvIE11dGF0aW9uT2JzZXJ2ZXJcbiAgICByZXR1cm4gTWVkaWFNYW5hZ2VyLnNldHVwTWVkaWFFbGVtZW50T2JzZXJ2ZXIob25BZGRlZCwgb25SZW1vdmVkKTsgLy8gUmV0dXJuIHRoZSBvYnNlcnZlclxuICB9XG5cbiAgZmluZE1lZGlhRWxlbWVudHMoKTogSFRNTE1lZGlhRWxlbWVudFtdIHtcbiAgICAvLyBBc3N1bWluZyBNZWRpYU1hbmFnZXIuZmluZE1lZGlhRWxlbWVudHMgaXMgbWFkZSBwdWJsaWNcbiAgICByZXR1cm4gTWVkaWFNYW5hZ2VyLmZpbmRNZWRpYUVsZW1lbnRzKCk7XG4gIH1cblxuICBhc3luYyByZXNldFRvRGlzYWJsZWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci5yZXNldEFsbFRvRGlzYWJsZWQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQdWJsaWMgbWV0aG9kIHRvIGF0dGVtcHQgcmVzdW1pbmcgdGhlIEF1ZGlvQ29udGV4dCB2aWEgdGhlIHByaXZhdGUgQXVkaW9Qcm9jZXNzb3IuXG4gICAqL1xuICBwdWJsaWMgYXN5bmMgYXR0ZW1wdENvbnRleHRSZXN1bWUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gQWNjZXNzIHRoZSBwcml2YXRlIG1lbWJlciB1c2luZyBicmFja2V0IG5vdGF0aW9uIGlmIG5lZWRlZCwgb3IgbWFrZSBpdCBwdWJsaWMvaW50ZXJuYWxcbiAgICBhd2FpdCB0aGlzLmF1ZGlvUHJvY2Vzc29yLnRyeVJlc3VtZUNvbnRleHQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQdWJsaWMgbWV0aG9kIHRvIGNoZWNrIGlmIHRoZSBBdWRpb0NvbnRleHQgaXMgcmVhZHkgZm9yIGFwcGx5aW5nIGF1ZGlvIGVmZmVjdHMuXG4gICAqL1xuICBwdWJsaWMgY2FuQXBwbHlBdWRpb0VmZmVjdHMoKTogYm9vbGVhbiB7XG4gICAgLy8gQ2hlY2sgaWYgYXVkaW9Qcm9jZXNzb3IgYW5kIGl0cyBhdWRpb0NvbnRleHQgZXhpc3QgYW5kIGFyZSBpbiAncnVubmluZycgc3RhdGVcbiAgICByZXR1cm4gKFxuICAgICAgISF0aGlzLmF1ZGlvUHJvY2Vzc29yW1wiYXVkaW9Db250ZXh0XCJdICYmXG4gICAgICB0aGlzLmF1ZGlvUHJvY2Vzc29yW1wiYXVkaW9Db250ZXh0XCJdLnN0YXRlID09PSBcInJ1bm5pbmdcIlxuICAgICk7XG4gIH1cbn0gLy8gRW5kIG9mIE1lZGlhUHJvY2Vzc29yIGNsYXNzXG4iLCJleHBvcnQgaW50ZXJmYWNlIEF1ZGlvU2V0dGluZ3Mge1xuICB2b2x1bWU6IG51bWJlcjtcbiAgYmFzc0Jvb3N0OiBudW1iZXI7XG4gIHZvaWNlQm9vc3Q6IG51bWJlcjtcbiAgbW9ubzogYm9vbGVhbjtcbiAgc3BlZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlU2V0dGluZ3Mge1xuICBlbmFibGVkOiBib29sZWFuO1xuICBzZXR0aW5ncz86IEF1ZGlvU2V0dGluZ3M7XG4gIGFjdGl2ZVNldHRpbmc6IFwiZ2xvYmFsXCIgfCBcInNpdGVcIiB8IFwiZGlzYWJsZWRcIjtcbn1cblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRTZXR0aW5nczogQXVkaW9TZXR0aW5ncyA9IHtcbiAgdm9sdW1lOiAxMDAsXG4gIGJhc3NCb29zdDogMTAwLFxuICB2b2ljZUJvb3N0OiAxMDAsXG4gIG1vbm86IGZhbHNlLFxuICBzcGVlZDogMTAwLFxufTtcblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRTaXRlU2V0dGluZ3M6IFNpdGVTZXR0aW5ncyA9IHtcbiAgZW5hYmxlZDogdHJ1ZSxcbiAgc2V0dGluZ3M6IHsgLi4uZGVmYXVsdFNldHRpbmdzIH0sXG4gIGFjdGl2ZVNldHRpbmc6IFwiZ2xvYmFsXCIsIC8vIFN0YXJ0cyBpbiBnbG9iYWwgbW9kZSwgY2FuIGJlIGNoYW5nZWQgdG8gXCJzaXRlXCIgb3IgXCJkaXNhYmxlZFwiXG59O1xuXG5leHBvcnQgdHlwZSBTdGF0ZVR5cGUgPSB7XG4gIGdsb2JhbFNldHRpbmdzOiBBdWRpb1NldHRpbmdzO1xuICBzaXRlU2V0dGluZ3M6IE1hcDxzdHJpbmcsIFNpdGVTZXR0aW5ncz47XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFVwZGF0ZVNldHRpbmdzTWVzc2FnZSB7XG4gIHR5cGU6IFwiVVBEQVRFX1NFVFRJTkdTXCI7XG4gIHNldHRpbmdzOiBBdWRpb1NldHRpbmdzO1xuICBlbmFibGVkPzogYm9vbGVhbjtcbiAgaXNHbG9iYWw/OiBib29sZWFuO1xuICBob3N0bmFtZT86IHN0cmluZzsgLy8gQWRkIG9wdGlvbmFsIGhvc3RuYW1lXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udGVudFNjcmlwdFJlYWR5TWVzc2FnZSB7XG4gIHR5cGU6IFwiQ09OVEVOVF9TQ1JJUFRfUkVBRFlcIjtcbiAgaG9zdG5hbWU/OiBzdHJpbmc7XG4gIHVzaW5nR2xvYmFsPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBVcGRhdGVTaXRlTW9kZU1lc3NhZ2Uge1xuICB0eXBlOiBcIlVQREFURV9TSVRFX01PREVcIjtcbiAgaG9zdG5hbWU/OiBzdHJpbmc7XG4gIG1vZGU/OiBcImdsb2JhbFwiIHwgXCJzaXRlXCIgfCBcImRpc2FibGVkXCI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2V0SW5pdGlhbFNldHRpbmdzTWVzc2FnZSB7XG4gIHR5cGU6IFwiR0VUX0lOSVRJQUxfU0VUVElOR1NcIjtcbiAgaG9zdG5hbWU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIE1lc3NhZ2VUeXBlID1cbiAgfCBVcGRhdGVTZXR0aW5nc01lc3NhZ2VcbiAgfCBDb250ZW50U2NyaXB0UmVhZHlNZXNzYWdlXG4gIHwgVXBkYXRlU2l0ZU1vZGVNZXNzYWdlXG4gIHwgR2V0SW5pdGlhbFNldHRpbmdzTWVzc2FnZTtcblxuZXhwb3J0IHR5cGUgU3RvcmFnZURhdGEgPSB7XG4gIGdsb2JhbFNldHRpbmdzPzogQXVkaW9TZXR0aW5ncztcbiAgc2l0ZVNldHRpbmdzPzogeyBbaG9zdG5hbWU6IHN0cmluZ106IFNpdGVTZXR0aW5ncyB9O1xufTtcblxuLyoqXG4gKiBDaGVjayBpZiBhbGwgYXVkaW8gc2V0dGluZ3MgYXJlIGF0IHRoZWlyIGRlZmF1bHQgKGRpc2FibGVkKSB2YWx1ZXMuXG4gKiBUaGlzIGlzIGEgcHVyZSBmdW5jdGlvbiB1c2VkIGFjcm9zcyBjb250ZW50IHNjcmlwdCBhbmQgcG9wdXAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1NldHRpbmdzRGlzYWJsZWQoc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MpOiBib29sZWFuIHtcbiAgcmV0dXJuIChcbiAgICBzZXR0aW5ncy5zcGVlZCA9PT0gMTAwICYmXG4gICAgc2V0dGluZ3Mudm9sdW1lID09PSAxMDAgJiZcbiAgICBzZXR0aW5ncy5iYXNzQm9vc3QgPT09IDEwMCAmJlxuICAgIHNldHRpbmdzLnZvaWNlQm9vc3QgPT09IDEwMCAmJlxuICAgICFzZXR0aW5ncy5tb25vXG4gICk7XG59XG5cbi8qKlxuICogRGVidWcgbG9nZ2VyIHRoYXQgY2FuIGJlIGRpc2FibGVkIGluIHByb2R1Y3Rpb24uXG4gKiBTZXQgbG9jYWxTdG9yYWdlLmRlYnVnVnZwID0gJ3RydWUnIHRvIGVuYWJsZSBkZWJ1ZyBvdXRwdXQuXG4gKi9cbmNvbnN0IERFQlVHX0VOQUJMRUQgPVxuICB0eXBlb2YgbG9jYWxTdG9yYWdlICE9PSBcInVuZGVmaW5lZFwiICYmXG4gIGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwiZGVidWdWdnBcIikgPT09IFwidHJ1ZVwiO1xuXG5leHBvcnQgZnVuY3Rpb24gZGVidWdMb2coLi4uYXJnczogYW55W10pIHtcbiAgaWYgKERFQlVHX0VOQUJMRUQpIHtcbiAgICBjb25zb2xlLmxvZyhcIltWVlBdXCIsIC4uLmFyZ3MpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWJ1Z1dhcm4oLi4uYXJnczogYW55W10pIHtcbiAgaWYgKERFQlVHX0VOQUJMRUQpIHtcbiAgICBjb25zb2xlLndhcm4oXCJbVlZQXVwiLCAuLi5hcmdzKTtcbiAgfVxufVxuXG4iLCJpbXBvcnQgeyBBdWRpb1NldHRpbmdzLCBkZWZhdWx0U2V0dGluZ3MgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NIYW5kbGVyIHtcbiAgcHJpdmF0ZSBjdXJyZW50U2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3M7XG4gIHByaXZhdGUgdGFyZ2V0SG9zdG5hbWU6IHN0cmluZyB8IG51bGwgPSBudWxsOyAvLyBTdG9yZSB0aGUgaG9zdG5hbWUgd2Ugc2hvdWxkIHVzZVxuICBwcml2YXRlIGluaXRpYWxpemF0aW9uQ29tcGxldGU6IFByb21pc2U8dm9pZD47XG4gIHByaXZhdGUgcmVzb2x2ZUluaXRpYWxpemF0aW9uITogKCkgPT4gdm9pZDsgLy8gRGVmaW5pdGUgYXNzaWdubWVudCBhc3NlcnRpb25cblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyA9IHsgLi4uZGVmYXVsdFNldHRpbmdzIH07IC8vIFN0YXJ0IHdpdGggZGVmYXVsdHNcbiAgICAvLyBEb24ndCBzZXQgaG9zdG5hbWUgaGVyZSwgd2FpdCBmb3IgaW5pdGlhbGl6ZVxuICAgIHRoaXMuaW5pdGlhbGl6YXRpb25Db21wbGV0ZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICB0aGlzLnJlc29sdmVJbml0aWFsaXphdGlvbiA9IHJlc29sdmU7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogSW5pdGlhbGl6ZXMgdGhlIGhhbmRsZXIgYnkgcmVxdWVzdGluZyB0aGUgY29ycmVjdCBzZXR0aW5nc1xuICAgKiBmb3IgdGhlIHRhcmdldCBob3N0bmFtZSBmcm9tIHRoZSBiYWNrZ3JvdW5kIHNjcmlwdC5cbiAgICogQHBhcmFtIGhvc3RuYW1lIFRoZSBob3N0bmFtZSB0byBmZXRjaCBzZXR0aW5ncyBmb3IgKGlkZWFsbHkgdG9wLWxldmVsKS5cbiAgICovXG4gIGFzeW5jIGluaXRpYWxpemUoaG9zdG5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMudGFyZ2V0SG9zdG5hbWUgPSBob3N0bmFtZTsgLy8gU3RvcmUgdGhlIHRhcmdldCBob3N0bmFtZVxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogSW5pdGlhbGl6aW5nLi4uYFxuICAgICk7XG5cbiAgICBpZiAoIXRoaXMudGFyZ2V0SG9zdG5hbWUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IEluaXRpYWxpemF0aW9uIGFib3J0ZWQgLSBubyB2YWxpZCB0YXJnZXQgaG9zdG5hbWUgcHJvdmlkZWQuYFxuICAgICAgKTtcbiAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0geyAuLi5kZWZhdWx0U2V0dGluZ3MgfTtcbiAgICAgIHRoaXMucmVzb2x2ZUluaXRpYWxpemF0aW9uKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBgU2V0dGluZ3NIYW5kbGVyIChUYXJnZXQ6ICR7dGhpcy50YXJnZXRIb3N0bmFtZX0pOiBBdHRlbXB0aW5nIHRvIHNlbmQgR0VUX0lOSVRJQUxfU0VUVElOR1MuYFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICB0eXBlOiBcIkdFVF9JTklUSUFMX1NFVFRJTkdTXCIsXG4gICAgICAgIGhvc3RuYW1lOiB0aGlzLnRhcmdldEhvc3RuYW1lLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgU2V0dGluZ3NIYW5kbGVyIChUYXJnZXQ6ICR7dGhpcy50YXJnZXRIb3N0bmFtZX0pOiBHRVRfSU5JVElBTF9TRVRUSU5HUyByZXNwb25zZSByZWNlaXZlZDpgLFxuICAgICAgICByZXNwb25zZVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLnNldHRpbmdzKSB7XG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0gcmVzcG9uc2Uuc2V0dGluZ3M7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IFN1Y2Nlc3NmdWxseSBhcHBsaWVkIGluaXRpYWwgc2V0dGluZ3MgZnJvbSBiYWNrZ3JvdW5kOmAsXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5jdXJyZW50U2V0dGluZ3MpXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyA9IHsgLi4uZGVmYXVsdFNldHRpbmdzIH07XG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBgU2V0dGluZ3NIYW5kbGVyIChUYXJnZXQ6ICR7dGhpcy50YXJnZXRIb3N0bmFtZX0pOiBObyB2YWxpZCBzZXR0aW5ncyBpbiByZXNwb25zZSBvciByZXNwb25zZSB3YXMgbnVsbC91bmRlZmluZWQuIFVzaW5nIGRlZmF1bHRzLiBSZXNwb25zZTpgLFxuICAgICAgICAgIHJlc3BvbnNlLFxuICAgICAgICAgIFwiQ3VycmVudCBzZXR0aW5ncyBub3c6XCIsXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5jdXJyZW50U2V0dGluZ3MpXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0geyAuLi5kZWZhdWx0U2V0dGluZ3MgfTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IEVycm9yIGR1cmluZyBHRVRfSU5JVElBTF9TRVRUSU5HUyBzZW5kTWVzc2FnZSBvciBwcm9jZXNzaW5nOmAsXG4gICAgICAgIGVycm9yLFxuICAgICAgICBcIlVzaW5nIGRlZmF1bHRzLiBDdXJyZW50IHNldHRpbmdzIG5vdzpcIixcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5jdXJyZW50U2V0dGluZ3MpXG4gICAgICApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogSW5pdGlhbGl6YXRpb24gcHJvbWlzZSByZXNvbHZpbmcuIEZpbmFsIGN1cnJlbnRTZXR0aW5ncyBzdGF0ZSBmb3IgdGhpcyBpbml0IGN5Y2xlOmAsXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KHRoaXMuY3VycmVudFNldHRpbmdzKVxuICAgICAgKTtcbiAgICAgIHRoaXMucmVzb2x2ZUluaXRpYWxpemF0aW9uKCk7IC8vIFNpZ25hbCB0aGF0IGluaXRpYWxpemF0aW9uIGlzIGRvbmVcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBvbmNlIGluaXRpYWwgc2V0dGluZ3MgaGF2ZSBiZWVuXG4gICAqIGZldGNoZWQgKG9yIGZhaWxlZCB0byBmZXRjaCkgZnJvbSB0aGUgYmFja2dyb3VuZCBzY3JpcHQuXG4gICAqL1xuICBhc3luYyBlbnN1cmVJbml0aWFsaXplZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5pbml0aWFsaXphdGlvbkNvbXBsZXRlO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgdGhlIGN1cnJlbnRseSBsb2FkZWQgc2V0dGluZ3MuXG4gICAqL1xuICBnZXRDdXJyZW50U2V0dGluZ3MoKTogQXVkaW9TZXR0aW5ncyB7XG4gICAgcmV0dXJuIHRoaXMuY3VycmVudFNldHRpbmdzO1xuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZXMgc2V0dGluZ3MgbG9jYWxseS4gU2hvdWxkIHByaW1hcmlseSBiZSB1c2VkIHdoZW4gcmVjZWl2aW5nXG4gICAqIHVwZGF0ZXMgZnJvbSB0aGUgYmFja2dyb3VuZCBzY3JpcHQgdmlhIG1lc3NhZ2VzLlxuICAgKi9cbiAgdXBkYXRlU2V0dGluZ3Moc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MpOiB2b2lkIHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IFNldHRpbmdzIHVwZGF0ZWQgZGlyZWN0bHlgLFxuICAgICAgc2V0dGluZ3NcbiAgICApO1xuICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0gc2V0dGluZ3M7XG4gIH1cblxuICAvKipcbiAgICogUmVzZXRzIHNldHRpbmdzIHRvIHRoZSBhcHBsaWNhdGlvbiBkZWZhdWx0cyBsb2NhbGx5LlxuICAgKi9cbiAgcmVzZXRUb0RlZmF1bHQoKTogdm9pZCB7XG4gICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9O1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVybWluZXMgaWYgYXVkaW8gcHJvY2Vzc2luZyBpcyBuZWVkZWQgYmFzZWQgb24gY3VycmVudCBzZXR0aW5ncy5cbiAgICovXG4gIG5lZWRzQXVkaW9Qcm9jZXNzaW5nKCk6IGJvb2xlYW4ge1xuICAgIC8vIENoZWNrIGlmIHNldHRpbmdzIGFyZSBkaWZmZXJlbnQgZnJvbSBkZWZhdWx0cywgaW1wbHlpbmcgcHJvY2Vzc2luZyBpcyBuZWVkZWRcbiAgICBjb25zdCBkZWZhdWx0cyA9IGRlZmF1bHRTZXR0aW5ncztcbiAgICBjb25zdCBuZWVkc1Byb2Nlc3NpbmcgPSAhKFxuICAgICAgKFxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncy52b2x1bWUgPT09IGRlZmF1bHRzLnZvbHVtZSAmJlxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncy5iYXNzQm9vc3QgPT09IGRlZmF1bHRzLmJhc3NCb29zdCAmJlxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncy52b2ljZUJvb3N0ID09PSBkZWZhdWx0cy52b2ljZUJvb3N0ICYmXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzLm1vbm8gPT09IGRlZmF1bHRzLm1vbm9cbiAgICAgIClcbiAgICAgIC8vIEFkZCBvdGhlciByZWxldmFudCBzZXR0aW5ncyBjaGVja3MgaGVyZSBpZiBuZWVkZWRcbiAgICApO1xuICAgIC8vIGNvbnNvbGUubG9nKGBTZXR0aW5nc0hhbmRsZXIgKCR7dGhpcy5ob3N0bmFtZX0pOiBuZWVkc0F1ZGlvUHJvY2Vzc2luZyA9ICR7bmVlZHNQcm9jZXNzaW5nfWApO1xuICAgIHJldHVybiBuZWVkc1Byb2Nlc3Npbmc7XG4gIH1cbn1cbiIsImltcG9ydCB7IFNldHRpbmdzSGFuZGxlciB9IGZyb20gXCIuL3NldHRpbmdzLWhhbmRsZXJcIjtcbmltcG9ydCB7IE1lZGlhUHJvY2Vzc29yIH0gZnJvbSBcIi4vbWVkaWEtcHJvY2Vzc29yXCI7XG5cbnR5cGUgSW5pdGlhbGl6ZVNjcmlwdENhbGxiYWNrID0gKGhvc3RuYW1lOiBzdHJpbmcpID0+IFByb21pc2U8dm9pZD47XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXR1cEhvc3RuYW1lRGV0ZWN0aW9uKFxuICBpbml0aWFsaXplU2NyaXB0OiBJbml0aWFsaXplU2NyaXB0Q2FsbGJhY2tcbik6ICgpID0+IHZvaWQge1xuICBsZXQgY2xlYW51cEZ1bmN0aW9uczogKCgpID0+IHZvaWQpW10gPSBbXTtcblxuICBpZiAod2luZG93LnNlbGYgPT09IHdpbmRvdy50b3ApIHtcbiAgICAvLyAtLS0gUnVubmluZyBpbiB0aGUgVE9QIHdpbmRvdyAtLS1cbiAgICBjb25zdCB0b3BIb3N0bmFtZSA9IHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZTtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBbQ29udGVudFNjcmlwdF0gUnVubmluZyBpbiBUT1Agd2luZG93LiBIb3N0bmFtZTogJHt0b3BIb3N0bmFtZX1gXG4gICAgKTtcbiAgICBpbml0aWFsaXplU2NyaXB0KHRvcEhvc3RuYW1lKTsgLy8gSW5pdGlhbGl6ZSBmb3IgdGhlIHRvcCB3aW5kb3dcblxuICAgIC8vIExpc3RlbmVyIGZvciByZXF1ZXN0cyBmcm9tIGlmcmFtZXNcbiAgICBjb25zdCB0b3BXaW5kb3dNZXNzYWdlTGlzdGVuZXIgPSAoZXZlbnQ6IE1lc3NhZ2VFdmVudCkgPT4ge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBUT1BdIFJlY2VpdmVkIG1lc3NhZ2UuIE9yaWdpbjogJHtcbiAgICAgICAgICBldmVudC5vcmlnaW5cbiAgICAgICAgfSwgRGF0YSBUeXBlOiAke3R5cGVvZiBldmVudC5kYXRhfSwgRGF0YTogJHtldmVudC5kYXRhfWBcbiAgICAgICk7XG5cbiAgICAgIC8vIE9ubHkgcHJvY2VzcyBtZXNzYWdlcyB0aGF0IGFyZSBzdHJpbmdzIGFuZCBsb29rIGxpa2Ugb3VyIEpTT04gbWVzc2FnZXNcbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIGV2ZW50LmRhdGEgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgICAgIWV2ZW50LmRhdGEuc3RhcnRzV2l0aChcIntcIikgfHxcbiAgICAgICAgIWV2ZW50LmRhdGEuZW5kc1dpdGgoXCJ9XCIpXG4gICAgICApIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgXCJbQ29udGVudFNjcmlwdCBUT1BdIElnbm9yaW5nIG5vbi1KU09OIG9yIG5vbi1WVlAgbWVzc2FnZSBmcm9tIGlmcmFtZSAoZm9ybWF0IG1pc21hdGNoKS5cIlxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZCBhIGNoZWNrIGZvciBvdXIgc3BlY2lmaWMgbWVzc2FnZSB0eXBlcyBiZWZvcmUgcGFyc2luZ1xuICAgICAgaWYgKFxuICAgICAgICAhZXZlbnQuZGF0YS5pbmNsdWRlcyhcIlZWUF9SRVFVRVNUX1RPUF9IT1NUTkFNRVwiKSAmJlxuICAgICAgICAhZXZlbnQuZGF0YS5pbmNsdWRlcyhcIlZWUF9UT1BfSE9TVE5BTUVfSU5GT1wiKVxuICAgICAgKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIFwiW0NvbnRlbnRTY3JpcHQgVE9QXSBJZ25vcmluZyBub24tVlZQIG1lc3NhZ2UgZnJvbSBpZnJhbWUgKGNvbnRlbnQgbWlzbWF0Y2gpLlwiXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGxldCBwYXJzZWREYXRhO1xuICAgICAgdHJ5IHtcbiAgICAgICAgcGFyc2VkRGF0YSA9IEpTT04ucGFyc2UoZXZlbnQuZGF0YSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBcIltDb250ZW50U2NyaXB0IFRPUF0gRmFpbGVkIHRvIHBhcnNlIGV2ZW50LmRhdGEgc3RyaW5nIGZyb20gaWZyYW1lIChsaWtlbHkgbm90IG91ciBtZXNzYWdlKTpcIixcbiAgICAgICAgICBldmVudC5kYXRhLFxuICAgICAgICAgIGVcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IFRPUF0gUGFyc2VkIFZWUCBtZXNzYWdlIGZyb20gaWZyYW1lIChPcmlnaW46ICR7ZXZlbnQub3JpZ2lufSk6YCxcbiAgICAgICAgcGFyc2VkRGF0YVxuICAgICAgKTtcblxuICAgICAgaWYgKFxuICAgICAgICBldmVudC5zb3VyY2UgJiYgLy8gRW5zdXJlIHNvdXJjZSBleGlzdHMgKHNvdXJjZSBpcyB0aGUgd2luZG93IG9iamVjdCBvZiB0aGUgc2VuZGVyKVxuICAgICAgICBwYXJzZWREYXRhICYmXG4gICAgICAgIHBhcnNlZERhdGEudHlwZSA9PT0gXCJWVlBfUkVRVUVTVF9UT1BfSE9TVE5BTUVcIlxuICAgICAgKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBUT1BdIFByb2Nlc3NpbmcgVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FIGZyb20gaWZyYW1lIChTb3VyY2Ugb3JpZ2luOiAke2V2ZW50Lm9yaWdpbn0pLiBSZXNwb25kaW5nIHdpdGggaG9zdG5hbWU6ICR7dG9wSG9zdG5hbWV9LmBcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2VQYXlsb2FkID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHR5cGU6IFwiVlZQX1RPUF9IT1NUTkFNRV9JTkZPXCIsXG4gICAgICAgICAgaG9zdG5hbWU6IHRvcEhvc3RuYW1lLFxuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgICAvLyBIYW5kbGUgc2FuZGJveGVkIGVudmlyb25tZW50cyB3aGVyZSBldmVudC5vcmlnaW4gbWlnaHQgYmUgXCJudWxsXCJcbiAgICAgICAgY29uc3QgdGFyZ2V0T3JpZ2luID0gZXZlbnQub3JpZ2luID09PSBcIm51bGxcIiA/IFwiKlwiIDogZXZlbnQub3JpZ2luO1xuICAgICAgICAoZXZlbnQuc291cmNlIGFzIFdpbmRvdykucG9zdE1lc3NhZ2UocmVzcG9uc2VQYXlsb2FkLCB0YXJnZXRPcmlnaW4pO1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBgW0NvbnRlbnRTY3JpcHQgVE9QXSBTZW50IFZWUF9UT1BfSE9TVE5BTUVfSU5GTyByZXNwb25zZSB0byBpZnJhbWUgYXQgJHtldmVudC5vcmlnaW59LmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBUT1BdIFJlY2VpdmVkIG90aGVyIHBhcnNlZCBKU09OIG1lc3NhZ2UgdHlwZSAobm90IFZWUF9SRVFVRVNUX1RPUF9IT1NUTkFNRSk6ICR7cGFyc2VkRGF0YS50eXBlfSBmcm9tIG9yaWdpbiAke2V2ZW50Lm9yaWdpbn1gLFxuICAgICAgICAgIHBhcnNlZERhdGFcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCB0b3BXaW5kb3dNZXNzYWdlTGlzdGVuZXIpO1xuICAgIGNvbnN0IHJlbW92ZVRvcExpc3RlbmVyID0gKCkgPT4gd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIHRvcFdpbmRvd01lc3NhZ2VMaXN0ZW5lcik7XG4gICAgY2xlYW51cEZ1bmN0aW9ucy5wdXNoKHJlbW92ZVRvcExpc3RlbmVyKTtcbiAgfSBlbHNlIHtcbiAgICAvLyAtLS0gUnVubmluZyBpbiBhbiBJRlJBTUUgLS0tXG4gICAgY29uc3QgaWZyYW1lT3duSG9zdG5hbWUgPSB3aW5kb3cubG9jYXRpb24uaG9zdG5hbWU7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBSdW5uaW5nIGluIElGUkFNRS4gT3duIGhvc3RuYW1lOiAke2lmcmFtZU93bkhvc3RuYW1lfS4gQXR0ZW1wdGluZyB0byByZXF1ZXN0IGhvc3RuYW1lIGZyb20gdG9wIHdpbmRvdy4gU2V0dGluZyB1cCBtZXNzYWdlIGxpc3RlbmVyLmBcbiAgICApO1xuICAgIGxldCByZWNlaXZlZEhvc3RuYW1lID0gZmFsc2U7XG4gICAgbGV0IGZhbGxiYWNrVGltZW91dDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgICAvLyBMaXN0ZW5lciBmb3IgdGhlIHJlc3BvbnNlIGZyb20gdGhlIHRvcCB3aW5kb3dcbiAgICBjb25zdCByZXNwb25zZUxpc3RlbmVyID0gKGV2ZW50OiBNZXNzYWdlRXZlbnQpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBSZWNlaXZlZCBtZXNzYWdlLiBPcmlnaW46ICR7XG4gICAgICAgICAgZXZlbnQub3JpZ2luXG4gICAgICAgIH0sIERhdGEgVHlwZTogJHt0eXBlb2YgZXZlbnQuZGF0YX0sIERhdGE6ICR7ZXZlbnQuZGF0YX1gXG4gICAgICApO1xuXG4gICAgICAvLyBPbmx5IHByb2Nlc3MgbWVzc2FnZXMgZnJvbSB0aGUgdG9wIHdpbmRvd1xuICAgICAgaWYgKGV2ZW50LnNvdXJjZSAhPT0gd2luZG93LnRvcCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBSZWNlaXZlZCBtZXNzYWdlIGZyb20gbm9uLXRvcCBzb3VyY2U6ICR7ZXZlbnQub3JpZ2lufS4gSWdub3JpbmcuYFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIE9ubHkgcHJvY2VzcyBtZXNzYWdlcyB0aGF0IGFyZSBzdHJpbmdzIGFuZCBsb29rIGxpa2Ugb3VyIEpTT04gbWVzc2FnZXNcbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIGV2ZW50LmRhdGEgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgICAgIWV2ZW50LmRhdGEuc3RhcnRzV2l0aChcIntcIikgfHxcbiAgICAgICAgIWV2ZW50LmRhdGEuZW5kc1dpdGgoXCJ9XCIpXG4gICAgICApIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgXCJbQ29udGVudFNjcmlwdCBpRnJhbWVdIElnbm9yaW5nIG5vbi1KU09OIG9yIG5vbi1WVlAgbWVzc2FnZSBmcm9tIHRvcCAoZm9ybWF0IG1pc21hdGNoKS5cIlxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZCBhIGNoZWNrIGZvciBvdXIgc3BlY2lmaWMgbWVzc2FnZSB0eXBlcyBiZWZvcmUgcGFyc2luZ1xuICAgICAgaWYgKFxuICAgICAgICAhZXZlbnQuZGF0YS5pbmNsdWRlcyhcIlZWUF9SRVFVRVNUX1RPUF9IT1NUTkFNRVwiKSAmJlxuICAgICAgICAhZXZlbnQuZGF0YS5pbmNsdWRlcyhcIlZWUF9UT1BfSE9TVE5BTUVfSU5GT1wiKVxuICAgICAgKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIFwiW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBJZ25vcmluZyBub24tVlZQIG1lc3NhZ2UgZnJvbSB0b3AgKGNvbnRlbnQgbWlzbWF0Y2gpLlwiXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbGV0IHBhcnNlZERhdGE7XG4gICAgICB0cnkge1xuICAgICAgICBwYXJzZWREYXRhID0gSlNPTi5wYXJzZShldmVudC5kYXRhKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIFwiW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBGYWlsZWQgdG8gcGFyc2UgZXZlbnQuZGF0YSBzdHJpbmcgZnJvbSB0b3A6XCIsXG4gICAgICAgICAgZXZlbnQuZGF0YSxcbiAgICAgICAgICBlXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFBhcnNlZCBWVlAgbWVzc2FnZSBmcm9tIHRvcCAoT3JpZ2luOiAke2V2ZW50Lm9yaWdpbn0pOmAsXG4gICAgICAgIHBhcnNlZERhdGFcbiAgICAgICk7XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFyc2VkRGF0YSAmJlxuICAgICAgICBwYXJzZWREYXRhLnR5cGUgPT09IFwiVlZQX1RPUF9IT1NUTkFNRV9JTkZPXCIgJiZcbiAgICAgICAgdHlwZW9mIHBhcnNlZERhdGEuaG9zdG5hbWUgPT09IFwic3RyaW5nXCJcbiAgICAgICkge1xuICAgICAgICBpZiAoZmFsbGJhY2tUaW1lb3V0KSB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KGZhbGxiYWNrVGltZW91dCk7XG4gICAgICAgICAgZmFsbGJhY2tUaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVjZWl2ZWRIb3N0bmFtZSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gQWxyZWFkeSByZWNlaXZlZCBob3N0bmFtZS4gSWdub3JpbmcgZHVwbGljYXRlIFZWUF9UT1BfSE9TVE5BTUVfSU5GTyBmcm9tIHRvcC4gT3JpZ2luOiAke2V2ZW50Lm9yaWdpbn0uIFBhcnNlZCBEYXRhOmAsXG4gICAgICAgICAgICBwYXJzZWREYXRhXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgcmVjZWl2ZWRIb3N0bmFtZSA9IHRydWU7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFN1Y2Nlc3NmdWxseSByZWNlaXZlZCBWVlBfVE9QX0hPU1ROQU1FX0lORk8gZnJvbSB0b3A6ICR7cGFyc2VkRGF0YS5ob3N0bmFtZX0uIE9yaWdpbjogJHtldmVudC5vcmlnaW59LiBJbml0aWFsaXppbmcgc2NyaXB0LiBQYXJzZWQgZGF0YTpgLFxuICAgICAgICAgIHBhcnNlZERhdGFcbiAgICAgICAgKTtcbiAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIHJlc3BvbnNlTGlzdGVuZXIpO1xuICAgICAgICAvLyBSZW1vdmUgdGhlIGNsZWFudXAgZnVuY3Rpb24gYnkgZmlsdGVyaW5nIHdpdGggdGhlIHNhbWUgcmVmZXJlbmNlXG4gICAgICAgIGNsZWFudXBGdW5jdGlvbnMgPSBjbGVhbnVwRnVuY3Rpb25zLmZpbHRlcigoZikgPT4gZiAhPT0gcmVtb3ZlUmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgICAgIGluaXRpYWxpemVTY3JpcHQocGFyc2VkRGF0YS5ob3N0bmFtZSk7XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlZERhdGEgJiYgcGFyc2VkRGF0YS50eXBlKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFJlY2VpdmVkIG90aGVyIHBhcnNlZCBKU09OIG1lc3NhZ2UgdHlwZSBmcm9tIHRvcDogJHtwYXJzZWREYXRhLnR5cGV9IGZyb20gb3JpZ2luICR7ZXZlbnQub3JpZ2lufWAsXG4gICAgICAgICAgcGFyc2VkRGF0YVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH07XG5cbiAgICAvLyBTdG9yZSB0aGUgY2xlYW51cCBmdW5jdGlvbiBpbiBhIHZhcmlhYmxlIHNvIHdlIGNhbiByZWZlcmVuY2UgaXQgZm9yIHJlbW92YWxcbiAgICBjb25zdCByZW1vdmVSZXNwb25zZUxpc3RlbmVyID0gKCkgPT4gd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIHJlc3BvbnNlTGlzdGVuZXIpO1xuXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIHJlc3BvbnNlTGlzdGVuZXIpO1xuICAgIGNsZWFudXBGdW5jdGlvbnMucHVzaChyZW1vdmVSZXNwb25zZUxpc3RlbmVyKTtcblxuICAgIC8vIFJlcXVlc3QgdGhlIGhvc3RuYW1lIGZyb20gdGhlIHRvcCB3aW5kb3csIHNlbmRpbmcgc3RyaW5naWZpZWQgSlNPTlxuICAgIGlmICh3aW5kb3cudG9wICYmIHdpbmRvdy50b3AgIT09IHdpbmRvdy5zZWxmKSB7XG4gICAgICAvLyBBZGQgYSBzbWFsbCBkZWxheSBiZWZvcmUgc2VuZGluZyB0aGUgbWVzc2FnZSB0byBnaXZlIHRoZSB0b3Agd2luZG93J3Mgc2NyaXB0IHRpbWUgdG8gaW5pdGlhbGl6ZVxuICAgICAgY29uc3QgcmVxdWVzdFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgLy8gUmUtY2hlY2sgd2luZG93LnRvcCBpbnNpZGUgdGhlIHRpbWVvdXQgY2FsbGJhY2sgdG8gc2F0aXNmeSBUeXBlU2NyaXB0IGFuZCBlbnN1cmUgcnVudGltZSBzYWZldHlcbiAgICAgICAgaWYgKHdpbmRvdy50b3AgJiYgd2luZG93LnRvcCAhPT0gd2luZG93LnNlbGYpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFNlbmRpbmcgVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FIHRvIHRvcCB3aW5kb3cgKE9yaWdpbjogJHt3aW5kb3cubG9jYXRpb24ub3JpZ2lufSkuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3QgbWVzc2FnZVBheWxvYWQgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICB0eXBlOiBcIlZWUF9SRVFVRVNUX1RPUF9IT1NUTkFNRVwiLFxuICAgICAgICAgICAgZnJvbUlmcmFtZTogdHJ1ZSxcbiAgICAgICAgICAgIGlmcmFtZU9yaWdpbjogd2luZG93LmxvY2F0aW9uLm9yaWdpbixcbiAgICAgICAgICB9KTtcbiAgICAgICAgICB3aW5kb3cudG9wLnBvc3RNZXNzYWdlKG1lc3NhZ2VQYXlsb2FkLCBcIipcIik7XG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBTZW50IFZWUF9SRVFVRVNUX1RPUF9IT1NUTkFNRSB0byB0b3Agd2luZG93LmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIHdpbmRvdy50b3AgYmVjYW1lIG51bGwgb3Igc2VsZiB3aXRoaW4gc2V0VGltZW91dC4gQ2Fubm90IHNlbmQgbWVzc2FnZS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSwgNTAwKTsgLy8gRGVsYXkgYnkgNTAwbXNcbiAgICAgIGNsZWFudXBGdW5jdGlvbnMucHVzaCgoKSA9PiBjbGVhclRpbWVvdXQocmVxdWVzdFRpbWVvdXQpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSB3aW5kb3cudG9wIGlzIG51bGwsIHNhbWUgYXMgc2VsZiwgb3IgaW5hY2Nlc3NpYmxlLiBJbml0aWFsaXppbmcgd2l0aCBvd24gaG9zdG5hbWU6ICR7aWZyYW1lT3duSG9zdG5hbWV9LmBcbiAgICAgICk7XG4gICAgICBpbml0aWFsaXplU2NyaXB0KGlmcmFtZU93bkhvc3RuYW1lKTtcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCByZXNwb25zZUxpc3RlbmVyKTsgLy8gQ2xlYW4gdXAgbGlzdGVuZXIgYXMgaXQncyBub3QgbmVlZGVkXG4gICAgICBjbGVhbnVwRnVuY3Rpb25zID0gY2xlYW51cEZ1bmN0aW9ucy5maWx0ZXIoKGYpID0+IGYgIT09IHJlbW92ZVJlc3BvbnNlTGlzdGVuZXIpO1xuICAgICAgcmV0dXJuICgpID0+IGNsZWFudXBGdW5jdGlvbnMuZm9yRWFjaCgoZikgPT4gZigpKTsgLy8gUmV0dXJuIGNsZWFudXAgaW1tZWRpYXRlbHlcbiAgICB9XG5cbiAgICAvLyBGYWxsYmFjayB0aW1lb3V0IGluIGNhc2UgdGhlIG1lc3NhZ2UgbmV2ZXIgYXJyaXZlc1xuICAgIGNvbnN0IFRJTUVPVVRfRFVSQVRJT04gPSAxMDAwMDsgLy8gSW5jcmVhc2VkIHRpbWVvdXQgdG8gMTAgc2Vjb25kc1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gU2V0dGluZyBmYWxsYmFjayB0aW1lb3V0IGZvciAke1RJTUVPVVRfRFVSQVRJT059bXMuIFRpbWVvdXQgSUQ6ICR7ZmFsbGJhY2tUaW1lb3V0fWBcbiAgICApO1xuICAgIGZhbGxiYWNrVGltZW91dCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBGYWxsYmFjayB0aW1lb3V0IHRyaWdnZXJlZC4gVGltZW91dCBJRDogJHtmYWxsYmFja1RpbWVvdXR9LiByZWNlaXZlZEhvc3RuYW1lOiAke3JlY2VpdmVkSG9zdG5hbWV9YFxuICAgICAgKTtcbiAgICAgIGZhbGxiYWNrVGltZW91dCA9IG51bGw7IC8vIENsZWFyIHRoZSB0aW1lb3V0IElEXG4gICAgICBpZiAoIXJlY2VpdmVkSG9zdG5hbWUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIERpZCBub3QgcmVjZWl2ZSBob3N0bmFtZSBmcm9tIHRvcCBhZnRlciAke1RJTUVPVVRfRFVSQVRJT059bXMuIFVzaW5nIG93biBob3N0bmFtZTogJHtpZnJhbWVPd25Ib3N0bmFtZX0uIFJlbW92aW5nIHJlc3BvbnNlIGxpc3RlbmVyLmBcbiAgICAgICAgKTtcbiAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIHJlc3BvbnNlTGlzdGVuZXIpOyAvLyBDbGVhbiB1cCBsaXN0ZW5lclxuICAgICAgICBjbGVhbnVwRnVuY3Rpb25zID0gY2xlYW51cEZ1bmN0aW9ucy5maWx0ZXIoKGYpID0+IGYgIT09IHJlbW92ZVJlc3BvbnNlTGlzdGVuZXIpO1xuICAgICAgICBpbml0aWFsaXplU2NyaXB0KGlmcmFtZU93bkhvc3RuYW1lKTsgLy8gSW5pdGlhbGl6ZSB3aXRoIG93biBob3N0bmFtZSBhcyBmYWxsYmFja1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gRmFsbGJhY2sgdGltZW91dCB0cmlnZ2VyZWQsIGJ1dCBob3N0bmFtZSB3YXMgYWxyZWFkeSByZWNlaXZlZC4gTm8gYWN0aW9uIG5lZWRlZC5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSwgVElNRU9VVF9EVVJBVElPTik7XG4gICAgY2xlYW51cEZ1bmN0aW9ucy5wdXNoKCgpID0+IHtcbiAgICAgIGlmIChmYWxsYmFja1RpbWVvdXQpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KGZhbGxiYWNrVGltZW91dCk7XG4gICAgICAgIGZhbGxiYWNrVGltZW91dCA9IG51bGw7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuICgpID0+IGNsZWFudXBGdW5jdGlvbnMuZm9yRWFjaCgoZikgPT4gZigpKTtcbn1cbiIsImltcG9ydCB7IE1lZGlhUHJvY2Vzc29yIH0gZnJvbSBcIi4uL21lZGlhLXByb2Nlc3NvclwiO1xuaW1wb3J0IHsgU2V0dGluZ3NIYW5kbGVyIH0gZnJvbSBcIi4uL3NldHRpbmdzLWhhbmRsZXJcIjtcbmltcG9ydCB7IGlzU2V0dGluZ3NEaXNhYmxlZCB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG4vKipcbiAqIENyZWF0ZXMgc3RhYmxlIGV2ZW50IGhhbmRsZXJzIGZvciBtZWRpYSBlbGVtZW50cyB0byBwcmV2ZW50IGxpc3RlbmVyIGxlYWtzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTWVkaWFFdmVudEhhbmRsZXJzKFxuICBzZXR0aW5nc0hhbmRsZXI6IFNldHRpbmdzSGFuZGxlcixcbiAgbWVkaWFQcm9jZXNzb3I6IE1lZGlhUHJvY2Vzc29yXG4pIHtcbiAgLy8gVHJhY2sgd2hpY2ggZWxlbWVudHMgaGF2ZSBoYWQgbGlzdGVuZXJzIGFkZGVkIHRvIGF2b2lkIGR1cGxpY2F0ZXNcbiAgY29uc3QgZWxlbWVudHNXaXRoTGlzdGVuZXJzID0gbmV3IFdlYWtTZXQ8SFRNTE1lZGlhRWxlbWVudD4oKTtcblxuICBjb25zdCBhcHBseVNldHRpbmdzVG9TaW5nbGVFbGVtZW50ID0gYXN5bmMgKGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQpID0+IHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudCBjYWxsZWQgZm9yICR7XG4gICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgfWBcbiAgICApO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBzZXR0aW5nc0hhbmRsZXIuZW5zdXJlSW5pdGlhbGl6ZWQoKTtcbiAgICAgIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzSGFuZGxlci5nZXRDdXJyZW50U2V0dGluZ3MoKTtcbiAgICAgIGNvbnN0IG5lZWRzUHJvY2Vzc2luZyA9IHNldHRpbmdzSGFuZGxlci5uZWVkc0F1ZGlvUHJvY2Vzc2luZygpO1xuXG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IERFQlVHXSBBcHBseWluZyBzZXR0aW5ncyB0byBzaW5nbGUgZWxlbWVudCAke1xuICAgICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgICB9OmBcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IGlzRGlzYWJsZWQgPSBpc1NldHRpbmdzRGlzYWJsZWQoY3VycmVudFNldHRpbmdzKTtcblxuICAgICAgLy8gQXBwbHkgaW1tZWRpYXRlIHNldHRpbmdzIChzcGVlZCwgdm9sdW1lKVxuICAgICAgbWVkaWFQcm9jZXNzb3IuYXBwbHlTZXR0aW5nc0ltbWVkaWF0ZWx5KFxuICAgICAgICBbZWxlbWVudF0sXG4gICAgICAgIGN1cnJlbnRTZXR0aW5ncyxcbiAgICAgICAgaXNEaXNhYmxlZFxuICAgICAgKTtcblxuICAgICAgLy8gQXBwbHkgYXVkaW8gZWZmZWN0cyBpZiBuZWVkZWRcbiAgICAgIGlmIChuZWVkc1Byb2Nlc3NpbmcpIHtcbiAgICAgICAgaWYgKG1lZGlhUHJvY2Vzc29yLmNhbkFwcGx5QXVkaW9FZmZlY3RzKCkpIHtcbiAgICAgICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5wcm9jZXNzTWVkaWFFbGVtZW50cyhcbiAgICAgICAgICAgIFtlbGVtZW50XSxcbiAgICAgICAgICAgIGN1cnJlbnRTZXR0aW5ncyxcbiAgICAgICAgICAgIG5lZWRzUHJvY2Vzc2luZ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IuYXR0ZW1wdENvbnRleHRSZXN1bWUoKTtcbiAgICAgICAgICBpZiAobWVkaWFQcm9jZXNzb3IuY2FuQXBwbHlBdWRpb0VmZmVjdHMoKSkge1xuICAgICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IucHJvY2Vzc01lZGlhRWxlbWVudHMoXG4gICAgICAgICAgICAgIFtlbGVtZW50XSxcbiAgICAgICAgICAgICAgY3VycmVudFNldHRpbmdzLFxuICAgICAgICAgICAgICBuZWVkc1Byb2Nlc3NpbmdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gRXJyb3IgYXBwbHlpbmcgc2V0dGluZ3MgdG8gc2luZ2xlIGVsZW1lbnQgJHtcbiAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgfTpgXG4gICAgICApO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBvbkxvYWRlZE1ldGFkYXRhID0gKGV2ZW50OiBFdmVudCkgPT4ge1xuICAgIGFwcGx5U2V0dGluZ3NUb1NpbmdsZUVsZW1lbnQoZXZlbnQudGFyZ2V0IGFzIEhUTUxNZWRpYUVsZW1lbnQpO1xuICB9O1xuICBjb25zdCBvbkNhblBsYXkgPSAoZXZlbnQ6IEV2ZW50KSA9PiB7XG4gICAgYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudChldmVudC50YXJnZXQgYXMgSFRNTE1lZGlhRWxlbWVudCk7XG4gIH07XG4gIGNvbnN0IG9uTG9hZFN0YXJ0ID0gKGV2ZW50OiBFdmVudCkgPT4ge1xuICAgIGFwcGx5U2V0dGluZ3NUb1NpbmdsZUVsZW1lbnQoZXZlbnQudGFyZ2V0IGFzIEhUTUxNZWRpYUVsZW1lbnQpO1xuICB9O1xuXG4gIGNvbnN0IHJlc3VtZUNvbnRleHRIYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBFdmVudCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgXCJDb250ZW50OiBNZWRpYSBpbnRlcmFjdGlvbiBkZXRlY3RlZCwgYXR0ZW1wdGluZyB0byByZXN1bWUgQXVkaW9Db250ZXh0LlwiXG4gICAgKTtcbiAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5hdHRlbXB0Q29udGV4dFJlc3VtZSgpO1xuICAgIGNvbnN0IHRhcmdldEVsZW1lbnQgPSBldmVudC50YXJnZXQgYXMgSFRNTE1lZGlhRWxlbWVudDtcbiAgICBpZiAodGFyZ2V0RWxlbWVudCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgc2V0dGluZ3NIYW5kbGVyLmVuc3VyZUluaXRpYWxpemVkKCk7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzSGFuZGxlci5nZXRDdXJyZW50U2V0dGluZ3MoKTtcbiAgICAgICAgY29uc3QgbmVlZHNQcm9jZXNzaW5nID0gc2V0dGluZ3NIYW5kbGVyLm5lZWRzQXVkaW9Qcm9jZXNzaW5nKCk7XG4gICAgICAgIGF3YWl0IG1lZGlhUHJvY2Vzc29yLnByb2Nlc3NNZWRpYUVsZW1lbnRzKFxuICAgICAgICAgIFt0YXJnZXRFbGVtZW50XSxcbiAgICAgICAgICBjdXJyZW50U2V0dGluZ3MsXG4gICAgICAgICAgbmVlZHNQcm9jZXNzaW5nXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgIGBDb250ZW50OiBFcnJvciBhcHBseWluZyBhdWRpbyBlZmZlY3RzIGFmdGVyIGNvbnRleHQgcmVzdW1lOmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJzKGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICBpZiAoIWVsZW1lbnRzV2l0aExpc3RlbmVycy5oYXMoZWxlbWVudCkpIHtcbiAgICAgIGVsZW1lbnRzV2l0aExpc3RlbmVycy5hZGQoZWxlbWVudCk7XG4gICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJsb2FkZWRtZXRhZGF0YVwiLCBvbkxvYWRlZE1ldGFkYXRhKTtcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNhbnBsYXlcIiwgb25DYW5QbGF5KTtcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRzdGFydFwiLCBvbkxvYWRTdGFydCk7XG4gICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJwbGF5XCIsIHJlc3VtZUNvbnRleHRIYW5kbGVyIGFzIEV2ZW50TGlzdGVuZXIpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudCxcbiAgICBhdHRhY2hMaXN0ZW5lcnMsXG4gICAgcmVzdW1lQ29udGV4dEhhbmRsZXIsXG4gIH07XG59XG4iLCJpbXBvcnQgeyBNZWRpYVByb2Nlc3NvciB9IGZyb20gXCIuLi9tZWRpYS1wcm9jZXNzb3JcIjtcbmltcG9ydCB7IFNldHRpbmdzSGFuZGxlciB9IGZyb20gXCIuLi9zZXR0aW5ncy1oYW5kbGVyXCI7XG5pbXBvcnQgeyBNZXNzYWdlVHlwZSwgaXNTZXR0aW5nc0Rpc2FibGVkIH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5cbi8qKlxuICogSGFuZGxlcyBVUERBVEVfU0VUVElOR1MgbWVzc2FnZXMgZnJvbSBiYWNrZ3JvdW5kL3BvcHVwLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTWVzc2FnZUhhbmRsZXIoXG4gIHNldHRpbmdzSGFuZGxlcjogU2V0dGluZ3NIYW5kbGVyLFxuICBtZWRpYVByb2Nlc3NvcjogTWVkaWFQcm9jZXNzb3Jcbikge1xuICByZXR1cm4gKFxuICAgIG1lc3NhZ2U6IE1lc3NhZ2VUeXBlLFxuICAgIHNlbmRlcjogY2hyb21lLnJ1bnRpbWUuTWVzc2FnZVNlbmRlcixcbiAgICBzZW5kUmVzcG9uc2U6IChyZXNwb25zZT86IGFueSkgPT4gdm9pZFxuICApID0+IHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIFwiW0NvbnRlbnRTY3JpcHQgTGlzdGVuZXJdIFJlY2VpdmVkIG1lc3NhZ2U6XCIsXG4gICAgICBKU09OLnN0cmluZ2lmeShtZXNzYWdlKVxuICAgICk7XG4gICAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJVUERBVEVfU0VUVElOR1NcIikge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIFwiW0NvbnRlbnRTY3JpcHQgTGlzdGVuZXJdIFByb2Nlc3NpbmcgVVBEQVRFX1NFVFRJTkdTIGZyb20gYmFja2dyb3VuZC9wb3B1cFwiXG4gICAgICApO1xuICAgICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCBzZXR0aW5nc0hhbmRsZXIuZW5zdXJlSW5pdGlhbGl6ZWQoKTtcbiAgICAgICAgICBzZXR0aW5nc0hhbmRsZXIudXBkYXRlU2V0dGluZ3MobWVzc2FnZS5zZXR0aW5ncyk7XG5cbiAgICAgICAgICBjb25zdCBuZXdTZXR0aW5ncyA9IHNldHRpbmdzSGFuZGxlci5nZXRDdXJyZW50U2V0dGluZ3MoKTtcbiAgICAgICAgICBjb25zdCBuZWVkc1Byb2Nlc3NpbmdOb3cgPSBzZXR0aW5nc0hhbmRsZXIubmVlZHNBdWRpb1Byb2Nlc3NpbmcoKTtcblxuICAgICAgICAgIGNvbnN0IG1hbmFnZWRNZWRpYUVsZW1lbnRzID1cbiAgICAgICAgICAgIG1lZGlhUHJvY2Vzc29yLmdldE1hbmFnZWRNZWRpYUVsZW1lbnRzKCk7XG4gICAgICAgICAgY29uc3QgaXNEaXNhYmxlZCA9IGlzU2V0dGluZ3NEaXNhYmxlZChuZXdTZXR0aW5ncyk7XG5cbiAgICAgICAgICBpZiAobWFuYWdlZE1lZGlhRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgbWVkaWFQcm9jZXNzb3IuYXBwbHlTZXR0aW5nc0ltbWVkaWF0ZWx5KFxuICAgICAgICAgICAgICBtYW5hZ2VkTWVkaWFFbGVtZW50cyxcbiAgICAgICAgICAgICAgbmV3U2V0dGluZ3MsXG4gICAgICAgICAgICAgIGlzRGlzYWJsZWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKG5lZWRzUHJvY2Vzc2luZ05vdykge1xuICAgICAgICAgICAgaWYgKG1lZGlhUHJvY2Vzc29yLmNhbkFwcGx5QXVkaW9FZmZlY3RzKCkpIHtcbiAgICAgICAgICAgICAgaWYgKG1hbmFnZWRNZWRpYUVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5wcm9jZXNzTWVkaWFFbGVtZW50cyhcbiAgICAgICAgICAgICAgICAgIG1hbmFnZWRNZWRpYUVsZW1lbnRzLFxuICAgICAgICAgICAgICAgICAgbmV3U2V0dGluZ3MsXG4gICAgICAgICAgICAgICAgICBuZWVkc1Byb2Nlc3NpbmdOb3dcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZyZXNoU2NhbkVsZW1lbnRzID0gbWVkaWFQcm9jZXNzb3IuZmluZE1lZGlhRWxlbWVudHMoKTtcbiAgICAgICAgICAgICAgICBpZiAoZnJlc2hTY2FuRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgbWVkaWFQcm9jZXNzb3IuYXBwbHlTZXR0aW5nc0ltbWVkaWF0ZWx5KFxuICAgICAgICAgICAgICAgICAgICBmcmVzaFNjYW5FbGVtZW50cyxcbiAgICAgICAgICAgICAgICAgICAgbmV3U2V0dGluZ3MsXG4gICAgICAgICAgICAgICAgICAgIGlzRGlzYWJsZWRcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICBpZiAoIWlzRGlzYWJsZWQgJiYgbmVlZHNQcm9jZXNzaW5nTm93KSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IG1lZGlhUHJvY2Vzc29yLnByb2Nlc3NNZWRpYUVsZW1lbnRzKFxuICAgICAgICAgICAgICAgICAgICAgIGZyZXNoU2NhbkVsZW1lbnRzLFxuICAgICAgICAgICAgICAgICAgICAgIG5ld1NldHRpbmdzLFxuICAgICAgICAgICAgICAgICAgICAgIG5lZWRzUHJvY2Vzc2luZ05vd1xuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAobWFuYWdlZE1lZGlhRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5wcm9jZXNzTWVkaWFFbGVtZW50cyhcbiAgICAgICAgICAgICAgICBtYW5hZ2VkTWVkaWFFbGVtZW50cyxcbiAgICAgICAgICAgICAgICBuZXdTZXR0aW5ncyxcbiAgICAgICAgICAgICAgICBuZWVkc1Byb2Nlc3NpbmdOb3dcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNvbnN0IGZyZXNoU2NhbkVsZW1lbnRzID0gbWVkaWFQcm9jZXNzb3IuZmluZE1lZGlhRWxlbWVudHMoKTtcbiAgICAgICAgICAgICAgaWYgKGZyZXNoU2NhbkVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5wcm9jZXNzTWVkaWFFbGVtZW50cyhcbiAgICAgICAgICAgICAgICAgIGZyZXNoU2NhbkVsZW1lbnRzLFxuICAgICAgICAgICAgICAgICAgbmV3U2V0dGluZ3MsXG4gICAgICAgICAgICAgICAgICBuZWVkc1Byb2Nlc3NpbmdOb3dcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICBcIkNvbnRlbnQ6IEVycm9yIGR1cmluZyBVUERBVEVfU0VUVElOR1MgcHJvY2Vzc2luZzpcIixcbiAgICAgICAgICAgIGVycm9yXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSkoKTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgTWVkaWFQcm9jZXNzb3IgfSBmcm9tIFwiLi4vbWVkaWEtcHJvY2Vzc29yXCI7XG5pbXBvcnQgeyBTZXR0aW5nc0hhbmRsZXIgfSBmcm9tIFwiLi4vc2V0dGluZ3MtaGFuZGxlclwiO1xuaW1wb3J0IHsgaXNTZXR0aW5nc0Rpc2FibGVkIH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5cbi8qKlxuICogU2V0cyB1cCBET00gbGlmZWN5Y2xlIG9ic2VydmVycyBhbmQgaW5pdGlhbCBzZXR0aW5ncyBhcHBsaWNhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldHVwRG9tTGlmZWN5Y2xlKFxuICBzZXR0aW5nc0hhbmRsZXI6IFNldHRpbmdzSGFuZGxlcixcbiAgbWVkaWFQcm9jZXNzb3I6IE1lZGlhUHJvY2Vzc29yLFxuICBwcm9jZXNzTWVkaWE6ICgpID0+IFByb21pc2U8Ym9vbGVhbj5cbik6ICgoKSA9PiB2b2lkKVtdIHtcbiAgY29uc3QgY2xlYW51cEZ1bmN0aW9uczogKCgpID0+IHZvaWQpW10gPSBbXTtcblxuICAvLyBBcHBseSBzZXR0aW5ncyBpbW1lZGlhdGVseSBhZnRlciBET01Db250ZW50TG9hZGVkIG9yIGlmIERPTSBpcyBhbHJlYWR5IHJlYWR5XG4gIGNvbnN0IGFwcGx5SW5pdGlhbFNldHRpbmdzID0gYXN5bmMgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYFtDb250ZW50U2NyaXB0IERFQlVHXSBBcHBseWluZyBpbml0aWFsIHNldHRpbmdzIGZvciAke3dpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZX1gXG4gICAgKTtcbiAgICBhd2FpdCBwcm9jZXNzTWVkaWEoKTtcbiAgfTtcblxuICBjb25zdCBkb21Db250ZW50TG9hZGVkTGlzdGVuZXIgPSAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBgW0NvbnRlbnRTY3JpcHQgREVCVUddIERPTUNvbnRlbnRMb2FkZWQgZXZlbnQgZm9yICR7d2luZG93LmxvY2F0aW9uLmhvc3RuYW1lfWBcbiAgICApO1xuICAgIGFwcGx5SW5pdGlhbFNldHRpbmdzKCk7XG4gIH07XG5cbiAgaWYgKGRvY3VtZW50LnJlYWR5U3RhdGUgPT09IFwibG9hZGluZ1wiKSB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIkRPTUNvbnRlbnRMb2FkZWRcIiwgZG9tQ29udGVudExvYWRlZExpc3RlbmVyKTtcbiAgICBjbGVhbnVwRnVuY3Rpb25zLnB1c2goKCkgPT5cbiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJET01Db250ZW50TG9hZGVkXCIsIGRvbUNvbnRlbnRMb2FkZWRMaXN0ZW5lcilcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGFwcGx5SW5pdGlhbFNldHRpbmdzKCk7XG4gIH1cblxuICAvLyBXYXRjaCBmb3IgZHluYW1pYyBjaGFuZ2VzXG4gIGNvbnN0IG1lZGlhT2JzZXJ2ZXIgPSBNZWRpYVByb2Nlc3Nvci5zZXR1cE1lZGlhT2JzZXJ2ZXIoXG4gICAgYXN5bmMgKGFkZGVkRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSkgPT4ge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBbQ29udGVudFNjcmlwdF0gUHJvY2Vzc2luZyAke2FkZGVkRWxlbWVudHMubGVuZ3RofSBuZXdseSBhZGRlZCBtZWRpYSBlbGVtZW50cy5gXG4gICAgICApO1xuICAgICAgYXdhaXQgc2V0dGluZ3NIYW5kbGVyLmVuc3VyZUluaXRpYWxpemVkKCk7XG4gICAgICBjb25zdCBjdXJyZW50U2V0dGluZ3MgPSBzZXR0aW5nc0hhbmRsZXIuZ2V0Q3VycmVudFNldHRpbmdzKCk7XG4gICAgICBjb25zdCBuZWVkc1Byb2Nlc3NpbmcgPSBzZXR0aW5nc0hhbmRsZXIubmVlZHNBdWRpb1Byb2Nlc3NpbmcoKTtcblxuICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IucHJvY2Vzc01lZGlhRWxlbWVudHMoXG4gICAgICAgIGFkZGVkRWxlbWVudHMsXG4gICAgICAgIGN1cnJlbnRTZXR0aW5ncyxcbiAgICAgICAgbmVlZHNQcm9jZXNzaW5nXG4gICAgICApO1xuXG4gICAgICBjb25zdCBpc0Rpc2FibGVkID0gaXNTZXR0aW5nc0Rpc2FibGVkKGN1cnJlbnRTZXR0aW5ncyk7XG4gICAgICBtZWRpYVByb2Nlc3Nvci5hcHBseVNldHRpbmdzSW1tZWRpYXRlbHkoXG4gICAgICAgIGFkZGVkRWxlbWVudHMsXG4gICAgICAgIGN1cnJlbnRTZXR0aW5ncyxcbiAgICAgICAgaXNEaXNhYmxlZFxuICAgICAgKTtcbiAgICB9LFxuICAgIChyZW1vdmVkRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSkgPT4ge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBbQ29udGVudFNjcmlwdF0gQ2xlYW5pbmcgdXAgJHtyZW1vdmVkRWxlbWVudHMubGVuZ3RofSByZW1vdmVkIG1lZGlhIGVsZW1lbnRzLmBcbiAgICAgICk7XG4gICAgICByZW1vdmVkRWxlbWVudHMuZm9yRWFjaCgoZWxlbWVudDogSFRNTE1lZGlhRWxlbWVudCkgPT4ge1xuICAgICAgICBtZWRpYVByb2Nlc3Nvci5hdWRpb1Byb2Nlc3Nvci5kaXNjb25uZWN0RWxlbWVudE5vZGVzKGVsZW1lbnQpO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlbWFpbmluZ01hbmFnZWRFbGVtZW50cyA9IG1lZGlhUHJvY2Vzc29yLmdldE1hbmFnZWRNZWRpYUVsZW1lbnRzKCk7XG4gICAgICBpZiAoXG4gICAgICAgIHJlbWFpbmluZ01hbmFnZWRFbGVtZW50cy5sZW5ndGggPT09IDAgJiZcbiAgICAgICAgIXNldHRpbmdzSGFuZGxlci5uZWVkc0F1ZGlvUHJvY2Vzc2luZygpXG4gICAgICApIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgXCJbQ29udGVudFNjcmlwdF0gTm8gbWFuYWdlZCBtZWRpYSBlbGVtZW50cyBsZWZ0LiBDbGVhbmluZyB1cCBBdWRpb1Byb2Nlc3Nvci5cIlxuICAgICAgICApO1xuICAgICAgICBtZWRpYVByb2Nlc3Nvci5hdWRpb1Byb2Nlc3Nvci5jbGVhbnVwKCk7XG4gICAgICB9XG4gICAgfVxuICApO1xuICBjbGVhbnVwRnVuY3Rpb25zLnB1c2goKCkgPT4gbWVkaWFPYnNlcnZlci5kaXNjb25uZWN0KCkpO1xuXG4gIC8vIEVuc3VyZSBBdWRpb0NvbnRleHQgaXMgY2xvc2VkIHdoZW4gdGhlIHBhZ2UgaXMgdW5sb2FkZWRcbiAgY29uc3QgYmVmb3JlVW5sb2FkTGlzdGVuZXIgPSAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBcIltDb250ZW50U2NyaXB0XSBQYWdlIGlzIHVubG9hZGluZy4gUGVyZm9ybWluZyBmaW5hbCBBdWRpb1Byb2Nlc3NvciBjbGVhbnVwLlwiXG4gICAgKTtcbiAgICBtZWRpYVByb2Nlc3Nvci5hdWRpb1Byb2Nlc3Nvci5jbGVhbnVwKCk7XG4gIH07XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiYmVmb3JldW5sb2FkXCIsIGJlZm9yZVVubG9hZExpc3RlbmVyKTtcbiAgY2xlYW51cEZ1bmN0aW9ucy5wdXNoKCgpID0+XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJiZWZvcmV1bmxvYWRcIiwgYmVmb3JlVW5sb2FkTGlzdGVuZXIpXG4gICk7XG5cbiAgcmV0dXJuIGNsZWFudXBGdW5jdGlvbnM7XG59XG4iLCJpbXBvcnQgeyBNZWRpYVByb2Nlc3NvciB9IGZyb20gXCIuL21lZGlhLXByb2Nlc3NvclwiO1xuaW1wb3J0IHsgU2V0dGluZ3NIYW5kbGVyIH0gZnJvbSBcIi4vc2V0dGluZ3MtaGFuZGxlclwiO1xuaW1wb3J0IHsgTWVzc2FnZVR5cGUsIGlzU2V0dGluZ3NEaXNhYmxlZCB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBjcmVhdGVNZWRpYUV2ZW50SGFuZGxlcnMgfSBmcm9tIFwiLi9jb250ZW50LXNjcmlwdC9tZWRpYS1ldmVudHNcIjtcbmltcG9ydCB7IGNyZWF0ZU1lc3NhZ2VIYW5kbGVyIH0gZnJvbSBcIi4vY29udGVudC1zY3JpcHQvbWVzc2FnZS1oYW5kbGVyXCI7XG5pbXBvcnQgeyBzZXR1cERvbUxpZmVjeWNsZSB9IGZyb20gXCIuL2NvbnRlbnQtc2NyaXB0L2RvbS1saWZlY3ljbGVcIjtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGluaXRpYWxpemVDb250ZW50U2NyaXB0KFxuICBzZXR0aW5nc0hhbmRsZXI6IFNldHRpbmdzSGFuZGxlcixcbiAgbWVkaWFQcm9jZXNzb3I6IE1lZGlhUHJvY2Vzc29yLFxuICBob3N0bmFtZTogc3RyaW5nXG4pOiBQcm9taXNlPCgpID0+IHZvaWQ+IHtcbiAgY29uc29sZS5sb2coYFtDb250ZW50U2NyaXB0XSBJbml0aWFsaXppbmcgc2NyaXB0IGZvciBob3N0bmFtZTogJHtob3N0bmFtZX1gKTtcbiAgc2V0dGluZ3NIYW5kbGVyLmluaXRpYWxpemUoaG9zdG5hbWUpO1xuXG4gIGNvbnN0IGNsZWFudXBGdW5jdGlvbnM6ICgoKSA9PiB2b2lkKVtdID0gW107XG5cbiAgLy8gQ3JlYXRlIHN0YWJsZSBldmVudCBoYW5kbGVyc1xuICBjb25zdCB7IGFwcGx5U2V0dGluZ3NUb1NpbmdsZUVsZW1lbnQsIGF0dGFjaExpc3RlbmVycyB9ID1cbiAgICBjcmVhdGVNZWRpYUV2ZW50SGFuZGxlcnMoc2V0dGluZ3NIYW5kbGVyLCBtZWRpYVByb2Nlc3Nvcik7XG5cbiAgLy8gUHJvY2VzcyBtZWRpYSB3aXRoIGN1cnJlbnQgc2V0dGluZ3NcbiAgY29uc3QgcHJvY2Vzc01lZGlhID0gYXN5bmMgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYFtDb250ZW50U2NyaXB0IERFQlVHXSBwcm9jZXNzTWVkaWEgY2FsbGVkIGZvciAke3dpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZX1gXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgY29uc29sZS50aW1lKFwiZW5zdXJlSW5pdGlhbGl6ZWRcIik7XG4gICAgICBhd2FpdCBzZXR0aW5nc0hhbmRsZXIuZW5zdXJlSW5pdGlhbGl6ZWQoKTtcbiAgICAgIGNvbnNvbGUudGltZUVuZChcImVuc3VyZUluaXRpYWxpemVkXCIpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLnRpbWVFbmQoXCJlbnN1cmVJbml0aWFsaXplZFwiKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gRXJyb3IgZW5zdXJpbmcgc2V0dGluZ3MgaW5pdGlhbGl6ZWQ6YFxuICAgICAgKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgY3VycmVudFNldHRpbmdzID0gc2V0dGluZ3NIYW5kbGVyLmdldEN1cnJlbnRTZXR0aW5ncygpO1xuICAgICAgY29uc3QgaXNEaXNhYmxlZCA9IGlzU2V0dGluZ3NEaXNhYmxlZChjdXJyZW50U2V0dGluZ3MpO1xuXG4gICAgICBjb25zdCBtZWRpYUVsZW1lbnRzID0gbWVkaWFQcm9jZXNzb3IuZmluZE1lZGlhRWxlbWVudHMoKTtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgW0NvbnRlbnRTY3JpcHQgREVCVUddIEZvdW5kICR7bWVkaWFFbGVtZW50cy5sZW5ndGh9IG1lZGlhIGVsZW1lbnRzYFxuICAgICAgKTtcblxuICAgICAgbWVkaWFFbGVtZW50cy5mb3JFYWNoKChlbGVtZW50KSA9PiB7XG4gICAgICAgIGF0dGFjaExpc3RlbmVycyhlbGVtZW50KTtcbiAgICAgICAgaWYgKCFpc0Rpc2FibGVkKSB7XG4gICAgICAgICAgYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAocHJvY2Vzc2luZ0Vycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBgW0NvbnRlbnRTY3JpcHQgREVCVUddIEVycm9yIGR1cmluZyBtZWRpYSBwcm9jZXNzaW5nIHN0ZXBzOmBcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIC8vIFNldCB1cCBtZXNzYWdlIGxpc3RlbmVyXG4gIGlmIChcbiAgICB0eXBlb2YgY2hyb21lICE9PSBcInVuZGVmaW5lZFwiICYmXG4gICAgY2hyb21lLnJ1bnRpbWUgJiZcbiAgICBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2VcbiAgKSB7XG4gICAgY29uc3QgbWVzc2FnZUhhbmRsZXIgPSBjcmVhdGVNZXNzYWdlSGFuZGxlcihzZXR0aW5nc0hhbmRsZXIsIG1lZGlhUHJvY2Vzc29yKTtcbiAgICBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIobWVzc2FnZUhhbmRsZXIpO1xuICAgIGNsZWFudXBGdW5jdGlvbnMucHVzaCgoKSA9PlxuICAgICAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLnJlbW92ZUxpc3RlbmVyKG1lc3NhZ2VIYW5kbGVyKVxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5kZWJ1ZyhcbiAgICAgIFwiW0NvbnRlbnRTY3JpcHRdIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZSBub3QgYXZhaWxhYmxlIC0gc2tpcHBpbmcgbWVzc2FnZSBsaXN0ZW5lciBzZXR1cFwiXG4gICAgKTtcbiAgfVxuXG4gIC8vIFNldCB1cCBET00gbGlmZWN5Y2xlIChpbml0aWFsIHNldHRpbmdzLCBtdXRhdGlvbiBvYnNlcnZlciwgYmVmb3JldW5sb2FkKVxuICBjb25zdCBkb21DbGVhbnVwID0gc2V0dXBEb21MaWZlY3ljbGUoXG4gICAgc2V0dGluZ3NIYW5kbGVyLFxuICAgIG1lZGlhUHJvY2Vzc29yLFxuICAgIHByb2Nlc3NNZWRpYVxuICApO1xuICBjbGVhbnVwRnVuY3Rpb25zLnB1c2goLi4uZG9tQ2xlYW51cCk7XG5cbiAgcmV0dXJuICgpID0+IHtcbiAgICBjb25zb2xlLmxvZyhcIltDb250ZW50U2NyaXB0XSBSdW5uaW5nIGNsZWFudXAgZnVuY3Rpb25zLlwiKTtcbiAgICBjbGVhbnVwRnVuY3Rpb25zLmZvckVhY2goKGNsZWFudXApID0+IGNsZWFudXAoKSk7XG4gIH07XG59XG4iLCJpbXBvcnQgeyBkZWZpbmVDb250ZW50U2NyaXB0IH0gZnJvbSBcInd4dC9zYW5kYm94XCI7XG5pbXBvcnQgeyBNZWRpYVByb2Nlc3NvciB9IGZyb20gXCIuLy4uL3NyYy9tZWRpYS1wcm9jZXNzb3JcIjtcbmltcG9ydCB7IFNldHRpbmdzSGFuZGxlciB9IGZyb20gXCIuLi9zcmMvc2V0dGluZ3MtaGFuZGxlclwiO1xuaW1wb3J0IHsgc2V0dXBIb3N0bmFtZURldGVjdGlvbiB9IGZyb20gXCIuLi9zcmMvaWZyYW1lLWhvc3RuYW1lLWhhbmRsZXJcIjtcbmltcG9ydCB7IGluaXRpYWxpemVDb250ZW50U2NyaXB0IH0gZnJvbSBcIi4uL3NyYy9jb250ZW50LXNjcmlwdC1pbml0XCI7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbnRlbnRTY3JpcHQoe1xuICBtYXRjaGVzOiBbXCJodHRwOi8vKi8qXCIsIFwiaHR0cHM6Ly8qLypcIiwgXCJmaWxlOi8vKi8qXCJdLFxuICBhbGxGcmFtZXM6IHRydWUsXG4gIHJ1bkF0OiBcImRvY3VtZW50X2lkbGVcIixcbiAgbWFpbjogYXN5bmMgKCkgPT4ge1xuICAgIC8vIEdsb2JhbCBzYWZldHkgY2hlY2sgZm9yIENocm9tZSBleHRlbnNpb24gQVBJc1xuICAgIGlmICh0eXBlb2YgY2hyb21lID09PSAndW5kZWZpbmVkJyB8fCBcbiAgICAgICAgdHlwZW9mIGNocm9tZS5ydW50aW1lID09PSAndW5kZWZpbmVkJyB8fCBcbiAgICAgICAgdHlwZW9mIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Nocm9tZSBleHRlbnNpb24gQVBJcyBhcmUgbm90IGF2YWlsYWJsZS4gU2tpcHBpbmcgY29udGVudCBzY3JpcHQgZXhlY3V0aW9uLicpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgXCJDb250ZW50OiBTY3JpcHQgc3RhcnRpbmcgLSBUaGlzIGxvZyBzaG91bGQgYWx3YXlzIGFwcGVhclwiLFxuICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWZcbiAgICApO1xuICAgIFxuICAgIC8vIFNraXAgcHJvY2Vzc2luZyBmb3IgZmlsZSBVUkxzXG4gICAgaWYgKHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gJ2ZpbGU6Jykge1xuICAgICAgY29uc29sZS5sb2coJ1NraXBwaW5nIGNvbnRlbnQgc2NyaXB0IGZvciBmaWxlIFVSTCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEluaXRpYWxpemUgY29yZSBjb21wb25lbnRzXG4gICAgY29uc3Qgc2V0dGluZ3NIYW5kbGVyID0gbmV3IFNldHRpbmdzSGFuZGxlcigpO1xuICAgIGNvbnN0IG1lZGlhUHJvY2Vzc29yID0gbmV3IE1lZGlhUHJvY2Vzc29yKCk7XG5cbiAgICBsZXQgaG9zdG5hbWVEZXRlY3Rpb25DbGVhbnVwOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgY29udGVudFNjcmlwdENsZWFudXA6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXG4gICAgLy8gU3RhcnQgdGhlIGhvc3RuYW1lIGRldGVjdGlvbiBhbmQgc2NyaXB0IGluaXRpYWxpemF0aW9uIHByb2Nlc3NcbiAgICBob3N0bmFtZURldGVjdGlvbkNsZWFudXAgPSBzZXR1cEhvc3RuYW1lRGV0ZWN0aW9uKGFzeW5jIChob3N0bmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICBjb250ZW50U2NyaXB0Q2xlYW51cCA9IGF3YWl0IGluaXRpYWxpemVDb250ZW50U2NyaXB0KHNldHRpbmdzSGFuZGxlciwgbWVkaWFQcm9jZXNzb3IsIGhvc3RuYW1lKTtcbiAgICB9KTtcblxuICAgIC8vIEFkZCBhIGxpc3RlbmVyIGZvciBwYWdlIHVubG9hZCB0byBwZXJmb3JtIGNsZWFudXBcbiAgICBjb25zdCBiZWZvcmVVbmxvYWRMaXN0ZW5lciA9ICgpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKFwiW0NvbnRlbnRTY3JpcHRdIFBhZ2UgaXMgdW5sb2FkaW5nLiBQZXJmb3JtaW5nIG92ZXJhbGwgY2xlYW51cC5cIik7XG4gICAgICBpZiAoaG9zdG5hbWVEZXRlY3Rpb25DbGVhbnVwKSB7XG4gICAgICAgIGhvc3RuYW1lRGV0ZWN0aW9uQ2xlYW51cCgpO1xuICAgICAgICBob3N0bmFtZURldGVjdGlvbkNsZWFudXAgPSBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKGNvbnRlbnRTY3JpcHRDbGVhbnVwKSB7XG4gICAgICAgIGNvbnRlbnRTY3JpcHRDbGVhbnVwKCk7XG4gICAgICAgIGNvbnRlbnRTY3JpcHRDbGVhbnVwID0gbnVsbDtcbiAgICAgIH1cbiAgICB9O1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdiZWZvcmV1bmxvYWQnLCBiZWZvcmVVbmxvYWRMaXN0ZW5lcik7XG4gIH0sXG59KTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsLCBmYWN0b3J5KSB7XG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShcIndlYmV4dGVuc2lvbi1wb2x5ZmlsbFwiLCBbXCJtb2R1bGVcIl0sIGZhY3RvcnkpO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgZmFjdG9yeShtb2R1bGUpO1xuICB9IGVsc2Uge1xuICAgIHZhciBtb2QgPSB7XG4gICAgICBleHBvcnRzOiB7fVxuICAgIH07XG4gICAgZmFjdG9yeShtb2QpO1xuICAgIGdsb2JhbC5icm93c2VyID0gbW9kLmV4cG9ydHM7XG4gIH1cbn0pKHR5cGVvZiBnbG9iYWxUaGlzICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsVGhpcyA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHRoaXMsIGZ1bmN0aW9uIChtb2R1bGUpIHtcbiAgLyogd2ViZXh0ZW5zaW9uLXBvbHlmaWxsIC0gdjAuMTIuMCAtIFR1ZSBNYXkgMTQgMjAyNCAxODowMToyOSAqL1xuICAvKiAtKi0gTW9kZTogaW5kZW50LXRhYnMtbW9kZTogbmlsOyBqcy1pbmRlbnQtbGV2ZWw6IDIgLSotICovXG4gIC8qIHZpbTogc2V0IHN0cz0yIHN3PTIgZXQgdHc9ODA6ICovXG4gIC8qIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAgICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICAgKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLiAqL1xuICBcInVzZSBzdHJpY3RcIjtcblxuICBpZiAoIShnbG9iYWxUaGlzLmNocm9tZSAmJiBnbG9iYWxUaGlzLmNocm9tZS5ydW50aW1lICYmIGdsb2JhbFRoaXMuY2hyb21lLnJ1bnRpbWUuaWQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiVGhpcyBzY3JpcHQgc2hvdWxkIG9ubHkgYmUgbG9hZGVkIGluIGEgYnJvd3NlciBleHRlbnNpb24uXCIpO1xuICB9XG4gIGlmICghKGdsb2JhbFRoaXMuYnJvd3NlciAmJiBnbG9iYWxUaGlzLmJyb3dzZXIucnVudGltZSAmJiBnbG9iYWxUaGlzLmJyb3dzZXIucnVudGltZS5pZCkpIHtcbiAgICBjb25zdCBDSFJPTUVfU0VORF9NRVNTQUdFX0NBTExCQUNLX05PX1JFU1BPTlNFX01FU1NBR0UgPSBcIlRoZSBtZXNzYWdlIHBvcnQgY2xvc2VkIGJlZm9yZSBhIHJlc3BvbnNlIHdhcyByZWNlaXZlZC5cIjtcblxuICAgIC8vIFdyYXBwaW5nIHRoZSBidWxrIG9mIHRoaXMgcG9seWZpbGwgaW4gYSBvbmUtdGltZS11c2UgZnVuY3Rpb24gaXMgYSBtaW5vclxuICAgIC8vIG9wdGltaXphdGlvbiBmb3IgRmlyZWZveC4gU2luY2UgU3BpZGVybW9ua2V5IGRvZXMgbm90IGZ1bGx5IHBhcnNlIHRoZVxuICAgIC8vIGNvbnRlbnRzIG9mIGEgZnVuY3Rpb24gdW50aWwgdGhlIGZpcnN0IHRpbWUgaXQncyBjYWxsZWQsIGFuZCBzaW5jZSBpdCB3aWxsXG4gICAgLy8gbmV2ZXIgYWN0dWFsbHkgbmVlZCB0byBiZSBjYWxsZWQsIHRoaXMgYWxsb3dzIHRoZSBwb2x5ZmlsbCB0byBiZSBpbmNsdWRlZFxuICAgIC8vIGluIEZpcmVmb3ggbmVhcmx5IGZvciBmcmVlLlxuICAgIGNvbnN0IHdyYXBBUElzID0gZXh0ZW5zaW9uQVBJcyA9PiB7XG4gICAgICAvLyBOT1RFOiBhcGlNZXRhZGF0YSBpcyBhc3NvY2lhdGVkIHRvIHRoZSBjb250ZW50IG9mIHRoZSBhcGktbWV0YWRhdGEuanNvbiBmaWxlXG4gICAgICAvLyBhdCBidWlsZCB0aW1lIGJ5IHJlcGxhY2luZyB0aGUgZm9sbG93aW5nIFwiaW5jbHVkZVwiIHdpdGggdGhlIGNvbnRlbnQgb2YgdGhlXG4gICAgICAvLyBKU09OIGZpbGUuXG4gICAgICBjb25zdCBhcGlNZXRhZGF0YSA9IHtcbiAgICAgICAgXCJhbGFybXNcIjoge1xuICAgICAgICAgIFwiY2xlYXJcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJjbGVhckFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImJvb2ttYXJrc1wiOiB7XG4gICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRDaGlsZHJlblwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFJlY2VudFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFN1YlRyZWVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRUcmVlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVRyZWVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZWFyY2hcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJicm93c2VyQWN0aW9uXCI6IHtcbiAgICAgICAgICBcImRpc2FibGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJlbmFibGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRCYWRnZUJhY2tncm91bmRDb2xvclwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEJhZGdlVGV4dFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFBvcHVwXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0VGl0bGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJvcGVuUG9wdXBcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRCYWRnZUJhY2tncm91bmRDb2xvclwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldEJhZGdlVGV4dFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldEljb25cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRQb3B1cFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFRpdGxlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYnJvd3NpbmdEYXRhXCI6IHtcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUNhY2hlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlQ29va2llc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZURvd25sb2Fkc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUZvcm1EYXRhXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlSGlzdG9yeVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUxvY2FsU3RvcmFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVBhc3N3b3Jkc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVBsdWdpbkRhdGFcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXR0aW5nc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNvbW1hbmRzXCI6IHtcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNvbnRleHRNZW51c1wiOiB7XG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjb29raWVzXCI6IHtcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbENvb2tpZVN0b3Jlc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImRldnRvb2xzXCI6IHtcbiAgICAgICAgICBcImluc3BlY3RlZFdpbmRvd1wiOiB7XG4gICAgICAgICAgICBcImV2YWxcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDIsXG4gICAgICAgICAgICAgIFwic2luZ2xlQ2FsbGJhY2tBcmdcIjogZmFsc2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicGFuZWxzXCI6IHtcbiAgICAgICAgICAgIFwiY3JlYXRlXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDMsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAzLFxuICAgICAgICAgICAgICBcInNpbmdsZUNhbGxiYWNrQXJnXCI6IHRydWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImVsZW1lbnRzXCI6IHtcbiAgICAgICAgICAgICAgXCJjcmVhdGVTaWRlYmFyUGFuZVwiOiB7XG4gICAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkb3dubG9hZHNcIjoge1xuICAgICAgICAgIFwiY2FuY2VsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZG93bmxvYWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJlcmFzZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEZpbGVJY29uXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwib3BlblwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInBhdXNlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlRmlsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlc3VtZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlYXJjaFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNob3dcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJleHRlbnNpb25cIjoge1xuICAgICAgICAgIFwiaXNBbGxvd2VkRmlsZVNjaGVtZUFjY2Vzc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImlzQWxsb3dlZEluY29nbml0b0FjY2Vzc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImhpc3RvcnlcIjoge1xuICAgICAgICAgIFwiYWRkVXJsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZGVsZXRlQWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZGVsZXRlUmFuZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZWxldGVVcmxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRWaXNpdHNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZWFyY2hcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJpMThuXCI6IHtcbiAgICAgICAgICBcImRldGVjdExhbmd1YWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWNjZXB0TGFuZ3VhZ2VzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiaWRlbnRpdHlcIjoge1xuICAgICAgICAgIFwibGF1bmNoV2ViQXV0aEZsb3dcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJpZGxlXCI6IHtcbiAgICAgICAgICBcInF1ZXJ5U3RhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJtYW5hZ2VtZW50XCI6IHtcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFNlbGZcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRFbmFibGVkXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwidW5pbnN0YWxsU2VsZlwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcIm5vdGlmaWNhdGlvbnNcIjoge1xuICAgICAgICAgIFwiY2xlYXJcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRQZXJtaXNzaW9uTGV2ZWxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJwYWdlQWN0aW9uXCI6IHtcbiAgICAgICAgICBcImdldFBvcHVwXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0VGl0bGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0SWNvblwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFBvcHVwXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0VGl0bGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzaG93XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicGVybWlzc2lvbnNcIjoge1xuICAgICAgICAgIFwiY29udGFpbnNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZXF1ZXN0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicnVudGltZVwiOiB7XG4gICAgICAgICAgXCJnZXRCYWNrZ3JvdW5kUGFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFBsYXRmb3JtSW5mb1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm9wZW5PcHRpb25zUGFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlcXVlc3RVcGRhdGVDaGVja1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlbmRNZXNzYWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDNcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2VuZE5hdGl2ZU1lc3NhZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRVbmluc3RhbGxVUkxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzZXNzaW9uc1wiOiB7XG4gICAgICAgICAgXCJnZXREZXZpY2VzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0UmVjZW50bHlDbG9zZWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZXN0b3JlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwic3RvcmFnZVwiOiB7XG4gICAgICAgICAgXCJsb2NhbFwiOiB7XG4gICAgICAgICAgICBcImNsZWFyXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldEJ5dGVzSW5Vc2VcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwic2V0XCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1hbmFnZWRcIjoge1xuICAgICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldEJ5dGVzSW5Vc2VcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3luY1wiOiB7XG4gICAgICAgICAgICBcImNsZWFyXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldEJ5dGVzSW5Vc2VcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwic2V0XCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInRhYnNcIjoge1xuICAgICAgICAgIFwiY2FwdHVyZVZpc2libGVUYWJcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZXRlY3RMYW5ndWFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRpc2NhcmRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkdXBsaWNhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJleGVjdXRlU2NyaXB0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0Q3VycmVudFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFpvb21cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRab29tU2V0dGluZ3NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnb0JhY2tcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnb0ZvcndhcmRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdobGlnaHRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJpbnNlcnRDU1NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicXVlcnlcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZWxvYWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVDU1NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZW5kTWVzc2FnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAzXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFpvb21cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRab29tU2V0dGluZ3NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b3BTaXRlc1wiOiB7XG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJ3ZWJOYXZpZ2F0aW9uXCI6IHtcbiAgICAgICAgICBcImdldEFsbEZyYW1lc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEZyYW1lXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwid2ViUmVxdWVzdFwiOiB7XG4gICAgICAgICAgXCJoYW5kbGVyQmVoYXZpb3JDaGFuZ2VkXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwid2luZG93c1wiOiB7XG4gICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRDdXJyZW50XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0TGFzdEZvY3VzZWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGlmIChPYmplY3Qua2V5cyhhcGlNZXRhZGF0YSkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcImFwaS1tZXRhZGF0YS5qc29uIGhhcyBub3QgYmVlbiBpbmNsdWRlZCBpbiBicm93c2VyLXBvbHlmaWxsXCIpO1xuICAgICAgfVxuXG4gICAgICAvKipcbiAgICAgICAqIEEgV2Vha01hcCBzdWJjbGFzcyB3aGljaCBjcmVhdGVzIGFuZCBzdG9yZXMgYSB2YWx1ZSBmb3IgYW55IGtleSB3aGljaCBkb2VzXG4gICAgICAgKiBub3QgZXhpc3Qgd2hlbiBhY2Nlc3NlZCwgYnV0IGJlaGF2ZXMgZXhhY3RseSBhcyBhbiBvcmRpbmFyeSBXZWFrTWFwXG4gICAgICAgKiBvdGhlcndpc2UuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY3JlYXRlSXRlbVxuICAgICAgICogICAgICAgIEEgZnVuY3Rpb24gd2hpY2ggd2lsbCBiZSBjYWxsZWQgaW4gb3JkZXIgdG8gY3JlYXRlIHRoZSB2YWx1ZSBmb3IgYW55XG4gICAgICAgKiAgICAgICAga2V5IHdoaWNoIGRvZXMgbm90IGV4aXN0LCB0aGUgZmlyc3QgdGltZSBpdCBpcyBhY2Nlc3NlZC4gVGhlXG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24gcmVjZWl2ZXMsIGFzIGl0cyBvbmx5IGFyZ3VtZW50LCB0aGUga2V5IGJlaW5nIGNyZWF0ZWQuXG4gICAgICAgKi9cbiAgICAgIGNsYXNzIERlZmF1bHRXZWFrTWFwIGV4dGVuZHMgV2Vha01hcCB7XG4gICAgICAgIGNvbnN0cnVjdG9yKGNyZWF0ZUl0ZW0sIGl0ZW1zID0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgc3VwZXIoaXRlbXMpO1xuICAgICAgICAgIHRoaXMuY3JlYXRlSXRlbSA9IGNyZWF0ZUl0ZW07XG4gICAgICAgIH1cbiAgICAgICAgZ2V0KGtleSkge1xuICAgICAgICAgIGlmICghdGhpcy5oYXMoa2V5KSkge1xuICAgICAgICAgICAgdGhpcy5zZXQoa2V5LCB0aGlzLmNyZWF0ZUl0ZW0oa2V5KSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzdXBlci5nZXQoa2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvKipcbiAgICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGFuIG9iamVjdCB3aXRoIGEgYHRoZW5gIG1ldGhvZCwgYW5kIGNhblxuICAgICAgICogdGhlcmVmb3JlIGJlIGFzc3VtZWQgdG8gYmVoYXZlIGFzIGEgUHJvbWlzZS5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byB0ZXN0LlxuICAgICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlIHZhbHVlIGlzIHRoZW5hYmxlLlxuICAgICAgICovXG4gICAgICBjb25zdCBpc1RoZW5hYmxlID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmIHR5cGVvZiB2YWx1ZS50aGVuID09PSBcImZ1bmN0aW9uXCI7XG4gICAgICB9O1xuXG4gICAgICAvKipcbiAgICAgICAqIENyZWF0ZXMgYW5kIHJldHVybnMgYSBmdW5jdGlvbiB3aGljaCwgd2hlbiBjYWxsZWQsIHdpbGwgcmVzb2x2ZSBvciByZWplY3RcbiAgICAgICAqIHRoZSBnaXZlbiBwcm9taXNlIGJhc2VkIG9uIGhvdyBpdCBpcyBjYWxsZWQ6XG4gICAgICAgKlxuICAgICAgICogLSBJZiwgd2hlbiBjYWxsZWQsIGBjaHJvbWUucnVudGltZS5sYXN0RXJyb3JgIGNvbnRhaW5zIGEgbm9uLW51bGwgb2JqZWN0LFxuICAgICAgICogICB0aGUgcHJvbWlzZSBpcyByZWplY3RlZCB3aXRoIHRoYXQgdmFsdWUuXG4gICAgICAgKiAtIElmIHRoZSBmdW5jdGlvbiBpcyBjYWxsZWQgd2l0aCBleGFjdGx5IG9uZSBhcmd1bWVudCwgdGhlIHByb21pc2UgaXNcbiAgICAgICAqICAgcmVzb2x2ZWQgdG8gdGhhdCB2YWx1ZS5cbiAgICAgICAqIC0gT3RoZXJ3aXNlLCB0aGUgcHJvbWlzZSBpcyByZXNvbHZlZCB0byBhbiBhcnJheSBjb250YWluaW5nIGFsbCBvZiB0aGVcbiAgICAgICAqICAgZnVuY3Rpb24ncyBhcmd1bWVudHMuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IHByb21pc2VcbiAgICAgICAqICAgICAgICBBbiBvYmplY3QgY29udGFpbmluZyB0aGUgcmVzb2x1dGlvbiBhbmQgcmVqZWN0aW9uIGZ1bmN0aW9ucyBvZiBhXG4gICAgICAgKiAgICAgICAgcHJvbWlzZS5cbiAgICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IHByb21pc2UucmVzb2x2ZVxuICAgICAgICogICAgICAgIFRoZSBwcm9taXNlJ3MgcmVzb2x1dGlvbiBmdW5jdGlvbi5cbiAgICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IHByb21pc2UucmVqZWN0XG4gICAgICAgKiAgICAgICAgVGhlIHByb21pc2UncyByZWplY3Rpb24gZnVuY3Rpb24uXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gbWV0YWRhdGFcbiAgICAgICAqICAgICAgICBNZXRhZGF0YSBhYm91dCB0aGUgd3JhcHBlZCBtZXRob2Qgd2hpY2ggaGFzIGNyZWF0ZWQgdGhlIGNhbGxiYWNrLlxuICAgICAgICogQHBhcmFtIHtib29sZWFufSBtZXRhZGF0YS5zaW5nbGVDYWxsYmFja0FyZ1xuICAgICAgICogICAgICAgIFdoZXRoZXIgb3Igbm90IHRoZSBwcm9taXNlIGlzIHJlc29sdmVkIHdpdGggb25seSB0aGUgZmlyc3RcbiAgICAgICAqICAgICAgICBhcmd1bWVudCBvZiB0aGUgY2FsbGJhY2ssIGFsdGVybmF0aXZlbHkgYW4gYXJyYXkgb2YgYWxsIHRoZVxuICAgICAgICogICAgICAgIGNhbGxiYWNrIGFyZ3VtZW50cyBpcyByZXNvbHZlZC4gQnkgZGVmYXVsdCwgaWYgdGhlIGNhbGxiYWNrXG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24gaXMgaW52b2tlZCB3aXRoIG9ubHkgYSBzaW5nbGUgYXJndW1lbnQsIHRoYXQgd2lsbCBiZVxuICAgICAgICogICAgICAgIHJlc29sdmVkIHRvIHRoZSBwcm9taXNlLCB3aGlsZSBhbGwgYXJndW1lbnRzIHdpbGwgYmUgcmVzb2x2ZWQgYXNcbiAgICAgICAqICAgICAgICBhbiBhcnJheSBpZiBtdWx0aXBsZSBhcmUgZ2l2ZW4uXG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge2Z1bmN0aW9ufVxuICAgICAgICogICAgICAgIFRoZSBnZW5lcmF0ZWQgY2FsbGJhY2sgZnVuY3Rpb24uXG4gICAgICAgKi9cbiAgICAgIGNvbnN0IG1ha2VDYWxsYmFjayA9IChwcm9taXNlLCBtZXRhZGF0YSkgPT4ge1xuICAgICAgICByZXR1cm4gKC4uLmNhbGxiYWNrQXJncykgPT4ge1xuICAgICAgICAgIGlmIChleHRlbnNpb25BUElzLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgICAgICBwcm9taXNlLnJlamVjdChuZXcgRXJyb3IoZXh0ZW5zaW9uQVBJcy5ydW50aW1lLmxhc3RFcnJvci5tZXNzYWdlKSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChtZXRhZGF0YS5zaW5nbGVDYWxsYmFja0FyZyB8fCBjYWxsYmFja0FyZ3MubGVuZ3RoIDw9IDEgJiYgbWV0YWRhdGEuc2luZ2xlQ2FsbGJhY2tBcmcgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICBwcm9taXNlLnJlc29sdmUoY2FsbGJhY2tBcmdzWzBdKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvbWlzZS5yZXNvbHZlKGNhbGxiYWNrQXJncyk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfTtcbiAgICAgIGNvbnN0IHBsdXJhbGl6ZUFyZ3VtZW50cyA9IG51bUFyZ3MgPT4gbnVtQXJncyA9PSAxID8gXCJhcmd1bWVudFwiIDogXCJhcmd1bWVudHNcIjtcblxuICAgICAgLyoqXG4gICAgICAgKiBDcmVhdGVzIGEgd3JhcHBlciBmdW5jdGlvbiBmb3IgYSBtZXRob2Qgd2l0aCB0aGUgZ2l2ZW4gbmFtZSBhbmQgbWV0YWRhdGEuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAgICAgICAqICAgICAgICBUaGUgbmFtZSBvZiB0aGUgbWV0aG9kIHdoaWNoIGlzIGJlaW5nIHdyYXBwZWQuXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gbWV0YWRhdGFcbiAgICAgICAqICAgICAgICBNZXRhZGF0YSBhYm91dCB0aGUgbWV0aG9kIGJlaW5nIHdyYXBwZWQuXG4gICAgICAgKiBAcGFyYW0ge2ludGVnZXJ9IG1ldGFkYXRhLm1pbkFyZ3NcbiAgICAgICAqICAgICAgICBUaGUgbWluaW11bSBudW1iZXIgb2YgYXJndW1lbnRzIHdoaWNoIG11c3QgYmUgcGFzc2VkIHRvIHRoZVxuICAgICAgICogICAgICAgIGZ1bmN0aW9uLiBJZiBjYWxsZWQgd2l0aCBmZXdlciB0aGFuIHRoaXMgbnVtYmVyIG9mIGFyZ3VtZW50cywgdGhlXG4gICAgICAgKiAgICAgICAgd3JhcHBlciB3aWxsIHJhaXNlIGFuIGV4Y2VwdGlvbi5cbiAgICAgICAqIEBwYXJhbSB7aW50ZWdlcn0gbWV0YWRhdGEubWF4QXJnc1xuICAgICAgICogICAgICAgIFRoZSBtYXhpbXVtIG51bWJlciBvZiBhcmd1bWVudHMgd2hpY2ggbWF5IGJlIHBhc3NlZCB0byB0aGVcbiAgICAgICAqICAgICAgICBmdW5jdGlvbi4gSWYgY2FsbGVkIHdpdGggbW9yZSB0aGFuIHRoaXMgbnVtYmVyIG9mIGFyZ3VtZW50cywgdGhlXG4gICAgICAgKiAgICAgICAgd3JhcHBlciB3aWxsIHJhaXNlIGFuIGV4Y2VwdGlvbi5cbiAgICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gbWV0YWRhdGEuc2luZ2xlQ2FsbGJhY2tBcmdcbiAgICAgICAqICAgICAgICBXaGV0aGVyIG9yIG5vdCB0aGUgcHJvbWlzZSBpcyByZXNvbHZlZCB3aXRoIG9ubHkgdGhlIGZpcnN0XG4gICAgICAgKiAgICAgICAgYXJndW1lbnQgb2YgdGhlIGNhbGxiYWNrLCBhbHRlcm5hdGl2ZWx5IGFuIGFycmF5IG9mIGFsbCB0aGVcbiAgICAgICAqICAgICAgICBjYWxsYmFjayBhcmd1bWVudHMgaXMgcmVzb2x2ZWQuIEJ5IGRlZmF1bHQsIGlmIHRoZSBjYWxsYmFja1xuICAgICAgICogICAgICAgIGZ1bmN0aW9uIGlzIGludm9rZWQgd2l0aCBvbmx5IGEgc2luZ2xlIGFyZ3VtZW50LCB0aGF0IHdpbGwgYmVcbiAgICAgICAqICAgICAgICByZXNvbHZlZCB0byB0aGUgcHJvbWlzZSwgd2hpbGUgYWxsIGFyZ3VtZW50cyB3aWxsIGJlIHJlc29sdmVkIGFzXG4gICAgICAgKiAgICAgICAgYW4gYXJyYXkgaWYgbXVsdGlwbGUgYXJlIGdpdmVuLlxuICAgICAgICpcbiAgICAgICAqIEByZXR1cm5zIHtmdW5jdGlvbihvYmplY3QsIC4uLiopfVxuICAgICAgICogICAgICAgVGhlIGdlbmVyYXRlZCB3cmFwcGVyIGZ1bmN0aW9uLlxuICAgICAgICovXG4gICAgICBjb25zdCB3cmFwQXN5bmNGdW5jdGlvbiA9IChuYW1lLCBtZXRhZGF0YSkgPT4ge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gYXN5bmNGdW5jdGlvbldyYXBwZXIodGFyZ2V0LCAuLi5hcmdzKSB7XG4gICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDwgbWV0YWRhdGEubWluQXJncykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBhdCBsZWFzdCAke21ldGFkYXRhLm1pbkFyZ3N9ICR7cGx1cmFsaXplQXJndW1lbnRzKG1ldGFkYXRhLm1pbkFyZ3MpfSBmb3IgJHtuYW1lfSgpLCBnb3QgJHthcmdzLmxlbmd0aH1gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gbWV0YWRhdGEubWF4QXJncykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBhdCBtb3N0ICR7bWV0YWRhdGEubWF4QXJnc30gJHtwbHVyYWxpemVBcmd1bWVudHMobWV0YWRhdGEubWF4QXJncyl9IGZvciAke25hbWV9KCksIGdvdCAke2FyZ3MubGVuZ3RofWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgaWYgKG1ldGFkYXRhLmZhbGxiYWNrVG9Ob0NhbGxiYWNrKSB7XG4gICAgICAgICAgICAgIC8vIFRoaXMgQVBJIG1ldGhvZCBoYXMgY3VycmVudGx5IG5vIGNhbGxiYWNrIG9uIENocm9tZSwgYnV0IGl0IHJldHVybiBhIHByb21pc2Ugb24gRmlyZWZveCxcbiAgICAgICAgICAgICAgLy8gYW5kIHNvIHRoZSBwb2x5ZmlsbCB3aWxsIHRyeSB0byBjYWxsIGl0IHdpdGggYSBjYWxsYmFjayBmaXJzdCwgYW5kIGl0IHdpbGwgZmFsbGJhY2tcbiAgICAgICAgICAgICAgLy8gdG8gbm90IHBhc3NpbmcgdGhlIGNhbGxiYWNrIGlmIHRoZSBmaXJzdCBjYWxsIGZhaWxzLlxuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRhcmdldFtuYW1lXSguLi5hcmdzLCBtYWtlQ2FsbGJhY2soe1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZSxcbiAgICAgICAgICAgICAgICAgIHJlamVjdFxuICAgICAgICAgICAgICAgIH0sIG1ldGFkYXRhKSk7XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGNiRXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYCR7bmFtZX0gQVBJIG1ldGhvZCBkb2Vzbid0IHNlZW0gdG8gc3VwcG9ydCB0aGUgY2FsbGJhY2sgcGFyYW1ldGVyLCBgICsgXCJmYWxsaW5nIGJhY2sgdG8gY2FsbCBpdCB3aXRob3V0IGEgY2FsbGJhY2s6IFwiLCBjYkVycm9yKTtcbiAgICAgICAgICAgICAgICB0YXJnZXRbbmFtZV0oLi4uYXJncyk7XG5cbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgdGhlIEFQSSBtZXRob2QgbWV0YWRhdGEsIHNvIHRoYXQgdGhlIG5leHQgQVBJIGNhbGxzIHdpbGwgbm90IHRyeSB0b1xuICAgICAgICAgICAgICAgIC8vIHVzZSB0aGUgdW5zdXBwb3J0ZWQgY2FsbGJhY2sgYW55bW9yZS5cbiAgICAgICAgICAgICAgICBtZXRhZGF0YS5mYWxsYmFja1RvTm9DYWxsYmFjayA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIG1ldGFkYXRhLm5vQ2FsbGJhY2sgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChtZXRhZGF0YS5ub0NhbGxiYWNrKSB7XG4gICAgICAgICAgICAgIHRhcmdldFtuYW1lXSguLi5hcmdzKTtcbiAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdKC4uLmFyZ3MsIG1ha2VDYWxsYmFjayh7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSxcbiAgICAgICAgICAgICAgICByZWplY3RcbiAgICAgICAgICAgICAgfSwgbWV0YWRhdGEpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfTtcbiAgICAgIH07XG5cbiAgICAgIC8qKlxuICAgICAgICogV3JhcHMgYW4gZXhpc3RpbmcgbWV0aG9kIG9mIHRoZSB0YXJnZXQgb2JqZWN0LCBzbyB0aGF0IGNhbGxzIHRvIGl0IGFyZVxuICAgICAgICogaW50ZXJjZXB0ZWQgYnkgdGhlIGdpdmVuIHdyYXBwZXIgZnVuY3Rpb24uIFRoZSB3cmFwcGVyIGZ1bmN0aW9uIHJlY2VpdmVzLFxuICAgICAgICogYXMgaXRzIGZpcnN0IGFyZ3VtZW50LCB0aGUgb3JpZ2luYWwgYHRhcmdldGAgb2JqZWN0LCBmb2xsb3dlZCBieSBlYWNoIG9mXG4gICAgICAgKiB0aGUgYXJndW1lbnRzIHBhc3NlZCB0byB0aGUgb3JpZ2luYWwgbWV0aG9kLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSB0YXJnZXRcbiAgICAgICAqICAgICAgICBUaGUgb3JpZ2luYWwgdGFyZ2V0IG9iamVjdCB0aGF0IHRoZSB3cmFwcGVkIG1ldGhvZCBiZWxvbmdzIHRvLlxuICAgICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbWV0aG9kXG4gICAgICAgKiAgICAgICAgVGhlIG1ldGhvZCBiZWluZyB3cmFwcGVkLiBUaGlzIGlzIHVzZWQgYXMgdGhlIHRhcmdldCBvZiB0aGUgUHJveHlcbiAgICAgICAqICAgICAgICBvYmplY3Qgd2hpY2ggaXMgY3JlYXRlZCB0byB3cmFwIHRoZSBtZXRob2QuXG4gICAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSB3cmFwcGVyXG4gICAgICAgKiAgICAgICAgVGhlIHdyYXBwZXIgZnVuY3Rpb24gd2hpY2ggaXMgY2FsbGVkIGluIHBsYWNlIG9mIGEgZGlyZWN0IGludm9jYXRpb25cbiAgICAgICAqICAgICAgICBvZiB0aGUgd3JhcHBlZCBtZXRob2QuXG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge1Byb3h5PGZ1bmN0aW9uPn1cbiAgICAgICAqICAgICAgICBBIFByb3h5IG9iamVjdCBmb3IgdGhlIGdpdmVuIG1ldGhvZCwgd2hpY2ggaW52b2tlcyB0aGUgZ2l2ZW4gd3JhcHBlclxuICAgICAgICogICAgICAgIG1ldGhvZCBpbiBpdHMgcGxhY2UuXG4gICAgICAgKi9cbiAgICAgIGNvbnN0IHdyYXBNZXRob2QgPSAodGFyZ2V0LCBtZXRob2QsIHdyYXBwZXIpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm94eShtZXRob2QsIHtcbiAgICAgICAgICBhcHBseSh0YXJnZXRNZXRob2QsIHRoaXNPYmosIGFyZ3MpIHtcbiAgICAgICAgICAgIHJldHVybiB3cmFwcGVyLmNhbGwodGhpc09iaiwgdGFyZ2V0LCAuLi5hcmdzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIGxldCBoYXNPd25Qcm9wZXJ0eSA9IEZ1bmN0aW9uLmNhbGwuYmluZChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5KTtcblxuICAgICAgLyoqXG4gICAgICAgKiBXcmFwcyBhbiBvYmplY3QgaW4gYSBQcm94eSB3aGljaCBpbnRlcmNlcHRzIGFuZCB3cmFwcyBjZXJ0YWluIG1ldGhvZHNcbiAgICAgICAqIGJhc2VkIG9uIHRoZSBnaXZlbiBgd3JhcHBlcnNgIGFuZCBgbWV0YWRhdGFgIG9iamVjdHMuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IHRhcmdldFxuICAgICAgICogICAgICAgIFRoZSB0YXJnZXQgb2JqZWN0IHRvIHdyYXAuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IFt3cmFwcGVycyA9IHt9XVxuICAgICAgICogICAgICAgIEFuIG9iamVjdCB0cmVlIGNvbnRhaW5pbmcgd3JhcHBlciBmdW5jdGlvbnMgZm9yIHNwZWNpYWwgY2FzZXMuIEFueVxuICAgICAgICogICAgICAgIGZ1bmN0aW9uIHByZXNlbnQgaW4gdGhpcyBvYmplY3QgdHJlZSBpcyBjYWxsZWQgaW4gcGxhY2Ugb2YgdGhlXG4gICAgICAgKiAgICAgICAgbWV0aG9kIGluIHRoZSBzYW1lIGxvY2F0aW9uIGluIHRoZSBgdGFyZ2V0YCBvYmplY3QgdHJlZS4gVGhlc2VcbiAgICAgICAqICAgICAgICB3cmFwcGVyIG1ldGhvZHMgYXJlIGludm9rZWQgYXMgZGVzY3JpYmVkIGluIHtAc2VlIHdyYXBNZXRob2R9LlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBbbWV0YWRhdGEgPSB7fV1cbiAgICAgICAqICAgICAgICBBbiBvYmplY3QgdHJlZSBjb250YWluaW5nIG1ldGFkYXRhIHVzZWQgdG8gYXV0b21hdGljYWxseSBnZW5lcmF0ZVxuICAgICAgICogICAgICAgIFByb21pc2UtYmFzZWQgd3JhcHBlciBmdW5jdGlvbnMgZm9yIGFzeW5jaHJvbm91cy4gQW55IGZ1bmN0aW9uIGluXG4gICAgICAgKiAgICAgICAgdGhlIGB0YXJnZXRgIG9iamVjdCB0cmVlIHdoaWNoIGhhcyBhIGNvcnJlc3BvbmRpbmcgbWV0YWRhdGEgb2JqZWN0XG4gICAgICAgKiAgICAgICAgaW4gdGhlIHNhbWUgbG9jYXRpb24gaW4gdGhlIGBtZXRhZGF0YWAgdHJlZSBpcyByZXBsYWNlZCB3aXRoIGFuXG4gICAgICAgKiAgICAgICAgYXV0b21hdGljYWxseS1nZW5lcmF0ZWQgd3JhcHBlciBmdW5jdGlvbiwgYXMgZGVzY3JpYmVkIGluXG4gICAgICAgKiAgICAgICAge0BzZWUgd3JhcEFzeW5jRnVuY3Rpb259XG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge1Byb3h5PG9iamVjdD59XG4gICAgICAgKi9cbiAgICAgIGNvbnN0IHdyYXBPYmplY3QgPSAodGFyZ2V0LCB3cmFwcGVycyA9IHt9LCBtZXRhZGF0YSA9IHt9KSA9PiB7XG4gICAgICAgIGxldCBjYWNoZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgICAgIGxldCBoYW5kbGVycyA9IHtcbiAgICAgICAgICBoYXMocHJveHlUYXJnZXQsIHByb3ApIHtcbiAgICAgICAgICAgIHJldHVybiBwcm9wIGluIHRhcmdldCB8fCBwcm9wIGluIGNhY2hlO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZ2V0KHByb3h5VGFyZ2V0LCBwcm9wLCByZWNlaXZlcikge1xuICAgICAgICAgICAgaWYgKHByb3AgaW4gY2FjaGUpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhY2hlW3Byb3BdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCEocHJvcCBpbiB0YXJnZXQpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgdmFsdWUgPSB0YXJnZXRbcHJvcF07XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhIG1ldGhvZCBvbiB0aGUgdW5kZXJseWluZyBvYmplY3QuIENoZWNrIGlmIHdlIG5lZWQgdG8gZG9cbiAgICAgICAgICAgICAgLy8gYW55IHdyYXBwaW5nLlxuXG4gICAgICAgICAgICAgIGlmICh0eXBlb2Ygd3JhcHBlcnNbcHJvcF0gPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgIC8vIFdlIGhhdmUgYSBzcGVjaWFsLWNhc2Ugd3JhcHBlciBmb3IgdGhpcyBtZXRob2QuXG4gICAgICAgICAgICAgICAgdmFsdWUgPSB3cmFwTWV0aG9kKHRhcmdldCwgdGFyZ2V0W3Byb3BdLCB3cmFwcGVyc1twcm9wXSk7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGFzT3duUHJvcGVydHkobWV0YWRhdGEsIHByb3ApKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhbiBhc3luYyBtZXRob2QgdGhhdCB3ZSBoYXZlIG1ldGFkYXRhIGZvci4gQ3JlYXRlIGFcbiAgICAgICAgICAgICAgICAvLyBQcm9taXNlIHdyYXBwZXIgZm9yIGl0LlxuICAgICAgICAgICAgICAgIGxldCB3cmFwcGVyID0gd3JhcEFzeW5jRnVuY3Rpb24ocHJvcCwgbWV0YWRhdGFbcHJvcF0pO1xuICAgICAgICAgICAgICAgIHZhbHVlID0gd3JhcE1ldGhvZCh0YXJnZXQsIHRhcmdldFtwcm9wXSwgd3JhcHBlcik7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhIG1ldGhvZCB0aGF0IHdlIGRvbid0IGtub3cgb3IgY2FyZSBhYm91dC4gUmV0dXJuIHRoZVxuICAgICAgICAgICAgICAgIC8vIG9yaWdpbmFsIG1ldGhvZCwgYm91bmQgdG8gdGhlIHVuZGVybHlpbmcgb2JqZWN0LlxuICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuYmluZCh0YXJnZXQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAoaGFzT3duUHJvcGVydHkod3JhcHBlcnMsIHByb3ApIHx8IGhhc093blByb3BlcnR5KG1ldGFkYXRhLCBwcm9wKSkpIHtcbiAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhbiBvYmplY3QgdGhhdCB3ZSBuZWVkIHRvIGRvIHNvbWUgd3JhcHBpbmcgZm9yIHRoZSBjaGlsZHJlblxuICAgICAgICAgICAgICAvLyBvZi4gQ3JlYXRlIGEgc3ViLW9iamVjdCB3cmFwcGVyIGZvciBpdCB3aXRoIHRoZSBhcHByb3ByaWF0ZSBjaGlsZFxuICAgICAgICAgICAgICAvLyBtZXRhZGF0YS5cbiAgICAgICAgICAgICAgdmFsdWUgPSB3cmFwT2JqZWN0KHZhbHVlLCB3cmFwcGVyc1twcm9wXSwgbWV0YWRhdGFbcHJvcF0pO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChoYXNPd25Qcm9wZXJ0eShtZXRhZGF0YSwgXCIqXCIpKSB7XG4gICAgICAgICAgICAgIC8vIFdyYXAgYWxsIHByb3BlcnRpZXMgaW4gKiBuYW1lc3BhY2UuXG4gICAgICAgICAgICAgIHZhbHVlID0gd3JhcE9iamVjdCh2YWx1ZSwgd3JhcHBlcnNbcHJvcF0sIG1ldGFkYXRhW1wiKlwiXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXZSBkb24ndCBuZWVkIHRvIGRvIGFueSB3cmFwcGluZyBmb3IgdGhpcyBwcm9wZXJ0eSxcbiAgICAgICAgICAgICAgLy8gc28ganVzdCBmb3J3YXJkIGFsbCBhY2Nlc3MgdG8gdGhlIHVuZGVybHlpbmcgb2JqZWN0LlxuICAgICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoY2FjaGUsIHByb3AsIHtcbiAgICAgICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBnZXQoKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGFyZ2V0W3Byb3BdO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0KHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICB0YXJnZXRbcHJvcF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYWNoZVtwcm9wXSA9IHZhbHVlO1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgc2V0KHByb3h5VGFyZ2V0LCBwcm9wLCB2YWx1ZSwgcmVjZWl2ZXIpIHtcbiAgICAgICAgICAgIGlmIChwcm9wIGluIGNhY2hlKSB7XG4gICAgICAgICAgICAgIGNhY2hlW3Byb3BdID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0YXJnZXRbcHJvcF0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZGVmaW5lUHJvcGVydHkocHJveHlUYXJnZXQsIHByb3AsIGRlc2MpIHtcbiAgICAgICAgICAgIHJldHVybiBSZWZsZWN0LmRlZmluZVByb3BlcnR5KGNhY2hlLCBwcm9wLCBkZXNjKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGRlbGV0ZVByb3BlcnR5KHByb3h5VGFyZ2V0LCBwcm9wKSB7XG4gICAgICAgICAgICByZXR1cm4gUmVmbGVjdC5kZWxldGVQcm9wZXJ0eShjYWNoZSwgcHJvcCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIFBlciBjb250cmFjdCBvZiB0aGUgUHJveHkgQVBJLCB0aGUgXCJnZXRcIiBwcm94eSBoYW5kbGVyIG11c3QgcmV0dXJuIHRoZVxuICAgICAgICAvLyBvcmlnaW5hbCB2YWx1ZSBvZiB0aGUgdGFyZ2V0IGlmIHRoYXQgdmFsdWUgaXMgZGVjbGFyZWQgcmVhZC1vbmx5IGFuZFxuICAgICAgICAvLyBub24tY29uZmlndXJhYmxlLiBGb3IgdGhpcyByZWFzb24sIHdlIGNyZWF0ZSBhbiBvYmplY3Qgd2l0aCB0aGVcbiAgICAgICAgLy8gcHJvdG90eXBlIHNldCB0byBgdGFyZ2V0YCBpbnN0ZWFkIG9mIHVzaW5nIGB0YXJnZXRgIGRpcmVjdGx5LlxuICAgICAgICAvLyBPdGhlcndpc2Ugd2UgY2Fubm90IHJldHVybiBhIGN1c3RvbSBvYmplY3QgZm9yIEFQSXMgdGhhdFxuICAgICAgICAvLyBhcmUgZGVjbGFyZWQgcmVhZC1vbmx5IGFuZCBub24tY29uZmlndXJhYmxlLCBzdWNoIGFzIGBjaHJvbWUuZGV2dG9vbHNgLlxuICAgICAgICAvL1xuICAgICAgICAvLyBUaGUgcHJveHkgaGFuZGxlcnMgdGhlbXNlbHZlcyB3aWxsIHN0aWxsIHVzZSB0aGUgb3JpZ2luYWwgYHRhcmdldGBcbiAgICAgICAgLy8gaW5zdGVhZCBvZiB0aGUgYHByb3h5VGFyZ2V0YCwgc28gdGhhdCB0aGUgbWV0aG9kcyBhbmQgcHJvcGVydGllcyBhcmVcbiAgICAgICAgLy8gZGVyZWZlcmVuY2VkIHZpYSB0aGUgb3JpZ2luYWwgdGFyZ2V0cy5cbiAgICAgICAgbGV0IHByb3h5VGFyZ2V0ID0gT2JqZWN0LmNyZWF0ZSh0YXJnZXQpO1xuICAgICAgICByZXR1cm4gbmV3IFByb3h5KHByb3h5VGFyZ2V0LCBoYW5kbGVycyk7XG4gICAgICB9O1xuXG4gICAgICAvKipcbiAgICAgICAqIENyZWF0ZXMgYSBzZXQgb2Ygd3JhcHBlciBmdW5jdGlvbnMgZm9yIGFuIGV2ZW50IG9iamVjdCwgd2hpY2ggaGFuZGxlc1xuICAgICAgICogd3JhcHBpbmcgb2YgbGlzdGVuZXIgZnVuY3Rpb25zIHRoYXQgdGhvc2UgbWVzc2FnZXMgYXJlIHBhc3NlZC5cbiAgICAgICAqXG4gICAgICAgKiBBIHNpbmdsZSB3cmFwcGVyIGlzIGNyZWF0ZWQgZm9yIGVhY2ggbGlzdGVuZXIgZnVuY3Rpb24sIGFuZCBzdG9yZWQgaW4gYVxuICAgICAgICogbWFwLiBTdWJzZXF1ZW50IGNhbGxzIHRvIGBhZGRMaXN0ZW5lcmAsIGBoYXNMaXN0ZW5lcmAsIG9yIGByZW1vdmVMaXN0ZW5lcmBcbiAgICAgICAqIHJldHJpZXZlIHRoZSBvcmlnaW5hbCB3cmFwcGVyLCBzbyB0aGF0ICBhdHRlbXB0cyB0byByZW1vdmUgYVxuICAgICAgICogcHJldmlvdXNseS1hZGRlZCBsaXN0ZW5lciB3b3JrIGFzIGV4cGVjdGVkLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7RGVmYXVsdFdlYWtNYXA8ZnVuY3Rpb24sIGZ1bmN0aW9uPn0gd3JhcHBlck1hcFxuICAgICAgICogICAgICAgIEEgRGVmYXVsdFdlYWtNYXAgb2JqZWN0IHdoaWNoIHdpbGwgY3JlYXRlIHRoZSBhcHByb3ByaWF0ZSB3cmFwcGVyXG4gICAgICAgKiAgICAgICAgZm9yIGEgZ2l2ZW4gbGlzdGVuZXIgZnVuY3Rpb24gd2hlbiBvbmUgZG9lcyBub3QgZXhpc3QsIGFuZCByZXRyaWV2ZVxuICAgICAgICogICAgICAgIGFuIGV4aXN0aW5nIG9uZSB3aGVuIGl0IGRvZXMuXG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge29iamVjdH1cbiAgICAgICAqL1xuICAgICAgY29uc3Qgd3JhcEV2ZW50ID0gd3JhcHBlck1hcCA9PiAoe1xuICAgICAgICBhZGRMaXN0ZW5lcih0YXJnZXQsIGxpc3RlbmVyLCAuLi5hcmdzKSB7XG4gICAgICAgICAgdGFyZ2V0LmFkZExpc3RlbmVyKHdyYXBwZXJNYXAuZ2V0KGxpc3RlbmVyKSwgLi4uYXJncyk7XG4gICAgICAgIH0sXG4gICAgICAgIGhhc0xpc3RlbmVyKHRhcmdldCwgbGlzdGVuZXIpIHtcbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lmhhc0xpc3RlbmVyKHdyYXBwZXJNYXAuZ2V0KGxpc3RlbmVyKSk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlbW92ZUxpc3RlbmVyKHRhcmdldCwgbGlzdGVuZXIpIHtcbiAgICAgICAgICB0YXJnZXQucmVtb3ZlTGlzdGVuZXIod3JhcHBlck1hcC5nZXQobGlzdGVuZXIpKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBjb25zdCBvblJlcXVlc3RGaW5pc2hlZFdyYXBwZXJzID0gbmV3IERlZmF1bHRXZWFrTWFwKGxpc3RlbmVyID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgcmV0dXJuIGxpc3RlbmVyO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFdyYXBzIGFuIG9uUmVxdWVzdEZpbmlzaGVkIGxpc3RlbmVyIGZ1bmN0aW9uIHNvIHRoYXQgaXQgd2lsbCByZXR1cm4gYVxuICAgICAgICAgKiBgZ2V0Q29udGVudCgpYCBwcm9wZXJ0eSB3aGljaCByZXR1cm5zIGEgYFByb21pc2VgIHJhdGhlciB0aGFuIHVzaW5nIGFcbiAgICAgICAgICogY2FsbGJhY2sgQVBJLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0ge29iamVjdH0gcmVxXG4gICAgICAgICAqICAgICAgICBUaGUgSEFSIGVudHJ5IG9iamVjdCByZXByZXNlbnRpbmcgdGhlIG5ldHdvcmsgcmVxdWVzdC5cbiAgICAgICAgICovXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBvblJlcXVlc3RGaW5pc2hlZChyZXEpIHtcbiAgICAgICAgICBjb25zdCB3cmFwcGVkUmVxID0gd3JhcE9iamVjdChyZXEsIHt9IC8qIHdyYXBwZXJzICovLCB7XG4gICAgICAgICAgICBnZXRDb250ZW50OiB7XG4gICAgICAgICAgICAgIG1pbkFyZ3M6IDAsXG4gICAgICAgICAgICAgIG1heEFyZ3M6IDBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsaXN0ZW5lcih3cmFwcGVkUmVxKTtcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgICAgY29uc3Qgb25NZXNzYWdlV3JhcHBlcnMgPSBuZXcgRGVmYXVsdFdlYWtNYXAobGlzdGVuZXIgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICByZXR1cm4gbGlzdGVuZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogV3JhcHMgYSBtZXNzYWdlIGxpc3RlbmVyIGZ1bmN0aW9uIHNvIHRoYXQgaXQgbWF5IHNlbmQgcmVzcG9uc2VzIGJhc2VkIG9uXG4gICAgICAgICAqIGl0cyByZXR1cm4gdmFsdWUsIHJhdGhlciB0aGFuIGJ5IHJldHVybmluZyBhIHNlbnRpbmVsIHZhbHVlIGFuZCBjYWxsaW5nIGFcbiAgICAgICAgICogY2FsbGJhY2suIElmIHRoZSBsaXN0ZW5lciBmdW5jdGlvbiByZXR1cm5zIGEgUHJvbWlzZSwgdGhlIHJlc3BvbnNlIGlzXG4gICAgICAgICAqIHNlbnQgd2hlbiB0aGUgcHJvbWlzZSBlaXRoZXIgcmVzb2x2ZXMgb3IgcmVqZWN0cy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHBhcmFtIHsqfSBtZXNzYWdlXG4gICAgICAgICAqICAgICAgICBUaGUgbWVzc2FnZSBzZW50IGJ5IHRoZSBvdGhlciBlbmQgb2YgdGhlIGNoYW5uZWwuXG4gICAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBzZW5kZXJcbiAgICAgICAgICogICAgICAgIERldGFpbHMgYWJvdXQgdGhlIHNlbmRlciBvZiB0aGUgbWVzc2FnZS5cbiAgICAgICAgICogQHBhcmFtIHtmdW5jdGlvbigqKX0gc2VuZFJlc3BvbnNlXG4gICAgICAgICAqICAgICAgICBBIGNhbGxiYWNrIHdoaWNoLCB3aGVuIGNhbGxlZCB3aXRoIGFuIGFyYml0cmFyeSBhcmd1bWVudCwgc2VuZHNcbiAgICAgICAgICogICAgICAgIHRoYXQgdmFsdWUgYXMgYSByZXNwb25zZS5cbiAgICAgICAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAgICAgICAqICAgICAgICBUcnVlIGlmIHRoZSB3cmFwcGVkIGxpc3RlbmVyIHJldHVybmVkIGEgUHJvbWlzZSwgd2hpY2ggd2lsbCBsYXRlclxuICAgICAgICAgKiAgICAgICAgeWllbGQgYSByZXNwb25zZS4gRmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAgICAgKi9cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG9uTWVzc2FnZShtZXNzYWdlLCBzZW5kZXIsIHNlbmRSZXNwb25zZSkge1xuICAgICAgICAgIGxldCBkaWRDYWxsU2VuZFJlc3BvbnNlID0gZmFsc2U7XG4gICAgICAgICAgbGV0IHdyYXBwZWRTZW5kUmVzcG9uc2U7XG4gICAgICAgICAgbGV0IHNlbmRSZXNwb25zZVByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICAgIHdyYXBwZWRTZW5kUmVzcG9uc2UgPSBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgZGlkQ2FsbFNlbmRSZXNwb25zZSA9IHRydWU7XG4gICAgICAgICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsZXQgcmVzdWx0O1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXN1bHQgPSBsaXN0ZW5lcihtZXNzYWdlLCBzZW5kZXIsIHdyYXBwZWRTZW5kUmVzcG9uc2UpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgcmVzdWx0ID0gUHJvbWlzZS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgaXNSZXN1bHRUaGVuYWJsZSA9IHJlc3VsdCAhPT0gdHJ1ZSAmJiBpc1RoZW5hYmxlKHJlc3VsdCk7XG5cbiAgICAgICAgICAvLyBJZiB0aGUgbGlzdGVuZXIgZGlkbid0IHJldHVybmVkIHRydWUgb3IgYSBQcm9taXNlLCBvciBjYWxsZWRcbiAgICAgICAgICAvLyB3cmFwcGVkU2VuZFJlc3BvbnNlIHN5bmNocm9ub3VzbHksIHdlIGNhbiBleGl0IGVhcmxpZXJcbiAgICAgICAgICAvLyBiZWNhdXNlIHRoZXJlIHdpbGwgYmUgbm8gcmVzcG9uc2Ugc2VudCBmcm9tIHRoaXMgbGlzdGVuZXIuXG4gICAgICAgICAgaWYgKHJlc3VsdCAhPT0gdHJ1ZSAmJiAhaXNSZXN1bHRUaGVuYWJsZSAmJiAhZGlkQ2FsbFNlbmRSZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEEgc21hbGwgaGVscGVyIHRvIHNlbmQgdGhlIG1lc3NhZ2UgaWYgdGhlIHByb21pc2UgcmVzb2x2ZXNcbiAgICAgICAgICAvLyBhbmQgYW4gZXJyb3IgaWYgdGhlIHByb21pc2UgcmVqZWN0cyAoYSB3cmFwcGVkIHNlbmRNZXNzYWdlIGhhc1xuICAgICAgICAgIC8vIHRvIHRyYW5zbGF0ZSB0aGUgbWVzc2FnZSBpbnRvIGEgcmVzb2x2ZWQgcHJvbWlzZSBvciBhIHJlamVjdGVkXG4gICAgICAgICAgLy8gcHJvbWlzZSkuXG4gICAgICAgICAgY29uc3Qgc2VuZFByb21pc2VkUmVzdWx0ID0gcHJvbWlzZSA9PiB7XG4gICAgICAgICAgICBwcm9taXNlLnRoZW4obXNnID0+IHtcbiAgICAgICAgICAgICAgLy8gc2VuZCB0aGUgbWVzc2FnZSB2YWx1ZS5cbiAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKG1zZyk7XG4gICAgICAgICAgICB9LCBlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIFNlbmQgYSBKU09OIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBlcnJvciBpZiB0aGUgcmVqZWN0ZWQgdmFsdWVcbiAgICAgICAgICAgICAgLy8gaXMgYW4gaW5zdGFuY2Ugb2YgZXJyb3IsIG9yIHRoZSBvYmplY3QgaXRzZWxmIG90aGVyd2lzZS5cbiAgICAgICAgICAgICAgbGV0IG1lc3NhZ2U7XG4gICAgICAgICAgICAgIGlmIChlcnJvciAmJiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciB8fCB0eXBlb2YgZXJyb3IubWVzc2FnZSA9PT0gXCJzdHJpbmdcIikpIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gZXJyb3IubWVzc2FnZTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gXCJBbiB1bmV4cGVjdGVkIGVycm9yIG9jY3VycmVkXCI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICAgICAgICBfX21veldlYkV4dGVuc2lvblBvbHlmaWxsUmVqZWN0X186IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIC8vIFByaW50IGFuIGVycm9yIG9uIHRoZSBjb25zb2xlIGlmIHVuYWJsZSB0byBzZW5kIHRoZSByZXNwb25zZS5cbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzZW5kIG9uTWVzc2FnZSByZWplY3RlZCByZXBseVwiLCBlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfTtcblxuICAgICAgICAgIC8vIElmIHRoZSBsaXN0ZW5lciByZXR1cm5lZCBhIFByb21pc2UsIHNlbmQgdGhlIHJlc29sdmVkIHZhbHVlIGFzIGFcbiAgICAgICAgICAvLyByZXN1bHQsIG90aGVyd2lzZSB3YWl0IHRoZSBwcm9taXNlIHJlbGF0ZWQgdG8gdGhlIHdyYXBwZWRTZW5kUmVzcG9uc2VcbiAgICAgICAgICAvLyBjYWxsYmFjayB0byByZXNvbHZlIGFuZCBzZW5kIGl0IGFzIGEgcmVzcG9uc2UuXG4gICAgICAgICAgaWYgKGlzUmVzdWx0VGhlbmFibGUpIHtcbiAgICAgICAgICAgIHNlbmRQcm9taXNlZFJlc3VsdChyZXN1bHQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZW5kUHJvbWlzZWRSZXN1bHQoc2VuZFJlc3BvbnNlUHJvbWlzZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gTGV0IENocm9tZSBrbm93IHRoYXQgdGhlIGxpc3RlbmVyIGlzIHJlcGx5aW5nLlxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgICBjb25zdCB3cmFwcGVkU2VuZE1lc3NhZ2VDYWxsYmFjayA9ICh7XG4gICAgICAgIHJlamVjdCxcbiAgICAgICAgcmVzb2x2ZVxuICAgICAgfSwgcmVwbHkpID0+IHtcbiAgICAgICAgaWYgKGV4dGVuc2lvbkFQSXMucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgICAvLyBEZXRlY3Qgd2hlbiBub25lIG9mIHRoZSBsaXN0ZW5lcnMgcmVwbGllZCB0byB0aGUgc2VuZE1lc3NhZ2UgY2FsbCBhbmQgcmVzb2x2ZVxuICAgICAgICAgIC8vIHRoZSBwcm9taXNlIHRvIHVuZGVmaW5lZCBhcyBpbiBGaXJlZm94LlxuICAgICAgICAgIC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS93ZWJleHRlbnNpb24tcG9seWZpbGwvaXNzdWVzLzEzMFxuICAgICAgICAgIGlmIChleHRlbnNpb25BUElzLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UgPT09IENIUk9NRV9TRU5EX01FU1NBR0VfQ0FMTEJBQ0tfTk9fUkVTUE9OU0VfTUVTU0FHRSkge1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGV4dGVuc2lvbkFQSXMucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChyZXBseSAmJiByZXBseS5fX21veldlYkV4dGVuc2lvblBvbHlmaWxsUmVqZWN0X18pIHtcbiAgICAgICAgICAvLyBDb252ZXJ0IGJhY2sgdGhlIEpTT04gcmVwcmVzZW50YXRpb24gb2YgdGhlIGVycm9yIGludG9cbiAgICAgICAgICAvLyBhbiBFcnJvciBpbnN0YW5jZS5cbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKHJlcGx5Lm1lc3NhZ2UpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNvbHZlKHJlcGx5KTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGNvbnN0IHdyYXBwZWRTZW5kTWVzc2FnZSA9IChuYW1lLCBtZXRhZGF0YSwgYXBpTmFtZXNwYWNlT2JqLCAuLi5hcmdzKSA9PiB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA8IG1ldGFkYXRhLm1pbkFyZ3MpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGF0IGxlYXN0ICR7bWV0YWRhdGEubWluQXJnc30gJHtwbHVyYWxpemVBcmd1bWVudHMobWV0YWRhdGEubWluQXJncyl9IGZvciAke25hbWV9KCksIGdvdCAke2FyZ3MubGVuZ3RofWApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IG1ldGFkYXRhLm1heEFyZ3MpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGF0IG1vc3QgJHttZXRhZGF0YS5tYXhBcmdzfSAke3BsdXJhbGl6ZUFyZ3VtZW50cyhtZXRhZGF0YS5tYXhBcmdzKX0gZm9yICR7bmFtZX0oKSwgZ290ICR7YXJncy5sZW5ndGh9YCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICBjb25zdCB3cmFwcGVkQ2IgPSB3cmFwcGVkU2VuZE1lc3NhZ2VDYWxsYmFjay5iaW5kKG51bGwsIHtcbiAgICAgICAgICAgIHJlc29sdmUsXG4gICAgICAgICAgICByZWplY3RcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBhcmdzLnB1c2god3JhcHBlZENiKTtcbiAgICAgICAgICBhcGlOYW1lc3BhY2VPYmouc2VuZE1lc3NhZ2UoLi4uYXJncyk7XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIGNvbnN0IHN0YXRpY1dyYXBwZXJzID0ge1xuICAgICAgICBkZXZ0b29sczoge1xuICAgICAgICAgIG5ldHdvcms6IHtcbiAgICAgICAgICAgIG9uUmVxdWVzdEZpbmlzaGVkOiB3cmFwRXZlbnQob25SZXF1ZXN0RmluaXNoZWRXcmFwcGVycylcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHJ1bnRpbWU6IHtcbiAgICAgICAgICBvbk1lc3NhZ2U6IHdyYXBFdmVudChvbk1lc3NhZ2VXcmFwcGVycyksXG4gICAgICAgICAgb25NZXNzYWdlRXh0ZXJuYWw6IHdyYXBFdmVudChvbk1lc3NhZ2VXcmFwcGVycyksXG4gICAgICAgICAgc2VuZE1lc3NhZ2U6IHdyYXBwZWRTZW5kTWVzc2FnZS5iaW5kKG51bGwsIFwic2VuZE1lc3NhZ2VcIiwge1xuICAgICAgICAgICAgbWluQXJnczogMSxcbiAgICAgICAgICAgIG1heEFyZ3M6IDNcbiAgICAgICAgICB9KVxuICAgICAgICB9LFxuICAgICAgICB0YWJzOiB7XG4gICAgICAgICAgc2VuZE1lc3NhZ2U6IHdyYXBwZWRTZW5kTWVzc2FnZS5iaW5kKG51bGwsIFwic2VuZE1lc3NhZ2VcIiwge1xuICAgICAgICAgICAgbWluQXJnczogMixcbiAgICAgICAgICAgIG1heEFyZ3M6IDNcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgY29uc3Qgc2V0dGluZ01ldGFkYXRhID0ge1xuICAgICAgICBjbGVhcjoge1xuICAgICAgICAgIG1pbkFyZ3M6IDEsXG4gICAgICAgICAgbWF4QXJnczogMVxuICAgICAgICB9LFxuICAgICAgICBnZXQ6IHtcbiAgICAgICAgICBtaW5BcmdzOiAxLFxuICAgICAgICAgIG1heEFyZ3M6IDFcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiB7XG4gICAgICAgICAgbWluQXJnczogMSxcbiAgICAgICAgICBtYXhBcmdzOiAxXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBhcGlNZXRhZGF0YS5wcml2YWN5ID0ge1xuICAgICAgICBuZXR3b3JrOiB7XG4gICAgICAgICAgXCIqXCI6IHNldHRpbmdNZXRhZGF0YVxuICAgICAgICB9LFxuICAgICAgICBzZXJ2aWNlczoge1xuICAgICAgICAgIFwiKlwiOiBzZXR0aW5nTWV0YWRhdGFcbiAgICAgICAgfSxcbiAgICAgICAgd2Vic2l0ZXM6IHtcbiAgICAgICAgICBcIipcIjogc2V0dGluZ01ldGFkYXRhXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICByZXR1cm4gd3JhcE9iamVjdChleHRlbnNpb25BUElzLCBzdGF0aWNXcmFwcGVycywgYXBpTWV0YWRhdGEpO1xuICAgIH07XG5cbiAgICAvLyBUaGUgYnVpbGQgcHJvY2VzcyBhZGRzIGEgVU1EIHdyYXBwZXIgYXJvdW5kIHRoaXMgZmlsZSwgd2hpY2ggbWFrZXMgdGhlXG4gICAgLy8gYG1vZHVsZWAgdmFyaWFibGUgYXZhaWxhYmxlLlxuICAgIG1vZHVsZS5leHBvcnRzID0gd3JhcEFQSXMoY2hyb21lKTtcbiAgfSBlbHNlIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGdsb2JhbFRoaXMuYnJvd3NlcjtcbiAgfVxufSk7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1icm93c2VyLXBvbHlmaWxsLmpzLm1hcFxuIiwiaW1wb3J0IG9yaWdpbmFsQnJvd3NlciBmcm9tIFwid2ViZXh0ZW5zaW9uLXBvbHlmaWxsXCI7XG5leHBvcnQgY29uc3QgYnJvd3NlciA9IG9yaWdpbmFsQnJvd3NlcjtcbiIsImZ1bmN0aW9uIHByaW50KG1ldGhvZCwgLi4uYXJncykge1xuICBpZiAoaW1wb3J0Lm1ldGEuZW52Lk1PREUgPT09IFwicHJvZHVjdGlvblwiKSByZXR1cm47XG4gIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBhcmdzLnNoaWZ0KCk7XG4gICAgbWV0aG9kKGBbd3h0XSAke21lc3NhZ2V9YCwgLi4uYXJncyk7XG4gIH0gZWxzZSB7XG4gICAgbWV0aG9kKFwiW3d4dF1cIiwgLi4uYXJncyk7XG4gIH1cbn1cbmV4cG9ydCBjb25zdCBsb2dnZXIgPSB7XG4gIGRlYnVnOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5kZWJ1ZywgLi4uYXJncyksXG4gIGxvZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUubG9nLCAuLi5hcmdzKSxcbiAgd2FybjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUud2FybiwgLi4uYXJncyksXG4gIGVycm9yOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5lcnJvciwgLi4uYXJncylcbn07XG4iLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG5leHBvcnQgY2xhc3MgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCBleHRlbmRzIEV2ZW50IHtcbiAgY29uc3RydWN0b3IobmV3VXJsLCBvbGRVcmwpIHtcbiAgICBzdXBlcihXeHRMb2NhdGlvbkNoYW5nZUV2ZW50LkVWRU5UX05BTUUsIHt9KTtcbiAgICB0aGlzLm5ld1VybCA9IG5ld1VybDtcbiAgICB0aGlzLm9sZFVybCA9IG9sZFVybDtcbiAgfVxuICBzdGF0aWMgRVZFTlRfTkFNRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcInd4dDpsb2NhdGlvbmNoYW5nZVwiKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBnZXRVbmlxdWVFdmVudE5hbWUoZXZlbnROYW1lKSB7XG4gIHJldHVybiBgJHticm93c2VyPy5ydW50aW1lPy5pZH06JHtpbXBvcnQubWV0YS5lbnYuRU5UUllQT0lOVH06JHtldmVudE5hbWV9YDtcbn1cbiIsImltcG9ydCB7IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tIFwiLi9jdXN0b20tZXZlbnRzLm1qc1wiO1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcihjdHgpIHtcbiAgbGV0IGludGVydmFsO1xuICBsZXQgb2xkVXJsO1xuICByZXR1cm4ge1xuICAgIC8qKlxuICAgICAqIEVuc3VyZSB0aGUgbG9jYXRpb24gd2F0Y2hlciBpcyBhY3RpdmVseSBsb29raW5nIGZvciBVUkwgY2hhbmdlcy4gSWYgaXQncyBhbHJlYWR5IHdhdGNoaW5nLFxuICAgICAqIHRoaXMgaXMgYSBub29wLlxuICAgICAqL1xuICAgIHJ1bigpIHtcbiAgICAgIGlmIChpbnRlcnZhbCAhPSBudWxsKSByZXR1cm47XG4gICAgICBvbGRVcmwgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpO1xuICAgICAgaW50ZXJ2YWwgPSBjdHguc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICBsZXQgbmV3VXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcbiAgICAgICAgaWYgKG5ld1VybC5ocmVmICE9PSBvbGRVcmwuaHJlZikge1xuICAgICAgICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50KG5ld1VybCwgb2xkVXJsKSk7XG4gICAgICAgICAgb2xkVXJsID0gbmV3VXJsO1xuICAgICAgICB9XG4gICAgICB9LCAxZTMpO1xuICAgIH1cbiAgfTtcbn1cbiIsImltcG9ydCB7IGJyb3dzZXIgfSBmcm9tIFwid3h0L2Jyb3dzZXJcIjtcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gXCIuLi8uLi9zYW5kYm94L3V0aWxzL2xvZ2dlci5tanNcIjtcbmltcG9ydCB7IGdldFVuaXF1ZUV2ZW50TmFtZSB9IGZyb20gXCIuL2N1c3RvbS1ldmVudHMubWpzXCI7XG5pbXBvcnQgeyBjcmVhdGVMb2NhdGlvbldhdGNoZXIgfSBmcm9tIFwiLi9sb2NhdGlvbi13YXRjaGVyLm1qc1wiO1xuZXhwb3J0IGNsYXNzIENvbnRlbnRTY3JpcHRDb250ZXh0IHtcbiAgY29uc3RydWN0b3IoY29udGVudFNjcmlwdE5hbWUsIG9wdGlvbnMpIHtcbiAgICB0aGlzLmNvbnRlbnRTY3JpcHROYW1lID0gY29udGVudFNjcmlwdE5hbWU7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICB0aGlzLmFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBpZiAodGhpcy5pc1RvcEZyYW1lKSB7XG4gICAgICB0aGlzLmxpc3RlbkZvck5ld2VyU2NyaXB0cyh7IGlnbm9yZUZpcnN0RXZlbnQ6IHRydWUgfSk7XG4gICAgICB0aGlzLnN0b3BPbGRTY3JpcHRzKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCk7XG4gICAgfVxuICB9XG4gIHN0YXRpYyBTQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXG4gICAgXCJ3eHQ6Y29udGVudC1zY3JpcHQtc3RhcnRlZFwiXG4gICk7XG4gIGlzVG9wRnJhbWUgPSB3aW5kb3cuc2VsZiA9PT0gd2luZG93LnRvcDtcbiAgYWJvcnRDb250cm9sbGVyO1xuICBsb2NhdGlvbldhdGNoZXIgPSBjcmVhdGVMb2NhdGlvbldhdGNoZXIodGhpcyk7XG4gIHJlY2VpdmVkTWVzc2FnZUlkcyA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgU2V0KCk7XG4gIGdldCBzaWduYWwoKSB7XG4gICAgcmV0dXJuIHRoaXMuYWJvcnRDb250cm9sbGVyLnNpZ25hbDtcbiAgfVxuICBhYm9ydChyZWFzb24pIHtcbiAgICByZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuYWJvcnQocmVhc29uKTtcbiAgfVxuICBnZXQgaXNJbnZhbGlkKCkge1xuICAgIGlmIChicm93c2VyLnJ1bnRpbWUuaWQgPT0gbnVsbCkge1xuICAgICAgdGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zaWduYWwuYWJvcnRlZDtcbiAgfVxuICBnZXQgaXNWYWxpZCgpIHtcbiAgICByZXR1cm4gIXRoaXMuaXNJbnZhbGlkO1xuICB9XG4gIC8qKlxuICAgKiBBZGQgYSBsaXN0ZW5lciB0aGF0IGlzIGNhbGxlZCB3aGVuIHRoZSBjb250ZW50IHNjcmlwdCdzIGNvbnRleHQgaXMgaW52YWxpZGF0ZWQuXG4gICAqXG4gICAqIEByZXR1cm5zIEEgZnVuY3Rpb24gdG8gcmVtb3ZlIHRoZSBsaXN0ZW5lci5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihjYik7XG4gICAqIGNvbnN0IHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIgPSBjdHgub25JbnZhbGlkYXRlZCgoKSA9PiB7XG4gICAqICAgYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5yZW1vdmVMaXN0ZW5lcihjYik7XG4gICAqIH0pXG4gICAqIC8vIC4uLlxuICAgKiByZW1vdmVJbnZhbGlkYXRlZExpc3RlbmVyKCk7XG4gICAqL1xuICBvbkludmFsaWRhdGVkKGNiKSB7XG4gICAgdGhpcy5zaWduYWwuYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcbiAgICByZXR1cm4gKCkgPT4gdGhpcy5zaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcbiAgfVxuICAvKipcbiAgICogUmV0dXJuIGEgcHJvbWlzZSB0aGF0IG5ldmVyIHJlc29sdmVzLiBVc2VmdWwgaWYgeW91IGhhdmUgYW4gYXN5bmMgZnVuY3Rpb24gdGhhdCBzaG91bGRuJ3QgcnVuXG4gICAqIGFmdGVyIHRoZSBjb250ZXh0IGlzIGV4cGlyZWQuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGNvbnN0IGdldFZhbHVlRnJvbVN0b3JhZ2UgPSBhc3luYyAoKSA9PiB7XG4gICAqICAgaWYgKGN0eC5pc0ludmFsaWQpIHJldHVybiBjdHguYmxvY2soKTtcbiAgICpcbiAgICogICAvLyAuLi5cbiAgICogfVxuICAgKi9cbiAgYmxvY2soKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHtcbiAgICB9KTtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRJbnRlcnZhbGAgdGhhdCBhdXRvbWF0aWNhbGx5IGNsZWFycyB0aGUgaW50ZXJ2YWwgd2hlbiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHNldEludGVydmFsKGhhbmRsZXIsIHRpbWVvdXQpIHtcbiAgICBjb25zdCBpZCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRUaW1lb3V0YCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuICAgKi9cbiAgc2V0VGltZW91dChoYW5kbGVyLCB0aW1lb3V0KSB7XG4gICAgY29uc3QgaWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJUaW1lb3V0KGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZWAgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuICAgKiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShjYWxsYmFjaykge1xuICAgIGNvbnN0IGlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCguLi5hcmdzKSA9PiB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSBjYWxsYmFjayguLi5hcmdzKTtcbiAgICB9KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsQW5pbWF0aW9uRnJhbWUoaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgLyoqXG4gICAqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cucmVxdWVzdElkbGVDYWxsYmFja2AgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuICAgKiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHJlcXVlc3RJZGxlQ2FsbGJhY2soY2FsbGJhY2ssIG9wdGlvbnMpIHtcbiAgICBjb25zdCBpZCA9IHJlcXVlc3RJZGxlQ2FsbGJhY2soKC4uLmFyZ3MpID0+IHtcbiAgICAgIGlmICghdGhpcy5zaWduYWwuYWJvcnRlZCkgY2FsbGJhY2soLi4uYXJncyk7XG4gICAgfSwgb3B0aW9ucyk7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNhbmNlbElkbGVDYWxsYmFjayhpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICBhZGRFdmVudExpc3RlbmVyKHRhcmdldCwgdHlwZSwgaGFuZGxlciwgb3B0aW9ucykge1xuICAgIGlmICh0eXBlID09PSBcInd4dDpsb2NhdGlvbmNoYW5nZVwiKSB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSB0aGlzLmxvY2F0aW9uV2F0Y2hlci5ydW4oKTtcbiAgICB9XG4gICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXI/LihcbiAgICAgIHR5cGUuc3RhcnRzV2l0aChcInd4dDpcIikgPyBnZXRVbmlxdWVFdmVudE5hbWUodHlwZSkgOiB0eXBlLFxuICAgICAgaGFuZGxlcixcbiAgICAgIHtcbiAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgc2lnbmFsOiB0aGlzLnNpZ25hbFxuICAgICAgfVxuICAgICk7XG4gIH1cbiAgLyoqXG4gICAqIEBpbnRlcm5hbFxuICAgKiBBYm9ydCB0aGUgYWJvcnQgY29udHJvbGxlciBhbmQgZXhlY3V0ZSBhbGwgYG9uSW52YWxpZGF0ZWRgIGxpc3RlbmVycy5cbiAgICovXG4gIG5vdGlmeUludmFsaWRhdGVkKCkge1xuICAgIHRoaXMuYWJvcnQoXCJDb250ZW50IHNjcmlwdCBjb250ZXh0IGludmFsaWRhdGVkXCIpO1xuICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBDb250ZW50IHNjcmlwdCBcIiR7dGhpcy5jb250ZW50U2NyaXB0TmFtZX1cIiBjb250ZXh0IGludmFsaWRhdGVkYFxuICAgICk7XG4gIH1cbiAgc3RvcE9sZFNjcmlwdHMoKSB7XG4gICAgd2luZG93LnBvc3RNZXNzYWdlKFxuICAgICAge1xuICAgICAgICB0eXBlOiBDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsXG4gICAgICAgIGNvbnRlbnRTY3JpcHROYW1lOiB0aGlzLmNvbnRlbnRTY3JpcHROYW1lLFxuICAgICAgICBtZXNzYWdlSWQ6IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpXG4gICAgICB9LFxuICAgICAgXCIqXCJcbiAgICApO1xuICB9XG4gIHZlcmlmeVNjcmlwdFN0YXJ0ZWRFdmVudChldmVudCkge1xuICAgIGNvbnN0IGlzU2NyaXB0U3RhcnRlZEV2ZW50ID0gZXZlbnQuZGF0YT8udHlwZSA9PT0gQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFO1xuICAgIGNvbnN0IGlzU2FtZUNvbnRlbnRTY3JpcHQgPSBldmVudC5kYXRhPy5jb250ZW50U2NyaXB0TmFtZSA9PT0gdGhpcy5jb250ZW50U2NyaXB0TmFtZTtcbiAgICBjb25zdCBpc05vdER1cGxpY2F0ZSA9ICF0aGlzLnJlY2VpdmVkTWVzc2FnZUlkcy5oYXMoZXZlbnQuZGF0YT8ubWVzc2FnZUlkKTtcbiAgICByZXR1cm4gaXNTY3JpcHRTdGFydGVkRXZlbnQgJiYgaXNTYW1lQ29udGVudFNjcmlwdCAmJiBpc05vdER1cGxpY2F0ZTtcbiAgfVxuICBsaXN0ZW5Gb3JOZXdlclNjcmlwdHMob3B0aW9ucykge1xuICAgIGxldCBpc0ZpcnN0ID0gdHJ1ZTtcbiAgICBjb25zdCBjYiA9IChldmVudCkgPT4ge1xuICAgICAgaWYgKHRoaXMudmVyaWZ5U2NyaXB0U3RhcnRlZEV2ZW50KGV2ZW50KSkge1xuICAgICAgICB0aGlzLnJlY2VpdmVkTWVzc2FnZUlkcy5hZGQoZXZlbnQuZGF0YS5tZXNzYWdlSWQpO1xuICAgICAgICBjb25zdCB3YXNGaXJzdCA9IGlzRmlyc3Q7XG4gICAgICAgIGlzRmlyc3QgPSBmYWxzZTtcbiAgICAgICAgaWYgKHdhc0ZpcnN0ICYmIG9wdGlvbnM/Lmlnbm9yZUZpcnN0RXZlbnQpIHJldHVybjtcbiAgICAgICAgdGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuICAgICAgfVxuICAgIH07XG4gICAgYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgY2IpO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiByZW1vdmVFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCBjYikpO1xuICB9XG59XG4iLCJjb25zdCBudWxsS2V5ID0gU3ltYm9sKCdudWxsJyk7IC8vIGBvYmplY3RIYXNoZXNgIGtleSBmb3IgbnVsbFxuXG5sZXQga2V5Q291bnRlciA9IDA7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1hbnlLZXlzTWFwIGV4dGVuZHMgTWFwIHtcblx0Y29uc3RydWN0b3IoLi4uYXJndW1lbnRzXykge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9vYmplY3RIYXNoZXMgPSBuZXcgV2Vha01hcCgpO1xuXHRcdHRoaXMuX3N5bWJvbEhhc2hlcyA9IG5ldyBNYXAoKTsgLy8gaHR0cHM6Ly9naXRodWIuY29tL3RjMzkvZWNtYTI2Mi9pc3N1ZXMvMTE5NFxuXHRcdHRoaXMuX3B1YmxpY0tleXMgPSBuZXcgTWFwKCk7XG5cblx0XHRjb25zdCBbcGFpcnNdID0gYXJndW1lbnRzXzsgLy8gTWFwIGNvbXBhdFxuXHRcdGlmIChwYWlycyA9PT0gbnVsbCB8fCBwYWlycyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBwYWlyc1tTeW1ib2wuaXRlcmF0b3JdICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKHR5cGVvZiBwYWlycyArICcgaXMgbm90IGl0ZXJhYmxlIChjYW5ub3QgcmVhZCBwcm9wZXJ0eSBTeW1ib2woU3ltYm9sLml0ZXJhdG9yKSknKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFtrZXlzLCB2YWx1ZV0gb2YgcGFpcnMpIHtcblx0XHRcdHRoaXMuc2V0KGtleXMsIHZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRfZ2V0UHVibGljS2V5cyhrZXlzLCBjcmVhdGUgPSBmYWxzZSkge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShrZXlzKSkge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignVGhlIGtleXMgcGFyYW1ldGVyIG11c3QgYmUgYW4gYXJyYXknKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcml2YXRlS2V5ID0gdGhpcy5fZ2V0UHJpdmF0ZUtleShrZXlzLCBjcmVhdGUpO1xuXG5cdFx0bGV0IHB1YmxpY0tleTtcblx0XHRpZiAocHJpdmF0ZUtleSAmJiB0aGlzLl9wdWJsaWNLZXlzLmhhcyhwcml2YXRlS2V5KSkge1xuXHRcdFx0cHVibGljS2V5ID0gdGhpcy5fcHVibGljS2V5cy5nZXQocHJpdmF0ZUtleSk7XG5cdFx0fSBlbHNlIGlmIChjcmVhdGUpIHtcblx0XHRcdHB1YmxpY0tleSA9IFsuLi5rZXlzXTsgLy8gUmVnZW5lcmF0ZSBrZXlzIGFycmF5IHRvIGF2b2lkIGV4dGVybmFsIGludGVyYWN0aW9uXG5cdFx0XHR0aGlzLl9wdWJsaWNLZXlzLnNldChwcml2YXRlS2V5LCBwdWJsaWNLZXkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7cHJpdmF0ZUtleSwgcHVibGljS2V5fTtcblx0fVxuXG5cdF9nZXRQcml2YXRlS2V5KGtleXMsIGNyZWF0ZSA9IGZhbHNlKSB7XG5cdFx0Y29uc3QgcHJpdmF0ZUtleXMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRjb25zdCBrZXlUb1Bhc3MgPSBrZXkgPT09IG51bGwgPyBudWxsS2V5IDoga2V5O1xuXG5cdFx0XHRsZXQgaGFzaGVzO1xuXHRcdFx0aWYgKHR5cGVvZiBrZXlUb1Bhc3MgPT09ICdvYmplY3QnIHx8IHR5cGVvZiBrZXlUb1Bhc3MgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0aGFzaGVzID0gJ19vYmplY3RIYXNoZXMnO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2Yga2V5VG9QYXNzID09PSAnc3ltYm9sJykge1xuXHRcdFx0XHRoYXNoZXMgPSAnX3N5bWJvbEhhc2hlcyc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoYXNoZXMgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFoYXNoZXMpIHtcblx0XHRcdFx0cHJpdmF0ZUtleXMucHVzaChrZXlUb1Bhc3MpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzW2hhc2hlc10uaGFzKGtleVRvUGFzcykpIHtcblx0XHRcdFx0cHJpdmF0ZUtleXMucHVzaCh0aGlzW2hhc2hlc10uZ2V0KGtleVRvUGFzcykpO1xuXHRcdFx0fSBlbHNlIGlmIChjcmVhdGUpIHtcblx0XHRcdFx0Y29uc3QgcHJpdmF0ZUtleSA9IGBAQG1rbS1yZWYtJHtrZXlDb3VudGVyKyt9QEBgO1xuXHRcdFx0XHR0aGlzW2hhc2hlc10uc2V0KGtleVRvUGFzcywgcHJpdmF0ZUtleSk7XG5cdFx0XHRcdHByaXZhdGVLZXlzLnB1c2gocHJpdmF0ZUtleSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHByaXZhdGVLZXlzKTtcblx0fVxuXG5cdHNldChrZXlzLCB2YWx1ZSkge1xuXHRcdGNvbnN0IHtwdWJsaWNLZXl9ID0gdGhpcy5fZ2V0UHVibGljS2V5cyhrZXlzLCB0cnVlKTtcblx0XHRyZXR1cm4gc3VwZXIuc2V0KHB1YmxpY0tleSwgdmFsdWUpO1xuXHR9XG5cblx0Z2V0KGtleXMpIHtcblx0XHRjb25zdCB7cHVibGljS2V5fSA9IHRoaXMuX2dldFB1YmxpY0tleXMoa2V5cyk7XG5cdFx0cmV0dXJuIHN1cGVyLmdldChwdWJsaWNLZXkpO1xuXHR9XG5cblx0aGFzKGtleXMpIHtcblx0XHRjb25zdCB7cHVibGljS2V5fSA9IHRoaXMuX2dldFB1YmxpY0tleXMoa2V5cyk7XG5cdFx0cmV0dXJuIHN1cGVyLmhhcyhwdWJsaWNLZXkpO1xuXHR9XG5cblx0ZGVsZXRlKGtleXMpIHtcblx0XHRjb25zdCB7cHVibGljS2V5LCBwcml2YXRlS2V5fSA9IHRoaXMuX2dldFB1YmxpY0tleXMoa2V5cyk7XG5cdFx0cmV0dXJuIEJvb2xlYW4ocHVibGljS2V5ICYmIHN1cGVyLmRlbGV0ZShwdWJsaWNLZXkpICYmIHRoaXMuX3B1YmxpY0tleXMuZGVsZXRlKHByaXZhdGVLZXkpKTtcblx0fVxuXG5cdGNsZWFyKCkge1xuXHRcdHN1cGVyLmNsZWFyKCk7XG5cdFx0dGhpcy5fc3ltYm9sSGFzaGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcHVibGljS2V5cy5jbGVhcigpO1xuXHR9XG5cblx0Z2V0IFtTeW1ib2wudG9TdHJpbmdUYWddKCkge1xuXHRcdHJldHVybiAnTWFueUtleXNNYXAnO1xuXHR9XG5cblx0Z2V0IHNpemUoKSB7XG5cdFx0cmV0dXJuIHN1cGVyLnNpemU7XG5cdH1cbn1cbiIsImltcG9ydCBNYW55S2V5c01hcCBmcm9tICdtYW55LWtleXMtbWFwJztcbmltcG9ydCB7IGRlZnUgfSBmcm9tICdkZWZ1JztcbmltcG9ydCB7IGlzRXhpc3QgfSBmcm9tICcuL2RldGVjdG9ycy5tanMnO1xuXG5jb25zdCBnZXREZWZhdWx0T3B0aW9ucyA9ICgpID0+ICh7XG4gIHRhcmdldDogZ2xvYmFsVGhpcy5kb2N1bWVudCxcbiAgdW5pZnlQcm9jZXNzOiB0cnVlLFxuICBkZXRlY3RvcjogaXNFeGlzdCxcbiAgb2JzZXJ2ZUNvbmZpZ3M6IHtcbiAgICBjaGlsZExpc3Q6IHRydWUsXG4gICAgc3VidHJlZTogdHJ1ZSxcbiAgICBhdHRyaWJ1dGVzOiB0cnVlXG4gIH0sXG4gIHNpZ25hbDogdm9pZCAwLFxuICBjdXN0b21NYXRjaGVyOiB2b2lkIDBcbn0pO1xuY29uc3QgbWVyZ2VPcHRpb25zID0gKHVzZXJTaWRlT3B0aW9ucywgZGVmYXVsdE9wdGlvbnMpID0+IHtcbiAgcmV0dXJuIGRlZnUodXNlclNpZGVPcHRpb25zLCBkZWZhdWx0T3B0aW9ucyk7XG59O1xuXG5jb25zdCB1bmlmeUNhY2hlID0gbmV3IE1hbnlLZXlzTWFwKCk7XG5mdW5jdGlvbiBjcmVhdGVXYWl0RWxlbWVudChpbnN0YW5jZU9wdGlvbnMpIHtcbiAgY29uc3QgeyBkZWZhdWx0T3B0aW9ucyB9ID0gaW5zdGFuY2VPcHRpb25zO1xuICByZXR1cm4gKHNlbGVjdG9yLCBvcHRpb25zKSA9PiB7XG4gICAgY29uc3Qge1xuICAgICAgdGFyZ2V0LFxuICAgICAgdW5pZnlQcm9jZXNzLFxuICAgICAgb2JzZXJ2ZUNvbmZpZ3MsXG4gICAgICBkZXRlY3RvcixcbiAgICAgIHNpZ25hbCxcbiAgICAgIGN1c3RvbU1hdGNoZXJcbiAgICB9ID0gbWVyZ2VPcHRpb25zKG9wdGlvbnMsIGRlZmF1bHRPcHRpb25zKTtcbiAgICBjb25zdCB1bmlmeVByb21pc2VLZXkgPSBbXG4gICAgICBzZWxlY3RvcixcbiAgICAgIHRhcmdldCxcbiAgICAgIHVuaWZ5UHJvY2VzcyxcbiAgICAgIG9ic2VydmVDb25maWdzLFxuICAgICAgZGV0ZWN0b3IsXG4gICAgICBzaWduYWwsXG4gICAgICBjdXN0b21NYXRjaGVyXG4gICAgXTtcbiAgICBjb25zdCBjYWNoZWRQcm9taXNlID0gdW5pZnlDYWNoZS5nZXQodW5pZnlQcm9taXNlS2V5KTtcbiAgICBpZiAodW5pZnlQcm9jZXNzICYmIGNhY2hlZFByb21pc2UpIHtcbiAgICAgIHJldHVybiBjYWNoZWRQcm9taXNlO1xuICAgIH1cbiAgICBjb25zdCBkZXRlY3RQcm9taXNlID0gbmV3IFByb21pc2UoXG4gICAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQXN5bmNQcm9taXNlRXhlY3V0b3I6IGF2b2lkIG5lc3RpbmcgcHJvbWlzZVxuICAgICAgYXN5bmMgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBpZiAoc2lnbmFsPy5hYm9ydGVkKSB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChzaWduYWwucmVhc29uKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKFxuICAgICAgICAgIGFzeW5jIChtdXRhdGlvbnMpID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgXyBvZiBtdXRhdGlvbnMpIHtcbiAgICAgICAgICAgICAgaWYgKHNpZ25hbD8uYWJvcnRlZCkge1xuICAgICAgICAgICAgICAgIG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjb25zdCBkZXRlY3RSZXN1bHQyID0gYXdhaXQgZGV0ZWN0RWxlbWVudCh7XG4gICAgICAgICAgICAgICAgc2VsZWN0b3IsXG4gICAgICAgICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgICAgICAgIGRldGVjdG9yLFxuICAgICAgICAgICAgICAgIGN1c3RvbU1hdGNoZXJcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIGlmIChkZXRlY3RSZXN1bHQyLmlzRGV0ZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShkZXRlY3RSZXN1bHQyLnJlc3VsdCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHNpZ25hbD8uYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAgICAgICBcImFib3J0XCIsXG4gICAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgcmV0dXJuIHJlamVjdChzaWduYWwucmVhc29uKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIHsgb25jZTogdHJ1ZSB9XG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IGRldGVjdFJlc3VsdCA9IGF3YWl0IGRldGVjdEVsZW1lbnQoe1xuICAgICAgICAgIHNlbGVjdG9yLFxuICAgICAgICAgIHRhcmdldCxcbiAgICAgICAgICBkZXRlY3RvcixcbiAgICAgICAgICBjdXN0b21NYXRjaGVyXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoZGV0ZWN0UmVzdWx0LmlzRGV0ZWN0ZWQpIHtcbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZShkZXRlY3RSZXN1bHQucmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgICBvYnNlcnZlci5vYnNlcnZlKHRhcmdldCwgb2JzZXJ2ZUNvbmZpZ3MpO1xuICAgICAgfVxuICAgICkuZmluYWxseSgoKSA9PiB7XG4gICAgICB1bmlmeUNhY2hlLmRlbGV0ZSh1bmlmeVByb21pc2VLZXkpO1xuICAgIH0pO1xuICAgIHVuaWZ5Q2FjaGUuc2V0KHVuaWZ5UHJvbWlzZUtleSwgZGV0ZWN0UHJvbWlzZSk7XG4gICAgcmV0dXJuIGRldGVjdFByb21pc2U7XG4gIH07XG59XG5hc3luYyBmdW5jdGlvbiBkZXRlY3RFbGVtZW50KHtcbiAgdGFyZ2V0LFxuICBzZWxlY3RvcixcbiAgZGV0ZWN0b3IsXG4gIGN1c3RvbU1hdGNoZXJcbn0pIHtcbiAgY29uc3QgZWxlbWVudCA9IGN1c3RvbU1hdGNoZXIgPyBjdXN0b21NYXRjaGVyKHNlbGVjdG9yKSA6IHRhcmdldC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgcmV0dXJuIGF3YWl0IGRldGVjdG9yKGVsZW1lbnQpO1xufVxuY29uc3Qgd2FpdEVsZW1lbnQgPSBjcmVhdGVXYWl0RWxlbWVudCh7XG4gIGRlZmF1bHRPcHRpb25zOiBnZXREZWZhdWx0T3B0aW9ucygpXG59KTtcblxuZXhwb3J0IHsgY3JlYXRlV2FpdEVsZW1lbnQsIGdldERlZmF1bHRPcHRpb25zLCB3YWl0RWxlbWVudCB9O1xuIl0sIm5hbWVzIjpbImRlZmluaXRpb24iLCJ0aGlzIiwibW9kdWxlIiwicHJveHlUYXJnZXQiLCJ2YWx1ZSIsInJlc3VsdCIsIm1lc3NhZ2UiLCJwcmludCIsImxvZ2dlciJdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBTyxXQUFTLG9CQUFvQkEsYUFBWTtBQUM5QyxXQUFPQTtBQUFBLEVBQ1Q7QUFBQSxFQ2FPLE1BQU0sZUFBZTtBQUFBLElBQXJCO0FBQ0wsMENBQW9DO0FBQzVCLGlFQUFzQixJQUFBO0FBQUE7QUFBQSxJQUU5QixNQUFNLGtCQUNKLGNBQ0EsVUFDZTtBQUNmLFVBQUk7QUFDRixnQkFBUTtBQUFBLFVBQ047QUFBQSxVQUNBO0FBQUEsUUFBQTtBQU1GLFlBQUksYUFBYSxhQUFhLGlCQUFpQixlQUFlO0FBQzVELGtCQUFRO0FBQUEsWUFDTixpQ0FBaUMsYUFBYSxPQUFPLFVB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
