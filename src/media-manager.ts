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
    // More generic data attributes
    "[data-src*='video']",
    "[data-src*='audio']",
    "[data-url*='video']",
    "[data-url*='audio']",
    "[data-type*='video']",
    "[data-type*='audio']",
    "[data-media-id]",
    "[data-media-src]",
    // ARIA roles (use with caution, can be broad)
    "[role='application'][aria-label*='player']",
    "[role='media']",
    "[role='img'][aria-label*='video']", // Sometimes video players are just images with role img
    // Schema.org markup and other microdata
    "div[itemtype*='schema.org/VideoObject']",
    "div[itemtype*='schema.org/AudioObject']",
    "[itemprop*='video']",
    "[itemprop*='audio']",
    // Elements with tabindex that might be interactive players
    "[tabindex][class*='player']",
    "[tabindex][class*='video']",
    "[tabindex][class*='audio']",
    // More common player classes/IDs
    ".media-player",
    ".player-container",
    ".video-container",
    ".audio-container",
    ".embed-responsive-item", // Bootstrap video embeds
    ".wp-video", // WordPress video
    ".wp-audio", // WordPress audio
    ".elementor-video", // Elementor video widget
    ".elementor-audio", // Elementor audio widget
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
  private static processedElements = new WeakSet<HTMLElement>(); // Keep for custom player containers
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
    console.log(`[MediaManager] findCustomPlayers: Searching with selectors: ${selectors.join(", ")}`);

    try {
      const elements = root.querySelectorAll(selectors.join(","));
      console.log(`[MediaManager] findCustomPlayers: QuerySelectorAll found ${elements.length} elements.`);
      elements.forEach((element) => {
        if (
          element instanceof HTMLElement &&
          !this.processedElements.has(element)
        ) {
          this.processedElements.add(element);
          customPlayers.push(element);
          console.log(`[MediaManager] findCustomPlayers: Added custom player container: ${element.tagName} ${element.className || element.id} (src: ${element.getAttribute('src') || 'N/A'})`);
        } else if (element instanceof HTMLElement) {
          console.log(`[MediaManager] findCustomPlayers: Skipping already processed custom player container: ${element.tagName} ${element.className || element.id}`);
        }
      });
    } catch (e) {
      console.warn("Error finding custom players using selectors:", e);
    }

    // Always perform a broader scan for elements that contain media,
    // regardless of whether initial selectors found anything.
    // This ensures we catch players that don't match specific selectors but wrap media.
    const allElements =
      root instanceof Element ? Array.from(root.getElementsByTagName("*")) : [];
    console.log(`[MediaManager] findCustomPlayers: Scanning all ${allElements.length} elements for descendants.`);
    allElements.forEach((elem) => {
      if (
        elem instanceof HTMLElement &&
        !this.processedElements.has(elem) &&
        // Check if the element is not a media element itself but contains one
        !(elem.tagName === "VIDEO" || elem.tagName === "AUDIO") &&
        elem.querySelector("video, audio")
      ) {
        this.processedElements.add(elem);
        customPlayers.push(elem);
        console.log(`[MediaManager] findCustomPlayers: Added element containing media: ${elem.tagName} ${elem.className || elem.id} (src: ${elem.getAttribute('src') || 'N/A'})`);
      } else if (elem instanceof HTMLElement) {
        // console.log(`[MediaManager] findCustomPlayers: Skipping already processed or non-media-containing element: ${elem.tagName} ${elem.className || elem.id}`);
      }
    });

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
    console.log(`[MediaManager] findMediaElements: Starting search in root: ${root.nodeName}`);

    try {
      // Direct media elements
      const mediaElements = root.querySelectorAll("video, audio");
      console.log(`[MediaManager] findMediaElements: QuerySelectorAll for "video, audio" found ${mediaElements.length} elements.`);
      mediaElements.forEach((element) => {
        if (element instanceof HTMLMediaElement) {
          elements.push(element);
          console.log(`[MediaManager] findMediaElements: Added direct media element: ${element.tagName} (src: ${element.src || '(no src)'}, id: ${element.id || 'N/A'})`);
        }
      });

      // Handle Shadow DOM
      if (root instanceof Element && root.shadowRoot) {
        elements.push(...this.findMediaElements(root.shadowRoot, depth + 1));
      }

      // Custom players (only at top level)
      if (depth === 0) {
        console.log(`[MediaManager] findMediaElements: Calling findCustomPlayers for top level.`);
        const customPlayers = this.findCustomPlayers(root);
        console.log(`[MediaManager] findMediaElements: findCustomPlayers returned ${customPlayers.length} custom player containers.`);
        customPlayers.forEach((player) => {
          const mediaInPlayer = player.querySelectorAll("video, audio");
          console.log(`[MediaManager] findMediaElements: Found ${mediaInPlayer.length} media elements within custom player container: ${player.tagName} ${player.className || player.id}`);
          mediaInPlayer.forEach((element) => {
            if (element instanceof HTMLMediaElement) {
              elements.push(element);
              console.log(`[MediaManager] findMediaElements: Added media element from custom player: ${element.tagName} (src: ${element.src || '(no src)'}, id: ${element.id || 'N/A'})`);
            }
          });
        });
      }
    } catch (e) {
      if (!this.isExtensionContext()) {
        console.warn("Error finding media elements:", e);
      }
    }
    console.log(`[MediaManager] findMediaElements: Returning ${elements.length} unique media elements.`);

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
