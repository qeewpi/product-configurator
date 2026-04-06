import type { TraceSettings } from "@/types/design";
import { getDefaultTraceSettings } from "@/lib/trace-settings";

type TraceRasterOptions = {
  fileName?: string;
  traceSettings?: TraceSettings;
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
  const traceSettings = options.traceSettings ?? getDefaultTraceSettings();
  const file = new File([blob], options.fileName ?? "image.png", {
    type: blob.type || "image/png",
  });
  const formData = new FormData();
  formData.set("image", file);
  formData.set("style", traceSettings.style);
  formData.set("preset", traceSettings.preset);
  formData.set("hierarchical", traceSettings.hierarchical);
  formData.set("curveMode", traceSettings.curveMode);
  formData.set("filterSpeckle", `${traceSettings.filterSpeckle}`);
  formData.set("cornerThreshold", `${traceSettings.cornerThreshold}`);
  formData.set("lengthThreshold", `${traceSettings.lengthThreshold}`);
  formData.set("spliceThreshold", `${traceSettings.spliceThreshold}`);
  formData.set("pathPrecision", `${traceSettings.pathPrecision}`);
  formData.set("colorPrecision", `${traceSettings.colorPrecision}`);
  formData.set("layerDifference", `${traceSettings.layerDifference}`);

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
