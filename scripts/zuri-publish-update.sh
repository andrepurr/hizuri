#!/usr/bin/env bash
# Publish an over-the-air JS update for the Zuri Android app.
#
#   PASEO_HOME=/path/to/zuri/.dev/paseo-home \
#   EXPO_PUBLIC_ZURI_DEFAULT_HOST=192.0.2.1:6768 \
#   scripts/zuri-publish-update.sh
#
# Use the same EXPO_PUBLIC_* / ZURI_UPDATES_URL / PASEO_FDROID_BUILD / APP_VARIANT values as the
# APK build: they shape both the JS bundle and the runtime version (a fingerprint of everything
# native). An update only reaches APKs with the same fingerprint; after any native change the
# script publishes under a new runtime version that no installed APK asks for, so build a new APK.
#
# The daemon serves $PASEO_HOME/zuri-updates/<runtimeVersion>/<unix-seconds>/ at
# /zuri-updates/manifest. Apps pick the update up on their next launch.
#
#   ZURI_STAGING=1          publish into <runtimeVersion>/staging/<unix-seconds>/ instead. The daemon
#                           serves a staged update only to apps on its own machine (the Android
#                           emulator on the daemon's machine); the phone keeps the live one. Try it on the
#                           emulator, then go live with scripts/zuri-promote-update.sh.
#   ZURI_RUNTIME_VERSION=   publish under this runtime version instead of the resolved fingerprint.
#                           See the warning below before using it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/packages/app"
export PATH="$ROOT_DIR/node_modules/.bin:$PATH"

: "${PASEO_HOME:?Set PASEO_HOME to the Zuri daemon home}"
if [[ "$(realpath -m "$PASEO_HOME")" == "$(realpath -m "$HOME/.paseo")" ]]; then
  echo "Refusing to publish into ~/.paseo: that is the live Paseo daemon, not Zuri." >&2
  exit 1
fi
if [[ -z "${EXPO_PUBLIC_ZURI_DEFAULT_HOST:-}" && -z "${ZURI_UPDATES_URL:-}" ]]; then
  echo "Set EXPO_PUBLIC_ZURI_DEFAULT_HOST (or ZURI_UPDATES_URL) exactly as for the APK build." >&2
  exit 1
fi

export PASEO_FDROID_BUILD="${PASEO_FDROID_BUILD:-1}"
export APP_VARIANT="${APP_VARIANT:-production}"
export EXPO_NO_TELEMETRY=1

if [[ "${ZURI_SKIP_APP_DEPS:-0}" != "1" ]]; then
  echo "== building workspace packages the app imports"
  (cd "$ROOT_DIR" && npm run build:app-deps)
fi

cd "$APP_DIR"

resolve_runtime_version() {
  npx expo-updates runtimeversion:resolve --platform android 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const line=s.trim().split("\n").reverse().find((l)=>l.startsWith("{"));process.stdout.write(JSON.parse(line).runtimeVersion)})'
}

echo "== resolving the runtime version (native fingerprint)"
if [[ -n "${ZURI_RUNTIME_VERSION:-}" ]]; then
  # An override bypasses the fingerprint, the one guard that keeps a JS bundle away from an APK
  # whose native code it does not match. A bundle that calls a native method or module the APK
  # lacks breaks or crashes the app. Use it only when the installed APK's native code is
  # compatible with this source.
  # Why it exists: the current source can resolve to a different fingerprint only because of
  # cosmetic Kotlin changes (fallback notification strings and comments) in
  # packages/expo-two-way-audio after the APK build.
  RESOLVED_VERSION="$(resolve_runtime_version)" || RESOLVED_VERSION="(could not resolve)"
  RUNTIME_VERSION="$ZURI_RUNTIME_VERSION"
  cat >&2 <<WARNING

!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!! ZURI_RUNTIME_VERSION overrides the native fingerprint.
!!   resolved from this source: $RESOLVED_VERSION
!!   publishing under:          $RUNTIME_VERSION
!! Only safe when the native code of the installed APK is compatible with this source: a bundle
!! that calls native code the APK does not have breaks or crashes the app. Stage it first
!! (ZURI_STAGING=1) and try it on the emulator.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

WARNING
else
  RUNTIME_VERSION="$(resolve_runtime_version)"
fi
if [[ ! "$RUNTIME_VERSION" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Unexpected runtime version: '$RUNTIME_VERSION'" >&2
  exit 1
fi

STAMP="$(date +%s)"
UPDATES_DIR="$PASEO_HOME/zuri-updates/$RUNTIME_VERSION"
if [[ "${ZURI_STAGING:-0}" == "1" ]]; then
  UPDATES_DIR="$UPDATES_DIR/staging"
fi
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "== expo export (android)"
npx expo export --platform android --output-dir "$WORK_DIR/dist"
# A killed Hermes step still let `expo export` exit 0 with no bundle and no metadata.json, and that
# empty update was published as the newest one. Publish only a complete export.
if [[ ! -f "$WORK_DIR/dist/metadata.json" ]] || ! compgen -G "$WORK_DIR/dist/_expo/static/js/android/*" >/dev/null; then
  echo "expo export left no Android bundle or metadata.json in $WORK_DIR/dist; nothing published." >&2
  exit 1
fi
# The manifest's extra.expoClient feeds Constants.expoConfig in the updated app.
node -e 'const { getConfig } = require("expo/config"); process.stdout.write(JSON.stringify(getConfig(process.cwd(), { skipSDKVersionRequirement: true, isPublicConfig: true }).exp));' \
  >"$WORK_DIR/dist/expoConfig.json"

mkdir -p "$UPDATES_DIR"
# Copy under a non-numeric name first: the server only serves all-digit directories.
cp -r "$WORK_DIR/dist" "$UPDATES_DIR/.incoming-$STAMP"
mv "$UPDATES_DIR/.incoming-$STAMP" "$UPDATES_DIR/$STAMP"

echo "== published $UPDATES_DIR/$STAMP"
echo "   runtime version: $RUNTIME_VERSION"
if [[ "${ZURI_STAGING:-0}" == "1" ]]; then
  echo "   staged: only apps on this machine get it. To go live:"
  echo "   PASEO_HOME=$PASEO_HOME scripts/zuri-promote-update.sh $RUNTIME_VERSION $STAMP"
fi
