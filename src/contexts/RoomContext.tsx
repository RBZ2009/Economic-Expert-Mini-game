'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createWsConnection, type WsMessage, type RoomState, type RoomPlayerInfo } from '@/lib/ws-client';
import { GameMode, Player, PlayerProfession, GameState, RandomEvent } from '@/types/game';

// ==================== 类型定义 ====================

interface RoundEndEvent {
  event: RandomEvent;
  completedRound: number;
  newRound: number;
}

interface RoundEndMessagePayload {
  round: number;
  completedRound: number;
  event: RandomEvent;
  market: GameState['market'];
  players: Partial<Player>[];
}

function getRoundNewsKey(event: RandomEvent, round: number): string {
  return `${round}:${event.id || event.name}`;
}

interface RoomContextType {
  // 连接状态
  isConnected: boolean;
  isConnecting: boolean;
  
  // 房间状态
  room: RoomState | null;
  playerId: string | null;
  players: RoomPlayerInfo[];
  
  // 当前玩家信息
  currentPlayerId: string | null;
  
  // 游戏状态
  gameState: GameState | null;
  isMyTurn: boolean;
  
  // 统一轮次管理
  hasCompletedRound: boolean;  // 当前回合是否已完成操作
  roundEndEvent: RoundEndEvent | null;  // 轮次结束事件（用于弹窗显示）
  
  // 操作
  createRoom: (playerName: string, maxPlayers?: number, gameMode?: GameMode) => void;
  joinRoom: (roomId: string, playerName: string) => void;
  leaveRoom: () => void;
  dissolveRoom: () => void;
  transferHost: (targetPlayerId: string) => void;
  updateRoomSettings: (settings: { allowMidGameJoin?: boolean }) => void;
  setProfession: (profession: PlayerProfession) => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  sendAction: (action: { type: string; payload: Record<string, unknown> }) => void;
  dismissRoundEndEvent: () => void;  // 关闭轮次结束弹窗
  
  // 错误处理
  error: string | null;
  clearError: () => void;
}

const RoomContext = createContext<RoomContextType | null>(null);

// ==================== 设备 ID 管理 ====================

function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  
  let deviceId = localStorage.getItem('game_device_id');
  if (!deviceId) {
    deviceId = 'device_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('game_device_id', deviceId);
  }
  return deviceId;
}

// ==================== 消息处理函数 ====================

