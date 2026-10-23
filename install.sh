#!/usr/bin/env bash
# hizuri installer. Run it from a fresh clone; your coding agent can run it for you.
#
#   ./install.sh            everything: personal folder, memory, Claude Code wiring, daemon + voice
#   ./install.sh --check    only check what is missing
#   --no-daemon             skip building and starting the daemon (memory and the plugin only)
#   --no-claude             do not touch ~/.claude (load the plugin yourself: claude --plugin-dir <repo>/claude)
#   --relay <host:port>     the end-to-end encrypted relay your phone pairs through (TLS)
#
# It never uses sudo. What it cannot install itself it lists, one install command each, and stops;
# install those and run it again. Running it again is safe: every step checks before it acts.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN="$REPO/claude"
HIZURI_HOME="${HIZURI_HOME:-$HOME/.hizuri}"
PERSONAL="$HIZURI_HOME/personal"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DAEMON=1
CLAUDE=1
CHECK_ONLY=0
RELAY="${HIZURI_RELAY_ENDPOINT:-}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-daemon) DAEMON=0 ;;
    --no-claude) CLAUDE=0 ;;
    --check) CHECK_ONLY=1 ;;
    --relay) RELAY="${2:?--relay needs host:port}"; shift ;;
    -h | --help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
has() { command -v "$1" >/dev/null 2>&1; }

# ── 1. Prerequisites ───────────────────────────────────────────────────────────────────────────
step "1/6 Checking prerequisites"
missing=()
has git || missing+=("git: install it with your package manager (apt install git, brew install git)")
if has node; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$node_major" -lt 22 ]; then
    missing+=("Node.js 22 or newer (found $(node --version)): https://nodejs.org/en/download, or: curl -fsSL https://fnm.vercel.app/install | bash && fnm install 22")
  fi
else
  missing+=("Node.js 22 or newer: https://nodejs.org/en/download, or: curl -fsSL https://fnm.vercel.app/install | bash && fnm install 22")
fi
has claude || missing+=("Claude Code: curl -fsSL https://claude.ai/install.sh | bash")
has bzip2 || missing+=("bzip2 (unpacks the local speech models): apt install bzip2, or brew install bzip2")
if ! has docker && ! has podman; then
  missing+=("docker or podman (the memory database runs in one container): apt install podman uidmap, or https://docs.docker.com/engine/install/")
fi
if [ "${#missing[@]}" -gt 0 ]; then
  say "Missing — install these, then run ./install.sh again:"
  for m in "${missing[@]}"; do echo "  - $m"; done
  exit 2
fi
echo "git $(git --version | cut -d' ' -f3) · node $(node --version) · claude $(claude --version | cut -d' ' -f1) · $(has docker && echo docker || echo podman)"
optional=()
has xdotool || has wtype || optional+=("xdotool (X11) or wtype (Wayland): lets the agent type secrets from your vault into a window")
[ -x "$HIZURI_HOME/tools/node_modules/.bin/bw" ] || has bw || optional+=("Bitwarden CLI, for secrets: npm install --prefix $HIZURI_HOME/tools @bitwarden/cli")
if [ "${#optional[@]}" -gt 0 ]; then
  echo "Optional, for later:"
  for m in "${optional[@]}"; do echo "  - $m"; done
fi
[ "$CHECK_ONLY" = 1 ] && exit 0

# ── 2. The personal folder ─────────────────────────────────────────────────────────────────────
step "2/6 Your personal folder: $PERSONAL"
mkdir -p "$HIZURI_HOME"
chmod 700 "$HIZURI_HOME"
if [ -d "$PERSONAL" ]; then
  # Never overwrites: only template files a newer hizuri added and the folder lacks are copied.
  (cd "$REPO/templates/personal" && find . -type f | while read -r f; do
    [ -e "$PERSONAL/$f" ] || { mkdir -p "$PERSONAL/$(dirname "$f")" && cp "$f" "$PERSONAL/$f"; }
  done)
  echo "exists: your files left as they are, missing template files added"
else
  cp -R "$REPO/templates/personal" "$PERSONAL"
  git -C "$PERSONAL" init -q
  git -C "$PERSONAL" add -A
  git -C "$PERSONAL" -c user.name=hizuri -c user.email=hizuri@localhost commit -q -m "Personal folder from the hizuri template"
  echo "created from templates/personal, a private git repo of its own (no remote)"
fi

# ── 3. Memory ──────────────────────────────────────────────────────────────────────────────────
step "3/6 Memory: one Postgres in one container, on this machine only"
HIZURI_HOME="$HIZURI_HOME" "$PLUGIN/bin/hizuri-memory" up
HIZURI_HOME="$HIZURI_HOME" "$PLUGIN/bin/hizuri-memory" sync
HIZURI_HOME="$HIZURI_HOME" "$PLUGIN/bin/hizuri-memory" stats

