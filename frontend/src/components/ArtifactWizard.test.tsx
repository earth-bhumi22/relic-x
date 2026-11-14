// Owner: A (Arvind)
// Create-artifact wizard: the three sources end to end (request shapes asserted), validation, submitting state,
// API failures with the user's input preserved, and dialog behaviour. Mock API only.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AppRoutes } from "../routes";
import { artifactFixture } from "../test/fixtures";
import { mockApi, useMockApi } from "../test/mockApi";
import { renderWithProviders } from "../test/renderWithProviders";
import ArtifactWizard from "./ArtifactWizard";

const png = (name = "a.png", size = 10, type = "image/png") => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

let createUrl: ReturnType<typeof vi.fn>;
let revokeUrl: ReturnType<typeof vi.fn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  let n = 0;
  createUrl = vi.fn(() => `blob:preview-${++n}`);
  revokeUrl = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { value: createUrl, configurable: true, writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revokeUrl, configurable: true, writable: true });
  errorSpy = vi.spyOn(console, "error");
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
});

const created = { ...artifactFixture(), id: "new0000000000000000000000000001", name: "Created" };

function setup() {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  renderWithProviders(<ArtifactWizard onClose={onClose} onCreated={onCreated} />);
  return { onClose, onCreated };
}
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const pick = (label: string, files: File[]) => fireEvent.change(screen.getByLabelText(label), { target: { files } });
const choose = (name: string) => fireEvent.click(screen.getByRole("radio", { name: new RegExp(`^${name}`) }));
const create = () => fireEvent.click(screen.getByRole("button", { name: "Create" }));

