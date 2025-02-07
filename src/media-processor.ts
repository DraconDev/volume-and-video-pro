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

      element.playbackRate = speed / 100;
      element.defaultPlaybackRate = speed / 100;

      // Restore state
      element.currentTime = currentTime;
      if (wasPlaying) {
        element
          .play()
          .catch((e) =>
            console.warn("MediaProcessor: Failed to resume playback:", e)
          );
      }
    } catch (e) {
      console.error("MediaProcessor: Error setting speed:", e);
    }
  }

  async processMediaElements(
    mediaElements: HTMLMediaElement[],
    settings: AudioSettings,
    needsProcessing: boolean
  ): Promise<void> {
    console.log("MediaProcessor: Processing elements with settings:", settings);

    // Update speed for all elements
    mediaElements.forEach((element) =>
      this.updatePlaybackSpeed(element, settings.speed)
    );

    // Setup or update audio processing for each element
    for (const element of mediaElements) {
      try {
        // Only set up audio context if it doesn't exist
        if (!this.audioProcessor.hasProcessing(element)) {
          await this.audioProcessor.setupAudioContext(element, settings);
          console.log(
            "MediaProcessor: Setup audio context for element:",
            element.src
          );
        }
      } catch (e) {
        console.error("MediaProcessor: Failed to process media element:", e);
      }
    }

    // Update effects for all elements with new settings
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

  async resetToDisabled(): Promise<void> {
    await this.audioProcessor.resetAllToDisabled();
  }
}