# ── 4. Claude Code ─────────────────────────────────────────────────────────────────────────────
step "4/6 Claude Code: the plugin from this folder, one line in your rules"
if [ "$CLAUDE" = 1 ]; then
  mkdir -p "$CLAUDE_DIR" "$HIZURI_HOME/backups"
  settings="$CLAUDE_DIR/settings.json"
  [ -f "$settings" ] && cp "$settings" "$HIZURI_HOME/backups/claude-settings.$(date +%Y%m%d-%H%M%S).json"
  # CLAUDE_CODE_PLUGIN_DIRS makes every Claude Code session load the plugin straight from this
  # folder (a git pull updates it), and your personal folder's claude/ as a second plugin for your own skills.
  node - "$settings" "$PLUGIN" "$PERSONAL/claude" <<'NODE'
const fs = require("node:fs");
const [file, plugin, personal] = process.argv.slice(2);
const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
settings.env = settings.env ?? {};
const dirs = (settings.env.CLAUDE_CODE_PLUGIN_DIRS ?? "").split(":").filter(Boolean);
for (const dir of [plugin, personal]) if (!dirs.includes(dir)) dirs.push(dir);
settings.env.CLAUDE_CODE_PLUGIN_DIRS = dirs.join(":");
fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`${file}: CLAUDE_CODE_PLUGIN_DIRS lists the hizuri plugin and your personal folder`);
NODE
  rules="$CLAUDE_DIR/CLAUDE.md"
  line="@$PLUGIN/rules/hizuri.md"
  if [ -f "$rules" ] && grep -qxF "$line" "$rules"; then
    echo "$rules: already imports the hizuri map"
  else
    [ -f "$rules" ] && [ -s "$rules" ] && printf '\n' >>"$rules"
    printf '%s\n' "$line" >>"$rules"
    echo "$rules: one line added, $line"
  fi
else
  echo "skipped (--no-claude). Start Claude Code with: claude --plugin-dir $PLUGIN"
fi

# ── 5. The daemon and voice ────────────────────────────────────────────────────────────────────
step "5/6 The hizuri daemon (sessions, voice, the phone app)"
HIZURI_BIN="$HIZURI_HOME/bin/hizuri"
if [ "$DAEMON" = 1 ]; then
  cd "$REPO"
  if [ ! -d node_modules ]; then
    echo "installing packages (npm ci, a few minutes the first time)"
    # CI=true keeps lefthook (the repo's git hook runner) out of your own git hooks.
    CI=true npm ci --no-audit --no-fund --loglevel=error
  fi
  if [ ! -f packages/cli/dist/index.js ] || [ -n "$(find packages/server/src -newer packages/cli/dist/index.js -name '*.ts' -print -quit)" ]; then
    echo "building the daemon (npm run build:server)"
    npm run build:server --silent >/dev/null
    BUILT=1
  fi
  mkdir -p "$HIZURI_HOME/bin"
  cat >"$HIZURI_BIN" <<EOF
#!/usr/bin/env bash
# The hizuri CLI with its home in $HIZURI_HOME (written by $REPO/install.sh).
PASEO_HOME="$HIZURI_HOME" exec node "$REPO/packages/cli/bin/paseo" "\$@"
EOF
  chmod +x "$HIZURI_BIN"
  if [ -n "$RELAY" ]; then
    node - "$HIZURI_HOME/config.json" "$RELAY" <<'NODE'
const fs = require("node:fs");
const [file, endpoint] = process.argv.slice(2);
const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { version: 1 };
config.daemon = config.daemon ?? {};
config.daemon.relay = { ...(config.daemon.relay ?? {}), endpoint, useTls: true };
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(`${file}: relay endpoint ${endpoint}`);
NODE
    BUILT=1 # the daemon reads the relay endpoint at start
  fi
  # A fresh build replaces a daemon that is already running.
  [ "${BUILT:-0}" = 1 ] && { "$HIZURI_BIN" daemon stop >/dev/null 2>&1 || true; }
  "$HIZURI_BIN" daemon start
  "$HIZURI_BIN" daemon status
  echo "Voice runs on this machine: the speech models download on the daemon's first start into $HIZURI_HOME/models."
else
  echo "skipped (--no-daemon)"
fi

# ── 6. Your phone ──────────────────────────────────────────────────────────────────────────────
step "6/6 Done. Your phone, once:"
if [ "$DAEMON" = 1 ] && [ -n "$RELAY" ]; then
  cat <<EOF
  Pair it through the end-to-end encrypted relay (no ports, no VPN): run
      $HIZURI_BIN daemon pair --relay
  and scan the QR it prints with the phone app. The relay only passes encrypted bytes.
  Prefer your own network? Paseo's docs (github.com/getpaseo/paseo, public-docs/connectivity.md) have the WireGuard guide.
EOF
elif [ "$DAEMON" = 1 ]; then
  cat <<EOF
  Through the end-to-end encrypted relay (no ports, no VPN): run ./install.sh --relay <host:port>
  with your relay's address, then $HIZURI_BIN daemon pair --relay and scan the QR.
  The relay is packages/relay in this repo, a Cloudflare Worker you can deploy yourself.
  Or over your own network: Paseo's docs (github.com/getpaseo/paseo, public-docs/connectivity.md) have the WireGuard and Tailscale guides.
EOF
fi
cat <<EOF

  The plugin's commands are on your agent's PATH in Claude Code: hizuri-recall, hizuri-memory,
  hizuri-retro, hizuri-secret. Start a new Claude Code session to load it.
  Tell your agent who you are once; it keeps it in $PERSONAL/USER.md.
EOF
