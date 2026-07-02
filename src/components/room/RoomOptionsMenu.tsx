'use client';

import { Crown, LogOut, MoreVertical, Trash2, UserPlus, Users } from 'lucide-react';
import { useRoom } from '@/contexts/RoomContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function RoomOptionsMenu() {
  const {
    room,
    playerId,
    players,
    leaveRoom,
    dissolveRoom,
    transferHost,
    updateRoomSettings,
  } = useRoom();

  if (!room || !playerId) return null;

  const isHost = room.hostId === playerId;
  const transferTargets = players.filter(player => player.id !== playerId);

  const handleLeave = () => {
    const message = isHost && players.length > 1
      ? '你是房主，退出后房主会自动转给其他玩家。确定退出房间吗？'
      : '确定退出房间吗？';
    if (window.confirm(message)) {
      leaveRoom();
    }
  };

  const handleDissolve = () => {
    if (window.confirm('确定解散房间吗？所有玩家都会回到首页。')) {
      dissolveRoom();
    }
  };

  return (
    <div className="fixed left-3 top-3 z-50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="outline" className="h-10 w-10 rounded-full bg-background/95 shadow-md backdrop-blur">
            <MoreVertical className="h-5 w-5" />
            <span className="sr-only">房间选项</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>
            房间 {room.id}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isHost && (
            <>
              <DropdownMenuCheckboxItem
                checked={!!room.allowMidGameJoin}
                onCheckedChange={(checked) => updateRoomSettings({ allowMidGameJoin: checked === true })}
              >
                <UserPlus className="h-4 w-4" />
                允许中途加入
              </DropdownMenuCheckboxItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Crown className="h-4 w-4" />
                  转让房主
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  {transferTargets.length > 0 ? (
                    transferTargets.map(player => (
                      <DropdownMenuItem key={player.id} onClick={() => transferHost(player.id)}>
                        <Users className="h-4 w-4" />
                        <span className="truncate">{player.name}</span>
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>
                      没有可转让玩家
                    </DropdownMenuItem>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuItem variant="destructive" onClick={handleDissolve}>
                <Trash2 className="h-4 w-4" />
                解散房间
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem onClick={handleLeave}>
            <LogOut className="h-4 w-4" />
            退出房间
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
