'use client';

import React from 'react';
import { useGame } from '@/contexts/GameContext';
import { CurrentPlayerBanner, PlayerOrderDisplay } from './CurrentPlayerBanner';
import { MarketStats, PlayerStats, AllPlayersOverview, Leaderboard } from './StatsPanels';
import { PlayerActions } from './PlayerActions';
import { EconomyCausalPanel } from './EconomyCausalPanel';
import { GameWorkbench } from './workbench';
import {
  TradeConfirmationModal,
  EventModal,
  NewsModal,
  SettlementModal,
  TutorialPromptModal,
  GameOverModal,
  TurnEndConfirmationModal,
} from './Modals';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/types/game';

export function GamePage() {
  const { state } = useGame();

  if (state.phase === 'setup') {
    return null;
  }

  return (
    <>
      <GameWorkbench
        top={(
          <div className="space-y-3">
            <CurrentPlayerBanner />
            <PlayerOrderDisplay />
          </div>
        )}
        left={(
          <>
            <PlayerStats />
            <MarketStats />
          </>
        )}
        main={<PlayerActions />}
        right={(
          <>
            <EconomyCausalPanel gameState={state} />
            <AllPlayersOverview />
            <Leaderboard />
            <GameLog />
          </>
        )}
        bottom={<MarketPrices />}
      />

      {/* 全局弹窗 */}
      <NewsModal />
      <TutorialPromptModal />
      <TradeConfirmationModal />
      <TurnEndConfirmationModal />
      <EventModal />
      <SettlementModal />
      <GameOverModal />
    </>
  );
}

function GameLog() {
  const { state } = useGame();
  const logs = [...state.gameLog].reverse().slice(0, 20);

  return (
    <Card className="p-4">
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
        <span>📜</span> 游戏日志
      </h3>
      <ScrollArea className="h-[300px]">
        <div className="space-y-2">
          {logs.map(log => (
            <div
              key={log.id}
              className={`text-sm p-2 rounded ${
                log.type === 'event' ? 'bg-orange-100 dark:bg-orange-950/30' :
                log.type === 'trade' ? 'bg-blue-100 dark:bg-blue-950/30' :
                'bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  第{log.round}轮
                </span>
                <span className="text-xs">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-1">{log.message}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}

function MarketPrices() {
  const { state } = useGame();
  const { goods } = state.market;

  return (
    <Card className="p-4">
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
        <span>📊</span> 市场行情
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {Object.values(goods).map(good => {
          const priceChange = good.priceHistory.length >= 2
            ? ((good.currentPrice - good.priceHistory[good.priceHistory.length - 2]) / good.priceHistory[good.priceHistory.length - 2])
            : 0;
          
          return (
            <div
              key={good.id}
              className="min-w-0 p-3 border rounded-lg text-center hover:bg-muted/50 transition-colors"
            >
              <div className="mb-1 text-2xl leading-none">{good.icon}</div>
              <div className="truncate text-xs text-muted-foreground">{good.name}</div>
              <div className="truncate font-bold">¥{formatCurrency(good.currentPrice)}</div>
              {priceChange !== 0 && (
                <Badge 
                  variant={priceChange > 0 ? "destructive" : "default"}
                  className="text-xs mt-1"
                >
                  {priceChange > 0 ? '↑' : '↓'} {formatPercent(Math.abs(priceChange), 1)}%
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
