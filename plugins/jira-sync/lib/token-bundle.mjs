/**
 * token-bundle.mjs — single-string packaging of the 5 setup values so the user
 * can move URL + access + refresh + expiry + site URL from the Jira UI to the
 * keychain in ONE clipboard copy (see the "Copy setup bundle" button on the
 * token card), never typing a token and never routing it through the Claude
 * transcript.
 *
 * Format:  `ai-co-work-jira-sync1.` + JSON {u,a,r,e}   (PLAINTEXT — not encoded)
 *
 * Plaintext on purpose: the access/refresh tokens are visible (`at_…` / `rt_…`)
 * so a glance makes obvious this is a credential. Opaque base64 looked "safe to
 * share" and users pasted it into chat — base64 is encoding, not encryption, so
 * that leaked the tokens. No encoding also means the frontend (JSON.stringify)
 * and node (JSON.parse) share one trivial format.
 *
 * `store-token.mjs --from-clipboard` consumes this; it never echoes the bundle,
 * so the token bytes stay out of any transcript that captures the command's
 * stdout.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export const BUNDLE_PREFIX = 'ai-co-work-jira-sync1.';

/** Hard ceiling on any single clipboard CLI call so a misbehaving pbcopy/pbcopy
 *  in a sandboxed shell can't hang store-token (the scrub is best-effort). */
const CLIP_TIMEOUT_MS = 3000;

/**
 * Build a bundle string from the 5 setup values (node side; the frontend
 * replicates this with JSON.stringify — keep the two in sync). `s` (site URL)
 * is omitted from the JSON when unset, so callers that don't supply it produce
 * the legacy 4-field bundle.
 * @param {{webtriggerUrl:string, accessToken:string, refreshToken:string, accessExp:number, siteUrl?:string}} v
 * @returns {string}
 */
export function buildBundle({ webtriggerUrl, accessToken, refreshToken, accessExp, siteUrl }) {
  return BUNDLE_PREFIX + JSON.stringify({
    u: webtriggerUrl,
    a: accessToken,
    r: refreshToken,
    e: accessExp,
    s: siteUrl,
  });
}

/**
 * Parse a bundle string. Returns null for anything that isn't a well-formed
 * bundle carrying all 4 values (never throws — callers fall back to interactive
 * input). Tolerates a trailing newline (clipboard managers often add one).
 * @param {string} raw
 * @returns {{webtriggerUrl:string, accessToken:string, refreshToken:string, accessExp:number, siteUrl?:string}|null}
 */
export function parseBundle(raw) {
  if (typeof raw !== 'string' || !raw.startsWith(BUNDLE_PREFIX)) return null;
  let o;
  try {
    o = JSON.parse(raw.slice(BUNDLE_PREFIX.length).trim());
  } catch {
    return null;
  }
  if (
    typeof o !== 'object' || o === null ||
    typeof o.u !== 'string' || !o.u ||
    typeof o.a !== 'string' || !o.a ||
    typeof o.r !== 'string' || !o.r ||
    typeof o.e !== 'number'
  ) {
    return null;
  }
  const out = { webtriggerUrl: o.u, accessToken: o.a, refreshToken: o.r, accessExp: o.e };
  // `s` (site URL) is optional — older bundles predate it. Only attach it when
  // present so deepEqual against a 4-field object still holds.
  if (typeof o.s === 'string' && o.s) out.siteUrl = o.s;
  return out;
}

// --- cross-platform clipboard (mac pbpaste/pbcopy, linux xclip/xsel) ---
// Each call is timeout-bounded so a sandboxed shell can't hang the caller.

async function macClipboard(get, value) {
  if (get) {
    const { stdout } = await execFileP('pbpaste', [], { timeout: CLIP_TIMEOUT_MS });
    return stdout;
  }
  await execFileP('pbcopy', [], { input: value ?? '', timeout: CLIP_TIMEOUT_MS });
  return undefined;
}

async function linuxClipboard(tool, get, value) {
  if (get) {
    const { stdout } = await execFileP(tool, ['-selection', 'clipboard', '-o'], { timeout: CLIP_TIMEOUT_MS });
    return stdout;
  }
  await execFileP(tool, ['-selection', 'clipboard', '-i'], { input: value ?? '', timeout: CLIP_TIMEOUT_MS });
  return undefined;
}

/**
 * Read the system clipboard. Rejects (within CLIP_TIMEOUT_MS) on unsupported
 * platforms / missing tools.
 * @returns {Promise<string>}
 */
export async function getClipboard() {
  const plat = process.platform;
  if (plat === 'darwin') return macClipboard(true);
  if (plat === 'linux') {
    return linuxClipboard('xclip', true).catch(() => linuxClipboard('xsel', true));
  }
  throw new Error(`Clipboard read unsupported on ${plat}`);
}

/**
 * Overwrite the system clipboard with `value` (used to replace a consumed bundle
 * with a harmless confirmation so it doesn't linger in clipboard history).
 * Best-effort, timeout-bounded — never throws and never blocks the caller.
 */
export async function setClipboard(value) {
  try {
    const plat = process.platform;
    if (plat === 'darwin') await macClipboard(false, value);
    else if (plat === 'linux') {
      await linuxClipboard('xclip', false, value).catch(() => linuxClipboard('xsel', false, value));
    }
  } catch {
    /* best effort — the scrub is optional hygiene */
  }
}
