import type * as THREE from 'three';

export type RenderStyle = 'spark' | 'plasma' | 'ink' | 'paint' | 'steel' | 'glass' | 'vector' | 'cyber';

export type ShapeMode = 'sphere' | 'cube' | 'helix' | 'torus' | 'text' | 'image' | 'video' | 'model' | 'blueprint' | 'draw' | 'custom';

export type TextAnimation = 'static' | 'scroll' | 'wave' | 'pulse' | 'rain';

export interface ParticleConfig {
  count: number;
  maxSize: number;
  particleSize: number;
  hoverStrength: number;
}

export interface AppState {
  // Simulation
  mode: ShapeMode;
  renderStyle: RenderStyle;
  speed: number;
  simTime: number;
  autoSpin: boolean;
  bloomStrength: number;
  
  // Display
  showHUD: boolean;
  showAnnotations: boolean;
  showControls: boolean;
  sidebarCollapsed: boolean;
  
  // Hand gesture
  handControlEnabled: boolean;

  // MIDI/OSC
  midiOscEnabled: boolean;
  
  // Media
  videoPlaying: boolean;
  videoVolume: number;
  videoHasAudio: boolean;
  
  // Custom shapes
  customShapes: Record<string, string>;
  activeCustomCode: string | null;
  customName: string | null;
  
  // Text
  textAnim: TextAnimation;
  textWidthWorld: number;
  
  // Model
  loadedModel: THREE.Group | null;
  mixer: THREE.AnimationMixer | null;
  modelMode: number; // 0: particles, 1: solid
  isAnimated: boolean;
  isPDB: boolean;
  pdbAnimEnabled: boolean;
  pdbAnimStartTime: number;
  
  // Custom params for controls
  customParams: Record<string, number>;
  controlsCreated: Set<string>;
  controlKeys: string[];
  
  // Blueprint
  blueprintState: {
    source: HTMLImageElement | null;
    threshold: number;
    scale: number;
    fill: boolean;
  };
  
  // Drawing
  lastDraw: HTMLCanvasElement | null;
  cachedDrawPixels: DrawPixel[];
}

export interface DrawPixel {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
}

export interface Annotation {
  id: string;
  position: THREE.Vector3;
  label: string;
}

export interface Formation {
  id: string;
  name: string;
  code: string;
  publisher: string;
  timestamp: number;
}

export interface ExportSettings {
  count: number;
  speed: number;
  autoSpin: boolean;
  renderStyle: RenderStyle;
  geoCode: string;
  matCode: string;
  customParams: Record<string, number>;
}

export interface MusicTrack {
  title: string;
  src: string;
}

export type ExportPlatform = 'vanilla' | 'react' | 'three';

// Custom update function type
export type CustomUpdateFunction = (
  i: number,
  count: number,
  target: THREE.Vector3,
  color: THREE.Color,
  THREE_LIB: typeof THREE,
  time: number,
  setInfo: (title: string, desc: string) => void,
  annotate: (id: string, x: number | THREE.Vector3, y: number | string, z?: number | boolean, label?: string | boolean, visible?: boolean) => void,
  addControl: (id: string, label: string, min: number, max: number, initial: number) => number
) => void;
