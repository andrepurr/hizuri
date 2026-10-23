import { describe, expect, it } from "vitest";
import { DaemonAuthenticationError } from "@getpaseo/client/internal/daemon-client";
import {
  parseZuriDefaultHost,
  seedZuriDefaultHost,
  ZURI_DEFAULT_HOST_SEEDED_KEY,
  type ZuriDefaultHostSeedInput,
} from "./zuri-default-host";

function memoryStorage(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("parseZuriDefaultHost", () => {
  it("reads host:port", () => {
    expect(parseZuriDefaultHost(" 192.0.2.1:6768 ")).toEqual({
      host: "192.0.2.1",
      port: 6768,
      endpoint: "192.0.2.1:6768",
    });
  });

  it("returns null when unset or malformed", () => {
    expect(parseZuriDefaultHost(undefined)).toBeNull();
    expect(parseZuriDefaultHost("")).toBeNull();
    expect(parseZuriDefaultHost("workstation")).toBeNull();
  });
});

describe("seedZuriDefaultHost", () => {
  function seedInput(
    overrides: Partial<ZuriDefaultHostSeedInput> & { storage: ZuriDefaultHostSeedInput["storage"] },
  ): ZuriDefaultHostSeedInput {
    return {
      hasHost: () => false,
      probeAndAdd: async () => undefined,
      isAuthFailure: (error) => error instanceof DaemonAuthenticationError,
      wait: async () => undefined,
      ...overrides,
    };
  }

  it("retries until the daemon answers, then marks the seed done", async () => {
    const storage = memoryStorage();
    let attempts = 0;
    const result = await seedZuriDefaultHost(
      seedInput({
        storage,
        probeAndAdd: async () => {
          attempts += 1;
          if (attempts < 3) throw new Error("unreachable");
        },
      }),
    );
    expect(result).toBe("seeded");
    expect(attempts).toBe(3);
    expect(storage.values.get(ZURI_DEFAULT_HOST_SEEDED_KEY)).toBe("1");
  });

  it("stops for a password and leaves the seed open", async () => {
    const storage = memoryStorage();
    const result = await seedZuriDefaultHost(
      seedInput({
        storage,
        probeAndAdd: async () => {
          throw new DaemonAuthenticationError("password_required");
        },
      }),
    );
    expect(result).toBe("password-required");
    expect(storage.values.has(ZURI_DEFAULT_HOST_SEEDED_KEY)).toBe(false);
  });

  it("marks the seed done without probing when the host is already saved", async () => {
    const storage = memoryStorage();
    let probed = false;
    const result = await seedZuriDefaultHost(
      seedInput({
        storage,
        hasHost: () => true,
        probeAndAdd: async () => {
          probed = true;
        },
      }),
    );
    expect(result).toBe("seeded");
    expect(probed).toBe(false);
  });

  it("does nothing after the first seed", async () => {
    const storage = memoryStorage({ [ZURI_DEFAULT_HOST_SEEDED_KEY]: "1" });
    const result = await seedZuriDefaultHost(seedInput({ storage }));
    expect(result).toBe("already-seeded");
  });
});
