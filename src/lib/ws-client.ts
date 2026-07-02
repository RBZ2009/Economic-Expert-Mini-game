// ============================================================
// WebSocket 客户端工具 - 多终端经济模拟游戏
// ============================================================

export interface WsMessage<T = unknown> {
  type: string;
  payload: T;
}

export interface WsOptions {
  path: string;
  onMessage: (msg: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  heartbeatMs?: number;
}

export function createWsConnection(opts: WsOptions): { 
  send: (msg: WsMessage) => void; 
  close: () => void;
  isConnected: () => boolean;
} {
  const { path, onMessage, onOpen, onClose, onError, reconnect = true, heartbeatMs = 30000 } = opts;
  let ws: WebSocket;
  let heartbeatTimer: ReturnType<typeof setInterval>;
  let closed = false;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000;

  function getReconnectDelay(): number {
    return Math.min(baseReconnectDelay * Math.pow(2, reconnectAttempts), 30000);
  }

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    try {
      ws = new WebSocket(`${protocol}//${host}${path}`);
    } catch (error) {
      console.error('WebSocket connection error:', error);
      onError?.(new Event('connection_error'));
      return;
    }

    ws.onopen = () => {
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', payload: null }));
        }
      }, heartbeatMs);
      
      reconnectAttempts = 0;
      onOpen?.();
    };

    ws.onmessage = (e) => {
      try {
        const msg: WsMessage = JSON.parse(e.data);
        if (msg.type === 'pong') return;
        onMessage(msg);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      clearInterval(heartbeatTimer);
      onClose?.();
      
      if (reconnect && !closed) {
        reconnectAttempts++;
        if (reconnectAttempts <= maxReconnectAttempts) {
          const delay = getReconnectDelay();
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
          setTimeout(connect, delay);
        } else {
          console.error('Max reconnection attempts reached');
        }
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      onError?.(error);
    };
  }

  connect();

  return {
    send: (msg: WsMessage) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        console.warn('WebSocket not connected, message not sent:', msg.type);
      }
    },
    close: () => {
      closed = true;
      if (ws) {
        ws.close();
      }
    },
    isConnected: () => ws && ws.readyState === WebSocket.OPEN,
  };
}

// ------------------- 游戏专用消息类型 -------------------

export type GameMessageType =
  // 房间消息
  | 'room:create'
  | 'room:create_result'
  | 'room:join'
  | 'room:join_result'
  | 'room:leave'
  | 'room:state'
  | 'room:player_update'
  | 'room:player_list'
  | 'room:error'
  | 'room:list'
  | 'room:list_result'
  | 'room:join_as_spectator'
  
  // 游戏消息
  | 'game:start'
  | 'game:start_result'
  | 'game:state'
  | 'game:action'
  | 'game:action_result'
  | 'game:turn_change'
  | 'game:event'
  | 'game:your_turn'
  | 'game:round_end'
  
  // 确认消息
  | 'ping'
  | 'pong';

export interface RoomState {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  players: RoomPlayerInfo[];
  maxPlayers: number;
  hostId: string;
  gameMode?: 'simple' | 'professional';
}

export interface RoomPlayerInfo {
  id: string;
  name: string;
  profession?: string;
  isReady: boolean;
  isHost: boolean;
  color: string;
  isConnected: boolean;
}

export interface GameStateMessage {
  room: RoomState;
  gameState?: unknown;
  currentPlayerId?: string;
}

// 创建房间
export interface CreateRoomPayload {
  playerName: string;
  deviceId: string;
  maxPlayers?: number;
  gameMode?: 'simple' | 'professional';
}

// 加入房间
export interface JoinRoomPayload {
  roomId: string;
  playerName: string;
  deviceId: string;
}

// 玩家更新（职业/准备状态）
export interface PlayerUpdatePayload {
  roomId: string;
  playerId: string;
  profession?: string;
  isReady?: boolean;
}

// 游戏操作
export interface GameActionPayload {
  roomId: string;
  playerId: string;
  action: {
    type: string;
    payload: Record<string, unknown>;
  };
}

// 操作结果
export interface ActionResultPayload {
  success: boolean;
  error?: string;
  gameState?: unknown;
}
