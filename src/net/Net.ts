import Phaser from 'phaser';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

/** Everyone who opens the page joins this lobby: first in becomes host, the rest connect to it. */
const LOBBY_ID = 'relay-2dpit-lobby-v1';
const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 30000;
/** Give up on a host that never answers (stale id on the broker) and retry hosting. */
const CONNECT_TIMEOUT_MS = 6000;

/**
 * Default PeerJS config only ships STUN, so any NAT stricter than "easy" (common on
 * mobile/CGNAT/hotel-hotspot connections) can never open a direct WebRTC path. Add a
 * free TURN relay as fallback so those peers can still connect (relayed instead of direct).
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];
const PEER_OPTIONS = { debug: 0 as const, config: { iceServers: ICE_SERVERS } };

export interface PlayerState {
  t: 'state';
  id: string;
  x: number;
  y: number;
  /** Facing: 1 right, -1 left. */
  f: 1 | -1;
  /** Weapon id. */
  w: string;
  /** Alpha (invulnerability fade). */
  a: number;
  /** Container angle (spins). */
  r: number;
  /** Weapon sprite pose. */
  s: { x: number; y: number; ang: number };
  hp: number;
  /** Alive. */
  al: boolean;
  /** Sword-tip trail colour while an ability is drawing one (0 = none). */
  tr: number;
  /** Afterimages while dashing (W). */
  gh: boolean;
  /** Shield ring radius (crossbow E block), 0 = none. */
  sh: number;
  /** Spin ring radius (crossbow R), 0 = none. */
  sp: number;
}

/** One-shot visual effect replicated to other players. */
export interface FxMessage {
  t: 'fx';
  id: string;
  k: 'sweep' | 'streak' | 'impact' | 'burst';
  a: number[];
}

export type NetMessage =
  | PlayerState
  | FxMessage
  | { t: 'hit'; id: string; e: number; d: number }
  /** Damage dealt by `id` to player `to`; the victim applies it. */
  | { t: 'pdmg'; id: string; to: string; d: number }
  /** Player `id` died; `by` gets kill credit. */
  | { t: 'killed'; id: string; by: string }
  | { t: 'leave'; id: string };

export type NetRole = 'offline' | 'connecting' | 'host' | 'client';

/**
 * Star-topology WebRTC lobby over PeerJS (public broker). The host relays every
 * message to the other peers; clients only talk to the host. If the host drops,
 * clients retry and one of them claims the lobby id.
 *
 * Events: 'message' (NetMessage), 'status' (role / peer count changed).
 */
export class Net extends Phaser.Events.EventEmitter {
  readonly id = Math.random().toString(36).slice(2, 8);
  role: NetRole = 'offline';

  private peer: Peer | null = null;
  private readonly conns = new Map<string, DataConnection>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_MIN_MS;
  private stopped = false;

  /** Number of players in the lobby including us (best effort). */
  get playerCount(): number {
    return 1 + this.conns.size;
  }

  start(): void {
    this.stopped = false;
    this.tryHost();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.send({ t: 'leave', id: this.id });
    this.teardown();
    this.role = 'offline';
    this.emit('status');
  }

  send(msg: NetMessage): void {
    for (const c of this.conns.values()) {
      if (c.open) c.send(msg);
    }
  }

  // --- internals ------------------------------------------------------------

  private setRole(role: NetRole): void {
    this.role = role;
    this.emit('status');
  }

  private tryHost(): void {
    if (this.stopped) return;
    this.teardown();
    this.setRole('connecting');

    const peer = new Peer(LOBBY_ID, PEER_OPTIONS);
    this.peer = peer;

    peer.on('open', () => {
      this.retryDelay = RETRY_MIN_MS;
      this.setRole('host');
      peer.on('connection', (c) => this.accept(c));
    });
    peer.on('error', (err: Error & { type?: string }) => {
      if (err.type === 'unavailable-id') {
        // Someone already hosts: join them.
        peer.destroy();
        this.joinAsClient();
      } else {
        this.scheduleRetry();
      }
    });
    peer.on('disconnected', () => this.scheduleRetry());
  }

  private joinAsClient(): void {
    if (this.stopped) return;
    this.teardown();
    this.setRole('connecting');

    const peer = new Peer(PEER_OPTIONS);
    this.peer = peer;

    peer.on('open', () => {
      const c = peer.connect(LOBBY_ID, { reliable: true, serialization: 'json' });
      this.accept(c);
      const timeout = setTimeout(() => {
        if (!c.open) this.scheduleRetry();
      }, CONNECT_TIMEOUT_MS);
      c.on('open', () => {
        clearTimeout(timeout);
        this.retryDelay = RETRY_MIN_MS;
        this.setRole('client');
      });
      c.on('close', () => this.scheduleRetry()); // host gone -> try to become host
    });
    peer.on('error', () => this.scheduleRetry());
    peer.on('disconnected', () => this.scheduleRetry());
  }

  private accept(c: DataConnection): void {
    this.conns.set(c.peer, c);
    c.on('open', () => this.emit('status'));
    c.on('data', (data) => this.onData(c, data as NetMessage));
    c.on('close', () => {
      this.conns.delete(c.peer);
      this.emit('status');
    });
    c.on('error', () => {
      this.conns.delete(c.peer);
      this.emit('status');
    });
  }

  private onData(from: DataConnection, msg: NetMessage): void {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    // Host relays to everyone else.
    if (this.role === 'host') {
      for (const c of this.conns.values()) {
        if (c !== from && c.open) c.send(msg);
      }
    }
    this.emit('message', msg);
  }

  /** Exponential backoff so a flaky broker is never hammered. */
  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) return;
    this.setRole('connecting');
    const delay = this.retryDelay;
    this.retryDelay = Math.min(RETRY_MAX_MS, this.retryDelay * 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.tryHost();
    }, delay);
  }

  private teardown(): void {
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}
