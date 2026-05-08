# AMO Submission Form - Copy-Paste Content

## Name (Already filled ✓)
Volume & Video Master 1000%

---

## Summary

**Copy this:**
```
Boost video volume up to 1000%, control playback speed, and enhance audio with bass boost, voice boost, and mono audio on any website.
```
*(140 characters - within the 176 limit)*

---

## Description

**Copy this:**
```markdown
**Volume & Video Master 1000%** gives you professional audio controls for any video or audio playing in your browser.

## Features

**Volume Boost** — Increase volume beyond the browser's 100% limit, up to 1000%. Perfect for quiet videos or laptops with weak speakers.

**Playback Speed** — Adjust speed from 0.25x to 5x. Great for speeding through lectures or slowing down tutorials.

**Bass Boost** — Enhance low frequencies for richer, fuller audio.

**Voice Boost** — Clarify speech frequencies for podcasts, lectures, and dialogue-heavy content.

**Mono Audio** — Mix stereo channels to mono for single-earbud listening or hearing-impaired accessibility.

## Smart Settings

- **Global Mode:** Apply the same settings to every website
- **Per-Site Mode:** Save different settings for YouTube, Netflix, Spotify, etc.
- **Disabled Mode:** Turn off the extension for specific sites
- **Persistent:** Your preferences are saved and synced across devices

## Works Everywhere

The extension automatically detects video and audio elements on any website — YouTube, Netflix, Twitch, Spotify, news sites, online courses, and more. No configuration needed.

## Privacy First

- No data collection or tracking
- No external servers — all processing happens locally in your browser
- No ads or affiliate links
- Open source

## Permissions

- **All websites** — Required to access video/audio elements on all websites. Without this, the extension would only work on a limited whitelist of sites.
- **Tabs** — Required to send updated settings to all tabs from the same website when you change them.
- **Storage** — Required to save your preferences and sync them across devices.

**Note:** This extension does not read or transmit your browsing history, page content, or personal data. All processing is done locally in your browser using the Web Audio API.
```

---

## Categories

Select these (up to 3):
1. ✅ **Photos, Music & Videos** (primary category)

You can optionally also select:
2. **Social & Communication** (if you watch videos on social platforms)
3. **Web Development** (not recommended — this is an end-user tool)

---

## Support Email

**You need to enter your email here** — this is required.

Example: `your-email@example.com`

---

## Support Website

Optional — you can leave this blank or enter a GitHub repo URL.

---

## License

Select: **MIT License**

(Unless you prefer a different open-source license)

---

## This add-on has a Privacy Policy

✅ **Check this box**

**Copy this URL or paste the content from your PRIVACY_POLICY.md:**

```
# Privacy Policy — Volume & Video Master 1000%

## Overview
Volume & Video Master 1000% is committed to protecting your privacy. This extension does not collect any personal information.

## Information We Collect
We do not collect any personal information. The extension only stores the following locally in your browser:
- Audio settings preferences (volume level, playback speed, bass boost, voice boost, mono toggle)
- Per-site configuration (whether a site uses global or custom settings)

These are stored using the browser's built-in storage API and are only accessible on your devices.

## How We Use Information
The stored settings are used solely to apply your preferred audio settings to media elements on websites and maintain separate settings for different websites if configured.

## Information We Do NOT Collect
We explicitly do not collect, store, or transmit:
- Website URLs or browsing history
- Page content or media you watch/listen to
- Personal identifiers (name, email, IP address)
- Usage analytics or telemetry
- Crash reports or error logs to external servers

## Data Storage
All data is stored locally in your browser. We do not operate any external servers or databases. Your settings never leave your browser ecosystem.

## Third-Party Services
We do not use any third-party services, analytics, advertising networks, or external APIs.

## Contact
For questions about this Privacy Policy, please contact us through the Firefox Add-ons support channels.
```

---

## Notes to Reviewer

**⚠️ THIS IS CRITICAL — Copy this exactly:**

```
BUILD INSTRUCTIONS:
1. Unzip the source code package
2. Install Node.js (v20+) and pnpm
3. Run: pnpm install
4. Run: pnpm build:firefox
5. The built extension will be in .output/firefox-mv2/
6. Compare with the submitted extension package

VALIDATION NOTES:
- Two "Unsafe assignment to innerHTML" warnings in popup-*.js: These are false positives from React's internal SVG rendering code. Our popup UI uses SVG icons (in components/AudioControls.tsx). React's JSX compilation includes internal DOM manipulation for SVG elements. This is framework-controlled code with static JSX compiled at build time, not user input. No user-generated content is assigned to innerHTML.

- Extension ID: volume-video-master@example.com (placeholder — will be updated to actual domain before final submission)

- Minimum version: Firefox 140+ (desktop), 142+ (Android) — required for data_collection_permissions support

DATA COLLECTION:
This extension collects NO user data. The data_collection_permissions.manifest field is set to { "required": ["none"] }. All settings are stored locally using browser.storage.sync. No data is transmitted to any external server.

SOURCE CODE:
The source code package contains all original TypeScript/React source files. No minification or obfuscation is used. The code is readable as-is. Build process is standard WXT + Vite.
```

---

## After Submission

1. ✅ Check "This add-on is experimental" if this is a beta/test version
2. ❌ Leave "This add-on requires payment" unchecked (it's free)
3. Click **Submit Version**

## Expected Review Time

Firefox AMO review typically takes:
- **1-3 business days** for extensions without remote code
- Up to **5-7 days** for first submissions

Since this extension has no remote code, no data collection, and uses standard APIs, review should be relatively fast.

---

## If Rejected

Common reasons and fixes:

1. **"Permission not adequately justified"** — The reviewer didn't see the notes. Respond with the scripting justification from SCRIPTING_JUSTIFICATION.md

2. **"Source code doesn't match built extension"** — Make sure to build with the exact same version: `pnpm build:firefox` immediately before creating the zip

3. **"Extension ID needs to be updated"** — Change from example.com to your actual domain in wxt.config.ts
