import { describe, expect, it } from "vitest";
import { isEmoji, leadingMark } from "./emoji";

describe("leadingMark", () => {
  it("reads a status emoji as the tone it meant and drops it from the title", () => {
    expect(leadingMark("🟢 Ours is better")).toEqual({
      tone: "success",
      emoji: "🟢",
      text: "Ours is better",
    });
    expect(leadingMark("🔴 Ours is worse").tone).toBe("danger");
    expect(leadingMark("⚠️ Careful").tone).toBe("warning");
  });

  it("drops any other emoji, flags and joined sequences included, without a tone", () => {
    expect(leadingMark("🇺🇸 NIST")).toEqual({ tone: null, emoji: "🇺🇸", text: "NIST" });
    expect(leadingMark("👩‍💻 Working with agents").text).toBe("Working with agents");
  });

  it("leaves plain text alone", () => {
    expect(leadingMark("$90M round")).toEqual({ tone: null, emoji: "", text: "$90M round" });
  });
});

describe("isEmoji", () => {
  it("tells an old emoji icon from an icon name", () => {
    expect(isEmoji("🗒️")).toBe(true);
    expect(isEmoji("mic")).toBe(false);
    expect(isEmoji("")).toBe(false);
  });
});
