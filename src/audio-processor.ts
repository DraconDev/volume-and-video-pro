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

    async setupAudioContext(mediaElement: HTMLMediaElement, settings: AudioSettings): Promise<void> {
        try {
            console.log("AudioProcessor: Setting up audio context with settings:", settings);

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

    private async createAudioNodes(mediaElement: HTMLMediaElement, settings: AudioSettings): Promise<AudioNodes> {
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
            element: mediaElement
        };

        // Connect nodes based on settings
        await this.connectNodes(nodes, settings);

        return nodes;
    }

    private async updateNodeSettings(nodes: AudioNodes, settings: AudioSettings): Promise<void> {
        const { gain, bassFilter, voiceFilter, context } = nodes;

        try {
            const safeTimeValue = isFinite(context.currentTime) ? context.currentTime : 0;
            
            // Clamp values to prevent invalid audio settings
            const clampedVolume = Math.max(0, Math.min(settings.volume, 1000)) / 100;
            const clampedBass = Math.max(-15, Math.min(((settings.bassBoost - 100) / 100) * 15, 15));
            const clampedVoice = Math.max(-24, Math.min(((settings.voiceBoost - 100) / 100) * 24, 24));

            // Update parameters smoothly
            gain.gain.cancelScheduledValues(safeTimeValue);
            bassFilter.gain.cancelScheduledValues(safeTimeValue);
            voiceFilter.gain.cancelScheduledValues(safeTimeValue);

            gain.gain.setValueAtTime(gain.gain.value, safeTimeValue);
            bassFilter.gain.setValueAtTime(bassFilter.gain.value, safeTimeValue);
            voiceFilter.gain.setValueAtTime(voiceFilter.gain.value, safeTimeValue);

            gain.gain.linearRampToValueAtTime(clampedVolume, safeTimeValue + 0.1);
            bassFilter.gain.linearRampToValueAtTime(clampedBass, safeTimeValue + 0.1);
            voiceFilter.gain.linearRampToValueAtTime(clampedVoice, safeTimeValue + 0.1);

            console.log("AudioProcessor: Settings updated successfully", {
                volume: clampedVolume,
                bass: clampedBass,
                voice: clampedVoice,
                mono: settings.mono
            });
        } catch (error) {
            console.error("AudioProcessor: Failed to update settings:", error);
            throw error;
        }
    }

    private async connectNodes(nodes: AudioNodes, settings: AudioSettings): Promise<void> {
        const { source, bassFilter, voiceFilter, gain, splitter, merger, context } = nodes;

        try {
            // Disconnect existing connections
            source.disconnect();
            bassFilter.disconnect();
            voiceFilter.disconnect();
            gain.disconnect();
            splitter.disconnect();
            merger.disconnect();

            // Create new connections based on settings
            if (settings.mono) {
                // Connect in mono mode
                source.connect(bassFilter);
                bassFilter.connect(voiceFilter);
                voiceFilter.connect(splitter);
                splitter.connect(merger, 0, 0);
                splitter.connect(merger, 0, 1);
                merger.connect(gain);
            } else {
                // Connect in stereo mode
                source.connect(bassFilter);
                bassFilter.connect(voiceFilter);
                voiceFilter.connect(gain);
            }
            gain.connect(context.destination);

            // Apply settings
            await this.updateNodeSettings(nodes, settings);

            console.log("AudioProcessor: Nodes connected successfully");
        } catch (error) {
            console.error("AudioProcessor: Failed to connect nodes:", error);
            throw error;
        }
    }

    async updateAudioEffects(settings: AudioSettings): Promise<void> {
        console.log("AudioProcessor: Updating audio effects with settings:", settings);
        
        for (const [element, nodes] of this.audioElementMap.entries()) {
            try {
                // Reconnect nodes with new settings to handle mono/stereo changes
                await this.connectNodes(nodes, settings);
                console.log("AudioProcessor: Updated effects for element:", element.src);
            } catch (error) {
                console.error("AudioProcessor: Update failed for element:", element.src, error);
            }
        }
    }

    async resetToDefault(mediaElement: HTMLMediaElement): Promise<void> {
        const nodes = this.audioElementMap.get(mediaElement);
        if (!nodes) return;

        try {
            // Disconnect all nodes
            nodes.source.disconnect();
            nodes.bassFilter.disconnect();
            nodes.voiceFilter.disconnect();
            nodes.gain.disconnect();
            nodes.splitter.disconnect();
            nodes.merger.disconnect();

            // Remove from tracking
            this.audioElementMap.delete(mediaElement);

            console.log("AudioProcessor: Reset completed for element:", mediaElement.src);
        } catch (error) {
            console.error("AudioProcessor: Reset failed for element:", mediaElement.src, error);
        }
    }

    async resetAllToDefault(): Promise<void> {
        for (const [element] of this.audioElementMap) {
            await this.resetToDefault(element);
        }
        this.audioElementMap.clear();
        console.log("AudioProcessor: All elements reset to default");
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
