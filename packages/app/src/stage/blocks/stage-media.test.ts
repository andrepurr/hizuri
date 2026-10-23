import { describe, expect, it } from "vitest";
import {
  daemonOrigin,
  resolveStageMediaUrl,
  SLIDE_DRIVER_JS,
  slideCommand,
  stagePageDocument,
} from "./stage-media";

const HASH = "a".repeat(64);

describe("show_file media in the app", () => {
  it("names the daemon's files on its own origin, keeps https links, refuses the rest", () => {
    const origin = daemonOrigin("192.0.2.1:6768", false);
    expect(origin).toBe("http://192.0.2.1:6768");
    expect(resolveStageMediaUrl(`/stage-media/${HASH}.png`, origin)).toBe(
      `http://192.0.2.1:6768/stage-media/${HASH}.png`,
    );
    expect(resolveStageMediaUrl("https://example.com/a.mp4", null)).toBe(
      "https://example.com/a.mp4",
    );
    expect(resolveStageMediaUrl(`/stage-media/${HASH}.png`, null)).toBeNull();
    expect(resolveStageMediaUrl("http://example.com/a.png", origin)).toBeNull();
    expect(resolveStageMediaUrl("javascript:alert(1)", origin)).toBeNull();
    expect(daemonOrigin("127.0.0.1:6768", false)).toBe("http://localhost:6768");
  });
});

describe("a page in the sandbox", () => {
  const page =
    '<!doctype html><html lang="en" data-mode="auto"><head>' +
    '<meta http-equiv="Content-Security-Policy" content="script-src \'sha256-x\'">' +
    "</head><body><script>localStorage.getItem('k')</script></body></html>";

  it("puts the no-network policy first, then the storage stand-in, then the page whole", () => {
    const document = stagePageDocument(page, { reportZoom: true });
    const policy = document.indexOf("default-src 'none'");
    const shim = document.indexOf('localStorage","sessionStorage"');
    const zoom = document.indexOf("visualViewport");
    const own = document.indexOf("sha256-x");
    expect(document.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"')).toBe(
      true,
    );
    expect(document).toContain("connect-src 'none'");
    expect(policy).toBeGreaterThan(0);
    expect(shim).toBeGreaterThan(policy);
    expect(zoom).toBeGreaterThan(shim);
    expect(own).toBeGreaterThan(zoom);
    expect(document.endsWith(page)).toBe(true);
  });

  it("gives a page without a background of its own the system canvas before the page loads", () => {
    const document = stagePageDocument(page, { reportZoom: true });
    const canvas = document.indexOf('d.style.background="Canvas"');
    expect(canvas).toBeGreaterThan(document.indexOf('localStorage","sessionStorage"'));
    expect(canvas).toBeLessThan(document.indexOf("sha256-x"));
  });

  it("leaves the zoom reporter out where nobody listens (web)", () => {
    expect(stagePageDocument(page, { reportZoom: false })).not.toContain("visualViewport");
  });
});

describe("Zuri flips a live page", () => {
  function fakePage(reveal: { ready: boolean } | null) {
    const listeners = new Map<string, (event: { data?: unknown }) => void>();
    const timers: (() => void)[] = [];
    const flips: number[] = [];
    const events: unknown[] = [];
    let h = 0;
    const window: Record<string, unknown> = {
      addEventListener: (type: string, listener: (event: { data?: unknown }) => void) =>
        listeners.set(type, listener),
      dispatchEvent: (event: { detail: unknown }) => events.push(event.detail),
      CustomEvent: class {
        detail: unknown;
        constructor(_type: string, init: { detail: unknown }) {
          this.detail = init.detail;
        }
      },
      setTimeout: (run: () => void) => timers.push(run),
    };
    if (reveal) {
      window.Reveal = {
        isReady: () => reveal.ready,
        getIndices: () => ({ h }),
        slide: (index: number) => {
          flips.push(index);
          h = index;
        },
      };
    }
    new Function("window", SLIDE_DRIVER_JS)(window);
    const flip = (slide: number) =>
      new Function("window", slideCommand(slide).replace(/true;$/, ""))(window);
    const tick = () => timers.splice(0).forEach((run) => run());
    return { window, listeners, flips, events, flip, tick };
  }

  it("moves a ready Reveal deck to the slide, 1-based, and tells any page by an event", () => {
    const page = fakePage({ ready: true });
    page.flip(3);
    expect(page.flips).toEqual([2]);
    expect(page.events).toEqual([{ slide: 3 }]);
    page.flip(3);
    expect(page.flips).toEqual([2]);
  });

  it("waits for a deck that is still starting", () => {
    const reveal = { ready: false };
    const page = fakePage(reveal);
    page.flip(2);
    expect(page.flips).toEqual([]);
    reveal.ready = true;
    page.tick();
    expect(page.flips).toEqual([1]);
  });

  it("takes the flip as a message on web, where the app cannot reach into the frame", () => {
    const page = fakePage({ ready: true });
    page.listeners.get("message")?.({ data: { hizuriSlide: 4 } });
    page.listeners.get("message")?.({ data: "the page's own message" });
    expect(page.flips).toEqual([3]);
  });

  it("sits in the page before the page's own scripts", () => {
    const document = stagePageDocument(
      "<!doctype html><html><body><script>own()</script></body></html>",
      { reportZoom: false },
    );
    expect(document.indexOf("__hizuriSlide")).toBeGreaterThan(0);
    expect(document.indexOf("__hizuriSlide")).toBeLessThan(document.indexOf("own()"));
  });
});
