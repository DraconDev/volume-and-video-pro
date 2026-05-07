# Project State

## Current Focus
Removed site-specific mode selector UI and refactored audio settings management

## Context
The site mode selector UI was removed as part of a broader refactoring to simplify audio settings management. The changes align with recent work to streamline audio processing and remove redundant code paths.

## Completed
- [x] Removed SiteModeSelector.tsx component (site-specific mode selection UI)
- [x] Removed redundant private method in AudioProcessor (disconnectAudioNodes)
- [x] Removed site-specific settings resolution logic from SettingsManager

## In Progress
- [x] Ongoing refactoring of audio settings management

## Blockers
- None identified

## Next Steps
1. Complete audio settings refactoring
2. Verify audio processing behavior with site-specific settings disabled
