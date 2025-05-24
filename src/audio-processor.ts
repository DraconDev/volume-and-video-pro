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
  currentSrc: string; // Track the src that the source node was created with
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

      // Check if the media element is ready to be used as an audio source
      // HTMLMediaElement.HAVE_METADATA (1) means enough data is available that the duration of the resource is available.
      // createMediaElementSource typically requires at least HAVE_METADATA.
      if (mediaElement.readyState < HTMLMediaElement.HAVE_METADATA) {
        console.warn(
          `AudioProcessor: Media element ${mediaElement.src || "(no src)"} is not ready (readyState: ${mediaElement.readyState}). Deferring audio context setup.`
        );
        return; // Defer processing until the element is ready
      }

      // Initialize audio context if needed
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
        // Resume will be called later after a user gesture
      }

      let nodes = this.audioElementMap.get(mediaElement);

      if (nodes) {
        console.log(
          `[AudioProcessor] Reusing existing audio nodes for element: ${
            mediaElement.src || "(no src)"
          }`
        );
        // Check if the media source has changed OR if the source node is somehow null
        if (this.audioContext && (nodes.currentSrc !== mediaElement.src || !nodes.source)) {
          console.log(
            `[AudioProcessor] Media source changed from ${
              nodes.currentSrc
            } to ${mediaElement.src || "(no src)"} or source invalid. Recreating source node.`
          );
          if (nodes.source) {
            // If old source exists, disconnect it fully
            try {
              nodes.source.disconnect();
            } catch (e) {
              /* Ignore disconnect errors if already disconnected or invalid */
            }
          }
          nodes.source = this.audioContext.createMediaElementSource(mediaElement);
          nodes.currentSrc = mediaElement.src;
        }
        // nodes.mono will be updated by connectNodes based on settings.mono

        // connectNodes will now handle full disconnection of the downstream graph and reconnection.
        await this.connectNodes(nodes, settings);
      } else {
        console.log(
          `[AudioProcessor] Creating new audio nodes for element: ${
            mediaElement.src || "(no src)"
          }`
        );
        // Create and configure new nodes
        // createAudioNodes calls connectNodes internally, which will build the graph.
        nodes = await this.createAudioNodes(mediaElement, settings);
        this.audioElementMap.set(mediaElement, nodes);
        // No need to call connectNodes again here, as createAudioNodes does it.
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
      mono: settings.mono, // Initialize mono setting, connectNodes will use settings.mono
      currentSrc: mediaElement.src, // Initialize currentSrc
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
    const { source, bassFilter, voiceFilter, gain, splitter, merger, context, element } =
      nodes;

    console.log(
      `[AudioProcessor] Connecting/Reconnecting nodes for ${
        element.src || "(no src)"
      }. Target Mono: ${settings.mono}, Current Node Mono: ${nodes.mono}`
    );

    // Log the current mono state before potential change
    console.log(
      `[AudioProcessor] connectNodes: Current mono state for element: ${nodes.mono}, Target mono state: ${settings.mono}`
    );

    // Disconnect all nodes from their outputs to ensure a clean slate before re-connecting.
    // It's crucial to disconnect the source first from its previous connections,
    // then other nodes in any order, as long as they are disconnected from their outputs.
    const safeDisconnect = (node: AudioNode | null) => {
      if (node) {
        try {
          // Disconnect all connections from this node
          node.disconnect();
        } catch (e) {
          // console.warn(`[AudioProcessor] Error disconnecting node:`, e); // Optional: for debugging
        }
      }
    };

    // Disconnect all nodes from their outputs. Order matters for preventing errors,
    // but less so if we disconnect all outputs from a node.
    // Disconnecting source first ensures it's not connected to a stale graph.
    safeDisconnect(source);
    safeDisconnect(bassFilter);
    safeDisconnect(voiceFilter);
    safeDisconnect(splitter);
    safeDisconnect(merger);
    safeDisconnect(gain);

    // Ensure source is valid before proceeding
    if (!source) {
      console.error(
        "[AudioProcessor] Source node is null in connectNodes. Cannot connect graph."
      );
      // Attempt to apply settings to avoid further errors, though graph is broken.
      await this.updateNodeSettings(nodes, settings);
      return; // Cannot proceed with connections
    }


    // Create new connections based on current settings
    if (settings.mono) {
      source.connect(bassFilter);
      bassFilter.connect(voiceFilter);
      voiceFilter.connect(splitter);
      splitter.connect(merger, 0, 0); // Connect left channel of splitter to left input of merger
      splitter.connect(merger, 0, 1); // Connect left channel of splitter to right input of merger (mono)
      merger.connect(gain);
    } else { // Stereo
      source.connect(bassFilter);
      bassFilter.connect(voiceFilter);
      voiceFilter.connect(gain);
    }
    gain.connect(context.destination);

    // Update the stored mono setting for this element to reflect the applied setting
    nodes.mono = settings.mono;

    // Always apply/update other audio parameters
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
        console.log(
          `[AudioProcessor] Element ${
            element.src || "(no src)"
          } is no longer connected to DOM. Disconnecting and removing.`
        );
        this.disconnectElementNodes(element); // Clean up disconnected elements
        continue;
      }

      try {
        // Call setupAudioContext, which now handles reusing existing nodes and reconnecting them
        await this.setupAudioContext(element, settings);

        console.log(
          `[AudioProcessor] Updated settings for element: ${
            element.src || "(no src)"
          }.`
        );
      } catch (error) {
        console.error(
          "AudioProcessor: Update failed for element:",
          element.src,
          error
        );
        // If update fails, do NOT disconnect the element nodes, as they should remain reusable.
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
