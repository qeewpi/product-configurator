"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Center } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import DeckCaseModel from "./DeckCaseModel";

const CAMERA_POSITION: [number, number, number] = [0, 0, 220];
const CAMERA_TARGET: [number, number, number] = [0, 0, 0];
const KEYBOARD_PAN_SPEED = 2.2;
const KEYBOARD_PAN_ACCELERATION = 10;
const KEYBOARD_PAN_DAMPING = 7;
const VIEWER_TUTORIAL_STORAGE_KEY = "viewer-tutorial-dismissed";

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[20, 20, 5]} />
      <meshStandardMaterial color="#666" wireframe />
    </mesh>
  );
}

function KeyboardCameraMotion({
  controlsRef,
  pressedKeysRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  pressedKeysRef: React.RefObject<Set<string>>;
}) {
  const velocityRef = useRef(new THREE.Vector2(0, 0));

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const pressedKeys = pressedKeysRef.current;
    const targetHorizontal =
      (pressedKeys.has("d") ? 1 : 0) - (pressedKeys.has("a") ? 1 : 0);
    const targetVertical =
      (pressedKeys.has("w") ? 1 : 0) - (pressedKeys.has("s") ? 1 : 0);
    const velocity = velocityRef.current;
    const accelerationAlpha = 1 - Math.exp(-KEYBOARD_PAN_ACCELERATION * delta);
    const dampingAlpha = 1 - Math.exp(-KEYBOARD_PAN_DAMPING * delta);

    velocity.x = THREE.MathUtils.lerp(
      velocity.x,
      targetHorizontal,
      targetHorizontal === 0 ? dampingAlpha : accelerationAlpha
    );
    velocity.y = THREE.MathUtils.lerp(
      velocity.y,
      targetVertical,
      targetVertical === 0 ? dampingAlpha : accelerationAlpha
    );

    if (Math.abs(velocity.x) < 0.001 && Math.abs(velocity.y) < 0.001) {
      velocity.set(0, 0);
      return;
    }

    const camera = controls.object;
    const distance = camera.position.distanceTo(controls.target);
    const panDistance = Math.max(distance * KEYBOARD_PAN_SPEED * delta, 0.5);

    const right = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(camera.quaternion)
      .multiplyScalar(velocity.x * panDistance);
    const up = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(camera.quaternion)
      .multiplyScalar(velocity.y * panDistance);
    const offset = right.add(up);

    camera.position.add(offset);
    controls.target.add(offset);
    controls.update();
  });

  return null;
}

