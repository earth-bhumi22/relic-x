// Owner: A (Arvind)
import { SIDE_LETTERS, sideIndexToLetter, sideLetterToIndex } from "./sides";

describe("side index helpers", () => {
  it("maps 0=N, 1=E, 2=S, 3=W", () => {
    expect([0, 1, 2, 3].map(sideIndexToLetter)).toEqual(["N", "E", "S", "W"]);
    expect(["N", "E", "S", "W"].map(sideLetterToIndex)).toEqual([0, 1, 2, 3]);
  });

  it("round-trips in both directions", () => {
    for (const i of [0, 1, 2, 3] as const) expect(sideLetterToIndex(sideIndexToLetter(i))).toBe(i);
    for (const l of SIDE_LETTERS) expect(sideIndexToLetter(sideLetterToIndex(l))).toBe(l);
  });

  it("rejects out-of-range input", () => {
    expect(() => sideIndexToLetter(4)).toThrow(RangeError);
    expect(() => sideIndexToLetter(-1)).toThrow(RangeError);
    expect(() => sideIndexToLetter(1.5)).toThrow(RangeError);
    expect(() => sideLetterToIndex("X")).toThrow(RangeError);
    expect(() => sideLetterToIndex("n")).toThrow(RangeError);
  });
});
