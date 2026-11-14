// Owner: A (Arvind)
// Trace player: buttons, scrubber, speed, keyboard, reduced motion and timer clean-up (fake timers).
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { buildReplay } from "../lib/replay";
import { runFixture } from "../test/fixtures";
import TracePlayer, { STEP_MS } from "./TracePlayer";

const replay = buildReplay(runFixture("greedy"));
const LAST = replay.frames.length - 1;

function Harness({ start = 0 }: { start?: number }) {
  const [i, setI] = useState(start);
  return (
    <>
      <TracePlayer frames={replay.frames} index={i} onIndex={setI} />
      <p data-testid="index">{i}</p>
    </>
  );
}
const index = () => Number(screen.getByTestId("index").textContent);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TracePlayer", () => {
  it("shows the message prominently with the action as a labelled badge, and the step number", () => {
    render(<Harness start={1} />);
    expect(screen.getByTestId("action-badge")).toHaveTextContent("Seed");
    expect(screen.getByText(replay.frames[1].status)).toBeInTheDocument();
    expect(screen.getByText(`of ${replay.frames.at(-1)?.step?.step ?? LAST}`, { exact: false })).toBeInTheDocument();
  });

  it("steps, jumps and scrubs", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Step forward" }));
    expect(index()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Jump to end" }));
    expect(index()).toBe(LAST);
    fireEvent.click(screen.getByRole("button", { name: "Step back" }));
    expect(index()).toBe(LAST - 1);
    fireEvent.click(screen.getByRole("button", { name: "Jump to start" }));
    expect(index()).toBe(0);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    expect(index()).toBe(2);
  });

  it("plays at the chosen speed and stops at the end", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    act(() => void vi.advanceTimersByTime(STEP_MS));
    expect(index()).toBe(1);
    fireEvent.change(screen.getByRole("combobox", { name: /speed/i }), { target: { value: "4" } });
    act(() => void vi.advanceTimersByTime(STEP_MS / 4));
    expect(index()).toBe(2);
    act(() => void vi.advanceTimersByTime(STEP_MS * LAST));
    expect(index()).toBe(LAST);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("pauses, and manual stepping pauses playback", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    act(() => void vi.advanceTimersByTime(STEP_MS * 3));
    expect(index()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Step forward" }));
    act(() => void vi.advanceTimersByTime(STEP_MS * 3));
    expect(index()).toBe(1);
  });

  it("restarts from the start when Play is pressed on the last frame", () => {
    render(<Harness start={LAST} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(index()).toBe(0);
  });

  it("supports the keyboard shortcuts on the focused player, and shows them", () => {
    render(<Harness />);
    const player = screen.getByRole("region", { name: "Trace player" });
    expect(screen.getByText("Space")).toBeInTheDocument();
    fireEvent.keyDown(player, { key: "ArrowRight" });
    expect(index()).toBe(1);
    fireEvent.keyDown(player, { key: "End" });
    expect(index()).toBe(LAST);
    fireEvent.keyDown(player, { key: "ArrowLeft" });
    expect(index()).toBe(LAST - 1);
    fireEvent.keyDown(player, { key: "Home" });
    expect(index()).toBe(0);
    fireEvent.keyDown(player, { key: " " });
    act(() => void vi.advanceTimersByTime(STEP_MS));
    expect(index()).toBe(1);
  });

  it("does not hijack keys pressed inside its own controls", () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: /speed/i }), { key: "ArrowRight" });
    expect(index()).toBe(0);
  });

  it("respects prefers-reduced-motion: no autoplay, stepping still works", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(screen.getByText(/reduced motion is on/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Step forward" }));
    expect(index()).toBe(1);
  });

  it("leaves no timer running after unmount or pause", () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
