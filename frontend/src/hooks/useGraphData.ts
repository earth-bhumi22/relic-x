// Owner: A (Arvind)
// Loads GET /graph for the current controls. Stale responses are ignored (a slow earlier request never overwrites a
// newer one) and the previous graph stays available while the next one loads (`loading` is a busy flag, not a reset).
import { useCallback, useEffect, useRef, useState } from "react";
import { getGraph } from "../api/client";
import type { ApiError } from "../api/errors";
import type { GraphOut, Traversal } from "../api/types";

export interface GraphParams {
  threshold: number;
  topK: number | null;
  traversal: Traversal;
}

export function useGraphData(artifactId: string, params: GraphParams, enabled = true) {
  const [data, setData] = useState<GraphOut | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);
  const lastId = useRef(artifactId);

  useEffect(() => {
    if (!enabled) return;
    const mine = ++latest.current;
    if (lastId.current !== artifactId) {
      lastId.current = artifactId;
      setData(null); // a different artifact: never show the old one
    }
    setLoading(true);
    getGraph(artifactId, {
      threshold: params.threshold,
      ...(params.topK !== null ? { top_k: params.topK } : {}),
      traversal: params.traversal,
    }).then(
      (g) => {
        if (mine !== latest.current) return; // stale
        setData(g);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (mine !== latest.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      },
    );
  }, [artifactId, params.threshold, params.topK, params.traversal, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/** `value`, but only after it has stopped changing for `delayMs`. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    if (delayMs <= 0) {
      setOut(value);
      return;
    }
    const t = setTimeout(() => setOut(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return out;
}
