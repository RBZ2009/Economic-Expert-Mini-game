'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CYCLE_NAMES,
  formatCurrency,
  formatPercent,
  GameState,
  GoodType,
  IndustryType,
  Player,
} from '@/types/game';

type Tone = 'default' | 'good' | 'warn' | 'bad';

const industryNames: Record<IndustryType, string> = {
  food: '食品',
  daily_necessities: '日用品',
  entertainment: '娱乐',
  luxury: '奢侈品',
  public_service: '公共服务',
  finance: '金融',
};

const productionGoods: GoodType[] = ['food', 'daily_necessities', 'entertainment', 'luxury'];

function toneClass(tone: Tone): string {
  if (tone === 'good') return 'text-green-700 dark:text-green-400';
  if (tone === 'warn') return 'text-amber-700 dark:text-amber-400';
  if (tone === 'bad') return 'text-red-700 dark:text-red-400';
  return 'text-foreground';
}

function getSupplyChainPressure(gameState: GameState) {
  const layers = gameState.market.supplyChain.layers;
  return [
    { name: '基础原料', value: layers.basicMaterials.priceIndex, shortage: layers.basicMaterials.shortage },
    { name: '中间品', value: layers.intermediateGoods.priceIndex, shortage: layers.intermediateGoods.shortage },
    { name: '包装物流', value: layers.packagingLogistics.priceIndex, shortage: layers.packagingLogistics.shortage },
    { name: '能源', value: layers.energy.priceIndex, shortage: layers.energy.shortage },
  ].sort((a, b) => (b.value + b.shortage * 80) - (a.value + a.shortage * 80));
}

function getMostMovedGood(gameState: GameState) {
  return productionGoods
    .map(goodType => {
      const good = gameState.market.goods[goodType];
      const anchor = gameState.market.priceAnchors[goodType];
      const ratio = good.currentPrice / Math.max(1, good.basePrice);
      const pressure = (anchor.shortageIndex - anchor.inventoryPressure) * 100;
      return { goodType, name: good.name, ratio, pressure };
    })
    .sort((a, b) => Math.abs(b.ratio - 1) + Math.abs(b.pressure) / 100 - (Math.abs(a.ratio - 1) + Math.abs(a.pressure) / 100))[0];
}

function explainGovernment(player?: Player): string {
  const gov = player?.govAbilities;
  if (!gov) return '场上没有政府官员，政策环境主要由 NPC 背景经济维持。';
  const weak = [
    { label: '居民支持', value: gov.residentSupport ?? 60 },
    { label: '企业支持', value: gov.enterpriseSupport ?? 60 },
    { label: '财政健康', value: gov.fiscalHealth ?? 60 },
    { label: '社会稳定', value: gov.stabilitySupport ?? 60 },
    { label: '通胀满意度', value: gov.inflationSatisfaction ?? 60 },
  ].sort((a, b) => a.value - b.value)[0];
  const strong = [
    { label: '居民支持', value: gov.residentSupport ?? 60 },
    { label: '企业支持', value: gov.enterpriseSupport ?? 60 },
    { label: '财政健康', value: gov.fiscalHealth ?? 60 },
    { label: '社会稳定', value: gov.stabilitySupport ?? 60 },
    { label: '通胀满意度', value: gov.inflationSatisfaction ?? 60 },
  ].sort((a, b) => b.value - a.value)[0];
  return `${strong.label}较强支撑当前支持率，${weak.label}是主要拖累；支持率会继续影响决策权和下台风险。`;
}

function explainNpcCompetition(gameState: GameState): string {
  const active = gameState.market.npcFirms.filter(firm => firm.status !== 'exited');
  const expanding = active.filter(firm => firm.status === 'expanding');
  const stressed = active.filter(firm => firm.status === 'distressed' || firm.status === 'shrinking');
  const leader = [...active].sort((a, b) => (b.marketShare ?? 0) - (a.marketShare ?? 0))[0];
  const leaderText = leader
    ? `${industryNames[leader.industry]} NPC 企业份额较高，优势来自品牌、质量、交付和成本控制。`
    : 'NPC 企业当前竞争强度较低。';
  return `${leaderText}${expanding.length > 0 ? ` ${expanding.length} 家 NPC 正在扩张。` : ''}${stressed.length > 0 ? ` ${stressed.length} 家 NPC 承压或收缩。` : ''}`;
}

