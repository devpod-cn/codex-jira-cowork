/**
 * keychain.mjs — OS keychain storage for the OAuth access/refresh token pair.
 *
 * macOS: Keychain via the built-in `security` CLI. Linux: libsecret via
 * `secret-tool` (needs a running keyring daemon). Anything else — Windows, or a
 * keychain miss/error — falls back to a chmod-0600 JSON file. The pair lives
 * under a DEDICATED service name (ai-co-work.jira-sync) so it never touches
 * Claude Code's own keychain entry and never sits in ~/.jira-sync/config.json
 * alongside the non-secret values.
 *
 * Zero npm deps — shells out to the OS CLI only. `opts.file` / `opts.platform`
 * are injectable so tests exercise the file fallback without the real keychain.
 *
 * Why a "borrowed-but-own" entry: Claude Code stores its OAuth tokens in the OS
 * keychain too, but under its own single shared slot — reusing it is fragile
 * (static-only, shared with OAuth, env-stripped). Our rotating tokens need their
 * own entry we can read/write freely.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, chmodSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { TOKENS_FILE } from './paths.mjs';

const execFileP = promisify(execFile);

export const SERVICE = 'ai-co-work.jira-sync';
export const ACCOUNT = 'tokens';
const DEFAULT_FILE = TOKENS_FILE;

// --- macOS Keychain (built-in `security` CLI) ---
async function macGet() {
  const { stdout } = await execFileP('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w']);
  return stdout.trim();
}
async function macSet(json) {
  // -U updates if the item already exists (rotation overwrites in place).
  await execFileP('security', ['add-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w', json, '-U']);
}
async function macDelete() {
  await execFileP('security', ['delete-generic-password', '-s', SERVICE, '-a', ACCOUNT]);
}

// --- Linux libsecret (`secret-tool`) ---
async function linuxGet() {
  const { stdout } = await execFileP('secret-tool', ['lookup', 'service', SERVICE, 'account', ACCOUNT]);
  return stdout;
}
async function linuxSet(json) {
  // Reads the secret from stdin.
  await execFileP('secret-tool', ['store', '--label=ai-co-work.jira-sync', 'service', SERVICE, 'account', ACCOUNT], { input: json });
}
async function linuxDelete() {
  await execFileP('secret-tool', ['clear', 'service', SERVICE, 'account', ACCOUNT]);
}

// --- chmod-0600 file fallback ---
function fileRead(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}
function fileWrite(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
  try { chmodSync(file, 0o600); } catch { /* non-posix */ }
}
function fileDelete(file) {
  try { unlinkSync(file); } catch { /* ignore */ }
}

/**
 * Load the token pair, or null if none stored. Tries the OS keychain for the
 * current platform, falling back to the 0600 file on any miss/error.
 * @param {{file?: string, platform?: string}} [opts]
 * @returns {Promise<{accessToken:string,refreshToken:string,accessExp:number}|null>}
 */
export async function loadTokens(opts = {}) {
  const file = opts.file || DEFAULT_FILE;
  const plat = opts.platform || process.platform;
  try {
    if (plat === 'darwin') {
      const raw = await macGet();
      return raw ? JSON.parse(raw) : null;
    }
    if (plat === 'linux') {
      const raw = await linuxGet();
      return raw ? JSON.parse(raw) : null;
    }
  } catch {
    // not stored yet, or CLI/daemon absent → fall through to the file
  }
  return fileRead(file);
}

/**
 * Persist the token pair to the OS keychain (or the 0600 file fallback).
 * @param {{accessToken:string,refreshToken:string,accessExp:number}} tokens
 * @param {{file?: string, platform?: string}} [opts]
 */
export async function saveTokens(tokens, opts = {}) {
  const file = opts.file || DEFAULT_FILE;
  const plat = opts.platform || process.platform;
  const json = JSON.stringify(tokens);
  try {
    if (plat === 'darwin') { await macSet(json); return; }
    if (plat === 'linux') { await linuxSet(json); return; }
  } catch {
    // fall through to the file
  }
  fileWrite(file, tokens);
}

/** Remove the token pair from the OS keychain AND the fallback file. */
export async function deleteTokens(opts = {}) {
  const file = opts.file || DEFAULT_FILE;
  const plat = opts.platform || process.platform;
  try {
    if (plat === 'darwin') await macDelete();
    else if (plat === 'linux') await linuxDelete();
  } catch { /* best effort */ }
  fileDelete(file);
}
