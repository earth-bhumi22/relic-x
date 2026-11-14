// Owner: A (Arvind)
// CSV: RFC 4180 quoting, null → empty, formula-injection guard, stable columns, file names, and the download itself.
import type { RunDetail, ScalingOut } from "../api/types";
import { runFixture } from "../test/fixtures";
import real from "../test/lab-real.json";
import {
  BENCHMARK_COLUMNS,
  CSV_SOURCE,
  SCALING_COLUMNS,
  benchmarkCsvRows,
  benchmarkFileName,
  csvCell,
  downloadCsv,
  saveText,
  scalingCsvRows,
  scalingFileName,
  toCsv,
} from "./csv";

describe("csvCell", () => {
  it("quotes commas, quotes and newlines (RFC 4180)", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell("cr\rlf")).toBe('"cr\rlf"');
    expect(csvCell("plain")).toBe("plain");
  });
  it("writes null / undefined as an empty cell and booleans in lower case", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(false)).toBe("false");
  });
  it("keeps numbers as numbers, negative ones included (they are not formulas)", () => {
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(0.25)).toBe("0.25");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe("");
  });
  it.each(["=SUM(A1)", "+1+1", "-2+3", "@cmd", "\tx", "\rx"])("defuses a formula-looking cell: %j", (text) => {
    const out = csvCell(text);
    expect(out.replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("does not prefix text that merely contains those characters later", () => {
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("F-01")).toBe("F-01");
  });
  it("prefixes before quoting, so a formula with a comma stays one safe cell", () => {
    expect(csvCell("=HYPERLINK(a,b)")).toBe('"\'=HYPERLINK(a,b)"');
  });
});

describe("toCsv", () => {
  it("writes the header in the given order, then rows, with CRLF endings", () => {
    const csv = toCsv([{ b: 2, a: "x,y" }, { a: "z" }], ["a", "b"]);
    expect(csv).toBe('a,b\r\n"x,y",2\r\nz,\r\n');
  });
  it("ignores keys that are not columns", () => {
    expect(toCsv([{ a: 1, secret: "no" }], ["a"])).toBe("a\r\n1\r\n");
  });
  it("is just a header for no rows", () => {
    expect(toCsv([], ["a", "b"])).toBe("a,b\r\n");
  });
});

describe("benchmark and scaling datasets", () => {
  const runs = real.benchmark as unknown as RunDetail[];
  const scaling = real.scaling as unknown as ScalingOut;

  it("benchmark columns are stable (and match the server CSV of T21)", () => {
    expect(BENCHMARK_COLUMNS.join(",")).toBe(
      "algorithm,run_id,created_at,elapsed_ms,operations_total,total_score,neighbour_accuracy,direct_accuracy,coverage,truncated,search_nodes,conflicts,node_limit,threshold,top_k",
    );
    const rows = benchmarkCsvRows(runs);
    expect(rows).toHaveLength(4);
    expect(rows[2].operations_total).toBe(40); // dijkstra: 10 + 24 + 6, the SUM of its counters
    expect(rows[3].search_nodes).toBe(194);
    expect(rows[0].search_nodes).toBeNull();
    expect(rows[0].node_limit).toBe(2000);
    const csv = toCsv(rows, BENCHMARK_COLUMNS);
    expect(csv.split("\r\n")[0]).toBe(BENCHMARK_COLUMNS.join(","));
    expect(csv.split("\r\n")).toHaveLength(6);
  });

  it("null accuracies become empty cells", () => {
    const run = { ...runFixture("greedy"), neighbour_accuracy: null, direct_accuracy: null } as RunDetail;
    const line = toCsv(benchmarkCsvRows([run]), BENCHMARK_COLUMNS)
      .split("\r\n")[1]
      .split(",");
    expect(line[BENCHMARK_COLUMNS.indexOf("neighbour_accuracy")]).toBe("");
    expect(line[BENCHMARK_COLUMNS.indexOf("direct_accuracy")]).toBe("");
  });

  it("scaling: one row per (size, algorithm) with the numeric operations; skipped algorithms have no row", () => {
    expect(SCALING_COLUMNS.join(",")).toBe(
      "size,n,algorithm,elapsed_ms,operations,total_score,neighbour_accuracy,direct_accuracy,coverage,truncated,match_accuracy,match_elapsed_ms",
    );
    const rows = scalingCsvRows(scaling);
    expect(rows).toHaveLength(16);
    expect(rows.find((r) => r.n === 25 && r.algorithm === "backtracking")).toMatchObject({
      operations: 150197,
      truncated: true,
    });
    const gap = structuredClone(scaling);
    delete gap.points[0].runs.dijkstra;
    expect(scalingCsvRows(gap)).toHaveLength(15);
  });

  it("a hostile algorithm or label cannot become a formula", () => {
    const run = { ...runFixture("greedy"), algorithm: "=cmd|' /C calc'!A0" } as unknown as RunDetail;
    const csv = toCsv(benchmarkCsvRows([run]), BENCHMARK_COLUMNS);
    expect(csv.split("\r\n")[1].startsWith("'=cmd")).toBe(true);
  });
});

