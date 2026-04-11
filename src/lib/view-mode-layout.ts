import * as THREE from "three";
import type {
  ViewerMode,
  ViewerPartKey,
  ViewerVisibleParts,
} from "../types/design";

export const VIEWER_PART_ORDER: ViewerPartKey[] = [
  "top-lid",
  "bottom-tray",
  "clips",
];

const FLAT_LAY_VERTICAL_GAP = 18;
const FLAT_LAY_CLIP_GAP = 20;
const FLAT_LAY_CLIP_ROTATION: [number, number, number] = [
  -Math.PI / 2,
  0,
  0,
];

export type LayoutBounds = {
  center: [number, number, number];
  size: [number, number, number];
};

export type PartLayout = {
  position: [number, number, number];
  rotation: [number, number, number];
  visible: boolean;
};

export type PartBoundsMap = Record<ViewerPartKey, THREE.Box3>;
export type PartLayoutMap = Record<ViewerPartKey, PartLayout>;

export function getAvailableViewerParts(
  hasClips: boolean,
): ViewerVisibleParts {
  return {
    "top-lid": true,
    "bottom-tray": true,
    clips: hasClips,
  };
}

export function getEffectiveVisibleParts(
  viewerMode: ViewerMode,
  visibleParts: ViewerVisibleParts,
  availableParts: ViewerVisibleParts,
): ViewerVisibleParts {
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

  for (const part of VIEWER_PART_ORDER) {
    if (availableParts[part]) {
      nextVisibleParts[part] = true;
      break;
    }
  }

  return nextVisibleParts;
}

function getRotatedBounds(
  bounds: THREE.Box3,
  rotation: [number, number, number],
) {
  return bounds.clone().applyMatrix4(
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)),
  );
}

export function resolveViewerPartLayout(
  viewerMode: ViewerMode,
  availableParts: ViewerVisibleParts,
  effectiveVisibleParts: ViewerVisibleParts,
  partBounds: PartBoundsMap,
): PartLayoutMap {
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
  const rotatedClipsBounds = getRotatedBounds(
    partBounds.clips,
    FLAT_LAY_CLIP_ROTATION,
  );
  const clipsSize = rotatedClipsBounds.getSize(new THREE.Vector3());
  const clipsCenter = rotatedClipsBounds.getCenter(new THREE.Vector3());
  const clipsSurfaceOffset = -rotatedClipsBounds.min.z;

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
    clips: FLAT_LAY_CLIP_ROTATION,
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
      rotation: FLAT_LAY_CLIP_ROTATION,
      visible: availableParts.clips,
    },
  };

  const baseLayout: PartLayoutMap =
    viewerMode === "flat-lay"
      ? flatLayLayout
      : (() => {
          const selectedParts = VIEWER_PART_ORDER.filter(
            (part) => availableParts[part] && effectiveVisibleParts[part],
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
  VIEWER_PART_ORDER.forEach((part) => {
    const translatedBounds = getRotatedBounds(
      partBounds[part],
      flatLayLayout[part].rotation,
    ).translate(new THREE.Vector3(...flatLayLayout[part].position));
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
  };
}

export function getLayoutBounds(
  partBounds: PartBoundsMap,
  layout: PartLayoutMap,
): LayoutBounds {
  const translatedBounds = new THREE.Box3();

  VIEWER_PART_ORDER.forEach((part) => {
    if (!layout[part].visible) {
      return;
    }

    translatedBounds.union(
      getRotatedBounds(partBounds[part], layout[part].rotation).translate(
        new THREE.Vector3(...layout[part].position),
      ),
    );
  });

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  translatedBounds.getCenter(center);
  translatedBounds.getSize(size);

  return {
    center: [center.x, center.y, center.z],
    size: [size.x, size.y, size.z],
  };
}
