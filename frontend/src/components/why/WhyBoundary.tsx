// Owner: A (Arvind)
// Error boundary for the drawer's content: a payload the drawer cannot draw shows a message instead of crashing.
import { Component } from "react";
import type { ReactNode } from "react";

interface State {
  failed: boolean;
}

interface Props {
  children: ReactNode;
  title?: string;
  message?: string;
}

export default class WhyBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="state state-error" role="alert">
        <p className="state-title">{this.props.title ?? "The explanation could not be drawn"}</p>
        <p>
          {this.props.message ??
            "The server answered with data in a shape this page does not understand. Try another edge, or reload."}
        </p>
      </div>
    );
  }
}
