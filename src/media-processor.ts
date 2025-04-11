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
    needsProcessing: boolean // Keep this param even if unused for now, might be needed later
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
          // console.log( // Reduced logging
          //   "MediaProcessor: Setup audio context for element:",
          //   element.src
          // );
        }
      } catch (e) {
        console.error("MediaProcessor: Failed to process media element:", e);
      }
    }

    // Update effects for all elements with new settings
    // Only update if the context is likely running (or suspended, ready to be resumed)
    if (this.audioProcessor['audioContext'] && this.audioProcessor['audioContext'].state !== 'closed') {
        await this.audioProcessor.updateAudioEffects(settings);
    } else {
        console.log("MediaProcessor: Skipping audio effects update, context not ready/active.");
    }
  }

  setupMediaObserver(callback: () => Promise<void>): void {
    // Assuming MediaManager.setupMediaElementObserver is made public
    MediaManager.setupMediaElementObserver(async () => {
      await callback();
    });
  }

  findMediaElements(): HTMLMediaElement[] {
    // Assuming MediaManager.findMediaElements is made public
    return MediaManager.findMediaElements();
  }

  async resetToDisabled(): Promise<void> {
    await this.audioProcessor.resetAllToDisabled();
  }

  /**
   * Public method to attempt resuming the AudioContext via the private AudioProcessor.
   */
  public async attemptContextResume(): Promise<void> {
    // Access the private member using bracket notation if needed, or make it public/internal
    await this.audioProcessor.tryResumeContext();
  }

} // End of MediaProcessor class
