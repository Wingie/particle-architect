/**
 * MappingStore — Zustand store for MIDI/OSC mapping configuration.
 *
 * Persisted to localStorage so mappings survive page reloads.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Mapping, MappingSource } from './MappingEngine';
import type { MidiEvent } from '@/midi/MidiManager';
import type { OscEvent } from '@/osc/OscClient';

// ── types ────────────────────────────────────────────────────────────
export interface LearnState {
  active: boolean;
  targetType: 'customParam' | 'builtin' | null;
  targetId: string | null;
}

interface MappingStoreState {
  mappings: Mapping[];
  midiDeviceId: string | null;
  midiEnabled: boolean;
  oscWsUrl: string;
  oscEnabled: boolean;
  oscConnected: boolean;
  midiConnected: boolean;
  learn: LearnState;
  lastMidiEvent: MidiEvent | null;
  lastOscEvent: OscEvent | null;
  midiLog: MidiEvent[];
  oscLog: OscEvent[];
}

interface MappingStoreActions {
  // Mappings
  addMapping: (mapping: Mapping) => void;
  removeMapping: (id: string) => void;
  updateMapping: (id: string, partial: Partial<Mapping>) => void;
  toggleMapping: (id: string) => void;
  clearMappings: () => void;

  // Connection
  setMidiDeviceId: (id: string | null) => void;
  setMidiEnabled: (enabled: boolean) => void;
  setOscWsUrl: (url: string) => void;
  setOscEnabled: (enabled: boolean) => void;
  setOscConnected: (connected: boolean) => void;
  setMidiConnected: (connected: boolean) => void;

  // Learn mode
  startLearn: (targetType: 'customParam' | 'builtin', targetId: string) => void;
  cancelLearn: () => void;
  completeLearn: (source: MappingSource) => void;

  // Monitoring
  pushMidiEvent: (event: MidiEvent) => void;
  pushOscEvent: (event: OscEvent) => void;
}

type MappingStore = MappingStoreState & MappingStoreActions;

const MAX_LOG = 50;

export const useMappingStore = create<MappingStore>()(
  persist(
    (set, get) => ({
      // ── state ──────────────────────────────────────────────────
      mappings: [],
      midiDeviceId: null,
      midiEnabled: false,
      oscWsUrl: 'ws://localhost:9101',
      oscEnabled: false,
      oscConnected: false,
      midiConnected: false,
      learn: { active: false, targetType: null, targetId: null },
      lastMidiEvent: null,
      lastOscEvent: null,
      midiLog: [],
      oscLog: [],

      // ── mapping CRUD ───────────────────────────────────────────
      addMapping: (mapping) =>
        set((s) => ({ mappings: [...s.mappings, mapping] })),

      removeMapping: (id) =>
        set((s) => ({ mappings: s.mappings.filter((m) => m.id !== id) })),

      updateMapping: (id, partial) =>
        set((s) => ({
          mappings: s.mappings.map((m) =>
            m.id === id ? { ...m, ...partial } : m
          ),
        })),

      toggleMapping: (id) =>
        set((s) => ({
          mappings: s.mappings.map((m) =>
            m.id === id ? { ...m, enabled: !m.enabled } : m
          ),
        })),

      clearMappings: () => set({ mappings: [] }),

      // ── connection ─────────────────────────────────────────────
      setMidiDeviceId: (midiDeviceId) => set({ midiDeviceId }),
      setMidiEnabled: (midiEnabled) => set({ midiEnabled }),
      setOscWsUrl: (oscWsUrl) => set({ oscWsUrl }),
      setOscEnabled: (oscEnabled) => set({ oscEnabled }),
      setOscConnected: (oscConnected) => set({ oscConnected }),
      setMidiConnected: (midiConnected) => set({ midiConnected }),

      // ── learn mode ─────────────────────────────────────────────
      startLearn: (targetType, targetId) =>
        set({ learn: { active: true, targetType, targetId } }),

      cancelLearn: () =>
        set({ learn: { active: false, targetType: null, targetId: null } }),

      completeLearn: (source) => {
        const { learn, mappings } = get();
        if (!learn.active || !learn.targetType || !learn.targetId) return;

        const id = `map_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const label = source.kind === 'midi'
          ? `MIDI ${source.type.toUpperCase()} ch${source.channel} #${source.number}`
          : `OSC ${source.address}`;

        const newMapping: Mapping = {
          id,
          label,
          source,
          targetType: learn.targetType,
          targetId: learn.targetId,
          inputMin: 0,
          inputMax: 1,
          outputMin: 0,
          outputMax: 100,
          curve: 'linear',
          enabled: true,
        };

        set({
          mappings: [...mappings, newMapping],
          learn: { active: false, targetType: null, targetId: null },
        });
      },

      // ── monitoring ─────────────────────────────────────────────
      pushMidiEvent: (event) =>
        set((s) => ({
          lastMidiEvent: event,
          midiLog: [event, ...s.midiLog].slice(0, MAX_LOG),
        })),

      pushOscEvent: (event) =>
        set((s) => ({
          lastOscEvent: event,
          oscLog: [event, ...s.oscLog].slice(0, MAX_LOG),
        })),
    }),
    {
      name: 'particle-architect-mappings',
      partialize: (state) => ({
        mappings: state.mappings,
        midiDeviceId: state.midiDeviceId,
        midiEnabled: state.midiEnabled,
        oscWsUrl: state.oscWsUrl,
        oscEnabled: state.oscEnabled,
      }),
    }
  )
);
