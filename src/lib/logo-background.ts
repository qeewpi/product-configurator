import type { LogoBackgroundMode } from "@/types/design";

export type ResolvedLogoBackgroundMode = Exclude<LogoBackgroundMode, "auto"> | { type: "otsu", threshold: number, isBackgroundDark: boolean };

const WHITE_LUMINANCE_THRESHOLD = 242;
const WHITE_CHROMA_THRESHOLD = 28;
const BLACK_LUMINANCE_THRESHOLD = 18;
const BLACK_CHROMA_THRESHOLD = 24;
const FOREGROUND_ALPHA_THRESHOLD = 24;

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

function isNearWhite(r: number, g: number, b: number) {
  return (
    getPixelLuminance(r, g, b) >= WHITE_LUMINANCE_THRESHOLD &&
    getPixelChroma(r, g, b) <= WHITE_CHROMA_THRESHOLD
  );
}

function isNearBlack(r: number, g: number, b: number) {
  return (
    getPixelLuminance(r, g, b) <= BLACK_LUMINANCE_THRESHOLD &&
    getPixelChroma(r, g, b) <= BLACK_CHROMA_THRESHOLD
  );
}

function isBackgroundMatch(
  r: number,
  g: number,
  b: number,
  mode: ResolvedLogoBackgroundMode
) {
  if (mode === "white") return isNearWhite(r, g, b);
  if (mode === "black") return isNearBlack(r, g, b);
  return false;
}

function applyBinaryDilate(mask: Uint8Array, width: number, height: number) {
  const output = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let isForeground = 0;

      for (let offsetY = -1; offsetY <= 1 && !isForeground; offsetY += 1) {
        const sampleY = y + offsetY;
        if (sampleY < 0 || sampleY >= height) {
          continue;
        }

        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = x + offsetX;
          if (sampleX < 0 || sampleX >= width) {
            continue;
          }

          if (mask[sampleY * width + sampleX]) {
            isForeground = 1;
            break;
          }
        }
      }

      output[y * width + x] = isForeground;
    }
  }

  return output;
}

function applyBinaryErode(mask: Uint8Array, width: number, height: number) {
  const output = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let isForeground = 1;

      for (let offsetY = -1; offsetY <= 1 && isForeground; offsetY += 1) {
        const sampleY = y + offsetY;
        if (sampleY < 0 || sampleY >= height) {
          isForeground = 0;
          break;
        }

        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = x + offsetX;
          if (sampleX < 0 || sampleX >= width) {
            isForeground = 0;
            break;
          }

          if (!mask[sampleY * width + sampleX]) {
            isForeground = 0;
            break;
          }
        }
      }

      output[y * width + x] = isForeground;
    }
  }

  return output;
}

function applyMajorityFilter(mask: Uint8Array, width: number, height: number) {
  const output = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let neighbors = 0;

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

          neighbors += mask[sampleY * width + sampleX];
        }
      }

      output[y * width + x] = neighbors >= 4 ? 1 : 0;
    }
  }

  return output;
}

function createForegroundMask(imageData: ImageData, minAlpha: number) {
  const mask = new Uint8Array(imageData.width * imageData.height);

  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = imageData.data[i * 4 + 3] >= minAlpha ? 1 : 0;
  }

  return applyMajorityFilter(
    applyBinaryErode(
      applyBinaryDilate(mask, imageData.width, imageData.height),
      imageData.width,
      imageData.height
    ),
    imageData.width,
    imageData.height
  );
}

export function computeOtsuThreshold(imageData: ImageData) {
  const { data } = imageData;
  const histogram = new Array(256).fill(0);
  let total = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    const l = Math.floor(getPixelLuminance(data[i], data[i + 1], data[i + 2]));
    histogram[l]++;
    total++;
  }

  if (total === 0) return 128;

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0, wB = 0, wF = 0, varMax = 0, threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }
  return threshold;
}

export function extractInkColor(imageData: ImageData, threshold: number): { r: number, g: number, b: number } {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    const l = getPixelLuminance(data[i], data[i + 1], data[i + 2]);
    if (l < threshold) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      count++;
    }
  }
  if (count === 0) return { r: 0, g: 0, b: 0 };
  return {
    r: Math.round(rSum / count),
    g: Math.round(gSum / count),
    b: Math.round(bSum / count),
  };
}

