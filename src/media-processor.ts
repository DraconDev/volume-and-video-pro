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
        // Removed attempt to resume playback state here.
        // Playback should be initiated by user gesture and handled by the content script's play listener.
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
    needsAudioEffectsSetup: boolean
  ): Promise<void> {
    console.log(
      `[MediaProcessor] processMediaElements called for ${mediaElements.length} element(s). Needs audio effects setup: ${needsAudioEffectsSetup}. Settings:`,
      JSON.stringify(settings)
    );

    // Playback speed is generally handled by applySettingsImmediately via content.ts.
    // This call ensures it's also updated if processMediaElements is called directly
    // or if applySettingsImmediately failed for some reason.
    mediaElements.forEach((element) =>
      this.updatePlaybackSpeed(element, settings.speed)
    );

    if (needsAudioEffectsSetup) {
      console.log("[MediaProcessor] Audio effects setup is requested.");
      for (const element of mediaElements) {
        try {
          // This should connect the element to the audio graph, creating the context if necessary.
          // It's assumed audioProcessor.setupAudioContext handles new elements with an existing context correctly.
          console.log(`[MediaProcessor] Calling setupAudioContext for element: ${element.src || "(no src)"}`);
          await this.audioProcessor.setupAudioContext(element, settings);
        } catch (e) {
          console.error(
            `[MediaProcessor] Error in setupAudioContext for element ${element.src || "(no src)"}:`, e
          );
        }
      }

      // After attempting to set up all elements, if a context exists and is running,
      // update the effects globally on that context.
      // This ensures the effects chain reflects the latest settings.
      if (this.audioProcessor.audioContext && this.audioProcessor.audioContext.state === 'running') {
        console.log("[MediaProcessor] AudioContext is running, calling updateAudioEffects to apply/update global effects.");
        await this.audioProcessor.updateAudioEffects(settings);
      } else {
        console.log("[MediaProcessor] AudioContext not running or does not exist after setup attempts. Skipping global updateAudioEffects.");
      }
    } else {
      console.log("[MediaProcessor] Audio effects setup not requested. Ensuring any existing processing for these elements is disconnected.");
      // If audio effects are not needed, attempt to disconnect these elements from processing.
      // This relies on a method in AudioProcessor, e.g., disconnectElement or resetElement.
      for (const element of mediaElements) {
        try {
          // Assuming a method like this exists or will be added to AudioProcessor:
          if (typeof (this.audioProcessor as any).disconnectElement === 'function') {
             console.log(`[MediaProcessor] Calling disconnectElement for: ${element.src || "(no src)"}`);
            await (this.audioProcessor as any).disconnectElement(element);
          } else {
            console.log(`[MediaProcessor] disconnectElement method not found on audioProcessor for ${element.src || "(no src)"}. Effects may remain if previously active.`);
          }
        } catch (e) {
          console.error(`[MediaProcessor] Error disconnecting element ${element.src || "(no src)"}:`, e);
        }
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

    // Removed the lastAppliedSettings check to ensure settings are applied
    // even if the settings object itself hasn't changed, in case the player
    // has reset the element's properties.
    // this.lastAppliedSettings = { ...settings }; // Still useful to update for other potential logic if re-added

    // Batch update for better performance
    const batchSize = 5;
    const updateQueue = [...mediaElements];

    const processBatch = () => {
      const batch = updateQueue.splice(0, batchSize);
      const EPSILON = 0.001; // Small value for float comparison

      batch.forEach((element) => {
        try {
          // Store current state
          const wasPlaying = !element.paused;
          const currentTime = element.currentTime;

          // Apply playback speed if different
          const targetSpeed = settings.speed / 100;
          if (Math.abs(element.playbackRate - targetSpeed) > EPSILON) {
            console.log(`[MediaProcessor] Updating playbackRate for ${element.src || '(no src)'} from ${element.playbackRate} to ${targetSpeed}`);
            element.playbackRate = targetSpeed;
          }
          // Always set defaultPlaybackRate as it's less likely to be contested
          // and good to have as a baseline.
          if (Math.abs(element.defaultPlaybackRate - targetSpeed) > EPSILON) {
             element.defaultPlaybackRate = targetSpeed;
          }


          // Apply volume if different
          const targetVolume = settings.volume / 100;
          if (Math.abs(element.volume - targetVolume) > EPSILON) {
            console.log(`[MediaProcessor] Updating volume for ${element.src || '(no src)'} from ${element.volume} to ${targetVolume}`);
            element.volume = targetVolume;
          }

          // Removed attempt to restore playback state here.
          // Playback should be initiated by user gesture and handled by the content script's play listener.

          // Ensure it stays paused at the same position if it was paused
          // This currentTime adjustment should ideally only happen if playbackRate or volume actually changed
          // and the element was paused. However, for simplicity, we'll keep it as is for now.
          // A more complex check might involve seeing if any property was actually written.
          if (element.paused) {
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
    return (
      !!this.audioProcessor["audioContext"] &&
      this.audioProcessor["audioContext"].state !== "closed"
    );
  }
} // End of MediaProcessor class
