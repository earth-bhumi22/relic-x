// Owner: A (Arvind)
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "../api/errors";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import Loading from "./Loading";

describe("shared state components", () => {
  it("Loading announces itself", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("EmptyState shows title and message", () => {
    render(<EmptyState title="No fragments" message="Create an artifact first." />);
    expect(screen.getByText("No fragments")).toBeInTheDocument();
    expect(screen.getByText("Create an artifact first.")).toBeInTheDocument();
  });

  it("ErrorState shows the API error code and message and retries", () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new ApiError(409, "precondition_failed", "run matching first")} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("precondition_failed");
    expect(screen.getByRole("alert")).toHaveTextContent("run matching first");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
