import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Ellipsis } from "lucide-react-native";
import {
  EndVoiceSessionMenuItem,
  useEndVoiceSession,
} from "@/components/end-voice-session-menu-item";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  extraMutedIconColorMapping,
  iconButtonChromeGlyphSize,
  iconButtonChromeStyle,
} from "@/components/ui/icon-button-chrome";

const ThemedEllipsis = withUnistyles(Ellipsis);

function triggerStyle(state: { hovered: boolean; pressed: boolean; open: boolean }) {
  return iconButtonChromeStyle({ size: "large", state });
}

/**
 * The only control left at the top of the chat page (nothing up there but what a call screen
 * needs): a quiet “…” with “End session”, the emergency brake that stops the assistant's turn,
 * voice and the saved session at once. It is there only while this chat's agent holds the session.
 */
export function ChatPageMenu({ serverId, agentId }: { serverId: string; agentId: string }) {
  const { t } = useTranslation();
  const endSession = useEndVoiceSession(serverId, agentId);
  if (!endSession) return null;
  return (
    <View style={styles.rail} pointerEvents="box-none">
      <DropdownMenu>
        <DropdownMenuTrigger
          testID="chat-page-menu-trigger"
          style={triggerStyle}
          accessibilityRole="button"
          accessibilityLabel={t("agentPages.sessionMenu")}
        >
          <ThemedEllipsis
            size={iconButtonChromeGlyphSize("large")}
            uniProps={extraMutedIconColorMapping}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" width={220} testID="chat-page-menu">
          <EndVoiceSessionMenuItem onSelect={endSession} separated={false} />
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  rail: {
    position: "absolute",
    top: theme.spacing[2],
    right: theme.spacing[2],
    zIndex: 25,
  },
}));
