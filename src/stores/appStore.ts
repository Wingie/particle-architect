import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  AppState, 
  ShapeMode, 
  RenderStyle, 
  TextAnimation, 
  CustomUpdateFunction,
  DrawPixel 
} from '@/types';
import * as THREE from 'three';

interface AppStore extends AppState {
  // Actions
  setMode: (mode: ShapeMode) => void;
  setRenderStyle: (style: RenderStyle) => void;
  setSpeed: (speed: number) => void;
  incrementSimTime: (delta: number) => void;
  toggleAutoSpin: () => void;
  setBloomStrength: (strength: number) => void;
  
  toggleHUD: () => void;
  toggleAnnotations: () => void;
  toggleControls: () => void;
  toggleSidebar: () => void;
  
  toggleHandControl: () => void;

  midiOscEnabled: boolean;
  toggleMidiOsc: () => void;
  
  setVideoPlaying: (playing: boolean) => void;
  setVideoVolume: (volume: number) => void;
  setVideoHasAudio: (has: boolean) => void;
  
  addCustomShape: (name: string, code: string) => void;
  deleteCustomShape: (name: string) => void;
  setActiveCustomCode: (code: string | null, name?: string | null) => void;
  
  setTextAnim: (anim: TextAnimation) => void;
  setTextWidthWorld: (width: number) => void;
  
  setLoadedModel: (model: THREE.Group | null) => void;
  setMixer: (mixer: THREE.AnimationMixer | null) => void;
  setModelMode: (mode: number) => void;
  setIsAnimated: (animated: boolean) => void;
  setIsPDB: (isPDB: boolean) => void;
  setPdbAnimEnabled: (enabled: boolean) => void;
  setPdbAnimStartTime: (time: number) => void;
  
  addControl: (id: string, label: string, min: number, max: number, initial: number) => number;
  setCustomParam: (id: string, value: number) => void;
  resetControls: () => void;
  
  setBlueprintSource: (source: HTMLImageElement | null) => void;
  setBlueprintThreshold: (threshold: number) => void;
  setBlueprintScale: (scale: number) => void;
  setBlueprintFill: (fill: boolean) => void;
  
  setLastDraw: (canvas: HTMLCanvasElement | null) => void;
  setCachedDrawPixels: (pixels: DrawPixel[]) => void;
  
  resetScene: () => void;
}

