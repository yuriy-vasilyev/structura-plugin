// This module previously exported `CHANNELS_ENABLED`, a rollout gate for the
// Channels surface sourced from the `STRUCTURA_CHANNELS_ENABLED` PHP constant.
// The flag was removed on 2026-04-21 now that Channels has fully shipped —
// plan + entitlement checks in `useChannelsVisibility` are authoritative on
// their own. This file is intentionally empty and safe to `git rm`.
export {};
