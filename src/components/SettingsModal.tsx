import { useState } from 'react';
import { X, Camera, Monitor, Info, RotateCw, Hand, Volume2, Eye, SlidersHorizontal, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore, useMusicStore } from '@/stores/appStore';
import { useCameraCheck } from '@/hooks/useCameraCheck';
import { MidiOscPanel } from './MidiOscPanel';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    autoSpin,
    toggleAutoSpin,
    handControlEnabled,
    showHUD,
    toggleHUD,
    showAnnotations,
    toggleAnnotations,
    bloomStrength,
    setBloomStrength,
    speed,
    setSpeed,
    videoVolume,
    setVideoVolume,
    controlKeys,
    customParams,
    setCustomParam,
  } = useAppStore();

  const { isPlaying } = useMusicStore();
  const { hasCamera, error: cameraError, checkCamera } = useCameraCheck();
  const [activeTab, setActiveTab] = useState<'general' | 'controls' | 'display' | 'camera' | 'midiosc'>('general');

  const handleToggleHandControl = async () => {
    if (!handControlEnabled) {
      // Trying to enable - check camera first
      const hasAccess = await checkCamera();
      if (!hasAccess) {
        return; // Don't toggle if no camera
      }
    }
    // Toggle via store
    useAppStore.getState().toggleHandControl();
  };

  if (!isOpen) return null;

  // Determine if we have custom controls to show
  const hasCustomControls = controlKeys.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[90vh] bg-[#111] border border-accent rounded-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/20 rounded-lg">
              <RotateCw className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Settings</h3>
              <p className="text-xs text-gray-400">Configure simulation preferences</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          {[
            { id: 'general', label: 'General', icon: RotateCw },
            { id: 'controls', label: 'Controls', icon: SlidersHorizontal, badge: hasCustomControls ? controlKeys.length : 0 },
            { id: 'display', label: 'Display', icon: Monitor },
            { id: 'camera', label: 'Neural Nav', icon: Camera },
            { id: 'midiosc', label: 'MIDI/OSC', icon: Radio },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors relative",
                activeTab === tab.id
                  ? "text-accent border-b-2 border-accent bg-accent/5"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.badge ? (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-5">
              {/* Auto Spin */}
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                    autoSpin ? "bg-accent/20 text-accent" : "bg-gray-800 text-gray-400"
                  )}>
                    <RotateCw className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Auto Rotation</p>
                    <p className="text-xs text-gray-400">Automatically rotate the camera</p>
                  </div>
                </div>
                <button
                  onClick={toggleAutoSpin}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    autoSpin ? "bg-accent" : "bg-gray-700"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                    autoSpin ? "left-7" : "left-1"
                  )} />
                </button>
              </div>

              {/* Simulation Speed */}
              <div className="p-3 bg-white/5 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
                      <RotateCw className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Simulation Speed</p>
                      <p className="text-xs text-gray-400">Adjust animation speed</p>
                    </div>
                  </div>
                  <span className="text-accent font-mono">{speed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>

              {/* Volume */}
              <div className="p-3 bg-white/5 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
                      <Volume2 className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Music Volume</p>
                      <p className="text-xs text-gray-400">Background music level</p>
                    </div>
                  </div>
                  <span className="text-accent font-mono">{Math.round(videoVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={videoVolume}
                  onChange={(e) => setVideoVolume(parseFloat(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
            </div>
          )}

          {/* Controls Tab - Dynamic Simulation Controls from Custom Code */}
          {activeTab === 'controls' && (
            <div className="space-y-5">
              {hasCustomControls ? (
                <>
                  <div className="flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-lg">
                    <SlidersHorizontal className="w-5 h-5 text-accent" />
                    <div>
                      <p className="text-sm font-medium text-accent">Custom Simulation Controls</p>
                      <p className="text-xs text-gray-400">
                        These controls were created by your custom formation code
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {controlKeys.map((key) => (
                      <div key={key} className="p-3 bg-white/5 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
                              <SlidersHorizontal className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-white uppercase">{key}</span>
                          </div>
                          <span className="text-accent font-mono text-sm">
                            {customParams[key]?.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="0.1"
                          value={customParams[key] || 0}
                          onChange={(e) => setCustomParam(key, Number(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-10 space-y-4">
                  <div className="w-16 h-16 mx-auto bg-gray-800 rounded-full flex items-center justify-center">
                    <SlidersHorizontal className="w-8 h-8 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-gray-400 font-medium">No Custom Controls</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Create controls using <code className="bg-gray-800 px-1.5 py-0.5 rounded text-accent">addControl()</code> in your custom code
                    </p>
                  </div>
                  <div className="text-xs text-gray-600 bg-gray-900/50 p-3 rounded-lg font-mono">
                    const scale = addControl("scale", "Size", 0, 100, 50);
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Display Tab */}
          {activeTab === 'display' && (
            <div className="space-y-5">
              {/* HUD Toggle */}
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                    showHUD ? "bg-accent/20 text-accent" : "bg-gray-800 text-gray-400"
                  )}>
                    <Info className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Info HUD</p>
                    <p className="text-xs text-gray-400">Show shape information panel</p>
                  </div>
                </div>
                <button
                  onClick={toggleHUD}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    showHUD ? "bg-accent" : "bg-gray-700"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                    showHUD ? "left-7" : "left-1"
                  )} />
                </button>
              </div>

              {/* Annotations Toggle */}
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                    showAnnotations ? "bg-accent/20 text-accent" : "bg-gray-800 text-gray-400"
                  )}>
                    <Eye className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Annotations</p>
                    <p className="text-xs text-gray-400">Show 3D labels and markers</p>
                  </div>
                </div>
                <button
                  onClick={toggleAnnotations}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    showAnnotations ? "bg-accent" : "bg-gray-700"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                    showAnnotations ? "left-7" : "left-1"
                  )} />
                </button>
              </div>

              {/* Bloom Strength */}
              <div className="p-3 bg-white/5 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Glow Intensity</p>
                      <p className="text-xs text-gray-400">Particle bloom effect strength</p>
                    </div>
                  </div>
                  <span className="text-accent font-mono">{bloomStrength.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={bloomStrength}
                  onChange={(e) => setBloomStrength(parseFloat(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
            </div>
          )}

          {/* Camera/Neural Nav Tab */}
          {activeTab === 'camera' && (
            <div className="space-y-5">
              {/* Camera Status */}
              <div className={cn(
                "p-4 rounded-lg border",
                hasCamera 
                  ? "bg-green-500/10 border-green-500/30" 
                  : "bg-red-500/10 border-red-500/30"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    hasCamera ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                  )}>
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <p className={cn(
                      "text-sm font-medium",
                      hasCamera ? "text-green-400" : "text-red-400"
                    )}>
                      {hasCamera ? 'Camera Available' : 'Camera Not Available'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {hasCamera 
                        ? 'Neural Navigation is ready to use' 
                        : cameraError || 'No camera detected'}
                    </p>
                  </div>
                </div>
                {!hasCamera && (
                  <button
                    onClick={checkCamera}
                    className="mt-3 w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs text-gray-300 transition-colors"
                  >
                    Check Again
                  </button>
                )}
              </div>

              {/* Neural Navigation Toggle */}
              <div className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                hasCamera ? "bg-white/5 border-gray-700" : "bg-white/5 border-gray-800 opacity-50"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                    handControlEnabled ? "bg-accent/20 text-accent" : "bg-gray-800 text-gray-400"
                  )}>
                    <Hand className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Neural Navigation</p>
                    <p className="text-xs text-gray-400">
                      {hasCamera 
                        ? 'Control with hand gestures' 
                        : 'Requires camera access'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggleHandControl}
                  disabled={!hasCamera}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    handControlEnabled ? "bg-accent" : "bg-gray-700",
                    !hasCamera && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                    handControlEnabled ? "left-7" : "left-1"
                  )} />
                </button>
              </div>

              {/* Gesture Guide */}
              {handControlEnabled && (
                <div className="p-4 bg-accent/5 border border-accent/20 rounded-lg space-y-3">
                  <p className="text-sm font-medium text-accent">Active Gestures</p>
                  <div className="space-y-2 text-xs text-gray-300">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-accent rounded-full" />
                      <span><strong>Point (1 finger):</strong> Rotate view</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-accent rounded-full" />
                      <span><strong>Peace (2 fingers):</strong> Adjust speed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-accent rounded-full" />
                      <span><strong>Open Palm (5 fingers):</strong> Zoom in/out</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MIDI/OSC Tab */}
          {activeTab === 'midiosc' && (
            <MidiOscPanel />
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-accent text-black font-bold rounded-lg hover:bg-accent/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
