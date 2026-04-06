import type { LogoBackgroundMode } from "@/types/design";

export type BackgroundFamily = "white" | "black";

export type ResolvedLogoBackgroundMode =
  | "none"
  | {
      type: "keyed";
      family: BackgroundFamily;
      confidence: number;
      source: "manual" | "auto";
    };

export type TraceRenderMode = "color" | "bw";

export type CleanLogoArtworkOptions = {
  minForegroundAlpha?: number;
  edgeSoftness?: number;
  preserveColor?: boolean;
};

export type CleanLogoArtworkResult = {
  imageData: ImageData;
  resolvedMode: ResolvedLogoBackgroundMode;
  shouldFilterBackground: boolean;
  backgroundMask: Uint8Array;
  foregroundBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
};

const FOREGROUND_ALPHA_THRESHOLD = 24;
const BORDER_ALPHA_THRESHOLD = 16;
const WHITE_FAMILY_LUMINANCE = 220;
const WHITE_FAMILY_CHROMA = 44;
const BLACK_FAMILY_LUMINANCE = 58;
const BLACK_FAMILY_CHROMA = 36;
const AUTO_KEY_CONFIDENCE_STRONG = 0.7;
const AUTO_KEY_CONFIDENCE_MEDIUM = 0.55;
const DEFAULT_SEED_SCORE = 0.66;
const DEFAULT_FLOOD_SCORE = 0.58;
const MONOCHROME_CONTRAST = 1.12;

type BorderFamilyEstimate = {
  family: BackgroundFamily;
  confidence: number;
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function cloneImageData(imageData: ImageData) {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

function getPixelLuminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getPixelChroma(r: number, g: number, b: number) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

export function computeOtsuThreshold(imageData: ImageData) {
  const { data } = imageData;
  const histogram = new Array(256).fill(0);
  let total = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < BORDER_ALPHA_THRESHOLD) {
      continue;
    }

    const luminance = Math.floor(getPixelLuminance(data[i], data[i + 1], data[i + 2]));
    histogram[luminance] += 1;
    total += 1;
  }

  if (total === 0) {
    return 128;
  }

  let sum = 0;
  for (let i = 0; i < 256; i += 1) {
    sum += i * histogram[i];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let threshold = 0;

  for (let candidate = 0; candidate < 256; candidate += 1) {
    weightBackground += histogram[candidate];
    if (weightBackground === 0) {
      continue;
    }

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) {
      break;
    }

    sumBackground += candidate * histogram[candidate];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const varianceBetween =
      weightBackground * weightForeground *
      (meanBackground - meanForeground) *
      (meanBackground - meanForeground);

    if (varianceBetween > maxVariance) {
      maxVariance = varianceBetween;
      threshold = candidate;
    }
  }

  return threshold;
}

export function extractInkColor(
  imageData: ImageData,
  threshold: number
): { r: number; g: number; b: number } {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < BORDER_ALPHA_THRESHOLD) {
      continue;
    }

    const luminance = getPixelLuminance(data[i], data[i + 1], data[i + 2]);
    if (luminance < threshold) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      count += 1;
    }
  }

  if (count === 0) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: Math.round(rSum / count),
    g: Math.round(gSum / count),
    b: Math.round(bSum / count),
  };
}

export function getBorderSamplePoints(imageData: ImageData, stride = 1) {
  const { width, height } = imageData;
  const points: Array<{ x: number; y: number }> = [];
  const step = Math.max(1, stride);

  for (let x = 0; x < width; x += step) {
    points.push({ x, y: 0 });
    if (height > 1) {
      points.push({ x, y: height - 1 });
    }
  }

  for (let y = step; y < height - step; y += step) {
    points.push({ x: 0, y });
    if (width > 1) {
      points.push({ x: width - 1, y });
    }
  }

  return points;
}

function scorePixelAgainstFamily(
  r: number,
  g: number,
  b: number,
  family: BackgroundFamily
) {
  const luminance = getPixelLuminance(r, g, b);
  const chroma = getPixelChroma(r, g, b);
  const chromaScore = clamp01(1 - chroma / 96);

  if (family === "white") {
    const luminanceScore = clamp01((luminance - 156) / 99);
    return clamp01(luminanceScore * 0.82 + chromaScore * 0.18);
  }

  const luminanceScore = clamp01((84 - luminance) / 84);
  return clamp01(luminanceScore * 0.82 + chromaScore * 0.18);
}

export function classifyPixelAgainstFamily(
  r: number,
  g: number,
  b: number,
  family: BackgroundFamily
) {
  return scorePixelAgainstFamily(r, g, b, family) >= 0.65;
}

export function pixelDistanceToBackgroundFamily(
  r: number,
  g: number,
  b: number,
  family: BackgroundFamily
) {
  return 1 - scorePixelAgainstFamily(r, g, b, family);
}