const initialState: AppState = {
  mode: 'sphere',
  renderStyle: 'spark',
  speed: 1.0,
  simTime: 0,
  autoSpin: true,
  bloomStrength: 1.8,
  
  showHUD: typeof window !== 'undefined' ? window.innerWidth > 768 : true,
  showAnnotations: typeof window !== 'undefined' ? window.innerWidth > 768 : true,
  showControls: false,
  sidebarCollapsed: false,
  
  handControlEnabled: false,
  midiOscEnabled: false,
  
  videoPlaying: false,
  videoVolume: 0.5,
  videoHasAudio: false,
  
  customShapes: {},
  activeCustomCode: null,
  customName: null,
  
  textAnim: 'static',
  textWidthWorld: 0,
  
  loadedModel: null,
  mixer: null,
  modelMode: 0,
  isAnimated: false,
  isPDB: false,
  pdbAnimEnabled: true,
  pdbAnimStartTime: 0,
  
  customParams: {},
  controlsCreated: new Set(),
  controlKeys: [],
  
  blueprintState: {
    source: null,
    threshold: 100,
    scale: 1.0,
    fill: false,
  },
  
  lastDraw: null,
  cachedDrawPixels: [],
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      setMode: (mode) => set({ mode }),
      setRenderStyle: (renderStyle) => set({ renderStyle }),
      setSpeed: (speed) => set({ speed }),
      incrementSimTime: (delta) => set((state) => ({ simTime: state.simTime + delta * state.speed })),
      toggleAutoSpin: () => set((state) => ({ autoSpin: !state.autoSpin })),
      setBloomStrength: (bloomStrength) => set({ bloomStrength }),
      
      toggleHUD: () => set((state) => ({ showHUD: !state.showHUD })),
      toggleAnnotations: () => set((state) => ({ showAnnotations: !state.showAnnotations })),
      toggleControls: () => set((state) => ({ showControls: !state.showControls })),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      
      toggleHandControl: () => set((state) => ({ handControlEnabled: !state.handControlEnabled })),

      toggleMidiOsc: () => set((state) => ({ midiOscEnabled: !state.midiOscEnabled })),
      
      setVideoPlaying: (videoPlaying) => set({ videoPlaying }),
      setVideoVolume: (videoVolume) => set({ videoVolume }),
      setVideoHasAudio: (videoHasAudio) => set({ videoHasAudio }),
      
      addCustomShape: (name, code) => set((state) => ({
        customShapes: { ...state.customShapes, [name]: code },
      })),
      deleteCustomShape: (name) => set((state) => {
        const { [name]: _, ...rest } = state.customShapes;
        return { customShapes: rest };
      }),
      setActiveCustomCode: (activeCustomCode, customName = null) => set({ activeCustomCode, customName }),
      
      setTextAnim: (textAnim) => set({ textAnim }),
      setTextWidthWorld: (textWidthWorld) => set({ textWidthWorld }),
      
      setLoadedModel: (loadedModel) => set({ loadedModel }),
      setMixer: (mixer) => set({ mixer }),
      setModelMode: (modelMode) => set({ modelMode }),
      setIsAnimated: (isAnimated) => set({ isAnimated }),
      setIsPDB: (isPDB) => set({ isPDB }),
      setPdbAnimEnabled: (pdbAnimEnabled) => set({ pdbAnimEnabled }),
      setPdbAnimStartTime: (pdbAnimStartTime) => set({ pdbAnimStartTime }),
      
      addControl: (id, label, min, max, initial) => {
        const state = get();
        if (state.controlsCreated.has(id)) {
          return state.customParams[id] ?? initial;
        }
        set((state) => ({
          controlsCreated: new Set([...state.controlsCreated, id]),
          customParams: { ...state.customParams, [id]: initial },
          controlKeys: [...state.controlKeys, id],
          showControls: true,
        }));
        return initial;
      },
      setCustomParam: (id, value) => set((state) => ({
        customParams: { ...state.customParams, [id]: value },
      })),
      resetControls: () => set({ 
        controlsCreated: new Set(), 
        customParams: {}, 
        controlKeys: [],
        showControls: false,
      }),
      
      setBlueprintSource: (source) => set((state) => ({
        blueprintState: { ...state.blueprintState, source },
      })),
      setBlueprintThreshold: (threshold) => set((state) => ({
        blueprintState: { ...state.blueprintState, threshold },
      })),
      setBlueprintScale: (scale) => set((state) => ({
        blueprintState: { ...state.blueprintState, scale },
      })),
      setBlueprintFill: (fill) => set((state) => ({
        blueprintState: { ...state.blueprintState, fill },
      })),
      
      setLastDraw: (lastDraw) => set({ lastDraw }),
      setCachedDrawPixels: (cachedDrawPixels) => set({ cachedDrawPixels }),
      
      resetScene: () => set((state) => ({
        controlsCreated: new Set(),
        customParams: {},
        controlKeys: [],
        showControls: false,
        loadedModel: state.mode === 'model' ? state.loadedModel : null,
        mixer: state.mode === 'model' ? state.mixer : null,
      })),
    }),
    {
      name: 'particle-architect-storage',
      partialize: (state) => ({
        customShapes: state.customShapes,
        speed: state.speed,
        autoSpin: state.autoSpin,
        bloomStrength: state.bloomStrength,
        showHUD: state.showHUD,
        showAnnotations: state.showAnnotations,
        sidebarCollapsed: state.sidebarCollapsed,
        videoVolume: state.videoVolume,
        renderStyle: state.renderStyle,
        midiOscEnabled: state.midiOscEnabled,
      }),
    }
  )
);

// Music store (separate, no persistence)
interface MusicStore {
  currentTrackIdx: number;
  isPlaying: boolean;
  setTrack: (idx: number) => void;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
}

export const useMusicStore = create<MusicStore>((set, get) => ({
  currentTrackIdx: 0,
  isPlaying: false,
  setTrack: (currentTrackIdx) => set({ currentTrackIdx }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  nextTrack: () => set((state) => ({ 
    currentTrackIdx: (state.currentTrackIdx + 1) % 3,
  })),
  prevTrack: () => set((state) => ({ 
    currentTrackIdx: (state.currentTrackIdx - 1 + 3) % 3,
  })),
}));

// Export store
interface ExportStore {
  platform: 'vanilla' | 'react' | 'three';
  optimization: 'max' | 'safe';
  isOpen: boolean;
  setPlatform: (platform: 'vanilla' | 'react' | 'three') => void;
  setOptimization: (opt: 'max' | 'safe') => void;
  open: () => void;
  close: () => void;
}

export const useExportStore = create<ExportStore>((set) => ({
  platform: 'vanilla',
  optimization: 'safe',
  isOpen: false,
  setPlatform: (platform) => set({ platform }),
  setOptimization: (optimization) => set({ optimization }),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

// Alert store
export type AlertType = 'info' | 'error' | 'success' | 'warning';

interface AlertStore {
  isOpen: boolean;
  title: string;
  message: string;
  type: AlertType;
  openAlert: (title: string, message: string, type?: AlertType) => void;
  closeAlert: () => void;
}

export const useAlertStore = create<AlertStore>((set) => ({
  isOpen: false,
  title: '',
  message: '',
  type: 'info',
  openAlert: (title, message, type = 'info') => set({ isOpen: true, title, message, type }),
  closeAlert: () => set({ isOpen: false }),
}));

