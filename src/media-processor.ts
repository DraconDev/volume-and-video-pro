import { AudioSettings } from "./types";
import { AudioProcessor } from "./audio-processor";
import { MediaManager } from "./media-manager";

export class MediaProcessor {
    private audioProcessor: AudioProcessor;

    constructor() {
        this.audioProcessor = new AudioProcessor();
    }

    private updatePlaybackSpeed(element: HTMLMediaElement, speed: number): void {
        try {
            const wasPlaying = !element.paused;
            const currentTime = element.currentTime;

            if (speed !== 100) {
                element.playbackRate = speed / 100;
                element.defaultPlaybackRate = speed / 100;
            } else {
                element.playbackRate = 1;
                element.defaultPlaybackRate = 1;
            }

            // Restore state
            element.currentTime = currentTime;
            if (wasPlaying) {
                element.play().catch(e => console.warn("MediaProcessor: Failed to resume playback:", e));
            }
        } catch (e) {
            console.error("MediaProcessor: Error setting speed:", e);
        }
    }

    async processMediaElements(mediaElements: HTMLMediaElement[], settings: AudioSettings, needsProcessing: boolean): Promise<void> {
        // Update speed for all elements
        mediaElements.forEach(element => this.updatePlaybackSpeed(element, settings.speed));

        // Handle audio processing
        if (!needsProcessing) {
            await this.audioProcessor.resetAllToDefault();
            return;
        }

        // Setup or update audio processing for each element
        for (const element of mediaElements) {
            try {
                if (!this.audioProcessor.hasProcessing(element)) {
                    await this.audioProcessor.setupAudioContext(element, settings);
                }
            } catch (e) {
                console.error("MediaProcessor: Failed to process media element:", e);
            }
        }

        // Update effects for all elements
        await this.audioProcessor.updateAudioEffects(settings);
    }

    setupMediaObserver(callback: () => Promise<void>): void {
        MediaManager.setupMediaElementObserver(async () => {
            await callback();
        });
    }

    findMediaElements(): HTMLMediaElement[] {
        return MediaManager.findMediaElements();
    }

    async resetToDefault(): Promise<void> {
        await this.audioProcessor.resetAllToDefault();
    }
}
