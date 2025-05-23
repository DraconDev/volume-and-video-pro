import { AudioSettings } from "./types";
import { AudioProcessor } from "./audio-processor";
import { MediaManager } from "./media-manager";

export class MediaProcessor {
  audioProcessor: AudioProcessor;
  private activeMediaElements = new Set<HTMLMediaElement>();

  constructor() {
    this.audioProcessor = new AudioProcessor();
  }

  // Method to get currently managed media elements, filtering for connected ones
  public getManagedMediaElements(): HTMLMediaElement[] {
    this.activeMediaElements.forEach((el) => {
      if (!el.isConnected) {
        this.activeMediaElements.delete(el);
        console.log(
          `[MediaProcessor] Removed disconnected element from active list: ${
            el.src || "(no src)"
          }`
        );
      }
    });
    return Array.from(this.activeMediaElements);
  }

  private updatePlaybackSpeed(element: HTMLMediaElement, speed: number): void {
    if (!element.isConnected) {
      console.warn(
        `[MediaProcessor] Attempted to update speed on disconnected element: ${
          element.src || "(no src)"
        }`
      );
      this.activeMediaElements.delete(element); // Clean up if found in active list
      return;
    }
    // console.log( // This log can be very noisy, enable if needed for specific speed debugging
    //   `[MediaProcessor] Updating speed for element ${
    //     element.src || "(no src)"
    //   } to ${speed}`
    // );
    try {
      const wasPlaying = !element.paused;
      const currentTime = element.currentTime;

      element.playbackRate = speed / 100;
      element.defaultPlaybackRate = speed / 100;

      // Restore state
      if (wasPlaying) {
        // If playing, changing playbackRate should ideally not stop it.
        // Avoid resetting currentTime which can cause a stutter.
      } else {
        // If it was paused, set the currentTime to ensure it stays at the same spot.
        element.currentTime = currentTime;
      }
    } catch (e) {
      console.error(
        `MediaProcessor: Error setting speed for ${element.src || "(no src)"}:`,
        e
      );
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

    // This method now directly handles speed application for the given elements.
    mediaElements.forEach((element) => {
      if (element.isConnected) {
        this.updatePlaybackSpeed(element, settings.speed);
      } else {
        this.activeMediaElements.delete(element); // Clean up if disconnected
      }
    });

    if (needsAudioEffectsSetup) {
      console.log("[MediaProcessor] Audio effects setup is requested.");
      // Attempt to resume AudioContext before setting up/updating effects
      await this.audioProcessor.tryResumeContext();

      for (const element of mediaElements) {
        if (!element.isConnected) {
          this.activeMediaElements.delete(element);
          continue;
        }
        try {
          console.log(
            `[MediaProcessor] Calling setupAudioContext for element: ${
              element.src || "(no src)"
            }`
          );
          await this.audioProcessor.setupAudioContext(element, settings);
          this.activeMediaElements.add(element); // Add to active list on successful setup
          console.log(
            `[MediaProcessor] Added to activeMediaElements: ${
              element.src || "(no src)"
            }. Count: ${this.activeMediaElements.size}`
          );
        } catch (e) {
          console.error(
            `[MediaProcessor] Error in setupAudioContext for element ${
              element.src || "(no src)"
            }:`,
            e
          );
        }
      }

      if (
        this.audioProcessor.audioContext &&
        this.audioProcessor.audioContext.state === "running"
      ) {
        console.log(
          "[MediaProcessor] AudioContext is running, calling updateAudioEffects to apply/update global effects."
        );
        await this.audioProcessor.updateAudioEffects(settings);
      } else {
        console.log(
          "[MediaProcessor] AudioContext not running or does not exist after setup attempts. Skipping global updateAudioEffects."
        );
        // This log is now less critical as tryResumeContext was called.
        // If it's still not running, it means no user gesture has occurred yet.
      }
    } else {
      console.log(
        "[MediaProcessor] Audio effects setup not requested. Ensuring any existing processing for these elements is disconnected/bypassed."
      );
      for (const element of mediaElements) {
        if (!element.isConnected) {
          this.activeMediaElements.delete(element);
          continue;
        }
        try {
          // Attempt to bypass or disconnect effects for this element
          if (
            typeof (this.audioProcessor as any).bypassEffectsForElement ===
            "function"
          ) {
            console.log(
              `[MediaProcessor] Calling bypassEffectsForElement for: ${
                element.src || "(no src)"
              }`
            );
            await (this.audioProcessor as any).bypassEffectsForElement(element);
          } else if (
            typeof (this.audioProcessor as any).disconnectElement === "function"
          ) {
            console.log(
              `[MediaProcessor] Calling disconnectElement for: ${
                element.src || "(no src)"
              }`
            );
            await (this.audioProcessor as any).disconnectElement(element);
          } else {
            console.log(
              `[MediaProcessor] No method found on audioProcessor to bypass/disconnect effects for ${
                element.src || "(no src)"
              }.`
            );
          }
          // Whether disconnection was successful or not, if effects are not needed,
          // it's safer to remove it from active list to prevent unintended processing later.
          // However, it might still be controlled for speed/volume.
          // For now, let's assume if effects are off, we might not "actively manage" it in the same way.
          // This part needs careful consideration based on AudioProcessor's capabilities.
          // A simple approach: if effects are off, it's not "active" in terms of audio graph.
          if (this.activeMediaElements.has(element)) {
            // console.log(`[MediaProcessor] Removing from activeMediaElements (effects off): ${element.src || "(no src)"}`);
            // this.activeMediaElements.delete(element); // Re-evaluating if this is correct. Speed/volume still apply.
          }
        } catch (e) {
          console.error(
            `[MediaProcessor] Error bypassing/disconnecting effects for element ${
              element.src || "(no src)"
            }:`,
            e
          );
        }
      }
      // If effects are globally turned off, ensure the main audio effects chain is also reset/bypassed
      if (
        this.audioProcessor.audioContext &&
        typeof (this.audioProcessor as any).bypassAllEffects === "function"
      ) {
        console.log(
          "[MediaProcessor] Needs no audio effects, calling bypassAllEffects on AudioProcessor."
        );
        await (this.audioProcessor as any).bypassAllEffects();
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
          if (!element.isConnected) {
            this.activeMediaElements.delete(element); // Clean up if disconnected
            return; // Skip disconnected elements in the batch
          }
          // Store current state
          const wasPlaying = !element.paused;
          const currentTime = element.currentTime;

          // Apply playback speed if different
          const targetSpeed = settings.speed / 100;
          let speedChanged = false;
          if (Math.abs(element.playbackRate - targetSpeed) > EPSILON) {
            // console.log(`[MediaProcessor Immediate] Updating playbackRate for ${element.src || '(no src)'} from ${element.playbackRate} to ${targetSpeed}`);
            element.playbackRate = targetSpeed;
            speedChanged = true;
          }
          // Always set defaultPlaybackRate as it's less likely to be contested
          // and good to have as a baseline.
          if (Math.abs(element.defaultPlaybackRate - targetSpeed) > EPSILON) {
            element.defaultPlaybackRate = targetSpeed;
            // speedChanged = true; // Not strictly a direct playbackRate change, but related.
          }

          // If we actually changed speed, and the element is not already tracked, add it.
          if (
            element.isConnected &&
            speedChanged &&
            !this.activeMediaElements.has(element)
          ) {
            this.activeMediaElements.add(element);
            console.log(
              `[MediaProcessor Immediate] Added to activeMediaElements after changing speed: ${
                element.src || "(no src)"
              }. Count: ${this.activeMediaElements.size}`
            );
          }

          // Ensure it stays paused at the same position if it was paused
          if (element.paused) {
            element.currentTime = currentTime;
          }
        } catch (e) {
          console.error(
            `MediaProcessor: Error applying settings immediately to ${
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

  public static setupMediaObserver(
    onAdded: (elements: HTMLMediaElement[]) => Promise<void>,
    onRemoved: (elements: HTMLMediaElement[]) => void
  ): void {
    MediaManager.setupMediaElementObserver(onAdded, onRemoved);
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
