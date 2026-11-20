// Owner: A (Arvind)
// Remembers that the visitor has seen the intro page. Storage access is wrapped in try/catch (private windows,
// blocked site data): if it fails, the intro simply shows again on the next visit.
export const INTRO_KEY = "relicx-intro-seen";

export function hasSeenIntro(): boolean {
  try {
    return window.localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return true; // cannot remember anything, so never trap the visitor in a redirect loop
  }
}

export function markIntroSeen(): void {
  try {
    window.localStorage.setItem(INTRO_KEY, "1");
  } catch {
    /* not persisted */
  }
}
