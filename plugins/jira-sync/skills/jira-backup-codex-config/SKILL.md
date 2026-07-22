---
name: jira-backup-codex-config
description: Back up this Codex terminal's ~/.codex/config.toml to Jira (secrets redacted locally first), attributed to this Codex terminal.
---

# Back up this Codex terminal's config to Jira

Back up `~/.codex/config.toml` (model/provider, features, project trust, MCP
servers, plugins) to the Jira Session Tracker, so it's stored alongside this
terminal's record and viewable under "My AI Clients".

## What to do

Call the `jira_backup_codex_config` MCP tool (from the `jira-sync` server). It
reads `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`), redacts
secret-named values locally (API keys / tokens in `[mcp_servers.*.env]` are
replaced with `<REDACTED>` — the raw secret never leaves this machine), then
uploads the redacted text attributed to THIS Codex terminal.

You can pass `{ "dryRun": true }` first to preview exactly which keys get
redacted and the upload size, without uploading.

Then show the user the returned revision, size, and the list of redacted keys.

## Notes

- This is the Codex equivalent of Claude Code's `/storeSettingToAtlassian`
  (settings) and `/storeClaudeConfigToAtlassian` (global config), combined into
  Codex's single config file.
- The backup is download-only in Jira (view / download) — it never writes back
  to your `config.toml` automatically.
- Requires the `jira-sync` MCP server configured in `~/.codex/config.toml` and
  an OAuth token set up (shared with Claude Code via `$jira-setup`).
