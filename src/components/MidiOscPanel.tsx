import { useState, useEffect, useCallback } from 'react';
import {
  Radio, Wifi, WifiOff, Trash2, Plus, Zap, ZapOff,
  RefreshCw, Activity, X, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MidiManager, type MidiDevice } from '@/midi/MidiManager';
import { useMappingStore } from '@/mappings/MappingStore';
import { useAppStore } from '@/stores/appStore';
import type { Mapping, MappingCurve, MappingSource } from '@/mappings/MappingEngine';

// ── helpers ──────────────────────────────────────────────────────────
const BUILTIN_TARGETS = [
  { id: 'speed', label: 'Sim Speed', min: 0.1, max: 3 },
  { id: 'bloomStrength', label: 'Glow Intensity', min: 0.5, max: 3 },
  { id: 'autoSpin', label: 'Auto Rotation', min: 0, max: 1 },
] as const;

function generateId(): string {
  return `map_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── sub-tab types ────────────────────────────────────────────────────
type SubTab = 'connection' | 'mappings' | 'monitor';

// ── component ────────────────────────────────────────────────────────
export function MidiOscPanel() {
  const [subTab, setSubTab] = useState<SubTab>('connection');
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [showAddMapping, setShowAddMapping] = useState(false);

  const {
    mappings, midiEnabled, midiDeviceId, midiConnected,
    oscEnabled, oscWsUrl, oscConnected,
    learn,
    midiLog, oscLog,
    setMidiEnabled, setMidiDeviceId,
    setOscEnabled, setOscWsUrl,
    addMapping, removeMapping, toggleMapping,
    startLearn, cancelLearn,
  } = useMappingStore();

  const { controlKeys, midiOscEnabled, toggleMidiOsc } = useAppStore();

  // Refresh MIDI device list
  const refreshMidiDevices = useCallback(() => {
    const midi = MidiManager.getInstance();
    if (midi.isConnected) {
      setMidiDevices(midi.getDevices());
    } else {
      midi.requestAccess().then((ok) => {
        if (ok) setMidiDevices(midi.getDevices());
      });
    }
  }, []);

  useEffect(() => {
    if (midiEnabled) {
      refreshMidiDevices();
      const unsub = MidiManager.getInstance().onDeviceChange(setMidiDevices);
      return unsub;
    }
  }, [midiEnabled, refreshMidiDevices]);

  // ── Connection tab ────────────────────────────────────────────
  const renderConnection = () => (
    <div className="space-y-4">
      {/* Master toggle */}
      <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
            midiOscEnabled ? "bg-accent/20 text-accent" : "bg-gray-800 text-gray-400"
          )}>
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">MIDI/OSC Input</p>
            <p className="text-xs text-gray-400">Enable external control input</p>
          </div>
        </div>
        <button
          onClick={toggleMidiOsc}
          className={cn(
            "w-12 h-6 rounded-full transition-colors relative",
            midiOscEnabled ? "bg-accent" : "bg-gray-700"
          )}
        >
          <div className={cn(
            "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
            midiOscEnabled ? "left-7" : "left-1"
          )} />
        </button>
      </div>

      {midiOscEnabled && (
        <>
          {/* MIDI Section */}
          <div className="p-3 bg-white/5 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-white">MIDI</span>
                {midiConnected && (
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                )}
              </div>
              <button
                onClick={() => setMidiEnabled(!midiEnabled)}
                className={cn(
                  "w-10 h-5 rounded-full transition-colors relative",
                  midiEnabled ? "bg-purple-500" : "bg-gray-700"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform",
                  midiEnabled ? "left-5.5" : "left-0.5"
                )} />
              </button>
            </div>

            {midiEnabled && (
              <>
                {!MidiManager.getInstance().isSupported && (
                  <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
                    Web MIDI API not supported in this browser. Use Chrome or Edge.
                  </div>
                )}
                <div className="flex gap-2">
                  <select
                    value={midiDeviceId || ''}
                    onChange={(e) => setMidiDeviceId(e.target.value || null)}
                    className="flex-1 bg-black/40 border border-gray-700 rounded px-2 py-1.5 text-xs text-white"
                  >
                    <option value="">All devices</option>
                    {midiDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.manufacturer ? `(${d.manufacturer})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={refreshMidiDevices}
                    className="p-1.5 bg-black/40 border border-gray-700 rounded hover:border-purple-400 transition-colors"
                    title="Refresh devices"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* OSC Section */}
          <div className="p-3 bg-white/5 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {oscConnected ? (
                  <Wifi className="w-4 h-4 text-cyan-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-gray-500" />
                )}
                <span className="text-sm font-medium text-white">OSC</span>
                {oscConnected && (
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                )}
              </div>
              <button
                onClick={() => setOscEnabled(!oscEnabled)}
                className={cn(
                  "w-10 h-5 rounded-full transition-colors relative",
                  oscEnabled ? "bg-cyan-500" : "bg-gray-700"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform",
                  oscEnabled ? "left-5.5" : "left-0.5"
                )} />
              </button>
            </div>

            {oscEnabled && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={oscWsUrl}
                  onChange={(e) => setOscWsUrl(e.target.value)}
                  placeholder="ws://localhost:9101"
                  className="w-full bg-black/40 border border-gray-700 rounded px-2 py-1.5 text-xs text-white font-mono"
                />
                <p className="text-[10px] text-gray-500">
                  Run the bridge: <code className="bg-gray-800 px-1 rounded">node src/osc/osc-bridge-server.js</code>
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  // ── Mappings tab ──────────────────────────────────────────────
  const renderMappings = () => (
    <div className="space-y-3">
      {/* Learn mode banner */}
      {learn.active && (
        <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent" />
            <span className="text-xs text-accent font-medium">
              LEARN MODE — Move a MIDI control or send OSC to assign → {learn.targetId}
            </span>
          </div>
          <button
            onClick={cancelLearn}
            className="p-1 hover:bg-white/10 rounded"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      )}

      {/* Mapping list */}
      {mappings.length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <div className="w-12 h-12 mx-auto bg-gray-800 rounded-full flex items-center justify-center">
            <Radio className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-sm text-gray-400">No mappings yet</p>
          <p className="text-xs text-gray-500">
            Add a mapping or use Learn mode to assign MIDI/OSC to parameters
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {mappings.map((m) => (
            <MappingRow key={m.id} mapping={m} onRemove={removeMapping} onToggle={toggleMapping} />
          ))}
        </div>
      )}

      {/* Quick-learn buttons for existing controls */}
      {controlKeys.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Quick Learn</p>
          <div className="flex flex-wrap gap-1.5">
            {controlKeys.map((key) => (
              <button
                key={key}
                onClick={() => startLearn('customParam', key)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded border transition-colors",
                  learn.active && learn.targetId === key
                    ? "border-accent text-accent bg-accent/10"
                    : "border-gray-700 text-gray-400 hover:border-accent hover:text-accent"
                )}
              >
                <Zap className="w-3 h-3 inline mr-1" />
                {key}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {BUILTIN_TARGETS.map((t) => (
              <button
                key={t.id}
                onClick={() => startLearn('builtin', t.id)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded border transition-colors",
                  learn.active && learn.targetId === t.id
                    ? "border-accent text-accent bg-accent/10"
                    : "border-gray-700 text-gray-400 hover:border-accent hover:text-accent"
                )}
              >
                <Zap className="w-3 h-3 inline mr-1" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Builtin-only quick learn (when no custom controls) */}
      {controlKeys.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Quick Learn — Built-in Parameters</p>
          <div className="flex flex-wrap gap-1.5">
            {BUILTIN_TARGETS.map((t) => (
              <button
                key={t.id}
                onClick={() => startLearn('builtin', t.id)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded border transition-colors",
                  learn.active && learn.targetId === t.id
                    ? "border-accent text-accent bg-accent/10"
                    : "border-gray-700 text-gray-400 hover:border-accent hover:text-accent"
                )}
              >
                <Zap className="w-3 h-3 inline mr-1" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add manual mapping */}
      <button
        onClick={() => setShowAddMapping(true)}
        className="w-full py-2 border border-dashed border-gray-700 rounded-lg text-xs text-gray-400 hover:border-accent hover:text-accent transition-colors flex items-center justify-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Manual Mapping
      </button>

      {showAddMapping && (
        <AddMappingForm
          controlKeys={controlKeys}
          onAdd={(m) => { addMapping(m); setShowAddMapping(false); }}
          onCancel={() => setShowAddMapping(false)}
        />
      )}
    </div>
  );

  // ── Monitor tab ───────────────────────────────────────────────
  const renderMonitor = () => (
    <div className="space-y-3">
      {/* MIDI log */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs font-medium text-purple-300 uppercase">MIDI</span>
          {midiConnected && <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />}
        </div>
        <div className="bg-black/40 border border-gray-800 rounded-lg p-2 max-h-36 overflow-y-auto font-mono text-[10px] text-gray-400 space-y-0.5">
          {midiLog.length === 0 ? (
            <p className="text-gray-600 italic">Waiting for MIDI input...</p>
          ) : (
            midiLog.slice(0, 30).map((e, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-purple-400">{e.type.padEnd(8)}</span>
                <span className="text-gray-500">ch{String(e.channel).padStart(2)}</span>
                <span className="text-gray-500">#{String(e.number).padStart(3)}</span>
                <span className="text-accent">{e.value.toFixed(2)}</span>
                <span className="text-gray-600 ml-auto">{e.deviceName}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* OSC log */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Wifi className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-medium text-cyan-300 uppercase">OSC</span>
          {oscConnected && <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />}
        </div>
        <div className="bg-black/40 border border-gray-800 rounded-lg p-2 max-h-36 overflow-y-auto font-mono text-[10px] text-gray-400 space-y-0.5">
          {oscLog.length === 0 ? (
            <p className="text-gray-600 italic">Waiting for OSC input...</p>
          ) : (
            oscLog.slice(0, 30).map((e, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-cyan-400">{e.address}</span>
                <span className="text-accent">[{e.args.map((a) => a.toFixed(2)).join(', ')}]</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex bg-black/30 rounded-lg p-0.5 gap-0.5">
        {([
          { id: 'connection', label: 'Connection' },
          { id: 'mappings', label: 'Mappings', badge: mappings.length },
          { id: 'monitor', label: 'Monitor' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors relative",
              subTab === tab.id
                ? "bg-accent/20 text-accent"
                : "text-gray-400 hover:text-white"
            )}
          >
            {tab.label}
            {'badge' in tab && tab.badge ? (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {subTab === 'connection' && renderConnection()}
      {subTab === 'mappings' && renderMappings()}
      {subTab === 'monitor' && renderMonitor()}
    </div>
  );
}

// ── MappingRow ───────────────────────────────────────────────────────
function MappingRow({ mapping: m, onRemove, onToggle }: {
  mapping: Mapping;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const sourceLabel = m.source.kind === 'midi'
    ? `MIDI ${m.source.type} ch${m.source.channel} #${m.source.number}`
    : `OSC ${m.source.address}[${m.source.argIndex}]`;

  return (
    <div className={cn(
      "flex items-center gap-2 p-2 bg-white/5 rounded-lg border transition-colors",
      m.enabled ? "border-gray-700" : "border-gray-800 opacity-50"
    )}>
      <button onClick={() => onToggle(m.id)} className="shrink-0">
        {m.enabled
          ? <Zap className="w-3.5 h-3.5 text-accent" />
          : <ZapOff className="w-3.5 h-3.5 text-gray-500" />
        }
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs">
          <span className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-mono",
            m.source.kind === 'midi' ? "bg-purple-500/20 text-purple-300" : "bg-cyan-500/20 text-cyan-300"
          )}>
            {sourceLabel}
          </span>
          <ArrowRight className="w-3 h-3 text-gray-600" />
          <span className="text-white font-medium truncate">{m.targetId}</span>
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">
          {m.outputMin}–{m.outputMax} · {m.curve}
        </div>
      </div>
      <button
        onClick={() => onRemove(m.id)}
        className="p-1 hover:bg-red-500/20 rounded transition-colors shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5 text-gray-500 hover:text-red-400" />
      </button>
    </div>
  );
}

// ── AddMappingForm ───────────────────────────────────────────────────
function AddMappingForm({ controlKeys, onAdd, onCancel }: {
  controlKeys: string[];
  onAdd: (mapping: Mapping) => void;
  onCancel: () => void;
}) {
  const [sourceKind, setSourceKind] = useState<'midi' | 'osc'>('midi');
  const [midiType, setMidiType] = useState<'cc' | 'noteon' | 'pitchbend'>('cc');
  const [channel, setChannel] = useState(0);
  const [number, setNumber] = useState(1);
  const [oscAddress, setOscAddress] = useState('/delta');
  const [argIndex, setArgIndex] = useState(0);
  const [targetType, setTargetType] = useState<'customParam' | 'builtin'>('builtin');
  const [targetId, setTargetId] = useState('speed');
  const [outputMin, setOutputMin] = useState(0);
  const [outputMax, setOutputMax] = useState(100);
  const [curve, setCurve] = useState<MappingCurve>('linear');

  const handleSubmit = () => {
    const source: MappingSource = sourceKind === 'midi'
      ? { kind: 'midi', type: midiType, channel, number }
      : { kind: 'osc', address: oscAddress, argIndex };

    const label = sourceKind === 'midi'
      ? `MIDI ${midiType} ch${channel} #${number}`
      : `OSC ${oscAddress}`;

    onAdd({
      id: generateId(),
      label,
      source,
      targetType,
      targetId,
      inputMin: 0,
      inputMax: 1,
      outputMin,
      outputMax,
      curve,
      enabled: true,
    });
  };

  return (
    <div className="p-3 bg-white/5 border border-gray-700 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white">New Mapping</span>
        <button onClick={onCancel} className="p-1 hover:bg-white/10 rounded">
          <X className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      {/* Source */}
      <div className="space-y-2">
        <label className="text-[10px] text-gray-500 uppercase">Source</label>
        <div className="flex gap-1.5">
          <button
            onClick={() => setSourceKind('midi')}
            className={cn("flex-1 py-1 text-xs rounded border", sourceKind === 'midi' ? "border-purple-500 text-purple-300 bg-purple-500/10" : "border-gray-700 text-gray-400")}
          >MIDI</button>
          <button
            onClick={() => setSourceKind('osc')}
            className={cn("flex-1 py-1 text-xs rounded border", sourceKind === 'osc' ? "border-cyan-500 text-cyan-300 bg-cyan-500/10" : "border-gray-700 text-gray-400")}
          >OSC</button>
        </div>

        {sourceKind === 'midi' ? (
          <div className="grid grid-cols-3 gap-1.5">
            <select value={midiType} onChange={(e) => setMidiType(e.target.value as any)} className="bg-black/40 border border-gray-700 rounded px-1.5 py-1 text-xs text-white">
              <option value="cc">CC</option>
              <option value="noteon">Note</option>
              <option value="pitchbend">Pitch Bend</option>
            </select>
            <input type="number" value={channel} min={0} max={16} onChange={(e) => setChannel(+e.target.value)} className="bg-black/40 border border-gray-700 rounded px-1.5 py-1 text-xs text-white" placeholder="Ch (0=any)" />
            <input type="number" value={number} min={0} max={127} onChange={(e) => setNumber(+e.target.value)} className="bg-black/40 border border-gray-700 rounded px-1.5 py-1 text-xs text-white" placeholder="#" />
          </div>
        ) : (
          <div className="flex gap-1.5">
            <input type="text" value={oscAddress} onChange={(e) => setOscAddress(e.target.value)} className="flex-1 bg-black/40 border border-gray-700 rounded px-1.5 py-1 text-xs text-white font-mono" placeholder="/address" />
            <input type="number" value={argIndex} min={0} max={10} onChange={(e) => setArgIndex(+e.target.value)} className="w-12 bg-black/40 border border-gray-700 rounded px-1.5 py-1 text-xs text-white" placeholder="Arg" />
          </div>
        )}
      </div>

      {/* Target */}
      <div className="space-y-2">
        <label className="text-[10px] text-gray-500 uppercase">Target</label>
        <div className="flex gap-1.5">
          <button
            onClick={() => { setTargetType('builtin'); setTargetId('speed'); }}
            className={cn("flex-1 py-1 text-xs rounded border", targetType === 'builtin' ? "border-accent text-accent bg-accent/10" : "border-gray-700 text-gray-400")}
          >Built-in</button>
          <button
            onClick={() => { setTargetType('customParam'); setTargetId(controlKeys[0] || ''); }}
            className={cn("flex-1 py-1 text-xs rounded border", targetType === 'customParam' ? "border-accent text-accent bg-accent/10" : "border-gray-700 text-gray-400")}
            disabled={controlKeys.length === 0}
          >Control</button>
        </div>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="w-full bg-black/40 border border-gray-700 rounded px-1.5 py-1 text-xs text-white"
        >
          {targetType === 'builtin'
            ? BUILTIN_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)
            : controlKeys.map((k) => <option key={k} value={k}>{k}</option>)
          }
        </select>
      </div>

      {/* Output range & curve */}
      <div className="grid grid-cols-3 gap-1.5">
        <div>
          <label className="text-[10px] text-gray-500">Min</label>
          <input type="number" value={outputMin} onChange={(e) => setOutputMin(+e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded px-1.5 py-1 text-xs text-white" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500">Max</label>
          <input type="number" value={outputMax} onChange={(e) => setOutputMax(+e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded px-1.5 py-1 text-xs text-white" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500">Curve</label>
          <select value={curve} onChange={(e) => setCurve(e.target.value as MappingCurve)} className="w-full bg-black/40 border border-gray-700 rounded px-1.5 py-1 text-xs text-white">
            <option value="linear">Linear</option>
            <option value="exponential">Exp</option>
            <option value="logarithmic">Log</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        className="w-full py-1.5 bg-accent text-black text-xs font-bold rounded hover:bg-accent/80 transition-colors"
      >
        Create Mapping
      </button>
    </div>
  );
}
