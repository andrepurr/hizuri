import { type DOMWindow, JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { parseShowPageMessage } from "./bridge";
import { SHOW_PAGE_HTML } from "./page";

describe("parseShowPageMessage", () => {
  it("accepts only the page's own message types", () => {
    expect(parseShowPageMessage('{"type":"show.ready"}')).toEqual({ type: "show.ready" });
    expect(parseShowPageMessage({ type: "show.error", message: "boom" })).toEqual({
      type: "show.error",
      message: "boom",
    });
    expect(parseShowPageMessage({ type: "navigate", url: "https://example.com" })).toBeNull();
    expect(parseShowPageMessage("not json")).toBeNull();
    expect(parseShowPageMessage(null)).toBeNull();
  });
});

describe("SHOW_PAGE_HTML", () => {
  it("cuts all network access and parses as a script", () => {
    expect(SHOW_PAGE_HTML).toContain("default-src 'none'");
    expect(SHOW_PAGE_HTML).not.toMatch(/connect-src|https?:\/\/(?!www\.w3\.org)/);
    const script = /<script>([\s\S]*)<\/script>/.exec(SHOW_PAGE_HTML)?.[1] ?? "";
    expect(() => new Function(script)).not.toThrow();
  });
});

describe("Show page updates", () => {
  type ShowPageWindow = DOMWindow & { __hizuriShow: (message: unknown) => void };

  function loadPage(): ShowPageWindow {
    const dom = new JSDOM(SHOW_PAGE_HTML, { runScripts: "dangerously" });
    return dom.window as unknown as ShowPageWindow;
  }

  function kanban(rows: string[][], title = "Kanban 16:22") {
    return {
      type: "show.render",
      index: 0,
      window: {
        id: "kanban",
        title: "Kanban",
        screen: null,
        widgets: [
          { id: "note", kind: "card", status: "completed", props: { title: "Note", body: "x" } },
          {
            id: "kanban",
            kind: "table",
            status: "completed",
            props: { title, columns: ["#", "Next", "Done"], rows },
          },
        ],
      },
    };
  }

  // Updating a 24-row table must not re-draw it and replay every widget's fade-in.
  it("patches a table in place: same nodes, only the changed cell, nothing re-inserted", () => {
    const page = loadPage();
    const rows = Array.from({ length: 25 }, (_, row) => [String(row), `task ${row}`, "—"]);
    page.__hizuriShow(kanban(rows));
    const doc = page.document;
    const windowEl = doc.querySelector("#stage > .window");
    const cellsBefore = [...doc.querySelectorAll("td")];
    expect(cellsBefore).toHaveLength(75);

    // Widgets put back into the window would replay their fade-in from opacity 0.
    const observer = new page.MutationObserver(() => {});
    observer.observe(windowEl as Node, { childList: true });
    const changed = rows.map((row, index) => (index === 7 ? [row[0]!, row[1]!, "✅"] : row));
    page.__hizuriShow(kanban(changed, "Kanban 16:24"));
    const moved = observer.takeRecords();

    const cellsAfter = [...doc.querySelectorAll("td")];
    expect(cellsAfter).toHaveLength(75);
    cellsAfter.forEach((cell, index) => expect(cell).toBe(cellsBefore[index]));
    expect(cellsAfter[7 * 3 + 2]?.textContent).toBe("✅");
    expect(doc.querySelectorAll(".panel .title")[1]?.textContent).toBe("Kanban 16:24");
    expect(moved).toEqual([]);
  });

  it("grows and trims rows without touching the rows that stay", () => {
    const page = loadPage();
    page.__hizuriShow(kanban([["1", "a", ""]]));
    const first = page.document.querySelector("tbody tr");
    page.__hizuriShow(
      kanban([
        ["1", "a", ""],
        ["2", "b", ""],
      ]),
    );
    expect(page.document.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(page.document.querySelector("tbody tr")).toBe(first);
    page.__hizuriShow(kanban([["1", "a", ""]]));
    expect(page.document.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(page.document.querySelector("tbody tr")).toBe(first);
  });
});
