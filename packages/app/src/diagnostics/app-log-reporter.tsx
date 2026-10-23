import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useVoiceRuntimeOptional } from "@/contexts/voice-context";
import { useAppSettings } from "@/hooks/use-settings";
import { getHostRuntimeStore, type HostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { resolveAppVersion } from "@/utils/app-version";
import { voiceDiagnostics } from "@/voice/voice-diagnostics";
import type { VoiceRuntimeSnapshot } from "@/voice/voice-runtime";
import { redactAppLogMessage } from "./app-diagnostic-report";
import {
  APP_LOG_FLUSH_INTERVAL_MS,
  appLogBuffer,
  captureConsole,
  flushAppLogs,
  type AppLogUploadTarget,
} from "./app-log-uploader";
import { installCrashBox, replayLastCrash } from "./crash-box";

const MIC_STATS_INTERVAL_MS = 15_000;
// A tick that comes this much later than planned means the JS thread did not run: touch, voice
// and screen all freeze for that long.
const STALL_TICK_MS = 250;
const STALL_REPORT_MS = 1_000;
const HEAP_INTERVAL_MS = 60_000;

type HermesStats = Record<string, number | string>;

function describeHeap(): string | null {
  const hermes = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => HermesStats } })
    .HermesInternal;
  const stats = hermes?.getInstrumentedStats?.();
  if (!stats) return null;
  const mb = (key: string) =>
    typeof stats[key] === "number" ? `${Math.round((stats[key] as number) / 1e6)}` : "?";
  return `heapMB=${mb("js_heapSize")} allocatedMB=${mb("js_allocatedBytes")} mallocMB=${mb("js_mallocSizeEstimate")} gcs=${stats.js_numGCs ?? "?"} gcTime=${stats.js_gcTime ?? "?"}`;
}

function resolveUploadTarget(): AppLogUploadTarget | null {
  const store = getHostRuntimeStore();
  for (const host of store.getHosts()) {
    const client = store.getClient(host.serverId);
    const status = store.getSnapshot(host.serverId)?.connectionStatus;
    const features = useSessionStore.getState().getSession(host.serverId)?.serverInfo?.features;
    if (!client || status !== "online" || features?.appLogs !== true) {
      continue;
    }
    return {
      upload: async (entries) => {
        const appVersion = resolveAppVersion();
        const hosts = store.getHosts();
        const result = await client.uploadAppLogs({
          entries: entries.map((entry) => ({
            ...entry,
            message: redactAppLogMessage(entry.message, hosts),
          })),
          platform: Platform.OS,
          ...(appVersion ? { appVersion } : {}),
        });
        if (result.error) {
          throw new Error(result.error);
        }
      },
    };
  }
  return null;
}

function describeVoice(snapshot: VoiceRuntimeSnapshot): string {
  return [
    `phase=${snapshot.phase}`,
    `voiceMode=${snapshot.isVoiceMode}`,
    `muted=${snapshot.isMuted}`,
    snapshot.activeAgentId ? `agent=${snapshot.activeAgentId}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * hizuri: collects app logs (console warnings and errors, voice state, mic stats, reconnects, JS
 * thread freezes, JS memory) and sends them to the host every 30 s. Renders nothing.
 */
export function AppLogReporter() {
  const { settings } = useAppSettings();
  const enabledRef = useRef(settings.uploadAppLogs);
  const voiceRuntime = useVoiceRuntimeOptional();

  useEffect(() => {
    enabledRef.current = settings.uploadAppLogs;
  }, [settings.uploadAppLogs]);

  useEffect(() => captureConsole(appLogBuffer), []);

  useEffect(() => {
    replayLastCrash(appLogBuffer);
    return installCrashBox(appLogBuffer);
  }, []);

  useEffect(() => {
    const flush = setInterval(() => {
      void flushAppLogs({
        buffer: appLogBuffer,
        isEnabled: () => enabledRef.current,
        resolveTarget: resolveUploadTarget,
      });
    }, APP_LOG_FLUSH_INTERVAL_MS);
    const micStats = setInterval(() => {
      const stats = voiceDiagnostics.takeWindowStats();
      if (!stats || !enabledRef.current) return;
      appLogBuffer.record({
        level: stats.zeroChunks > 0 ? "warn" : "info",
        tag: "mic",
        message: `chunks=${stats.chunks} zeroChunks=${stats.zeroChunks} longestZeroRunMs=${stats.longestZeroRunMs} levelMax=${stats.levelMax} levelMean=${stats.levelMean}`,
      });
    }, MIC_STATS_INTERVAL_MS);
    return () => {
      clearInterval(flush);
      clearInterval(micStats);
    };
  }, []);

  useEffect(() => {
    let last = Date.now();
    // Timers stop in the background; the first tick after coming back is not a freeze.
    const appState = AppState.addEventListener("change", () => {
      last = Date.now();
    });
    const tick = setInterval(() => {
      const now = Date.now();
      const lateMs = now - last - STALL_TICK_MS;
      last = now;
      if (lateMs < STALL_REPORT_MS || AppState.currentState !== "active") return;
      if (!enabledRef.current) return;
      const voice = voiceRuntime ? ` ${describeVoice(voiceRuntime.getSnapshot())}` : "";
      appLogBuffer.record({ level: "warn", tag: "stall", message: `ms=${lateMs}${voice}` });
    }, STALL_TICK_MS);
    const heap = setInterval(() => {
      const line = describeHeap();
      if (!line || !enabledRef.current) return;
      appLogBuffer.record({ level: "info", tag: "heap", message: line });
    }, HEAP_INTERVAL_MS);
    return () => {
      appState.remove();
      clearInterval(tick);
      clearInterval(heap);
    };
  }, [voiceRuntime]);

  useEffect(() => {
    if (!voiceRuntime) return;
    let previous = describeVoice(voiceRuntime.getSnapshot());
    return voiceRuntime.subscribe(() => {
      const next = describeVoice(voiceRuntime.getSnapshot());
      if (next === previous || !enabledRef.current) return;
      previous = next;
      appLogBuffer.record({ level: "info", tag: "voice", message: next });
    });
  }, [voiceRuntime]);

  useEffect(() => {
    let lastSeq = voiceDiagnostics.getSnapshot().transcriptSeq;
    return voiceDiagnostics.subscribe(() => {
      const snapshot = voiceDiagnostics.getSnapshot();
      if (snapshot.transcriptSeq === lastSeq || !enabledRef.current) return;
      lastSeq = snapshot.transcriptSeq;
      appLogBuffer.record({
        level: "info",
        tag: "transcript",
        message: `chars=${snapshot.lastTranscript?.length ?? 0} latencyMs=${snapshot.transcriptLatencyMs ?? "unknown"} lowConfidence=${snapshot.isLowConfidence}`,
      });
    });
  }, []);

  useEffect(() => {
    const store = getHostRuntimeStore();
    const lastStatus = new Map<string, HostRuntimeConnectionStatus>();
    return store.subscribeAll(() => {
      if (!enabledRef.current) return;
      for (const host of store.getHosts()) {
        const snapshot = store.getSnapshot(host.serverId);
        const status = snapshot?.connectionStatus;
        if (!status || lastStatus.get(host.serverId) === status) continue;
        const previous = lastStatus.get(host.serverId) ?? "none";
        lastStatus.set(host.serverId, status);
        appLogBuffer.record({
          level: status === "error" || status === "offline" ? "warn" : "info",
          tag: "host",
          message: `${host.serverId} ${previous} -> ${status}${
            snapshot?.lastError ? ` lastError=${snapshot.lastError}` : ""
          }`,
        });
      }
    });
  }, []);

  return null;
}
