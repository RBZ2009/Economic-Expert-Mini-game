'use client';

import React, { useState } from 'react';
import { useRoom } from '@/contexts/RoomContext';
import { PlayerProfession, PROFESSION_CONFIGS, PLAYER_COLORS } from '@/types/game';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';

const ALL_PROFESSIONS: PlayerProfession[] = ['worker', 'entrepreneur', 'investor', 'government'];

export function LobbyPage() {
  const { 
    room, 
    playerId, 
    players, 
    currentPlayerId, 
    setProfession, 
    setReady, 
    startGame, 
    leaveRoom,
    error,
    clearError,
  } = useRoom();

  const [copied, setCopied] = useState(false);

  if (!room) return null;

  const isHost = room.hostId === playerId;
  const currentPlayer = players.find(p => p.id === playerId);
  const myProfession = currentPlayer?.profession;
  const amReady = currentPlayer?.isReady || false;

  // 检查是否所有玩家都准备好了
  const allReady = players.length >= 2 && players.every(p => p.profession && p.isReady);
  
  // 所有玩家都选择了职业即可开始
  const canStartGame = allReady;

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(room.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = room.id;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleProfessionSelect = (profession: PlayerProfession) => {
    setProfession(profession);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* 房间信息 */}
        <Card className="border-2 border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>🏠</span> 游戏房间
              </span>
              <Badge variant="outline" className="text-lg px-3">
                {room.status === 'waiting' ? '等待中' : '游戏中'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* 房间号 */}
            <div className="bg-muted/50 rounded-lg p-4 mb-4">
              <p className="text-sm text-muted-foreground mb-1">房间号（分享给朋友）</p>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-mono font-bold tracking-widest">{room.id}</span>
                <Button size="sm" variant="outline" onClick={copyRoomCode}>
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <Alert className="border-destructive mb-4">
                <AlertDescription className="text-destructive">
                  {error}
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="ml-2" 
                    onClick={clearError}
                  >
                    关闭
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* 玩家列表 */}
            <div className="space-y-3">
              <h3 className="font-medium flex items-center gap-2">
                <span>👥</span> 玩家列表 ({players.length}/{room.maxPlayers})
              </h3>
              
              {players.map((player, index) => {
                const isMe = player.id === playerId;
                const professionConfig = player.profession 
                  ? PROFESSION_CONFIGS[player.profession as PlayerProfession]
                  : null;

                return (
                  <div
                    key={player.id}
                    className={`
                      flex items-center gap-3 p-3 rounded-lg border
                      ${isMe ? 'bg-primary/10 border-primary' : 'bg-card'}
                    `}
                  >
                    {/* 头像 */}
                    <div 
                      className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white"
                      style={{ backgroundColor: player.color }}
                    >
                      {player.name.charAt(0)}
                    </div>

                    {/* 信息 */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{player.name}</span>
                        {isMe && <Badge className="text-xs">你</Badge>}
                        {player.isHost && <Badge variant="secondary" className="text-xs">房主</Badge>}
                        {!player.isConnected && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            离线
                          </Badge>
                        )}
                      </div>
                      {professionConfig ? (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <span>{professionConfig.icon}</span>
                          <span>{professionConfig.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          等待选择职业...
                        </span>
                      )}
                    </div>

                    {/* 准备状态 */}
                    <div>
                      {player.isReady ? (
                        <Badge className="bg-green-500">已准备</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          等待中
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* 空位提示 */}
              {players.length < room.maxPlayers && (
                <div className="text-center py-3 text-muted-foreground border border-dashed rounded-lg">
                  还有 {room.maxPlayers - players.length} 个空位，等待玩家加入...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 职业选择 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <span>🎭</span> 选择职业
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {isHost 
                ? '你是房主，请选择职业后等待其他玩家选择' 
                : '请选择你的职业，选择后点击准备'}
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              {ALL_PROFESSIONS.map(prof => {
                const config = PROFESSION_CONFIGS[prof];
                const isSelected = myProfession === prof;
                const countSelected = players.filter(p => p.profession === prof).length;

                return (
                  <Button
                    key={prof}
                    variant={isSelected ? 'default' : 'outline'}
                    className="h-auto min-w-0 justify-start whitespace-normal py-3"
                    onClick={() => handleProfessionSelect(prof)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-2xl">{config.icon}</span>
                      <div className="min-w-0 text-left">
                        <div className="truncate font-medium">{config.name}</div>
                        {countSelected > 0 && (
                          <div className="truncate text-xs opacity-70">
                            {countSelected}人选择
                          </div>
                        )}
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>

            {/* 推荐职业配比提示 */}
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium mb-2">推荐职业配比</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>👷 员工：基础职业</div>
                <div>🏢 企业家：经营生产</div>
                <div>📈 投资者：金融投资</div>
                <div>🏛️ 政府：政策调控</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 操作按钮 */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3">
              {/* 准备/取消准备 */}
              <Button
                size="lg"
                variant={amReady ? 'destructive' : 'default'}
                disabled={!myProfession}
                onClick={() => setReady(!amReady)}
              >
                {amReady ? '取消准备' : '准备就绪'}
              </Button>

              {/* 房主开始游戏 */}
              {isHost && (
                <Button
                  size="lg"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={!canStartGame}
                  onClick={startGame}
                >
                  开始游戏
                </Button>
              )}

              {/* 离开房间 */}
              <Button
                variant="outline"
                onClick={leaveRoom}
              >
                离开房间
              </Button>
            </div>

            {/* 提示 */}
            {!canStartGame && (
              <p className="text-sm text-muted-foreground text-center mt-4">
                {players.length < 2 
                  ? '需要至少 2 名玩家才能开始' 
                  : '所有玩家必须选择职业并准备后才能开始'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
