// ...existing code...

// Initialize as soon as possible
document.addEventListener('DOMContentLoaded', () => {
  // Setup media processor
  const mediaProcessor = new MediaProcessor();
  
  // Setup observer for media elements
  mediaProcessor.setupMediaObserver(async () => {
    const elements = mediaProcessor.findMediaElements();
    if (elements.length > 0) {
      console.log('Content Script: Found media elements:', elements);
      // Process any found elements
      await processMediaElements(elements);
    }
  });

  // Initial media element scan
  const initialElements = mediaProcessor.findMediaElements();
  if (initialElements.length > 0) {
    processMediaElements(initialElements);
  }
});

// Also run on window load to catch late-loading elements
window.addEventListener('load', () => {
  const mediaProcessor = new MediaProcessor();
  const elements = mediaProcessor.findMediaElements();
  if (elements.length > 0) {
    processMediaElements(elements);
  }
});

// ...existing code...
