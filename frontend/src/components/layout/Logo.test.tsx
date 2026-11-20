// Owner: A (Arvind)
// The mark is decorative: four shards, hidden from assistive tech (the wordmark next to it carries the name).
/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import { render } from "@testing-library/react";
import Logo from "./Logo";

describe("Logo", () => {
  it("draws four shards (one per edge) and is hidden from screen readers", () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("polygon")).toHaveLength(4);
  });

  it("honours a custom size", () => {
    const { container } = render(<Logo size="3rem" />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "3rem");
  });
});
