// Owner: A (Arvind)
import { ALPHABET, rgbCss, sampleCss, symbolColor } from "./beads";
import { hashSeed, seededShuffle } from "./shuffle";

// Pairs produced by the backend itself: relicx.engine.features.quantize(np.array([rgb]), levels=4)
// (run once from backend/ with the real function; see the T24 PR). A bead must show the centre of the bucket
// the sample fell into, i.e. floor(v / 64) * 64 + 32 per channel.
const BACKEND: [[number, number, number], string][] = [
  [[0, 0, 0], "A"],
  [[10, 20, 30], "A"],
  [[64, 0, 0], "Q"],
  [[70, 130, 200], "b"],
  [[255, 255, 255], "/"],
  [[128, 128, 128], "q"],
  [[200, 40, 250], "z"],
  [[255, 0, 0], "w"],
  [[0, 255, 0], "M"],
  [[0, 0, 255], "D"],
  [[191, 192, 63], "s"],
];
const centre = (v: number) => Math.floor(v / 64) * 64 + 32;

describe("symbolColor (mirrors features.quantize)", () => {
  it.each(BACKEND)("decodes the backend symbol for rgb %j (%s) to its bucket centre", (rgb, symbol) => {
    expect(symbolColor(symbol)).toEqual({ r: centre(rgb[0]), g: centre(rgb[1]), b: centre(rgb[2]) });
  });

  it("covers the 64 symbols with 64 distinct colours and the four-level grid 32/96/160/224", () => {
    const colours = [...ALPHABET].map((s) => rgbCss(symbolColor(s)!));
    expect(new Set(colours).size).toBe(64);
    const channels = new Set([...ALPHABET].flatMap((s) => Object.values(symbolColor(s)!)));
    expect([...channels].sort((a, b) => a - b)).toEqual([32, 96, 160, 224]);
  });

  it("round-trips: encoding a decoded colour with the backend formula returns the same symbol", () => {
    for (const [i, symbol] of [...ALPHABET].entries()) {
      const c = symbolColor(symbol)!;
      const q = (v: number) => Math.min(3, Math.floor((v * 4) / 256));
      expect((q(c.r) * 4 + q(c.g)) * 4 + q(c.b)).toBe(i);
    }
  });

  it("returns null for unknown symbols, multi-character input and impossible levels", () => {
    expect(symbolColor("!")).toBeNull();
    expect(symbolColor("")).toBeNull();
    expect(symbolColor("AB")).toBeNull();
    expect(symbolColor("A", 5)).toBeNull(); // 5³ > 64: the backend rejects it
    expect(symbolColor("A", 0)).toBeNull();
  });

  it("supports fewer levels (levels=2 uses only the first 8 symbols)", () => {
    expect(symbolColor("A", 2)).toEqual({ r: 64, g: 64, b: 64 });
    expect(symbolColor("H", 2)).toEqual({ r: 192, g: 192, b: 192 });
    expect(symbolColor("I", 2)).toBeNull();
  });
});

describe("css helpers", () => {
  it("formats colours and clamps numeric strip samples", () => {
    expect(rgbCss({ r: 1, g: 2, b: 3 })).toBe("rgb(1, 2, 3)");
    expect(sampleCss([10.4, 300, -5])).toBe("rgb(10, 255, 0)");
    expect(sampleCss([Number.NaN])).toBe("rgb(0, 0, 0)");
  });
});

describe("seededShuffle", () => {
  const items = Array.from({ length: 16 }, (_, i) => `F${i + 1}`);
  it("is deterministic per seed, a permutation, and does not mutate its input", () => {
    const a = seededShuffle(items, "artifact-1");
    expect(seededShuffle(items, "artifact-1")).toEqual(a);
    expect([...a].sort()).toEqual([...items].sort());
    expect(items[0]).toBe("F1");
    expect(a).not.toEqual(items);
  });
  it("differs between seeds and handles tiny inputs", () => {
    expect(seededShuffle(items, "x")).not.toEqual(seededShuffle(items, "y"));
    expect(seededShuffle([], "x")).toEqual([]);
    expect(seededShuffle(["only"], "x")).toEqual(["only"]);
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });
});
