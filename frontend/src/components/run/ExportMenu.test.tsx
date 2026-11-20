// Owner: A (Arvind)
// The export buttons: one per format, busy state, saved file name and the error path.
import { fireEvent, render, screen } from "@testing-library/react";
import { runFixture } from "../../test/fixtures";
import { placementTiles } from "../../lib/replay";
import ExportMenu from "./ExportMenu";

const exportRun = vi.hoisted(() => vi.fn());
vi.mock("../../lib/exportRun", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/exportRun")>()),
  exportRun,
}));

const run = runFixture("greedy");
const input = { run, artifactName: "Mosaic", tiles: placementTiles(run), fragments: [] };

describe("ExportMenu", () => {
  it("offers PNG, SVG, PDF, JSON and CSV", () => {
    render(<ExportMenu input={input} />);
    for (const name of [/PNG/, /SVG/, /PDF/, /JSON/, /CSV/]) expect(screen.getByRole("button", { name })).toBeEnabled();
  });

  it("exports the chosen format and reports the saved file", async () => {
    exportRun.mockResolvedValue("relicx-mosaic-greedy-2026-11-20.pdf");
    render(<ExportMenu input={input} />);
    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    expect(exportRun).toHaveBeenCalledWith(input, "pdf");
    expect(await screen.findByText("Saved relicx-mosaic-greedy-2026-11-20.pdf")).toBeInTheDocument();
  });

  it("shows an error when the export fails", async () => {
    exportRun.mockRejectedValue(new Error("nope"));
    render(<ExportMenu input={input} />);
    fireEvent.click(screen.getByRole("button", { name: /PNG/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nope");
  });
});
