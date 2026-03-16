import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { ParticleSystem } from '@/components/ParticleSystem';
import { Sidebar } from '@/components/Sidebar';
import { Toolbar } from '@/components/Toolbar';
import { HUD, ControlsPanel, AnnotationLayer } from '@/components/HUD';
import { DrawingPad } from '@/components/DrawingPad';
import { ExportModal } from '@/components/ExportModal';
import { GuideModal } from '@/components/GuideModal';
import { SettingsModal } from '@/components/SettingsModal';
import { AlertModal } from '@/components/AlertModal';
import { GestureOverlay, GestureGuide } from '@/components/GestureOverlay';
import { useAppStore, useMusicStore, useAlertStore } from '@/stores/appStore';
import { useHandTracking } from '@/hooks/useHandTracking';
import { useMidiOsc } from '@/hooks/useMidiOsc';
import { useCameraCheck } from '@/hooks/useCameraCheck';
import { generateSphere, generateCube, generateHelix, generateTorus, generateFromText, generateFromImage, generateFromVideoGrid, generateFromDrawPixels, generateBlueprint, generateFromModel } from '@/lib/shapes';
import { updateShaderTime } from '@/lib/materials';
import type { ShapeMode, TextAnimation, CustomUpdateFunction } from '@/types';
import type { ShapeResult } from '@/lib/shapes';
import './index.css';

