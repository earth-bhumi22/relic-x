// Owner: A (Arvind)
import { readFileSync } from "node:fs";
import {
  DEFAULT_PARAMS,
  LIMITS,
  draftFromParams,
  fieldErrorsFromApi,
  formatBytes,
  formatDate,
  formatPercent,
  maxUploadMb,
  validateDescription,
  validateFragmentGrid,
  validateImageFile,
  validateImageFiles,
  validateName,
  validateParams,
} from "./artifactForm";

const draft = (over: Partial<ReturnType<typeof draftFromParams>> = {}) => ({ ...draftFromParams(), ...over });
const img = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "a.png",
  type: "image/png",
  size: 1000,
  ...over,
});

describe("defaults", () => {
  it("match the generated OpenAPI defaults (single source of truth)", () => {
    const schema = readFileSync("src/api/schema.d.ts", "utf8");
    const block = schema.slice(schema.indexOf("FragmentParams: {"), schema.indexOf("HTTPValidationError"));
    const defaults = Object.fromEntries(
      [...block.matchAll(/@default (\S+)\s*\*\/\s*(\w+): /g)].map(([, v, k]) => [k, JSON.parse(v)]),
    );
    expect(defaults).toEqual(DEFAULT_PARAMS);
  });

  it("turn into string drafts", () => {
    expect(draftFromParams()).toEqual({
      rows: "4",
      cols: "4",
      rotate: false,
      noise: "4",
      erosion: "0.2",
      missing: "0",
      seed: "7",
    });
  });
});

describe("validateParams", () => {
  it("accepts the defaults and returns numbers", () => {
    expect(validateParams(draft())).toEqual({ errors: {}, params: DEFAULT_PARAMS });
  });

  it.each([
    [{ rows: "1" }, "rows", /between 2 and 8/],
    [{ rows: "9" }, "rows", /between 2 and 8/],
    [{ cols: "2.5" }, "cols", /whole number/],
    [{ cols: "" }, "cols", /must be a number/],
    [{ noise: "31" }, "noise", /between 0 and 30/],
    [{ noise: "abc" }, "noise", /between 0 and 30/],
    [{ erosion: "1.5" }, "erosion", /between 0 and 1/],
    [{ erosion: "-0.1" }, "erosion", /between 0 and 1/],
    [{ missing: "7" }, "missing", /between 0 and 6/],
    [{ missing: "-1" }, "missing", /between 0 and 6/],
    [{ seed: "1000001" }, "seed", /between 0 and 1000000/],
    [{ seed: "NaN" }, "seed", /must be a number/],
    [{ noise: "Infinity" }, "noise", /between 0 and 30/],
  ])("rejects %j", (over, field, message) => {
    const { errors, params } = validateParams(draft(over));
    expect(params).toBeUndefined();
    expect(errors[field]).toMatch(message);
  });

  it("requires missing < rows × columns", () => {
    expect(validateParams(draft({ rows: "2", cols: "2", missing: "4" })).errors.missing).toMatch(
      /less than rows × columns \(4\)/,
    );
    expect(validateParams(draft({ rows: "2", cols: "2", missing: "3" })).errors.missing).toBeUndefined();
  });

  it("keeps the limits aligned with the server", () => {
    expect(LIMITS.noise.max).toBe(30);
    expect(LIMITS.maxMissing).toBe(6);
  });
});

describe("name and description", () => {
  it("trims, requires and caps the name", () => {
    expect(validateName("  Tile  ")).toEqual({ name: "Tile" });
    expect(validateName("   ").error).toMatch(/required/);
    expect(validateName("x".repeat(121)).error).toMatch(/at most 120/);
    expect(validateName("x".repeat(120)).name).toHaveLength(120);
  });

  it("caps the description", () => {
    expect(validateDescription("ok")).toBeUndefined();
    expect(validateDescription("x".repeat(2001))).toMatch(/at most 2000/);
  });
});

describe("file checks", () => {
  it("reads the cap from VITE_MAX_UPLOAD_MB, default 15", () => {
    expect(maxUploadMb()).toBe(15);
    vi.stubEnv("VITE_MAX_UPLOAD_MB", "2");
    expect(maxUploadMb()).toBe(2);
    vi.stubEnv("VITE_MAX_UPLOAD_MB", "junk");
    expect(maxUploadMb()).toBe(15);
  });

  it("accepts images and rejects other types and oversize files with a clear message", () => {
    expect(validateImageFile(img())).toBeUndefined();
    expect(validateImageFile(img({ name: "doc.pdf", type: "application/pdf" }))).toMatch(/doc\.pdf is not an image/);
    expect(validateImageFile(img({ type: "" }))).toMatch(/unknown/);
    expect(validateImageFile(img({ size: 16 * 1024 * 1024 }))).toMatch(/16\.0 MB; the limit is 15 MB/);
  });

  it("reports the first bad file of several", () => {
    expect(validateImageFiles([img(), img({ name: "b.txt", type: "text/plain" })])).toMatch(/b\.txt/);
    expect(validateImageFiles([img(), img()])).toBeUndefined();
  });

  it("formats sizes", () => {
    expect(formatBytes(500)).toBe("1 KB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("validateFragmentGrid", () => {
  it("needs one cell per image and explains a mismatch", () => {
    expect(validateFragmentGrid("2", "3", 6)).toEqual({});
    expect(validateFragmentGrid("2", "3", 5).files).toMatch(/5 images selected but 2 × 3 = 6 cells/);
    expect(validateFragmentGrid("2", "2", 1).files).toMatch(/1 image selected/);
    expect(validateFragmentGrid("0", "3", 3).rows).toMatch(/between 1 and 8/);
    expect(validateFragmentGrid("2", "x", 3).cols).toMatch(/must be a number/);
  });
});

describe("formatting", () => {
  it("formats accuracy as a percentage, or a dash for null", () => {
    expect(formatPercent(0.8333)).toBe("83%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
  });

  it("formats dates (UTC) and tolerates garbage", () => {
    expect(formatDate("2026-11-13T11:30:00Z")).toBe("13 Nov 2026");
    expect(formatDate("not a date")).toBe("not a date");
  });
});

describe("fieldErrorsFromApi", () => {
  it("maps validation_error details to the last loc segment, first message wins", () => {
    const details = {
      errors: [
        { loc: ["body", "name"], msg: "too short" },
        { loc: ["body", "fragment", "rows"], msg: "bad rows" },
        { loc: ["body", "name"], msg: "second" },
        { loc: "nope", msg: "ignored" },
      ],
    };
    expect(fieldErrorsFromApi(details)).toEqual({ name: "too short", rows: "bad rows" });
  });

  it("returns nothing for missing or odd details", () => {
    expect(fieldErrorsFromApi(undefined)).toEqual({});
    expect(fieldErrorsFromApi({ errors: "x" })).toEqual({});
  });
});
