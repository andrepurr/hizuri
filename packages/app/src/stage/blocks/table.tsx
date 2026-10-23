import { useEffect, useMemo, useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { type StageBlockNode, uniqueKeys } from "../model";
import { blockEntering } from "../motion";
import { useStagePalette, withAlpha } from "../palette";
import { STAGE_FONT } from "../type";
import { BlockTitle, Panel, arr, str } from "./primitives";

// show_table drawn natively: rows rise one after another, and when Zuri re-sends the table only
// the cells whose text changed flash. Wide tables scroll sideways inside their panel.

const ROW_STAGGER_MS = 45;
const MAX_STAGGERED_ROWS = 12;
const COLUMN_WIDTH = 120;

function Cell({ text, wide, first }: { text: string; wide: boolean; first: boolean }) {
  const palette = useStagePalette();
  const reduceMotion = useReducedMotion();
  const flash = useSharedValue(0);
  const shownRef = useRef(text);
  useEffect(() => {
    if (shownRef.current === text) return;
    shownRef.current = text;
    if (reduceMotion) return;
    flash.value = withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 900 }));
  }, [text, flash, reduceMotion]);
  const accent = withAlpha(palette.accent, 0.35);
  const flashStyle = useAnimatedStyle(() => ({
    backgroundColor: accent,
    opacity: flash.value,
  }));
  return (
    <View style={[styles.cell, wide ? styles.cellWide : styles.cellFlex]}>
      <Animated.View style={[styles.flash, flashStyle]} pointerEvents="none" />
      <Text style={first ? styles.cellFirst : styles.cellText} numberOfLines={3}>
        {text}
      </Text>
    </View>
  );
}

function Row({
  cells,
  columnKeys,
  wide,
  index,
  animate,
}: {
  cells: string[];
  columnKeys: string[];
  wide: boolean;
  index: number;
  animate: boolean;
}) {
  const entering = useMemo(
    () =>
      animate
        ? blockEntering("rise", Math.min(index, MAX_STAGGERED_ROWS) * ROW_STAGGER_MS)
        : undefined,
    [animate, index],
  );
  return (
    <Animated.View entering={entering} style={[styles.row, index % 2 === 1 ? styles.rowOdd : null]}>
      {columnKeys.map((key, column) => (
        <Cell key={key} text={cells[column] ?? ""} wide={wide} first={column === 0} />
      ))}
    </Animated.View>
  );
}

export function TableBlock({ block, animate }: { block: StageBlockNode; animate: boolean }) {
  const { props } = block;
  const columns = useMemo(
    () => arr(props.columns).map((column) => str(column, 80)),
    [props.columns],
  );
  const rows = useMemo(
    () => arr(props.rows).map((row) => arr(row).map((cell) => str(cell, 400))),
    [props.rows],
  );
  const columnKeys = useMemo(() => uniqueKeys(columns), [columns]);
  const rowKeys = useMemo(() => uniqueKeys(rows.map((row) => row[0] ?? "")), [rows]);
  const wide = columns.length > 3;
  const widthStyle = useMemo(
    () => (wide ? { width: columns.length * COLUMN_WIDTH } : null),
    [wide, columns.length],
  );
  const body = (
    <View style={[styles.table, widthStyle]}>
      <View style={styles.headRow}>
        {columnKeys.map((key, column) => (
          <Text key={key} style={[styles.head, wide ? styles.cellWide : styles.cellFlex]}>
            {columns[column]}
          </Text>
        ))}
      </View>
      {rows.map((cells, index) => (
        <Row
          key={rowKeys[index]}
          cells={cells}
          columnKeys={columnKeys}
          wide={wide}
          index={index}
          animate={animate}
        />
      ))}
    </View>
  );
  return (
    <Panel testID={`stage-block-${block.id}`}>
      <BlockTitle text={str(props.title, 120)} />
      {wide ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </Panel>
  );
}

const styles = StyleSheet.create((theme) => ({
  table: {
    borderRadius: theme.borderRadius.xl,
    overflow: "hidden",
  },
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: theme.spacing[2],
  },
  head: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.medium,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[2],
  },
  row: {
    flexDirection: "row",
  },
  rowOdd: {
    backgroundColor: theme.colors.surface2,
  },
  cell: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    justifyContent: "center",
  },
  cellFlex: {
    flex: 1,
  },
  cellWide: {
    width: COLUMN_WIDTH,
  },
  flash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cellText: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
    fontVariant: ["tabular-nums"],
  },
  cellFirst: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.medium,
    fontSize: theme.fontSize.base,
  },
}));
