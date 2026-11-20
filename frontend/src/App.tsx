// Owner: A (Arvind)
import { useEffect } from "react";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { AppRoutes, ROUTER_FUTURE } from "./routes";
import { ThemeProvider } from "./theme";
import { hasSeenIntro } from "./lib/intro";

/** Opening the site at the home page: send the visitor to the intro first (once per browser session). Deep links are never redirected. */
function FirstVisitGate() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (pathname === "/" && !hasSeenIntro()) navigate("/welcome", { replace: true });
  }, [pathname, navigate]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter future={ROUTER_FUTURE}>
      <ThemeProvider>
        <FirstVisitGate />
        <AppRoutes />
      </ThemeProvider>
    </BrowserRouter>
  );
}
