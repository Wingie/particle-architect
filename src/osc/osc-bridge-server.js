#!/usr/bin/env node
/**
 * OSC → WebSocket bridge for particle-architect.
 *
 * Receives OSC messages on a UDP port and forwards them as JSON to all
 * connected WebSocket clients.
 *
 * Usage:
 *   node osc-bridge-server.js [--udp-port 9100] [--ws-port 9101]
 *
 * Dependencies (install in project root):
 *   npm install osc ws
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let osc, WebSocketServer;
try {
  osc = require('osc');
  ({ WebSocketServer } = require('ws'));
} catch {
  console.error(
    'Missing dependencies. Install them with:\n  npm install osc ws\n'
  );
  process.exit(1);
}

// ── CLI args ─────────────────────────────────────────────────────────
function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const UDP_PORT = parseInt(arg('udp-port', '9100'), 10);
const WS_PORT  = parseInt(arg('ws-port',  '9101'), 10);

// ── UDP OSC receiver ─────────────────────────────────────────────────
const udpPort = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: UDP_PORT,
  metadata: true,
});

udpPort.on('error', (err) => {
  console.error('[OSC Bridge] UDP error:', err.message);
});

// ── WebSocket server ─────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[OSC Bridge] WebSocket client connected (${clients.size} total)`);
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[OSC Bridge] WebSocket client disconnected (${clients.size} total)`);
  });
  ws.on('error', () => clients.delete(ws));
});

// ── Forward OSC → WS ────────────────────────────────────────────────
function extractArgs(oscArgs) {
  if (!oscArgs) return [];
  return oscArgs.map((a) => (typeof a === 'object' && a !== null ? a.value : a));
}

function flattenBundle(bundle) {
  const messages = [];
  if (!bundle || !bundle.packets) return messages;
  for (const pkt of bundle.packets) {
    if (pkt.packets) {
      messages.push(...flattenBundle(pkt));
    } else if (pkt.address) {
      messages.push({ address: pkt.address, args: extractArgs(pkt.args) });
    }
  }
  return messages;
}

function broadcast(json) {
  const str = JSON.stringify(json);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(str);
  }
}

udpPort.on('message', (oscMsg) => {
  const payload = {
    address: oscMsg.address,
    args: extractArgs(oscMsg.args),
  };
  broadcast(payload);
});

udpPort.on('bundle', (bundle) => {
  const packets = flattenBundle(bundle);
  if (packets.length > 0) {
    broadcast({ packets });
  }
});

// ── Start ────────────────────────────────────────────────────────────
udpPort.open();

udpPort.on('ready', () => {
  console.log(`[OSC Bridge] Listening for OSC on UDP port ${UDP_PORT}`);
  console.log(`[OSC Bridge] WebSocket server on ws://localhost:${WS_PORT}`);
  console.log('[OSC Bridge] Ready — send OSC messages to start');
});
