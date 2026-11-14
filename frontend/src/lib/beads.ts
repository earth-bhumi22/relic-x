// Owner: A (Arvind)
// Edge-string symbols <-> colours, mirroring backend/src/relicx/engine/features.py exactly.
//
// Backend (`quantize`): every RGB sample (0-255 per channel) is reduced to  q = floor(v * levels / 256)  per channel
// (so q is 0..levels-1) and encoded as  index = (qR * levels + qG) * levels + qB,  symbol = ALPHABET[index].
// Decoding is therefore  qB = index % levels,  qG = floor(index / levels) % levels,  qR = floor(index / levels²).
// A bead shows the CENTRE of the bucket the sample fell into:  channel = (q + 0.5) * 256 / levels
// (levels = 4 -> 32, 96, 160, 224), so the colour on screen is the colour class the matcher actually compared.
export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** Backend default (`MatchParams.levels`); the backend rejects levels whose cube exceeds the alphabet (> 4). */
export const DEFAULT_LEVELS = 4;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Colour of one edge-string symbol, or `null` when it is not in the palette for `levels`. */
export function symbolColor(symbol: string, levels: number = DEFAULT_LEVELS): Rgb | null {
  if (symbol.length !== 1 || !Number.isInteger(levels) || levels < 1 || levels ** 3 > ALPHABET.length) return null;
  const index = ALPHABET.indexOf(symbol);
  if (index < 0 || index >= levels ** 3) return null;
  const centre = (q: number) => Math.round(((q + 0.5) * 256) / levels);
  return {
    r: centre(Math.floor(index / (levels * levels))),
    g: centre(Math.floor(index / levels) % levels),
    b: centre(index % levels),
  };
}

export const rgbCss = ({ r, g, b }: Rgb): string => `rgb(${r}, ${g}, ${b})`;

/** CSS colour for a numeric strip sample `[r, g, b]` (0-255 floats from `FragmentDetail.strips`). */
export function sampleCss(sample: readonly number[]): string {
  const c = (v: number | undefined) => Math.min(255, Math.max(0, Math.round(Number.isFinite(v) ? (v as number) : 0)));
  return `rgb(${c(sample[0])}, ${c(sample[1])}, ${c(sample[2])})`;
}
