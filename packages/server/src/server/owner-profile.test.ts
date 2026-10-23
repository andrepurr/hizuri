import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { applyOwnerProfile, findProfileDir, readOwnerProfile } from "./owner-profile.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "owner-profile-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeSettings(dir: string, body: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "settings.json"), JSON.stringify(body));
}

describe("findProfileDir", () => {
  test("finds personal/ in the hizuri home folder", () => {
    writeSettings(path.join(root, "personal"), { env: {} });
    expect(findProfileDir({ HIZURI_HOME: root })).toBe(path.join(root, "personal"));
  });

  test("a home folder without personal settings means no profile", () => {
    mkdirSync(path.join(root, "personal"), { recursive: true });
    expect(findProfileDir({ HIZURI_HOME: root })).toBeNull();
  });

  test("PASEO_PROFILE_DIR wins", () => {
    writeSettings(path.join(root, "personal"), { env: {} });
    expect(findProfileDir({ HIZURI_HOME: root, PASEO_PROFILE_DIR: "/elsewhere" })).toBe(
      "/elsewhere",
    );
  });
});

describe("readOwnerProfile", () => {
  test("resolves ./ paths inside the profile folder", () => {
    const dir = path.join(root, "profile");
    writeSettings(dir, { env: { PASEO_X_ROLE: "./roles/x.md", PASEO_X_ZONE: "UTC" } });
    expect(readOwnerProfile(dir).env).toEqual({
      PASEO_X_ROLE: path.join(dir, "roles", "x.md"),
      PASEO_X_ZONE: "UTC",
    });
  });

  test("a settings file without env is an empty profile", () => {
    const dir = path.join(root, "profile");
    writeSettings(dir, { note: "nothing yet" });
    expect(readOwnerProfile(dir).env).toEqual({});
  });

  test("a non-string value throws instead of half-applying", () => {
    const dir = path.join(root, "profile");
    writeSettings(dir, { env: { PASEO_X: 3 } });
    expect(() => readOwnerProfile(dir)).toThrow(/env\.PASEO_X must be a string/);
  });
});

describe("applyOwnerProfile", () => {
  test("fills only what the environment does not set", () => {
    const env: NodeJS.ProcessEnv = { PASEO_A: "from-env" };
    const applied = applyOwnerProfile(env, {
      dir: "/p",
      env: { PASEO_A: "from-profile", PASEO_B: "b" },
    });
    expect(env).toEqual({ PASEO_A: "from-env", PASEO_B: "b" });
    expect(applied).toEqual(["PASEO_B"]);
  });
});