describe("file names", () => {
  const day = new Date("2026-11-14T10:00:00Z");
  it("include the artifact or sample and the date", () => {
    expect(benchmarkFileName("Mughal tile panel", day)).toBe("relicx-benchmark-mughal-tile-panel-2026-11-14.csv");
    expect(scalingFileName("mosaic-tile", false, day)).toBe("relicx-scaling-mosaic-tile-2026-11-14.csv");
    expect(scalingFileName("mosaic-tile", true, day)).toBe("relicx-scaling-mosaic-tile-rotated-2026-11-14.csv");
  });
  it("cleans awkward names", () => {
    expect(benchmarkFileName("../../etc/passwd; rm -rf", day)).toBe("relicx-benchmark-etc-passwd-rm-rf-2026-11-14.csv");
    expect(benchmarkFileName("???", day)).toBe("relicx-benchmark-artifact-2026-11-14.csv");
  });
});

const readBlob = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });

describe("download", () => {
  let created: Blob[];
  let click: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    created = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return "blob:test";
    });
    URL.revokeObjectURL = vi.fn();
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}) as unknown as ReturnType<
      typeof vi.fn
    >;
  });
  afterEach(() => vi.useRealTimers());

  it("saveText creates an object URL, clicks a download link and revokes the URL afterwards", () => {
    saveText("a,b\r\n", "x.csv");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(created[0].type).toBe("text/csv;charset=utf-8");
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a[download]")).toBeNull(); // the link is removed again
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("downloadCsv (client source) builds the file from the data and names it", async () => {
    const name = await downloadCsv({
      kind: "benchmark",
      artifact: { id: "a1", name: "Mughal tile panel" },
      runs: real.benchmark as unknown as RunDetail[],
      now: new Date("2026-11-14T00:00:00Z"),
    });
    expect(name).toBe("relicx-benchmark-mughal-tile-panel-2026-11-14.csv");
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    vi.useRealTimers(); // FileReader needs real timers
    expect(await readBlob(created[0])).toContain("algorithm,run_id,created_at");
  });

  it("downloadCsv names a rotated scaling export", async () => {
    const result = { ...(real.scaling as unknown as ScalingOut), rotate: true };
    const name = await downloadCsv({ kind: "scaling", request: {}, result, now: new Date("2026-11-14T00:00:00Z") });
    expect(name).toBe("relicx-scaling-mosaic-tile-rotated-2026-11-14.csv");
  });

  it("is client-side today: the T21 endpoints are not called unless the switch is flipped", () => {
    expect(CSV_SOURCE).toEqual({ benchmark: "client", scaling: "client" });
  });

  it("server source fetches the T21 endpoint instead (one-line switch)", async () => {
    vi.useRealTimers();
    vi.stubEnv("VITE_USE_MOCKS", "false");
    const fetchMock = vi.fn(
      async () =>
        new Response("size,n\r\n", { status: 200, headers: { "Content-Disposition": 'attachment; filename="x.csv"' } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await downloadCsv(
      { kind: "benchmark", artifact: { id: "abc", name: "A" }, runs: [], now: new Date("2026-11-14T00:00:00Z") },
      "server",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain("/artifacts/abc/benchmark.csv");
    await downloadCsv(
      { kind: "scaling", request: { sizes: [2] }, result: real.scaling as unknown as ScalingOut },
      "server",
    );
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toContain("/benchmark/scaling.csv");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ sizes: [2] });
  });

  it("server source surfaces an API error", async () => {
    vi.useRealTimers();
    vi.stubEnv("VITE_USE_MOCKS", "false");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "precondition_failed", message: "no runs yet" } }), {
            status: 409,
          }),
      ),
    );
    await expect(
      downloadCsv({ kind: "benchmark", artifact: { id: "abc", name: "A" }, runs: [] }, "server"),
    ).rejects.toMatchObject({ status: 409, code: "precondition_failed" });
  });
});
