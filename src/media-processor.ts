import { AudioSettings } from "./types";
import { AudioProcessor } from "./audio-processor";
import { MediaManager } from "./media-manager";

export class MediaProcessor {
  private audioProcessor: AudioProcessor;

  constructor() {
    this.audioProcessor = new AudioProcessor();
  }

  private updatePlaybackSpeed(element: HTMLMediaElement, speed: number): void {
    console.log(`[MediaProcessor] Updating speed for element ${element.src || '(no src)'} to ${speed}`); // ADDED LOG
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
    console.log("[MediaProcessor] processMediaElements called with settings:", JSON.stringify(settings));

    // Update speed for all elements
    mediaElements.forEach((element) =>
      this.updatePlaybackSpeed(element, settings.speed)
    );

    // Apply settings immediately if audio context exists
    if (this.audioProcessor['audioContext'] && this.audioProcessor['audioContext'].state !== 'closed') {
      console.log("[MediaProcessor] Applying settings immediately to existing audio context");
      await this.audioProcessor.updateAudioEffects(settings);
      return;
    }

    // Setup audio processing only if it doesn't exist for the element
    for (const element of mediaElements) {
      try {
        if (!this.audioProcessor.hasProcessing(element)) {
          console.log(`[MediaProcessor] Setting up audio context for: ${element.src || '(no src)'}`);
          await this.audioProcessor.setupAudioContext(element, settings);
        }
      } catch (e) {
        console.error(`MediaProcessor: Failed to setup audio context for element ${element.src || '(no src)'}:`, e);
      }
    }
  }

  /**
   * Apply settings directly to media elements without waiting for async operations
   * Useful for immediate UI feedback
   */
  applySettingsImmediately(mediaElements: HTMLMediaElement[], settings: AudioSettings): void {
    console.log("[MediaProcessor] Applying settings immediately to media elements");
    
    // Update speed for all elements
    mediaElements.forEach((element) => {
      console.log(`[MediaProcessor] Updating speed for ${element.src || '(no src)'} to ${settings.speed}`);
      element.playbackRate = settings.speed / 100;
      element.defaultPlaybackRate = settings.speed / 100;
    });
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
