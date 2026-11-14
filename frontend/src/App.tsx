// Owner: A (Arvind)
import { BrowserRouter } from "react-router-dom";
import { AppRoutes, ROUTER_FUTURE } from "./routes";
import { ThemeProvider } from "./theme";

export default function App() {
  return (
    <BrowserRouter future={ROUTER_FUTURE}>
      <ThemeProvider>
        <AppRoutes />
      </ThemeProvider>
    </BrowserRouter>
  );
}
