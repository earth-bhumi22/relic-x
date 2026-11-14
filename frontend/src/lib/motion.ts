// Owner: A (Arvind)
/** Reduced motion: players do not animate; the final state is shown and playback is step-on-demand. */
export const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
};
