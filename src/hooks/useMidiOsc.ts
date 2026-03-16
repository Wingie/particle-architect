/**
 * useMidiOsc — React hook that wires MidiManager + OscClient + MappingEngine
 * together.  Mount once in App.tsx.
 *
 * When `midiOscEnabled` is true in appStore the hook activates connections
 * and routes all incoming events through the mapping engine.
 */

import { useEffect, useRef } from 'react';
import { MidiManager } from '@/midi/MidiManager';
import { OscClient } from '@/osc/OscClient';
import { MappingEngine } from '@/mappings/MappingEngine';
import { useMappingStore } from '@/mappings/MappingStore';
import { useAppStore } from '@/stores/appStore';
import type { MidiEvent } from '@/midi/MidiManager';
import type { OscEvent } from '@/osc/OscClient';

export function useMidiOsc(): void {
  const engineRef = useRef<MappingEngine>(new MappingEngine());
  const midiRef = useRef<MidiManager>(MidiManager.getInstance());
  const oscRef = useRef<OscClient>(OscClient.getInstance());

  const midiOscEnabled = useAppStore((s) => s.midiOscEnabled);

  const {
    mappings,
    midiEnabled,
    midiDeviceId,
    oscEnabled,
    oscWsUrl,
    learn,
    pushMidiEvent,
    pushOscEvent,
    completeLearn,
    setMidiConnected,
    setOscConnected,
  } = useMappingStore();

  // Keep the engine's mapping list in sync
  useEffect(() => {
    engineRef.current.setMappings(mappings);
  }, [mappings]);

  // ── MIDI lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (!midiOscEnabled || !midiEnabled) {
      midiRef.current.deselectAll();
      setMidiConnected(false);
      return;
    }

    const midi = midiRef.current;
    if (!midi.isSupported) return;

    let unsubMsg: (() => void) | null = null;
    let unsubDev: (() => void) | null = null;

    midi.requestAccess().then((ok) => {
      if (!ok) return;
      setMidiConnected(true);

      // Select device or all
      if (midiDeviceId) {
        midi.selectDevice(midiDeviceId);
      } else {
        midi.selectAll();
      }

      unsubMsg = midi.onMessage((event: MidiEvent) => {
        pushMidiEvent(event);
        // Learn mode
        const learnState = useMappingStore.getState().learn;
        if (learnState.active) {
          completeLearn({
            kind: 'midi',
            type: event.type as any,
            channel: event.channel,
            number: event.number,
          });
          return; // Don't process further when learning
        }
        engineRef.current.processMidi(event);
      });

      unsubDev = midi.onDeviceChange(() => {
        // Re-select on device change
        if (midiDeviceId) {
          midi.selectDevice(midiDeviceId);
        } else {
          midi.selectAll();
        }
      });
    });

    return () => {
      unsubMsg?.();
      unsubDev?.();
      midi.deselectAll();
      setMidiConnected(false);
    };
  }, [midiOscEnabled, midiEnabled, midiDeviceId]);

  // ── OSC lifecycle ───────────────────────────────────────────────
  useEffect(() => {
    if (!midiOscEnabled || !oscEnabled) {
      oscRef.current.disconnect();
      setOscConnected(false);
      return;
    }

    const osc = oscRef.current;

    const unsubState = osc.onStateChange((state) => {
      setOscConnected(state === 'connected');
    });

    const unsubMsg = osc.onMessage((event: OscEvent) => {
      pushOscEvent(event);
      // Learn mode
      const learnState = useMappingStore.getState().learn;
      if (learnState.active) {
        completeLearn({
          kind: 'osc',
          address: event.address,
          argIndex: 0,
        });
        return;
      }
      engineRef.current.processOsc(event);
    });

    osc.connect(oscWsUrl);

    return () => {
      unsubState();
      unsubMsg();
      osc.disconnect();
      setOscConnected(false);
    };
  }, [midiOscEnabled, oscEnabled, oscWsUrl]);
}
