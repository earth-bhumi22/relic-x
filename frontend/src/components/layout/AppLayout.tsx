// Owner: A (Arvind)
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";

export default function AppLayout() {
  return (
    <div className="app">
      <Navbar />
      <main className="main">
        <Outlet />
      </main>
      <footer className="footer">RELIC-X · fragment reconstruction lab · v0.1</footer>
    </div>
  );
}
