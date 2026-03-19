import { useEffect, useRef, useCallback } from 'react';
import * as mpHands from '@mediapipe/hands';
import * as mpCamera from '@mediapipe/camera_utils';
import * as mpDrawing from '@mediapipe/drawing_utils';
import * as THREE from 'three';
import { useAppStore } from '@/stores/appStore';

// Accessing MediaPipe constants and classes safely without Rollup mangling
const mpH = mpHands as any;
const HandsConstructor = mpH['Hands'] || mpH.default?.['Hands'] || (window as any).Hands;
const HandConnections = mpH['HAND_CONNECTIONS'] || mpH.default?.['HAND_CONNECTIONS'] || (window as any).HAND_CONNECTIONS;
const mpC = mpCamera as any;
const CameraConstructor = mpC['Camera'] || mpC.default?.['Camera'] || (window as any).Camera;
const mpD = mpDrawing as any;
const drawConnectorsFn = mpD['drawConnectors'] || mpD.default?.['drawConnectors'] || (window as any).drawConnectors;
const drawLandmarksFn = mpD['drawLandmarks'] || mpD.default?.['drawLandmarks'] || (window as any).drawLandmarks;
// Note: Results is still imported as a type, so it doesn't runtime-fail if Hands is a namespace
type Results = mpHands.Results;

interface GestureState {
  lastRotateX: number | null;
  lastRotateY: number | null;
  lastPinchX: number | null;
}

export function useHandTracking(
  videoRef: React.RefObject<HTMLVideoElement>,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  cameraObjRef: React.RefObject<THREE.Camera | null>,
  controlsRef: React.RefObject<any>
) {
  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const processingRef = useRef(false);
  const lastFrameTimeRef = useRef(0);
  const lastGestureActiveRef = useRef(false);
  const FRAME_INTERVAL = 1000 / 10; // Throttle to 10fps for hand tracking
  const gestureState = useRef<GestureState>({
    lastRotateX: null,
    lastRotateY: null,
    lastPinchX: null,
  });

  const { handControlEnabled, toggleHandControl } = useAppStore();

  const onResults = useCallback((results: Results) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const cam = cameraObjRef.current;
    const ctrl = controlsRef.current;
    if (!canvas || !video || !cam || !ctrl) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const lm = results.multiHandLandmarks[0];
      if (!lastGestureActiveRef.current) {
        lastGestureActiveRef.current = true;
        useAppStore.getState().setGestureActive(true);
      }

      drawConnectorsFn(ctx, lm, HandConnections, { color: '#00ff88', lineWidth: 4 });
      drawLandmarksFn(ctx, lm, { color: '#ffffff', lineWidth: 2, radius: 4 });

      const isIndexUp = lm[8].y < lm[6].y;
      const isMiddleUp = lm[12].y < lm[10].y;
      const isRingUp = lm[16].y < lm[14].y;
      const isPinkyUp = lm[20].y < lm[18].y;

      // Open Palm: Zoom
      if (isIndexUp && isMiddleUp && isRingUp && isPinkyUp) {
        const currentX = lm[9].x;

        if (gestureState.current.lastPinchX !== null) {
          const dx = currentX - gestureState.current.lastPinchX;

          if (Math.abs(dx) > 0.002) {
            const zoomSpeed = 200.0;
            const forward = new THREE.Vector3();
            cam.getWorldDirection(forward);

            const cameraMove = forward.clone().multiplyScalar(-dx * zoomSpeed);
            cam.position.add(cameraMove);

            const targetMove = forward.clone().multiplyScalar(-dx * zoomSpeed * 0.1);
            ctrl.target.add(targetMove);
            ctrl.update();
          }
        }
        gestureState.current.lastPinchX = currentX;
        gestureState.current.lastRotateX = null;
        gestureState.current.lastRotateY = null;
      }
      // Peace: Speed control
      else if (isIndexUp && isMiddleUp && !isRingUp && !isPinkyUp) {
        const currentX = (lm[8].x + lm[12].x) / 2;

        if (gestureState.current.lastPinchX !== null) {
          const dx = currentX - gestureState.current.lastPinchX;

          if (Math.abs(dx) > 0.005) {
            // Read speed directly from store to avoid re-render loop
            const currentSpeed = useAppStore.getState().speed;
            const newSpeed = Math.max(0.1, Math.min(3.0, currentSpeed + dx * 2.0));
            useAppStore.getState().setSpeed(newSpeed);
          }
        }
        gestureState.current.lastPinchX = currentX;
        gestureState.current.lastRotateX = null;
        gestureState.current.lastRotateY = null;
      }
      // Point: Rotate
      else if (isIndexUp && !isMiddleUp) {
        const x = lm[8].x;
        const y = lm[8].y;

        if (gestureState.current.lastRotateX !== null) {
          const dx = x - gestureState.current.lastRotateX;
          const dy = y - gestureState.current.lastRotateY!;

          if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
            const rotateSpeed = 3.0;
            const spherical = new THREE.Spherical();
            spherical.setFromVector3(cam.position.clone().sub(ctrl.target));

            spherical.theta += dx * rotateSpeed;
            spherical.phi -= dy * rotateSpeed;
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

            const offset = new THREE.Vector3().setFromSpherical(spherical);
            cam.position.copy(ctrl.target).add(offset);
            cam.lookAt(ctrl.target);
            ctrl.update();
          }
        }
        gestureState.current.lastRotateX = x;
        gestureState.current.lastRotateY = y;
        gestureState.current.lastPinchX = null;
      } else {
        gestureState.current.lastRotateX = null;
        gestureState.current.lastRotateY = null;
        gestureState.current.lastPinchX = null;
      }
    } else {
      if (lastGestureActiveRef.current) {
        lastGestureActiveRef.current = false;
        useAppStore.getState().setGestureActive(false);
      }
      gestureState.current.lastRotateX = null;
      gestureState.current.lastRotateY = null;
      gestureState.current.lastPinchX = null;
    }
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;

    const hands = new HandsConstructor({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    hands.onResults(onResults);
    handsRef.current = hands;

    const cameraUtils = new CameraConstructor(videoRef.current, {
      onFrame: async () => {
        const now = performance.now();
        if (processingRef.current || now - lastFrameTimeRef.current < FRAME_INTERVAL) return;
        if (!videoRef.current) return;
        processingRef.current = true;
        lastFrameTimeRef.current = now;
        try {
          await hands.send({ image: videoRef.current });
        } catch (err) {
          console.warn('Hand tracking frame error:', err);
        } finally {
          processingRef.current = false;
        }
      },
      width: 320,
      height: 240,
    });

    cameraRef.current = cameraUtils;

    return () => {
      hands.close();
      cameraUtils.stop();
    };
  // onResults is stable (no reactive deps), so this only runs once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef]);

  const startTracking = useCallback(async () => {
    if (cameraRef.current) {
      await cameraRef.current.start();
    }
  }, []);

  const stopTracking = useCallback(async () => {
    if (cameraRef.current) {
      await cameraRef.current.stop();
    }
  }, []);

  useEffect(() => {
    if (handControlEnabled) {
      startTracking();
    } else {
      stopTracking();
    }
  }, [handControlEnabled, startTracking, stopTracking]);

  return { startTracking, stopTracking };
}
