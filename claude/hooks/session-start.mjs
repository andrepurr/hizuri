// SessionStart: index what is new in memory (in the background), and tell the agent what its
// self-learning loop needs right now: a missing personal folder, a weekly retro that is due.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { PERSONAL, PLUGIN_ROOT } from "../lib/hizuri.mjs";
import { retroDue } from "../lib/retro.mjs";

const lines = [];
{
  const sync = spawn(
    process.execPath,
    [path.join(PLUGIN_ROOT, "bin", "hizuri-memory"), "sync", "--quiet"],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  sync.unref();
  if (!existsSync(PERSONAL)) {
    lines.push(
      `hizuri: the personal folder ${PERSONAL} is missing. Run the installer of the hizuri repo (install.sh) to create it.`,
    );
  } else {
    const { due, waiting } = retroDue();
    if (due) {
      lines.push(
        `hizuri: the weekly retro is due (${waiting} retro lines waiting). At the first quiet moment, run the weekly-retro skill on your own; tell the user one line of what changed.`,
      );
    }
  }
}
if (lines.length > 0) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") },
    }),
  );
}