describe("ArtifactWizard — sources", () => {
  useMockApi();

  it("creates from a sample: JSON body with the fragment parameters", async () => {
    mockApi.respond("POST", "/artifacts/sample", created);
    const { onCreated } = setup();
    expect(await screen.findByRole("radio", { name: /mosaic-tile/ })).toBeChecked(); // first sample preselected
    choose("Sample"); // already selected; keeps the radio group reachable
    fireEvent.click(screen.getByRole("radio", { name: /pottery-band/ }));
    next();
    type("Rows", "3");
    type("Columns", "5");
    fireEvent.click(screen.getByLabelText("Rotate fragments randomly"));
    fireEvent.change(screen.getByLabelText(/Noise/), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText(/Erosion/), { target: { value: "0.5" } });
    type("Missing fragments", "2");
    type("Seed", "11");
    next();
    type("Name", "  My tile  ");
    type("Description (optional)", "A test");
    expect(screen.getByText("Sample “pottery-band”")).toBeInTheDocument();
    create();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    const [req] = mockApi.calls("POST", "/artifacts/sample");
    expect(req.body).toEqual({
      name: "My tile",
      sample: "pottery-band",
      description: "A test",
      fragment: { rows: 3, cols: 5, rotate: true, noise: 9, erosion: 0.5, missing: 2, seed: 11 },
    });
  });

  it("omits an empty description and uses the defaults", async () => {
    mockApi.respond("POST", "/artifacts/sample", created);
    const { onCreated } = setup();
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    next();
    next();
    type("Name", "Plain");
    create();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockApi.calls("POST", "/artifacts/sample")[0].body).toEqual({
      name: "Plain",
      sample: "mosaic-tile",
      fragment: { rows: 4, cols: 4, rotate: false, noise: 4, erosion: 0.2, missing: 0, seed: 7 },
    });
  });

  it("creates from an uploaded image: multipart with params as a JSON string, after a preview", async () => {
    mockApi.respond("POST", "/artifacts/upload", { ...created, source_kind: "upload" });
    const { onCreated } = setup();
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    choose("Upload image");
    const file = png("photo.png");
    pick("Image", [file]);
    expect(await screen.findByRole("img", { name: "Preview of photo.png" })).toHaveAttribute("src", "blob:preview-1");
    next();
    type("Rows", "2");
    type("Columns", "3");
    next();
    type("Name", "Scan");
    type("Description (optional)", "from phone");
    create();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const form = mockApi.calls("POST", "/artifacts/upload")[0].form!;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("name")).toBe("Scan");
    expect(form.get("image")).toBe(file);
    expect(form.get("description")).toBe("from phone");
    expect(typeof form.get("params")).toBe("string");
    expect(JSON.parse(form.get("params") as string)).toEqual({
      rows: 2,
      cols: 3,
      rotate: false,
      noise: 4,
      erosion: 0.2,
      missing: 0,
      seed: 7,
    });
  });

  it("creates from real fragments: repeated files, rows and cols, no parameters", async () => {
    mockApi.respond("POST", "/artifacts/fragments-upload", { ...created, source_kind: "fragments" });
    const { onCreated } = setup();
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    choose("Upload real fragments");
    const files = [png("f1.png"), png("f2.png"), png("f3.png"), png("f4.png")];
    pick("Fragment images", files);
    const list = await screen.findByRole("list", { name: "Selected fragments" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    next();
    expect(screen.queryByLabelText("Seed")).not.toBeInTheDocument(); // only rows and columns apply
    type("Rows", "2");
    type("Columns", "2");
    next();
    expect(screen.queryByLabelText("Description (optional)")).not.toBeInTheDocument();
    type("Name", "Real shards");
    create();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const form = mockApi.calls("POST", "/artifacts/fragments-upload")[0].form!;
    expect(form.get("name")).toBe("Real shards");
    expect(form.get("rows")).toBe("2");
    expect(form.get("cols")).toBe("2");
    expect(form.getAll("files")).toEqual(files);
  });

  it("revokes preview object URLs when files change and on close", async () => {
    const { onClose } = setup();
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    choose("Upload image");
    pick("Image", [png("one.png")]);
    await screen.findByRole("img", { name: "Preview of one.png" });
    pick("Image", [png("two.png")]);
    await screen.findByRole("img", { name: "Preview of two.png" });
    expect(revokeUrl).toHaveBeenCalledWith("blob:preview-1");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("revokes every URL on unmount", async () => {
    const { unmount } = render(<ArtifactWizard onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    choose("Upload real fragments");
    pick("Fragment images", [png("a.png"), png("b.png")]);
    await screen.findByRole("list", { name: "Selected fragments" });
    unmount();
    expect(revokeUrl).toHaveBeenCalledWith("blob:preview-1");
    expect(revokeUrl).toHaveBeenCalledWith("blob:preview-2");
  });

  it("shows loading and an error with retry while the sample list loads", async () => {
    mockApi.fail("GET", "/samples", 500, "internal_error", "no samples");
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("no samples");
    mockApi.respond("GET", "/samples", [{ name: "only", description: "d", image_url: "x" }]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("radio", { name: /only/ })).toBeChecked();
  });
});

describe("ArtifactWizard — validation", () => {
  useMockApi();

  it("requires an image, and rejects non-images and oversize files, next to the field", async () => {
    setup();
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    choose("Upload image");
    next();
    expect(screen.getByLabelText("Image")).toHaveAccessibleDescription("Choose an image to upload.");
    pick("Image", [png("notes.pdf", 10, "application/pdf")]);
    next();
    expect(screen.getByText(/notes\.pdf is not an image/)).toBeInTheDocument();
    pick("Image", [png("huge.png", 16 * 1024 * 1024)]);
    next();
    expect(screen.getByText(/huge\.png is 16\.0 MB; the limit is 15 MB per image/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Source" })).toBeInTheDocument(); // still on step 1
  });

  it("shows messages next to invalid parameters and blocks Next", async () => {
    setup();
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    next();
    type("Rows", "9");
    type("Columns", "");
    type("Missing fragments", "16");
    type("Seed", "1.5");
    next();
    expect(screen.getByLabelText("Rows")).toHaveAccessibleDescription("Rows must be between 2 and 8.");
    expect(screen.getByLabelText("Rows")).toBeInvalid();
    expect(screen.getByLabelText("Columns")).toHaveAccessibleDescription("Columns must be a number.");
    expect(screen.getByLabelText("Missing fragments")).toHaveAccessibleDescription(/between 0 and 6/);
    expect(screen.getByLabelText("Seed")).toHaveAccessibleDescription("Seed must be a whole number.");
    expect(screen.getByRole("heading", { level: 3, name: "Parameters" })).toBeInTheDocument();
    type("Rows", "2");
    expect(screen.getByLabelText("Rows")).not.toBeInvalid(); // editing clears that field's message
  });

  it("enforces missing < rows × columns", async () => {
    setup();
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    next();
    type("Rows", "2");
    type("Columns", "2");
    type("Missing fragments", "4");
    next();
    expect(screen.getByLabelText("Missing fragments")).toHaveAccessibleDescription(/less than rows × columns \(4\)/);
  });

  it("explains a rows × columns mismatch for real fragments", async () => {
    setup();
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    choose("Upload real fragments");
    next();
    expect(screen.getByLabelText("Fragment images")).toHaveAccessibleDescription(/at least one fragment image/);
    pick("Fragment images", [png("a.png"), png("b.png"), png("c.png")]);
    next();
    next(); // default 4 × 4 != 3 images
    expect(screen.getByText(/3 images selected but 4 × 4 = 16 cells/)).toBeInTheDocument();
  });

  it("requires a name on the last step and can go back with input kept", async () => {
    setup();
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    next();
    type("Rows", "5");
    next();
    create();
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("Name is required.");
    type("Name", "x".repeat(121));
    create();
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(/at most 120/);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Rows")).toHaveValue(5);
  });
});

describe("ArtifactWizard — submitting and failures", () => {
  useMockApi();

  async function toReview(name = "Tile") {
    const radio = await screen.findByRole("radio", { name: /mosaic-tile/ });
    await waitFor(() => expect(radio).toBeChecked());
    next();
    next();
    type("Name", name);
  }

  it("disables the form while submitting and never double-submits", async () => {
    mockApi.respond("POST", "/artifacts/sample", created, { delayMs: 40 });
    const { onCreated, onClose } = setup();
    await toReview();
    const button = screen.getByRole("button", { name: "Create" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });
    expect(await screen.findByRole("button", { name: "Creating…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Creating artifact…");
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(mockApi.calls("POST", "/artifacts/sample")).toHaveLength(1);
  });

  it("shows 422 validation_error field messages next to their fields and keeps the input", async () => {
    mockApi.fail("POST", "/artifacts/sample", 422, "validation_error", "request validation failed", {
      errors: [
        { loc: ["body", "name"], msg: "Name is taken" },
        { loc: ["body", "fragment", "rows"], msg: "rows too big" },
      ],
    });
    const { onCreated } = setup();
    await toReview("Dup");
    create();
    // the first offending field lives on the parameters step, so the wizard jumps back to it
    expect(await screen.findByLabelText("Rows")).toHaveAccessibleDescription("rows too big");
    expect(screen.getByText(/The server rejected some fields/)).toBeInTheDocument();
    next();
    expect(screen.getByLabelText("Name")).toHaveValue("Dup");
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("Name is taken");
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows invalid_input (422) with its message and stays open", async () => {
    mockApi.fail("POST", "/artifacts/sample", 422, "invalid_input", "unknown sample 'x'");
    setup();
    await toReview("Keep me");
    create();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("invalid_input");
    expect(alert).toHaveTextContent("unknown sample 'x'");
    expect(screen.getByLabelText("Name")).toHaveValue("Keep me");
  });

  it("shows payload_too_large (413) with the limit hint and keeps files and input", async () => {
    mockApi.fail("POST", "/artifacts/upload", 413, "payload_too_large", "image larger than 15 MB", { limit_mb: 15 });
    setup();
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    choose("Upload image");
    pick("Image", [png("big.png")]);
    next();
    next();
    type("Name", "Big one");
    create();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("payload_too_large");
    expect(screen.getByText("Each image may be at most 15 MB.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Big one");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("img", { name: "Preview of big.png" })).toBeInTheDocument();
  });

  it("retries a generic failure from the error state", async () => {
    mockApi.fail("POST", "/artifacts/sample", 500, "internal_error", "boom");
    const { onCreated } = setup();
    await toReview();
    create();
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    mockApi.respond("POST", "/artifacts/sample", created);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(mockApi.calls("POST", "/artifacts/sample")).toHaveLength(2);
  });

  it("handles a network failure (fetch rejects) in real mode", async () => {
    vi.stubEnv("VITE_USE_MOCKS", "false");
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/samples"))
        return new Response(JSON.stringify([{ name: "s", description: "d", image_url: "x" }]));
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    setup();
    await screen.findByRole("radio", { name: /^s d/ });
    next();
    next();
    type("Name", "Offline");
    create();
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
    expect(screen.getByLabelText("Name")).toHaveValue("Offline");
  });
});

describe("ArtifactWizard — dialog", () => {
  useMockApi();

  it("has dialog semantics, a progress list, and starts with focus inside", async () => {
    setup();
    const dialog = await screen.findByRole("dialog", { name: "New artifact" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("list", { name: "Progress" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Sample/ })).toHaveFocus();
  });

  it("closes with Escape", async () => {
    const { onClose } = setup();
    await screen.findByRole("dialog");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("New artifact flow from the Projects page (mock API, no overrides)", () => {
  useMockApi();

  it("returns focus to the trigger when closed with Escape", async () => {
    renderWithProviders(<AppRoutes />, { route: "/" });
    await screen.findByText("Mughal tile panel");
    const trigger = screen.getByRole("button", { name: "New artifact" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "New artifact" });
    expect(screen.getByRole("radio", { name: /^Sample/ })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("creates from each source, navigates to the gallery, and the artifact is in the next list", async () => {
    renderWithProviders(<AppRoutes />, { route: "/" });
    await screen.findByText("Mughal tile panel");

    // sample
    fireEvent.click(screen.getByRole("button", { name: "New artifact" }));
    await screen.findByRole("radio", { name: /manuscript/ });
    fireEvent.click(screen.getByRole("radio", { name: /manuscript/ }));
    next();
    next();
    type("Name", "Sample one");
    create();
    expect(await screen.findByRole("heading", { level: 1, name: "Fragment gallery" })).toBeInTheDocument();

    // upload (back on the list; the new artifact is newest, so it is first)
    fireEvent.click(screen.getByRole("link", { name: "Projects" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Sample one" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent("Sample one");
    fireEvent.click(screen.getByRole("button", { name: "New artifact" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    choose("Upload image");
    pick("Image", [png("p.png")]);
    next();
    type("Rows", "2");
    type("Columns", "2");
    next();
    type("Name", "Upload one");
    create();
    await screen.findByRole("heading", { level: 1, name: "Fragment gallery" });

    // fragments
    fireEvent.click(screen.getByRole("link", { name: "Projects" }));
    await screen.findByRole("heading", { level: 2, name: "Upload one" });
    fireEvent.click(screen.getByRole("button", { name: "New artifact" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    choose("Upload real fragments");
    pick("Fragment images", [png("a.png"), png("b.png")]);
    next();
    type("Rows", "1");
    type("Columns", "2");
    next();
    type("Name", "Shards");
    create();
    await screen.findByRole("heading", { level: 1, name: "Fragment gallery" });
    fireEvent.click(screen.getByRole("link", { name: "Projects" }));
    const shards = await screen.findByRole("article", { name: "Shards" });
    expect(within(shards).getByTestId("source-kind")).toHaveTextContent("fragments");
    expect(within(shards).getByText("No ground truth")).toBeInTheDocument();
    expect(within(shards).getByText("—")).toBeInTheDocument();
  });

  it("mock triggers: names fail-422 and fail-413 reproduce the API errors", async () => {
    renderWithProviders(<AppRoutes />, { route: "/" });
    await screen.findByText("Mughal tile panel");
    fireEvent.click(screen.getByRole("button", { name: "New artifact" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /mosaic-tile/ })).toBeChecked());
    next();
    next();
    type("Name", "fail-422");
    create();
    await screen.findByText(/The server rejected some fields/);
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(/rejected by the mock API/);
    type("Name", "fail-413");
    create();
    expect(await screen.findByText("Each image may be at most 15 MB.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
