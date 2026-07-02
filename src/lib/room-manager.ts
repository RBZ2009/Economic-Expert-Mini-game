// ============================================================
// 房间管理模块 - 多终端经济模拟游戏
// ============================================================

import { GameMode, GameState, PlayerProfession, PLAYER_COLORS } from '@/types/game';
import { WebSocket } from 'ws';
import { FileRoomStore, StoredGameRoom } from '@/lib/room-store';

// ------------------- 房间相关类型 -------------------

export interface RoomPlayer {
  id: string;
  name: string;
  profession?: PlayerProfession;
  ws?: WebSocket;
  deviceId: string;
  isReady: boolean;
  isHost: boolean;
  color: string;
  hasActedThisRound: boolean;
  isConnected: boolean;
  lastSeenAt: number;
}

export interface GameRoom {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  players: RoomPlayer[];
  maxPlayers: number;
  hostId: string;
  gameMode: GameMode;
  gameState?: GameState;
  createdAt: number;
  updatedAt: number;
  actionLog: RoomActionLogEntry[];
}

export interface RoomActionLogEntry {
  id: string;
  roomId: string;
  playerId: string;
  actionType: string;
  round: number;
  success: boolean;
  error?: string;
  createdAt: number;
}

export interface CreateRoomRequest {
  playerName: string;
  deviceId: string;
  maxPlayers?: number;
  gameMode?: GameMode;
}

export interface JoinRoomRequest {
  roomId: string;
  playerName: string;
  deviceId: string;
}

export interface PlayerAction {
  type: string;
  payload: Record<string, unknown>;
}

// ------------------- 房间管理器 -------------------

