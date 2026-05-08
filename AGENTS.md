# AGENTS.md — Volume & Video Pro

## Project Overview

Browser extension (Chrome MV3, WXT, React 18, TypeScript, Web Audio API) providing advanced audio/video controls: volume boost up to 1000%, playback speed, bass boost, voice boost, mono audio. Supports per-site, global, and disabled modes.

## Architecture

### Communication Flow

```
Popup (React) ↔ Background (Service Worker) ↔ Content Script ↔ Web Page
                                    ↕
                          SettingsManager (chrome.storage.sync)
```

### Key Modules

| File | Responsibility |
|------|---------------|
| `background.ts` | Service worker lifecycle, message routing |
| `message-handler.ts` | All `chrome.runtime.onMessage` handlers |
| `content-script-init.ts` | Content script orchestrator (thin after refactor) |
| `content-script/media-events.ts` | Stable media element event handlers |
| `content-script/message-handler.ts` | Content script message handling |
| `content-script/dom-lifecycle.ts` | DOMContentLoaded, MutationObserver, beforeunload |
| `settings-manager.ts` | Settings persistence, per-site/global config |
| `settings-handler.ts` | Content-side settings cache and initialization |
| `audio-processor.ts` | Web Audio API graph construction and parameter updates |
| `media-processor.ts` | Media element discovery, speed/volume application |
| `media-manager.ts` | DOM scanning for media elements |
| `iframe-hostname-handler.ts` | Cross-frame hostname detection |

### Audio Processing Pipeline

```
HTMLMediaElement → MediaElementSourceNode → BassFilter (lowshelf, 100Hz)
                                                      ↓
                                           VoiceFilter (peaking, 2kHz)
                                                      ↓
                                           [ChannelSplitter + ChannelMerger] (if mono)
                                                      ↓
                                           GainNode (volume boost >100%)
                                                      ↓
                                           AudioContext.destination
```

**Important:** Graph topology only changes when `mono` setting changes or source URL changes. Parameter updates (volume, bass, voice) modify node values without disconnecting/reconnecting.

## Build Commands

```bash
pnpm compile    # TypeScript type check (no emit)
pnpm build      # Production build for Chrome MV3
pnpm build:firefox  # Production build for Firefox
pnpm test       # Run vitest suite
pnpm test:watch # Run vitest in watch mode
pnpm dev        # Development server with hot reload
```

## Version Policy

Single source of truth: `package.json`. `wxt.config.ts` reads version dynamically via `createRequire(import.meta.url)`.

When bumping version:
1. Update `package.json` version
2. Run `pnpm build` (manifest auto-syncs)
3. Commit both `package.json` and `wxt.config.ts`

## Key Patterns

### Settings Disabled Detection

```typescript
isSettingsDisabled(settings): boolean
```

Returns `true` when all sliders are at default (100) AND mono is false. Used to skip audio processing entirely.

### Event Listener Lifecycle

Always use stable handler references stored at module scope. Use `WeakSet<HTMLMediaElement>` to track which elements have listeners attached (prevents duplicate registration).

### Debounced Updates (Popup)

Settings changes are debounced (300ms). Both `settingsToSend` and `isGlobal` flag are passed as a payload object to `setTimeout` callback to avoid stale closures.

### Chrome API Mocking (Tests)

```typescript
(globalThis as any).chrome = {
  storage: { sync: { get: async () => {}, set: async () => {} } },
  tabs: { query: async () => [], sendMessage: async () => {} },
  runtime: { lastError: null },
};
```

### Debug Logging

All debug `console.log` statements use `debugLog()` from `types.ts`. This is a no-op in production unless `localStorage.debugVvp = 'true'` is set.

```typescript
import { debugLog } from "./types";
debugLog("Message:", data); // Only logs when debugVvp is enabled
```

Keep `console.error` and `console.warn` for actual issues — these always print.

## Testing

- Framework: vitest + jsdom
- Coverage: `@vitest/coverage-v8`
- Run: `pnpm test`
- No tests existed before — add tests for any new utility functions

## Known Gotchas

1. **AudioContext requires user gesture** — Cannot resume without user interaction. The `play` event listener handles deferred activation.
2. **`src` vs `currentSrc`** — Always use `currentSrc` for blob/HLS URLs.
3. **WeakMap/WeakSet** — Cannot iterate. Used for element→handler and element→settings mappings.
4. **Broadcast before persist** — Was a bug. Always persist to storage before broadcasting to other contexts.
5. **Vite peer dependency** — `@wxt-dev/module-react` must stay at 1.1.1 (1.2.2 requires Vite 8 which breaks WXT 0.19.x).
