// Owner: A (Arvind)
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "../api/errors";
import { useAsync } from "./useAsync";

/** A promise the test resolves or rejects by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAsync", () => {
  it("goes loading → success", async () => {
    const d = deferred<string>();
    const { result } = renderHook(() => useAsync(() => d.promise, []));
    expect(result.current.status).toBe("loading");
    await act(async () => d.resolve("data"));
    expect(result.current).toMatchObject({ status: "success", data: "data" });
  });

  it("goes loading → error and keeps the ApiError", async () => {
    const err = new ApiError(404, "not_found", "gone");
    const { result } = renderHook(() => useAsync(() => Promise.reject(err), []));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe(err);
  });

  it("wraps a non-Error rejection in an Error", async () => {
    const { result } = renderHook(() => useAsync(() => Promise.reject("plain string"), []));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("plain string");
  });

  it("reload() runs the function again and shows loading in between", async () => {
    const fn = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const { result } = renderHook(() => useAsync(fn, []));
    await waitFor(() => expect(result.current.data).toBe("first"));
    act(() => result.current.reload());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.data).toBe("second"));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("re-runs when deps change", async () => {
    const fn = vi.fn((id: string) => Promise.resolve(`artifact ${id}`));
    const { result, rerender } = renderHook(({ id }) => useAsync(() => fn(id), [id]), { initialProps: { id: "a" } });
    await waitFor(() => expect(result.current.data).toBe("artifact a"));
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.data).toBe("artifact b"));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not re-run on a re-render with the same deps", async () => {
    const fn = vi.fn().mockResolvedValue("x");
    const { result, rerender } = renderHook(() => useAsync(fn, []));
    await waitFor(() => expect(result.current.status).toBe("success"));
    rerender();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale response that arrives after the deps changed", async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const { result, rerender } = renderHook(
      ({ id }) => useAsync(() => (id === "slow" ? slow.promise : fast.promise), [id]),
      {
        initialProps: { id: "slow" },
      },
    );
    rerender({ id: "fast" });
    await act(async () => fast.resolve("fast result"));
    await act(async () => slow.resolve("stale result"));
    expect(result.current.data).toBe("fast result");
  });

  it("is safe to unmount before the promise settles (no state update, no console error)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = deferred<string>();
    const bad = deferred<string>();
    const { unmount: unmountFirst } = renderHook(() => useAsync(() => ok.promise, []));
    const { unmount: unmountSecond } = renderHook(() => useAsync(() => bad.promise, []));
    unmountFirst();
    unmountSecond();
    await act(async () => {
      ok.resolve("late");
      bad.reject(new Error("late failure"));
    });
    expect(consoleError).not.toHaveBeenCalled();
  });
});
