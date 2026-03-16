/**
 * OscClient — WebSocket client that connects to the OSC bridge server.
 *
 * The bridge (osc-bridge-server.js) forwards UDP OSC messages as JSON
 * over WebSocket.  This client parses them and emits `OscEvent`s.
 */

// ── types ────────────────────────────────────────────────────────────
export interface OscEvent {
  address: string;
  args: number[];
  timestamp: number;
}

export type OscConnectionState = 'disconnected' | 'connecting' | 'connected';

type OscListener = (event: OscEvent) => void;
type StateListener = (state: OscConnectionState) => void;

// ── singleton ────────────────────────────────────────────────────────
let instance: OscClient | null = null;

export class OscClient {
  private ws: WebSocket | null = null;
  private listeners: Set<OscListener> = new Set();
  private stateListeners: Set<StateListener> = new Set();
  private _state: OscConnectionState = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private maxReconnectDelay = 8000;
  private autoReconnect = true;
  private currentUrl = '';

  private constructor() {}

  static getInstance(): OscClient {
    if (!instance) instance = new OscClient();
    return instance;
  }

  // ── public API ───────────────────────────────────────────────────

  get state(): OscConnectionState {
    return this._state;
  }

  /** Connect to the OSC bridge WebSocket server. */
  connect(wsUrl = 'ws://localhost:9101'): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.currentUrl = wsUrl;
    this.autoReconnect = true;
    this.setState('connecting');
    this.createSocket(wsUrl);
  }

  /** Disconnect and stop auto-reconnect. */
  disconnect(): void {
    this.autoReconnect = false;
    this.clearReconnect();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
    this.reconnectAttempt = 0;
  }

  /** Subscribe to OSC events. */
  onMessage(listener: OscListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Subscribe to connection state changes. */
  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Clean up. */
  destroy(): void {
    this.disconnect();
    this.listeners.clear();
    this.stateListeners.clear();
    instance = null;
  }

  // ── internals ────────────────────────────────────────────────────

  private createSocket(url: string): void {
    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState('connected');
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.setState('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };

    this.ws.onmessage = (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data);
        // Bridge sends { address, args } or { bundle, packets }
        if (data.address) {
          this.emitOsc({
            address: data.address,
            args: Array.isArray(data.args) ? data.args.map(Number) : [],
            timestamp: Date.now(),
          });
        } else if (Array.isArray(data.packets)) {
          // Flattened bundle
          for (const pkt of data.packets) {
            if (pkt.address) {
              this.emitOsc({
                address: pkt.address,
                args: Array.isArray(pkt.args) ? pkt.args.map(Number) : [],
                timestamp: Date.now(),
              });
            }
          }
        }
      } catch {
        // ignore malformed messages
      }
    };
  }

  private emitOsc(event: OscEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private setState(state: OscConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  private scheduleReconnect(): void {
    if (!this.autoReconnect || !this.currentUrl) return;
    this.clearReconnect();
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), this.maxReconnectDelay);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.setState('connecting');
      this.createSocket(this.currentUrl);
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
