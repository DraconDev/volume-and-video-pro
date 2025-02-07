import mediaConfig from "../references/media-config.json";
import { AudioSettings } from "./types";

export class MediaManager {
  // Keep track of already processed elements to avoid duplicates
  private static processedElements = new WeakSet<HTMLElement>();
  private static readonly MAX_DEPTH = 10; // Increased max depth

  private static inIframe(): boolean {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }

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

  // Revert getExtraSelectorsForSite() to original implementation
  private static getExtraSelectorsForSite(): string[] {
    const hostname = window.location.hostname;
    if (hostname.includes("problematicsite.com")) {
      return [
        ".problem-player",
        "div[data-player]",
        'video[src*="specialstream"]',
      ];
    }
    return [];
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

  static findMediaElements(
    root: ParentNode = document,
    depth: number = 0
  ): HTMLMediaElement[] {
    if (this.isExtensionContext() || depth > this.MAX_DEPTH) {
      return [];
    }

    const elements: HTMLMediaElement[] = [];
    const processedNodes = new Set<Node>();

    try {
      // Direct media elements
      const mediaElements = root.querySelectorAll("video, audio");
      mediaElements.forEach((element) => {
        if (
          element instanceof HTMLMediaElement &&
          !processedNodes.has(element) &&
          this.isElementVisible(element)
        ) {
          elements.push(element);
          processedNodes.add(element);
        }
      });

      // Handle Shadow DOM
      if (root instanceof Element && root.shadowRoot) {
        elements.push(...this.findMediaElements(root.shadowRoot, depth + 1));
      }

      // Handle iframes only in top frame
      if (!this.inIframe() && depth === 0) {
        const iframes = root.querySelectorAll("iframe");
        iframes.forEach((iframe) => {
          try {
            const iframeDoc =
              iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc && !processedNodes.has(iframeDoc)) {
              elements.push(...this.findMediaElements(iframeDoc, depth + 1));
              processedNodes.add(iframeDoc);
            }
          } catch (e) {
            // Silently handle cross-origin iframes
          }
        });
      }

      // Custom players (only at top level)
      if (depth === 0) {
        const customPlayers = this.findCustomPlayers(root);
        customPlayers.forEach((player) => {
          const mediaInPlayer = player.querySelectorAll("video, audio");
          mediaInPlayer.forEach((element) => {
            if (
              element instanceof HTMLMediaElement &&
              !processedNodes.has(element) &&
              this.isElementVisible(element)
            ) {
              elements.push(element);
              processedNodes.add(element);
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

  static setupMediaElementObserver(
    callback: (elements: HTMLMediaElement[]) => void
  ): MutationObserver {
    let debounceTimeout: NodeJS.Timeout | null = null;
    let lastCheck = Date.now();

    const debouncedCheck = () => {
      const now = Date.now();
      if (now - lastCheck < this.DEBOUNCE_DELAY) {
        return;
      }

      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      debounceTimeout = setTimeout(() => {
        lastCheck = now;
        const elements = this.findMediaElements();
        if (elements.length > 0) {
          callback(elements);
        }
      }, this.DEBOUNCE_DELAY);
    };

    // Initial check
    if (!this.isExtensionContext()) {
      debouncedCheck();
    }

    // Simplified mutation observer
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          const hasMediaElement = Array.from(mutation.addedNodes).some(
            (node) =>
              node instanceof Element &&
              (node.tagName === "VIDEO" ||
                node.tagName === "AUDIO" ||
                node.querySelector?.("video, audio"))
          );

          if (hasMediaElement) {
            debouncedCheck();
            break;
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    return observer;
  }
}
