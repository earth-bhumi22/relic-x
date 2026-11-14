// Owner: A (Arvind) — placeholder; replaced by T23.
import { Link } from "react-router-dom";
import { listArtifacts } from "../api/client";
import PlaceholderPage from "./PlaceholderPage";

export default function ProjectsPage() {
  return (
    <PlaceholderPage
      title="Projects"
      ticket="T23"
      description="Artifact cards and the create-artifact wizard will live here."
      load={() => listArtifacts()}
      isEmpty={(a) => a.length === 0}
      summarize={(artifacts) => (
        <ul className="plain-list">
          {artifacts.map((a) => (
            <li key={a.id}>
              <Link to={`/artifacts/${a.id}/gallery`}>{a.name}</Link>{" "}
              <span className="muted">
                · {a.fragment_count} fragments · {a.run_count} runs
              </span>
            </li>
          ))}
        </ul>
      )}
    />
  );
}
