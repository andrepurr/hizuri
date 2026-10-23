import { type ReactNode } from "react";
import type { StageTab } from "@getpaseo/protocol/stage";
import type { ShowTabSwitcher } from "@/hooks/use-settings";
import { TabCapsule } from "./capsule";
import type { CardsControl } from "./cards-control";
import { DeckPinch, TabDeckChip } from "./deck";
import { InsideDots, InsideSwipe } from "./inside";
import type { TabKind } from "./model";
import { TabRail } from "./rail";
import type { TabTrack } from "./track";

// The switcher picked in Settings → Appearance → Show. Each one draws its chrome over the tab
// track; the Deck and Swipe inside also take gestures on the tab itself.

export interface SwitcherChromeProps {
  switcher: ShowTabSwitcher;
  track: TabTrack;
  tabs: readonly StageTab[];
  visibleId: string | null;
  tabTitle: (title: string) => string;
  /** Below the header. */
  top: number;
  /** The phone's own bottom bar. */
  bottomInset: number;
  cards: CardsControl;
}

export function TabSwitcherChrome(props: SwitcherChromeProps) {
  const { switcher, track, tabs, visibleId, tabTitle, top, bottomInset, cards } = props;
  switch (switcher) {
    case "capsule":
      return (
        <TabCapsule
          track={track}
          tabs={tabs}
          tabTitle={tabTitle}
          bottomInset={bottomInset}
          cards={cards}
        />
      );
    case "deck":
      return (
        <TabDeckChip
          track={track}
          tabs={tabs}
          visibleId={visibleId}
          tabTitle={tabTitle}
          bottomInset={bottomInset}
          cards={cards}
        />
      );
    case "rail":
      return (
        <TabRail
          track={track}
          tabs={tabs}
          visibleId={visibleId}
          tabTitle={tabTitle}
          top={top}
          bottomInset={bottomInset}
        />
      );
    case "inside":
      return <InsideDots track={track} tabs={tabs} bottomInset={bottomInset} />;
  }
}

/** The switcher's gestures on the tab itself, around the track and the player. */
export function TabSwitcherContent({
  switcher,
  track,
  cards,
  visibleKind,
  children,
}: {
  switcher: ShowTabSwitcher;
  track: TabTrack;
  cards: CardsControl;
  visibleKind: TabKind | null;
  children: ReactNode;
}) {
  if (switcher === "inside") return <InsideSwipe track={track}>{children}</InsideSwipe>;
  if (switcher === "deck") {
    return (
      <DeckPinch track={track} cards={cards} enabled={visibleKind === "blocks"}>
        {children}
      </DeckPinch>
    );
  }
  return children;
}

/** The capsule and the deck show all tabs as cards; the rail and swipe inside have none. */
export function switcherHasCards(switcher: ShowTabSwitcher): boolean {
  return switcher === "capsule" || switcher === "deck";
}
