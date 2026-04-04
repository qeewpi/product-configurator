import type { ExportQuality } from "@/types/design";

type TraceRasterOptions = {
  fileName?: string;
  quality?: ExportQuality;
  style?: "default" | "lineart";
};

async function readTraceResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string; svg?: string }
    | null;

  if (!response.ok || !payload?.svg) {
    throw new Error(payload?.error ?? "Failed to convert image to SVG");
  }

  return payload.svg;
}

export async function traceRasterBlobToSvg(
  blob: Blob,
  options: TraceRasterOptions = {}
) {
  const file = new File([blob], options.fileName ?? "image.png", {
    type: blob.type || "image/png",
  });
  const formData = new FormData();
  formData.set("image", file);

  if (options.quality) {
    formData.set("quality", options.quality);
  }

  if (options.style) {
    formData.set("style", options.style);
  }

  const response = await fetch("/api/trace", {
    method: "POST",
    body: formData,
  });

  return readTraceResponse(response);
}

export async function traceRasterDataUrlToSvg(
  dataUrl: string,
  options: TraceRasterOptions = {}
) {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Failed to load raster source");
  }

  const blob = await response.blob();
  return traceRasterBlobToSvg(blob, options);
}
