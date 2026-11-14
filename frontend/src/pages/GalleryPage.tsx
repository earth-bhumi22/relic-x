// Owner: A (Arvind) — placeholder; replaced by T24.
import { useParams } from "react-router-dom";
import { listFragments } from "../api/client";
import PlaceholderPage from "./PlaceholderPage";

export default function GalleryPage() {
  const { id = "" } = useParams();
  return (
    <PlaceholderPage
      title="Fragment gallery"
      ticket="T24"
      description="Scrambled pieces; click one to see its four edge strings as colour beads."
      load={() => listFragments(id)}
      deps={[id]}
      isEmpty={(f) => f.length === 0}
      summarize={(frags) => (
        <div className="thumbs">
          {frags.map((f) => (
            <img key={f.id} src={f.image_url} alt={f.label} width={64} height={64} />
          ))}
        </div>
      )}
    />
  );
}
