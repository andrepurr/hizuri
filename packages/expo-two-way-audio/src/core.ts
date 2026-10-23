import { type PermissionResponse } from "expo-modules-core";
import ExpoTwoWayAudioModule from "./ExpoTwoWayAudioModule";

export async function initialize() {
  return await ExpoTwoWayAudioModule.initialize();
}

export function playPCMData(audioData: Uint8Array) {
  return ExpoTwoWayAudioModule.playPCMData(audioData);
}

export interface OutputTiming {
  /** From now until a chunk handed over now is audible, from the track's playback timestamps. */
  audibleInMs: number;
  /** How long a track that ran dry takes to make its first frame audible. */
  startLatencyMs: number;
  /** False while the start latency is still the default estimate. */
  measured: boolean;
  /** What the native clock has seen (timestamps, bursts, flushes), for the app log. */
  clock?: string;
}

/**
 * Android: when a chunk handed to `playPCMData` now becomes audible (AudioTrack.getTimestamp).
 * Null while the track gives no timestamp, on other platforms, and on older binaries.
 */
export function getOutputTiming(): OutputTiming | null {
  // COMPAT(outputTiming): an OTA update can land on an app binary built before this native
  // method; drop the guard once no supported binary lacks it.
  if (typeof ExpoTwoWayAudioModule.getOutputTiming !== "function") {
    return null;
  }
  return ExpoTwoWayAudioModule.getOutputTiming() ?? null;
}

export function bypassVoiceProcessing(bypass: boolean) {
  return ExpoTwoWayAudioModule.bypassVoiceProcessing(bypass);
}

export function toggleRecording(val: boolean): boolean {
  return ExpoTwoWayAudioModule.toggleRecording(val);
}

/** Capture speech without treating another app's playback focus as a microphone failure. */
export function startDictation(): boolean {
  // COMPAT(dictationCapture): added after v0.11.2, remove after 2027-01-16 once
  // the native binary floor includes startDictation. Older OTA clients retain legacy capture.
  if (typeof ExpoTwoWayAudioModule.startDictation !== "function") {
    return ExpoTwoWayAudioModule.toggleRecording(true);
  }
  return ExpoTwoWayAudioModule.startDictation();
}

export function isRecording(): boolean {
  return ExpoTwoWayAudioModule.isRecording();
}

/**
 * Hand the OS audio session / audio focus back once nothing is being captured or played,
 * so other apps' audio can resume. Safe to call when already released.
 */
export function releaseAudioSession() {
  // COMPAT(releaseAudioSession): added in v0.2.6. An OTA JS update can land on an older
  // binary whose native module lacks this function, so probe the native object rather than
  // this wrapper (which always exists). Drop the guard once the binary floor is >= v0.2.6.
  if (typeof ExpoTwoWayAudioModule.releaseAudioSession !== "function") {
    return;
  }
  return ExpoTwoWayAudioModule.releaseAudioSession();
}

export function tearDown() {
  return ExpoTwoWayAudioModule.tearDown();
}

export function restart() {
  return ExpoTwoWayAudioModule.restart();
}

export async function getMicrophonePermissionsAsync(): Promise<PermissionResponse> {
  return ExpoTwoWayAudioModule.getMicrophonePermissionsAsync();
}

export async function requestMicrophonePermissionsAsync(): Promise<PermissionResponse> {
  return ExpoTwoWayAudioModule.requestMicrophonePermissionsAsync();
}

export function getMicrophoneModeIOS() {
  return ExpoTwoWayAudioModule.getMicrophoneModeIOS();
}

export function setMicrophoneModeIOS() {
  return ExpoTwoWayAudioModule.setMicrophoneModeIOS();
}

export function isPlaying(): boolean {
  return ExpoTwoWayAudioModule.isPlaying();
}

export function stopPlayback() {
  return ExpoTwoWayAudioModule.stopPlayback();
}

export function pausePlayback() {
  return ExpoTwoWayAudioModule.pausePlayback();
}

export function resumePlayback() {
  return ExpoTwoWayAudioModule.resumePlayback();
}

/**
 * Android only. Starts the voice foreground service ("hizuri is listening") and a headless JS
 * task that keeps JS timers running while the app is hidden. Call after microphone capture has
 * started: Android 14 refuses a `microphone` service without RECORD_AUDIO. Resolves false when
 * Android refuses the start.
 */
export async function startVoiceForegroundService(title: string, text: string): Promise<boolean> {
  return ExpoTwoWayAudioModule.startVoiceForegroundService(title, text);
}

/** Android only. Safe to call when the service is not running. */
export function stopVoiceForegroundService() {
  return ExpoTwoWayAudioModule.stopVoiceForegroundService();
}

/** Android only. */
export function isVoiceForegroundServiceRunning(): boolean {
  return ExpoTwoWayAudioModule.isVoiceForegroundServiceRunning();
}

/** Android only. POST_NOTIFICATIONS on Android 13+, granted below that. */
export async function requestNotificationPermissionAsync(): Promise<PermissionResponse> {
  return ExpoTwoWayAudioModule.requestNotificationPermissionAsync();
}

/** Android only. True when hizuri is already exempt from battery optimisation (Doze). */
export function isIgnoringBatteryOptimizations(): boolean {
  return ExpoTwoWayAudioModule.isIgnoringBatteryOptimizations();
}

/**
 * Android only. Opens the system dialog that exempts hizuri from battery optimisation. Returns
 * false when the dialog cannot open.
 */
export function requestIgnoreBatteryOptimizations(): boolean {
  return ExpoTwoWayAudioModule.requestIgnoreBatteryOptimizations();
}

/**
 * Android only. Posts (or replaces) one alerting notification, with sound, that tells the user
 * the microphone is not reaching the host. Resolves false on binaries that predate it.
 */
export function showVoiceAlert(title: string, text: string): boolean {
  // COMPAT(voiceAlert): an OTA JS update can land on an app binary built before this native
  // method; probe the native object. Drop the guard once no supported binary lacks it.
  if (typeof ExpoTwoWayAudioModule.showVoiceAlert !== "function") {
    return false;
  }
  return ExpoTwoWayAudioModule.showVoiceAlert(title, text);
}

/** Android only. Removes the alert from showVoiceAlert(); safe when none is shown. */
export function clearVoiceAlert(): void {
  // COMPAT(voiceAlert): see showVoiceAlert.
  if (typeof ExpoTwoWayAudioModule.clearVoiceAlert !== "function") {
    return;
  }
  ExpoTwoWayAudioModule.clearVoiceAlert();
}