function countOpaqueBorderSamples(imageData: ImageData, stride = 1) {
  const { data, width } = imageData;
  let opaqueSamples = 0;
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  let whiteScoreSum = 0;
  let blackScoreSum = 0;
  let whiteMatches = 0;
  let blackMatches = 0;

  for (const point of getBorderSamplePoints(imageData, stride)) {
    const offset = (point.y * width + point.x) * 4;
    const alpha = data[offset + 3];

    if (alpha < BORDER_ALPHA_THRESHOLD) {
      continue;
    }

    opaqueSamples += 1;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const luminance = getPixelLuminance(r, g, b);
    const whiteScore = scorePixelAgainstFamily(r, g, b, "white");
    const blackScore = scorePixelAgainstFamily(r, g, b, "black");

    luminanceSum += luminance;
    luminanceSquaredSum += luminance * luminance;
    whiteScoreSum += whiteScore;
    blackScoreSum += blackScore;

    if (whiteScore >= blackScore && whiteScore >= 0.65) {
      whiteMatches += 1;
    }

    if (blackScore > whiteScore && blackScore >= 0.65) {
      blackMatches += 1;
    }
  }

  if (opaqueSamples === 0) {
    return null;
  }

  const luminanceMean = luminanceSum / opaqueSamples;
  const luminanceVariance = Math.max(
    0,
    luminanceSquaredSum / opaqueSamples - luminanceMean * luminanceMean
  );

  return {
    opaqueSamples,
    luminanceVariance,
    whiteAgreement: whiteMatches / opaqueSamples,
    blackAgreement: blackMatches / opaqueSamples,
    whiteAverage: whiteScoreSum / opaqueSamples,
    blackAverage: blackScoreSum / opaqueSamples,
  };
}

export function maybeEstimateBackgroundFamilyFromBorder(
  imageData: ImageData
): BorderFamilyEstimate | null {
  const borderStats = countOpaqueBorderSamples(
    imageData,
    Math.max(1, Math.floor(Math.min(imageData.width, imageData.height) / 48))
  );

  if (!borderStats) {
    return null;
  }

  const confidenceBonus = clamp01(1 - borderStats.luminanceVariance / 2500);
  const whiteConfidence =
    borderStats.whiteAverage * 0.6 +
    borderStats.whiteAgreement * 0.4 * confidenceBonus;
  const blackConfidence =
    borderStats.blackAverage * 0.6 +
    borderStats.blackAgreement * 0.4 * confidenceBonus;

  const family = whiteConfidence >= blackConfidence ? "white" : "black";
  const confidence =
    family === "white" ? whiteConfidence : blackConfidence;

  if (confidence < AUTO_KEY_CONFIDENCE_MEDIUM) {
    return null;
  }

  if (
    confidence < AUTO_KEY_CONFIDENCE_STRONG &&
    Math.abs(whiteConfidence - blackConfidence) < 0.08
  ) {
    return null;
  }

  return { family, confidence: clamp01(confidence) };
}

function isKeyedBackgroundMode(
  mode: ResolvedLogoBackgroundMode
): mode is Extract<ResolvedLogoBackgroundMode, { type: "keyed" }> {
  return typeof mode === "object" && mode.type === "keyed";
}

export function resolveBackgroundMode(
  imageData: ImageData,
  mode: LogoBackgroundMode | ResolvedLogoBackgroundMode
): ResolvedLogoBackgroundMode {
  if (typeof mode === "object") {
    return mode;
  }

  if (mode === "none") {
    return "none";
  }

  if (mode === "white" || mode === "black") {
    return {
      type: "keyed",
      family: mode,
      confidence: 1,
      source: "manual",
    };
  }

  const estimate = maybeEstimateBackgroundFamilyFromBorder(imageData);
  if (!estimate) {
    return "none";
  }

  return {
    type: "keyed",
    family: estimate.family,
    confidence: estimate.confidence,
    source: "auto",
  };
}

