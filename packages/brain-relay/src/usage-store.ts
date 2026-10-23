import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RelayLimits } from "./config.js";

/**
 * Who used the free brain and how much. Only hashes and counts: an install is known by the
 * SHA-256 of its token, an address by a salted hash. Nothing a user said is ever stored.
 */
interface InstallRecord {
  id: string;
  createdAt: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Set for installs an operator issued (hosted demos): a name and caps of their own. */
  label?: string;
  capUsd?: number;
  capRequests?: number;
}

interface DayRecord {
  global: number;
  installs: Record<string, number>;
  ips: Record<string, number>;
  ipInstalls: Record<string, number>;
}

interface StoreState {
  version: 1;
  installs: Record<string, InstallRecord>;
  days: Record<string, DayRecord>;
}

export type DenyCode =
  | "free_limit_reached"
  | "free_used_up"
  | "ip_limit_reached"
  | "free_brain_busy"
  | "install_limit_reached"
  | "trial_budget_spent";

export type Admission =
  | { ok: true; installId: string }
  | { ok: false; code: DenyCode; installId: string | null };

export interface InstallUsage {
  installId: string;
  usedToday: number;
  dailyLimit: number;
  usedTotal: number;
  totalLimit: number;
  spentUsd: number;
  /** 0 when this install has no spend cap. */
  capUsd: number;
}

export interface ManagedInstall {
  installId: string;
  label: string | null;
  createdAt: string;
  requests: number;
  spentUsd: number;
  capUsd: number;
  capRequests: number;
}

const TOKEN_PREFIX = "hzf_";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function emptyDay(): DayRecord {
  return { global: 0, installs: {}, ips: {}, ipInstalls: {} };
}

