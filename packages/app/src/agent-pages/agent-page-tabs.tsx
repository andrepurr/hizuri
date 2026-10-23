import { useCallback } from "react";
import { useTranslation } from "react-i18next";
// oxlint-disable-next-line paseo/no-raw-pressable -- hizuri: these surfaces draw their own press states
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { AGENT_PAGES, type AgentPage } from "./model";

/**
 * True in a wide browser window: there no finger swipes the pages, and a mouse wheel or a
 * two-finger swipe is not something a user guesses, so the pages get buttons on top
 * (plain buttons for screen one, two and three).
 */
export function useAgentPageTabsShown(): boolean {
  const { width } = useWindowDimensions();
  return isWeb && width >= WIDE_MIN_WIDTH;
}

// The "md" breakpoint (styles/unistyles.ts): below it the window is phone-sized.
const WIDE_MIN_WIDTH = 720;

interface AgentPageTabsProps {
  page: AgentPage;
  onSelect: (page: AgentPage) => void;
}

export function AgentPageTabs({ page, onSelect }: AgentPageTabsProps) {
  return (
    <View style={styles.bar} accessibilityRole="tablist" testID="agent-page-tabs">
      {AGENT_PAGES.map((item) => (
        <AgentPageTab key={item} item={item} selected={item === page} onSelect={onSelect} />
      ))}
    </View>
  );
}

function AgentPageTab({
  item,
  selected,
  onSelect,
}: {
  item: AgentPage;
  selected: boolean;
  onSelect: (page: AgentPage) => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onSelect(item), [item, onSelect]);
  return (
    <Pressable
      onPress={handlePress}
      style={selected ? styles.tabSelected : styles.tab}
      accessibilityRole="tab"
      aria-selected={selected}
      testID={`agent-page-tab-${item}`}
    >
      <Text style={selected ? styles.labelSelected : styles.label}>
        {t(`agentPages.tabs.${item}`)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    flexDirection: "row",
    alignSelf: "center",
    gap: theme.spacing[1],
    marginVertical: theme.spacing[2],
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface1,
  },
  tab: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borderRadius.full,
  },
  tabSelected: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  label: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
  },
  labelSelected: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
}));
