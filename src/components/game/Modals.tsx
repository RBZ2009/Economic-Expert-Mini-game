'use client';

import React from 'react';
import { useGame } from '@/contexts/GameContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EventEffectsView } from './EventEffectsView';
export function TradeConfirmationModal() {
  const { state, dispatch, getPlayerById } = useGame();
  const { pendingTrade } = state;

  if (!pendingTrade) return null;

  const fromPlayer = getPlayerById(pendingTrade.fromPlayerId);
  const toPlayer = getPlayerById(pendingTrade.toPlayerId);
  const toPlayerAfterCash = (toPlayer?.cash || 0) + (pendingTrade.offeredCash || 0) - (pendingTrade.requestedCash || 0);

  const handleAccept = () => {
    dispatch({ type: 'RESPOND_TRADE', payload: { tradeId: pendingTrade.id, accepted: true } });
  };

  const handleReject = () => {
    dispatch({ type: 'RESPOND_TRADE', payload: { tradeId: pendingTrade.id, accepted: false } });
  };

  const getTradeTypeLabel = () => {
    switch (pendingTrade.type) {
      case 'goods_for_goods': return '物品交换物品';
      case 'goods_for_cash': return '物品换现金';
      case 'cash_for_goods': return '现金购物';
      case 'cash_transfer': return '现金转账';
      default: return '交易请求';
    }
  };

  return (
    <Dialog open={state.phase === 'trade_pending'} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">🤝</span>
            收到 {getTradeTypeLabel()} 请求
          </DialogTitle>
          <DialogDescription>
            有玩家向您发起了交易请求
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* 交易双方 */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">发送方</span>
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: fromPlayer?.color }}
                />
                <span className="font-medium">{fromPlayer?.name}</span>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="text-2xl">👇</div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">接收方（您）</span>
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: toPlayer?.color }}
                />
                <span className="font-medium">{toPlayer?.name}</span>
              </div>
            </div>

            <div className="border-t pt-3 mt-3 space-y-2">
              {/* 发送方提供 */}
              {(pendingTrade.offeredItems?.length || 0) > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">发送方提供：</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {pendingTrade.offeredItems?.map((item, i) => (
                      <Badge key={i} variant="secondary">
                        {item.quantity}x {item.goodType}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {(pendingTrade.offeredCash ?? 0) > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">发送方提供：</span>
                  <span className="font-bold text-green-600 ml-1">
                    ¥{pendingTrade.offeredCash!.toLocaleString()}
                  </span>
                </div>
              )}

              {/* 请求换回 */}
              {(pendingTrade.requestedItems?.length || 0) > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">请求换回：</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {pendingTrade.requestedItems?.map((item, i) => (
                      <Badge key={i} variant="outline">
                        {item.quantity}x {item.goodType}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {(pendingTrade.requestedCash ?? 0) > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">请求换回：</span>
                  <span className="font-bold text-red-600 ml-1">
                    ¥{pendingTrade.requestedCash!.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* 影响预览 */}
            <div className="bg-green-50 dark:bg-green-950/30 rounded p-3 mt-3">
              <div className="text-sm font-medium text-green-700 dark:text-green-400">
                接受后您的现金将变为
              </div>
              <div className="text-xl font-bold text-green-600 dark:text-green-500">
                ¥{toPlayerAfterCash.toLocaleString()}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleReject}
            className="w-full"
          >
            ❌ 拒绝
          </Button>
          <Button
            onClick={handleAccept}
            className="w-full"
          >
            ✅ 接受
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EventModal() {
  const { state, dispatch } = useGame();
  const { recentEvent } = state;

  if (!recentEvent) return null;

  const handleDismiss = () => {
    dispatch({ type: 'DISMISS_EVENT' });
  };

  const getEventEmoji = () => {
    switch (recentEvent.type) {
      case 'economic_crisis': return '📉';
      case 'tech_breakthrough': return '🚀';
      case 'natural_disaster': return '🌪️';
      case 'policy_change': return '📜';
      case 'market_boom': return '📈';
      case 'inflation_surge': return '💹';
      default: return '⚡';
    }
  };

  const getEventColor = () => {
    const hasNegative = recentEvent.effects.inflation !== undefined && recentEvent.effects.inflation > 0;
    const hasPositive = recentEvent.effects.socialStability !== undefined && recentEvent.effects.socialStability > 0;
    
    if (hasNegative && !hasPositive) return 'border-red-500 bg-red-50 dark:bg-red-950/30';
    if (hasPositive && !hasNegative) return 'border-green-500 bg-green-50 dark:bg-green-950/30';
    return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30';
  };

  return (
    <Dialog open={state.phase === 'event'} onOpenChange={() => {}}>
      <DialogContent className={`sm:max-w-md border-2 ${getEventColor()}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-2xl">
            <span className="text-4xl animate-bounce">{getEventEmoji()}</span>
            {recentEvent.name}
          </DialogTitle>
          <DialogDescription className="text-base">
            随机事件发生！
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-center text-lg mb-4">
            {recentEvent.description}
          </p>

          {recentEvent.duration && (
            <p className="text-center text-sm text-muted-foreground mb-4">
              预计持续 {recentEvent.duration} 轮，剩余 {recentEvent.remainingDuration ?? recentEvent.duration} 轮
            </p>
          )}

          {recentEvent.warning && (
            <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {recentEvent.warning}
            </div>
          )}

          <EventEffectsView effects={recentEvent.effects} />
        </div>

        <DialogFooter>
          <Button onClick={handleDismiss} className="w-full">
            了解，继续游戏
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewsModal() {
  const { state, dispatch } = useGame();
  const news = state.currentNews;

  if (state.phase !== 'news' || !news) return null;

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg border-2 border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-2xl">
            <span className="text-4xl">{news.icon ?? '📰'}</span>
            第 {state.currentRound} 轮新闻播报
          </DialogTitle>
          <DialogDescription className="text-base font-medium">
            {news.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-lg">{news.description}</p>
          {news.story && (
            <div className="rounded-lg bg-white/70 p-3 text-sm text-sky-950 dark:bg-black/20 dark:text-sky-100">
              {news.story}
            </div>
          )}
          {news.explanation && (
            <div className="rounded-lg border border-sky-200 bg-sky-100/70 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-100">
              <div className="font-medium mb-1">经济逻辑</div>
              {news.explanation}
            </div>
          )}
          <EventEffectsView effects={news.effects} title="新闻影响" />
          {news.warning && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {news.warning}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => dispatch({ type: 'DISMISS_NEWS' })} className="w-full">
            开始本轮操作
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TutorialPromptModal() {
  const { state, dispatch } = useGame();
  const prompt = state.tutorialPrompt;

  if (!prompt) return null;

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className={`sm:max-w-md border-2 ${prompt.severity === 'warning' ? 'border-amber-400 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{prompt.severity === 'warning' ? '⚠️' : '💡'}</span>
            {prompt.title}
          </DialogTitle>
          <DialogDescription>{prompt.body}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {prompt.tips.map((tip, index) => (
            <div key={index} className="rounded bg-white/70 p-2 text-sm dark:bg-black/20">
              {tip}
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => dispatch({ type: 'CANCEL_END_TURN' })} className="w-full">
            返回补充操作
          </Button>
          <Button onClick={() => dispatch({ type: 'DISMISS_TUTORIAL' })} className="w-full">
            明白，继续结束回合
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export function SettlementModal() {
  const { state, dispatch } = useGame();

  if (state.phase !== 'settlement') return null;

  const handleContinue = () => {
    dispatch({ type: 'SETTLE_ROUND' });
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">📋</span>
            第 {state.currentRound} 轮结束
          </DialogTitle>
          <DialogDescription>
            即将进入下一轮结算
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <h4 className="font-medium">回合结算项目：</h4>
          <ul className="text-sm space-y-2 text-muted-foreground">
            <li>✓ 必需品消耗（食品、日用品等）</li>
            <li>✓ 投资收益计算</li>
            <li>✓ 租金收入发放</li>
            <li>✓ 疲劳恢复</li>
            <li>✓ 市场价格调整</li>
            <li>✓ 股票市场波动</li>
          </ul>
        </div>

        <DialogFooter>
          <Button onClick={handleContinue} className="w-full">
            开始第 {state.currentRound + 1} 轮
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 回合结束确认弹窗
export function TurnEndConfirmationModal() {
  const { state, dispatch, getCurrentPlayer } = useGame();
  const currentPlayer = getCurrentPlayer();
  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const nextPlayer = state.players[nextPlayerIndex];
  const isLastPlayer = nextPlayerIndex === 0;

  if (state.phase !== 'confirm_turn_end') return null;

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">⏭️</span>
            确认结束回合
          </DialogTitle>
          <DialogDescription>
            {currentPlayer?.name}，你确定要结束本轮操作吗？
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg mb-4">
            <div className="text-sm text-muted-foreground mb-2">本轮回顾</div>
            <div className="text-lg font-medium">
              已工作 {currentPlayer?.workState.workCount} 次
            </div>
            <div className="text-sm text-muted-foreground">
              现金：¥{currentPlayer?.cash.toLocaleString()}
            </div>
          </div>

          <div className="text-center p-4 bg-muted/50 rounded-lg">
            {isLastPlayer ? (
              <>
                <div className="text-lg font-medium mb-2">
                  这是本轮最后一位玩家
                </div>
                <div className="text-sm text-muted-foreground">
                  点击确认后将进入第 {state.currentRound + 1} 轮结算
                </div>
                <div className="mt-2 text-xs text-orange-500">
                  结算将包括：必需品消耗、投资收益、租金、房价调整等
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-medium mb-2">
                  即将轮到
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white"
                    style={{ backgroundColor: nextPlayer?.color }}
                  >
                    {nextPlayer?.name.charAt(0)}
                  </div>
                  <span className="text-xl font-bold">{nextPlayer?.name}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => dispatch({ type: 'CANCEL_END_TURN' })}
            className="w-full"
          >
            返回继续操作
          </Button>
          <Button
            onClick={() => dispatch({ type: 'CONFIRM_END_TURN' })}
            className="w-full"
          >
            {isLastPlayer ? '进入结算' : `确认切换到 ${nextPlayer?.name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GameOverModal() {
  const { state } = useGame();

  if (state.phase !== 'game_over') return null;

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <span className="text-4xl">🏆</span>
            游戏结束！
          </DialogTitle>
          <DialogDescription>
            恭喜完成 {state.currentRound} 轮经济模拟
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {state.winner && (
            <div className="text-center mb-6">
              <div 
                className="inline-flex items-center justify-center w-20 h-20 rounded-full text-4xl font-bold text-white mb-3"
                style={{ backgroundColor: state.winner.color }}
              >
                {state.winner.name.charAt(0)}
              </div>
              <h3 className="text-2xl font-bold">{state.winner.name}</h3>
              <p className="text-muted-foreground">获得最终胜利！</p>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="font-medium">最终排名</h4>
            <div className="space-y-2">
              {state.players
                .sort((a, b) => {
                  const scoreA = a.cash * 0.3 + a.happiness * 0.4 + a.socialStatus * 0.3;
                  const scoreB = b.cash * 0.3 + b.happiness * 0.4 + b.socialStatus * 0.3;
                  return scoreB - scoreA;
                })
                .map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      index === 0 ? 'bg-yellow-100 dark:bg-yellow-950/30 border border-yellow-400' : 'bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`font-bold ${index === 0 ? 'text-2xl' : 'text-lg'}`}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                      </span>
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                        style={{ backgroundColor: player.color }}
                      >
                        {player.name.charAt(0)}
                      </div>
                      <span className="font-medium">{player.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">¥{player.cash.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">
                        幸福度: {player.happiness} | 健康: {player.health}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => window.location.reload()} className="w-full">
            重新开始游戏
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
