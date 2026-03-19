import { useRef, useMemo, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useAppStore, useAlertStore } from '@/stores/appStore';
import { getGeometryForStyle, getMaterialForStyle, updateShaderTime } from '@/lib/materials';
import type { CustomUpdateFunction } from '@/types';
import type { ShapeResult } from '@/lib/shapes';

interface ParticleMeshProps {
  targetPositions: THREE.Vector3[];
  targetColors: THREE.Color[];
  extras: Array<{ seed: number; ox?: number; oy?: number; oz?: number }>;
  customFunction: CustomUpdateFunction | null;
  customFunctionVersion: number;
  count: number;
  onSetInfo?: (title: string, description: string) => void;
  onAnnotate?: (annotations: Array<{ id: string, pos: THREE.Vector3 | [number, number, number], label: string, visible?: boolean }>) => void;
}

function ParticleMesh({ targetPositions, targetColors, extras, customFunction: customFunctionProp, customFunctionVersion, count, onSetInfo, onAnnotate }: ParticleMeshProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const currentPositions = useRef<THREE.Vector3[]>([]);
  const currentColors = useRef<THREE.Color[]>([]);
  const controlsRegistered = useRef(false);
  const lastAnnotationCount = useRef(0);
  const customFunctionRef = useRef(customFunctionProp);
  
  // Keep ref in sync with prop - version triggers update when function changes
  useEffect(() => {
    customFunctionRef.current = customFunctionProp;
  }, [customFunctionProp, customFunctionVersion]);
  
  const {
    renderStyle,
    mode,
    speed,
    simTime,
    textAnim,
    textWidthWorld,
    bloomStrength,
    customParams,
    addControl,
  } = useAppStore();

  // Initialize current positions
  useEffect(() => {
    currentPositions.current = targetPositions.map(p => p.clone());
    currentColors.current = targetColors.map(c => c.clone());
  }, [targetPositions, targetColors]);

  // Update target positions/colors when they change
  useEffect(() => {
    if (meshRef.current) {
      targetPositions.forEach((pos, i) => {
        if (i < count) {
          dummy.position.copy(pos);
          dummy.updateMatrix();
          meshRef.current!.setMatrixAt(i, dummy.matrix);
          meshRef.current!.setColorAt(i, targetColors[i] || new THREE.Color(0x00ff88));
        }
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) {
        meshRef.current.instanceColor.needsUpdate = true;
      }
    }
  }, [targetPositions, targetColors, count, dummy]);

  const geometry = useMemo(() => getGeometryForStyle(renderStyle), [renderStyle]);
  const material = useMemo(() => getMaterialForStyle(renderStyle), [renderStyle]);

  // Create a working addControl function that registers and reads from store
  const addControlCallback = useCallback((id: string, label: string, min: number, max: number, initial: number): number => {
    return addControl(id, label, min, max, initial);
  }, [addControl]);

  useFrame(() => {
    if (!meshRef.current) return;

    const time = simTime;
    const target = new THREE.Vector3();
    const color = new THREE.Color();

    // Update shader uniforms
    updateShaderTime(renderStyle, time);

    const annotationsThisFrame = new Map<string, { id: string, pos: THREE.Vector3 | [number, number, number], label: string, visible?: boolean }>();


    for (let i = 0; i < count; i++) {
      if (!currentPositions.current[i]) continue;

      // Run custom function if in custom mode
      if (mode === 'custom' && customFunctionRef.current) {
        try {
          // Reset color to white before each call (as original does)
          color.setHex(0xffffff);
          customFunctionRef.current(
            i,
            count,
            target,
            color,
            THREE,
            time,
            onSetInfo || (() => {}),
            (id: string, xOrVec: number | THREE.Vector3, yOrLabel: number | string, zOrVisible?: number | boolean, labelOpt?: string | boolean, visibleOpt?: boolean) => {
              if (onAnnotate) {
                if (xOrVec && typeof (xOrVec as THREE.Vector3).x === 'number') {
                  const vec = xOrVec as THREE.Vector3;
                  annotationsThisFrame.set(id, { id, pos: vec, label: yOrLabel as string, visible: zOrVisible !== false });
                } else {
                  annotationsThisFrame.set(id, { id, pos: [xOrVec as number, yOrLabel as number, zOrVisible as number], label: labelOpt as string, visible: visibleOpt !== false });
                }
              }
            },
            addControlCallback
          );
          targetPositions[i].copy(target);
          currentColors.current[i].copy(color);
        } catch (e) {
          console.error('Custom function error:', e);
          // On error, disable the custom function to prevent spam
          customFunctionRef.current = null;
          useAlertStore.getState().openAlert('Runtime Error', (e as Error).message + '\n\nSimulation Reverted.', 'error');
          // Switch back to sphere
          useAppStore.getState().setMode('sphere');
          break; // Exit the loop
        }
      }

      // Text animation
      if (mode === 'text') {
        const ox = extras[i]?.ox || 0;
        const oy = extras[i]?.oy || 0;
        
        switch (textAnim) {
          case 'scroll':
            targetPositions[i].x = ox - (time * 20) % (textWidthWorld * 2);
            if (targetPositions[i].x < -textWidthWorld) {
              targetPositions[i].x += textWidthWorld * 2;
            }
            break;
          case 'wave':
            targetPositions[i].y = oy + Math.sin(time * 4 + ox * 0.2) * 2;
            break;
          case 'pulse':
            targetPositions[i].z = Math.sin(time * 5) * 2;
            break;
          case 'rain':
            let drop = (oy - (time * 20) % 60);
            if (drop < -30) drop += 60;
            targetPositions[i].y = drop;
            break;
        }
      }

      // Lerp current to target
      let targetPos = targetPositions[i].clone();
      
      // Hover effect for shapes - applied to target, not modifying original
      if (['sphere', 'cube', 'helix', 'torus'].includes(mode)) {
        const seed = extras[i]?.seed || 0;
        targetPos.y += Math.sin(time + seed) * 0.05;
      }

      currentPositions.current[i].lerp(targetPos, 0.1);

      dummy.position.copy(currentPositions.current[i]);

      // Rotation based on style
      if (renderStyle === 'vector') {
        const lookTarget = targetPos.clone().sub(currentPositions.current[i]).normalize().multiplyScalar(2).add(dummy.position);
        if (targetPos.distanceToSquared(currentPositions.current[i]) > 0.1) {
          dummy.lookAt(lookTarget);
        }
      } else if (['plasma', 'ink', 'paint'].includes(renderStyle)) {
        dummy.lookAt(camera.position);
      } else {
        dummy.rotation.set(0, 0, 0);
      }

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      if (currentColors.current[i]) {
        meshRef.current.setColorAt(i, currentColors.current[i]);
      }
    }

    // Dispatch aggregated annotations
    if (onAnnotate) {
      if (annotationsThisFrame.size > 0 || lastAnnotationCount.current > 0) {
        onAnnotate(Array.from(annotationsThisFrame.values()));
      }
      lastAnnotationCount.current = annotationsThisFrame.size;
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
    
    // Additional update for custom mode colors
    if (mode === 'custom' && customFunctionRef.current && meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, count]}
        frustumCulled={false}
      />
      <EffectComposer>
        <Bloom
          intensity={bloomStrength}
          width={300}
          height={300}
          kernelSize={5}
          luminanceThreshold={0}
          luminanceSmoothing={0.4}
        />
      </EffectComposer>
    </>
  );
}

interface ParticleSystemProps {
  shapeResult: ShapeResult;
  customFunction: CustomUpdateFunction | null;
  customFunctionVersion: number;
  count: number;
  onSetInfo?: (title: string, description: string) => void;
  onAnnotate?: (annotations: Array<{ id: string, pos: THREE.Vector3 | [number, number, number], label: string, visible?: boolean }>) => void;
  onCameraReady?: (camera: THREE.Camera, controls: any) => void;
}

function Scene({ shapeResult, customFunction, customFunctionVersion, count, onSetInfo, onAnnotate, onCameraReady }: ParticleSystemProps) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const { autoSpin, gestureActive } = useAppStore();

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoSpin && !gestureActive;
      controlsRef.current.autoRotateSpeed = 2.0;
    }
    if (onCameraReady && camera && controlsRef.current) {
      onCameraReady(camera, controlsRef.current);
    }
  }, [autoSpin, gestureActive, camera, onCameraReady]);

  return (
    <>
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 0.01]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[50, 50, 50]} intensity={1.5} />
      <hemisphereLight intensity={1.5} groundColor="#444444" />

      <ParticleMesh
        targetPositions={shapeResult.positions}
        targetColors={shapeResult.colors}
        extras={shapeResult.extras || []}
        customFunction={customFunction}
        customFunctionVersion={customFunctionVersion}
        count={count}
        onSetInfo={onSetInfo}
        onAnnotate={onAnnotate}
      />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        enablePan={false}
        autoRotate={autoSpin && !gestureActive}
        autoRotateSpeed={2}
      />
    </>
  );
}

export function ParticleSystem({ shapeResult, customFunction, customFunctionVersion, count, onSetInfo, onAnnotate, onCameraReady }: ParticleSystemProps) {
  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 100], fov: 60 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={window.devicePixelRatio}
      >
        <Scene
          shapeResult={shapeResult}
          customFunction={customFunction}
          customFunctionVersion={customFunctionVersion}
          count={count}
          onSetInfo={onSetInfo}
          onAnnotate={onAnnotate}
          onCameraReady={onCameraReady}
        />
      </Canvas>
    </div>
  );
}
