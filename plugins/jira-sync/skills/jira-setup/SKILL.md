---
name: jira-setup
description: Set up (and rotate) the Jira session-sync OAuth token + web-trigger URL for this Codex terminal. Verifies the stored token first; if it's missing or dead, stores a fresh one from a Jira setup bundle via the clipboard. Tokens never enter the chat.
---

# Set up Jira session-sync for this Codex terminal

Setup **and rotation** for the Jira session-sync plugin. Auth is an **OAuth 2.1
app-scoped token pair** (access + refresh, auto-rotating). Jira CRUD
(create-issue / comment / JQL) is NOT part of this plugin — use the official
Atlassian plugin.

This shares the same OAuth token + `~/.jira-sync/` config as Claude Code (the
keychain slot is path-independent). If the user already configured it from
Claude Code, this skill usually just verifies and does nothing.

**The token pair is a SECRET. It must NEVER be pasted into this chat** — this
plugin syncs the raw Codex transcript into Jira (the Stop auto-push hook fires
once configured), so a pasted token would leak. Tokens move
clipboard → `store-token.mjs` → OS keychain; the only thing that reaches this
transcript is `✅ Saved`.

## Flow

The key rule: **verification decides whether we (re)store.** A stored token that
fails verification is dead (revoked in Jira, or refresh-expired) and MUST be
replaced — never just report the failure and stop.

1. **Verify the current state FIRST** by calling the `jira_test_connection` MCP
   tool (from the `jira-sync` server — it hits the web-trigger `whoami`):
   - **200 / "Authenticated"** → already configured and working. Tell the user
     it's ready, suggest turning on auto-push with `$jira-auto-push-session`, and
     **stop — do NOT store anything** (nothing to replace).
   - **401 / fail / "not configured"** → either no token yet, or the stored
     token is dead. This is initial setup OR a **rotation**: fall through to
     step 2 to store/replace it. (Do not stop at the error.)

2. **Store/replace the token from a fresh bundle** (run this for initial setup
   OR for rotation):
   - Tell the user — do NOT have them paste anything here — to open the
     **"My Agent Sessions"** page in Jira, click **Generate token**, then
     **📋 Copy setup bundle** (a FRESH one — if they revoked the old device,
     this new one is its replacement).
   - **You (Codex) then store the bundle YOURSELF via your shell tool — run it
     ELEVATED (request the user's approval for an elevated run).** The user only
     copies the bundle; do NOT ask them to run anything by hand. (This matches
     Claude Code's `/jira-setup`, which runs the very same script automatically.)
     **Why elevated:** Codex's default sandbox isolates the host pasteboard, so
     a sandboxed `store-token.mjs --from-clipboard` fails with
     `No clipboard available` even though the user DID copy the bundle —
     elevation restores `pbpaste` (macOS) / `xclip` (Linux) access. Resolve the
     installed plugin root (cached under a versioned dir, newest wins) and run:
     ```sh
     PLUGIN=$(find "${CODEX_HOME:-$HOME/.codex}/plugins/cache/agents-cowork-with-jira/jira-sync" \
       -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -n 1)
     node "$PLUGIN/lib/store-token.mjs" --from-clipboard
     ```
     The script reads the clipboard ITSELF and writes the keychain, printing
     only `✅ Saved` + the non-secret URL. **Never `pbpaste`/cat/echo the
     clipboard or tokens yourself** — only `✅ Saved` should reach this
     transcript.
   - **Only if elevation is unavailable** (and `--from-clipboard` still fails
     with `No clipboard available`) fall back to the user running
     `node "$PLUGIN/lib/store-token.mjs"` (interactive hidden prompts) in their
     OWN terminal — never have them paste tokens into this chat.
   - "No setup bundle on the clipboard" → the user hasn't clicked **Copy setup
     bundle** yet (or copied something else). Have them click it and re-run.

3. **Verify again** with `jira_test_connection`:
   - **200** → ✅ connected as `<email>` (device `<familyId>`); suggest
     `$jira-auto-push-session` to enable per-turn auto-sync.
   - **fail** → most often a stale clipboard bundle (have them copy a fresh one
     and redo step 2), or the Forge app needs `forge install --upgrade` (the
     `token-family` entity). Diagnose and retry; don't leave the user
     unconfigured.

## Notes

- Rotation is normal here: revoking a device in Jira then re-running
  `$jira-setup` should land on step 2 and replace the keychain token. If you
  ever find yourself reporting "token expired" without having offered to replace
  it, you skipped step 2 — go back and run it.
- If the clipboard path is unavailable, fall back to interactive input the user
  runs **in their terminal** (not here): `node "$PLUGIN/lib/store-token.mjs"`
  (hidden prompts).
- Never echo the access/refresh token. The bundle is app-scoped + per-device
  revocable from the Jira UI, but keep it out of transcripts regardless.
- This is the Codex equivalent of Claude Code's `/jira-setup`.
