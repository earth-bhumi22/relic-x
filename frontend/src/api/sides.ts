// Owner: A (Arvind)
// Side numbering (CONTRACT D12): 0=N, 1=E, 2=S, 3=W, clockwise.
// Query parameters and /matches use the integer; /graph and /explain responses use the letter.
export type SideIndex = 0 | 1 | 2 | 3;
export type SideLetter = "N" | "E" | "S" | "W";

export const SIDE_LETTERS: readonly SideLetter[] = ["N", "E", "S", "W"];

export function sideIndexToLetter(index: number): SideLetter {
  const letter = SIDE_LETTERS[index];
  if (!Number.isInteger(index) || letter === undefined) throw new RangeError(`side index must be 0-3, got ${index}`);
  return letter;
}

export function sideLetterToIndex(letter: string): SideIndex {
  const index = SIDE_LETTERS.indexOf(letter as SideLetter);
  if (index < 0) throw new RangeError(`side letter must be one of N, E, S, W, got ${JSON.stringify(letter)}`);
  return index as SideIndex;
}
