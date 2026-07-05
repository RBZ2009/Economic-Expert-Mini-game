'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatCurrency, GameState, Player } from '@/types/game';

const dimensions = [
  { key: 'residentSupport', label: '居民支持', explanation: '受收入、就业、必需品价格和居民信贷影响。' },
  { key: 'enterpriseSupport', label: '企业支持', explanation: '受税负、信贷、成本冲击和外需影响。' },
  { key: 'fiscalHealth', label: '财政健康', explanation: '受税收、政策支出、补贴和坏账压力影响。' },
  { key: 'stabilitySupport', label: '社会稳定', explanation: '受幸福度、失业、贫富差距和社会稳定度影响。' },
  { key: 'inflationSatisfaction', label: '通胀满意度', explanation: '通胀接近温和区间时较高，过高或通缩都会拖累。' },
] as const;

function getValue(player: Player, key: typeof dimensions[number]['key']): number {
  return Math.round(player.govAbilities?.[key] ?? 60);
}

function getTone(value: number): string {
  if (value >= 70) return 'text-green-700 dark:text-green-400';
  if (value < 40) return 'text-red-700 dark:text-red-400';
  if (value < 55) return 'text-amber-700 dark:text-amber-400';
  return 'text-foreground';
}

export function GovernmentFeedbackPanel({ government, gameState }: { government: Player; gameState: GameState }) {
  const gov = government.govAbilities;
  if (!gov) return null;

  const sorted = [...dimensions].sort((a, b) => getValue(government, a.key) - getValue(government, b.key));
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];
  const approval = Math.round(gov.approvalRating);
  const budgetSpace = Math.round(gov.budgetSpace ?? 60);
  const executionEfficiency = Math.round(gov.executionEfficiency ?? 60);
  const removalRisk = Math.round(gov.removalRisk ?? Math.max(0, 70 - approval));
  const risk = approval < 25
    ? '下台风险很高'
    : approval < 40
      ? '政策空间正在收缩'
      : approval >= 72
        ? '政策授权较强'
        : '政策授权稳定';

  return (
    <Card className="rounded-lg border p-3">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <span className="shrink-0">🏛️</span>
        <h4 className="min-w-0 truncate text-sm font-semibold">政府反馈与政策空间</h4>
        <Badge variant={approval < 35 ? 'destructive' : 'outline'} className="ml-auto shrink-0 text-xs">
          {risk}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <div className="font-semibold">{approval}</div>
          <div className="text-muted-foreground">综合支持</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <div className="font-semibold">{Math.round(gov.decisionPower)}</div>
          <div className="text-muted-foreground">决策权</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <div className="font-semibold">¥{formatCurrency(gov.treasuryBalance)}</div>
          <div className="text-muted-foreground">国库</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <div className={`font-semibold ${getTone(budgetSpace)}`}>{budgetSpace}</div>
          <div className="text-muted-foreground">预算空间</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <div className={`font-semibold ${getTone(executionEfficiency)}`}>{executionEfficiency}</div>
          <div className="text-muted-foreground">执行效率</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <div className={removalRisk >= 70 ? 'font-semibold text-red-700 dark:text-red-400' : 'font-semibold'}>
            {removalRisk}
          </div>
          <div className="text-muted-foreground">下台风险</div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {dimensions.map(dimension => {
          const value = getValue(government, dimension.key);
          return (
            <div key={dimension.key} className="rounded-md border p-2">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-medium">{dimension.label}</span>
                <span className={`font-semibold ${getTone(value)}`}>{value}/100</span>
              </div>
              <Progress value={value} className="h-1.5" />
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{dimension.explanation}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded-md bg-muted/40 p-2 text-xs leading-relaxed text-muted-foreground">
        当前最强支撑是 <span className="font-medium text-foreground">{strongest.label}</span>，
        最大拖累是 <span className="font-medium text-foreground">{weakest.label}</span>。
        本轮税收 ¥{formatCurrency(gameState.market.monthlyTaxRevenue ?? 0)}，
        财政健康和支持率会继续影响预算空间、政策执行效率和下台风险。
      </div>
    </Card>
  );
}
