/**
 * MappingEngine — routes incoming MIDI / OSC events to particle-architect
 * parameters via a configurable mapping table.
 *
 * Each mapping specifies:
 *   source  → which MIDI or OSC event to listen for
 *   target  → which parameter to drive (addControl param or built-in)
 *   scaling → input range, output range, and curve
 */

import type { MidiEvent } from '@/midi/MidiManager';
import type { OscEvent } from '@/osc/OscClient';
import { useAppStore } from '@/stores/appStore';

// ── types ────────────────────────────────────────────────────────────
export type MappingCurve = 'linear' | 'exponential' | 'logarithmic';

export interface MidiSource {
  kind: 'midi';
  type: 'cc' | 'noteon' | 'noteoff' | 'pitchbend' | 'aftertouch' | 'channelpressure' | 'program';
  channel: number;  // 1-16, or 0 = any
  number: number;   // CC/note number, 0 = any (for pitchbend etc.)
}

export interface OscSource {
  kind: 'osc';
  address: string;  // e.g. "/delta", "/wek/outputs"
  argIndex: number;  // which arg to use (default 0)
}

export type MappingSource = MidiSource | OscSource;

export type BuiltinTarget =
  | 'speed'
  | 'bloomStrength'
  | 'autoSpin';

export interface Mapping {
  id: string;
  label: string;
  source: MappingSource;
  targetType: 'customParam' | 'builtin';
  targetId: string;              // addControl id, or BuiltinTarget name
  inputMin: number;
  inputMax: number;
  outputMin: number;
  outputMax: number;
  curve: MappingCurve;
  enabled: boolean;
}

// ── scaling ──────────────────────────────────────────────────────────
function applyScale(
  value: number,
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number,
  curve: MappingCurve,
): number {
  // Clamp to input range
  const clamped = Math.max(inputMin, Math.min(inputMax, value));
  // Normalise to 0-1
  const range = inputMax - inputMin;
  const t = range === 0 ? 0 : (clamped - inputMin) / range;

  // Apply curve
  let curved: number;
  switch (curve) {
    case 'exponential':
      curved = t * t;
      break;
    case 'logarithmic':
      curved = Math.sqrt(t);
      break;
    default:
      curved = t;
  }

  // Scale to output range
  return outputMin + curved * (outputMax - outputMin);
}

// ── engine ───────────────────────────────────────────────────────────
export class MappingEngine {
  private mappings: Mapping[] = [];

  /** Replace the full mapping set (called when store changes). */
  setMappings(mappings: Mapping[]): void {
    this.mappings = mappings;
  }

  /** Process a MIDI event against all active mappings. */
  processMidi(event: MidiEvent): void {
    for (const m of this.mappings) {
      if (!m.enabled) continue;
      if (m.source.kind !== 'midi') continue;
      const src = m.source;
      if (src.type !== event.type) continue;
      if (src.channel !== 0 && src.channel !== event.channel) continue;
      if (src.number !== 0 && src.number !== event.number) continue;

      const scaled = applyScale(
        event.value,
        m.inputMin, m.inputMax,
        m.outputMin, m.outputMax,
        m.curve,
      );
      this.applyToTarget(m, scaled);
    }
  }

  /** Process an OSC event against all active mappings. */
  processOsc(event: OscEvent): void {
    for (const m of this.mappings) {
      if (!m.enabled) continue;
      if (m.source.kind !== 'osc') continue;
      const src = m.source;
      // Match address — support wildcard suffix with *
      if (!matchOscAddress(src.address, event.address)) continue;

      const raw = event.args[src.argIndex] ?? 0;
      const scaled = applyScale(
        raw,
        m.inputMin, m.inputMax,
        m.outputMin, m.outputMax,
        m.curve,
      );
      this.applyToTarget(m, scaled);
    }
  }

  // ── target application ─────────────────────────────────────────

  private applyToTarget(mapping: Mapping, value: number): void {
    const store = useAppStore.getState();

    if (mapping.targetType === 'customParam') {
      store.setCustomParam(mapping.targetId, value);
    } else {
      // built-in targets
      switch (mapping.targetId as BuiltinTarget) {
        case 'speed':
          store.setSpeed(value);
          break;
        case 'bloomStrength':
          store.setBloomStrength(value);
          break;
        case 'autoSpin':
          // Treat > 0.5 as on, <= 0.5 as off
          if (value > 0.5 && !store.autoSpin) store.toggleAutoSpin();
          if (value <= 0.5 && store.autoSpin) store.toggleAutoSpin();
          break;
      }
    }
  }
}

/** Simple OSC address matching with trailing wildcard support. */
function matchOscAddress(pattern: string, address: string): boolean {
  if (pattern === address) return true;
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1); // keep the trailing /
    return address.startsWith(prefix);
  }
  return false;
}