export function createEdgeConnectedBackgroundMask(
  imageData: ImageData,
  resolvedMode: ResolvedLogoBackgroundMode,
  options?: {
    minForegroundAlpha?: number;
    seedThreshold?: number;
    floodThreshold?: number;
  }
) {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);

  if (!isKeyedBackgroundMode(resolvedMode)) {
    return mask;
  }

  const minAlpha = options?.minForegroundAlpha ?? FOREGROUND_ALPHA_THRESHOLD;
  const confidencePenalty = clamp01(1 - resolvedMode.confidence);
  const seedThreshold = options?.seedThreshold ?? 0.66 + confidencePenalty * 0.06;
  const floodThreshold = options?.floodThreshold ?? 0.58 + confidencePenalty * 0.08;
  const visited = new Uint8Array(mask.length);
  const queue: number[] = [];

  const enqueue = (index: number) => {
    if (visited[index]) {
      return;
    }

    visited[index] = 1;
    mask[index] = 1;
    queue.push(index);
  };

  const trySeed = (x: number, y: number) => {
    const index = y * width + x;
    const offset = index * 4;
    const alpha = data[offset + 3];

    if (alpha < minAlpha) {
      return;
    }

    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const score = 1 - pixelDistanceToBackgroundFamily(r, g, b, resolvedMode.family);

    if (score >= seedThreshold) {
      enqueue(index);
    }
  };

  for (const point of getBorderSamplePoints(imageData, 1)) {
    trySeed(point.x, point.y);
  }

  const neighborOffsets = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % width;
    const y = Math.floor(index / width);

    for (const [offsetX, offsetY] of neighborOffsets) {
      const neighborX = x + offsetX;
      const neighborY = y + offsetY;

      if (
        neighborX < 0 ||
        neighborX >= width ||
        neighborY < 0 ||
        neighborY >= height
      ) {
        continue;
      }

      const neighborIndex = neighborY * width + neighborX;
      if (visited[neighborIndex]) {
        continue;
      }

      const neighborOffset = neighborIndex * 4;
      if (data[neighborOffset + 3] < minAlpha) {
        continue;
      }

      const r = data[neighborOffset];
      const g = data[neighborOffset + 1];
      const b = data[neighborOffset + 2];
      const score = 1 - pixelDistanceToBackgroundFamily(
        r,
        g,
        b,
        resolvedMode.family
      );

      if (score >= floodThreshold) {
        enqueue(neighborIndex);
      }
    }
  }

  return mask;
}

function getForegroundBounds(imageData: ImageData) {
  const { data, width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] === 0) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

export function refineForegroundEdges(
  imageData: ImageData,
  backgroundMask: Uint8Array,
  options?: CleanLogoArtworkOptions
) {
  if (!options?.edgeSoftness || options.edgeSoftness <= 0) {
    return cloneImageData(imageData);
  }

  const { data, width, height } = imageData;
  const output = cloneImageData(imageData);
  const softness = clamp01(options.edgeSoftness);
  const boost = 1 + softness * 0.12;

  const isBackgroundNeighbor = (x: number, y: number) => {
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const sampleY = y + offsetY;
      if (sampleY < 0 || sampleY >= height) {
        continue;
      }

      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const sampleX = x + offsetX;
        if (sampleX < 0 || sampleX >= width) {
          continue;
        }

        if (backgroundMask[sampleY * width + sampleX]) {
          return true;
        }
      }
    }

    return false;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      if (backgroundMask[index] || data[offset + 3] === 0) {
        continue;
      }

      if (!isBackgroundNeighbor(x, y)) {
        continue;
      }

      const alpha = data[offset + 3];
      const liftedAlpha = Math.min(
        255,
        Math.round(255 - (255 - alpha) / boost)
      );

      output.data[offset + 3] = Math.max(alpha, liftedAlpha);
    }
  }

  return output;
}

function applyBackgroundMaskToImageData(
  imageData: ImageData,
  backgroundMask: Uint8Array
) {
  const output = cloneImageData(imageData);

  for (let i = 0; i < backgroundMask.length; i += 1) {
    if (!backgroundMask[i]) {
      continue;
    }

    output.data[i * 4 + 3] = 0;
  }

  return output;
}

export function cleanLogoArtworkImageData(
  imageData: ImageData,
  mode: LogoBackgroundMode | ResolvedLogoBackgroundMode,
  options: CleanLogoArtworkOptions = {}
): CleanLogoArtworkResult {
  const minForegroundAlpha =
    options.minForegroundAlpha ?? FOREGROUND_ALPHA_THRESHOLD;
  const resolvedMode = resolveBackgroundMode(imageData, mode);
  const cloned = cloneImageData(imageData);

  if (resolvedMode === "none") {
    return {
      imageData: cloned,
      resolvedMode,
      shouldFilterBackground: false,
      backgroundMask: new Uint8Array(cloned.width * cloned.height),
      foregroundBounds: getForegroundBounds(cloned),
    };
  }

  const backgroundMask = createEdgeConnectedBackgroundMask(cloned, resolvedMode, {
    minForegroundAlpha,
  });
  const masked = applyBackgroundMaskToImageData(cloned, backgroundMask);
  const refined = refineForegroundEdges(masked, backgroundMask, options);

  return {
    imageData: refined,
    resolvedMode,
    shouldFilterBackground: true,
    backgroundMask,
    foregroundBounds: getForegroundBounds(refined),
  };
}

