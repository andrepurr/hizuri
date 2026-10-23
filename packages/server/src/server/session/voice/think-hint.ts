/**
 * Hizuri (face): how long the assistant will think before speaking, sent to the app with each
 * delivered phrase (`voice_think_hint`) so the face page sizes its thinking footage to end about
 * when the assistant starts talking. The guess is this session's own record: the median of the last
 * 20 gaps from a phrase's delivery to the first played reply that answers it, rounded to the page's
 * three chains (≤ 7 s → 5, ≤ 15 s → 10, else 20). When the fast front already said a holding line, the answer is a long
 * one: 20.
 */
export type ThinkSeconds = 5 | 10 | 20;

const KEEP = 20;
/** Before the session has its own record: the measured median gap. */
const DEFAULT_GAP_MS = 6000;

export class ThinkHint {
  private readonly gaps: number[] = [];

  recordGap(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.gaps.push(ms);
    if (this.gaps.length > KEEP) this.gaps.shift();
  }

  seconds(frontSpoke: boolean): ThinkSeconds {
    if (frontSpoke) return 20;
    const median = medianOf(this.gaps) ?? DEFAULT_GAP_MS;
    if (median <= 7000) return 5;
    if (median <= 15000) return 10;
    return 20;
  }
}

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
