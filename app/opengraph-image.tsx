import { ImageResponse } from "next/og";

// Branded social-preview card shown when the deployed link is shared (submission, judges, socials).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "TasteTrail — your taste, your India";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#faf6ee",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: "#8a7f6b", fontSize: 30 }}>
          <div style={{ width: 16, height: 16, borderRadius: 999, background: "#e2550e" }} />
          TasteTrail
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 88, color: "#2b2620", lineHeight: 1.05, display: "flex", flexWrap: "wrap" }}>
            Your taste, your{" "}
            <span style={{ color: "#e2550e", marginLeft: 16 }}>India.</span>
          </div>
          <div style={{ fontSize: 36, color: "#6b6150", maxWidth: 920, lineHeight: 1.3 }}>
            Qloo&apos;s Taste AI turns what you love into a trip — with real places verified by creators.
          </div>
        </div>

        <div style={{ display: "flex", gap: 40, fontSize: 28, color: "#2b2620" }}>
          <span style={{ display: "flex" }}>
            <b style={{ color: "#0d6e5b", marginRight: 10 }}>1,500+</b> verified places
          </span>
          <span style={{ display: "flex" }}>
            <b style={{ color: "#0d6e5b", marginRight: 10 }}>100+</b> cities
          </span>
          <span style={{ display: "flex" }}>
            <b style={{ color: "#0d6e5b", marginRight: 10 }}>70+</b> creators
          </span>
        </div>
      </div>
    ),
    size,
  );
}
