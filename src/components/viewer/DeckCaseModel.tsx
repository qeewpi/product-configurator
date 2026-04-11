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
import type { ViewerPartKey, ViewerVisibleParts } from "@/types/design";

const COMPACT_LID_NAMES = ["lid-left", "lid-center", "lid-right"] as const;
const PART_ORDER: ViewerPartKey[] = ["top-lid", "bottom-tray", "clips"];
const FLAT_LAY_VERTICAL_GAP = 18;
const FLAT_LAY_CLIP_GAP = 20;

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

type LayoutBounds = {
  center: [number, number, number];
  size: [number, number, number];
};

type PartLayout = {
  position: [number, number, number];
  rotation: [number, number, number];
  visible: boolean;
};

type PartBoundsMap = Record<ViewerPartKey, THREE.Box3>;
type PartLayoutMap = Record<ViewerPartKey, PartLayout>;

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
  const logo = useDesignStore((s) => s.logo);
  const artworkStyle = useDesignStore((s) => s.artworkStyle);
  const viewerMode = useDesignStore((s) => s.viewerMode);
  const visibleParts = useDesignStore((s) => s.visibleParts);
  const { dataUrl, rasterSourceDataUrl, vectorSvg, color, originalFileName } =
    logo;

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

  const availableParts = useMemo(() => {
    return {
      "top-lid": true,
      "bottom-tray": true,
      clips: Boolean(clipsGeometry),
    } satisfies ViewerVisibleParts;
  }, [clipsGeometry]);

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

  const effectiveVisibleParts = useMemo(() => {
    const nextVisibleParts: ViewerVisibleParts = {
      "top-lid": availableParts["top-lid"] && visibleParts["top-lid"],
      "bottom-tray":
        availableParts["bottom-tray"] && visibleParts["bottom-tray"],
      clips: availableParts.clips && visibleParts.clips,
    };

    if (viewerMode === "assembled") {
      return nextVisibleParts;
    }

    const visibleCount = Object.values(nextVisibleParts).filter(Boolean).length;
    if (visibleCount > 0) {
      return nextVisibleParts;
    }

    for (const part of PART_ORDER) {
      if (availableParts[part]) {
        nextVisibleParts[part] = true;
        break;
      }
    }

    return nextVisibleParts;
  }, [availableParts, viewerMode, visibleParts]);

  const layout = useMemo(() => {
    const defaultLayout: PartLayoutMap = {
      "top-lid": {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        visible: availableParts["top-lid"],
      },
      "bottom-tray": {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        visible: availableParts["bottom-tray"],
      },
      clips: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        visible: availableParts.clips,
      },
    };

    if (viewerMode === "assembled") {
      return defaultLayout;
    }

    const topLidSize = partBounds["top-lid"].getSize(new THREE.Vector3());
    const bottomSize = partBounds["bottom-tray"].getSize(new THREE.Vector3());
    const topLidCenter = partBounds["top-lid"].getCenter(new THREE.Vector3());
    const bottomCenter = partBounds["bottom-tray"].getCenter(new THREE.Vector3());
    const topLidSurfaceOffset = -partBounds["top-lid"].min.z;
    const bottomSurfaceOffset = -partBounds["bottom-tray"].min.z;
    const flatLayClipRotation: [number, number, number] = [
      -Math.PI / 2,
      0,
      0,
    ];
    const rotatedClipsGeometryBounds = partBounds.clips
      .clone()
      .applyMatrix4(
        new THREE.Matrix4().makeRotationFromEuler(
          new THREE.Euler(...flatLayClipRotation)
        )
      );
    const clipsSize = rotatedClipsGeometryBounds.getSize(new THREE.Vector3());
    const clipsCenter = rotatedClipsGeometryBounds.getCenter(new THREE.Vector3());
    const clipsSurfaceOffset = -rotatedClipsGeometryBounds.min.z;
    const partHeights: Record<ViewerPartKey, number> = {
      "top-lid": topLidSize.y,
      "bottom-tray": bottomSize.y,
      clips: clipsSize.y,
    };
    const partCenters: Record<ViewerPartKey, THREE.Vector3> = {
      "top-lid": topLidCenter,
      "bottom-tray": bottomCenter,
      clips: clipsCenter,
    };
    const partSurfaceOffsets: Record<ViewerPartKey, number> = {
      "top-lid": topLidSurfaceOffset,
      "bottom-tray": bottomSurfaceOffset,
      clips: clipsSurfaceOffset,
    };
    const partRotations: Record<ViewerPartKey, [number, number, number]> = {
      "top-lid": [0, 0, 0],
      "bottom-tray": [0, 0, 0],
      clips: flatLayClipRotation,
    };

    const flatLayLayout: PartLayoutMap = {
      "top-lid": {
        position: [
          -topLidCenter.x,
          bottomSize.y / 2 + topLidSize.y / 2 + FLAT_LAY_VERTICAL_GAP,
          topLidSurfaceOffset,
        ],
        rotation: [0, 0, 0],
        visible: availableParts["top-lid"],
      },
      "bottom-tray": {
        position: [-bottomCenter.x, 0, bottomSurfaceOffset],
        rotation: [0, 0, 0],
        visible: availableParts["bottom-tray"],
      },
      clips: {
        position: [
          -clipsCenter.x,
          -(bottomSize.y / 2 + clipsSize.y / 2 + FLAT_LAY_CLIP_GAP),
          clipsSurfaceOffset,
        ],
        rotation: flatLayClipRotation,
        visible: availableParts.clips,
      },
    };

    const baseLayout: PartLayoutMap =
      viewerMode === "flat-lay"
        ? flatLayLayout
        : (() => {
            const selectedParts = PART_ORDER.filter(
              (part) => availableParts[part] && effectiveVisibleParts[part]
            );
            const isolatedLayout: PartLayoutMap = {
              "top-lid": {
                ...flatLayLayout["top-lid"],
                visible: effectiveVisibleParts["top-lid"],
              },
              "bottom-tray": {
                ...flatLayLayout["bottom-tray"],
                visible: effectiveVisibleParts["bottom-tray"],
              },
              clips: {
                ...flatLayLayout.clips,
                visible: effectiveVisibleParts.clips,
              },
            };

            if (selectedParts.length === 0) {
              return isolatedLayout;
            }

            const gaps = selectedParts.map((part, index) => {
              if (index === 0) {
                return 0;
              }

              const previousPart = selectedParts[index - 1];
              if (
                (previousPart === "top-lid" && part === "bottom-tray") ||
                (previousPart === "bottom-tray" && part === "top-lid")
              ) {
                return FLAT_LAY_VERTICAL_GAP;
              }

              return FLAT_LAY_CLIP_GAP;
            });

            const totalHeight = selectedParts.reduce((sum, part, index) => {
              return sum + partHeights[part] + gaps[index];
            }, 0);

            let currentY = totalHeight / 2;

            selectedParts.forEach((part, index) => {
              currentY -= gaps[index];
              const height = partHeights[part];
              const center = partCenters[part];

              isolatedLayout[part] = {
                position: [
                  -center.x,
                  currentY - height / 2,
                  partSurfaceOffsets[part],
                ],
                rotation: partRotations[part],
                visible: true,
              };

              currentY -= height;
            });

            return isolatedLayout;
          })();

    const referenceBounds = new THREE.Box3();
    PART_ORDER.forEach((part) => {
      const rotatedBounds = partBounds[part]
        .clone()
        .applyMatrix4(
          new THREE.Matrix4().makeRotationFromEuler(
            new THREE.Euler(...flatLayLayout[part].rotation)
          )
        );
      const translatedBounds = rotatedBounds.translate(
        new THREE.Vector3(...flatLayLayout[part].position)
      );
      referenceBounds.union(translatedBounds);
    });

    const referenceCenter = new THREE.Vector3();
    referenceBounds.getCenter(referenceCenter);

    return {
      "top-lid": {
        ...baseLayout["top-lid"],
        position: [
          baseLayout["top-lid"].position[0] - referenceCenter.x,
          baseLayout["top-lid"].position[1] - referenceCenter.y,
          baseLayout["top-lid"].position[2] - referenceCenter.z,
        ],
      },
      "bottom-tray": {
        ...baseLayout["bottom-tray"],
        position: [
          baseLayout["bottom-tray"].position[0] - referenceCenter.x,
          baseLayout["bottom-tray"].position[1] - referenceCenter.y,
          baseLayout["bottom-tray"].position[2] - referenceCenter.z,
        ],
      },
      clips: {
        ...baseLayout.clips,
        position: [
          baseLayout.clips.position[0] - referenceCenter.x,
          baseLayout.clips.position[1] - referenceCenter.y,
          baseLayout.clips.position[2] - referenceCenter.z,
        ],
      },
    } satisfies PartLayoutMap;
  }, [availableParts, effectiveVisibleParts, partBounds, viewerMode]);

  const layoutBounds = useMemo(() => {
    const translatedBounds = new THREE.Box3();
    PART_ORDER.forEach((part) => {
      if (viewerMode === "isolated" && !layout[part].visible) {
        return;
      }

      const rotatedBounds = partBounds[part]
        .clone()
        .applyMatrix4(
          new THREE.Matrix4().makeRotationFromEuler(
            new THREE.Euler(...layout[part].rotation)
          )
        );
      translatedBounds.union(
        rotatedBounds.translate(new THREE.Vector3(...layout[part].position))
      );
    });

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    translatedBounds.getCenter(center);
    translatedBounds.getSize(size);

    return {
      center: [center.x, center.y, center.z] as [number, number, number],
      size: [size.x, size.y, size.z] as [number, number, number],
    };
  }, [layout, partBounds, viewerMode]);

  const [logoTexture, setLogoTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    onLayoutBoundsChange?.(layoutBounds);
  }, [layoutBounds, onLayoutBoundsChange]);

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
        loadLogoPreviewImage({
          dataUrl,
          rasterSourceDataUrl,
          vectorSvg,
          originalFileName,
          color,
          sourceKind: resolveLogoSourceKind({
            rasterSourceDataUrl,
            vectorSvg,
            originalFileName,
            sourceKind: null,
          }),
          traceStyle: logo.traceSettings.style,
        })
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
  }, [
    color,
    dataUrl,
    logo.traceSettings.style,
    originalFileName,
    rasterSourceDataUrl,
    vectorSvg,
  ]);

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
      lidSections,
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
          panel: slice.panel,
          texture,
          zOffset: artworkStyle === "emboss" ? 0.35 : 0.02,
        };
      })
      .filter((overlay): overlay is NonNullable<typeof overlay> => overlay !== null);
  }, [artworkBounds, artworkStyle, lidSections, logoTexture]);

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
