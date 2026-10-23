# brain-relay

The free brain's server. A new hizuri user talks to a cheap model on our key before they connect
Claude Code; this service holds that key, so it never reaches the app or the user's daemon.

- `POST /v1/install` gives an anonymous install token (`hzf_…`). The daemon asks once and keeps it.
- `POST /v1/chat/completions` takes an OpenAI-style chat (streaming, tools) with that token, checks
  the caps, and forwards it upstream with our key, our model and thinking at its minimum.
- `GET /v1/usage` tells an install how much it used today and in total.
- `GET /health` answers `{ "ok": true }`.
- `POST|GET /v1/admin/installs`, `DELETE /v1/admin/installs/<id>` (only with
  `FREE_BRAIN_ADMIN_TOKEN`, only from the relay's own machine): an operator issues an install with its own label and caps, lists them
  (counts and dollars, never tokens) and revokes one. Hosted demos use this, one install per
  environment, with `FREE_BRAIN_IP_DAILY_INSTALLS=0` so an environment cannot take a second one.

A cap answers HTTP 429 with `error.code` and a message the daemon shows and speaks
("… connect Claude Code …"). Logs and the state file hold hashed ids and counts only: no message
text, no keys, no tokens, no raw IP addresses.

## Run

```bash
npm run build --prefix packages/brain-relay
node --env-file=/etc/hizuri/brain-relay.env packages/brain-relay/dist/main.js
```

Put it behind an https reverse proxy and set `FREE_BRAIN_TRUST_PROXY=1` so the per-address cap
sees the client, not the proxy.

## Knobs (env)

1. `FREE_BRAIN_UPSTREAM_KEY` (required): the Gemini API key (production) or an OpenRouter key (tests).
2. `FREE_BRAIN_UPSTREAM`: `gemini` (default, Google's OpenAI-compatible endpoint) or `openrouter`.
3. `FREE_BRAIN_MODEL`: default `gemini-3.1-flash-lite` (`google/gemini-3.1-flash-lite` on OpenRouter);
   `gemini-3.6-flash` for the stronger one.
4. `FREE_BRAIN_REASONING_EFFORT`: default `minimal`. Gemini 3 models cannot switch thinking off.
5. `FREE_BRAIN_INSTALL_DAILY_REQUESTS` (60), `FREE_BRAIN_INSTALL_TOTAL_REQUESTS` (300),
   `FREE_BRAIN_IP_DAILY_REQUESTS` (200), `FREE_BRAIN_IP_DAILY_INSTALLS` (5),
   `FREE_BRAIN_GLOBAL_DAILY_REQUESTS` (20000). A request is one upstream call; a reply with a tool
   call takes two or three. Days are UTC.
6. `FREE_BRAIN_INSTALL_TOTAL_USD` (0 = off): dollars one install may ever spend; a managed install
   can carry its own. The cap is hard: a call goes only if what was spent plus the worst case of
   every call still on its way (each request byte as a token plus the full output cap) fits.
   `FREE_BRAIN_PRICE_INPUT_PER_M` (0.25) and `FREE_BRAIN_PRICE_OUTPUT_PER_M` (1.5) price the tokens
   when the upstream reports no cost (Gemini does not).
7. `FREE_BRAIN_MAX_OUTPUT_TOKENS` (1024), `FREE_BRAIN_MAX_BODY_BYTES` (262144).
8. `FREE_BRAIN_HOST` (127.0.0.1), `FREE_BRAIN_PORT` (8790), `FREE_BRAIN_STATE_FILE` (counts survive
   a restart), `FREE_BRAIN_TRUST_PROXY`, `FREE_BRAIN_IP_SALT`, `FREE_BRAIN_UPSTREAM_URL`,
   `FREE_BRAIN_ADMIN_TOKEN`.
