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
    console.log("[MediaProcessor] processMediaElements called with settings:", JSON.stringify(settings)); // ADDED LOG + stringify

    // Update speed for all elements
    mediaElements.forEach((element) =>
      this.updatePlaybackSpeed(element, settings.speed)
    );

    // Disconnect existing nodes and set up fresh audio processing for each element
    for (const element of mediaElements) {
      try {
        // 1. Disconnect any existing nodes for this element
        this.audioProcessor.disconnectElementNodes(element);

        // 2. Setup a new audio context and node graph for this element
        //    This ensures the MediaElementAudioSourceNode is fresh.
        //    setupAudioContext internally calls connectNodes -> updateNodeSettings
        //    so the latest settings are applied during setup.
        await this.audioProcessor.setupAudioContext(element, settings);
        console.log(`[MediaProcessor] Re-established audio context for element: ${element.src || '(no src)'}`); // ADDED LOG

      } catch (e) {
        console.error(`MediaProcessor: Failed to process media element ${element.src || '(no src)'}:`, e);
      }
    }

    // No longer need the separate updateAudioEffects call here,
    // as setupAudioContext now handles applying the latest settings.
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
