'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ECONOMY_BALANCE,
  formatPercent,
  GameState,
  INVESTMENT_CONFIGS,
  InvestmentType,
} from '@/types/game';

const investmentTypes: InvestmentType[] = ['stock', 'bond', 'gold', 'deposit'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreToTone(score: number): 'default' | 'good' | 'warn' | 'bad' {
  if (score >= 68) return 'good';
  if (score < 38) return 'bad';
  if (score < 50) return 'warn';
  return 'default';
}

function toneClass(tone: 'default' | 'good' | 'warn' | 'bad'): string {
  if (tone === 'good') return 'text-green-700 dark:text-green-400';
  if (tone === 'warn') return 'text-amber-700 dark:text-amber-400';
  if (tone === 'bad') return 'text-red-700 dark:text-red-400';
  return 'text-foreground';
}

function getAssetSignal(gameState: GameState, type: InvestmentType) {
  const { market } = gameState;
  const bankRate = market.bank?.centralBankRate ?? ECONOMY_BALANCE.bank.baseRate;
  const defaultRisk = market.creditConditions.defaultRate;
  const riskAppetite = clamp((market.macroState.businessConfidence + market.macroState.consumerConfidence) / 200, 0.25, 1.05);
  const profitExpectation = clamp(
    market.macroState.businessConfidence / 100
    + market.macroState.externalDemandIndex / 180
    - market.inventoryPressure.daily_necessities * 0.12
    - market.creditConditions.businessCreditTightness * 0.22,
    0.25,
    1.35,
  );
  const discountPressure = clamp((bankRate - ECONOMY_BALANCE.bank.baseRate) * 18 + (market.creditConditions.riskPremium ?? 0) * 7, -0.25, 0.55);
  const inflationExpectation = market.macroState.inflationExpectation;
  const safeHavenDemand = clamp(
    defaultRisk * 3
    + market.creditConditions.householdCreditTightness * 0.5
    + (market.economicCycle === 'downturn' || market.economicCycle === 'contraction' ? 0.18 : 0),
    0,
    1,
  );

  if (type === 'stock') {
    const score = clamp(48 + profitExpectation * 25 + riskAppetite * 16 - discountPressure * 45 - defaultRisk * 120, 5, 95);
    return {
      score,
      drivers: [
        `盈利预期 ${Math.round(profitExpectation * 100)}`,
        `风险偏好 ${Math.round(riskAppetite * 100)}`,
        `折现压力 ${Math.round(discountPressure * 100)}`,
      ],
      explanation: '股票主要看企业盈利预期、风险偏好和宏观折现率；利率与坏账压力上升会压低估值。',
    };
  }

  if (type === 'bond') {
    const rateSupport = clamp((bankRate + (market.creditConditions.riskPremium ?? 0)) * 600, 0, 34);
    const score = clamp(52 + rateSupport + (1 - riskAppetite) * 10 - defaultRisk * 150, 5, 92);
    return {
      score,
      drivers: [
        `利率支撑 ${formatPercent(bankRate, 2)}%`,
        `违约风险 ${formatPercent(defaultRisk, 1)}%`,
        `避险需求 ${Math.round((1 - riskAppetite) * 100)}`,
      ],
      explanation: '债券受利率和信用风险共同影响；利率提高增加票息吸引力，但违约预期会伤害债券。',
    };
  }

  if (type === 'gold') {
    const score = clamp(44 + Math.max(0, inflationExpectation) * 420 + safeHavenDemand * 32 - riskAppetite * 10, 5, 95);
    return {
      score,
      drivers: [
        `通胀预期 ${formatPercent(inflationExpectation, 1)}%`,
        `避险需求 ${Math.round(safeHavenDemand * 100)}`,
        `风险偏好 ${Math.round(riskAppetite * 100)}`,
      ],
      explanation: '黄金更像避险和抗通胀资产；通胀预期、信用紧张和衰退风险上升时更受支持。',
    };
  }

  const depositRate = market.bank?.depositRate ?? Math.max(0, ECONOMY_BALANCE.bank.baseRate + ECONOMY_BALANCE.bank.depositRateSpread);
  const opportunityCost = clamp(riskAppetite * 0.18 + Math.max(0, market.inflationRate) * 1.5, 0, 0.5);
  const score = clamp(58 + depositRate * 900 - opportunityCost * 55 + market.creditConditions.householdCreditTightness * 10, 8, 90);
  return {
    score,
    drivers: [
      `存款利率 ${formatPercent(depositRate, 2)}%`,
      `通胀侵蚀 ${formatPercent(market.inflationRate, 1)}%`,
      `机会成本 ${Math.round(opportunityCost * 100)}`,
    ],
    explanation: '存款和政策利率联动，安全但会被通胀和其他资产的机会成本侵蚀。',
  };
}

export function AssetPricingPanel({ gameState, selectedType }: { gameState: GameState; selectedType?: InvestmentType }) {
  return (
    <Card className="rounded-lg border p-3">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <span className="shrink-0">🧮</span>
        <h4 className="min-w-0 truncate text-sm font-semibold">资产定价逻辑</h4>
        <Badge variant="outline" className="ml-auto shrink-0 text-xs">金融市场</Badge>
      </div>
      <div className="space-y-2">
        {investmentTypes.map(type => {
          const config = INVESTMENT_CONFIGS[type];
          const signal = getAssetSignal(gameState, type);
          const tone = scoreToTone(signal.score);
          const active = selectedType === type;
          return (
            <div key={type} className={`rounded-md border p-2 ${active ? 'border-primary bg-primary/5' : 'bg-muted/25'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-xs font-medium">
                  {config.icon} {config.name}
                </div>
                <div className={`shrink-0 text-xs font-semibold ${toneClass(tone)}`}>{Math.round(signal.score)}/100</div>
              </div>
              <Progress value={signal.score} className="mt-1.5 h-1.5" />
              <div className="mt-1 flex flex-wrap gap-1">
                {signal.drivers.map(driver => (
                  <Badge key={driver} variant="secondary" className="max-w-full truncate text-[10px]">
                    {driver}
                  </Badge>
                ))}
              </div>
              {active && (
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {signal.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
