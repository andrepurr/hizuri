---
name: writing-skills
description: Writes and edits the agent's own skills, rules and agent files so they stay correct and small - where each change goes, Anthropic's skill authoring guidance, the size rule, and a review by a second agent. Use whenever the agent creates or changes a SKILL.md, a rules file, an agent file or an output style, when the user says "write a skill", "add a rule", "from now on always…", and for fixes from the weekly retro.
---

# Writing skills and rules

The user's own additions, if any, are in `~/.hizuri/personal/skills/writing-skills.md`: read them first; they win.

## Where a change goes

1. About this user (their preferences, their tools, their words): `~/.hizuri/personal/` only — `rules.md`, `USER.md`, `skills/<skill>.md` (additions a shipped skill reads), or a new skill in `~/.hizuri/personal/claude/skills/<name>/SKILL.md` (loaded as the `personal` plugin).
2. Shipped plugin files (`claude/` in the hizuri repo) are never edited for one user. A general fix becomes a modification write-up in `~/.hizuri/personal/modifications/<date>-<rule>.md`: what broke, the exact change to the shipped file, proof it works. hizuri publishes modifications; nobody edits the plugin in place.

## Anthropic's skill guidance (checked by the reviewer)

1. Frontmatter: `name` is lowercase letters, digits and hyphens, at most 64 characters, no "anthropic" or "claude"; a gerund reads best (`searching-memory`). `description` is third person, at most 1024 characters, says what the skill does and when to use it, with the words a user would actually say.
2. The body assumes a capable reader: only what the agent would not know. Concrete commands and examples over explanations.
3. SKILL.md under 500 lines; longer detail goes into files the SKILL.md links directly (one level deep).
4. One term per thing throughout; no dates that will go stale; forward slashes in paths.
5. Fragile steps get exact commands (low freedom); judgement calls get short guidance (high freedom).

## Our size rule

Rule small-rules, plus: rules files stay under 200 lines, and a file that keeps growing gets pruned in the same step.

## Review

After the edit, launch the reviewer and apply its findings:

```
Agent tool · subagent_type: "hizuri:skill-reviewer" · prompt: "Review <full paths of the changed files>. What changed and why: <one line>."
```

Fix every “broken” or “bloated” finding, then re-run the reviewer once.
