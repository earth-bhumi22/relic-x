// Owner: A (Arvind)
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import Modal from "./Modal";

function Harness({ busy = false }: { busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      {open && (
        <Modal title="Title" onClose={() => setOpen(false)} busy={busy}>
          <button>first</button>
          <button>last</button>
        </Modal>
      )}
    </>
  );
}

describe("Modal", () => {
  it("is a labelled, modal dialog; focuses inside; wraps Tab and Shift+Tab; returns focus on Escape", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "open" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Title" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });
    expect(first).toHaveFocus();
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("pulls focus back in if it escaped the dialog", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    screen.getByRole("button", { name: "open" }).focus();
    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  it("closes on a backdrop click but not on a click inside, and not while busy", () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("modal-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmount();

    render(<Harness busy />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    fireEvent.mouseDown(screen.getByTestId("modal-backdrop"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
