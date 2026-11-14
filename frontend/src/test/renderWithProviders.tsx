// Owner: A (Arvind)
// Renders UI inside the same providers the real app has: a MemoryRouter (starting at `route`) and the theme.
// Usage:  renderWithProviders(<GalleryPage />, { route: "/artifacts/abc/gallery", path: "/artifacts/:id/gallery" })
// Pass `path` when the component reads route params (useParams) and is not already rendered by AppRoutes.
import { render } from "@testing-library/react";
import type { RenderOptions, RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ROUTER_FUTURE } from "../routes";
import { ThemeProvider } from "../theme";

interface Options extends Omit<RenderOptions, "wrapper"> {
  /** Initial URL. Default "/". */
  route?: string;
  /** Route pattern to mount `ui` at, so useParams works. Omit to render `ui` at any URL. */
  path?: string;
}

export function renderWithProviders(ui: ReactElement, { route = "/", path, ...options }: Options = {}): RenderResult {
  const content = path ? (
    <Routes>
      <Route path={path} element={ui} />
    </Routes>
  ) : (
    ui
  );
  return render(
    <MemoryRouter initialEntries={[route]} future={ROUTER_FUTURE}>
      <ThemeProvider>{content}</ThemeProvider>
    </MemoryRouter>,
    options,
  );
}
