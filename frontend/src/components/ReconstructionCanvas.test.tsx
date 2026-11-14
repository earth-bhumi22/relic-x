// Owner: A (Arvind)
// Canvas: positions, rotations, size from the placements (not the artifact grid), tray, confidence rings that are not
// colour-only, and hover / focus details.
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReplayTile } from "../lib/replay";
import { replayBounds } from "../lib/replay";
import type { Confidence } from "../lib/confidence";
import ReconstructionCanvas from "./ReconstructionCanvas";

const tile = (label: string, row: number, col: number, rot = 0, extra: Partial<ReplayTile> = {}): ReplayTile => ({
  label,
  row,
  col,
  rot,
  step: 2,
  kind: "place",
  note: "",
  score: null,
  ...extra,
});
const frags = ["F01", "F02", "F03", "F04"].map((label) => ({ label, image_url: `/img/${label}.png` }));
const boundsOf = (tiles: ReplayTile[]) =>
  replayBounds({ frames: [{ tiles }], mode: "exact" } as unknown as Parameters<typeof replayBounds>[0]);
const conf = (value: number | null): Confidence =>
  ({ value, scored: value === null ? 0 : 1, joins: value === null ? [] : [{}] }) as unknown as Confidence;

describe("ReconstructionCanvas", () => {
  it("puts each tile at its cell, rotated rot × 90° clockwise", () => {
    const tiles = [tile("F01", 0, 0, 0), tile("F02", 0, 1, 1), tile("F03", 1, 0, 3)];
    render(<ReconstructionCanvas tiles={tiles} bounds={boundsOf(tiles)} fragments={frags} />);
    const cells = screen.getAllByTestId("recon-tile");
    expect(cells).toHaveLength(3);
    const f02 = cells.find((c) => c.getAttribute("data-col") === "1")!;
    expect(f02).toHaveStyle({ gridRow: "1", gridColumn: "2" });
    expect(within(f02).getByRole("presentation", { hidden: true })).toHaveStyle({ transform: "rotate(90deg)" });
    const f03 = cells.find((c) => c.getAttribute("data-row") === "1")!;
    expect(within(f03).getByRole("presentation", { hidden: true })).toHaveStyle({ transform: "rotate(270deg)" });
  });

  it("is sized from the placements: a layout wider than the artifact grid and negative cells still fit", () => {
    const tiles = [tile("F01", -1, -2), tile("F02", 0, 5)];
    render(<ReconstructionCanvas tiles={tiles} bounds={boundsOf(tiles)} fragments={frags} />);
    expect(screen.getByRole("group", { name: /2 rows by 8 columns/ })).toBeInTheDocument();
    const [a, b] = screen.getAllByTestId("recon-tile");
    expect(a).toHaveStyle({ gridRow: "1", gridColumn: "1" });
    expect(b).toHaveStyle({ gridRow: "2", gridColumn: "8" });
  });

  it("lists fragments missing from the layout in a tray with a count", () => {
    const tiles = [tile("F01", 0, 0)];
    render(<ReconstructionCanvas tiles={tiles} bounds={boundsOf(tiles)} fragments={frags} unplaced={["F02", "F03"]} />);
    const tray = screen.getByRole("region", { name: "Unplaced fragments (2)" });
    expect(within(tray).getByRole("heading", { name: "Unplaced (2)" })).toBeInTheDocument();
    expect(within(tray).getByText("F03")).toBeInTheDocument();
  });

  it("shows confidence as a number and a ring class, never colour alone", () => {
    const tiles = [tile("F01", 0, 0), tile("F02", 0, 1), tile("F03", 0, 2), tile("F04", 0, 3)];
    const confidence = new Map([
      ["F01", conf(0.9)],
      ["F02", conf(0.5)],
      ["F03", conf(0.1)],
      ["F04", conf(null)],
    ]);
    render(<ReconstructionCanvas tiles={tiles} bounds={boundsOf(tiles)} fragments={frags} confidence={confidence} />);
    const cells = screen.getAllByTestId("recon-tile");
    expect(cells.map((c) => c.className.match(/ring-(\w+)/)?.[1])).toEqual(["high", "medium", "low", "none"]);
    expect(cells[0]).toHaveTextContent("0.90");
    expect(cells[3]).toHaveTextContent("—");
    expect(cells[0]).toHaveAccessibleName(/confidence 0\.90/);
  });

  it("shows label, cell, rotation, confidence and step on hover and on focus", () => {
    const tiles = [tile("F01", 0, 0, 2, { step: 5 })];
    render(
      <ReconstructionCanvas
        tiles={tiles}
        bounds={boundsOf(tiles)}
        fragments={frags}
        confidence={new Map([["F01", conf(0.8)]])}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Hover or focus");
    fireEvent.mouseEnter(screen.getByTestId("recon-tile"));
    expect(status).toHaveTextContent(
      "F01 at row 0, column 0, rotated 180° clockwise, placed at step 5, confidence 0.80",
    );
    fireEvent.mouseLeave(screen.getByTestId("recon-tile"));
    fireEvent.focus(screen.getByTestId("recon-tile"));
    expect(status).toHaveTextContent("F01");
  });

  it("marks conflict and fallback tiles with a flag and their note", () => {
    const tiles = [tile("F01", 0, 0, 0, { kind: "fallback", note: "best free slot" })];
    render(<ReconstructionCanvas tiles={tiles} bounds={boundsOf(tiles)} fragments={frags} />);
    expect(screen.getByTestId("recon-tile")).toHaveAccessibleName(/best free slot/);
    expect(screen.getByTestId("recon-tile")).toHaveTextContent("F");
  });

  it("says so when nothing is placed", () => {
    render(<ReconstructionCanvas tiles={[]} bounds={{ minRow: 0, minCol: 0, rows: 0, cols: 0 }} fragments={frags} />);
    expect(screen.getByText(/nothing is placed yet/i)).toBeInTheDocument();
  });
});
