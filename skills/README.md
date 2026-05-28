# Skills

Each subdirectory here is one Anthropic Skill that gets uploaded to your
workspace via `npm run sync-skills`. The folder name becomes the skill's
`display_title`; `SKILL.md` is the entrypoint Claude reads.

## Layout

```
skills/
  bank-reconciliation-rules/
    SKILL.md                  ← required, short description + full instructions
    examples/                 ← optional reference files
      split-deposit.md
      timing-exception.md
  cpsi-data/
    SKILL.md
  ...
  .ids.json                   ← written by sync-skills.js, gitignored
```

## Syncing

```sh
export ANTHROPIC_API_KEY=sk-ant-...
npm run sync-skills              # create or update everything under skills/
npm run sync-skills -- --dry-run # just print what would happen
```

After the first sync, the resulting skill IDs land in `skills/.ids.json`.
That file is per-workspace (your key, your skills) and stays out of git.
On subsequent runs each skill gets a new *version* under the same ID.

## Referencing skills from the server

When the AI recon endpoints in `server/src/server.ts` create an agent, you
can attach uploaded skills by reading `skills/.ids.json` and passing each ID
as `{ type: 'custom', skill_id, version: 'latest' }` in the agent
configuration.

## Authoring tips

- Put the most important guidance in the first ~200 words of `SKILL.md` —
  that's what stays in context by default; the rest loads on demand.
- Reference files (markdown, examples) can live alongside `SKILL.md`. They
  upload together and Claude can pull them in when relevant.
- A skill should be one focused domain (cost report, CPSI quirks, recon
  rules) — not a kitchen sink. Smaller and focused is faster and cheaper.
