// ...existing code...
const isDisabled = siteConfig?.activeSetting === "disabled"; // Updated from 'default'

// ...existing code...
const handleModeChange = async (mode: "global" | "site" | "disabled") => {
  // Updated type
  // ...existing code...
};

// Update any status text or tooltips
const getStatusText = () => {
  if (isDisabled) {
    return "Extension is disabled for this site"; // Updated text
  }
  // ...existing code...
};
// ...existing code...
