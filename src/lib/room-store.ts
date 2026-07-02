import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import path from 'path';
import { GameMode, GameState, PlayerProfession } from '@/types/game';
import type { GameRoom, RoomActionLogEntry } from '@/lib/room-manager';

export interface StoredRoomPlayer {
  id: string;
  name: string;
  profession?: PlayerProfession;
  deviceId: string;
  isReady: boolean;
  isHost: boolean;
  color: string;
  hasActedThisRound: boolean;
  isConnected: boolean;
  lastSeenAt: number;
}

export interface StoredGameRoom {
  id: string;
  status: GameRoom['status'];
  players: StoredRoomPlayer[];
  maxPlayers: number;
  hostId: string;
  gameMode?: GameMode;
  gameState?: GameState;
  createdAt: number;
  updatedAt: number;
  actionLog: RoomActionLogEntry[];
}

interface StoreSnapshot {
  version: 1;
  savedAt: number;
  rooms: StoredGameRoom[];
}

function getStorePath(): string {
  return process.env.ROOM_STORE_PATH || path.join(process.cwd(), '.data', 'rooms.json');
}

function toStoredRoom(room: GameRoom): StoredGameRoom {
  return {
    id: room.id,
    status: room.status,
    players: room.players.map(player => ({
      id: player.id,
      name: player.name,
      profession: player.profession,
      deviceId: player.deviceId,
      isReady: player.isReady,
      isHost: player.isHost,
      color: player.color,
      hasActedThisRound: player.hasActedThisRound,
      isConnected: false,
      lastSeenAt: player.lastSeenAt,
    })),
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
    gameMode: room.gameMode,
    gameState: room.gameState,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    actionLog: room.actionLog,
  };
}

export class FileRoomStore {
  private readonly filePath: string;

  constructor(filePath = getStorePath()) {
    this.filePath = filePath;
  }

  load(): StoredGameRoom[] {
    if (!existsSync(this.filePath)) return [];

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as StoreSnapshot;
      if (parsed.version !== 1 || !Array.isArray(parsed.rooms)) return [];
      return parsed.rooms;
    } catch (error) {
      console.error('[RoomStore] failed to load room snapshot:', error);
      return [];
    }
  }

  save(rooms: GameRoom[]): void {
    const dir = path.dirname(this.filePath);
    mkdirSync(dir, { recursive: true });

    const snapshot: StoreSnapshot = {
      version: 1,
      savedAt: Date.now(),
      rooms: rooms.map(toStoredRoom),
    };

    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(snapshot));
    renameSync(tmpPath, this.filePath);
  }
}
