// Owner: A (Arvind)
// Route table for the whole app. Later pages (T23–T28) replace the page components only.
// The "Why matched?" drawer (T26) is not a route.
import { useRoutes } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import GalleryPage from "./pages/GalleryPage";
import GraphPage from "./pages/GraphPage";
import LabPage from "./pages/LabPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProjectsPage from "./pages/ProjectsPage";
import ReconstructPage from "./pages/ReconstructPage";

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <ProjectsPage /> },
      { path: "/artifacts/:id/gallery", element: <GalleryPage /> },
      { path: "/artifacts/:id/graph", element: <GraphPage /> },
      { path: "/artifacts/:id/reconstruct", element: <ReconstructPage /> },
      { path: "/lab", element: <LabPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

/** Opt in to React Router v7 behaviour now, so upgrading later is not a surprise (and v6 stays quiet). */
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

export function AppRoutes() {
  return useRoutes(routes);
}
