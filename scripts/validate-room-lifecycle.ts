import { createInitialGameState } from '../src/game/initial-state';
import { roomManager } from '../src/lib/room-manager';

function unique(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRoomControlsAndLifecycle(): void {
  const hostDevice = unique('host_device');
  const guestDevice = unique('guest_device');
  const thirdDevice = unique('third_device');
  const lateDevice = unique('late_device');
  const result = roomManager.createRoom({
    playerName: '房主',
    deviceId: hostDevice,
    maxPlayers: 4,
    gameMode: 'professional',
  });
  const roomId = result.room.id;

  try {
    const guestJoin = roomManager.joinRoom({
      roomId,
      playerName: '玩家二',
      deviceId: guestDevice,
    });
    assert(guestJoin.success && guestJoin.playerId, '等待房间内第二名玩家应能加入');

    const guestId = guestJoin.playerId;
    const transfer = roomManager.transferHost(hostDevice, guestId);
    assert(transfer.success && transfer.room, '房主应能转让房主');
    assert(transfer.room.hostId === guestId, '转让后 hostId 应为目标玩家');
    assert(transfer.room.players.find(player => player.id === guestId)?.isHost, '目标玩家应带 isHost 标记');
    assert(!transfer.room.players.find(player => player.id === result.playerId)?.isHost, '原房主不应继续保留 isHost');

    const nonHostSetting = roomManager.updateRoomSettings(hostDevice, { allowMidGameJoin: true });
    assert(!nonHostSetting.success, '非房主不应能修改允许中途加入设置');

    const allowJoin = roomManager.updateRoomSettings(guestDevice, { allowMidGameJoin: true });
    assert(allowJoin.success && allowJoin.room?.allowMidGameJoin, '新房主应能开启中途加入');

    const room = roomManager.getRoom(roomId);
    assert(room, '测试房间应存在');
    room.status = 'playing';
    room.gameState = createInitialGameState(room.players.map(player => ({
      id: player.id,
      name: player.name,
      color: player.color,
      profession: player.profession ?? 'worker',
    })), room.gameMode);

    const lateJoin = roomManager.joinRoom({
      roomId,
      playerName: '中途加入',
      deviceId: lateDevice,
    });
    assert(lateJoin.success && lateJoin.playerId, '开启中途加入后，游戏中房间应允许新玩家加入');

    const lateRoom = roomManager.getRoom(roomId);
    assert(lateRoom?.players.some(player => player.deviceId === lateDevice), '中途加入玩家应进入房间玩家列表');

    const closeJoinRoom = roomManager.createRoom({
      playerName: '关闭中途加入房主',
      deviceId: thirdDevice,
      maxPlayers: 3,
      gameMode: 'simple',
    }).room;
    try {
      closeJoinRoom.status = 'playing';
      const denied = roomManager.joinRoom({
        roomId: closeJoinRoom.id,
        playerName: '被拒玩家',
        deviceId: unique('denied_device'),
      });
      assert(!denied.success, '未开启中途加入的游戏中房间应拒绝新玩家');
    } finally {
      roomManager.deleteRoom(closeJoinRoom.id);
    }

    const leave = roomManager.leaveRoom(hostDevice);
    assert(leave.success, '玩家应能主动退出房间');
    assert(!roomManager.getRoom(roomId)?.players.some(player => player.deviceId === hostDevice), '退出后玩家应从房间移除');

    const dissolve = roomManager.dissolveRoom(guestDevice);
    assert(dissolve.success, '房主应能解散房间');
    assert(!roomManager.getRoom(roomId), '解散后房间应被删除');
  } finally {
    roomManager.deleteRoom(roomId);
  }
}

function assertRoomExpiry(): void {
  const expired = roomManager.createRoom({
    playerName: '过期房主',
    deviceId: unique('expired_device'),
    maxPlayers: 2,
    gameMode: 'professional',
  }).room;

  expired.createdAt = Date.now() - 13 * 60 * 60 * 1000;
  const deleted = roomManager.cleanupExpiredRooms(Date.now());
  assert(deleted.includes(expired.id), '创建超过 12 小时的房间应被自动清理');
  assert(!roomManager.getRoom(expired.id), '过期清理后房间不应继续存在');
}

assertRoomControlsAndLifecycle();
assertRoomExpiry();

console.log('Room lifecycle passed: leave, host transfer, dissolve, mid-game join settings, and 12-hour expiry all behave correctly.');