export function resolveBackgroundMode(
  imageData: ImageData,
  mode: LogoBackgroundMode
): ResolvedLogoBackgroundMode {
  if (mode !== "auto") {
    return mode;
  }

  const { data, width, height } = imageData;
  const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 64));
  let opaqueSamples = 0;
  let whiteSamples = 0;
  let blackSamples = 0;

  const samplePixel = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    const alpha = data[offset + 3];

    if (alpha < 16) return;

    opaqueSamples += 1;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];

    if (isNearWhite(r, g, b)) {
      whiteSamples += 1;
    } else if (isNearBlack(r, g, b)) {
      blackSamples += 1;
    }
  };

  for (let x = 0; x < width; x += sampleStep) {
    samplePixel(x, 0);
    if (height > 1) {
      samplePixel(x, height - 1);
    }
  }

  for (let y = sampleStep; y < height - sampleStep; y += sampleStep) {
    samplePixel(0, y);
    if (width > 1) {
      samplePixel(width - 1, y);
    }
  }

  if (opaqueSamples === 0) {
    return "none";
  }

  let isBackgroundDark = false;
  let isBackgroundBright = false;

  if (opaqueSamples > 0) {
    const whiteRatio = whiteSamples / opaqueSamples;
    const blackRatio = blackSamples / opaqueSamples;

    // When corners clearly show white or black, use the simpler mode
    // that only strips near-white or near-black pixels (preserving colors)
    if (whiteRatio >= 0.5) {
      return "white";
    }
    if (blackRatio >= 0.5) {
      return "black";
    }
  }

  // Fallback to Otsu for ambiguous backgrounds (e.g. photos, gradients)
  const threshold = computeOtsuThreshold(imageData);

  let darkPixels = 0;
  let brightPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i+3] > 0) {
      const l = getPixelLuminance(data[i], data[i+1], data[i+2]);
      if (l < threshold) darkPixels++;
      else brightPixels++;
    }
  }
  // Assume background is whatever color covers the vast majority of the image
  isBackgroundDark = darkPixels > brightPixels;

  return { type: "otsu", threshold, isBackgroundDark };
}

export function removeImageBackground(
  imageData: ImageData,
  mode: LogoBackgroundMode | ResolvedLogoBackgroundMode
) {
  const resolvedMode = (typeof mode === "object" || mode !== "auto")
    ? (mode as ResolvedLogoBackgroundMode)
    : resolveBackgroundMode(imageData, "auto");
  const output = cloneImageData(imageData);

  if (resolvedMode === "none") {
    return { imageData: output, resolvedMode };
  }

  if (typeof resolvedMode === "object" && resolvedMode.type === "otsu") {
    const otsuThreshold = resolvedMode.threshold;
    const isBackgroundDark = resolvedMode.isBackgroundDark;
    
    for (let i = 0; i < output.data.length; i += 4) {
      if (output.data[i + 3] === 0) continue;
      const l = getPixelLuminance(output.data[i], output.data[i + 1], output.data[i + 2]);
      
      if (isBackgroundDark) {
        // Strip dark background
        if (l <= otsuThreshold) output.data[i + 3] = 0;
      } else {
        // Strip bright background
        if (l >= otsuThreshold) output.data[i + 3] = 0;
      }
    }
    return { imageData: output, resolvedMode };
  }

  for (let i = 0; i < output.data.length; i += 4) {
    const alpha = output.data[i + 3];

    if (alpha === 0) {
      continue;
    }

    if (
      isBackgroundMatch(
        output.data[i],
        output.data[i + 1],
        output.data[i + 2],
        resolvedMode as ResolvedLogoBackgroundMode
      )
    ) {
      output.data[i + 3] = 0;
    }
  }

  return { imageData: output, resolvedMode };
}

export function normalizeLogoArtworkImageData(
  imageData: ImageData,
  mode: LogoBackgroundMode | ResolvedLogoBackgroundMode,
  minAlpha = FOREGROUND_ALPHA_THRESHOLD
) {
  const { imageData: keyedImageData, resolvedMode } = removeImageBackground(
    imageData,
    mode
  );
  const output = new ImageData(keyedImageData.width, keyedImageData.height);
  const mask = createForegroundMask(keyedImageData, minAlpha);
  let hasTransparentPixels = false;

  for (let i = 0; i < mask.length; i += 1) {
    const offset = i * 4;
    const isForeground = mask[i] === 1;

    if (!isForeground) {
      output.data[offset] = 0;
      output.data[offset + 1] = 0;
      output.data[offset + 2] = 0;
      output.data[offset + 3] = 0;
      hasTransparentPixels = true;
      continue;
    }

    output.data[offset] = keyedImageData.data[offset];
    output.data[offset + 1] = keyedImageData.data[offset + 1];
    output.data[offset + 2] = keyedImageData.data[offset + 2];
    output.data[offset + 3] = 255;
  }

  return {
    imageData: output,
    resolvedMode,
    shouldFilterBackground: resolvedMode !== "none" || hasTransparentPixels,
  };
}

export function createLineArtImageData(
  imageData: ImageData,
  mode: LogoBackgroundMode | ResolvedLogoBackgroundMode,
  minAlpha = FOREGROUND_ALPHA_THRESHOLD
) {
  const normalized = normalizeLogoArtworkImageData(imageData, mode, minAlpha);
  const output = new ImageData(
    normalized.imageData.width,
    normalized.imageData.height
  );

  for (let i = 0; i < normalized.imageData.data.length; i += 4) {
    const alpha = normalized.imageData.data[i + 3];
    const isForeground = alpha >= minAlpha;

    output.data[i] = isForeground ? 0 : 255;
    output.data[i + 1] = isForeground ? 0 : 255;
    output.data[i + 2] = isForeground ? 0 : 255;
    output.data[i + 3] = 255;
  }

  return {
    imageData: output,
    resolvedMode: normalized.resolvedMode,
    shouldFilterBackground: normalized.shouldFilterBackground,
  };
}

export function createBackgroundKeyedTraceImageData(
  imageData: ImageData,
  mode: LogoBackgroundMode | ResolvedLogoBackgroundMode,
  minAlpha = FOREGROUND_ALPHA_THRESHOLD
) {
  return createLineArtImageData(imageData, mode, minAlpha);
}
