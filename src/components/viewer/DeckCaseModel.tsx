"use client";

import { useEffect, useMemo, useState } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { prepareCaseModel } from "@/lib/case-models";
import {
  getArtworkBounds,
  getContinuousPanelArtworkSlices,
  type LidPanelGeometry,
} from "@/lib/deck-case-artwork";
import {
  createLogoPreviewBlobUrl,
  resolveLogoSourceKind,
} from "@/lib/logo-svg-preview";
import { CASE_MODELS } from "@/lib/model-catalog";
import { useDesignStore } from "@/lib/store";
import {
  getAvailableViewerParts,
  getEffectiveVisibleParts,
  getLayoutBounds,
  resolveViewerPartLayout,
  type LayoutBounds,
  type PartBoundsMap,
} from "@/lib/view-mode-layout";

const COMPACT_LID_NAMES = ["lid-left", "lid-center", "lid-right"] as const;

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
  originalFileName: string | null;
  color: string | null;
  sourceKind: ReturnType<typeof resolveLogoSourceKind>;
  traceStyle: "color" | "lineart";
}) {
  if (logo.vectorSvg) {
    const objectUrl = createLogoPreviewBlobUrl(logo.vectorSvg, {
      color: logo.color,
      sourceKind: logo.sourceKind,
      traceStyle: logo.traceStyle,
    });

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

  if (logo.dataUrl) {
    return loadImageSource(logo.dataUrl);
  }

  return null;
}

type PartMesh = {
  key: string;
  name: string;
  geometry: THREE.BufferGeometry;
  color: string;
};

type LogoTextureMap = Record<string, THREE.Texture>;

type PanelImageOverlay = {
  key: string;
  panel: LidPanelGeometry;
  texture: THREE.Texture;
  zOffset: number;
};

function getPartMeshes(
  model: "compact-3-lid" | "rugged",
  lidSections: LidPanelGeometry[],
  bottomGeometry: THREE.BufferGeometry,
  clipsGeometry: THREE.BufferGeometry | null,
  panelColors: [string, string, string],
  bottomColor: string,
  clipsColor: string
) {
  const lidColors = model === "rugged" ? [panelColors[0]] : panelColors;
  const parts: PartMesh[] = lidSections.map((section, index) => ({
    key: `lid-${index}`,
    name:
      model === "compact-3-lid"
        ? COMPACT_LID_NAMES[index] ?? `lid-${index}`
        : "lid",
    geometry: section.geometry,
    color: lidColors[index] ?? lidColors[0],
  }));

  parts.push({
    key: "bottom-tray",
    name: "bottom-tray",
    geometry: bottomGeometry,
    color: bottomColor,
  });

  if (clipsGeometry) {
    parts.push({
      key: "clips",
      name: "clips",
      geometry: clipsGeometry,
      color: clipsColor,
    });
  }

  return parts;
}

export default function DeckCaseModel({
  onLayoutBoundsChange,
}: {
  onLayoutBoundsChange?: (bounds: LayoutBounds) => void;
}) {
  const model = useDesignStore((s) => s.model);
  const panelColors = useDesignStore((s) => s.panelColors);
  const bottomColor = useDesignStore((s) => s.bottomColor);
  const clipsColor = useDesignStore((s) => s.clipsColor);
  const logos = useDesignStore((s) => s.logos);
  const artworkStyle = useDesignStore((s) => s.artworkStyle);
  const viewerMode = useDesignStore((s) => s.viewerMode);
  const visibleParts = useDesignStore((s) => s.visibleParts);

  const rawGeometry = useLoader(
    STLLoader,
    CASE_MODELS[model].assetPath
  ) as THREE.BufferGeometry;

  const preparedModel = useMemo(
    () => prepareCaseModel(model, rawGeometry),
    [model, rawGeometry]
  );
  const { lidSections, bottomGeometry, clipsGeometry, topLidBounds } =
    preparedModel;

  const partBounds = useMemo(() => {
    const lidBounds = new THREE.Box3();
    lidSections.forEach((section) => {
      section.geometry.computeBoundingBox();
      if (section.geometry.boundingBox) {
        lidBounds.union(section.geometry.boundingBox);
      }
    });

    bottomGeometry.computeBoundingBox();
    const bottomBounds = bottomGeometry.boundingBox?.clone() ?? new THREE.Box3();

    const clipsBounds = new THREE.Box3();
    if (clipsGeometry) {
      clipsGeometry.computeBoundingBox();
      if (clipsGeometry.boundingBox) {
        clipsBounds.copy(clipsGeometry.boundingBox);
      }
    }

    return {
      "top-lid": lidBounds,
      "bottom-tray": bottomBounds,
      clips: clipsBounds,
    } satisfies PartBoundsMap;
  }, [bottomGeometry, clipsGeometry, lidSections]);

  const availableParts = useMemo(
    () => getAvailableViewerParts(Boolean(clipsGeometry)),
    [clipsGeometry]
  );

  const partMeshes = useMemo(
    () =>
      getPartMeshes(
        model,
        lidSections,
        bottomGeometry,
        clipsGeometry,
        panelColors,
        bottomColor,
        clipsColor
      ),
    [bottomColor, clipsColor, clipsGeometry, lidSections, model, panelColors, bottomGeometry]
  );

  const effectiveVisibleParts = useMemo(
    () => getEffectiveVisibleParts(viewerMode, visibleParts, availableParts),
    [availableParts, viewerMode, visibleParts]
  );

  const layout = useMemo(
    () =>
      resolveViewerPartLayout(
        viewerMode,
        availableParts,
        effectiveVisibleParts,
        partBounds
      ),
    [availableParts, effectiveVisibleParts, partBounds, viewerMode]
  );

  const layoutBounds = useMemo(
    () => getLayoutBounds(partBounds, layout),
    [layout, partBounds]
  );

  const [logoTextures, setLogoTextures] = useState<LogoTextureMap>({});

  useEffect(() => {
    onLayoutBoundsChange?.(layoutBounds);
  }, [layoutBounds, onLayoutBoundsChange]);

  useEffect(() => {
    return () => {
      for (const texture of Object.values(logoTextures)) {
        texture.dispose();
      }
    };
  }, [logoTextures]);

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      const textureEntries = await Promise.all(
        logos.map(async (logo) => {
          if (!logo.dataUrl && !logo.vectorSvg) {
            return null;
          }

          try {
            const image = await loadLogoPreviewImage({
              dataUrl: logo.dataUrl,
              rasterSourceDataUrl: logo.rasterSourceDataUrl,
              vectorSvg: logo.vectorSvg,
              originalFileName: logo.originalFileName,
              color: logo.color,
              sourceKind: resolveLogoSourceKind(logo),
              traceStyle: logo.traceSettings.style,
            });

            if (!image) {
              return null;
            }

            const texture = new THREE.Texture(image);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;

            return [logo.id, texture] as const;
          } catch {
            return null;
          }
        })
      );

      if (isCancelled) {
        for (const entry of textureEntries) {
          entry?.[1].dispose();
        }
        return;
      }

      const texturePairs = textureEntries.filter(
        (entry) => entry !== null
      ) as Array<readonly [string, THREE.Texture]>;
      const nextTextures = Object.fromEntries(texturePairs) as LogoTextureMap;

      setLogoTextures(() => nextTextures);
    })();

    return () => {
      isCancelled = true;
    };
  }, [logos]);

  const panelImageOverlays = useMemo(() => {
    return logos.flatMap((logo, logoIndex) => {
      const texture = logoTextures[logo.id];
      if (!texture?.image) {
        return [];
      }

      const sourceImage = texture.image as
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

      const artworkBounds = getArtworkBounds(logo, topLidBounds);
      if (!artworkBounds.width || !artworkBounds.height) {
        return [];
      }

      const zOffsetBase = artworkStyle === "emboss" ? 0.35 : 0.02;

      return getContinuousPanelArtworkSlices(
        lidSections,
        artworkBounds,
        sourceWidth,
        sourceHeight
      ).map((slice, sliceIndex) => {
        const panel = slice.panel;
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = Math.max(
          1,
          Math.round((panel.height / panel.width) * canvas.width)
        );

        const context = canvas.getContext("2d");
        if (!context) {
          return null;
        }

        const destX =
          ((slice.overlapMinX - panel.bounds.min.x) / panel.width) * canvas.width;
        const destY =
          ((panel.bounds.max.y - slice.overlapMaxY) / panel.height) * canvas.height;
        const destWidth = (slice.overlapWidth / panel.width) * canvas.width;
        const destHeight = (slice.overlapHeight / panel.height) * canvas.height;

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
          key: `${logo.id}-${sliceIndex}-${panel.center.x.toFixed(3)}-${panel.center.y.toFixed(3)}`,
          panel: slice.panel,
          texture,
          zOffset: zOffsetBase + logoIndex * 0.001,
        } satisfies PanelImageOverlay;
      }).filter(Boolean) as PanelImageOverlay[];
    });
  }, [artworkStyle, lidSections, logos, logoTextures, topLidBounds]);

  useEffect(() => {
    return () => {
      for (const overlay of panelImageOverlays) {
        overlay.texture.dispose();
      }
    };
  }, [panelImageOverlays]);

  return (
    <group>
      <group position={layout["top-lid"].position}>
        {layout["top-lid"].visible
          ? partMeshes
              .filter((part) => part.key.startsWith("lid-"))
              .map((part) => (
                <mesh key={part.key} name={part.name} geometry={part.geometry}>
                  <meshStandardMaterial
                    color={part.color}
                    roughness={0.4}
                    metalness={0.1}
                  />
                </mesh>
              ))
          : null}

        {layout["top-lid"].visible
          ? panelImageOverlays.map((overlay, index) => (
              <mesh
                key={overlay.key}
                position={[
                  overlay.panel.center.x,
                  overlay.panel.center.y,
                  overlay.panel.outerFaceZ + overlay.zOffset,
                ]}
                renderOrder={index}
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
            ))
          : null}
      </group>

      {layout["bottom-tray"].visible ? (
        <group position={layout["bottom-tray"].position}>
          {partMeshes
            .filter((part) => part.key === "bottom-tray")
            .map((part) => (
              <mesh key={part.key} name={part.name} geometry={part.geometry}>
                <meshStandardMaterial
                  color={part.color}
                  roughness={0.4}
                  metalness={0.1}
                />
              </mesh>
            ))}
        </group>
      ) : null}

      {layout.clips.visible ? (
        <group position={layout.clips.position} rotation={layout.clips.rotation}>
          {partMeshes
            .filter((part) => part.key === "clips")
            .map((part) => (
              <mesh key={part.key} name={part.name} geometry={part.geometry}>
                <meshStandardMaterial
                  color={part.color}
                  roughness={0.4}
                  metalness={0.1}
                />
              </mesh>
            ))}
        </group>
      ) : null}
    </group>
  );
}
