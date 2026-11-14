// Owner: A (Arvind)
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState";

export default function NotFoundPage() {
  return (
    <section>
      <h1>Page not found</h1>
      <EmptyState title="404 · nothing lives at this address" message="Check the URL or head back to your projects." action={<Link to="/">Go to Projects</Link>} />
    </section>
  );
}
