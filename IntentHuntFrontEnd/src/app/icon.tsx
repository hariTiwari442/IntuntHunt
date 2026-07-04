import { ImageResponse } from "next/og";

// Favicon — generated so no binary asset is needed. Mirrors the in-app
// gradient "Zap" logo (green → cyan).
export const size = { width: 32, height: 32 };
export const contentType = "image/png";
// Edge runtime: portable @vercel/og WASM rendering; avoids the Node static-export crash.
export const runtime = "edge";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          background: "linear-gradient(135deg, #16a34a 0%, #22d3ee 100%)",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
