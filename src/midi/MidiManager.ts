/**
 * MidiManager — Web MIDI API wrapper for particle-architect.
 *
 * Singleton class that handles device enumeration, hot-plug events,
 * and message parsing.  Every incoming MIDI byte is normalised to a
 * `MidiEvent` with a 0-1 `value` so the mapping engine never has to
 * think about raw bytes.
 */

// ── types ────────────────────────────────────────────────────────────
export type MidiEventType =
  | 'noteon'
  | 'noteoff'
  | 'cc'
  | 'pitchbend'
  | 'aftertouch'
  | 'channelpressure'
  | 'program';

export interface MidiEvent {
  type: MidiEventType;
  channel: number;      // 1-16
  number: number;       // note / cc number (0-127), 0 for pitchbend/pressure
  value: number;        // 0-1 normalised
  rawValue: number;     // original integer value
  deviceId: string;
  deviceName: string;
  timestamp: number;
}

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: string;        // 'connected' | 'disconnected'
}

type MidiListener = (event: MidiEvent) => void;
type DeviceListener = (devices: MidiDevice[]) => void;

// ── singleton ────────────────────────────────────────────────────────
let instance: MidiManager | null = null;

export class MidiManager {
  private access: MIDIAccess | null = null;
  private listeners: Set<MidiListener> = new Set();
  private deviceListeners: Set<DeviceListener> = new Set();
  private activeInputIds: Set<string> = new Set();
  private boundHandler = this.handleMidiMessage.bind(this);
  private supported: boolean;

  private constructor() {
    this.supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  static getInstance(): MidiManager {
    if (!instance) instance = new MidiManager();
    return instance;
  }

  // ── public API ───────────────────────────────────────────────────

  get isSupported(): boolean {
    return this.supported;
  }

  get isConnected(): boolean {
    return this.access !== null;
  }

  /** Request Web MIDI access and begin listening for devices. */
  async requestAccess(): Promise<boolean> {
    if (!this.supported) return false;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.notifyDeviceChange();
      this.notifyDeviceChange();
      return true;
    } catch {
      return false;
    }
  }

  /** All currently visible MIDI input devices. */
  getDevices(): MidiDevice[] {
    if (!this.access) return [];
    const devices: MidiDevice[] = [];
    this.access.inputs.forEach((input) => {
      devices.push({
        id: input.id,
        name: input.name || 'Unknown MIDI Device',
        manufacturer: input.manufacturer || '',
        state: input.state,
      });
    });
    return devices;
  }

  /** Start listening to a specific input device. */
  selectDevice(id: string): void {
    if (!this.access) return;
    const input = this.access.inputs.get(id);
    if (!input) return;
    if (this.activeInputIds.has(id)) return; // already listening
    input.onmidimessage = this.boundHandler as (e: MIDIMessageEvent) => void;
    this.activeInputIds.add(id);
  }

  /** Stop listening to a specific input device. */
  deselectDevice(id: string): void {
    if (!this.access) return;
    const input = this.access.inputs.get(id);
    if (input) input.onmidimessage = null;
    this.activeInputIds.delete(id);
  }

  /** Listen to ALL available input devices at once. */
  selectAll(): void {
    if (!this.access) return;
    this.access.inputs.forEach((input) => {
      if (!this.activeInputIds.has(input.id)) {
        input.onmidimessage = this.boundHandler as (e: MIDIMessageEvent) => void;
        this.activeInputIds.add(input.id);
      }
    });
  }

  /** Stop listening to all devices. */
  deselectAll(): void {
    if (!this.access) return;
    this.access.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
    this.activeInputIds.clear();
  }

  /** Subscribe to parsed MIDI events. */
  onMessage(listener: MidiListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Subscribe to device connect/disconnect changes. */
  onDeviceChange(listener: DeviceListener): () => void {
    this.deviceListeners.add(listener);
    return () => this.deviceListeners.delete(listener);
  }

  /** Clean up. */
  destroy(): void {
    this.deselectAll();
    this.listeners.clear();
    this.deviceListeners.clear();
    if (this.access) {
      this.access.onstatechange = null;
      this.access = null;
    }
    instance = null;
  }

  // ── internals ────────────────────────────────────────────────────

  private handleMidiMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 1) return;

    const status = data[0];
    const channel = (status & 0x0f) + 1;          // 1-16
    const type = status & 0xf0;

    // Find device info
    const target = event.target as MIDIInput;
    const deviceId = target?.id ?? '';
    const deviceName = target?.name ?? 'Unknown';

    let parsed: MidiEvent | null = null;

    switch (type) {
      case 0x90: // Note On
        parsed = {
          type: data[2] > 0 ? 'noteon' : 'noteoff',
          channel,
          number: data[1],
          value: data[2] / 127,
          rawValue: data[2],
          deviceId,
          deviceName,
          timestamp: event.timeStamp,
        };
        break;

      case 0x80: // Note Off
        parsed = {
          type: 'noteoff',
          channel,
          number: data[1],
          value: 0,
          rawValue: 0,
          deviceId,
          deviceName,
          timestamp: event.timeStamp,
        };
        break;

      case 0xb0: // Control Change
        parsed = {
          type: 'cc',
          channel,
          number: data[1],
          value: data[2] / 127,
          rawValue: data[2],
          deviceId,
          deviceName,
          timestamp: event.timeStamp,
        };
        break;

      case 0xe0: { // Pitch Bend (14-bit)
        const raw = (data[2] << 7) | data[1]; // 0-16383
        parsed = {
          type: 'pitchbend',
          channel,
          number: 0,
          value: raw / 16383,
          rawValue: raw,
          deviceId,
          deviceName,
          timestamp: event.timeStamp,
        };
        break;
      }

      case 0xa0: // Polyphonic Aftertouch
        parsed = {
          type: 'aftertouch',
          channel,
          number: data[1],
          value: data[2] / 127,
          rawValue: data[2],
          deviceId,
          deviceName,
          timestamp: event.timeStamp,
        };
        break;

      case 0xd0: // Channel Pressure
        parsed = {
          type: 'channelpressure',
          channel,
          number: 0,
          value: data[1] / 127,
          rawValue: data[1],
          deviceId,
          deviceName,
          timestamp: event.timeStamp,
        };
        break;

      case 0xc0: // Program Change
        parsed = {
          type: 'program',
          channel,
          number: data[1],
          value: data[1] / 127,
          rawValue: data[1],
          deviceId,
          deviceName,
          timestamp: event.timeStamp,
        };
        break;
    }

    if (parsed) {
      for (const listener of this.listeners) {
        listener(parsed);
      }
    }
  }

  private notifyDeviceChange(): void {
    const devices = this.getDevices();
    // Re-attach to any device that reconnected
    for (const id of this.activeInputIds) {
      const input = this.access?.inputs.get(id);
      if (input && !input.onmidimessage) {
        input.onmidimessage = this.boundHandler as (e: MIDIMessageEvent) => void;
      }
    }
    for (const listener of this.deviceListeners) {
      listener(devices);
    }
  }
}
