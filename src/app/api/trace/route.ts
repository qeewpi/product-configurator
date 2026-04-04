import { NextRequest, NextResponse } from "next/server";
import { traceRasterBufferToSvg } from "@/lib/server/vtracer";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File;
    const qualityValue = formData.get("quality");
    const styleValue = formData.get("style");
    const quality =
      qualityValue === "fast" ||
      qualityValue === "balanced" ||
      qualityValue === "detailed"
        ? qualityValue
        : "balanced";
    const style = styleValue === "lineart" ? "lineart" : "default";

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const svg = await traceRasterBufferToSvg({
      buffer: Buffer.from(arrayBuffer),
      fileName: file.name,
      mimeType: file.type,
      quality,
      style,
    });

    return NextResponse.json({ svg });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process image",
      },
      { status: 500 }
    );
  }
}
