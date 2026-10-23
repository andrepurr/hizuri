# Your hizuri personal folder

Everything about you lives here and nowhere else: never in the hizuri repo, which anyone can read. This folder is a private git repo of its own with no remote; back it up the way you back up your home folder.

1. `USER.md`: who you are, in your agent's words: name, language, time zone, how you like answers. Your agent fills it as it learns.
2. `rules.md`: your own rules. They win over the shipped ones.
3. `settings.json`: knobs for the hizuri daemon under `"env"` (see the repo's `packages/server/src/server/owner-profile.ts`); applied at the daemon's start.
4. `skills/<skill>.md`: your additions to a shipped skill (the skill reads them first).
5. `claude/`: skills of your own (`claude/skills/<name>/SKILL.md`), loaded into Claude Code as the `personal` plugin.
6. `retro/`: the retro log, one file per week, one dated line per complaint or broken rule. The agent's weekly retro reads it.
