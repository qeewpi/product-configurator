import assert from "node:assert/strict";
import * as THREE from "three";
import {
  getAvailableViewerParts,
  getEffectiveVisibleParts,
  getLayoutBounds,
  resolveViewerPartLayout,
} from "./view-mode-layout.ts";
import type { ViewerVisibleParts } from "../types/design";

function createPartBounds() {
  return {
    "top-lid": new THREE.Box3(
      new THREE.Vector3(-30, -10, -2),
      new THREE.Vector3(30, 10, 2),
    ),
    "bottom-tray": new THREE.Box3(
      new THREE.Vector3(-28, -12, -6),
      new THREE.Vector3(28, 12, 6),
    ),
    clips: new THREE.Box3(
      new THREE.Vector3(-12, -4, -3),
      new THREE.Vector3(12, 4, 3),
    ),
  };
}

function runAssembledLayoutTest() {
  const availableParts = getAvailableViewerParts(true);
  const effectiveVisibleParts = getEffectiveVisibleParts(
    "assembled",
    availableParts,
    availableParts,
  );
  const layout = resolveViewerPartLayout(
    "assembled",
    availableParts,
    effectiveVisibleParts,
    createPartBounds(),
  );

  assert.equal(layout["top-lid"].visible, true);
  assert.equal(layout["bottom-tray"].visible, true);
  assert.equal(layout.clips.visible, true);
  assert.deepEqual(layout["top-lid"].position, [0, 0, 0]);
  assert.deepEqual(layout["bottom-tray"].position, [0, 0, 0]);
  assert.deepEqual(layout.clips.position, [0, 0, 0]);
}

function runFlatLayLayoutTest() {
  const availableParts = getAvailableViewerParts(true);
  const effectiveVisibleParts = getEffectiveVisibleParts(
    "flat-lay",
    availableParts,
    availableParts,
  );
  const layout = resolveViewerPartLayout(
    "flat-lay",
    availableParts,
    effectiveVisibleParts,
    createPartBounds(),
  );

  assert.ok(layout["top-lid"].position[1] > layout["bottom-tray"].position[1]);
  assert.ok(layout.clips.position[1] < layout["bottom-tray"].position[1]);
  assert.deepEqual(layout.clips.rotation, [-Math.PI / 2, 0, 0]);
}

function runIsolatedLayoutTest() {
  const availableParts = getAvailableViewerParts(true);
  const selectedParts: ViewerVisibleParts = {
    "top-lid": true,
    "bottom-tray": false,
    clips: false,
  };
  const effectiveVisibleParts = getEffectiveVisibleParts(
    "isolated",
    selectedParts,
    availableParts,
  );
  const partBounds = createPartBounds();
  const layout = resolveViewerPartLayout(
    "isolated",
    availableParts,
    effectiveVisibleParts,
    partBounds,
  );
  const bounds = getLayoutBounds(partBounds, layout);

  assert.equal(layout["top-lid"].visible, true);
  assert.equal(layout["bottom-tray"].visible, false);
  assert.equal(layout.clips.visible, false);
  assert.equal(bounds.size[0], 60);
  assert.equal(bounds.size[1], 20);
}

function runNoClipsModelTest() {
  const availableParts = getAvailableViewerParts(false);
  const effectiveVisibleParts = getEffectiveVisibleParts(
    "flat-lay",
    {
      "top-lid": true,
      "bottom-tray": true,
      clips: true,
    },
    availableParts,
  );
  const layout = resolveViewerPartLayout(
    "flat-lay",
    availableParts,
    effectiveVisibleParts,
    createPartBounds(),
  );

  assert.equal(layout.clips.visible, false);
  assert.equal(layout["top-lid"].visible, true);
  assert.equal(layout["bottom-tray"].visible, true);
}

runAssembledLayoutTest();
runFlatLayLayoutTest();
runIsolatedLayoutTest();
runNoClipsModelTest();

console.log("view-mode-layout tests passed");
