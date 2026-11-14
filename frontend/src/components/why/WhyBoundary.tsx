// Owner: A (Arvind)
// Error boundary for the drawer's content: a payload the drawer cannot draw shows a message instead of crashing.
import { Component } from "react";
import type { ReactNode } from "react";

interface State {
  failed: boolean;
}

export default class WhyBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="state state-error" role="alert">
        <p className="state-title">The explanation could not be drawn</p>
        <p>The server answered with data in a shape this page does not understand. Try another edge, or reload.</p>
      </div>
    );
  }
}
