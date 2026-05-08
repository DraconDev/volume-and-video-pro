var content = (function() {
  "use strict";var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  function defineContentScript(definition2) {
    return definition2;
  }
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
  const DEBUG_ENABLED = typeof localStorage !== "undefined" && localStorage.getItem("debugVvp") === "true";
  function debugLog(...args) {
    if (DEBUG_ENABLED) {
      console.log("[VVP]", ...args);
    }
  }
  content;
  class AudioProcessor {
    constructor() {
      __publicField(this, "audioContext", null);
      __publicField(this, "audioElementMap", /* @__PURE__ */ new Map());
    }
    async setupAudioContext(mediaElement, settings) {
      try {
        debugLog(
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
          debugLog(
            `[AudioProcessor] Reusing existing audio nodes for element: ${mediaElement.src || "(no src)"}`
          );
          let sourceChanged = false;
          if (this.audioContext && (nodes.currentSrc !== mediaElement.currentSrc || !nodes.source)) {
            debugLog(
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
            debugLog(
              `[AudioProcessor] Graph topology changed (sourceChanged=${sourceChanged}, monoChanged=${monoChanged}). Reconnecting nodes.`
            );
            await this.connectNodes(nodes, settings);
          } else {
            await this.updateNodeSettings(nodes, settings);
          }
        } else {
          debugLog(
            `[AudioProcessor] Creating new audio nodes for element: ${mediaElement.src || "(no src)"}`
          );
          nodes = await this.createAudioNodes(mediaElement, settings);
          this.audioElementMap.set(mediaElement, nodes);
        }
        debugLog("AudioProcessor: Setup complete for:", mediaElement.src);
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
        debugLog(
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
      debugLog(
        `[AudioProcessor] Connecting/Reconnecting nodes for ${element.src || "(no src)"}. Target Mono: ${settings.mono}, Current Node Mono: ${nodes.mono}`
      );
      debugLog(
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
      debugLog(
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
      debugLog(
        "[AudioProcessor] Updating audio effects with settings:",
        JSON.stringify(settings)
      );
      for (const [element, nodes] of this.audioElementMap.entries()) {
        if (!element.isConnected) {
          debugLog(
            `[AudioProcessor] Element ${element.src || "(no src)"} is no longer connected to DOM. Disconnecting and removing.`
          );
          this.disconnectElementNodes(element);
          continue;
        }
        try {
          await this.setupAudioContext(element, settings);
          debugLog(
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
      debugLog("AudioProcessor: Cleanup completed");
    }
    /**
     * Attempts to resume the AudioContext if it's suspended.
     * Should be called after a user gesture.
     */
    async tryResumeContext() {
      if (this.audioContext && this.audioContext.state === "suspended") {
        try {
          await this.audioContext.resume();
          debugLog("AudioProcessor: AudioContext resumed successfully.");
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
          debugLog(
            "[MediaManager Observer] Added media elements detected, triggering debounced check."
          );
          debouncedCheck();
        }
        if (removedMediaElements.length > 0) {
          debugLog(
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
        debugLog(
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
      debugLog(
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
              debugLog(`[MediaProcessor] Reapplying settings on play event for ${element.src || "(no src)"}`);
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
        debugLog(
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
      debugLog("[MediaProcessor] Forcing audio effects update");
      if (this.audioProcessor["audioContext"] && this.audioProcessor["audioContext"].state !== "closed") {
        try {
          if (this.audioProcessor["audioContext"].state === "suspended") {
            await this.audioProcessor["audioContext"].resume();
          }
          await this.audioProcessor.updateAudioEffects(settings);
          debugLog(
            "[MediaProcessor] Successfully forced audio effects update"
          );
        } catch (e) {
          console.error(
            "[MediaProcessor] Failed to force audio effects update:",
            e
          );
        }
      } else {
        debugLog(
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
      debugLog(
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
      debugLog(
        `SettingsHandler (Target: ${this.targetHostname}): Attempting to send GET_INITIAL_SETTINGS.`
      );
      try {
        const response = await chrome.runtime.sendMessage({
          type: "GET_INITIAL_SETTINGS",
          hostname: this.targetHostname
        });
        debugLog(
          `SettingsHandler (Target: ${this.targetHostname}): GET_INITIAL_SETTINGS response received:`,
          response
        );
        if (response && response.settings) {
          this.currentSettings = response.settings;
          debugLog(
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
        debugLog(
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
      debugLog(
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
      debugLog(
        `[ContentScript] Running in TOP window. Hostname: ${topHostname}`
      );
      initializeScript(topHostname);
      const topWindowMessageListener = (event) => {
        debugLog(
          `[ContentScript TOP] Received message. Origin: ${event.origin}, Data Type: ${typeof event.data}, Data: ${event.data}`
        );
        if (typeof event.data !== "string" || !event.data.startsWith("{") || !event.data.endsWith("}")) {
          debugLog(
            "[ContentScript TOP] Ignoring non-JSON or non-VVP message from iframe (format mismatch)."
          );
          return;
        }
        if (!event.data.includes("VVP_REQUEST_TOP_HOSTNAME") && !event.data.includes("VVP_TOP_HOSTNAME_INFO")) {
          debugLog(
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
        debugLog(
          `[ContentScript TOP] Parsed VVP message from iframe (Origin: ${event.origin}):`,
          parsedData
        );
        if (event.source && // Ensure source exists (source is the window object of the sender)
        parsedData && parsedData.type === "VVP_REQUEST_TOP_HOSTNAME") {
          debugLog(
            `[ContentScript TOP] Processing VVP_REQUEST_TOP_HOSTNAME from iframe (Source origin: ${event.origin}). Responding with hostname: ${topHostname}.`
          );
          const responsePayload = JSON.stringify({
            type: "VVP_TOP_HOSTNAME_INFO",
            hostname: topHostname,
            success: true
          });
          const targetOrigin = event.origin === "null" ? "*" : event.origin;
          event.source.postMessage(responsePayload, targetOrigin);
          debugLog(
            `[ContentScript TOP] Sent VVP_TOP_HOSTNAME_INFO response to iframe at ${event.origin}.`
          );
        } else {
          debugLog(
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
      debugLog(
        `[ContentScript iFrame] Running in IFRAME. Own hostname: ${iframeOwnHostname}. Attempting to request hostname from top window. Setting up message listener.`
      );
      let receivedHostname = false;
      let fallbackTimeout = null;
      const responseListener = (event) => {
        debugLog(
          `[ContentScript iFrame] Received message. Origin: ${event.origin}, Data Type: ${typeof event.data}, Data: ${event.data}`
        );
        if (event.source !== window.top) {
          debugLog(
            `[ContentScript iFrame] Received message from non-top source: ${event.origin}. Ignoring.`
          );
          return;
        }
        if (typeof event.data !== "string" || !event.data.startsWith("{") || !event.data.endsWith("}")) {
          debugLog(
            "[ContentScript iFrame] Ignoring non-JSON or non-VVP message from top (format mismatch)."
          );
          return;
        }
        if (!event.data.includes("VVP_REQUEST_TOP_HOSTNAME") && !event.data.includes("VVP_TOP_HOSTNAME_INFO")) {
          debugLog(
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
        debugLog(
          `[ContentScript iFrame] Parsed VVP message from top (Origin: ${event.origin}):`,
          parsedData
        );
        if (parsedData && parsedData.type === "VVP_TOP_HOSTNAME_INFO" && typeof parsedData.hostname === "string") {
          if (fallbackTimeout) {
            clearTimeout(fallbackTimeout);
            fallbackTimeout = null;
          }
          if (receivedHostname) {
            debugLog(
              `[ContentScript iFrame] Already received hostname. Ignoring duplicate VVP_TOP_HOSTNAME_INFO from top. Origin: ${event.origin}. Parsed Data:`,
              parsedData
            );
            return;
          }
          receivedHostname = true;
          debugLog(
            `[ContentScript iFrame] Successfully received VVP_TOP_HOSTNAME_INFO from top: ${parsedData.hostname}. Origin: ${event.origin}. Initializing script. Parsed data:`,
            parsedData
          );
          window.removeEventListener("message", responseListener);
          cleanupFunctions = cleanupFunctions.filter((f) => f !== removeResponseListener);
          initializeScript(parsedData.hostname);
        } else if (parsedData && parsedData.type) {
          debugLog(
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
            debugLog(
              `[ContentScript iFrame] Sending VVP_REQUEST_TOP_HOSTNAME to top window (Origin: ${window.location.origin}).`
            );
            const messagePayload = JSON.stringify({
              type: "VVP_REQUEST_TOP_HOSTNAME",
              fromIframe: true,
              iframeOrigin: window.location.origin
            });
            window.top.postMessage(messagePayload, "*");
            debugLog(
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
      debugLog(
        `[ContentScript iFrame] Setting fallback timeout for ${TIMEOUT_DURATION}ms. Timeout ID: ${fallbackTimeout}`
      );
      fallbackTimeout = window.setTimeout(() => {
        debugLog(
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
          debugLog(
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
      debugLog(
        `[ContentScript DEBUG] applySettingsToSingleElement called for ${element.src || "(no src)"}`
      );
      try {
        await settingsHandler.ensureInitialized();
        const currentSettings = settingsHandler.getCurrentSettings();
        const needsProcessing = settingsHandler.needsAudioProcessing();
        debugLog(
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
      debugLog(
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
      debugLog(
        "[ContentScript Listener] Received message:",
        JSON.stringify(message)
      );
      if (message.type === "UPDATE_SETTINGS") {
        debugLog(
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
      debugLog(
        `[ContentScript DEBUG] Applying initial settings for ${window.location.hostname}`
      );
      await processMedia();
    };
    const domContentLoadedListener = () => {
      debugLog(
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
        debugLog(
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
        debugLog(
          `[ContentScript] Cleaning up ${removedElements.length} removed media elements.`
        );
        removedElements.forEach((element) => {
          mediaProcessor.audioProcessor.disconnectElementNodes(element);
        });
        const remainingManagedElements = mediaProcessor.getManagedMediaElements();
        if (remainingManagedElements.length === 0 && !settingsHandler.needsAudioProcessing()) {
          debugLog(
            "[ContentScript] No managed media elements left. Cleaning up AudioProcessor."
          );
          mediaProcessor.audioProcessor.cleanup();
        }
      }
    );
    cleanupFunctions.push(() => mediaObserver.disconnect());
    const beforeUnloadListener = () => {
      debugLog(
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
    debugLog(`[ContentScript] Initializing script for hostname: ${hostname}`);
    settingsHandler.initialize(hostname);
    const cleanupFunctions = [];
    const { applySettingsToSingleElement, attachListeners } = createMediaEventHandlers(settingsHandler, mediaProcessor);
    const processMedia = async () => {
      debugLog(
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
        debugLog(
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
      debugLog("[ContentScript] Running cleanup functions.");
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
      debugLog(
        "Content: Script starting - This log should always appear",
        window.location.href
      );
      if (window.location.protocol === "file:") {
        debugLog("Skipping content script for file URL");
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
        debugLog("[ContentScript] Page is unloading. Performing overall cleanup.");
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3d4dEAwLjE5LjI5X0B0eXBlcytub2RlQDI1LjYuMV9yb2xsdXBANC42MC4zL25vZGVfbW9kdWxlcy93eHQvZGlzdC9zYW5kYm94L2RlZmluZS1jb250ZW50LXNjcmlwdC5tanMiLCIuLi8uLi8uLi9zcmMvdHlwZXMudHMiLCIuLi8uLi8uLi9zcmMvYXVkaW8tcHJvY2Vzc29yLnRzIiwiLi4vLi4vLi4vc3JjL21lZGlhLW1hbmFnZXIudHMiLCIuLi8uLi8uLi9zcmMvbWVkaWEtcHJvY2Vzc29yLnRzIiwiLi4vLi4vLi4vc3JjL3NldHRpbmdzLWhhbmRsZXIudHMiLCIuLi8uLi8uLi9zcmMvaWZyYW1lLWhvc3RuYW1lLWhhbmRsZXIudHMiLCIuLi8uLi8uLi9zcmMvY29udGVudC1zY3JpcHQvbWVkaWEtZXZlbnRzLnRzIiwiLi4vLi4vLi4vc3JjL2NvbnRlbnQtc2NyaXB0L21lc3NhZ2UtaGFuZGxlci50cyIsIi4uLy4uLy4uL3NyYy9jb250ZW50LXNjcmlwdC9kb20tbGlmZWN5Y2xlLnRzIiwiLi4vLi4vLi4vc3JjL2NvbnRlbnQtc2NyaXB0LWluaXQudHMiLCIuLi8uLi8uLi9lbnRyeXBvaW50cy9jb250ZW50LnRzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3dlYmV4dGVuc2lvbi1wb2x5ZmlsbEAwLjEyLjAvbm9kZV9tb2R1bGVzL3dlYmV4dGVuc2lvbi1wb2x5ZmlsbC9kaXN0L2Jyb3dzZXItcG9seWZpbGwuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIvaW5kZXgubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3d4dEAwLjE5LjI5X0B0eXBlcytub2RlQDI1LjYuMV9yb2xsdXBANC42MC4zL25vZGVfbW9kdWxlcy93eHQvZGlzdC9zYW5kYm94L3V0aWxzL2xvZ2dlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2NsaWVudC9jb250ZW50LXNjcmlwdHMvY3VzdG9tLWV2ZW50cy5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2NsaWVudC9jb250ZW50LXNjcmlwdHMvbG9jYXRpb24td2F0Y2hlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2NsaWVudC9jb250ZW50LXNjcmlwdHMvY29udGVudC1zY3JpcHQtY29udGV4dC5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vbWFueS1rZXlzLW1hcEAzLjAuMy9ub2RlX21vZHVsZXMvbWFueS1rZXlzLW1hcC9pbmRleC5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9AMW5hdHN1K3dhaXQtZWxlbWVudEA0LjIuMC9ub2RlX21vZHVsZXMvQDFuYXRzdS93YWl0LWVsZW1lbnQvZGlzdC9pbmRleC5tanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIGRlZmluZUNvbnRlbnRTY3JpcHQoZGVmaW5pdGlvbikge1xuICByZXR1cm4gZGVmaW5pdGlvbjtcbn1cbiIsImV4cG9ydCBpbnRlcmZhY2UgQXVkaW9TZXR0aW5ncyB7XG4gIHZvbHVtZTogbnVtYmVyO1xuICBiYXNzQm9vc3Q6IG51bWJlcjtcbiAgdm9pY2VCb29zdDogbnVtYmVyO1xuICBtb25vOiBib29sZWFuO1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVTZXR0aW5ncyB7XG4gIGVuYWJsZWQ6IGJvb2xlYW47XG4gIHNldHRpbmdzPzogQXVkaW9TZXR0aW5ncztcbiAgYWN0aXZlU2V0dGluZzogXCJnbG9iYWxcIiB8IFwic2l0ZVwiIHwgXCJkaXNhYmxlZFwiO1xufVxuXG5leHBvcnQgY29uc3QgZGVmYXVsdFNldHRpbmdzOiBBdWRpb1NldHRpbmdzID0ge1xuICB2b2x1bWU6IDEwMCxcbiAgYmFzc0Jvb3N0OiAxMDAsXG4gIHZvaWNlQm9vc3Q6IDEwMCxcbiAgbW9ubzogZmFsc2UsXG4gIHNwZWVkOiAxMDAsXG59O1xuXG5leHBvcnQgY29uc3QgZGVmYXVsdFNpdGVTZXR0aW5nczogU2l0ZVNldHRpbmdzID0ge1xuICBlbmFibGVkOiB0cnVlLFxuICBzZXR0aW5nczogeyAuLi5kZWZhdWx0U2V0dGluZ3MgfSxcbiAgYWN0aXZlU2V0dGluZzogXCJnbG9iYWxcIiwgLy8gU3RhcnRzIGluIGdsb2JhbCBtb2RlLCBjYW4gYmUgY2hhbmdlZCB0byBcInNpdGVcIiBvciBcImRpc2FibGVkXCJcbn07XG5cbmV4cG9ydCB0eXBlIFN0YXRlVHlwZSA9IHtcbiAgZ2xvYmFsU2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3M7XG4gIHNpdGVTZXR0aW5nczogTWFwPHN0cmluZywgU2l0ZVNldHRpbmdzPjtcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVXBkYXRlU2V0dGluZ3NNZXNzYWdlIHtcbiAgdHlwZTogXCJVUERBVEVfU0VUVElOR1NcIjtcbiAgc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3M7XG4gIGVuYWJsZWQ/OiBib29sZWFuO1xuICBpc0dsb2JhbD86IGJvb2xlYW47XG4gIGhvc3RuYW1lPzogc3RyaW5nOyAvLyBBZGQgb3B0aW9uYWwgaG9zdG5hbWVcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb250ZW50U2NyaXB0UmVhZHlNZXNzYWdlIHtcbiAgdHlwZTogXCJDT05URU5UX1NDUklQVF9SRUFEWVwiO1xuICBob3N0bmFtZT86IHN0cmluZztcbiAgdXNpbmdHbG9iYWw/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVwZGF0ZVNpdGVNb2RlTWVzc2FnZSB7XG4gIHR5cGU6IFwiVVBEQVRFX1NJVEVfTU9ERVwiO1xuICBob3N0bmFtZT86IHN0cmluZztcbiAgbW9kZT86IFwiZ2xvYmFsXCIgfCBcInNpdGVcIiB8IFwiZGlzYWJsZWRcIjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHZXRJbml0aWFsU2V0dGluZ3NNZXNzYWdlIHtcbiAgdHlwZTogXCJHRVRfSU5JVElBTF9TRVRUSU5HU1wiO1xuICBob3N0bmFtZT86IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgTWVzc2FnZVR5cGUgPVxuICB8IFVwZGF0ZVNldHRpbmdzTWVzc2FnZVxuICB8IENvbnRlbnRTY3JpcHRSZWFkeU1lc3NhZ2VcbiAgfCBVcGRhdGVTaXRlTW9kZU1lc3NhZ2VcbiAgfCBHZXRJbml0aWFsU2V0dGluZ3NNZXNzYWdlO1xuXG5leHBvcnQgdHlwZSBTdG9yYWdlRGF0YSA9IHtcbiAgZ2xvYmFsU2V0dGluZ3M/OiBBdWRpb1NldHRpbmdzO1xuICBzaXRlU2V0dGluZ3M/OiB7IFtob3N0bmFtZTogc3RyaW5nXTogU2l0ZVNldHRpbmdzIH07XG59O1xuXG4vKipcbiAqIENoZWNrIGlmIGFsbCBhdWRpbyBzZXR0aW5ncyBhcmUgYXQgdGhlaXIgZGVmYXVsdCAoZGlzYWJsZWQpIHZhbHVlcy5cbiAqIFRoaXMgaXMgYSBwdXJlIGZ1bmN0aW9uIHVzZWQgYWNyb3NzIGNvbnRlbnQgc2NyaXB0IGFuZCBwb3B1cC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzU2V0dGluZ3NEaXNhYmxlZChzZXR0aW5nczogQXVkaW9TZXR0aW5ncyk6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIHNldHRpbmdzLnNwZWVkID09PSAxMDAgJiZcbiAgICBzZXR0aW5ncy52b2x1bWUgPT09IDEwMCAmJlxuICAgIHNldHRpbmdzLmJhc3NCb29zdCA9PT0gMTAwICYmXG4gICAgc2V0dGluZ3Mudm9pY2VCb29zdCA9PT0gMTAwICYmXG4gICAgIXNldHRpbmdzLm1vbm9cbiAgKTtcbn1cblxuLyoqXG4gKiBEZWJ1ZyBsb2dnZXIgdGhhdCBjYW4gYmUgZGlzYWJsZWQgaW4gcHJvZHVjdGlvbi5cbiAqIFNldCBsb2NhbFN0b3JhZ2UuZGVidWdWdnAgPSAndHJ1ZScgdG8gZW5hYmxlIGRlYnVnIG91dHB1dC5cbiAqL1xuY29uc3QgREVCVUdfRU5BQkxFRCA9XG4gIHR5cGVvZiBsb2NhbFN0b3JhZ2UgIT09IFwidW5kZWZpbmVkXCIgJiZcbiAgbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJkZWJ1Z1Z2cFwiKSA9PT0gXCJ0cnVlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWJ1Z0xvZyguLi5hcmdzOiBhbnlbXSkge1xuICBpZiAoREVCVUdfRU5BQkxFRCkge1xuICAgIGNvbnNvbGUubG9nKFwiW1ZWUF1cIiwgLi4uYXJncyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlYnVnV2FybiguLi5hcmdzOiBhbnlbXSkge1xuICBpZiAoREVCVUdfRU5BQkxFRCkge1xuICAgIGNvbnNvbGUud2FybihcIltWVlBdXCIsIC4uLmFyZ3MpO1xuICB9XG59XG5cbiIsImltcG9ydCB7IEF1ZGlvU2V0dGluZ3MgLCBkZWJ1Z0xvZyB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXVkaW9Ob2RlcyB7XG4gIGNvbnRleHQ6IEF1ZGlvQ29udGV4dDtcbiAgc291cmNlOiBNZWRpYUVsZW1lbnRBdWRpb1NvdXJjZU5vZGU7XG4gIGdhaW46IEdhaW5Ob2RlO1xuICBiYXNzRmlsdGVyOiBCaXF1YWRGaWx0ZXJOb2RlO1xuICB2b2ljZUZpbHRlcjogQmlxdWFkRmlsdGVyTm9kZTtcbiAgbWVyZ2VyOiBDaGFubmVsTWVyZ2VyTm9kZTtcbiAgc3BsaXR0ZXI6IENoYW5uZWxTcGxpdHRlck5vZGU7XG4gIGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQ7XG4gIG1vbm86IGJvb2xlYW47IC8vIFRyYWNrIHRoZSBjdXJyZW50IG1vbm8gc2V0dGluZyBmb3IgdGhpcyBlbGVtZW50XG4gIGN1cnJlbnRTcmM6IHN0cmluZzsgLy8gVHJhY2sgdGhlIHNyYyB0aGF0IHRoZSBzb3VyY2Ugbm9kZSB3YXMgY3JlYXRlZCB3aXRoXG59XG5cbmV4cG9ydCBjbGFzcyBBdWRpb1Byb2Nlc3NvciB7XG4gIGF1ZGlvQ29udGV4dDogQXVkaW9Db250ZXh0IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgYXVkaW9FbGVtZW50TWFwID0gbmV3IE1hcDxIVE1MTWVkaWFFbGVtZW50LCBBdWRpb05vZGVzPigpO1xuXG4gIGFzeW5jIHNldHVwQXVkaW9Db250ZXh0KFxuICAgIG1lZGlhRWxlbWVudDogSFRNTE1lZGlhRWxlbWVudCxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5nc1xuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIFwiQXVkaW9Qcm9jZXNzb3I6IFNldHRpbmcgdXAgYXVkaW8gY29udGV4dCB3aXRoIHNldHRpbmdzOlwiLFxuICAgICAgICBzZXR0aW5nc1xuICAgICAgKTtcblxuICAgICAgLy8gQ2hlY2sgaWYgdGhlIG1lZGlhIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgdXNlZCBhcyBhbiBhdWRpbyBzb3VyY2VcbiAgICAgIC8vIEhUTUxNZWRpYUVsZW1lbnQuSEFWRV9NRVRBREFUQSAoMSkgbWVhbnMgZW5vdWdoIGRhdGEgaXMgYXZhaWxhYmxlIHRoYXQgdGhlIGR1cmF0aW9uIG9mIHRoZSByZXNvdXJjZSBpcyBhdmFpbGFibGUuXG4gICAgICAvLyBjcmVhdGVNZWRpYUVsZW1lbnRTb3VyY2UgdHlwaWNhbGx5IHJlcXVpcmVzIGF0IGxlYXN0IEhBVkVfTUVUQURBVEEuXG4gICAgICBpZiAobWVkaWFFbGVtZW50LnJlYWR5U3RhdGUgPCBIVE1MTWVkaWFFbGVtZW50LkhBVkVfTUVUQURBVEEpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBBdWRpb1Byb2Nlc3NvcjogTWVkaWEgZWxlbWVudCAke21lZGlhRWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwifSBpcyBub3QgcmVhZHkgKHJlYWR5U3RhdGU6ICR7bWVkaWFFbGVtZW50LnJlYWR5U3RhdGV9KS4gRGVmZXJyaW5nIGF1ZGlvIGNvbnRleHQgc2V0dXAuYFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47IC8vIERlZmVyIHByb2Nlc3NpbmcgdW50aWwgdGhlIGVsZW1lbnQgaXMgcmVhZHlcbiAgICAgIH1cblxuICAgICAgLy8gSW5pdGlhbGl6ZSBhdWRpbyBjb250ZXh0IGlmIG5lZWRlZFxuICAgICAgaWYgKCF0aGlzLmF1ZGlvQ29udGV4dCkge1xuICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dCA9IG5ldyBBdWRpb0NvbnRleHQoKTtcbiAgICAgICAgLy8gUmVzdW1lIHdpbGwgYmUgY2FsbGVkIGxhdGVyIGFmdGVyIGEgdXNlciBnZXN0dXJlXG4gICAgICB9XG5cbiAgICAgIGxldCBub2RlcyA9IHRoaXMuYXVkaW9FbGVtZW50TWFwLmdldChtZWRpYUVsZW1lbnQpO1xuXG4gICAgICBpZiAobm9kZXMpIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gUmV1c2luZyBleGlzdGluZyBhdWRpbyBub2RlcyBmb3IgZWxlbWVudDogJHtcbiAgICAgICAgICAgIG1lZGlhRWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgfWBcbiAgICAgICAgKTtcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIG1lZGlhIHNvdXJjZSBoYXMgY2hhbmdlZCBPUiBpZiB0aGUgc291cmNlIG5vZGUgaXMgc29tZWhvdyBudWxsXG4gICAgICAgIC8vIFVzZSBjdXJyZW50U3JjIGluc3RlYWQgb2Ygc3JjIHRvIGhhbmRsZSBibG9iL0hMUyBVUkxzIGNvcnJlY3RseVxuICAgICAgICBsZXQgc291cmNlQ2hhbmdlZCA9IGZhbHNlO1xuICAgICAgICBpZiAodGhpcy5hdWRpb0NvbnRleHQgJiYgKG5vZGVzLmN1cnJlbnRTcmMgIT09IG1lZGlhRWxlbWVudC5jdXJyZW50U3JjIHx8ICFub2Rlcy5zb3VyY2UpKSB7XG4gICAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBNZWRpYSBzb3VyY2UgY2hhbmdlZCBmcm9tICR7XG4gICAgICAgICAgICAgIG5vZGVzLmN1cnJlbnRTcmNcbiAgICAgICAgICAgIH0gdG8gJHttZWRpYUVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIn0gb3Igc291cmNlIGludmFsaWQuIFJlY3JlYXRpbmcgc291cmNlIG5vZGUuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKG5vZGVzLnNvdXJjZSkge1xuICAgICAgICAgICAgLy8gSWYgb2xkIHNvdXJjZSBleGlzdHMsIGRpc2Nvbm5lY3QgaXQgZnVsbHlcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIG5vZGVzLnNvdXJjZS5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIC8qIElnbm9yZSBkaXNjb25uZWN0IGVycm9ycyBpZiBhbHJlYWR5IGRpc2Nvbm5lY3RlZCBvciBpbnZhbGlkICovXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIG5vZGVzLnNvdXJjZSA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZU1lZGlhRWxlbWVudFNvdXJjZShtZWRpYUVsZW1lbnQpO1xuICAgICAgICAgIG5vZGVzLmN1cnJlbnRTcmMgPSBtZWRpYUVsZW1lbnQuY3VycmVudFNyYztcbiAgICAgICAgICBzb3VyY2VDaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE9ubHkgcmVjb25uZWN0IHRoZSBncmFwaCB0b3BvbG9neSBpZiBtb25vIHNldHRpbmcgY2hhbmdlZCBvciBzb3VyY2UgY2hhbmdlZC5cbiAgICAgICAgLy8gUmVjb25uZWN0aW5nIG9uIGV2ZXJ5IHBhcmFtZXRlciBjaGFuZ2UgY2F1c2VzIGF1ZGlibGUgY2xpY2tzL3BvcHMuXG4gICAgICAgIGNvbnN0IG1vbm9DaGFuZ2VkID0gbm9kZXMubW9ubyAhPT0gc2V0dGluZ3MubW9ubztcbiAgICAgICAgaWYgKHNvdXJjZUNoYW5nZWQgfHwgbW9ub0NoYW5nZWQpIHtcbiAgICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICAgIGBbQXVkaW9Qcm9jZXNzb3JdIEdyYXBoIHRvcG9sb2d5IGNoYW5nZWQgKHNvdXJjZUNoYW5nZWQ9JHtzb3VyY2VDaGFuZ2VkfSwgbW9ub0NoYW5nZWQ9JHttb25vQ2hhbmdlZH0pLiBSZWNvbm5lY3Rpbmcgbm9kZXMuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5jb25uZWN0Tm9kZXMobm9kZXMsIHNldHRpbmdzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBKdXN0IHVwZGF0ZSBwYXJhbWV0ZXIgdmFsdWVzIHdpdGhvdXQgZGlzY29ubmVjdGluZy9yZWNvbm5lY3RpbmdcbiAgICAgICAgICBhd2FpdCB0aGlzLnVwZGF0ZU5vZGVTZXR0aW5ncyhub2Rlcywgc2V0dGluZ3MpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBDcmVhdGluZyBuZXcgYXVkaW8gbm9kZXMgZm9yIGVsZW1lbnQ6ICR7XG4gICAgICAgICAgICBtZWRpYUVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgICAgIH1gXG4gICAgICAgICk7XG4gICAgICAgIC8vIENyZWF0ZSBhbmQgY29uZmlndXJlIG5ldyBub2Rlc1xuICAgICAgICAvLyBjcmVhdGVBdWRpb05vZGVzIGNhbGxzIGNvbm5lY3ROb2RlcyBpbnRlcm5hbGx5LCB3aGljaCB3aWxsIGJ1aWxkIHRoZSBncmFwaC5cbiAgICAgICAgbm9kZXMgPSBhd2FpdCB0aGlzLmNyZWF0ZUF1ZGlvTm9kZXMobWVkaWFFbGVtZW50LCBzZXR0aW5ncyk7XG4gICAgICAgIHRoaXMuYXVkaW9FbGVtZW50TWFwLnNldChtZWRpYUVsZW1lbnQsIG5vZGVzKTtcbiAgICAgICAgLy8gTm8gbmVlZCB0byBjYWxsIGNvbm5lY3ROb2RlcyBhZ2FpbiBoZXJlLCBhcyBjcmVhdGVBdWRpb05vZGVzIGRvZXMgaXQuXG4gICAgICB9XG5cbiAgICAgIGRlYnVnTG9nKFwiQXVkaW9Qcm9jZXNzb3I6IFNldHVwIGNvbXBsZXRlIGZvcjpcIiwgbWVkaWFFbGVtZW50LnNyYyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJBdWRpb1Byb2Nlc3NvcjogU2V0dXAgZmFpbGVkOlwiLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNyZWF0ZUF1ZGlvTm9kZXMoXG4gICAgbWVkaWFFbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50LFxuICAgIHNldHRpbmdzOiBBdWRpb1NldHRpbmdzXG4gICk6IFByb21pc2U8QXVkaW9Ob2Rlcz4ge1xuICAgIGlmICghdGhpcy5hdWRpb0NvbnRleHQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkF1ZGlvQ29udGV4dCBub3QgaW5pdGlhbGl6ZWRcIik7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIG5vZGVzXG4gICAgY29uc3Qgc291cmNlID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlTWVkaWFFbGVtZW50U291cmNlKG1lZGlhRWxlbWVudCk7XG4gICAgY29uc3QgZ2FpbiA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKTtcbiAgICBjb25zdCBiYXNzRmlsdGVyID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XG4gICAgY29uc3Qgdm9pY2VGaWx0ZXIgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCaXF1YWRGaWx0ZXIoKTtcbiAgICBjb25zdCBzcGxpdHRlciA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUNoYW5uZWxTcGxpdHRlcigyKTtcbiAgICBjb25zdCBtZXJnZXIgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVDaGFubmVsTWVyZ2VyKDIpO1xuXG4gICAgLy8gQ29uZmlndXJlIGZpbHRlcnNcbiAgICBiYXNzRmlsdGVyLnR5cGUgPSBcImxvd3NoZWxmXCI7XG4gICAgYmFzc0ZpbHRlci5mcmVxdWVuY3kudmFsdWUgPSAxMDA7XG4gICAgdm9pY2VGaWx0ZXIudHlwZSA9IFwicGVha2luZ1wiO1xuICAgIHZvaWNlRmlsdGVyLmZyZXF1ZW5jeS52YWx1ZSA9IDIwMDA7XG4gICAgdm9pY2VGaWx0ZXIuUS52YWx1ZSA9IDE7XG5cbiAgICBjb25zdCBub2RlczogQXVkaW9Ob2RlcyA9IHtcbiAgICAgIGNvbnRleHQ6IHRoaXMuYXVkaW9Db250ZXh0LFxuICAgICAgc291cmNlLFxuICAgICAgZ2FpbixcbiAgICAgIGJhc3NGaWx0ZXIsXG4gICAgICB2b2ljZUZpbHRlcixcbiAgICAgIHNwbGl0dGVyLFxuICAgICAgbWVyZ2VyLFxuICAgICAgZWxlbWVudDogbWVkaWFFbGVtZW50LFxuICAgICAgbW9ubzogc2V0dGluZ3MubW9ubywgLy8gSW5pdGlhbGl6ZSBtb25vIHNldHRpbmcsIGNvbm5lY3ROb2RlcyB3aWxsIHVzZSBzZXR0aW5ncy5tb25vXG4gICAgICBjdXJyZW50U3JjOiBtZWRpYUVsZW1lbnQuY3VycmVudFNyYywgLy8gSW5pdGlhbGl6ZSBjdXJyZW50U3JjXG4gICAgfTtcblxuICAgIC8vIENvbm5lY3Qgbm9kZXMgYmFzZWQgb24gc2V0dGluZ3NcbiAgICBhd2FpdCB0aGlzLmNvbm5lY3ROb2Rlcyhub2Rlcywgc2V0dGluZ3MpO1xuXG4gICAgcmV0dXJuIG5vZGVzO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGRhdGVOb2RlU2V0dGluZ3MoXG4gICAgbm9kZXM6IEF1ZGlvTm9kZXMsXG4gICAgc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3NcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgeyBnYWluLCBiYXNzRmlsdGVyLCB2b2ljZUZpbHRlciwgY29udGV4dCwgZWxlbWVudCB9ID0gbm9kZXM7IC8vIEFkZGVkIGVsZW1lbnRcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBzYWZlVGltZVZhbHVlID0gaXNGaW5pdGUoY29udGV4dC5jdXJyZW50VGltZSlcbiAgICAgICAgPyBjb250ZXh0LmN1cnJlbnRUaW1lXG4gICAgICAgIDogMDtcblxuICAgICAgLy8gRGV0ZXJtaW5lIHRhcmdldCB2b2x1bWUgZm9yIGVsZW1lbnQgYW5kIGdhaW4gbm9kZVxuICAgICAgbGV0IGVsZW1lbnRWb2x1bWUgPSAxLjA7IC8vIERlZmF1bHQgdG8gbWF4IGZvciBlbGVtZW50XG4gICAgICBsZXQgZ2Fpbk5vZGVWb2x1bWUgPSAxLjA7IC8vIERlZmF1bHQgZ2FpblxuXG4gICAgICBpZiAoc2V0dGluZ3Mudm9sdW1lIDw9IDEwMCkge1xuICAgICAgICAvLyBJZiB2b2x1bWUgaXMgMTAwJSBvciBsZXNzLCBjb250cm9sIHZpYSBlbGVtZW50LnZvbHVtZVxuICAgICAgICBlbGVtZW50Vm9sdW1lID0gTWF0aC5tYXgoMCwgc2V0dGluZ3Mudm9sdW1lKSAvIDEwMDtcbiAgICAgICAgZ2Fpbk5vZGVWb2x1bWUgPSAxLjA7IC8vIEtlZXAgR2Fpbk5vZGUgbmV1dHJhbFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSWYgdm9sdW1lIGlzID4gMTAwJSwgc2V0IGVsZW1lbnQgdm9sdW1lIHRvIG1heCBhbmQgdXNlIEdhaW5Ob2RlIGZvciBib29zdFxuICAgICAgICBlbGVtZW50Vm9sdW1lID0gMS4wO1xuICAgICAgICBnYWluTm9kZVZvbHVtZSA9IE1hdGgubWF4KDEsIE1hdGgubWluKHNldHRpbmdzLnZvbHVtZSwgMTAwMCkpIC8gMTAwOyAvLyBBcHBseSBib29zdCB2aWEgR2Fpbk5vZGVcbiAgICAgIH1cblxuICAgICAgLy8gQXBwbHkgZWxlbWVudCB2b2x1bWUgaW1tZWRpYXRlbHkgKGRvZXMgbm90IHJlcXVpcmUgdXNlciBnZXN0dXJlKVxuICAgICAgaWYgKGlzRmluaXRlKGVsZW1lbnRWb2x1bWUpKSB7XG4gICAgICAgIGVsZW1lbnQudm9sdW1lID0gZWxlbWVudFZvbHVtZTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2xhbXAgdmFsdWVzIGZvciBmaWx0ZXJzXG4gICAgICBjb25zdCBjbGFtcGVkQmFzcyA9IE1hdGgubWF4KFxuICAgICAgICAtMTUsXG4gICAgICAgIE1hdGgubWluKCgoc2V0dGluZ3MuYmFzc0Jvb3N0IC0gMTAwKSAvIDEwMCkgKiAxNSwgMTUpXG4gICAgICApO1xuICAgICAgY29uc3QgY2xhbXBlZFZvaWNlID0gTWF0aC5tYXgoXG4gICAgICAgIC0yNCxcbiAgICAgICAgTWF0aC5taW4oKChzZXR0aW5ncy52b2ljZUJvb3N0IC0gMTAwKSAvIDEwMCkgKiAyNCwgMjQpXG4gICAgICApO1xuXG4gICAgICAvLyBVcGRhdGUgV2ViIEF1ZGlvIEFQSSBwYXJhbWV0ZXJzIHVzaW5nIHNldFRhcmdldEF0VGltZSBmb3IgcG90ZW50aWFsbHkgbW9yZSByb2J1c3QgYXBwbGljYXRpb25cbiAgICAgIGNvbnN0IHRpbWVDb25zdGFudCA9IDAuMDE7IC8vIEFwcGx5IHF1aWNrbHlcbiAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gY29udGV4dC5jdXJyZW50VGltZTsgLy8gVXNlIGN1cnJlbnQgY29udGV4dCB0aW1lIGFzIHN0YXJ0IHRpbWVcblxuICAgICAgLy8gU2V0IGltbWVkaWF0ZSB2YWx1ZVxuICAgICAgZ2Fpbi5nYWluLnZhbHVlID0gZ2Fpbk5vZGVWb2x1bWU7XG5cbiAgICAgIGJhc3NGaWx0ZXIuZ2Fpbi52YWx1ZSA9IGNsYW1wZWRCYXNzO1xuXG4gICAgICB2b2ljZUZpbHRlci5nYWluLnZhbHVlID0gY2xhbXBlZFZvaWNlO1xuXG4gICAgICAvLyBBRERFRCBMT0dTOiBMb2cgdGhlIHZhbHVlcyBiZWluZyBhcHBsaWVkIHRvIHRoZSBub2Rlc1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIGBbQXVkaW9Qcm9jZXNzb3JdIEFwcGx5aW5nIE5vZGUgU2V0dGluZ3MgKGltbWVkaWF0ZSArIHNldFRhcmdldEF0VGltZSkgYXQgJHtjdXJyZW50VGltZX06YCxcbiAgICAgICAge1xuICAgICAgICAgIGVsZW1lbnRWb2x1bWU6IGVsZW1lbnQudm9sdW1lLCAvLyBMb2cgdGhlIGRpcmVjdGx5IHNldCBlbGVtZW50IHZvbHVtZVxuICAgICAgICAgIHRhcmdldEdhaW5Ob2RlVm9sdW1lOiBnYWluTm9kZVZvbHVtZSwgLy8gTG9nIHRhcmdldCB2YWx1ZXNcbiAgICAgICAgICB0YXJnZXRCYXNzR2FpbjogY2xhbXBlZEJhc3MsXG4gICAgICAgICAgdGFyZ2V0Vm9pY2VHYWluOiBjbGFtcGVkVm9pY2UsXG4gICAgICAgICAgdm9pY2VHYWluOiBjbGFtcGVkVm9pY2UsXG4gICAgICAgICAgbW9ubzogc2V0dGluZ3MubW9ubywgLy8gTG9nIG1vbm8gc2V0dGluZyBhcyBpdCBhZmZlY3RzIGNvbm5lY3Rpb25zXG4gICAgICAgIH1cbiAgICAgICk7XG5cbiAgICAgIC8vIGRlYnVnTG9nKFwiQXVkaW9Qcm9jZXNzb3I6IFNldHRpbmdzIHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5XCIsIHsgLy8gUmVkdWNlZCBsb2dnaW5nXG4gICAgICAvLyAgIHZvbHVtZTogY2xhbXBlZFZvbHVtZSxcbiAgICAgIC8vICAgYmFzczogY2xhbXBlZEJhc3MsXG4gICAgICAvLyAgIHZvaWNlOiBjbGFtcGVkVm9pY2UsXG4gICAgICAvLyAgIG1vbm86IHNldHRpbmdzLm1vbm8sXG4gICAgICAvLyB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkF1ZGlvUHJvY2Vzc29yOiBGYWlsZWQgdG8gdXBkYXRlIHNldHRpbmdzOlwiLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbm5lY3ROb2RlcyhcbiAgICBub2RlczogQXVkaW9Ob2RlcyxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5nc1xuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCB7IHNvdXJjZSwgYmFzc0ZpbHRlciwgdm9pY2VGaWx0ZXIsIGdhaW4sIHNwbGl0dGVyLCBtZXJnZXIsIGNvbnRleHQsIGVsZW1lbnQgfSA9XG4gICAgICBub2RlcztcblxuICAgIGRlYnVnTG9nKFxuICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gQ29ubmVjdGluZy9SZWNvbm5lY3Rpbmcgbm9kZXMgZm9yICR7XG4gICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgfS4gVGFyZ2V0IE1vbm86ICR7c2V0dGluZ3MubW9ub30sIEN1cnJlbnQgTm9kZSBNb25vOiAke25vZGVzLm1vbm99YFxuICAgICk7XG5cbiAgICAvLyBMb2cgdGhlIGN1cnJlbnQgbW9ubyBzdGF0ZSBiZWZvcmUgcG90ZW50aWFsIGNoYW5nZVxuICAgIGRlYnVnTG9nKFxuICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gY29ubmVjdE5vZGVzOiBDdXJyZW50IG1vbm8gc3RhdGUgZm9yIGVsZW1lbnQ6ICR7bm9kZXMubW9ub30sIFRhcmdldCBtb25vIHN0YXRlOiAke3NldHRpbmdzLm1vbm99YFxuICAgICk7XG5cbiAgICAvLyBEaXNjb25uZWN0IGFsbCBub2RlcyBmcm9tIHRoZWlyIG91dHB1dHMgdG8gZW5zdXJlIGEgY2xlYW4gc2xhdGUgYmVmb3JlIHJlLWNvbm5lY3RpbmcuXG4gICAgLy8gSXQncyBjcnVjaWFsIHRvIGRpc2Nvbm5lY3QgdGhlIHNvdXJjZSBmaXJzdCBmcm9tIGl0cyBwcmV2aW91cyBjb25uZWN0aW9ucyxcbiAgICAvLyB0aGVuIG90aGVyIG5vZGVzIGluIGFueSBvcmRlciwgYXMgbG9uZyBhcyB0aGV5IGFyZSBkaXNjb25uZWN0ZWQgZnJvbSB0aGVpciBvdXRwdXRzLlxuICAgIGNvbnN0IHNhZmVEaXNjb25uZWN0ID0gKG5vZGU6IEF1ZGlvTm9kZSB8IG51bGwpID0+IHtcbiAgICAgIGlmIChub2RlKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgLy8gRGlzY29ubmVjdCBhbGwgY29ubmVjdGlvbnMgZnJvbSB0aGlzIG5vZGVcbiAgICAgICAgICBub2RlLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIGNvbnNvbGUud2FybihgW0F1ZGlvUHJvY2Vzc29yXSBFcnJvciBkaXNjb25uZWN0aW5nIG5vZGU6YCwgZSk7IC8vIE9wdGlvbmFsOiBmb3IgZGVidWdnaW5nXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gRGlzY29ubmVjdCBhbGwgbm9kZXMgZnJvbSB0aGVpciBvdXRwdXRzLiBPcmRlciBtYXR0ZXJzIGZvciBwcmV2ZW50aW5nIGVycm9ycyxcbiAgICAvLyBidXQgbGVzcyBzbyBpZiB3ZSBkaXNjb25uZWN0IGFsbCBvdXRwdXRzIGZyb20gYSBub2RlLlxuICAgIC8vIERpc2Nvbm5lY3Rpbmcgc291cmNlIGZpcnN0IGVuc3VyZXMgaXQncyBub3QgY29ubmVjdGVkIHRvIGEgc3RhbGUgZ3JhcGguXG4gICAgc2FmZURpc2Nvbm5lY3Qoc291cmNlKTtcbiAgICBzYWZlRGlzY29ubmVjdChiYXNzRmlsdGVyKTtcbiAgICBzYWZlRGlzY29ubmVjdCh2b2ljZUZpbHRlcik7XG4gICAgc2FmZURpc2Nvbm5lY3Qoc3BsaXR0ZXIpO1xuICAgIHNhZmVEaXNjb25uZWN0KG1lcmdlcik7XG4gICAgc2FmZURpc2Nvbm5lY3QoZ2Fpbik7XG5cbiAgICAvLyBFbnN1cmUgc291cmNlIGlzIHZhbGlkIGJlZm9yZSBwcm9jZWVkaW5nXG4gICAgaWYgKCFzb3VyY2UpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIFwiW0F1ZGlvUHJvY2Vzc29yXSBTb3VyY2Ugbm9kZSBpcyBudWxsIGluIGNvbm5lY3ROb2Rlcy4gQ2Fubm90IGNvbm5lY3QgZ3JhcGguXCJcbiAgICAgICk7XG4gICAgICAvLyBBdHRlbXB0IHRvIGFwcGx5IHNldHRpbmdzIHRvIGF2b2lkIGZ1cnRoZXIgZXJyb3JzLCB0aG91Z2ggZ3JhcGggaXMgYnJva2VuLlxuICAgICAgYXdhaXQgdGhpcy51cGRhdGVOb2RlU2V0dGluZ3Mobm9kZXMsIHNldHRpbmdzKTtcbiAgICAgIHJldHVybjsgLy8gQ2Fubm90IHByb2NlZWQgd2l0aCBjb25uZWN0aW9uc1xuICAgIH1cblxuXG4gICAgLy8gQ3JlYXRlIG5ldyBjb25uZWN0aW9ucyBiYXNlZCBvbiBjdXJyZW50IHNldHRpbmdzXG4gICAgaWYgKHNldHRpbmdzLm1vbm8pIHtcbiAgICAgIHNvdXJjZS5jb25uZWN0KGJhc3NGaWx0ZXIpO1xuICAgICAgYmFzc0ZpbHRlci5jb25uZWN0KHZvaWNlRmlsdGVyKTtcbiAgICAgIHZvaWNlRmlsdGVyLmNvbm5lY3Qoc3BsaXR0ZXIpO1xuICAgICAgc3BsaXR0ZXIuY29ubmVjdChtZXJnZXIsIDAsIDApOyAvLyBDb25uZWN0IGxlZnQgY2hhbm5lbCBvZiBzcGxpdHRlciB0byBsZWZ0IGlucHV0IG9mIG1lcmdlclxuICAgICAgc3BsaXR0ZXIuY29ubmVjdChtZXJnZXIsIDAsIDEpOyAvLyBDb25uZWN0IGxlZnQgY2hhbm5lbCBvZiBzcGxpdHRlciB0byByaWdodCBpbnB1dCBvZiBtZXJnZXIgKG1vbm8pXG4gICAgICBtZXJnZXIuY29ubmVjdChnYWluKTtcbiAgICB9IGVsc2UgeyAvLyBTdGVyZW9cbiAgICAgIHNvdXJjZS5jb25uZWN0KGJhc3NGaWx0ZXIpO1xuICAgICAgYmFzc0ZpbHRlci5jb25uZWN0KHZvaWNlRmlsdGVyKTtcbiAgICAgIHZvaWNlRmlsdGVyLmNvbm5lY3QoZ2Fpbik7XG4gICAgfVxuICAgIGdhaW4uY29ubmVjdChjb250ZXh0LmRlc3RpbmF0aW9uKTtcblxuICAgIC8vIFVwZGF0ZSB0aGUgc3RvcmVkIG1vbm8gc2V0dGluZyBmb3IgdGhpcyBlbGVtZW50IHRvIHJlZmxlY3QgdGhlIGFwcGxpZWQgc2V0dGluZ1xuICAgIG5vZGVzLm1vbm8gPSBzZXR0aW5ncy5tb25vO1xuXG4gICAgLy8gQWx3YXlzIGFwcGx5L3VwZGF0ZSBvdGhlciBhdWRpbyBwYXJhbWV0ZXJzXG4gICAgYXdhaXQgdGhpcy51cGRhdGVOb2RlU2V0dGluZ3Mobm9kZXMsIHNldHRpbmdzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEaXNjb25uZWN0cyBhdWRpbyBub2RlcyBmb3IgYSBzcGVjaWZpYyBlbGVtZW50IGFuZCByZW1vdmVzIGl0IGZyb20gdGhlIG1hcC5cbiAgICogQHBhcmFtIGVsZW1lbnQgVGhlIEhUTUxNZWRpYUVsZW1lbnQgdG8gZGlzY29ubmVjdC5cbiAgICogQHJldHVybnMgVHJ1ZSBpZiBub2RlcyB3ZXJlIGZvdW5kIGFuZCBkaXNjb25uZWN0ZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAgICovXG4gIHB1YmxpYyBkaXNjb25uZWN0RWxlbWVudE5vZGVzKGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQpOiBib29sZWFuIHtcbiAgICBjb25zdCBub2RlcyA9IHRoaXMuYXVkaW9FbGVtZW50TWFwLmdldChlbGVtZW50KTtcbiAgICBpZiAoIW5vZGVzKSByZXR1cm4gZmFsc2U7XG5cbiAgICBkZWJ1Z0xvZyhcbiAgICAgIGBbQXVkaW9Qcm9jZXNzb3JdIERpc2Nvbm5lY3Rpbmcgbm9kZXMgZm9yIGVsZW1lbnQ6ICR7XG4gICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgfWBcbiAgICApOyAvLyBBRERFRCBMT0dcblxuICAgIHRyeSB7XG4gICAgICAvLyBTYWZlbHkgZGlzY29ubmVjdCBlYWNoIG5vZGVcbiAgICAgIGNvbnN0IHNhZmVEaXNjb25uZWN0ID0gKG5vZGU6IEF1ZGlvTm9kZSkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIG5vZGUuZGlzY29ubmVjdCgpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gSWdub3JlIGRpc2Nvbm5lY3QgZXJyb3JzXG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIHNhZmVEaXNjb25uZWN0KG5vZGVzLmdhaW4pO1xuICAgICAgc2FmZURpc2Nvbm5lY3Qobm9kZXMudm9pY2VGaWx0ZXIpO1xuICAgICAgc2FmZURpc2Nvbm5lY3Qobm9kZXMuYmFzc0ZpbHRlcik7XG4gICAgICBzYWZlRGlzY29ubmVjdChub2Rlcy5zcGxpdHRlcik7XG4gICAgICBzYWZlRGlzY29ubmVjdChub2Rlcy5tZXJnZXIpO1xuICAgICAgc2FmZURpc2Nvbm5lY3Qobm9kZXMuc291cmNlKTtcblxuICAgICAgLy8gRXhwbGljaXRseSBudWxsaWZ5IHJlZmVyZW5jZXMgdG8gaGVscCBnYXJiYWdlIGNvbGxlY3Rpb25cbiAgICAgIC8vIENhc3QgdG8gYW55IHNpbmNlIHdlJ3JlIGludGVudGlvbmFsbHkgZGVzdHJveWluZyB0aGVzZSBub2Rlc1xuICAgICAgKG5vZGVzIGFzIGFueSkuc291cmNlID0gbnVsbDtcbiAgICAgIChub2RlcyBhcyBhbnkpLmdhaW4gPSBudWxsO1xuICAgICAgKG5vZGVzIGFzIGFueSkuYmFzc0ZpbHRlciA9IG51bGw7XG4gICAgICAobm9kZXMgYXMgYW55KS52b2ljZUZpbHRlciA9IG51bGw7XG4gICAgICAobm9kZXMgYXMgYW55KS5zcGxpdHRlciA9IG51bGw7XG4gICAgICAobm9kZXMgYXMgYW55KS5tZXJnZXIgPSBudWxsO1xuICAgICAgLy8gRG8gbm90IG51bGxpZnkgY29udGV4dCBvciBlbGVtZW50IGFzIHRoZXkgYXJlIG1hbmFnZWQgZWxzZXdoZXJlXG5cbiAgICAgIHRoaXMuYXVkaW9FbGVtZW50TWFwLmRlbGV0ZShlbGVtZW50KTtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBJbmRpY2F0ZSBzdWNjZXNzXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIGBBdWRpb1Byb2Nlc3NvcjogRXJyb3IgZGlzY29ubmVjdGluZyBub2RlcyBmb3IgJHtcbiAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgfTpgLFxuICAgICAgICBlcnJvclxuICAgICAgKTtcbiAgICAgIC8vIEF0dGVtcHQgdG8gcmVtb3ZlIGZyb20gbWFwIGV2ZW4gaWYgZGlzY29ubmVjdCBmYWlsZWQgcGFydGlhbGx5XG4gICAgICB0aGlzLmF1ZGlvRWxlbWVudE1hcC5kZWxldGUoZWxlbWVudCk7XG4gICAgICByZXR1cm4gZmFsc2U7IC8vIEluZGljYXRlIGZhaWx1cmVcbiAgICB9XG4gIH1cblxuICBhc3luYyB1cGRhdGVBdWRpb0VmZmVjdHMoc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIFwiW0F1ZGlvUHJvY2Vzc29yXSBVcGRhdGluZyBhdWRpbyBlZmZlY3RzIHdpdGggc2V0dGluZ3M6XCIsXG4gICAgICBKU09OLnN0cmluZ2lmeShzZXR0aW5ncylcbiAgICApO1xuXG4gICAgZm9yIChjb25zdCBbZWxlbWVudCwgbm9kZXNdIG9mIHRoaXMuYXVkaW9FbGVtZW50TWFwLmVudHJpZXMoKSkge1xuICAgICAgLy8gQ2hlY2sgaWYgdGhlIGVsZW1lbnQgaXMgc3RpbGwgY29ubmVjdGVkIHRvIHRoZSBET00gYmVmb3JlIHByb2Nlc3NpbmdcbiAgICAgIGlmICghZWxlbWVudC5pc0Nvbm5lY3RlZCkge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBFbGVtZW50ICR7XG4gICAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgICB9IGlzIG5vIGxvbmdlciBjb25uZWN0ZWQgdG8gRE9NLiBEaXNjb25uZWN0aW5nIGFuZCByZW1vdmluZy5gXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGlzY29ubmVjdEVsZW1lbnROb2RlcyhlbGVtZW50KTsgLy8gQ2xlYW4gdXAgZGlzY29ubmVjdGVkIGVsZW1lbnRzXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBDYWxsIHNldHVwQXVkaW9Db250ZXh0LCB3aGljaCBub3cgaGFuZGxlcyByZXVzaW5nIGV4aXN0aW5nIG5vZGVzIGFuZCByZWNvbm5lY3RpbmcgdGhlbVxuICAgICAgICBhd2FpdCB0aGlzLnNldHVwQXVkaW9Db250ZXh0KGVsZW1lbnQsIHNldHRpbmdzKTtcblxuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBVcGRhdGVkIHNldHRpbmdzIGZvciBlbGVtZW50OiAke1xuICAgICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgfS5gXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgIFwiQXVkaW9Qcm9jZXNzb3I6IFVwZGF0ZSBmYWlsZWQgZm9yIGVsZW1lbnQ6XCIsXG4gICAgICAgICAgZWxlbWVudC5zcmMsXG4gICAgICAgICAgZXJyb3JcbiAgICAgICAgKTtcbiAgICAgICAgLy8gSWYgdXBkYXRlIGZhaWxzLCBkbyBOT1QgZGlzY29ubmVjdCB0aGUgZWxlbWVudCBub2RlcywgYXMgdGhleSBzaG91bGQgcmVtYWluIHJldXNhYmxlLlxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlc2V0QWxsVG9EaXNhYmxlZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAvLyBSZXNldCBhbGwgYXVkaW8gY29udGV4dHMgYW5kIGRpc2Nvbm5lY3Qgbm9kZXNcbiAgICB0aGlzLmF1ZGlvRWxlbWVudE1hcC5mb3JFYWNoKChub2RlcywgZWxlbWVudCkgPT4ge1xuICAgICAgdGhpcy5kaXNjb25uZWN0RWxlbWVudE5vZGVzKGVsZW1lbnQpO1xuICAgICAgLy8gRG9uJ3QgY2xvc2UgY29udGV4dCBoZXJlLCBsZXQgY2xlYW51cCBoYW5kbGUgaXQgb3IgcmV1c2UgaXRcbiAgICAgIC8vIG5vZGVzLmNvbnRleHQuY2xvc2UoKTtcbiAgICB9KTtcbiAgICB0aGlzLmF1ZGlvRWxlbWVudE1hcC5jbGVhcigpO1xuICB9XG5cbiAgaGFzUHJvY2Vzc2luZyhtZWRpYUVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5hdWRpb0VsZW1lbnRNYXAuaGFzKG1lZGlhRWxlbWVudCk7XG4gIH1cblxuICBjbGVhbnVwKCk6IHZvaWQge1xuICAgIHRoaXMuYXVkaW9FbGVtZW50TWFwLmNsZWFyKCk7XG4gICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0KSB7XG4gICAgICB0aGlzLmF1ZGlvQ29udGV4dC5jbG9zZSgpO1xuICAgICAgdGhpcy5hdWRpb0NvbnRleHQgPSBudWxsO1xuICAgIH1cbiAgICBkZWJ1Z0xvZyhcIkF1ZGlvUHJvY2Vzc29yOiBDbGVhbnVwIGNvbXBsZXRlZFwiKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBdHRlbXB0cyB0byByZXN1bWUgdGhlIEF1ZGlvQ29udGV4dCBpZiBpdCdzIHN1c3BlbmRlZC5cbiAgICogU2hvdWxkIGJlIGNhbGxlZCBhZnRlciBhIHVzZXIgZ2VzdHVyZS5cbiAgICovXG4gIGFzeW5jIHRyeVJlc3VtZUNvbnRleHQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0ICYmIHRoaXMuYXVkaW9Db250ZXh0LnN0YXRlID09PSBcInN1c3BlbmRlZFwiKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLmF1ZGlvQ29udGV4dC5yZXN1bWUoKTtcbiAgICAgICAgZGVidWdMb2coXCJBdWRpb1Byb2Nlc3NvcjogQXVkaW9Db250ZXh0IHJlc3VtZWQgc3VjY2Vzc2Z1bGx5LlwiKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJBdWRpb1Byb2Nlc3NvcjogRmFpbGVkIHRvIHJlc3VtZSBBdWRpb0NvbnRleHQ6XCIsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHRoaXMuYXVkaW9Db250ZXh0KSB7XG4gICAgICAvLyBkZWJ1Z0xvZyhgQXVkaW9Qcm9jZXNzb3I6IEF1ZGlvQ29udGV4dCBzdGF0ZSBpcyBhbHJlYWR5IFwiJHt0aGlzLmF1ZGlvQ29udGV4dC5zdGF0ZX1cIiwgbm8gcmVzdW1lIG5lZWRlZC5gKTsgLy8gUmVkdWNlZCBsb2dnaW5nXG4gICAgfVxuICB9XG59IC8vIEVuZCBvZiBBdWRpb1Byb2Nlc3NvciBjbGFzc1xuIiwiaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5jb25zdCBtZWRpYUNvbmZpZyA9IHtcbiAgYmFzZVNlbGVjdG9yczogW1xuICAgIFwidmlkZW9cIixcbiAgICBcImF1ZGlvXCIsXG4gICAgLy8gRXNzZW50aWFsIHBsYXllciBwYXR0ZXJuc1xuICAgIFwiW2NsYXNzKj0ncGxheWVyJ11cIixcbiAgICBcIltjbGFzcyo9J3ZpZGVvJ11cIixcbiAgICBcIltpZCo9J3BsYXllciddXCIsXG4gICAgXCJbaWQqPSd2aWRlbyddXCIsXG4gICAgLy8gQ29tbW9uIGZyYW1ld29ya3NcbiAgICBcIi52aWRlby1qc1wiLFxuICAgIFwiLmp3cGxheWVyXCIsXG4gICAgXCIuaHRtbDUtdmlkZW8tcGxheWVyXCIsXG4gICAgXCIucGx5clwiLFxuICAgIC8vIEtleSBkYXRhIGF0dHJpYnV0ZXNcbiAgICBcIltkYXRhLXBsYXllcl1cIixcbiAgICBcIltkYXRhLXZpZGVvXVwiLFxuICAgIFwiW2RhdGEtbWVkaWFdXCIsXG4gICAgLy8gS2V5IGlmcmFtZSBzb3VyY2VzXG4gICAgXCJpZnJhbWVbc3JjKj0neW91dHViZS5jb20nXVwiLFxuICAgIFwiaWZyYW1lW3NyYyo9J3ZpbWVvLmNvbSddXCIsXG4gICAgXCJpZnJhbWVbc3JjKj0nZGFpbHltb3Rpb24uY29tJ11cIixcbiAgICBcImlmcmFtZVtzcmMqPSd0d2l0Y2gudHYnXVwiXG4gIF0sXG4gIHNpdGVTZWxlY3RvcnM6IHtcbiAgICBcInlvdXR1YmUuY29tXCI6IFtcIi5odG1sNS12aWRlby1wbGF5ZXJcIl0sXG4gICAgXCJuZXRmbGl4LmNvbVwiOiBbXCJbZGF0YS11aWE9J3ZpZGVvLXBsYXllciddXCJdLFxuICAgIFwiaHVsdS5jb21cIjogW1wiLkh1bHVQbGF5ZXJcIl0sXG4gICAgXCJhbWF6b24uY29tXCI6IFtcIltkYXRhLXBsYXllcj0nQW1hem9uVmlkZW8nXVwiXSxcbiAgICBcImRpc25leXBsdXMuY29tXCI6IFtcIi5kcC12aWRlby1wbGF5ZXJcIl1cbiAgfVxufTtcblxuZXhwb3J0IGNsYXNzIE1lZGlhTWFuYWdlciB7XG4gIHByaXZhdGUgc3RhdGljIGRlYm91bmNlVGltZW91dDogTm9kZUpTLlRpbWVvdXQgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBzdGF0aWMgcHJvY2Vzc2VkRWxlbWVudHMgPSBuZXcgV2Vha1NldDxIVE1MRWxlbWVudD4oKTsgLy8gS2VlcCBmb3IgY3VzdG9tIHBsYXllciBjb250YWluZXJzXG4gIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFQk9VTkNFX0RFTEFZID0gNTAwO1xuICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfREVQVEggPSAxMDtcblxuICBwcml2YXRlIHN0YXRpYyBpc0V4dGVuc2lvbkNvbnRleHQoKTogYm9vbGVhbiB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiAoXG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gXCJjaHJvbWUtZXh0ZW5zaW9uOlwiIHx8XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gXCJtb3otZXh0ZW5zaW9uOlwiIHx8XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gXCJlZGdlLWV4dGVuc2lvbjpcIlxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLy8gT3B0aW1pemVkIHZpc2liaWxpdHkgY2hlY2tcbiAgcHJpdmF0ZSBzdGF0aWMgaXNFbGVtZW50VmlzaWJsZShlbGVtZW50OiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAhIShcbiAgICAgIGVsZW1lbnQub2Zmc2V0V2lkdGggfHxcbiAgICAgIGVsZW1lbnQub2Zmc2V0SGVpZ2h0IHx8XG4gICAgICBlbGVtZW50LmdldENsaWVudFJlY3RzKCkubGVuZ3RoXG4gICAgKTtcbiAgfVxuXG4gIC8vIFVzZSB0aGUgZnVsbCBzaXRlU2VsZWN0b3JzIGNvbmZpZ3VyYXRpb25cbiAgcHJpdmF0ZSBzdGF0aWMgZ2V0RXh0cmFTZWxlY3RvcnNGb3JTaXRlKCk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBjdXJyZW50SG9zdG5hbWUgPSB3aW5kb3cubG9jYXRpb24uaG9zdG5hbWU7XG4gICAgZm9yIChjb25zdCBzaXRlSG9zdG5hbWUgaW4gbWVkaWFDb25maWcuc2l0ZVNlbGVjdG9ycykge1xuICAgICAgLy8gRXhhY3QgbWF0Y2ggZm9yIGhvc3RuYW1lIChubyBzdWJkb21haW4gbWF0Y2hpbmcpXG4gICAgICBpZiAoY3VycmVudEhvc3RuYW1lID09PSBzaXRlSG9zdG5hbWUpIHtcbiAgICAgICAgLy8gVHlwZSBhc3NlcnRpb24gbmVlZGVkIGFzIGtleXMgYXJlIHN0cmluZ3NcbiAgICAgICAgcmV0dXJuIG1lZGlhQ29uZmlnLnNpdGVTZWxlY3RvcnNbXG4gICAgICAgICAgc2l0ZUhvc3RuYW1lIGFzIGtleW9mIHR5cGVvZiBtZWRpYUNvbmZpZy5zaXRlU2VsZWN0b3JzXG4gICAgICAgIF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBbXTsgLy8gUmV0dXJuIGVtcHR5IGFycmF5IGlmIG5vIG1hdGNoIGZvdW5kXG4gIH1cblxuICAvLyBVcGRhdGVkIGN1c3RvbSBwbGF5ZXIgZGV0ZWN0aW9uIHdpdGggZmFsbGJhY2sgZHluYW1pYyBzY2FubmluZ1xuICBwcml2YXRlIHN0YXRpYyBmaW5kQ3VzdG9tUGxheWVycyhyb290OiBQYXJlbnROb2RlKTogSFRNTEVsZW1lbnRbXSB7XG4gICAgY29uc3QgY3VzdG9tUGxheWVyczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuICAgIGNvbnN0IGJhc2VTZWxlY3RvcnMgPSBtZWRpYUNvbmZpZy5iYXNlU2VsZWN0b3JzO1xuICAgIGNvbnN0IHNpdGVTZWxlY3RvcnMgPSB0aGlzLmdldEV4dHJhU2VsZWN0b3JzRm9yU2l0ZSgpO1xuICAgIGNvbnN0IGFsbFNlbGVjdG9ycyA9IFsuLi5iYXNlU2VsZWN0b3JzLCAuLi5zaXRlU2VsZWN0b3JzXTtcbiAgICBcbiAgICAvLyBVc2UgYSBTZXQgdG8gYXZvaWQgZHVwbGljYXRlIGVsZW1lbnRzXG4gICAgY29uc3Qgc2VsZWN0b3JFbGVtZW50cyA9IG5ldyBTZXQ8RWxlbWVudD4oKTtcbiAgICBcbiAgICB0cnkge1xuICAgICAgLy8gUHJvY2VzcyBlYWNoIHNlbGVjdG9yIGluZGl2aWR1YWxseSB0byBhdm9pZCBtYXNzaXZlIGNvbWJpbmVkIHNlbGVjdG9yXG4gICAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIGFsbFNlbGVjdG9ycykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGVsZW1lbnRzID0gcm9vdC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKTtcbiAgICAgICAgICBlbGVtZW50cy5mb3JFYWNoKGVsID0+IHNlbGVjdG9yRWxlbWVudHMuYWRkKGVsKSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oYEVycm9yIHdpdGggc2VsZWN0b3IgJyR7c2VsZWN0b3J9JzpgLCBlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBQcm9jZXNzIGNvbGxlY3RlZCBlbGVtZW50c1xuICAgICAgc2VsZWN0b3JFbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50ICYmICF0aGlzLnByb2Nlc3NlZEVsZW1lbnRzLmhhcyhlbGVtZW50KSkge1xuICAgICAgICAgIHRoaXMucHJvY2Vzc2VkRWxlbWVudHMuYWRkKGVsZW1lbnQpO1xuICAgICAgICAgIGN1c3RvbVBsYXllcnMucHVzaChlbGVtZW50KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS53YXJuKFwiRXJyb3IgZmluZGluZyBjdXN0b20gcGxheWVyczpcIiwgZSk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBjdXN0b21QbGF5ZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBmaW5kTWVkaWFFbGVtZW50cyhcbiAgICByb290OiBQYXJlbnROb2RlID0gZG9jdW1lbnQsXG4gICAgZGVwdGg6IG51bWJlciA9IDBcbiAgKTogSFRNTE1lZGlhRWxlbWVudFtdIHtcbiAgICBpZiAodGhpcy5pc0V4dGVuc2lvbkNvbnRleHQoKSB8fCBkZXB0aCA+IHRoaXMuTUFYX0RFUFRIKSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuXG4gICAgY29uc3QgZWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSA9IFtdO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIERpcmVjdCBtZWRpYSBlbGVtZW50c1xuICAgICAgY29uc3QgbWVkaWFFbGVtZW50cyA9IHJvb3QucXVlcnlTZWxlY3RvckFsbChcInZpZGVvLCBhdWRpb1wiKTtcbiAgICAgIG1lZGlhRWxlbWVudHMuZm9yRWFjaCgoZWxlbWVudCkgPT4ge1xuICAgICAgICBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICAgICAgICBlbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gSGFuZGxlIFNoYWRvdyBET01cbiAgICAgIGlmIChyb290IGluc3RhbmNlb2YgRWxlbWVudCAmJiByb290LnNoYWRvd1Jvb3QpIHtcbiAgICAgICAgZWxlbWVudHMucHVzaCguLi50aGlzLmZpbmRNZWRpYUVsZW1lbnRzKHJvb3Quc2hhZG93Um9vdCwgZGVwdGggKyAxKSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEN1c3RvbSBwbGF5ZXJzIChvbmx5IGF0IHRvcCBsZXZlbClcbiAgICAgIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICBjb25zdCBjdXN0b21QbGF5ZXJzID0gdGhpcy5maW5kQ3VzdG9tUGxheWVycyhyb290KTtcbiAgICAgICAgY3VzdG9tUGxheWVycy5mb3JFYWNoKChwbGF5ZXIpID0+IHtcbiAgICAgICAgICBjb25zdCBtZWRpYUluUGxheWVyID0gcGxheWVyLnF1ZXJ5U2VsZWN0b3JBbGwoXCJ2aWRlbywgYXVkaW9cIik7XG4gICAgICAgICAgbWVkaWFJblBsYXllci5mb3JFYWNoKChlbGVtZW50KSA9PiB7XG4gICAgICAgICAgICBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgZWxlbWVudHMucHVzaChlbGVtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKCF0aGlzLmlzRXh0ZW5zaW9uQ29udGV4dCgpKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcIkVycm9yIGZpbmRpbmcgbWVkaWEgZWxlbWVudHM6XCIsIGUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQoZWxlbWVudHMpKTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgc2V0dXBNZWRpYUVsZW1lbnRPYnNlcnZlcihcbiAgICBvbkFkZGVkOiAoZWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSkgPT4gdm9pZCxcbiAgICBvblJlbW92ZWQ6IChlbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiB2b2lkXG4gICk6IE11dGF0aW9uT2JzZXJ2ZXIge1xuICAgIGNvbnN0IGRlYm91bmNlZENoZWNrID0gKCkgPT4ge1xuICAgICAgaWYgKE1lZGlhTWFuYWdlci5kZWJvdW5jZVRpbWVvdXQpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KE1lZGlhTWFuYWdlci5kZWJvdW5jZVRpbWVvdXQpO1xuICAgICAgfVxuICAgICAgTWVkaWFNYW5hZ2VyLmRlYm91bmNlVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBjb25zdCBlbGVtZW50cyA9IHRoaXMuZmluZE1lZGlhRWxlbWVudHMoKTtcbiAgICAgICAgaWYgKGVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBvbkFkZGVkKGVsZW1lbnRzKTtcbiAgICAgICAgfVxuICAgICAgfSwgTWVkaWFNYW5hZ2VyLkRFQk9VTkNFX0RFTEFZKTtcbiAgICB9O1xuXG4gICAgLy8gSW5pdGlhbCBjaGVja1xuICAgIGlmICghdGhpcy5pc0V4dGVuc2lvbkNvbnRleHQoKSkge1xuICAgICAgZGVib3VuY2VkQ2hlY2soKTtcbiAgICB9XG5cbiAgICAvLyBNdXRhdGlvbiBvYnNlcnZlciB0byBkZXRlY3QgYWRkZWQvcmVtb3ZlZCBub2Rlc1xuICAgIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKG11dGF0aW9ucykgPT4ge1xuICAgICAgY29uc3QgYWRkZWRNZWRpYUVsZW1lbnRzOiBIVE1MTWVkaWFFbGVtZW50W10gPSBbXTtcbiAgICAgIGNvbnN0IHJlbW92ZWRNZWRpYUVsZW1lbnRzOiBIVE1MTWVkaWFFbGVtZW50W10gPSBbXTtcblxuICAgICAgbXV0YXRpb25zLmZvckVhY2goKG11dGF0aW9uKSA9PiB7XG4gICAgICAgIGlmIChtdXRhdGlvbi50eXBlID09PSBcImNoaWxkTGlzdFwiKSB7XG4gICAgICAgICAgbXV0YXRpb24uYWRkZWROb2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgYWRkZWRNZWRpYUVsZW1lbnRzLnB1c2gobm9kZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgICAgICAgICAgICAvLyBDaGVjayBmb3IgbWVkaWEgZWxlbWVudHMgd2l0aGluIGFkZGVkIG5vbi1tZWRpYSBlbGVtZW50c1xuICAgICAgICAgICAgICBub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoXCJ2aWRlbywgYXVkaW9cIikuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZWwgaW5zdGFuY2VvZiBIVE1MTWVkaWFFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICBhZGRlZE1lZGlhRWxlbWVudHMucHVzaChlbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIG11dGF0aW9uLnJlbW92ZWROb2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgcmVtb3ZlZE1lZGlhRWxlbWVudHMucHVzaChub2RlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB7XG4gICAgICAgICAgICAgIC8vIENoZWNrIGZvciBtZWRpYSBlbGVtZW50cyB3aXRoaW4gcmVtb3ZlZCBub24tbWVkaWEgZWxlbWVudHNcbiAgICAgICAgICAgICAgbm9kZS5xdWVyeVNlbGVjdG9yQWxsKFwidmlkZW8sIGF1ZGlvXCIpLmZvckVhY2goKGVsKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVsIGluc3RhbmNlb2YgSFRNTE1lZGlhRWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgcmVtb3ZlZE1lZGlhRWxlbWVudHMucHVzaChlbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGlmIChhZGRlZE1lZGlhRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBcIltNZWRpYU1hbmFnZXIgT2JzZXJ2ZXJdIEFkZGVkIG1lZGlhIGVsZW1lbnRzIGRldGVjdGVkLCB0cmlnZ2VyaW5nIGRlYm91bmNlZCBjaGVjay5cIlxuICAgICAgICApO1xuICAgICAgICBkZWJvdW5jZWRDaGVjaygpOyAvLyBUcmlnZ2VyIGRlYm91bmNlZCBjaGVjayBmb3IgYWRkZWQgZWxlbWVudHNcbiAgICAgIH1cblxuICAgICAgaWYgKHJlbW92ZWRNZWRpYUVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtNZWRpYU1hbmFnZXIgT2JzZXJ2ZXJdIFJlbW92ZWQgJHtyZW1vdmVkTWVkaWFFbGVtZW50cy5sZW5ndGh9IG1lZGlhIGVsZW1lbnRzLCB0cmlnZ2VyaW5nIGNsZWFudXAuYFxuICAgICAgICApO1xuICAgICAgICBvblJlbW92ZWQocmVtb3ZlZE1lZGlhRWxlbWVudHMpOyAvLyBJbW1lZGlhdGVseSBjYWxsIG9uUmVtb3ZlZCBmb3IgY2xlYW51cFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgb2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHtcbiAgICAgIGNoaWxkTGlzdDogdHJ1ZSxcbiAgICAgIHN1YnRyZWU6IHRydWUsXG4gICAgfSk7XG5cbiAgICByZXR1cm4gb2JzZXJ2ZXI7XG4gIH1cbn1cbiIsImltcG9ydCB7IEF1ZGlvU2V0dGluZ3MgLCBkZWJ1Z0xvZyB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb1Byb2Nlc3NvciB9IGZyb20gXCIuL2F1ZGlvLXByb2Nlc3NvclwiO1xuaW1wb3J0IHsgTWVkaWFNYW5hZ2VyIH0gZnJvbSBcIi4vbWVkaWEtbWFuYWdlclwiO1xuXG5leHBvcnQgY2xhc3MgTWVkaWFQcm9jZXNzb3Ige1xuICBhdWRpb1Byb2Nlc3NvcjogQXVkaW9Qcm9jZXNzb3I7XG4gIHByaXZhdGUgYWN0aXZlTWVkaWFFbGVtZW50cyA9IG5ldyBTZXQ8SFRNTE1lZGlhRWxlbWVudD4oKTtcbiAgcHJpdmF0ZSBlbGVtZW50U2V0dGluZ3MgPSBuZXcgV2Vha01hcDxIVE1MTWVkaWFFbGVtZW50LCBBdWRpb1NldHRpbmdzPigpO1xuICBwcml2YXRlIGVsZW1lbnRMaXN0ZW5lcnMgPSBuZXcgV2Vha01hcDxIVE1MTWVkaWFFbGVtZW50LCAoKSA9PiB2b2lkPigpO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3IgPSBuZXcgQXVkaW9Qcm9jZXNzb3IoKTtcbiAgfVxuXG4gIC8vIE1ldGhvZCB0byBnZXQgY3VycmVudGx5IG1hbmFnZWQgbWVkaWEgZWxlbWVudHMsIGZpbHRlcmluZyBmb3IgY29ubmVjdGVkIG9uZXNcbiAgcHVibGljIGdldE1hbmFnZWRNZWRpYUVsZW1lbnRzKCk6IEhUTUxNZWRpYUVsZW1lbnRbXSB7XG4gICAgY29uc3QgZGlzY29ubmVjdGVkOiBIVE1MTWVkaWFFbGVtZW50W10gPSBbXTtcbiAgICBcbiAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIGlmICghZWwuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgZGlzY29ubmVjdGVkLnB1c2goZWwpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIGRpc2Nvbm5lY3RlZC5mb3JFYWNoKGVsID0+IHRoaXMuY2xlYW51cEVsZW1lbnQoZWwpKTtcbiAgICBcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMpO1xuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGVQbGF5YmFja1NwZWVkKGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQsIHNwZWVkOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFtNZWRpYVByb2Nlc3Nvcl0gQXR0ZW1wdGVkIHRvIHVwZGF0ZSBzcGVlZCBvbiBkaXNjb25uZWN0ZWQgZWxlbWVudDogJHtcbiAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgfWBcbiAgICAgICk7XG4gICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpOyAvLyBDbGVhbiB1cCBpZiBmb3VuZCBpbiBhY3RpdmUgbGlzdFxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBkZWJ1Z0xvZyggLy8gVGhpcyBsb2cgY2FuIGJlIHZlcnkgbm9pc3ksIGVuYWJsZSBpZiBuZWVkZWQgZm9yIHNwZWNpZmljIHNwZWVkIGRlYnVnZ2luZ1xuICAgIC8vICAgYFtNZWRpYVByb2Nlc3Nvcl0gVXBkYXRpbmcgc3BlZWQgZm9yIGVsZW1lbnQgJHtcbiAgICAvLyAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgLy8gICB9IHRvICR7c3BlZWR9YFxuICAgIC8vICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHdhc1BsYXlpbmcgPSAhZWxlbWVudC5wYXVzZWQ7XG4gICAgICBjb25zdCBjdXJyZW50VGltZSA9IGVsZW1lbnQuY3VycmVudFRpbWU7XG5cbiAgICAgIGVsZW1lbnQucGxheWJhY2tSYXRlID0gc3BlZWQgLyAxMDA7XG4gICAgICBlbGVtZW50LmRlZmF1bHRQbGF5YmFja1JhdGUgPSBzcGVlZCAvIDEwMDtcblxuICAgICAgLy8gUmVzdG9yZSBzdGF0ZVxuICAgICAgaWYgKHdhc1BsYXlpbmcpIHtcbiAgICAgICAgLy8gSWYgcGxheWluZywgY2hhbmdpbmcgcGxheWJhY2tSYXRlIHNob3VsZCBpZGVhbGx5IG5vdCBzdG9wIGl0LlxuICAgICAgICAvLyBBdm9pZCByZXNldHRpbmcgY3VycmVudFRpbWUgd2hpY2ggY2FuIGNhdXNlIGEgc3R1dHRlci5cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIGl0IHdhcyBwYXVzZWQsIHNldCB0aGUgY3VycmVudFRpbWUgdG8gZW5zdXJlIGl0IHN0YXlzIGF0IHRoZSBzYW1lIHNwb3QuXG4gICAgICAgIGVsZW1lbnQuY3VycmVudFRpbWUgPSBjdXJyZW50VGltZTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBgTWVkaWFQcm9jZXNzb3I6IEVycm9yIHNldHRpbmcgc3BlZWQgZm9yICR7ZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwifTpgLFxuICAgICAgICBlXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NNZWRpYUVsZW1lbnRzKFxuICAgIG1lZGlhRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncyxcbiAgICBuZWVkc0F1ZGlvRWZmZWN0c1NldHVwOiBib29sZWFuXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vIE9ubHkgbG9nIGlmIHdlIGhhdmUgZWxlbWVudHMgdG8gcHJvY2Vzc1xuICAgIGlmIChtZWRpYUVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUuZGVidWcoXG4gICAgICAgIGBbTWVkaWFQcm9jZXNzb3JdIFByb2Nlc3NpbmcgJHttZWRpYUVsZW1lbnRzLmxlbmd0aH0gbWVkaWEgZWxlbWVudChzKS4gQXVkaW8gZWZmZWN0czogJHtuZWVkc0F1ZGlvRWZmZWN0c1NldHVwfWBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gQXBwbHkgc3BlZWQgc2V0dGluZ3MgaW1tZWRpYXRlbHlcbiAgICBtZWRpYUVsZW1lbnRzLmZvckVhY2goKGVsZW1lbnQpID0+IHtcbiAgICAgIGlmIChlbGVtZW50LmlzQ29ubmVjdGVkKSB7XG4gICAgICAgIHRoaXMudXBkYXRlUGxheWJhY2tTcGVlZChlbGVtZW50LCBzZXR0aW5ncy5zcGVlZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKG5lZWRzQXVkaW9FZmZlY3RzU2V0dXApIHtcbiAgICAgIGF3YWl0IHRoaXMuYXVkaW9Qcm9jZXNzb3IudHJ5UmVzdW1lQ29udGV4dCgpO1xuXG4gICAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbWVkaWFFbGVtZW50cykge1xuICAgICAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci5zZXR1cEF1ZGlvQ29udGV4dChlbGVtZW50LCBzZXR0aW5ncyk7XG4gICAgICAgICAgdGhpcy5hY3RpdmVNZWRpYUVsZW1lbnRzLmFkZChlbGVtZW50KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICBgW01lZGlhUHJvY2Vzc29yXSBFcnJvciBzZXR0aW5nIHVwIGF1ZGlvIGZvciAke1xuICAgICAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgICAgIH06YCxcbiAgICAgICAgICAgIGVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgdGhpcy5hdWRpb1Byb2Nlc3Nvci5hdWRpb0NvbnRleHQgJiZcbiAgICAgICAgdGhpcy5hdWRpb1Byb2Nlc3Nvci5hdWRpb0NvbnRleHQuc3RhdGUgPT09IFwicnVubmluZ1wiXG4gICAgICApIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci51cGRhdGVBdWRpb0VmZmVjdHMoc2V0dGluZ3MpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBObyBhdWRpbyBlZmZlY3RzIG5lZWRlZCAtIGRpc2Nvbm5lY3QgZXhpc3RpbmcgYXVkaW8gbm9kZXMgZm9yIHRoZXNlIGVsZW1lbnRzXG4gICAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbWVkaWFFbGVtZW50cykge1xuICAgICAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgLy8gRGlzY29ubmVjdCBhdWRpbyBwcm9jZXNzaW5nIGZvciB0aGlzIGVsZW1lbnQgc2luY2UgZWZmZWN0cyBhcmUgbm8gbG9uZ2VyIG5lZWRlZFxuICAgICAgICAgIGlmICh0aGlzLmF1ZGlvUHJvY2Vzc29yLmhhc1Byb2Nlc3NpbmcoZWxlbWVudCkpIHtcbiAgICAgICAgICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3IuZGlzY29ubmVjdEVsZW1lbnROb2RlcyhlbGVtZW50KTtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5kZWxldGUoZWxlbWVudCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgIGBbTWVkaWFQcm9jZXNzb3JdIEVycm9yIGRpc2Nvbm5lY3RpbmcgZWZmZWN0cyBmb3IgJHtcbiAgICAgICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgICB9OmAsXG4gICAgICAgICAgICBlXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBJZiBubyBtb3JlIGFjdGl2ZSBlbGVtZW50cyB3aXRoIHByb2Nlc3NpbmcsIGNsZWFuIHVwIHRoZSBhdWRpbyBjb250ZXh0XG4gICAgICBpZiAodGhpcy5hY3RpdmVNZWRpYUVsZW1lbnRzLnNpemUgPT09IDApIHtcbiAgICAgICAgdGhpcy5hdWRpb1Byb2Nlc3Nvci5jbGVhbnVwKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFwcGx5IHNldHRpbmdzIGRpcmVjdGx5IHRvIG1lZGlhIGVsZW1lbnRzIHdpdGhvdXQgd2FpdGluZyBmb3IgYXN5bmMgb3BlcmF0aW9uc1xuICAgKiBVc2VmdWwgZm9yIGltbWVkaWF0ZSBVSSBmZWVkYmFja1xuICAgKi9cbiAgcHJpdmF0ZSBsYXN0QXBwbGllZFNldHRpbmdzOiBBdWRpb1NldHRpbmdzIHwgbnVsbCA9IG51bGw7XG5cbiAgYXBwbHlTZXR0aW5nc0ltbWVkaWF0ZWx5KFxuICAgIG1lZGlhRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncyxcbiAgICBkaXNhYmxlZDogYm9vbGVhbiA9IGZhbHNlXG4gICk6IHZvaWQge1xuICAgIGlmIChkaXNhYmxlZCkge1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIFwiW01lZGlhUHJvY2Vzc29yXSBEaXNhYmxpbmcgbWVkaWEgcHJvY2Vzc2luZyBhbmQgcGF1c2luZyBtZWRpYSBlbGVtZW50c1wiXG4gICAgICApO1xuICAgICAgXG4gICAgICAvLyBSZXNldCBhbnkgcHJldmlvdXNseSBhcHBsaWVkIHNldHRpbmdzIGFuZCBwYXVzZSBlbGVtZW50c1xuICAgICAgbWVkaWFFbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAvLyBPbmx5IHJlc2V0IGlmIHdlIGhhZCBhcHBsaWVkIHNldHRpbmdzIHRvIHRoaXMgZWxlbWVudFxuICAgICAgICBpZiAodGhpcy5lbGVtZW50U2V0dGluZ3MuaGFzKGVsZW1lbnQpKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFBhdXNlIHRoZSBlbGVtZW50IGlmIGl0J3MgcGxheWluZ1xuICAgICAgICAgICAgaWYgKCFlbGVtZW50LnBhdXNlZCkge1xuICAgICAgICAgICAgICBlbGVtZW50LnBhdXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGVsZW1lbnQucGxheWJhY2tSYXRlID0gMS4wO1xuICAgICAgICAgICAgZWxlbWVudC5kZWZhdWx0UGxheWJhY2tSYXRlID0gMS4wO1xuICAgICAgICAgICAgdGhpcy5jbGVhbnVwRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgICBgTWVkaWFQcm9jZXNzb3I6IEVycm9yIHJlc2V0dGluZyBlbGVtZW50ICR7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgICAgIH0gaW4gZGlzYWJsZWQgbW9kZTpgLFxuICAgICAgICAgICAgICBlXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZGVidWdMb2coXG4gICAgICBcIltNZWRpYVByb2Nlc3Nvcl0gQXBwbHlpbmcgc2V0dGluZ3MgaW1tZWRpYXRlbHkgdG8gbWVkaWEgZWxlbWVudHNcIlxuICAgICk7XG5cbiAgICBjb25zdCB0YXJnZXRTcGVlZCA9IHNldHRpbmdzLnNwZWVkIC8gMTAwO1xuICAgIFxuICAgIC8vIFByb2Nlc3MgYWxsIGVsZW1lbnRzIHN5bmNocm9ub3VzbHkgZm9yIGltbWVkaWF0ZSBlZmZlY3RcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbWVkaWFFbGVtZW50cykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKCFlbGVtZW50LmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgdGhpcy5jbGVhbnVwRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQXBwbHkgcGxheWJhY2sgc3BlZWQgaW1tZWRpYXRlbHlcbiAgICAgICAgZWxlbWVudC5wbGF5YmFja1JhdGUgPSB0YXJnZXRTcGVlZDtcbiAgICAgICAgZWxlbWVudC5kZWZhdWx0UGxheWJhY2tSYXRlID0gdGFyZ2V0U3BlZWQ7XG4gICAgICAgIFxuICAgICAgICAvLyBTdG9yZSBjdXJyZW50IHNldHRpbmdzIGZvciB0aGlzIGVsZW1lbnRcbiAgICAgICAgdGhpcy5lbGVtZW50U2V0dGluZ3Muc2V0KGVsZW1lbnQsIHNldHRpbmdzKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEFkZCBwbGF5IGV2ZW50IGxpc3RlbmVyIGlmIG5vdCBhbHJlYWR5IGFkZGVkXG4gICAgICAgIGlmICghdGhpcy5lbGVtZW50TGlzdGVuZXJzLmhhcyhlbGVtZW50KSkge1xuICAgICAgICAgIGNvbnN0IHBsYXlIYW5kbGVyID0gKCkgPT4ge1xuICAgICAgICAgICAgZGVidWdMb2coYFtNZWRpYVByb2Nlc3Nvcl0gUmVhcHBseWluZyBzZXR0aW5ncyBvbiBwbGF5IGV2ZW50IGZvciAke2VsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIn1gKTtcbiAgICAgICAgICAgIC8vIFJlYWQgY3VycmVudCBzZXR0aW5ncyBmcm9tIFdlYWtNYXAgaW5zdGVhZCBvZiBjYXB0dXJpbmcgc3RhbGUgY2xvc3VyZVxuICAgICAgICAgICAgY29uc3QgY3VycmVudFNldHRpbmdzID0gdGhpcy5lbGVtZW50U2V0dGluZ3MuZ2V0KGVsZW1lbnQpO1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRTZXR0aW5ncykge1xuICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXliYWNrU3BlZWQoZWxlbWVudCwgY3VycmVudFNldHRpbmdzLnNwZWVkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncGxheScsIHBsYXlIYW5kbGVyKTtcbiAgICAgICAgICB0aGlzLmVsZW1lbnRMaXN0ZW5lcnMuc2V0KGVsZW1lbnQsIHBsYXlIYW5kbGVyKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gVHJhY2sgY29ubmVjdGVkIGVsZW1lbnRzXG4gICAgICAgIGlmICghdGhpcy5hY3RpdmVNZWRpYUVsZW1lbnRzLmhhcyhlbGVtZW50KSkge1xuICAgICAgICAgIHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5hZGQoZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICBgTWVkaWFQcm9jZXNzb3I6IEVycm9yIGFwcGx5aW5nIHNldHRpbmdzIHRvICR7XG4gICAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgICB9OmAsXG4gICAgICAgICAgZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBcbiAgcHJpdmF0ZSBjbGVhbnVwRWxlbWVudChlbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50KTogdm9pZCB7XG4gICAgaWYgKHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5oYXMoZWxlbWVudCkpIHtcbiAgICAgIHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5kZWxldGUoZWxlbWVudCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHBsYXlIYW5kbGVyID0gdGhpcy5lbGVtZW50TGlzdGVuZXJzLmdldChlbGVtZW50KTtcbiAgICBpZiAocGxheUhhbmRsZXIpIHtcbiAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigncGxheScsIHBsYXlIYW5kbGVyKTtcbiAgICAgIHRoaXMuZWxlbWVudExpc3RlbmVycy5kZWxldGUoZWxlbWVudCk7XG4gICAgfVxuICAgIFxuICAgIHRoaXMuZWxlbWVudFNldHRpbmdzLmRlbGV0ZShlbGVtZW50KTtcbiAgfVxuXG4gIGFwcGx5U2V0dGluZ3NUb1Zpc2libGVNZWRpYShcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncyxcbiAgICBkaXNhYmxlZDogYm9vbGVhbiA9IGZhbHNlXG4gICk6IHZvaWQge1xuICAgIC8vIEdldCBhbGwgbWVkaWEgZWxlbWVudHMgYW5kIGZpbHRlciBmb3IgdmlzaWJsZSBvbmVzXG4gICAgY29uc3QgdmlzaWJsZU1lZGlhID0gdGhpcy5nZXRNYW5hZ2VkTWVkaWFFbGVtZW50cygpLmZpbHRlcihlbCA9PlxuICAgICAgZWwub2Zmc2V0V2lkdGggPiAwIHx8IGVsLm9mZnNldEhlaWdodCA+IDBcbiAgICApO1xuICAgIFxuICAgIGlmICh2aXNpYmxlTWVkaWEubGVuZ3RoID4gMCkge1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIGBbTWVkaWFQcm9jZXNzb3JdIEFwcGx5aW5nIHNldHRpbmdzIHRvICR7dmlzaWJsZU1lZGlhLmxlbmd0aH0gdmlzaWJsZSBtZWRpYSBlbGVtZW50c2BcbiAgICAgICk7XG4gICAgICB0aGlzLmFwcGx5U2V0dGluZ3NJbW1lZGlhdGVseSh2aXNpYmxlTWVkaWEsIHNldHRpbmdzLCBkaXNhYmxlZCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEZvcmNlIHVwZGF0ZSBvZiBhdWRpbyBlZmZlY3RzIGV2ZW4gaWYgY29udGV4dCBhbHJlYWR5IGV4aXN0c1xuICAgKiBVc2VmdWwgZm9yIGltbWVkaWF0ZSBhcHBsaWNhdGlvbiBvZiBmaWx0ZXIvYXVkaW8gY2hhbmdlc1xuICAgKi9cbiAgYXN5bmMgZm9yY2VBdWRpb0VmZmVjdHNVcGRhdGUoc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1Z0xvZyhcIltNZWRpYVByb2Nlc3Nvcl0gRm9yY2luZyBhdWRpbyBlZmZlY3RzIHVwZGF0ZVwiKTtcblxuICAgIGlmIChcbiAgICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3JbXCJhdWRpb0NvbnRleHRcIl0gJiZcbiAgICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3JbXCJhdWRpb0NvbnRleHRcIl0uc3RhdGUgIT09IFwiY2xvc2VkXCJcbiAgICApIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIENyZWF0ZSBuZXcgYXVkaW8gY29udGV4dCBpZiBuZWVkZWRcbiAgICAgICAgaWYgKHRoaXMuYXVkaW9Qcm9jZXNzb3JbXCJhdWRpb0NvbnRleHRcIl0uc3RhdGUgPT09IFwic3VzcGVuZGVkXCIpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmF1ZGlvUHJvY2Vzc29yW1wiYXVkaW9Db250ZXh0XCJdLnJlc3VtZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRm9yY2UgdXBkYXRlIG9mIGF1ZGlvIGVmZmVjdHNcbiAgICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci51cGRhdGVBdWRpb0VmZmVjdHMoc2V0dGluZ3MpO1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBcIltNZWRpYVByb2Nlc3Nvcl0gU3VjY2Vzc2Z1bGx5IGZvcmNlZCBhdWRpbyBlZmZlY3RzIHVwZGF0ZVwiXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgXCJbTWVkaWFQcm9jZXNzb3JdIEZhaWxlZCB0byBmb3JjZSBhdWRpbyBlZmZlY3RzIHVwZGF0ZTpcIixcbiAgICAgICAgICBlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnTG9nKFxuICAgICAgICBcIltNZWRpYVByb2Nlc3Nvcl0gQ3JlYXRpbmcgbmV3IGF1ZGlvIGNvbnRleHQgZm9yIGZvcmNlZCB1cGRhdGVcIlxuICAgICAgKTtcbiAgICAgIGNvbnN0IG1vY2tFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImF1ZGlvXCIpO1xuICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci5zZXR1cEF1ZGlvQ29udGV4dChtb2NrRWxlbWVudCwgc2V0dGluZ3MpO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgc2V0dXBNZWRpYU9ic2VydmVyKFxuICAgIG9uQWRkZWQ6IChlbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiBQcm9taXNlPHZvaWQ+LFxuICAgIG9uUmVtb3ZlZDogKGVsZW1lbnRzOiBIVE1MTWVkaWFFbGVtZW50W10pID0+IHZvaWRcbiAgKTogTXV0YXRpb25PYnNlcnZlciB7XG4gICAgLy8gQ2hhbmdlIHJldHVybiB0eXBlIHRvIE11dGF0aW9uT2JzZXJ2ZXJcbiAgICByZXR1cm4gTWVkaWFNYW5hZ2VyLnNldHVwTWVkaWFFbGVtZW50T2JzZXJ2ZXIob25BZGRlZCwgb25SZW1vdmVkKTsgLy8gUmV0dXJuIHRoZSBvYnNlcnZlclxuICB9XG5cbiAgZmluZE1lZGlhRWxlbWVudHMoKTogSFRNTE1lZGlhRWxlbWVudFtdIHtcbiAgICAvLyBBc3N1bWluZyBNZWRpYU1hbmFnZXIuZmluZE1lZGlhRWxlbWVudHMgaXMgbWFkZSBwdWJsaWNcbiAgICByZXR1cm4gTWVkaWFNYW5hZ2VyLmZpbmRNZWRpYUVsZW1lbnRzKCk7XG4gIH1cblxuICBhc3luYyByZXNldFRvRGlzYWJsZWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci5yZXNldEFsbFRvRGlzYWJsZWQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQdWJsaWMgbWV0aG9kIHRvIGF0dGVtcHQgcmVzdW1pbmcgdGhlIEF1ZGlvQ29udGV4dCB2aWEgdGhlIHByaXZhdGUgQXVkaW9Qcm9jZXNzb3IuXG4gICAqL1xuICBwdWJsaWMgYXN5bmMgYXR0ZW1wdENvbnRleHRSZXN1bWUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gQWNjZXNzIHRoZSBwcml2YXRlIG1lbWJlciB1c2luZyBicmFja2V0IG5vdGF0aW9uIGlmIG5lZWRlZCwgb3IgbWFrZSBpdCBwdWJsaWMvaW50ZXJuYWxcbiAgICBhd2FpdCB0aGlzLmF1ZGlvUHJvY2Vzc29yLnRyeVJlc3VtZUNvbnRleHQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQdWJsaWMgbWV0aG9kIHRvIGNoZWNrIGlmIHRoZSBBdWRpb0NvbnRleHQgaXMgcmVhZHkgZm9yIGFwcGx5aW5nIGF1ZGlvIGVmZmVjdHMuXG4gICAqL1xuICBwdWJsaWMgY2FuQXBwbHlBdWRpb0VmZmVjdHMoKTogYm9vbGVhbiB7XG4gICAgLy8gQ2hlY2sgaWYgYXVkaW9Qcm9jZXNzb3IgYW5kIGl0cyBhdWRpb0NvbnRleHQgZXhpc3QgYW5kIGFyZSBpbiAncnVubmluZycgc3RhdGVcbiAgICByZXR1cm4gKFxuICAgICAgISF0aGlzLmF1ZGlvUHJvY2Vzc29yW1wiYXVkaW9Db250ZXh0XCJdICYmXG4gICAgICB0aGlzLmF1ZGlvUHJvY2Vzc29yW1wiYXVkaW9Db250ZXh0XCJdLnN0YXRlID09PSBcInJ1bm5pbmdcIlxuICAgICk7XG4gIH1cbn0gLy8gRW5kIG9mIE1lZGlhUHJvY2Vzc29yIGNsYXNzXG4iLCJpbXBvcnQgeyBBdWRpb1NldHRpbmdzLCBkZWZhdWx0U2V0dGluZ3MgLCBkZWJ1Z0xvZyB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc0hhbmRsZXIge1xuICBwcml2YXRlIGN1cnJlbnRTZXR0aW5nczogQXVkaW9TZXR0aW5ncztcbiAgcHJpdmF0ZSB0YXJnZXRIb3N0bmFtZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7IC8vIFN0b3JlIHRoZSBob3N0bmFtZSB3ZSBzaG91bGQgdXNlXG4gIHByaXZhdGUgaW5pdGlhbGl6YXRpb25Db21wbGV0ZTogUHJvbWlzZTx2b2lkPjtcbiAgcHJpdmF0ZSByZXNvbHZlSW5pdGlhbGl6YXRpb24hOiAoKSA9PiB2b2lkOyAvLyBEZWZpbml0ZSBhc3NpZ25tZW50IGFzc2VydGlvblxuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0geyAuLi5kZWZhdWx0U2V0dGluZ3MgfTsgLy8gU3RhcnQgd2l0aCBkZWZhdWx0c1xuICAgIC8vIERvbid0IHNldCBob3N0bmFtZSBoZXJlLCB3YWl0IGZvciBpbml0aWFsaXplXG4gICAgdGhpcy5pbml0aWFsaXphdGlvbkNvbXBsZXRlID0gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIHRoaXMucmVzb2x2ZUluaXRpYWxpemF0aW9uID0gcmVzb2x2ZTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplcyB0aGUgaGFuZGxlciBieSByZXF1ZXN0aW5nIHRoZSBjb3JyZWN0IHNldHRpbmdzXG4gICAqIGZvciB0aGUgdGFyZ2V0IGhvc3RuYW1lIGZyb20gdGhlIGJhY2tncm91bmQgc2NyaXB0LlxuICAgKiBAcGFyYW0gaG9zdG5hbWUgVGhlIGhvc3RuYW1lIHRvIGZldGNoIHNldHRpbmdzIGZvciAoaWRlYWxseSB0b3AtbGV2ZWwpLlxuICAgKi9cbiAgYXN5bmMgaW5pdGlhbGl6ZShob3N0bmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy50YXJnZXRIb3N0bmFtZSA9IGhvc3RuYW1lOyAvLyBTdG9yZSB0aGUgdGFyZ2V0IGhvc3RuYW1lXG4gICAgZGVidWdMb2coXG4gICAgICBgU2V0dGluZ3NIYW5kbGVyIChUYXJnZXQ6ICR7dGhpcy50YXJnZXRIb3N0bmFtZX0pOiBJbml0aWFsaXppbmcuLi5gXG4gICAgKTtcblxuICAgIGlmICghdGhpcy50YXJnZXRIb3N0bmFtZSkge1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogSW5pdGlhbGl6YXRpb24gYWJvcnRlZCAtIG5vIHZhbGlkIHRhcmdldCBob3N0bmFtZSBwcm92aWRlZC5gXG4gICAgICApO1xuICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9O1xuICAgICAgdGhpcy5yZXNvbHZlSW5pdGlhbGl6YXRpb24oKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBkZWJ1Z0xvZyhcbiAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IEF0dGVtcHRpbmcgdG8gc2VuZCBHRVRfSU5JVElBTF9TRVRUSU5HUy5gXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgIHR5cGU6IFwiR0VUX0lOSVRJQUxfU0VUVElOR1NcIixcbiAgICAgICAgaG9zdG5hbWU6IHRoaXMudGFyZ2V0SG9zdG5hbWUsXG4gICAgICB9KTtcblxuICAgICAgZGVidWdMb2coXG4gICAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IEdFVF9JTklUSUFMX1NFVFRJTkdTIHJlc3BvbnNlIHJlY2VpdmVkOmAsXG4gICAgICAgIHJlc3BvbnNlXG4gICAgICApO1xuXG4gICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uuc2V0dGluZ3MpIHtcbiAgICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSByZXNwb25zZS5zZXR0aW5ncztcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogU3VjY2Vzc2Z1bGx5IGFwcGxpZWQgaW5pdGlhbCBzZXR0aW5ncyBmcm9tIGJhY2tncm91bmQ6YCxcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh0aGlzLmN1cnJlbnRTZXR0aW5ncylcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0geyAuLi5kZWZhdWx0U2V0dGluZ3MgfTtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IE5vIHZhbGlkIHNldHRpbmdzIGluIHJlc3BvbnNlIG9yIHJlc3BvbnNlIHdhcyBudWxsL3VuZGVmaW5lZC4gVXNpbmcgZGVmYXVsdHMuIFJlc3BvbnNlOmAsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgXCJDdXJyZW50IHNldHRpbmdzIG5vdzpcIixcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh0aGlzLmN1cnJlbnRTZXR0aW5ncylcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9O1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogRXJyb3IgZHVyaW5nIEdFVF9JTklUSUFMX1NFVFRJTkdTIHNlbmRNZXNzYWdlIG9yIHByb2Nlc3Npbmc6YCxcbiAgICAgICAgZXJyb3IsXG4gICAgICAgIFwiVXNpbmcgZGVmYXVsdHMuIEN1cnJlbnQgc2V0dGluZ3Mgbm93OlwiLFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh0aGlzLmN1cnJlbnRTZXR0aW5ncylcbiAgICAgICk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGRlYnVnTG9nKFxuICAgICAgICBgU2V0dGluZ3NIYW5kbGVyIChUYXJnZXQ6ICR7dGhpcy50YXJnZXRIb3N0bmFtZX0pOiBJbml0aWFsaXphdGlvbiBwcm9taXNlIHJlc29sdmluZy4gRmluYWwgY3VycmVudFNldHRpbmdzIHN0YXRlIGZvciB0aGlzIGluaXQgY3ljbGU6YCxcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5jdXJyZW50U2V0dGluZ3MpXG4gICAgICApO1xuICAgICAgdGhpcy5yZXNvbHZlSW5pdGlhbGl6YXRpb24oKTsgLy8gU2lnbmFsIHRoYXQgaW5pdGlhbGl6YXRpb24gaXMgZG9uZVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIG9uY2UgaW5pdGlhbCBzZXR0aW5ncyBoYXZlIGJlZW5cbiAgICogZmV0Y2hlZCAob3IgZmFpbGVkIHRvIGZldGNoKSBmcm9tIHRoZSBiYWNrZ3JvdW5kIHNjcmlwdC5cbiAgICovXG4gIGFzeW5jIGVuc3VyZUluaXRpYWxpemVkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmluaXRpYWxpemF0aW9uQ29tcGxldGU7XG4gIH1cblxuICAvKipcbiAgICogR2V0cyB0aGUgY3VycmVudGx5IGxvYWRlZCBzZXR0aW5ncy5cbiAgICovXG4gIGdldEN1cnJlbnRTZXR0aW5ncygpOiBBdWRpb1NldHRpbmdzIHtcbiAgICByZXR1cm4gdGhpcy5jdXJyZW50U2V0dGluZ3M7XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlcyBzZXR0aW5ncyBsb2NhbGx5LiBTaG91bGQgcHJpbWFyaWx5IGJlIHVzZWQgd2hlbiByZWNlaXZpbmdcbiAgICogdXBkYXRlcyBmcm9tIHRoZSBiYWNrZ3JvdW5kIHNjcmlwdCB2aWEgbWVzc2FnZXMuXG4gICAqL1xuICB1cGRhdGVTZXR0aW5ncyhzZXR0aW5nczogQXVkaW9TZXR0aW5ncyk6IHZvaWQge1xuICAgIGRlYnVnTG9nKFxuICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogU2V0dGluZ3MgdXBkYXRlZCBkaXJlY3RseWAsXG4gICAgICBzZXR0aW5nc1xuICAgICk7XG4gICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNldHMgc2V0dGluZ3MgdG8gdGhlIGFwcGxpY2F0aW9uIGRlZmF1bHRzIGxvY2FsbHkuXG4gICAqL1xuICByZXNldFRvRGVmYXVsdCgpOiB2b2lkIHtcbiAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyA9IHsgLi4uZGVmYXVsdFNldHRpbmdzIH07XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lcyBpZiBhdWRpbyBwcm9jZXNzaW5nIGlzIG5lZWRlZCBiYXNlZCBvbiBjdXJyZW50IHNldHRpbmdzLlxuICAgKi9cbiAgbmVlZHNBdWRpb1Byb2Nlc3NpbmcoKTogYm9vbGVhbiB7XG4gICAgLy8gQ2hlY2sgaWYgc2V0dGluZ3MgYXJlIGRpZmZlcmVudCBmcm9tIGRlZmF1bHRzLCBpbXBseWluZyBwcm9jZXNzaW5nIGlzIG5lZWRlZFxuICAgIGNvbnN0IGRlZmF1bHRzID0gZGVmYXVsdFNldHRpbmdzO1xuICAgIGNvbnN0IG5lZWRzUHJvY2Vzc2luZyA9ICEoXG4gICAgICAoXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzLnZvbHVtZSA9PT0gZGVmYXVsdHMudm9sdW1lICYmXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzLmJhc3NCb29zdCA9PT0gZGVmYXVsdHMuYmFzc0Jvb3N0ICYmXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzLnZvaWNlQm9vc3QgPT09IGRlZmF1bHRzLnZvaWNlQm9vc3QgJiZcbiAgICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MubW9ubyA9PT0gZGVmYXVsdHMubW9ub1xuICAgICAgKVxuICAgICAgLy8gQWRkIG90aGVyIHJlbGV2YW50IHNldHRpbmdzIGNoZWNrcyBoZXJlIGlmIG5lZWRlZFxuICAgICk7XG4gICAgLy8gZGVidWdMb2coYFNldHRpbmdzSGFuZGxlciAoJHt0aGlzLmhvc3RuYW1lfSk6IG5lZWRzQXVkaW9Qcm9jZXNzaW5nID0gJHtuZWVkc1Byb2Nlc3Npbmd9YCk7XG4gICAgcmV0dXJuIG5lZWRzUHJvY2Vzc2luZztcbiAgfVxufVxuIiwiaW1wb3J0IHsgU2V0dGluZ3NIYW5kbGVyIH0gZnJvbSBcIi4vc2V0dGluZ3MtaGFuZGxlclwiO1xuaW1wb3J0IHsgTWVkaWFQcm9jZXNzb3IgfSBmcm9tIFwiLi9tZWRpYS1wcm9jZXNzb3JcIjtcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxudHlwZSBJbml0aWFsaXplU2NyaXB0Q2FsbGJhY2sgPSAoaG9zdG5hbWU6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPjtcblxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwSG9zdG5hbWVEZXRlY3Rpb24oXG4gIGluaXRpYWxpemVTY3JpcHQ6IEluaXRpYWxpemVTY3JpcHRDYWxsYmFja1xuKTogKCkgPT4gdm9pZCB7XG4gIGxldCBjbGVhbnVwRnVuY3Rpb25zOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG4gIGlmICh3aW5kb3cuc2VsZiA9PT0gd2luZG93LnRvcCkge1xuICAgIC8vIC0tLSBSdW5uaW5nIGluIHRoZSBUT1Agd2luZG93IC0tLVxuICAgIGNvbnN0IHRvcEhvc3RuYW1lID0gd2luZG93LmxvY2F0aW9uLmhvc3RuYW1lO1xuICAgIGRlYnVnTG9nKFxuICAgICAgYFtDb250ZW50U2NyaXB0XSBSdW5uaW5nIGluIFRPUCB3aW5kb3cuIEhvc3RuYW1lOiAke3RvcEhvc3RuYW1lfWBcbiAgICApO1xuICAgIGluaXRpYWxpemVTY3JpcHQodG9wSG9zdG5hbWUpOyAvLyBJbml0aWFsaXplIGZvciB0aGUgdG9wIHdpbmRvd1xuXG4gICAgLy8gTGlzdGVuZXIgZm9yIHJlcXVlc3RzIGZyb20gaWZyYW1lc1xuICAgIGNvbnN0IHRvcFdpbmRvd01lc3NhZ2VMaXN0ZW5lciA9IChldmVudDogTWVzc2FnZUV2ZW50KSA9PiB7XG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IFRPUF0gUmVjZWl2ZWQgbWVzc2FnZS4gT3JpZ2luOiAke1xuICAgICAgICAgIGV2ZW50Lm9yaWdpblxuICAgICAgICB9LCBEYXRhIFR5cGU6ICR7dHlwZW9mIGV2ZW50LmRhdGF9LCBEYXRhOiAke2V2ZW50LmRhdGF9YFxuICAgICAgKTtcblxuICAgICAgLy8gT25seSBwcm9jZXNzIG1lc3NhZ2VzIHRoYXQgYXJlIHN0cmluZ3MgYW5kIGxvb2sgbGlrZSBvdXIgSlNPTiBtZXNzYWdlc1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgZXZlbnQuZGF0YSAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgICAhZXZlbnQuZGF0YS5zdGFydHNXaXRoKFwie1wiKSB8fFxuICAgICAgICAhZXZlbnQuZGF0YS5lbmRzV2l0aChcIn1cIilcbiAgICAgICkge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBcIltDb250ZW50U2NyaXB0IFRPUF0gSWdub3Jpbmcgbm9uLUpTT04gb3Igbm9uLVZWUCBtZXNzYWdlIGZyb20gaWZyYW1lIChmb3JtYXQgbWlzbWF0Y2gpLlwiXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIGEgY2hlY2sgZm9yIG91ciBzcGVjaWZpYyBtZXNzYWdlIHR5cGVzIGJlZm9yZSBwYXJzaW5nXG4gICAgICBpZiAoXG4gICAgICAgICFldmVudC5kYXRhLmluY2x1ZGVzKFwiVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FXCIpICYmXG4gICAgICAgICFldmVudC5kYXRhLmluY2x1ZGVzKFwiVlZQX1RPUF9IT1NUTkFNRV9JTkZPXCIpXG4gICAgICApIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgXCJbQ29udGVudFNjcmlwdCBUT1BdIElnbm9yaW5nIG5vbi1WVlAgbWVzc2FnZSBmcm9tIGlmcmFtZSAoY29udGVudCBtaXNtYXRjaCkuXCJcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbGV0IHBhcnNlZERhdGE7XG4gICAgICB0cnkge1xuICAgICAgICBwYXJzZWREYXRhID0gSlNPTi5wYXJzZShldmVudC5kYXRhKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIFwiW0NvbnRlbnRTY3JpcHQgVE9QXSBGYWlsZWQgdG8gcGFyc2UgZXZlbnQuZGF0YSBzdHJpbmcgZnJvbSBpZnJhbWUgKGxpa2VseSBub3Qgb3VyIG1lc3NhZ2UpOlwiLFxuICAgICAgICAgIGV2ZW50LmRhdGEsXG4gICAgICAgICAgZVxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGRlYnVnTG9nKFxuICAgICAgICBgW0NvbnRlbnRTY3JpcHQgVE9QXSBQYXJzZWQgVlZQIG1lc3NhZ2UgZnJvbSBpZnJhbWUgKE9yaWdpbjogJHtldmVudC5vcmlnaW59KTpgLFxuICAgICAgICBwYXJzZWREYXRhXG4gICAgICApO1xuXG4gICAgICBpZiAoXG4gICAgICAgIGV2ZW50LnNvdXJjZSAmJiAvLyBFbnN1cmUgc291cmNlIGV4aXN0cyAoc291cmNlIGlzIHRoZSB3aW5kb3cgb2JqZWN0IG9mIHRoZSBzZW5kZXIpXG4gICAgICAgIHBhcnNlZERhdGEgJiZcbiAgICAgICAgcGFyc2VkRGF0YS50eXBlID09PSBcIlZWUF9SRVFVRVNUX1RPUF9IT1NUTkFNRVwiXG4gICAgICApIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IFRPUF0gUHJvY2Vzc2luZyBWVlBfUkVRVUVTVF9UT1BfSE9TVE5BTUUgZnJvbSBpZnJhbWUgKFNvdXJjZSBvcmlnaW46ICR7ZXZlbnQub3JpZ2lufSkuIFJlc3BvbmRpbmcgd2l0aCBob3N0bmFtZTogJHt0b3BIb3N0bmFtZX0uYFxuICAgICAgICApO1xuICAgICAgICBjb25zdCByZXNwb25zZVBheWxvYWQgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdHlwZTogXCJWVlBfVE9QX0hPU1ROQU1FX0lORk9cIixcbiAgICAgICAgICBob3N0bmFtZTogdG9wSG9zdG5hbWUsXG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIEhhbmRsZSBzYW5kYm94ZWQgZW52aXJvbm1lbnRzIHdoZXJlIGV2ZW50Lm9yaWdpbiBtaWdodCBiZSBcIm51bGxcIlxuICAgICAgICBjb25zdCB0YXJnZXRPcmlnaW4gPSBldmVudC5vcmlnaW4gPT09IFwibnVsbFwiID8gXCIqXCIgOiBldmVudC5vcmlnaW47XG4gICAgICAgIChldmVudC5zb3VyY2UgYXMgV2luZG93KS5wb3N0TWVzc2FnZShyZXNwb25zZVBheWxvYWQsIHRhcmdldE9yaWdpbik7XG4gICAgICAgIGRlYnVnTG9nKFxuICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBUT1BdIFNlbnQgVlZQX1RPUF9IT1NUTkFNRV9JTkZPIHJlc3BvbnNlIHRvIGlmcmFtZSBhdCAke2V2ZW50Lm9yaWdpbn0uYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IFRPUF0gUmVjZWl2ZWQgb3RoZXIgcGFyc2VkIEpTT04gbWVzc2FnZSB0eXBlIChub3QgVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FKTogJHtwYXJzZWREYXRhLnR5cGV9IGZyb20gb3JpZ2luICR7ZXZlbnQub3JpZ2lufWAsXG4gICAgICAgICAgcGFyc2VkRGF0YVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH07XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIHRvcFdpbmRvd01lc3NhZ2VMaXN0ZW5lcik7XG4gICAgY29uc3QgcmVtb3ZlVG9wTGlzdGVuZXIgPSAoKSA9PiB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgdG9wV2luZG93TWVzc2FnZUxpc3RlbmVyKTtcbiAgICBjbGVhbnVwRnVuY3Rpb25zLnB1c2gocmVtb3ZlVG9wTGlzdGVuZXIpO1xuICB9IGVsc2Uge1xuICAgIC8vIC0tLSBSdW5uaW5nIGluIGFuIElGUkFNRSAtLS1cbiAgICBjb25zdCBpZnJhbWVPd25Ib3N0bmFtZSA9IHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZTtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFJ1bm5pbmcgaW4gSUZSQU1FLiBPd24gaG9zdG5hbWU6ICR7aWZyYW1lT3duSG9zdG5hbWV9LiBBdHRlbXB0aW5nIHRvIHJlcXVlc3QgaG9zdG5hbWUgZnJvbSB0b3Agd2luZG93LiBTZXR0aW5nIHVwIG1lc3NhZ2UgbGlzdGVuZXIuYFxuICAgICk7XG4gICAgbGV0IHJlY2VpdmVkSG9zdG5hbWUgPSBmYWxzZTtcbiAgICBsZXQgZmFsbGJhY2tUaW1lb3V0OiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICAgIC8vIExpc3RlbmVyIGZvciB0aGUgcmVzcG9uc2UgZnJvbSB0aGUgdG9wIHdpbmRvd1xuICAgIGNvbnN0IHJlc3BvbnNlTGlzdGVuZXIgPSAoZXZlbnQ6IE1lc3NhZ2VFdmVudCkgPT4ge1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFJlY2VpdmVkIG1lc3NhZ2UuIE9yaWdpbjogJHtcbiAgICAgICAgICBldmVudC5vcmlnaW5cbiAgICAgICAgfSwgRGF0YSBUeXBlOiAke3R5cGVvZiBldmVudC5kYXRhfSwgRGF0YTogJHtldmVudC5kYXRhfWBcbiAgICAgICk7XG5cbiAgICAgIC8vIE9ubHkgcHJvY2VzcyBtZXNzYWdlcyBmcm9tIHRoZSB0b3Agd2luZG93XG4gICAgICBpZiAoZXZlbnQuc291cmNlICE9PSB3aW5kb3cudG9wKSB7XG4gICAgICAgIGRlYnVnTG9nKFxuICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFJlY2VpdmVkIG1lc3NhZ2UgZnJvbSBub24tdG9wIHNvdXJjZTogJHtldmVudC5vcmlnaW59LiBJZ25vcmluZy5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gT25seSBwcm9jZXNzIG1lc3NhZ2VzIHRoYXQgYXJlIHN0cmluZ3MgYW5kIGxvb2sgbGlrZSBvdXIgSlNPTiBtZXNzYWdlc1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgZXZlbnQuZGF0YSAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgICAhZXZlbnQuZGF0YS5zdGFydHNXaXRoKFwie1wiKSB8fFxuICAgICAgICAhZXZlbnQuZGF0YS5lbmRzV2l0aChcIn1cIilcbiAgICAgICkge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBcIltDb250ZW50U2NyaXB0IGlGcmFtZV0gSWdub3Jpbmcgbm9uLUpTT04gb3Igbm9uLVZWUCBtZXNzYWdlIGZyb20gdG9wIChmb3JtYXQgbWlzbWF0Y2gpLlwiXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIGEgY2hlY2sgZm9yIG91ciBzcGVjaWZpYyBtZXNzYWdlIHR5cGVzIGJlZm9yZSBwYXJzaW5nXG4gICAgICBpZiAoXG4gICAgICAgICFldmVudC5kYXRhLmluY2x1ZGVzKFwiVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FXCIpICYmXG4gICAgICAgICFldmVudC5kYXRhLmluY2x1ZGVzKFwiVlZQX1RPUF9IT1NUTkFNRV9JTkZPXCIpXG4gICAgICApIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgXCJbQ29udGVudFNjcmlwdCBpRnJhbWVdIElnbm9yaW5nIG5vbi1WVlAgbWVzc2FnZSBmcm9tIHRvcCAoY29udGVudCBtaXNtYXRjaCkuXCJcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsZXQgcGFyc2VkRGF0YTtcbiAgICAgIHRyeSB7XG4gICAgICAgIHBhcnNlZERhdGEgPSBKU09OLnBhcnNlKGV2ZW50LmRhdGEpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgXCJbQ29udGVudFNjcmlwdCBpRnJhbWVdIEZhaWxlZCB0byBwYXJzZSBldmVudC5kYXRhIHN0cmluZyBmcm9tIHRvcDpcIixcbiAgICAgICAgICBldmVudC5kYXRhLFxuICAgICAgICAgIGVcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gUGFyc2VkIFZWUCBtZXNzYWdlIGZyb20gdG9wIChPcmlnaW46ICR7ZXZlbnQub3JpZ2lufSk6YCxcbiAgICAgICAgcGFyc2VkRGF0YVxuICAgICAgKTtcblxuICAgICAgaWYgKFxuICAgICAgICBwYXJzZWREYXRhICYmXG4gICAgICAgIHBhcnNlZERhdGEudHlwZSA9PT0gXCJWVlBfVE9QX0hPU1ROQU1FX0lORk9cIiAmJlxuICAgICAgICB0eXBlb2YgcGFyc2VkRGF0YS5ob3N0bmFtZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgKSB7XG4gICAgICAgIGlmIChmYWxsYmFja1RpbWVvdXQpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQoZmFsbGJhY2tUaW1lb3V0KTtcbiAgICAgICAgICBmYWxsYmFja1RpbWVvdXQgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZWNlaXZlZEhvc3RuYW1lKSB7XG4gICAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBBbHJlYWR5IHJlY2VpdmVkIGhvc3RuYW1lLiBJZ25vcmluZyBkdXBsaWNhdGUgVlZQX1RPUF9IT1NUTkFNRV9JTkZPIGZyb20gdG9wLiBPcmlnaW46ICR7ZXZlbnQub3JpZ2lufS4gUGFyc2VkIERhdGE6YCxcbiAgICAgICAgICAgIHBhcnNlZERhdGFcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICByZWNlaXZlZEhvc3RuYW1lID0gdHJ1ZTtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gU3VjY2Vzc2Z1bGx5IHJlY2VpdmVkIFZWUF9UT1BfSE9TVE5BTUVfSU5GTyBmcm9tIHRvcDogJHtwYXJzZWREYXRhLmhvc3RuYW1lfS4gT3JpZ2luOiAke2V2ZW50Lm9yaWdpbn0uIEluaXRpYWxpemluZyBzY3JpcHQuIFBhcnNlZCBkYXRhOmAsXG4gICAgICAgICAgcGFyc2VkRGF0YVxuICAgICAgICApO1xuICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgcmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgICAgIC8vIFJlbW92ZSB0aGUgY2xlYW51cCBmdW5jdGlvbiBieSBmaWx0ZXJpbmcgd2l0aCB0aGUgc2FtZSByZWZlcmVuY2VcbiAgICAgICAgY2xlYW51cEZ1bmN0aW9ucyA9IGNsZWFudXBGdW5jdGlvbnMuZmlsdGVyKChmKSA9PiBmICE9PSByZW1vdmVSZXNwb25zZUxpc3RlbmVyKTtcbiAgICAgICAgaW5pdGlhbGl6ZVNjcmlwdChwYXJzZWREYXRhLmhvc3RuYW1lKTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VkRGF0YSAmJiBwYXJzZWREYXRhLnR5cGUpIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gUmVjZWl2ZWQgb3RoZXIgcGFyc2VkIEpTT04gbWVzc2FnZSB0eXBlIGZyb20gdG9wOiAke3BhcnNlZERhdGEudHlwZX0gZnJvbSBvcmlnaW4gJHtldmVudC5vcmlnaW59YCxcbiAgICAgICAgICBwYXJzZWREYXRhXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vIFN0b3JlIHRoZSBjbGVhbnVwIGZ1bmN0aW9uIGluIGEgdmFyaWFibGUgc28gd2UgY2FuIHJlZmVyZW5jZSBpdCBmb3IgcmVtb3ZhbFxuICAgIGNvbnN0IHJlbW92ZVJlc3BvbnNlTGlzdGVuZXIgPSAoKSA9PiB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgcmVzcG9uc2VMaXN0ZW5lcik7XG5cbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgcmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgY2xlYW51cEZ1bmN0aW9ucy5wdXNoKHJlbW92ZVJlc3BvbnNlTGlzdGVuZXIpO1xuXG4gICAgLy8gUmVxdWVzdCB0aGUgaG9zdG5hbWUgZnJvbSB0aGUgdG9wIHdpbmRvdywgc2VuZGluZyBzdHJpbmdpZmllZCBKU09OXG4gICAgaWYgKHdpbmRvdy50b3AgJiYgd2luZG93LnRvcCAhPT0gd2luZG93LnNlbGYpIHtcbiAgICAgIC8vIEFkZCBhIHNtYWxsIGRlbGF5IGJlZm9yZSBzZW5kaW5nIHRoZSBtZXNzYWdlIHRvIGdpdmUgdGhlIHRvcCB3aW5kb3cncyBzY3JpcHQgdGltZSB0byBpbml0aWFsaXplXG4gICAgICBjb25zdCByZXF1ZXN0VGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAvLyBSZS1jaGVjayB3aW5kb3cudG9wIGluc2lkZSB0aGUgdGltZW91dCBjYWxsYmFjayB0byBzYXRpc2Z5IFR5cGVTY3JpcHQgYW5kIGVuc3VyZSBydW50aW1lIHNhZmV0eVxuICAgICAgICBpZiAod2luZG93LnRvcCAmJiB3aW5kb3cudG9wICE9PSB3aW5kb3cuc2VsZikge1xuICAgICAgICAgIGRlYnVnTG9nKFxuICAgICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gU2VuZGluZyBWVlBfUkVRVUVTVF9UT1BfSE9TVE5BTUUgdG8gdG9wIHdpbmRvdyAoT3JpZ2luOiAke3dpbmRvdy5sb2NhdGlvbi5vcmlnaW59KS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBtZXNzYWdlUGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHR5cGU6IFwiVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FXCIsXG4gICAgICAgICAgICBmcm9tSWZyYW1lOiB0cnVlLFxuICAgICAgICAgICAgaWZyYW1lT3JpZ2luOiB3aW5kb3cubG9jYXRpb24ub3JpZ2luLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHdpbmRvdy50b3AucG9zdE1lc3NhZ2UobWVzc2FnZVBheWxvYWQsIFwiKlwiKTtcbiAgICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFNlbnQgVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FIHRvIHRvcCB3aW5kb3cuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gd2luZG93LnRvcCBiZWNhbWUgbnVsbCBvciBzZWxmIHdpdGhpbiBzZXRUaW1lb3V0LiBDYW5ub3Qgc2VuZCBtZXNzYWdlLmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9LCA1MDApOyAvLyBEZWxheSBieSA1MDBtc1xuICAgICAgY2xlYW51cEZ1bmN0aW9ucy5wdXNoKCgpID0+IGNsZWFyVGltZW91dChyZXF1ZXN0VGltZW91dCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIHdpbmRvdy50b3AgaXMgbnVsbCwgc2FtZSBhcyBzZWxmLCBvciBpbmFjY2Vzc2libGUuIEluaXRpYWxpemluZyB3aXRoIG93biBob3N0bmFtZTogJHtpZnJhbWVPd25Ib3N0bmFtZX0uYFxuICAgICAgKTtcbiAgICAgIGluaXRpYWxpemVTY3JpcHQoaWZyYW1lT3duSG9zdG5hbWUpO1xuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIHJlc3BvbnNlTGlzdGVuZXIpOyAvLyBDbGVhbiB1cCBsaXN0ZW5lciBhcyBpdCdzIG5vdCBuZWVkZWRcbiAgICAgIGNsZWFudXBGdW5jdGlvbnMgPSBjbGVhbnVwRnVuY3Rpb25zLmZpbHRlcigoZikgPT4gZiAhPT0gcmVtb3ZlUmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgICByZXR1cm4gKCkgPT4gY2xlYW51cEZ1bmN0aW9ucy5mb3JFYWNoKChmKSA9PiBmKCkpOyAvLyBSZXR1cm4gY2xlYW51cCBpbW1lZGlhdGVseVxuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIHRpbWVvdXQgaW4gY2FzZSB0aGUgbWVzc2FnZSBuZXZlciBhcnJpdmVzXG4gICAgY29uc3QgVElNRU9VVF9EVVJBVElPTiA9IDEwMDAwOyAvLyBJbmNyZWFzZWQgdGltZW91dCB0byAxMCBzZWNvbmRzXG4gICAgZGVidWdMb2coXG4gICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBTZXR0aW5nIGZhbGxiYWNrIHRpbWVvdXQgZm9yICR7VElNRU9VVF9EVVJBVElPTn1tcy4gVGltZW91dCBJRDogJHtmYWxsYmFja1RpbWVvdXR9YFxuICAgICk7XG4gICAgZmFsbGJhY2tUaW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIEZhbGxiYWNrIHRpbWVvdXQgdHJpZ2dlcmVkLiBUaW1lb3V0IElEOiAke2ZhbGxiYWNrVGltZW91dH0uIHJlY2VpdmVkSG9zdG5hbWU6ICR7cmVjZWl2ZWRIb3N0bmFtZX1gXG4gICAgICApO1xuICAgICAgZmFsbGJhY2tUaW1lb3V0ID0gbnVsbDsgLy8gQ2xlYXIgdGhlIHRpbWVvdXQgSURcbiAgICAgIGlmICghcmVjZWl2ZWRIb3N0bmFtZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gRGlkIG5vdCByZWNlaXZlIGhvc3RuYW1lIGZyb20gdG9wIGFmdGVyICR7VElNRU9VVF9EVVJBVElPTn1tcy4gVXNpbmcgb3duIGhvc3RuYW1lOiAke2lmcmFtZU93bkhvc3RuYW1lfS4gUmVtb3ZpbmcgcmVzcG9uc2UgbGlzdGVuZXIuYFxuICAgICAgICApO1xuICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgcmVzcG9uc2VMaXN0ZW5lcik7IC8vIENsZWFuIHVwIGxpc3RlbmVyXG4gICAgICAgIGNsZWFudXBGdW5jdGlvbnMgPSBjbGVhbnVwRnVuY3Rpb25zLmZpbHRlcigoZikgPT4gZiAhPT0gcmVtb3ZlUmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgICAgIGluaXRpYWxpemVTY3JpcHQoaWZyYW1lT3duSG9zdG5hbWUpOyAvLyBJbml0aWFsaXplIHdpdGggb3duIGhvc3RuYW1lIGFzIGZhbGxiYWNrXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBGYWxsYmFjayB0aW1lb3V0IHRyaWdnZXJlZCwgYnV0IGhvc3RuYW1lIHdhcyBhbHJlYWR5IHJlY2VpdmVkLiBObyBhY3Rpb24gbmVlZGVkLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9LCBUSU1FT1VUX0RVUkFUSU9OKTtcbiAgICBjbGVhbnVwRnVuY3Rpb25zLnB1c2goKCkgPT4ge1xuICAgICAgaWYgKGZhbGxiYWNrVGltZW91dCkge1xuICAgICAgICBjbGVhclRpbWVvdXQoZmFsbGJhY2tUaW1lb3V0KTtcbiAgICAgICAgZmFsbGJhY2tUaW1lb3V0ID0gbnVsbDtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gKCkgPT4gY2xlYW51cEZ1bmN0aW9ucy5mb3JFYWNoKChmKSA9PiBmKCkpO1xufVxuIiwiaW1wb3J0IHsgTWVkaWFQcm9jZXNzb3IgfSBmcm9tIFwiLi4vbWVkaWEtcHJvY2Vzc29yXCI7XG5pbXBvcnQgeyBTZXR0aW5nc0hhbmRsZXIgfSBmcm9tIFwiLi4vc2V0dGluZ3MtaGFuZGxlclwiO1xuaW1wb3J0IHsgaXNTZXR0aW5nc0Rpc2FibGVkLCBkZWJ1Z0xvZyB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG4vKipcbiAqIENyZWF0ZXMgc3RhYmxlIGV2ZW50IGhhbmRsZXJzIGZvciBtZWRpYSBlbGVtZW50cyB0byBwcmV2ZW50IGxpc3RlbmVyIGxlYWtzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTWVkaWFFdmVudEhhbmRsZXJzKFxuICBzZXR0aW5nc0hhbmRsZXI6IFNldHRpbmdzSGFuZGxlcixcbiAgbWVkaWFQcm9jZXNzb3I6IE1lZGlhUHJvY2Vzc29yXG4pIHtcbiAgLy8gVHJhY2sgd2hpY2ggZWxlbWVudHMgaGF2ZSBoYWQgbGlzdGVuZXJzIGFkZGVkIHRvIGF2b2lkIGR1cGxpY2F0ZXNcbiAgY29uc3QgZWxlbWVudHNXaXRoTGlzdGVuZXJzID0gbmV3IFdlYWtTZXQ8SFRNTE1lZGlhRWxlbWVudD4oKTtcblxuICBjb25zdCBhcHBseVNldHRpbmdzVG9TaW5nbGVFbGVtZW50ID0gYXN5bmMgKGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQpID0+IHtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudCBjYWxsZWQgZm9yICR7XG4gICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgfWBcbiAgICApO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBzZXR0aW5nc0hhbmRsZXIuZW5zdXJlSW5pdGlhbGl6ZWQoKTtcbiAgICAgIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzSGFuZGxlci5nZXRDdXJyZW50U2V0dGluZ3MoKTtcbiAgICAgIGNvbnN0IG5lZWRzUHJvY2Vzc2luZyA9IHNldHRpbmdzSGFuZGxlci5uZWVkc0F1ZGlvUHJvY2Vzc2luZygpO1xuXG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IERFQlVHXSBBcHBseWluZyBzZXR0aW5ncyB0byBzaW5nbGUgZWxlbWVudCAke1xuICAgICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgICB9OmBcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IGlzRGlzYWJsZWQgPSBpc1NldHRpbmdzRGlzYWJsZWQoY3VycmVudFNldHRpbmdzKTtcblxuICAgICAgLy8gQXBwbHkgaW1tZWRpYXRlIHNldHRpbmdzIChzcGVlZCwgdm9sdW1lKVxuICAgICAgbWVkaWFQcm9jZXNzb3IuYXBwbHlTZXR0aW5nc0ltbWVkaWF0ZWx5KFxuICAgICAgICBbZWxlbWVudF0sXG4gICAgICAgIGN1cnJlbnRTZXR0aW5ncyxcbiAgICAgICAgaXNEaXNhYmxlZFxuICAgICAgKTtcblxuICAgICAgLy8gQXBwbHkgYXVkaW8gZWZmZWN0cyBpZiBuZWVkZWRcbiAgICAgIGlmIChuZWVkc1Byb2Nlc3NpbmcpIHtcbiAgICAgICAgaWYgKG1lZGlhUHJvY2Vzc29yLmNhbkFwcGx5QXVkaW9FZmZlY3RzKCkpIHtcbiAgICAgICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5wcm9jZXNzTWVkaWFFbGVtZW50cyhcbiAgICAgICAgICAgIFtlbGVtZW50XSxcbiAgICAgICAgICAgIGN1cnJlbnRTZXR0aW5ncyxcbiAgICAgICAgICAgIG5lZWRzUHJvY2Vzc2luZ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IuYXR0ZW1wdENvbnRleHRSZXN1bWUoKTtcbiAgICAgICAgICBpZiAobWVkaWFQcm9jZXNzb3IuY2FuQXBwbHlBdWRpb0VmZmVjdHMoKSkge1xuICAgICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IucHJvY2Vzc01lZGlhRWxlbWVudHMoXG4gICAgICAgICAgICAgIFtlbGVtZW50XSxcbiAgICAgICAgICAgICAgY3VycmVudFNldHRpbmdzLFxuICAgICAgICAgICAgICBuZWVkc1Byb2Nlc3NpbmdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gRXJyb3IgYXBwbHlpbmcgc2V0dGluZ3MgdG8gc2luZ2xlIGVsZW1lbnQgJHtcbiAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgfTpgXG4gICAgICApO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBvbkxvYWRlZE1ldGFkYXRhID0gKGV2ZW50OiBFdmVudCkgPT4ge1xuICAgIGFwcGx5U2V0dGluZ3NUb1NpbmdsZUVsZW1lbnQoZXZlbnQudGFyZ2V0IGFzIEhUTUxNZWRpYUVsZW1lbnQpO1xuICB9O1xuICBjb25zdCBvbkNhblBsYXkgPSAoZXZlbnQ6IEV2ZW50KSA9PiB7XG4gICAgYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudChldmVudC50YXJnZXQgYXMgSFRNTE1lZGlhRWxlbWVudCk7XG4gIH07XG4gIGNvbnN0IG9uTG9hZFN0YXJ0ID0gKGV2ZW50OiBFdmVudCkgPT4ge1xuICAgIGFwcGx5U2V0dGluZ3NUb1NpbmdsZUVsZW1lbnQoZXZlbnQudGFyZ2V0IGFzIEhUTUxNZWRpYUVsZW1lbnQpO1xuICB9O1xuXG4gIGNvbnN0IHJlc3VtZUNvbnRleHRIYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBFdmVudCkgPT4ge1xuICAgIGRlYnVnTG9nKFxuICAgICAgXCJDb250ZW50OiBNZWRpYSBpbnRlcmFjdGlvbiBkZXRlY3RlZCwgYXR0ZW1wdGluZyB0byByZXN1bWUgQXVkaW9Db250ZXh0LlwiXG4gICAgKTtcbiAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5hdHRlbXB0Q29udGV4dFJlc3VtZSgpO1xuICAgIGNvbnN0IHRhcmdldEVsZW1lbnQgPSBldmVudC50YXJnZXQgYXMgSFRNTE1lZGlhRWxlbWVudDtcbiAgICBpZiAodGFyZ2V0RWxlbWVudCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgc2V0dGluZ3NIYW5kbGVyLmVuc3VyZUluaXRpYWxpemVkKCk7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzSGFuZGxlci5nZXRDdXJyZW50U2V0dGluZ3MoKTtcbiAgICAgICAgY29uc3QgbmVlZHNQcm9jZXNzaW5nID0gc2V0dGluZ3NIYW5kbGVyLm5lZWRzQXVkaW9Qcm9jZXNzaW5nKCk7XG4gICAgICAgIGF3YWl0IG1lZGlhUHJvY2Vzc29yLnByb2Nlc3NNZWRpYUVsZW1lbnRzKFxuICAgICAgICAgIFt0YXJnZXRFbGVtZW50XSxcbiAgICAgICAgICBjdXJyZW50U2V0dGluZ3MsXG4gICAgICAgICAgbmVlZHNQcm9jZXNzaW5nXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgIGBDb250ZW50OiBFcnJvciBhcHBseWluZyBhdWRpbyBlZmZlY3RzIGFmdGVyIGNvbnRleHQgcmVzdW1lOmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJzKGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICBpZiAoIWVsZW1lbnRzV2l0aExpc3RlbmVycy5oYXMoZWxlbWVudCkpIHtcbiAgICAgIGVsZW1lbnRzV2l0aExpc3RlbmVycy5hZGQoZWxlbWVudCk7XG4gICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJsb2FkZWRtZXRhZGF0YVwiLCBvbkxvYWRlZE1ldGFkYXRhKTtcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNhbnBsYXlcIiwgb25DYW5QbGF5KTtcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRzdGFydFwiLCBvbkxvYWRTdGFydCk7XG4gICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJwbGF5XCIsIHJlc3VtZUNvbnRleHRIYW5kbGVyIGFzIEV2ZW50TGlzdGVuZXIpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudCxcbiAgICBhdHRhY2hMaXN0ZW5lcnMsXG4gICAgcmVzdW1lQ29udGV4dEhhbmRsZXIsXG4gIH07XG59XG4iLCJpbXBvcnQgeyBNZWRpYVByb2Nlc3NvciB9IGZyb20gXCIuLi9tZWRpYS1wcm9jZXNzb3JcIjtcbmltcG9ydCB7IFNldHRpbmdzSGFuZGxlciB9IGZyb20gXCIuLi9zZXR0aW5ncy1oYW5kbGVyXCI7XG5pbXBvcnQgeyBNZXNzYWdlVHlwZSwgaXNTZXR0aW5nc0Rpc2FibGVkLCBkZWJ1Z0xvZyB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG4vKipcbiAqIEhhbmRsZXMgVVBEQVRFX1NFVFRJTkdTIG1lc3NhZ2VzIGZyb20gYmFja2dyb3VuZC9wb3B1cC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1lc3NhZ2VIYW5kbGVyKFxuICBzZXR0aW5nc0hhbmRsZXI6IFNldHRpbmdzSGFuZGxlcixcbiAgbWVkaWFQcm9jZXNzb3I6IE1lZGlhUHJvY2Vzc29yXG4pIHtcbiAgcmV0dXJuIChcbiAgICBtZXNzYWdlOiBNZXNzYWdlVHlwZSxcbiAgICBzZW5kZXI6IGNocm9tZS5ydW50aW1lLk1lc3NhZ2VTZW5kZXIsXG4gICAgc2VuZFJlc3BvbnNlOiAocmVzcG9uc2U/OiBhbnkpID0+IHZvaWRcbiAgKSA9PiB7XG4gICAgZGVidWdMb2coXG4gICAgICBcIltDb250ZW50U2NyaXB0IExpc3RlbmVyXSBSZWNlaXZlZCBtZXNzYWdlOlwiLFxuICAgICAgSlNPTi5zdHJpbmdpZnkobWVzc2FnZSlcbiAgICApO1xuICAgIGlmIChtZXNzYWdlLnR5cGUgPT09IFwiVVBEQVRFX1NFVFRJTkdTXCIpIHtcbiAgICAgIGRlYnVnTG9nKFxuICAgICAgICBcIltDb250ZW50U2NyaXB0IExpc3RlbmVyXSBQcm9jZXNzaW5nIFVQREFURV9TRVRUSU5HUyBmcm9tIGJhY2tncm91bmQvcG9wdXBcIlxuICAgICAgKTtcbiAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgc2V0dGluZ3NIYW5kbGVyLmVuc3VyZUluaXRpYWxpemVkKCk7XG4gICAgICAgICAgc2V0dGluZ3NIYW5kbGVyLnVwZGF0ZVNldHRpbmdzKG1lc3NhZ2Uuc2V0dGluZ3MpO1xuXG4gICAgICAgICAgY29uc3QgbmV3U2V0dGluZ3MgPSBzZXR0aW5nc0hhbmRsZXIuZ2V0Q3VycmVudFNldHRpbmdzKCk7XG4gICAgICAgICAgY29uc3QgbmVlZHNQcm9jZXNzaW5nTm93ID0gc2V0dGluZ3NIYW5kbGVyLm5lZWRzQXVkaW9Qcm9jZXNzaW5nKCk7XG5cbiAgICAgICAgICBjb25zdCBtYW5hZ2VkTWVkaWFFbGVtZW50cyA9XG4gICAgICAgICAgICBtZWRpYVByb2Nlc3Nvci5nZXRNYW5hZ2VkTWVkaWFFbGVtZW50cygpO1xuICAgICAgICAgIGNvbnN0IGlzRGlzYWJsZWQgPSBpc1NldHRpbmdzRGlzYWJsZWQobmV3U2V0dGluZ3MpO1xuXG4gICAgICAgICAgaWYgKG1hbmFnZWRNZWRpYUVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIG1lZGlhUHJvY2Vzc29yLmFwcGx5U2V0dGluZ3NJbW1lZGlhdGVseShcbiAgICAgICAgICAgICAgbWFuYWdlZE1lZGlhRWxlbWVudHMsXG4gICAgICAgICAgICAgIG5ld1NldHRpbmdzLFxuICAgICAgICAgICAgICBpc0Rpc2FibGVkXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChuZWVkc1Byb2Nlc3NpbmdOb3cpIHtcbiAgICAgICAgICAgIGlmIChtZWRpYVByb2Nlc3Nvci5jYW5BcHBseUF1ZGlvRWZmZWN0cygpKSB7XG4gICAgICAgICAgICAgIGlmIChtYW5hZ2VkTWVkaWFFbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IucHJvY2Vzc01lZGlhRWxlbWVudHMoXG4gICAgICAgICAgICAgICAgICBtYW5hZ2VkTWVkaWFFbGVtZW50cyxcbiAgICAgICAgICAgICAgICAgIG5ld1NldHRpbmdzLFxuICAgICAgICAgICAgICAgICAgbmVlZHNQcm9jZXNzaW5nTm93XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmcmVzaFNjYW5FbGVtZW50cyA9IG1lZGlhUHJvY2Vzc29yLmZpbmRNZWRpYUVsZW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgaWYgKGZyZXNoU2NhbkVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgIG1lZGlhUHJvY2Vzc29yLmFwcGx5U2V0dGluZ3NJbW1lZGlhdGVseShcbiAgICAgICAgICAgICAgICAgICAgZnJlc2hTY2FuRWxlbWVudHMsXG4gICAgICAgICAgICAgICAgICAgIG5ld1NldHRpbmdzLFxuICAgICAgICAgICAgICAgICAgICBpc0Rpc2FibGVkXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgaWYgKCFpc0Rpc2FibGVkICYmIG5lZWRzUHJvY2Vzc2luZ05vdykge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5wcm9jZXNzTWVkaWFFbGVtZW50cyhcbiAgICAgICAgICAgICAgICAgICAgICBmcmVzaFNjYW5FbGVtZW50cyxcbiAgICAgICAgICAgICAgICAgICAgICBuZXdTZXR0aW5ncyxcbiAgICAgICAgICAgICAgICAgICAgICBuZWVkc1Byb2Nlc3NpbmdOb3dcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKG1hbmFnZWRNZWRpYUVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IucHJvY2Vzc01lZGlhRWxlbWVudHMoXG4gICAgICAgICAgICAgICAgbWFuYWdlZE1lZGlhRWxlbWVudHMsXG4gICAgICAgICAgICAgICAgbmV3U2V0dGluZ3MsXG4gICAgICAgICAgICAgICAgbmVlZHNQcm9jZXNzaW5nTm93XG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjb25zdCBmcmVzaFNjYW5FbGVtZW50cyA9IG1lZGlhUHJvY2Vzc29yLmZpbmRNZWRpYUVsZW1lbnRzKCk7XG4gICAgICAgICAgICAgIGlmIChmcmVzaFNjYW5FbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IucHJvY2Vzc01lZGlhRWxlbWVudHMoXG4gICAgICAgICAgICAgICAgICBmcmVzaFNjYW5FbGVtZW50cyxcbiAgICAgICAgICAgICAgICAgIG5ld1NldHRpbmdzLFxuICAgICAgICAgICAgICAgICAgbmVlZHNQcm9jZXNzaW5nTm93XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgXCJDb250ZW50OiBFcnJvciBkdXJpbmcgVVBEQVRFX1NFVFRJTkdTIHByb2Nlc3Npbmc6XCIsXG4gICAgICAgICAgICBlcnJvclxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pKCk7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IE1lZGlhUHJvY2Vzc29yIH0gZnJvbSBcIi4uL21lZGlhLXByb2Nlc3NvclwiO1xuaW1wb3J0IHsgU2V0dGluZ3NIYW5kbGVyIH0gZnJvbSBcIi4uL3NldHRpbmdzLWhhbmRsZXJcIjtcbmltcG9ydCB7IGlzU2V0dGluZ3NEaXNhYmxlZCwgZGVidWdMb2cgfSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuLyoqXG4gKiBTZXRzIHVwIERPTSBsaWZlY3ljbGUgb2JzZXJ2ZXJzIGFuZCBpbml0aWFsIHNldHRpbmdzIGFwcGxpY2F0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBEb21MaWZlY3ljbGUoXG4gIHNldHRpbmdzSGFuZGxlcjogU2V0dGluZ3NIYW5kbGVyLFxuICBtZWRpYVByb2Nlc3NvcjogTWVkaWFQcm9jZXNzb3IsXG4gIHByb2Nlc3NNZWRpYTogKCkgPT4gUHJvbWlzZTxib29sZWFuPlxuKTogKCgpID0+IHZvaWQpW10ge1xuICBjb25zdCBjbGVhbnVwRnVuY3Rpb25zOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG4gIC8vIEFwcGx5IHNldHRpbmdzIGltbWVkaWF0ZWx5IGFmdGVyIERPTUNvbnRlbnRMb2FkZWQgb3IgaWYgRE9NIGlzIGFscmVhZHkgcmVhZHlcbiAgY29uc3QgYXBwbHlJbml0aWFsU2V0dGluZ3MgPSBhc3luYyAoKSA9PiB7XG4gICAgZGVidWdMb2coXG4gICAgICBgW0NvbnRlbnRTY3JpcHQgREVCVUddIEFwcGx5aW5nIGluaXRpYWwgc2V0dGluZ3MgZm9yICR7d2luZG93LmxvY2F0aW9uLmhvc3RuYW1lfWBcbiAgICApO1xuICAgIGF3YWl0IHByb2Nlc3NNZWRpYSgpO1xuICB9O1xuXG4gIGNvbnN0IGRvbUNvbnRlbnRMb2FkZWRMaXN0ZW5lciA9ICgpID0+IHtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gRE9NQ29udGVudExvYWRlZCBldmVudCBmb3IgJHt3aW5kb3cubG9jYXRpb24uaG9zdG5hbWV9YFxuICAgICk7XG4gICAgYXBwbHlJbml0aWFsU2V0dGluZ3MoKTtcbiAgfTtcblxuICBpZiAoZG9jdW1lbnQucmVhZHlTdGF0ZSA9PT0gXCJsb2FkaW5nXCIpIHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiRE9NQ29udGVudExvYWRlZFwiLCBkb21Db250ZW50TG9hZGVkTGlzdGVuZXIpO1xuICAgIGNsZWFudXBGdW5jdGlvbnMucHVzaCgoKSA9PlxuICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIkRPTUNvbnRlbnRMb2FkZWRcIiwgZG9tQ29udGVudExvYWRlZExpc3RlbmVyKVxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgYXBwbHlJbml0aWFsU2V0dGluZ3MoKTtcbiAgfVxuXG4gIC8vIFdhdGNoIGZvciBkeW5hbWljIGNoYW5nZXNcbiAgY29uc3QgbWVkaWFPYnNlcnZlciA9IE1lZGlhUHJvY2Vzc29yLnNldHVwTWVkaWFPYnNlcnZlcihcbiAgICBhc3luYyAoYWRkZWRFbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiB7XG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0XSBQcm9jZXNzaW5nICR7YWRkZWRFbGVtZW50cy5sZW5ndGh9IG5ld2x5IGFkZGVkIG1lZGlhIGVsZW1lbnRzLmBcbiAgICAgICk7XG4gICAgICBhd2FpdCBzZXR0aW5nc0hhbmRsZXIuZW5zdXJlSW5pdGlhbGl6ZWQoKTtcbiAgICAgIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzSGFuZGxlci5nZXRDdXJyZW50U2V0dGluZ3MoKTtcbiAgICAgIGNvbnN0IG5lZWRzUHJvY2Vzc2luZyA9IHNldHRpbmdzSGFuZGxlci5uZWVkc0F1ZGlvUHJvY2Vzc2luZygpO1xuXG4gICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5wcm9jZXNzTWVkaWFFbGVtZW50cyhcbiAgICAgICAgYWRkZWRFbGVtZW50cyxcbiAgICAgICAgY3VycmVudFNldHRpbmdzLFxuICAgICAgICBuZWVkc1Byb2Nlc3NpbmdcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IGlzRGlzYWJsZWQgPSBpc1NldHRpbmdzRGlzYWJsZWQoY3VycmVudFNldHRpbmdzKTtcbiAgICAgIG1lZGlhUHJvY2Vzc29yLmFwcGx5U2V0dGluZ3NJbW1lZGlhdGVseShcbiAgICAgICAgYWRkZWRFbGVtZW50cyxcbiAgICAgICAgY3VycmVudFNldHRpbmdzLFxuICAgICAgICBpc0Rpc2FibGVkXG4gICAgICApO1xuICAgIH0sXG4gICAgKHJlbW92ZWRFbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiB7XG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0XSBDbGVhbmluZyB1cCAke3JlbW92ZWRFbGVtZW50cy5sZW5ndGh9IHJlbW92ZWQgbWVkaWEgZWxlbWVudHMuYFxuICAgICAgKTtcbiAgICAgIHJlbW92ZWRFbGVtZW50cy5mb3JFYWNoKChlbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50KSA9PiB7XG4gICAgICAgIG1lZGlhUHJvY2Vzc29yLmF1ZGlvUHJvY2Vzc29yLmRpc2Nvbm5lY3RFbGVtZW50Tm9kZXMoZWxlbWVudCk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVtYWluaW5nTWFuYWdlZEVsZW1lbnRzID0gbWVkaWFQcm9jZXNzb3IuZ2V0TWFuYWdlZE1lZGlhRWxlbWVudHMoKTtcbiAgICAgIGlmIChcbiAgICAgICAgcmVtYWluaW5nTWFuYWdlZEVsZW1lbnRzLmxlbmd0aCA9PT0gMCAmJlxuICAgICAgICAhc2V0dGluZ3NIYW5kbGVyLm5lZWRzQXVkaW9Qcm9jZXNzaW5nKClcbiAgICAgICkge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBcIltDb250ZW50U2NyaXB0XSBObyBtYW5hZ2VkIG1lZGlhIGVsZW1lbnRzIGxlZnQuIENsZWFuaW5nIHVwIEF1ZGlvUHJvY2Vzc29yLlwiXG4gICAgICAgICk7XG4gICAgICAgIG1lZGlhUHJvY2Vzc29yLmF1ZGlvUHJvY2Vzc29yLmNsZWFudXAoKTtcbiAgICAgIH1cbiAgICB9XG4gICk7XG4gIGNsZWFudXBGdW5jdGlvbnMucHVzaCgoKSA9PiBtZWRpYU9ic2VydmVyLmRpc2Nvbm5lY3QoKSk7XG5cbiAgLy8gRW5zdXJlIEF1ZGlvQ29udGV4dCBpcyBjbG9zZWQgd2hlbiB0aGUgcGFnZSBpcyB1bmxvYWRlZFxuICBjb25zdCBiZWZvcmVVbmxvYWRMaXN0ZW5lciA9ICgpID0+IHtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIFwiW0NvbnRlbnRTY3JpcHRdIFBhZ2UgaXMgdW5sb2FkaW5nLiBQZXJmb3JtaW5nIGZpbmFsIEF1ZGlvUHJvY2Vzc29yIGNsZWFudXAuXCJcbiAgICApO1xuICAgIG1lZGlhUHJvY2Vzc29yLmF1ZGlvUHJvY2Vzc29yLmNsZWFudXAoKTtcbiAgfTtcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJiZWZvcmV1bmxvYWRcIiwgYmVmb3JlVW5sb2FkTGlzdGVuZXIpO1xuICBjbGVhbnVwRnVuY3Rpb25zLnB1c2goKCkgPT5cbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImJlZm9yZXVubG9hZFwiLCBiZWZvcmVVbmxvYWRMaXN0ZW5lcilcbiAgKTtcblxuICByZXR1cm4gY2xlYW51cEZ1bmN0aW9ucztcbn1cbiIsImltcG9ydCB7IE1lZGlhUHJvY2Vzc29yIH0gZnJvbSBcIi4vbWVkaWEtcHJvY2Vzc29yXCI7XG5pbXBvcnQgeyBTZXR0aW5nc0hhbmRsZXIgfSBmcm9tIFwiLi9zZXR0aW5ncy1oYW5kbGVyXCI7XG5pbXBvcnQgeyBNZXNzYWdlVHlwZSwgaXNTZXR0aW5nc0Rpc2FibGVkICwgZGVidWdMb2cgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgY3JlYXRlTWVkaWFFdmVudEhhbmRsZXJzIH0gZnJvbSBcIi4vY29udGVudC1zY3JpcHQvbWVkaWEtZXZlbnRzXCI7XG5pbXBvcnQgeyBjcmVhdGVNZXNzYWdlSGFuZGxlciB9IGZyb20gXCIuL2NvbnRlbnQtc2NyaXB0L21lc3NhZ2UtaGFuZGxlclwiO1xuaW1wb3J0IHsgc2V0dXBEb21MaWZlY3ljbGUgfSBmcm9tIFwiLi9jb250ZW50LXNjcmlwdC9kb20tbGlmZWN5Y2xlXCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBpbml0aWFsaXplQ29udGVudFNjcmlwdChcbiAgc2V0dGluZ3NIYW5kbGVyOiBTZXR0aW5nc0hhbmRsZXIsXG4gIG1lZGlhUHJvY2Vzc29yOiBNZWRpYVByb2Nlc3NvcixcbiAgaG9zdG5hbWU6IHN0cmluZ1xuKTogUHJvbWlzZTwoKSA9PiB2b2lkPiB7XG4gIGRlYnVnTG9nKGBbQ29udGVudFNjcmlwdF0gSW5pdGlhbGl6aW5nIHNjcmlwdCBmb3IgaG9zdG5hbWU6ICR7aG9zdG5hbWV9YCk7XG4gIHNldHRpbmdzSGFuZGxlci5pbml0aWFsaXplKGhvc3RuYW1lKTtcblxuICBjb25zdCBjbGVhbnVwRnVuY3Rpb25zOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG4gIC8vIENyZWF0ZSBzdGFibGUgZXZlbnQgaGFuZGxlcnNcbiAgY29uc3QgeyBhcHBseVNldHRpbmdzVG9TaW5nbGVFbGVtZW50LCBhdHRhY2hMaXN0ZW5lcnMgfSA9XG4gICAgY3JlYXRlTWVkaWFFdmVudEhhbmRsZXJzKHNldHRpbmdzSGFuZGxlciwgbWVkaWFQcm9jZXNzb3IpO1xuXG4gIC8vIFByb2Nlc3MgbWVkaWEgd2l0aCBjdXJyZW50IHNldHRpbmdzXG4gIGNvbnN0IHByb2Nlc3NNZWRpYSA9IGFzeW5jICgpID0+IHtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gcHJvY2Vzc01lZGlhIGNhbGxlZCBmb3IgJHt3aW5kb3cubG9jYXRpb24uaG9zdG5hbWV9YFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUudGltZShcImVuc3VyZUluaXRpYWxpemVkXCIpO1xuICAgICAgYXdhaXQgc2V0dGluZ3NIYW5kbGVyLmVuc3VyZUluaXRpYWxpemVkKCk7XG4gICAgICBjb25zb2xlLnRpbWVFbmQoXCJlbnN1cmVJbml0aWFsaXplZFwiKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS50aW1lRW5kKFwiZW5zdXJlSW5pdGlhbGl6ZWRcIik7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBgW0NvbnRlbnRTY3JpcHQgREVCVUddIEVycm9yIGVuc3VyaW5nIHNldHRpbmdzIGluaXRpYWxpemVkOmBcbiAgICAgICk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzSGFuZGxlci5nZXRDdXJyZW50U2V0dGluZ3MoKTtcbiAgICAgIGNvbnN0IGlzRGlzYWJsZWQgPSBpc1NldHRpbmdzRGlzYWJsZWQoY3VycmVudFNldHRpbmdzKTtcblxuICAgICAgY29uc3QgbWVkaWFFbGVtZW50cyA9IG1lZGlhUHJvY2Vzc29yLmZpbmRNZWRpYUVsZW1lbnRzKCk7XG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IERFQlVHXSBGb3VuZCAke21lZGlhRWxlbWVudHMubGVuZ3RofSBtZWRpYSBlbGVtZW50c2BcbiAgICAgICk7XG5cbiAgICAgIG1lZGlhRWxlbWVudHMuZm9yRWFjaCgoZWxlbWVudCkgPT4ge1xuICAgICAgICBhdHRhY2hMaXN0ZW5lcnMoZWxlbWVudCk7XG4gICAgICAgIGlmICghaXNEaXNhYmxlZCkge1xuICAgICAgICAgIGFwcGx5U2V0dGluZ3NUb1NpbmdsZUVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKHByb2Nlc3NpbmdFcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IERFQlVHXSBFcnJvciBkdXJpbmcgbWVkaWEgcHJvY2Vzc2luZyBzdGVwczpgXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvLyBTZXQgdXAgbWVzc2FnZSBsaXN0ZW5lclxuICBpZiAoXG4gICAgdHlwZW9mIGNocm9tZSAhPT0gXCJ1bmRlZmluZWRcIiAmJlxuICAgIGNocm9tZS5ydW50aW1lICYmXG4gICAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlXG4gICkge1xuICAgIGNvbnN0IG1lc3NhZ2VIYW5kbGVyID0gY3JlYXRlTWVzc2FnZUhhbmRsZXIoc2V0dGluZ3NIYW5kbGVyLCBtZWRpYVByb2Nlc3Nvcik7XG4gICAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKG1lc3NhZ2VIYW5kbGVyKTtcbiAgICBjbGVhbnVwRnVuY3Rpb25zLnB1c2goKCkgPT5cbiAgICAgIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5yZW1vdmVMaXN0ZW5lcihtZXNzYWdlSGFuZGxlcilcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUuZGVidWcoXG4gICAgICBcIltDb250ZW50U2NyaXB0XSBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2Ugbm90IGF2YWlsYWJsZSAtIHNraXBwaW5nIG1lc3NhZ2UgbGlzdGVuZXIgc2V0dXBcIlxuICAgICk7XG4gIH1cblxuICAvLyBTZXQgdXAgRE9NIGxpZmVjeWNsZSAoaW5pdGlhbCBzZXR0aW5ncywgbXV0YXRpb24gb2JzZXJ2ZXIsIGJlZm9yZXVubG9hZClcbiAgY29uc3QgZG9tQ2xlYW51cCA9IHNldHVwRG9tTGlmZWN5Y2xlKFxuICAgIHNldHRpbmdzSGFuZGxlcixcbiAgICBtZWRpYVByb2Nlc3NvcixcbiAgICBwcm9jZXNzTWVkaWFcbiAgKTtcbiAgY2xlYW51cEZ1bmN0aW9ucy5wdXNoKC4uLmRvbUNsZWFudXApO1xuXG4gIHJldHVybiAoKSA9PiB7XG4gICAgZGVidWdMb2coXCJbQ29udGVudFNjcmlwdF0gUnVubmluZyBjbGVhbnVwIGZ1bmN0aW9ucy5cIik7XG4gICAgY2xlYW51cEZ1bmN0aW9ucy5mb3JFYWNoKChjbGVhbnVwKSA9PiBjbGVhbnVwKCkpO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgZGVmaW5lQ29udGVudFNjcmlwdCB9IGZyb20gXCJ3eHQvc2FuZGJveFwiO1xuaW1wb3J0IHsgTWVkaWFQcm9jZXNzb3IgfSBmcm9tIFwiLi8uLi9zcmMvbWVkaWEtcHJvY2Vzc29yXCI7XG5pbXBvcnQgeyBTZXR0aW5nc0hhbmRsZXIgfSBmcm9tIFwiLi4vc3JjL3NldHRpbmdzLWhhbmRsZXJcIjtcbmltcG9ydCB7IHNldHVwSG9zdG5hbWVEZXRlY3Rpb24gfSBmcm9tIFwiLi4vc3JjL2lmcmFtZS1ob3N0bmFtZS1oYW5kbGVyXCI7XG5pbXBvcnQgeyBpbml0aWFsaXplQ29udGVudFNjcmlwdCB9IGZyb20gXCIuLi9zcmMvY29udGVudC1zY3JpcHQtaW5pdFwiO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tIFwiLi4vc3JjL3R5cGVzXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbnRlbnRTY3JpcHQoe1xuICBtYXRjaGVzOiBbXCJodHRwOi8vKi8qXCIsIFwiaHR0cHM6Ly8qLypcIiwgXCJmaWxlOi8vKi8qXCJdLFxuICBhbGxGcmFtZXM6IHRydWUsXG4gIHJ1bkF0OiBcImRvY3VtZW50X2lkbGVcIixcbiAgbWFpbjogYXN5bmMgKCkgPT4ge1xuICAgIC8vIEdsb2JhbCBzYWZldHkgY2hlY2sgZm9yIENocm9tZSBleHRlbnNpb24gQVBJc1xuICAgIGlmICh0eXBlb2YgY2hyb21lID09PSAndW5kZWZpbmVkJyB8fCBcbiAgICAgICAgdHlwZW9mIGNocm9tZS5ydW50aW1lID09PSAndW5kZWZpbmVkJyB8fCBcbiAgICAgICAgdHlwZW9mIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Nocm9tZSBleHRlbnNpb24gQVBJcyBhcmUgbm90IGF2YWlsYWJsZS4gU2tpcHBpbmcgY29udGVudCBzY3JpcHQgZXhlY3V0aW9uLicpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGRlYnVnTG9nKFxuICAgICAgXCJDb250ZW50OiBTY3JpcHQgc3RhcnRpbmcgLSBUaGlzIGxvZyBzaG91bGQgYWx3YXlzIGFwcGVhclwiLFxuICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWZcbiAgICApO1xuICAgIFxuICAgIC8vIFNraXAgcHJvY2Vzc2luZyBmb3IgZmlsZSBVUkxzXG4gICAgaWYgKHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gJ2ZpbGU6Jykge1xuICAgICAgZGVidWdMb2coJ1NraXBwaW5nIGNvbnRlbnQgc2NyaXB0IGZvciBmaWxlIFVSTCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEluaXRpYWxpemUgY29yZSBjb21wb25lbnRzXG4gICAgY29uc3Qgc2V0dGluZ3NIYW5kbGVyID0gbmV3IFNldHRpbmdzSGFuZGxlcigpO1xuICAgIGNvbnN0IG1lZGlhUHJvY2Vzc29yID0gbmV3IE1lZGlhUHJvY2Vzc29yKCk7XG5cbiAgICBsZXQgaG9zdG5hbWVEZXRlY3Rpb25DbGVhbnVwOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgY29udGVudFNjcmlwdENsZWFudXA6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXG4gICAgLy8gU3RhcnQgdGhlIGhvc3RuYW1lIGRldGVjdGlvbiBhbmQgc2NyaXB0IGluaXRpYWxpemF0aW9uIHByb2Nlc3NcbiAgICBob3N0bmFtZURldGVjdGlvbkNsZWFudXAgPSBzZXR1cEhvc3RuYW1lRGV0ZWN0aW9uKGFzeW5jIChob3N0bmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICBjb250ZW50U2NyaXB0Q2xlYW51cCA9IGF3YWl0IGluaXRpYWxpemVDb250ZW50U2NyaXB0KHNldHRpbmdzSGFuZGxlciwgbWVkaWFQcm9jZXNzb3IsIGhvc3RuYW1lKTtcbiAgICB9KTtcblxuICAgIC8vIEFkZCBhIGxpc3RlbmVyIGZvciBwYWdlIHVubG9hZCB0byBwZXJmb3JtIGNsZWFudXBcbiAgICBjb25zdCBiZWZvcmVVbmxvYWRMaXN0ZW5lciA9ICgpID0+IHtcbiAgICAgIGRlYnVnTG9nKFwiW0NvbnRlbnRTY3JpcHRdIFBhZ2UgaXMgdW5sb2FkaW5nLiBQZXJmb3JtaW5nIG92ZXJhbGwgY2xlYW51cC5cIik7XG4gICAgICBpZiAoaG9zdG5hbWVEZXRlY3Rpb25DbGVhbnVwKSB7XG4gICAgICAgIGhvc3RuYW1lRGV0ZWN0aW9uQ2xlYW51cCgpO1xuICAgICAgICBob3N0bmFtZURldGVjdGlvbkNsZWFudXAgPSBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKGNvbnRlbnRTY3JpcHRDbGVhbnVwKSB7XG4gICAgICAgIGNvbnRlbnRTY3JpcHRDbGVhbnVwKCk7XG4gICAgICAgIGNvbnRlbnRTY3JpcHRDbGVhbnVwID0gbnVsbDtcbiAgICAgIH1cbiAgICB9O1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdiZWZvcmV1bmxvYWQnLCBiZWZvcmVVbmxvYWRMaXN0ZW5lcik7XG4gIH0sXG59KTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsLCBmYWN0b3J5KSB7XG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShcIndlYmV4dGVuc2lvbi1wb2x5ZmlsbFwiLCBbXCJtb2R1bGVcIl0sIGZhY3RvcnkpO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgZmFjdG9yeShtb2R1bGUpO1xuICB9IGVsc2Uge1xuICAgIHZhciBtb2QgPSB7XG4gICAgICBleHBvcnRzOiB7fVxuICAgIH07XG4gICAgZmFjdG9yeShtb2QpO1xuICAgIGdsb2JhbC5icm93c2VyID0gbW9kLmV4cG9ydHM7XG4gIH1cbn0pKHR5cGVvZiBnbG9iYWxUaGlzICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsVGhpcyA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHRoaXMsIGZ1bmN0aW9uIChtb2R1bGUpIHtcbiAgLyogd2ViZXh0ZW5zaW9uLXBvbHlmaWxsIC0gdjAuMTIuMCAtIFR1ZSBNYXkgMTQgMjAyNCAxODowMToyOSAqL1xuICAvKiAtKi0gTW9kZTogaW5kZW50LXRhYnMtbW9kZTogbmlsOyBqcy1pbmRlbnQtbGV2ZWw6IDIgLSotICovXG4gIC8qIHZpbTogc2V0IHN0cz0yIHN3PTIgZXQgdHc9ODA6ICovXG4gIC8qIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAgICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICAgKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLiAqL1xuICBcInVzZSBzdHJpY3RcIjtcblxuICBpZiAoIShnbG9iYWxUaGlzLmNocm9tZSAmJiBnbG9iYWxUaGlzLmNocm9tZS5ydW50aW1lICYmIGdsb2JhbFRoaXMuY2hyb21lLnJ1bnRpbWUuaWQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiVGhpcyBzY3JpcHQgc2hvdWxkIG9ubHkgYmUgbG9hZGVkIGluIGEgYnJvd3NlciBleHRlbnNpb24uXCIpO1xuICB9XG4gIGlmICghKGdsb2JhbFRoaXMuYnJvd3NlciAmJiBnbG9iYWxUaGlzLmJyb3dzZXIucnVudGltZSAmJiBnbG9iYWxUaGlzLmJyb3dzZXIucnVudGltZS5pZCkpIHtcbiAgICBjb25zdCBDSFJPTUVfU0VORF9NRVNTQUdFX0NBTExCQUNLX05PX1JFU1BPTlNFX01FU1NBR0UgPSBcIlRoZSBtZXNzYWdlIHBvcnQgY2xvc2VkIGJlZm9yZSBhIHJlc3BvbnNlIHdhcyByZWNlaXZlZC5cIjtcblxuICAgIC8vIFdyYXBwaW5nIHRoZSBidWxrIG9mIHRoaXMgcG9seWZpbGwgaW4gYSBvbmUtdGltZS11c2UgZnVuY3Rpb24gaXMgYSBtaW5vclxuICAgIC8vIG9wdGltaXphdGlvbiBmb3IgRmlyZWZveC4gU2luY2UgU3BpZGVybW9ua2V5IGRvZXMgbm90IGZ1bGx5IHBhcnNlIHRoZVxuICAgIC8vIGNvbnRlbnRzIG9mIGEgZnVuY3Rpb24gdW50aWwgdGhlIGZpcnN0IHRpbWUgaXQncyBjYWxsZWQsIGFuZCBzaW5jZSBpdCB3aWxsXG4gICAgLy8gbmV2ZXIgYWN0dWFsbHkgbmVlZCB0byBiZSBjYWxsZWQsIHRoaXMgYWxsb3dzIHRoZSBwb2x5ZmlsbCB0byBiZSBpbmNsdWRlZFxuICAgIC8vIGluIEZpcmVmb3ggbmVhcmx5IGZvciBmcmVlLlxuICAgIGNvbnN0IHdyYXBBUElzID0gZXh0ZW5zaW9uQVBJcyA9PiB7XG4gICAgICAvLyBOT1RFOiBhcGlNZXRhZGF0YSBpcyBhc3NvY2lhdGVkIHRvIHRoZSBjb250ZW50IG9mIHRoZSBhcGktbWV0YWRhdGEuanNvbiBmaWxlXG4gICAgICAvLyBhdCBidWlsZCB0aW1lIGJ5IHJlcGxhY2luZyB0aGUgZm9sbG93aW5nIFwiaW5jbHVkZVwiIHdpdGggdGhlIGNvbnRlbnQgb2YgdGhlXG4gICAgICAvLyBKU09OIGZpbGUuXG4gICAgICBjb25zdCBhcGlNZXRhZGF0YSA9IHtcbiAgICAgICAgXCJhbGFybXNcIjoge1xuICAgICAgICAgIFwiY2xlYXJcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJjbGVhckFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImJvb2ttYXJrc1wiOiB7XG4gICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRDaGlsZHJlblwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFJlY2VudFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFN1YlRyZWVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRUcmVlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVRyZWVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZWFyY2hcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJicm93c2VyQWN0aW9uXCI6IHtcbiAgICAgICAgICBcImRpc2FibGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJlbmFibGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRCYWRnZUJhY2tncm91bmRDb2xvclwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEJhZGdlVGV4dFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFBvcHVwXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0VGl0bGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJvcGVuUG9wdXBcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRCYWRnZUJhY2tncm91bmRDb2xvclwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldEJhZGdlVGV4dFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldEljb25cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRQb3B1cFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFRpdGxlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYnJvd3NpbmdEYXRhXCI6IHtcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUNhY2hlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlQ29va2llc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZURvd25sb2Fkc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUZvcm1EYXRhXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlSGlzdG9yeVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUxvY2FsU3RvcmFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVBhc3N3b3Jkc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVBsdWdpbkRhdGFcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXR0aW5nc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNvbW1hbmRzXCI6IHtcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNvbnRleHRNZW51c1wiOiB7XG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjb29raWVzXCI6IHtcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbENvb2tpZVN0b3Jlc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImRldnRvb2xzXCI6IHtcbiAgICAgICAgICBcImluc3BlY3RlZFdpbmRvd1wiOiB7XG4gICAgICAgICAgICBcImV2YWxcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDIsXG4gICAgICAgICAgICAgIFwic2luZ2xlQ2FsbGJhY2tBcmdcIjogZmFsc2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicGFuZWxzXCI6IHtcbiAgICAgICAgICAgIFwiY3JlYXRlXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDMsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAzLFxuICAgICAgICAgICAgICBcInNpbmdsZUNhbGxiYWNrQXJnXCI6IHRydWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImVsZW1lbnRzXCI6IHtcbiAgICAgICAgICAgICAgXCJjcmVhdGVTaWRlYmFyUGFuZVwiOiB7XG4gICAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkb3dubG9hZHNcIjoge1xuICAgICAgICAgIFwiY2FuY2VsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZG93bmxvYWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJlcmFzZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEZpbGVJY29uXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwib3BlblwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInBhdXNlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlRmlsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlc3VtZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlYXJjaFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNob3dcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJleHRlbnNpb25cIjoge1xuICAgICAgICAgIFwiaXNBbGxvd2VkRmlsZVNjaGVtZUFjY2Vzc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImlzQWxsb3dlZEluY29nbml0b0FjY2Vzc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImhpc3RvcnlcIjoge1xuICAgICAgICAgIFwiYWRkVXJsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZGVsZXRlQWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZGVsZXRlUmFuZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZWxldGVVcmxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRWaXNpdHNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZWFyY2hcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJpMThuXCI6IHtcbiAgICAgICAgICBcImRldGVjdExhbmd1YWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWNjZXB0TGFuZ3VhZ2VzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiaWRlbnRpdHlcIjoge1xuICAgICAgICAgIFwibGF1bmNoV2ViQXV0aEZsb3dcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJpZGxlXCI6IHtcbiAgICAgICAgICBcInF1ZXJ5U3RhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJtYW5hZ2VtZW50XCI6IHtcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFNlbGZcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRFbmFibGVkXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwidW5pbnN0YWxsU2VsZlwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcIm5vdGlmaWNhdGlvbnNcIjoge1xuICAgICAgICAgIFwiY2xlYXJcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRQZXJtaXNzaW9uTGV2ZWxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJwYWdlQWN0aW9uXCI6IHtcbiAgICAgICAgICBcImdldFBvcHVwXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0VGl0bGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0SWNvblwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFBvcHVwXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0VGl0bGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzaG93XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicGVybWlzc2lvbnNcIjoge1xuICAgICAgICAgIFwiY29udGFpbnNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZXF1ZXN0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicnVudGltZVwiOiB7XG4gICAgICAgICAgXCJnZXRCYWNrZ3JvdW5kUGFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFBsYXRmb3JtSW5mb1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm9wZW5PcHRpb25zUGFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlcXVlc3RVcGRhdGVDaGVja1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlbmRNZXNzYWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDNcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2VuZE5hdGl2ZU1lc3NhZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRVbmluc3RhbGxVUkxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzZXNzaW9uc1wiOiB7XG4gICAgICAgICAgXCJnZXREZXZpY2VzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0UmVjZW50bHlDbG9zZWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZXN0b3JlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwic3RvcmFnZVwiOiB7XG4gICAgICAgICAgXCJsb2NhbFwiOiB7XG4gICAgICAgICAgICBcImNsZWFyXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldEJ5dGVzSW5Vc2VcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwic2V0XCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1hbmFnZWRcIjoge1xuICAgICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldEJ5dGVzSW5Vc2VcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3luY1wiOiB7XG4gICAgICAgICAgICBcImNsZWFyXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldEJ5dGVzSW5Vc2VcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwic2V0XCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInRhYnNcIjoge1xuICAgICAgICAgIFwiY2FwdHVyZVZpc2libGVUYWJcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZXRlY3RMYW5ndWFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRpc2NhcmRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkdXBsaWNhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJleGVjdXRlU2NyaXB0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0Q3VycmVudFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFpvb21cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRab29tU2V0dGluZ3NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnb0JhY2tcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnb0ZvcndhcmRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdobGlnaHRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJpbnNlcnRDU1NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicXVlcnlcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZWxvYWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVDU1NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZW5kTWVzc2FnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAzXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFpvb21cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRab29tU2V0dGluZ3NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b3BTaXRlc1wiOiB7XG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJ3ZWJOYXZpZ2F0aW9uXCI6IHtcbiAgICAgICAgICBcImdldEFsbEZyYW1lc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEZyYW1lXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwid2ViUmVxdWVzdFwiOiB7XG4gICAgICAgICAgXCJoYW5kbGVyQmVoYXZpb3JDaGFuZ2VkXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwid2luZG93c1wiOiB7XG4gICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRDdXJyZW50XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0TGFzdEZvY3VzZWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGlmIChPYmplY3Qua2V5cyhhcGlNZXRhZGF0YSkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcImFwaS1tZXRhZGF0YS5qc29uIGhhcyBub3QgYmVlbiBpbmNsdWRlZCBpbiBicm93c2VyLXBvbHlmaWxsXCIpO1xuICAgICAgfVxuXG4gICAgICAvKipcbiAgICAgICAqIEEgV2Vha01hcCBzdWJjbGFzcyB3aGljaCBjcmVhdGVzIGFuZCBzdG9yZXMgYSB2YWx1ZSBmb3IgYW55IGtleSB3aGljaCBkb2VzXG4gICAgICAgKiBub3QgZXhpc3Qgd2hlbiBhY2Nlc3NlZCwgYnV0IGJlaGF2ZXMgZXhhY3RseSBhcyBhbiBvcmRpbmFyeSBXZWFrTWFwXG4gICAgICAgKiBvdGhlcndpc2UuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY3JlYXRlSXRlbVxuICAgICAgICogICAgICAgIEEgZnVuY3Rpb24gd2hpY2ggd2lsbCBiZSBjYWxsZWQgaW4gb3JkZXIgdG8gY3JlYXRlIHRoZSB2YWx1ZSBmb3IgYW55XG4gICAgICAgKiAgICAgICAga2V5IHdoaWNoIGRvZXMgbm90IGV4aXN0LCB0aGUgZmlyc3QgdGltZSBpdCBpcyBhY2Nlc3NlZC4gVGhlXG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24gcmVjZWl2ZXMsIGFzIGl0cyBvbmx5IGFyZ3VtZW50LCB0aGUga2V5IGJlaW5nIGNyZWF0ZWQuXG4gICAgICAgKi9cbiAgICAgIGNsYXNzIERlZmF1bHRXZWFrTWFwIGV4dGVuZHMgV2Vha01hcCB7XG4gICAgICAgIGNvbnN0cnVjdG9yKGNyZWF0ZUl0ZW0sIGl0ZW1zID0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgc3VwZXIoaXRlbXMpO1xuICAgICAgICAgIHRoaXMuY3JlYXRlSXRlbSA9IGNyZWF0ZUl0ZW07XG4gICAgICAgIH1cbiAgICAgICAgZ2V0KGtleSkge1xuICAgICAgICAgIGlmICghdGhpcy5oYXMoa2V5KSkge1xuICAgICAgICAgICAgdGhpcy5zZXQoa2V5LCB0aGlzLmNyZWF0ZUl0ZW0oa2V5KSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzdXBlci5nZXQoa2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvKipcbiAgICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGFuIG9iamVjdCB3aXRoIGEgYHRoZW5gIG1ldGhvZCwgYW5kIGNhblxuICAgICAgICogdGhlcmVmb3JlIGJlIGFzc3VtZWQgdG8gYmVoYXZlIGFzIGEgUHJvbWlzZS5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byB0ZXN0LlxuICAgICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlIHZhbHVlIGlzIHRoZW5hYmxlLlxuICAgICAgICovXG4gICAgICBjb25zdCBpc1RoZW5hYmxlID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmIHR5cGVvZiB2YWx1ZS50aGVuID09PSBcImZ1bmN0aW9uXCI7XG4gICAgICB9O1xuXG4gICAgICAvKipcbiAgICAgICAqIENyZWF0ZXMgYW5kIHJldHVybnMgYSBmdW5jdGlvbiB3aGljaCwgd2hlbiBjYWxsZWQsIHdpbGwgcmVzb2x2ZSBvciByZWplY3RcbiAgICAgICAqIHRoZSBnaXZlbiBwcm9taXNlIGJhc2VkIG9uIGhvdyBpdCBpcyBjYWxsZWQ6XG4gICAgICAgKlxuICAgICAgICogLSBJZiwgd2hlbiBjYWxsZWQsIGBjaHJvbWUucnVudGltZS5sYXN0RXJyb3JgIGNvbnRhaW5zIGEgbm9uLW51bGwgb2JqZWN0LFxuICAgICAgICogICB0aGUgcHJvbWlzZSBpcyByZWplY3RlZCB3aXRoIHRoYXQgdmFsdWUuXG4gICAgICAgKiAtIElmIHRoZSBmdW5jdGlvbiBpcyBjYWxsZWQgd2l0aCBleGFjdGx5IG9uZSBhcmd1bWVudCwgdGhlIHByb21pc2UgaXNcbiAgICAgICAqICAgcmVzb2x2ZWQgdG8gdGhhdCB2YWx1ZS5cbiAgICAgICAqIC0gT3RoZXJ3aXNlLCB0aGUgcHJvbWlzZSBpcyByZXNvbHZlZCB0byBhbiBhcnJheSBjb250YWluaW5nIGFsbCBvZiB0aGVcbiAgICAgICAqICAgZnVuY3Rpb24ncyBhcmd1bWVudHMuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IHByb21pc2VcbiAgICAgICAqICAgICAgICBBbiBvYmplY3QgY29udGFpbmluZyB0aGUgcmVzb2x1dGlvbiBhbmQgcmVqZWN0aW9uIGZ1bmN0aW9ucyBvZiBhXG4gICAgICAgKiAgICAgICAgcHJvbWlzZS5cbiAgICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IHByb21pc2UucmVzb2x2ZVxuICAgICAgICogICAgICAgIFRoZSBwcm9taXNlJ3MgcmVzb2x1dGlvbiBmdW5jdGlvbi5cbiAgICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IHByb21pc2UucmVqZWN0XG4gICAgICAgKiAgICAgICAgVGhlIHByb21pc2UncyByZWplY3Rpb24gZnVuY3Rpb24uXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gbWV0YWRhdGFcbiAgICAgICAqICAgICAgICBNZXRhZGF0YSBhYm91dCB0aGUgd3JhcHBlZCBtZXRob2Qgd2hpY2ggaGFzIGNyZWF0ZWQgdGhlIGNhbGxiYWNrLlxuICAgICAgICogQHBhcmFtIHtib29sZWFufSBtZXRhZGF0YS5zaW5nbGVDYWxsYmFja0FyZ1xuICAgICAgICogICAgICAgIFdoZXRoZXIgb3Igbm90IHRoZSBwcm9taXNlIGlzIHJlc29sdmVkIHdpdGggb25seSB0aGUgZmlyc3RcbiAgICAgICAqICAgICAgICBhcmd1bWVudCBvZiB0aGUgY2FsbGJhY2ssIGFsdGVybmF0aXZlbHkgYW4gYXJyYXkgb2YgYWxsIHRoZVxuICAgICAgICogICAgICAgIGNhbGxiYWNrIGFyZ3VtZW50cyBpcyByZXNvbHZlZC4gQnkgZGVmYXVsdCwgaWYgdGhlIGNhbGxiYWNrXG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24gaXMgaW52b2tlZCB3aXRoIG9ubHkgYSBzaW5nbGUgYXJndW1lbnQsIHRoYXQgd2lsbCBiZVxuICAgICAgICogICAgICAgIHJlc29sdmVkIHRvIHRoZSBwcm9taXNlLCB3aGlsZSBhbGwgYXJndW1lbnRzIHdpbGwgYmUgcmVzb2x2ZWQgYXNcbiAgICAgICAqICAgICAgICBhbiBhcnJheSBpZiBtdWx0aXBsZSBhcmUgZ2l2ZW4uXG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge2Z1bmN0aW9ufVxuICAgICAgICogICAgICAgIFRoZSBnZW5lcmF0ZWQgY2FsbGJhY2sgZnVuY3Rpb24uXG4gICAgICAgKi9cbiAgICAgIGNvbnN0IG1ha2VDYWxsYmFjayA9IChwcm9taXNlLCBtZXRhZGF0YSkgPT4ge1xuICAgICAgICByZXR1cm4gKC4uLmNhbGxiYWNrQXJncykgPT4ge1xuICAgICAgICAgIGlmIChleHRlbnNpb25BUElzLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgICAgICBwcm9taXNlLnJlamVjdChuZXcgRXJyb3IoZXh0ZW5zaW9uQVBJcy5ydW50aW1lLmxhc3RFcnJvci5tZXNzYWdlKSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChtZXRhZGF0YS5zaW5nbGVDYWxsYmFja0FyZyB8fCBjYWxsYmFja0FyZ3MubGVuZ3RoIDw9IDEgJiYgbWV0YWRhdGEuc2luZ2xlQ2FsbGJhY2tBcmcgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICBwcm9taXNlLnJlc29sdmUoY2FsbGJhY2tBcmdzWzBdKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvbWlzZS5yZXNvbHZlKGNhbGxiYWNrQXJncyk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfTtcbiAgICAgIGNvbnN0IHBsdXJhbGl6ZUFyZ3VtZW50cyA9IG51bUFyZ3MgPT4gbnVtQXJncyA9PSAxID8gXCJhcmd1bWVudFwiIDogXCJhcmd1bWVudHNcIjtcblxuICAgICAgLyoqXG4gICAgICAgKiBDcmVhdGVzIGEgd3JhcHBlciBmdW5jdGlvbiBmb3IgYSBtZXRob2Qgd2l0aCB0aGUgZ2l2ZW4gbmFtZSBhbmQgbWV0YWRhdGEuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAgICAgICAqICAgICAgICBUaGUgbmFtZSBvZiB0aGUgbWV0aG9kIHdoaWNoIGlzIGJlaW5nIHdyYXBwZWQuXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gbWV0YWRhdGFcbiAgICAgICAqICAgICAgICBNZXRhZGF0YSBhYm91dCB0aGUgbWV0aG9kIGJlaW5nIHdyYXBwZWQuXG4gICAgICAgKiBAcGFyYW0ge2ludGVnZXJ9IG1ldGFkYXRhLm1pbkFyZ3NcbiAgICAgICAqICAgICAgICBUaGUgbWluaW11bSBudW1iZXIgb2YgYXJndW1lbnRzIHdoaWNoIG11c3QgYmUgcGFzc2VkIHRvIHRoZVxuICAgICAgICogICAgICAgIGZ1bmN0aW9uLiBJZiBjYWxsZWQgd2l0aCBmZXdlciB0aGFuIHRoaXMgbnVtYmVyIG9mIGFyZ3VtZW50cywgdGhlXG4gICAgICAgKiAgICAgICAgd3JhcHBlciB3aWxsIHJhaXNlIGFuIGV4Y2VwdGlvbi5cbiAgICAgICAqIEBwYXJhbSB7aW50ZWdlcn0gbWV0YWRhdGEubWF4QXJnc1xuICAgICAgICogICAgICAgIFRoZSBtYXhpbXVtIG51bWJlciBvZiBhcmd1bWVudHMgd2hpY2ggbWF5IGJlIHBhc3NlZCB0byB0aGVcbiAgICAgICAqICAgICAgICBmdW5jdGlvbi4gSWYgY2FsbGVkIHdpdGggbW9yZSB0aGFuIHRoaXMgbnVtYmVyIG9mIGFyZ3VtZW50cywgdGhlXG4gICAgICAgKiAgICAgICAgd3JhcHBlciB3aWxsIHJhaXNlIGFuIGV4Y2VwdGlvbi5cbiAgICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gbWV0YWRhdGEuc2luZ2xlQ2FsbGJhY2tBcmdcbiAgICAgICAqICAgICAgICBXaGV0aGVyIG9yIG5vdCB0aGUgcHJvbWlzZSBpcyByZXNvbHZlZCB3aXRoIG9ubHkgdGhlIGZpcnN0XG4gICAgICAgKiAgICAgICAgYXJndW1lbnQgb2YgdGhlIGNhbGxiYWNrLCBhbHRlcm5hdGl2ZWx5IGFuIGFycmF5IG9mIGFsbCB0aGVcbiAgICAgICAqICAgICAgICBjYWxsYmFjayBhcmd1bWVudHMgaXMgcmVzb2x2ZWQuIEJ5IGRlZmF1bHQsIGlmIHRoZSBjYWxsYmFja1xuICAgICAgICogICAgICAgIGZ1bmN0aW9uIGlzIGludm9rZWQgd2l0aCBvbmx5IGEgc2luZ2xlIGFyZ3VtZW50LCB0aGF0IHdpbGwgYmVcbiAgICAgICAqICAgICAgICByZXNvbHZlZCB0byB0aGUgcHJvbWlzZSwgd2hpbGUgYWxsIGFyZ3VtZW50cyB3aWxsIGJlIHJlc29sdmVkIGFzXG4gICAgICAgKiAgICAgICAgYW4gYXJyYXkgaWYgbXVsdGlwbGUgYXJlIGdpdmVuLlxuICAgICAgICpcbiAgICAgICAqIEByZXR1cm5zIHtmdW5jdGlvbihvYmplY3QsIC4uLiopfVxuICAgICAgICogICAgICAgVGhlIGdlbmVyYXRlZCB3cmFwcGVyIGZ1bmN0aW9uLlxuICAgICAgICovXG4gICAgICBjb25zdCB3cmFwQXN5bmNGdW5jdGlvbiA9IChuYW1lLCBtZXRhZGF0YSkgPT4ge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gYXN5bmNGdW5jdGlvbldyYXBwZXIodGFyZ2V0LCAuLi5hcmdzKSB7XG4gICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDwgbWV0YWRhdGEubWluQXJncykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBhdCBsZWFzdCAke21ldGFkYXRhLm1pbkFyZ3N9ICR7cGx1cmFsaXplQXJndW1lbnRzKG1ldGFkYXRhLm1pbkFyZ3MpfSBmb3IgJHtuYW1lfSgpLCBnb3QgJHthcmdzLmxlbmd0aH1gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gbWV0YWRhdGEubWF4QXJncykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBhdCBtb3N0ICR7bWV0YWRhdGEubWF4QXJnc30gJHtwbHVyYWxpemVBcmd1bWVudHMobWV0YWRhdGEubWF4QXJncyl9IGZvciAke25hbWV9KCksIGdvdCAke2FyZ3MubGVuZ3RofWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgaWYgKG1ldGFkYXRhLmZhbGxiYWNrVG9Ob0NhbGxiYWNrKSB7XG4gICAgICAgICAgICAgIC8vIFRoaXMgQVBJIG1ldGhvZCBoYXMgY3VycmVudGx5IG5vIGNhbGxiYWNrIG9uIENocm9tZSwgYnV0IGl0IHJldHVybiBhIHByb21pc2Ugb24gRmlyZWZveCxcbiAgICAgICAgICAgICAgLy8gYW5kIHNvIHRoZSBwb2x5ZmlsbCB3aWxsIHRyeSB0byBjYWxsIGl0IHdpdGggYSBjYWxsYmFjayBmaXJzdCwgYW5kIGl0IHdpbGwgZmFsbGJhY2tcbiAgICAgICAgICAgICAgLy8gdG8gbm90IHBhc3NpbmcgdGhlIGNhbGxiYWNrIGlmIHRoZSBmaXJzdCBjYWxsIGZhaWxzLlxuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRhcmdldFtuYW1lXSguLi5hcmdzLCBtYWtlQ2FsbGJhY2soe1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZSxcbiAgICAgICAgICAgICAgICAgIHJlamVjdFxuICAgICAgICAgICAgICAgIH0sIG1ldGFkYXRhKSk7XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGNiRXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYCR7bmFtZX0gQVBJIG1ldGhvZCBkb2Vzbid0IHNlZW0gdG8gc3VwcG9ydCB0aGUgY2FsbGJhY2sgcGFyYW1ldGVyLCBgICsgXCJmYWxsaW5nIGJhY2sgdG8gY2FsbCBpdCB3aXRob3V0IGEgY2FsbGJhY2s6IFwiLCBjYkVycm9yKTtcbiAgICAgICAgICAgICAgICB0YXJnZXRbbmFtZV0oLi4uYXJncyk7XG5cbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgdGhlIEFQSSBtZXRob2QgbWV0YWRhdGEsIHNvIHRoYXQgdGhlIG5leHQgQVBJIGNhbGxzIHdpbGwgbm90IHRyeSB0b1xuICAgICAgICAgICAgICAgIC8vIHVzZSB0aGUgdW5zdXBwb3J0ZWQgY2FsbGJhY2sgYW55bW9yZS5cbiAgICAgICAgICAgICAgICBtZXRhZGF0YS5mYWxsYmFja1RvTm9DYWxsYmFjayA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIG1ldGFkYXRhLm5vQ2FsbGJhY2sgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChtZXRhZGF0YS5ub0NhbGxiYWNrKSB7XG4gICAgICAgICAgICAgIHRhcmdldFtuYW1lXSguLi5hcmdzKTtcbiAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdKC4uLmFyZ3MsIG1ha2VDYWxsYmFjayh7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSxcbiAgICAgICAgICAgICAgICByZWplY3RcbiAgICAgICAgICAgICAgfSwgbWV0YWRhdGEpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfTtcbiAgICAgIH07XG5cbiAgICAgIC8qKlxuICAgICAgICogV3JhcHMgYW4gZXhpc3RpbmcgbWV0aG9kIG9mIHRoZSB0YXJnZXQgb2JqZWN0LCBzbyB0aGF0IGNhbGxzIHRvIGl0IGFyZVxuICAgICAgICogaW50ZXJjZXB0ZWQgYnkgdGhlIGdpdmVuIHdyYXBwZXIgZnVuY3Rpb24uIFRoZSB3cmFwcGVyIGZ1bmN0aW9uIHJlY2VpdmVzLFxuICAgICAgICogYXMgaXRzIGZpcnN0IGFyZ3VtZW50LCB0aGUgb3JpZ2luYWwgYHRhcmdldGAgb2JqZWN0LCBmb2xsb3dlZCBieSBlYWNoIG9mXG4gICAgICAgKiB0aGUgYXJndW1lbnRzIHBhc3NlZCB0byB0aGUgb3JpZ2luYWwgbWV0aG9kLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSB0YXJnZXRcbiAgICAgICAqICAgICAgICBUaGUgb3JpZ2luYWwgdGFyZ2V0IG9iamVjdCB0aGF0IHRoZSB3cmFwcGVkIG1ldGhvZCBiZWxvbmdzIHRvLlxuICAgICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbWV0aG9kXG4gICAgICAgKiAgICAgICAgVGhlIG1ldGhvZCBiZWluZyB3cmFwcGVkLiBUaGlzIGlzIHVzZWQgYXMgdGhlIHRhcmdldCBvZiB0aGUgUHJveHlcbiAgICAgICAqICAgICAgICBvYmplY3Qgd2hpY2ggaXMgY3JlYXRlZCB0byB3cmFwIHRoZSBtZXRob2QuXG4gICAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSB3cmFwcGVyXG4gICAgICAgKiAgICAgICAgVGhlIHdyYXBwZXIgZnVuY3Rpb24gd2hpY2ggaXMgY2FsbGVkIGluIHBsYWNlIG9mIGEgZGlyZWN0IGludm9jYXRpb25cbiAgICAgICAqICAgICAgICBvZiB0aGUgd3JhcHBlZCBtZXRob2QuXG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge1Byb3h5PGZ1bmN0aW9uPn1cbiAgICAgICAqICAgICAgICBBIFByb3h5IG9iamVjdCBmb3IgdGhlIGdpdmVuIG1ldGhvZCwgd2hpY2ggaW52b2tlcyB0aGUgZ2l2ZW4gd3JhcHBlclxuICAgICAgICogICAgICAgIG1ldGhvZCBpbiBpdHMgcGxhY2UuXG4gICAgICAgKi9cbiAgICAgIGNvbnN0IHdyYXBNZXRob2QgPSAodGFyZ2V0LCBtZXRob2QsIHdyYXBwZXIpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm94eShtZXRob2QsIHtcbiAgICAgICAgICBhcHBseSh0YXJnZXRNZXRob2QsIHRoaXNPYmosIGFyZ3MpIHtcbiAgICAgICAgICAgIHJldHVybiB3cmFwcGVyLmNhbGwodGhpc09iaiwgdGFyZ2V0LCAuLi5hcmdzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIGxldCBoYXNPd25Qcm9wZXJ0eSA9IEZ1bmN0aW9uLmNhbGwuYmluZChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5KTtcblxuICAgICAgLyoqXG4gICAgICAgKiBXcmFwcyBhbiBvYmplY3QgaW4gYSBQcm94eSB3aGljaCBpbnRlcmNlcHRzIGFuZCB3cmFwcyBjZXJ0YWluIG1ldGhvZHNcbiAgICAgICAqIGJhc2VkIG9uIHRoZSBnaXZlbiBgd3JhcHBlcnNgIGFuZCBgbWV0YWRhdGFgIG9iamVjdHMuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IHRhcmdldFxuICAgICAgICogICAgICAgIFRoZSB0YXJnZXQgb2JqZWN0IHRvIHdyYXAuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IFt3cmFwcGVycyA9IHt9XVxuICAgICAgICogICAgICAgIEFuIG9iamVjdCB0cmVlIGNvbnRhaW5pbmcgd3JhcHBlciBmdW5jdGlvbnMgZm9yIHNwZWNpYWwgY2FzZXMuIEFueVxuICAgICAgICogICAgICAgIGZ1bmN0aW9uIHByZXNlbnQgaW4gdGhpcyBvYmplY3QgdHJlZSBpcyBjYWxsZWQgaW4gcGxhY2Ugb2YgdGhlXG4gICAgICAgKiAgICAgICAgbWV0aG9kIGluIHRoZSBzYW1lIGxvY2F0aW9uIGluIHRoZSBgdGFyZ2V0YCBvYmplY3QgdHJlZS4gVGhlc2VcbiAgICAgICAqICAgICAgICB3cmFwcGVyIG1ldGhvZHMgYXJlIGludm9rZWQgYXMgZGVzY3JpYmVkIGluIHtAc2VlIHdyYXBNZXRob2R9LlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBbbWV0YWRhdGEgPSB7fV1cbiAgICAgICAqICAgICAgICBBbiBvYmplY3QgdHJlZSBjb250YWluaW5nIG1ldGFkYXRhIHVzZWQgdG8gYXV0b21hdGljYWxseSBnZW5lcmF0ZVxuICAgICAgICogICAgICAgIFByb21pc2UtYmFzZWQgd3JhcHBlciBmdW5jdGlvbnMgZm9yIGFzeW5jaHJvbm91cy4gQW55IGZ1bmN0aW9uIGluXG4gICAgICAgKiAgICAgICAgdGhlIGB0YXJnZXRgIG9iamVjdCB0cmVlIHdoaWNoIGhhcyBhIGNvcnJlc3BvbmRpbmcgbWV0YWRhdGEgb2JqZWN0XG4gICAgICAgKiAgICAgICAgaW4gdGhlIHNhbWUgbG9jYXRpb24gaW4gdGhlIGBtZXRhZGF0YWAgdHJlZSBpcyByZXBsYWNlZCB3aXRoIGFuXG4gICAgICAgKiAgICAgICAgYXV0b21hdGljYWxseS1nZW5lcmF0ZWQgd3JhcHBlciBmdW5jdGlvbiwgYXMgZGVzY3JpYmVkIGluXG4gICAgICAgKiAgICAgICAge0BzZWUgd3JhcEFzeW5jRnVuY3Rpb259XG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge1Byb3h5PG9iamVjdD59XG4gICAgICAgKi9cbiAgICAgIGNvbnN0IHdyYXBPYmplY3QgPSAodGFyZ2V0LCB3cmFwcGVycyA9IHt9LCBtZXRhZGF0YSA9IHt9KSA9PiB7XG4gICAgICAgIGxldCBjYWNoZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgICAgIGxldCBoYW5kbGVycyA9IHtcbiAgICAgICAgICBoYXMocHJveHlUYXJnZXQsIHByb3ApIHtcbiAgICAgICAgICAgIHJldHVybiBwcm9wIGluIHRhcmdldCB8fCBwcm9wIGluIGNhY2hlO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZ2V0KHByb3h5VGFyZ2V0LCBwcm9wLCByZWNlaXZlcikge1xuICAgICAgICAgICAgaWYgKHByb3AgaW4gY2FjaGUpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhY2hlW3Byb3BdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCEocHJvcCBpbiB0YXJnZXQpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgdmFsdWUgPSB0YXJnZXRbcHJvcF07XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhIG1ldGhvZCBvbiB0aGUgdW5kZXJseWluZyBvYmplY3QuIENoZWNrIGlmIHdlIG5lZWQgdG8gZG9cbiAgICAgICAgICAgICAgLy8gYW55IHdyYXBwaW5nLlxuXG4gICAgICAgICAgICAgIGlmICh0eXBlb2Ygd3JhcHBlcnNbcHJvcF0gPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgIC8vIFdlIGhhdmUgYSBzcGVjaWFsLWNhc2Ugd3JhcHBlciBmb3IgdGhpcyBtZXRob2QuXG4gICAgICAgICAgICAgICAgdmFsdWUgPSB3cmFwTWV0aG9kKHRhcmdldCwgdGFyZ2V0W3Byb3BdLCB3cmFwcGVyc1twcm9wXSk7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGFzT3duUHJvcGVydHkobWV0YWRhdGEsIHByb3ApKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhbiBhc3luYyBtZXRob2QgdGhhdCB3ZSBoYXZlIG1ldGFkYXRhIGZvci4gQ3JlYXRlIGFcbiAgICAgICAgICAgICAgICAvLyBQcm9taXNlIHdyYXBwZXIgZm9yIGl0LlxuICAgICAgICAgICAgICAgIGxldCB3cmFwcGVyID0gd3JhcEFzeW5jRnVuY3Rpb24ocHJvcCwgbWV0YWRhdGFbcHJvcF0pO1xuICAgICAgICAgICAgICAgIHZhbHVlID0gd3JhcE1ldGhvZCh0YXJnZXQsIHRhcmdldFtwcm9wXSwgd3JhcHBlcik7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhIG1ldGhvZCB0aGF0IHdlIGRvbid0IGtub3cgb3IgY2FyZSBhYm91dC4gUmV0dXJuIHRoZVxuICAgICAgICAgICAgICAgIC8vIG9yaWdpbmFsIG1ldGhvZCwgYm91bmQgdG8gdGhlIHVuZGVybHlpbmcgb2JqZWN0LlxuICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuYmluZCh0YXJnZXQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAoaGFzT3duUHJvcGVydHkod3JhcHBlcnMsIHByb3ApIHx8IGhhc093blByb3BlcnR5KG1ldGFkYXRhLCBwcm9wKSkpIHtcbiAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhbiBvYmplY3QgdGhhdCB3ZSBuZWVkIHRvIGRvIHNvbWUgd3JhcHBpbmcgZm9yIHRoZSBjaGlsZHJlblxuICAgICAgICAgICAgICAvLyBvZi4gQ3JlYXRlIGEgc3ViLW9iamVjdCB3cmFwcGVyIGZvciBpdCB3aXRoIHRoZSBhcHByb3ByaWF0ZSBjaGlsZFxuICAgICAgICAgICAgICAvLyBtZXRhZGF0YS5cbiAgICAgICAgICAgICAgdmFsdWUgPSB3cmFwT2JqZWN0KHZhbHVlLCB3cmFwcGVyc1twcm9wXSwgbWV0YWRhdGFbcHJvcF0pO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChoYXNPd25Qcm9wZXJ0eShtZXRhZGF0YSwgXCIqXCIpKSB7XG4gICAgICAgICAgICAgIC8vIFdyYXAgYWxsIHByb3BlcnRpZXMgaW4gKiBuYW1lc3BhY2UuXG4gICAgICAgICAgICAgIHZhbHVlID0gd3JhcE9iamVjdCh2YWx1ZSwgd3JhcHBlcnNbcHJvcF0sIG1ldGFkYXRhW1wiKlwiXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXZSBkb24ndCBuZWVkIHRvIGRvIGFueSB3cmFwcGluZyBmb3IgdGhpcyBwcm9wZXJ0eSxcbiAgICAgICAgICAgICAgLy8gc28ganVzdCBmb3J3YXJkIGFsbCBhY2Nlc3MgdG8gdGhlIHVuZGVybHlpbmcgb2JqZWN0LlxuICAgICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoY2FjaGUsIHByb3AsIHtcbiAgICAgICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBnZXQoKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGFyZ2V0W3Byb3BdO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0KHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICB0YXJnZXRbcHJvcF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYWNoZVtwcm9wXSA9IHZhbHVlO1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgc2V0KHByb3h5VGFyZ2V0LCBwcm9wLCB2YWx1ZSwgcmVjZWl2ZXIpIHtcbiAgICAgICAgICAgIGlmIChwcm9wIGluIGNhY2hlKSB7XG4gICAgICAgICAgICAgIGNhY2hlW3Byb3BdID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0YXJnZXRbcHJvcF0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZGVmaW5lUHJvcGVydHkocHJveHlUYXJnZXQsIHByb3AsIGRlc2MpIHtcbiAgICAgICAgICAgIHJldHVybiBSZWZsZWN0LmRlZmluZVByb3BlcnR5KGNhY2hlLCBwcm9wLCBkZXNjKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGRlbGV0ZVByb3BlcnR5KHByb3h5VGFyZ2V0LCBwcm9wKSB7XG4gICAgICAgICAgICByZXR1cm4gUmVmbGVjdC5kZWxldGVQcm9wZXJ0eShjYWNoZSwgcHJvcCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIFBlciBjb250cmFjdCBvZiB0aGUgUHJveHkgQVBJLCB0aGUgXCJnZXRcIiBwcm94eSBoYW5kbGVyIG11c3QgcmV0dXJuIHRoZVxuICAgICAgICAvLyBvcmlnaW5hbCB2YWx1ZSBvZiB0aGUgdGFyZ2V0IGlmIHRoYXQgdmFsdWUgaXMgZGVjbGFyZWQgcmVhZC1vbmx5IGFuZFxuICAgICAgICAvLyBub24tY29uZmlndXJhYmxlLiBGb3IgdGhpcyByZWFzb24sIHdlIGNyZWF0ZSBhbiBvYmplY3Qgd2l0aCB0aGVcbiAgICAgICAgLy8gcHJvdG90eXBlIHNldCB0byBgdGFyZ2V0YCBpbnN0ZWFkIG9mIHVzaW5nIGB0YXJnZXRgIGRpcmVjdGx5LlxuICAgICAgICAvLyBPdGhlcndpc2Ugd2UgY2Fubm90IHJldHVybiBhIGN1c3RvbSBvYmplY3QgZm9yIEFQSXMgdGhhdFxuICAgICAgICAvLyBhcmUgZGVjbGFyZWQgcmVhZC1vbmx5IGFuZCBub24tY29uZmlndXJhYmxlLCBzdWNoIGFzIGBjaHJvbWUuZGV2dG9vbHNgLlxuICAgICAgICAvL1xuICAgICAgICAvLyBUaGUgcHJveHkgaGFuZGxlcnMgdGhlbXNlbHZlcyB3aWxsIHN0aWxsIHVzZSB0aGUgb3JpZ2luYWwgYHRhcmdldGBcbiAgICAgICAgLy8gaW5zdGVhZCBvZiB0aGUgYHByb3h5VGFyZ2V0YCwgc28gdGhhdCB0aGUgbWV0aG9kcyBhbmQgcHJvcGVydGllcyBhcmVcbiAgICAgICAgLy8gZGVyZWZlcmVuY2VkIHZpYSB0aGUgb3JpZ2luYWwgdGFyZ2V0cy5cbiAgICAgICAgbGV0IHByb3h5VGFyZ2V0ID0gT2JqZWN0LmNyZWF0ZSh0YXJnZXQpO1xuICAgICAgICByZXR1cm4gbmV3IFByb3h5KHByb3h5VGFyZ2V0LCBoYW5kbGVycyk7XG4gICAgICB9O1xuXG4gICAgICAvKipcbiAgICAgICAqIENyZWF0ZXMgYSBzZXQgb2Ygd3JhcHBlciBmdW5jdGlvbnMgZm9yIGFuIGV2ZW50IG9iamVjdCwgd2hpY2ggaGFuZGxlc1xuICAgICAgICogd3JhcHBpbmcgb2YgbGlzdGVuZXIgZnVuY3Rpb25zIHRoYXQgdGhvc2UgbWVzc2FnZXMgYXJlIHBhc3NlZC5cbiAgICAgICAqXG4gICAgICAgKiBBIHNpbmdsZSB3cmFwcGVyIGlzIGNyZWF0ZWQgZm9yIGVhY2ggbGlzdGVuZXIgZnVuY3Rpb24sIGFuZCBzdG9yZWQgaW4gYVxuICAgICAgICogbWFwLiBTdWJzZXF1ZW50IGNhbGxzIHRvIGBhZGRMaXN0ZW5lcmAsIGBoYXNMaXN0ZW5lcmAsIG9yIGByZW1vdmVMaXN0ZW5lcmBcbiAgICAgICAqIHJldHJpZXZlIHRoZSBvcmlnaW5hbCB3cmFwcGVyLCBzbyB0aGF0ICBhdHRlbXB0cyB0byByZW1vdmUgYVxuICAgICAgICogcHJldmlvdXNseS1hZGRlZCBsaXN0ZW5lciB3b3JrIGFzIGV4cGVjdGVkLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7RGVmYXVsdFdlYWtNYXA8ZnVuY3Rpb24sIGZ1bmN0aW9uPn0gd3JhcHBlck1hcFxuICAgICAgICogICAgICAgIEEgRGVmYXVsdFdlYWtNYXAgb2JqZWN0IHdoaWNoIHdpbGwgY3JlYXRlIHRoZSBhcHByb3ByaWF0ZSB3cmFwcGVyXG4gICAgICAgKiAgICAgICAgZm9yIGEgZ2l2ZW4gbGlzdGVuZXIgZnVuY3Rpb24gd2hlbiBvbmUgZG9lcyBub3QgZXhpc3QsIGFuZCByZXRyaWV2ZVxuICAgICAgICogICAgICAgIGFuIGV4aXN0aW5nIG9uZSB3aGVuIGl0IGRvZXMuXG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge29iamVjdH1cbiAgICAgICAqL1xuICAgICAgY29uc3Qgd3JhcEV2ZW50ID0gd3JhcHBlck1hcCA9PiAoe1xuICAgICAgICBhZGRMaXN0ZW5lcih0YXJnZXQsIGxpc3RlbmVyLCAuLi5hcmdzKSB7XG4gICAgICAgICAgdGFyZ2V0LmFkZExpc3RlbmVyKHdyYXBwZXJNYXAuZ2V0KGxpc3RlbmVyKSwgLi4uYXJncyk7XG4gICAgICAgIH0sXG4gICAgICAgIGhhc0xpc3RlbmVyKHRhcmdldCwgbGlzdGVuZXIpIHtcbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lmhhc0xpc3RlbmVyKHdyYXBwZXJNYXAuZ2V0KGxpc3RlbmVyKSk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlbW92ZUxpc3RlbmVyKHRhcmdldCwgbGlzdGVuZXIpIHtcbiAgICAgICAgICB0YXJnZXQucmVtb3ZlTGlzdGVuZXIod3JhcHBlck1hcC5nZXQobGlzdGVuZXIpKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBjb25zdCBvblJlcXVlc3RGaW5pc2hlZFdyYXBwZXJzID0gbmV3IERlZmF1bHRXZWFrTWFwKGxpc3RlbmVyID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgcmV0dXJuIGxpc3RlbmVyO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFdyYXBzIGFuIG9uUmVxdWVzdEZpbmlzaGVkIGxpc3RlbmVyIGZ1bmN0aW9uIHNvIHRoYXQgaXQgd2lsbCByZXR1cm4gYVxuICAgICAgICAgKiBgZ2V0Q29udGVudCgpYCBwcm9wZXJ0eSB3aGljaCByZXR1cm5zIGEgYFByb21pc2VgIHJhdGhlciB0aGFuIHVzaW5nIGFcbiAgICAgICAgICogY2FsbGJhY2sgQVBJLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0ge29iamVjdH0gcmVxXG4gICAgICAgICAqICAgICAgICBUaGUgSEFSIGVudHJ5IG9iamVjdCByZXByZXNlbnRpbmcgdGhlIG5ldHdvcmsgcmVxdWVzdC5cbiAgICAgICAgICovXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBvblJlcXVlc3RGaW5pc2hlZChyZXEpIHtcbiAgICAgICAgICBjb25zdCB3cmFwcGVkUmVxID0gd3JhcE9iamVjdChyZXEsIHt9IC8qIHdyYXBwZXJzICovLCB7XG4gICAgICAgICAgICBnZXRDb250ZW50OiB7XG4gICAgICAgICAgICAgIG1pbkFyZ3M6IDAsXG4gICAgICAgICAgICAgIG1heEFyZ3M6IDBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsaXN0ZW5lcih3cmFwcGVkUmVxKTtcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgICAgY29uc3Qgb25NZXNzYWdlV3JhcHBlcnMgPSBuZXcgRGVmYXVsdFdlYWtNYXAobGlzdGVuZXIgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICByZXR1cm4gbGlzdGVuZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogV3JhcHMgYSBtZXNzYWdlIGxpc3RlbmVyIGZ1bmN0aW9uIHNvIHRoYXQgaXQgbWF5IHNlbmQgcmVzcG9uc2VzIGJhc2VkIG9uXG4gICAgICAgICAqIGl0cyByZXR1cm4gdmFsdWUsIHJhdGhlciB0aGFuIGJ5IHJldHVybmluZyBhIHNlbnRpbmVsIHZhbHVlIGFuZCBjYWxsaW5nIGFcbiAgICAgICAgICogY2FsbGJhY2suIElmIHRoZSBsaXN0ZW5lciBmdW5jdGlvbiByZXR1cm5zIGEgUHJvbWlzZSwgdGhlIHJlc3BvbnNlIGlzXG4gICAgICAgICAqIHNlbnQgd2hlbiB0aGUgcHJvbWlzZSBlaXRoZXIgcmVzb2x2ZXMgb3IgcmVqZWN0cy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHBhcmFtIHsqfSBtZXNzYWdlXG4gICAgICAgICAqICAgICAgICBUaGUgbWVzc2FnZSBzZW50IGJ5IHRoZSBvdGhlciBlbmQgb2YgdGhlIGNoYW5uZWwuXG4gICAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBzZW5kZXJcbiAgICAgICAgICogICAgICAgIERldGFpbHMgYWJvdXQgdGhlIHNlbmRlciBvZiB0aGUgbWVzc2FnZS5cbiAgICAgICAgICogQHBhcmFtIHtmdW5jdGlvbigqKX0gc2VuZFJlc3BvbnNlXG4gICAgICAgICAqICAgICAgICBBIGNhbGxiYWNrIHdoaWNoLCB3aGVuIGNhbGxlZCB3aXRoIGFuIGFyYml0cmFyeSBhcmd1bWVudCwgc2VuZHNcbiAgICAgICAgICogICAgICAgIHRoYXQgdmFsdWUgYXMgYSByZXNwb25zZS5cbiAgICAgICAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAgICAgICAqICAgICAgICBUcnVlIGlmIHRoZSB3cmFwcGVkIGxpc3RlbmVyIHJldHVybmVkIGEgUHJvbWlzZSwgd2hpY2ggd2lsbCBsYXRlclxuICAgICAgICAgKiAgICAgICAgeWllbGQgYSByZXNwb25zZS4gRmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAgICAgKi9cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG9uTWVzc2FnZShtZXNzYWdlLCBzZW5kZXIsIHNlbmRSZXNwb25zZSkge1xuICAgICAgICAgIGxldCBkaWRDYWxsU2VuZFJlc3BvbnNlID0gZmFsc2U7XG4gICAgICAgICAgbGV0IHdyYXBwZWRTZW5kUmVzcG9uc2U7XG4gICAgICAgICAgbGV0IHNlbmRSZXNwb25zZVByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICAgIHdyYXBwZWRTZW5kUmVzcG9uc2UgPSBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgZGlkQ2FsbFNlbmRSZXNwb25zZSA9IHRydWU7XG4gICAgICAgICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsZXQgcmVzdWx0O1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXN1bHQgPSBsaXN0ZW5lcihtZXNzYWdlLCBzZW5kZXIsIHdyYXBwZWRTZW5kUmVzcG9uc2UpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgcmVzdWx0ID0gUHJvbWlzZS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgaXNSZXN1bHRUaGVuYWJsZSA9IHJlc3VsdCAhPT0gdHJ1ZSAmJiBpc1RoZW5hYmxlKHJlc3VsdCk7XG5cbiAgICAgICAgICAvLyBJZiB0aGUgbGlzdGVuZXIgZGlkbid0IHJldHVybmVkIHRydWUgb3IgYSBQcm9taXNlLCBvciBjYWxsZWRcbiAgICAgICAgICAvLyB3cmFwcGVkU2VuZFJlc3BvbnNlIHN5bmNocm9ub3VzbHksIHdlIGNhbiBleGl0IGVhcmxpZXJcbiAgICAgICAgICAvLyBiZWNhdXNlIHRoZXJlIHdpbGwgYmUgbm8gcmVzcG9uc2Ugc2VudCBmcm9tIHRoaXMgbGlzdGVuZXIuXG4gICAgICAgICAgaWYgKHJlc3VsdCAhPT0gdHJ1ZSAmJiAhaXNSZXN1bHRUaGVuYWJsZSAmJiAhZGlkQ2FsbFNlbmRSZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEEgc21hbGwgaGVscGVyIHRvIHNlbmQgdGhlIG1lc3NhZ2UgaWYgdGhlIHByb21pc2UgcmVzb2x2ZXNcbiAgICAgICAgICAvLyBhbmQgYW4gZXJyb3IgaWYgdGhlIHByb21pc2UgcmVqZWN0cyAoYSB3cmFwcGVkIHNlbmRNZXNzYWdlIGhhc1xuICAgICAgICAgIC8vIHRvIHRyYW5zbGF0ZSB0aGUgbWVzc2FnZSBpbnRvIGEgcmVzb2x2ZWQgcHJvbWlzZSBvciBhIHJlamVjdGVkXG4gICAgICAgICAgLy8gcHJvbWlzZSkuXG4gICAgICAgICAgY29uc3Qgc2VuZFByb21pc2VkUmVzdWx0ID0gcHJvbWlzZSA9PiB7XG4gICAgICAgICAgICBwcm9taXNlLnRoZW4obXNnID0+IHtcbiAgICAgICAgICAgICAgLy8gc2VuZCB0aGUgbWVzc2FnZSB2YWx1ZS5cbiAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKG1zZyk7XG4gICAgICAgICAgICB9LCBlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIFNlbmQgYSBKU09OIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBlcnJvciBpZiB0aGUgcmVqZWN0ZWQgdmFsdWVcbiAgICAgICAgICAgICAgLy8gaXMgYW4gaW5zdGFuY2Ugb2YgZXJyb3IsIG9yIHRoZSBvYmplY3QgaXRzZWxmIG90aGVyd2lzZS5cbiAgICAgICAgICAgICAgbGV0IG1lc3NhZ2U7XG4gICAgICAgICAgICAgIGlmIChlcnJvciAmJiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciB8fCB0eXBlb2YgZXJyb3IubWVzc2FnZSA9PT0gXCJzdHJpbmdcIikpIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gZXJyb3IubWVzc2FnZTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gXCJBbiB1bmV4cGVjdGVkIGVycm9yIG9jY3VycmVkXCI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICAgICAgICBfX21veldlYkV4dGVuc2lvblBvbHlmaWxsUmVqZWN0X186IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIC8vIFByaW50IGFuIGVycm9yIG9uIHRoZSBjb25zb2xlIGlmIHVuYWJsZSB0byBzZW5kIHRoZSByZXNwb25zZS5cbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzZW5kIG9uTWVzc2FnZSByZWplY3RlZCByZXBseVwiLCBlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfTtcblxuICAgICAgICAgIC8vIElmIHRoZSBsaXN0ZW5lciByZXR1cm5lZCBhIFByb21pc2UsIHNlbmQgdGhlIHJlc29sdmVkIHZhbHVlIGFzIGFcbiAgICAgICAgICAvLyByZXN1bHQsIG90aGVyd2lzZSB3YWl0IHRoZSBwcm9taXNlIHJlbGF0ZWQgdG8gdGhlIHdyYXBwZWRTZW5kUmVzcG9uc2VcbiAgICAgICAgICAvLyBjYWxsYmFjayB0byByZXNvbHZlIGFuZCBzZW5kIGl0IGFzIGEgcmVzcG9uc2UuXG4gICAgICAgICAgaWYgKGlzUmVzdWx0VGhlbmFibGUpIHtcbiAgICAgICAgICAgIHNlbmRQcm9taXNlZFJlc3VsdChyZXN1bHQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZW5kUHJvbWlzZWRSZXN1bHQoc2VuZFJlc3BvbnNlUHJvbWlzZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gTGV0IENocm9tZSBrbm93IHRoYXQgdGhlIGxpc3RlbmVyIGlzIHJlcGx5aW5nLlxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgICBjb25zdCB3cmFwcGVkU2VuZE1lc3NhZ2VDYWxsYmFjayA9ICh7XG4gICAgICAgIHJlamVjdCxcbiAgICAgICAgcmVzb2x2ZVxuICAgICAgfSwgcmVwbHkpID0+IHtcbiAgICAgICAgaWYgKGV4dGVuc2lvbkFQSXMucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgICAvLyBEZXRlY3Qgd2hlbiBub25lIG9mIHRoZSBsaXN0ZW5lcnMgcmVwbGllZCB0byB0aGUgc2VuZE1lc3NhZ2UgY2FsbCBhbmQgcmVzb2x2ZVxuICAgICAgICAgIC8vIHRoZSBwcm9taXNlIHRvIHVuZGVmaW5lZCBhcyBpbiBGaXJlZm94LlxuICAgICAgICAgIC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS93ZWJleHRlbnNpb24tcG9seWZpbGwvaXNzdWVzLzEzMFxuICAgICAgICAgIGlmIChleHRlbnNpb25BUElzLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UgPT09IENIUk9NRV9TRU5EX01FU1NBR0VfQ0FMTEJBQ0tfTk9fUkVTUE9OU0VfTUVTU0FHRSkge1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGV4dGVuc2lvbkFQSXMucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChyZXBseSAmJiByZXBseS5fX21veldlYkV4dGVuc2lvblBvbHlmaWxsUmVqZWN0X18pIHtcbiAgICAgICAgICAvLyBDb252ZXJ0IGJhY2sgdGhlIEpTT04gcmVwcmVzZW50YXRpb24gb2YgdGhlIGVycm9yIGludG9cbiAgICAgICAgICAvLyBhbiBFcnJvciBpbnN0YW5jZS5cbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKHJlcGx5Lm1lc3NhZ2UpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNvbHZlKHJlcGx5KTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGNvbnN0IHdyYXBwZWRTZW5kTWVzc2FnZSA9IChuYW1lLCBtZXRhZGF0YSwgYXBpTmFtZXNwYWNlT2JqLCAuLi5hcmdzKSA9PiB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA8IG1ldGFkYXRhLm1pbkFyZ3MpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGF0IGxlYXN0ICR7bWV0YWRhdGEubWluQXJnc30gJHtwbHVyYWxpemVBcmd1bWVudHMobWV0YWRhdGEubWluQXJncyl9IGZvciAke25hbWV9KCksIGdvdCAke2FyZ3MubGVuZ3RofWApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IG1ldGFkYXRhLm1heEFyZ3MpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGF0IG1vc3QgJHttZXRhZGF0YS5tYXhBcmdzfSAke3BsdXJhbGl6ZUFyZ3VtZW50cyhtZXRhZGF0YS5tYXhBcmdzKX0gZm9yICR7bmFtZX0oKSwgZ290ICR7YXJncy5sZW5ndGh9YCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICBjb25zdCB3cmFwcGVkQ2IgPSB3cmFwcGVkU2VuZE1lc3NhZ2VDYWxsYmFjay5iaW5kKG51bGwsIHtcbiAgICAgICAgICAgIHJlc29sdmUsXG4gICAgICAgICAgICByZWplY3RcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBhcmdzLnB1c2god3JhcHBlZENiKTtcbiAgICAgICAgICBhcGlOYW1lc3BhY2VPYmouc2VuZE1lc3NhZ2UoLi4uYXJncyk7XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIGNvbnN0IHN0YXRpY1dyYXBwZXJzID0ge1xuICAgICAgICBkZXZ0b29sczoge1xuICAgICAgICAgIG5ldHdvcms6IHtcbiAgICAgICAgICAgIG9uUmVxdWVzdEZpbmlzaGVkOiB3cmFwRXZlbnQob25SZXF1ZXN0RmluaXNoZWRXcmFwcGVycylcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHJ1bnRpbWU6IHtcbiAgICAgICAgICBvbk1lc3NhZ2U6IHdyYXBFdmVudChvbk1lc3NhZ2VXcmFwcGVycyksXG4gICAgICAgICAgb25NZXNzYWdlRXh0ZXJuYWw6IHdyYXBFdmVudChvbk1lc3NhZ2VXcmFwcGVycyksXG4gICAgICAgICAgc2VuZE1lc3NhZ2U6IHdyYXBwZWRTZW5kTWVzc2FnZS5iaW5kKG51bGwsIFwic2VuZE1lc3NhZ2VcIiwge1xuICAgICAgICAgICAgbWluQXJnczogMSxcbiAgICAgICAgICAgIG1heEFyZ3M6IDNcbiAgICAgICAgICB9KVxuICAgICAgICB9LFxuICAgICAgICB0YWJzOiB7XG4gICAgICAgICAgc2VuZE1lc3NhZ2U6IHdyYXBwZWRTZW5kTWVzc2FnZS5iaW5kKG51bGwsIFwic2VuZE1lc3NhZ2VcIiwge1xuICAgICAgICAgICAgbWluQXJnczogMixcbiAgICAgICAgICAgIG1heEFyZ3M6IDNcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgY29uc3Qgc2V0dGluZ01ldGFkYXRhID0ge1xuICAgICAgICBjbGVhcjoge1xuICAgICAgICAgIG1pbkFyZ3M6IDEsXG4gICAgICAgICAgbWF4QXJnczogMVxuICAgICAgICB9LFxuICAgICAgICBnZXQ6IHtcbiAgICAgICAgICBtaW5BcmdzOiAxLFxuICAgICAgICAgIG1heEFyZ3M6IDFcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiB7XG4gICAgICAgICAgbWluQXJnczogMSxcbiAgICAgICAgICBtYXhBcmdzOiAxXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBhcGlNZXRhZGF0YS5wcml2YWN5ID0ge1xuICAgICAgICBuZXR3b3JrOiB7XG4gICAgICAgICAgXCIqXCI6IHNldHRpbmdNZXRhZGF0YVxuICAgICAgICB9LFxuICAgICAgICBzZXJ2aWNlczoge1xuICAgICAgICAgIFwiKlwiOiBzZXR0aW5nTWV0YWRhdGFcbiAgICAgICAgfSxcbiAgICAgICAgd2Vic2l0ZXM6IHtcbiAgICAgICAgICBcIipcIjogc2V0dGluZ01ldGFkYXRhXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICByZXR1cm4gd3JhcE9iamVjdChleHRlbnNpb25BUElzLCBzdGF0aWNXcmFwcGVycywgYXBpTWV0YWRhdGEpO1xuICAgIH07XG5cbiAgICAvLyBUaGUgYnVpbGQgcHJvY2VzcyBhZGRzIGEgVU1EIHdyYXBwZXIgYXJvdW5kIHRoaXMgZmlsZSwgd2hpY2ggbWFrZXMgdGhlXG4gICAgLy8gYG1vZHVsZWAgdmFyaWFibGUgYXZhaWxhYmxlLlxuICAgIG1vZHVsZS5leHBvcnRzID0gd3JhcEFQSXMoY2hyb21lKTtcbiAgfSBlbHNlIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGdsb2JhbFRoaXMuYnJvd3NlcjtcbiAgfVxufSk7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1icm93c2VyLXBvbHlmaWxsLmpzLm1hcFxuIiwiaW1wb3J0IG9yaWdpbmFsQnJvd3NlciBmcm9tIFwid2ViZXh0ZW5zaW9uLXBvbHlmaWxsXCI7XG5leHBvcnQgY29uc3QgYnJvd3NlciA9IG9yaWdpbmFsQnJvd3NlcjtcbiIsImZ1bmN0aW9uIHByaW50KG1ldGhvZCwgLi4uYXJncykge1xuICBpZiAoaW1wb3J0Lm1ldGEuZW52Lk1PREUgPT09IFwicHJvZHVjdGlvblwiKSByZXR1cm47XG4gIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBhcmdzLnNoaWZ0KCk7XG4gICAgbWV0aG9kKGBbd3h0XSAke21lc3NhZ2V9YCwgLi4uYXJncyk7XG4gIH0gZWxzZSB7XG4gICAgbWV0aG9kKFwiW3d4dF1cIiwgLi4uYXJncyk7XG4gIH1cbn1cbmV4cG9ydCBjb25zdCBsb2dnZXIgPSB7XG4gIGRlYnVnOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5kZWJ1ZywgLi4uYXJncyksXG4gIGxvZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUubG9nLCAuLi5hcmdzKSxcbiAgd2FybjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUud2FybiwgLi4uYXJncyksXG4gIGVycm9yOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5lcnJvciwgLi4uYXJncylcbn07XG4iLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG5leHBvcnQgY2xhc3MgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCBleHRlbmRzIEV2ZW50IHtcbiAgY29uc3RydWN0b3IobmV3VXJsLCBvbGRVcmwpIHtcbiAgICBzdXBlcihXeHRMb2NhdGlvbkNoYW5nZUV2ZW50LkVWRU5UX05BTUUsIHt9KTtcbiAgICB0aGlzLm5ld1VybCA9IG5ld1VybDtcbiAgICB0aGlzLm9sZFVybCA9IG9sZFVybDtcbiAgfVxuICBzdGF0aWMgRVZFTlRfTkFNRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcInd4dDpsb2NhdGlvbmNoYW5nZVwiKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBnZXRVbmlxdWVFdmVudE5hbWUoZXZlbnROYW1lKSB7XG4gIHJldHVybiBgJHticm93c2VyPy5ydW50aW1lPy5pZH06JHtpbXBvcnQubWV0YS5lbnYuRU5UUllQT0lOVH06JHtldmVudE5hbWV9YDtcbn1cbiIsImltcG9ydCB7IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tIFwiLi9jdXN0b20tZXZlbnRzLm1qc1wiO1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcihjdHgpIHtcbiAgbGV0IGludGVydmFsO1xuICBsZXQgb2xkVXJsO1xuICByZXR1cm4ge1xuICAgIC8qKlxuICAgICAqIEVuc3VyZSB0aGUgbG9jYXRpb24gd2F0Y2hlciBpcyBhY3RpdmVseSBsb29raW5nIGZvciBVUkwgY2hhbmdlcy4gSWYgaXQncyBhbHJlYWR5IHdhdGNoaW5nLFxuICAgICAqIHRoaXMgaXMgYSBub29wLlxuICAgICAqL1xuICAgIHJ1bigpIHtcbiAgICAgIGlmIChpbnRlcnZhbCAhPSBudWxsKSByZXR1cm47XG4gICAgICBvbGRVcmwgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpO1xuICAgICAgaW50ZXJ2YWwgPSBjdHguc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICBsZXQgbmV3VXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcbiAgICAgICAgaWYgKG5ld1VybC5ocmVmICE9PSBvbGRVcmwuaHJlZikge1xuICAgICAgICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50KG5ld1VybCwgb2xkVXJsKSk7XG4gICAgICAgICAgb2xkVXJsID0gbmV3VXJsO1xuICAgICAgICB9XG4gICAgICB9LCAxZTMpO1xuICAgIH1cbiAgfTtcbn1cbiIsImltcG9ydCB7IGJyb3dzZXIgfSBmcm9tIFwid3h0L2Jyb3dzZXJcIjtcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gXCIuLi8uLi9zYW5kYm94L3V0aWxzL2xvZ2dlci5tanNcIjtcbmltcG9ydCB7IGdldFVuaXF1ZUV2ZW50TmFtZSB9IGZyb20gXCIuL2N1c3RvbS1ldmVudHMubWpzXCI7XG5pbXBvcnQgeyBjcmVhdGVMb2NhdGlvbldhdGNoZXIgfSBmcm9tIFwiLi9sb2NhdGlvbi13YXRjaGVyLm1qc1wiO1xuZXhwb3J0IGNsYXNzIENvbnRlbnRTY3JpcHRDb250ZXh0IHtcbiAgY29uc3RydWN0b3IoY29udGVudFNjcmlwdE5hbWUsIG9wdGlvbnMpIHtcbiAgICB0aGlzLmNvbnRlbnRTY3JpcHROYW1lID0gY29udGVudFNjcmlwdE5hbWU7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICB0aGlzLmFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBpZiAodGhpcy5pc1RvcEZyYW1lKSB7XG4gICAgICB0aGlzLmxpc3RlbkZvck5ld2VyU2NyaXB0cyh7IGlnbm9yZUZpcnN0RXZlbnQ6IHRydWUgfSk7XG4gICAgICB0aGlzLnN0b3BPbGRTY3JpcHRzKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCk7XG4gICAgfVxuICB9XG4gIHN0YXRpYyBTQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXG4gICAgXCJ3eHQ6Y29udGVudC1zY3JpcHQtc3RhcnRlZFwiXG4gICk7XG4gIGlzVG9wRnJhbWUgPSB3aW5kb3cuc2VsZiA9PT0gd2luZG93LnRvcDtcbiAgYWJvcnRDb250cm9sbGVyO1xuICBsb2NhdGlvbldhdGNoZXIgPSBjcmVhdGVMb2NhdGlvbldhdGNoZXIodGhpcyk7XG4gIHJlY2VpdmVkTWVzc2FnZUlkcyA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgU2V0KCk7XG4gIGdldCBzaWduYWwoKSB7XG4gICAgcmV0dXJuIHRoaXMuYWJvcnRDb250cm9sbGVyLnNpZ25hbDtcbiAgfVxuICBhYm9ydChyZWFzb24pIHtcbiAgICByZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuYWJvcnQocmVhc29uKTtcbiAgfVxuICBnZXQgaXNJbnZhbGlkKCkge1xuICAgIGlmIChicm93c2VyLnJ1bnRpbWUuaWQgPT0gbnVsbCkge1xuICAgICAgdGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zaWduYWwuYWJvcnRlZDtcbiAgfVxuICBnZXQgaXNWYWxpZCgpIHtcbiAgICByZXR1cm4gIXRoaXMuaXNJbnZhbGlkO1xuICB9XG4gIC8qKlxuICAgKiBBZGQgYSBsaXN0ZW5lciB0aGF0IGlzIGNhbGxlZCB3aGVuIHRoZSBjb250ZW50IHNjcmlwdCdzIGNvbnRleHQgaXMgaW52YWxpZGF0ZWQuXG4gICAqXG4gICAqIEByZXR1cm5zIEEgZnVuY3Rpb24gdG8gcmVtb3ZlIHRoZSBsaXN0ZW5lci5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihjYik7XG4gICAqIGNvbnN0IHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIgPSBjdHgub25JbnZhbGlkYXRlZCgoKSA9PiB7XG4gICAqICAgYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5yZW1vdmVMaXN0ZW5lcihjYik7XG4gICAqIH0pXG4gICAqIC8vIC4uLlxuICAgKiByZW1vdmVJbnZhbGlkYXRlZExpc3RlbmVyKCk7XG4gICAqL1xuICBvbkludmFsaWRhdGVkKGNiKSB7XG4gICAgdGhpcy5zaWduYWwuYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcbiAgICByZXR1cm4gKCkgPT4gdGhpcy5zaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcbiAgfVxuICAvKipcbiAgICogUmV0dXJuIGEgcHJvbWlzZSB0aGF0IG5ldmVyIHJlc29sdmVzLiBVc2VmdWwgaWYgeW91IGhhdmUgYW4gYXN5bmMgZnVuY3Rpb24gdGhhdCBzaG91bGRuJ3QgcnVuXG4gICAqIGFmdGVyIHRoZSBjb250ZXh0IGlzIGV4cGlyZWQuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGNvbnN0IGdldFZhbHVlRnJvbVN0b3JhZ2UgPSBhc3luYyAoKSA9PiB7XG4gICAqICAgaWYgKGN0eC5pc0ludmFsaWQpIHJldHVybiBjdHguYmxvY2soKTtcbiAgICpcbiAgICogICAvLyAuLi5cbiAgICogfVxuICAgKi9cbiAgYmxvY2soKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHtcbiAgICB9KTtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRJbnRlcnZhbGAgdGhhdCBhdXRvbWF0aWNhbGx5IGNsZWFycyB0aGUgaW50ZXJ2YWwgd2hlbiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHNldEludGVydmFsKGhhbmRsZXIsIHRpbWVvdXQpIHtcbiAgICBjb25zdCBpZCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRUaW1lb3V0YCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuICAgKi9cbiAgc2V0VGltZW91dChoYW5kbGVyLCB0aW1lb3V0KSB7XG4gICAgY29uc3QgaWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJUaW1lb3V0KGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZWAgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuICAgKiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShjYWxsYmFjaykge1xuICAgIGNvbnN0IGlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCguLi5hcmdzKSA9PiB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSBjYWxsYmFjayguLi5hcmdzKTtcbiAgICB9KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsQW5pbWF0aW9uRnJhbWUoaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgLyoqXG4gICAqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cucmVxdWVzdElkbGVDYWxsYmFja2AgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuICAgKiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHJlcXVlc3RJZGxlQ2FsbGJhY2soY2FsbGJhY2ssIG9wdGlvbnMpIHtcbiAgICBjb25zdCBpZCA9IHJlcXVlc3RJZGxlQ2FsbGJhY2soKC4uLmFyZ3MpID0+IHtcbiAgICAgIGlmICghdGhpcy5zaWduYWwuYWJvcnRlZCkgY2FsbGJhY2soLi4uYXJncyk7XG4gICAgfSwgb3B0aW9ucyk7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNhbmNlbElkbGVDYWxsYmFjayhpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICBhZGRFdmVudExpc3RlbmVyKHRhcmdldCwgdHlwZSwgaGFuZGxlciwgb3B0aW9ucykge1xuICAgIGlmICh0eXBlID09PSBcInd4dDpsb2NhdGlvbmNoYW5nZVwiKSB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSB0aGlzLmxvY2F0aW9uV2F0Y2hlci5ydW4oKTtcbiAgICB9XG4gICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXI/LihcbiAgICAgIHR5cGUuc3RhcnRzV2l0aChcInd4dDpcIikgPyBnZXRVbmlxdWVFdmVudE5hbWUodHlwZSkgOiB0eXBlLFxuICAgICAgaGFuZGxlcixcbiAgICAgIHtcbiAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgc2lnbmFsOiB0aGlzLnNpZ25hbFxuICAgICAgfVxuICAgICk7XG4gIH1cbiAgLyoqXG4gICAqIEBpbnRlcm5hbFxuICAgKiBBYm9ydCB0aGUgYWJvcnQgY29udHJvbGxlciBhbmQgZXhlY3V0ZSBhbGwgYG9uSW52YWxpZGF0ZWRgIGxpc3RlbmVycy5cbiAgICovXG4gIG5vdGlmeUludmFsaWRhdGVkKCkge1xuICAgIHRoaXMuYWJvcnQoXCJDb250ZW50IHNjcmlwdCBjb250ZXh0IGludmFsaWRhdGVkXCIpO1xuICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBDb250ZW50IHNjcmlwdCBcIiR7dGhpcy5jb250ZW50U2NyaXB0TmFtZX1cIiBjb250ZXh0IGludmFsaWRhdGVkYFxuICAgICk7XG4gIH1cbiAgc3RvcE9sZFNjcmlwdHMoKSB7XG4gICAgd2luZG93LnBvc3RNZXNzYWdlKFxuICAgICAge1xuICAgICAgICB0eXBlOiBDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsXG4gICAgICAgIGNvbnRlbnRTY3JpcHROYW1lOiB0aGlzLmNvbnRlbnRTY3JpcHROYW1lLFxuICAgICAgICBtZXNzYWdlSWQ6IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpXG4gICAgICB9LFxuICAgICAgXCIqXCJcbiAgICApO1xuICB9XG4gIHZlcmlmeVNjcmlwdFN0YXJ0ZWRFdmVudChldmVudCkge1xuICAgIGNvbnN0IGlzU2NyaXB0U3RhcnRlZEV2ZW50ID0gZXZlbnQuZGF0YT8udHlwZSA9PT0gQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFO1xuICAgIGNvbnN0IGlzU2FtZUNvbnRlbnRTY3JpcHQgPSBldmVudC5kYXRhPy5jb250ZW50U2NyaXB0TmFtZSA9PT0gdGhpcy5jb250ZW50U2NyaXB0TmFtZTtcbiAgICBjb25zdCBpc05vdER1cGxpY2F0ZSA9ICF0aGlzLnJlY2VpdmVkTWVzc2FnZUlkcy5oYXMoZXZlbnQuZGF0YT8ubWVzc2FnZUlkKTtcbiAgICByZXR1cm4gaXNTY3JpcHRTdGFydGVkRXZlbnQgJiYgaXNTYW1lQ29udGVudFNjcmlwdCAmJiBpc05vdER1cGxpY2F0ZTtcbiAgfVxuICBsaXN0ZW5Gb3JOZXdlclNjcmlwdHMob3B0aW9ucykge1xuICAgIGxldCBpc0ZpcnN0ID0gdHJ1ZTtcbiAgICBjb25zdCBjYiA9IChldmVudCkgPT4ge1xuICAgICAgaWYgKHRoaXMudmVyaWZ5U2NyaXB0U3RhcnRlZEV2ZW50KGV2ZW50KSkge1xuICAgICAgICB0aGlzLnJlY2VpdmVkTWVzc2FnZUlkcy5hZGQoZXZlbnQuZGF0YS5tZXNzYWdlSWQpO1xuICAgICAgICBjb25zdCB3YXNGaXJzdCA9IGlzRmlyc3Q7XG4gICAgICAgIGlzRmlyc3QgPSBmYWxzZTtcbiAgICAgICAgaWYgKHdhc0ZpcnN0ICYmIG9wdGlvbnM/Lmlnbm9yZUZpcnN0RXZlbnQpIHJldHVybjtcbiAgICAgICAgdGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuICAgICAgfVxuICAgIH07XG4gICAgYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgY2IpO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiByZW1vdmVFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCBjYikpO1xuICB9XG59XG4iLCJjb25zdCBudWxsS2V5ID0gU3ltYm9sKCdudWxsJyk7IC8vIGBvYmplY3RIYXNoZXNgIGtleSBmb3IgbnVsbFxuXG5sZXQga2V5Q291bnRlciA9IDA7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1hbnlLZXlzTWFwIGV4dGVuZHMgTWFwIHtcblx0Y29uc3RydWN0b3IoLi4uYXJndW1lbnRzXykge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9vYmplY3RIYXNoZXMgPSBuZXcgV2Vha01hcCgpO1xuXHRcdHRoaXMuX3N5bWJvbEhhc2hlcyA9IG5ldyBNYXAoKTsgLy8gaHR0cHM6Ly9naXRodWIuY29tL3RjMzkvZWNtYTI2Mi9pc3N1ZXMvMTE5NFxuXHRcdHRoaXMuX3B1YmxpY0tleXMgPSBuZXcgTWFwKCk7XG5cblx0XHRjb25zdCBbcGFpcnNdID0gYXJndW1lbnRzXzsgLy8gTWFwIGNvbXBhdFxuXHRcdGlmIChwYWlycyA9PT0gbnVsbCB8fCBwYWlycyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBwYWlyc1tTeW1ib2wuaXRlcmF0b3JdICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKHR5cGVvZiBwYWlycyArICcgaXMgbm90IGl0ZXJhYmxlIChjYW5ub3QgcmVhZCBwcm9wZXJ0eSBTeW1ib2woU3ltYm9sLml0ZXJhdG9yKSknKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFtrZXlzLCB2YWx1ZV0gb2YgcGFpcnMpIHtcblx0XHRcdHRoaXMuc2V0KGtleXMsIHZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRfZ2V0UHVibGljS2V5cyhrZXlzLCBjcmVhdGUgPSBmYWxzZSkge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShrZXlzKSkge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignVGhlIGtleXMgcGFyYW1ldGVyIG11c3QgYmUgYW4gYXJyYXknKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcml2YXRlS2V5ID0gdGhpcy5fZ2V0UHJpdmF0ZUtleShrZXlzLCBjcmVhdGUpO1xuXG5cdFx0bGV0IHB1YmxpY0tleTtcblx0XHRpZiAocHJpdmF0ZUtleSAmJiB0aGlzLl9wdWJsaWNLZXlzLmhhcyhwcml2YXRlS2V5KSkge1xuXHRcdFx0cHVibGljS2V5ID0gdGhpcy5fcHVibGljS2V5cy5nZXQocHJpdmF0ZUtleSk7XG5cdFx0fSBlbHNlIGlmIChjcmVhdGUpIHtcblx0XHRcdHB1YmxpY0tleSA9IFsuLi5rZXlzXTsgLy8gUmVnZW5lcmF0ZSBrZXlzIGFycmF5IHRvIGF2b2lkIGV4dGVybmFsIGludGVyYWN0aW9uXG5cdFx0XHR0aGlzLl9wdWJsaWNLZXlzLnNldChwcml2YXRlS2V5LCBwdWJsaWNLZXkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7cHJpdmF0ZUtleSwgcHVibGljS2V5fTtcblx0fVxuXG5cdF9nZXRQcml2YXRlS2V5KGtleXMsIGNyZWF0ZSA9IGZhbHNlKSB7XG5cdFx0Y29uc3QgcHJpdmF0ZUtleXMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRjb25zdCBrZXlUb1Bhc3MgPSBrZXkgPT09IG51bGwgPyBudWxsS2V5IDoga2V5O1xuXG5cdFx0XHRsZXQgaGFzaGVzO1xuXHRcdFx0aWYgKHR5cGVvZiBrZXlUb1Bhc3MgPT09ICdvYmplY3QnIHx8IHR5cGVvZiBrZXlUb1Bhc3MgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0aGFzaGVzID0gJ19vYmplY3RIYXNoZXMnO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2Yga2V5VG9QYXNzID09PSAnc3ltYm9sJykge1xuXHRcdFx0XHRoYXNoZXMgPSAnX3N5bWJvbEhhc2hlcyc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoYXNoZXMgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFoYXNoZXMpIHtcblx0XHRcdFx0cHJpdmF0ZUtleXMucHVzaChrZXlUb1Bhc3MpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzW2hhc2hlc10uaGFzKGtleVRvUGFzcykpIHtcblx0XHRcdFx0cHJpdmF0ZUtleXMucHVzaCh0aGlzW2hhc2hlc10uZ2V0KGtleVRvUGFzcykpO1xuXHRcdFx0fSBlbHNlIGlmIChjcmVhdGUpIHtcblx0XHRcdFx0Y29uc3QgcHJpdmF0ZUtleSA9IGBAQG1rbS1yZWYtJHtrZXlDb3VudGVyKyt9QEBgO1xuXHRcdFx0XHR0aGlzW2hhc2hlc10uc2V0KGtleVRvUGFzcywgcHJpdmF0ZUtleSk7XG5cdFx0XHRcdHByaXZhdGVLZXlzLnB1c2gocHJpdmF0ZUtleSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHByaXZhdGVLZXlzKTtcblx0fVxuXG5cdHNldChrZXlzLCB2YWx1ZSkge1xuXHRcdGNvbnN0IHtwdWJsaWNLZXl9ID0gdGhpcy5fZ2V0UHVibGljS2V5cyhrZXlzLCB0cnVlKTtcblx0XHRyZXR1cm4gc3VwZXIuc2V0KHB1YmxpY0tleSwgdmFsdWUpO1xuXHR9XG5cblx0Z2V0KGtleXMpIHtcblx0XHRjb25zdCB7cHVibGljS2V5fSA9IHRoaXMuX2dldFB1YmxpY0tleXMoa2V5cyk7XG5cdFx0cmV0dXJuIHN1cGVyLmdldChwdWJsaWNLZXkpO1xuXHR9XG5cblx0aGFzKGtleXMpIHtcblx0XHRjb25zdCB7cHVibGljS2V5fSA9IHRoaXMuX2dldFB1YmxpY0tleXMoa2V5cyk7XG5cdFx0cmV0dXJuIHN1cGVyLmhhcyhwdWJsaWNLZXkpO1xuXHR9XG5cblx0ZGVsZXRlKGtleXMpIHtcblx0XHRjb25zdCB7cHVibGljS2V5LCBwcml2YXRlS2V5fSA9IHRoaXMuX2dldFB1YmxpY0tleXMoa2V5cyk7XG5cdFx0cmV0dXJuIEJvb2xlYW4ocHVibGljS2V5ICYmIHN1cGVyLmRlbGV0ZShwdWJsaWNLZXkpICYmIHRoaXMuX3B1YmxpY0tleXMuZGVsZXRlKHByaXZhdGVLZXkpKTtcblx0fVxuXG5cdGNsZWFyKCkge1xuXHRcdHN1cGVyLmNsZWFyKCk7XG5cdFx0dGhpcy5fc3ltYm9sSGFzaGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcHVibGljS2V5cy5jbGVhcigpO1xuXHR9XG5cblx0Z2V0IFtTeW1ib2wudG9TdHJpbmdUYWddKCkge1xuXHRcdHJldHVybiAnTWFueUtleXNNYXAnO1xuXHR9XG5cblx0Z2V0IHNpemUoKSB7XG5cdFx0cmV0dXJuIHN1cGVyLnNpemU7XG5cdH1cbn1cbiIsImltcG9ydCBNYW55S2V5c01hcCBmcm9tICdtYW55LWtleXMtbWFwJztcbmltcG9ydCB7IGRlZnUgfSBmcm9tICdkZWZ1JztcbmltcG9ydCB7IGlzRXhpc3QgfSBmcm9tICcuL2RldGVjdG9ycy5tanMnO1xuXG5jb25zdCBnZXREZWZhdWx0T3B0aW9ucyA9ICgpID0+ICh7XG4gIHRhcmdldDogZ2xvYmFsVGhpcy5kb2N1bWVudCxcbiAgdW5pZnlQcm9jZXNzOiB0cnVlLFxuICBkZXRlY3RvcjogaXNFeGlzdCxcbiAgb2JzZXJ2ZUNvbmZpZ3M6IHtcbiAgICBjaGlsZExpc3Q6IHRydWUsXG4gICAgc3VidHJlZTogdHJ1ZSxcbiAgICBhdHRyaWJ1dGVzOiB0cnVlXG4gIH0sXG4gIHNpZ25hbDogdm9pZCAwLFxuICBjdXN0b21NYXRjaGVyOiB2b2lkIDBcbn0pO1xuY29uc3QgbWVyZ2VPcHRpb25zID0gKHVzZXJTaWRlT3B0aW9ucywgZGVmYXVsdE9wdGlvbnMpID0+IHtcbiAgcmV0dXJuIGRlZnUodXNlclNpZGVPcHRpb25zLCBkZWZhdWx0T3B0aW9ucyk7XG59O1xuXG5jb25zdCB1bmlmeUNhY2hlID0gbmV3IE1hbnlLZXlzTWFwKCk7XG5mdW5jdGlvbiBjcmVhdGVXYWl0RWxlbWVudChpbnN0YW5jZU9wdGlvbnMpIHtcbiAgY29uc3QgeyBkZWZhdWx0T3B0aW9ucyB9ID0gaW5zdGFuY2VPcHRpb25zO1xuICByZXR1cm4gKHNlbGVjdG9yLCBvcHRpb25zKSA9PiB7XG4gICAgY29uc3Qge1xuICAgICAgdGFyZ2V0LFxuICAgICAgdW5pZnlQcm9jZXNzLFxuICAgICAgb2JzZXJ2ZUNvbmZpZ3MsXG4gICAgICBkZXRlY3RvcixcbiAgICAgIHNpZ25hbCxcbiAgICAgIGN1c3RvbU1hdGNoZXJcbiAgICB9ID0gbWVyZ2VPcHRpb25zKG9wdGlvbnMsIGRlZmF1bHRPcHRpb25zKTtcbiAgICBjb25zdCB1bmlmeVByb21pc2VLZXkgPSBbXG4gICAgICBzZWxlY3RvcixcbiAgICAgIHRhcmdldCxcbiAgICAgIHVuaWZ5UHJvY2VzcyxcbiAgICAgIG9ic2VydmVDb25maWdzLFxuICAgICAgZGV0ZWN0b3IsXG4gICAgICBzaWduYWwsXG4gICAgICBjdXN0b21NYXRjaGVyXG4gICAgXTtcbiAgICBjb25zdCBjYWNoZWRQcm9taXNlID0gdW5pZnlDYWNoZS5nZXQodW5pZnlQcm9taXNlS2V5KTtcbiAgICBpZiAodW5pZnlQcm9jZXNzICYmIGNhY2hlZFByb21pc2UpIHtcbiAgICAgIHJldHVybiBjYWNoZWRQcm9taXNlO1xuICAgIH1cbiAgICBjb25zdCBkZXRlY3RQcm9taXNlID0gbmV3IFByb21pc2UoXG4gICAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQXN5bmNQcm9taXNlRXhlY3V0b3I6IGF2b2lkIG5lc3RpbmcgcHJvbWlzZVxuICAgICAgYXN5bmMgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBpZiAoc2lnbmFsPy5hYm9ydGVkKSB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChzaWduYWwucmVhc29uKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKFxuICAgICAgICAgIGFzeW5jIChtdXRhdGlvbnMpID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgXyBvZiBtdXRhdGlvbnMpIHtcbiAgICAgICAgICAgICAgaWYgKHNpZ25hbD8uYWJvcnRlZCkge1xuICAgICAgICAgICAgICAgIG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjb25zdCBkZXRlY3RSZXN1bHQyID0gYXdhaXQgZGV0ZWN0RWxlbWVudCh7XG4gICAgICAgICAgICAgICAgc2VsZWN0b3IsXG4gICAgICAgICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgICAgICAgIGRldGVjdG9yLFxuICAgICAgICAgICAgICAgIGN1c3RvbU1hdGNoZXJcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIGlmIChkZXRlY3RSZXN1bHQyLmlzRGV0ZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShkZXRlY3RSZXN1bHQyLnJlc3VsdCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHNpZ25hbD8uYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAgICAgICBcImFib3J0XCIsXG4gICAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgcmV0dXJuIHJlamVjdChzaWduYWwucmVhc29uKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIHsgb25jZTogdHJ1ZSB9XG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IGRldGVjdFJlc3VsdCA9IGF3YWl0IGRldGVjdEVsZW1lbnQoe1xuICAgICAgICAgIHNlbGVjdG9yLFxuICAgICAgICAgIHRhcmdldCxcbiAgICAgICAgICBkZXRlY3RvcixcbiAgICAgICAgICBjdXN0b21NYXRjaGVyXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoZGV0ZWN0UmVzdWx0LmlzRGV0ZWN0ZWQpIHtcbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZShkZXRlY3RSZXN1bHQucmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgICBvYnNlcnZlci5vYnNlcnZlKHRhcmdldCwgb2JzZXJ2ZUNvbmZpZ3MpO1xuICAgICAgfVxuICAgICkuZmluYWxseSgoKSA9PiB7XG4gICAgICB1bmlmeUNhY2hlLmRlbGV0ZSh1bmlmeVByb21pc2VLZXkpO1xuICAgIH0pO1xuICAgIHVuaWZ5Q2FjaGUuc2V0KHVuaWZ5UHJvbWlzZUtleSwgZGV0ZWN0UHJvbWlzZSk7XG4gICAgcmV0dXJuIGRldGVjdFByb21pc2U7XG4gIH07XG59XG5hc3luYyBmdW5jdGlvbiBkZXRlY3RFbGVtZW50KHtcbiAgdGFyZ2V0LFxuICBzZWxlY3RvcixcbiAgZGV0ZWN0b3IsXG4gIGN1c3RvbU1hdGNoZXJcbn0pIHtcbiAgY29uc3QgZWxlbWVudCA9IGN1c3RvbU1hdGNoZXIgPyBjdXN0b21NYXRjaGVyKHNlbGVjdG9yKSA6IHRhcmdldC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgcmV0dXJuIGF3YWl0IGRldGVjdG9yKGVsZW1lbnQpO1xufVxuY29uc3Qgd2FpdEVsZW1lbnQgPSBjcmVhdGVXYWl0RWxlbWVudCh7XG4gIGRlZmF1bHRPcHRpb25zOiBnZXREZWZhdWx0T3B0aW9ucygpXG59KTtcblxuZXhwb3J0IHsgY3JlYXRlV2FpdEVsZW1lbnQsIGdldERlZmF1bHRPcHRpb25zLCB3YWl0RWxlbWVudCB9O1xuIl0sIm5hbWVzIjpbImRlZmluaXRpb24iLCJ0aGlzIiwibW9kdWxlIiwicHJveHlUYXJnZXQiLCJ2YWx1ZSIsInJlc3VsdCIsIm1lc3NhZ2UiLCJwcmludCIsImxvZ2dlciJdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBTyxXQUFTLG9CQUFvQkEsYUFBWTtBQUM5QyxXQUFPQTtBQUFBLEVBQ1Q7QUNZTyxRQUFNLGtCQUFpQztBQUFBLElBQzVDLFFBQVE7QUFBQSxJQUNSLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBcURPLFdBQVMsbUJBQW1CLFVBQWtDO0FBQ25FLFdBQ0UsU0FBUyxVQUFVLE9BQ25CLFNBQVMsV0FBVyxPQUNwQixTQUFTLGNBQWMsT0FDdkIsU0FBUyxlQUFlLE9BQ3hCLENBQUMsU0FBUztBQUFBLEVBRWQ7QUFNQSxRQUFNLGdCQUNKLE9BQU8saUJB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LGNBQU0sWUFBWSxRQUFRLE9BQU8sVUFBVTtBQUUzQyxZQUFJO0FBQ0osWUFBSSxPQUFPLGNBQWMsWUFBWSxPQUFPLGNBQWMsWUFBWTtBQUNyRSxtQkFBUztBQUFBLFFBQ1YsV0FBVyxPQUFPLGNBQWMsVUFBVTtBQUN6QyxtQkFBUztBQUFBLFFBQ1YsT0FBTztBQUNOLG1CQUFTO0FBQUEsUUFDVjtBQUVBLFlBQUksQ0FBQyxRQUFRO0FBQ1osc0JBQVksS0FBSyxTQUFTO0FBQUEsUUFDM0IsV0FBVyxLQUFLLE1BQU0sRUFBRSxJQUFJLFNBQVMsR0FBRztBQUN2QyxzQkFBWSxLQUFLLEtBQUssTUFBTSxFQUFFLElBQUksU0FBUyxDQUFDO0FBQUEsUUFDN0MsV0FBVyxRQUFRO0FBQ2xCLGdCQUFNLGFBQWEsYUFBYSxZQUFZO0FBQzVDLGVBQUssTUFBTSxFQUFFLElBQUksV0FBVyxVQUFVO0FBQ3RDLHNCQUFZLEtBQUssVUFBVTtBQUFBLFFBQzVCLE9BQU87QUFDTixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBRUEsYUFBTyxLQUFLLFVBQVUsV0FBVztBQUFBLElBQ2xDO0FBQUEsSUFFQSxJQUFJLE1BQU0sT0FBTztBQUNoQixZQUFNLEVBQUMsVUFBUyxJQUFJLEtBQUssZUFBZSxNQUFNLElBQUk7QUFDbEQsYUFBTyxNQUFNLElBQUksV0FBVyxLQUFLO0FBQUEsSUFDbEM7QUFBQSxJQUVBLElBQUksTUFBTTtBQUNULFlBQU0sRUFBQyxVQUFTLElBQUksS0FBSyxlQUFlLElBQUk7QUFDNUMsYUFBTyxNQUFNLElBQUksU0FBUztBQUFBLElBQzNCO0FBQUEsSUFFQSxJQUFJLE1BQU07QUFDVCxZQUFNLEVBQUMsVUFBUyxJQUFJLEtBQUssZUFBZSxJQUFJO0FBQzVDLGFBQU8sTUFBTSxJQUFJLFNBQVM7QUFBQSxJQUMzQjtBQUFBLElBRUEsT0FBTyxNQUFNO0FBQ1osWUFBTSxFQUFDLFdBQVcsV0FBVSxJQUFJLEtBQUssZUFBZSxJQUFJO0FBQ3hELGFBQU8sUUFBUSxhQUFhLE1BQU0sT0FBTyxTQUFTLEtBQUssS0FBSyxZQUFZLE9BQU8sVUFBVSxDQUFDO0FBQUEsSUFDM0Y7QUFBQSxJQUVBLFFBQVE7QUFDUCxZQUFNLE1BQUs7QUFDWCxXQUFLLGNBQWMsTUFBSztBQUN4QixXQUFLLFlBQVksTUFBSztBQUFBLElBQ3ZCO0FBQUEsSUFFQSxLQUFLLE9BQU8sV0FBVyxJQUFJO0FBQzFCLGFBQU87QUFBQSxJQUNSO0FBQUEsSUFFQSxJQUFJLE9BQU87QUFDVixhQUFPLE1BQU07QUFBQSxJQUNkO0FBQUEsRUFDRDtBQ3ZGbUIsTUFBSSxZQUFXOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7IiwieF9nb29nbGVfaWdub3JlTGlzdCI6WzAsMTIsMTMsMTQsMTUsMTYsMTcsMTgsMTldfQ==