class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerConnections: Map<string, { roomId: string; playerId: string }> = new Map();
  private readonly roomTtlMs = 6 * 60 * 60 * 1000;
  private readonly finishedRoomTtlMs = 30 * 60 * 1000;
  private readonly store = new FileRoomStore();

  constructor() {
    this.loadPersistedRooms();
    this.persistRooms();
  }

  private loadPersistedRooms(): void {
    const storedRooms = this.store.load();
    for (const storedRoom of storedRooms) {
      const room = this.hydrateStoredRoom(storedRoom);
      this.rooms.set(room.id, room);
      for (const player of room.players) {
        this.playerConnections.set(player.deviceId, { roomId: room.id, playerId: player.id });
      }
    }
  }

  private hydrateStoredRoom(storedRoom: StoredGameRoom): GameRoom {
    return {
      ...storedRoom,
      gameMode: storedRoom.gameMode ?? 'professional',
      players: storedRoom.players.map(player => ({
        ...player,
        isConnected: false,
      })),
    };
  }

  private persistRooms(): void {
    this.store.save(Array.from(this.rooms.values()));
  }

  // 生成房间号 (6位大写字母)
  generateRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let roomId = '';
    for (let i = 0; i < 6; i++) {
      roomId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // 确保不重复
    while (this.rooms.has(roomId)) {
      roomId = '';
      for (let i = 0; i < 6; i++) {
        roomId += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    return roomId;
  }

  // 生成玩家ID
  generatePlayerId(): string {
    return 'player_' + Math.random().toString(36).substring(2, 11);
  }

  // 创建房间
  createRoom(request: CreateRoomRequest): { room: GameRoom; playerId: string } {
    const roomId = this.generateRoomId();
    const playerId = this.generatePlayerId();
    
    const player: RoomPlayer = {
      id: playerId,
      name: request.playerName,
      deviceId: request.deviceId,
      isReady: false,
      isHost: true,
      color: PLAYER_COLORS[0],
      hasActedThisRound: false,
      isConnected: true,
      lastSeenAt: Date.now(),
    };

    const room: GameRoom = {
      id: roomId,
      status: 'waiting',
      players: [player],
      maxPlayers: request.maxPlayers || 10,
      hostId: playerId,
      gameMode: request.gameMode ?? 'professional',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      actionLog: [],
    };

    this.rooms.set(roomId, room);
    this.playerConnections.set(request.deviceId, { roomId, playerId });
    this.persistRooms();

    return { room, playerId };
  }

  // 加入房间
  joinRoom(request: JoinRoomRequest): { success: boolean; room?: GameRoom; playerId?: string; error?: string } {
    const room = this.rooms.get(request.roomId);
    
    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (room.status !== 'waiting') {
      const reconnectingPlayer = room.players.find(p => p.deviceId === request.deviceId);
      if (reconnectingPlayer) {
        reconnectingPlayer.isConnected = true;
        reconnectingPlayer.lastSeenAt = Date.now();
        this.playerConnections.set(request.deviceId, { roomId: room.id, playerId: reconnectingPlayer.id });
        room.updatedAt = Date.now();
        this.persistRooms();
        return { success: true, room, playerId: reconnectingPlayer.id };
      }
      return { success: false, error: '游戏已开始，无法加入' };
    }

    if (room.players.length >= room.maxPlayers) {
      return { success: false, error: '房间已满' };
    }

    // 检查是否已在此设备
    const existing = room.players.find(p => p.deviceId === request.deviceId);
    if (existing) {
      existing.isConnected = true;
      existing.lastSeenAt = Date.now();
      this.playerConnections.set(request.deviceId, { roomId: room.id, playerId: existing.id });
      room.updatedAt = Date.now();
      this.persistRooms();
      return { success: true, room, playerId: existing.id };
    }

    const playerId = this.generatePlayerId();
    const player: RoomPlayer = {
      id: playerId,
      name: request.playerName,
      deviceId: request.deviceId,
      isReady: false,
      isHost: false,
      color: PLAYER_COLORS[room.players.length % PLAYER_COLORS.length],
      hasActedThisRound: false,
      isConnected: true,
      lastSeenAt: Date.now(),
    };

    room.players.push(player);
    this.playerConnections.set(request.deviceId, { roomId: room.id, playerId });
    room.updatedAt = Date.now();
    this.persistRooms();

    return { success: true, room, playerId };
  }

  // 离开房间
  leaveRoom(deviceId: string): { success: boolean; roomId?: string } {
    const connection = this.playerConnections.get(deviceId);
    if (!connection) {
      return { success: false };
    }

    const { roomId, playerId } = connection;
    const room = this.rooms.get(roomId);
    
    if (!room) {
      this.playerConnections.delete(deviceId);
      return { success: false };
    }

    // 移除玩家
    room.players = room.players.filter(p => p.id !== playerId);
    this.playerConnections.delete(deviceId);

    // 如果房间空了，删除房间
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      this.persistRooms();
      return { success: true };
    }

    // 如果房主离开，转移房主
    if (room.hostId === playerId && room.players.length > 0) {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
    }

    room.updatedAt = Date.now();
    this.persistRooms();

    return { success: true, roomId };
  }

  // 设置玩家职业
  setPlayerProfession(roomId: string, playerId: string, profession: PlayerProfession): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return false;

    // 检查职业是否已被其他玩家选择
    const professionTaken = room.players.some(p => p.id !== playerId && p.profession === profession);
    if (professionTaken) return false;

    player.profession = profession;
    player.isReady = false;
    room.updatedAt = Date.now();
    this.persistRooms();
    return true;
  }

  // 设置玩家准备状态
  setPlayerReady(roomId: string, playerId: string, ready: boolean): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return false;

    player.isReady = ready;
    room.updatedAt = Date.now();
    this.persistRooms();
    return true;
  }

  // 获取玩家连接信息
  getPlayerConnection(deviceId: string): { roomId: string; playerId: string } | undefined {
    return this.playerConnections.get(deviceId);
  }

  // 更新玩家 WebSocket 连接
  updatePlayerWs(deviceId: string, ws: WebSocket): void {
    const connection = this.playerConnections.get(deviceId);
    if (!connection) return;

    const room = this.rooms.get(connection.roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === connection.playerId);
    if (player) {
      player.ws = ws;
      player.isConnected = true;
      player.lastSeenAt = Date.now();
      room.updatedAt = Date.now();
      this.persistRooms();
    }
  }

  markPlayerDisconnected(deviceId: string): { room?: GameRoom; playerId?: string } {
    const connection = this.playerConnections.get(deviceId);
    if (!connection) return {};

    const room = this.rooms.get(connection.roomId);
    if (!room) return {};

    const player = room.players.find(p => p.id === connection.playerId);
    if (player) {
      player.isConnected = false;
      player.lastSeenAt = Date.now();
      room.updatedAt = Date.now();
      this.persistRooms();
    }

    return { room, playerId: connection.playerId };
  }

  // 获取房间
  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  // 获取房间（通过设备ID）
  getRoomByDevice(deviceId: string): GameRoom | undefined {
    const connection = this.playerConnections.get(deviceId);
    if (!connection) return undefined;
    return this.rooms.get(connection.roomId);
  }

  // 获取所有房间（用于列表显示）
  getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values())
      .filter(r => r.status === 'waiting')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  // 广播消息到房间所有玩家
  broadcastToRoom(roomId: string, message: object, excludeDeviceId?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const data = JSON.stringify(message);
    for (const player of room.players) {
      if (excludeDeviceId && player.deviceId === excludeDeviceId) continue;
      if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(data);
      }
    }
  }

  // 发送消息给特定玩家
  sendToPlayer(roomId: string, playerId: string, message: object): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (player && player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(message));
    }
  }

  // 更新游戏状态
  updateGameState(roomId: string, gameState: GameState): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.gameState = gameState;
    room.status = gameState.phase === 'game_over' ? 'finished' : 'playing';
    room.updatedAt = Date.now();
    this.persistRooms();
  }

  appendActionLog(entry: Omit<RoomActionLogEntry, 'id' | 'createdAt'>): void {
    const room = this.rooms.get(entry.roomId);
    if (!room) return;

    room.actionLog.push({
      ...entry,
      id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    });
    if (room.actionLog.length > 500) {
      room.actionLog = room.actionLog.slice(-500);
    }
    room.updatedAt = Date.now();
    this.persistRooms();
  }

  cleanupExpiredRooms(now = Date.now()): string[] {
    const deleted: string[] = [];
    for (const room of this.rooms.values()) {
      const ttl = room.status === 'finished' ? this.finishedRoomTtlMs : this.roomTtlMs;
      const allDisconnected = room.players.every(player => !player.isConnected);
      if (allDisconnected && now - room.updatedAt > ttl) {
        this.deleteRoom(room.id);
        deleted.push(room.id);
      }
    }
    if (deleted.length > 0) this.persistRooms();
    return deleted;
  }

  // 检查是否所有玩家都准备好了
  areAllPlayersReady(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.players.length < 2) return false;
    return room.players.every(p => p.profession !== undefined && p.isReady);
  }

  // 重置玩家回合状态
  resetTurnStates(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const player of room.players) {
      player.hasActedThisRound = false;
    }
  }

  // 删除房间
  deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // 清理所有玩家的连接记录
    for (const player of room.players) {
      this.playerConnections.delete(player.deviceId);
    }

    this.rooms.delete(roomId);
    this.persistRooms();
  }
}

// 单例导出
export const roomManager = new RoomManager();
