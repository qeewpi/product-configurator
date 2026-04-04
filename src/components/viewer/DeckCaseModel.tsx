"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { prepareCaseModel } from "@/lib/case-models";
import {
  getArtworkBounds,
  getContinuousPanelArtworkSlices,
} from "@/lib/deck-case-artwork";
import { CASE_MODELS } from "@/lib/model-catalog";
import { useDesignStore } from "@/lib/store";

function loadImageSource(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load preview image"));
    image.src = src;
  });
}

async function loadLogoPreviewImage(logo: {
  dataUrl: string | null;
  rasterSourceDataUrl: string | null;
  vectorSvg: string | null;
  color: string | null;
}) {
  // For direct SVG uploads (no raster source), use the vectorSvg with color injection
  if (logo.vectorSvg && !logo.rasterSourceDataUrl) {
    let svgContent = logo.vectorSvg;
    if (logo.color) {
      const styleInjection = `<style>path:not([fill="#FFFFFF"]):not([fill="#ffffff"]):not([fill="none"]) { fill: ${logo.color} !important; }</style>`;
      svgContent = svgContent.replace(/<svg[^>]*>/i, (match) => `${match}${styleInjection}`);
    }

    const objectUrl = URL.createObjectURL(
      new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" })
    );

    try {
      return await loadImageSource(objectUrl);
    } catch (error) {
      if (logo.dataUrl) {
        return loadImageSource(logo.dataUrl);
      }

      throw error;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  // For raster-sourced logos (PNG/JPG), use the processed preview image
  // which preserves original colors with background removed
  if (logo.dataUrl) {
    return loadImageSource(logo.dataUrl);
  }

  return null;
}

export default function DeckCaseModel() {
  const meshRef = useRef<THREE.Mesh>(null!);
  const rawGeometries = useLoader(STLLoader, [
    ...CASE_MODELS["compact-3-lid"].assetPaths,
    ...CASE_MODELS.rugged.assetPaths,
  ]);
  const [logoTexture, setLogoTexture] = useState<THREE.Texture | null>(null);

  const model = useDesignStore((s) => s.model);
  const panelColors = useDesignStore((s) => s.panelColors);
  const bottomColor = useDesignStore((s) => s.bottomColor);
  const logo = useDesignStore((s) => s.logo);
  const artworkStyle = useDesignStore((s) => s.artworkStyle);
  const { dataUrl, rasterSourceDataUrl, vectorSvg, color } = logo;

  const preparedModels = useMemo(
    () => ({
      "compact-3-lid": prepareCaseModel("compact-3-lid", [rawGeometries[0]]),
      rugged: prepareCaseModel("rugged", [rawGeometries[1], rawGeometries[2]]),
    }),
    [rawGeometries]
  );
  const preparedModel = preparedModels[model];
  const { regionGeometry, lidPanelGeometries, topLidBounds } = preparedModel;

  const materials = useMemo(
    () => {
      const lidColors =
        model === "rugged" ? [panelColors[0]] : panelColors;

      return [
        ...lidColors.map(
          (color) =>
            new THREE.MeshStandardMaterial({
              color,
              roughness: 0.4,
              metalness: 0.1,
            })
        ),
        new THREE.MeshStandardMaterial({
          color: bottomColor,
          roughness: 0.4,
          metalness: 0.1,
        }),
      ];
    },
    [bottomColor, model, panelColors]
  );

  useEffect(() => {
    let isCancelled = false;

    if (!vectorSvg && !dataUrl) {
      Promise.resolve().then(() => {
        if (!isCancelled) {
          setLogoTexture((current) => {
            current?.dispose();
            return null;
          });
        }
      });
    } else {
      loadLogoPreviewImage({ dataUrl, rasterSourceDataUrl, vectorSvg, color })
        .then((image) => {
          if (!image) {
            throw new Error("Missing preview source");
          }

          const texture = new THREE.Texture(image);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;

          if (isCancelled) {
            texture.dispose();
            return;
          }

          setLogoTexture((current) => {
            current?.dispose();
            return texture;
          });
        })
        .catch(() => {
          if (!isCancelled) {
            setLogoTexture((current) => {
              current?.dispose();
              return null;
            });
          }
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [dataUrl, rasterSourceDataUrl, vectorSvg, color]);

  const artworkBounds = useMemo(() => {
    return getArtworkBounds(logo, topLidBounds);
  }, [logo, topLidBounds]);

  const panelImageOverlays = useMemo(() => {
    if (
      !logoTexture ||
      !logoTexture.image ||
      !artworkBounds.width ||
      !artworkBounds.height
    ) {
      return [];
    }

    const sourceImage = logoTexture.image as
      | HTMLImageElement
      | HTMLCanvasElement
      | ImageBitmap;
    const sourceWidth =
      "naturalWidth" in sourceImage
        ? sourceImage.naturalWidth
        : sourceImage.width;
    const sourceHeight =
      "naturalHeight" in sourceImage
        ? sourceImage.naturalHeight
        : sourceImage.height;

    if (!sourceWidth || !sourceHeight) {
      return [];
    }

    return getContinuousPanelArtworkSlices(
      lidPanelGeometries,
      artworkBounds,
      sourceWidth,
      sourceHeight
    )
      .map((slice) => {
        const panel = slice.panel;

        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = Math.max(
          1,
          Math.round((panel.height / panel.width) * canvas.width)
        );

        const context = canvas.getContext("2d");
        if (!context) return null;

        const destX =
          ((slice.overlapMinX - panel.bounds.min.x) / panel.width) * canvas.width;
        const destY =
          ((panel.bounds.max.y - slice.overlapMaxY) / panel.height) * canvas.height;
        const destWidth =
          (slice.overlapWidth / panel.width) * canvas.width;
        const destHeight =
          (slice.overlapHeight / panel.height) * canvas.height;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          sourceImage,
          slice.sourceX,
          slice.sourceY,
          slice.sourceCropWidth,
          slice.sourceCropHeight,
          destX,
          destY,
          destWidth,
          destHeight
        );

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        return {
          panel: slice.panel,
          texture,
          zOffset: artworkStyle === "emboss" ? 0.35 : 0.02,
        };
      })
      .filter((overlay): overlay is NonNullable<typeof overlay> => overlay !== null);
  }, [artworkBounds, artworkStyle, lidPanelGeometries, logoTexture]);

  useEffect(() => {
    return () => {
      for (const overlay of panelImageOverlays) {
        overlay.texture.dispose();
      }
    };
  }, [panelImageOverlays]);

  useEffect(() => {
    return () => {
      logoTexture?.dispose();
    };
  }, [logoTexture]);

  return (
    <>
      <mesh ref={meshRef} geometry={regionGeometry} material={materials} />

      {panelImageOverlays.map((overlay, index) => (
        <mesh
          key={index}
            position={[
              overlay.panel.center.x,
              overlay.panel.center.y,
              overlay.panel.outerFaceZ + overlay.zOffset,
            ]}
        >
          <planeGeometry args={[overlay.panel.width, overlay.panel.height]} />
          <meshStandardMaterial
            map={overlay.texture}
            transparent
            alphaTest={0.05}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={artworkStyle === "emboss" ? -2 : -1}
            depthWrite={false}
            roughness={0.3}
            metalness={0.1}
          />
        </mesh>
      ))}
    </>
  );
}
