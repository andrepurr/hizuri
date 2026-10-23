import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useSessionStore } from "@/stores/session-store";
import { createAudioEngine } from "@/audio";
import type { AudioEngine } from "@/audio";
import {
  createVoiceRuntime,
  type VoiceRuntime,
  type VoiceRuntimeSnapshot,
} from "@/voice/voice-runtime";
import { createVoiceBackground } from "@/voice/voice-background";
import { createVoiceSessionStore } from "@/voice/voice-session-store";
import { voiceDiagnostics } from "@/voice/voice-diagnostics";
import { appLogBuffer } from "@/diagnostics/app-log-uploader";

interface VoiceContextValue extends VoiceRuntimeSnapshot {
  startVoice: (serverId: string, agentId: string) => Promise<void>;
  moveVoice: VoiceRuntime["moveVoice"];
  stopVoice: () => Promise<void>;
  switchToText: () => Promise<void>;
  endSession: () => Promise<void>;
  canKeepSession: (serverId: string) => boolean;
  isSessionForAgent: (serverId: string, agentId: string) => boolean;
  isVoiceStartingForAgent: (serverId: string, agentId: string) => boolean;
  isVoiceModeForAgent: (serverId: string, agentId: string) => boolean;
  toggleMute: () => void;
}

const EMPTY_SNAPSHOT: VoiceRuntimeSnapshot = {
  phase: "disabled",
  isVoiceMode: false,
  isVoiceSwitching: false,
  isMuted: false,
  activeServerId: null,
  activeAgentId: null,
  session: null,
};

const VoiceRuntimeContext = createContext<VoiceRuntime | null>(null);
const VoiceAudioEngineContext = createContext<AudioEngine | null>(null);

const noopSubscribe = () => () => {};
const getEmptySnapshot = () => EMPTY_SNAPSHOT;

export function useVoice() {
  const value = useVoiceOptional();
  if (!value) {
    throw new Error("useVoice must be used within VoiceProvider");
  }
  return value;
}

export function useVoiceOptional(): VoiceContextValue | null {
  const runtime = useContext(VoiceRuntimeContext);
  const snapshot = useSyncExternalStore(
    runtime ? runtime.subscribe : noopSubscribe,
    runtime ? runtime.getSnapshot : getEmptySnapshot,
    runtime ? runtime.getSnapshot : getEmptySnapshot,
  );

  // Methods on the runtime object literal close over factory-local state; they
  // don't use `this`, so no binding is needed. Memoising on [snapshot, runtime]
  // keeps the returned object reference stable across re-renders that don't
  // change either, preventing downstream memo/useMemo misses.
  return useMemo(() => {
    if (!runtime) {
      return null;
    }
    return {
      ...snapshot,
      startVoice: runtime.startVoice,
      moveVoice: runtime.moveVoice,
      stopVoice: runtime.stopVoice,
      switchToText: runtime.switchToText,
      endSession: runtime.endSession,
      canKeepSession: runtime.canKeepSession,
      isSessionForAgent: runtime.isSessionForAgent,
      isVoiceStartingForAgent: runtime.isVoiceStartingForAgent,
      isVoiceModeForAgent: runtime.isVoiceModeForAgent,
      toggleMute: runtime.toggleMute,
    };
  }, [snapshot, runtime]);
}

export function useVoiceRuntimeOptional(): VoiceRuntime | null {
  return useContext(VoiceRuntimeContext);
}

export function useVoiceAudioEngineOptional(): AudioEngine | null {
  return useContext(VoiceAudioEngineContext);
}

interface VoiceProviderProps {
  children: ReactNode;
}

export function VoiceProvider({ children }: VoiceProviderProps) {
  const engineRef = useRef<AudioEngine | null>(null);
  const runtimeRef = useRef<VoiceRuntime | null>(null);

  if (!engineRef.current) {
    let runtime: VoiceRuntime | null = null;
    const engine = createAudioEngine({
      onCaptureData: (pcm) => {
        voiceDiagnostics.recordMicChunk(pcm);
        runtime?.handleCapturePcm(pcm);
      },
      onVolumeLevel: (level) => {
        voiceDiagnostics.recordLevel(level);
        runtime?.handleCaptureVolume(level);
      },
      onInterruption: () => {
        // Another app or the OS took the microphone. Voice mode, the host session and the
        // Android foreground service stay up; the runtime reopens the microphone by itself.
        runtime?.handleCaptureInterrupted();
      },
      onError: (error) => {
        console.error("[VoiceEngine] Capture error:", error);
      },
    });

    runtime = createVoiceRuntime({
      engine,
      getServerInfo: (serverId) =>
        useSessionStore.getState().getSession(serverId)?.serverInfo ?? null,
      activateKeepAwake: async (tag) => {
        await activateKeepAwakeAsync(tag);
      },
      deactivateKeepAwake: async (tag) => {
        await deactivateKeepAwake(tag);
      },
      background: createVoiceBackground(),
      sessionStore: createVoiceSessionStore(),
      log: (level, message) => appLogBuffer.record({ level, tag: "voice", message }),
    });

    engineRef.current = engine;
    runtimeRef.current = runtime;
  }

  const engine = engineRef.current;
  const runtime = runtimeRef.current!;

  useEffect(() => {
    return () => {
      void runtime.destroy().catch((error) => {
        console.error("[VoiceProvider] Failed to destroy voice runtime", error);
      });
    };
  }, [runtime]);

  return (
    <VoiceAudioEngineContext.Provider value={engine}>
      <VoiceRuntimeContext.Provider value={runtime}>{children}</VoiceRuntimeContext.Provider>
    </VoiceAudioEngineContext.Provider>
  );
}
