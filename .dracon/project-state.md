# Project State

## Current Focus
Updated Firefox-specific extension configuration to comply with new data collection requirements.

## Context
Firefox's upcoming November 2025 requirements for declaring data collection practices necessitate updating the extension's manifest configuration. The new `data_collection_permissions` field requires Firefox 140+ for desktop and 142+ for Android.

## Completed
- [x] Added `1.png` to public assets and updated type definitions
- [x] Updated Firefox minimum version to 140.0 for desktop
- [x] Added Firefox for Android configuration with minimum version 142.0
- [x] Updated data collection permissions to explicitly declare no data collection

## In Progress
- [ ] No active work in progress

## Blockers
- WXT type definitions need to be updated to include `data_collection_permissions`

## Next Steps
1. Update WXT types to include `data_collection_permissions`
2. Verify extension works with Firefox 140+ and 142+
