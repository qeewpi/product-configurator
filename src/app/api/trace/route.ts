import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // For MVP: wrap the raster image in an SVG container
    // This preserves the image for preview purposes
    // A proper potrace-based tracing can be added later
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    const mimeType = file.type || "image/png";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="512" viewBox="0 0 512 512">
  <image href="data:${mimeType};base64,${base64}" width="512" height="512" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

    return NextResponse.json({ svg });
  } catch {
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    );
  }
}
