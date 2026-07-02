'use client';

import React, { useState } from 'react';
import { useRoom } from '@/contexts/RoomContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { GameMode } from '@/types/game';

export function HomePage() {
  const { createRoom, joinRoom, isConnected, error, clearError } = useRoom();
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [gameMode, setGameMode] = useState<GameMode>('simple');

  const handleCreateRoom = () => {
    if (!playerName.trim()) return;
    clearError();
    createRoom(playerName.trim(), maxPlayers, gameMode);
  };

  const handleJoinRoom = () => {
    if (!playerName.trim() || !roomCode.trim()) return;
    clearError();
    joinRoom(roomCode.trim(), playerName.trim());
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background p-4 md:p-8">
      <div className="max-w-md mx-auto space-y-6">
        {/* 标题 */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            经济模拟游戏
          </h1>
          <p className="text-muted-foreground">
            多终端模式 - 每人一部手机/电脑
          </p>
        </div>

        {/* 连接状态 */}
        {!isConnected && (
          <Alert className="border-orange-500">
            <AlertDescription className="text-orange-600">
              正在连接服务器...
            </AlertDescription>
          </Alert>
        )}

        {/* 错误提示 */}
        {error && (
          <Alert className="border-destructive">
            <AlertDescription className="text-destructive">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* 首页选项 */}
        {mode === 'home' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">选择操作</CardTitle>
              <CardDescription className="text-center">
                创建新房间或加入已有房间
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label htmlFor="playerName">你的名字</Label>
                <Input
                  id="playerName"
                  placeholder="请输入名字"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <Button 
                  size="lg" 
                  onClick={() => setMode('create')}
                  disabled={!playerName.trim() || !isConnected}
                >
                  <span className="mr-2">🏠</span>
                  创建房间
                </Button>
                <Button 
                  size="lg" 
                  variant="outline"
                  onClick={() => setMode('join')}
                  disabled={!playerName.trim() || !isConnected}
                >
                  <span className="mr-2">🚪</span>
                  加入房间
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 创建房间 */}
        {mode === 'create' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>🏠</span> 创建房间
              </CardTitle>
              <CardDescription>
                设置房间信息，创建后可邀请朋友加入
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>房间人数</Label>
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMaxPlayers(Math.max(2, maxPlayers - 1))}
                  >
                    -
                  </Button>
                  <span className="text-2xl font-bold w-12 text-center">{maxPlayers}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMaxPlayers(Math.min(10, maxPlayers + 1))}
                  >
                    +
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  建议 2-6 人游戏最佳
                </p>
              </div>

              <div className="space-y-2">
                <Label>游玩模式</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={gameMode === 'simple' ? 'default' : 'outline'}
                    onClick={() => setGameMode('simple')}
                  >
                    简单
                  </Button>
                  <Button
                    type="button"
                    variant={gameMode === 'professional' ? 'default' : 'outline'}
                    onClick={() => setGameMode('professional')}
                  >
                    专业
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  简单模式提示更多、操作更少；专业模式更拟真。
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setMode('home')}>
                  返回
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleCreateRoom}
                  disabled={!playerName.trim()}
                >
                  创建房间
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 加入房间 */}
        {mode === 'join' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>🚪</span> 加入房间
              </CardTitle>
              <CardDescription>
                输入房间号加入游戏
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="roomCode">房间号</Label>
                <Input
                  id="roomCode"
                  placeholder="输入 6 位房间号"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="text-center text-xl font-mono tracking-widest"
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setMode('home')}>
                  返回
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleJoinRoom}
                  disabled={!playerName.trim() || roomCode.length !== 6}
                >
                  加入房间
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 游戏说明 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">游戏说明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <span>1.</span>
              <p>每名玩家使用自己的手机或电脑，通过房间号加入同一游戏</p>
            </div>
            <div className="flex items-start gap-2">
              <span>2.</span>
              <p>每轮可自由进行操作，完成后点击结束本轮等待结算</p>
            </div>
            <div className="flex items-start gap-2">
              <span>3.</span>
              <p>每个玩家选择不同职业：员工、企业家、投资者、政府官员</p>
            </div>
            <div className="flex items-start gap-2">
              <span>4.</span>
              <p>通过工作、投资、交易等方式积累财富</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