function processMessage(
  msg: WsMessage,
  setters: {
    setRoom: (room: RoomState | null) => void;
    setPlayerId: (id: string | null) => void;
    setPlayers: (players: RoomPlayerInfo[]) => void;
    setGameState: (state: GameState | null | ((prev: GameState | null) => GameState | null)) => void;
    setCurrentPlayerId: (id: string | null) => void;
    showRoundEndEvent: (event: RoundEndEvent) => void;
    setError: (error: string | null) => void;
  },
  currentRoom: RoomState | null,
  currentGameState: GameState | null
): void {
  const { type, payload } = msg;

  switch (type) {
    case 'room:create_result': {
      const result = payload as { 
        success: boolean; 
        roomId?: string; 
        playerId?: string; 
        room?: RoomState;
        error?: string;
      };
      if (result.success && result.room && result.playerId) {
        setters.setRoom(result.room);
        setters.setPlayerId(result.playerId);
        setters.setPlayers(result.room.players);
      } else {
        setters.setError(result.error || '创建房间失败');
      }
      break;
    }

    case 'room:join_result': {
      const result = payload as { 
        success: boolean; 
        playerId?: string; 
        room?: RoomState;
        error?: string;
      };
      if (result.success && result.room && result.playerId) {
        setters.setRoom(result.room);
        setters.setPlayerId(result.playerId);
        setters.setPlayers(result.room.players);
      } else {
        setters.setError(result.error || '加入房间失败');
      }
      break;
    }

    case 'room:leave_result': {
      setters.setRoom(null);
      setters.setPlayerId(null);
      setters.setPlayers([]);
      setters.setGameState(null);
      setters.setCurrentPlayerId(null);
      break;
    }

    case 'room:dissolved': {
      setters.setRoom(null);
      setters.setPlayerId(null);
      setters.setPlayers([]);
      setters.setGameState(null);
      setters.setCurrentPlayerId(null);
      break;
    }

    case 'room:state': {
      const data = payload as { room?: RoomState };
      if (data.room) {
        setters.setRoom(data.room);
        setters.setPlayers(data.room.players);
      }
      break;
    }

    case 'room:player_list':
    case 'room:player_update': {
      const data = payload as { players?: RoomPlayerInfo[]; playerId?: string; isConnected?: boolean };
      if (data.players) {
        setters.setPlayers(data.players);
        if (currentRoom) {
          setters.setRoom({ ...currentRoom, players: data.players });
        }
      }
      break;
    }

    case 'game:start_result': {
      const result = payload as { success: boolean; error?: string };
      if (!result.success) {
        setters.setError(result.error || '开始游戏失败');
      }
      break;
    }

    case 'game:state': {
      const data = payload as { gameState: GameState; currentPlayerId?: string };
      setters.setGameState(data.gameState);
      const isEnteringNewGameRound = !currentGameState || currentGameState.currentRound !== data.gameState.currentRound;
      if (data.gameState.currentNews && isEnteringNewGameRound) {
        setters.showRoundEndEvent({
          event: data.gameState.currentNews,
          completedRound: Math.max(0, data.gameState.currentRound - 1),
          newRound: data.gameState.currentRound,
        });
      }
      if (data.currentPlayerId) {
        setters.setCurrentPlayerId(data.currentPlayerId);
      }
      // 游戏开始时更新 room status
      if (currentRoom) {
        setters.setRoom({ ...currentRoom, status: 'playing' });
      }
      break;
    }

    case 'game:turn_change': {
      const data = payload as { currentPlayerId: string; currentPlayerName: string; round: number };
      setters.setCurrentPlayerId(data.currentPlayerId);
      // 游戏状态更新会在 game:state 中处理
      break;
    }

    case 'game:player_completed': {
      // 玩家完成操作的通知 - gameState 通过单独的 setGameState 管理
      // 由于 gameState 是独立状态，这里只需要更新本地状态
      // 实际的 gameState 更新会通过 game:state 消息同步
      break;
    }

    case 'game:round_end': {
      // 轮次结束，所有玩家都完成操作
      const data = payload as RoundEndMessagePayload;
      // 更新游戏状态（包含完整的玩家数据）
      setters.setGameState((prev: GameState | null) => {
        if (!prev) return prev;
        
        // 更新玩家数据（合并现有玩家和新数据）
        const updatedPlayers = prev.players.map(player => {
          const updatedData = data.players.find(p => p.id === player.id);
          if (updatedData) {
            return {
              ...player,
              ...updatedData,
              // 保留其他复杂数据并更新 company
              company: updatedData.company ?? player.company,
              assets: updatedData.assets ?? player.assets,
              goods: updatedData.goods ?? player.goods,
              workState: updatedData.workState ?? player.workState,
              housingStatus: updatedData.housingStatus ?? player.housingStatus,
              housingTier: updatedData.housingTier ?? player.housingTier,
            };
          }
          return player;
        });
        
        return {
          ...prev,
          currentRound: data.round,
          roundCompletedPlayers: [],  // 重置完成状态
          players: updatedPlayers,
          market: data.market,
          currentNews: data.event,
        };
      });
      if (data.event) {
        setters.showRoundEndEvent({
          event: data.event,
          completedRound: data.completedRound,
          newRound: data.round,
        });
      }
      break;
    }

    case 'game:action_result': {
      const result = payload as { success: boolean; gameState?: GameState; error?: string };
      console.log('Received action result:', result.success, result.error);
      if (result.success && result.gameState) {
        console.log('Updating gameState');
        setters.setGameState(result.gameState);
      } else if (!result.success) {
        console.log('Action failed:', result.error);
        setters.setError(result.error || '操作失败');
      }
      break;
    }

    case 'room:error':
    case 'error': {
      const err = payload as { message?: string };
      setters.setError(err.message || '发生错误');
      break;
    }

    case 'room:list_result': {
      // 可以用于显示房间列表
      break;
    }
  }
}