export function createColorTraceImageData(
  cleaned: CleanLogoArtworkResult
) {
  return {
    imageData: cloneImageData(cleaned.imageData),
    resolvedMode: cleaned.resolvedMode,
    shouldFilterBackground: cleaned.shouldFilterBackground,
    backgroundMask: cleaned.backgroundMask,
  };
}

function getForegroundLuminanceStats(imageData: ImageData) {
  const { data } = imageData;
  let count = 0;
  let sum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < FOREGROUND_ALPHA_THRESHOLD) {
      continue;
    }

    const composite = alpha / 255;
    const r = data[i] * composite + 255 * (1 - composite);
    const g = data[i + 1] * composite + 255 * (1 - composite);
    const b = data[i + 2] * composite + 255 * (1 - composite);
    sum += getPixelLuminance(r, g, b);
    count += 1;
  }

  return count === 0 ? null : sum / count;
}

export function createMonochromeTraceImageData(
  cleaned: CleanLogoArtworkResult,
  options?: {
    contrast?: number;
  }
) {
  const { imageData, backgroundMask } = cleaned;
  const output = new ImageData(imageData.width, imageData.height);
  const foregroundMean = getForegroundLuminanceStats(imageData) ?? 128;
  const invert = foregroundMean > 140;
  const contrast = options?.contrast ?? MONOCHROME_CONTRAST;

  for (let i = 0; i < imageData.data.length; i += 4) {
    const alpha = imageData.data[i + 3];
    if (alpha < FOREGROUND_ALPHA_THRESHOLD || backgroundMask[i / 4]) {
      output.data[i] = 255;
      output.data[i + 1] = 255;
      output.data[i + 2] = 255;
      output.data[i + 3] = 255;
      continue;
    }

    const composite = alpha / 255;
    const r = imageData.data[i] * composite + 255 * (1 - composite);
    const g = imageData.data[i + 1] * composite + 255 * (1 - composite);
    const b = imageData.data[i + 2] * composite + 255 * (1 - composite);
    const luminance = getPixelLuminance(r, g, b);
    const adjusted = invert ? 255 - luminance : luminance;
    const contrasted = clamp01(adjusted / 255) * 255;
    const remapped = clamp01(((contrasted - 128) * contrast + 128) / 255) * 255;
    const gray = Math.max(0, Math.min(255, Math.round(remapped)));

    output.data[i] = gray;
    output.data[i + 1] = gray;
    output.data[i + 2] = gray;
    output.data[i + 3] = 255;
  }

  return {
    imageData: output,
    resolvedMode: cleaned.resolvedMode,
    shouldFilterBackground: cleaned.shouldFilterBackground,
    backgroundMask: cleaned.backgroundMask,
  };
}

export function createTraceImageData(
  imageData: ImageData,
  mode: LogoBackgroundMode | ResolvedLogoBackgroundMode,
  renderMode: TraceRenderMode = "color",
  options: CleanLogoArtworkOptions = {}
) {
  const cleaned = cleanLogoArtworkImageData(imageData, mode, options);
  return renderMode === "bw"
    ? createMonochromeTraceImageData(cleaned)
    : createColorTraceImageData(cleaned);
}

export function removeImageBackground(
  imageData: ImageData,
  mode: LogoBackgroundMode | ResolvedLogoBackgroundMode
) {
  const cleaned = cleanLogoArtworkImageData(imageData, mode);
  return {
    imageData: cleaned.imageData,
    resolvedMode: cleaned.resolvedMode,
  };
}

export function normalizeLogoArtworkImageData(
  imageData: ImageData,
  mode: LogoBackgroundMode | ResolvedLogoBackgroundMode,
  minAlpha = FOREGROUND_ALPHA_THRESHOLD
) {
  return cleanLogoArtworkImageData(imageData, mode, {
    minForegroundAlpha: minAlpha,
  });
}

export function createLineArtImageData(
  imageData: ImageData,
  mode: LogoBackgroundMode | ResolvedLogoBackgroundMode,
  minAlpha = FOREGROUND_ALPHA_THRESHOLD
) {
  const cleaned = cleanLogoArtworkImageData(imageData, mode, {
    minForegroundAlpha: minAlpha,
  });

  return {
    imageData: createMonochromeTraceImageData(cleaned).imageData,
    resolvedMode: cleaned.resolvedMode,
    shouldFilterBackground: cleaned.shouldFilterBackground,
    backgroundMask: cleaned.backgroundMask,
  };
}

export function createBackgroundKeyedTraceImageData(
  imageData: ImageData,
  mode: LogoBackgroundMode | ResolvedLogoBackgroundMode,
  minAlpha = FOREGROUND_ALPHA_THRESHOLD
) {
  return createLineArtImageData(imageData, mode, minAlpha);
}
