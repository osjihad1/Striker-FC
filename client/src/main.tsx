import { spaceQueryClient } from "@hatch/space-sdk/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ui/components/ErrorBoundary";
import "./theme.css";

const rootEl = document.querySelector<HTMLElement>("[data-generated-space-root]");
if (!rootEl) {
  throw new Error("missing generated space root element");
}

// If you edit this file: keep `<QueryClientProvider client={spaceQueryClient}>`
// wrapping the app (every space shares the SDK's QueryClient), and keep
// BOTH the `hatch-space-root` class AND the `data-hatch-space-root`
// attribute on the outer div. The SDK styles select on
// `.hatch-space-root[data-hatch-space-root]` to apply mobile safe-area
// insets (notches, gesture bars, etc.), correct viewport sizing, and the
// hosting header/chrome offsets — dropping either breaks layout silently.
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={spaceQueryClient}>
      <div className="hatch-space-root" data-hatch-space-root>
        {/* Root containment: any unexpected throw during first render shows
            this recovery panel instead of a blank page on the phone. */}
        <ErrorBoundary
          fallback={() => (
            <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
              <p style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 28, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>
                Striker FC hit a snag
              </p>
              <p style={{ maxWidth: 340, fontSize: 14, lineHeight: 1.5, opacity: 0.75 }}>
                The game failed to start on this device. Your club and save are stored safely — reload to try again.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ borderRadius: 8, background: "#a3e635", color: "#0a120c", padding: "10px 18px", fontSize: 14, fontWeight: 700 }}
              >
                Reload Striker FC
              </button>
            </div>
          )}
        >
          <App />
        </ErrorBoundary>
      </div>
    </QueryClientProvider>
  </StrictMode>,
);
