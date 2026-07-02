'use client';

import React from 'react';
import { useGame } from '@/contexts/GameContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PROFESSION_CONFIGS } from '@/types/game';

export function CurrentPlayerBanner() {
  const { state, getCurrentPlayer } = useGame();
  const currentPlayer = getCurrentPlayer();

  if (!currentPlayer || state.phase === 'setup') {
    return null;
  }

  const profession = PROFESSION_CONFIGS[currentPlayer.profession];

  // 获取身份属性标签
  const attributeLabels: Record<string, { label: string; icon: string }> = {
    consumer: { label: '消费者', icon: '🛒' },
    investor: { label: '投资者', icon: '📈' },
    landlord: { label: '房东', icon: '🏠' },
  };

  return (
    <Card className="p-4 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-2">
      <div className="flex items-center justify-between gap-4">
        {/* 当前玩家标识 */}
        <div className="flex items-center gap-4">
          <div 
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg border-4 border-white"
            style={{ backgroundColor: currentPlayer.color }}
          >
            {currentPlayer.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{currentPlayer.name}</span>
              <Badge variant="outline" className="text-lg px-3 py-1 animate-pulse bg-primary text-primary-foreground">
                第 {state.currentPlayerIndex + 1} 位
              </Badge>
            </div>
            <div className="flex gap-1 mt-1">
              {/* 职业标签 */}
              <Badge variant="secondary" className="text-sm">
                {profession.icon} {profession.name}
              </Badge>
              {/* 身份属性标签 */}
              {currentPlayer.attributes.map(attr => (
                <Badge key={attr} variant="outline" className="text-sm">
                  {attributeLabels[attr]?.icon} {attributeLabels[attr]?.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* 回合信息 */}
        <div className="text-right">
          <div className="text-3xl font-bold text-primary">
            第 {state.currentRound} 轮
          </div>
          <div className="text-sm text-muted-foreground">
            回合 {state.currentRound} · 玩家 {state.currentPlayerIndex + 1}/{state.players.length}
          </div>
        </div>
      </div>

      {/* 操作提示 */}
      <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
        <p className="text-center font-medium">
          <span className="text-primary">{currentPlayer.name}</span> 请进行你的操作
        </p>
      </div>
    </Card>
  );
}

export function PlayerOrderDisplay() {
  const { state } = useGame();

  if (state.phase === 'setup' || state.players.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 justify-center mt-2">
      {state.players.map((player, index) => (
        <div
          key={player.id}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all
            ${index === state.currentPlayerIndex 
              ? 'ring-2 ring-primary ring-offset-2 scale-110' 
              : player.hasActedThisRound 
                ? 'opacity-50' 
                : ''
            }
          `}
          style={{ 
            backgroundColor: player.color + '20',
            borderColor: player.color,
            borderWidth: '1px'
          }}
        >
          <div 
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs text-white font-bold"
            style={{ backgroundColor: player.color }}
          >
            {index + 1}
          </div>
          <span>{player.name}</span>
          <span className="text-xs opacity-70">
            {PROFESSION_CONFIGS[player.profession].name}
          </span>
          {player.hasActedThisRound && <span className="text-xs">(已操作)</span>}
        </div>
      ))}
    </div>
  );
}
