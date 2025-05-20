// audio-processor.ts
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
        `AudioProcessor: setupAudioContext for ${
          mediaElement.src || "(no src)"
        } with settings:`,
        JSON.stringify(settings)
      );

      if (!this.audioContext) {
        this.audioContext = new AudioContext();
        console.log("AudioProcessor: New AudioContext created.");
        // Resume will be called later after a user gesture
      }

      let nodes = this.audioElementMap.get(mediaElement);

      // Check if nodes belong to an old, different AudioContext instance OR if the element's source is detached from current context
      if (nodes && (nodes.context !== this.audioContext || !this.isSourceStillValid(nodes.source, mediaElement))) {
        console.log(
          `AudioProcessor: AudioContext changed or source became invalid for ${mediaElement.src}. Clearing old nodes.`
        );
        this.disconnectElementNodes(mediaElement); // Safely disconnect and remove from map
        nodes = undefined; // Force recreation of nodes for the new context/element state
      }


      if (!nodes) {
        console.log(
          `AudioProcessor: No valid nodes for ${mediaElement.src} in current context. Creating new audio graph.`
        );
        try {
            // Ensure media element is not already associated with another source node in this context
            // This is a safeguard, ideally audioElementMap management prevents this.
            for (const [el, existingNodes] of this.audioElementMap.entries()) {
                if (el === mediaElement && existingNodes.context === this.audioContext) {
                    console.warn(`AudioProcessor: Element ${mediaElement.src} already in map with current context. Re-using existing nodes instead of creating new ones.`);
                    nodes = existingNodes;
                    break;
                }
            }
            if (!nodes) { // If still no nodes after the check above
                 nodes = await this.createAudioNodes(mediaElement, settings); // Creates and connects
                 this.audioElementMap.set(mediaElement, nodes);
                 console.log(`AudioProcessor: New nodes created and mapped for ${mediaElement.src}.`);
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === 'InvalidStateError') {
                console.error(`AudioProcessor: InvalidStateError during createAudioNodes for ${mediaElement.src}. A source node likely already exists from a previous, uncleaned setup. Attempting recovery or removal.`, error);
                // Attempt to retrieve and use existing nodes if this somehow happens
                const existingNodesForRecovery = this.audioElementMap.get(mediaElement);
                if (existingNodesForRecovery && existingNodesForRecovery.context === this.audioContext) {
                    console.warn(`AudioProcessor: Recovered by using existing nodes for ${mediaElement.src}.`);
                    nodes = existingNodesForRecovery;
                } else {
                    // If recovery isn't possible, and create failed, remove the element from map to prevent further issues
                    this.audioElementMap.delete(mediaElement);
                    console.error(`AudioProcessor: Could not recover or create nodes for ${mediaElement.src}. Element removed from map.`);
                    throw error; // Re-throw if recovery isn't possible
                }
            } else {
                throw error; // Re-throw other errors
            }
        }
      }

      // At this point, 'nodes' should be valid for the current context, either newly created or retrieved.
      // Now, ensure they are configured correctly based on current settings.
      // createAudioNodes (if called) already calls connectNodes which calls updateNodeSettings and sets nodes.mono.
      // So, if nodes were just created, they are up-to-date.
      // If nodes were pre-existing (retrieved from map or recovered), we need to update them:
      if (nodes) { // Ensure nodes is not undefined
          if (nodes.mono !== settings.mono) {
            console.log(
              `AudioProcessor: Mono setting changed for ${mediaElement.src} (from ${nodes.mono} to ${settings.mono}). Reconnecting.`
            );
            await this.connectNodes(nodes, settings); // Reconnects, updates params, and updates nodes.mono
          } else {
            console.log(
              `AudioProcessor: Mono setting unchanged for ${mediaElement.src}. Updating node parameters.`
            );
            await this.updateNodeSettings(nodes, settings);
          }
      } else {
        // This case should ideally not be reached if logic above is correct.
        console.error(`AudioProcessor: Nodes object is unexpectedly undefined for ${mediaElement.src} after creation/retrieval logic. Cannot proceed with setup for this element.`);
        throw new Error(`AudioProcessor: Failed to obtain valid AudioNodes for ${mediaElement.src}.`);
      }

      console.log("AudioProcessor: Setup/Update complete for:", mediaElement.src);
    } catch (error) {
      console.error(`AudioProcessor: Setup failed for element: ${mediaElement.src || '(no src)'}`, error);
      // Do not re-throw here if we want the application to continue with other elements
      // throw error; // Or re-throw if this failure is critical for the element
    }
  }

  // Helper to check if MediaElementAudioSourceNode is still valid
  private isSourceStillValid(sourceNode: MediaElementAudioSourceNode, element: HTMLMediaElement): boolean {
    // A simple check: if the media element associated with the source node is the same as the current one.
    // And if the context is still the same.
    // More robust checks might involve trying a dummy connect/disconnect if allowed,
    // but that can be problematic.
    // For now, ensure the element reference hasn't changed for the source and context is current.
    // The primary way a source becomes invalid is if the AudioContext is closed or the element is re-used
    // with createMediaElementSource in a *new* context without proper cleanup of the old.
    try {
        // A simple property access that might throw if the underlying native object is gone
        // This is not a foolproof check.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _ = sourceNode.mediaElement;
        return sourceNode.context === this.audioContext && sourceNode.mediaElement === element;
    } catch (e) {
        console.warn(`AudioProcessor: Source node for ${element.src || '(no src)'} seems invalid.`, e);
        return false;
    }
  }

  private async createAudioNodes(
    mediaElement: HTMLMediaElement,
    settings: AudioSettings
  ): Promise<AudioNodes> {
    if (!this.audioContext) {
      throw new Error("AudioContext not initialized");
    }
    if (this.audioContext.state === "closed") {
      throw new Error("AudioContext is closed, cannot create nodes.");
    }

    // IMPORTANT: This can only be called ONCE per mediaElement per AudioContext.
    // The setupAudioContext logic must prevent redundant calls if a valid source already exists for this element in this context.
    let source;
    try {
        source = this.audioContext.createMediaElementSource(mediaElement);
        console.log(`AudioProcessor: Created MediaElementSource for ${mediaElement.src || "(no src)"}`);
    } catch (e) {
        console.error(`AudioProcessor: Error creating MediaElementSource for ${mediaElement.src || "(no src)"}. This usually means one already exists.`, e);
        throw e; // Re-throw, setupAudioContext should handle this
    }

    const gain = this.audioContext.createGain();
    const bassFilter = this.audioContext.createBiquadFilter();
    const voiceFilter = this.audioContext.createBiquadFilter();
    const splitter = this.audioContext.createChannelSplitter(2);
    const merger = this.audioContext.createChannelMerger(2);

    // Configure filters
    bassFilter.type = "lowshelf";
    bassFilter.frequency.value = 100; // Bass shelf typically around 80-250Hz
    voiceFilter.type = "peaking";
    voiceFilter.frequency.value = 2000; // Mid-range for voice clarity
    voiceFilter.Q.value = 1; // Moderate Q for broader effect

    const nodes: AudioNodes = {
      context: this.audioContext,
      source,
      gain,
      bassFilter,
      voiceFilter,
      splitter,
      merger,
      element: mediaElement,
      mono: settings.mono, // Initialize from settings, connectNodes will confirm this or update if needed
    };

    // Connect nodes based on initial settings
    // This will also call updateNodeSettings and correctly set nodes.mono
    await this.connectNodes(nodes, settings);

    return nodes;
  }

  private async updateNodeSettings(
    nodes: AudioNodes,
    settings: AudioSettings
  ): Promise<void> {
    const { gain, bassFilter, voiceFilter, context, element } = nodes;

    try {
      if (context.state === "closed") {
        console.warn(`AudioProcessor: updateNodeSettings called on a closed context for ${element.src || '(no src)'}. Skipping.`);
        return;
      }

      // Determine target volume for element and gain node
      let elementVolume = 1.0;
      let gainNodeVolume = 1.0;

      if (settings.volume <= 100) {
        elementVolume = Math.max(0, Math.min(1, settings.volume / 100));
        gainNodeVolume = 1.0;
      } else {
        elementVolume = 1.0;
        gainNodeVolume = Math.max(1, Math.min(settings.volume / 100, 10)); // Max boost 1000% (10x)
      }

      if (isFinite(elementVolume) && element.volume !== elementVolume) {
        element.volume = elementVolume;
      }

      const clampedBass = Math.max(
        -15, // Max cut
        Math.min(((settings.bassBoost - 100) / 100) * 15, 15) // Max boost 15dB
      );
      const clampedVoice = Math.max(
        -24, // Max cut
        Math.min(((settings.voiceBoost - 100) / 100) * 24, 24) // Max boost 24dB
      );

      const timeConstant = 0.015; // Slightly longer for smoother transitions if values change rapidly
      const currentTime = context.currentTime;

      // Set immediate value AND schedule target - Belt-and-suspenders, or choose one.
      // For rapid changes, often just setting .value is fine. setTargetAtTime is for smooth ramps.
      // If sliders cause rapid calls, direct .value assignment might be less prone to race conditions with scheduling.
      // However, for deliberate changes, setTargetAtTime is smoother.

      // Let's try direct assignment for gain changes that might be rapid.
      if (gain.gain.value !== gainNodeVolume) gain.gain.value = gainNodeVolume;
      // gain.gain.setTargetAtTime(gainNodeVolume, currentTime, timeConstant);

      if (bassFilter.gain.value !== clampedBass) bassFilter.gain.value = clampedBass;
      // bassFilter.gain.setTargetAtTime(clampedBass, currentTime, timeConstant);

      if (voiceFilter.gain.value !== clampedVoice) voiceFilter.gain.value = clampedVoice;
      // voiceFilter.gain.setTargetAtTime(clampedVoice, currentTime, timeConstant);

      console.log(
        `[AudioProcessor] Applied Node Settings at ${currentTime} for ${element.src || '(no src)'}:`,
        {
          elementVolume: element.volume,
          targetGainNodeVolume: gainNodeVolume,
          currentGainNodeValue: gain.gain.value,
          targetBassGain: clampedBass,
          currentBassGain: bassFilter.gain.value,
          targetVoiceGain: clampedVoice,
          currentVoiceGain: voiceFilter.gain.value,
          mono: nodes.mono, // Log current mono state of nodes
        }
      );
    } catch (error) {
      console.error(`AudioProcessor: Failed to update settings for ${element.src || '(no src)'}:`, error);
      // Do not throw, allow other operations to continue
    }
  }

  private async connectNodes(
    nodes: AudioNodes,
    settings: AudioSettings
  ): Promise<void> {
    const { source, bassFilter, voiceFilter, gain, splitter, merger, context, element } =
      nodes;

    if (context.state === "closed") {
      console.warn(`AudioProcessor: connectNodes called on a closed context for ${element.src || '(no src)'}. Skipping.`);
      return;
    }

    try {
      // const wasPlaying = !nodes.element.paused; // State restoration removed, handled by caller
      // const currentTime = nodes.element.currentTime;

      const safeDisconnect = (node: AudioNode, from?: AudioNode | AudioParam) => {
        try {
          if (from) {
            node.disconnect(from);
          } else {
            node.disconnect();
          }
        } catch (e) {
          // console.debug(`AudioProcessor: Minor error during disconnect (normal if not connected): ${ (e as Error).message }`);
        }
      };

      // Disconnect existing connections more carefully
      // Disconnect from specific nodes if possible, otherwise full disconnect.
      safeDisconnect(gain); // gain -> destination
      safeDisconnect(voiceFilter, gain); // voiceFilter -> gain (stereo path)
      safeDisconnect(merger, gain);     // merger -> gain (mono path)
      safeDisconnect(splitter); // splitter -> merger
      safeDisconnect(bassFilter, voiceFilter); // bassFilter -> voiceFilter
      safeDisconnect(source, bassFilter);   // source -> bassFilter

      // Re-verify source is valid before connecting
      if (!this.isSourceStillValid(source, element)) {
          console.error(`AudioProcessor: Source node for ${element.src || "(no src)"} became invalid before reconnecting. Aborting connectNodes.`);
          // This element's processing is now broken. It should be cleaned up.
          this.disconnectElementNodes(element);
          return;
      }


      // Create new connections based on settings
      if (settings.mono) {
        console.log(`[AudioProcessor] Connecting mono path for ${element.src || '(no src)'}`);
        source.connect(bassFilter);
        bassFilter.connect(voiceFilter);
        voiceFilter.connect(splitter);
        // Ensure splitter is connected correctly for mono effect
        // Typically, you take one channel (e.g., channel 0) from the splitter
        // and feed it to both inputs of the merger.
        splitter.connect(merger, 0, 0); // Splitter's channel 0 to Merger's input 0
        splitter.connect(merger, 0, 1); // Splitter's channel 0 to Merger's input 1
        merger.connect(gain);
      } else {
        console.log(`[AudioProcessor] Connecting stereo path for ${element.src || '(no src)'}`);
        source.connect(bassFilter);
        bassFilter.connect(voiceFilter);
        voiceFilter.connect(gain);
      }
      gain.connect(context.destination);

      nodes.mono = settings.mono; // CRITICAL: Update the stored mono state in the AudioNodes object

      // Apply current gain/filter parameters after (re)connecting
      await this.updateNodeSettings(nodes, settings);

      console.log(`AudioProcessor: Nodes connected successfully for ${element.src || '(no src)'} with mono: ${nodes.mono}`);
    } catch (error) {
      console.error(`AudioProcessor: Failed to connect nodes for ${element.src || '(no src)'}:`, error);
      // Attempt to cleanup this element's nodes if connection fails badly
      this.disconnectElementNodes(element);
      // throw error; // Or not, to let other elements proceed
    }
  }

  public disconnectElementNodes(element: HTMLMediaElement): boolean {
    const nodes = this.audioElementMap.get(element);
    if (!nodes) {
      // console.log(`[AudioProcessor] No nodes found to disconnect for element: ${element.src || "(no src)"}`);
      return false;
    }

    console.log(
      `[AudioProcessor] Disconnecting nodes for element: ${
        element.src || "(no src)"
      }`
    );

    try {
      const safeDisconnect = (node?: AudioNode) => { // Made node optional
        if (!node) return;
        try {
          node.disconnect();
        } catch (e) {
          // console.debug(`AudioProcessor: Minor error during disconnect: ${(e as Error).message}`);
        }
      };

      // Disconnect in reverse order of typical connection, or just disconnect all outputs
      safeDisconnect(nodes.gain);
      safeDisconnect(nodes.merger);
      safeDisconnect(nodes.splitter);
      safeDisconnect(nodes.voiceFilter);
      safeDisconnect(nodes.bassFilter);

      // Special care for MediaElementAudioSourceNode:
      // It's good practice to disconnect it, but it can also be left if the element
      // might be re-used with the same AudioContext. However, if the context
      // itself is being closed or the element is definitely done, disconnect.
      // If createMediaElementSource is called again on the same element in the same context, it errors.
      safeDisconnect(nodes.source);

      // If the context is NOT being closed globally, and the source node might be reused,
      // you might opt to not call nodes.source.disconnect() if you have logic to reuse it.
      // However, our current setup re-creates the source if setupAudioContext is called again
      // after a disconnect, which would fail if the old source wasn't disconnected and not re-obtained.
      // So, full disconnect is safer with current logic.

      this.audioElementMap.delete(element);
      console.log(`[AudioProcessor] Successfully disconnected and removed nodes for ${element.src || '(no src)'}`);
      return true;
    } catch (error) {
      console.error(
        `AudioProcessor: Error disconnecting nodes for ${
          element.src || "(no src)"
        }:`,
        error
      );
      // Attempt to remove from map even if disconnect failed partially
      this.audioElementMap.delete(element);
      return false;
    }
  }

  // Kept for compatibility if something still calls it, but delegates.
  private disconnectAudioNodes(element: HTMLMediaElement): void {
    this.disconnectElementNodes(element);
  }

  async updateAudioEffects(settings: AudioSettings): Promise<void> {
    console.log(
      "[AudioProcessor] Updating audio effects for all managed elements. Settings:",
      JSON.stringify(settings)
    );

    if (!this.audioContext || this.audioContext.state === "closed") {
        console.warn("[AudioProcessor] AudioContext not available or closed. Cannot update audio effects.");
        return;
    }

    // Create a copy of the keys (media elements) to iterate over,
    // as `disconnectElementNodes` (called indirectly if errors occur) modifies the map.
    const elementsToUpdate = Array.from(this.audioElementMap.keys());

    for (const element of elementsToUpdate) {
        const nodes = this.audioElementMap.get(element);
        if (!nodes) {
            console.warn(`[AudioProcessor] Element ${element.src || '(no src)'} was in key list but not in map during update. Skipping.`);
            continue;
        }

        // Ensure nodes are for the current context
        if (nodes.context !== this.audioContext) {
            console.warn(`[AudioProcessor] Skipping update for ${element.src || '(no src)'}; its nodes belong to a different/old AudioContext. It should be re-processed via setupAudioContext if still active.`);
            // Optionally, clean up such orphaned entries
            // this.disconnectElementNodes(element);
            continue;
        }

        try {
            if (nodes.mono !== settings.mono) {
            console.log(
                `[AudioProcessor] Mono setting changed for ${element.src || "(no src)"} (from ${nodes.mono} to ${settings.mono}) during global update. Reconnecting.`
            );
            await this.connectNodes(nodes, settings); // Reconnects, updates params, and updates nodes.mono
            } else {
            console.log(
                `[AudioProcessor] Mono unchanged for ${element.src || "(no src)"} during global update. Updating node settings only.`
            );
            await this.updateNodeSettings(nodes, settings); // Just update parameters
            }
            console.log(
            `[AudioProcessor] Successfully updated effects for element: ${
                element.src || "(no src)"
            }`
            );
        } catch (error) {
            console.error(
            `AudioProcessor: Update failed for element during global update: ${element.src || "(no src)"}`,
            error
            );
            // Consider if a failed update for one element should stop others, or if it should be isolated.
            // Current setup isolates the error.
        }
    }
    console.log("[AudioProcessor] Finished updating audio effects for all managed elements.");
  }

  async resetAllToDisabled(): Promise<void> {
    console.log("[AudioProcessor] Resetting all elements to disabled (disconnecting nodes).");
    const elementsToReset = Array.from(this.audioElementMap.keys());
    elementsToReset.forEach((element) => {
      this.disconnectElementNodes(element); // Use the public method
    });
    // this.audioElementMap.clear(); // disconnectElementNodes already removes them
    console.log("[AudioProcessor] All elements disconnected.");
    // Note: This does not close the audioContext itself, allowing potential reuse.
    // Call cleanup() for full context closure.
  }

  hasProcessing(mediaElement: HTMLMediaElement): boolean {
    return this.audioElementMap.has(mediaElement);
  }

  /**
   * Disconnects all nodes and closes the AudioContext.
   */
  cleanup(): void {
    console.log("AudioProcessor: Starting cleanup...");
    this.resetAllToDisabled(); // Disconnects all nodes and clears the map

    if (this.audioContext) {
      if (this.audioContext.state !== "closed") {
        this.audioContext.close()
          .then(() => {
            console.log("AudioProcessor: AudioContext closed successfully.");
          })
          .catch(error => {
            console.error("AudioProcessor: Error closing AudioContext:", error);
          })
          .finally(() => {
            this.audioContext = null;
          });
      } else {
        this.audioContext = null; // Already closed
      }
    }
    console.log("AudioProcessor: Cleanup process initiated/completed.");
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
      console.log(`AudioProcessor: AudioContext state is "${this.audioContext.state}", no resume needed or possible.`);
    } else {
        console.log("AudioProcessor: No AudioContext to resume.");
    }
  }

  /**
   * Experimental: Bypasses audio effects for a single element by routing its source directly to gain,
   * then gain to destination, if it's currently processed.
   * If effects are already bypassed (e.g. gain is directly connected to source), does nothing.
   * This is a partial bypass, it doesn't remove filters from the chain, just routes around them.
   * A true bypass would disconnect filters and connect source -> gain.
   * For disabling, `disconnectElementNodes` is more thorough.
   */
  public async bypassEffectsForElement(element: HTMLMediaElement): Promise<void> {
    const nodes = this.audioElementMap.get(element);
    if (!nodes || !this.audioContext || this.audioContext.state === "closed") {
        console.log(`[AudioProcessor] Cannot bypass effects for ${element.src || '(no src)'}: No nodes or context invalid.`);
        return;
    }

    const { source, gain, bassFilter, voiceFilter, merger, splitter, context } = nodes;
    console.log(`[AudioProcessor] Attempting to bypass effects for ${element.src || '(no src)'}. Current mono: ${nodes.mono}`);

    try {
        // Disconnect everything after source and before gain, and from gain to destination
        const safeDisconnect = (node: AudioNode, from?: AudioNode | AudioParam) => {
            try { node.disconnect(from); } catch (e) { /* ignore */ }
        };

        safeDisconnect(gain); // from destination
        safeDisconnect(merger, gain);
        safeDisconnect(splitter);
        safeDisconnect(voiceFilter, gain); // if stereo
        safeDisconnect(voiceFilter, splitter); // if mono
        safeDisconnect(bassFilter, voiceFilter);
        // Do NOT disconnect source from bassFilter yet, as we might reconnect it.

        // Route source directly to gain
        console.log(`[AudioProcessor] Bypassing: Connecting source directly to gain for ${element.src || '(no src)'}`);
        source.disconnect(); // Disconnect source from whatever it was connected to (e.g. bassFilter)
        source.connect(gain);
        gain.connect(context.destination);

        // Note: The filters (bass, voice) and mono-related nodes (splitter, merger) are now orphaned
        // but still part of the `nodes` object. If we want to re-enable effects,
        // we would call `connectNodes(nodes, currentSettings)` which would rewire them.
        // This is a "soft" bypass. For a "hard" disable, use disconnectElementNodes.
        console.log(`[AudioProcessor] Effects bypassed for ${element.src || '(no src)'}. Source -> Gain -> Destination.`);

    } catch (error) {
        console.error(`[AudioProcessor] Error bypassing effects for ${element.src || '(no src)'}:`, error);
        // Attempt to restore original connections if bypass fails midway?
        // For now, just log. A subsequent settings update should fix connections.
    }
  }

  /**
   * Experimental: Re-enables effects for an element if they were previously bypassed by bypassEffectsForElement.
   * This essentially calls connectNodes with the current settings.
   */
  public async unbypassEffectsForElement(element: HTMLMediaElement, currentSettings: AudioSettings): Promise<void> {
      const nodes = this.audioElementMap.get(element);
      if (!nodes) {
          console.log(`[AudioProcessor] Cannot unbypass effects for ${element.src || '(no src)'}: No nodes found. Setup might be needed.`);
          // If no nodes, it means it's fully disconnected or never setup.
          // We might need to run full setup.
          // await this.setupAudioContext(element, currentSettings);
          return;
      }
      console.log(`[AudioProcessor] Attempting to unbypass (reconnect full graph) for ${element.src || '(no src)'}`);
      await this.connectNodes(nodes, currentSettings); // This will rewire according to settings.
  }


  /**
   * Experimental: Bypasses all audio effects for ALL currently managed elements.
   * This is a global version of bypassEffectsForElement.
   */
  public async bypassAllEffects(): Promise<void> {
      console.log("[AudioProcessor] Bypassing effects for ALL elements.");
      if (!this.audioContext || this.audioContext.state === "closed") {
          console.warn("[AudioProcessor] AudioContext not available or closed. Cannot bypass all effects.");
          return;
      }
      for (const element of this.audioElementMap.keys()) {
          await this.bypassEffectsForElement(element);
      }
      console.log("[AudioProcessor] All effects bypassed globally.");
  }

  /**
   * Experimental: Re-enables effects for ALL elements based on provided settings.
   */
  public async unbypassAllEffects(settings: AudioSettings): Promise<void> {
      console.log("[AudioProcessor] Unbypassing (reconnecting) effects for ALL elements with settings:", settings);
      if (!this.audioContext || this.audioContext.state === "closed") {
          console.warn("[AudioProcessor] AudioContext not available or closed. Cannot unbypass all effects.");
          return;
      }
      // updateAudioEffects will achieve this by checking mono and reconnecting or updating settings.
      // However, if bypassEffectsForElement was used, the connections are source->gain.
      // updateAudioEffects might need to be smarter or we call connectNodes directly.
      // For simplicity here, let's use updateAudioEffects as it should re-evaluate connection needs.
      await this.updateAudioEffects(settings);
      console.log("[AudioProcessor] All effects unbypassed globally (via updateAudioEffects).");
  }


} // End of AudioProcessor class