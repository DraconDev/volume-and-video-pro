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
            // Skip if already set up
            if (this.audioElementMap.has(mediaElement)) {
                return;
            }

            // Initialize audio context if needed
            if (!this.audioContext) {
                this.audioContext = new AudioContext();
            }

            // Create and configure nodes
            const nodes = await this.createAudioNodes(mediaElement, settings);
            this.audioElementMap.set(mediaElement, nodes);

            console.log(
                "AudioProcessor: Setup complete for:",
                mediaElement.src,
                {
                    volume: settings.volume / 100,
                    bass: ((settings.bassBoost - 100) / 100) * 15,
                    voice: ((settings.voiceBoost - 100) / 100) * 24,
                    mono: settings.mono
                }
            );
        } catch (error) {
            console.error("AudioProcessor: Setup failed:", error);
            throw error;
        }
    }

    private async createAudioNodes(mediaElement: HTMLMediaElement, settings: AudioSettings): Promise<AudioNodes> {
        if (!this.audioContext) {
            throw new Error("AudioContext not initialized");
        }

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

        // Initial connection
        await this.connectNodes({
            context: this.audioContext,
            source,
            gain,
            bassFilter,
            voiceFilter,
            splitter,
            merger,
            element: mediaElement
        }, settings);

        return {
            context: this.audioContext,
            source,
            gain,
            bassFilter,
            voiceFilter,
            splitter,
            merger,
            element: mediaElement
        };
    }

    private async connectNodes(nodes: AudioNodes, settings: AudioSettings): Promise<void> {
        const { source, bassFilter, voiceFilter, gain, splitter, merger, context } = nodes;

        try {
            // Safely disconnect all nodes
            const disconnectNode = (node: AudioNode) => {
                try {
                    node.disconnect();
                } catch (err) {
                    console.log("AudioProcessor: Node disconnect failed (normal if not connected):", err);
                }
            };

            disconnectNode(source);
            disconnectNode(bassFilter);
            disconnectNode(voiceFilter);
            disconnectNode(gain);
            disconnectNode(splitter);
            disconnectNode(merger);

            // Connect based on settings
            if (settings.mono) {
                // Verify connections in mono mode
                await this.verifyConnection(() => source.connect(bassFilter));
                await this.verifyConnection(() => bassFilter.connect(voiceFilter));
                await this.verifyConnection(() => voiceFilter.connect(splitter));
                await this.verifyConnection(() => splitter.connect(merger, 0, 0));
                await this.verifyConnection(() => splitter.connect(merger, 0, 1));
                await this.verifyConnection(() => merger.connect(gain));
            } else {
                // Verify connections in stereo mode
                await this.verifyConnection(() => source.connect(bassFilter));
                await this.verifyConnection(() => bassFilter.connect(voiceFilter));
                await this.verifyConnection(() => voiceFilter.connect(gain));
            }
            await this.verifyConnection(() => gain.connect(context.destination));

            // Update parameters with time validation
            const safeTimeValue = isFinite(context.currentTime) ? context.currentTime : 0;
            
            // Clamp values to prevent invalid audio settings
            const clampedVolume = Math.max(0, Math.min(settings.volume, 1000)) / 100;
            const clampedBass = Math.max(-15, Math.min(((settings.bassBoost - 100) / 100) * 15, 15));
            const clampedVoice = Math.max(-24, Math.min(((settings.voiceBoost - 100) / 100) * 24, 24));

            gain.gain.setValueAtTime(clampedVolume, safeTimeValue);
            bassFilter.gain.setValueAtTime(clampedBass, safeTimeValue);
            }
        }
    }

    async resetToDefault(mediaElement: HTMLMediaElement): Promise<void> {
        const nodes = this.audioElementMap.get(mediaElement);
        if (!nodes) return;

        const wasPlaying = !mediaElement.paused;
        const currentTime = mediaElement.currentTime;

        try {
            // Disconnect all nodes
            nodes.source.disconnect();
            nodes.bassFilter.disconnect();
            nodes.voiceFilter.disconnect();
            nodes.gain.disconnect();
            nodes.splitter.disconnect();
            nodes.merger.disconnect();

            // Connect source directly to destination
            nodes.source.connect(nodes.context.destination);

            // Restore playback state
            mediaElement.currentTime = currentTime;
            if (wasPlaying) {
                await mediaElement.play();
            }
        } catch (error) {
            console.error("AudioProcessor: Reset failed for element:", mediaElement.src, error);
        }
    }

    async resetAllToDefault(): Promise<void> {
        for (const [element] of this.audioElementMap) {
            await this.resetToDefault(element);
        }
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
    }
}
