export class MediaManager {
    private static inIframe(): boolean {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }

    static findMediaElements(root: ParentNode = document, maxDepth: number = 10): HTMLMediaElement[] {
        const elements: HTMLMediaElement[] = [];

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
                shadowChildren.forEach(child => {
                    if (child instanceof Element) {
                        processShadowDOM(child, currentDepth + 1);
                    }
                });
            }
        }

        // Process root elements
        const rootElements = Array.from(root.children);
        rootElements.forEach(element => {
            if (element instanceof Element) {
                processShadowDOM(element, 0);
            }
        });

        // Handle iframes if in top frame
        if (!this.inIframe()) {
            try {
                const iframes = root.querySelectorAll("iframe");
                iframes.forEach((iframe) => {
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (iframeDoc) {
                            elements.push(...this.findMediaElements(iframeDoc, maxDepth - 1));
                        }
                    } catch (e) {
                        // Cross-origin iframe, ignore silently
                    }
                });
            } catch (e) {
                console.warn("MediaManager: Error accessing iframes:", e);
            }
        }

        return Array.from(new Set(elements));
    }

    static setupMediaElementObserver(callback: (elements: HTMLMediaElement[]) => void): MutationObserver {
        const observer = new MutationObserver((mutations) => {
            let hasNewMedia = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    const mediaInMutation = Array.from(mutation.addedNodes).some(
                        node => node instanceof Element && 
                        (node.tagName === "VIDEO" || node.tagName === "AUDIO" ||
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
            subtree: true
        });

        return observer;
    }
}
