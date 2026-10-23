import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
// oxlint-disable-next-line paseo/no-raw-pressable -- hizuri: these surfaces draw their own press states
import { Pressable, Text, type TextInputProps, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { EditingTextInput } from "@/components/ui/text-input";
import type { Theme } from "@/styles/theme";
import type { StageBlockNode } from "../model";
import { STAGE_FONT } from "../type";
import { useStageBlockContext } from "./block-context";
import { BlockTitle, Panel, arr, rec, str } from "./primitives";

// The secure form the agent opened with secret_request. The user's values stay in this component's
// state until they tap “Save”; then they go to the daemon's vault (secret.store.request) and are
// cleared here. They never pass through the agent, the stage, the stage cache or a log line. Masked
// fields are secure entry, so the keyboard does not learn them; autofill hints let the user's
// password manager fill the form.

const ThemedInput = withUnistyles(EditingTextInput, (theme: Theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
  selectionColor: theme.colors.foreground,
}));

interface FormField {
  key: string;
  label: string;
  secure: boolean;
  optional: boolean;
  keyboard: TextInputProps["keyboardType"];
  autofill: TextInputProps["autoComplete"];
  placeholder: string;
}

const KEYBOARDS: Record<string, TextInputProps["keyboardType"]> = {
  email: "email-address",
  number: "number-pad",
};

const AUTOFILL = new Set([
  "username",
  "password",
  "email",
  "cc-name",
  "cc-number",
  "cc-exp",
  "cc-csc",
]);

function fieldsOf(value: unknown): FormField[] {
  return arr(value).map((entry) => {
    const field = rec(entry);
    const autofill = str(field.autofill, 20);
    return {
      key: str(field.key, 40),
      label: str(field.label, 60),
      secure: field.secure === true,
      optional: field.optional === true,
      keyboard: KEYBOARDS[str(field.keyboard, 20)] ?? "default",
      autofill: AUTOFILL.has(autofill) ? (autofill as TextInputProps["autoComplete"]) : "off",
      placeholder: str(field.placeholder, 40),
    };
  });
}

interface FormState {
  status: "editing" | "saving" | "stored" | "declined";
  error: string | null;
}

/** One field; the input keeps its own text and reports each edit up by key. */
const SecretInput = memo(function SecretInput({
  field,
  editable,
  onChange,
}: {
  field: FormField;
  editable: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const { t } = useTranslation();
  const onChangeText = useCallback((text: string) => onChange(field.key, text), [onChange, field]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {t(labelKey(field.key), { defaultValue: field.label })}
        {field.optional ? ` (${t("show.secret.optional")})` : ""}
      </Text>
      <ThemedInput
        testID={`secret-field-${field.key}`}
        style={styles.input}
        onChangeText={onChangeText}
        secureTextEntry={field.secure}
        keyboardType={field.keyboard}
        autoComplete={field.autofill}
        importantForAutofill={field.autofill === "off" ? "no" : "yes"}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        contextMenuHidden={field.secure}
        placeholder={field.placeholder}
        editable={editable}
      />
    </View>
  );
});

/** The app's own label for a field it knows, else the daemon's. */
function labelKey(key: string): string {
  return `show.secret.fields.${key.replace(/^limit\./, "")}`;
}

export function SecretBlock({ block }: { block: StageBlockNode }) {
  const { t } = useTranslation();
  const { storeSecret } = useStageBlockContext();
  const form = str(block.props.form, 80);
  const fields = useMemo(() => fieldsOf(block.props.fields), [block.props.fields]);
  const limits = useMemo(() => fieldsOf(block.props.limits), [block.props.limits]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<FormState>({ status: "editing", error: null });

  const setValue = useCallback((key: string, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  }, []);

  const save = useCallback(() => {
    if (!storeSecret || state.status === "saving") return;
    setState({ status: "saving", error: null });
    storeSecret({ form, values })
      .then((result) => {
        if (result.stored) setValues({});
        setState({ status: result.stored ? "stored" : "editing", error: result.error });
        return undefined;
      })
      .catch(() => setState({ status: "editing", error: t("show.secret.notSent") }));
  }, [storeSecret, state.status, form, values, t]);

  const decline = useCallback(() => {
    if (!storeSecret) return;
    setValues({});
    setState({ status: "declined", error: null });
    storeSecret({ form, decline: true }).catch(() => undefined);
  }, [storeSecret, form]);

  const name = str(block.props.name, 40);
  if (!storeSecret) {
    return (
      <Panel tone="accent" testID={`stage-block-${block.id}`}>
        <BlockTitle text={`🔒 ${name}`} />
        <Text style={styles.why}>{block.fallback}</Text>
      </Panel>
    );
  }
  if (state.status === "stored" || state.status === "declined") {
    return (
      <Panel tone="success" testID={`stage-block-${block.id}`}>
        <BlockTitle
          text={
            state.status === "stored"
              ? `🟢 ${t("show.secret.saved", { name })}`
              : t("show.secret.closed")
          }
        />
      </Panel>
    );
  }
  return (
    <Panel tone="accent" strong testID={`stage-block-${block.id}`}>
      <BlockTitle text={`🔒 ${name}`} />
      <Text style={styles.why}>{str(block.props.why, 200)}</Text>
      {[...fields, ...limits].map((field) => (
        <SecretInput
          key={field.key}
          field={field}
          editable={state.status === "editing"}
          onChange={setValue}
        />
      ))}
      <Text style={styles.note}>{t("show.secret.note")}</Text>
      {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      <View style={styles.buttons}>
        <Pressable
          testID="secret-decline"
          onPress={decline}
          accessibilityRole="button"
          style={styles.button}
        >
          <Text style={styles.buttonText}>{t("show.secret.notNow")}</Text>
        </Pressable>
        <Pressable
          testID="secret-save"
          onPress={save}
          accessibilityRole="button"
          style={[styles.button, styles.buttonPrimary]}
        >
          <Text style={styles.buttonTextPrimary}>
            {state.status === "saving" ? t("show.secret.saving") : t("show.secret.save")}
          </Text>
        </Pressable>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create((theme) => ({
  why: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
    marginBottom: theme.spacing[2],
  },
  field: {
    marginTop: theme.spacing[3],
  },
  label: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.medium,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing[1],
  },
  input: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
  },
  note: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[4],
  },
  error: {
    color: theme.colors.destructive,
    fontFamily: STAGE_FONT.medium,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[2],
  },
  buttons: {
    flexDirection: "row",
    gap: theme.spacing[3],
    marginTop: theme.spacing[3],
  },
  button: {
    flex: 1,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    paddingVertical: theme.spacing[3],
    alignItems: "center",
  },
  buttonPrimary: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  buttonText: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
  },
  buttonTextPrimary: {
    color: theme.colors.accentForeground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
  },
}));
