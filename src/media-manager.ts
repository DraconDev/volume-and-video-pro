import { root } from "postcss";

const mediaConfig = {
  baseSelectors: [
    "video",
    "audio",
    // Generic class/ID based selectors
    "[class*='player']",
    "[class*='video']",
    "[class*='audio']",
    "[id*='player']",
    "[id*='video']",
    "[id*='audio']",
    // Common player libraries/frameworks
    ".video-js",
    ".jwplayer",
    ".html5-video-player", // YouTube
    ".plyr",
    ".vjs-tech", // Video.js tech element
    ".shaka-video", // Shaka Player
    ".flowplayer", // Flowplayer
    ".mejs__container", // MediaElement.js
    ".uppod-video", // Uppod player
    ".dplayer", // DPlayer
    ".artplayer-app", // ArtPlayer
    ".xgplayer-container", // XGPlayer
    // Data attributes
    "[data-media]",
    "[data-player-id]",
    "[data-video-id]",
    "[data-audio-id]",
    "[data-component*='player']",
    // ARIA roles (use with caution, can be broad)
    "[role='application'][aria-label*='player']",
    "[role='media']",
    // Schema.org markup
    "div[itemtype*='schema.org/VideoObject']",
    "div[itemtype*='schema.org/AudioObject']",
    // Common iframe sources
    "iframe[src*='youtube.com']",
    "iframe[src*='vimeo.com']",
    "iframe[src*='dailymotion.com']",
    "iframe[src*='twitch.tv']",
    "iframe[src*='facebook.com']",
    "iframe[src*='soundcloud.com']",
    "iframe[src*='spotify.com']",
    "iframe[src*='wistia.net']",
    "iframe[src*='brightcove.com']",
    "iframe[src*='kaltura.com']",
  ],
  siteSelectors: {
    "problematicsite.com": [
      ".problem-player",
      "div[data-player]",
      "video[src*='specialstream']",
    ],
    "youtube.com": [
      ".html5-video-player", // Correct selector for the main player container
    ],
    "odysee.com": [
      ".vjs-tech", // Common Video.js tech element
      ".video-js", // Main Video.js container
      ".vjs-control-bar", // Video.js control bar
      "div[class*='player']", // General div with 'player' in class
      "div[data-player-type='odysee']", // Hypothetical Odysee specific data attribute
      "video", // Ensure direct video tag is also considered for Odysee
    ],
    "netflix.com": ["[data-uia='video-player']", ".PlayerControls"],
    "hulu.com": ["video", ".HuluPlayer"],
    "amazon.com": ["[data-player='AmazonVideo']", ".avc-container"],
    "disneyplus.com": [".dp-video-player", "[data-testid='video-player']"],
  },
};

export class MediaManager {
  private static debounceTimeout: NodeJS.Timeout | null = null;
  private static processedElements = new WeakSet<HTMLElement>();
  private static processedMediaElements = new WeakSet<HTMLMediaElement>(); // New WeakSet for media elements
  private static readonly DEBOUNCE_DELAY = 500;
  private static readonly MAX_DEPTH = 10;

  private static isExtensionContext(): boolean {
    try {
      return (
        window.location.protocol === "chrome-extension:" ||
        window.location.protocol === "moz-extension:" ||
        window.location.protocol === "edge-extension:"
      );
    } catch (e) {
      return false;
    }
  }

  // Optimized visibility check
  private static isElementVisible(element: HTMLElement): boolean {
    return !!(
      element.offsetWidth ||
      element.offsetHeight ||
      element.getClientRects().length
    );
  }

  // Use the full siteSelectors configuration
  private static getExtraSelectorsForSite(): string[] {
    const currentHostname = window.location.hostname;
    for (const siteHostname in mediaConfig.siteSelectors) {
      // Exact match for hostname (no subdomain matching)
      if (currentHostname === siteHostname) {
        // Type assertion needed as keys are strings
        return mediaConfig.siteSelectors[
          siteHostname as keyof typeof mediaConfig.siteSelectors
        ];
      }
    }
    return []; // Return empty array if no match found
  }

