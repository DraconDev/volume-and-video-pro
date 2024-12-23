export class MediaManager {
    private static inIframe(): boolean {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }

    private static isExtensionContext(): boolean {
        try {
            return window.location.protocol === 'chrome-extension:' || 
                   window.location.protocol === 'moz-extension:' ||
                   window.location.protocol === 'edge-extension:';
        } catch (e) {
            return false;
        }
    }

    static findMediaElements(
        root: ParentNode = document,
        maxDepth: number = 10
    ): HTMLMediaElement[] {
        const elements: HTMLMediaElement[] = [];

        // Skip media detection in extension pages
        if (this.isExtensionContext()) {
            return elements;
        }

        // Get regular elements first - this is faster
        const regularElements = Array.from(
            root.querySelectorAll("video, audio")
        );
        elements.push(...(regularElements as HTMLMediaElement[]));

        // Process shadow DOM with depth limit
        function processShadowDOM(node: Element, currentDepth: number) {
            if (currentDepth >= maxDepth) return;

            if (node.shadowRoot) {
                const shadowMediaElements = Array.from(
                    node.shadowRoot.querySelectorAll("video, audio")
                ) as HTMLMediaElement[];
                elements.push(...shadowMediaElements);

                // Process child shadow roots
                const shadowChildren = Array.from(node.shadowRoot.children);
                shadowChildren.forEach((child) => {
                    if (child instanceof Element) {
                        processShadowDOM(child, currentDepth + 1);
                    }
                });
            }
        }

        // Process root elements
        const rootElements = Array.from(root.children);
        rootElements.forEach((element) => {
            if (element instanceof Element) {
                processShadowDOM(element, 0);
            }
        });

        // Handle iframes if in top frame and not in extension context
        if (!this.inIframe()) {
            try {
                // First handle direct iframes
                const iframes = Array.from(root.querySelectorAll("iframe"));
                iframes.forEach((iframe) => {
                    try {
                        // Try accessing iframe content
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (iframeDoc) {
                            // Get media elements from iframe
                            const iframeMedia = Array.from(
                                iframeDoc.querySelectorAll("video, audio")
                            ) as HTMLMediaElement[];
                            elements.push(...iframeMedia);

                            // Also check nested iframes recursively
                            if (maxDepth > 0) {
                                elements.push(
                                    ...this.findMediaElements(
                                        iframeDoc,
                                        maxDepth - 1
                                    )
                                );
                            }
                        }
                    } catch (e) {
                        // Cross-origin iframe, ignore silently
                    }
                });

                // Only try window.frames in web context
                if (!this.isExtensionContext()) {
                    for (let i = 0; i < window.frames.length; i++) {
                        try {
                            const frameDoc = window.frames[i].document;
                            const frameMedia = Array.from(
                                frameDoc.querySelectorAll("video, audio")
                            ) as HTMLMediaElement[];
                            elements.push(...frameMedia);
                        } catch (e) {
                            // Cross-origin frame, ignore silently
                        }
                    }
                }
            } catch (e) {
                // Log only if not in extension context
                if (!this.isExtensionContext()) {
                    console.warn("MediaManager: Error accessing iframes:", e);
                }
            }
        }

        return Array.from(new Set(elements));
    }

    static setupMediaElementObserver(
        callback: (elements: HTMLMediaElement[]) => void
    ): MutationObserver {
        // Skip initial check in extension context
        if (!this.isExtensionContext()) {
            const initialElements = this.findMediaElements();
            if (initialElements.length > 0) {
                callback(initialElements);
            }
        }

        const observer = new MutationObserver((mutations) => {
            let hasNewMedia = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    const mediaInMutation = Array.from(
                        mutation.addedNodes
                    ).some(
                        (node) =>
                            node instanceof Element &&
                            (node.tagName === "VIDEO" ||
                                node.tagName === "AUDIO" ||
                                node.querySelector?.("video, audio"))
                    );
                    if (mediaInMutation) {
                        hasNewMedia = true;
                        break;
                    }
                }
            }
            if (hasNewMedia) {
                callback(this.findMediaElements());
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        return observer;
    }
}
