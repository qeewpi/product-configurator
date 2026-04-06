import { NextRequest, NextResponse } from "next/server";
import { traceRasterBufferToSvg } from "@/lib/server/vtracer";
import { normalizeTraceSettings } from "@/lib/trace-settings";

export const runtime = "nodejs";

function parseOptionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const numericValue = Number.parseFloat(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File;
    const styleValue = formData.get("style");
    const presetValue = formData.get("preset");
    const hierarchicalValue = formData.get("hierarchical");
    const curveModeValue = formData.get("curveMode");

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const style = styleValue === "lineart" ? "lineart" : "color";
    const preset =
      presetValue === "quick" ||
      presetValue === "balanced" ||
      presetValue === "detailed" ||
      presetValue === "custom"
        ? presetValue
        : "balanced";
    const hierarchical =
      hierarchicalValue === "stacked" ? "stacked" : "cutout";
    const curveMode =
      curveModeValue === "pixel" ||
      curveModeValue === "polygon" ||
      curveModeValue === "spline"
        ? curveModeValue
        : "spline";
    const traceSettings = normalizeTraceSettings({
      style,
      preset,
      hierarchical,
      curveMode,
      filterSpeckle: parseOptionalNumber(formData.get("filterSpeckle")) ?? undefined,
      cornerThreshold: parseOptionalNumber(formData.get("cornerThreshold")) ?? undefined,
      lengthThreshold: parseOptionalNumber(formData.get("lengthThreshold")) ?? undefined,
      spliceThreshold: parseOptionalNumber(formData.get("spliceThreshold")) ?? undefined,
      pathPrecision: parseOptionalNumber(formData.get("pathPrecision")) ?? undefined,
      colorPrecision: parseOptionalNumber(formData.get("colorPrecision")) ?? undefined,
      layerDifference: parseOptionalNumber(formData.get("layerDifference")) ?? undefined,
    });

    const arrayBuffer = await file.arrayBuffer();
    const svg = await traceRasterBufferToSvg({
      buffer: Buffer.from(arrayBuffer),
      fileName: file.name,
      mimeType: file.type,
      traceSettings,
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