// Helper to format seconds as mm:ss
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function App() {
  // State
  const [particleCount, setParticleCount] = useState(20000);
  const [shapeResult, setShapeResult] = useState<ShapeResult>(() => generateSphere(20000));
  const [hudInfo, setHudInfo] = useState({ title: 'GEODESIC SPHERE', description: 'Perfect distribution of points. Radius is adjustable.' });
  const [customFunctionVersion, setCustomFunctionVersion] = useState(0);
  const [annotations, setAnnotations] = useState<Array<{ id: string; x: number; y: number; label: string; visible: boolean; pos3D?: THREE.Vector3 }>>([]);
  const [isDrawingOpen, setIsDrawingOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showGestureGuide, setShowGestureGuide] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoElementState, setVideoElementState] = useState<HTMLVideoElement | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const controlsRef = useRef<any>(null);
  const animationRef = useRef<number>();
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const customFunctionRef = useRef<CustomUpdateFunction | null>(null);

  // Source data refs for regeneration on particle count change
  const textSourceRef = useRef<{ text: string; fontSize: number; font: string; anim: TextAnimation } | null>(null);
  const imageSourceRef = useRef<HTMLImageElement | null>(null);
  const modelSourceRef = useRef<File | null>(null);
  const drawParamsRef = useRef<{ depth: number; scale: number; rotation: number; fill: boolean } | null>(null);

  // Video processing canvas
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoCtxRef = useRef<CanvasRenderingContext2D | null>(null);


  // Store
  const {
    mode,
    setMode,
    renderStyle,
    speed,
    simTime,
    incrementSimTime,
    videoPlaying,
    setVideoPlaying,
    videoVolume,
    setVideoVolume,
    videoHasAudio,
    setVideoHasAudio,
    customShapes,
    activeCustomCode,
    customName,
    setActiveCustomCode,
    textAnim,
    setTextAnim,
    setTextWidthWorld,
    blueprintState,
    cachedDrawPixels,
    setCachedDrawPixels,
    handControlEnabled,
    toggleHandControl,
    autoSpin,
    resetControls,
    addControl,
  } = useAppStore();

  const openAlert = useAlertStore((state) => state.openAlert);

  const { isPlaying: isMusicPlaying, currentTrackIdx } = useMusicStore();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Expose addControl globally for custom code execution
  useEffect(() => {
    (window as any).addControl = addControl;
    return () => {
      delete (window as any).addControl;
    };
  }, [addControl]);

  // Music player - don't play music when video has audio
  useEffect(() => {
    const tracks = [
      { src: '/music/track1.mp3', title: 'Ambient Piano' },
      { src: '/music/track2.mp3', title: 'Ambient Strings' },
      { src: '/music/track3.mp3', title: 'Cyberpunk Sci-Fi' }
    ];
    if (!audioRef.current) {
      audioRef.current = new Audio(tracks[currentTrackIdx].src);
      audioRef.current.loop = false;
      audioRef.current.volume = videoVolume;
    } else {
      audioRef.current.src = tracks[currentTrackIdx].src;
    }

    // Don't play music if current video has its own audio
    if (isMusicPlaying && !(mode === 'video' && videoHasAudio)) {
      audioRef.current.play().catch(() => { });
    } else {
      audioRef.current.pause();
    }

    const handleEnded = () => {
      useMusicStore.getState().nextTrack();
    };
    audioRef.current.addEventListener('ended', handleEnded);

    return () => {
      audioRef.current?.removeEventListener('ended', handleEnded);
    };
  }, [isMusicPlaying, currentTrackIdx, mode, videoHasAudio]);

  // Separate effect for volume changes so adjusting volume doesn't reset audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = videoVolume;
    }
  }, [videoVolume]);

  // Video Audio Sync
  useEffect(() => {
    if (videoElementState) {
      videoElementState.volume = videoVolume;
    }
  }, [videoVolume, videoElementState]);

  useEffect(() => {
    if (videoElementState && mode === 'video') {
      if (videoPlaying) {
        videoElementState.play().catch(() => { });
      } else {
        videoElementState.pause();
      }
    }
  }, [videoPlaying, mode, videoElementState]);

  // Animation loop
  useEffect(() => {
    let lastTime = performance.now();

    const animate = () => {
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      incrementSimTime(delta);
      updateShaderTime(renderStyle, simTime);

      // Update video particles if playing
      // We read from the ref to avoid stale closures inside the loop
      if (useAppStore.getState().mode === 'video' && useAppStore.getState().videoPlaying) {
        updateVideoColors();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [incrementSimTime, renderStyle, simTime, mode, videoPlaying]);

  // Hand tracking
  useHandTracking(videoRef, canvasRef, cameraRef.current, controlsRef.current);
  useMidiOsc();

  // Camera check
  const { hasCamera } = useCameraCheck();

  // Watch for hand control toggle - only show guide if camera is available
  useEffect(() => {
    if (handControlEnabled && hasCamera) {
      setShowGestureGuide(true);
    }
  }, [handControlEnabled, hasCamera]);

  // Video color update
  const updateVideoColors = useCallback(() => {
    if (!videoElementRef.current || !videoCanvasRef.current || !videoCtxRef.current) return;

    const video = videoElementRef.current;
    const canvas = videoCanvasRef.current;
    const ctx = videoCtxRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    // Ensure canvas matches video aspect ratio for sampling
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    // In video mode, the shapeResult layout is a grid matching the video ratio.
    // We already computed gridW and gridH at generation time, but we don't have them in state easily.
    // However, if we know particleCount and aspect ratio, we can recompute
    const ratio = video.videoWidth / video.videoHeight;
    const gridH = Math.floor(Math.sqrt(particleCount / ratio));
    const gridW = Math.floor(gridH * ratio);

    setShapeResult(prev => {
      const newColors = [...prev.colors];
      const color = new THREE.Color();
      let idx = 0;
      for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
          if (idx >= prev.colors.length) break;
          // map to canvas coords
          const sx = Math.floor(x * (canvas.width / gridW));
          const sy = Math.floor(y * (canvas.height / gridH));
          const i = (sy * canvas.width + sx) * 4;
          newColors[idx] = color.setRGB(imageData[i] / 255, imageData[i + 1] / 255, imageData[i + 2] / 255).clone();
          idx++;
        }
      }
      return { ...prev, colors: newColors };
    });
  }, [particleCount]);

  // Shape handlers
  const handleShapeChange = useCallback((newMode: ShapeMode, customCodeParam?: string | null, customNameParam?: string | null, newParticleCount?: number) => {
    // Use provided count if available (for particle count changes), otherwise use current state
    const countToUse = newParticleCount !== undefined ? newParticleCount : particleCount;
    setIsLoading(true);
    setAnnotations([]);
    setMode(newMode);
    customFunctionRef.current = null;
    setCustomFunctionVersion(v => v + 1);

    // Reset controls when leaving custom mode
    if (newMode !== 'custom') {
      resetControls();
    }

    setTimeout(() => {
      let result: ShapeResult;

      switch (newMode) {
        case 'sphere':
          result = generateSphere(countToUse);
          setHudInfo({ title: 'GEODESIC SPHERE', description: 'Perfect distribution of points. Radius is adjustable.' });
          break;
        case 'cube':
          result = generateCube(countToUse);
          setHudInfo({ title: 'CUBE', description: '3D grid formation with evenly spaced particles.' });
          break;
        case 'helix':
          result = generateHelix(countToUse);
          setHudInfo({ title: 'DNA STRUCTURE', description: 'Double Helix formation.' });
          break;
        case 'torus':
          result = generateTorus(countToUse);
          setHudInfo({ title: 'TORUS', description: 'Donut-shaped particle distribution.' });
          break;
        case 'custom':
          // Use passed parameters or fall back to store values
          const codeToUse = customCodeParam || activeCustomCode;
          const nameToUse = customNameParam || customName;

          if (codeToUse && nameToUse) {
            try {
              // Reset any previous controls
              resetControls();

              // Store the active code in the store for persistence
              if (customCodeParam && customNameParam) {
                setActiveCustomCode(customCodeParam, customNameParam);
              }

              // Create the custom function
              const fn = new Function(
                'i', 'count', 'target', 'color', 'THREE', 'time',
                'setInfo', 'annotate', 'addControl',
                codeToUse
              ) as CustomUpdateFunction;

              customFunctionRef.current = fn;
              setCustomFunctionVersion(v => v + 1);
              result = generateSphere(countToUse); // Initial positions
              setHudInfo({ title: nameToUse, description: 'Custom user-defined formation.' });
            } catch (e) {
              console.error('Invalid custom code:', e);
              openAlert('Custom Code Error', (e as Error).message, 'error');
              result = generateSphere(countToUse);
            }
          } else {
            result = generateSphere(countToUse);
          }
          break;
        default:
          result = generateSphere(countToUse);
      }

      setShapeResult(result);
      setIsLoading(false);
    }, 100);
  }, [particleCount, setMode, resetControls, setActiveCustomCode, activeCustomCode, customName]);

  // Text process handler
  const handleTextProcess = useCallback((text: string, fontSize: number, font: string, anim: TextAnimation) => {
    setIsLoading(true);
    setAnnotations([]);
    setMode('text');
    setTextAnim(anim);
    customFunctionRef.current = null;
    setCustomFunctionVersion(v => v + 1);
    // Save source data for regeneration
    textSourceRef.current = { text, fontSize, font, anim };

    setTimeout(() => {
      const result = generateFromText(text, particleCount, fontSize, font);
      setShapeResult(result);
      setTextWidthWorld(60);
      setHudInfo({ title: 'TEXT ENGINE', description: `Rendering: "${text}"` });
      setIsLoading(false);
    }, 100);
  }, [particleCount, setMode, setTextAnim, setTextWidthWorld]);

  // Image process handler
  const handleImageProcess = useCallback((image: HTMLImageElement) => {
    setIsLoading(true);
    setAnnotations([]);
    setMode('image');
    customFunctionRef.current = null;
    setCustomFunctionVersion(v => v + 1);
    // Save source data for regeneration
    imageSourceRef.current = image;

    setTimeout(() => {
      const result = generateFromImage(image, particleCount);
      setShapeResult(result);
      setHudInfo({ title: 'IMAGE PARTICLES', description: 'Particle representation of uploaded image.' });
      setIsLoading(false);
    }, 100);
  }, [particleCount, setMode]);

  // Video process handler
  const handleVideoProcess = useCallback((video: HTMLVideoElement) => {
    setIsLoading(true);
    setAnnotations([]);
    setMode('video');
    customFunctionRef.current = null;
    setCustomFunctionVersion(v => v + 1);

    // If there's an existing video, pause and clean it up
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.src = "";
      videoElementRef.current.load();
    }

    videoElementRef.current = video;
    setVideoElementState(video);

    // Assign volume based on store
    video.volume = useAppStore.getState().videoVolume;

    if (!videoCanvasRef.current) {
      videoCanvasRef.current = document.createElement('canvas');
      videoCtxRef.current = videoCanvasRef.current.getContext('2d', { willReadFrequently: true });
    }

    // Detect if video has audio
    const checkAudio = () => {
      // Multiple browser-specific checks for audio presence
      const hasAudio = (
        (video as any).mozHasAudio ||
        Boolean((video as any).webkitAudioDecodedByteCount) ||
        Boolean((video as any).audioTracks?.length) ||
        // Fallback: assume video has audio unless it's very tiny/gif-like
        video.duration > 0.5
      );
      setVideoHasAudio(hasAudio);

      // If video has audio, stop background music
      if (hasAudio && useMusicStore.getState().isPlaying) {
        useMusicStore.getState().togglePlay();
      }
    };

    setTimeout(() => {
      const { positions, gridW, gridH } = generateFromVideoGrid(video.videoWidth, video.videoHeight, particleCount);
      setShapeResult({
        positions,
        colors: Array(particleCount).fill(new THREE.Color(0x00ff88)),
      });
      setHudInfo({ title: 'VIDEO PARTICLES', description: 'Real-time video particle visualization.' });
      setIsLoading(false);
      setVideoPlaying(true);
      setVideoDuration(video.duration || 0);
      checkAudio();
      video.play().catch(() => { });
    }, 100);
  }, [particleCount, setMode, setVideoPlaying, setVideoHasAudio]);

  // Track video time updates for seek bar
  useEffect(() => {
    const video = videoElementState;
    if (!video || mode !== 'video') return;

    const onTimeUpdate = () => setVideoCurrentTime(video.currentTime);
    const onDurationChange = () => setVideoDuration(video.duration || 0);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
    };
  }, [mode, videoElementState]);

  // Clean up video element and reset state when leaving video mode
  useEffect(() => {
    if (mode !== 'video') {
      setVideoHasAudio(false);
      
      if (videoElementRef.current) {
        videoElementRef.current.pause();
        videoElementRef.current.src = "";
        videoElementRef.current.load();
        videoElementRef.current = null;
        setVideoElementState(null);
      }
      setVideoPlaying(false);
    }
  }, [mode, setVideoHasAudio, setVideoPlaying]);

  // Blueprint process handler
  const handleBlueprintProcess = useCallback(() => {
    if (!blueprintState.source) return;

    setIsLoading(true);
    setAnnotations([]);
    setMode('blueprint');
    customFunctionRef.current = null;
    setCustomFunctionVersion(v => v + 1);

    setTimeout(() => {
      const result = generateBlueprint(
        blueprintState.source!,
        particleCount,
        blueprintState.threshold,
        blueprintState.scale,
        blueprintState.fill
      );
      setShapeResult(result);
      setHudInfo({ title: 'BLUEPRINT', description: 'CAD/Blueprint particle extraction.' });
      setIsLoading(false);
    }, 100);
  }, [particleCount, setMode, blueprintState]);

  // Model process handler
  const handleModelProcess = useCallback(async (file: File) => {
    setIsLoading(true);
    setAnnotations([]);
    setMode('model');
    customFunctionRef.current = null;
    setCustomFunctionVersion(v => v + 1);
    modelSourceRef.current = file;

    try {
      const result = await generateFromModel(file, particleCount);
      setShapeResult(result);
      setHudInfo({ title: '3D MODEL', description: `Loaded: ${file.name}` });
    } catch (e) {
      console.error('Failed to parse 3D model:', e);
      openAlert('3D Model Error', (e as Error).message, 'error');
      setShapeResult(generateSphere(particleCount));
    } finally {
      setIsLoading(false);
    }
  }, [particleCount, setMode]);

  // Drawing update handler - receives pixels directly to avoid store delay
  const handleDrawingUpdate = useCallback((
    pixels: Array<{ x: number; y: number; r: number; g: number; b: number }>,
    depth: number,
    scale: number,
    rotation: number,
    fill: boolean
  ) => {
    if (pixels.length > 0) {
      setAnnotations([]);
      // Save source data for regeneration
      drawParamsRef.current = { depth, scale, rotation, fill };
      const result = generateFromDrawPixels(pixels, particleCount, depth, scale, rotation, fill);
      setShapeResult(result);
      setHudInfo({ title: 'CUSTOM DRAWING', description: 'User-drawn particle formation.' });
    }
  }, [particleCount]);

  const handleCameraReady = useCallback((camera: THREE.Camera, controls: any) => {
    cameraRef.current = camera;
    controlsRef.current = controls;
  }, []);

  // Particle count change handler
  const handleParticleCountChange = useCallback((count: number) => {
    setParticleCount(count);
    setIsLoading(true);
    setAnnotations([]);

    setTimeout(() => {
      let result: ShapeResult;

      switch (mode) {
        case 'sphere':
          result = generateSphere(count);
          break;
        case 'cube':
          result = generateCube(count);
          break;
        case 'helix':
          result = generateHelix(count);
          break;
        case 'torus':
          result = generateTorus(count);
          break;
        case 'text':
          if (textSourceRef.current) {
            const { text, fontSize, font } = textSourceRef.current;
            result = generateFromText(text, count, fontSize, font);
          } else {
            result = generateSphere(count);
          }
          break;
        case 'image':
          if (imageSourceRef.current) {
            result = generateFromImage(imageSourceRef.current, count);
          } else {
            result = generateSphere(count);
          }
          break;
        case 'video':
          if (videoElementRef.current) {
            const { positions, gridW, gridH } = generateFromVideoGrid(
              videoElementRef.current.videoWidth,
              videoElementRef.current.videoHeight,
              count
            );
            result = {
              positions,
              colors: Array(count).fill(new THREE.Color(0x00ff88)),
            };
          } else {
            result = generateSphere(count);
          }
          break;
        case 'model':
          // Regeneration for models uses placeholder until re-upload
          // Realistically, we could store the parsed vertices to avoid re-parsing
          result = generateSphere(count);
          // Auto-triggering a re-parse is possible if we kept the file, but it's async
          if (modelSourceRef.current) {
            handleModelProcess(modelSourceRef.current);
            return; // Skip setting result instantly
          }
          break;
        case 'blueprint':
          if (blueprintState.source) {
            result = generateBlueprint(
              blueprintState.source,
              count,
              blueprintState.threshold,
              blueprintState.scale,
              blueprintState.fill
            );
          } else {
            result = generateSphere(count);
          }
          break;
        case 'draw':
          if (cachedDrawPixels.length > 0 && drawParamsRef.current) {
            const { depth, scale, rotation, fill } = drawParamsRef.current;
            result = generateFromDrawPixels(cachedDrawPixels, count, depth, scale, rotation, fill);
          } else {
            result = generateSphere(count);
          }
          break;
        case 'custom':
          // For custom mode, regenerate sphere with new count
          result = generateSphere(count);
          break;
        default:
          result = generateSphere(count);
      }

      setShapeResult(result);
      setIsLoading(false);
    }, 100);
  }, [mode, blueprintState, cachedDrawPixels]);

  // Fullscreen toggle
  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Custom setInfo for annotations
  const handleSetInfo = useCallback((title: string, description: string) => {
    if (title) setHudInfo({ title, description });
  }, []);

  // Custom annotate - projects an array of 3D positions to screen coordinates
  const handleAnnotate = useCallback((newAnnotations: Array<{ id: string, pos: THREE.Vector3 | [number, number, number], label: string, visible?: boolean }>) => {
    if (!cameraRef.current) return;
    
    if (newAnnotations.length === 0) {
      setAnnotations(prev => prev.length > 0 ? [] : prev);
      return;
    }

    const camera = cameraRef.current;
    
    // Must update matrix world to get correct projection
    camera.updateMatrixWorld();
    
    const processedAnnos = newAnnotations.map(anno => {
      let pos3D: THREE.Vector3;
      
      if (Array.isArray(anno.pos)) {
        pos3D = new THREE.Vector3(anno.pos[0], anno.pos[1], anno.pos[2]);
      } else {
        pos3D = anno.pos.clone();
      }
      
      const vector = pos3D.clone().project(camera);
      // Check if behind camera
      const isBehind = vector.z > 1.0;
      const visible = isBehind ? false : (anno.visible !== false);

      // Convert to screen coordinates
      const screenX = (vector.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-vector.y * 0.5 + 0.5) * window.innerHeight;
      
      return {
        id: anno.id,
        x: screenX,
        y: screenY,
        label: anno.label,
        visible,
        pos3D
      };
    });

    setAnnotations(processedAnnos);
  }, []);

  // Update annotation positions on camera move/resize
  useEffect(() => {
    let animationFrameId: number;
    
    const updatePositions = () => {
      if (!cameraRef.current || annotations.length === 0) return;

      const camera = cameraRef.current;
      camera.updateMatrixWorld();

      setAnnotations(prev => prev.map(anno => {
        if (!anno.pos3D) return anno;
        
        const vector = anno.pos3D.clone().project(camera);
        const isBehind = vector.z > 1.0;
        
        return {
          ...anno,
          x: (vector.x * 0.5 + 0.5) * window.innerWidth,
          y: (-vector.y * 0.5 + 0.5) * window.innerHeight,
          // Hide if behind camera but preserve original intention if it was explicitly hidden
          visible: isBehind ? false : (anno.visible || true)
        };
      }));
      
      animationFrameId = requestAnimationFrame(updatePositions);
    };

    animationFrameId = requestAnimationFrame(updatePositions);
    return () => cancelAnimationFrame(animationFrameId);
  }, [annotations.length]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      {/* Loading Overlay - keeps UI mounted */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="text-accent font-mono text-sm tracking-widest border border-accent px-8 py-4 rounded animate-pulse">
            CALIBRATING PARTICLES...
          </div>
        </div>
      )}
      {/* Particle System */}
      <ParticleSystem
        shapeResult={shapeResult}
        customFunction={customFunctionRef.current}
        customFunctionVersion={customFunctionVersion}
        count={particleCount}
        onSetInfo={handleSetInfo}
        onAnnotate={handleAnnotate}
        onCameraReady={handleCameraReady}
      />

      {/* Sidebar - Mobile overlay is handled inside Sidebar component */}
      <Sidebar
        currentMode={mode}
        onOpenDrawing={() => setIsDrawingOpen(true)}
        onShapeChange={handleShapeChange}
        onTextProcess={handleTextProcess}
        onImageProcess={handleImageProcess}
        onVideoProcess={handleVideoProcess}
        onModelProcess={handleModelProcess}
        onBlueprintProcess={handleBlueprintProcess}
        particleCount={particleCount}
        onParticleCountChange={handleParticleCountChange}
      />

      {/* Toolbar */}
      <Toolbar
        onToggleFullscreen={handleToggleFullscreen}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHelp={() => setIsGuideOpen(true)}
      />

      {/* HUD */}
      <HUD title={hudInfo.title} description={hudInfo.description} />
      <ControlsPanel />
      <AnnotationLayer annotations={annotations} />

      {/* Modals */}
      <AlertModal />
      <DrawingPad
        isOpen={isDrawingOpen}
        onClose={() => setIsDrawingOpen(false)}
        onUpdate={handleDrawingUpdate}
      />
      <ExportModal />
      <GuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* Video Controls Bar */}
      {mode === 'video' && videoElementRef.current && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/90 via-black/70 to-transparent pt-8 pb-4 px-4 sm:px-8">
          <div className="max-w-2xl mx-auto space-y-2">
            {/* Seek Bar */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white/60 font-mono tabular-nums min-w-[36px]">
                {formatTime(videoCurrentTime)}
              </span>
              <input
                type="range"
                min="0"
                max={videoDuration || 1}
                step="0.1"
                value={videoCurrentTime}
                onChange={(e) => {
                  const t = Number(e.target.value);
                  if (videoElementRef.current) {
                    videoElementRef.current.currentTime = t;
                    setVideoCurrentTime(t);
                  }
                }}
                className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: '#a855f7' }}
              />
              <span className="text-[10px] text-white/60 font-mono tabular-nums min-w-[36px] text-right">
                {formatTime(videoDuration)}
              </span>
            </div>
            {/* Controls Row */}
            <div className="flex items-center justify-center gap-4">
              {/* Play/Pause */}
              <button
                onClick={() => {
                  if (!videoElementRef.current) return;
                  if (videoPlaying) {
                    videoElementRef.current.pause();
                    setVideoPlaying(false);
                  } else {
                    videoElementRef.current.play().catch(() => { });
                    setVideoPlaying(true);
                  }
                }}
                className="w-10 h-10 flex items-center justify-center bg-[#a855f7] text-white rounded-full hover:bg-[#a855f7]/80 transition-colors shadow-lg shadow-[#a855f7]/30"
              >
                {videoPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
              {/* Volume */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!videoElementRef.current) return;
                    const newVol = videoVolume > 0 ? 0 : 0.5;
                    setVideoVolume(newVol);
                    videoElementRef.current.volume = newVol;
                  }}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  {videoVolume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={videoVolume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVideoVolume(v);
                    if (videoElementRef.current) videoElementRef.current.volume = v;
                  }}
                  className="w-20 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: '#a855f7' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gesture Overlay */}
      <GestureOverlay videoRef={videoRef} canvasRef={canvasRef} />
      <GestureGuide
        isOpen={showGestureGuide && hasCamera}
        onClose={() => setShowGestureGuide(false)}
      />
    </div>
  );
}

export default App;
