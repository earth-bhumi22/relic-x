// Owner: A (Arvind)
// Remembers, for this browser session (tab), that the visitor has seen the intro page; opening the link anew shows it again. Storage access is wrapped in try/catch (private windows,
// blocked site data): if it fails, the intro simply shows again.
export const INTRO_KEY = "relicx-intro-seen";

export function hasSeenIntro(): boolean {
  try {
    return window.sessionStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return true; // cannot remember anything, so never trap the visitor in a redirect loop
  }
}

export function markIntroSeen(): void {
  try {
    window.sessionStorage.setItem(INTRO_KEY, "1");
  } catch {
    /* not persisted */
  }
}
