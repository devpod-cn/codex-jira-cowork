#!/usr/bin/env node
/**
 * store-token.mjs — store the OAuth token pair + web trigger URL.
 *
 * Two modes:
 *   node store-token.mjs --from-clipboard   ← preferred. Reads a setup bundle
 *     (URL + access + refresh + expiry) the user copied from the Jira token
 *     card, stores it, then overwrites the clipboard with a harmless string.
 *     Nothing secret is printed, so this is safe to run from /jira-setup via
 *     Claude — the token bytes go clipboard → here → keychain, never stdout.
 *
 *   node store-token.mjs                    ← interactive fallback. Prompts
 *     (hidden) for each value. Use this in a terminal when there's no bundle.
 *
 * Run in your terminal (or via /jira-setup's --from-clipboard) so the token
 * never enters the Claude transcript.
 */
import readline from 'node:readline';
import { saveConfigFile, loadConfigFile } from './secrets.mjs';
import { saveTokens } from './keychain.mjs';
import { parseBundle, getClipboard, setClipboard } from './token-bundle.mjs';

/**
 * Persist a full setup: webtriggerUrl + siteUrl (+ accessExp) → config.json
 * (non-secret); access/refresh → OS keychain. Returns a sanitized summary
 * (no secrets).
 */
async function storeAll({ webtriggerUrl, siteUrl, accessToken, refreshToken, accessExp }) {
  const existing = loadConfigFile();
  saveConfigFile({
    ...existing,
    ...(webtriggerUrl ? { JIRA_WEBTRIGGER_URL: webtriggerUrl } : {}),
    ...(siteUrl ? { JIRA_SITE_URL: siteUrl } : {}),
    ...(accessExp ? { JIRA_ACCESS_EXP: String(accessExp) } : {}),
  });
  await saveTokens({ accessToken, refreshToken, accessExp });
  return {
    webtriggerUrl: webtriggerUrl || existing.JIRA_WEBTRIGGER_URL || '(unchanged)',
    siteUrl: siteUrl || existing.JIRA_SITE_URL || '(unchanged)',
  };
}

/** Read a secret with hidden echo. */
function ask(rl, q) {
  return new Promise((resolve) => {
    const original = rl._writeToOutput;
    rl._writeToOutput = () => {}; // suppress echo
    rl.question(q, (ans) => {
      rl._writeToOutput = original;
      process.stdout.write('\n');
      resolve(ans.trim());
    });
  });
}

async function interactive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  console.log('Claude Code ↔ Forge Session Tracker setup (interactive)');
  const webtriggerUrl = await ask(rl, 'Web Trigger URL: ');
  const siteUrl = await ask(rl, 'Jira site URL (e.g. https://x.atlassian.net): ');
  const accessToken = await ask(rl, 'Access token: ');
  const refreshToken = await ask(rl, 'Refresh token: ');
  const accessExp = Number((await ask(rl, 'Access expiry (epoch ms): ')).trim()) || 0;
  rl.close();
  return storeAll({ webtriggerUrl, siteUrl, accessToken, refreshToken, accessExp });
}

async function fromClipboard() {
  let clip;
  try {
    clip = await getClipboard();
  } catch {
    throw new Error('No clipboard available — run without --from-clipboard for interactive input.');
  }
  const bundle = parseBundle(clip);
  if (!bundle) {
    throw new Error(
      'No setup bundle on the clipboard. On the Jira "My Agent Sessions" page, click "Copy setup bundle" on the token card, then re-run.'
    );
  }
  // Store only — the clipboard scrub happens in main() AFTER we report success,
  // so a slow/blocked pbcopy can never hide the ✅ from the user.
  return storeAll(bundle);
}

async function main() {
  const fromClip = process.argv.includes('--from-clipboard');
  const summary = fromClip ? await fromClipboard() : await interactive();
  // Report success FIRST — the clipboard scrub below is optional hygiene and must
  // never block the user from seeing that storage succeeded.
  console.log(`✅ Saved. Web Trigger URL → ~/.jira-sync/config.json; token pair → OS keychain.`);
  console.log(`   URL: ${summary.webtriggerUrl}`);
  console.log(`   Site: ${summary.siteUrl}`);
  console.log('Back in Claude Code, finish /jira-setup (or say "done") to verify the connection.');
  if (fromClip) {
    // Overwrite the consumed bundle so it doesn't linger in clipboard history.
    // Timeout-bounded in token-bundle.mjs, so this can't hang.
    await setClipboard('ai-co-work token stored ✓');
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
