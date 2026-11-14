// Owner: A (Arvind)
import { render, screen, within } from "@testing-library/react";
import EdgeBeads, { StripSwatches } from "./EdgeBeads";

const beads = (container: HTMLElement) => within(container).queryAllByTitle(/./);

describe("EdgeBeads", () => {
  it("draws one bead per symbol with the symbol as its tooltip and the backend colour", () => {
    const { container } = render(<EdgeBeads edge="AQ/" label="North edge of F01" />);
    const b = beads(container);
    expect(b).toHaveLength(3);
    expect(b.map((x) => x.title)).toEqual(["A", "Q", "/"]);
    expect(b[0]).toHaveStyle({ backgroundColor: "rgb(32, 32, 32)" });
    expect(b[1]).toHaveStyle({ backgroundColor: "rgb(96, 32, 32)" });
    expect(b[2]).toHaveStyle({ backgroundColor: "rgb(224, 224, 224)" });
  });

  it("exposes the whole string to screen readers", () => {
    render(<EdgeBeads edge="AQ/" label="North edge of F01" />);
    expect(screen.getByRole("img", { name: "North edge of F01: AQ/" })).toBeInTheDocument();
  });

  it("reverses the drawing order and says so", () => {
    const { container } = render(<EdgeBeads edge="ABC" reversed label="Edge B" />);
    expect(beads(container).map((x) => x.title)).toEqual(["C", "B", "A"]);
    expect(screen.getByRole("img", { name: "Edge B (reversed): ABC" })).toBeInTheDocument();
  });

  it("handles an empty edge", () => {
    const { container } = render(<EdgeBeads edge="" label="Empty" />);
    expect(beads(container)).toHaveLength(0);
    expect(screen.getByRole("img", { name: "Empty: empty" })).toBeInTheDocument();
    expect(container).toHaveTextContent("(empty edge)");
  });

  it("marks unknown symbols with a visible fallback bead", () => {
    const { container } = render(<EdgeBeads edge="A!" />);
    const [known, unknown] = beads(container);
    expect(known).not.toHaveClass("bead-unknown");
    expect(unknown).toHaveClass("bead-unknown");
    expect(unknown).toHaveTextContent("?");
    expect(unknown.title).toContain("not in the 4-level palette");
  });

  it("can print the symbols inside the beads", () => {
    const { container } = render(<EdgeBeads edge="AB" showSymbols />);
    expect(container).toHaveTextContent("AB");
  });

  it("highlights [from, to) ranges by kind, in the string's own indices even when reversed", () => {
    const { container } = render(<EdgeBeads edge="ABCD" reversed highlight={[{ from: 1, to: 3, kind: "motif" }]} />);
    // drawn order D C B A -> highlighted symbols are B and C
    expect(beads(container).map((x) => x.dataset.kind ?? "")).toEqual(["", "motif", "motif", ""]);
    expect(beads(container)[1]).toHaveClass("bead-hl-motif");
  });

  it("outlines the strip with the side token and honours size and levels", () => {
    const { container } = render(<EdgeBeads edge="A" side="E" size="lg" levels={2} />);
    expect(screen.getByRole("img")).toHaveClass("beads-side-e", "beads-lg");
    expect(beads(container)[0]).toHaveStyle({ backgroundColor: "rgb(64, 64, 64)" });
  });
});

describe("StripSwatches", () => {
  it("renders one swatch per sample, with the numeric colour", () => {
    const { container } = render(
      <StripSwatches
        label="North numeric strip"
        strip={[
          [10, 20, 30],
          [200.4, 100, 0],
        ]}
      />,
    );
    const b = beads(container);
    expect(b).toHaveLength(2);
    expect(b[1]).toHaveStyle({ backgroundColor: "rgb(200, 100, 0)" });
    expect(screen.getByRole("img", { name: "North numeric strip: 10,20,30 200,100,0" })).toBeInTheDocument();
  });
  it("handles an empty strip", () => {
    const { container } = render(<StripSwatches label="x" strip={[]} />);
    expect(container).toHaveTextContent("(no samples)");
  });
});
