import { root } from "postcss";

const mediaConfig = {
  baseSelectors: [
    "video",
    "audio",
    // Essential player patterns
    "[class*='player']",
    "[class*='video']",
    "[id*='player']",
    "[id*='video']",
    // Common frameworks
    ".video-js",
    ".jwplayer",
    ".html5-video-player",
    ".plyr",
    // Key data attributes
    "[data-player]",
    "[data-video]",
    "[data-media]",
    // Key iframe sources
    "iframe[src*='youtube.com']",
    "iframe[src*='vimeo.com']",
    "iframe[src*='dailymotion.com']",
    "iframe[src*='twitch.tv']"
  ],
  siteSelectors: {
    "youtube.com": [".html5-video-player"],
    "netflix.com": ["[data-uia='video-player']"],
    "hulu.com": [".HuluPlayer"],
    "amazon.com": ["[data-player='AmazonVideo']"],
    "disneyplus.com": [".dp-video-player"]
  }
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
    const baseSelectors = mediaConfig.baseSelectors;
    const siteSelectors = this.getExtraSelectorsForSite();
    const allSelectors = [...baseSelectors, ...siteSelectors];
    
    // Use a Set to avoid duplicate elements
    const selectorElements = new Set<Element>();
    
    try {
      // Process each selector individually to avoid massive combined selector
      for (const selector of allSelectors) {
        try {
          const elements = root.querySelectorAll(selector);
          elements.forEach(el => selectorElements.add(el));
        } catch (e) {
          console.warn(`Error with selector '${selector}':`, e);
        }
      }
      
      // Process collected elements
      selectorElements.forEach(element => {
        if (element instanceof HTMLElement && !this.processedElements.has(element)) {
          this.processedElements.add(element);
          customPlayers.push(element);
        }
      });
    } catch (e) {
      console.warn("Error finding custom players:", e);
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
        if (element instanceof HTMLMediaElement) {
          elements.push(element);
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
            if (element instanceof HTMLMediaElement) {
              elements.push(element);
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
        clearTimeout(MediaManager.debounceTimeout);
      }
      MediaManager.debounceTimeout = setTimeout(() => {
        const elements = this.findMediaElements();
        if (elements.length > 0) {
          onAdded(elements);
        }
      }, MediaManager.DEBOUNCE_DELAY);
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