export class UsageStore {
  private state: StoreState;
  /** Worst-case cost of calls still on their way, per install id: the spend cap counts them. */
  private readonly reservedUsd = new Map<string, number>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly options: {
      limits: RelayLimits;
      stateFile: string | null;
      now: () => Date;
    },
  ) {
    this.state = this.load();
  }

  private load(): StoreState {
    const file = this.options.stateFile;
    if (!file) return { version: 1, installs: {}, days: {} };
    try {
      return JSON.parse(readFileSync(file, "utf8")) as StoreState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, installs: {}, days: {} };
      }
      throw error;
    }
  }

  private today(): DayRecord {
    const key = dayKey(this.options.now());
    let day = this.state.days[key];
    if (!day) {
      day = emptyDay();
      // Only today matters for the caps; older days go.
      this.state.days = { [key]: day };
    }
    return day;
  }

  issueInstall(ipHash: string): { token: string; installId: string } | { denied: DenyCode } {
    const day = this.today();
    if ((day.ipInstalls[ipHash] ?? 0) >= this.options.limits.ipDailyInstalls) {
      return { denied: "install_limit_reached" };
    }
    const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
    const hash = hashToken(token);
    const installId = hash.slice(0, 12);
    this.state.installs[hash] = {
      id: installId,
      createdAt: this.options.now().toISOString(),
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    day.ipInstalls[ipHash] = (day.ipInstalls[ipHash] ?? 0) + 1;
    this.scheduleFlush();
    return { token, installId };
  }

  /** An install with its own caps, issued by an operator; it does not count against any address. */
  issueManagedInstall(input: { label?: string; capUsd?: number; capRequests?: number }): {
    token: string;
    installId: string;
  } {
    const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
    const hash = hashToken(token);
    const installId = hash.slice(0, 12);
    this.state.installs[hash] = {
      id: installId,
      createdAt: this.options.now().toISOString(),
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      ...(input.label ? { label: input.label } : {}),
      ...(input.capUsd !== undefined ? { capUsd: input.capUsd } : {}),
      ...(input.capRequests !== undefined ? { capRequests: input.capRequests } : {}),
    };
    this.scheduleFlush();
    return { token, installId };
  }

  /** Forgets an install: its token stops working at once. */
  revoke(installId: string): boolean {
    for (const [hash, install] of Object.entries(this.state.installs)) {
      if (install.id === installId) {
        delete this.state.installs[hash];
        this.reservedUsd.delete(installId);
        this.scheduleFlush();
        return true;
      }
    }
    return false;
  }

  listManaged(): ManagedInstall[] {
    return Object.values(this.state.installs)
      .filter((install) => install.label !== undefined || install.capUsd !== undefined)
      .map((install) => ({
        installId: install.id,
        label: install.label ?? null,
        createdAt: install.createdAt,
        requests: install.requests,
        spentUsd: install.costUsd,
        capUsd: this.capUsd(install),
        capRequests: this.capRequests(install),
      }));
  }

  private capUsd(install: InstallRecord): number {
    return install.capUsd ?? this.options.limits.installTotalUsd;
  }

  private capRequests(install: InstallRecord): number {
    return install.capRequests ?? this.options.limits.installTotalRequests;
  }

  findInstall(token: string): InstallRecord | null {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    return this.state.installs[hashToken(token)] ?? null;
  }

  /**
   * Checks every cap and, when the call may go, counts it before it reaches the upstream.
   * `reserveUsd` is the call's worst-case cost: with a spend cap, a call goes only if the money
   * already spent plus every call still on its way, at its worst case, stays within the cap.
   */
  admit(token: string, ipHash: string, reserveUsd = 0): Admission {
    const install = this.findInstall(token);
    if (!install) return { ok: false, code: "free_used_up", installId: null };
    const { limits } = this.options;
    const day = this.today();
    const installId = install.id;
    if (install.requests >= this.capRequests(install)) {
      return { ok: false, code: "free_used_up", installId };
    }
    const capUsd = this.capUsd(install);
    const reserved = this.reservedUsd.get(installId) ?? 0;
    if (capUsd > 0 && install.costUsd + reserved + reserveUsd > capUsd) {
      return { ok: false, code: "trial_budget_spent", installId };
    }
    if ((day.installs[installId] ?? 0) >= limits.installDailyRequests) {
      return { ok: false, code: "free_limit_reached", installId };
    }
    if ((day.ips[ipHash] ?? 0) >= limits.ipDailyRequests) {
      return { ok: false, code: "ip_limit_reached", installId };
    }
    if (day.global >= limits.globalDailyRequests) {
      return { ok: false, code: "free_brain_busy", installId };
    }
    install.requests += 1;
    if (reserveUsd > 0) this.reservedUsd.set(installId, reserved + reserveUsd);
    day.installs[installId] = (day.installs[installId] ?? 0) + 1;
    day.ips[ipHash] = (day.ips[ipHash] ?? 0) + 1;
    day.global += 1;
    this.scheduleFlush();
    return { ok: true, installId };
  }

  /** Settles a call: its reservation goes, its real cost stays. */
  recordTokens(
    token: string,
    usage: { inputTokens: number; outputTokens: number; costUsd: number },
    reservedUsd = 0,
  ) {
    const install = this.findInstall(token);
    if (!install) return;
    if (reservedUsd > 0) {
      const left = (this.reservedUsd.get(install.id) ?? 0) - reservedUsd;
      if (left > 1e-12) this.reservedUsd.set(install.id, left);
      else this.reservedUsd.delete(install.id);
    }
    install.inputTokens += usage.inputTokens;
    install.outputTokens += usage.outputTokens;
    install.costUsd += usage.costUsd;
    this.scheduleFlush();
  }

  usage(token: string): InstallUsage | null {
    const install = this.findInstall(token);
    if (!install) return null;
    return {
      installId: install.id,
      usedToday: this.today().installs[install.id] ?? 0,
      dailyLimit: this.options.limits.installDailyRequests,
      usedTotal: install.requests,
      totalLimit: this.capRequests(install),
      spentUsd: install.costUsd,
      capUsd: this.capUsd(install),
    };
  }

  private scheduleFlush(): void {
    if (!this.options.stateFile || this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), 1_000);
    this.flushTimer.unref();
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const file = this.options.stateFile;
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 });
    renameSync(tmp, file);
  }
}
