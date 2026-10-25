import { Component, type ReactNode } from "react";

/**
 * Keeps a failure in the conversation or progress additions from taking the
 * console down: the robots, agent and voice keep running, and a short note
 * says what is missing.
 */
export class Contained extends Component<
  { label: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`${this.props.label} failed`, error);
  }

  render() {
    if (this.state.failed)
      return (
        <p role="status" data-testid="contained-failure">
          {this.props.label} unavailable.
        </p>
      );
    return this.props.children;
  }
}
