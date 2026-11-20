// Owner: A (Arvind)
// Export a reconstructed layout (the final placements of one run, any algorithm) as a picture, a vector drawing, a
// PDF report or data. Everything is built in the browser from the run and the fragment images already on screen;
// no server call and no library. The pure builders (layout box, SVG, PDF, JSON, CSV) are unit-tested; the canvas
// and download parts are thin wrappers around them.
import type { RunDetail } from "../api/types";
import { toCsv } from "./csv";
import type { ReplayTile } from "./replay";
import { ALGORITHM_INFO } from "./solvers";

export type ExportFormat = "png" | "svg" | "pdf" | "json" | "csv";

export interface ExportInput {
  run: RunDetail;
  artifactName: string;
  /** The layout to export (the run's final placements). */
  tiles: readonly ReplayTile[];
  fragments: readonly { label: string; image_url: string }[];
}

export const FORMAT_INFO: readonly { key: ExportFormat; label: string; hint: string; ext: string; mime: string }[] = [
  { key: "png", label: "Image (PNG)", hint: "The assembled picture, ready to share", ext: "png", mime: "image/png" },
  { key: "svg", label: "Vector (SVG)", hint: "Sharp at any size, editable", ext: "svg", mime: "image/svg+xml" },
  { key: "pdf", label: "PDF report", hint: "Picture, scores and placement table", ext: "pdf", mime: "application/pdf" },
  { key: "json", label: "Data (JSON)", hint: "Scores, counters and placements", ext: "json", mime: "application/json" },
  { key: "csv", label: "Table (CSV)", hint: "One row per placed fragment", ext: "csv", mime: "text/csv" },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artifact";

/** `relicx-mosaic-tile-greedy-2026-11-20.png` */
export const exportFileName = (artifactName: string, algorithm: string, ext: string, now = new Date()) =>
  `relicx-${slug(artifactName)}-${slug(algorithm)}-${now.toISOString().slice(0, 10)}.${ext}`;

export const algorithmLabel = (key: string) => ALGORITHM_INFO.find((a) => a.key === key)?.label ?? key;
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(1)}%`);

// ---- layout ---------------------------------------------------------------------------------
export interface LayoutBox {
  minRow: number;
  minCol: number;
  rows: number;
  cols: number;
}

export function layoutBox(tiles: readonly ReplayTile[]): LayoutBox {
  if (tiles.length === 0) return { minRow: 0, minCol: 0, rows: 0, cols: 0 };
  const rows = tiles.map((t) => t.row);
  const cols = tiles.map((t) => t.col);
  const minRow = Math.min(...rows);
  const minCol = Math.min(...cols);
  return { minRow, minCol, rows: Math.max(...rows) - minRow + 1, cols: Math.max(...cols) - minCol + 1 };
}

const PAD = 24;
const CAPTION = 56;
const PAPER = "#efe3c4";
const INK = "#221c15";

export function captionOf(input: ExportInput): { title: string; detail: string } {
  const { run, artifactName } = input;
  return {
    title: `${artifactName} · ${algorithmLabel(run.algorithm)}`,
    detail: `score ${run.total_score.toFixed(3)} · neighbour ${pct(run.neighbour_accuracy)} · direct ${pct(
      run.direct_accuracy,
    )} · ${input.tiles.length} placed · ${run.elapsed_ms} ms`,
  };
}

/** Font size that keeps `chars` characters inside `width`, never above `base` (glyph width ≈ factor × size). */
export const fitFont = (chars: number, width: number, base: number, factor: number) =>
  Math.max(8, Math.min(base, Math.floor(width / (chars * factor))));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- SVG ------------------------------------------------------------------------------------
/** `uris` maps a fragment label to a data: URI of its picture; a missing one is drawn as an empty labelled tile. */
export function buildSvg(input: ExportInput, uris: ReadonlyMap<string, string>, cell: number): string {
  const box = layoutBox(input.tiles);
  const w = box.cols * cell + PAD * 2;
  const h = box.rows * cell + PAD * 2 + CAPTION;
  const cap = captionOf(input);
  const tiles = input.tiles
    .map((t) => {
      const x = PAD + (t.col - box.minCol) * cell;
      const y = PAD + (t.row - box.minRow) * cell;
      const turn = t.rot * 90;
      const uri = uris.get(t.label);
      const inner = uri
        ? `<image href="${uri}" width="${cell}" height="${cell}" preserveAspectRatio="xMidYMid slice"/>`
        : `<rect width="${cell}" height="${cell}" fill="#d9c79d"/><text x="${cell / 2}" y="${cell / 2}" text-anchor="middle" font-size="${cell / 5}" fill="${INK}">${esc(t.label)}</text>`;
      return `<g transform="translate(${x} ${y}) rotate(${turn} ${cell / 2} ${cell / 2})" data-label="${esc(t.label)}">${inner}</g><rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="none" stroke="${INK}" stroke-opacity=".35"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(cap.title)}">
