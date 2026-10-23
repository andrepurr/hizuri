import { parseHostPort } from "@/utils/daemon-endpoints";

/**
 * hizuri ships knowing one host: the daemon named by `EXPO_PUBLIC_ZURI_DEFAULT_HOST`
 * (`host:port`, inlined into the JS bundle at build time). A fresh install adds it to the
 * host registry by itself, once. After that the host is the user's: removing it in
 * settings keeps it removed.
 *
 * Passwords never go into the build. When the daemon asks for one, the seed stops and the
 * user types it into the Add host form, which opens prefilled with this host.
 */
export interface ZuriDefaultHost {
  host: string;
  port: number;
  /** Normalised `host:port`, the same shape direct connections store. */
  endpoint: string;
}

export const ZURI_DEFAULT_HOST_SEEDED_KEY = "@zuri:default-host-seeded";

const SEED_RETRY_INITIAL_MS = 2_000;
const SEED_RETRY_MAX_MS = 30_000;

export function parseZuriDefaultHost(raw: string | undefined): ZuriDefaultHost | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  try {
    const { host, port, isIpv6 } = parseHostPort(value);
    return { host, port, endpoint: isIpv6 ? `[${host}]:${port}` : `${host}:${port}` };
  } catch {
    console.warn("[ZuriDefaultHost] EXPO_PUBLIC_ZURI_DEFAULT_HOST is not host:port", { value });
    return null;
  }
}

export function readZuriDefaultHost(): ZuriDefaultHost | null {
  // Direct `process.env.EXPO_PUBLIC_*` access is what the Expo babel preset inlines.
  return parseZuriDefaultHost(process.env.EXPO_PUBLIC_ZURI_DEFAULT_HOST);
}

export type ZuriDefaultHostSeedResult = "seeded" | "already-seeded" | "password-required";

export interface ZuriDefaultHostSeedInput {
  storage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
  };
  /** True once the registry holds a connection to the default host. */
  hasHost: () => boolean;
  /** Probes the daemon and saves it to the registry; throws when it cannot connect. */
  probeAndAdd: () => Promise<void>;
  isAuthFailure: (error: unknown) => boolean;
  wait?: (ms: number) => Promise<void>;
}

export async function seedZuriDefaultHost(
  input: ZuriDefaultHostSeedInput,
): Promise<ZuriDefaultHostSeedResult> {
  const wait = input.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const markSeeded = () => input.storage.setItem(ZURI_DEFAULT_HOST_SEEDED_KEY, "1");

  if ((await input.storage.getItem(ZURI_DEFAULT_HOST_SEEDED_KEY)) === "1") {
    return "already-seeded";
  }

  let retryMs = SEED_RETRY_INITIAL_MS;
  let attempt = 0;
  while (!input.hasHost()) {
    attempt += 1;
    try {
      await input.probeAndAdd();
      break;
    } catch (error) {
      if (input.isAuthFailure(error)) {
        return "password-required";
      }
      if (attempt === 1 || attempt % 10 === 0) {
        console.warn("[ZuriDefaultHost] probe failed, retrying", { attempt, error });
      }
      await wait(retryMs);
      retryMs = Math.min(retryMs * 2, SEED_RETRY_MAX_MS);
    }
  }
  await markSeeded();
  return "seeded";
}
