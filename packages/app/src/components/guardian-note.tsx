import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { ShieldAlert } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { JsonValue } from "@getpaseo/protocol/agent-types";
import type { Theme } from "@/styles/theme";

// The daemon's Claude provider turns each line of the hizuri-guardian mod (a side checker of
// Zuri's rules) into a plugin timeline item of this plugin and kind; see
// packages/server/src/server/agent/providers/claude/guardian-note.ts.
const GUARDIAN_PLUGIN_ID = "hizuri-guardian";
const GUARDIAN_NOTE_KIND = "guardian_note";

export interface GuardianNoteData {
  note: string;
  rule: string | null;
  fix: string | null;
}

function readOptionalString(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** The note a plugin timeline item carries, or null when the item is not a guardian note. */
export function readGuardianNoteData(item: {
  pluginId: string;
  itemKind: string;
  data: JsonValue;
}): GuardianNoteData | null {
  if (item.pluginId !== GUARDIAN_PLUGIN_ID || item.itemKind !== GUARDIAN_NOTE_KIND) return null;
  const data = item.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const note = readOptionalString(data.note);
  if (!note) return null;
  return { note, rule: readOptionalString(data.rule), fix: readOptionalString(data.fix) };
}

const ThemedShieldAlert = withUnistyles(ShieldAlert);
const amberColorMapping = (theme: Theme) => ({ color: theme.colors.palette.amber[500] });

export const GuardianNote = memo(function GuardianNote({ note }: { note: GuardianNoteData }) {
  const { t } = useTranslation();
  return (
    <View testID="guardian-note" style={styles.container}>
      <View style={styles.header}>
        <ThemedShieldAlert size={12} uniProps={amberColorMapping} />
        <Text style={styles.headerLabel}>{t("message.guardian.header")}</Text>
      </View>
      <Text style={styles.note} selectable>
        {note.note}
      </Text>
      {note.fix ? (
        <Text style={styles.detail} selectable>
          {t("message.guardian.fix", { fix: note.fix })}
        </Text>
      ) : null}
      {note.rule ? (
        <Text style={styles.rule} selectable>
          {t("message.guardian.rule", { rule: note.rule })}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.palette.amber[500],
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    marginBottom: theme.spacing[2],
    gap: theme.spacing[1],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  headerLabel: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  note: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
    color: theme.colors.foreground,
  },
  detail: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
    color: theme.colors.foreground,
  },
  rule: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    color: theme.colors.foregroundMuted,
  },
}));
