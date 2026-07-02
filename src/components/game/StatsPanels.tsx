'use client';

import React from 'react';
import { useGame } from '@/contexts/GameContext';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { PROFESSION_CONFIGS, HOUSING_CONFIGS, formatCurrency, formatPercent, formatNumber, CYCLE_NAMES } from '@/types/game';

export function MarketStats() {
  const { state } = useGame();
  const { market } = state;

  return (
    <Card className="p-4">
      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
        <span>📊</span> 市场状况
      </h3>
      
      <div className="space-y-4">
        {/* 社会稳定度 */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="flex items-center gap-1">
              <span>🛡️</span> 社会稳定度
            </span>
            <span className="font-medium">{formatNumber(market.socialStability)}/100</span>
          </div>
          <Progress 
            value={market.socialStability} 
            className="h-2"
          />
        </div>

        {/* 就业率 */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="flex items-center gap-1">
              <span>👷</span> 就业率
            </span>
            <span className="font-medium">{formatPercent(market.employmentRate, 0)}%</span>
          </div>
          <Progress 
            value={market.employmentRate} 
            className="h-2"
          />
        </div>

        {/* 通货膨胀率 */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="flex items-center gap-1">
              <span>📈</span> 通货膨胀率
            </span>
            <span className={`font-medium ${market.inflationRate > 0.05 ? 'text-red-500' : market.inflationRate < 0 ? 'text-green-500' : ''}`}>
              {formatPercent(market.inflationRate, 2)}%
            </span>
          </div>
          <Progress 
            value={Math.min(100, Math.max(0, 50 + market.inflationRate * 500))} 
            className="h-2"
          />
        </div>

        {/* 基尼系数 */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="flex items-center gap-1">
              <span>⚖️</span> 基尼系数 (贫富差距)
            </span>
            <span className="font-medium">{formatPercent(market.giniCoefficient, 2)}</span>
          </div>
          <Progress 
            value={market.giniCoefficient * 100} 
            className="h-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>平等 (0)</span>
            <span>不平等 (1)</span>
          </div>
        </div>

        {/* GDP */}
        <div className="pt-2 border-t">
          <div className="flex justify-between">
            <span className="text-sm">💰 GDP总量</span>
            <span className="font-bold">¥{formatCurrency(market.gdp)}</span>
          </div>
        </div>

        {/* 经济周期 */}
        <div className="pt-2 border-t">
          <div className="flex justify-between items-center">
            <span className="text-sm">🌡️ 经济周期</span>
            <div className="flex items-center gap-1">
              <span>{CYCLE_NAMES[market.economicCycle].icon}</span>
              <span className="font-medium">{CYCLE_NAMES[market.economicCycle].name}</span>
            </div>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>阶段 {market.cyclePhase + 1}/4</span>
          </div>
        </div>

        {/* 全局税率 */}
        <div className="pt-2 border-t">
          <div className="flex justify-between">
            <span className="text-sm">📋 全局税率</span>
            <span className="font-medium">{formatPercent(market.globalTaxRate, 0)}%</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function PlayerStats() {
  const { state, getCurrentPlayer, calculateScore } = useGame();
  const currentPlayer = getCurrentPlayer();

  if (!currentPlayer) return null;

  const score = calculateScore(currentPlayer);

  return (
    <Card className="p-4">
      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
        <span>👤</span> {currentPlayer.name} 的状况
      </h3>
      
      <div className="space-y-4">
        {/* 现金 */}
        <div className="flex justify-between items-center">
          <span className="text-sm">💵 现金</span>
          <span className="text-xl font-bold text-green-600">
            ¥{formatCurrency(currentPlayer.cash)}
          </span>
        </div>

        {/* 综合得分 */}
        <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
          <span className="text-sm">⭐ 综合得分</span>
          <span className="text-2xl font-bold text-primary">{score}</span>
        </div>

        {/* 幸福度 */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>😊 幸福度</span>
            <span>{currentPlayer.happiness}/100</span>
          </div>
          <Progress 
            value={currentPlayer.happiness} 
            className="h-2"
          />
        </div>

        {/* 健康值 */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>❤️ 健康值</span>
            <span>{currentPlayer.health}/100</span>
          </div>
          <Progress 
            value={currentPlayer.health} 
            className="h-2"
          />
        </div>

        {/* 社会地位 */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>🏆 社会地位</span>
            <span>{currentPlayer.socialStatus}/100</span>
          </div>
          <Progress 
            value={currentPlayer.socialStatus} 
            className="h-2"
          />
        </div>

        {/* 永久加成 */}
        {currentPlayer.permanentBonuses.incomeBonus > 0 && (
          <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded-lg">
            <div className="text-sm text-green-700 dark:text-green-400">
              💰 收入加成: +{formatPercent(currentPlayer.permanentBonuses.incomeBonus, 0)}%
            </div>
          </div>
        )}

        {/* 住房状态（新） */}
        <div className="pt-2 border-t">
          <div className="text-sm font-medium mb-2">🏠 住房状态</div>
          <div className="p-2 bg-muted/30 rounded-lg">
            {currentPlayer.housingStatus === 'owned' && currentPlayer.housingTier && (
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{HOUSING_CONFIGS[currentPlayer.housingTier].icon}</span>
                  <span className="font-medium">{HOUSING_CONFIGS[currentPlayer.housingTier].name}</span>
                  <Badge variant="default" className="text-xs">已购</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  永久加成已生效
                </div>
              </div>
            )}
            {currentPlayer.housingStatus === 'renting' && currentPlayer.housingTier && (
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{HOUSING_CONFIGS[currentPlayer.housingTier].icon}</span>
                  <span className="font-medium">{HOUSING_CONFIGS[currentPlayer.housingTier].name}</span>
                  <Badge variant="secondary" className="text-xs">租住中</Badge>
                </div>
                <div className="text-xs text-orange-500 mt-1">
                  月租 ¥{formatCurrency(currentPlayer.currentRent)}（下轮自动扣除）
                </div>
              </div>
            )}
            {currentPlayer.housingStatus === 'none' && (
              <div className="text-orange-500 text-sm">
                ⚠️ 无住房！幸福度将持续下降
              </div>
            )}
          </div>
        </div>

        {/* 消耗品库存（新） */}
        <div className="pt-2 border-t">
          <div className="text-sm font-medium mb-2">📦 消耗品库存</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between items-center">
              <span>🍎 食品</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{currentPlayer.goods.food}</span>
                <span className="text-xs text-muted-foreground">(每轮-2)</span>
                {currentPlayer.goods.food < 2 && (
                  <Badge variant="destructive" className="text-xs">不足</Badge>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span>🧴 日用品</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{currentPlayer.goods.daily_necessities}</span>
                <span className="text-xs text-muted-foreground">(每轮-1)</span>
                {currentPlayer.goods.daily_necessities < 1 && (
                  <Badge variant="destructive" className="text-xs">不足</Badge>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span>🎮 娱乐</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{currentPlayer.goods.entertainment}</span>
                <span className="text-xs text-muted-foreground">(每轮-1)</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            💡 必需品不足会降低健康和幸福度！
          </p>
        </div>

        {/* 资产 */}
        {currentPlayer.assets.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-sm font-medium mb-2">🏢 其他资产</div>
            <div className="space-y-1">
              {currentPlayer.assets.map(asset => (
                <div key={asset.id} className="flex justify-between text-sm">
                  <span>{asset.name}</span>
                  <span className="text-muted-foreground">
                    ¥{formatCurrency(asset.currentValue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export function AllPlayersOverview() {
  const { state } = useGame();

  return (
    <Card className="p-4">
      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
        <span>👥</span> 所有玩家
      </h3>
      
      <div className="space-y-3">
        {state.players.map((player, index) => (
          <div
            key={player.id}
            className={`p-3 rounded-lg border ${
              index === state.currentPlayerIndex 
                ? 'border-primary bg-primary/10' 
                : 'border-border'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ backgroundColor: player.color }}
                >
                  {index + 1}
                </div>
                <div>
                  <div className="font-medium">{player.name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{PROFESSION_CONFIGS[player.profession].icon}</span>
                    <span>{PROFESSION_CONFIGS[player.profession].name}</span>
                    {player.housingStatus !== 'none' && player.housingTier && (
                      <span>{HOUSING_CONFIGS[player.housingTier].icon}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ¥{formatCurrency(player.cash)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-medium ${
                  player.happiness > 60 ? 'text-green-600' : 
                  player.happiness > 30 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  😊 {player.happiness}
                </div>
                {player.hasActedThisRound && (
                  <Badge variant="secondary" className="text-xs">已操作</Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Leaderboard() {
  const { state, calculateScore } = useGame();

  // 计算所有玩家的排名
  const rankings = state.players
    .map(player => ({
      ...player,
      score: calculateScore(player),
      rank: 0,
    }))
    .sort((a, b) => b.score - a.score)
    .map((player, index) => ({
      ...player,
      rank: index + 1,
    }));

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getScoreColor = (score: number, maxScore: number) => {
    const ratio = score / maxScore;
    if (ratio > 0.8) return 'text-green-600';
    if (ratio > 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const maxScore = rankings.length > 0 ? rankings[0].score : 1;

  return (
    <Card className="p-4">
      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
        <span>🏆</span> 总评分排行榜
      </h3>
      
      <div className="space-y-2">
        {rankings.map((player) => (
          <div
            key={player.id}
            className={`p-3 rounded-lg border ${
              player.rank <= 3 ? 'bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-950/30 dark:to-yellow-900/30' : ''
            } ${player.rank === 1 ? 'border-yellow-400' : 'border-border'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-2xl w-10 text-center">
                  {getRankIcon(player.rank)}
                </div>
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ backgroundColor: player.color }}
                >
                  {player.name.charAt(0)}
                </div>
                <div>
                  <div className="font-medium">{player.name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{PROFESSION_CONFIGS[player.profession].icon}</span>
                    <span>{PROFESSION_CONFIGS[player.profession].name}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-xl font-bold ${getScoreColor(player.score, maxScore)}`}>
                  {player.score}
                </div>
                <div className="text-xs text-muted-foreground">
                  分
                </div>
              </div>
            </div>
            
            {/* 详细参数 */}
            <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
              <div className="text-center">
                <div className="text-muted-foreground">现金</div>
                <div className="font-medium">¥{formatCurrency(player.cash)}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground">幸福</div>
                <div className="font-medium">{player.happiness}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground">健康</div>
                <div className="font-medium">{player.health}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground">地位</div>
                <div className="font-medium">{player.socialStatus}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
