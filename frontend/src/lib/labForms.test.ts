// Owner: A (Arvind)
// Lab form validation (pure): bounds match the running API, see labForms.ts.
import {
  BENCH_API_FIELDS,
  DEFAULT_BENCH,
  DEFAULT_SCALING,
  SLOW_NODE_LIMIT,
  apiFieldErrors,
  parseSizes,
  validateBench,
  validateScaling,
} from "./labForms";

describe("validateBench", () => {
  it("accepts the defaults and sends every algorithm with the node limit", () => {
    const v = validateBench(DEFAULT_BENCH);
    expect(v.errors).toEqual({});
    expect(v.request).toEqual({ algorithms: ["greedy", "best_first", "dijkstra", "backtracking"], node_limit: 5000 });
  });
  it("requires at least one algorithm", () => {
    const v = validateBench({ ...DEFAULT_BENCH, algorithms: [] });
    expect(v.errors.algorithms).toMatch(/at least one/i);
    expect(v.request).toBeNull();
  });
  it("only sends node_limit when backtracking is selected, and then does not validate it", () => {
    const v = validateBench({ algorithms: ["greedy"], nodeLimit: "nonsense" });
    expect(v.errors).toEqual({});
    expect(v.request).toEqual({ algorithms: ["greedy"] });
  });
  it.each(["", "abc", "12.5", "99", "2000001", "-5"])("rejects node limit %j", (nodeLimit) => {
    expect(validateBench({ ...DEFAULT_BENCH, nodeLimit }).errors.nodeLimit).toMatch(
      /whole number from 100 to 2,000,000/,
    );
  });
  it("warns, but still allows, a very high node limit", () => {
    const v = validateBench({ ...DEFAULT_BENCH, nodeLimit: String(SLOW_NODE_LIMIT + 1) });
    expect(v.request).not.toBeNull();
    expect(v.warnings[0]).toMatch(/slow/);
    expect(validateBench(DEFAULT_BENCH).warnings).toEqual([]);
  });
});

describe("parseSizes", () => {
  it("accepts commas, spaces and semicolons", () => {
    expect(parseSizes("3, 4 5;6")).toEqual([3, 4, 5, 6]);
  });
  it("returns null for anything that is not a whole number", () => {
    expect(parseSizes("3, x")).toBeNull();
    expect(parseSizes("3.5")).toBeNull();
  });
  it("returns an empty list for blank text", () => {
    expect(parseSizes("  ")).toEqual([]);
  });
});

describe("validateScaling", () => {
  it("accepts the defaults and builds the full request (all defaults explicit)", () => {
    const v = validateScaling(DEFAULT_SCALING);
    expect(v.errors).toEqual({});
    expect(v.request).toEqual({
      sample: "mosaic-tile",
      sizes: [3, 4, 5, 6],
      algorithms: ["greedy", "best_first", "dijkstra", "backtracking"],
      rotate: false,
      noise: 4,
      erosion: 0.2,
      node_limit: 50000,
    });
  });
  it("sorts and de-duplicates sizes", () => {
    expect(validateScaling({ ...DEFAULT_SCALING, sizes: "5, 3, 3, 4" }).request?.sizes).toEqual([3, 4, 5]);
  });
  it.each(["", "a, b", "1", "9", "2, 3, 4, 5, 6, 7, 8, 2.5"])("rejects sizes %j", (sizes) => {
    expect(validateScaling({ ...DEFAULT_SCALING, sizes }).errors.sizes).toBeTruthy();
  });
  it("rejects more than seven different sizes", () => {
    expect(validateScaling({ ...DEFAULT_SCALING, sizes: "2 3 4 5 6 7 8 9" }).errors.sizes).toBeTruthy();
    expect(validateScaling({ ...DEFAULT_SCALING, sizes: "2 3 4 5 6 7 8" }).errors.sizes).toBeUndefined();
  });
  it("warns about large sizes", () => {
    expect(validateScaling({ ...DEFAULT_SCALING, sizes: "3, 7" }).warnings[0]).toMatch(/long time/);
    expect(validateScaling(DEFAULT_SCALING).warnings).toEqual([]);
  });
  it("checks noise, erosion, node limit and algorithms", () => {
    const v = validateScaling({ ...DEFAULT_SCALING, noise: "31", erosion: "1.5", nodeLimit: "50", algorithms: [] });
    expect(Object.keys(v.errors).sort()).toEqual(["algorithms", "erosion", "nodeLimit", "noise"]);
    expect(v.request).toBeNull();
  });
});

describe("apiFieldErrors", () => {
  it("maps 422 details onto form fields and ignores unknown ones", () => {
    const out = apiFieldErrors(
      {
        errors: [
          { loc: ["body", "node_limit"], msg: "too small" },
          { loc: ["body", "other"], msg: "x" },
        ],
      },
      BENCH_API_FIELDS,
    );
    expect(out).toEqual({ nodeLimit: "too small" });
    expect(apiFieldErrors(undefined, BENCH_API_FIELDS)).toEqual({});
  });
});