export function EconomyCausalPanel({ gameState }: { gameState: GameState }) {
  const { market } = gameState;
  const strongestLayer = getSupplyChainPressure(gameState)[0];
  const movedGood = getMostMovedGood(gameState);
  const government = gameState.players.find(player => player.profession === 'government' && player.govAbilities);
  const creditTightness = (market.creditConditions.householdCreditTightness + market.creditConditions.businessCreditTightness) / 2;
  const lowIncome = market.households.find(household => household.id === 'low_income');
  const middleIncome = market.households.find(household => household.id === 'middle_income');
  const highIncome = market.households.find(household => household.id === 'high_income');
  const cycle = CYCLE_NAMES[market.economicCycle];
  const tradeTone: Tone = market.externalSector.tradeBalance >= 80 ? 'good' : market.externalSector.tradeBalance < -80 ? 'warn' : 'default';
  const creditTone: Tone = creditTightness > 0.55 ? 'bad' : creditTightness > 0.38 ? 'warn' : 'good';
  const supplyTone: Tone = strongestLayer.value > 125 || strongestLayer.shortage > 0.28 ? 'bad' : strongestLayer.value > 108 ? 'warn' : 'good';

  const causalLines = [
    `${strongestLayer.name}价格指数 ${Math.round(strongestLayer.value)}，缺口 ${formatPercent(strongestLayer.shortage, 0)}%，会先推高上游投入，再通过行业投入结构进入企业成本。`,
    `${movedGood.name}当前价格为基础价的 ${movedGood.ratio.toFixed(2)} 倍，${movedGood.pressure >= 0 ? '短缺压力' : '库存压力'}正在影响终端价格。`,
    `外需指数 ${Math.round(market.externalSector.exportDemandIndex)}、进口成本 ${Math.round(market.externalSector.importCostIndex)}、物流压力 ${market.externalSector.logisticsStress.toFixed(2)}，共同影响出口订单、原料成本和交付速度。`,
    `居民信贷紧缩 ${formatPercent(market.creditConditions.householdCreditTightness, 0)}%，企业信贷紧缩 ${formatPercent(market.creditConditions.businessCreditTightness, 0)}%，坏账压力越高，银行越会压低审批率并提高风险溢价。`,
  ];

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <span className="shrink-0">🔎</span>
          <span className="truncate">经济因果链</span>
          <Badge variant="outline" className="ml-auto shrink-0">
            {cycle.icon} {cycle.name}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <MiniMetric label="供应链压力" value={`${strongestLayer.name} ${Math.round(strongestLayer.value)}`} tone={supplyTone} />
          <MiniMetric label="信贷环境" value={`${formatPercent(creditTightness, 0)}%`} tone={creditTone} />
          <MiniMetric label="外贸余额" value={formatCurrency(market.externalSector.tradeBalance)} tone={tradeTone} />
          <MiniMetric label="社会流动" value={`${Math.round(market.macroState.socialMobilityIndex)}/100`} tone={market.macroState.socialMobilityIndex >= 60 ? 'good' : market.macroState.socialMobilityIndex < 42 ? 'warn' : 'default'} />
        </div>

        <div className="space-y-2">
          {causalLines.map(line => (
            <div key={line} className="rounded-md bg-muted/45 p-2 text-xs leading-relaxed text-muted-foreground">
              {line}
            </div>
          ))}
        </div>

        <div className="rounded-md border p-2">
          <div className="mb-2 text-xs font-medium">家庭分层与消费</div>
          <SegmentRow label="低收入" share={lowIncome?.populationShare ?? 0} confidence={lowIncome?.confidence ?? 0} />
          <SegmentRow label="中收入" share={middleIncome?.populationShare ?? 0} confidence={middleIncome?.confidence ?? 0} />
          <SegmentRow label="高收入" share={highIncome?.populationShare ?? 0} confidence={highIncome?.confidence ?? 0} />
        </div>

        <div className="rounded-md border p-2 text-xs leading-relaxed text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">政府反馈</div>
          {explainGovernment(government)}
        </div>

        <div className="rounded-md border p-2 text-xs leading-relaxed text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">企业竞争</div>
          {explainNpcCompetition(gameState)}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: React.ReactNode; tone: Tone }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/25 px-2 py-1.5">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className={`truncate text-sm font-semibold ${toneClass(tone)}`}>{value}</div>
    </div>
  );
}

function SegmentRow({ label, share, confidence }: { label: string; share: number; confidence: number }) {
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)_42px] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Progress value={share * 100} className="h-1.5" />
      <span className="text-right text-muted-foreground">{Math.round(confidence)}</span>
    </div>
  );
}
