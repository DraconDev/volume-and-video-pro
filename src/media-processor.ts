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

  private lastAppliedSettings: AudioSettings | null = null;

  async processMediaElements(
    mediaElements: HTMLMediaElement[],
    settings: AudioSettings,
    needsProcessing: boolean // Keep this param even if unused for now, might be needed later
  ): Promise<void> {
    console.log("[MediaProcessor] processMediaElements called with settings:", JSON.stringify(settings));
    
    // Skip processing if settings haven't changed
    if (this.lastAppliedSettings && this.deepEquals(this.lastAppliedSettings, settings)) {
      console.log("[MediaProcessor] Settings unchanged, skipping redundant processing");
      return;
    }
    this.lastAppliedSettings = { ...settings };

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
    
    // Update all elements with current settings
    mediaElements.forEach((element) => {
      try {
        console.log(`[MediaProcessor] Applying settings to ${element.src || '(no src)'}`, {
          speed: settings.speed,
          volume: settings.volume,
          playbackRate: settings.speed / 100
        });

        // Store current state
        const wasPlaying = !element.paused;
        const currentTime = element.currentTime;
        
        // Apply settings
        element.playbackRate = settings.speed / 100;
        element.defaultPlaybackRate = settings.speed / 100;
        element.volume = settings.volume / 100;

        // Restore playback state if needed
        if (wasPlaying) {
          element.play()
            .catch(e => console.warn("MediaProcessor: Failed to resume playback after settings update:", e));
        } else {
          // Ensure it stays paused at the same position
          element.currentTime = currentTime;
        }
      } catch (e) {
        console.error(`MediaProcessor: Error applying settings to ${element.src || '(no src)'}:`, e);
      }
    });
  }

  /**
   * Force update of audio effects even if context already exists
   * Useful for immediate application of filter/audio changes
   */
  async forceAudioEffectsUpdate(settings: AudioSettings): Promise<void> {
    console.log("[MediaProcessor] Forcing audio effects update");
    
    if (this.audioProcessor['audioContext'] && this.audioProcessor['audioContext'].state !== 'closed') {
      try {
        // Create new audio context if needed
        if (this.audioProcessor['audioContext'].state === 'suspended') {
          await this.audioProcessor['audioContext'].resume();
        }
        
        // Force update of audio effects
        await this.audioProcessor.updateAudioEffects(settings);
        console.log("[MediaProcessor] Successfully forced audio effects update");
      } catch (e) {
        console.error("[MediaProcessor] Failed to force audio effects update:", e);
      }
    } else {
      console.log("[MediaProcessor] Creating new audio context for forced update");
      const mockElement = document.createElement('audio');
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

  // Helper method to compare settings objects deeply
  private deepEquals(a: any, b: any): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) return false;
    const keysA = Object.keys(a), keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (typeof a[key] === 'object' && typeof b[key] === 'object') {
        if (!this.deepEquals(a[key], b[key])) return false;
      } else if (a[key] !== b[key]) {
        return false;
      }
    }
    return true;
  }

} // End of MediaProcessor class
