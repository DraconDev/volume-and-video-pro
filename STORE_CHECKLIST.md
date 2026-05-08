# Store Preparation Checklist

## Chrome Web Store

### Required Assets
- [ ] Extension package (`.zip` from `pnpm zip`)
- [ ] Store icon (128x128 PNG)
- [ ] Screenshots (at least 1, up to 5)
  - [ ] 1280x800 or 640x400 PNG/JPEG
  - [ ] Show popup UI with controls visible
  - [ ] Show before/after audio settings
- [ ] Promotional images (optional)
  - [ ] Small: 440x280
  - [ ] Marquee: 1400x560

### Store Listing Information
- [ ] **Title:** Volume & Video Master 1000%
- [ ] **Short description** (up to 132 chars): Boost volume up to 1000%, control playback speed, and enhance audio with bass/voice boost filters.
- [ ] **Detailed description** (see STORE_DESCRIPTION.md)
- [ ] **Category:** Entertainment or Productivity
- [ ] **Language:** English (primary)
- [ ] **Website:** (optional)
- [ ] **Support email:** (required)
- [ ] **Privacy policy:** Link to PRIVACY_POLICY.md

### Permission Justification
- [ ] Submit `SCRIPTING_JUSTIFICATION.md` content in the privacy practices section
- [ ] Explain why `<all_urls>` is required (media elements exist on all websites)
- [ ] Explain why `tabs` is required (settings broadcasting to matching tabs)
- [ ] Confirm no remote code execution
- [ ] Confirm no data collection

### Pricing & Distribution
- [ ] **Price:** Free
- [ ] **Distribution:** All regions
- [ ] **Visibility:** Public

### Review Preparation
- [ ] Test on clean Chrome profile
- [ ] Verify popup opens on all major sites (YouTube, Netflix, etc.)
- [ ] Test settings persistence across browser restarts
- [ ] Test per-site vs global mode switching
- [ ] Verify no console errors in production build

---

## Firefox Add-ons (AMO)

### Required Assets
- [ ] Extension package (`.zip` from `pnpm zip:firefox`)
- [ ] Icons (included in build)
- [ ] Screenshots (up to 8)
  - [ ] 1000x750 or 750x1000 recommended
  - [ ] Same content as Chrome screenshots

### Store Listing Information
- [ ] **Name:** Volume & Video Master 1000%
- [ ] **Summary** (up to 154 chars): Boost video volume beyond 100%, control playback speed, and enhance audio with bass boost and voice boost filters.
- [ ] **Description** (see STORE_DESCRIPTION.md)
- [ ] **Category:** Video & Audio
- [ ] **Homepage:** (optional)
- [ ] **Support site:** (optional)
- [ ] **Support email:** (required)
- [ ] **Privacy policy:** Link to PRIVACY_POLICY.md

### Technical Requirements
- [x] Manifest includes `browser_specific_settings.gecko.id`
- [x] Manifest includes `data_collection_permissions` (required as of Nov 2025)
- [x] Build succeeds with `pnpm build:firefox`
- [x] Extension ID registered: `volume-video-master@example.com`

### Review Preparation
- [ ] Test on Firefox Developer Edition
- [ ] Verify background script works with Firefox MV2
- [ ] Test content script injection on HTTP/HTTPS sites
- [ ] Verify storage.sync works correctly
- [ ] Check that popup UI renders correctly in Firefox

### Firefox-Specific Notes
- Firefox uses MV2 (background script, not service worker)
- `browser.action` API available in Firefox 109+
- `chrome.storage.sync` supported
- All major APIs used are cross-browser compatible

---

## Both Stores

### Pre-Submission Checklist
- [ ] Version bumped in `package.json` (current: 3.19.0)
- [ ] All tests pass (`pnpm test`)
- [ ] Both builds succeed (`pnpm build` + `pnpm build:firefox`)
- [ ] No debug logging in production (all use `debugLog()`)
- [ ] No TODO/FIXME comments in source
- [ ] Privacy policy is clear and accurate
- [ ] Extension icon displays correctly at all sizes
- [ ] Popup UI is responsive and accessible

### Post-Submission
- [ ] Monitor review status
- [ ] Respond to reviewer questions promptly
- [ ] Be prepared to explain `<all_urls>` permission
- [ ] Have source code ready if requested (Chrome may ask for unminified source)
