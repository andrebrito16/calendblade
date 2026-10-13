import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { brand } from "@/lib/brand";

export const alt = brand.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.hero" });
  const meta = await getTranslations({ locale, namespace: "metadata" });
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "linear-gradient(135deg, #eef2ff 0%, #ffffff 55%, #ecfeff 100%)",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", position: "relative", width: 64, height: 64 }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 6,
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#a5b4fc",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 20,
              top: 18,
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#4f46e5",
            }}
          />
        </div>
        <span style={{ fontSize: 40, fontWeight: 700, color: "#18181b" }}>{brand.name}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <span
          style={{ fontSize: 76, fontWeight: 700, color: "#18181b", letterSpacing: -2, lineHeight: 1.05 }}
        >
          {t("title")}
        </span>
        <span style={{ fontSize: 30, color: "#52525b", maxWidth: 960, lineHeight: 1.35 }}>
          {meta("description")}
        </span>
      </div>
    </div>,
    size,
  );
}
