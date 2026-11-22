// Striker FC — ui/components/ErrorBoundary.tsx
// Last-resort containment: a throw anywhere inside the wrapped subtree (most
// importantly the three.js stadium, whose WebGL context creation can be
// refused by a phone GPU/WebView) renders the supplied fallback instead of
// unmounting the whole app to a blank page. `reset` clears the failure so
// the fallback's retry button can remount the subtree.

import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(): void {
    // The fallback UI is the user surface; nothing else to report to.
  }

  private reset = (): void => {
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    if (this.state.failed) return this.props.fallback(this.reset);
    return this.props.children;
  }
}
