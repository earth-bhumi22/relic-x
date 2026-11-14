// Owner: A (Arvind)
import { Link, NavLink, useMatch } from "react-router-dom";
import ApiStatus from "./ApiStatus";
import ThemeToggle from "./ThemeToggle";

const link = ({ isActive }: { isActive: boolean }) => (isActive ? "nav-link active" : "nav-link");

export default function Navbar() {
  // Artifact sub-links only exist inside /artifacts/:id/*.
  const artifact = useMatch("/artifacts/:id/*");
  const id = artifact?.params.id;
  return (
    <header className="navbar">
      <div className="navbar-row">
        <Link to="/" className="brand">
          RELIC-X
        </Link>
        <nav aria-label="Main" className="nav">
          <NavLink to="/" end className={link}>
            Projects
          </NavLink>
          <NavLink to="/lab" className={link}>
            Lab
          </NavLink>
        </nav>
        <div className="navbar-end">
          <ApiStatus />
          <ThemeToggle />
        </div>
      </div>
      {id && (
        <nav aria-label="Artifact" className="nav nav-sub">
          <NavLink to={`/artifacts/${id}/gallery`} className={link}>
            Gallery
          </NavLink>
          <NavLink to={`/artifacts/${id}/graph`} className={link}>
            Graph
          </NavLink>
          <NavLink to={`/artifacts/${id}/reconstruct`} className={link}>
            Reconstruct
          </NavLink>
        </nav>
      )}
    </header>
  );
}
