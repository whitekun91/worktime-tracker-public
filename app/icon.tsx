import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

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
          background: "linear-gradient(145deg, #6ee7b7 0%, #10b981 42%, #047857 100%)",
          borderRadius: 14,
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            width: 36,
            height: 36,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 18,
            border: "3px solid rgba(255,255,255,0.95)",
            background: "rgba(255,255,255,0.14)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 17,
              top: 8,
              width: 3,
              height: 13,
              borderRadius: 2,
              background: "rgba(255,255,255,0.98)",
              transform: "rotate(-12deg)",
              transformOrigin: "50% 100%",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 18,
              top: 17,
              width: 14,
              height: 3,
              borderRadius: 2,
              background: "rgba(255,255,255,0.98)",
            }}
          />
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: "white",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
