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
    matches: ["http://*/*", "https://*/*"],
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3d4dEAwLjE5LjI5X0B0eXBlcytub2RlQDI1LjYuMV9yb2xsdXBANC42MC4zL25vZGVfbW9kdWxlcy93eHQvZGlzdC9zYW5kYm94L2RlZmluZS1jb250ZW50LXNjcmlwdC5tanMiLCIuLi8uLi8uLi9zcmMvdHlwZXMudHMiLCIuLi8uLi8uLi9zcmMvYXVkaW8tcHJvY2Vzc29yLnRzIiwiLi4vLi4vLi4vc3JjL21lZGlhLW1hbmFnZXIudHMiLCIuLi8uLi8uLi9zcmMvbWVkaWEtcHJvY2Vzc29yLnRzIiwiLi4vLi4vLi4vc3JjL3NldHRpbmdzLWhhbmRsZXIudHMiLCIuLi8uLi8uLi9zcmMvaWZyYW1lLWhvc3RuYW1lLWhhbmRsZXIudHMiLCIuLi8uLi8uLi9zcmMvY29udGVudC1zY3JpcHQvbWVkaWEtZXZlbnRzLnRzIiwiLi4vLi4vLi4vc3JjL2NvbnRlbnQtc2NyaXB0L21lc3NhZ2UtaGFuZGxlci50cyIsIi4uLy4uLy4uL3NyYy9jb250ZW50LXNjcmlwdC9kb20tbGlmZWN5Y2xlLnRzIiwiLi4vLi4vLi4vc3JjL2NvbnRlbnQtc2NyaXB0LWluaXQudHMiLCIuLi8uLi8uLi9lbnRyeXBvaW50cy9jb250ZW50LnRzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3dlYmV4dGVuc2lvbi1wb2x5ZmlsbEAwLjEyLjAvbm9kZV9tb2R1bGVzL3dlYmV4dGVuc2lvbi1wb2x5ZmlsbC9kaXN0L2Jyb3dzZXItcG9seWZpbGwuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIvaW5kZXgubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3d4dEAwLjE5LjI5X0B0eXBlcytub2RlQDI1LjYuMV9yb2xsdXBANC42MC4zL25vZGVfbW9kdWxlcy93eHQvZGlzdC9zYW5kYm94L3V0aWxzL2xvZ2dlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2NsaWVudC9jb250ZW50LXNjcmlwdHMvY3VzdG9tLWV2ZW50cy5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2NsaWVudC9jb250ZW50LXNjcmlwdHMvbG9jYXRpb24td2F0Y2hlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMTkuMjlfQHR5cGVzK25vZGVAMjUuNi4xX3JvbGx1cEA0LjYwLjMvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2NsaWVudC9jb250ZW50LXNjcmlwdHMvY29udGVudC1zY3JpcHQtY29udGV4dC5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vbWFueS1rZXlzLW1hcEAzLjAuMy9ub2RlX21vZHVsZXMvbWFueS1rZXlzLW1hcC9pbmRleC5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9AMW5hdHN1K3dhaXQtZWxlbWVudEA0LjIuMC9ub2RlX21vZHVsZXMvQDFuYXRzdS93YWl0LWVsZW1lbnQvZGlzdC9pbmRleC5tanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIGRlZmluZUNvbnRlbnRTY3JpcHQoZGVmaW5pdGlvbikge1xuICByZXR1cm4gZGVmaW5pdGlvbjtcbn1cbiIsImV4cG9ydCBpbnRlcmZhY2UgQXVkaW9TZXR0aW5ncyB7XG4gIHZvbHVtZTogbnVtYmVyO1xuICBiYXNzQm9vc3Q6IG51bWJlcjtcbiAgdm9pY2VCb29zdDogbnVtYmVyO1xuICBtb25vOiBib29sZWFuO1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVTZXR0aW5ncyB7XG4gIGVuYWJsZWQ6IGJvb2xlYW47XG4gIHNldHRpbmdzPzogQXVkaW9TZXR0aW5ncztcbiAgYWN0aXZlU2V0dGluZzogXCJnbG9iYWxcIiB8IFwic2l0ZVwiIHwgXCJkaXNhYmxlZFwiO1xufVxuXG5leHBvcnQgY29uc3QgZGVmYXVsdFNldHRpbmdzOiBBdWRpb1NldHRpbmdzID0ge1xuICB2b2x1bWU6IDEwMCxcbiAgYmFzc0Jvb3N0OiAxMDAsXG4gIHZvaWNlQm9vc3Q6IDEwMCxcbiAgbW9ubzogZmFsc2UsXG4gIHNwZWVkOiAxMDAsXG59O1xuXG5leHBvcnQgY29uc3QgZGVmYXVsdFNpdGVTZXR0aW5nczogU2l0ZVNldHRpbmdzID0ge1xuICBlbmFibGVkOiB0cnVlLFxuICBzZXR0aW5nczogeyAuLi5kZWZhdWx0U2V0dGluZ3MgfSxcbiAgYWN0aXZlU2V0dGluZzogXCJnbG9iYWxcIiwgLy8gU3RhcnRzIGluIGdsb2JhbCBtb2RlLCBjYW4gYmUgY2hhbmdlZCB0byBcInNpdGVcIiBvciBcImRpc2FibGVkXCJcbn07XG5cbmV4cG9ydCB0eXBlIFN0YXRlVHlwZSA9IHtcbiAgZ2xvYmFsU2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3M7XG4gIHNpdGVTZXR0aW5nczogTWFwPHN0cmluZywgU2l0ZVNldHRpbmdzPjtcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVXBkYXRlU2V0dGluZ3NNZXNzYWdlIHtcbiAgdHlwZTogXCJVUERBVEVfU0VUVElOR1NcIjtcbiAgc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3M7XG4gIGVuYWJsZWQ/OiBib29sZWFuO1xuICBpc0dsb2JhbD86IGJvb2xlYW47XG4gIGhvc3RuYW1lPzogc3RyaW5nOyAvLyBBZGQgb3B0aW9uYWwgaG9zdG5hbWVcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb250ZW50U2NyaXB0UmVhZHlNZXNzYWdlIHtcbiAgdHlwZTogXCJDT05URU5UX1NDUklQVF9SRUFEWVwiO1xuICBob3N0bmFtZT86IHN0cmluZztcbiAgdXNpbmdHbG9iYWw/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVwZGF0ZVNpdGVNb2RlTWVzc2FnZSB7XG4gIHR5cGU6IFwiVVBEQVRFX1NJVEVfTU9ERVwiO1xuICBob3N0bmFtZT86IHN0cmluZztcbiAgbW9kZT86IFwiZ2xvYmFsXCIgfCBcInNpdGVcIiB8IFwiZGlzYWJsZWRcIjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHZXRJbml0aWFsU2V0dGluZ3NNZXNzYWdlIHtcbiAgdHlwZTogXCJHRVRfSU5JVElBTF9TRVRUSU5HU1wiO1xuICBob3N0bmFtZT86IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgTWVzc2FnZVR5cGUgPVxuICB8IFVwZGF0ZVNldHRpbmdzTWVzc2FnZVxuICB8IENvbnRlbnRTY3JpcHRSZWFkeU1lc3NhZ2VcbiAgfCBVcGRhdGVTaXRlTW9kZU1lc3NhZ2VcbiAgfCBHZXRJbml0aWFsU2V0dGluZ3NNZXNzYWdlO1xuXG5leHBvcnQgdHlwZSBTdG9yYWdlRGF0YSA9IHtcbiAgZ2xvYmFsU2V0dGluZ3M/OiBBdWRpb1NldHRpbmdzO1xuICBzaXRlU2V0dGluZ3M/OiB7IFtob3N0bmFtZTogc3RyaW5nXTogU2l0ZVNldHRpbmdzIH07XG59O1xuXG4vKipcbiAqIENoZWNrIGlmIGFsbCBhdWRpbyBzZXR0aW5ncyBhcmUgYXQgdGhlaXIgZGVmYXVsdCAoZGlzYWJsZWQpIHZhbHVlcy5cbiAqIFRoaXMgaXMgYSBwdXJlIGZ1bmN0aW9uIHVzZWQgYWNyb3NzIGNvbnRlbnQgc2NyaXB0IGFuZCBwb3B1cC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzU2V0dGluZ3NEaXNhYmxlZChzZXR0aW5nczogQXVkaW9TZXR0aW5ncyk6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIHNldHRpbmdzLnNwZWVkID09PSAxMDAgJiZcbiAgICBzZXR0aW5ncy52b2x1bWUgPT09IDEwMCAmJlxuICAgIHNldHRpbmdzLmJhc3NCb29zdCA9PT0gMTAwICYmXG4gICAgc2V0dGluZ3Mudm9pY2VCb29zdCA9PT0gMTAwICYmXG4gICAgIXNldHRpbmdzLm1vbm9cbiAgKTtcbn1cblxuLyoqXG4gKiBEZWJ1ZyBsb2dnZXIgdGhhdCBjYW4gYmUgZGlzYWJsZWQgaW4gcHJvZHVjdGlvbi5cbiAqIFNldCBsb2NhbFN0b3JhZ2UuZGVidWdWdnAgPSAndHJ1ZScgdG8gZW5hYmxlIGRlYnVnIG91dHB1dC5cbiAqL1xuY29uc3QgREVCVUdfRU5BQkxFRCA9XG4gIHR5cGVvZiBsb2NhbFN0b3JhZ2UgIT09IFwidW5kZWZpbmVkXCIgJiZcbiAgbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJkZWJ1Z1Z2cFwiKSA9PT0gXCJ0cnVlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWJ1Z0xvZyguLi5hcmdzOiBhbnlbXSkge1xuICBpZiAoREVCVUdfRU5BQkxFRCkge1xuICAgIGNvbnNvbGUubG9nKFwiW1ZWUF1cIiwgLi4uYXJncyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlYnVnV2FybiguLi5hcmdzOiBhbnlbXSkge1xuICBpZiAoREVCVUdfRU5BQkxFRCkge1xuICAgIGNvbnNvbGUud2FybihcIltWVlBdXCIsIC4uLmFyZ3MpO1xuICB9XG59XG5cbiIsImltcG9ydCB7IEF1ZGlvU2V0dGluZ3MgLCBkZWJ1Z0xvZyB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXVkaW9Ob2RlcyB7XG4gIGNvbnRleHQ6IEF1ZGlvQ29udGV4dDtcbiAgc291cmNlOiBNZWRpYUVsZW1lbnRBdWRpb1NvdXJjZU5vZGU7XG4gIGdhaW46IEdhaW5Ob2RlO1xuICBiYXNzRmlsdGVyOiBCaXF1YWRGaWx0ZXJOb2RlO1xuICB2b2ljZUZpbHRlcjogQmlxdWFkRmlsdGVyTm9kZTtcbiAgbWVyZ2VyOiBDaGFubmVsTWVyZ2VyTm9kZTtcbiAgc3BsaXR0ZXI6IENoYW5uZWxTcGxpdHRlck5vZGU7XG4gIGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQ7XG4gIG1vbm86IGJvb2xlYW47IC8vIFRyYWNrIHRoZSBjdXJyZW50IG1vbm8gc2V0dGluZyBmb3IgdGhpcyBlbGVtZW50XG4gIGN1cnJlbnRTcmM6IHN0cmluZzsgLy8gVHJhY2sgdGhlIHNyYyB0aGF0IHRoZSBzb3VyY2Ugbm9kZSB3YXMgY3JlYXRlZCB3aXRoXG59XG5cbmV4cG9ydCBjbGFzcyBBdWRpb1Byb2Nlc3NvciB7XG4gIGF1ZGlvQ29udGV4dDogQXVkaW9Db250ZXh0IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgYXVkaW9FbGVtZW50TWFwID0gbmV3IE1hcDxIVE1MTWVkaWFFbGVtZW50LCBBdWRpb05vZGVzPigpO1xuXG4gIGFzeW5jIHNldHVwQXVkaW9Db250ZXh0KFxuICAgIG1lZGlhRWxlbWVudDogSFRNTE1lZGlhRWxlbWVudCxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5nc1xuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIFwiQXVkaW9Qcm9jZXNzb3I6IFNldHRpbmcgdXAgYXVkaW8gY29udGV4dCB3aXRoIHNldHRpbmdzOlwiLFxuICAgICAgICBzZXR0aW5nc1xuICAgICAgKTtcblxuICAgICAgLy8gQ2hlY2sgaWYgdGhlIG1lZGlhIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgdXNlZCBhcyBhbiBhdWRpbyBzb3VyY2VcbiAgICAgIC8vIEhUTUxNZWRpYUVsZW1lbnQuSEFWRV9NRVRBREFUQSAoMSkgbWVhbnMgZW5vdWdoIGRhdGEgaXMgYXZhaWxhYmxlIHRoYXQgdGhlIGR1cmF0aW9uIG9mIHRoZSByZXNvdXJjZSBpcyBhdmFpbGFibGUuXG4gICAgICAvLyBjcmVhdGVNZWRpYUVsZW1lbnRTb3VyY2UgdHlwaWNhbGx5IHJlcXVpcmVzIGF0IGxlYXN0IEhBVkVfTUVUQURBVEEuXG4gICAgICBpZiAobWVkaWFFbGVtZW50LnJlYWR5U3RhdGUgPCBIVE1MTWVkaWFFbGVtZW50LkhBVkVfTUVUQURBVEEpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBBdWRpb1Byb2Nlc3NvcjogTWVkaWEgZWxlbWVudCAke21lZGlhRWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwifSBpcyBub3QgcmVhZHkgKHJlYWR5U3RhdGU6ICR7bWVkaWFFbGVtZW50LnJlYWR5U3RhdGV9KS4gRGVmZXJyaW5nIGF1ZGlvIGNvbnRleHQgc2V0dXAuYFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47IC8vIERlZmVyIHByb2Nlc3NpbmcgdW50aWwgdGhlIGVsZW1lbnQgaXMgcmVhZHlcbiAgICAgIH1cblxuICAgICAgLy8gSW5pdGlhbGl6ZSBhdWRpbyBjb250ZXh0IGlmIG5lZWRlZFxuICAgICAgaWYgKCF0aGlzLmF1ZGlvQ29udGV4dCkge1xuICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dCA9IG5ldyBBdWRpb0NvbnRleHQoKTtcbiAgICAgICAgLy8gUmVzdW1lIHdpbGwgYmUgY2FsbGVkIGxhdGVyIGFmdGVyIGEgdXNlciBnZXN0dXJlXG4gICAgICB9XG5cbiAgICAgIGxldCBub2RlcyA9IHRoaXMuYXVkaW9FbGVtZW50TWFwLmdldChtZWRpYUVsZW1lbnQpO1xuXG4gICAgICBpZiAobm9kZXMpIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gUmV1c2luZyBleGlzdGluZyBhdWRpbyBub2RlcyBmb3IgZWxlbWVudDogJHtcbiAgICAgICAgICAgIG1lZGlhRWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgfWBcbiAgICAgICAgKTtcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIG1lZGlhIHNvdXJjZSBoYXMgY2hhbmdlZCBPUiBpZiB0aGUgc291cmNlIG5vZGUgaXMgc29tZWhvdyBudWxsXG4gICAgICAgIC8vIFVzZSBjdXJyZW50U3JjIGluc3RlYWQgb2Ygc3JjIHRvIGhhbmRsZSBibG9iL0hMUyBVUkxzIGNvcnJlY3RseVxuICAgICAgICBsZXQgc291cmNlQ2hhbmdlZCA9IGZhbHNlO1xuICAgICAgICBpZiAodGhpcy5hdWRpb0NvbnRleHQgJiYgKG5vZGVzLmN1cnJlbnRTcmMgIT09IG1lZGlhRWxlbWVudC5jdXJyZW50U3JjIHx8ICFub2Rlcy5zb3VyY2UpKSB7XG4gICAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBNZWRpYSBzb3VyY2UgY2hhbmdlZCBmcm9tICR7XG4gICAgICAgICAgICAgIG5vZGVzLmN1cnJlbnRTcmNcbiAgICAgICAgICAgIH0gdG8gJHttZWRpYUVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIn0gb3Igc291cmNlIGludmFsaWQuIFJlY3JlYXRpbmcgc291cmNlIG5vZGUuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKG5vZGVzLnNvdXJjZSkge1xuICAgICAgICAgICAgLy8gSWYgb2xkIHNvdXJjZSBleGlzdHMsIGRpc2Nvbm5lY3QgaXQgZnVsbHlcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIG5vZGVzLnNvdXJjZS5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIC8qIElnbm9yZSBkaXNjb25uZWN0IGVycm9ycyBpZiBhbHJlYWR5IGRpc2Nvbm5lY3RlZCBvciBpbnZhbGlkICovXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIG5vZGVzLnNvdXJjZSA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZU1lZGlhRWxlbWVudFNvdXJjZShtZWRpYUVsZW1lbnQpO1xuICAgICAgICAgIG5vZGVzLmN1cnJlbnRTcmMgPSBtZWRpYUVsZW1lbnQuY3VycmVudFNyYztcbiAgICAgICAgICBzb3VyY2VDaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE9ubHkgcmVjb25uZWN0IHRoZSBncmFwaCB0b3BvbG9neSBpZiBtb25vIHNldHRpbmcgY2hhbmdlZCBvciBzb3VyY2UgY2hhbmdlZC5cbiAgICAgICAgLy8gUmVjb25uZWN0aW5nIG9uIGV2ZXJ5IHBhcmFtZXRlciBjaGFuZ2UgY2F1c2VzIGF1ZGlibGUgY2xpY2tzL3BvcHMuXG4gICAgICAgIGNvbnN0IG1vbm9DaGFuZ2VkID0gbm9kZXMubW9ubyAhPT0gc2V0dGluZ3MubW9ubztcbiAgICAgICAgaWYgKHNvdXJjZUNoYW5nZWQgfHwgbW9ub0NoYW5nZWQpIHtcbiAgICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICAgIGBbQXVkaW9Qcm9jZXNzb3JdIEdyYXBoIHRvcG9sb2d5IGNoYW5nZWQgKHNvdXJjZUNoYW5nZWQ9JHtzb3VyY2VDaGFuZ2VkfSwgbW9ub0NoYW5nZWQ9JHttb25vQ2hhbmdlZH0pLiBSZWNvbm5lY3Rpbmcgbm9kZXMuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5jb25uZWN0Tm9kZXMobm9kZXMsIHNldHRpbmdzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBKdXN0IHVwZGF0ZSBwYXJhbWV0ZXIgdmFsdWVzIHdpdGhvdXQgZGlzY29ubmVjdGluZy9yZWNvbm5lY3RpbmdcbiAgICAgICAgICBhd2FpdCB0aGlzLnVwZGF0ZU5vZGVTZXR0aW5ncyhub2Rlcywgc2V0dGluZ3MpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBDcmVhdGluZyBuZXcgYXVkaW8gbm9kZXMgZm9yIGVsZW1lbnQ6ICR7XG4gICAgICAgICAgICBtZWRpYUVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgICAgIH1gXG4gICAgICAgICk7XG4gICAgICAgIC8vIENyZWF0ZSBhbmQgY29uZmlndXJlIG5ldyBub2Rlc1xuICAgICAgICAvLyBjcmVhdGVBdWRpb05vZGVzIGNhbGxzIGNvbm5lY3ROb2RlcyBpbnRlcm5hbGx5LCB3aGljaCB3aWxsIGJ1aWxkIHRoZSBncmFwaC5cbiAgICAgICAgbm9kZXMgPSBhd2FpdCB0aGlzLmNyZWF0ZUF1ZGlvTm9kZXMobWVkaWFFbGVtZW50LCBzZXR0aW5ncyk7XG4gICAgICAgIHRoaXMuYXVkaW9FbGVtZW50TWFwLnNldChtZWRpYUVsZW1lbnQsIG5vZGVzKTtcbiAgICAgICAgLy8gTm8gbmVlZCB0byBjYWxsIGNvbm5lY3ROb2RlcyBhZ2FpbiBoZXJlLCBhcyBjcmVhdGVBdWRpb05vZGVzIGRvZXMgaXQuXG4gICAgICB9XG5cbiAgICAgIGRlYnVnTG9nKFwiQXVkaW9Qcm9jZXNzb3I6IFNldHVwIGNvbXBsZXRlIGZvcjpcIiwgbWVkaWFFbGVtZW50LnNyYyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJBdWRpb1Byb2Nlc3NvcjogU2V0dXAgZmFpbGVkOlwiLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNyZWF0ZUF1ZGlvTm9kZXMoXG4gICAgbWVkaWFFbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50LFxuICAgIHNldHRpbmdzOiBBdWRpb1NldHRpbmdzXG4gICk6IFByb21pc2U8QXVkaW9Ob2Rlcz4ge1xuICAgIGlmICghdGhpcy5hdWRpb0NvbnRleHQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkF1ZGlvQ29udGV4dCBub3QgaW5pdGlhbGl6ZWRcIik7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIG5vZGVzXG4gICAgY29uc3Qgc291cmNlID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlTWVkaWFFbGVtZW50U291cmNlKG1lZGlhRWxlbWVudCk7XG4gICAgY29uc3QgZ2FpbiA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKTtcbiAgICBjb25zdCBiYXNzRmlsdGVyID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XG4gICAgY29uc3Qgdm9pY2VGaWx0ZXIgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCaXF1YWRGaWx0ZXIoKTtcbiAgICBjb25zdCBzcGxpdHRlciA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUNoYW5uZWxTcGxpdHRlcigyKTtcbiAgICBjb25zdCBtZXJnZXIgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVDaGFubmVsTWVyZ2VyKDIpO1xuXG4gICAgLy8gQ29uZmlndXJlIGZpbHRlcnNcbiAgICBiYXNzRmlsdGVyLnR5cGUgPSBcImxvd3NoZWxmXCI7XG4gICAgYmFzc0ZpbHRlci5mcmVxdWVuY3kudmFsdWUgPSAxMDA7XG4gICAgdm9pY2VGaWx0ZXIudHlwZSA9IFwicGVha2luZ1wiO1xuICAgIHZvaWNlRmlsdGVyLmZyZXF1ZW5jeS52YWx1ZSA9IDIwMDA7XG4gICAgdm9pY2VGaWx0ZXIuUS52YWx1ZSA9IDE7XG5cbiAgICBjb25zdCBub2RlczogQXVkaW9Ob2RlcyA9IHtcbiAgICAgIGNvbnRleHQ6IHRoaXMuYXVkaW9Db250ZXh0LFxuICAgICAgc291cmNlLFxuICAgICAgZ2FpbixcbiAgICAgIGJhc3NGaWx0ZXIsXG4gICAgICB2b2ljZUZpbHRlcixcbiAgICAgIHNwbGl0dGVyLFxuICAgICAgbWVyZ2VyLFxuICAgICAgZWxlbWVudDogbWVkaWFFbGVtZW50LFxuICAgICAgbW9ubzogc2V0dGluZ3MubW9ubywgLy8gSW5pdGlhbGl6ZSBtb25vIHNldHRpbmcsIGNvbm5lY3ROb2RlcyB3aWxsIHVzZSBzZXR0aW5ncy5tb25vXG4gICAgICBjdXJyZW50U3JjOiBtZWRpYUVsZW1lbnQuY3VycmVudFNyYywgLy8gSW5pdGlhbGl6ZSBjdXJyZW50U3JjXG4gICAgfTtcblxuICAgIC8vIENvbm5lY3Qgbm9kZXMgYmFzZWQgb24gc2V0dGluZ3NcbiAgICBhd2FpdCB0aGlzLmNvbm5lY3ROb2Rlcyhub2Rlcywgc2V0dGluZ3MpO1xuXG4gICAgcmV0dXJuIG5vZGVzO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGRhdGVOb2RlU2V0dGluZ3MoXG4gICAgbm9kZXM6IEF1ZGlvTm9kZXMsXG4gICAgc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3NcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgeyBnYWluLCBiYXNzRmlsdGVyLCB2b2ljZUZpbHRlciwgY29udGV4dCwgZWxlbWVudCB9ID0gbm9kZXM7IC8vIEFkZGVkIGVsZW1lbnRcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBzYWZlVGltZVZhbHVlID0gaXNGaW5pdGUoY29udGV4dC5jdXJyZW50VGltZSlcbiAgICAgICAgPyBjb250ZXh0LmN1cnJlbnRUaW1lXG4gICAgICAgIDogMDtcblxuICAgICAgLy8gRGV0ZXJtaW5lIHRhcmdldCB2b2x1bWUgZm9yIGVsZW1lbnQgYW5kIGdhaW4gbm9kZVxuICAgICAgbGV0IGVsZW1lbnRWb2x1bWUgPSAxLjA7IC8vIERlZmF1bHQgdG8gbWF4IGZvciBlbGVtZW50XG4gICAgICBsZXQgZ2Fpbk5vZGVWb2x1bWUgPSAxLjA7IC8vIERlZmF1bHQgZ2FpblxuXG4gICAgICBpZiAoc2V0dGluZ3Mudm9sdW1lIDw9IDEwMCkge1xuICAgICAgICAvLyBJZiB2b2x1bWUgaXMgMTAwJSBvciBsZXNzLCBjb250cm9sIHZpYSBlbGVtZW50LnZvbHVtZVxuICAgICAgICBlbGVtZW50Vm9sdW1lID0gTWF0aC5tYXgoMCwgc2V0dGluZ3Mudm9sdW1lKSAvIDEwMDtcbiAgICAgICAgZ2Fpbk5vZGVWb2x1bWUgPSAxLjA7IC8vIEtlZXAgR2Fpbk5vZGUgbmV1dHJhbFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSWYgdm9sdW1lIGlzID4gMTAwJSwgc2V0IGVsZW1lbnQgdm9sdW1lIHRvIG1heCBhbmQgdXNlIEdhaW5Ob2RlIGZvciBib29zdFxuICAgICAgICBlbGVtZW50Vm9sdW1lID0gMS4wO1xuICAgICAgICBnYWluTm9kZVZvbHVtZSA9IE1hdGgubWF4KDEsIE1hdGgubWluKHNldHRpbmdzLnZvbHVtZSwgMTAwMCkpIC8gMTAwOyAvLyBBcHBseSBib29zdCB2aWEgR2Fpbk5vZGVcbiAgICAgIH1cblxuICAgICAgLy8gQXBwbHkgZWxlbWVudCB2b2x1bWUgaW1tZWRpYXRlbHkgKGRvZXMgbm90IHJlcXVpcmUgdXNlciBnZXN0dXJlKVxuICAgICAgaWYgKGlzRmluaXRlKGVsZW1lbnRWb2x1bWUpKSB7XG4gICAgICAgIGVsZW1lbnQudm9sdW1lID0gZWxlbWVudFZvbHVtZTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2xhbXAgdmFsdWVzIGZvciBmaWx0ZXJzXG4gICAgICBjb25zdCBjbGFtcGVkQmFzcyA9IE1hdGgubWF4KFxuICAgICAgICAtMTUsXG4gICAgICAgIE1hdGgubWluKCgoc2V0dGluZ3MuYmFzc0Jvb3N0IC0gMTAwKSAvIDEwMCkgKiAxNSwgMTUpXG4gICAgICApO1xuICAgICAgY29uc3QgY2xhbXBlZFZvaWNlID0gTWF0aC5tYXgoXG4gICAgICAgIC0yNCxcbiAgICAgICAgTWF0aC5taW4oKChzZXR0aW5ncy52b2ljZUJvb3N0IC0gMTAwKSAvIDEwMCkgKiAyNCwgMjQpXG4gICAgICApO1xuXG4gICAgICAvLyBVcGRhdGUgV2ViIEF1ZGlvIEFQSSBwYXJhbWV0ZXJzIHVzaW5nIHNldFRhcmdldEF0VGltZSBmb3IgcG90ZW50aWFsbHkgbW9yZSByb2J1c3QgYXBwbGljYXRpb25cbiAgICAgIGNvbnN0IHRpbWVDb25zdGFudCA9IDAuMDE7IC8vIEFwcGx5IHF1aWNrbHlcbiAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gY29udGV4dC5jdXJyZW50VGltZTsgLy8gVXNlIGN1cnJlbnQgY29udGV4dCB0aW1lIGFzIHN0YXJ0IHRpbWVcblxuICAgICAgLy8gU2V0IGltbWVkaWF0ZSB2YWx1ZVxuICAgICAgZ2Fpbi5nYWluLnZhbHVlID0gZ2Fpbk5vZGVWb2x1bWU7XG5cbiAgICAgIGJhc3NGaWx0ZXIuZ2Fpbi52YWx1ZSA9IGNsYW1wZWRCYXNzO1xuXG4gICAgICB2b2ljZUZpbHRlci5nYWluLnZhbHVlID0gY2xhbXBlZFZvaWNlO1xuXG4gICAgICAvLyBBRERFRCBMT0dTOiBMb2cgdGhlIHZhbHVlcyBiZWluZyBhcHBsaWVkIHRvIHRoZSBub2Rlc1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIGBbQXVkaW9Qcm9jZXNzb3JdIEFwcGx5aW5nIE5vZGUgU2V0dGluZ3MgKGltbWVkaWF0ZSArIHNldFRhcmdldEF0VGltZSkgYXQgJHtjdXJyZW50VGltZX06YCxcbiAgICAgICAge1xuICAgICAgICAgIGVsZW1lbnRWb2x1bWU6IGVsZW1lbnQudm9sdW1lLCAvLyBMb2cgdGhlIGRpcmVjdGx5IHNldCBlbGVtZW50IHZvbHVtZVxuICAgICAgICAgIHRhcmdldEdhaW5Ob2RlVm9sdW1lOiBnYWluTm9kZVZvbHVtZSwgLy8gTG9nIHRhcmdldCB2YWx1ZXNcbiAgICAgICAgICB0YXJnZXRCYXNzR2FpbjogY2xhbXBlZEJhc3MsXG4gICAgICAgICAgdGFyZ2V0Vm9pY2VHYWluOiBjbGFtcGVkVm9pY2UsXG4gICAgICAgICAgdm9pY2VHYWluOiBjbGFtcGVkVm9pY2UsXG4gICAgICAgICAgbW9ubzogc2V0dGluZ3MubW9ubywgLy8gTG9nIG1vbm8gc2V0dGluZyBhcyBpdCBhZmZlY3RzIGNvbm5lY3Rpb25zXG4gICAgICAgIH1cbiAgICAgICk7XG5cbiAgICAgIC8vIGRlYnVnTG9nKFwiQXVkaW9Qcm9jZXNzb3I6IFNldHRpbmdzIHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5XCIsIHsgLy8gUmVkdWNlZCBsb2dnaW5nXG4gICAgICAvLyAgIHZvbHVtZTogY2xhbXBlZFZvbHVtZSxcbiAgICAgIC8vICAgYmFzczogY2xhbXBlZEJhc3MsXG4gICAgICAvLyAgIHZvaWNlOiBjbGFtcGVkVm9pY2UsXG4gICAgICAvLyAgIG1vbm86IHNldHRpbmdzLm1vbm8sXG4gICAgICAvLyB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkF1ZGlvUHJvY2Vzc29yOiBGYWlsZWQgdG8gdXBkYXRlIHNldHRpbmdzOlwiLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbm5lY3ROb2RlcyhcbiAgICBub2RlczogQXVkaW9Ob2RlcyxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5nc1xuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCB7IHNvdXJjZSwgYmFzc0ZpbHRlciwgdm9pY2VGaWx0ZXIsIGdhaW4sIHNwbGl0dGVyLCBtZXJnZXIsIGNvbnRleHQsIGVsZW1lbnQgfSA9XG4gICAgICBub2RlcztcblxuICAgIGRlYnVnTG9nKFxuICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gQ29ubmVjdGluZy9SZWNvbm5lY3Rpbmcgbm9kZXMgZm9yICR7XG4gICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgfS4gVGFyZ2V0IE1vbm86ICR7c2V0dGluZ3MubW9ub30sIEN1cnJlbnQgTm9kZSBNb25vOiAke25vZGVzLm1vbm99YFxuICAgICk7XG5cbiAgICAvLyBMb2cgdGhlIGN1cnJlbnQgbW9ubyBzdGF0ZSBiZWZvcmUgcG90ZW50aWFsIGNoYW5nZVxuICAgIGRlYnVnTG9nKFxuICAgICAgYFtBdWRpb1Byb2Nlc3Nvcl0gY29ubmVjdE5vZGVzOiBDdXJyZW50IG1vbm8gc3RhdGUgZm9yIGVsZW1lbnQ6ICR7bm9kZXMubW9ub30sIFRhcmdldCBtb25vIHN0YXRlOiAke3NldHRpbmdzLm1vbm99YFxuICAgICk7XG5cbiAgICAvLyBEaXNjb25uZWN0IGFsbCBub2RlcyBmcm9tIHRoZWlyIG91dHB1dHMgdG8gZW5zdXJlIGEgY2xlYW4gc2xhdGUgYmVmb3JlIHJlLWNvbm5lY3RpbmcuXG4gICAgLy8gSXQncyBjcnVjaWFsIHRvIGRpc2Nvbm5lY3QgdGhlIHNvdXJjZSBmaXJzdCBmcm9tIGl0cyBwcmV2aW91cyBjb25uZWN0aW9ucyxcbiAgICAvLyB0aGVuIG90aGVyIG5vZGVzIGluIGFueSBvcmRlciwgYXMgbG9uZyBhcyB0aGV5IGFyZSBkaXNjb25uZWN0ZWQgZnJvbSB0aGVpciBvdXRwdXRzLlxuICAgIGNvbnN0IHNhZmVEaXNjb25uZWN0ID0gKG5vZGU6IEF1ZGlvTm9kZSB8IG51bGwpID0+IHtcbiAgICAgIGlmIChub2RlKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgLy8gRGlzY29ubmVjdCBhbGwgY29ubmVjdGlvbnMgZnJvbSB0aGlzIG5vZGVcbiAgICAgICAgICBub2RlLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIGNvbnNvbGUud2FybihgW0F1ZGlvUHJvY2Vzc29yXSBFcnJvciBkaXNjb25uZWN0aW5nIG5vZGU6YCwgZSk7IC8vIE9wdGlvbmFsOiBmb3IgZGVidWdnaW5nXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gRGlzY29ubmVjdCBhbGwgbm9kZXMgZnJvbSB0aGVpciBvdXRwdXRzLiBPcmRlciBtYXR0ZXJzIGZvciBwcmV2ZW50aW5nIGVycm9ycyxcbiAgICAvLyBidXQgbGVzcyBzbyBpZiB3ZSBkaXNjb25uZWN0IGFsbCBvdXRwdXRzIGZyb20gYSBub2RlLlxuICAgIC8vIERpc2Nvbm5lY3Rpbmcgc291cmNlIGZpcnN0IGVuc3VyZXMgaXQncyBub3QgY29ubmVjdGVkIHRvIGEgc3RhbGUgZ3JhcGguXG4gICAgc2FmZURpc2Nvbm5lY3Qoc291cmNlKTtcbiAgICBzYWZlRGlzY29ubmVjdChiYXNzRmlsdGVyKTtcbiAgICBzYWZlRGlzY29ubmVjdCh2b2ljZUZpbHRlcik7XG4gICAgc2FmZURpc2Nvbm5lY3Qoc3BsaXR0ZXIpO1xuICAgIHNhZmVEaXNjb25uZWN0KG1lcmdlcik7XG4gICAgc2FmZURpc2Nvbm5lY3QoZ2Fpbik7XG5cbiAgICAvLyBFbnN1cmUgc291cmNlIGlzIHZhbGlkIGJlZm9yZSBwcm9jZWVkaW5nXG4gICAgaWYgKCFzb3VyY2UpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIFwiW0F1ZGlvUHJvY2Vzc29yXSBTb3VyY2Ugbm9kZSBpcyBudWxsIGluIGNvbm5lY3ROb2Rlcy4gQ2Fubm90IGNvbm5lY3QgZ3JhcGguXCJcbiAgICAgICk7XG4gICAgICAvLyBBdHRlbXB0IHRvIGFwcGx5IHNldHRpbmdzIHRvIGF2b2lkIGZ1cnRoZXIgZXJyb3JzLCB0aG91Z2ggZ3JhcGggaXMgYnJva2VuLlxuICAgICAgYXdhaXQgdGhpcy51cGRhdGVOb2RlU2V0dGluZ3Mobm9kZXMsIHNldHRpbmdzKTtcbiAgICAgIHJldHVybjsgLy8gQ2Fubm90IHByb2NlZWQgd2l0aCBjb25uZWN0aW9uc1xuICAgIH1cblxuXG4gICAgLy8gQ3JlYXRlIG5ldyBjb25uZWN0aW9ucyBiYXNlZCBvbiBjdXJyZW50IHNldHRpbmdzXG4gICAgaWYgKHNldHRpbmdzLm1vbm8pIHtcbiAgICAgIHNvdXJjZS5jb25uZWN0KGJhc3NGaWx0ZXIpO1xuICAgICAgYmFzc0ZpbHRlci5jb25uZWN0KHZvaWNlRmlsdGVyKTtcbiAgICAgIHZvaWNlRmlsdGVyLmNvbm5lY3Qoc3BsaXR0ZXIpO1xuICAgICAgc3BsaXR0ZXIuY29ubmVjdChtZXJnZXIsIDAsIDApOyAvLyBDb25uZWN0IGxlZnQgY2hhbm5lbCBvZiBzcGxpdHRlciB0byBsZWZ0IGlucHV0IG9mIG1lcmdlclxuICAgICAgc3BsaXR0ZXIuY29ubmVjdChtZXJnZXIsIDAsIDEpOyAvLyBDb25uZWN0IGxlZnQgY2hhbm5lbCBvZiBzcGxpdHRlciB0byByaWdodCBpbnB1dCBvZiBtZXJnZXIgKG1vbm8pXG4gICAgICBtZXJnZXIuY29ubmVjdChnYWluKTtcbiAgICB9IGVsc2UgeyAvLyBTdGVyZW9cbiAgICAgIHNvdXJjZS5jb25uZWN0KGJhc3NGaWx0ZXIpO1xuICAgICAgYmFzc0ZpbHRlci5jb25uZWN0KHZvaWNlRmlsdGVyKTtcbiAgICAgIHZvaWNlRmlsdGVyLmNvbm5lY3QoZ2Fpbik7XG4gICAgfVxuICAgIGdhaW4uY29ubmVjdChjb250ZXh0LmRlc3RpbmF0aW9uKTtcblxuICAgIC8vIFVwZGF0ZSB0aGUgc3RvcmVkIG1vbm8gc2V0dGluZyBmb3IgdGhpcyBlbGVtZW50IHRvIHJlZmxlY3QgdGhlIGFwcGxpZWQgc2V0dGluZ1xuICAgIG5vZGVzLm1vbm8gPSBzZXR0aW5ncy5tb25vO1xuXG4gICAgLy8gQWx3YXlzIGFwcGx5L3VwZGF0ZSBvdGhlciBhdWRpbyBwYXJhbWV0ZXJzXG4gICAgYXdhaXQgdGhpcy51cGRhdGVOb2RlU2V0dGluZ3Mobm9kZXMsIHNldHRpbmdzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEaXNjb25uZWN0cyBhdWRpbyBub2RlcyBmb3IgYSBzcGVjaWZpYyBlbGVtZW50IGFuZCByZW1vdmVzIGl0IGZyb20gdGhlIG1hcC5cbiAgICogQHBhcmFtIGVsZW1lbnQgVGhlIEhUTUxNZWRpYUVsZW1lbnQgdG8gZGlzY29ubmVjdC5cbiAgICogQHJldHVybnMgVHJ1ZSBpZiBub2RlcyB3ZXJlIGZvdW5kIGFuZCBkaXNjb25uZWN0ZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAgICovXG4gIHB1YmxpYyBkaXNjb25uZWN0RWxlbWVudE5vZGVzKGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQpOiBib29sZWFuIHtcbiAgICBjb25zdCBub2RlcyA9IHRoaXMuYXVkaW9FbGVtZW50TWFwLmdldChlbGVtZW50KTtcbiAgICBpZiAoIW5vZGVzKSByZXR1cm4gZmFsc2U7XG5cbiAgICBkZWJ1Z0xvZyhcbiAgICAgIGBbQXVkaW9Qcm9jZXNzb3JdIERpc2Nvbm5lY3Rpbmcgbm9kZXMgZm9yIGVsZW1lbnQ6ICR7XG4gICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgfWBcbiAgICApOyAvLyBBRERFRCBMT0dcblxuICAgIHRyeSB7XG4gICAgICAvLyBTYWZlbHkgZGlzY29ubmVjdCBlYWNoIG5vZGVcbiAgICAgIGNvbnN0IHNhZmVEaXNjb25uZWN0ID0gKG5vZGU6IEF1ZGlvTm9kZSkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIG5vZGUuZGlzY29ubmVjdCgpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gSWdub3JlIGRpc2Nvbm5lY3QgZXJyb3JzXG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIHNhZmVEaXNjb25uZWN0KG5vZGVzLmdhaW4pO1xuICAgICAgc2FmZURpc2Nvbm5lY3Qobm9kZXMudm9pY2VGaWx0ZXIpO1xuICAgICAgc2FmZURpc2Nvbm5lY3Qobm9kZXMuYmFzc0ZpbHRlcik7XG4gICAgICBzYWZlRGlzY29ubmVjdChub2Rlcy5zcGxpdHRlcik7XG4gICAgICBzYWZlRGlzY29ubmVjdChub2Rlcy5tZXJnZXIpO1xuICAgICAgc2FmZURpc2Nvbm5lY3Qobm9kZXMuc291cmNlKTtcblxuICAgICAgLy8gRXhwbGljaXRseSBudWxsaWZ5IHJlZmVyZW5jZXMgdG8gaGVscCBnYXJiYWdlIGNvbGxlY3Rpb25cbiAgICAgIC8vIENhc3QgdG8gYW55IHNpbmNlIHdlJ3JlIGludGVudGlvbmFsbHkgZGVzdHJveWluZyB0aGVzZSBub2Rlc1xuICAgICAgKG5vZGVzIGFzIGFueSkuc291cmNlID0gbnVsbDtcbiAgICAgIChub2RlcyBhcyBhbnkpLmdhaW4gPSBudWxsO1xuICAgICAgKG5vZGVzIGFzIGFueSkuYmFzc0ZpbHRlciA9IG51bGw7XG4gICAgICAobm9kZXMgYXMgYW55KS52b2ljZUZpbHRlciA9IG51bGw7XG4gICAgICAobm9kZXMgYXMgYW55KS5zcGxpdHRlciA9IG51bGw7XG4gICAgICAobm9kZXMgYXMgYW55KS5tZXJnZXIgPSBudWxsO1xuICAgICAgLy8gRG8gbm90IG51bGxpZnkgY29udGV4dCBvciBlbGVtZW50IGFzIHRoZXkgYXJlIG1hbmFnZWQgZWxzZXdoZXJlXG5cbiAgICAgIHRoaXMuYXVkaW9FbGVtZW50TWFwLmRlbGV0ZShlbGVtZW50KTtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBJbmRpY2F0ZSBzdWNjZXNzXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIGBBdWRpb1Byb2Nlc3NvcjogRXJyb3IgZGlzY29ubmVjdGluZyBub2RlcyBmb3IgJHtcbiAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgfTpgLFxuICAgICAgICBlcnJvclxuICAgICAgKTtcbiAgICAgIC8vIEF0dGVtcHQgdG8gcmVtb3ZlIGZyb20gbWFwIGV2ZW4gaWYgZGlzY29ubmVjdCBmYWlsZWQgcGFydGlhbGx5XG4gICAgICB0aGlzLmF1ZGlvRWxlbWVudE1hcC5kZWxldGUoZWxlbWVudCk7XG4gICAgICByZXR1cm4gZmFsc2U7IC8vIEluZGljYXRlIGZhaWx1cmVcbiAgICB9XG4gIH1cblxuICBhc3luYyB1cGRhdGVBdWRpb0VmZmVjdHMoc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIFwiW0F1ZGlvUHJvY2Vzc29yXSBVcGRhdGluZyBhdWRpbyBlZmZlY3RzIHdpdGggc2V0dGluZ3M6XCIsXG4gICAgICBKU09OLnN0cmluZ2lmeShzZXR0aW5ncylcbiAgICApO1xuXG4gICAgZm9yIChjb25zdCBbZWxlbWVudCwgbm9kZXNdIG9mIHRoaXMuYXVkaW9FbGVtZW50TWFwLmVudHJpZXMoKSkge1xuICAgICAgLy8gQ2hlY2sgaWYgdGhlIGVsZW1lbnQgaXMgc3RpbGwgY29ubmVjdGVkIHRvIHRoZSBET00gYmVmb3JlIHByb2Nlc3NpbmdcbiAgICAgIGlmICghZWxlbWVudC5pc0Nvbm5lY3RlZCkge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBFbGVtZW50ICR7XG4gICAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgICB9IGlzIG5vIGxvbmdlciBjb25uZWN0ZWQgdG8gRE9NLiBEaXNjb25uZWN0aW5nIGFuZCByZW1vdmluZy5gXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGlzY29ubmVjdEVsZW1lbnROb2RlcyhlbGVtZW50KTsgLy8gQ2xlYW4gdXAgZGlzY29ubmVjdGVkIGVsZW1lbnRzXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBDYWxsIHNldHVwQXVkaW9Db250ZXh0LCB3aGljaCBub3cgaGFuZGxlcyByZXVzaW5nIGV4aXN0aW5nIG5vZGVzIGFuZCByZWNvbm5lY3RpbmcgdGhlbVxuICAgICAgICBhd2FpdCB0aGlzLnNldHVwQXVkaW9Db250ZXh0KGVsZW1lbnQsIHNldHRpbmdzKTtcblxuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBgW0F1ZGlvUHJvY2Vzc29yXSBVcGRhdGVkIHNldHRpbmdzIGZvciBlbGVtZW50OiAke1xuICAgICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgfS5gXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgIFwiQXVkaW9Qcm9jZXNzb3I6IFVwZGF0ZSBmYWlsZWQgZm9yIGVsZW1lbnQ6XCIsXG4gICAgICAgICAgZWxlbWVudC5zcmMsXG4gICAgICAgICAgZXJyb3JcbiAgICAgICAgKTtcbiAgICAgICAgLy8gSWYgdXBkYXRlIGZhaWxzLCBkbyBOT1QgZGlzY29ubmVjdCB0aGUgZWxlbWVudCBub2RlcywgYXMgdGhleSBzaG91bGQgcmVtYWluIHJldXNhYmxlLlxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlc2V0QWxsVG9EaXNhYmxlZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAvLyBSZXNldCBhbGwgYXVkaW8gY29udGV4dHMgYW5kIGRpc2Nvbm5lY3Qgbm9kZXNcbiAgICB0aGlzLmF1ZGlvRWxlbWVudE1hcC5mb3JFYWNoKChub2RlcywgZWxlbWVudCkgPT4ge1xuICAgICAgdGhpcy5kaXNjb25uZWN0RWxlbWVudE5vZGVzKGVsZW1lbnQpO1xuICAgICAgLy8gRG9uJ3QgY2xvc2UgY29udGV4dCBoZXJlLCBsZXQgY2xlYW51cCBoYW5kbGUgaXQgb3IgcmV1c2UgaXRcbiAgICAgIC8vIG5vZGVzLmNvbnRleHQuY2xvc2UoKTtcbiAgICB9KTtcbiAgICB0aGlzLmF1ZGlvRWxlbWVudE1hcC5jbGVhcigpO1xuICB9XG5cbiAgaGFzUHJvY2Vzc2luZyhtZWRpYUVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5hdWRpb0VsZW1lbnRNYXAuaGFzKG1lZGlhRWxlbWVudCk7XG4gIH1cblxuICBjbGVhbnVwKCk6IHZvaWQge1xuICAgIHRoaXMuYXVkaW9FbGVtZW50TWFwLmNsZWFyKCk7XG4gICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0KSB7XG4gICAgICB0aGlzLmF1ZGlvQ29udGV4dC5jbG9zZSgpO1xuICAgICAgdGhpcy5hdWRpb0NvbnRleHQgPSBudWxsO1xuICAgIH1cbiAgICBkZWJ1Z0xvZyhcIkF1ZGlvUHJvY2Vzc29yOiBDbGVhbnVwIGNvbXBsZXRlZFwiKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBdHRlbXB0cyB0byByZXN1bWUgdGhlIEF1ZGlvQ29udGV4dCBpZiBpdCdzIHN1c3BlbmRlZC5cbiAgICogU2hvdWxkIGJlIGNhbGxlZCBhZnRlciBhIHVzZXIgZ2VzdHVyZS5cbiAgICovXG4gIGFzeW5jIHRyeVJlc3VtZUNvbnRleHQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0ICYmIHRoaXMuYXVkaW9Db250ZXh0LnN0YXRlID09PSBcInN1c3BlbmRlZFwiKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLmF1ZGlvQ29udGV4dC5yZXN1bWUoKTtcbiAgICAgICAgZGVidWdMb2coXCJBdWRpb1Byb2Nlc3NvcjogQXVkaW9Db250ZXh0IHJlc3VtZWQgc3VjY2Vzc2Z1bGx5LlwiKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJBdWRpb1Byb2Nlc3NvcjogRmFpbGVkIHRvIHJlc3VtZSBBdWRpb0NvbnRleHQ6XCIsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHRoaXMuYXVkaW9Db250ZXh0KSB7XG4gICAgICAvLyBkZWJ1Z0xvZyhgQXVkaW9Qcm9jZXNzb3I6IEF1ZGlvQ29udGV4dCBzdGF0ZSBpcyBhbHJlYWR5IFwiJHt0aGlzLmF1ZGlvQ29udGV4dC5zdGF0ZX1cIiwgbm8gcmVzdW1lIG5lZWRlZC5gKTsgLy8gUmVkdWNlZCBsb2dnaW5nXG4gICAgfVxuICB9XG59IC8vIEVuZCBvZiBBdWRpb1Byb2Nlc3NvciBjbGFzc1xuIiwiaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5jb25zdCBtZWRpYUNvbmZpZyA9IHtcbiAgYmFzZVNlbGVjdG9yczogW1xuICAgIFwidmlkZW9cIixcbiAgICBcImF1ZGlvXCIsXG4gICAgLy8gRXNzZW50aWFsIHBsYXllciBwYXR0ZXJuc1xuICAgIFwiW2NsYXNzKj0ncGxheWVyJ11cIixcbiAgICBcIltjbGFzcyo9J3ZpZGVvJ11cIixcbiAgICBcIltpZCo9J3BsYXllciddXCIsXG4gICAgXCJbaWQqPSd2aWRlbyddXCIsXG4gICAgLy8gQ29tbW9uIGZyYW1ld29ya3NcbiAgICBcIi52aWRlby1qc1wiLFxuICAgIFwiLmp3cGxheWVyXCIsXG4gICAgXCIuaHRtbDUtdmlkZW8tcGxheWVyXCIsXG4gICAgXCIucGx5clwiLFxuICAgIC8vIEtleSBkYXRhIGF0dHJpYnV0ZXNcbiAgICBcIltkYXRhLXBsYXllcl1cIixcbiAgICBcIltkYXRhLXZpZGVvXVwiLFxuICAgIFwiW2RhdGEtbWVkaWFdXCIsXG4gICAgLy8gS2V5IGlmcmFtZSBzb3VyY2VzXG4gICAgXCJpZnJhbWVbc3JjKj0neW91dHViZS5jb20nXVwiLFxuICAgIFwiaWZyYW1lW3NyYyo9J3ZpbWVvLmNvbSddXCIsXG4gICAgXCJpZnJhbWVbc3JjKj0nZGFpbHltb3Rpb24uY29tJ11cIixcbiAgICBcImlmcmFtZVtzcmMqPSd0d2l0Y2gudHYnXVwiXG4gIF0sXG4gIHNpdGVTZWxlY3RvcnM6IHtcbiAgICBcInlvdXR1YmUuY29tXCI6IFtcIi5odG1sNS12aWRlby1wbGF5ZXJcIl0sXG4gICAgXCJuZXRmbGl4LmNvbVwiOiBbXCJbZGF0YS11aWE9J3ZpZGVvLXBsYXllciddXCJdLFxuICAgIFwiaHVsdS5jb21cIjogW1wiLkh1bHVQbGF5ZXJcIl0sXG4gICAgXCJhbWF6b24uY29tXCI6IFtcIltkYXRhLXBsYXllcj0nQW1hem9uVmlkZW8nXVwiXSxcbiAgICBcImRpc25leXBsdXMuY29tXCI6IFtcIi5kcC12aWRlby1wbGF5ZXJcIl1cbiAgfVxufTtcblxuZXhwb3J0IGNsYXNzIE1lZGlhTWFuYWdlciB7XG4gIHByaXZhdGUgc3RhdGljIGRlYm91bmNlVGltZW91dDogTm9kZUpTLlRpbWVvdXQgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBzdGF0aWMgcHJvY2Vzc2VkRWxlbWVudHMgPSBuZXcgV2Vha1NldDxIVE1MRWxlbWVudD4oKTsgLy8gS2VlcCBmb3IgY3VzdG9tIHBsYXllciBjb250YWluZXJzXG4gIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFQk9VTkNFX0RFTEFZID0gNTAwO1xuICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfREVQVEggPSAxMDtcblxuICBwcml2YXRlIHN0YXRpYyBpc0V4dGVuc2lvbkNvbnRleHQoKTogYm9vbGVhbiB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiAoXG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gXCJjaHJvbWUtZXh0ZW5zaW9uOlwiIHx8XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gXCJtb3otZXh0ZW5zaW9uOlwiIHx8XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gXCJlZGdlLWV4dGVuc2lvbjpcIlxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLy8gT3B0aW1pemVkIHZpc2liaWxpdHkgY2hlY2tcbiAgcHJpdmF0ZSBzdGF0aWMgaXNFbGVtZW50VmlzaWJsZShlbGVtZW50OiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAhIShcbiAgICAgIGVsZW1lbnQub2Zmc2V0V2lkdGggfHxcbiAgICAgIGVsZW1lbnQub2Zmc2V0SGVpZ2h0IHx8XG4gICAgICBlbGVtZW50LmdldENsaWVudFJlY3RzKCkubGVuZ3RoXG4gICAgKTtcbiAgfVxuXG4gIC8vIFVzZSB0aGUgZnVsbCBzaXRlU2VsZWN0b3JzIGNvbmZpZ3VyYXRpb25cbiAgcHJpdmF0ZSBzdGF0aWMgZ2V0RXh0cmFTZWxlY3RvcnNGb3JTaXRlKCk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBjdXJyZW50SG9zdG5hbWUgPSB3aW5kb3cubG9jYXRpb24uaG9zdG5hbWU7XG4gICAgZm9yIChjb25zdCBzaXRlSG9zdG5hbWUgaW4gbWVkaWFDb25maWcuc2l0ZVNlbGVjdG9ycykge1xuICAgICAgLy8gRXhhY3QgbWF0Y2ggZm9yIGhvc3RuYW1lIChubyBzdWJkb21haW4gbWF0Y2hpbmcpXG4gICAgICBpZiAoY3VycmVudEhvc3RuYW1lID09PSBzaXRlSG9zdG5hbWUpIHtcbiAgICAgICAgLy8gVHlwZSBhc3NlcnRpb24gbmVlZGVkIGFzIGtleXMgYXJlIHN0cmluZ3NcbiAgICAgICAgcmV0dXJuIG1lZGlhQ29uZmlnLnNpdGVTZWxlY3RvcnNbXG4gICAgICAgICAgc2l0ZUhvc3RuYW1lIGFzIGtleW9mIHR5cGVvZiBtZWRpYUNvbmZpZy5zaXRlU2VsZWN0b3JzXG4gICAgICAgIF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBbXTsgLy8gUmV0dXJuIGVtcHR5IGFycmF5IGlmIG5vIG1hdGNoIGZvdW5kXG4gIH1cblxuICAvLyBVcGRhdGVkIGN1c3RvbSBwbGF5ZXIgZGV0ZWN0aW9uIHdpdGggZmFsbGJhY2sgZHluYW1pYyBzY2FubmluZ1xuICBwcml2YXRlIHN0YXRpYyBmaW5kQ3VzdG9tUGxheWVycyhyb290OiBQYXJlbnROb2RlKTogSFRNTEVsZW1lbnRbXSB7XG4gICAgY29uc3QgY3VzdG9tUGxheWVyczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuICAgIGNvbnN0IGJhc2VTZWxlY3RvcnMgPSBtZWRpYUNvbmZpZy5iYXNlU2VsZWN0b3JzO1xuICAgIGNvbnN0IHNpdGVTZWxlY3RvcnMgPSB0aGlzLmdldEV4dHJhU2VsZWN0b3JzRm9yU2l0ZSgpO1xuICAgIGNvbnN0IGFsbFNlbGVjdG9ycyA9IFsuLi5iYXNlU2VsZWN0b3JzLCAuLi5zaXRlU2VsZWN0b3JzXTtcbiAgICBcbiAgICAvLyBVc2UgYSBTZXQgdG8gYXZvaWQgZHVwbGljYXRlIGVsZW1lbnRzXG4gICAgY29uc3Qgc2VsZWN0b3JFbGVtZW50cyA9IG5ldyBTZXQ8RWxlbWVudD4oKTtcbiAgICBcbiAgICB0cnkge1xuICAgICAgLy8gUHJvY2VzcyBlYWNoIHNlbGVjdG9yIGluZGl2aWR1YWxseSB0byBhdm9pZCBtYXNzaXZlIGNvbWJpbmVkIHNlbGVjdG9yXG4gICAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIGFsbFNlbGVjdG9ycykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGVsZW1lbnRzID0gcm9vdC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKTtcbiAgICAgICAgICBlbGVtZW50cy5mb3JFYWNoKGVsID0+IHNlbGVjdG9yRWxlbWVudHMuYWRkKGVsKSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oYEVycm9yIHdpdGggc2VsZWN0b3IgJyR7c2VsZWN0b3J9JzpgLCBlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBQcm9jZXNzIGNvbGxlY3RlZCBlbGVtZW50c1xuICAgICAgc2VsZWN0b3JFbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50ICYmICF0aGlzLnByb2Nlc3NlZEVsZW1lbnRzLmhhcyhlbGVtZW50KSkge1xuICAgICAgICAgIHRoaXMucHJvY2Vzc2VkRWxlbWVudHMuYWRkKGVsZW1lbnQpO1xuICAgICAgICAgIGN1c3RvbVBsYXllcnMucHVzaChlbGVtZW50KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS53YXJuKFwiRXJyb3IgZmluZGluZyBjdXN0b20gcGxheWVyczpcIiwgZSk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBjdXN0b21QbGF5ZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBmaW5kTWVkaWFFbGVtZW50cyhcbiAgICByb290OiBQYXJlbnROb2RlID0gZG9jdW1lbnQsXG4gICAgZGVwdGg6IG51bWJlciA9IDBcbiAgKTogSFRNTE1lZGlhRWxlbWVudFtdIHtcbiAgICBpZiAodGhpcy5pc0V4dGVuc2lvbkNvbnRleHQoKSB8fCBkZXB0aCA+IHRoaXMuTUFYX0RFUFRIKSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuXG4gICAgY29uc3QgZWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSA9IFtdO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIERpcmVjdCBtZWRpYSBlbGVtZW50c1xuICAgICAgY29uc3QgbWVkaWFFbGVtZW50cyA9IHJvb3QucXVlcnlTZWxlY3RvckFsbChcInZpZGVvLCBhdWRpb1wiKTtcbiAgICAgIG1lZGlhRWxlbWVudHMuZm9yRWFjaCgoZWxlbWVudCkgPT4ge1xuICAgICAgICBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICAgICAgICBlbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gSGFuZGxlIFNoYWRvdyBET01cbiAgICAgIGlmIChyb290IGluc3RhbmNlb2YgRWxlbWVudCAmJiByb290LnNoYWRvd1Jvb3QpIHtcbiAgICAgICAgZWxlbWVudHMucHVzaCguLi50aGlzLmZpbmRNZWRpYUVsZW1lbnRzKHJvb3Quc2hhZG93Um9vdCwgZGVwdGggKyAxKSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEN1c3RvbSBwbGF5ZXJzIChvbmx5IGF0IHRvcCBsZXZlbClcbiAgICAgIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICBjb25zdCBjdXN0b21QbGF5ZXJzID0gdGhpcy5maW5kQ3VzdG9tUGxheWVycyhyb290KTtcbiAgICAgICAgY3VzdG9tUGxheWVycy5mb3JFYWNoKChwbGF5ZXIpID0+IHtcbiAgICAgICAgICBjb25zdCBtZWRpYUluUGxheWVyID0gcGxheWVyLnF1ZXJ5U2VsZWN0b3JBbGwoXCJ2aWRlbywgYXVkaW9cIik7XG4gICAgICAgICAgbWVkaWFJblBsYXllci5mb3JFYWNoKChlbGVtZW50KSA9PiB7XG4gICAgICAgICAgICBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgZWxlbWVudHMucHVzaChlbGVtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKCF0aGlzLmlzRXh0ZW5zaW9uQ29udGV4dCgpKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcIkVycm9yIGZpbmRpbmcgbWVkaWEgZWxlbWVudHM6XCIsIGUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQoZWxlbWVudHMpKTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgc2V0dXBNZWRpYUVsZW1lbnRPYnNlcnZlcihcbiAgICBvbkFkZGVkOiAoZWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSkgPT4gdm9pZCxcbiAgICBvblJlbW92ZWQ6IChlbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiB2b2lkXG4gICk6IE11dGF0aW9uT2JzZXJ2ZXIge1xuICAgIGNvbnN0IGRlYm91bmNlZENoZWNrID0gKCkgPT4ge1xuICAgICAgaWYgKE1lZGlhTWFuYWdlci5kZWJvdW5jZVRpbWVvdXQpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KE1lZGlhTWFuYWdlci5kZWJvdW5jZVRpbWVvdXQpO1xuICAgICAgfVxuICAgICAgTWVkaWFNYW5hZ2VyLmRlYm91bmNlVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBjb25zdCBlbGVtZW50cyA9IHRoaXMuZmluZE1lZGlhRWxlbWVudHMoKTtcbiAgICAgICAgaWYgKGVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBvbkFkZGVkKGVsZW1lbnRzKTtcbiAgICAgICAgfVxuICAgICAgfSwgTWVkaWFNYW5hZ2VyLkRFQk9VTkNFX0RFTEFZKTtcbiAgICB9O1xuXG4gICAgLy8gSW5pdGlhbCBjaGVja1xuICAgIGlmICghdGhpcy5pc0V4dGVuc2lvbkNvbnRleHQoKSkge1xuICAgICAgZGVib3VuY2VkQ2hlY2soKTtcbiAgICB9XG5cbiAgICAvLyBNdXRhdGlvbiBvYnNlcnZlciB0byBkZXRlY3QgYWRkZWQvcmVtb3ZlZCBub2Rlc1xuICAgIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKG11dGF0aW9ucykgPT4ge1xuICAgICAgY29uc3QgYWRkZWRNZWRpYUVsZW1lbnRzOiBIVE1MTWVkaWFFbGVtZW50W10gPSBbXTtcbiAgICAgIGNvbnN0IHJlbW92ZWRNZWRpYUVsZW1lbnRzOiBIVE1MTWVkaWFFbGVtZW50W10gPSBbXTtcblxuICAgICAgbXV0YXRpb25zLmZvckVhY2goKG11dGF0aW9uKSA9PiB7XG4gICAgICAgIGlmIChtdXRhdGlvbi50eXBlID09PSBcImNoaWxkTGlzdFwiKSB7XG4gICAgICAgICAgbXV0YXRpb24uYWRkZWROb2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgYWRkZWRNZWRpYUVsZW1lbnRzLnB1c2gobm9kZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgICAgICAgICAgICAvLyBDaGVjayBmb3IgbWVkaWEgZWxlbWVudHMgd2l0aGluIGFkZGVkIG5vbi1tZWRpYSBlbGVtZW50c1xuICAgICAgICAgICAgICBub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoXCJ2aWRlbywgYXVkaW9cIikuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZWwgaW5zdGFuY2VvZiBIVE1MTWVkaWFFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICBhZGRlZE1lZGlhRWxlbWVudHMucHVzaChlbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIG11dGF0aW9uLnJlbW92ZWROb2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgcmVtb3ZlZE1lZGlhRWxlbWVudHMucHVzaChub2RlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB7XG4gICAgICAgICAgICAgIC8vIENoZWNrIGZvciBtZWRpYSBlbGVtZW50cyB3aXRoaW4gcmVtb3ZlZCBub24tbWVkaWEgZWxlbWVudHNcbiAgICAgICAgICAgICAgbm9kZS5xdWVyeVNlbGVjdG9yQWxsKFwidmlkZW8sIGF1ZGlvXCIpLmZvckVhY2goKGVsKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVsIGluc3RhbmNlb2YgSFRNTE1lZGlhRWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgcmVtb3ZlZE1lZGlhRWxlbWVudHMucHVzaChlbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGlmIChhZGRlZE1lZGlhRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBcIltNZWRpYU1hbmFnZXIgT2JzZXJ2ZXJdIEFkZGVkIG1lZGlhIGVsZW1lbnRzIGRldGVjdGVkLCB0cmlnZ2VyaW5nIGRlYm91bmNlZCBjaGVjay5cIlxuICAgICAgICApO1xuICAgICAgICBkZWJvdW5jZWRDaGVjaygpOyAvLyBUcmlnZ2VyIGRlYm91bmNlZCBjaGVjayBmb3IgYWRkZWQgZWxlbWVudHNcbiAgICAgIH1cblxuICAgICAgaWYgKHJlbW92ZWRNZWRpYUVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtNZWRpYU1hbmFnZXIgT2JzZXJ2ZXJdIFJlbW92ZWQgJHtyZW1vdmVkTWVkaWFFbGVtZW50cy5sZW5ndGh9IG1lZGlhIGVsZW1lbnRzLCB0cmlnZ2VyaW5nIGNsZWFudXAuYFxuICAgICAgICApO1xuICAgICAgICBvblJlbW92ZWQocmVtb3ZlZE1lZGlhRWxlbWVudHMpOyAvLyBJbW1lZGlhdGVseSBjYWxsIG9uUmVtb3ZlZCBmb3IgY2xlYW51cFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgb2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHtcbiAgICAgIGNoaWxkTGlzdDogdHJ1ZSxcbiAgICAgIHN1YnRyZWU6IHRydWUsXG4gICAgfSk7XG5cbiAgICByZXR1cm4gb2JzZXJ2ZXI7XG4gIH1cbn1cbiIsImltcG9ydCB7IEF1ZGlvU2V0dGluZ3MgLCBkZWJ1Z0xvZyB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb1Byb2Nlc3NvciB9IGZyb20gXCIuL2F1ZGlvLXByb2Nlc3NvclwiO1xuaW1wb3J0IHsgTWVkaWFNYW5hZ2VyIH0gZnJvbSBcIi4vbWVkaWEtbWFuYWdlclwiO1xuXG5leHBvcnQgY2xhc3MgTWVkaWFQcm9jZXNzb3Ige1xuICBhdWRpb1Byb2Nlc3NvcjogQXVkaW9Qcm9jZXNzb3I7XG4gIHByaXZhdGUgYWN0aXZlTWVkaWFFbGVtZW50cyA9IG5ldyBTZXQ8SFRNTE1lZGlhRWxlbWVudD4oKTtcbiAgcHJpdmF0ZSBlbGVtZW50U2V0dGluZ3MgPSBuZXcgV2Vha01hcDxIVE1MTWVkaWFFbGVtZW50LCBBdWRpb1NldHRpbmdzPigpO1xuICBwcml2YXRlIGVsZW1lbnRMaXN0ZW5lcnMgPSBuZXcgV2Vha01hcDxIVE1MTWVkaWFFbGVtZW50LCAoKSA9PiB2b2lkPigpO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3IgPSBuZXcgQXVkaW9Qcm9jZXNzb3IoKTtcbiAgfVxuXG4gIC8vIE1ldGhvZCB0byBnZXQgY3VycmVudGx5IG1hbmFnZWQgbWVkaWEgZWxlbWVudHMsIGZpbHRlcmluZyBmb3IgY29ubmVjdGVkIG9uZXNcbiAgcHVibGljIGdldE1hbmFnZWRNZWRpYUVsZW1lbnRzKCk6IEhUTUxNZWRpYUVsZW1lbnRbXSB7XG4gICAgY29uc3QgZGlzY29ubmVjdGVkOiBIVE1MTWVkaWFFbGVtZW50W10gPSBbXTtcbiAgICBcbiAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIGlmICghZWwuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgZGlzY29ubmVjdGVkLnB1c2goZWwpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIGRpc2Nvbm5lY3RlZC5mb3JFYWNoKGVsID0+IHRoaXMuY2xlYW51cEVsZW1lbnQoZWwpKTtcbiAgICBcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMpO1xuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGVQbGF5YmFja1NwZWVkKGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQsIHNwZWVkOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFtNZWRpYVByb2Nlc3Nvcl0gQXR0ZW1wdGVkIHRvIHVwZGF0ZSBzcGVlZCBvbiBkaXNjb25uZWN0ZWQgZWxlbWVudDogJHtcbiAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgfWBcbiAgICAgICk7XG4gICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpOyAvLyBDbGVhbiB1cCBpZiBmb3VuZCBpbiBhY3RpdmUgbGlzdFxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBkZWJ1Z0xvZyggLy8gVGhpcyBsb2cgY2FuIGJlIHZlcnkgbm9pc3ksIGVuYWJsZSBpZiBuZWVkZWQgZm9yIHNwZWNpZmljIHNwZWVkIGRlYnVnZ2luZ1xuICAgIC8vICAgYFtNZWRpYVByb2Nlc3Nvcl0gVXBkYXRpbmcgc3BlZWQgZm9yIGVsZW1lbnQgJHtcbiAgICAvLyAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgLy8gICB9IHRvICR7c3BlZWR9YFxuICAgIC8vICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHdhc1BsYXlpbmcgPSAhZWxlbWVudC5wYXVzZWQ7XG4gICAgICBjb25zdCBjdXJyZW50VGltZSA9IGVsZW1lbnQuY3VycmVudFRpbWU7XG5cbiAgICAgIGVsZW1lbnQucGxheWJhY2tSYXRlID0gc3BlZWQgLyAxMDA7XG4gICAgICBlbGVtZW50LmRlZmF1bHRQbGF5YmFja1JhdGUgPSBzcGVlZCAvIDEwMDtcblxuICAgICAgLy8gUmVzdG9yZSBzdGF0ZVxuICAgICAgaWYgKHdhc1BsYXlpbmcpIHtcbiAgICAgICAgLy8gSWYgcGxheWluZywgY2hhbmdpbmcgcGxheWJhY2tSYXRlIHNob3VsZCBpZGVhbGx5IG5vdCBzdG9wIGl0LlxuICAgICAgICAvLyBBdm9pZCByZXNldHRpbmcgY3VycmVudFRpbWUgd2hpY2ggY2FuIGNhdXNlIGEgc3R1dHRlci5cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIGl0IHdhcyBwYXVzZWQsIHNldCB0aGUgY3VycmVudFRpbWUgdG8gZW5zdXJlIGl0IHN0YXlzIGF0IHRoZSBzYW1lIHNwb3QuXG4gICAgICAgIGVsZW1lbnQuY3VycmVudFRpbWUgPSBjdXJyZW50VGltZTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBgTWVkaWFQcm9jZXNzb3I6IEVycm9yIHNldHRpbmcgc3BlZWQgZm9yICR7ZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwifTpgLFxuICAgICAgICBlXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NNZWRpYUVsZW1lbnRzKFxuICAgIG1lZGlhRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncyxcbiAgICBuZWVkc0F1ZGlvRWZmZWN0c1NldHVwOiBib29sZWFuXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vIE9ubHkgbG9nIGlmIHdlIGhhdmUgZWxlbWVudHMgdG8gcHJvY2Vzc1xuICAgIGlmIChtZWRpYUVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUuZGVidWcoXG4gICAgICAgIGBbTWVkaWFQcm9jZXNzb3JdIFByb2Nlc3NpbmcgJHttZWRpYUVsZW1lbnRzLmxlbmd0aH0gbWVkaWEgZWxlbWVudChzKS4gQXVkaW8gZWZmZWN0czogJHtuZWVkc0F1ZGlvRWZmZWN0c1NldHVwfWBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gQXBwbHkgc3BlZWQgc2V0dGluZ3MgaW1tZWRpYXRlbHlcbiAgICBtZWRpYUVsZW1lbnRzLmZvckVhY2goKGVsZW1lbnQpID0+IHtcbiAgICAgIGlmIChlbGVtZW50LmlzQ29ubmVjdGVkKSB7XG4gICAgICAgIHRoaXMudXBkYXRlUGxheWJhY2tTcGVlZChlbGVtZW50LCBzZXR0aW5ncy5zcGVlZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKG5lZWRzQXVkaW9FZmZlY3RzU2V0dXApIHtcbiAgICAgIGF3YWl0IHRoaXMuYXVkaW9Qcm9jZXNzb3IudHJ5UmVzdW1lQ29udGV4dCgpO1xuXG4gICAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbWVkaWFFbGVtZW50cykge1xuICAgICAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci5zZXR1cEF1ZGlvQ29udGV4dChlbGVtZW50LCBzZXR0aW5ncyk7XG4gICAgICAgICAgdGhpcy5hY3RpdmVNZWRpYUVsZW1lbnRzLmFkZChlbGVtZW50KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICBgW01lZGlhUHJvY2Vzc29yXSBFcnJvciBzZXR0aW5nIHVwIGF1ZGlvIGZvciAke1xuICAgICAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgICAgIH06YCxcbiAgICAgICAgICAgIGVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgdGhpcy5hdWRpb1Byb2Nlc3Nvci5hdWRpb0NvbnRleHQgJiZcbiAgICAgICAgdGhpcy5hdWRpb1Byb2Nlc3Nvci5hdWRpb0NvbnRleHQuc3RhdGUgPT09IFwicnVubmluZ1wiXG4gICAgICApIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci51cGRhdGVBdWRpb0VmZmVjdHMoc2V0dGluZ3MpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBObyBhdWRpbyBlZmZlY3RzIG5lZWRlZCAtIGRpc2Nvbm5lY3QgZXhpc3RpbmcgYXVkaW8gbm9kZXMgZm9yIHRoZXNlIGVsZW1lbnRzXG4gICAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbWVkaWFFbGVtZW50cykge1xuICAgICAgICBpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICB0aGlzLmFjdGl2ZU1lZGlhRWxlbWVudHMuZGVsZXRlKGVsZW1lbnQpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgLy8gRGlzY29ubmVjdCBhdWRpbyBwcm9jZXNzaW5nIGZvciB0aGlzIGVsZW1lbnQgc2luY2UgZWZmZWN0cyBhcmUgbm8gbG9uZ2VyIG5lZWRlZFxuICAgICAgICAgIGlmICh0aGlzLmF1ZGlvUHJvY2Vzc29yLmhhc1Byb2Nlc3NpbmcoZWxlbWVudCkpIHtcbiAgICAgICAgICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3IuZGlzY29ubmVjdEVsZW1lbnROb2RlcyhlbGVtZW50KTtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5kZWxldGUoZWxlbWVudCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgIGBbTWVkaWFQcm9jZXNzb3JdIEVycm9yIGRpc2Nvbm5lY3RpbmcgZWZmZWN0cyBmb3IgJHtcbiAgICAgICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgICB9OmAsXG4gICAgICAgICAgICBlXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBJZiBubyBtb3JlIGFjdGl2ZSBlbGVtZW50cyB3aXRoIHByb2Nlc3NpbmcsIGNsZWFuIHVwIHRoZSBhdWRpbyBjb250ZXh0XG4gICAgICBpZiAodGhpcy5hY3RpdmVNZWRpYUVsZW1lbnRzLnNpemUgPT09IDApIHtcbiAgICAgICAgdGhpcy5hdWRpb1Byb2Nlc3Nvci5jbGVhbnVwKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFwcGx5IHNldHRpbmdzIGRpcmVjdGx5IHRvIG1lZGlhIGVsZW1lbnRzIHdpdGhvdXQgd2FpdGluZyBmb3IgYXN5bmMgb3BlcmF0aW9uc1xuICAgKiBVc2VmdWwgZm9yIGltbWVkaWF0ZSBVSSBmZWVkYmFja1xuICAgKi9cbiAgcHJpdmF0ZSBsYXN0QXBwbGllZFNldHRpbmdzOiBBdWRpb1NldHRpbmdzIHwgbnVsbCA9IG51bGw7XG5cbiAgYXBwbHlTZXR0aW5nc0ltbWVkaWF0ZWx5KFxuICAgIG1lZGlhRWxlbWVudHM6IEhUTUxNZWRpYUVsZW1lbnRbXSxcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncyxcbiAgICBkaXNhYmxlZDogYm9vbGVhbiA9IGZhbHNlXG4gICk6IHZvaWQge1xuICAgIGlmIChkaXNhYmxlZCkge1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIFwiW01lZGlhUHJvY2Vzc29yXSBEaXNhYmxpbmcgbWVkaWEgcHJvY2Vzc2luZyBhbmQgcGF1c2luZyBtZWRpYSBlbGVtZW50c1wiXG4gICAgICApO1xuICAgICAgXG4gICAgICAvLyBSZXNldCBhbnkgcHJldmlvdXNseSBhcHBsaWVkIHNldHRpbmdzIGFuZCBwYXVzZSBlbGVtZW50c1xuICAgICAgbWVkaWFFbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAvLyBPbmx5IHJlc2V0IGlmIHdlIGhhZCBhcHBsaWVkIHNldHRpbmdzIHRvIHRoaXMgZWxlbWVudFxuICAgICAgICBpZiAodGhpcy5lbGVtZW50U2V0dGluZ3MuaGFzKGVsZW1lbnQpKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFBhdXNlIHRoZSBlbGVtZW50IGlmIGl0J3MgcGxheWluZ1xuICAgICAgICAgICAgaWYgKCFlbGVtZW50LnBhdXNlZCkge1xuICAgICAgICAgICAgICBlbGVtZW50LnBhdXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGVsZW1lbnQucGxheWJhY2tSYXRlID0gMS4wO1xuICAgICAgICAgICAgZWxlbWVudC5kZWZhdWx0UGxheWJhY2tSYXRlID0gMS4wO1xuICAgICAgICAgICAgdGhpcy5jbGVhbnVwRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgICBgTWVkaWFQcm9jZXNzb3I6IEVycm9yIHJlc2V0dGluZyBlbGVtZW50ICR7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5zcmMgfHwgXCIobm8gc3JjKVwiXG4gICAgICAgICAgICAgIH0gaW4gZGlzYWJsZWQgbW9kZTpgLFxuICAgICAgICAgICAgICBlXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZGVidWdMb2coXG4gICAgICBcIltNZWRpYVByb2Nlc3Nvcl0gQXBwbHlpbmcgc2V0dGluZ3MgaW1tZWRpYXRlbHkgdG8gbWVkaWEgZWxlbWVudHNcIlxuICAgICk7XG5cbiAgICBjb25zdCB0YXJnZXRTcGVlZCA9IHNldHRpbmdzLnNwZWVkIC8gMTAwO1xuICAgIFxuICAgIC8vIFByb2Nlc3MgYWxsIGVsZW1lbnRzIHN5bmNocm9ub3VzbHkgZm9yIGltbWVkaWF0ZSBlZmZlY3RcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbWVkaWFFbGVtZW50cykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKCFlbGVtZW50LmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgdGhpcy5jbGVhbnVwRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQXBwbHkgcGxheWJhY2sgc3BlZWQgaW1tZWRpYXRlbHlcbiAgICAgICAgZWxlbWVudC5wbGF5YmFja1JhdGUgPSB0YXJnZXRTcGVlZDtcbiAgICAgICAgZWxlbWVudC5kZWZhdWx0UGxheWJhY2tSYXRlID0gdGFyZ2V0U3BlZWQ7XG4gICAgICAgIFxuICAgICAgICAvLyBTdG9yZSBjdXJyZW50IHNldHRpbmdzIGZvciB0aGlzIGVsZW1lbnRcbiAgICAgICAgdGhpcy5lbGVtZW50U2V0dGluZ3Muc2V0KGVsZW1lbnQsIHNldHRpbmdzKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEFkZCBwbGF5IGV2ZW50IGxpc3RlbmVyIGlmIG5vdCBhbHJlYWR5IGFkZGVkXG4gICAgICAgIGlmICghdGhpcy5lbGVtZW50TGlzdGVuZXJzLmhhcyhlbGVtZW50KSkge1xuICAgICAgICAgIGNvbnN0IHBsYXlIYW5kbGVyID0gKCkgPT4ge1xuICAgICAgICAgICAgZGVidWdMb2coYFtNZWRpYVByb2Nlc3Nvcl0gUmVhcHBseWluZyBzZXR0aW5ncyBvbiBwbGF5IGV2ZW50IGZvciAke2VsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIn1gKTtcbiAgICAgICAgICAgIC8vIFJlYWQgY3VycmVudCBzZXR0aW5ncyBmcm9tIFdlYWtNYXAgaW5zdGVhZCBvZiBjYXB0dXJpbmcgc3RhbGUgY2xvc3VyZVxuICAgICAgICAgICAgY29uc3QgY3VycmVudFNldHRpbmdzID0gdGhpcy5lbGVtZW50U2V0dGluZ3MuZ2V0KGVsZW1lbnQpO1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRTZXR0aW5ncykge1xuICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXliYWNrU3BlZWQoZWxlbWVudCwgY3VycmVudFNldHRpbmdzLnNwZWVkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncGxheScsIHBsYXlIYW5kbGVyKTtcbiAgICAgICAgICB0aGlzLmVsZW1lbnRMaXN0ZW5lcnMuc2V0KGVsZW1lbnQsIHBsYXlIYW5kbGVyKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gVHJhY2sgY29ubmVjdGVkIGVsZW1lbnRzXG4gICAgICAgIGlmICghdGhpcy5hY3RpdmVNZWRpYUVsZW1lbnRzLmhhcyhlbGVtZW50KSkge1xuICAgICAgICAgIHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5hZGQoZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICBgTWVkaWFQcm9jZXNzb3I6IEVycm9yIGFwcGx5aW5nIHNldHRpbmdzIHRvICR7XG4gICAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgICB9OmAsXG4gICAgICAgICAgZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBcbiAgcHJpdmF0ZSBjbGVhbnVwRWxlbWVudChlbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50KTogdm9pZCB7XG4gICAgaWYgKHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5oYXMoZWxlbWVudCkpIHtcbiAgICAgIHRoaXMuYWN0aXZlTWVkaWFFbGVtZW50cy5kZWxldGUoZWxlbWVudCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHBsYXlIYW5kbGVyID0gdGhpcy5lbGVtZW50TGlzdGVuZXJzLmdldChlbGVtZW50KTtcbiAgICBpZiAocGxheUhhbmRsZXIpIHtcbiAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigncGxheScsIHBsYXlIYW5kbGVyKTtcbiAgICAgIHRoaXMuZWxlbWVudExpc3RlbmVycy5kZWxldGUoZWxlbWVudCk7XG4gICAgfVxuICAgIFxuICAgIHRoaXMuZWxlbWVudFNldHRpbmdzLmRlbGV0ZShlbGVtZW50KTtcbiAgfVxuXG4gIGFwcGx5U2V0dGluZ3NUb1Zpc2libGVNZWRpYShcbiAgICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncyxcbiAgICBkaXNhYmxlZDogYm9vbGVhbiA9IGZhbHNlXG4gICk6IHZvaWQge1xuICAgIC8vIEdldCBhbGwgbWVkaWEgZWxlbWVudHMgYW5kIGZpbHRlciBmb3IgdmlzaWJsZSBvbmVzXG4gICAgY29uc3QgdmlzaWJsZU1lZGlhID0gdGhpcy5nZXRNYW5hZ2VkTWVkaWFFbGVtZW50cygpLmZpbHRlcihlbCA9PlxuICAgICAgZWwub2Zmc2V0V2lkdGggPiAwIHx8IGVsLm9mZnNldEhlaWdodCA+IDBcbiAgICApO1xuICAgIFxuICAgIGlmICh2aXNpYmxlTWVkaWEubGVuZ3RoID4gMCkge1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIGBbTWVkaWFQcm9jZXNzb3JdIEFwcGx5aW5nIHNldHRpbmdzIHRvICR7dmlzaWJsZU1lZGlhLmxlbmd0aH0gdmlzaWJsZSBtZWRpYSBlbGVtZW50c2BcbiAgICAgICk7XG4gICAgICB0aGlzLmFwcGx5U2V0dGluZ3NJbW1lZGlhdGVseSh2aXNpYmxlTWVkaWEsIHNldHRpbmdzLCBkaXNhYmxlZCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEZvcmNlIHVwZGF0ZSBvZiBhdWRpbyBlZmZlY3RzIGV2ZW4gaWYgY29udGV4dCBhbHJlYWR5IGV4aXN0c1xuICAgKiBVc2VmdWwgZm9yIGltbWVkaWF0ZSBhcHBsaWNhdGlvbiBvZiBmaWx0ZXIvYXVkaW8gY2hhbmdlc1xuICAgKi9cbiAgYXN5bmMgZm9yY2VBdWRpb0VmZmVjdHNVcGRhdGUoc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1Z0xvZyhcIltNZWRpYVByb2Nlc3Nvcl0gRm9yY2luZyBhdWRpbyBlZmZlY3RzIHVwZGF0ZVwiKTtcblxuICAgIGlmIChcbiAgICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3JbXCJhdWRpb0NvbnRleHRcIl0gJiZcbiAgICAgIHRoaXMuYXVkaW9Qcm9jZXNzb3JbXCJhdWRpb0NvbnRleHRcIl0uc3RhdGUgIT09IFwiY2xvc2VkXCJcbiAgICApIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIENyZWF0ZSBuZXcgYXVkaW8gY29udGV4dCBpZiBuZWVkZWRcbiAgICAgICAgaWYgKHRoaXMuYXVkaW9Qcm9jZXNzb3JbXCJhdWRpb0NvbnRleHRcIl0uc3RhdGUgPT09IFwic3VzcGVuZGVkXCIpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmF1ZGlvUHJvY2Vzc29yW1wiYXVkaW9Db250ZXh0XCJdLnJlc3VtZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRm9yY2UgdXBkYXRlIG9mIGF1ZGlvIGVmZmVjdHNcbiAgICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci51cGRhdGVBdWRpb0VmZmVjdHMoc2V0dGluZ3MpO1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBcIltNZWRpYVByb2Nlc3Nvcl0gU3VjY2Vzc2Z1bGx5IGZvcmNlZCBhdWRpbyBlZmZlY3RzIHVwZGF0ZVwiXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgXCJbTWVkaWFQcm9jZXNzb3JdIEZhaWxlZCB0byBmb3JjZSBhdWRpbyBlZmZlY3RzIHVwZGF0ZTpcIixcbiAgICAgICAgICBlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnTG9nKFxuICAgICAgICBcIltNZWRpYVByb2Nlc3Nvcl0gQ3JlYXRpbmcgbmV3IGF1ZGlvIGNvbnRleHQgZm9yIGZvcmNlZCB1cGRhdGVcIlxuICAgICAgKTtcbiAgICAgIGNvbnN0IG1vY2tFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImF1ZGlvXCIpO1xuICAgICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci5zZXR1cEF1ZGlvQ29udGV4dChtb2NrRWxlbWVudCwgc2V0dGluZ3MpO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgc2V0dXBNZWRpYU9ic2VydmVyKFxuICAgIG9uQWRkZWQ6IChlbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiBQcm9taXNlPHZvaWQ+LFxuICAgIG9uUmVtb3ZlZDogKGVsZW1lbnRzOiBIVE1MTWVkaWFFbGVtZW50W10pID0+IHZvaWRcbiAgKTogTXV0YXRpb25PYnNlcnZlciB7XG4gICAgLy8gQ2hhbmdlIHJldHVybiB0eXBlIHRvIE11dGF0aW9uT2JzZXJ2ZXJcbiAgICByZXR1cm4gTWVkaWFNYW5hZ2VyLnNldHVwTWVkaWFFbGVtZW50T2JzZXJ2ZXIob25BZGRlZCwgb25SZW1vdmVkKTsgLy8gUmV0dXJuIHRoZSBvYnNlcnZlclxuICB9XG5cbiAgZmluZE1lZGlhRWxlbWVudHMoKTogSFRNTE1lZGlhRWxlbWVudFtdIHtcbiAgICAvLyBBc3N1bWluZyBNZWRpYU1hbmFnZXIuZmluZE1lZGlhRWxlbWVudHMgaXMgbWFkZSBwdWJsaWNcbiAgICByZXR1cm4gTWVkaWFNYW5hZ2VyLmZpbmRNZWRpYUVsZW1lbnRzKCk7XG4gIH1cblxuICBhc3luYyByZXNldFRvRGlzYWJsZWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5hdWRpb1Byb2Nlc3Nvci5yZXNldEFsbFRvRGlzYWJsZWQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQdWJsaWMgbWV0aG9kIHRvIGF0dGVtcHQgcmVzdW1pbmcgdGhlIEF1ZGlvQ29udGV4dCB2aWEgdGhlIHByaXZhdGUgQXVkaW9Qcm9jZXNzb3IuXG4gICAqL1xuICBwdWJsaWMgYXN5bmMgYXR0ZW1wdENvbnRleHRSZXN1bWUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gQWNjZXNzIHRoZSBwcml2YXRlIG1lbWJlciB1c2luZyBicmFja2V0IG5vdGF0aW9uIGlmIG5lZWRlZCwgb3IgbWFrZSBpdCBwdWJsaWMvaW50ZXJuYWxcbiAgICBhd2FpdCB0aGlzLmF1ZGlvUHJvY2Vzc29yLnRyeVJlc3VtZUNvbnRleHQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQdWJsaWMgbWV0aG9kIHRvIGNoZWNrIGlmIHRoZSBBdWRpb0NvbnRleHQgaXMgcmVhZHkgZm9yIGFwcGx5aW5nIGF1ZGlvIGVmZmVjdHMuXG4gICAqL1xuICBwdWJsaWMgY2FuQXBwbHlBdWRpb0VmZmVjdHMoKTogYm9vbGVhbiB7XG4gICAgLy8gQ2hlY2sgaWYgYXVkaW9Qcm9jZXNzb3IgYW5kIGl0cyBhdWRpb0NvbnRleHQgZXhpc3QgYW5kIGFyZSBpbiAncnVubmluZycgc3RhdGVcbiAgICByZXR1cm4gKFxuICAgICAgISF0aGlzLmF1ZGlvUHJvY2Vzc29yW1wiYXVkaW9Db250ZXh0XCJdICYmXG4gICAgICB0aGlzLmF1ZGlvUHJvY2Vzc29yW1wiYXVkaW9Db250ZXh0XCJdLnN0YXRlID09PSBcInJ1bm5pbmdcIlxuICAgICk7XG4gIH1cbn0gLy8gRW5kIG9mIE1lZGlhUHJvY2Vzc29yIGNsYXNzXG4iLCJpbXBvcnQgeyBBdWRpb1NldHRpbmdzLCBkZWZhdWx0U2V0dGluZ3MgLCBkZWJ1Z0xvZyB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc0hhbmRsZXIge1xuICBwcml2YXRlIGN1cnJlbnRTZXR0aW5nczogQXVkaW9TZXR0aW5ncztcbiAgcHJpdmF0ZSB0YXJnZXRIb3N0bmFtZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7IC8vIFN0b3JlIHRoZSBob3N0bmFtZSB3ZSBzaG91bGQgdXNlXG4gIHByaXZhdGUgaW5pdGlhbGl6YXRpb25Db21wbGV0ZTogUHJvbWlzZTx2b2lkPjtcbiAgcHJpdmF0ZSByZXNvbHZlSW5pdGlhbGl6YXRpb24hOiAoKSA9PiB2b2lkOyAvLyBEZWZpbml0ZSBhc3NpZ25tZW50IGFzc2VydGlvblxuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0geyAuLi5kZWZhdWx0U2V0dGluZ3MgfTsgLy8gU3RhcnQgd2l0aCBkZWZhdWx0c1xuICAgIC8vIERvbid0IHNldCBob3N0bmFtZSBoZXJlLCB3YWl0IGZvciBpbml0aWFsaXplXG4gICAgdGhpcy5pbml0aWFsaXphdGlvbkNvbXBsZXRlID0gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIHRoaXMucmVzb2x2ZUluaXRpYWxpemF0aW9uID0gcmVzb2x2ZTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplcyB0aGUgaGFuZGxlciBieSByZXF1ZXN0aW5nIHRoZSBjb3JyZWN0IHNldHRpbmdzXG4gICAqIGZvciB0aGUgdGFyZ2V0IGhvc3RuYW1lIGZyb20gdGhlIGJhY2tncm91bmQgc2NyaXB0LlxuICAgKiBAcGFyYW0gaG9zdG5hbWUgVGhlIGhvc3RuYW1lIHRvIGZldGNoIHNldHRpbmdzIGZvciAoaWRlYWxseSB0b3AtbGV2ZWwpLlxuICAgKi9cbiAgYXN5bmMgaW5pdGlhbGl6ZShob3N0bmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy50YXJnZXRIb3N0bmFtZSA9IGhvc3RuYW1lOyAvLyBTdG9yZSB0aGUgdGFyZ2V0IGhvc3RuYW1lXG4gICAgZGVidWdMb2coXG4gICAgICBgU2V0dGluZ3NIYW5kbGVyIChUYXJnZXQ6ICR7dGhpcy50YXJnZXRIb3N0bmFtZX0pOiBJbml0aWFsaXppbmcuLi5gXG4gICAgKTtcblxuICAgIGlmICghdGhpcy50YXJnZXRIb3N0bmFtZSkge1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogSW5pdGlhbGl6YXRpb24gYWJvcnRlZCAtIG5vIHZhbGlkIHRhcmdldCBob3N0bmFtZSBwcm92aWRlZC5gXG4gICAgICApO1xuICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9O1xuICAgICAgdGhpcy5yZXNvbHZlSW5pdGlhbGl6YXRpb24oKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBkZWJ1Z0xvZyhcbiAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IEF0dGVtcHRpbmcgdG8gc2VuZCBHRVRfSU5JVElBTF9TRVRUSU5HUy5gXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgIHR5cGU6IFwiR0VUX0lOSVRJQUxfU0VUVElOR1NcIixcbiAgICAgICAgaG9zdG5hbWU6IHRoaXMudGFyZ2V0SG9zdG5hbWUsXG4gICAgICB9KTtcblxuICAgICAgZGVidWdMb2coXG4gICAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IEdFVF9JTklUSUFMX1NFVFRJTkdTIHJlc3BvbnNlIHJlY2VpdmVkOmAsXG4gICAgICAgIHJlc3BvbnNlXG4gICAgICApO1xuXG4gICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uuc2V0dGluZ3MpIHtcbiAgICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSByZXNwb25zZS5zZXR0aW5ncztcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogU3VjY2Vzc2Z1bGx5IGFwcGxpZWQgaW5pdGlhbCBzZXR0aW5ncyBmcm9tIGJhY2tncm91bmQ6YCxcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh0aGlzLmN1cnJlbnRTZXR0aW5ncylcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0geyAuLi5kZWZhdWx0U2V0dGluZ3MgfTtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBTZXR0aW5nc0hhbmRsZXIgKFRhcmdldDogJHt0aGlzLnRhcmdldEhvc3RuYW1lfSk6IE5vIHZhbGlkIHNldHRpbmdzIGluIHJlc3BvbnNlIG9yIHJlc3BvbnNlIHdhcyBudWxsL3VuZGVmaW5lZC4gVXNpbmcgZGVmYXVsdHMuIFJlc3BvbnNlOmAsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgXCJDdXJyZW50IHNldHRpbmdzIG5vdzpcIixcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh0aGlzLmN1cnJlbnRTZXR0aW5ncylcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9O1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogRXJyb3IgZHVyaW5nIEdFVF9JTklUSUFMX1NFVFRJTkdTIHNlbmRNZXNzYWdlIG9yIHByb2Nlc3Npbmc6YCxcbiAgICAgICAgZXJyb3IsXG4gICAgICAgIFwiVXNpbmcgZGVmYXVsdHMuIEN1cnJlbnQgc2V0dGluZ3Mgbm93OlwiLFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh0aGlzLmN1cnJlbnRTZXR0aW5ncylcbiAgICAgICk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGRlYnVnTG9nKFxuICAgICAgICBgU2V0dGluZ3NIYW5kbGVyIChUYXJnZXQ6ICR7dGhpcy50YXJnZXRIb3N0bmFtZX0pOiBJbml0aWFsaXphdGlvbiBwcm9taXNlIHJlc29sdmluZy4gRmluYWwgY3VycmVudFNldHRpbmdzIHN0YXRlIGZvciB0aGlzIGluaXQgY3ljbGU6YCxcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5jdXJyZW50U2V0dGluZ3MpXG4gICAgICApO1xuICAgICAgdGhpcy5yZXNvbHZlSW5pdGlhbGl6YXRpb24oKTsgLy8gU2lnbmFsIHRoYXQgaW5pdGlhbGl6YXRpb24gaXMgZG9uZVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIG9uY2UgaW5pdGlhbCBzZXR0aW5ncyBoYXZlIGJlZW5cbiAgICogZmV0Y2hlZCAob3IgZmFpbGVkIHRvIGZldGNoKSBmcm9tIHRoZSBiYWNrZ3JvdW5kIHNjcmlwdC5cbiAgICovXG4gIGFzeW5jIGVuc3VyZUluaXRpYWxpemVkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmluaXRpYWxpemF0aW9uQ29tcGxldGU7XG4gIH1cblxuICAvKipcbiAgICogR2V0cyB0aGUgY3VycmVudGx5IGxvYWRlZCBzZXR0aW5ncy5cbiAgICovXG4gIGdldEN1cnJlbnRTZXR0aW5ncygpOiBBdWRpb1NldHRpbmdzIHtcbiAgICByZXR1cm4gdGhpcy5jdXJyZW50U2V0dGluZ3M7XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlcyBzZXR0aW5ncyBsb2NhbGx5LiBTaG91bGQgcHJpbWFyaWx5IGJlIHVzZWQgd2hlbiByZWNlaXZpbmdcbiAgICogdXBkYXRlcyBmcm9tIHRoZSBiYWNrZ3JvdW5kIHNjcmlwdCB2aWEgbWVzc2FnZXMuXG4gICAqL1xuICB1cGRhdGVTZXR0aW5ncyhzZXR0aW5nczogQXVkaW9TZXR0aW5ncyk6IHZvaWQge1xuICAgIGRlYnVnTG9nKFxuICAgICAgYFNldHRpbmdzSGFuZGxlciAoVGFyZ2V0OiAke3RoaXMudGFyZ2V0SG9zdG5hbWV9KTogU2V0dGluZ3MgdXBkYXRlZCBkaXJlY3RseWAsXG4gICAgICBzZXR0aW5nc1xuICAgICk7XG4gICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNldHMgc2V0dGluZ3MgdG8gdGhlIGFwcGxpY2F0aW9uIGRlZmF1bHRzIGxvY2FsbHkuXG4gICAqL1xuICByZXNldFRvRGVmYXVsdCgpOiB2b2lkIHtcbiAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyA9IHsgLi4uZGVmYXVsdFNldHRpbmdzIH07XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lcyBpZiBhdWRpbyBwcm9jZXNzaW5nIGlzIG5lZWRlZCBiYXNlZCBvbiBjdXJyZW50IHNldHRpbmdzLlxuICAgKi9cbiAgbmVlZHNBdWRpb1Byb2Nlc3NpbmcoKTogYm9vbGVhbiB7XG4gICAgLy8gQ2hlY2sgaWYgc2V0dGluZ3MgYXJlIGRpZmZlcmVudCBmcm9tIGRlZmF1bHRzLCBpbXBseWluZyBwcm9jZXNzaW5nIGlzIG5lZWRlZFxuICAgIGNvbnN0IGRlZmF1bHRzID0gZGVmYXVsdFNldHRpbmdzO1xuICAgIGNvbnN0IG5lZWRzUHJvY2Vzc2luZyA9ICEoXG4gICAgICAoXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzLnZvbHVtZSA9PT0gZGVmYXVsdHMudm9sdW1lICYmXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzLmJhc3NCb29zdCA9PT0gZGVmYXVsdHMuYmFzc0Jvb3N0ICYmXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzLnZvaWNlQm9vc3QgPT09IGRlZmF1bHRzLnZvaWNlQm9vc3QgJiZcbiAgICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MubW9ubyA9PT0gZGVmYXVsdHMubW9ub1xuICAgICAgKVxuICAgICAgLy8gQWRkIG90aGVyIHJlbGV2YW50IHNldHRpbmdzIGNoZWNrcyBoZXJlIGlmIG5lZWRlZFxuICAgICk7XG4gICAgLy8gZGVidWdMb2coYFNldHRpbmdzSGFuZGxlciAoJHt0aGlzLmhvc3RuYW1lfSk6IG5lZWRzQXVkaW9Qcm9jZXNzaW5nID0gJHtuZWVkc1Byb2Nlc3Npbmd9YCk7XG4gICAgcmV0dXJuIG5lZWRzUHJvY2Vzc2luZztcbiAgfVxufVxuIiwiaW1wb3J0IHsgU2V0dGluZ3NIYW5kbGVyIH0gZnJvbSBcIi4vc2V0dGluZ3MtaGFuZGxlclwiO1xuaW1wb3J0IHsgTWVkaWFQcm9jZXNzb3IgfSBmcm9tIFwiLi9tZWRpYS1wcm9jZXNzb3JcIjtcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxudHlwZSBJbml0aWFsaXplU2NyaXB0Q2FsbGJhY2sgPSAoaG9zdG5hbWU6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPjtcblxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwSG9zdG5hbWVEZXRlY3Rpb24oXG4gIGluaXRpYWxpemVTY3JpcHQ6IEluaXRpYWxpemVTY3JpcHRDYWxsYmFja1xuKTogKCkgPT4gdm9pZCB7XG4gIGxldCBjbGVhbnVwRnVuY3Rpb25zOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG4gIGlmICh3aW5kb3cuc2VsZiA9PT0gd2luZG93LnRvcCkge1xuICAgIC8vIC0tLSBSdW5uaW5nIGluIHRoZSBUT1Agd2luZG93IC0tLVxuICAgIGNvbnN0IHRvcEhvc3RuYW1lID0gd2luZG93LmxvY2F0aW9uLmhvc3RuYW1lO1xuICAgIGRlYnVnTG9nKFxuICAgICAgYFtDb250ZW50U2NyaXB0XSBSdW5uaW5nIGluIFRPUCB3aW5kb3cuIEhvc3RuYW1lOiAke3RvcEhvc3RuYW1lfWBcbiAgICApO1xuICAgIGluaXRpYWxpemVTY3JpcHQodG9wSG9zdG5hbWUpOyAvLyBJbml0aWFsaXplIGZvciB0aGUgdG9wIHdpbmRvd1xuXG4gICAgLy8gTGlzdGVuZXIgZm9yIHJlcXVlc3RzIGZyb20gaWZyYW1lc1xuICAgIGNvbnN0IHRvcFdpbmRvd01lc3NhZ2VMaXN0ZW5lciA9IChldmVudDogTWVzc2FnZUV2ZW50KSA9PiB7XG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IFRPUF0gUmVjZWl2ZWQgbWVzc2FnZS4gT3JpZ2luOiAke1xuICAgICAgICAgIGV2ZW50Lm9yaWdpblxuICAgICAgICB9LCBEYXRhIFR5cGU6ICR7dHlwZW9mIGV2ZW50LmRhdGF9LCBEYXRhOiAke2V2ZW50LmRhdGF9YFxuICAgICAgKTtcblxuICAgICAgLy8gT25seSBwcm9jZXNzIG1lc3NhZ2VzIHRoYXQgYXJlIHN0cmluZ3MgYW5kIGxvb2sgbGlrZSBvdXIgSlNPTiBtZXNzYWdlc1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgZXZlbnQuZGF0YSAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgICAhZXZlbnQuZGF0YS5zdGFydHNXaXRoKFwie1wiKSB8fFxuICAgICAgICAhZXZlbnQuZGF0YS5lbmRzV2l0aChcIn1cIilcbiAgICAgICkge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBcIltDb250ZW50U2NyaXB0IFRPUF0gSWdub3Jpbmcgbm9uLUpTT04gb3Igbm9uLVZWUCBtZXNzYWdlIGZyb20gaWZyYW1lIChmb3JtYXQgbWlzbWF0Y2gpLlwiXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIGEgY2hlY2sgZm9yIG91ciBzcGVjaWZpYyBtZXNzYWdlIHR5cGVzIGJlZm9yZSBwYXJzaW5nXG4gICAgICBpZiAoXG4gICAgICAgICFldmVudC5kYXRhLmluY2x1ZGVzKFwiVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FXCIpICYmXG4gICAgICAgICFldmVudC5kYXRhLmluY2x1ZGVzKFwiVlZQX1RPUF9IT1NUTkFNRV9JTkZPXCIpXG4gICAgICApIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgXCJbQ29udGVudFNjcmlwdCBUT1BdIElnbm9yaW5nIG5vbi1WVlAgbWVzc2FnZSBmcm9tIGlmcmFtZSAoY29udGVudCBtaXNtYXRjaCkuXCJcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbGV0IHBhcnNlZERhdGE7XG4gICAgICB0cnkge1xuICAgICAgICBwYXJzZWREYXRhID0gSlNPTi5wYXJzZShldmVudC5kYXRhKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIFwiW0NvbnRlbnRTY3JpcHQgVE9QXSBGYWlsZWQgdG8gcGFyc2UgZXZlbnQuZGF0YSBzdHJpbmcgZnJvbSBpZnJhbWUgKGxpa2VseSBub3Qgb3VyIG1lc3NhZ2UpOlwiLFxuICAgICAgICAgIGV2ZW50LmRhdGEsXG4gICAgICAgICAgZVxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGRlYnVnTG9nKFxuICAgICAgICBgW0NvbnRlbnRTY3JpcHQgVE9QXSBQYXJzZWQgVlZQIG1lc3NhZ2UgZnJvbSBpZnJhbWUgKE9yaWdpbjogJHtldmVudC5vcmlnaW59KTpgLFxuICAgICAgICBwYXJzZWREYXRhXG4gICAgICApO1xuXG4gICAgICBpZiAoXG4gICAgICAgIGV2ZW50LnNvdXJjZSAmJiAvLyBFbnN1cmUgc291cmNlIGV4aXN0cyAoc291cmNlIGlzIHRoZSB3aW5kb3cgb2JqZWN0IG9mIHRoZSBzZW5kZXIpXG4gICAgICAgIHBhcnNlZERhdGEgJiZcbiAgICAgICAgcGFyc2VkRGF0YS50eXBlID09PSBcIlZWUF9SRVFVRVNUX1RPUF9IT1NUTkFNRVwiXG4gICAgICApIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IFRPUF0gUHJvY2Vzc2luZyBWVlBfUkVRVUVTVF9UT1BfSE9TVE5BTUUgZnJvbSBpZnJhbWUgKFNvdXJjZSBvcmlnaW46ICR7ZXZlbnQub3JpZ2lufSkuIFJlc3BvbmRpbmcgd2l0aCBob3N0bmFtZTogJHt0b3BIb3N0bmFtZX0uYFxuICAgICAgICApO1xuICAgICAgICBjb25zdCByZXNwb25zZVBheWxvYWQgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdHlwZTogXCJWVlBfVE9QX0hPU1ROQU1FX0lORk9cIixcbiAgICAgICAgICBob3N0bmFtZTogdG9wSG9zdG5hbWUsXG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIEhhbmRsZSBzYW5kYm94ZWQgZW52aXJvbm1lbnRzIHdoZXJlIGV2ZW50Lm9yaWdpbiBtaWdodCBiZSBcIm51bGxcIlxuICAgICAgICBjb25zdCB0YXJnZXRPcmlnaW4gPSBldmVudC5vcmlnaW4gPT09IFwibnVsbFwiID8gXCIqXCIgOiBldmVudC5vcmlnaW47XG4gICAgICAgIChldmVudC5zb3VyY2UgYXMgV2luZG93KS5wb3N0TWVzc2FnZShyZXNwb25zZVBheWxvYWQsIHRhcmdldE9yaWdpbik7XG4gICAgICAgIGRlYnVnTG9nKFxuICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBUT1BdIFNlbnQgVlZQX1RPUF9IT1NUTkFNRV9JTkZPIHJlc3BvbnNlIHRvIGlmcmFtZSBhdCAke2V2ZW50Lm9yaWdpbn0uYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IFRPUF0gUmVjZWl2ZWQgb3RoZXIgcGFyc2VkIEpTT04gbWVzc2FnZSB0eXBlIChub3QgVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FKTogJHtwYXJzZWREYXRhLnR5cGV9IGZyb20gb3JpZ2luICR7ZXZlbnQub3JpZ2lufWAsXG4gICAgICAgICAgcGFyc2VkRGF0YVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH07XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIHRvcFdpbmRvd01lc3NhZ2VMaXN0ZW5lcik7XG4gICAgY29uc3QgcmVtb3ZlVG9wTGlzdGVuZXIgPSAoKSA9PiB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgdG9wV2luZG93TWVzc2FnZUxpc3RlbmVyKTtcbiAgICBjbGVhbnVwRnVuY3Rpb25zLnB1c2gocmVtb3ZlVG9wTGlzdGVuZXIpO1xuICB9IGVsc2Uge1xuICAgIC8vIC0tLSBSdW5uaW5nIGluIGFuIElGUkFNRSAtLS1cbiAgICBjb25zdCBpZnJhbWVPd25Ib3N0bmFtZSA9IHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZTtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFJ1bm5pbmcgaW4gSUZSQU1FLiBPd24gaG9zdG5hbWU6ICR7aWZyYW1lT3duSG9zdG5hbWV9LiBBdHRlbXB0aW5nIHRvIHJlcXVlc3QgaG9zdG5hbWUgZnJvbSB0b3Agd2luZG93LiBTZXR0aW5nIHVwIG1lc3NhZ2UgbGlzdGVuZXIuYFxuICAgICk7XG4gICAgbGV0IHJlY2VpdmVkSG9zdG5hbWUgPSBmYWxzZTtcbiAgICBsZXQgZmFsbGJhY2tUaW1lb3V0OiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICAgIC8vIExpc3RlbmVyIGZvciB0aGUgcmVzcG9uc2UgZnJvbSB0aGUgdG9wIHdpbmRvd1xuICAgIGNvbnN0IHJlc3BvbnNlTGlzdGVuZXIgPSAoZXZlbnQ6IE1lc3NhZ2VFdmVudCkgPT4ge1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFJlY2VpdmVkIG1lc3NhZ2UuIE9yaWdpbjogJHtcbiAgICAgICAgICBldmVudC5vcmlnaW5cbiAgICAgICAgfSwgRGF0YSBUeXBlOiAke3R5cGVvZiBldmVudC5kYXRhfSwgRGF0YTogJHtldmVudC5kYXRhfWBcbiAgICAgICk7XG5cbiAgICAgIC8vIE9ubHkgcHJvY2VzcyBtZXNzYWdlcyBmcm9tIHRoZSB0b3Agd2luZG93XG4gICAgICBpZiAoZXZlbnQuc291cmNlICE9PSB3aW5kb3cudG9wKSB7XG4gICAgICAgIGRlYnVnTG9nKFxuICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFJlY2VpdmVkIG1lc3NhZ2UgZnJvbSBub24tdG9wIHNvdXJjZTogJHtldmVudC5vcmlnaW59LiBJZ25vcmluZy5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gT25seSBwcm9jZXNzIG1lc3NhZ2VzIHRoYXQgYXJlIHN0cmluZ3MgYW5kIGxvb2sgbGlrZSBvdXIgSlNPTiBtZXNzYWdlc1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgZXZlbnQuZGF0YSAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgICAhZXZlbnQuZGF0YS5zdGFydHNXaXRoKFwie1wiKSB8fFxuICAgICAgICAhZXZlbnQuZGF0YS5lbmRzV2l0aChcIn1cIilcbiAgICAgICkge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBcIltDb250ZW50U2NyaXB0IGlGcmFtZV0gSWdub3Jpbmcgbm9uLUpTT04gb3Igbm9uLVZWUCBtZXNzYWdlIGZyb20gdG9wIChmb3JtYXQgbWlzbWF0Y2gpLlwiXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIGEgY2hlY2sgZm9yIG91ciBzcGVjaWZpYyBtZXNzYWdlIHR5cGVzIGJlZm9yZSBwYXJzaW5nXG4gICAgICBpZiAoXG4gICAgICAgICFldmVudC5kYXRhLmluY2x1ZGVzKFwiVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FXCIpICYmXG4gICAgICAgICFldmVudC5kYXRhLmluY2x1ZGVzKFwiVlZQX1RPUF9IT1NUTkFNRV9JTkZPXCIpXG4gICAgICApIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgXCJbQ29udGVudFNjcmlwdCBpRnJhbWVdIElnbm9yaW5nIG5vbi1WVlAgbWVzc2FnZSBmcm9tIHRvcCAoY29udGVudCBtaXNtYXRjaCkuXCJcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsZXQgcGFyc2VkRGF0YTtcbiAgICAgIHRyeSB7XG4gICAgICAgIHBhcnNlZERhdGEgPSBKU09OLnBhcnNlKGV2ZW50LmRhdGEpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgXCJbQ29udGVudFNjcmlwdCBpRnJhbWVdIEZhaWxlZCB0byBwYXJzZSBldmVudC5kYXRhIHN0cmluZyBmcm9tIHRvcDpcIixcbiAgICAgICAgICBldmVudC5kYXRhLFxuICAgICAgICAgIGVcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gUGFyc2VkIFZWUCBtZXNzYWdlIGZyb20gdG9wIChPcmlnaW46ICR7ZXZlbnQub3JpZ2lufSk6YCxcbiAgICAgICAgcGFyc2VkRGF0YVxuICAgICAgKTtcblxuICAgICAgaWYgKFxuICAgICAgICBwYXJzZWREYXRhICYmXG4gICAgICAgIHBhcnNlZERhdGEudHlwZSA9PT0gXCJWVlBfVE9QX0hPU1ROQU1FX0lORk9cIiAmJlxuICAgICAgICB0eXBlb2YgcGFyc2VkRGF0YS5ob3N0bmFtZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgKSB7XG4gICAgICAgIGlmIChmYWxsYmFja1RpbWVvdXQpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQoZmFsbGJhY2tUaW1lb3V0KTtcbiAgICAgICAgICBmYWxsYmFja1RpbWVvdXQgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZWNlaXZlZEhvc3RuYW1lKSB7XG4gICAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBBbHJlYWR5IHJlY2VpdmVkIGhvc3RuYW1lLiBJZ25vcmluZyBkdXBsaWNhdGUgVlZQX1RPUF9IT1NUTkFNRV9JTkZPIGZyb20gdG9wLiBPcmlnaW46ICR7ZXZlbnQub3JpZ2lufS4gUGFyc2VkIERhdGE6YCxcbiAgICAgICAgICAgIHBhcnNlZERhdGFcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICByZWNlaXZlZEhvc3RuYW1lID0gdHJ1ZTtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gU3VjY2Vzc2Z1bGx5IHJlY2VpdmVkIFZWUF9UT1BfSE9TVE5BTUVfSU5GTyBmcm9tIHRvcDogJHtwYXJzZWREYXRhLmhvc3RuYW1lfS4gT3JpZ2luOiAke2V2ZW50Lm9yaWdpbn0uIEluaXRpYWxpemluZyBzY3JpcHQuIFBhcnNlZCBkYXRhOmAsXG4gICAgICAgICAgcGFyc2VkRGF0YVxuICAgICAgICApO1xuICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgcmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgICAgIC8vIFJlbW92ZSB0aGUgY2xlYW51cCBmdW5jdGlvbiBieSBmaWx0ZXJpbmcgd2l0aCB0aGUgc2FtZSByZWZlcmVuY2VcbiAgICAgICAgY2xlYW51cEZ1bmN0aW9ucyA9IGNsZWFudXBGdW5jdGlvbnMuZmlsdGVyKChmKSA9PiBmICE9PSByZW1vdmVSZXNwb25zZUxpc3RlbmVyKTtcbiAgICAgICAgaW5pdGlhbGl6ZVNjcmlwdChwYXJzZWREYXRhLmhvc3RuYW1lKTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VkRGF0YSAmJiBwYXJzZWREYXRhLnR5cGUpIHtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gUmVjZWl2ZWQgb3RoZXIgcGFyc2VkIEpTT04gbWVzc2FnZSB0eXBlIGZyb20gdG9wOiAke3BhcnNlZERhdGEudHlwZX0gZnJvbSBvcmlnaW4gJHtldmVudC5vcmlnaW59YCxcbiAgICAgICAgICBwYXJzZWREYXRhXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vIFN0b3JlIHRoZSBjbGVhbnVwIGZ1bmN0aW9uIGluIGEgdmFyaWFibGUgc28gd2UgY2FuIHJlZmVyZW5jZSBpdCBmb3IgcmVtb3ZhbFxuICAgIGNvbnN0IHJlbW92ZVJlc3BvbnNlTGlzdGVuZXIgPSAoKSA9PiB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgcmVzcG9uc2VMaXN0ZW5lcik7XG5cbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgcmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgY2xlYW51cEZ1bmN0aW9ucy5wdXNoKHJlbW92ZVJlc3BvbnNlTGlzdGVuZXIpO1xuXG4gICAgLy8gUmVxdWVzdCB0aGUgaG9zdG5hbWUgZnJvbSB0aGUgdG9wIHdpbmRvdywgc2VuZGluZyBzdHJpbmdpZmllZCBKU09OXG4gICAgaWYgKHdpbmRvdy50b3AgJiYgd2luZG93LnRvcCAhPT0gd2luZG93LnNlbGYpIHtcbiAgICAgIC8vIEFkZCBhIHNtYWxsIGRlbGF5IGJlZm9yZSBzZW5kaW5nIHRoZSBtZXNzYWdlIHRvIGdpdmUgdGhlIHRvcCB3aW5kb3cncyBzY3JpcHQgdGltZSB0byBpbml0aWFsaXplXG4gICAgICBjb25zdCByZXF1ZXN0VGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAvLyBSZS1jaGVjayB3aW5kb3cudG9wIGluc2lkZSB0aGUgdGltZW91dCBjYWxsYmFjayB0byBzYXRpc2Z5IFR5cGVTY3JpcHQgYW5kIGVuc3VyZSBydW50aW1lIHNhZmV0eVxuICAgICAgICBpZiAod2luZG93LnRvcCAmJiB3aW5kb3cudG9wICE9PSB3aW5kb3cuc2VsZikge1xuICAgICAgICAgIGRlYnVnTG9nKFxuICAgICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gU2VuZGluZyBWVlBfUkVRVUVTVF9UT1BfSE9TVE5BTUUgdG8gdG9wIHdpbmRvdyAoT3JpZ2luOiAke3dpbmRvdy5sb2NhdGlvbi5vcmlnaW59KS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBtZXNzYWdlUGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHR5cGU6IFwiVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FXCIsXG4gICAgICAgICAgICBmcm9tSWZyYW1lOiB0cnVlLFxuICAgICAgICAgICAgaWZyYW1lT3JpZ2luOiB3aW5kb3cubG9jYXRpb24ub3JpZ2luLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHdpbmRvdy50b3AucG9zdE1lc3NhZ2UobWVzc2FnZVBheWxvYWQsIFwiKlwiKTtcbiAgICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIFNlbnQgVlZQX1JFUVVFU1RfVE9QX0hPU1ROQU1FIHRvIHRvcCB3aW5kb3cuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gd2luZG93LnRvcCBiZWNhbWUgbnVsbCBvciBzZWxmIHdpdGhpbiBzZXRUaW1lb3V0LiBDYW5ub3Qgc2VuZCBtZXNzYWdlLmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9LCA1MDApOyAvLyBEZWxheSBieSA1MDBtc1xuICAgICAgY2xlYW51cEZ1bmN0aW9ucy5wdXNoKCgpID0+IGNsZWFyVGltZW91dChyZXF1ZXN0VGltZW91dCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIHdpbmRvdy50b3AgaXMgbnVsbCwgc2FtZSBhcyBzZWxmLCBvciBpbmFjY2Vzc2libGUuIEluaXRpYWxpemluZyB3aXRoIG93biBob3N0bmFtZTogJHtpZnJhbWVPd25Ib3N0bmFtZX0uYFxuICAgICAgKTtcbiAgICAgIGluaXRpYWxpemVTY3JpcHQoaWZyYW1lT3duSG9zdG5hbWUpO1xuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIHJlc3BvbnNlTGlzdGVuZXIpOyAvLyBDbGVhbiB1cCBsaXN0ZW5lciBhcyBpdCdzIG5vdCBuZWVkZWRcbiAgICAgIGNsZWFudXBGdW5jdGlvbnMgPSBjbGVhbnVwRnVuY3Rpb25zLmZpbHRlcigoZikgPT4gZiAhPT0gcmVtb3ZlUmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgICByZXR1cm4gKCkgPT4gY2xlYW51cEZ1bmN0aW9ucy5mb3JFYWNoKChmKSA9PiBmKCkpOyAvLyBSZXR1cm4gY2xlYW51cCBpbW1lZGlhdGVseVxuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIHRpbWVvdXQgaW4gY2FzZSB0aGUgbWVzc2FnZSBuZXZlciBhcnJpdmVzXG4gICAgY29uc3QgVElNRU9VVF9EVVJBVElPTiA9IDEwMDAwOyAvLyBJbmNyZWFzZWQgdGltZW91dCB0byAxMCBzZWNvbmRzXG4gICAgZGVidWdMb2coXG4gICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBTZXR0aW5nIGZhbGxiYWNrIHRpbWVvdXQgZm9yICR7VElNRU9VVF9EVVJBVElPTn1tcy4gVGltZW91dCBJRDogJHtmYWxsYmFja1RpbWVvdXR9YFxuICAgICk7XG4gICAgZmFsbGJhY2tUaW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBpRnJhbWVdIEZhbGxiYWNrIHRpbWVvdXQgdHJpZ2dlcmVkLiBUaW1lb3V0IElEOiAke2ZhbGxiYWNrVGltZW91dH0uIHJlY2VpdmVkSG9zdG5hbWU6ICR7cmVjZWl2ZWRIb3N0bmFtZX1gXG4gICAgICApO1xuICAgICAgZmFsbGJhY2tUaW1lb3V0ID0gbnVsbDsgLy8gQ2xlYXIgdGhlIHRpbWVvdXQgSURcbiAgICAgIGlmICghcmVjZWl2ZWRIb3N0bmFtZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYFtDb250ZW50U2NyaXB0IGlGcmFtZV0gRGlkIG5vdCByZWNlaXZlIGhvc3RuYW1lIGZyb20gdG9wIGFmdGVyICR7VElNRU9VVF9EVVJBVElPTn1tcy4gVXNpbmcgb3duIGhvc3RuYW1lOiAke2lmcmFtZU93bkhvc3RuYW1lfS4gUmVtb3ZpbmcgcmVzcG9uc2UgbGlzdGVuZXIuYFxuICAgICAgICApO1xuICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgcmVzcG9uc2VMaXN0ZW5lcik7IC8vIENsZWFuIHVwIGxpc3RlbmVyXG4gICAgICAgIGNsZWFudXBGdW5jdGlvbnMgPSBjbGVhbnVwRnVuY3Rpb25zLmZpbHRlcigoZikgPT4gZiAhPT0gcmVtb3ZlUmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgICAgIGluaXRpYWxpemVTY3JpcHQoaWZyYW1lT3duSG9zdG5hbWUpOyAvLyBJbml0aWFsaXplIHdpdGggb3duIGhvc3RuYW1lIGFzIGZhbGxiYWNrXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBgW0NvbnRlbnRTY3JpcHQgaUZyYW1lXSBGYWxsYmFjayB0aW1lb3V0IHRyaWdnZXJlZCwgYnV0IGhvc3RuYW1lIHdhcyBhbHJlYWR5IHJlY2VpdmVkLiBObyBhY3Rpb24gbmVlZGVkLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9LCBUSU1FT1VUX0RVUkFUSU9OKTtcbiAgICBjbGVhbnVwRnVuY3Rpb25zLnB1c2goKCkgPT4ge1xuICAgICAgaWYgKGZhbGxiYWNrVGltZW91dCkge1xuICAgICAgICBjbGVhclRpbWVvdXQoZmFsbGJhY2tUaW1lb3V0KTtcbiAgICAgICAgZmFsbGJhY2tUaW1lb3V0ID0gbnVsbDtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gKCkgPT4gY2xlYW51cEZ1bmN0aW9ucy5mb3JFYWNoKChmKSA9PiBmKCkpO1xufVxuIiwiaW1wb3J0IHsgTWVkaWFQcm9jZXNzb3IgfSBmcm9tIFwiLi4vbWVkaWEtcHJvY2Vzc29yXCI7XG5pbXBvcnQgeyBTZXR0aW5nc0hhbmRsZXIgfSBmcm9tIFwiLi4vc2V0dGluZ3MtaGFuZGxlclwiO1xuaW1wb3J0IHsgaXNTZXR0aW5nc0Rpc2FibGVkLCBkZWJ1Z0xvZyB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG4vKipcbiAqIENyZWF0ZXMgc3RhYmxlIGV2ZW50IGhhbmRsZXJzIGZvciBtZWRpYSBlbGVtZW50cyB0byBwcmV2ZW50IGxpc3RlbmVyIGxlYWtzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTWVkaWFFdmVudEhhbmRsZXJzKFxuICBzZXR0aW5nc0hhbmRsZXI6IFNldHRpbmdzSGFuZGxlcixcbiAgbWVkaWFQcm9jZXNzb3I6IE1lZGlhUHJvY2Vzc29yXG4pIHtcbiAgLy8gVHJhY2sgd2hpY2ggZWxlbWVudHMgaGF2ZSBoYWQgbGlzdGVuZXJzIGFkZGVkIHRvIGF2b2lkIGR1cGxpY2F0ZXNcbiAgY29uc3QgZWxlbWVudHNXaXRoTGlzdGVuZXJzID0gbmV3IFdlYWtTZXQ8SFRNTE1lZGlhRWxlbWVudD4oKTtcblxuICBjb25zdCBhcHBseVNldHRpbmdzVG9TaW5nbGVFbGVtZW50ID0gYXN5bmMgKGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQpID0+IHtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudCBjYWxsZWQgZm9yICR7XG4gICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgfWBcbiAgICApO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBzZXR0aW5nc0hhbmRsZXIuZW5zdXJlSW5pdGlhbGl6ZWQoKTtcbiAgICAgIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzSGFuZGxlci5nZXRDdXJyZW50U2V0dGluZ3MoKTtcbiAgICAgIGNvbnN0IG5lZWRzUHJvY2Vzc2luZyA9IHNldHRpbmdzSGFuZGxlci5uZWVkc0F1ZGlvUHJvY2Vzc2luZygpO1xuXG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IERFQlVHXSBBcHBseWluZyBzZXR0aW5ncyB0byBzaW5nbGUgZWxlbWVudCAke1xuICAgICAgICAgIGVsZW1lbnQuc3JjIHx8IFwiKG5vIHNyYylcIlxuICAgICAgICB9OmBcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IGlzRGlzYWJsZWQgPSBpc1NldHRpbmdzRGlzYWJsZWQoY3VycmVudFNldHRpbmdzKTtcblxuICAgICAgLy8gQXBwbHkgaW1tZWRpYXRlIHNldHRpbmdzIChzcGVlZCwgdm9sdW1lKVxuICAgICAgbWVkaWFQcm9jZXNzb3IuYXBwbHlTZXR0aW5nc0ltbWVkaWF0ZWx5KFxuICAgICAgICBbZWxlbWVudF0sXG4gICAgICAgIGN1cnJlbnRTZXR0aW5ncyxcbiAgICAgICAgaXNEaXNhYmxlZFxuICAgICAgKTtcblxuICAgICAgLy8gQXBwbHkgYXVkaW8gZWZmZWN0cyBpZiBuZWVkZWRcbiAgICAgIGlmIChuZWVkc1Byb2Nlc3NpbmcpIHtcbiAgICAgICAgaWYgKG1lZGlhUHJvY2Vzc29yLmNhbkFwcGx5QXVkaW9FZmZlY3RzKCkpIHtcbiAgICAgICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5wcm9jZXNzTWVkaWFFbGVtZW50cyhcbiAgICAgICAgICAgIFtlbGVtZW50XSxcbiAgICAgICAgICAgIGN1cnJlbnRTZXR0aW5ncyxcbiAgICAgICAgICAgIG5lZWRzUHJvY2Vzc2luZ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IuYXR0ZW1wdENvbnRleHRSZXN1bWUoKTtcbiAgICAgICAgICBpZiAobWVkaWFQcm9jZXNzb3IuY2FuQXBwbHlBdWRpb0VmZmVjdHMoKSkge1xuICAgICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IucHJvY2Vzc01lZGlhRWxlbWVudHMoXG4gICAgICAgICAgICAgIFtlbGVtZW50XSxcbiAgICAgICAgICAgICAgY3VycmVudFNldHRpbmdzLFxuICAgICAgICAgICAgICBuZWVkc1Byb2Nlc3NpbmdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gRXJyb3IgYXBwbHlpbmcgc2V0dGluZ3MgdG8gc2luZ2xlIGVsZW1lbnQgJHtcbiAgICAgICAgICBlbGVtZW50LnNyYyB8fCBcIihubyBzcmMpXCJcbiAgICAgICAgfTpgXG4gICAgICApO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBvbkxvYWRlZE1ldGFkYXRhID0gKGV2ZW50OiBFdmVudCkgPT4ge1xuICAgIGFwcGx5U2V0dGluZ3NUb1NpbmdsZUVsZW1lbnQoZXZlbnQudGFyZ2V0IGFzIEhUTUxNZWRpYUVsZW1lbnQpO1xuICB9O1xuICBjb25zdCBvbkNhblBsYXkgPSAoZXZlbnQ6IEV2ZW50KSA9PiB7XG4gICAgYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudChldmVudC50YXJnZXQgYXMgSFRNTE1lZGlhRWxlbWVudCk7XG4gIH07XG4gIGNvbnN0IG9uTG9hZFN0YXJ0ID0gKGV2ZW50OiBFdmVudCkgPT4ge1xuICAgIGFwcGx5U2V0dGluZ3NUb1NpbmdsZUVsZW1lbnQoZXZlbnQudGFyZ2V0IGFzIEhUTUxNZWRpYUVsZW1lbnQpO1xuICB9O1xuXG4gIGNvbnN0IHJlc3VtZUNvbnRleHRIYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBFdmVudCkgPT4ge1xuICAgIGRlYnVnTG9nKFxuICAgICAgXCJDb250ZW50OiBNZWRpYSBpbnRlcmFjdGlvbiBkZXRlY3RlZCwgYXR0ZW1wdGluZyB0byByZXN1bWUgQXVkaW9Db250ZXh0LlwiXG4gICAgKTtcbiAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5hdHRlbXB0Q29udGV4dFJlc3VtZSgpO1xuICAgIGNvbnN0IHRhcmdldEVsZW1lbnQgPSBldmVudC50YXJnZXQgYXMgSFRNTE1lZGlhRWxlbWVudDtcbiAgICBpZiAodGFyZ2V0RWxlbWVudCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgc2V0dGluZ3NIYW5kbGVyLmVuc3VyZUluaXRpYWxpemVkKCk7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzSGFuZGxlci5nZXRDdXJyZW50U2V0dGluZ3MoKTtcbiAgICAgICAgY29uc3QgbmVlZHNQcm9jZXNzaW5nID0gc2V0dGluZ3NIYW5kbGVyLm5lZWRzQXVkaW9Qcm9jZXNzaW5nKCk7XG4gICAgICAgIGF3YWl0IG1lZGlhUHJvY2Vzc29yLnByb2Nlc3NNZWRpYUVsZW1lbnRzKFxuICAgICAgICAgIFt0YXJnZXRFbGVtZW50XSxcbiAgICAgICAgICBjdXJyZW50U2V0dGluZ3MsXG4gICAgICAgICAgbmVlZHNQcm9jZXNzaW5nXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgIGBDb250ZW50OiBFcnJvciBhcHBseWluZyBhdWRpbyBlZmZlY3RzIGFmdGVyIGNvbnRleHQgcmVzdW1lOmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJzKGVsZW1lbnQ6IEhUTUxNZWRpYUVsZW1lbnQpIHtcbiAgICBpZiAoIWVsZW1lbnRzV2l0aExpc3RlbmVycy5oYXMoZWxlbWVudCkpIHtcbiAgICAgIGVsZW1lbnRzV2l0aExpc3RlbmVycy5hZGQoZWxlbWVudCk7XG4gICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJsb2FkZWRtZXRhZGF0YVwiLCBvbkxvYWRlZE1ldGFkYXRhKTtcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNhbnBsYXlcIiwgb25DYW5QbGF5KTtcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRzdGFydFwiLCBvbkxvYWRTdGFydCk7XG4gICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJwbGF5XCIsIHJlc3VtZUNvbnRleHRIYW5kbGVyIGFzIEV2ZW50TGlzdGVuZXIpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYXBwbHlTZXR0aW5nc1RvU2luZ2xlRWxlbWVudCxcbiAgICBhdHRhY2hMaXN0ZW5lcnMsXG4gICAgcmVzdW1lQ29udGV4dEhhbmRsZXIsXG4gIH07XG59XG4iLCJpbXBvcnQgeyBNZWRpYVByb2Nlc3NvciB9IGZyb20gXCIuLi9tZWRpYS1wcm9jZXNzb3JcIjtcbmltcG9ydCB7IFNldHRpbmdzSGFuZGxlciB9IGZyb20gXCIuLi9zZXR0aW5ncy1oYW5kbGVyXCI7XG5pbXBvcnQgeyBNZXNzYWdlVHlwZSwgaXNTZXR0aW5nc0Rpc2FibGVkLCBkZWJ1Z0xvZyB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG4vKipcbiAqIEhhbmRsZXMgVVBEQVRFX1NFVFRJTkdTIG1lc3NhZ2VzIGZyb20gYmFja2dyb3VuZC9wb3B1cC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1lc3NhZ2VIYW5kbGVyKFxuICBzZXR0aW5nc0hhbmRsZXI6IFNldHRpbmdzSGFuZGxlcixcbiAgbWVkaWFQcm9jZXNzb3I6IE1lZGlhUHJvY2Vzc29yXG4pIHtcbiAgcmV0dXJuIChcbiAgICBtZXNzYWdlOiBNZXNzYWdlVHlwZSxcbiAgICBzZW5kZXI6IGNocm9tZS5ydW50aW1lLk1lc3NhZ2VTZW5kZXIsXG4gICAgc2VuZFJlc3BvbnNlOiAocmVzcG9uc2U/OiBhbnkpID0+IHZvaWRcbiAgKSA9PiB7XG4gICAgZGVidWdMb2coXG4gICAgICBcIltDb250ZW50U2NyaXB0IExpc3RlbmVyXSBSZWNlaXZlZCBtZXNzYWdlOlwiLFxuICAgICAgSlNPTi5zdHJpbmdpZnkobWVzc2FnZSlcbiAgICApO1xuICAgIGlmIChtZXNzYWdlLnR5cGUgPT09IFwiVVBEQVRFX1NFVFRJTkdTXCIpIHtcbiAgICAgIGRlYnVnTG9nKFxuICAgICAgICBcIltDb250ZW50U2NyaXB0IExpc3RlbmVyXSBQcm9jZXNzaW5nIFVQREFURV9TRVRUSU5HUyBmcm9tIGJhY2tncm91bmQvcG9wdXBcIlxuICAgICAgKTtcbiAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgc2V0dGluZ3NIYW5kbGVyLmVuc3VyZUluaXRpYWxpemVkKCk7XG4gICAgICAgICAgc2V0dGluZ3NIYW5kbGVyLnVwZGF0ZVNldHRpbmdzKG1lc3NhZ2Uuc2V0dGluZ3MpO1xuXG4gICAgICAgICAgY29uc3QgbmV3U2V0dGluZ3MgPSBzZXR0aW5nc0hhbmRsZXIuZ2V0Q3VycmVudFNldHRpbmdzKCk7XG4gICAgICAgICAgY29uc3QgbmVlZHNQcm9jZXNzaW5nTm93ID0gc2V0dGluZ3NIYW5kbGVyLm5lZWRzQXVkaW9Qcm9jZXNzaW5nKCk7XG5cbiAgICAgICAgICBjb25zdCBtYW5hZ2VkTWVkaWFFbGVtZW50cyA9XG4gICAgICAgICAgICBtZWRpYVByb2Nlc3Nvci5nZXRNYW5hZ2VkTWVkaWFFbGVtZW50cygpO1xuICAgICAgICAgIGNvbnN0IGlzRGlzYWJsZWQgPSBpc1NldHRpbmdzRGlzYWJsZWQobmV3U2V0dGluZ3MpO1xuXG4gICAgICAgICAgaWYgKG1hbmFnZWRNZWRpYUVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIG1lZGlhUHJvY2Vzc29yLmFwcGx5U2V0dGluZ3NJbW1lZGlhdGVseShcbiAgICAgICAgICAgICAgbWFuYWdlZE1lZGlhRWxlbWVudHMsXG4gICAgICAgICAgICAgIG5ld1NldHRpbmdzLFxuICAgICAgICAgICAgICBpc0Rpc2FibGVkXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChuZWVkc1Byb2Nlc3NpbmdOb3cpIHtcbiAgICAgICAgICAgIGlmIChtZWRpYVByb2Nlc3Nvci5jYW5BcHBseUF1ZGlvRWZmZWN0cygpKSB7XG4gICAgICAgICAgICAgIGlmIChtYW5hZ2VkTWVkaWFFbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IucHJvY2Vzc01lZGlhRWxlbWVudHMoXG4gICAgICAgICAgICAgICAgICBtYW5hZ2VkTWVkaWFFbGVtZW50cyxcbiAgICAgICAgICAgICAgICAgIG5ld1NldHRpbmdzLFxuICAgICAgICAgICAgICAgICAgbmVlZHNQcm9jZXNzaW5nTm93XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmcmVzaFNjYW5FbGVtZW50cyA9IG1lZGlhUHJvY2Vzc29yLmZpbmRNZWRpYUVsZW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgaWYgKGZyZXNoU2NhbkVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgIG1lZGlhUHJvY2Vzc29yLmFwcGx5U2V0dGluZ3NJbW1lZGlhdGVseShcbiAgICAgICAgICAgICAgICAgICAgZnJlc2hTY2FuRWxlbWVudHMsXG4gICAgICAgICAgICAgICAgICAgIG5ld1NldHRpbmdzLFxuICAgICAgICAgICAgICAgICAgICBpc0Rpc2FibGVkXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgaWYgKCFpc0Rpc2FibGVkICYmIG5lZWRzUHJvY2Vzc2luZ05vdykge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5wcm9jZXNzTWVkaWFFbGVtZW50cyhcbiAgICAgICAgICAgICAgICAgICAgICBmcmVzaFNjYW5FbGVtZW50cyxcbiAgICAgICAgICAgICAgICAgICAgICBuZXdTZXR0aW5ncyxcbiAgICAgICAgICAgICAgICAgICAgICBuZWVkc1Byb2Nlc3NpbmdOb3dcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKG1hbmFnZWRNZWRpYUVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IucHJvY2Vzc01lZGlhRWxlbWVudHMoXG4gICAgICAgICAgICAgICAgbWFuYWdlZE1lZGlhRWxlbWVudHMsXG4gICAgICAgICAgICAgICAgbmV3U2V0dGluZ3MsXG4gICAgICAgICAgICAgICAgbmVlZHNQcm9jZXNzaW5nTm93XG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjb25zdCBmcmVzaFNjYW5FbGVtZW50cyA9IG1lZGlhUHJvY2Vzc29yLmZpbmRNZWRpYUVsZW1lbnRzKCk7XG4gICAgICAgICAgICAgIGlmIChmcmVzaFNjYW5FbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgbWVkaWFQcm9jZXNzb3IucHJvY2Vzc01lZGlhRWxlbWVudHMoXG4gICAgICAgICAgICAgICAgICBmcmVzaFNjYW5FbGVtZW50cyxcbiAgICAgICAgICAgICAgICAgIG5ld1NldHRpbmdzLFxuICAgICAgICAgICAgICAgICAgbmVlZHNQcm9jZXNzaW5nTm93XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgXCJDb250ZW50OiBFcnJvciBkdXJpbmcgVVBEQVRFX1NFVFRJTkdTIHByb2Nlc3Npbmc6XCIsXG4gICAgICAgICAgICBlcnJvclxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pKCk7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IE1lZGlhUHJvY2Vzc29yIH0gZnJvbSBcIi4uL21lZGlhLXByb2Nlc3NvclwiO1xuaW1wb3J0IHsgU2V0dGluZ3NIYW5kbGVyIH0gZnJvbSBcIi4uL3NldHRpbmdzLWhhbmRsZXJcIjtcbmltcG9ydCB7IGlzU2V0dGluZ3NEaXNhYmxlZCwgZGVidWdMb2cgfSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuLyoqXG4gKiBTZXRzIHVwIERPTSBsaWZlY3ljbGUgb2JzZXJ2ZXJzIGFuZCBpbml0aWFsIHNldHRpbmdzIGFwcGxpY2F0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBEb21MaWZlY3ljbGUoXG4gIHNldHRpbmdzSGFuZGxlcjogU2V0dGluZ3NIYW5kbGVyLFxuICBtZWRpYVByb2Nlc3NvcjogTWVkaWFQcm9jZXNzb3IsXG4gIHByb2Nlc3NNZWRpYTogKCkgPT4gUHJvbWlzZTxib29sZWFuPlxuKTogKCgpID0+IHZvaWQpW10ge1xuICBjb25zdCBjbGVhbnVwRnVuY3Rpb25zOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG4gIC8vIEFwcGx5IHNldHRpbmdzIGltbWVkaWF0ZWx5IGFmdGVyIERPTUNvbnRlbnRMb2FkZWQgb3IgaWYgRE9NIGlzIGFscmVhZHkgcmVhZHlcbiAgY29uc3QgYXBwbHlJbml0aWFsU2V0dGluZ3MgPSBhc3luYyAoKSA9PiB7XG4gICAgZGVidWdMb2coXG4gICAgICBgW0NvbnRlbnRTY3JpcHQgREVCVUddIEFwcGx5aW5nIGluaXRpYWwgc2V0dGluZ3MgZm9yICR7d2luZG93LmxvY2F0aW9uLmhvc3RuYW1lfWBcbiAgICApO1xuICAgIGF3YWl0IHByb2Nlc3NNZWRpYSgpO1xuICB9O1xuXG4gIGNvbnN0IGRvbUNvbnRlbnRMb2FkZWRMaXN0ZW5lciA9ICgpID0+IHtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gRE9NQ29udGVudExvYWRlZCBldmVudCBmb3IgJHt3aW5kb3cubG9jYXRpb24uaG9zdG5hbWV9YFxuICAgICk7XG4gICAgYXBwbHlJbml0aWFsU2V0dGluZ3MoKTtcbiAgfTtcblxuICBpZiAoZG9jdW1lbnQucmVhZHlTdGF0ZSA9PT0gXCJsb2FkaW5nXCIpIHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiRE9NQ29udGVudExvYWRlZFwiLCBkb21Db250ZW50TG9hZGVkTGlzdGVuZXIpO1xuICAgIGNsZWFudXBGdW5jdGlvbnMucHVzaCgoKSA9PlxuICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIkRPTUNvbnRlbnRMb2FkZWRcIiwgZG9tQ29udGVudExvYWRlZExpc3RlbmVyKVxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgYXBwbHlJbml0aWFsU2V0dGluZ3MoKTtcbiAgfVxuXG4gIC8vIFdhdGNoIGZvciBkeW5hbWljIGNoYW5nZXNcbiAgY29uc3QgbWVkaWFPYnNlcnZlciA9IE1lZGlhUHJvY2Vzc29yLnNldHVwTWVkaWFPYnNlcnZlcihcbiAgICBhc3luYyAoYWRkZWRFbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiB7XG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0XSBQcm9jZXNzaW5nICR7YWRkZWRFbGVtZW50cy5sZW5ndGh9IG5ld2x5IGFkZGVkIG1lZGlhIGVsZW1lbnRzLmBcbiAgICAgICk7XG4gICAgICBhd2FpdCBzZXR0aW5nc0hhbmRsZXIuZW5zdXJlSW5pdGlhbGl6ZWQoKTtcbiAgICAgIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzSGFuZGxlci5nZXRDdXJyZW50U2V0dGluZ3MoKTtcbiAgICAgIGNvbnN0IG5lZWRzUHJvY2Vzc2luZyA9IHNldHRpbmdzSGFuZGxlci5uZWVkc0F1ZGlvUHJvY2Vzc2luZygpO1xuXG4gICAgICBhd2FpdCBtZWRpYVByb2Nlc3Nvci5wcm9jZXNzTWVkaWFFbGVtZW50cyhcbiAgICAgICAgYWRkZWRFbGVtZW50cyxcbiAgICAgICAgY3VycmVudFNldHRpbmdzLFxuICAgICAgICBuZWVkc1Byb2Nlc3NpbmdcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IGlzRGlzYWJsZWQgPSBpc1NldHRpbmdzRGlzYWJsZWQoY3VycmVudFNldHRpbmdzKTtcbiAgICAgIG1lZGlhUHJvY2Vzc29yLmFwcGx5U2V0dGluZ3NJbW1lZGlhdGVseShcbiAgICAgICAgYWRkZWRFbGVtZW50cyxcbiAgICAgICAgY3VycmVudFNldHRpbmdzLFxuICAgICAgICBpc0Rpc2FibGVkXG4gICAgICApO1xuICAgIH0sXG4gICAgKHJlbW92ZWRFbGVtZW50czogSFRNTE1lZGlhRWxlbWVudFtdKSA9PiB7XG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0XSBDbGVhbmluZyB1cCAke3JlbW92ZWRFbGVtZW50cy5sZW5ndGh9IHJlbW92ZWQgbWVkaWEgZWxlbWVudHMuYFxuICAgICAgKTtcbiAgICAgIHJlbW92ZWRFbGVtZW50cy5mb3JFYWNoKChlbGVtZW50OiBIVE1MTWVkaWFFbGVtZW50KSA9PiB7XG4gICAgICAgIG1lZGlhUHJvY2Vzc29yLmF1ZGlvUHJvY2Vzc29yLmRpc2Nvbm5lY3RFbGVtZW50Tm9kZXMoZWxlbWVudCk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVtYWluaW5nTWFuYWdlZEVsZW1lbnRzID0gbWVkaWFQcm9jZXNzb3IuZ2V0TWFuYWdlZE1lZGlhRWxlbWVudHMoKTtcbiAgICAgIGlmIChcbiAgICAgICAgcmVtYWluaW5nTWFuYWdlZEVsZW1lbnRzLmxlbmd0aCA9PT0gMCAmJlxuICAgICAgICAhc2V0dGluZ3NIYW5kbGVyLm5lZWRzQXVkaW9Qcm9jZXNzaW5nKClcbiAgICAgICkge1xuICAgICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgICBcIltDb250ZW50U2NyaXB0XSBObyBtYW5hZ2VkIG1lZGlhIGVsZW1lbnRzIGxlZnQuIENsZWFuaW5nIHVwIEF1ZGlvUHJvY2Vzc29yLlwiXG4gICAgICAgICk7XG4gICAgICAgIG1lZGlhUHJvY2Vzc29yLmF1ZGlvUHJvY2Vzc29yLmNsZWFudXAoKTtcbiAgICAgIH1cbiAgICB9XG4gICk7XG4gIGNsZWFudXBGdW5jdGlvbnMucHVzaCgoKSA9PiBtZWRpYU9ic2VydmVyLmRpc2Nvbm5lY3QoKSk7XG5cbiAgLy8gRW5zdXJlIEF1ZGlvQ29udGV4dCBpcyBjbG9zZWQgd2hlbiB0aGUgcGFnZSBpcyB1bmxvYWRlZFxuICBjb25zdCBiZWZvcmVVbmxvYWRMaXN0ZW5lciA9ICgpID0+IHtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIFwiW0NvbnRlbnRTY3JpcHRdIFBhZ2UgaXMgdW5sb2FkaW5nLiBQZXJmb3JtaW5nIGZpbmFsIEF1ZGlvUHJvY2Vzc29yIGNsZWFudXAuXCJcbiAgICApO1xuICAgIG1lZGlhUHJvY2Vzc29yLmF1ZGlvUHJvY2Vzc29yLmNsZWFudXAoKTtcbiAgfTtcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJiZWZvcmV1bmxvYWRcIiwgYmVmb3JlVW5sb2FkTGlzdGVuZXIpO1xuICBjbGVhbnVwRnVuY3Rpb25zLnB1c2goKCkgPT5cbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImJlZm9yZXVubG9hZFwiLCBiZWZvcmVVbmxvYWRMaXN0ZW5lcilcbiAgKTtcblxuICByZXR1cm4gY2xlYW51cEZ1bmN0aW9ucztcbn1cbiIsImltcG9ydCB7IE1lZGlhUHJvY2Vzc29yIH0gZnJvbSBcIi4vbWVkaWEtcHJvY2Vzc29yXCI7XG5pbXBvcnQgeyBTZXR0aW5nc0hhbmRsZXIgfSBmcm9tIFwiLi9zZXR0aW5ncy1oYW5kbGVyXCI7XG5pbXBvcnQgeyBNZXNzYWdlVHlwZSwgaXNTZXR0aW5nc0Rpc2FibGVkICwgZGVidWdMb2cgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgY3JlYXRlTWVkaWFFdmVudEhhbmRsZXJzIH0gZnJvbSBcIi4vY29udGVudC1zY3JpcHQvbWVkaWEtZXZlbnRzXCI7XG5pbXBvcnQgeyBjcmVhdGVNZXNzYWdlSGFuZGxlciB9IGZyb20gXCIuL2NvbnRlbnQtc2NyaXB0L21lc3NhZ2UtaGFuZGxlclwiO1xuaW1wb3J0IHsgc2V0dXBEb21MaWZlY3ljbGUgfSBmcm9tIFwiLi9jb250ZW50LXNjcmlwdC9kb20tbGlmZWN5Y2xlXCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBpbml0aWFsaXplQ29udGVudFNjcmlwdChcbiAgc2V0dGluZ3NIYW5kbGVyOiBTZXR0aW5nc0hhbmRsZXIsXG4gIG1lZGlhUHJvY2Vzc29yOiBNZWRpYVByb2Nlc3NvcixcbiAgaG9zdG5hbWU6IHN0cmluZ1xuKTogUHJvbWlzZTwoKSA9PiB2b2lkPiB7XG4gIGRlYnVnTG9nKGBbQ29udGVudFNjcmlwdF0gSW5pdGlhbGl6aW5nIHNjcmlwdCBmb3IgaG9zdG5hbWU6ICR7aG9zdG5hbWV9YCk7XG4gIHNldHRpbmdzSGFuZGxlci5pbml0aWFsaXplKGhvc3RuYW1lKTtcblxuICBjb25zdCBjbGVhbnVwRnVuY3Rpb25zOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG4gIC8vIENyZWF0ZSBzdGFibGUgZXZlbnQgaGFuZGxlcnNcbiAgY29uc3QgeyBhcHBseVNldHRpbmdzVG9TaW5nbGVFbGVtZW50LCBhdHRhY2hMaXN0ZW5lcnMgfSA9XG4gICAgY3JlYXRlTWVkaWFFdmVudEhhbmRsZXJzKHNldHRpbmdzSGFuZGxlciwgbWVkaWFQcm9jZXNzb3IpO1xuXG4gIC8vIFByb2Nlc3MgbWVkaWEgd2l0aCBjdXJyZW50IHNldHRpbmdzXG4gIGNvbnN0IHByb2Nlc3NNZWRpYSA9IGFzeW5jICgpID0+IHtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIGBbQ29udGVudFNjcmlwdCBERUJVR10gcHJvY2Vzc01lZGlhIGNhbGxlZCBmb3IgJHt3aW5kb3cubG9jYXRpb24uaG9zdG5hbWV9YFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUudGltZShcImVuc3VyZUluaXRpYWxpemVkXCIpO1xuICAgICAgYXdhaXQgc2V0dGluZ3NIYW5kbGVyLmVuc3VyZUluaXRpYWxpemVkKCk7XG4gICAgICBjb25zb2xlLnRpbWVFbmQoXCJlbnN1cmVJbml0aWFsaXplZFwiKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS50aW1lRW5kKFwiZW5zdXJlSW5pdGlhbGl6ZWRcIik7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBgW0NvbnRlbnRTY3JpcHQgREVCVUddIEVycm9yIGVuc3VyaW5nIHNldHRpbmdzIGluaXRpYWxpemVkOmBcbiAgICAgICk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzSGFuZGxlci5nZXRDdXJyZW50U2V0dGluZ3MoKTtcbiAgICAgIGNvbnN0IGlzRGlzYWJsZWQgPSBpc1NldHRpbmdzRGlzYWJsZWQoY3VycmVudFNldHRpbmdzKTtcblxuICAgICAgY29uc3QgbWVkaWFFbGVtZW50cyA9IG1lZGlhUHJvY2Vzc29yLmZpbmRNZWRpYUVsZW1lbnRzKCk7XG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IERFQlVHXSBGb3VuZCAke21lZGlhRWxlbWVudHMubGVuZ3RofSBtZWRpYSBlbGVtZW50c2BcbiAgICAgICk7XG5cbiAgICAgIG1lZGlhRWxlbWVudHMuZm9yRWFjaCgoZWxlbWVudCkgPT4ge1xuICAgICAgICBhdHRhY2hMaXN0ZW5lcnMoZWxlbWVudCk7XG4gICAgICAgIGlmICghaXNEaXNhYmxlZCkge1xuICAgICAgICAgIGFwcGx5U2V0dGluZ3NUb1NpbmdsZUVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKHByb2Nlc3NpbmdFcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYFtDb250ZW50U2NyaXB0IERFQlVHXSBFcnJvciBkdXJpbmcgbWVkaWEgcHJvY2Vzc2luZyBzdGVwczpgXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvLyBTZXQgdXAgbWVzc2FnZSBsaXN0ZW5lclxuICBpZiAoXG4gICAgdHlwZW9mIGNocm9tZSAhPT0gXCJ1bmRlZmluZWRcIiAmJlxuICAgIGNocm9tZS5ydW50aW1lICYmXG4gICAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlXG4gICkge1xuICAgIGNvbnN0IG1lc3NhZ2VIYW5kbGVyID0gY3JlYXRlTWVzc2FnZUhhbmRsZXIoc2V0dGluZ3NIYW5kbGVyLCBtZWRpYVByb2Nlc3Nvcik7XG4gICAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKG1lc3NhZ2VIYW5kbGVyKTtcbiAgICBjbGVhbnVwRnVuY3Rpb25zLnB1c2goKCkgPT5cbiAgICAgIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5yZW1vdmVMaXN0ZW5lcihtZXNzYWdlSGFuZGxlcilcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUuZGVidWcoXG4gICAgICBcIltDb250ZW50U2NyaXB0XSBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2Ugbm90IGF2YWlsYWJsZSAtIHNraXBwaW5nIG1lc3NhZ2UgbGlzdGVuZXIgc2V0dXBcIlxuICAgICk7XG4gIH1cblxuICAvLyBTZXQgdXAgRE9NIGxpZmVjeWNsZSAoaW5pdGlhbCBzZXR0aW5ncywgbXV0YXRpb24gb2JzZXJ2ZXIsIGJlZm9yZXVubG9hZClcbiAgY29uc3QgZG9tQ2xlYW51cCA9IHNldHVwRG9tTGlmZWN5Y2xlKFxuICAgIHNldHRpbmdzSGFuZGxlcixcbiAgICBtZWRpYVByb2Nlc3NvcixcbiAgICBwcm9jZXNzTWVkaWFcbiAgKTtcbiAgY2xlYW51cEZ1bmN0aW9ucy5wdXNoKC4uLmRvbUNsZWFudXApO1xuXG4gIHJldHVybiAoKSA9PiB7XG4gICAgZGVidWdMb2coXCJbQ29udGVudFNjcmlwdF0gUnVubmluZyBjbGVhbnVwIGZ1bmN0aW9ucy5cIik7XG4gICAgY2xlYW51cEZ1bmN0aW9ucy5mb3JFYWNoKChjbGVhbnVwKSA9PiBjbGVhbnVwKCkpO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgZGVmaW5lQ29udGVudFNjcmlwdCB9IGZyb20gXCJ3eHQvc2FuZGJveFwiO1xuaW1wb3J0IHsgTWVkaWFQcm9jZXNzb3IgfSBmcm9tIFwiLi8uLi9zcmMvbWVkaWEtcHJvY2Vzc29yXCI7XG5pbXBvcnQgeyBTZXR0aW5nc0hhbmRsZXIgfSBmcm9tIFwiLi4vc3JjL3NldHRpbmdzLWhhbmRsZXJcIjtcbmltcG9ydCB7IHNldHVwSG9zdG5hbWVEZXRlY3Rpb24gfSBmcm9tIFwiLi4vc3JjL2lmcmFtZS1ob3N0bmFtZS1oYW5kbGVyXCI7XG5pbXBvcnQgeyBpbml0aWFsaXplQ29udGVudFNjcmlwdCB9IGZyb20gXCIuLi9zcmMvY29udGVudC1zY3JpcHQtaW5pdFwiO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tIFwiLi4vc3JjL3R5cGVzXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbnRlbnRTY3JpcHQoe1xuICBtYXRjaGVzOiBbXCJodHRwOi8vKi8qXCIsIFwiaHR0cHM6Ly8qLypcIl0sXG4gIGFsbEZyYW1lczogdHJ1ZSxcbiAgcnVuQXQ6IFwiZG9jdW1lbnRfaWRsZVwiLFxuICBtYWluOiBhc3luYyAoKSA9PiB7XG4gICAgLy8gR2xvYmFsIHNhZmV0eSBjaGVjayBmb3IgQ2hyb21lIGV4dGVuc2lvbiBBUElzXG4gICAgaWYgKHR5cGVvZiBjaHJvbWUgPT09ICd1bmRlZmluZWQnIHx8IFxuICAgICAgICB0eXBlb2YgY2hyb21lLnJ1bnRpbWUgPT09ICd1bmRlZmluZWQnIHx8IFxuICAgICAgICB0eXBlb2YgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc29sZS5lcnJvcignQ2hyb21lIGV4dGVuc2lvbiBBUElzIGFyZSBub3QgYXZhaWxhYmxlLiBTa2lwcGluZyBjb250ZW50IHNjcmlwdCBleGVjdXRpb24uJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZGVidWdMb2coXG4gICAgICBcIkNvbnRlbnQ6IFNjcmlwdCBzdGFydGluZyAtIFRoaXMgbG9nIHNob3VsZCBhbHdheXMgYXBwZWFyXCIsXG4gICAgICB3aW5kb3cubG9jYXRpb24uaHJlZlxuICAgICk7XG5cbiAgICAvLyBJbml0aWFsaXplIGNvcmUgY29tcG9uZW50c1xuICAgIGNvbnN0IHNldHRpbmdzSGFuZGxlciA9IG5ldyBTZXR0aW5nc0hhbmRsZXIoKTtcbiAgICBjb25zdCBtZWRpYVByb2Nlc3NvciA9IG5ldyBNZWRpYVByb2Nlc3NvcigpO1xuXG4gICAgbGV0IGhvc3RuYW1lRGV0ZWN0aW9uQ2xlYW51cDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IGNvbnRlbnRTY3JpcHRDbGVhbnVwOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcblxuICAgIC8vIFN0YXJ0IHRoZSBob3N0bmFtZSBkZXRlY3Rpb24gYW5kIHNjcmlwdCBpbml0aWFsaXphdGlvbiBwcm9jZXNzXG4gICAgaG9zdG5hbWVEZXRlY3Rpb25DbGVhbnVwID0gc2V0dXBIb3N0bmFtZURldGVjdGlvbihhc3luYyAoaG9zdG5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgY29udGVudFNjcmlwdENsZWFudXAgPSBhd2FpdCBpbml0aWFsaXplQ29udGVudFNjcmlwdChzZXR0aW5nc0hhbmRsZXIsIG1lZGlhUHJvY2Vzc29yLCBob3N0bmFtZSk7XG4gICAgfSk7XG5cbiAgICAvLyBBZGQgYSBsaXN0ZW5lciBmb3IgcGFnZSB1bmxvYWQgdG8gcGVyZm9ybSBjbGVhbnVwXG4gICAgY29uc3QgYmVmb3JlVW5sb2FkTGlzdGVuZXIgPSAoKSA9PiB7XG4gICAgICBkZWJ1Z0xvZyhcIltDb250ZW50U2NyaXB0XSBQYWdlIGlzIHVubG9hZGluZy4gUGVyZm9ybWluZyBvdmVyYWxsIGNsZWFudXAuXCIpO1xuICAgICAgaWYgKGhvc3RuYW1lRGV0ZWN0aW9uQ2xlYW51cCkge1xuICAgICAgICBob3N0bmFtZURldGVjdGlvbkNsZWFudXAoKTtcbiAgICAgICAgaG9zdG5hbWVEZXRlY3Rpb25DbGVhbnVwID0gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmIChjb250ZW50U2NyaXB0Q2xlYW51cCkge1xuICAgICAgICBjb250ZW50U2NyaXB0Q2xlYW51cCgpO1xuICAgICAgICBjb250ZW50U2NyaXB0Q2xlYW51cCA9IG51bGw7XG4gICAgICB9XG4gICAgfTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmVmb3JldW5sb2FkJywgYmVmb3JlVW5sb2FkTGlzdGVuZXIpO1xuICB9LFxufSk7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCwgZmFjdG9yeSkge1xuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gXCJmdW5jdGlvblwiICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoXCJ3ZWJleHRlbnNpb24tcG9seWZpbGxcIiwgW1wibW9kdWxlXCJdLCBmYWN0b3J5KTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIGZhY3RvcnkobW9kdWxlKTtcbiAgfSBlbHNlIHtcbiAgICB2YXIgbW9kID0ge1xuICAgICAgZXhwb3J0czoge31cbiAgICB9O1xuICAgIGZhY3RvcnkobW9kKTtcbiAgICBnbG9iYWwuYnJvd3NlciA9IG1vZC5leHBvcnRzO1xuICB9XG59KSh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFRoaXMgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0aGlzLCBmdW5jdGlvbiAobW9kdWxlKSB7XG4gIC8qIHdlYmV4dGVuc2lvbi1wb2x5ZmlsbCAtIHYwLjEyLjAgLSBUdWUgTWF5IDE0IDIwMjQgMTg6MDE6MjkgKi9cbiAgLyogLSotIE1vZGU6IGluZGVudC10YWJzLW1vZGU6IG5pbDsganMtaW5kZW50LWxldmVsOiAyIC0qLSAqL1xuICAvKiB2aW06IHNldCBzdHM9MiBzdz0yIGV0IHR3PTgwOiAqL1xuICAvKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gICAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAgICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy4gKi9cbiAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgaWYgKCEoZ2xvYmFsVGhpcy5jaHJvbWUgJiYgZ2xvYmFsVGhpcy5jaHJvbWUucnVudGltZSAmJiBnbG9iYWxUaGlzLmNocm9tZS5ydW50aW1lLmlkKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlRoaXMgc2NyaXB0IHNob3VsZCBvbmx5IGJlIGxvYWRlZCBpbiBhIGJyb3dzZXIgZXh0ZW5zaW9uLlwiKTtcbiAgfVxuICBpZiAoIShnbG9iYWxUaGlzLmJyb3dzZXIgJiYgZ2xvYmFsVGhpcy5icm93c2VyLnJ1bnRpbWUgJiYgZ2xvYmFsVGhpcy5icm93c2VyLnJ1bnRpbWUuaWQpKSB7XG4gICAgY29uc3QgQ0hST01FX1NFTkRfTUVTU0FHRV9DQUxMQkFDS19OT19SRVNQT05TRV9NRVNTQUdFID0gXCJUaGUgbWVzc2FnZSBwb3J0IGNsb3NlZCBiZWZvcmUgYSByZXNwb25zZSB3YXMgcmVjZWl2ZWQuXCI7XG5cbiAgICAvLyBXcmFwcGluZyB0aGUgYnVsayBvZiB0aGlzIHBvbHlmaWxsIGluIGEgb25lLXRpbWUtdXNlIGZ1bmN0aW9uIGlzIGEgbWlub3JcbiAgICAvLyBvcHRpbWl6YXRpb24gZm9yIEZpcmVmb3guIFNpbmNlIFNwaWRlcm1vbmtleSBkb2VzIG5vdCBmdWxseSBwYXJzZSB0aGVcbiAgICAvLyBjb250ZW50cyBvZiBhIGZ1bmN0aW9uIHVudGlsIHRoZSBmaXJzdCB0aW1lIGl0J3MgY2FsbGVkLCBhbmQgc2luY2UgaXQgd2lsbFxuICAgIC8vIG5ldmVyIGFjdHVhbGx5IG5lZWQgdG8gYmUgY2FsbGVkLCB0aGlzIGFsbG93cyB0aGUgcG9seWZpbGwgdG8gYmUgaW5jbHVkZWRcbiAgICAvLyBpbiBGaXJlZm94IG5lYXJseSBmb3IgZnJlZS5cbiAgICBjb25zdCB3cmFwQVBJcyA9IGV4dGVuc2lvbkFQSXMgPT4ge1xuICAgICAgLy8gTk9URTogYXBpTWV0YWRhdGEgaXMgYXNzb2NpYXRlZCB0byB0aGUgY29udGVudCBvZiB0aGUgYXBpLW1ldGFkYXRhLmpzb24gZmlsZVxuICAgICAgLy8gYXQgYnVpbGQgdGltZSBieSByZXBsYWNpbmcgdGhlIGZvbGxvd2luZyBcImluY2x1ZGVcIiB3aXRoIHRoZSBjb250ZW50IG9mIHRoZVxuICAgICAgLy8gSlNPTiBmaWxlLlxuICAgICAgY29uc3QgYXBpTWV0YWRhdGEgPSB7XG4gICAgICAgIFwiYWxhcm1zXCI6IHtcbiAgICAgICAgICBcImNsZWFyXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiY2xlYXJBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJib29rbWFya3NcIjoge1xuICAgICAgICAgIFwiY3JlYXRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0Q2hpbGRyZW5cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRSZWNlbnRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRTdWJUcmVlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0VHJlZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVUcmVlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2VhcmNoXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwidXBkYXRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYnJvd3NlckFjdGlvblwiOiB7XG4gICAgICAgICAgXCJkaXNhYmxlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZW5hYmxlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QmFkZ2VCYWNrZ3JvdW5kQ29sb3JcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRCYWRnZVRleHRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRQb3B1cFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFRpdGxlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwib3BlblBvcHVwXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0QmFkZ2VCYWNrZ3JvdW5kQ29sb3JcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRCYWRnZVRleHRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRJY29uXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0UG9wdXBcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRUaXRsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImJyb3dzaW5nRGF0YVwiOiB7XG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVDYWNoZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUNvb2tpZXNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVEb3dubG9hZHNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVGb3JtRGF0YVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUhpc3RvcnlcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVMb2NhbFN0b3JhZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVQYXNzd29yZHNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVQbHVnaW5EYXRhXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0dGluZ3NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjb21tYW5kc1wiOiB7XG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjb250ZXh0TWVudXNcIjoge1xuICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlQWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwidXBkYXRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY29va2llc1wiOiB7XG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxDb29raWVTdG9yZXNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXZ0b29sc1wiOiB7XG4gICAgICAgICAgXCJpbnNwZWN0ZWRXaW5kb3dcIjoge1xuICAgICAgICAgICAgXCJldmFsXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyLFxuICAgICAgICAgICAgICBcInNpbmdsZUNhbGxiYWNrQXJnXCI6IGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInBhbmVsc1wiOiB7XG4gICAgICAgICAgICBcImNyZWF0ZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAzLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMyxcbiAgICAgICAgICAgICAgXCJzaW5nbGVDYWxsYmFja0FyZ1wiOiB0cnVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJlbGVtZW50c1wiOiB7XG4gICAgICAgICAgICAgIFwiY3JlYXRlU2lkZWJhclBhbmVcIjoge1xuICAgICAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZG93bmxvYWRzXCI6IHtcbiAgICAgICAgICBcImNhbmNlbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRvd25sb2FkXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZXJhc2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRGaWxlSWNvblwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm9wZW5cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJwYXVzZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUZpbGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZXN1bWVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZWFyY2hcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzaG93XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZXh0ZW5zaW9uXCI6IHtcbiAgICAgICAgICBcImlzQWxsb3dlZEZpbGVTY2hlbWVBY2Nlc3NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJpc0FsbG93ZWRJbmNvZ25pdG9BY2Nlc3NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJoaXN0b3J5XCI6IHtcbiAgICAgICAgICBcImFkZFVybFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRlbGV0ZUFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRlbGV0ZVJhbmdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZGVsZXRlVXJsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0VmlzaXRzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2VhcmNoXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiaTE4blwiOiB7XG4gICAgICAgICAgXCJkZXRlY3RMYW5ndWFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFjY2VwdExhbmd1YWdlc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImlkZW50aXR5XCI6IHtcbiAgICAgICAgICBcImxhdW5jaFdlYkF1dGhGbG93XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiaWRsZVwiOiB7XG4gICAgICAgICAgXCJxdWVyeVN0YXRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwibWFuYWdlbWVudFwiOiB7XG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRTZWxmXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0RW5hYmxlZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVuaW5zdGFsbFNlbGZcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJub3RpZmljYXRpb25zXCI6IHtcbiAgICAgICAgICBcImNsZWFyXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiY3JlYXRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0UGVybWlzc2lvbkxldmVsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwidXBkYXRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicGFnZUFjdGlvblwiOiB7XG4gICAgICAgICAgXCJnZXRQb3B1cFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFRpdGxlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlkZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldEljb25cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRQb3B1cFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFRpdGxlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2hvd1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInBlcm1pc3Npb25zXCI6IHtcbiAgICAgICAgICBcImNvbnRhaW5zXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVxdWVzdFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInJ1bnRpbWVcIjoge1xuICAgICAgICAgIFwiZ2V0QmFja2dyb3VuZFBhZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRQbGF0Zm9ybUluZm9cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJvcGVuT3B0aW9uc1BhZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZXF1ZXN0VXBkYXRlQ2hlY2tcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZW5kTWVzc2FnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAzXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlbmROYXRpdmVNZXNzYWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0VW5pbnN0YWxsVVJMXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwic2Vzc2lvbnNcIjoge1xuICAgICAgICAgIFwiZ2V0RGV2aWNlc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFJlY2VudGx5Q2xvc2VkXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVzdG9yZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInN0b3JhZ2VcIjoge1xuICAgICAgICAgIFwibG9jYWxcIjoge1xuICAgICAgICAgICAgXCJjbGVhclwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJnZXRCeXRlc0luVXNlXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcInNldFwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYW5hZ2VkXCI6IHtcbiAgICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJnZXRCeXRlc0luVXNlXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN5bmNcIjoge1xuICAgICAgICAgICAgXCJjbGVhclwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJnZXRCeXRlc0luVXNlXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcInNldFwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJ0YWJzXCI6IHtcbiAgICAgICAgICBcImNhcHR1cmVWaXNpYmxlVGFiXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiY3JlYXRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZGV0ZWN0TGFuZ3VhZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkaXNjYXJkXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZHVwbGljYXRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZXhlY3V0ZVNjcmlwdFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEN1cnJlbnRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRab29tXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0Wm9vbVNldHRpbmdzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ29CYWNrXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ29Gb3J3YXJkXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaGxpZ2h0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaW5zZXJ0Q1NTXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInF1ZXJ5XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVsb2FkXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlQ1NTXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2VuZE1lc3NhZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogM1xuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRab29tXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0Wm9vbVNldHRpbmdzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwidXBkYXRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwidG9wU2l0ZXNcIjoge1xuICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwid2ViTmF2aWdhdGlvblwiOiB7XG4gICAgICAgICAgXCJnZXRBbGxGcmFtZXNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRGcmFtZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcIndlYlJlcXVlc3RcIjoge1xuICAgICAgICAgIFwiaGFuZGxlckJlaGF2aW9yQ2hhbmdlZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcIndpbmRvd3NcIjoge1xuICAgICAgICAgIFwiY3JlYXRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0Q3VycmVudFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldExhc3RGb2N1c2VkXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwidXBkYXRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoT2JqZWN0LmtleXMoYXBpTWV0YWRhdGEpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhcGktbWV0YWRhdGEuanNvbiBoYXMgbm90IGJlZW4gaW5jbHVkZWQgaW4gYnJvd3Nlci1wb2x5ZmlsbFwiKTtcbiAgICAgIH1cblxuICAgICAgLyoqXG4gICAgICAgKiBBIFdlYWtNYXAgc3ViY2xhc3Mgd2hpY2ggY3JlYXRlcyBhbmQgc3RvcmVzIGEgdmFsdWUgZm9yIGFueSBrZXkgd2hpY2ggZG9lc1xuICAgICAgICogbm90IGV4aXN0IHdoZW4gYWNjZXNzZWQsIGJ1dCBiZWhhdmVzIGV4YWN0bHkgYXMgYW4gb3JkaW5hcnkgV2Vha01hcFxuICAgICAgICogb3RoZXJ3aXNlLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNyZWF0ZUl0ZW1cbiAgICAgICAqICAgICAgICBBIGZ1bmN0aW9uIHdoaWNoIHdpbGwgYmUgY2FsbGVkIGluIG9yZGVyIHRvIGNyZWF0ZSB0aGUgdmFsdWUgZm9yIGFueVxuICAgICAgICogICAgICAgIGtleSB3aGljaCBkb2VzIG5vdCBleGlzdCwgdGhlIGZpcnN0IHRpbWUgaXQgaXMgYWNjZXNzZWQuIFRoZVxuICAgICAgICogICAgICAgIGZ1bmN0aW9uIHJlY2VpdmVzLCBhcyBpdHMgb25seSBhcmd1bWVudCwgdGhlIGtleSBiZWluZyBjcmVhdGVkLlxuICAgICAgICovXG4gICAgICBjbGFzcyBEZWZhdWx0V2Vha01hcCBleHRlbmRzIFdlYWtNYXAge1xuICAgICAgICBjb25zdHJ1Y3RvcihjcmVhdGVJdGVtLCBpdGVtcyA9IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHN1cGVyKGl0ZW1zKTtcbiAgICAgICAgICB0aGlzLmNyZWF0ZUl0ZW0gPSBjcmVhdGVJdGVtO1xuICAgICAgICB9XG4gICAgICAgIGdldChrZXkpIHtcbiAgICAgICAgICBpZiAoIXRoaXMuaGFzKGtleSkpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0KGtleSwgdGhpcy5jcmVhdGVJdGVtKGtleSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gc3VwZXIuZ2V0KGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLyoqXG4gICAgICAgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGdpdmVuIG9iamVjdCBpcyBhbiBvYmplY3Qgd2l0aCBhIGB0aGVuYCBtZXRob2QsIGFuZCBjYW5cbiAgICAgICAqIHRoZXJlZm9yZSBiZSBhc3N1bWVkIHRvIGJlaGF2ZSBhcyBhIFByb21pc2UuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gdGVzdC5cbiAgICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSB2YWx1ZSBpcyB0aGVuYWJsZS5cbiAgICAgICAqL1xuICAgICAgY29uc3QgaXNUaGVuYWJsZSA9IHZhbHVlID0+IHtcbiAgICAgICAgcmV0dXJuIHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiAmJiB0eXBlb2YgdmFsdWUudGhlbiA9PT0gXCJmdW5jdGlvblwiO1xuICAgICAgfTtcblxuICAgICAgLyoqXG4gICAgICAgKiBDcmVhdGVzIGFuZCByZXR1cm5zIGEgZnVuY3Rpb24gd2hpY2gsIHdoZW4gY2FsbGVkLCB3aWxsIHJlc29sdmUgb3IgcmVqZWN0XG4gICAgICAgKiB0aGUgZ2l2ZW4gcHJvbWlzZSBiYXNlZCBvbiBob3cgaXQgaXMgY2FsbGVkOlxuICAgICAgICpcbiAgICAgICAqIC0gSWYsIHdoZW4gY2FsbGVkLCBgY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yYCBjb250YWlucyBhIG5vbi1udWxsIG9iamVjdCxcbiAgICAgICAqICAgdGhlIHByb21pc2UgaXMgcmVqZWN0ZWQgd2l0aCB0aGF0IHZhbHVlLlxuICAgICAgICogLSBJZiB0aGUgZnVuY3Rpb24gaXMgY2FsbGVkIHdpdGggZXhhY3RseSBvbmUgYXJndW1lbnQsIHRoZSBwcm9taXNlIGlzXG4gICAgICAgKiAgIHJlc29sdmVkIHRvIHRoYXQgdmFsdWUuXG4gICAgICAgKiAtIE90aGVyd2lzZSwgdGhlIHByb21pc2UgaXMgcmVzb2x2ZWQgdG8gYW4gYXJyYXkgY29udGFpbmluZyBhbGwgb2YgdGhlXG4gICAgICAgKiAgIGZ1bmN0aW9uJ3MgYXJndW1lbnRzLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBwcm9taXNlXG4gICAgICAgKiAgICAgICAgQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHJlc29sdXRpb24gYW5kIHJlamVjdGlvbiBmdW5jdGlvbnMgb2YgYVxuICAgICAgICogICAgICAgIHByb21pc2UuXG4gICAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBwcm9taXNlLnJlc29sdmVcbiAgICAgICAqICAgICAgICBUaGUgcHJvbWlzZSdzIHJlc29sdXRpb24gZnVuY3Rpb24uXG4gICAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBwcm9taXNlLnJlamVjdFxuICAgICAgICogICAgICAgIFRoZSBwcm9taXNlJ3MgcmVqZWN0aW9uIGZ1bmN0aW9uLlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IG1ldGFkYXRhXG4gICAgICAgKiAgICAgICAgTWV0YWRhdGEgYWJvdXQgdGhlIHdyYXBwZWQgbWV0aG9kIHdoaWNoIGhhcyBjcmVhdGVkIHRoZSBjYWxsYmFjay5cbiAgICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gbWV0YWRhdGEuc2luZ2xlQ2FsbGJhY2tBcmdcbiAgICAgICAqICAgICAgICBXaGV0aGVyIG9yIG5vdCB0aGUgcHJvbWlzZSBpcyByZXNvbHZlZCB3aXRoIG9ubHkgdGhlIGZpcnN0XG4gICAgICAgKiAgICAgICAgYXJndW1lbnQgb2YgdGhlIGNhbGxiYWNrLCBhbHRlcm5hdGl2ZWx5IGFuIGFycmF5IG9mIGFsbCB0aGVcbiAgICAgICAqICAgICAgICBjYWxsYmFjayBhcmd1bWVudHMgaXMgcmVzb2x2ZWQuIEJ5IGRlZmF1bHQsIGlmIHRoZSBjYWxsYmFja1xuICAgICAgICogICAgICAgIGZ1bmN0aW9uIGlzIGludm9rZWQgd2l0aCBvbmx5IGEgc2luZ2xlIGFyZ3VtZW50LCB0aGF0IHdpbGwgYmVcbiAgICAgICAqICAgICAgICByZXNvbHZlZCB0byB0aGUgcHJvbWlzZSwgd2hpbGUgYWxsIGFyZ3VtZW50cyB3aWxsIGJlIHJlc29sdmVkIGFzXG4gICAgICAgKiAgICAgICAgYW4gYXJyYXkgaWYgbXVsdGlwbGUgYXJlIGdpdmVuLlxuICAgICAgICpcbiAgICAgICAqIEByZXR1cm5zIHtmdW5jdGlvbn1cbiAgICAgICAqICAgICAgICBUaGUgZ2VuZXJhdGVkIGNhbGxiYWNrIGZ1bmN0aW9uLlxuICAgICAgICovXG4gICAgICBjb25zdCBtYWtlQ2FsbGJhY2sgPSAocHJvbWlzZSwgbWV0YWRhdGEpID0+IHtcbiAgICAgICAgcmV0dXJuICguLi5jYWxsYmFja0FyZ3MpID0+IHtcbiAgICAgICAgICBpZiAoZXh0ZW5zaW9uQVBJcy5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICAgICAgcHJvbWlzZS5yZWplY3QobmV3IEVycm9yKGV4dGVuc2lvbkFQSXMucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWV0YWRhdGEuc2luZ2xlQ2FsbGJhY2tBcmcgfHwgY2FsbGJhY2tBcmdzLmxlbmd0aCA8PSAxICYmIG1ldGFkYXRhLnNpbmdsZUNhbGxiYWNrQXJnICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgcHJvbWlzZS5yZXNvbHZlKGNhbGxiYWNrQXJnc1swXSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb21pc2UucmVzb2x2ZShjYWxsYmFja0FyZ3MpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgIH07XG4gICAgICBjb25zdCBwbHVyYWxpemVBcmd1bWVudHMgPSBudW1BcmdzID0+IG51bUFyZ3MgPT0gMSA/IFwiYXJndW1lbnRcIiA6IFwiYXJndW1lbnRzXCI7XG5cbiAgICAgIC8qKlxuICAgICAgICogQ3JlYXRlcyBhIHdyYXBwZXIgZnVuY3Rpb24gZm9yIGEgbWV0aG9kIHdpdGggdGhlIGdpdmVuIG5hbWUgYW5kIG1ldGFkYXRhLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG4gICAgICAgKiAgICAgICAgVGhlIG5hbWUgb2YgdGhlIG1ldGhvZCB3aGljaCBpcyBiZWluZyB3cmFwcGVkLlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IG1ldGFkYXRhXG4gICAgICAgKiAgICAgICAgTWV0YWRhdGEgYWJvdXQgdGhlIG1ldGhvZCBiZWluZyB3cmFwcGVkLlxuICAgICAgICogQHBhcmFtIHtpbnRlZ2VyfSBtZXRhZGF0YS5taW5BcmdzXG4gICAgICAgKiAgICAgICAgVGhlIG1pbmltdW0gbnVtYmVyIG9mIGFyZ3VtZW50cyB3aGljaCBtdXN0IGJlIHBhc3NlZCB0byB0aGVcbiAgICAgICAqICAgICAgICBmdW5jdGlvbi4gSWYgY2FsbGVkIHdpdGggZmV3ZXIgdGhhbiB0aGlzIG51bWJlciBvZiBhcmd1bWVudHMsIHRoZVxuICAgICAgICogICAgICAgIHdyYXBwZXIgd2lsbCByYWlzZSBhbiBleGNlcHRpb24uXG4gICAgICAgKiBAcGFyYW0ge2ludGVnZXJ9IG1ldGFkYXRhLm1heEFyZ3NcbiAgICAgICAqICAgICAgICBUaGUgbWF4aW11bSBudW1iZXIgb2YgYXJndW1lbnRzIHdoaWNoIG1heSBiZSBwYXNzZWQgdG8gdGhlXG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24uIElmIGNhbGxlZCB3aXRoIG1vcmUgdGhhbiB0aGlzIG51bWJlciBvZiBhcmd1bWVudHMsIHRoZVxuICAgICAgICogICAgICAgIHdyYXBwZXIgd2lsbCByYWlzZSBhbiBleGNlcHRpb24uXG4gICAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IG1ldGFkYXRhLnNpbmdsZUNhbGxiYWNrQXJnXG4gICAgICAgKiAgICAgICAgV2hldGhlciBvciBub3QgdGhlIHByb21pc2UgaXMgcmVzb2x2ZWQgd2l0aCBvbmx5IHRoZSBmaXJzdFxuICAgICAgICogICAgICAgIGFyZ3VtZW50IG9mIHRoZSBjYWxsYmFjaywgYWx0ZXJuYXRpdmVseSBhbiBhcnJheSBvZiBhbGwgdGhlXG4gICAgICAgKiAgICAgICAgY2FsbGJhY2sgYXJndW1lbnRzIGlzIHJlc29sdmVkLiBCeSBkZWZhdWx0LCBpZiB0aGUgY2FsbGJhY2tcbiAgICAgICAqICAgICAgICBmdW5jdGlvbiBpcyBpbnZva2VkIHdpdGggb25seSBhIHNpbmdsZSBhcmd1bWVudCwgdGhhdCB3aWxsIGJlXG4gICAgICAgKiAgICAgICAgcmVzb2x2ZWQgdG8gdGhlIHByb21pc2UsIHdoaWxlIGFsbCBhcmd1bWVudHMgd2lsbCBiZSByZXNvbHZlZCBhc1xuICAgICAgICogICAgICAgIGFuIGFycmF5IGlmIG11bHRpcGxlIGFyZSBnaXZlbi5cbiAgICAgICAqXG4gICAgICAgKiBAcmV0dXJucyB7ZnVuY3Rpb24ob2JqZWN0LCAuLi4qKX1cbiAgICAgICAqICAgICAgIFRoZSBnZW5lcmF0ZWQgd3JhcHBlciBmdW5jdGlvbi5cbiAgICAgICAqL1xuICAgICAgY29uc3Qgd3JhcEFzeW5jRnVuY3Rpb24gPSAobmFtZSwgbWV0YWRhdGEpID0+IHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIGFzeW5jRnVuY3Rpb25XcmFwcGVyKHRhcmdldCwgLi4uYXJncykge1xuICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8IG1ldGFkYXRhLm1pbkFyZ3MpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgYXQgbGVhc3QgJHttZXRhZGF0YS5taW5BcmdzfSAke3BsdXJhbGl6ZUFyZ3VtZW50cyhtZXRhZGF0YS5taW5BcmdzKX0gZm9yICR7bmFtZX0oKSwgZ290ICR7YXJncy5sZW5ndGh9YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IG1ldGFkYXRhLm1heEFyZ3MpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgYXQgbW9zdCAke21ldGFkYXRhLm1heEFyZ3N9ICR7cGx1cmFsaXplQXJndW1lbnRzKG1ldGFkYXRhLm1heEFyZ3MpfSBmb3IgJHtuYW1lfSgpLCBnb3QgJHthcmdzLmxlbmd0aH1gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGlmIChtZXRhZGF0YS5mYWxsYmFja1RvTm9DYWxsYmFjaykge1xuICAgICAgICAgICAgICAvLyBUaGlzIEFQSSBtZXRob2QgaGFzIGN1cnJlbnRseSBubyBjYWxsYmFjayBvbiBDaHJvbWUsIGJ1dCBpdCByZXR1cm4gYSBwcm9taXNlIG9uIEZpcmVmb3gsXG4gICAgICAgICAgICAgIC8vIGFuZCBzbyB0aGUgcG9seWZpbGwgd2lsbCB0cnkgdG8gY2FsbCBpdCB3aXRoIGEgY2FsbGJhY2sgZmlyc3QsIGFuZCBpdCB3aWxsIGZhbGxiYWNrXG4gICAgICAgICAgICAgIC8vIHRvIG5vdCBwYXNzaW5nIHRoZSBjYWxsYmFjayBpZiB0aGUgZmlyc3QgY2FsbCBmYWlscy5cbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB0YXJnZXRbbmFtZV0oLi4uYXJncywgbWFrZUNhbGxiYWNrKHtcbiAgICAgICAgICAgICAgICAgIHJlc29sdmUsXG4gICAgICAgICAgICAgICAgICByZWplY3RcbiAgICAgICAgICAgICAgICB9LCBtZXRhZGF0YSkpO1xuICAgICAgICAgICAgICB9IGNhdGNoIChjYkVycm9yKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGAke25hbWV9IEFQSSBtZXRob2QgZG9lc24ndCBzZWVtIHRvIHN1cHBvcnQgdGhlIGNhbGxiYWNrIHBhcmFtZXRlciwgYCArIFwiZmFsbGluZyBiYWNrIHRvIGNhbGwgaXQgd2l0aG91dCBhIGNhbGxiYWNrOiBcIiwgY2JFcnJvcik7XG4gICAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdKC4uLmFyZ3MpO1xuXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBBUEkgbWV0aG9kIG1ldGFkYXRhLCBzbyB0aGF0IHRoZSBuZXh0IEFQSSBjYWxscyB3aWxsIG5vdCB0cnkgdG9cbiAgICAgICAgICAgICAgICAvLyB1c2UgdGhlIHVuc3VwcG9ydGVkIGNhbGxiYWNrIGFueW1vcmUuXG4gICAgICAgICAgICAgICAgbWV0YWRhdGEuZmFsbGJhY2tUb05vQ2FsbGJhY2sgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBtZXRhZGF0YS5ub0NhbGxiYWNrID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAobWV0YWRhdGEubm9DYWxsYmFjaykge1xuICAgICAgICAgICAgICB0YXJnZXRbbmFtZV0oLi4uYXJncyk7XG4gICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRhcmdldFtuYW1lXSguLi5hcmdzLCBtYWtlQ2FsbGJhY2soe1xuICAgICAgICAgICAgICAgIHJlc29sdmUsXG4gICAgICAgICAgICAgICAgcmVqZWN0XG4gICAgICAgICAgICAgIH0sIG1ldGFkYXRhKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICB9O1xuXG4gICAgICAvKipcbiAgICAgICAqIFdyYXBzIGFuIGV4aXN0aW5nIG1ldGhvZCBvZiB0aGUgdGFyZ2V0IG9iamVjdCwgc28gdGhhdCBjYWxscyB0byBpdCBhcmVcbiAgICAgICAqIGludGVyY2VwdGVkIGJ5IHRoZSBnaXZlbiB3cmFwcGVyIGZ1bmN0aW9uLiBUaGUgd3JhcHBlciBmdW5jdGlvbiByZWNlaXZlcyxcbiAgICAgICAqIGFzIGl0cyBmaXJzdCBhcmd1bWVudCwgdGhlIG9yaWdpbmFsIGB0YXJnZXRgIG9iamVjdCwgZm9sbG93ZWQgYnkgZWFjaCBvZlxuICAgICAgICogdGhlIGFyZ3VtZW50cyBwYXNzZWQgdG8gdGhlIG9yaWdpbmFsIG1ldGhvZC5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gdGFyZ2V0XG4gICAgICAgKiAgICAgICAgVGhlIG9yaWdpbmFsIHRhcmdldCBvYmplY3QgdGhhdCB0aGUgd3JhcHBlZCBtZXRob2QgYmVsb25ncyB0by5cbiAgICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IG1ldGhvZFxuICAgICAgICogICAgICAgIFRoZSBtZXRob2QgYmVpbmcgd3JhcHBlZC4gVGhpcyBpcyB1c2VkIGFzIHRoZSB0YXJnZXQgb2YgdGhlIFByb3h5XG4gICAgICAgKiAgICAgICAgb2JqZWN0IHdoaWNoIGlzIGNyZWF0ZWQgdG8gd3JhcCB0aGUgbWV0aG9kLlxuICAgICAgICogQHBhcmFtIHtmdW5jdGlvbn0gd3JhcHBlclxuICAgICAgICogICAgICAgIFRoZSB3cmFwcGVyIGZ1bmN0aW9uIHdoaWNoIGlzIGNhbGxlZCBpbiBwbGFjZSBvZiBhIGRpcmVjdCBpbnZvY2F0aW9uXG4gICAgICAgKiAgICAgICAgb2YgdGhlIHdyYXBwZWQgbWV0aG9kLlxuICAgICAgICpcbiAgICAgICAqIEByZXR1cm5zIHtQcm94eTxmdW5jdGlvbj59XG4gICAgICAgKiAgICAgICAgQSBQcm94eSBvYmplY3QgZm9yIHRoZSBnaXZlbiBtZXRob2QsIHdoaWNoIGludm9rZXMgdGhlIGdpdmVuIHdyYXBwZXJcbiAgICAgICAqICAgICAgICBtZXRob2QgaW4gaXRzIHBsYWNlLlxuICAgICAgICovXG4gICAgICBjb25zdCB3cmFwTWV0aG9kID0gKHRhcmdldCwgbWV0aG9kLCB3cmFwcGVyKSA9PiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJveHkobWV0aG9kLCB7XG4gICAgICAgICAgYXBwbHkodGFyZ2V0TWV0aG9kLCB0aGlzT2JqLCBhcmdzKSB7XG4gICAgICAgICAgICByZXR1cm4gd3JhcHBlci5jYWxsKHRoaXNPYmosIHRhcmdldCwgLi4uYXJncyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH07XG4gICAgICBsZXQgaGFzT3duUHJvcGVydHkgPSBGdW5jdGlvbi5jYWxsLmJpbmQoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSk7XG5cbiAgICAgIC8qKlxuICAgICAgICogV3JhcHMgYW4gb2JqZWN0IGluIGEgUHJveHkgd2hpY2ggaW50ZXJjZXB0cyBhbmQgd3JhcHMgY2VydGFpbiBtZXRob2RzXG4gICAgICAgKiBiYXNlZCBvbiB0aGUgZ2l2ZW4gYHdyYXBwZXJzYCBhbmQgYG1ldGFkYXRhYCBvYmplY3RzLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSB0YXJnZXRcbiAgICAgICAqICAgICAgICBUaGUgdGFyZ2V0IG9iamVjdCB0byB3cmFwLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBbd3JhcHBlcnMgPSB7fV1cbiAgICAgICAqICAgICAgICBBbiBvYmplY3QgdHJlZSBjb250YWluaW5nIHdyYXBwZXIgZnVuY3Rpb25zIGZvciBzcGVjaWFsIGNhc2VzLiBBbnlcbiAgICAgICAqICAgICAgICBmdW5jdGlvbiBwcmVzZW50IGluIHRoaXMgb2JqZWN0IHRyZWUgaXMgY2FsbGVkIGluIHBsYWNlIG9mIHRoZVxuICAgICAgICogICAgICAgIG1ldGhvZCBpbiB0aGUgc2FtZSBsb2NhdGlvbiBpbiB0aGUgYHRhcmdldGAgb2JqZWN0IHRyZWUuIFRoZXNlXG4gICAgICAgKiAgICAgICAgd3JhcHBlciBtZXRob2RzIGFyZSBpbnZva2VkIGFzIGRlc2NyaWJlZCBpbiB7QHNlZSB3cmFwTWV0aG9kfS5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gW21ldGFkYXRhID0ge31dXG4gICAgICAgKiAgICAgICAgQW4gb2JqZWN0IHRyZWUgY29udGFpbmluZyBtZXRhZGF0YSB1c2VkIHRvIGF1dG9tYXRpY2FsbHkgZ2VuZXJhdGVcbiAgICAgICAqICAgICAgICBQcm9taXNlLWJhc2VkIHdyYXBwZXIgZnVuY3Rpb25zIGZvciBhc3luY2hyb25vdXMuIEFueSBmdW5jdGlvbiBpblxuICAgICAgICogICAgICAgIHRoZSBgdGFyZ2V0YCBvYmplY3QgdHJlZSB3aGljaCBoYXMgYSBjb3JyZXNwb25kaW5nIG1ldGFkYXRhIG9iamVjdFxuICAgICAgICogICAgICAgIGluIHRoZSBzYW1lIGxvY2F0aW9uIGluIHRoZSBgbWV0YWRhdGFgIHRyZWUgaXMgcmVwbGFjZWQgd2l0aCBhblxuICAgICAgICogICAgICAgIGF1dG9tYXRpY2FsbHktZ2VuZXJhdGVkIHdyYXBwZXIgZnVuY3Rpb24sIGFzIGRlc2NyaWJlZCBpblxuICAgICAgICogICAgICAgIHtAc2VlIHdyYXBBc3luY0Z1bmN0aW9ufVxuICAgICAgICpcbiAgICAgICAqIEByZXR1cm5zIHtQcm94eTxvYmplY3Q+fVxuICAgICAgICovXG4gICAgICBjb25zdCB3cmFwT2JqZWN0ID0gKHRhcmdldCwgd3JhcHBlcnMgPSB7fSwgbWV0YWRhdGEgPSB7fSkgPT4ge1xuICAgICAgICBsZXQgY2FjaGUgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgICBsZXQgaGFuZGxlcnMgPSB7XG4gICAgICAgICAgaGFzKHByb3h5VGFyZ2V0LCBwcm9wKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvcCBpbiB0YXJnZXQgfHwgcHJvcCBpbiBjYWNoZTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGdldChwcm94eVRhcmdldCwgcHJvcCwgcmVjZWl2ZXIpIHtcbiAgICAgICAgICAgIGlmIChwcm9wIGluIGNhY2hlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjYWNoZVtwcm9wXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghKHByb3AgaW4gdGFyZ2V0KSkge1xuICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGV0IHZhbHVlID0gdGFyZ2V0W3Byb3BdO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgIC8vIFRoaXMgaXMgYSBtZXRob2Qgb24gdGhlIHVuZGVybHlpbmcgb2JqZWN0LiBDaGVjayBpZiB3ZSBuZWVkIHRvIGRvXG4gICAgICAgICAgICAgIC8vIGFueSB3cmFwcGluZy5cblxuICAgICAgICAgICAgICBpZiAodHlwZW9mIHdyYXBwZXJzW3Byb3BdID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICAvLyBXZSBoYXZlIGEgc3BlY2lhbC1jYXNlIHdyYXBwZXIgZm9yIHRoaXMgbWV0aG9kLlxuICAgICAgICAgICAgICAgIHZhbHVlID0gd3JhcE1ldGhvZCh0YXJnZXQsIHRhcmdldFtwcm9wXSwgd3JhcHBlcnNbcHJvcF0pO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhhc093blByb3BlcnR5KG1ldGFkYXRhLCBwcm9wKSkge1xuICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgYW4gYXN5bmMgbWV0aG9kIHRoYXQgd2UgaGF2ZSBtZXRhZGF0YSBmb3IuIENyZWF0ZSBhXG4gICAgICAgICAgICAgICAgLy8gUHJvbWlzZSB3cmFwcGVyIGZvciBpdC5cbiAgICAgICAgICAgICAgICBsZXQgd3JhcHBlciA9IHdyYXBBc3luY0Z1bmN0aW9uKHByb3AsIG1ldGFkYXRhW3Byb3BdKTtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHdyYXBNZXRob2QodGFyZ2V0LCB0YXJnZXRbcHJvcF0sIHdyYXBwZXIpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgYSBtZXRob2QgdGhhdCB3ZSBkb24ndCBrbm93IG9yIGNhcmUgYWJvdXQuIFJldHVybiB0aGVcbiAgICAgICAgICAgICAgICAvLyBvcmlnaW5hbCBtZXRob2QsIGJvdW5kIHRvIHRoZSB1bmRlcmx5aW5nIG9iamVjdC5cbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLmJpbmQodGFyZ2V0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiYgdmFsdWUgIT09IG51bGwgJiYgKGhhc093blByb3BlcnR5KHdyYXBwZXJzLCBwcm9wKSB8fCBoYXNPd25Qcm9wZXJ0eShtZXRhZGF0YSwgcHJvcCkpKSB7XG4gICAgICAgICAgICAgIC8vIFRoaXMgaXMgYW4gb2JqZWN0IHRoYXQgd2UgbmVlZCB0byBkbyBzb21lIHdyYXBwaW5nIGZvciB0aGUgY2hpbGRyZW5cbiAgICAgICAgICAgICAgLy8gb2YuIENyZWF0ZSBhIHN1Yi1vYmplY3Qgd3JhcHBlciBmb3IgaXQgd2l0aCB0aGUgYXBwcm9wcmlhdGUgY2hpbGRcbiAgICAgICAgICAgICAgLy8gbWV0YWRhdGEuXG4gICAgICAgICAgICAgIHZhbHVlID0gd3JhcE9iamVjdCh2YWx1ZSwgd3JhcHBlcnNbcHJvcF0sIG1ldGFkYXRhW3Byb3BdKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaGFzT3duUHJvcGVydHkobWV0YWRhdGEsIFwiKlwiKSkge1xuICAgICAgICAgICAgICAvLyBXcmFwIGFsbCBwcm9wZXJ0aWVzIGluICogbmFtZXNwYWNlLlxuICAgICAgICAgICAgICB2YWx1ZSA9IHdyYXBPYmplY3QodmFsdWUsIHdyYXBwZXJzW3Byb3BdLCBtZXRhZGF0YVtcIipcIl0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gV2UgZG9uJ3QgbmVlZCB0byBkbyBhbnkgd3JhcHBpbmcgZm9yIHRoaXMgcHJvcGVydHksXG4gICAgICAgICAgICAgIC8vIHNvIGp1c3QgZm9yd2FyZCBhbGwgYWNjZXNzIHRvIHRoZSB1bmRlcmx5aW5nIG9iamVjdC5cbiAgICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGNhY2hlLCBwcm9wLCB7XG4gICAgICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgZ2V0KCkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRhcmdldFtwcm9wXTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHNldCh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgdGFyZ2V0W3Byb3BdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FjaGVbcHJvcF0gPSB2YWx1ZTtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIHNldChwcm94eVRhcmdldCwgcHJvcCwgdmFsdWUsIHJlY2VpdmVyKSB7XG4gICAgICAgICAgICBpZiAocHJvcCBpbiBjYWNoZSkge1xuICAgICAgICAgICAgICBjYWNoZVtwcm9wXSA9IHZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdGFyZ2V0W3Byb3BdID0gdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGRlZmluZVByb3BlcnR5KHByb3h5VGFyZ2V0LCBwcm9wLCBkZXNjKSB7XG4gICAgICAgICAgICByZXR1cm4gUmVmbGVjdC5kZWZpbmVQcm9wZXJ0eShjYWNoZSwgcHJvcCwgZGVzYyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBkZWxldGVQcm9wZXJ0eShwcm94eVRhcmdldCwgcHJvcCkge1xuICAgICAgICAgICAgcmV0dXJuIFJlZmxlY3QuZGVsZXRlUHJvcGVydHkoY2FjaGUsIHByb3ApO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICAvLyBQZXIgY29udHJhY3Qgb2YgdGhlIFByb3h5IEFQSSwgdGhlIFwiZ2V0XCIgcHJveHkgaGFuZGxlciBtdXN0IHJldHVybiB0aGVcbiAgICAgICAgLy8gb3JpZ2luYWwgdmFsdWUgb2YgdGhlIHRhcmdldCBpZiB0aGF0IHZhbHVlIGlzIGRlY2xhcmVkIHJlYWQtb25seSBhbmRcbiAgICAgICAgLy8gbm9uLWNvbmZpZ3VyYWJsZS4gRm9yIHRoaXMgcmVhc29uLCB3ZSBjcmVhdGUgYW4gb2JqZWN0IHdpdGggdGhlXG4gICAgICAgIC8vIHByb3RvdHlwZSBzZXQgdG8gYHRhcmdldGAgaW5zdGVhZCBvZiB1c2luZyBgdGFyZ2V0YCBkaXJlY3RseS5cbiAgICAgICAgLy8gT3RoZXJ3aXNlIHdlIGNhbm5vdCByZXR1cm4gYSBjdXN0b20gb2JqZWN0IGZvciBBUElzIHRoYXRcbiAgICAgICAgLy8gYXJlIGRlY2xhcmVkIHJlYWQtb25seSBhbmQgbm9uLWNvbmZpZ3VyYWJsZSwgc3VjaCBhcyBgY2hyb21lLmRldnRvb2xzYC5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gVGhlIHByb3h5IGhhbmRsZXJzIHRoZW1zZWx2ZXMgd2lsbCBzdGlsbCB1c2UgdGhlIG9yaWdpbmFsIGB0YXJnZXRgXG4gICAgICAgIC8vIGluc3RlYWQgb2YgdGhlIGBwcm94eVRhcmdldGAsIHNvIHRoYXQgdGhlIG1ldGhvZHMgYW5kIHByb3BlcnRpZXMgYXJlXG4gICAgICAgIC8vIGRlcmVmZXJlbmNlZCB2aWEgdGhlIG9yaWdpbmFsIHRhcmdldHMuXG4gICAgICAgIGxldCBwcm94eVRhcmdldCA9IE9iamVjdC5jcmVhdGUodGFyZ2V0KTtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm94eShwcm94eVRhcmdldCwgaGFuZGxlcnMpO1xuICAgICAgfTtcblxuICAgICAgLyoqXG4gICAgICAgKiBDcmVhdGVzIGEgc2V0IG9mIHdyYXBwZXIgZnVuY3Rpb25zIGZvciBhbiBldmVudCBvYmplY3QsIHdoaWNoIGhhbmRsZXNcbiAgICAgICAqIHdyYXBwaW5nIG9mIGxpc3RlbmVyIGZ1bmN0aW9ucyB0aGF0IHRob3NlIG1lc3NhZ2VzIGFyZSBwYXNzZWQuXG4gICAgICAgKlxuICAgICAgICogQSBzaW5nbGUgd3JhcHBlciBpcyBjcmVhdGVkIGZvciBlYWNoIGxpc3RlbmVyIGZ1bmN0aW9uLCBhbmQgc3RvcmVkIGluIGFcbiAgICAgICAqIG1hcC4gU3Vic2VxdWVudCBjYWxscyB0byBgYWRkTGlzdGVuZXJgLCBgaGFzTGlzdGVuZXJgLCBvciBgcmVtb3ZlTGlzdGVuZXJgXG4gICAgICAgKiByZXRyaWV2ZSB0aGUgb3JpZ2luYWwgd3JhcHBlciwgc28gdGhhdCAgYXR0ZW1wdHMgdG8gcmVtb3ZlIGFcbiAgICAgICAqIHByZXZpb3VzbHktYWRkZWQgbGlzdGVuZXIgd29yayBhcyBleHBlY3RlZC5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge0RlZmF1bHRXZWFrTWFwPGZ1bmN0aW9uLCBmdW5jdGlvbj59IHdyYXBwZXJNYXBcbiAgICAgICAqICAgICAgICBBIERlZmF1bHRXZWFrTWFwIG9iamVjdCB3aGljaCB3aWxsIGNyZWF0ZSB0aGUgYXBwcm9wcmlhdGUgd3JhcHBlclxuICAgICAgICogICAgICAgIGZvciBhIGdpdmVuIGxpc3RlbmVyIGZ1bmN0aW9uIHdoZW4gb25lIGRvZXMgbm90IGV4aXN0LCBhbmQgcmV0cmlldmVcbiAgICAgICAqICAgICAgICBhbiBleGlzdGluZyBvbmUgd2hlbiBpdCBkb2VzLlxuICAgICAgICpcbiAgICAgICAqIEByZXR1cm5zIHtvYmplY3R9XG4gICAgICAgKi9cbiAgICAgIGNvbnN0IHdyYXBFdmVudCA9IHdyYXBwZXJNYXAgPT4gKHtcbiAgICAgICAgYWRkTGlzdGVuZXIodGFyZ2V0LCBsaXN0ZW5lciwgLi4uYXJncykge1xuICAgICAgICAgIHRhcmdldC5hZGRMaXN0ZW5lcih3cmFwcGVyTWFwLmdldChsaXN0ZW5lciksIC4uLmFyZ3MpO1xuICAgICAgICB9LFxuICAgICAgICBoYXNMaXN0ZW5lcih0YXJnZXQsIGxpc3RlbmVyKSB7XG4gICAgICAgICAgcmV0dXJuIHRhcmdldC5oYXNMaXN0ZW5lcih3cmFwcGVyTWFwLmdldChsaXN0ZW5lcikpO1xuICAgICAgICB9LFxuICAgICAgICByZW1vdmVMaXN0ZW5lcih0YXJnZXQsIGxpc3RlbmVyKSB7XG4gICAgICAgICAgdGFyZ2V0LnJlbW92ZUxpc3RlbmVyKHdyYXBwZXJNYXAuZ2V0KGxpc3RlbmVyKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgY29uc3Qgb25SZXF1ZXN0RmluaXNoZWRXcmFwcGVycyA9IG5ldyBEZWZhdWx0V2Vha01hcChsaXN0ZW5lciA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgIHJldHVybiBsaXN0ZW5lcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBXcmFwcyBhbiBvblJlcXVlc3RGaW5pc2hlZCBsaXN0ZW5lciBmdW5jdGlvbiBzbyB0aGF0IGl0IHdpbGwgcmV0dXJuIGFcbiAgICAgICAgICogYGdldENvbnRlbnQoKWAgcHJvcGVydHkgd2hpY2ggcmV0dXJucyBhIGBQcm9taXNlYCByYXRoZXIgdGhhbiB1c2luZyBhXG4gICAgICAgICAqIGNhbGxiYWNrIEFQSS5cbiAgICAgICAgICpcbiAgICAgICAgICogQHBhcmFtIHtvYmplY3R9IHJlcVxuICAgICAgICAgKiAgICAgICAgVGhlIEhBUiBlbnRyeSBvYmplY3QgcmVwcmVzZW50aW5nIHRoZSBuZXR3b3JrIHJlcXVlc3QuXG4gICAgICAgICAqL1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gb25SZXF1ZXN0RmluaXNoZWQocmVxKSB7XG4gICAgICAgICAgY29uc3Qgd3JhcHBlZFJlcSA9IHdyYXBPYmplY3QocmVxLCB7fSAvKiB3cmFwcGVycyAqLywge1xuICAgICAgICAgICAgZ2V0Q29udGVudDoge1xuICAgICAgICAgICAgICBtaW5BcmdzOiAwLFxuICAgICAgICAgICAgICBtYXhBcmdzOiAwXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgbGlzdGVuZXIod3JhcHBlZFJlcSk7XG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICAgIGNvbnN0IG9uTWVzc2FnZVdyYXBwZXJzID0gbmV3IERlZmF1bHRXZWFrTWFwKGxpc3RlbmVyID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgcmV0dXJuIGxpc3RlbmVyO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFdyYXBzIGEgbWVzc2FnZSBsaXN0ZW5lciBmdW5jdGlvbiBzbyB0aGF0IGl0IG1heSBzZW5kIHJlc3BvbnNlcyBiYXNlZCBvblxuICAgICAgICAgKiBpdHMgcmV0dXJuIHZhbHVlLCByYXRoZXIgdGhhbiBieSByZXR1cm5pbmcgYSBzZW50aW5lbCB2YWx1ZSBhbmQgY2FsbGluZyBhXG4gICAgICAgICAqIGNhbGxiYWNrLiBJZiB0aGUgbGlzdGVuZXIgZnVuY3Rpb24gcmV0dXJucyBhIFByb21pc2UsIHRoZSByZXNwb25zZSBpc1xuICAgICAgICAgKiBzZW50IHdoZW4gdGhlIHByb21pc2UgZWl0aGVyIHJlc29sdmVzIG9yIHJlamVjdHMuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBwYXJhbSB7Kn0gbWVzc2FnZVxuICAgICAgICAgKiAgICAgICAgVGhlIG1lc3NhZ2Ugc2VudCBieSB0aGUgb3RoZXIgZW5kIG9mIHRoZSBjaGFubmVsLlxuICAgICAgICAgKiBAcGFyYW0ge29iamVjdH0gc2VuZGVyXG4gICAgICAgICAqICAgICAgICBEZXRhaWxzIGFib3V0IHRoZSBzZW5kZXIgb2YgdGhlIG1lc3NhZ2UuXG4gICAgICAgICAqIEBwYXJhbSB7ZnVuY3Rpb24oKil9IHNlbmRSZXNwb25zZVxuICAgICAgICAgKiAgICAgICAgQSBjYWxsYmFjayB3aGljaCwgd2hlbiBjYWxsZWQgd2l0aCBhbiBhcmJpdHJhcnkgYXJndW1lbnQsIHNlbmRzXG4gICAgICAgICAqICAgICAgICB0aGF0IHZhbHVlIGFzIGEgcmVzcG9uc2UuXG4gICAgICAgICAqIEByZXR1cm5zIHtib29sZWFufVxuICAgICAgICAgKiAgICAgICAgVHJ1ZSBpZiB0aGUgd3JhcHBlZCBsaXN0ZW5lciByZXR1cm5lZCBhIFByb21pc2UsIHdoaWNoIHdpbGwgbGF0ZXJcbiAgICAgICAgICogICAgICAgIHlpZWxkIGEgcmVzcG9uc2UuIEZhbHNlIG90aGVyd2lzZS5cbiAgICAgICAgICovXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBvbk1lc3NhZ2UobWVzc2FnZSwgc2VuZGVyLCBzZW5kUmVzcG9uc2UpIHtcbiAgICAgICAgICBsZXQgZGlkQ2FsbFNlbmRSZXNwb25zZSA9IGZhbHNlO1xuICAgICAgICAgIGxldCB3cmFwcGVkU2VuZFJlc3BvbnNlO1xuICAgICAgICAgIGxldCBzZW5kUmVzcG9uc2VQcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgICB3cmFwcGVkU2VuZFJlc3BvbnNlID0gZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgIGRpZENhbGxTZW5kUmVzcG9uc2UgPSB0cnVlO1xuICAgICAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgbGV0IHJlc3VsdDtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmVzdWx0ID0gbGlzdGVuZXIobWVzc2FnZSwgc2VuZGVyLCB3cmFwcGVkU2VuZFJlc3BvbnNlKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IFByb21pc2UucmVqZWN0KGVycik7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IGlzUmVzdWx0VGhlbmFibGUgPSByZXN1bHQgIT09IHRydWUgJiYgaXNUaGVuYWJsZShyZXN1bHQpO1xuXG4gICAgICAgICAgLy8gSWYgdGhlIGxpc3RlbmVyIGRpZG4ndCByZXR1cm5lZCB0cnVlIG9yIGEgUHJvbWlzZSwgb3IgY2FsbGVkXG4gICAgICAgICAgLy8gd3JhcHBlZFNlbmRSZXNwb25zZSBzeW5jaHJvbm91c2x5LCB3ZSBjYW4gZXhpdCBlYXJsaWVyXG4gICAgICAgICAgLy8gYmVjYXVzZSB0aGVyZSB3aWxsIGJlIG5vIHJlc3BvbnNlIHNlbnQgZnJvbSB0aGlzIGxpc3RlbmVyLlxuICAgICAgICAgIGlmIChyZXN1bHQgIT09IHRydWUgJiYgIWlzUmVzdWx0VGhlbmFibGUgJiYgIWRpZENhbGxTZW5kUmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBBIHNtYWxsIGhlbHBlciB0byBzZW5kIHRoZSBtZXNzYWdlIGlmIHRoZSBwcm9taXNlIHJlc29sdmVzXG4gICAgICAgICAgLy8gYW5kIGFuIGVycm9yIGlmIHRoZSBwcm9taXNlIHJlamVjdHMgKGEgd3JhcHBlZCBzZW5kTWVzc2FnZSBoYXNcbiAgICAgICAgICAvLyB0byB0cmFuc2xhdGUgdGhlIG1lc3NhZ2UgaW50byBhIHJlc29sdmVkIHByb21pc2Ugb3IgYSByZWplY3RlZFxuICAgICAgICAgIC8vIHByb21pc2UpLlxuICAgICAgICAgIGNvbnN0IHNlbmRQcm9taXNlZFJlc3VsdCA9IHByb21pc2UgPT4ge1xuICAgICAgICAgICAgcHJvbWlzZS50aGVuKG1zZyA9PiB7XG4gICAgICAgICAgICAgIC8vIHNlbmQgdGhlIG1lc3NhZ2UgdmFsdWUuXG4gICAgICAgICAgICAgIHNlbmRSZXNwb25zZShtc2cpO1xuICAgICAgICAgICAgfSwgZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAvLyBTZW5kIGEgSlNPTiByZXByZXNlbnRhdGlvbiBvZiB0aGUgZXJyb3IgaWYgdGhlIHJlamVjdGVkIHZhbHVlXG4gICAgICAgICAgICAgIC8vIGlzIGFuIGluc3RhbmNlIG9mIGVycm9yLCBvciB0aGUgb2JqZWN0IGl0c2VsZiBvdGhlcndpc2UuXG4gICAgICAgICAgICAgIGxldCBtZXNzYWdlO1xuICAgICAgICAgICAgICBpZiAoZXJyb3IgJiYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgfHwgdHlwZW9mIGVycm9yLm1lc3NhZ2UgPT09IFwic3RyaW5nXCIpKSB7XG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGVycm9yLm1lc3NhZ2U7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IFwiQW4gdW5leHBlY3RlZCBlcnJvciBvY2N1cnJlZFwiO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7XG4gICAgICAgICAgICAgICAgX19tb3pXZWJFeHRlbnNpb25Qb2x5ZmlsbFJlamVjdF9fOiB0cnVlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2VcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICAvLyBQcmludCBhbiBlcnJvciBvbiB0aGUgY29uc29sZSBpZiB1bmFibGUgdG8gc2VuZCB0aGUgcmVzcG9uc2UuXG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2VuZCBvbk1lc3NhZ2UgcmVqZWN0ZWQgcmVwbHlcIiwgZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH07XG5cbiAgICAgICAgICAvLyBJZiB0aGUgbGlzdGVuZXIgcmV0dXJuZWQgYSBQcm9taXNlLCBzZW5kIHRoZSByZXNvbHZlZCB2YWx1ZSBhcyBhXG4gICAgICAgICAgLy8gcmVzdWx0LCBvdGhlcndpc2Ugd2FpdCB0aGUgcHJvbWlzZSByZWxhdGVkIHRvIHRoZSB3cmFwcGVkU2VuZFJlc3BvbnNlXG4gICAgICAgICAgLy8gY2FsbGJhY2sgdG8gcmVzb2x2ZSBhbmQgc2VuZCBpdCBhcyBhIHJlc3BvbnNlLlxuICAgICAgICAgIGlmIChpc1Jlc3VsdFRoZW5hYmxlKSB7XG4gICAgICAgICAgICBzZW5kUHJvbWlzZWRSZXN1bHQocmVzdWx0KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2VuZFByb21pc2VkUmVzdWx0KHNlbmRSZXNwb25zZVByb21pc2UpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIExldCBDaHJvbWUga25vdyB0aGF0IHRoZSBsaXN0ZW5lciBpcyByZXBseWluZy5cbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgICAgY29uc3Qgd3JhcHBlZFNlbmRNZXNzYWdlQ2FsbGJhY2sgPSAoe1xuICAgICAgICByZWplY3QsXG4gICAgICAgIHJlc29sdmVcbiAgICAgIH0sIHJlcGx5KSA9PiB7XG4gICAgICAgIGlmIChleHRlbnNpb25BUElzLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgICAgLy8gRGV0ZWN0IHdoZW4gbm9uZSBvZiB0aGUgbGlzdGVuZXJzIHJlcGxpZWQgdG8gdGhlIHNlbmRNZXNzYWdlIGNhbGwgYW5kIHJlc29sdmVcbiAgICAgICAgICAvLyB0aGUgcHJvbWlzZSB0byB1bmRlZmluZWQgYXMgaW4gRmlyZWZveC5cbiAgICAgICAgICAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvd2ViZXh0ZW5zaW9uLXBvbHlmaWxsL2lzc3Vlcy8xMzBcbiAgICAgICAgICBpZiAoZXh0ZW5zaW9uQVBJcy5ydW50aW1lLmxhc3RFcnJvci5tZXNzYWdlID09PSBDSFJPTUVfU0VORF9NRVNTQUdFX0NBTExCQUNLX05PX1JFU1BPTlNFX01FU1NBR0UpIHtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihleHRlbnNpb25BUElzLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAocmVwbHkgJiYgcmVwbHkuX19tb3pXZWJFeHRlbnNpb25Qb2x5ZmlsbFJlamVjdF9fKSB7XG4gICAgICAgICAgLy8gQ29udmVydCBiYWNrIHRoZSBKU09OIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBlcnJvciBpbnRvXG4gICAgICAgICAgLy8gYW4gRXJyb3IgaW5zdGFuY2UuXG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihyZXBseS5tZXNzYWdlKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzb2x2ZShyZXBseSk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBjb25zdCB3cmFwcGVkU2VuZE1lc3NhZ2UgPSAobmFtZSwgbWV0YWRhdGEsIGFwaU5hbWVzcGFjZU9iaiwgLi4uYXJncykgPT4ge1xuICAgICAgICBpZiAoYXJncy5sZW5ndGggPCBtZXRhZGF0YS5taW5BcmdzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBhdCBsZWFzdCAke21ldGFkYXRhLm1pbkFyZ3N9ICR7cGx1cmFsaXplQXJndW1lbnRzKG1ldGFkYXRhLm1pbkFyZ3MpfSBmb3IgJHtuYW1lfSgpLCBnb3QgJHthcmdzLmxlbmd0aH1gKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYXJncy5sZW5ndGggPiBtZXRhZGF0YS5tYXhBcmdzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBhdCBtb3N0ICR7bWV0YWRhdGEubWF4QXJnc30gJHtwbHVyYWxpemVBcmd1bWVudHMobWV0YWRhdGEubWF4QXJncyl9IGZvciAke25hbWV9KCksIGdvdCAke2FyZ3MubGVuZ3RofWApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgY29uc3Qgd3JhcHBlZENiID0gd3JhcHBlZFNlbmRNZXNzYWdlQ2FsbGJhY2suYmluZChudWxsLCB7XG4gICAgICAgICAgICByZXNvbHZlLFxuICAgICAgICAgICAgcmVqZWN0XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgYXJncy5wdXNoKHdyYXBwZWRDYik7XG4gICAgICAgICAgYXBpTmFtZXNwYWNlT2JqLnNlbmRNZXNzYWdlKC4uLmFyZ3MpO1xuICAgICAgICB9KTtcbiAgICAgIH07XG4gICAgICBjb25zdCBzdGF0aWNXcmFwcGVycyA9IHtcbiAgICAgICAgZGV2dG9vbHM6IHtcbiAgICAgICAgICBuZXR3b3JrOiB7XG4gICAgICAgICAgICBvblJlcXVlc3RGaW5pc2hlZDogd3JhcEV2ZW50KG9uUmVxdWVzdEZpbmlzaGVkV3JhcHBlcnMpXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBydW50aW1lOiB7XG4gICAgICAgICAgb25NZXNzYWdlOiB3cmFwRXZlbnQob25NZXNzYWdlV3JhcHBlcnMpLFxuICAgICAgICAgIG9uTWVzc2FnZUV4dGVybmFsOiB3cmFwRXZlbnQob25NZXNzYWdlV3JhcHBlcnMpLFxuICAgICAgICAgIHNlbmRNZXNzYWdlOiB3cmFwcGVkU2VuZE1lc3NhZ2UuYmluZChudWxsLCBcInNlbmRNZXNzYWdlXCIsIHtcbiAgICAgICAgICAgIG1pbkFyZ3M6IDEsXG4gICAgICAgICAgICBtYXhBcmdzOiAzXG4gICAgICAgICAgfSlcbiAgICAgICAgfSxcbiAgICAgICAgdGFiczoge1xuICAgICAgICAgIHNlbmRNZXNzYWdlOiB3cmFwcGVkU2VuZE1lc3NhZ2UuYmluZChudWxsLCBcInNlbmRNZXNzYWdlXCIsIHtcbiAgICAgICAgICAgIG1pbkFyZ3M6IDIsXG4gICAgICAgICAgICBtYXhBcmdzOiAzXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGNvbnN0IHNldHRpbmdNZXRhZGF0YSA9IHtcbiAgICAgICAgY2xlYXI6IHtcbiAgICAgICAgICBtaW5BcmdzOiAxLFxuICAgICAgICAgIG1heEFyZ3M6IDFcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0OiB7XG4gICAgICAgICAgbWluQXJnczogMSxcbiAgICAgICAgICBtYXhBcmdzOiAxXG4gICAgICAgIH0sXG4gICAgICAgIHNldDoge1xuICAgICAgICAgIG1pbkFyZ3M6IDEsXG4gICAgICAgICAgbWF4QXJnczogMVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgYXBpTWV0YWRhdGEucHJpdmFjeSA9IHtcbiAgICAgICAgbmV0d29yazoge1xuICAgICAgICAgIFwiKlwiOiBzZXR0aW5nTWV0YWRhdGFcbiAgICAgICAgfSxcbiAgICAgICAgc2VydmljZXM6IHtcbiAgICAgICAgICBcIipcIjogc2V0dGluZ01ldGFkYXRhXG4gICAgICAgIH0sXG4gICAgICAgIHdlYnNpdGVzOiB7XG4gICAgICAgICAgXCIqXCI6IHNldHRpbmdNZXRhZGF0YVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgcmV0dXJuIHdyYXBPYmplY3QoZXh0ZW5zaW9uQVBJcywgc3RhdGljV3JhcHBlcnMsIGFwaU1ldGFkYXRhKTtcbiAgICB9O1xuXG4gICAgLy8gVGhlIGJ1aWxkIHByb2Nlc3MgYWRkcyBhIFVNRCB3cmFwcGVyIGFyb3VuZCB0aGlzIGZpbGUsIHdoaWNoIG1ha2VzIHRoZVxuICAgIC8vIGBtb2R1bGVgIHZhcmlhYmxlIGF2YWlsYWJsZS5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IHdyYXBBUElzKGNocm9tZSk7XG4gIH0gZWxzZSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBnbG9iYWxUaGlzLmJyb3dzZXI7XG4gIH1cbn0pO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9YnJvd3Nlci1wb2x5ZmlsbC5qcy5tYXBcbiIsImltcG9ydCBvcmlnaW5hbEJyb3dzZXIgZnJvbSBcIndlYmV4dGVuc2lvbi1wb2x5ZmlsbFwiO1xuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBvcmlnaW5hbEJyb3dzZXI7XG4iLCJmdW5jdGlvbiBwcmludChtZXRob2QsIC4uLmFyZ3MpIHtcbiAgaWYgKGltcG9ydC5tZXRhLmVudi5NT0RFID09PSBcInByb2R1Y3Rpb25cIikgcmV0dXJuO1xuICBpZiAodHlwZW9mIGFyZ3NbMF0gPT09IFwic3RyaW5nXCIpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gYXJncy5zaGlmdCgpO1xuICAgIG1ldGhvZChgW3d4dF0gJHttZXNzYWdlfWAsIC4uLmFyZ3MpO1xuICB9IGVsc2Uge1xuICAgIG1ldGhvZChcIlt3eHRdXCIsIC4uLmFyZ3MpO1xuICB9XG59XG5leHBvcnQgY29uc3QgbG9nZ2VyID0ge1xuICBkZWJ1ZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZGVidWcsIC4uLmFyZ3MpLFxuICBsb2c6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmxvZywgLi4uYXJncyksXG4gIHdhcm46ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLndhcm4sIC4uLmFyZ3MpLFxuICBlcnJvcjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZXJyb3IsIC4uLmFyZ3MpXG59O1xuIiwiaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gXCJ3eHQvYnJvd3NlclwiO1xuZXhwb3J0IGNsYXNzIFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgZXh0ZW5kcyBFdmVudCB7XG4gIGNvbnN0cnVjdG9yKG5ld1VybCwgb2xkVXJsKSB7XG4gICAgc3VwZXIoV3h0TG9jYXRpb25DaGFuZ2VFdmVudC5FVkVOVF9OQU1FLCB7fSk7XG4gICAgdGhpcy5uZXdVcmwgPSBuZXdVcmw7XG4gICAgdGhpcy5vbGRVcmwgPSBvbGRVcmw7XG4gIH1cbiAgc3RhdGljIEVWRU5UX05BTUUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIik7XG59XG5leHBvcnQgZnVuY3Rpb24gZ2V0VW5pcXVlRXZlbnROYW1lKGV2ZW50TmFtZSkge1xuICByZXR1cm4gYCR7YnJvd3Nlcj8ucnVudGltZT8uaWR9OiR7aW1wb3J0Lm1ldGEuZW52LkVOVFJZUE9JTlR9OiR7ZXZlbnROYW1lfWA7XG59XG4iLCJpbXBvcnQgeyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSBcIi4vY3VzdG9tLWV2ZW50cy5tanNcIjtcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVMb2NhdGlvbldhdGNoZXIoY3R4KSB7XG4gIGxldCBpbnRlcnZhbDtcbiAgbGV0IG9sZFVybDtcbiAgcmV0dXJuIHtcbiAgICAvKipcbiAgICAgKiBFbnN1cmUgdGhlIGxvY2F0aW9uIHdhdGNoZXIgaXMgYWN0aXZlbHkgbG9va2luZyBmb3IgVVJMIGNoYW5nZXMuIElmIGl0J3MgYWxyZWFkeSB3YXRjaGluZyxcbiAgICAgKiB0aGlzIGlzIGEgbm9vcC5cbiAgICAgKi9cbiAgICBydW4oKSB7XG4gICAgICBpZiAoaW50ZXJ2YWwgIT0gbnVsbCkgcmV0dXJuO1xuICAgICAgb2xkVXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcbiAgICAgIGludGVydmFsID0gY3R4LnNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgbGV0IG5ld1VybCA9IG5ldyBVUkwobG9jYXRpb24uaHJlZik7XG4gICAgICAgIGlmIChuZXdVcmwuaHJlZiAhPT0gb2xkVXJsLmhyZWYpIHtcbiAgICAgICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgV3h0TG9jYXRpb25DaGFuZ2VFdmVudChuZXdVcmwsIG9sZFVybCkpO1xuICAgICAgICAgIG9sZFVybCA9IG5ld1VybDtcbiAgICAgICAgfVxuICAgICAgfSwgMWUzKTtcbiAgICB9XG4gIH07XG59XG4iLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tIFwiLi4vLi4vc2FuZGJveC91dGlscy9sb2dnZXIubWpzXCI7XG5pbXBvcnQgeyBnZXRVbmlxdWVFdmVudE5hbWUgfSBmcm9tIFwiLi9jdXN0b20tZXZlbnRzLm1qc1wiO1xuaW1wb3J0IHsgY3JlYXRlTG9jYXRpb25XYXRjaGVyIH0gZnJvbSBcIi4vbG9jYXRpb24td2F0Y2hlci5tanNcIjtcbmV4cG9ydCBjbGFzcyBDb250ZW50U2NyaXB0Q29udGV4dCB7XG4gIGNvbnN0cnVjdG9yKGNvbnRlbnRTY3JpcHROYW1lLCBvcHRpb25zKSB7XG4gICAgdGhpcy5jb250ZW50U2NyaXB0TmFtZSA9IGNvbnRlbnRTY3JpcHROYW1lO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgdGhpcy5hYm9ydENvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgaWYgKHRoaXMuaXNUb3BGcmFtZSkge1xuICAgICAgdGhpcy5saXN0ZW5Gb3JOZXdlclNjcmlwdHMoeyBpZ25vcmVGaXJzdEV2ZW50OiB0cnVlIH0pO1xuICAgICAgdGhpcy5zdG9wT2xkU2NyaXB0cygpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmxpc3RlbkZvck5ld2VyU2NyaXB0cygpO1xuICAgIH1cbiAgfVxuICBzdGF0aWMgU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFID0gZ2V0VW5pcXVlRXZlbnROYW1lKFxuICAgIFwid3h0OmNvbnRlbnQtc2NyaXB0LXN0YXJ0ZWRcIlxuICApO1xuICBpc1RvcEZyYW1lID0gd2luZG93LnNlbGYgPT09IHdpbmRvdy50b3A7XG4gIGFib3J0Q29udHJvbGxlcjtcbiAgbG9jYXRpb25XYXRjaGVyID0gY3JlYXRlTG9jYXRpb25XYXRjaGVyKHRoaXMpO1xuICByZWNlaXZlZE1lc3NhZ2VJZHMgPSAvKiBAX19QVVJFX18gKi8gbmV3IFNldCgpO1xuICBnZXQgc2lnbmFsKCkge1xuICAgIHJldHVybiB0aGlzLmFib3J0Q29udHJvbGxlci5zaWduYWw7XG4gIH1cbiAgYWJvcnQocmVhc29uKSB7XG4gICAgcmV0dXJuIHRoaXMuYWJvcnRDb250cm9sbGVyLmFib3J0KHJlYXNvbik7XG4gIH1cbiAgZ2V0IGlzSW52YWxpZCgpIHtcbiAgICBpZiAoYnJvd3Nlci5ydW50aW1lLmlkID09IG51bGwpIHtcbiAgICAgIHRoaXMubm90aWZ5SW52YWxpZGF0ZWQoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuc2lnbmFsLmFib3J0ZWQ7XG4gIH1cbiAgZ2V0IGlzVmFsaWQoKSB7XG4gICAgcmV0dXJuICF0aGlzLmlzSW52YWxpZDtcbiAgfVxuICAvKipcbiAgICogQWRkIGEgbGlzdGVuZXIgdGhhdCBpcyBjYWxsZWQgd2hlbiB0aGUgY29udGVudCBzY3JpcHQncyBjb250ZXh0IGlzIGludmFsaWRhdGVkLlxuICAgKlxuICAgKiBAcmV0dXJucyBBIGZ1bmN0aW9uIHRvIHJlbW92ZSB0aGUgbGlzdGVuZXIuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGJyb3dzZXIucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoY2IpO1xuICAgKiBjb25zdCByZW1vdmVJbnZhbGlkYXRlZExpc3RlbmVyID0gY3R4Lm9uSW52YWxpZGF0ZWQoKCkgPT4ge1xuICAgKiAgIGJyb3dzZXIucnVudGltZS5vbk1lc3NhZ2UucmVtb3ZlTGlzdGVuZXIoY2IpO1xuICAgKiB9KVxuICAgKiAvLyAuLi5cbiAgICogcmVtb3ZlSW52YWxpZGF0ZWRMaXN0ZW5lcigpO1xuICAgKi9cbiAgb25JbnZhbGlkYXRlZChjYikge1xuICAgIHRoaXMuc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBjYik7XG4gICAgcmV0dXJuICgpID0+IHRoaXMuc2lnbmFsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBjYik7XG4gIH1cbiAgLyoqXG4gICAqIFJldHVybiBhIHByb21pc2UgdGhhdCBuZXZlciByZXNvbHZlcy4gVXNlZnVsIGlmIHlvdSBoYXZlIGFuIGFzeW5jIGZ1bmN0aW9uIHRoYXQgc2hvdWxkbid0IHJ1blxuICAgKiBhZnRlciB0aGUgY29udGV4dCBpcyBleHBpcmVkLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBjb25zdCBnZXRWYWx1ZUZyb21TdG9yYWdlID0gYXN5bmMgKCkgPT4ge1xuICAgKiAgIGlmIChjdHguaXNJbnZhbGlkKSByZXR1cm4gY3R4LmJsb2NrKCk7XG4gICAqXG4gICAqICAgLy8gLi4uXG4gICAqIH1cbiAgICovXG4gIGJsb2NrKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgoKSA9PiB7XG4gICAgfSk7XG4gIH1cbiAgLyoqXG4gICAqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cuc2V0SW50ZXJ2YWxgIHRoYXQgYXV0b21hdGljYWxseSBjbGVhcnMgdGhlIGludGVydmFsIHdoZW4gaW52YWxpZGF0ZWQuXG4gICAqL1xuICBzZXRJbnRlcnZhbChoYW5kbGVyLCB0aW1lb3V0KSB7XG4gICAgY29uc3QgaWQgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSBoYW5kbGVyKCk7XG4gICAgfSwgdGltZW91dCk7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNsZWFySW50ZXJ2YWwoaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgLyoqXG4gICAqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cuc2V0VGltZW91dGAgdGhhdCBhdXRvbWF0aWNhbGx5IGNsZWFycyB0aGUgaW50ZXJ2YWwgd2hlbiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHNldFRpbWVvdXQoaGFuZGxlciwgdGltZW91dCkge1xuICAgIGNvbnN0IGlkID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSBoYW5kbGVyKCk7XG4gICAgfSwgdGltZW91dCk7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNsZWFyVGltZW91dChpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWVgIHRoYXQgYXV0b21hdGljYWxseSBjYW5jZWxzIHRoZSByZXF1ZXN0IHdoZW5cbiAgICogaW52YWxpZGF0ZWQuXG4gICAqL1xuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoY2FsbGJhY2spIHtcbiAgICBjb25zdCBpZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSgoLi4uYXJncykgPT4ge1xuICAgICAgaWYgKHRoaXMuaXNWYWxpZCkgY2FsbGJhY2soLi4uYXJncyk7XG4gICAgfSk7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNhbmNlbEFuaW1hdGlvbkZyYW1lKGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RJZGxlQ2FsbGJhY2tgIHRoYXQgYXV0b21hdGljYWxseSBjYW5jZWxzIHRoZSByZXF1ZXN0IHdoZW5cbiAgICogaW52YWxpZGF0ZWQuXG4gICAqL1xuICByZXF1ZXN0SWRsZUNhbGxiYWNrKGNhbGxiYWNrLCBvcHRpb25zKSB7XG4gICAgY29uc3QgaWQgPSByZXF1ZXN0SWRsZUNhbGxiYWNrKCguLi5hcmdzKSA9PiB7XG4gICAgICBpZiAoIXRoaXMuc2lnbmFsLmFib3J0ZWQpIGNhbGxiYWNrKC4uLmFyZ3MpO1xuICAgIH0sIG9wdGlvbnMpO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjYW5jZWxJZGxlQ2FsbGJhY2soaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgYWRkRXZlbnRMaXN0ZW5lcih0YXJnZXQsIHR5cGUsIGhhbmRsZXIsIG9wdGlvbnMpIHtcbiAgICBpZiAodHlwZSA9PT0gXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIikge1xuICAgICAgaWYgKHRoaXMuaXNWYWxpZCkgdGhpcy5sb2NhdGlvbldhdGNoZXIucnVuKCk7XG4gICAgfVxuICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyPy4oXG4gICAgICB0eXBlLnN0YXJ0c1dpdGgoXCJ3eHQ6XCIpID8gZ2V0VW5pcXVlRXZlbnROYW1lKHR5cGUpIDogdHlwZSxcbiAgICAgIGhhbmRsZXIsXG4gICAgICB7XG4gICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgIHNpZ25hbDogdGhpcy5zaWduYWxcbiAgICAgIH1cbiAgICApO1xuICB9XG4gIC8qKlxuICAgKiBAaW50ZXJuYWxcbiAgICogQWJvcnQgdGhlIGFib3J0IGNvbnRyb2xsZXIgYW5kIGV4ZWN1dGUgYWxsIGBvbkludmFsaWRhdGVkYCBsaXN0ZW5lcnMuXG4gICAqL1xuICBub3RpZnlJbnZhbGlkYXRlZCgpIHtcbiAgICB0aGlzLmFib3J0KFwiQ29udGVudCBzY3JpcHQgY29udGV4dCBpbnZhbGlkYXRlZFwiKTtcbiAgICBsb2dnZXIuZGVidWcoXG4gICAgICBgQ29udGVudCBzY3JpcHQgXCIke3RoaXMuY29udGVudFNjcmlwdE5hbWV9XCIgY29udGV4dCBpbnZhbGlkYXRlZGBcbiAgICApO1xuICB9XG4gIHN0b3BPbGRTY3JpcHRzKCkge1xuICAgIHdpbmRvdy5wb3N0TWVzc2FnZShcbiAgICAgIHtcbiAgICAgICAgdHlwZTogQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFLFxuICAgICAgICBjb250ZW50U2NyaXB0TmFtZTogdGhpcy5jb250ZW50U2NyaXB0TmFtZSxcbiAgICAgICAgbWVzc2FnZUlkOiBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyKVxuICAgICAgfSxcbiAgICAgIFwiKlwiXG4gICAgKTtcbiAgfVxuICB2ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpIHtcbiAgICBjb25zdCBpc1NjcmlwdFN0YXJ0ZWRFdmVudCA9IGV2ZW50LmRhdGE/LnR5cGUgPT09IENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRTtcbiAgICBjb25zdCBpc1NhbWVDb250ZW50U2NyaXB0ID0gZXZlbnQuZGF0YT8uY29udGVudFNjcmlwdE5hbWUgPT09IHRoaXMuY29udGVudFNjcmlwdE5hbWU7XG4gICAgY29uc3QgaXNOb3REdXBsaWNhdGUgPSAhdGhpcy5yZWNlaXZlZE1lc3NhZ2VJZHMuaGFzKGV2ZW50LmRhdGE/Lm1lc3NhZ2VJZCk7XG4gICAgcmV0dXJuIGlzU2NyaXB0U3RhcnRlZEV2ZW50ICYmIGlzU2FtZUNvbnRlbnRTY3JpcHQgJiYgaXNOb3REdXBsaWNhdGU7XG4gIH1cbiAgbGlzdGVuRm9yTmV3ZXJTY3JpcHRzKG9wdGlvbnMpIHtcbiAgICBsZXQgaXNGaXJzdCA9IHRydWU7XG4gICAgY29uc3QgY2IgPSAoZXZlbnQpID0+IHtcbiAgICAgIGlmICh0aGlzLnZlcmlmeVNjcmlwdFN0YXJ0ZWRFdmVudChldmVudCkpIHtcbiAgICAgICAgdGhpcy5yZWNlaXZlZE1lc3NhZ2VJZHMuYWRkKGV2ZW50LmRhdGEubWVzc2FnZUlkKTtcbiAgICAgICAgY29uc3Qgd2FzRmlyc3QgPSBpc0ZpcnN0O1xuICAgICAgICBpc0ZpcnN0ID0gZmFsc2U7XG4gICAgICAgIGlmICh3YXNGaXJzdCAmJiBvcHRpb25zPy5pZ25vcmVGaXJzdEV2ZW50KSByZXR1cm47XG4gICAgICAgIHRoaXMubm90aWZ5SW52YWxpZGF0ZWQoKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIGFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIGNiKTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gcmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgY2IpKTtcbiAgfVxufVxuIiwiY29uc3QgbnVsbEtleSA9IFN5bWJvbCgnbnVsbCcpOyAvLyBgb2JqZWN0SGFzaGVzYCBrZXkgZm9yIG51bGxcblxubGV0IGtleUNvdW50ZXIgPSAwO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYW55S2V5c01hcCBleHRlbmRzIE1hcCB7XG5cdGNvbnN0cnVjdG9yKC4uLmFyZ3VtZW50c18pIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fb2JqZWN0SGFzaGVzID0gbmV3IFdlYWtNYXAoKTtcblx0XHR0aGlzLl9zeW1ib2xIYXNoZXMgPSBuZXcgTWFwKCk7IC8vIGh0dHBzOi8vZ2l0aHViLmNvbS90YzM5L2VjbWEyNjIvaXNzdWVzLzExOTRcblx0XHR0aGlzLl9wdWJsaWNLZXlzID0gbmV3IE1hcCgpO1xuXG5cdFx0Y29uc3QgW3BhaXJzXSA9IGFyZ3VtZW50c187IC8vIE1hcCBjb21wYXRcblx0XHRpZiAocGFpcnMgPT09IG51bGwgfHwgcGFpcnMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgcGFpcnNbU3ltYm9sLml0ZXJhdG9yXSAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcih0eXBlb2YgcGFpcnMgKyAnIGlzIG5vdCBpdGVyYWJsZSAoY2Fubm90IHJlYWQgcHJvcGVydHkgU3ltYm9sKFN5bWJvbC5pdGVyYXRvcikpJyk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBba2V5cywgdmFsdWVdIG9mIHBhaXJzKSB7XG5cdFx0XHR0aGlzLnNldChrZXlzLCB2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0X2dldFB1YmxpY0tleXMoa2V5cywgY3JlYXRlID0gZmFsc2UpIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoa2V5cykpIHtcblx0XHRcdHRocm93IG5ldyBUeXBlRXJyb3IoJ1RoZSBrZXlzIHBhcmFtZXRlciBtdXN0IGJlIGFuIGFycmF5Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJpdmF0ZUtleSA9IHRoaXMuX2dldFByaXZhdGVLZXkoa2V5cywgY3JlYXRlKTtcblxuXHRcdGxldCBwdWJsaWNLZXk7XG5cdFx0aWYgKHByaXZhdGVLZXkgJiYgdGhpcy5fcHVibGljS2V5cy5oYXMocHJpdmF0ZUtleSkpIHtcblx0XHRcdHB1YmxpY0tleSA9IHRoaXMuX3B1YmxpY0tleXMuZ2V0KHByaXZhdGVLZXkpO1xuXHRcdH0gZWxzZSBpZiAoY3JlYXRlKSB7XG5cdFx0XHRwdWJsaWNLZXkgPSBbLi4ua2V5c107IC8vIFJlZ2VuZXJhdGUga2V5cyBhcnJheSB0byBhdm9pZCBleHRlcm5hbCBpbnRlcmFjdGlvblxuXHRcdFx0dGhpcy5fcHVibGljS2V5cy5zZXQocHJpdmF0ZUtleSwgcHVibGljS2V5KTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge3ByaXZhdGVLZXksIHB1YmxpY0tleX07XG5cdH1cblxuXHRfZ2V0UHJpdmF0ZUtleShrZXlzLCBjcmVhdGUgPSBmYWxzZSkge1xuXHRcdGNvbnN0IHByaXZhdGVLZXlzID0gW107XG5cdFx0Zm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuXHRcdFx0Y29uc3Qga2V5VG9QYXNzID0ga2V5ID09PSBudWxsID8gbnVsbEtleSA6IGtleTtcblxuXHRcdFx0bGV0IGhhc2hlcztcblx0XHRcdGlmICh0eXBlb2Yga2V5VG9QYXNzID09PSAnb2JqZWN0JyB8fCB0eXBlb2Yga2V5VG9QYXNzID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdGhhc2hlcyA9ICdfb2JqZWN0SGFzaGVzJztcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGtleVRvUGFzcyA9PT0gJ3N5bWJvbCcpIHtcblx0XHRcdFx0aGFzaGVzID0gJ19zeW1ib2xIYXNoZXMnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGFzaGVzID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaGFzaGVzKSB7XG5cdFx0XHRcdHByaXZhdGVLZXlzLnB1c2goa2V5VG9QYXNzKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpc1toYXNoZXNdLmhhcyhrZXlUb1Bhc3MpKSB7XG5cdFx0XHRcdHByaXZhdGVLZXlzLnB1c2godGhpc1toYXNoZXNdLmdldChrZXlUb1Bhc3MpKTtcblx0XHRcdH0gZWxzZSBpZiAoY3JlYXRlKSB7XG5cdFx0XHRcdGNvbnN0IHByaXZhdGVLZXkgPSBgQEBta20tcmVmLSR7a2V5Q291bnRlcisrfUBAYDtcblx0XHRcdFx0dGhpc1toYXNoZXNdLnNldChrZXlUb1Bhc3MsIHByaXZhdGVLZXkpO1xuXHRcdFx0XHRwcml2YXRlS2V5cy5wdXNoKHByaXZhdGVLZXkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShwcml2YXRlS2V5cyk7XG5cdH1cblxuXHRzZXQoa2V5cywgdmFsdWUpIHtcblx0XHRjb25zdCB7cHVibGljS2V5fSA9IHRoaXMuX2dldFB1YmxpY0tleXMoa2V5cywgdHJ1ZSk7XG5cdFx0cmV0dXJuIHN1cGVyLnNldChwdWJsaWNLZXksIHZhbHVlKTtcblx0fVxuXG5cdGdldChrZXlzKSB7XG5cdFx0Y29uc3Qge3B1YmxpY0tleX0gPSB0aGlzLl9nZXRQdWJsaWNLZXlzKGtleXMpO1xuXHRcdHJldHVybiBzdXBlci5nZXQocHVibGljS2V5KTtcblx0fVxuXG5cdGhhcyhrZXlzKSB7XG5cdFx0Y29uc3Qge3B1YmxpY0tleX0gPSB0aGlzLl9nZXRQdWJsaWNLZXlzKGtleXMpO1xuXHRcdHJldHVybiBzdXBlci5oYXMocHVibGljS2V5KTtcblx0fVxuXG5cdGRlbGV0ZShrZXlzKSB7XG5cdFx0Y29uc3Qge3B1YmxpY0tleSwgcHJpdmF0ZUtleX0gPSB0aGlzLl9nZXRQdWJsaWNLZXlzKGtleXMpO1xuXHRcdHJldHVybiBCb29sZWFuKHB1YmxpY0tleSAmJiBzdXBlci5kZWxldGUocHVibGljS2V5KSAmJiB0aGlzLl9wdWJsaWNLZXlzLmRlbGV0ZShwcml2YXRlS2V5KSk7XG5cdH1cblxuXHRjbGVhcigpIHtcblx0XHRzdXBlci5jbGVhcigpO1xuXHRcdHRoaXMuX3N5bWJvbEhhc2hlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3B1YmxpY0tleXMuY2xlYXIoKTtcblx0fVxuXG5cdGdldCBbU3ltYm9sLnRvU3RyaW5nVGFnXSgpIHtcblx0XHRyZXR1cm4gJ01hbnlLZXlzTWFwJztcblx0fVxuXG5cdGdldCBzaXplKCkge1xuXHRcdHJldHVybiBzdXBlci5zaXplO1xuXHR9XG59XG4iLCJpbXBvcnQgTWFueUtleXNNYXAgZnJvbSAnbWFueS1rZXlzLW1hcCc7XG5pbXBvcnQgeyBkZWZ1IH0gZnJvbSAnZGVmdSc7XG5pbXBvcnQgeyBpc0V4aXN0IH0gZnJvbSAnLi9kZXRlY3RvcnMubWpzJztcblxuY29uc3QgZ2V0RGVmYXVsdE9wdGlvbnMgPSAoKSA9PiAoe1xuICB0YXJnZXQ6IGdsb2JhbFRoaXMuZG9jdW1lbnQsXG4gIHVuaWZ5UHJvY2VzczogdHJ1ZSxcbiAgZGV0ZWN0b3I6IGlzRXhpc3QsXG4gIG9ic2VydmVDb25maWdzOiB7XG4gICAgY2hpbGRMaXN0OiB0cnVlLFxuICAgIHN1YnRyZWU6IHRydWUsXG4gICAgYXR0cmlidXRlczogdHJ1ZVxuICB9LFxuICBzaWduYWw6IHZvaWQgMCxcbiAgY3VzdG9tTWF0Y2hlcjogdm9pZCAwXG59KTtcbmNvbnN0IG1lcmdlT3B0aW9ucyA9ICh1c2VyU2lkZU9wdGlvbnMsIGRlZmF1bHRPcHRpb25zKSA9PiB7XG4gIHJldHVybiBkZWZ1KHVzZXJTaWRlT3B0aW9ucywgZGVmYXVsdE9wdGlvbnMpO1xufTtcblxuY29uc3QgdW5pZnlDYWNoZSA9IG5ldyBNYW55S2V5c01hcCgpO1xuZnVuY3Rpb24gY3JlYXRlV2FpdEVsZW1lbnQoaW5zdGFuY2VPcHRpb25zKSB7XG4gIGNvbnN0IHsgZGVmYXVsdE9wdGlvbnMgfSA9IGluc3RhbmNlT3B0aW9ucztcbiAgcmV0dXJuIChzZWxlY3Rvciwgb3B0aW9ucykgPT4ge1xuICAgIGNvbnN0IHtcbiAgICAgIHRhcmdldCxcbiAgICAgIHVuaWZ5UHJvY2VzcyxcbiAgICAgIG9ic2VydmVDb25maWdzLFxuICAgICAgZGV0ZWN0b3IsXG4gICAgICBzaWduYWwsXG4gICAgICBjdXN0b21NYXRjaGVyXG4gICAgfSA9IG1lcmdlT3B0aW9ucyhvcHRpb25zLCBkZWZhdWx0T3B0aW9ucyk7XG4gICAgY29uc3QgdW5pZnlQcm9taXNlS2V5ID0gW1xuICAgICAgc2VsZWN0b3IsXG4gICAgICB0YXJnZXQsXG4gICAgICB1bmlmeVByb2Nlc3MsXG4gICAgICBvYnNlcnZlQ29uZmlncyxcbiAgICAgIGRldGVjdG9yLFxuICAgICAgc2lnbmFsLFxuICAgICAgY3VzdG9tTWF0Y2hlclxuICAgIF07XG4gICAgY29uc3QgY2FjaGVkUHJvbWlzZSA9IHVuaWZ5Q2FjaGUuZ2V0KHVuaWZ5UHJvbWlzZUtleSk7XG4gICAgaWYgKHVuaWZ5UHJvY2VzcyAmJiBjYWNoZWRQcm9taXNlKSB7XG4gICAgICByZXR1cm4gY2FjaGVkUHJvbWlzZTtcbiAgICB9XG4gICAgY29uc3QgZGV0ZWN0UHJvbWlzZSA9IG5ldyBQcm9taXNlKFxuICAgICAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0FzeW5jUHJvbWlzZUV4ZWN1dG9yOiBhdm9pZCBuZXN0aW5nIHByb21pc2VcbiAgICAgIGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgaWYgKHNpZ25hbD8uYWJvcnRlZCkge1xuICAgICAgICAgIHJldHVybiByZWplY3Qoc2lnbmFsLnJlYXNvbik7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcihcbiAgICAgICAgICBhc3luYyAobXV0YXRpb25zKSA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IF8gb2YgbXV0YXRpb25zKSB7XG4gICAgICAgICAgICAgIGlmIChzaWduYWw/LmFib3J0ZWQpIHtcbiAgICAgICAgICAgICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3QgZGV0ZWN0UmVzdWx0MiA9IGF3YWl0IGRldGVjdEVsZW1lbnQoe1xuICAgICAgICAgICAgICAgIHNlbGVjdG9yLFxuICAgICAgICAgICAgICAgIHRhcmdldCxcbiAgICAgICAgICAgICAgICBkZXRlY3RvcixcbiAgICAgICAgICAgICAgICBjdXN0b21NYXRjaGVyXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBpZiAoZGV0ZWN0UmVzdWx0Mi5pc0RldGVjdGVkKSB7XG4gICAgICAgICAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZGV0ZWN0UmVzdWx0Mi5yZXN1bHQpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBzaWduYWw/LmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAgICAgXCJhYm9ydFwiLFxuICAgICAgICAgICgpID0+IHtcbiAgICAgICAgICAgIG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgIHJldHVybiByZWplY3Qoc2lnbmFsLnJlYXNvbik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICB7IG9uY2U6IHRydWUgfVxuICAgICAgICApO1xuICAgICAgICBjb25zdCBkZXRlY3RSZXN1bHQgPSBhd2FpdCBkZXRlY3RFbGVtZW50KHtcbiAgICAgICAgICBzZWxlY3RvcixcbiAgICAgICAgICB0YXJnZXQsXG4gICAgICAgICAgZGV0ZWN0b3IsXG4gICAgICAgICAgY3VzdG9tTWF0Y2hlclxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKGRldGVjdFJlc3VsdC5pc0RldGVjdGVkKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUoZGV0ZWN0UmVzdWx0LnJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZSh0YXJnZXQsIG9ic2VydmVDb25maWdzKTtcbiAgICAgIH1cbiAgICApLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgdW5pZnlDYWNoZS5kZWxldGUodW5pZnlQcm9taXNlS2V5KTtcbiAgICB9KTtcbiAgICB1bmlmeUNhY2hlLnNldCh1bmlmeVByb21pc2VLZXksIGRldGVjdFByb21pc2UpO1xuICAgIHJldHVybiBkZXRlY3RQcm9taXNlO1xuICB9O1xufVxuYXN5bmMgZnVuY3Rpb24gZGV0ZWN0RWxlbWVudCh7XG4gIHRhcmdldCxcbiAgc2VsZWN0b3IsXG4gIGRldGVjdG9yLFxuICBjdXN0b21NYXRjaGVyXG59KSB7XG4gIGNvbnN0IGVsZW1lbnQgPSBjdXN0b21NYXRjaGVyID8gY3VzdG9tTWF0Y2hlcihzZWxlY3RvcikgOiB0YXJnZXQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gIHJldHVybiBhd2FpdCBkZXRlY3RvcihlbGVtZW50KTtcbn1cbmNvbnN0IHdhaXRFbGVtZW50ID0gY3JlYXRlV2FpdEVsZW1lbnQoe1xuICBkZWZhdWx0T3B0aW9uczogZ2V0RGVmYXVsdE9wdGlvbnMoKVxufSk7XG5cbmV4cG9ydCB7IGNyZWF0ZVdhaXRFbGVtZW50LCBnZXREZWZhdWx0T3B0aW9ucywgd2FpdEVsZW1lbnQgfTtcbiJdLCJuYW1lcyI6WyJkZWZpbml0aW9uIiwidGhpcyIsIm1vZHVsZSIsInByb3h5VGFyZ2V0IiwidmFsdWUiLCJyZXN1bHQiLCJtZXNzYWdlIiwicHJpbnQiLCJsb2dnZXIiXSwibWFwcGluZ3MiOiI7Ozs7O0FBQU8sV0FBUyxvQkFBb0JBLGFBQVk7QUFDOUMsV0FBT0E7QUFBQSxFQUNUO0FDWU8sUUFBTSxrQkFBaUM7QUFBQSxJQUM1QyxRQUFRO0FBQUEsSUFDUixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQXFETyxXQUFTLG1CQUFtQixVQUFrQztBQUNuRSxXQUNFLFNBQVMsVUFBVSxPQUNuQixTQUFTLFdBQVcsT0FDcEIsU0FBUyxjQUFjLE9BQ3ZCLFNBQVMsZUFBZSxPQUN4QixDQUFDLFNBQVM7QUFBQSxFQUVkO0FBTUEsUUFBTSxnQkFDSixPQUFPLGlCQUFpQixlQUN4QixhQUFhLFFBQVEsVUFBVSxNQUFNO0FBRWhDLFdBQVMsWUFBWSxNQUFhO0FBQ3ZDLFFBQUksZUFBZTtBQUNqQixjQUFRLElBQUksU0FBUyxHQUFHLElBQUk7QUFBQSxJQUM5QjtBQUFBLEVBQ0Y7O0VDaEZPLE1BQU0sZUFBZTtBQUFBLElBQXJCO0FBQ0wsMENBQW9DO0FBQzVCLGlFQUFzQixJQUFBO0FBQUE7QUFBQSxJ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
