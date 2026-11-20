// Owner: A (Arvind)
// Export builders: layout box, file names, SVG (rotation, placement, escaping), JSON, CSV and a structurally valid PDF.
import { ALGORITHMS } from "../api/types";
import { runFixture } from "../test/fixtures";
import { buildCsv, buildJson, buildPdf, buildSvg, exportFileName, fitFont, layoutBox, pdfText } from "./exportRun";
import type { ExportInput } from "./exportRun";
import { placementTiles } from "./replay";

const make = (algorithm: (typeof ALGORITHMS)[number] = "greedy"): ExportInput => {
  const run = runFixture(algorithm);
  return {
    run,
    artifactName: "Mosaic <tile>",
    tiles: placementTiles(run),
    fragments: run.placements.map((p) => ({ label: p.label, image_url: `/img/${p.label}` })),
  };
};
const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

describe("layoutBox", () => {
  it("is empty without tiles and shifts negative cells to the origin", () => {
    expect(layoutBox([])).toEqual({ minRow: 0, minCol: 0, rows: 0, cols: 0 });
    const t = { step: 0, kind: "place", note: "", score: null } as const;
    expect(
      layoutBox([
        { ...t, label: "a", row: -1, col: 2, rot: 0 },
        { ...t, label: "b", row: 1, col: 3, rot: 1 },
      ]),
    ).toEqual({ minRow: -1, minCol: 2, rows: 3, cols: 2 });
  });
});

describe("fitFont", () => {
  it("shrinks long captions to fit and never exceeds the base size", () => {
    expect(fitFont(10, 1000, 20, 0.6)).toBe(20);
    expect(fitFont(100, 400, 12, 0.62)).toBeLessThan(12);
    expect(fitFont(1000, 100, 12, 0.62)).toBe(8);
  });
});

describe("exportFileName", () => {
  it("slugs the artifact and algorithm and dates the file", () => {
    expect(exportFileName("Mosaic Tile!", "best_first", "pdf", new Date("2026-11-20T10:00:00Z"))).toBe(
      "relicx-mosaic-tile-best-first-2026-11-20.pdf",
    );
  });
});

describe.each(ALGORITHMS)("exports for %s", (algorithm) => {
  const input = make(algorithm);

  it("SVG has one group per tile, rotated by its quarter turns, with the caption escaped", () => {
    const uris = new Map(input.tiles.map((t) => [t.label, "data:image/png;base64,AAAA"]));
    const svg = buildSvg(input, uris, 100);
    expect(svg.match(/data-label=/g)).toHaveLength(input.tiles.length);
    expect(svg).toContain("Mosaic &lt;tile&gt;");
    expect(svg).not.toContain("Mosaic <tile>");
    for (const t of input.tiles) expect(svg).toContain(`rotate(${t.rot * 90} 50 50)" data-label="${t.label}"`);
  });

  it("SVG draws a labelled placeholder when a picture is missing", () => {
    expect(buildSvg(input, new Map(), 100)).toContain(`>${input.tiles[0]!.label}</text>`);
  });

  it("JSON carries the run and every placement", () => {
    const data = JSON.parse(buildJson(input, new Date("2026-11-20T00:00:00Z")));
    expect(data.run.algorithm).toBe(algorithm);
    expect(data.run.total_score).toBe(input.run.total_score);
    expect(data.placements).toHaveLength(input.tiles.length);
    expect(data.placements[0]).toHaveProperty("rotation_degrees");
  });

  it("CSV has a header and one row per tile", () => {
    const lines = buildCsv(input).trim().split("\r\n");
    expect(lines[0]).toBe("label,row,col,rotation_degrees");
    expect(lines).toHaveLength(input.tiles.length + 1);
  });

  it("PDF is a well-formed document with the title, scores and a valid xref", () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = text(buildPdf(input, { jpeg, width: 400, height: 300 }));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/DCTDecode");
    expect(pdf).toContain("Total score:");
    const start = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(start, start + 4)).toBe("xref");
    const offsets = [...pdf.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(pdf.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });
});

describe("buildPdf", () => {
  it("works without a picture and flows a long placement table over several pages", () => {
    const base = make();
    const many = Array.from({ length: 120 }, (_, i) => ({ ...base.tiles[0]!, label: `f${i}`, row: i, col: 0 }));
    const pdf = text(buildPdf({ ...base, tiles: many }, null));
    expect(pdf).not.toContain("/DCTDecode");
    expect(Number(/\/Count (\d+)/.exec(pdf)![1])).toBeGreaterThan(1);
  });

  it("escapes parentheses and turns non-Latin-1 characters into safe text", () => {
    expect(pdfText("a (b) \\ — ✓")).toBe("a \\(b\\) \\\\ - ?");
  });
});
