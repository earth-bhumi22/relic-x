// Owner: A (Arvind)
// Tiny data-loading hook shared by every page: {status, data, error, reload}.
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/errors";

export type AsyncState<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: undefined; error: ApiError | Error };

/** Runs `fn` on mount and whenever `deps` change; `reload()` re-runs it (used by retry buttons). */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    latest.current().then(
      (data) => !cancelled && setState({ status: "success", data }),
      (error: unknown) =>
        !cancelled && setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload } as AsyncState<T> & { reload: () => void };
}
