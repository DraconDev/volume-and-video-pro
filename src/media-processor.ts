import { AudioSettings } from "./types";
import { AudioProcessor } from "./audio-processor";
import { MediaManager } from "./media-manager";

export class MediaProcessor {
  audioProcessor: AudioProcessor;
  private activeMediaElements = new Set<HTMLMediaElement>();
  private elementSettings = new WeakMap<HTMLMediaElement, AudioSettings>();
  private elementListeners = new WeakMap<HTMLMediaElement, () => void>();

  constructor() {
    this.audioProcessor = new AudioProcessor();
  }

  // Method to get currently managed media elements, filtering for connected ones
  public getManagedMediaElements(): HTMLMediaElement[] {
    const disconnected: HTMLMediaElement[] = [];
    
    this.activeMediaElements.forEach((el) => {
      if (!el.isConnected) {
        disconnected.push(el);
      }
    });
    
    disconnected.forEach(el => this.cleanupElement(el));
    
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
    // Only log if we have elements to process
    if (mediaElements.length > 0) {
      console.debug(
        `[MediaProcessor] Processing ${mediaElements.length} media element(s). Audio effects: ${needsAudioEffectsSetup}`
      );
    }

    // Apply speed settings immediately
    mediaElements.forEach((element) => {
      if (element.isConnected) {
        this.updatePlaybackSpeed(element, settings.speed);
      } else {
        this.activeMediaElements.delete(element);
      }
    });

    if (needsAudioEffectsSetup) {
      await this.audioProcessor.tryResumeContext();

      for (const element of mediaElements) {
        if (!element.isConnected) {
          this.activeMediaElements.delete(element);
          continue;
        }
        try {
          await this.audioProcessor.setupAudioContext(element, settings);
          this.activeMediaElements.add(element);
        } catch (e) {
          console.error(
            `[MediaProcessor] Error setting up audio for ${
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
        await this.audioProcessor.updateAudioEffects(settings);
      }
    } else {
      for (const element of mediaElements) {
        if (!element.isConnected) {
          this.activeMediaElements.delete(element);
          continue;
        }
        try {
          if (
            typeof (this.audioProcessor as any).bypassEffectsForElement ===
            "function"
          ) {
            await (this.audioProcessor as any).bypassEffectsForElement(element);
          } else if (
            typeof (this.audioProcessor as any).disconnectElement === "function"
          ) {
            await (this.audioProcessor as any).disconnectElement(element);
          }
        } catch (e) {
          console.error(
            `[MediaProcessor] Error disabling effects for ${
              element.src || "(no src)"
            }:`,
            e
          );
        }
      }
      
      if (
        this.audioProcessor.audioContext &&
        typeof (this.audioProcessor as any).bypassAllEffects === "function"
      ) {
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
    settings: AudioSettings,
    disabled: boolean = false
  ): void {
    if (disabled) {
      console.log(
        "[MediaProcessor] Skipping settings application (disabled mode)"
      );
      
      // Reset any previously applied settings
      mediaElements.forEach(element => {
        // Only reset if we had applied settings to this element
        if (this.elementSettings.has(element)) {
          try {
            element.playbackRate = 1.0;
            element.defaultPlaybackRate = 1.0;
            this.cleanupElement(element);
          } catch (e) {
            console.error(
              `MediaProcessor: Error resetting element ${
                element.src || "(no src)"
              } in disabled mode:`,
              e
            );
          }
        }
      });
      return;
    }

    console.log(
      "[MediaProcessor] Applying settings immediately to media elements"
    );

    const targetSpeed = settings.speed / 100;
    
    // Process all elements synchronously for immediate effect
    for (const element of mediaElements) {
      try {
        if (!element.isConnected) {
          this.cleanupElement(element);
          continue;
        }
        
        // Apply playback speed immediately
        element.playbackRate = targetSpeed;
        element.defaultPlaybackRate = targetSpeed;
        
        // Store current settings for this element
        this.elementSettings.set(element, settings);
        
        // Add play event listener if not already added
        if (!this.elementListeners.has(element)) {
          const playHandler = () => {
            console.log(`[MediaProcessor] Reapplying settings on play event for ${element.src || "(no src)"}`);
            this.updatePlaybackSpeed(element, settings.speed);
          };
          element.addEventListener('play', playHandler);
          this.elementListeners.set(element, playHandler);
        }
        
        // Track connected elements
        if (!this.activeMediaElements.has(element)) {
          this.activeMediaElements.add(element);
        }
      } catch (e) {
        console.error(
          `MediaProcessor: Error applying settings to ${
            element.src || "(no src)"
          }:`,
          e
        );
      }
    }
      );
      this.applySettingsImmediately(visibleMedia, settings);
    }
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
  ): MutationObserver {
    // Change return type to MutationObserver
    return MediaManager.setupMediaElementObserver(onAdded, onRemoved); // Return the observer
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
    // Check if audioProcessor and its audioContext exist and are in 'running' state
    return (
      !!this.audioProcessor["audioContext"] &&
      this.audioProcessor["audioContext"].state === "running"
    );
  }
} // End of MediaProcessor class
