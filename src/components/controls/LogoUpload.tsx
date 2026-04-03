"use client";

import { useCallback, useRef, useState } from "react";
import { useDesignStore } from "@/lib/store";

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

async function getImageAspectRatio(src: string) {
  const image = await loadImage(src);
  return image.naturalWidth > 0 && image.naturalHeight > 0
    ? image.naturalWidth / image.naturalHeight
    : 1;
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function sanitizeTracedSvg(svg: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;

  for (const element of Array.from(root.querySelectorAll("*"))) {
    const isHidden =
      element.getAttribute("fill-opacity") === "0" ||
      element.getAttribute("opacity") === "0" ||
      (element.getAttribute("fill") === "none" &&
        element.getAttribute("stroke") === "none");

    if (isHidden) {
      element.remove();
    }
  }

  return new XMLSerializer().serializeToString(document);
}

async function traceRasterToSvg(dataUrl: string) {
  const ImageTracerModule = await import("imagetracerjs");
  const ImageTracer = ImageTracerModule.default;

  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Failed to prepare image tracing");
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const svg = ImageTracer.imagedataToSVG(imageData, {
    ltres: 0.001,
    qtres: 0.001,
    pathomit: 0,
    rightangleenhance: true,
    colorsampling: 0,
    numberofcolors: 32,
    mincolorratio: 0.0005,
    colorquantcycles: 6,
    layering: 0,
    strokewidth: 0,
    linefilter: false,
    roundcoords: 3,
    scale: 1,
    blurradius: 2,
    blurdelta: 24,
  });

  return sanitizeTracedSvg(svg);
}

async function removeWhiteBackground(file: File) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return dataUrl;
  }

  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const alpha = pixels[i + 3];
    const isNearWhite = red > 240 && green > 240 && blue > 240;

    if (alpha > 0 && isNearWhite) {
      pixels[i + 3] = 0;
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export default function LogoUpload() {
  const setLogo = useDesignStore((s) => s.setLogo);
  const clearLogo = useDesignStore((s) => s.clearLogo);
  const logo = useDesignStore((s) => s.logo);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConverting, setIsConverting] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      const isSvg = file.type === "image/svg+xml" || file.name.endsWith(".svg");

      if (isSvg) {
        const dataUrl = await readFileAsDataUrl(file);
        const vectorSvg = await readFileAsText(file);
        setLogo({
          dataUrl,
          vectorSvg,
          aspectRatio: await getImageAspectRatio(dataUrl),
          originalFileName: file.name,
        });
      } else {
        setIsConverting(true);
        try {
          const dataUrl = await removeWhiteBackground(file);
          const vectorSvg = await traceRasterToSvg(dataUrl);
          setLogo({
            dataUrl,
            vectorSvg,
            aspectRatio: await getImageAspectRatio(dataUrl),
            originalFileName: file.name,
          });
        } catch {
          const dataUrl = await readFileAsDataUrl(file);
          setLogo({
            dataUrl,
            vectorSvg: null,
            aspectRatio: await getImageAspectRatio(dataUrl),
            originalFileName: file.name,
          });
        } finally {
          setIsConverting(false);
        }
      }
    },
    [setLogo]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">
        Logo / Image
      </h3>

      {!logo.dataUrl ? (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-zinc-300 rounded-xl p-6 text-center cursor-pointer hover:border-zinc-400 transition-colors"
        >
          {isConverting ? (
            <p className="text-sm text-zinc-500">Preparing image...</p>
          ) : (
            <>
              <p className="text-sm text-zinc-600 font-medium">
                Drop an image here or click to upload
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                SVG, PNG, or JPG
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
            <img
              src={logo.dataUrl}
              alt="Logo preview"
              className="w-12 h-12 object-contain bg-white rounded border border-zinc-200"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-700 truncate">
                {logo.originalFileName}
              </p>
            </div>
            <button
              onClick={clearLogo}
              className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
