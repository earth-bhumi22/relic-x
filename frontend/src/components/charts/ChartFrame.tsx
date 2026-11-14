// Owner: A (Arvind)
// Frame shared by every chart: title, a one-line description, the chart itself inside an error boundary, a legend that
// does not depend on colour, and the same numbers as a table under a collapsed <details> (the text alternative).
import { useId } from "react";
import type { ReactNode } from "react";
import WhyBoundary from "../why/WhyBoundary";

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
  legend?: ReactNode;
  note?: ReactNode;
  /** The data table (text alternative). */
  table: ReactNode;
}

export default function ChartFrame({ title, description, children, legend, note, table }: Props) {
  const captionId = useId();
  return (
    <figure className="chart-frame" aria-labelledby={captionId}>
      <figcaption id={captionId}>
        <strong>{title}</strong>
        {description && <span className="muted"> {description}</span>}
      </figcaption>
      <WhyBoundary
        title="This chart could not be drawn"
        message="The data has a shape the chart does not understand. The table below still shows the numbers."
      >
        {children}
      </WhyBoundary>
      {legend}
      {note && <p className="muted chart-note">{note}</p>}
      <details className="chart-data">
        <summary>Data table for “{title}”</summary>
        <div className="table-scroll">{table}</div>
      </details>
    </figure>
  );
}
