---
name: refreshing-rules
description: Finds which rules the last reply broke and redoes it, without asking the user what was wrong. Use when the user complains about the last reply ("wrong", "again", "I told you", "not what I asked"), when a hizuri complaint notice or a Guardian note points at the last reply, or when the user types /hizuri:refreshing-rules.
---

# Refreshing rules

The user's own additions, if any, are in `~/.hizuri/personal/skills/refreshing-rules.md`: read them first; they win.

A complaint means the last reply broke at least one rule. Finding which is the job; the user gives no explanation on purpose.

1. Re-read, with the Read tool and never from memory: `${CLAUDE_PLUGIN_ROOT}/rules/core.md`, `~/.hizuri/personal/rules.md`, `~/.hizuri/personal/USER.md` and `~/.claude/CLAUDE.md`.
2. Check the last reply against every rule, one by one. There may be more than one break: never stop at the first.
3. Name each break in one short line: rule → what was wrong.
4. One retro line per break: `hizuri-retro add "<what happened> · rule: <key>"`.
5. Redo the last reply correctly.

If the complaint comes again, the fix still breaks a rule: look for a different break, in the fix too, and redo again.

Never ask the user what was wrong, and never apologise at length or explain why it happened.
