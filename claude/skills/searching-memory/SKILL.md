---
name: searching-memory
description: Searches everything the user and the agent ever said (every session, typed or spoken) and the user's own notes in the hizuri memory database, and keeps facts the user gave for good. Use before asking the user anything, whenever the user says "remember", "we talked about", "I told you", asks when something happened or what was decided, and when a fact about the user should be kept.
---

# Searching memory

The user's own additions, if any, are in `~/.hizuri/personal/skills/searching-memory.md`: read them first; they win.

`hizuri-recall` indexes what is new first (seconds), so the current session is in it too.

## Find what was said

```bash
hizuri-recall <words>                                  # best matches, the user's and the agent's
hizuri-recall --speaker user --from 2026-01-05 <words> # only the user, from a day on
hizuri-recall --context 3 -k 1 --exact "<their words>" # the exact phrase and what was around it
hizuri-recall --day 2026-01-05 --speaker user -k 50    # one day in order
hizuri-recall --all <words>                            # subagent sessions too
```

1. Run 3 to 5 wordings as parallel calls: the user's words, your words, the result's words (“open the settings”, “limit ran out”). Words match their forms by prefix.
2. Each hit starts with its id (rule phrase-ids); a note prints as `note n…`.
3. Answer with the receipt: the date, the time in the user's zone and the exact words. Never “I think”.

## Keep what the user told you

The user's own memory lives in the same database as notes:

```bash
hizuri-memory note add --kind fact --tags project,schedule --from m812 "Backups run every March"
hizuri-memory note add --kind task --due 2026-02-01 "Renew the TLS certificate"
hizuri-memory note ls [--kind task] [words]
hizuri-memory note done n14
```

Kinds in use: `fact`, `note`, `task`, `person`, `place`. Who the user is in general (name, language, time zone, how they like answers) goes into `~/.hizuri/personal/USER.md` instead.

## Memory health

`hizuri-memory stats` shows what is indexed. A new user's memory starts empty and fills from the first session, on this machine, with no paid service. A large history (years of transcripts) is indexed in steps: re-run `hizuri-memory sync` until it reports 0 new rows. Rented compute only under rule paid-tools.
