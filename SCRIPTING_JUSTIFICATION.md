# Scripting Justification — Volume & Video Master 1000%

## Extension Purpose

Volume & Video Master 1000% is a browser extension that provides advanced audio and video controls for HTML5 media elements across all websites. It allows users to:

- Boost volume beyond the browser's 100% limit (up to 1000%)
- Adjust playback speed (0.25x–5x)
- Apply bass boost and voice boost audio filters
- Toggle mono audio
- Save per-site or global settings

## Why `<all_urls>` Permission is Required

**Technical Necessity:**

This extension processes `<video>` and `<audio>` HTML elements on web pages. Media elements exist on virtually every website — YouTube, Netflix, Spotify, Twitch, news sites, educational platforms, corporate training portals, and personal blogs.

Without `<all_urls>`, the extension would only work on a predefined whitelist of domains. This would:
1. Break the user experience on the vast majority of websites
2. Require constant updates to add new video platforms
3. Make the extension unreliable and frustrating for users

**What we do NOT do with this permission:**
- We do not read or transmit page content, URLs, or user data to external servers
- We do not inject ads or tracking scripts
- We do not modify page layout or styling (except audio-related attributes on media elements)
- All processing happens locally in the browser via the Web Audio API

## Why `tabs` Permission is Required

**Technical Necessity:**

The `tabs` permission is used for three specific purposes:

1. **Settings Broadcasting:** When a user changes settings in the popup, we use `chrome.tabs.query()` to find tabs matching the current hostname and send updated settings via `chrome.tabs.sendMessage()`. This ensures all tabs from the same site receive the new configuration immediately.

2. **Initial Settings Retrieval:** When a popup opens, we query the active tab to determine the current hostname and retrieve the appropriate site-specific or global settings.

3. **Cross-Tab Synchronization:** When global settings are updated, we broadcast them to all tabs that don't have site-specific overrides.

**What we do NOT do with this permission:**
- We do not read tab titles, URLs, or favicons for tracking or analytics
- We do not take screenshots or capture tab content
- We do not inject scripts into tabs unrelated to media processing

## Why `storage` Permission is Required

**Technical Necessity:**

The `storage` permission is required to persist user preferences using `chrome.storage.sync`:

- Global audio settings (volume, speed, bass, voice, mono)
- Per-site configuration (which sites use global vs. custom settings)
- Site-specific settings overrides

This allows users to have consistent settings across all their devices signed into Chrome.

## Why `activeTab` is NOT Used Instead

`activeTab` only grants temporary access to the currently active tab when the user clicks the extension icon. This is insufficient because:

1. Settings must be applied automatically when media elements appear (not just after clicking the icon)
2. Background sync requires access to tabs even when the popup is closed
3. Per-site persistence requires knowing the hostname, which `activeTab` does not provide reliably

## Data Handling

- **No remote servers:** All processing is local. No data leaves the browser.
- **No analytics:** We do not track usage, errors, or user behavior.
- **Storage scope:** Only audio settings (numbers and booleans) are stored. No page content, URLs, or personal data.
- **Open source:** The full source code is available for audit.

## Compliance with Chrome Web Store Policies

This extension complies with:
- **Single Purpose Policy:** The extension has one clear purpose — enhancing audio/video playback.
- **Requesting Permissions:** All permissions are essential to the core functionality and cannot be reasonably reduced.
- **Data Handling:** No user data is collected, transmitted, or sold.
