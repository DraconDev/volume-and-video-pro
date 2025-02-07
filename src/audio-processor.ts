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
}

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
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
        await this.audioContext.resume();
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
    };

    // Connect nodes based on settings
    await this.connectNodes(nodes, settings);

    return nodes;
  }

  private async updateNodeSettings(
    nodes: AudioNodes,
    settings: AudioSettings
  ): Promise<void> {
    const { gain, bassFilter, voiceFilter, context } = nodes;

    try {
      const safeTimeValue = isFinite(context.currentTime)
        ? context.currentTime
        : 0;

      // Clamp values to prevent invalid audio settings
      const clampedVolume = Math.max(0, Math.min(settings.volume, 1000)) / 100;
      const clampedBass = Math.max(
        -15,
        Math.min(((settings.bassBoost - 100) / 100) * 15, 15)
      );
      const clampedVoice = Math.max(
        -24,
        Math.min(((settings.voiceBoost - 100) / 100) * 24, 24)
      );

      // Update parameters immediately without transitions to avoid audio glitches
      gain.gain.setValueAtTime(clampedVolume, safeTimeValue);
      bassFilter.gain.setValueAtTime(clampedBass, safeTimeValue);
      voiceFilter.gain.setValueAtTime(clampedVoice, safeTimeValue);

      console.log("AudioProcessor: Settings updated successfully", {
        volume: clampedVolume,
        bass: clampedBass,
        voice: clampedVoice,
        mono: settings.mono,
      });
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

    try {
      const wasPlaying = !nodes.element.paused;
      const currentTime = nodes.element.currentTime;

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

      // Apply settings
      await this.updateNodeSettings(nodes, settings);

      // Restore playback state
      if (wasPlaying) {
        try {
          await nodes.element.play();
        } catch (e) {
          console.error("AudioProcessor: Failed to restore playback:", e);
        }
      }

      console.log("AudioProcessor: Nodes connected successfully");
    } catch (error) {
      console.error("AudioProcessor: Failed to connect nodes:", error);
      throw error;
    }
  }

  async updateAudioEffects(settings: AudioSettings): Promise<void> {
    console.log(
      "AudioProcessor: Updating audio effects with settings:",
      settings
    );

    for (const [element, nodes] of this.audioElementMap.entries()) {
      try {
        await this.updateNodeSettings(nodes, settings);
        console.log(
          "AudioProcessor: Updated effects for element:",
          element.src
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
      nodes.context.close();
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
}
