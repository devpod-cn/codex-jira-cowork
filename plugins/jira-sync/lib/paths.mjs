/**
 * paths.mjs — central jira-sync filesystem locations + one-time legacy migration.
 *
 * jira-sync used to live under ~/.claude/jira-sync/ (a Claude-Code directory) —
 * a leftover from when the plugin was Claude-only. It now serves Codex (and any
 * future agent) too, so its OWN config/state moved to the agent-neutral
 * ~/.jira-sync/. Claude-Code's own files (~/.claude/settings.json, ~/.claude.json,
 * ~/.claude/projects/) are NOT jira-sync's and stay where they are.
 *
 * On first use, migrateLegacyPathsIfNeeded() copies any existing legacy files
 * (config.json / tokens.json / machine-id) and state dirs (jira-sync-throttle /
 * jira-sync-link) from ~/.claude/jira-sync/ (+ ~/.claude/jira-sync-throttle(-link))
 * into ~/.jira-sync/ — idempotently (never overwrites) and best-effort (never
 * throws; worst case the user re-runs /jira-setup). The legacy dir is left in
 * place as a backup.
 *
 * The OS keychain OAuth token (keychain.mjs, keyed by service/account) is
 * path-independent and is NOT migrated — it keeps working as-is.
 *
 * All paths here are computed from homedir(); tests inject legacyDir/targetDir
 * into migrateLegacyPathsIfNeeded so they never touch the real home directory.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';

/** Agent-neutral root for all jira-sync-owned files (~/.jira-sync). */
export const JIRA_SYNC_DIR = join(homedir(), '.jira-sync');

/** Non-secret config: webtrigger URL, site URL, auto-push flag, cached clientIds. */
export const CONFIG_FILE = join(JIRA_SYNC_DIR, 'config.json');

/** OAuth token fallback file (primary store is the OS keychain, path-independent). */
export const TOKENS_FILE = join(JIRA_SYNC_DIR, 'tokens.json');

/** Stable machine fingerprint fallback (write-once; only its hash is ever sent). */
export const MACHINE_ID_FILE = join(JIRA_SYNC_DIR, 'machine-id');

/**
 * Root for per-session auto-push state. Throttle/link state land in
 * ~/.jira-sync/jira-sync-throttle(-link)/ via auto-push-logic.mjs's path helpers
 * (which append those subdir names to this base).
 */
export const STATE_BASE_DIR = JIRA_SYNC_DIR;

/** Pre-neutrality config location (~/.claude/jira-sync); migration source only. */
export const LEGACY_DIR = join(homedir(), '.claude', 'jira-sync');

/** Legacy state base (~/.claude) — throttle/link used to live directly under it. */
export const LEGACY_STATE_BASE = join(homedir(), '.claude');

const LEGACY_FILES = ['config.json', 'tokens.json', 'machine-id'];
const STATE_SUBDIRS = ['jira-sync-throttle', 'jira-sync-link'];

let migrated = false;

/**
 * Idempotently copy legacy jira-sync files/dirs into the neutral ~/.jira-sync/
 * on first use. Never overwrites existing targets, never throws. Safe to call
 * repeatedly (the in-process `migrated` flag short-circuits; `force` re-runs).
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force]           Re-run even if already migrated this process.
 * @param {string}  [opts.legacyDir]       Override legacy config dir (tests).
 * @param {string}  [opts.legacyStateBase] Override legacy state base (tests).
 * @param {string}  [opts.targetDir]       Override neutral target dir (tests).
 */
export function migrateLegacyPathsIfNeeded({
  force = false,
  legacyDir = LEGACY_DIR,
  legacyStateBase = LEGACY_STATE_BASE,
  targetDir = JIRA_SYNC_DIR,
} = {}) {
  if (migrated && !force) return;
  migrated = true;
  try {
    // 1) Files under the legacy config dir.
    if (existsSync(legacyDir)) {
      for (const name of LEGACY_FILES) {
        const from = join(legacyDir, name);
        const to = join(targetDir, name);
        if (existsSync(from) && !existsSync(to)) {
          try {
            mkdirSync(targetDir, { recursive: true });
            copyFileSync(from, to);
          } catch {
            /* best-effort */
          }
        }
      }
    }
    // 2) State subdirs (throttle/link) under the legacy state base.
    for (const sub of STATE_SUBDIRS) {
      const from = join(legacyStateBase, sub);
      const to = join(targetDir, sub);
      if (existsSync(from) && !existsSync(to)) {
        try {
          mkdirSync(targetDir, { recursive: true });
          // fs.cpSync (recursive) is Node 16.7+; absent → skip (state rebuilds).
          if (typeof cpSync === 'function') cpSync(from, to, { recursive: true });
        } catch {
          /* best-effort; throttle/link rebuild on next push */
        }
      }
    }
  } catch {
    /* never throw on migration */
  }
}
