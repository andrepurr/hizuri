import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

// The app's two generated bundles (the terminal web view and the Mermaid runtime) are built here
// after install and are not tracked: each embeds a whole third-party library. An install that left
// out the app (a single-workspace CI install) has nothing to build them from, so they are skipped.
const builders = [
  "packages/app/scripts/build-terminal-webview-html.mjs",
  "packages/app/src/components/markdown/fence/mermaid/build-runtime.mjs",
];

function hasEsbuild() {
  try {
    createRequire(join(process.cwd(), "packages/app/package.json")).resolve("esbuild");
    return true;
  } catch {
    return false;
  }
}

if (!existsSync("packages/app/package.json") || !hasEsbuild()) {
  console.log("build-app-generated: the app is not installed, its bundles are not built");
  process.exit(0);
}
for (const builder of builders) {
  const result = spawnSync(process.execPath, [builder], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`build-app-generated: ${builder} failed`);
    process.exit(result.status ?? 1);
  }
}
