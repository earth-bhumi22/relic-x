// Owner: A (Arvind)
// T23 client functions: deleteArtifact, createUploadArtifact, createFragmentsArtifact (real-mode requests and
// mock-mode behaviour, including the CONTRACT §4 error shape).
import {
  createFragmentsArtifact,
  createSampleArtifact,
  createUploadArtifact,
  deleteArtifact,
  listArtifacts,
  getArtifact,
} from "./client";
import { DEFAULT_PARAMS } from "../lib/artifactForm";
import { mockApi } from "../test/mockApi";

const img = (name = "a.png", type = "image/png", size = 5) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("real mode requests", () => {
  const fetchOk = (status = 201, body: unknown = {}) =>
    vi.fn().mockImplementation(async () => new Response(status === 204 ? null : JSON.stringify(body), { status }));

  it("DELETE /artifacts/{id} resolves to undefined on 204", async () => {
    const fetchMock = fetchOk(204);
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteArtifact("abc")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/artifacts/abc");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });

  it("uploads an image as multipart with params as a JSON string and no JSON content-type", async () => {
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);
    const image = img();
    await createUploadArtifact({ name: "N", image, params: DEFAULT_PARAMS, description: "D" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/artifacts/upload");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Headers).get("Content-Type")).toBeNull();
    const form = init.body as FormData;
    expect([form.get("name"), form.get("description")]).toEqual(["N", "D"]);
    expect(form.get("image")).toBe(image);
    expect(JSON.parse(form.get("params") as string)).toEqual(DEFAULT_PARAMS);
  });

  it("leaves the description out when not given", async () => {
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);
    await createUploadArtifact({ name: "N", image: img(), params: DEFAULT_PARAMS });
    expect((fetchMock.mock.calls[0][1].body as FormData).has("description")).toBe(false);
  });

  it("uploads fragments with repeated `files`", async () => {
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);
    const files = [img("1.png"), img("2.png"), img("3.png")];
    await createFragmentsArtifact({ name: "Shards", rows: 1, cols: 3, files });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/artifacts/fragments-upload");
    const form = init.body as FormData;
    expect([form.get("name"), form.get("rows"), form.get("cols")]).toEqual(["Shards", "1", "3"]);
    expect(form.getAll("files")).toEqual(files);
  });

  it("turns a 413 body into an ApiError with code, message and details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "payload_too_large", message: "too big", details: { limit_mb: 15 } } }),
          {
            status: 413,
          },
        ),
      ),
    );
    await expect(createUploadArtifact({ name: "N", image: img(), params: DEFAULT_PARAMS })).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
      details: { limit_mb: 15 },
    });
  });
});

describe("mock mode", () => {
  beforeEach(() => mockApi.enable());

  it("creates an uploaded-image artifact that shows up in later lists, newest first", async () => {
    const a = await createUploadArtifact({
      name: "Upload",
      image: img(),
      params: { ...DEFAULT_PARAMS, rows: 2, cols: 3 },
      description: "d",
    });
    expect(a).toMatchObject({ source_kind: "upload", grid_rows: 2, grid_cols: 3, fragment_count: 6, description: "d" });
    expect(a.has_ground_truth).toBe(true);
    const list = await listArtifacts({ limit: 50 });
    expect(list[0].id).toBe(a.id);
    expect(await getArtifact(a.id)).toMatchObject({ name: "Upload" });
  });

  it("creates a real-fragments artifact without ground truth", async () => {
    const a = await createFragmentsArtifact({ name: "Shards", rows: 2, cols: 2, files: [img(), img(), img(), img()] });
    expect(a).toMatchObject({ source_kind: "fragments", has_ground_truth: false, fragment_count: 4 });
  });

  it("deletes an artifact, then 404s on a second delete and on get", async () => {
    const a = await createSampleArtifact({ name: "Temp" });
    await expect(deleteArtifact(a.id)).resolves.toBeUndefined();
    expect((await listArtifacts()).some((x) => x.id === a.id)).toBe(false);
    await expect(deleteArtifact(a.id)).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(getArtifact(a.id)).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ["fail-422", 422, "validation_error"],
    ["fail-413", 413, "payload_too_large"],
    ["fail-500", 500, "internal_error"],
  ])("name %s triggers %i %s on every create call", async (name, status, code) => {
    const expected = { status, code };
    await expect(createSampleArtifact({ name })).rejects.toMatchObject(expected);
    await expect(createUploadArtifact({ name, image: img(), params: DEFAULT_PARAMS })).rejects.toMatchObject(expected);
    await expect(createFragmentsArtifact({ name, rows: 1, cols: 1, files: [img()] })).rejects.toMatchObject(expected);
  });

  it("validates uploads like the server: non-image 422, oversize 413, bad grid, no files, too many files", async () => {
    await expect(
      createUploadArtifact({ name: "x", image: img("a.pdf", "application/pdf"), params: DEFAULT_PARAMS }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_input" });
    await expect(
      createUploadArtifact({ name: "x", image: img("a.png", "image/png", 16 * 1024 * 1024), params: DEFAULT_PARAMS }),
    ).rejects.toMatchObject({ status: 413, code: "payload_too_large" });
    await expect(
      createUploadArtifact({ name: "x", image: img(), params: { ...DEFAULT_PARAMS, rows: 20 } }),
    ).rejects.toMatchObject({ status: 422, code: "validation_error" });
    await expect(createUploadArtifact({ name: " ", image: img(), params: DEFAULT_PARAMS })).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(createFragmentsArtifact({ name: "x", rows: 2, cols: 2, files: [] })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      createFragmentsArtifact({ name: "x", rows: 1, cols: 2, files: [img(), img(), img()] }),
    ).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(createFragmentsArtifact({ name: "x", rows: 0, cols: 2, files: [img()] })).rejects.toMatchObject({
      code: "validation_error",
    });
  });
});
