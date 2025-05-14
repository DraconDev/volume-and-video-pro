import { AudioSettings } from "./types";
import { AudioProcessor } from "./audio-processor";
import { MediaManager } from "./media-manager";

export class MediaProcessor {
  audioProcessor: AudioProcessor;

  constructor() {
    this.audioProcessor = new AudioProcessor();
  }

  private updatePlaybackSpeed(element: HTMLMediaElement, speed: number): void {
    console.log(
      `[MediaProcessor] Updating speed for element ${
        element.src || "(no src)"
      } to ${speed}`
    ); // ADDED LOG
    try {
      const wasPlaying = !element.paused;
      const currentTime = element.currentTime;

      element.playbackRate = speed / 100;
      element.defaultPlaybackRate = speed / 100;

      // Restore state
      if (wasPlaying) {
        // If playing, changing playbackRate should ideally not stop it.
        // Avoid resetting currentTime which can cause a stutter.
        // Call play() to ensure it continues (e.g. if rate change paused it, or no-op if already playing).
        element.play().catch((e) =>
          console.warn(
            "MediaProcessor: Failed to resume playback after speed change:", // More specific message
            e
          )
        );
      } else {
        // If it was paused, set the currentTime to ensure it stays at the same spot.
        element.currentTime = currentTime;
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
    console.log(
      "[MediaProcessor] processMediaElements called with settings:",
      JSON.stringify(settings)
    );

    // Update speed for all elements
    mediaElements.forEach((element) =>
      this.updatePlaybackSpeed(element, settings.speed)
    );

    // Apply settings immediately if audio context exists
    if (
      this.audioProcessor["audioContext"] &&
      this.audioProcessor["audioContext"].state !== "closed"
    ) {
      console.log(
        "[MediaProcessor] Applying settings immediately to existing audio context"
      );
      await this.audioProcessor.updateAudioEffects(settings);
      return;
    }

    // Setup audio processing only if it doesn't exist for the element
    for (const element of mediaElements) {
      try {
        if (!this.audioProcessor.hasProcessing(element)) {
          console.log(
            `[MediaProcessor] Setting up audio context for: ${
              element.src || "(no src)"
            }`
          );
          await this.audioProcessor.setupAudioContext(element, settings);
        }
      } catch (e) {
        console.error(
          `MediaProcessor: Failed to setup audio context for element ${
            element.src || "(no src)"
          }:`,
          e
        );
      }
    }
  }

  /**
   * Apply settings directly to media elements without waiting for async operations
   * Useful for immediate UI feedback
   */
  private lastAppliedSettings: AudioSettings | null = null;

  applySettingsImmediately(
    mediaElements: HTMLMediaElement[],
    settings: AudioSettings
  ): void {
    console.log(
      "[MediaProcessor] Applying settings immediately to media elements"
    );

    // Skip if settings haven't changed
    if (this.lastAppliedSettings && 
        JSON.stringify(this.lastAppliedSettings) === JSON.stringify(settings)) {
      return;
    }
    this.lastAppliedSettings = { ...settings };

    // Batch update for better performance
    const batchSize = 5;
    const updateQueue = [...mediaElements];
    
    const processBatch = () => {
      const batch = updateQueue.splice(0, batchSize);
      batch.forEach((element) => {
        try {
          // Store current state
          const wasPlaying = !element.paused;
          const currentTime = element.currentTime;

          // Apply settings
          element.playbackRate = settings.speed / 100;
          element.defaultPlaybackRate = settings.speed / 100;
          element.volume = settings.volume / 100;

          // Restore playback state if needed
          if (wasPlaying) {
            element
              .play()
              .catch((e) =>
                console.warn(
                  "MediaProcessor: Failed to resume playback after settings update:",
                  e
                )
              );
          } else {
            // Ensure it stays paused at the same position
            element.currentTime = currentTime;
          }
        } catch (e) {
          console.error(
            `MediaProcessor: Error applying settings to ${
              element.src || "(no src)"
            }:`,
            e
          );
        }
      });

      // Process next batch after microtask queue clears
      if (updateQueue.length > 0) {
        setTimeout(processBatch, 0);
      }
    };

    processBatch();
  }

  /**
   * Force update of audio effects even if context already exists
   * Useful for immediate application of filter/audio changes
   */
  async forceAudioEffectsUpdate(settings: AudioSettings): Promise<void> {
    console.log("[MediaProcessor] Forcing audio effects update");

    if (
      this.audioProcessor["audioContext"] &&
      this.audioProcessor["audioContext"].state !== "closed"
    ) {
      try {
        // Create new audio context if needed
        if (this.audioProcessor["audioContext"].state === "suspended") {
          await this.audioProcessor["audioContext"].resume();
        }

        // Force update of audio effects
        await this.audioProcessor.updateAudioEffects(settings);
        console.log(
          "[MediaProcessor] Successfully forced audio effects update"
        );
      } catch (e) {
        console.error(
          "[MediaProcessor] Failed to force audio effects update:",
          e
        );
      }
    } else {
      console.log(
        "[MediaProcessor] Creating new audio context for forced update"
      );
      const mockElement = document.createElement("audio");
      await this.audioProcessor.setupAudioContext(mockElement, settings);
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

  /**
   * Public method to check if the AudioContext is ready for applying audio effects.
   */
  public canApplyAudioEffects(): boolean {
    // Check if audioProcessor and its audioContext exist and are not closed
    return !!this.audioProcessor["audioContext"] && this.audioProcessor["audioContext"].state !== 'closed';
  }
} // End of MediaProcessor class
