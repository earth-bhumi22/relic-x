// Owner: A (Arvind)
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "../api/errors";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import Loading from "./Loading";

describe("Loading", () => {
  it("announces itself politely with a default label", () => {
    render(<Loading />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("accepts a custom label", () => {
    render(<Loading label="Fetching graph…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Fetching graph…");
  });
});

describe("EmptyState", () => {
  it("shows title and message", () => {
    render(<EmptyState title="No fragments" message="Create an artifact first." />);
    expect(screen.getByText("No fragments")).toBeInTheDocument();
    expect(screen.getByText("Create an artifact first.")).toBeInTheDocument();
  });

  it("works with only a title and renders an action when given", () => {
    const { rerender } = render(<EmptyState title="Nothing" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<EmptyState title="Nothing" action={<button type="button">Create one</button>} />);
    expect(screen.getByRole("button", { name: "Create one" })).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("shows the API error code and message and retries", () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new ApiError(409, "precondition_failed", "run matching first")} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("precondition_failed");
    expect(screen.getByRole("alert")).toHaveTextContent("run matching first");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("falls back to client_error for a plain Error", () => {
    render(<ErrorState error={new Error("render exploded")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("client_error");
    expect(screen.getByRole("alert")).toHaveTextContent("render exploded");
  });

  it("hides the retry button when no handler is given", () => {
    render(<ErrorState error={new ApiError(404, "not_found", "gone")} />);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
