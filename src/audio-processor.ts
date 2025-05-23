import { AudioSettings } from "./types";

export interface AudioNodes {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  bassFilter: BiquadFilterNode;
  voiceFilter: BiquadFilterNode;
  merger: ChannelMergerNode;
  splitter: ChannelSplitterNode;
  element: HTMLMediaElement;
  mono: boolean; // Track the current mono setting for this element
}

export class AudioProcessor {
  audioContext: AudioContext | null = null;
  private audioElementMap = new Map<HTMLMediaElement, AudioNodes>();

  async setupAudioContext(
    mediaElement: HTMLMediaElement,
    settings: AudioSettings
  ): Promise<void> {
    try {
      console.log(
        "AudioProcessor: Setting up audio context with settings:",
        settings
      );

      // Initialize audio context if needed
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
        // Resume will be called later after a user gesture
      }

      let nodes = this.audioElementMap.get(mediaElement);

      if (nodes) {
        console.log(`[AudioProcessor] Reusing existing audio nodes for element: ${mediaElement.src || "(no src)"}`);
        // Disconnect existing connections before re-connecting with new settings
        // This is crucial to prevent multiple connections or stale paths
        const safeDisconnect = (node: AudioNode) => {
          try {
            node.disconnect();
          } catch (e) { /* Ignore disconnect errors */ }
        };
        safeDisconnect(nodes.gain);
        safeDisconnect(nodes.voiceFilter);
        safeDisconnect(nodes.bassFilter);
        safeDisconnect(nodes.splitter);
        safeDisconnect(nodes.merger);
        // Do NOT disconnect nodes.source here, as we are reusing it.
        // Its output will be reconnected.

        // Update mono setting if it changed, as it affects connections
        nodes.mono = settings.mono;

        // Reconnect nodes with potentially updated mono setting and apply new audio parameters
        await this.connectNodes(nodes, settings);

      } else {
        console.log(`[AudioProcessor] Creating new audio nodes for element: ${mediaElement.src || "(no src)"}`);
        // Create and configure new nodes
        nodes = await this.createAudioNodes(mediaElement, settings);
        this.audioElementMap.set(mediaElement, nodes);
      }

      console.log("AudioProcessor: Setup complete for:", mediaElement.src);
    } catch (error) {
      console.error("AudioProcessor: Setup failed:", error);
      throw error;
    }
  }

  private async createAudioNodes(
    mediaElement: HTMLMediaElement,
    settings: AudioSettings
  ): Promise<AudioNodes> {
    if (!this.audioContext) {
      throw new Error("AudioContext not initialized");
    }

    // Create nodes
    const source = this.audioContext.createMediaElementSource(mediaElement);
    const gain = this.audioContext.createGain();
    const bassFilter = this.audioContext.createBiquadFilter();
    const voiceFilter = this.audioContext.createBiquadFilter();
    const splitter = this.audioContext.createChannelSplitter(2);
    const merger = this.audioContext.createChannelMerger(2);

    // Configure filters
    bassFilter.type = "lowshelf";
    bassFilter.frequency.value = 100;
    voiceFilter.type = "peaking";
    voiceFilter.frequency.value = 2000;
    voiceFilter.Q.value = 1;

    const nodes: AudioNodes = {
      context: this.audioContext,
      source,
      gain,
      bassFilter,
      voiceFilter,
      splitter,
      merger,
      element: mediaElement,
      mono: settings.mono, // Initialize mono setting
    };

    // Connect nodes based on settings
    await this.connectNodes(nodes, settings);

    return nodes;
  }

  private async updateNodeSettings(
    nodes: AudioNodes,
    settings: AudioSettings
  ): Promise<void> {
    const { gain, bassFilter, voiceFilter, context, element } = nodes; // Added element

    try {
      const safeTimeValue = isFinite(context.currentTime)
        ? context.currentTime
        : 0;

      // Determine target volume for element and gain node
      let elementVolume = 1.0; // Default to max for element
      let gainNodeVolume = 1.0; // Default gain

      if (settings.volume <= 100) {
        // If volume is 100% or less, control via element.volume
        elementVolume = Math.max(0, settings.volume) / 100;
        gainNodeVolume = 1.0; // Keep GainNode neutral
      } else {
        // If volume is > 100%, set element volume to max and use GainNode for boost
        elementVolume = 1.0;
        gainNodeVolume = Math.max(1, Math.min(settings.volume, 1000)) / 100; // Apply boost via GainNode
      }

      // Apply element volume immediately (does not require user gesture)
      if (isFinite(elementVolume)) {
        element.volume = elementVolume;
      }

      // Clamp values for filters
      const clampedBass = Math.max(
        -15,
        Math.min(((settings.bassBoost - 100) / 100) * 15, 15)
      );
      const clampedVoice = Math.max(
        -24,
        Math.min(((settings.voiceBoost - 100) / 100) * 24, 24)
      );

      // Update Web Audio API parameters using setTargetAtTime for potentially more robust application
      const timeConstant = 0.01; // Apply quickly
      const currentTime = context.currentTime; // Use current context time as start time

      // Set immediate value
      gain.gain.value = gainNodeVolume;

      bassFilter.gain.value = clampedBass;

      voiceFilter.gain.value = clampedVoice;

      // ADDED LOGS: Log the values being applied to the nodes
      console.log(
        `[AudioProcessor] Applying Node Settings (immediate + setTargetAtTime) at ${currentTime}:`,
        {
          elementVolume: element.volume, // Log the directly set element volume
          targetGainNodeVolume: gainNodeVolume, // Log target values
          targetBassGain: clampedBass,
          targetVoiceGain: clampedVoice,
          voiceGain: clampedVoice,
          mono: settings.mono, // Log mono setting as it affects connections
        }
      );

      // console.log("AudioProcessor: Settings updated successfully", { // Reduced logging
      //   volume: clampedVolume,
      //   bass: clampedBass,
      //   voice: clampedVoice,
      //   mono: settings.mono,
      // });
    } catch (error) {
      console.error("AudioProcessor: Failed to update settings:", error);
      throw error;
    }
  }

  private async connectNodes(
    nodes: AudioNodes,
    settings: AudioSettings
  ): Promise<void> {
    const { source, bassFilter, voiceFilter, gain, splitter, merger, context } =
      nodes;

    // Check if the mono setting has changed, which requires a full reconnection
    const monoSettingChanged = nodes.mono !== settings.mono;

    if (monoSettingChanged) {
      console.log(
        `[AudioProcessor] Reconnecting nodes for ${
          nodes.element.src || "(no src)"
        } due to mono setting change (from ${nodes.mono} to ${settings.mono}).`
      );

      // Use try/catch for each disconnect to handle cases where nodes aren't connected
      const safeDisconnect = (node: AudioNode) => {
        try {
          node.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      };

      // Disconnect existing connections
      safeDisconnect(gain);
      safeDisconnect(voiceFilter);
      safeDisconnect(bassFilter);
      safeDisconnect(splitter);
      safeDisconnect(merger);
      safeDisconnect(source);

      // Create new connections based on settings
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

      // Update the stored mono setting for this element
      nodes.mono = settings.mono;
    } else {
      console.log(
        `[AudioProcessor] Not re-connecting nodes for ${
          nodes.element.src || "(no src)"
        }. Only updating settings.`
      );
    }

    // Always apply settings, whether nodes were reconnected or not
    await this.updateNodeSettings(nodes, settings);
  }

  /**
   * Disconnects audio nodes for a specific element and removes it from the map.
   * @param element The HTMLMediaElement to disconnect.
   * @returns True if nodes were found and disconnected, false otherwise.
   */
  public disconnectElementNodes(element: HTMLMediaElement): boolean {
    const nodes = this.audioElementMap.get(element);
    if (!nodes) return false;

    console.log(
      `[AudioProcessor] Disconnecting nodes for element: ${
        element.src || "(no src)"
      }`
    ); // ADDED LOG

    try {
      // Safely disconnect each node
      const safeDisconnect = (node: AudioNode) => {
        try {
          node.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      };

      safeDisconnect(nodes.gain);
      safeDisconnect(nodes.voiceFilter);
      safeDisconnect(nodes.bassFilter);
      safeDisconnect(nodes.splitter);
      safeDisconnect(nodes.merger);
      safeDisconnect(nodes.source);

      // Explicitly nullify references to help garbage collection
      nodes.source = null as any;
      nodes.gain = null as any;
      nodes.bassFilter = null as any;
      nodes.voiceFilter = null as any;
      nodes.splitter = null as any;
      nodes.merger = null as any;
      // Do not nullify context or element as they are managed elsewhere

      this.audioElementMap.delete(element);
      return true; // Indicate success
    } catch (error) {
      console.error(
        `AudioProcessor: Error disconnecting nodes for ${
          element.src || "(no src)"
        }:`,
        error
      );
      // Attempt to remove from map even if disconnect failed partially
      this.audioElementMap.delete(element);
      return false; // Indicate failure
    }
  }

  // Keep the old private method for resetAllToDisabled for now, or refactor resetAllToDisabled to use the public one.
  private disconnectAudioNodes(element: HTMLMediaElement): void {
    this.disconnectElementNodes(element); // Just call the public version
  }

  async updateAudioEffects(settings: AudioSettings): Promise<void> {
    console.log(
      "[AudioProcessor] Updating audio effects with settings:",
      JSON.stringify(settings)
    );

    for (const [element, nodes] of this.audioElementMap.entries()) {
      // Check if the element is still connected to the DOM before processing
      if (!element.isConnected) {
        console.log(`[AudioProcessor] Element ${element.src || "(no src)"} is no longer connected to DOM. Disconnecting and removing.`);
        this.disconnectElementNodes(element); // Clean up disconnected elements
        continue;
      }

      const wasPlaying = !element.paused;
      const currentTime = element.currentTime; // Store current time

      try {
        if (wasPlaying) {
          console.log(`[AudioProcessor] Pausing element ${element.src || "(no src)"} temporarily for audio effect update.`);
          element.pause();
        }

        // Call setupAudioContext, which now handles reusing existing nodes and reconnecting them
        await this.setupAudioContext(element, settings);

        console.log(
          `[AudioProcessor] Updated settings for element: ${
            element.src || "(no src)"
          }.`
        );

        if (wasPlaying) {
          console.log(`[AudioProcessor] Resuming element ${element.src || "(no src)"} after audio effect update.`);
          // Restore current time before playing to avoid seeking issues
          element.currentTime = currentTime;
          // Add a small delay before attempting to play
          await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
          await element.play();
        }
      } catch (error) {
        console.error(
          "AudioProcessor: Update failed for element:",
          element.src,
          error
        );
        // If update fails, do NOT disconnect the element nodes, as they should remain reusable.
        // The AbortError from play() is often benign and doesn't require tearing down the graph.
        // this.disconnectElementNodes(element); // REMOVED: This was causing the InvalidStateError on subsequent attempts.
      }
    }
  }

  async resetAllToDisabled(): Promise<void> {
    // Reset all audio contexts and disconnect nodes
    this.audioElementMap.forEach((nodes, element) => {
      this.disconnectAudioNodes(element);
      // Don't close context here, let cleanup handle it or reuse it
      // nodes.context.close();
    });
    this.audioElementMap.clear();
  }

  hasProcessing(mediaElement: HTMLMediaElement): boolean {
    return this.audioElementMap.has(mediaElement);
  }

  cleanup(): void {
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
  async tryResumeContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
        console.log("AudioProcessor: AudioContext resumed successfully.");
      } catch (error) {
        console.error("AudioProcessor: Failed to resume AudioContext:", error);
      }
    } else if (this.audioContext) {
      // console.log(`AudioProcessor: AudioContext state is already "${this.audioContext.state}", no resume needed.`); // Reduced logging
    }
  }
} // End of AudioProcessor class
