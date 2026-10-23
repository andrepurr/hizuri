---
name: using-secrets
description: Uses the user's own Bitwarden vault through hizuri-secret so the agent can log in, fill forms and call APIs without ever seeing, printing or storing a secret, and stores new secrets the user types. Use whenever a task needs a password, API key, one-time code, card number or other secret, when a login or payment form must be filled, or when the user wants to save a new secret.
---

# Using secrets

The user's own additions, if any, are in `~/.hizuri/personal/skills/using-secrets.md`: read them first; they win.

The vault and everything in it belong to the user. The agent only asks `hizuri-secret` to type or pipe a value; the value never passes through the agent's context.

## Never

1. Print, echo, cat, log or write a secret; pass it as a command-line argument; put it in a file, a commit, a screenshot or the chat; say it aloud.
2. Ask the user to tell you a secret in the chat. New secrets go through `hizuri-secret put`, typed by the user in their own terminal.

## Steps

1. `hizuri-secret status`. Locked or signed out → ask the user to run `hizuri-secret login` in their own terminal (they type the master password there, never to you). No CLI → it prints the one install command; run it.
2. Find the item: `hizuri-secret find <words>` (names and field names only).
3. Use it:
   - Into the focused field of a browser or app: `hizuri-secret type "<item>" password` (also `username`, `totp`).
   - Into a command's stdin: `hizuri-secret pipe "<item>" -- docker login --username me --password-stdin`.
   - As one environment variable for one command: `hizuri-secret env "<item>" OPENAI_API_KEY -- node script.mjs`.
4. Missing secret → ask the user once to run `hizuri-secret put "<name>" --username <user> --uri <site>` in their own terminal, then keep using the vault (rule ask-once).

## Paying

A payment card the user gives for the agent's spending is a card item in the vault; the limit the user set for it (not a secret) is written in `~/.hizuri/personal/USER.md`. Before any payment, check that it fits within that limit and say what it costs and why (rule paid-tools). Card fields type like any other: `hizuri-secret type "<card>" number`, `expMonth`, `expYear`, `code`.