  // Updated custom player detection with fallback dynamic scanning
  private static findCustomPlayers(root: ParentNode): HTMLElement[] {
    const customPlayers: HTMLElement[] = [];
    const baseSelectors: string[] = mediaConfig.baseSelectors; // from reference file
    // Append extra selectors if needed
    const selectors = baseSelectors.concat(this.getExtraSelectorsForSite());

    try {
      const elements = root.querySelectorAll(selectors.join(","));
      elements.forEach((element) => {
        if (
          element instanceof HTMLElement &&
          !this.processedElements.has(element) &&
          this.isElementVisible(element)
        ) {
          this.processedElements.add(element);
          customPlayers.push(element);
        }
      });
    } catch (e) {
      console.warn("Error finding custom players using selectors:", e);
    }

    // Fallback: if no custom players found, scan all visible elements for descendant media
    if (customPlayers.length === 0) {
      const allElements =
        root instanceof Element
          ? Array.from(root.getElementsByTagName("*"))
          : [];
      allElements.forEach((elem) => {
        if (
          elem instanceof HTMLElement &&
          !this.processedElements.has(elem) &&
          this.isElementVisible(elem) &&
          // Check if the element is not a media element itself but contains one
          !(elem.tagName === "VIDEO" || elem.tagName === "AUDIO") &&
          elem.querySelector("video, audio")
        ) {
          this.processedElements.add(elem);
          customPlayers.push(elem);
        }
      });
    }

    return customPlayers;
  }

  public static findMediaElements(
    root: ParentNode = document,
    depth: number = 0
  ): HTMLMediaElement[] {
    if (this.isExtensionContext() || depth > this.MAX_DEPTH) {
      return [];
    }

    const elements: HTMLMediaElement[] = [];

    try {
      // Direct media elements
      const mediaElements = root.querySelectorAll("video, audio");
      mediaElements.forEach((element) => {
        if (
          element instanceof HTMLMediaElement &&
          !this.processedMediaElements.has(element) && // Use static WeakSet
          this.isElementVisible(element)
        ) {
          elements.push(element);
          this.processedMediaElements.add(element); // Add to static WeakSet
        }
      });

      // Handle Shadow DOM
      if (root instanceof Element && root.shadowRoot) {
        elements.push(...this.findMediaElements(root.shadowRoot, depth + 1));
      }

      // Custom players (only at top level)
      if (depth === 0) {
        const customPlayers = this.findCustomPlayers(root);
        customPlayers.forEach((player) => {
          const mediaInPlayer = player.querySelectorAll("video, audio");
          mediaInPlayer.forEach((element) => {
            if (
              element instanceof HTMLMediaElement &&
              !this.processedMediaElements.has(element) && // Use static WeakSet
              this.isElementVisible(element)
            ) {
              elements.push(element);
              this.processedMediaElements.add(element); // Add to static WeakSet
            }
          });
        });
      }
    } catch (e) {
      if (!this.isExtensionContext()) {
        console.warn("Error finding media elements:", e);
      }
    }

    return Array.from(new Set(elements));
  }

  public static setupMediaElementObserver(
    onAdded: (elements: HTMLMediaElement[]) => void,
    onRemoved: (elements: HTMLMediaElement[]) => void
  ): MutationObserver {
    const debouncedCheck = () => {
      if (MediaManager.debounceTimeout) {
        // Use static debounceTimeout
        clearTimeout(MediaManager.debounceTimeout);
      }
      MediaManager.debounceTimeout = setTimeout(() => {
        // Use static debounceTimeout
        const elements = this.findMediaElements();
        if (elements.length > 0) {
          onAdded(elements);
        }
      }, MediaManager.DEBOUNCE_DELAY); // Use static DEBOUNCE_DELAY
    };

    // Initial check
    if (!this.isExtensionContext()) {
      debouncedCheck();
    }

    // Mutation observer to detect added/removed nodes
    const observer = new MutationObserver((mutations) => {
      const addedMediaElements: HTMLMediaElement[] = [];
      const removedMediaElements: HTMLMediaElement[] = [];

      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLMediaElement) {
              addedMediaElements.push(node);
            } else if (node instanceof HTMLElement) {
              // Check for media elements within added non-media elements
              node.querySelectorAll("video, audio").forEach((el) => {
                if (el instanceof HTMLMediaElement) {
                  addedMediaElements.push(el);
                }
              });
            }
          });

          mutation.removedNodes.forEach((node) => {
            if (node instanceof HTMLMediaElement) {
              removedMediaElements.push(node);
            } else if (node instanceof HTMLElement) {
              // Check for media elements within removed non-media elements
              node.querySelectorAll("video, audio").forEach((el) => {
                if (el instanceof HTMLMediaElement) {
                  removedMediaElements.push(el);
                }
              });
            }
          });
        }
      });

      if (addedMediaElements.length > 0) {
        console.log(
          "[MediaManager Observer] Added media elements detected, triggering debounced check."
        );
        debouncedCheck(); // Trigger debounced check for added elements
      }

      if (removedMediaElements.length > 0) {
        console.log(
          `[MediaManager Observer] Removed ${removedMediaElements.length} media elements, triggering cleanup.`
        );
        onRemoved(removedMediaElements); // Immediately call onRemoved for cleanup
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    return observer;
  }
}
