---
name: creating-a-persona
description: Creates or changes the personality the user talks to - name, character, tone, languages, how it speaks aloud, its avatar - as an output style in the user's personal folder. Use when the user wants to give the assistant a name or a character, asks it to sound or behave differently ("be more playful", "call yourself…", "speak Spanish to me"), or picks an avatar.
---

# Creating a persona

The user's own additions, if any, are in `~/.hizuri/personal/skills/creating-a-persona.md`: read them first; they win.

The persona is the user's, never shipped: it lives in `~/.hizuri/personal/claude/output-styles/assistant.md`, an output style of the `personal` plugin.

1. Read the file. Fill only what the user said; ask once, in one message, for what a persona needs and they have not said (rule ask-once): a name, three words for the character, the language or languages, how long spoken replies should be.
2. Write the answers into the file's sections in the user's own words. Keep `keep-coding-instructions: true` (the coding rules stay) and `force-for-plugin: true` (no switch needed).
3. An avatar or a voice is chosen in the hizuri app; when the daemon's speak tool offers tags for them, the file says which to use.
4. Follow the `writing-skills` skill (the file is a rule file) and its review.
5. It applies by itself (`force-for-plugin: true`) from the next session on; tell the user that in one line.
