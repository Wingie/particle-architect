import { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Music,
  RotateCw, Hand, Maximize, Settings,
  Info, MessageSquare, HelpCircle, Download, X,
  Volume2, VolumeX, Sliders, Radio
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore, useMusicStore } from '@/stores/appStore';
import { useExportStore } from '@/stores/appStore';
import { useCameraCheck } from '@/hooks/useCameraCheck';

const tracks = [
  { title: 'Ambient Piano', src: '/music/track1.mp3', vibe: 'Calm & Focus' },
  { title: 'Avanti Atmosphere', src: '/music/track2.mp3', vibe: 'Deep & Flow' },
  { title: 'Cyberpunk Sci-Fi', src: '/music/track3.mp3', vibe: 'High Energy' },
];

interface ToolbarProps {
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

export function Toolbar({ onToggleFullscreen, onOpenSettings, onOpenHelp }: ToolbarProps) {
  const {
    autoSpin,
    toggleAutoSpin,
    handControlEnabled,
    toggleHandControl,
    showHUD,
    toggleHUD,
    showControls,
    toggleControls,
    showAnnotations,
    toggleAnnotations,
    mode,
    controlKeys,
    videoHasAudio,
    videoVolume,
    setVideoVolume,
    midiOscEnabled,
    toggleMidiOsc,
  } = useAppStore();

  const { isPlaying, togglePlay, nextTrack, prevTrack, currentTrackIdx, setTrack } = useMusicStore();
  const { open: openExport } = useExportStore();
  const { hasCamera } = useCameraCheck();
  const [showMusicPopup, setShowMusicPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const musicDisabled = mode === 'video' && videoHasAudio;

  const currentTrack = tracks[currentTrackIdx];

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowMusicPopup(false);
      }
    };
    if (showMusicPopup) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMusicPopup]);

  const handleToggleHandControl = async () => {
    if (!handControlEnabled && !hasCamera) {
      onOpenSettings();
      return;
    }
    toggleHandControl();
  };

  const { sidebarCollapsed } = useAppStore();

  return (
    <div className={cn(
      "fixed top-3 right-1 left-1 flex flex-wrap justify-center sm:justify-end items-center gap-1 max-sm:top-[55px] sm:top-5 sm:gap-2 max-w-[calc(100vw-1.5rem)]",
      "transition-opacity duration-300",
      sidebarCollapsed ? "opacity-100" : "opacity-0 pointer-events-none lg:opacity-100 lg:pointer-events-auto"
    )}>
      {/* Music Popup */}
      {showMusicPopup && (
        <div
          ref={popupRef}
          className="absolute top-12 right-0 w-[calc(100vw-1.5rem)] max-w-72 bg-[#111] border border-accent/50 rounded-lg shadow-2xl shadow-accent/20 overflow-hidden animate-slide-in-down"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-accent/10">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-accent" />
              <span className="text-xs font-bold text-accent uppercase">Soundscape</span>
            </div>
            <button
              onClick={() => setShowMusicPopup(false)}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Track List */}
          <div className="p-2 space-y-1">
            {tracks.map((track, idx) => (
              <button
                key={track.src}
                onClick={() => {
                  setTrack(idx);
                  if (!isPlaying) togglePlay();
                }}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left",
                  currentTrackIdx === idx
                    ? "bg-accent/20 border border-accent/50"
                    : "hover:bg-white/5 border border-transparent"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                  currentTrackIdx === idx ? "bg-accent text-black" : "bg-gray-800 text-gray-400"
                )}>
                  {currentTrackIdx === idx && isPlaying ? (
                    <span className="flex gap-0.5">
                      <span className="w-0.5 h-3 bg-current animate-bounce" />
                      <span className="w-0.5 h-3 bg-current animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <span className="w-0.5 h-3 bg-current animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </span>
                  ) : (
                    idx + 1
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "text-sm font-medium truncate",
                    currentTrackIdx === idx ? "text-accent" : "text-white"
                  )}>
                    {track.title}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                    {track.vibe}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 p-3 border-t border-gray-800 bg-black/30">
            <button
              onClick={prevTrack}
              className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              className="w-12 h-12 flex items-center justify-center bg-accent text-black rounded-full hover:bg-accent/80 transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            <button
              onClick={nextTrack}
              className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3 px-3 pb-3">
            <button
              onClick={() => setVideoVolume(videoVolume > 0 ? 0 : 0.5)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {videoVolume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={videoVolume}
              onChange={(e) => setVideoVolume(Number(e.target.value))}
              className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: '#00ff88' }}
            />
            <span className="text-[10px] text-gray-500 tabular-nums w-8 text-right">
              {Math.round(videoVolume * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Music Button */}
      <button
        onClick={() => {
          if (musicDisabled) return;
          setShowMusicPopup(!showMusicPopup);
        }}
        className={cn(
          "flex items-center gap-2 h-10 px-3 bg-black/80 backdrop-blur border rounded-lg transition-all",
          musicDisabled
            ? "border-white/10 text-white/20 cursor-not-allowed opacity-50"
            : showMusicPopup || isPlaying
              ? "border-accent text-accent bg-accent/20"
              : "border-white/15 hover:border-accent"
        )}
        title={musicDisabled ? "Music disabled — video has audio" : "Soundscape"}
      >
        <Music className="w-4 h-4" />
        <span className="hidden sm:block text-xs font-medium">
          {musicDisabled ? 'Video Audio' : currentTrack.title}
        </span>
        {isPlaying && !musicDisabled && (
          <span className="flex gap-0.5 ml-1">
            <span className="w-0.5 h-2 bg-accent animate-pulse" />
            <span className="w-0.5 h-2 bg-accent animate-pulse" style={{ animationDelay: '0.1s' }} />
            <span className="w-0.5 h-2 bg-accent animate-pulse" style={{ animationDelay: '0.2s' }} />
          </span>
        )}
      </button>

      {/* Tools */}
      <button
        onClick={toggleAutoSpin}
        className={cn(
          "w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur border border-white/15 rounded-lg transition-colors",
          autoSpin && "border-accent text-accent bg-accent/20"
        )}
        title="Auto Rotation"
      >
        <RotateCw className="w-5 h-5" />
      </button>

      <button
        onClick={handleToggleHandControl}
        className={cn(
          "w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur border rounded-lg transition-colors relative",
          handControlEnabled
            ? "border-accent text-accent bg-accent/20"
            : hasCamera
              ? "border-white/15 hover:border-accent"
              : "border-red-500/50 text-red-400/50 cursor-not-allowed"
        )}
        title={hasCamera ? "Toggle Gesture OS" : "Camera not available - Click for settings"}
      >
        <Hand className="w-5 h-5" />
        {!hasCamera && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>

      <button
        onClick={toggleMidiOsc}
        className={cn(
          "w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur border rounded-lg transition-colors",
          midiOscEnabled
            ? "border-accent text-accent bg-accent/20"
            : "border-white/15 hover:border-accent"
        )}
        title="Toggle MIDI/OSC Input"
      >
        <Radio className="w-5 h-5" />
      </button>

      <button
        onClick={onToggleFullscreen}
        className="w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur border border-white/15 rounded-lg hover:border-accent transition-colors"
        title="Fullscreen"
      >
        <Maximize className="w-5 h-5" />
      </button>

      <button
        onClick={onOpenSettings}
        className={cn(
          "w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur border border-white/15 rounded-lg transition-colors hover:border-accent"
        )}
        title="Settings"
      >
        <Settings className="w-5 h-5" />
      </button>

      <button
        onClick={toggleHUD}
        className={cn(
          "w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur border border-white/15 rounded-lg transition-colors",
          showHUD && "border-accent text-accent bg-accent/20"
        )}
        title="Toggle Info HUD"
      >
        <Info className="w-5 h-5" />
      </button>

      {controlKeys.length > 0 && (
        <button
          onClick={toggleControls}
          className={cn(
            "w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur border border-white/15 rounded-lg transition-colors",
            showControls && "border-accent text-accent bg-accent/20"
          )}
          title="Toggle Simulation Controls"
        >
          <Sliders className="w-5 h-5" />
        </button>
      )}

      <button
        onClick={toggleAnnotations}
        className={cn(
          "w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur border border-white/15 rounded-lg transition-colors",
          showAnnotations && "border-accent text-accent bg-accent/20"
        )}
        title="Toggle Annotations"
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      <button
        onClick={openExport}
        className="w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur border border-white/15 rounded-lg hover:border-accent transition-colors"
        title="Export Code"
      >
        <Download className="w-5 h-5" />
      </button>

      <button
        onClick={onOpenHelp}
        className="w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur border border-white/15 rounded-lg hover:border-accent transition-colors"
        title="Help & Guide"
      >
        <HelpCircle className="w-5 h-5" />
      </button>
    </div>
  );
}
