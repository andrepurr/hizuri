import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { StageBlockNode } from "../model";
import type { StageTone } from "../palette";
import { Bar } from "./basic";
import { CountText, MutedLine, Panel, arr, num, rec, str } from "./primitives";
import { ProgressRing } from "./ring";
import { STAGE_FONT } from "../type";

// Subscription limits (show_limits → the limits template): the five-hour and weekly windows
// as rings, every other window as a bar line, each with its reset time and a countdown.

const TICK_MS = 30_000;

interface UsageWindow {
  id: string;
  label: string;
  usedPct: number | null;
  resetsAt: string;
}

function readWindows(source: Record<string, unknown>): UsageWindow[] {
  return arr(source.windows).map((entry) => {
    const window = rec(entry);
    return {
      id: str(window.id, 40),
      label: str(window.label, 60),
      usedPct: num(window.usedPct),
      resetsAt: str(window.resetsAt, 64),
    };
  });
}

function pickPrimary(sources: Record<string, unknown>[]): Record<string, unknown> | null {
  return (
    sources.find((source) => source.sourceId === "claude") ??
    sources.find((source) => arr(source.windows).length > 0) ??
    sources[0] ??
    null
  );
}

function usageTone(percent: number): StageTone {
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warning";
  return "accent";
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function useResetText() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return useMemo(() => {
    const duration = (ms: number) => {
      const minutes = Math.max(0, Math.round(ms / 60000));
      const days = Math.floor(minutes / 1440);
      const hours = Math.floor((minutes % 1440) / 60);
      const rest = minutes % 60;
      if (days > 0)
        return `${days} ${t("show.page.days")}${hours > 0 ? ` ${hours} ${t("show.page.hours")}` : ""}`;
      if (hours > 0)
        return `${hours} ${t("show.page.hours")}${rest > 0 ? ` ${rest} ${t("show.page.minutes")}` : ""}`;
      return `${rest} ${t("show.page.minutes")}`;
    };
    // 24-hour clock everywhere so AM/PM does not confuse the limits view.
    const clock = (date: Date, withDay: boolean) =>
      date.toLocaleString(locale, {
        ...(withDay ? { weekday: "short" as const } : {}),
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
    return (iso: string, now: number): { at: string; countdown: string } | null => {
      const date = new Date(iso);
      if (!iso || Number.isNaN(date.getTime())) return null;
      const ms = date.getTime() - now;
      return {
        at: t("show.page.resetsAt", { time: clock(date, ms > 20 * 3600000) }),
        countdown: t("show.page.inTime", { time: duration(ms) }),
      };
    };
  }, [t, locale]);
}

function windowLabel(window: UsageWindow, t: (key: string) => string): string {
  if (window.id === "five_hour") return t("show.page.fiveHour");
  if (window.id === "weekly") return t("show.page.weekly");
  return window.label;
}

function HeroRing({ window, now }: { window: UsageWindow; now: number }) {
  const { t } = useTranslation();
  const resetText = useResetText();
  const percent = window.usedPct ?? 0;
  const reset = resetText(window.resetsAt, now);
  return (
    <View style={styles.hero}>
      <ProgressRing percent={percent} size={112} strokeWidth={11} tone={usageTone(percent)}>
        <CountText text={`${Math.round(percent)}%`} style={styles.ringValue} />
        <Text style={styles.ringCaption}>{t("show.page.used")}</Text>
      </ProgressRing>
      <Text style={styles.heroLabel}>{windowLabel(window, t)}</Text>
      {reset ? <Text style={styles.heroReset}>{reset.at}</Text> : null}
      {reset ? <Text style={styles.heroCountdown}>{reset.countdown}</Text> : null}
    </View>
  );
}

function ExtraLine({ label, window, now }: { label: string; window: UsageWindow; now: number }) {
  const resetText = useResetText();
  const reset = resetText(window.resetsAt, now);
  const percent = window.usedPct;
  return (
    <View style={styles.extra}>
      <View style={styles.extraHead}>
        <Text style={styles.extraLabel}>{label}</Text>
        <Text style={styles.extraValue}>{percent === null ? "–" : `${Math.round(percent)}%`}</Text>
      </View>
      <Bar percent={percent ?? 0} tone={usageTone(percent ?? 0)} />
      {reset ? <Text style={styles.extraReset}>{`${reset.at} · ${reset.countdown}`}</Text> : null}
    </View>
  );
}

export function LimitsBlock({ block }: { block: StageBlockNode }) {
  const { t } = useTranslation();
  const now = useNow();
  const sources = arr(block.props.sources).map(rec);
  const primary = pickPrimary(sources);
  const windows = primary ? readWindows(primary) : [];
  let heroes = windows.filter((window) => window.id === "five_hour" || window.id === "weekly");
  if (heroes.length === 0) heroes = windows.slice(0, 2);
  const extras = windows
    .filter((window) => !heroes.includes(window))
    .map((window) => ({ key: `p:${window.id}`, label: windowLabel(window, t), window }));
  for (const source of sources) {
    if (source === primary) continue;
    for (const window of readWindows(source)) {
      extras.push({
        key: `${str(source.sourceId, 40)}:${window.id}`,
        label: `${str(source.sourceLabel, 40)} · ${windowLabel(window, t)}`,
        window,
      });
    }
  }
  const footer = primary
    ? [str(primary.sourceLabel, 40), str(primary.plan, 40)].filter(Boolean).join(" · ")
    : t("show.page.noData");
  return (
    <Panel testID={`stage-block-${block.id}`}>
      <View style={styles.heroes}>
        {heroes.map((window) => (
          <HeroRing key={window.id || window.label} window={window} now={now} />
        ))}
      </View>
      {extras.map((extra) => (
        <ExtraLine key={extra.key} label={extra.label} window={extra.window} now={now} />
      ))}
      <MutedLine text={footer} />
    </Panel>
  );
}

const styles = StyleSheet.create((theme) => ({
  heroes: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: theme.spacing[3],
  },
  hero: {
    flex: 1,
    alignItems: "center",
  },
  ringValue: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.monoLight,
    fontSize: theme.fontSize["2xl"],
    fontVariant: ["tabular-nums"],
  },
  ringCaption: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.mono,
    fontSize: theme.fontSize.sm,
  },
  heroLabel: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.medium,
    fontSize: theme.fontSize.base,
    marginTop: theme.spacing[2],
  },
  heroReset: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.mono,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
    fontVariant: ["tabular-nums"],
  },
  heroCountdown: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  extra: {
    marginTop: theme.spacing[3],
  },
  extraHead: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  extraLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  extraValue: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  extraReset: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[0.5],
  },
}));
