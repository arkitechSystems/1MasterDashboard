#!/usr/bin/env node
/**
 * Sync local skills/ subdirectories to the Anthropic Skills API.
 *
 *   skills/
 *     bank-reconciliation-rules/
 *       SKILL.md              ← required entrypoint
 *       <any other files>     ← optional reference material
 *     cpsi-data/
 *       SKILL.md
 *     ...
 *
 * Each subdir becomes one skill in your Anthropic workspace. Skill IDs are
 * persisted to skills/.ids.json so subsequent runs add a new *version* to the
 * existing skill rather than creating duplicates. The IDs file is also what
 * the server reads at startup to know which `skill_id` to attach to agent
 * configurations.
 *
 * Usage:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   node scripts/sync-skills.js              # sync everything
 *   node scripts/sync-skills.js --dry-run    # show what would happen
 *
 * NOTE on the Skills API: this script targets the public beta
 * `skills-2025-10-02`. If Anthropic changes the request shape for
 * `POST /v1/skills` or `POST /v1/skills/{id}/versions`, the two `await api…`
 * calls in createSkill() / createVersion() may need adjusting. The Anthropic
 * CLI (`ant beta:skills ...`) is the canonical reference if you want to
 * sanity-check the shape against a known-good client.
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.anthropic.com';
const BETA_HEADER = 'skills-2025-10-02';
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');
const IDS_FILE = path.join(SKILLS_DIR, '.ids.json');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !DRY_RUN) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    console.error('Get a key from https://console.anthropic.com → Settings → API Keys, then');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  if (!fs.existsSync(SKILLS_DIR)) {
    console.log(`No skills/ directory at ${SKILLS_DIR}. Nothing to sync.`);
    return;
  }

  let ids = {};
  if (fs.existsSync(IDS_FILE)) {
    try {
      ids = JSON.parse(fs.readFileSync(IDS_FILE, 'utf-8'));
    } catch (e) {
      console.warn(`Couldn't parse ${IDS_FILE}, starting fresh.`);
    }
  }

  const entries = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'));

  if (entries.length === 0) {
    console.log('No skill folders found under skills/. Create one with a SKILL.md.');
    return;
  }

  console.log(`Found ${entries.length} skill folder${entries.length === 1 ? '' : 's'}.\n`);

  for (const entry of entries) {
    const skillPath = path.join(SKILLS_DIR, entry.name);
    const skillMd = path.join(skillPath, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      console.log(`- ${entry.name}  (skipped — no SKILL.md)`);
      continue;
    }

    const files = readDirRecursive(skillPath, skillPath);

    if (DRY_RUN) {
      console.log(`~ ${entry.name}  (dry-run, ${files.length} files)`);
      for (const f of files) console.log(`    ${f.relativePath}  (${f.content.length} bytes)`);
      continue;
    }

    try {
      let skillId = ids[entry.name]?.id;
      let isNew = false;
      if (!skillId) {
        const created = await createSkill(apiKey, entry.name);
        skillId = created.id || created.skill_id;
        if (!skillId) throw new Error('Server did not return a skill id');
        isNew = true;
      }

      const versionInfo = await createVersion(apiKey, skillId, files);
      const versionStr = versionInfo.version || versionInfo.id || '?';
      ids[entry.name] = {
        id: skillId,
        version: versionStr,
        updatedAt: new Date().toISOString(),
      };

      console.log(`${isNew ? '+' : '~'} ${entry.name}  →  ${skillId} (v${versionStr})`);
    } catch (err) {
      console.error(`✗ ${entry.name} failed: ${err.message}`);
    }
  }

  if (!DRY_RUN) {
    fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
    console.log(`\nWrote ${path.relative(process.cwd(), IDS_FILE)}.`);
    console.log('Reference these IDs in your agent configs:');
    for (const [name, info] of Object.entries(ids)) {
      console.log(`  ${name}:  ${info.id}`);
    }
  }
}

async function createSkill(apiKey, displayTitle) {
  return apiCall(apiKey, 'POST', '/v1/skills', { display_title: displayTitle });
}

async function createVersion(apiKey, skillId, files) {
  const form = new FormData();
  for (const f of files) {
    // Use Blob so fetch sets the right Content-Type and binary safely.
    form.append('files', new Blob([f.content]), f.relativePath);
  }
  return apiCallForm(apiKey, 'POST', `/v1/skills/${skillId}/versions`, form);
}

async function apiCall(apiKey, method, pathname, body) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': BETA_HEADER,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

async function apiCallForm(apiKey, method, pathname, form) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': BETA_HEADER,
      // Do NOT set Content-Type here — fetch fills in the multipart boundary.
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

function readDirRecursive(dir, base) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...readDirRecursive(full, base));
    } else if (!entry.name.startsWith('.')) {
      out.push({
        relativePath: path.relative(base, full).replace(/\\/g, '/'),
        content: fs.readFileSync(full),
      });
    }
  }
  return out;
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
