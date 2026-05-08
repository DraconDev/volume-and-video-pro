# Firefox AMO Validation Fixes

## Issues Fixed

### 1. ✅ data_collection_permissions Structure (ERROR)

**Problem:** The manifest had an incorrect structure for `data_collection_permissions`.

**Before (invalid):**
```json
"data_collection_permissions": {
  "collection-ping-history": false,
  "collection-ping-form-data": false,
  ...
}
```

**After (valid):**
```json
"data_collection_permissions": {
  "required": ["none"]
}
```

**Explanation:** According to Mozilla docs, `data_collection_permissions` must have a `required` property that's an array containing either `["none"]` or one or more specific data type strings. The previous structure with boolean flags was incorrect.

### 2. ✅ strict_min_version Too Low (WARNING)

**Problem:** `strict_min_version: "109.0"` was set, but `data_collection_permissions` requires Firefox 140+.

**Before:**
```json
"strict_min_version": "109.0"
```

**After:**
```json
"strict_min_version": "140.0"
```

**Android:**
```json
"gecko_android": {
  "strict_min_version": "142.0"
}
```

### 3. ⚠️ innerHTML Warnings (2 remaining)

**Status:** These are false positives from React's internal SVG rendering code.

**Details:**
- Location: `chunks/popup-2rw9CJ3F.js` lines 6203 and 6263
- Cause: React's internal DOM manipulation for SVG elements
- Risk: None - this is framework code, not user input

**For AMO Review:** Add this note in the review notes:
> "The innerHTML warnings are from React's internal SVG rendering code (we use SVG icons in the popup UI). This is controlled framework code, not user input. The content is static JSX compiled at build time."

## Validation Results (Expected After Fixes)

```
General Tests: 0 errors, 2 warnings, 0 notices
Security Tests: 0 errors, 0 warnings, 0 notices
Extension Tests: 0 errors, 0 warnings, 0 notices
Localization Tests: 0 errors, 0 warnings, 0 notices
Compatibility Tests: 0 errors, 0 warnings, 0 notices
```

The 2 remaining warnings are the innerHTML false positives which should not block review.

## Files Changed

- `wxt.config.ts` - Fixed Firefox manifest configuration

## Build Output

- Extension: `.output/volume-and-video-pro-3.21.0-firefox.zip` (229 kB)
- Source: `.output/volume-and-video-pro-3.21.0-sources.zip` (380 kB)

## Submission Notes

When submitting to AMO:

1. **Extension ID:** Update `volume-video-master@example.com` to your actual email/domain before submission
2. **Review Notes:** Include the innerHTML explanation above
3. **Minimum Version:** Users need Firefox 140+ (desktop) or 142+ (Android)
4. **Data Collection:** The extension collects NO user data - settings are stored locally only

## Next Steps

1. Update extension ID in `wxt.config.ts`
2. Rebuild: `pnpm zip:firefox`
3. Submit to AMO with review notes about innerHTML warnings
4. Upload source ZIP alongside extension ZIP (required for review)
