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

      // Create and configure nodes
      const nodes = await this.createAudioNodes(mediaElement, settings);
      this.audioElementMap.set(mediaElement, nodes);

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

    console.log(
      `[AudioProcessor] Reconnecting nodes for ${
        nodes.element.src || "(no src)"
      } (always forcing full reconnection).`
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

    // Always apply settings
    await this.updateNodeSettings(nodes, settings);

    // Removed automatic playback restoration after connecting nodes.
    // Playback should be initiated by user gesture and handled by the content script's play listener.

    // console.log("AudioProcessor: Nodes connected successfully"); // Reduced logging
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
      "[AudioProcessor] Updating audio effects with settings (forcing full reconnection for all elements):",
      JSON.stringify(settings)
    );

    for (const [element, nodes] of this.audioElementMap.entries()) {
      try {
        // Call connectNodes, which now always performs a full reconnection
        await this.connectNodes(nodes, settings);

        console.log(
          `[AudioProcessor] Updated settings for element: ${
            element.src || "(no src)"
          }. Full reconnection performed.`
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
