---
name: jira-auto-push-session
description: Toggle Codex auto-push on/off — automatically sync each Codex turn to Jira via the Stop hook (no manual push needed).
---

# Toggle Codex auto-push

Turn Codex's automatic session-sync to Jira on or off. When on, a `Stop` hook
pushes each turn (throttled, incremental) to the Jira Session Tracker right
after the agent replies — so you never need to run `$jira-push-session` by hand.

This skill and Claude Code's `/jira-auto-push-session` are **identical in
behavior**: both read/write the single shared field `JIRA_AUTO_PUSH` in
`~/.jira-sync/config.json`, so flipping it here also controls Claude Code, and
vice versa.

## What to do

The toggle is the `JIRA_AUTO_PUSH` field in the shared config file
`~/.jira-sync/config.json` (the same file `$jira-setup` writes the
web-trigger URL into).

- **`on`**: read that JSON file, set `"JIRA_AUTO_PUSH": "true"`, and write it
  back. **Merge** into the existing object — do not drop the other keys
  (`JIRA_WEBTRIGGER_URL`, `JIRA_SITE_URL`, cached `JIRA_CLIENT_ID_*`, etc.).
- **`off`**: set `"JIRA_AUTO_PUSH": "false"` (or remove the key), write it back.
- **`status`** (or no argument): read the file and report whether
  `JIRA_AUTO_PUSH` is `true`/`false`, whether `JIRA_WEBTRIGGER_URL` is set
  (the one prereq), and the throttle interval (`JIRA_AUTO_PUSH_INTERVAL`,
  default 120s). Do not modify anything.

Then confirm the new state to the user, and remind them:
- Auto-push only fires if the `Stop` hook is installed in `~/.codex/hooks.json`
  **and** trusted — after first installing/changing the hook, run `/hooks` in
  Codex to review and trust it (Codex silently skips untrusted hooks).
- The push only works after `$jira-setup` has stored an OAuth token +
  web-trigger URL.
- Flipping the toggle here also affects Claude Code (same file).

## Notes

- This is the Codex equivalent of Claude Code's `/jira-auto-push-session`.
- Codex has no `SessionEnd` event, so pushes happen on each turn's `Stop`,
  throttled by `JIRA_AUTO_PUSH_INTERVAL` (default 120s).
