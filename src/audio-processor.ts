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
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _ = sourceNode.mediaElement; // Accessing property might throw if underlying object is gone
        return sourceNode.context === this.audioContext && sourceNode.mediaElement === element && sourceNode.context.state !== 'closed';
    } catch (e) {
        console.warn(`AudioProcessor: Source node for ${element.src || '(no src)'} seems invalid during check.`, e);
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

    let source;
    try {
        source = this.audioContext.createMediaElementSource(mediaElement);
        console.log(`AudioProcessor: Created MediaElementSource for ${mediaElement.src || "(no src)"}`);
    } catch (e) {
        console.error(`AudioProcessor: Error creating MediaElementSource for ${mediaElement.src || "(no src)"}. This usually means one already exists or element is unusable.`, e);
        throw e;
    }

    const gain = this.audioContext.createGain();
    const bassFilter = this.audioContext.createBiquadFilter();
    const voiceFilter = this.audioContext.createBiquadFilter();
    const splitter = this.audioContext.createChannelSplitter(2);
    const merger = this.audioContext.createChannelMerger(2);

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
      mono: settings.mono,
    };

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

      const clampedBass = Math.max(-15, Math.min(((settings.bassBoost - 100) / 100) * 15, 15));
      const clampedVoice = Math.max(-24, Math.min(((settings.voiceBoost - 100) / 100) * 24, 24));
      // const currentTime = context.currentTime; // Not used with direct .value assignments

      if (gain.gain.value !== gainNodeVolume) gain.gain.value = gainNodeVolume;
      if (bassFilter.gain.value !== clampedBass) bassFilter.gain.value = clampedBass;
      if (voiceFilter.gain.value !== clampedVoice) voiceFilter.gain.value = clampedVoice;

      // console.log( // Reduced logging verbosity for settings application
      //   `[AudioProcessor] Applied Node Settings for ${element.src || '(no src)'}:`,
      //   { elementVol: element.volume, gainVol: gain.gain.value, bass: bassFilter.gain.value, voice: voiceFilter.gain.value, mono: nodes.mono }
      // );
    } catch (error) {
      console.error(`AudioProcessor: Failed to update settings for ${element.src || '(no src)'}:`, error);
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
      const safeDisconnect = (nodeToDisconnectFrom: AudioNode, specificOutputNodeOrParam?: AudioNode | AudioParam | number, outputNumber?: number, inputNumber?: number) => {
        try {
          if (specificOutputNodeOrParam !== undefined) {
            if (typeof specificOutputNodeOrParam === 'number') {
              nodeToDisconnectFrom.disconnect(specificOutputNodeOrParam);
            } else if (specificOutputNodeOrParam instanceof AudioNode) {
              if (outputNumber !== undefined && inputNumber !== undefined) {
                nodeToDisconnectFrom.disconnect(specificOutputNodeOrParam, outputNumber, inputNumber);
              } else if (outputNumber !== undefined) {
                nodeToDisconnectFrom.disconnect(specificOutputNodeOrParam, outputNumber);
              } else {
                nodeToDisconnectFrom.disconnect(specificOutputNodeOrParam);
              }
            } else if (specificOutputNodeOrParam instanceof AudioParam) {
              if (outputNumber !== undefined) {
                nodeToDisconnectFrom.disconnect(specificOutputNodeOrParam, outputNumber);
              } else {
                nodeToDisconnectFrom.disconnect(specificOutputNodeOrParam);
              }
            }
          } else {
            nodeToDisconnectFrom.disconnect();
          }
        } catch (e) {
          // console.debug(`AudioProcessor: Minor error during disconnect (normal if not connected): ${ (e as Error).message }`);
        }
      };

      safeDisconnect(gain);
      safeDisconnect(voiceFilter, gain);
      safeDisconnect(merger, gain);
      safeDisconnect(splitter);
      safeDisconnect(bassFilter, voiceFilter);
      safeDisconnect(source, bassFilter);

      if (!this.isSourceStillValid(source, element)) {
          console.error(`AudioProcessor: Source node for ${element.src || "(no src)"} became invalid before reconnecting. Aborting connectNodes.`);
          this.disconnectElementNodes(element);
          return;
      }

      if (settings.mono) {
        // console.log(`[AudioProcessor] Connecting mono path for ${element.src || '(no src)'}`);
        source.connect(bassFilter);
        bassFilter.connect(voiceFilter);
        voiceFilter.connect(splitter);
        splitter.connect(merger, 0, 0);
        splitter.connect(merger, 0, 1);
        merger.connect(gain);
      } else {
        // console.log(`[AudioProcessor] Connecting stereo path for ${element.src || '(no src)'}`);
        source.connect(bassFilter);
        bassFilter.connect(voiceFilter);
        voiceFilter.connect(gain);
      }
      gain.connect(context.destination);

      nodes.mono = settings.mono;

      await this.updateNodeSettings(nodes, settings);
      // console.log(`AudioProcessor: Nodes connected successfully for ${element.src || '(no src)'} with mono: ${nodes.mono}`);
    } catch (error) {
      console.error(`AudioProcessor: Failed to connect nodes for ${element.src || '(no src)'}:`, error);
      this.disconnectElementNodes(element);
    }
  }

  public disconnectElementNodes(element: HTMLMediaElement): boolean {
    const nodes = this.audioElementMap.get(element);
    if (!nodes) {
      return false;
    }

    // console.log(`[AudioProcessor] Disconnecting nodes for element: ${element.src || "(no src)"}`);
    try {
      const safeDisconnectAll = (node?: AudioNode) => {
        if (!node) return;
        try {
          node.disconnect();
        } catch (e) { /* console.debug(`AudioProcessor: Minor error during full disconnect: ${(e as Error).message}`); */ }
      };

      safeDisconnectAll(nodes.gain);
      safeDisconnectAll(nodes.merger);
      safeDisconnectAll(nodes.splitter);
      safeDisconnectAll(nodes.voiceFilter);
      safeDisconnectAll(nodes.bassFilter);
      safeDisconnectAll(nodes.source);

      this.audioElementMap.delete(element);
      // console.log(`[AudioProcessor] Successfully disconnected and removed nodes for ${element.src || '(no src)'}`);
      return true;
    } catch (error) {
      console.error(`AudioProcessor: Error disconnecting nodes for ${element.src || "(no src)"}:`, error);
      this.audioElementMap.delete(element);
      return false;
    }
  }

  private disconnectAudioNodes(element: HTMLMediaElement): void {
    this.disconnectElementNodes(element);
  }

  async updateAudioEffects(settings: AudioSettings): Promise<void> {
    // console.log("[AudioProcessor] Updating audio effects for all managed elements. Settings:", JSON.stringify(settings));
    if (!this.audioContext || this.audioContext.state === "closed") {
        console.warn("[AudioProcessor] AudioContext not available or closed. Cannot update audio effects.");
        return;
    }

    const elementsToUpdate = Array.from(this.audioElementMap.keys());
    for (const element of elementsToUpdate) {
        const nodes = this.audioElementMap.get(element);
        if (!nodes) {
            // console.warn(`[AudioProcessor] Element ${element.src || '(no src)'} was in key list but not in map during update. Skipping.`);
            continue;
        }
        if (nodes.context !== this.audioContext) {
            // console.warn(`[AudioProcessor] Skipping update for ${element.src || '(no src)'}; its nodes belong to a different/old AudioContext.`);
            continue;
        }

        try {
            if (nodes.mono !== settings.mono) {
            // console.log(`[AudioProcessor] Mono setting changed for ${element.src || "(no src)"} during global update. Reconnecting.`);
            await this.connectNodes(nodes, settings);
            } else {
            // console.log(`[AudioProcessor] Mono unchanged for ${element.src || "(no src)"} during global update. Updating node settings only.`);
            await this.updateNodeSettings(nodes, settings);
            }
            // console.log(`[AudioProcessor] Successfully updated effects for element: ${element.src || "(no src)"}`);
        } catch (error) {
            console.error(`AudioProcessor: Update failed for element during global update: ${element.src || "(no src)"}`, error);
        }
    }
    // console.log("[AudioProcessor] Finished updating audio effects for all managed elements.");
  }

  async resetAllToDisabled(): Promise<void> {
    console.log("[AudioProcessor] Resetting all elements to disabled (disconnecting nodes).");
    const elementsToReset = Array.from(this.audioElementMap.keys());
    elementsToReset.forEach((element) => {
      this.disconnectElementNodes(element);
    });
    console.log("[AudioProcessor] All elements disconnected.");
  }

  hasProcessing(mediaElement: HTMLMediaElement): boolean {
    return this.audioElementMap.has(mediaElement);
  }

  cleanup(): void {
    console.log("AudioProcessor: Starting cleanup...");
    this.resetAllToDisabled();

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
        this.audioContext = null;
      }
    }
    console.log("AudioProcessor: Cleanup process initiated/completed.");
  }

  async tryResumeContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
        console.log("AudioProcessor: AudioContext resumed successfully.");
      } catch (error) {
        console.error("AudioProcessor: Failed to resume AudioContext:", error);
      }
    } else if (this.audioContext) {
    //   console.log(`AudioProcessor: AudioContext state is "${this.audioContext.state}", no resume needed or possible.`);
    } else {
        // console.log("AudioProcessor: No AudioContext to resume.");
    }
  }

  public async bypassEffectsForElement(element: HTMLMediaElement): Promise<void> {
    const nodes = this.audioElementMap.get(element);
    if (!nodes || !this.audioContext || this.audioContext.state === "closed") {
        // console.log(`[AudioProcessor] Cannot bypass effects for ${element.src || '(no src)'}: No nodes or context invalid.`);
        return;
    }

    const { source, gain, bassFilter, voiceFilter, merger, splitter, context } = nodes;
    // console.log(`[AudioProcessor] Attempting to bypass effects for ${element.src || '(no src)'}. Current mono: ${nodes.mono}`);

    try {
        const safeDisconnect = (nodeToDisconnectFrom: AudioNode, specificOutputNode?: AudioNode) => {
            try {
                if (specificOutputNode) {
                    nodeToDisconnectFrom.disconnect(specificOutputNode);
                } else {
                    nodeToDisconnectFrom.disconnect();
                }
            } catch (e) { /* ignore */ }
        };

        safeDisconnect(gain); // from destination
        safeDisconnect(merger, gain);
        safeDisconnect(splitter);
        safeDisconnect(voiceFilter, gain);
        safeDisconnect(voiceFilter, splitter);
        safeDisconnect(bassFilter, voiceFilter);
        safeDisconnect(source); // Disconnect source from whatever it was connected to

        source.connect(gain);
        gain.connect(context.destination);
        // console.log(`[AudioProcessor] Effects bypassed for ${element.src || '(no src)'}. Source -> Gain -> Destination.`);
    } catch (error) {
        console.error(`[AudioProcessor] Error bypassing effects for ${element.src || '(no src)'}:`, error);
    }
  }

  public async unbypassEffectsForElement(element: HTMLMediaElement, currentSettings: AudioSettings): Promise<void> {
      const nodes = this.audioElementMap.get(element);
      if (!nodes) {
        //   console.log(`[AudioProcessor] Cannot unbypass effects for ${element.src || '(no src)'}: No nodes found. Setup might be needed.`);
          return;
      }
    //   console.log(`[AudioProcessor] Attempting to unbypass (reconnect full graph) for ${element.src || '(no src)'}`);
      await this.connectNodes(nodes, currentSettings);
  }

  public async bypassAllEffects(): Promise<void> {
    //   console.log("[AudioProcessor] Bypassing effects for ALL elements.");
      if (!this.audioContext || this.audioContext.state === "closed") {
        //   console.warn("[AudioProcessor] AudioContext not available or closed. Cannot bypass all effects.");
          return;
      }
      for (const element of this.audioElementMap.keys()) {
          await this.bypassEffectsForElement(element);
      }
    //   console.log("[AudioProcessor] All effects bypassed globally.");
  }

  public async unbypassAllEffects(settings: AudioSettings): Promise<void> {
    //   console.log("[AudioProcessor] Unbypassing (reconnecting) effects for ALL elements with settings:", settings);
      if (!this.audioContext || this.audioContext.state === "closed") {
        //   console.warn("[AudioProcessor] AudioContext not available or closed. Cannot unbypass all effects.");
          return;
      }
      await this.updateAudioEffects(settings);
    //   console.log("[AudioProcessor] All effects unbypassed globally (via updateAudioEffects).");
  }

} // End of AudioProcessor class