// ==================== Provider ====================

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<RoomPlayerInfo[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roundEndEvent, setRoundEndEvent] = useState<RoundEndEvent | null>(null);
  
  const wsRef = useRef<ReturnType<typeof createWsConnection> | null>(null);
  const sendQueueRef = useRef<WsMessage[]>([]);
  const currentRoomRef = useRef<RoomState | null>(null);
  const currentGameStateRef = useRef<GameState | null>(null);
  const shownNewsKeysRef = useRef<Set<string>>(new Set());

  // 保持 ref 同步
  useEffect(() => {
    currentRoomRef.current = room;
    currentGameStateRef.current = gameState;
  }, [room, gameState]);

  // 计算是否已完成本轮操作
  const hasCompletedRound = gameState != null && 
    playerId !== null && 
    Array.isArray(gameState.roundCompletedPlayers) && 
    gameState.roundCompletedPlayers.includes(playerId);

  // 计算是否轮到自己操作（统一轮次模式下，只要未完成即可操作）
  const isMyTurn = gameState != null && 
    playerId !== null && 
    !hasCompletedRound;

  const showRoundEndEventOnce = useCallback((event: RoundEndEvent) => {
    const key = getRoundNewsKey(event.event, event.newRound);
    if (shownNewsKeysRef.current.has(key)) return;
    shownNewsKeysRef.current.add(key);
    setRoundEndEvent(event);
  }, []);

  // 初始化 WebSocket 连接
  useEffect(() => {
    const deviceId = getDeviceId();
    
    wsRef.current = createWsConnection({
      path: `/ws/game?deviceId=${deviceId}`,
      onOpen: () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setIsConnecting(false);
        
        // 发送队列中的消息
        while (sendQueueRef.current.length > 0) {
          const msg = sendQueueRef.current.shift();
          if (msg) wsRef.current?.send(msg);
        }
      },
      onClose: () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
      },
      onError: () => {
        setError('连接失败，请刷新页面重试');
        setIsConnecting(false);
      },
      onMessage: (msg: WsMessage) => {
        // 特殊处理轮次结束事件
        if (msg.type === 'game:round_end') {
          const data = msg.payload as RoundEndMessagePayload;
          showRoundEndEventOnce({
            event: data.event,
            completedRound: data.completedRound,
            newRound: data.round,
          });
          // 同时更新游戏状态
          setGameState((prev: GameState | null) => {
            if (!prev) return prev;
            return {
              ...prev,
              currentRound: data.round,
              roundCompletedPlayers: [],
              market: data.market,
              currentNews: data.event,
              players: data.players.map((p, index) => {
                const existingPlayer = prev.players.find(ep => ep.id === p.id);
                return existingPlayer ? { ...existingPlayer, ...p } : prev.players[index];
              }),
            };
          });
          return;
        }
        
        processMessage(msg, {
          setRoom,
          setPlayerId,
          setPlayers,
          setGameState,
          setCurrentPlayerId,
          showRoundEndEvent: showRoundEndEventOnce,
          setError,
        }, currentRoomRef.current, currentGameStateRef.current);
      },
    });

    return () => {
      wsRef.current?.close();
    };
  }, [showRoundEndEventOnce]);

  // 发送消息（支持队列）
  const sendMessage = useCallback((msg: WsMessage) => {
    if (wsRef.current?.isConnected()) {
      wsRef.current.send(msg);
    } else {
      sendQueueRef.current.push(msg);
    }
  }, []);

  // 创建房间
  const createRoom = useCallback((playerName: string, maxPlayers: number = 10, gameMode: GameMode = 'professional') => {
    const deviceId = getDeviceId();
    setError(null);
    sendMessage({
      type: 'room:create',
      payload: { playerName, deviceId, maxPlayers, gameMode },
    });
  }, [sendMessage]);

  // 加入房间
  const joinRoom = useCallback((roomId: string, playerName: string) => {
    const deviceId = getDeviceId();
    setError(null);
    sendMessage({
      type: 'room:join',
      payload: { roomId: roomId.toUpperCase(), playerName, deviceId },
    });
  }, [sendMessage]);

  // 离开房间
  const leaveRoom = useCallback(() => {
    sendMessage({ type: 'room:leave', payload: {} });
  }, [sendMessage]);

  const dissolveRoom = useCallback(() => {
    sendMessage({ type: 'room:dissolve', payload: {} });
  }, [sendMessage]);

  const transferHost = useCallback((targetPlayerId: string) => {
    if (!room || !playerId) return;
    sendMessage({
      type: 'room:transfer_host',
      payload: { roomId: room.id, playerId, targetPlayerId },
    });
  }, [room, playerId, sendMessage]);

  const updateRoomSettings = useCallback((settings: { allowMidGameJoin?: boolean }) => {
    if (!room || !playerId) return;
    sendMessage({
      type: 'room:update_settings',
      payload: { roomId: room.id, playerId, ...settings },
    });
  }, [room, playerId, sendMessage]);

  // 设置职业
  const setProfession = useCallback((profession: PlayerProfession) => {
    if (!room || !playerId) return;
    sendMessage({
      type: 'room:player_update',
      payload: { roomId: room.id, playerId, profession },
    });
  }, [room, playerId, sendMessage]);

  // 设置准备状态
  const setReady = useCallback((ready: boolean) => {
    if (!room || !playerId) return;
    sendMessage({
      type: 'room:player_update',
      payload: { roomId: room.id, playerId, isReady: ready },
    });
  }, [room, playerId, sendMessage]);

  // 开始游戏
  const startGame = useCallback(() => {
    sendMessage({ type: 'game:start', payload: {} });
  }, [sendMessage]);

  // 发送游戏动作
  const sendAction = useCallback((action: { type: string; payload: Record<string, unknown> }) => {
    console.log('Sending action:', action.type, action.payload);
    sendMessage({
      type: 'game:action',
      payload: { action },
    });
  }, [sendMessage]);

  // 清除错误
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // 关闭轮次结束弹窗
  const dismissRoundEndEvent = useCallback(() => {
    setRoundEndEvent(null);
  }, []);

  const value: RoomContextType = {
    isConnected,
    isConnecting,
    room,
    playerId,
    players,
    currentPlayerId,
    gameState,
    isMyTurn,
    hasCompletedRound,
    roundEndEvent,
    createRoom,
    joinRoom,
    leaveRoom,
    dissolveRoom,
    transferHost,
    updateRoomSettings,
    setProfession,
    setReady,
    startGame,
    sendAction,
    dismissRoundEndEvent,
    error,
    clearError,
  };

  return (
    <RoomContext.Provider value={value}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
}
