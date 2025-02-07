export class MediaManager {
    private static observedElements = new Set<HTMLMediaElement>();
    private static processedElements = new WeakSet<HTMLElement>();
    private static readonly DEBOUNCE_DELAY = 1000; // Increased debounce delay
    private static readonly MAX_DEPTH = 5; // Reduced max depth

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
        return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    }

    // Simplified custom player detection
    private static findCustomPlayers(root: ParentNode): HTMLElement[] {
        const customPlayers: HTMLElement[] = [];
        
        // Reduced set of essential selectors
        const selectors = [
            'video',
            'audio',
            '[class*="player"]',
            '[class*="video"]',
            '[class*="audio"]',
            '.video-js',
            '.jwplayer',
            '.html5-video-player'
        ];

        try {
            const elements = root.querySelectorAll(selectors.join(","));
            elements.forEach(element => {
                if (element instanceof HTMLElement && 
                    !this.processedElements.has(element) && 
                    this.isElementVisible(element)) {
                    this.processedElements.add(element);
                    customPlayers.push(element);
                }
            });
        } catch (e) {
            console.warn("Error finding custom players:", e);
        }

        return customPlayers;
    }

    static findMediaElements(): HTMLMediaElement[] {
        return Array.from(this.observedElements);
    }

    static setupMediaElementObserver(callback: () => Promise<void>) {
        // Watch for dynamically added media elements
        const observer = new MutationObserver((mutations) => {
            let mediaAdded = false;
            
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLMediaElement) {
                        this.observedElements.add(node);
                        mediaAdded = true;
                    }
                    // Check for media elements inside added nodes
                    if (node instanceof Element) {
                        node.querySelectorAll('video, audio').forEach(media => {
                            this.observedElements.add(media as HTMLMediaElement);
                            mediaAdded = true;
                        });
                    }
                });
            });

            if (mediaAdded) {
                callback();
            }
        });

        // Observe the entire document including shadow DOM
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        // Also look for media elements in shadow DOM
        const scanShadowDOM = (root: Element) => {
            if (root.shadowRoot) {
                root.shadowRoot.querySelectorAll('video, audio').forEach(media => {
                    this.observedElements.add(media as HTMLMediaElement);
                });
                root.shadowRoot.querySelectorAll('*').forEach(scanShadowDOM);
            }
        };

        // Initial scan for media elements
        const initialScan = () => {
            document.querySelectorAll('video, audio').forEach(media => {
                this.observedElements.add(media as HTMLMediaElement);
            });
            document.querySelectorAll('*').forEach(scanShadowDOM);
            if (this.observedElements.size > 0) {
                callback();
            }
        };

        // Run initial scan and setup periodic rescans for troublesome sites
        initialScan();
        setInterval(initialScan, 1000);

        return observer;
    }
}
