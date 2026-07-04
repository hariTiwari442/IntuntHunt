import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

// Social share card (also used as the Twitter image automatically).
export const alt = `${siteConfig.name} — find buyers across Reddit, LinkedIn & Twitter`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Edge runtime: @vercel/og's WASM build renders portably (incl. local Windows)
// and avoids the Node static-export crash.
export const runtime = "edge";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "#faf8f3",
          backgroundImage:
            "radial-gradient(circle at 12% 0%, rgba(22,163,74,0.12), transparent 45%), radial-gradient(circle at 90% 100%, rgba(34,211,238,0.12), transparent 45%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              background: "linear-gradient(135deg, #16a34a 0%, #22d3ee 100%)",
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="white">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#18181b" }}>
            {siteConfig.name}
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: "#18181b",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              maxWidth: 980,
            }}
          >
            Find people asking about what you sell
          </div>
          <div style={{ fontSize: 32, color: "#52525b", maxWidth: 900 }}>
            High-intent conversations across Reddit, LinkedIn &amp; Twitter — scored,
            ranked, and ready to reply.
          </div>
        </div>

        {/* Platform chips */}
        <div style={{ display: "flex", gap: 16 }}>
          {["Reddit", "LinkedIn", "Twitter"].map((p) => (
            <div
              key={p}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 28px",
                borderRadius: 999,
                background: "#ffffff",
                border: "1px solid #e8e2d5",
                fontSize: 26,
                fontWeight: 600,
                color: "#18181b",
              }}
            >
              {p}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
