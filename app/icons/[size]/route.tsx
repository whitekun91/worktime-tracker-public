import { ImageResponse } from "next/og";

export const runtime = "edge";

function PwaIconMarkup({ s }: { s: number }) {
  const k = s / 64;
  const rOuter = Math.round(14 * k);
  const clock = Math.round(36 * k);
  const rClock = Math.round(18 * k);
  const bw = Math.max(2, Math.round(3 * k));

  return (
    <div
      style={{
        width: s,
        height: s,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(145deg, #6ee7b7 0%, #10b981 42%, #047857 100%)",
        borderRadius: rOuter,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          width: clock,
          height: clock,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: rClock,
          border: `${bw}px solid rgba(255,255,255,0.95)`,
          background: "rgba(255,255,255,0.14)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: Math.round(17 * k),
            top: Math.round(8 * k),
            width: Math.max(2, Math.round(3 * k)),
            height: Math.round(13 * k),
            borderRadius: Math.max(1, Math.round(2 * k)),
            background: "rgba(255,255,255,0.98)",
            transform: "rotate(-12deg)",
            transformOrigin: "50% 100%",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: Math.round(18 * k),
            top: Math.round(17 * k),
            width: Math.round(14 * k),
            height: Math.max(2, Math.round(3 * k)),
            borderRadius: Math.max(1, Math.round(2 * k)),
            background: "rgba(255,255,255,0.98)",
          }}
        />
        <div
          style={{
            width: Math.max(4, Math.round(6 * k)),
            height: Math.max(4, Math.round(6 * k)),
            borderRadius: Math.max(2, Math.round(3 * k)),
            background: "white",
          }}
        />
      </div>
    </div>
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ size: string }> }
) {
  const { size: raw } = await context.params;
  const s = raw === "512" ? 512 : raw === "192" ? 192 : null;
  if (!s) {
    return new Response("Not Found", { status: 404 });
  }

  return new ImageResponse(<PwaIconMarkup s={s} />, {
    width: s,
    height: s,
  });
}
