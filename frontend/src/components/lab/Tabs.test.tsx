// Owner: A (Arvind)
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import Tabs from "./Tabs";

function Harness() {
  const [active, setActive] = useState("a");
  return (
    <Tabs
      active={active}
      onChange={setActive}
      tabs={[
        { id: "a", label: "First", content: <p>panel a</p> },
        { id: "b", label: "Second", content: <p>panel b</p> },
        { id: "c", label: "Third", content: <p>panel c</p> },
      ]}
    />
  );
}

const key = (name: string, k: string) => fireEvent.keyDown(screen.getByRole("tab", { name }), { key: k });

describe("Tabs", () => {
  it("exposes tab roles, a selected tab and one visible panel", () => {
    render(<Harness />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "First" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "First" })).toBeVisible();
    expect(screen.queryByRole("tabpanel", { name: "Second" })).not.toBeInTheDocument(); // hidden = out of the a11y tree
  });
  it("keeps hidden panels mounted so their state survives a tab switch", () => {
    render(<Harness />);
    expect(screen.getByText("panel b")).toBeInTheDocument();
  });
  it("switches on click and with the arrow, Home and End keys (roving tabindex)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "Second" }));
    expect(screen.getByRole("tab", { name: "Second" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "First" })).toHaveAttribute("tabindex", "-1");
    key("Second", "ArrowRight");
    expect(screen.getByRole("tab", { name: "Third" })).toHaveFocus();
    key("Third", "ArrowRight");
    expect(screen.getByRole("tab", { name: "First" })).toHaveAttribute("aria-selected", "true");
    key("First", "ArrowLeft");
    expect(screen.getByRole("tab", { name: "Third" })).toHaveAttribute("aria-selected", "true");
    key("Third", "Home");
    expect(screen.getByRole("tab", { name: "First" })).toHaveFocus();
    key("First", "End");
    expect(screen.getByRole("tab", { name: "Third" })).toHaveFocus();
  });
});
