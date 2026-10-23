#!/usr/bin/env bash
# Move a staged over-the-air update into the live folder, so every app gets it
# Stage it first with `ZURI_STAGING=1 scripts/zuri-publish-update.sh`
# and try it on the Android emulator.
#
#   PASEO_HOME=/path/to/hizuri/.dev/paseo-home \
#   scripts/zuri-promote-update.sh <runtimeVersion> <unix-seconds>
#
# The move is one rename(2) inside the runtime-version folder, so the daemon sees the update
# either staged or live, never half-copied. The manifest id does not change: the emulator that
# ran the staged update hears "no update", and the phone gets exactly the bytes that were tried.
set -euo pipefail

: "${PASEO_HOME:?Set PASEO_HOME to the hizuri daemon home}"
if [[ "$(realpath -m "$PASEO_HOME")" == "$(realpath -m "$HOME/.paseo")" ]]; then
  echo "Refusing to touch ~/.paseo: that is the live Paseo daemon, not hizuri." >&2
  exit 1
fi
UPDATES_ROOT="$PASEO_HOME/zuri-updates"

if [[ $# -ne 2 ]]; then
  echo "Usage: PASEO_HOME=... $0 <runtimeVersion> <unix-seconds>" >&2
  echo "Staged updates in $UPDATES_ROOT:" >&2
  shopt -s nullglob
  for dir in "$UPDATES_ROOT"/*/staging/*/; do
    dir="${dir%/}"
    runtime_dir="${dir%/staging/*}"
    echo "  ${runtime_dir##*/} ${dir##*/}" >&2
  done
  exit 1
fi

RUNTIME_VERSION="$1"
STAMP="$2"
# The same rules as the daemon (zuri-updates.ts), plus no "." or "..", which would leave the folder.
if [[ ! "$RUNTIME_VERSION" =~ ^[A-Za-z0-9._-]+$ || "$RUNTIME_VERSION" == "." ||
  "$RUNTIME_VERSION" == ".." || ! "$STAMP" =~ ^[0-9]+$ ]]; then
  echo "Expected a runtime version ([A-Za-z0-9._-]+) and an all-digit stamp." >&2
  exit 1
fi

RUNTIME_DIR="$UPDATES_ROOT/$RUNTIME_VERSION"
SOURCE="$RUNTIME_DIR/staging/$STAMP"
TARGET="$RUNTIME_DIR/$STAMP"
if [[ ! -f "$SOURCE/metadata.json" ]]; then
  echo "No staged update at $SOURCE" >&2
  exit 1
fi
if [[ -e "$TARGET" ]]; then
  echo "A live update already exists at $TARGET" >&2
  exit 1
fi
# mv falls back to copy-and-delete across filesystems, which is not atomic.
if [[ "$(stat -c %d "$RUNTIME_DIR/staging")" != "$(stat -c %d "$RUNTIME_DIR")" ]]; then
  echo "$RUNTIME_DIR/staging is on another filesystem; the move would not be atomic." >&2
  exit 1
fi

mv -T "$SOURCE" "$TARGET"

echo "== promoted $TARGET"
echo "   every app on runtime version $RUNTIME_VERSION gets it on its next update check"
