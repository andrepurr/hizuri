# hizuri plugin for Claude Code

The way of working of a self-learning agent, as a Claude Code plugin. Install it with the hizuri installer (`install.sh` at the repo root), which also sets up the memory database, the daemon and the personal folder.

From the marketplace instead (the plugin alone; the installer still sets up the rest):

```
/plugin install hizuri --marketplace andrepurr/hizuri
```

1. Rules: `rules/hizuri.md` is the map one `@` line in `~/.claude/CLAUDE.md` imports (plugins cannot carry rules); it pulls in `rules/core.md` and the user's own `~/.hizuri/personal/` files.
2. Skills: `searching-memory`, `refreshing-rules`, `weekly-retro`, `writing-skills`, `using-secrets`, `creating-a-persona`.
3. Agent: `skill-reviewer`, which re-checks every rule or skill the agent writes.
4. Hooks: `hooks/register.ts` (the Guardian side check and the guards: complaint, reviewer, vault), `hooks/core.ts` (the check and the notes the agent answers), `hooks/moments.ts` (trigger moments: memory first), `hooks/reply.ts` (the reply gate: the surest misses refuse the reply, rules picked by the `guardianBlocks` option) and `hooks/session-start.mjs` (memory sync, the weekly retro when due).
5. Commands on the agent's PATH: `hizuri-recall`, `hizuri-memory`, `hizuri-retro`, `hizuri-secret`.
6. MCP: `hizuri`, the hizuri daemon's own tools (`HIZURI_DAEMON_URL`, default `http://127.0.0.1:6767`).

Nothing in this folder is personal. The user's layer lives in `~/.hizuri/personal/`.
