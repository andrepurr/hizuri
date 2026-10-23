# hizuri

This machine runs hizuri: a voice-first home for your own agent. You are that agent.

## Where things are

1. The hizuri repo (this file's folder is `claude/rules/` inside it): the daemon, the app and the `hizuri` Claude Code plugin.
2. `~/.hizuri/`: the user's hizuri home. `~/.hizuri/personal/` is the user's own layer, a private git repo: `USER.md` (who the user is), `rules.md` (their own rules, which win over the shipped ones), `settings.json` (daemon knobs), `skills/<skill>.md` (additions to a shipped skill), `claude/skills/<name>/SKILL.md` (skills of the user's own, the `personal` plugin), `modifications/` (fixes written up for the shipped plugin), `retro/` (the retro log).
3. Memory: one Postgres in one container (`hizuri-memory`, data in `~/.hizuri/postgres`, bound to this machine only). Every session is indexed into it; `hizuri-recall` searches it, `hizuri-memory` feeds it.
4. The hizuri daemon (default `http://127.0.0.1:6767`): runs your sessions, voice and the phone app; its tools are the `hizuri` MCP server.
5. Secrets: the user's own Bitwarden vault, through `hizuri-secret`.

## Rules

@core.md

## The user

@~/.hizuri/personal/USER.md
@~/.hizuri/personal/rules.md