export default function Scene() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const pressedKeysRef = useRef(new Set<string>());
  const [isHandToolPinned, setIsHandToolPinned] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.localStorage.getItem(VIEWER_TUTORIAL_STORAGE_KEY) !== "true"
    );
  });
  const isHandToolActive = isHandToolPinned || isSpacePressed;

  const applyDefaultCamera = () => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.object.position.set(...CAMERA_POSITION);
    controls.object.up.set(0, 1, 0);
    controls.target.set(...CAMERA_TARGET);
    controls.update();
  };

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    applyDefaultCamera();
    controls.saveState();
  }, []);

  const resetCamera = () => {
    applyDefaultCamera();
    setIsHandToolPinned(false);
    setIsSpacePressed(false);
  };

  const dismissTutorial = () => {
    setIsTutorialOpen(false);
    window.localStorage.setItem(VIEWER_TUTORIAL_STORAGE_KEY, "true");
  };

  useEffect(() => {
    const shouldIgnoreKeybind = (eventTarget: EventTarget | null) => {
      if (!(eventTarget instanceof HTMLElement)) return false;

      const tagName = eventTarget.tagName;
      return (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        eventTarget.isContentEditable
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreKeybind(event.target) || event.repeat) return;

      const key = event.key.toLowerCase();

      if (key === "h") {
        event.preventDefault();
        setIsHandToolPinned((value) => !value);
        return;
      }

      if (key === "r") {
        event.preventDefault();
        resetCamera();
        return;
      }

      if (key === " " || key === "spacebar") {
        event.preventDefault();
        setIsSpacePressed(true);
        return;
      }

      if (key === "w" || key === "a" || key === "s" || key === "d") {
        event.preventDefault();
        pressedKeysRef.current.add(key);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (shouldIgnoreKeybind(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === " " || key === "spacebar") {
        event.preventDefault();
        setIsSpacePressed(false);
      }

      if (key === "w" || key === "a" || key === "s" || key === "d") {
        event.preventDefault();
        pressedKeysRef.current.delete(key);
      }
    };

    const onWindowBlur = () => {
      setIsSpacePressed(false);
      pressedKeysRef.current.clear();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [isHandToolActive]);

  return (
    <div className="relative w-full h-full">
      {isTutorialOpen && (
        <div className="absolute right-16 top-4 z-10 w-[280px] rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-700 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Viewer Tips</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Quick camera controls for moving around the model.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissTutorial}
              className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Dismiss tutorial"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="m6 6 12 12" />
                <path d="M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="mt-3 space-y-2 text-xs text-zinc-600">
            <p><span className="font-medium text-zinc-900">Rotate:</span> drag with the mouse.</p>
            <p><span className="font-medium text-zinc-900">Pan:</span> click the hand icon, or hold <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-sans text-[11px]">Space</kbd> to pan with the mouse.</p>
            <p><span className="font-medium text-zinc-900">Move:</span> hold <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-sans text-[11px]">W</kbd> <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-sans text-[11px]">A</kbd> <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-sans text-[11px]">S</kbd> <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-sans text-[11px]">D</kbd> to smoothly move the camera anytime.</p>
            <p><span className="font-medium text-zinc-900">Shortcuts:</span> <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-sans text-[11px]">H</kbd> pins the hand tool and <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-sans text-[11px]">R</kbd> resets the camera.</p>
          </div>
          <button
            type="button"
            onClick={dismissTutorial}
            className="mt-4 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Got it
          </button>
        </div>
      )}

      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          aria-label="Toggle hand tool"
          title="Hand tool (H). Hold Space to pan. Use W/A/S/D to move."
          onClick={() => setIsHandToolPinned((value) => !value)}
          className={`flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white transition-colors ${
            isHandToolActive
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M7 11.5V6.75a1.75 1.75 0 1 1 3.5 0V10" />
            <path d="M10.5 10V5.75a1.75 1.75 0 1 1 3.5 0V10" />
            <path d="M14 10V7.25a1.75 1.75 0 1 1 3.5 0V14" />
            <path d="M7 12.5 5.8 11A1.75 1.75 0 0 0 3 12.3l3.1 5.2A4 4 0 0 0 9.54 19.5H14a4 4 0 0 0 4-4V14" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Reset camera"
          title="Reset camera (R)"
          onClick={resetCamera}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M3 12a9 9 0 1 0 3-6.708" />
            <path d="M3 4v5h5" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Show viewer tips"
          title="Viewer tips"
          onClick={() => setIsTutorialOpen((value) => !value)}
          className={`flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white transition-colors ${
            isTutorialOpen
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          <span className="text-[20px] leading-none font-medium">?</span>
        </button>
      </div>

      <Canvas
        camera={{ position: CAMERA_POSITION, fov: 45 }}
        className="w-full h-full"
      >
        <KeyboardCameraMotion
          controlsRef={controlsRef}
          pressedKeysRef={pressedKeysRef}
        />
        <ambientLight intensity={0.5} />
        <directionalLight position={[100, -100, 100]} intensity={1} />
        <directionalLight position={[-50, 50, 80]} intensity={0.5} />

        <Suspense fallback={<LoadingFallback />}>
          <Center>
            <DeckCaseModel />
          </Center>
        </Suspense>

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          enablePan={isHandToolActive}
          dampingFactor={0.1}
          target={CAMERA_TARGET}
          minPolarAngle={0.05}
          maxPolarAngle={Math.PI - 0.05}
          minDistance={30}
          maxDistance={300}
          mouseButtons={{
            LEFT: isHandToolActive ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: isHandToolActive ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
          }}
          touches={{
            ONE: isHandToolActive ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN,
          }}
        />
      </Canvas>
    </div>
  );
}