<title>${esc(cap.title)}</title>
<rect width="${w}" height="${h}" fill="${PAPER}"/>
${tiles}
<text x="${PAD}" y="${h - CAPTION + 22}" font-family="Georgia, serif" font-size="${fitFont(cap.title.length, w - PAD * 2, 20, 0.58)}" font-weight="bold" fill="${INK}">${esc(cap.title)}</text>
<text x="${PAD}" y="${h - CAPTION + 42}" font-family="monospace" font-size="${fitFont(cap.detail.length, w - PAD * 2, 12, 0.62)}" fill="${INK}" fill-opacity=".75">${esc(cap.detail)}</text>
</svg>
`;
}

// ---- JSON / CSV -----------------------------------------------------------------------------
export function buildJson(input: ExportInput, now = new Date()): string {
  const { run } = input;
  return JSON.stringify(
    {
      app: "RELIC-X",
      exported_at: now.toISOString(),
      artifact: input.artifactName,
      run: {
        id: run.id,
        algorithm: run.algorithm,
        total_score: run.total_score,
        neighbour_accuracy: run.neighbour_accuracy,
        direct_accuracy: run.direct_accuracy,
        coverage: run.coverage,
        elapsed_ms: run.elapsed_ms,
        truncated: run.truncated,
        operations: run.operations,
        meta: run.meta,
      },
      placements: input.tiles.map((t) => ({
        label: t.label,
        row: t.row,
        col: t.col,
        rotation_degrees: t.rot * 90,
      })),
    },
    null,
    2,
  );
}

export const PLACEMENT_COLUMNS = ["label", "row", "col", "rotation_degrees"] as const;
export const buildCsv = (input: ExportInput): string =>
  toCsv(
    input.tiles.map((t) => ({ label: t.label, row: t.row, col: t.col, rotation_degrees: t.rot * 90 })),
    PLACEMENT_COLUMNS,
  );

// ---- PDF ------------------------------------------------------------------------------------
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;

/** Text for a standard PDF font: Latin-1 only, so anything else becomes `?` (or a plain dash). */
export const pdfText = (s: string) =>
  s
    .replace(/[‒-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^ -~\u00a1-\u00ff]/g, (c) => (c === "\u00a0" ? " " : "?"))
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

export interface PdfImage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** A small PDF: page 1 has the title, the picture and the summary; the placement table flows over further pages. */
export function buildPdf(input: ExportInput, image: PdfImage | null, now = new Date()): Uint8Array {
  const cap = captionOf(input);
  const { run } = input;
  const pages: string[][] = [[]];
  let y = PAGE_H - MARGIN;
  const cur = () => pages[pages.length - 1]!;
  const text = (s: string, size: number, font: "F1" | "F2", x = MARGIN) => {
    cur().push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(s)}) Tj ET`);
  };
  const newPage = () => {
    pages.push([]);
    y = PAGE_H - MARGIN;
  };

  text("RELIC-X · reconstruction report", 10, "F1");
  y -= 26;
  text(cap.title, 20, "F2");
  y -= 18;
  text(cap.detail, 9, "F1");
  y -= 14;

  let imageDraw = "";
  if (image) {
    const maxW = PAGE_W - MARGIN * 2;
    const maxH = 400;
    const k = Math.min(maxW / image.width, maxH / image.height);
    const w = image.width * k;
    const h = image.height * k;
    const x = (PAGE_W - w) / 2;
    y -= h + 6;
    imageDraw = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q`;
    cur().push(imageDraw);
    y -= 22;
  }

  const facts: [string, string][] = [
    ["Algorithm", algorithmLabel(run.algorithm)],
    ["Total score", run.total_score.toFixed(3)],
    ["Neighbour accuracy", pct(run.neighbour_accuracy)],
    ["Direct accuracy", pct(run.direct_accuracy)],
    ["Coverage", pct(run.coverage)],
    ["Elapsed", `${run.elapsed_ms} ms`],
    ["Run", run.id],
    ["Exported", now.toISOString().slice(0, 16).replace("T", " ") + " UTC"],
  ];
  if (run.truncated) facts.push(["Note", "Truncated: best layout found, not guaranteed optimal"]);
  for (const [k, v] of facts) {
    text(`${k}:`, 9, "F2");
    text(v, 9, "F1", MARGIN + 110);
    y -= 13;
  }

  y -= 10;
  const header = () => {
    text("Fragment", 9, "F2");
    text("Row", 9, "F2", MARGIN + 150);
    text("Column", 9, "F2", MARGIN + 210);
    text("Rotation", 9, "F2", MARGIN + 290);
    y -= 13;
  };
  header();
  for (const t of input.tiles) {
    if (y < MARGIN + 10) {
      newPage();
      header();
    }
    text(t.label, 9, "F1");
    text(String(t.row), 9, "F1", MARGIN + 150);
    text(String(t.col), 9, "F1", MARGIN + 210);
    text(`${t.rot * 90} deg clockwise`, 9, "F1", MARGIN + 290);
    y -= 12;
  }

  // Objects: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, 5 image (if any), then a page + content per page.
  const hasImg = image !== null;
  const firstPageObj = hasImg ? 6 : 5;
  const objs: (Uint8Array | string)[] = [];
  const set = (n: number, body: Uint8Array | string) => (objs[n - 1] = body);
  const kids = pages.map((_, i) => `${firstPageObj + i * 2} 0 R`).join(" ");
  set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  set(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const streams: Uint8Array[] = [];
  if (image) {
    const head = `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.length} >>\nstream\n`;
    streams[5] = concat([latin1(head), image.jpeg, latin1("\nendstream")]);
    set(5, streams[5]);
  }
  pages.forEach((ops, i) => {
    const pageNo = firstPageObj + i * 2;
    const content = ops.join("\n");
    const xobj = hasImg && i === 0 ? " /XObject << /Im1 5 0 R >>" : "";
    set(
      pageNo,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobj} >> /Contents ${pageNo + 1} 0 R >>`,
    );
    set(pageNo + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  const chunks: Uint8Array[] = [latin1("%PDF-1.4\n")];
  const offsets: number[] = [];
  let pos = chunks[0]!.length;
  objs.forEach((body, i) => {
    offsets.push(pos);
    const piece = concat([
      latin1(`${i + 1} 0 obj\n`),
      typeof body === "string" ? latin1(body) : body,
      latin1("\nendobj\n"),
    ]);
    chunks.push(piece);
    pos += piece.length;
  });
  const xref =
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  chunks.push(latin1(xref));
  return concat(chunks);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---- browser side: images, canvas, download --------------------------------------------------
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadAll(input: ExportInput) {
  const url = new Map(input.fragments.map((f) => [f.label, f.image_url]));
  const entries = await Promise.all(
    input.tiles.map(async (t) => [t.label, url.has(t.label) ? await loadImage(url.get(t.label)!) : null] as const),
  );
  return new Map(entries);
}

/** Cell edge in pixels: the fragment's own size, kept between 96 and 256 so files stay a sensible size. */
function cellSize(images: Map<string, HTMLImageElement | null>): number {
  const first = [...images.values()].find((i) => i);
  const natural = first ? Math.max(first.naturalWidth, first.naturalHeight) : 160;
  return Math.max(96, Math.min(256, natural || 160));
}

function drawCanvas(input: ExportInput, images: Map<string, HTMLImageElement | null>, cell: number) {
  const box = layoutBox(input.tiles);
  const canvas = document.createElement("canvas");
  canvas.width = box.cols * cell + PAD * 2;
  canvas.height = box.rows * cell + PAD * 2 + CAPTION;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the image.");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const t of input.tiles) {
    const x = PAD + (t.col - box.minCol) * cell;
    const y = PAD + (t.row - box.minRow) * cell;
    ctx.save();
    ctx.translate(x + cell / 2, y + cell / 2);
    ctx.rotate((t.rot * Math.PI) / 2);
    const img = images.get(t.label);
    if (img) ctx.drawImage(img, -cell / 2, -cell / 2, cell, cell);
    else {
      ctx.fillStyle = "#d9c79d";
      ctx.fillRect(-cell / 2, -cell / 2, cell, cell);
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.fillText(t.label, 0, 0);
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(34,28,21,.35)";
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
  }
  const cap = captionOf(input);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.font = `bold ${fitFont(cap.title.length, canvas.width - PAD * 2, 20, 0.58)}px Georgia, serif`;
  ctx.fillText(cap.title, PAD, canvas.height - CAPTION + 24);
  ctx.globalAlpha = 0.75;
  ctx.font = `${fitFont(cap.detail.length, canvas.width - PAD * 2, 12, 0.62)}px monospace`;
  ctx.fillText(cap.detail, PAD, canvas.height - CAPTION + 44);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image could not be created."))), type, quality),
  );

const dataUri = (img: HTMLImageElement, cell: number) => {
  const c = document.createElement("canvas");
  c.width = c.height = cell;
  c.getContext("2d")?.drawImage(img, 0, 0, cell, cell);
  return c.toDataURL("image/png");
};

/** Saves a Blob as a file: object URL → click → revoke. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Builds the file for one format and downloads it; resolves with the file name. */
export async function exportRun(input: ExportInput, format: ExportFormat): Promise<string> {
  if (input.tiles.length === 0) throw new Error("There is nothing to export: this run placed no fragments.");
  const info = FORMAT_INFO.find((f) => f.key === format)!;
  const fileName = exportFileName(input.artifactName, input.run.algorithm, info.ext);
  let blob: Blob;
  if (format === "json") blob = new Blob([buildJson(input)], { type: info.mime });
  else if (format === "csv") blob = new Blob([buildCsv(input)], { type: `${info.mime};charset=utf-8` });
  else {
    const images = await loadAll(input);
    const cell = cellSize(images);
    if (format === "svg") {
      const uris = new Map<string, string>();
      for (const [label, img] of images) if (img) uris.set(label, dataUri(img, cell));
      blob = new Blob([buildSvg(input, uris, cell)], { type: info.mime });
    } else if (format === "png") {
      blob = await toBlob(drawCanvas(input, images, cell), info.mime);
    } else {
      const canvas = drawCanvas(input, images, cell);
      const jpeg = await toBlob(canvas, "image/jpeg", 0.92);
      const bytes = new Uint8Array(await jpeg.arrayBuffer());
      blob = new Blob(
        [buildPdf(input, { jpeg: bytes, width: canvas.width, height: canvas.height }).buffer as ArrayBuffer],
        {
          type: info.mime,
        },
      );
    }
  }
  saveBlob(blob, fileName);
  return fileName;
}
