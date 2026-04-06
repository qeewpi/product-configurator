import type { TraceSettings } from "@/types/design";

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

function rgbToHex(color: RgbColor) {
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`.toUpperCase();
}

function parseHexColor(hex: string): RgbColor | null {
  const normalized = hex.trim();
  if (!/^#[0-9A-F]{6}$/i.test(normalized)) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function colorDistanceSquared(left: RgbColor, right: RgbColor) {
  const dr = left.r - right.r;
  const dg = left.g - right.g;
  const db = left.b - right.b;
  return dr * dr + dg * dg + db * db;
}

function buildPaletteFromImageData(imageData: ImageData, maxColors: number) {
  const buckets = new Map<
    string,
    { count: number; r: number; g: number; b: number }
  >();

  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3];
    if (alpha < 8) {
      continue;
    }

    const r = imageData.data[index];
    const g = imageData.data[index + 1];
    const b = imageData.data[index + 2];
    const key = `${r >> 3}-${g >> 3}-${b >> 3}`;
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }

  const candidates = [...buckets.values()]
    .sort((left, right) => right.count - left.count)
    .map((bucket) => ({
      r: Math.round(bucket.r / bucket.count),
      g: Math.round(bucket.g / bucket.count),
      b: Math.round(bucket.b / bucket.count),
    }));

  if (candidates.length <= maxColors) {
    return candidates;
  }

  const palette: RgbColor[] = [candidates[0]];

  while (palette.length < maxColors && palette.length < candidates.length) {
    let bestCandidate: RgbColor | null = null;
    let bestDistance = -1;

    for (const candidate of candidates) {
      const nearestDistance = palette.reduce(
        (smallest, paletteColor) =>
          Math.min(smallest, colorDistanceSquared(candidate, paletteColor)),
        Number.POSITIVE_INFINITY
      );

      if (nearestDistance > bestDistance) {
        bestDistance = nearestDistance;
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate) {
      break;
    }

    palette.push(bestCandidate);
  }

  return palette;
}

export function resolveTracePaletteColors(
  imageData: ImageData,
  traceSettings?: TraceSettings | null
) {
  if (!traceSettings || traceSettings.style !== "color") {
    return [] as string[];
  }

  if (traceSettings.paletteColors.length > 0) {
    return traceSettings.paletteColors;
  }

  return buildPaletteFromImageData(imageData, traceSettings.maxColors).map(rgbToHex);
}

function quantizeImageDataToPalette(imageData: ImageData, palette: RgbColor[]) {
  if (palette.length === 0) {
    return imageData;
  }

  const quantized = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );

  for (let index = 0; index < quantized.data.length; index += 4) {
    const alpha = quantized.data[index + 3];
    if (alpha < 8) {
      continue;
    }

    const source = {
      r: quantized.data[index],
      g: quantized.data[index + 1],
      b: quantized.data[index + 2],
    };
    let nearest = palette[0];
    let nearestDistance = colorDistanceSquared(source, nearest);

    for (let paletteIndex = 1; paletteIndex < palette.length; paletteIndex += 1) {
      const candidate = palette[paletteIndex];
      const candidateDistance = colorDistanceSquared(source, candidate);
      if (candidateDistance < nearestDistance) {
        nearest = candidate;
        nearestDistance = candidateDistance;
      }
    }

    quantized.data[index] = nearest.r;
    quantized.data[index + 1] = nearest.g;
    quantized.data[index + 2] = nearest.b;
  }

  return quantized;
}

export function applyTraceColorLimit(
  imageData: ImageData,
  traceSettings?: TraceSettings | null
) {
  if (!traceSettings || traceSettings.style !== "color") {
    return imageData;
  }

  const palette =
    traceSettings.paletteColors.length > 0
      ? traceSettings.paletteColors
          .map(parseHexColor)
          .filter((color): color is RgbColor => Boolean(color))
      : buildPaletteFromImageData(imageData, traceSettings.maxColors);

  return quantizeImageDataToPalette(imageData, palette);
}

export function shouldUseHardEdgeTraceScaling(
  traceSettings?: TraceSettings | null
) {
  if (!traceSettings || traceSettings.style !== "color") {
    return false;
  }

  return traceSettings.paletteColors.length > 0 || traceSettings.maxColors > 0;
}
