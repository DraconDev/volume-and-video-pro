export class MediaManager {
    // Keep track of already processed elements to avoid duplicates
    private static processedElements = new WeakSet<HTMLElement>();

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

    // Check if an element is actually visible
    private static isElementVisible(element: HTMLElement): boolean {
        const style = window.getComputedStyle(element);
        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            element.offsetParent !== null
        );
    }

    // Handle custom video players
    private static findCustomPlayers(root: ParentNode): HTMLElement[] {
        const customPlayers: HTMLElement[] = [];

        // Common custom video player selectors
        const selectors = [
            '[class*="player"]',
            '[class*="video"]',
            '[class*="Player"]',
            '[class*="Video"]',
            '[class*="media"]',
            '[class*="Media"]',
            '[id*="player"]',
            '[id*="video"]',
            // React players
            '[class*="react-player"]',
            // YouTube custom elements
            "ytd-player",
            // Vimeo player
            ".vimeo-player",
            // JW Player
            ".jwplayer",
            // Video.js
            ".video-js",
            // Plyr
            ".plyr",
            // Common streaming platform containers
            '[class*="netflix"]',
            '[class*="hulu"]',
            '[class*="prime"]',
            // HTML5 media containers
            '[class*="audio-player"]',
            '[class*="music-player"]',
        ];

        try {
            const elements = Array.from(
                root.querySelectorAll(selectors.join(","))
            ) as HTMLElement[];

            for (const element of elements) {
                if (
                    !this.processedElements.has(element) &&
                    this.isElementVisible(element)
                ) {
                    this.processedElements.add(element);
                    customPlayers.push(element);
                }
            }
        } catch (e) {
            console.warn("Error finding custom players:", e);
        }

        return customPlayers;
    }

    static findMediaElements(
        root: ParentNode = document,
        maxDepth: number = 15
    ): HTMLMediaElement[] {
        const elements: HTMLMediaElement[] = [];
        const processedNodes = new Set<Node>();

        if (this.isExtensionContext()) {
            return elements;
        }

        try {
            // Helper function to process a single node
            const processNode = (node: Node, depth: number) => {
                if (processedNodes.has(node) || depth >= maxDepth) return;
                processedNodes.add(node);

                if (
                    node instanceof HTMLMediaElement &&
                    this.isElementVisible(node)
                ) {
                    elements.push(node);
                }

                // Handle Shadow DOM
                if (node instanceof Element && node.shadowRoot) {
                    processTree(node.shadowRoot, depth + 1);
                }

                // Process child nodes
                const children = node.childNodes;
                for (let i = 0; i < children.length; i++) {
                    processNode(children[i], depth + 1);
                }
            };

            // Process entire tree starting from root
            const processTree = (root: ParentNode, depth: number) => {
                // Find standard media elements
                const mediaElements = root.querySelectorAll("video, audio");
                mediaElements.forEach((element) => {
                    if (
                        element instanceof HTMLMediaElement &&
                        !processedNodes.has(element)
                    ) {
                        processNode(element, depth);
                    }
                });

                // Find embedded iframes
                const iframes = root.querySelectorAll("iframe");
                iframes.forEach((iframe) => {
                    try {
                        const iframeDoc =
                            iframe.contentDocument ||
                            iframe.contentWindow?.document;
                        if (iframeDoc && !processedNodes.has(iframeDoc)) {
                            processTree(iframeDoc, depth + 1);
                        }
                    } catch (e) {
                        // Handle cross-origin iframe silently
                    }
                });

                // Find custom video players
                const customPlayers = this.findCustomPlayers(root);
                customPlayers.forEach((player) => {
                    const mediaInPlayer =
                        player.querySelectorAll("video, audio");
                    mediaInPlayer.forEach((element) => {
                        if (
                            element instanceof HTMLMediaElement &&
                            !processedNodes.has(element)
                        ) {
                            processNode(element, depth);
                        }
                    });
                });
            };

            // Start processing from root
            processTree(root, 0);

            // Handle potential window.frames if we're in the top frame
            if (!this.inIframe()) {
                for (let i = 0; i < window.frames.length; i++) {
                    try {
                        const frameDoc = window.frames[i].document;
                        if (frameDoc && !processedNodes.has(frameDoc)) {
                            processTree(frameDoc, 0);
                        }
                    } catch (e) {
                        // Handle cross-origin frame silently
                    }
                }
            }
        } catch (e) {
            if (!this.isExtensionContext()) {
                console.warn("MediaManager: Error finding media elements:", e);
            }
        }

        // Clean up and return unique elements
        return Array.from(new Set(elements));
    }

    static setupMediaElementObserver(
        callback: (elements: HTMLMediaElement[]) => void,
        debounceMs: number = 100
    ): MutationObserver {
        let timeoutId: NodeJS.Timeout | null = null;

        const debouncedCallback = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                const elements = this.findMediaElements();
                if (elements.length > 0) {
                    callback(elements);
                }
            }, debounceMs);
        };

        // Initial check
        if (!this.isExtensionContext()) {
            debouncedCallback();
        }

        // Set up mutation observer
        const observer = new MutationObserver((mutations) => {
            let hasRelevantChanges = false;

            for (const mutation of mutations) {
                // Check added nodes
                if (mutation.addedNodes.length > 0) {
                    hasRelevantChanges = Array.from(mutation.addedNodes).some(
                        (node) => {
                            if (node instanceof Element) {
                                // Check for media elements or potential custom players
                                return (
                                    node.tagName === "VIDEO" ||
                                    node.tagName === "AUDIO" ||
                                    node.querySelector?.("video, audio") ||
                                    node.className
                                        .toLowerCase()
                                        .includes("player") ||
                                    node.className
                                        .toLowerCase()
                                        .includes("video") ||
                                    node.shadowRoot !== null
                                );
                            }
                            return false;
                        }
                    );
                }

                // Check attribute changes that might reveal players
                if (!hasRelevantChanges && mutation.type === "attributes") {
                    const target = mutation.target as Element;
                    hasRelevantChanges =
                        target.className.toLowerCase().includes("player") ||
                        target.className.toLowerCase().includes("video") ||
                        target.getAttribute("data-player") !== null;
                }

                if (hasRelevantChanges) break;
            }

            if (hasRelevantChanges) {
                debouncedCallback();
            }
        });

        // Start observing with configuration
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "style", "data-player"],
        });

        return observer;
    }
}
