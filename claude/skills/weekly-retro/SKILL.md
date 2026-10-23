---
name: weekly-retro
description: Runs the agent's weekly retrospective on its own, with no part for the user - reads the retro lines logged since the last retro, groups the broken rules, fixes the rules, skills or hooks behind the worst ones, has every change reviewed, and tells the user one line of what changed. Use when the session start says the weekly retro is due, or when the user asks for the retro or what the agent learned this week.
---

# Running the weekly retro

The user's own additions, if any, are in `$HIZURI_HOME/personal/skills/weekly-retro.md`: read them first; they win.

Run it at a quiet moment, start to end, with no questions to the user.

Copy this checklist and tick it off:

```
- [ ] 1 Gather  - [ ] 2 Group  - [ ] 3 Fix  - [ ] 4 Review  - [ ] 5 Close
```

## 1. Gather

1. `hizuri-retro pending`: every line since the last retro (what happened · rule · by agent, guard or Guardian).
2. Complaints that got no line: `hizuri-recall --speaker user --from <day of the last retro, from hizuri-retro due; none if never> wrong again told` (and the user's own words for “wrong” in their language). Add a line for each real one with `hizuri-retro add`.

## 2. Group

Group every line by its rule key. For each rule: how many times, by whom, one example with its phrase id.

## 3. Fix the top three rules by count

For each, one change, the smallest that will work:

1. A rule broken twice or more despite being written gets enforcement: a hook, a guard or a script, not more words.
2. Otherwise edit the rule's own line so it cannot be misread; delete what the new text replaces (rule small-rules).
3. Put it where the `writing-skills` skill says, and follow that skill for every file you touch.

## 4. Review

Every file changed in step 3 goes through the reviewer, as the `writing-skills` skill says.

## 5. Close

1. Append the result at the end of this week's log (`hizuri-retro week` shows it; the file is `$HIZURI_HOME/personal/retro/<YYYY>-W<ww>.md`): `## Retro <date>`, the top rules with counts, what changed where.
2. `hizuri-retro done`.
3. Commit the personal folder (it is its own git repo): `git -C $HIZURI_HOME/personal add -A && git -C $HIZURI_HOME/personal commit -m "Weekly retro: <rules fixed>"`.
4. Tell the user one line: what you fixed and where. Nothing else is asked of them.
