'use client';

import React, { useState } from 'react';
import { GameProvider } from '@/contexts/GameContext';
import { RoomProvider, useRoom } from '@/contexts/RoomContext';
import { HomePage } from '@/components/room/HomePage';
import { LobbyPage } from '@/components/room/LobbyPage';
import { MultiplayerGamePage } from '@/components/room/MultiplayerGamePage';
import { SetupPage } from '@/components/game/SetupPage';
import { GamePage } from '@/components/game/GamePage';
import { useGame } from '@/contexts/GameContext';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// 多终端模式主内容
function MultiplayerContent() {
  const { room, gameState } = useRoom();

  // 没有房间 - 显示首页
  if (!room) {
    return <HomePage />;
  }

  // 有房间但游戏未开始 - 显示等待大厅
  if (room.status === 'waiting') {
    return <LobbyPage />;
  }

  // 游戏进行中 - 显示游戏页面
  if (gameState) {
    return <MultiplayerGamePage />;
  }

  return <HomePage />;
}

// 单终端模式主内容（保留原有功能）
function SinglePlayerContent() {
  const { state } = useGame();
  
  if (state.phase === 'setup') {
    return <SetupPage />;
  }
  
  return <GamePage />;
}

// 主页面
function GameContent() {
  const [mode, setMode] = useState<'multi' | 'single'>('multi');

  return (
    <div className="min-h-screen bg-background">
      {/* 模式切换标签 */}
      <div className="mx-auto flex max-w-[1600px] justify-end px-3 pt-3 md:px-4 xl:px-5">
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'multi' | 'single')}>
          <TabsList className="shadow-sm">
            <TabsTrigger value="multi">多终端</TabsTrigger>
            <TabsTrigger value="single">单终端</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* 内容 */}
      {mode === 'multi' ? (
        <MultiplayerContent />
      ) : (
        <SinglePlayerContent />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <GameProvider>
      <RoomProvider>
        <GameContent />
      </RoomProvider>
    </GameProvider>
  );
}
