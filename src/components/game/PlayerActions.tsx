'use client';

import React, { useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GoodType, PROFESSION_CONFIGS, INVESTMENT_CONFIGS, MACHINE_CONFIGS, HousingTier, HOUSING_CONFIGS, InvestmentType, POLICY_CONFIGS, PolicyType, formatCurrency, formatPercent, formatNumber, CYCLE_NAMES, PRODUCTION_CONFIGS, ECONOMY_BALANCE, ProductionGoodType } from '@/types/game';
import { estimateProductSales, findBestSaleOption, getProductInventory, productionGoodTypes } from './company-helpers';
import { ActionSection, ActionWorkspace, MetricStrip, StatusBadge, type ActionAdapter } from './workbench';
import { AssetPricingPanel } from './AssetPricingPanel';
import { GovernmentFeedbackPanel } from './GovernmentFeedbackPanel';
import { getJobOffers, getWorkerCurrentJob, getWorkerEducationLevel, getWorkerExperience, isQualifiedForJob } from '@/game/jobs';
import {
  getCompanyCapacityUnits,
  getEstimatedUnitVariableCost,
  getMaterialPurchaseCost,
  getMaterialUnitPrice,
  getMaxProductionByCapacity,
  getUnitProcessingCost,
} from '@/game/company-economics';

// ==================== 商品效果说明表 ====================
const GOOD_EFFECTS_DISPLAY: Record<GoodType, {
  name: string;
  icon: string;
  effects: { happiness: number; health: number; socialStatus: number; incomeBonus: number };
  consumption: number;
  essential: boolean;
  tips: string;
}> = {
  food: { name: '食品', icon: '🍎', effects: { happiness: 3, health: 5, socialStatus: 0, incomeBonus: 0 }, consumption: 2, essential: true, tips: '每轮自动消耗2单位' },
  daily_necessities: { name: '日用品', icon: '🧴', effects: { happiness: 2, health: 1, socialStatus: 0, incomeBonus: 0 }, consumption: 1, essential: true, tips: '每轮自动消耗1单位' },
  housing: { name: '住房', icon: '🏠', effects: { happiness: 0, health: 0, socialStatus: 0, incomeBonus: 0 }, consumption: 0, essential: true, tips: '租买系统，详见下方' },
  transportation: { name: '交通', icon: '🚗', effects: { happiness: 2, health: 0, socialStatus: 2, incomeBonus: 5 }, consumption: 0, essential: false, tips: '永久提升收入5%' },
  entertainment: { name: '娱乐', icon: '🎮', effects: { happiness: 10, health: 0, socialStatus: 0, incomeBonus: 0 }, consumption: 1, essential: false, tips: '每轮自动消耗1单位' },
  luxury: { name: '奢侈品', icon: '💎', effects: { happiness: 15, health: 0, socialStatus: 20, incomeBonus: 0 }, consumption: 0, essential: false, tips: '大幅提升社会地位' },
  education: { name: '教育', icon: '📚', effects: { happiness: 5, health: 0, socialStatus: 10, incomeBonus: 10 }, consumption: 0, essential: false, tips: '永久提升收入10%和社会地位' },
  healthcare: { name: '医疗', icon: '🏥', effects: { happiness: 5, health: 20, socialStatus: 0, incomeBonus: 0 }, consumption: 0, essential: false, tips: '立即恢复健康值' },
};

export function PlayerActions() {
  const { state, dispatch, getCurrentPlayer, triggerRandomEvent } = useGame();
  const currentPlayer = getCurrentPlayer();

  const handleEndTurn = () => {
    const event = triggerRandomEvent();
    if (!event) {
      dispatch({ type: 'END_TURN' });
    }
  };

  if (!currentPlayer || state.phase === 'setup') {
    return null;
  }

  const profession = PROFESSION_CONFIGS[currentPlayer.profession];
  const workRemaining = profession.maxWorkPerRound - currentPlayer.workState.workCount;
  const isUnemployed = (currentPlayer.workerAbilities?.unemployedRounds ?? 0) > 0;
  const forcedRestRounds = currentPlayer.workState.forcedRestRounds ?? 0;
  const canWork = workRemaining > 0 && !isUnemployed && forcedRestRounds <= 0 && currentPlayer.health >= 25;
  const fatigueWarning = currentPlayer.workState.fatigueLevel > 50;
  const isWorker = currentPlayer.profession === 'worker';
  const isSimpleMode = state.gameMode === 'simple';
  const governmentPlayer = state.players.find(player => player.profession === 'government' && player.govAbilities);
  const defaultOpen = currentPlayer.profession === 'worker' ? ['required', 'market'] : ['profession', 'required'];
  const essentialSummary = `食品 ${currentPlayer.goods.food} / 日用品 ${currentPlayer.goods.daily_necessities} / 健康 ${currentPlayer.health}`;
  const marketSummary = `现金 ¥${formatCurrency(currentPlayer.cash)} / 通胀 ${formatPercent(state.market.inflationRate, 1)}`;
  const assetSummary = `资产 ${currentPlayer.assets.length} / 负债 ¥${formatCurrency((currentPlayer.loans ?? []).reduce((sum, loan) => sum + loan.remaining, 0))}`;
  const professionSummary = `${PROFESSION_CONFIGS[currentPlayer.profession].name}${currentPlayer.company ? ` / 库存 ${currentPlayer.company.inventory}` : ''}`;
  const actionAdapter: ActionAdapter = {
    mode: 'single',
    player: currentPlayer,
    gameState: state,
    isTurnLocked: false,
    send: (type, payload) => dispatch({ type, payload } as never),
    endTurn: handleEndTurn,
  };

  return (
    <ActionWorkspace defaultOpen={defaultOpen}>
      {governmentPlayer && currentPlayer.id !== governmentPlayer.id && currentPlayer.governmentRatings?.[state.currentRound] === undefined && (
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">给政府本轮表现评分</span>
            <span className="text-xs text-muted-foreground">
              声誉 {Math.round(governmentPlayer.govAbilities?.reputation ?? 60)} · 支持率 {Math.round(governmentPlayer.govAbilities?.approvalRating ?? 60)}
            </span>
          </div>
          <div className="flex gap-2">
            {[1, 3, 5].map(score => (
              <Button
                key={score}
                size="sm"
                variant="outline"
                onClick={() => dispatch({ type: 'RATE_GOVERNMENT', payload: { playerId: currentPlayer.id, governmentId: governmentPlayer.id, score } })}
              >
                {score}分
              </Button>
            ))}
          </div>
        </div>
      )}
      
      {isSimpleMode && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
          简单模式会先关注生活必需品、工作收入和基础买卖。复杂的贷款、完整投资组合和部分企业高级操作会简化显示。
        </div>
      )}

      <ActionSection
        value="required"
        icon="✅"
        title="本轮必做"
        summary={essentialSummary}
        badge={fatigueWarning ? <StatusBadge tone="warn">疲劳</StatusBadge> : undefined}
      >
        <MetricStrip
          items={[
            { label: '现金', value: `¥${formatCurrency(currentPlayer.cash)}`, tone: 'good' },
            { label: '幸福', value: `${currentPlayer.happiness}/100` },
            { label: '健康', value: `${currentPlayer.health}/100`, tone: currentPlayer.health < 50 ? 'bad' : 'default' },
            { label: '疲劳', value: `${formatNumber(currentPlayer.workState.fatigueLevel)}/100`, tone: fatigueWarning ? 'warn' : 'default' },
          ]}
        />
        {forcedRestRounds > 0 && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
            健康值过低，当前需要强制休息 {forcedRestRounds} 轮。休息结束后健康会恢复到 30。
          </div>
        )}
        {isWorker && <WorkCard canWork={canWork} fatigueWarning={fatigueWarning} />}
          
        <div className="p-3 border rounded-lg">
          <h4 className="font-medium mb-2">🛒 消费购物</h4>
            <p className="text-sm text-muted-foreground">
              现金: ¥{formatCurrency(currentPlayer.cash)}
            </p>
            <p className="text-xs text-orange-500 mt-1">
              提示: 必需品不足会影响健康和幸福度！
            </p>
        </div>

        <div className="p-3 border rounded-lg">
          <h4 className="font-medium mb-2">❤️ 健康管理</h4>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">健康值: {currentPlayer.health}/100</p>
                {currentPlayer.health < 50 && (
                  <p className="text-xs text-red-500">健康状况不佳！</p>
                )}
                <p className="text-xs text-muted-foreground">每轮会自然恢复一些健康；疲劳过高会反过来伤害健康。</p>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => dispatch({ type: 'BUY_MEDICINE', payload: { playerId: currentPlayer.id } })}
                disabled={currentPlayer.cash < state.market.goods.healthcare.currentPrice}
              >
                购买药品 ¥{formatCurrency(state.market.goods.healthcare.currentPrice)}
              </Button>
            </div>
        </div>

        <HousingPanel />
      </ActionSection>

      <ActionSection value="market" icon="🛒" title="市场交易" summary={marketSummary}>
        <MarketActions />
      </ActionSection>

      {!isSimpleMode && (
        <ActionSection value="assets" icon="📈" title="资产与信贷" summary={assetSummary}>
          <InvestmentPanel />
          <BankPanel />
        </ActionSection>
      )}

      <ActionSection
        value="profession"
        icon={PROFESSION_CONFIGS[currentPlayer.profession].icon}
        title="职业能力"
        summary={professionSummary}
        badge={!isWorker ? <StatusBadge>{PROFESSION_CONFIGS[currentPlayer.profession].name}</StatusBadge> : undefined}
      >
        <SpecialActions />
      </ActionSection>

      {/* 结束回合按钮 */}
      <div className="sticky bottom-2 z-10 mt-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <Button 
          onClick={actionAdapter.endTurn} 
          className="w-full text-lg py-6"
        >
          ✅ 结束本轮操作，轮到下一位
        </Button>
        <p className="text-xs text-center text-muted-foreground mt-2">
          点击后将确认是否结束本轮操作，可能触发随机事件
        </p>
      </div>
    </ActionWorkspace>
  );
}

// ==================== 住房面板 ====================
function HousingPanel() {
  const { dispatch, getCurrentPlayer } = useGame();
  const currentPlayer = getCurrentPlayer();
  const [selectedTier, setSelectedTier] = useState<HousingTier>('standard');
  
  if (!currentPlayer) return null;

  const tiers: HousingTier[] = ['economy', 'standard', 'luxury'];

  return (
    <div className="p-3 border rounded-lg">
      <h4 className="font-medium mb-3">🏠 住房系统</h4>
      
      {/* 当前住房状态 */}
      <div className="mb-3 p-2 bg-muted/30 rounded">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              {currentPlayer.housingStatus === 'owned' && currentPlayer.housingTier && (
                <>🏆 已拥有 {HOUSING_CONFIGS[currentPlayer.housingTier].icon} {HOUSING_CONFIGS[currentPlayer.housingTier].name}</>
              )}
              {currentPlayer.housingStatus === 'renting' && currentPlayer.housingTier && (
                <>🏠 租住中 {HOUSING_CONFIGS[currentPlayer.housingTier].icon} {HOUSING_CONFIGS[currentPlayer.housingTier].name}</>
              )}
              {currentPlayer.housingStatus === 'none' && <span className="text-orange-500">⚠️ 无住房</span>}
            </p>
            {currentPlayer.housingStatus === 'renting' && (
              <p className="text-xs text-muted-foreground">
                月租: ¥{formatCurrency(currentPlayer.currentRent)} (每轮自动扣除)
              </p>
            )}
            {currentPlayer.housingStatus === 'owned' && (
              <p className="text-xs text-green-600">
                已付清，永久享受住房加成
              </p>
            )}
          </div>
          {(currentPlayer.housingStatus === 'renting' || currentPlayer.housingStatus === 'owned') && (
            <Button 
              size="sm" 
              variant="destructive"
              onClick={() => {
                if (currentPlayer.housingStatus === 'owned') {
                  dispatch({ type: 'SELL_HOUSE', payload: { playerId: currentPlayer.id } });
                } else {
                  dispatch({ type: 'CANCEL_RENT', payload: { playerId: currentPlayer.id } });
                }
              }}
            >
              {currentPlayer.housingStatus === 'owned' ? '出售' : '退租'}
            </Button>
          )}
        </div>
      </div>

      {/* 住房档次选择 */}
      <div className="space-y-2">
        {tiers.map(tier => {
          const config = HOUSING_CONFIGS[tier];
          const canAffordRent = currentPlayer.cash >= config.rentPrice;
          const canAffordBuy = currentPlayer.cash >= config.purchasePrice;
          const isSelected = selectedTier === tier;
          const isCurrentTier = currentPlayer.housingTier === tier;
          
          return (
            <div 
              key={tier}
              className={`p-3 border rounded-lg cursor-pointer transition-all ${
                isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'hover:border-gray-400'
              } ${isCurrentTier ? 'ring-2 ring-green-500' : ''}`}
              onClick={() => setSelectedTier(tier)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{config.icon}</span>
                  <span className="font-medium">{config.name}</span>
                  {isCurrentTier && <Badge variant="outline" className="text-xs">当前</Badge>}
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground mb-2">{config.description}</p>
              
              {/* 效果 */}
              <div className="flex flex-wrap gap-1 mb-2">
                {config.effect.happiness > 0 && (
                  <Badge variant="secondary" className="text-xs">幸福+{config.effect.happiness}</Badge>
                )}
                {config.effect.health > 0 && (
                  <Badge variant="secondary" className="text-xs">健康+{config.effect.health}</Badge>
                )}
                {config.effect.socialStatus > 0 && (
                  <Badge variant="secondary" className="text-xs">地位+{config.effect.socialStatus}</Badge>
                )}
                {config.effect.incomeBonus > 0 && (
                  <Badge variant="secondary" className="text-xs">收入+{config.effect.incomeBonus * 100}%</Badge>
                )}
              </div>
              
              {/* 价格 */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex gap-3">
                  <span className="text-orange-600">租: ¥{formatCurrency(config.rentPrice)}/月</span>
                  <span className="text-green-600">买: ¥{formatCurrency(config.purchasePrice)}</span>
                </div>
                {!isCurrentTier && (
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      disabled={!canAffordRent || currentPlayer.housingStatus === 'owned'}
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'RENT_HOUSE', payload: { playerId: currentPlayer.id, tier } });
                      }}
                    >
                      租房
                    </Button>
                    <Button 
                      size="sm" 
                      variant="default"
                      disabled={!canAffordBuy}
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'BUY_HOUSE', payload: { playerId: currentPlayer.id, tier } });
                      }}
                    >
                      买房
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      <p className="text-xs text-muted-foreground mt-2">
        💡 租房每月自动扣租，适合短期居住；买房一次性付清，永久享受加成并可获得租金收入
      </p>
    </div>
  );
}

function BankPanel() {
  const { state, dispatch, getCurrentPlayer } = useGame();
  const currentPlayer = getCurrentPlayer();
  const [loanAmount, setLoanAmount] = useState('10000');
  if (!currentPlayer) return null;

  const amount = parseInt(loanAmount, 10) || 0;
  const bank = state.market.bank;
  const loans = currentPlayer.loans ?? [];
  const totalDebt = loans.reduce((sum, loan) => sum + loan.remaining, 0);
  const loanLabels = {
    consumer: '消费贷',
    mortgage: '抵押贷',
    business: '企业贷',
  };

  return (
    <div className="p-3 border rounded-lg">
      <h4 className="font-medium mb-3">🏦 银行与信贷</h4>
      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div className="bg-muted/50 rounded p-2 text-center">
          <div className="font-bold">{formatPercent(bank?.centralBankRate ?? ECONOMY_BALANCE.bank.baseRate, 2)}%</div>
          <div className="text-muted-foreground">央行月利率</div>
        </div>
        <div className="bg-muted/50 rounded p-2 text-center">
          <div className="font-bold">{currentPlayer.creditScore ?? 70}</div>
          <div className="text-muted-foreground">信用分</div>
        </div>
        <div className="bg-muted/50 rounded p-2 text-center">
          <div className="font-bold">¥{formatCurrency(totalDebt)}</div>
          <div className="text-muted-foreground">负债</div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <CreditMetric label="消费贷审批" value={formatPercent(state.market.creditConditions.consumerApprovalRate ?? 0.62, 0)} tone={(state.market.creditConditions.consumerApprovalRate ?? 0.62) > 0.55 ? 'good' : 'warn'} />
        <CreditMetric label="企业贷审批" value={formatPercent(state.market.creditConditions.businessApprovalRate ?? 0.58, 0)} tone={(state.market.creditConditions.businessApprovalRate ?? 0.58) > 0.5 ? 'good' : 'warn'} />
        <CreditMetric label="房贷审批" value={formatPercent(state.market.creditConditions.mortgageApprovalRate, 0)} tone={state.market.creditConditions.mortgageApprovalRate > 0.55 ? 'good' : 'warn'} />
        <CreditMetric label="抵押折扣" value={formatPercent(state.market.creditConditions.collateralHaircut ?? 0.28, 0)} tone={(state.market.creditConditions.collateralHaircut ?? 0.28) > 0.45 ? 'bad' : 'default'} />
        <CreditMetric label="风险溢价" value={formatPercent(state.market.creditConditions.riskPremium ?? 0.018, 2)} tone={(state.market.creditConditions.riskPremium ?? 0.018) > 0.04 ? 'bad' : 'default'} />
        <CreditMetric label="坏账压力" value={formatPercent(state.market.creditConditions.badDebtPressure ?? 0.12, 0)} tone={(state.market.creditConditions.badDebtPressure ?? 0.12) > 0.45 ? 'bad' : 'default'} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Input value={loanAmount} onChange={(event) => setLoanAmount(event.target.value)} className="w-28" />
        <Button
          size="sm"
          variant="outline"
          disabled={amount < 1000}
          onClick={() => dispatch({ type: 'TAKE_LOAN', payload: { playerId: currentPlayer.id, loanType: 'consumer', amount } })}
        >
          消费贷
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={amount < 1000 || currentPlayer.housingStatus !== 'owned'}
          onClick={() => dispatch({ type: 'TAKE_LOAN', payload: { playerId: currentPlayer.id, loanType: 'mortgage', amount } })}
        >
          抵押贷
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={amount < 1000 || !currentPlayer.company}
          onClick={() => dispatch({ type: 'TAKE_LOAN', payload: { playerId: currentPlayer.id, loanType: 'business', amount } })}
        >
          企业贷
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        消费贷门槛低但利率高；抵押贷需要自住房；企业贷需要已开公司。每月结算会计息，现金不足会伤害信用分。
      </p>

      {loans.length > 0 && (
        <div className="space-y-2">
          {loans.map(loan => (
            <div key={loan.id} className="flex items-center justify-between gap-2 p-2 bg-muted/40 rounded text-xs">
              <span>
                {loanLabels[loan.type]} ¥{formatCurrency(loan.remaining)} / 月息 {formatPercent(loan.monthlyRate, 2)}%
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPlayer.cash <= 0}
                onClick={() => dispatch({ type: 'REPAY_LOAN', payload: { playerId: currentPlayer.id, loanId: loan.id, amount: Math.min(currentPlayer.cash, loan.remaining) } })}
              >
                尽量还款
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 工作卡片组件
function WorkCard({ canWork, fatigueWarning }: { canWork: boolean; fatigueWarning: boolean }) {
  const { state, dispatch, getCurrentPlayer } = useGame();
  const [showJobOffers, setShowJobOffers] = useState(false);
  const currentPlayer = getCurrentPlayer();
  if (!currentPlayer) return null;

  const profession = PROFESSION_CONFIGS[currentPlayer.profession];
  const workerAbility = currentPlayer.workerAbilities;
  const currentJob = currentPlayer.profession === 'worker' ? getWorkerCurrentJob(currentPlayer, state.players, state.market) : null;
  const jobOffers = currentPlayer.profession === 'worker'
    ? getJobOffers(state.players, currentPlayer, state.market.employmentRate, state.market)
    : [];
  const baseIncome = currentJob?.wage ?? workerAbility?.wageLevel ?? profession.baseIncome;
  const afterTax = baseIncome * (1 - state.market.globalTaxRate);
  const isUnemployed = (workerAbility?.unemployedRounds ?? 0) > 0;
  const isMonthlyJob = currentJob?.paymentType === 'monthly';
  const workLimit = currentJob?.paymentType === 'hourly' ? currentJob.maxWorkPerRound : profession.maxWorkPerRound;
  const workRemaining = Math.max(0, workLimit - currentPlayer.workState.workCount);
  const canManualWork = canWork && !isMonthlyJob && workRemaining > 0;
  const forcedRestRounds = currentPlayer.workState.forcedRestRounds ?? 0;

  const penalty = currentPlayer.workState.workCount > 0 ? 
    (1 - currentPlayer.workState.workCount * 0.12).toFixed(1)
    : '1.0';

  return (
    <div className="p-3 border rounded-lg bg-background">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="font-medium flex items-center gap-2">
            <span className="text-2xl">{profession.icon}</span>
            {profession.name}工作
            {fatigueWarning && <Badge variant="destructive" className="text-xs">⚠️ 疲劳</Badge>}
          </h4>
          <div className="text-sm text-muted-foreground mt-1">
            {currentJob && <p>当前岗位: {currentJob.title} / {currentJob.paymentType === 'monthly' ? '月薪' : '时薪'} ¥{formatCurrency(baseIncome)}</p>}
            <p>预计税后: ¥{formatCurrency(afterTax)} (税率: {formatPercent(state.market.globalTaxRate, 0)}%)</p>
            {isMonthlyJob && <p className="text-emerald-600">月薪岗位每轮自动发薪，普通工作不会重复结算；可以选择加班。</p>}
            <p className="text-orange-500">效率: {penalty}x (过度工作会降低效率)</p>
            {workerAbility && (
              <p>技能 {workerAbility.skill} / 学历 {getWorkerEducationLevel(currentPlayer)} / 经验 {getWorkerExperience(currentPlayer)} / 剩余工作 {workRemaining}</p>
            )}
            {isUnemployed && <p className="text-red-500">当前失业，剩余 {workerAbility?.unemployedRounds} 个月，可尝试副业或等待再就业</p>}
            {forcedRestRounds > 0 && <p className="text-red-500">强制休息中，剩余 {forcedRestRounds} 轮</p>}
            {currentPlayer.health < 25 && forcedRestRounds <= 0 && <p className="text-red-500">健康值过低，不能工作</p>}
          </div>
        </div>
        <div className="flex min-w-48 flex-col gap-2">
          <Button 
            onClick={() => dispatch({ type: 'WORK', payload: { playerId: currentPlayer.id } })}
            disabled={!canManualWork}
            variant="default"
          >
            {isMonthlyJob ? '月薪自动发放' : `工作 (${workRemaining} 次可用)`}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!isMonthlyJob}
              onClick={() => dispatch({ type: 'OVERTIME_WORK', payload: { playerId: currentPlayer.id } })}
            >
              加班
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: 'SIDE_JOB', payload: { playerId: currentPlayer.id } })}
            >
              副业
            </Button>
          </div>
        </div>
      </div>
      {currentPlayer.profession === 'worker' && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              className="min-w-28"
              onClick={() => setShowJobOffers(prev => !prev)}
            >
              {showJobOffers ? '收起跳槽' : '跳槽'}
            </Button>
            <span className="text-xs text-muted-foreground">申请成本 ¥{formatCurrency(ECONOMY_BALANCE.worker.jobSwitchCost)}</span>
          </div>
          {showJobOffers && (
            <div className="grid gap-2 xl:grid-cols-2">
              {jobOffers.map(offer => {
                const qualified = isQualifiedForJob(currentPlayer, offer);
                const isCurrent = offer.id === workerAbility?.currentJobId;
                return (
                  <div key={offer.id} className="rounded-md border p-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{offer.title}</div>
                        <div className="text-muted-foreground">{offer.employerName}</div>
                      </div>
                      <Badge variant={qualified ? 'default' : 'secondary'}>{qualified ? '符合' : '未达标'}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                      <span>{offer.paymentType === 'monthly' ? '月薪' : '时薪'} ¥{formatCurrency(offer.wage)}</span>
                      <span>次数 {offer.paymentType === 'hourly' ? `${offer.maxWorkPerRound}/轮` : '自动发薪'}</span>
                      <span>门槛 技能{offer.requiredSkill}/学历{offer.requiredEducation}/经验{offer.requiredExperience}</span>
                      <span>消耗 健康-{offer.healthCost}/幸福-{offer.happinessCost}/疲劳+{offer.fatigueCost}</span>
                      <span>行业 {offer.industry}</span>
                      <span>稳定 {offer.jobSecurity}/福利 {formatPercent(offer.benefits, 0)}%</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{offer.description}</p>
                    <Button
                      size="sm"
                      variant={isCurrent ? 'secondary' : 'outline'}
                      className="mt-2 w-full"
                      disabled={isCurrent || !qualified || currentPlayer.cash < ECONOMY_BALANCE.worker.jobSwitchCost}
                      onClick={() => dispatch({ type: 'SWITCH_JOB', payload: { playerId: currentPlayer.id, jobId: offer.id } })}
                    >
                      {isCurrent ? '当前岗位' : qualified ? '申请岗位' : '门槛不足'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreditMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good'
    ? 'text-green-700 dark:text-green-400'
    : tone === 'warn'
      ? 'text-amber-700 dark:text-amber-400'
      : tone === 'bad'
        ? 'text-red-700 dark:text-red-400'
        : 'text-foreground';
  return (
    <div className="rounded bg-muted/40 p-2 text-center">
      <div className={`font-bold ${color}`}>{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}

// ==================== 市场操作 ====================
function MarketActions() {
  const { state, dispatch, getCurrentPlayer } = useGame();
  const currentPlayer = getCurrentPlayer();
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  
  if (!currentPlayer) return null;

  const handleBuy = (goodType: GoodType) => {
    const quantity = quantities[goodType] || 1;
    dispatch({ type: 'BUY_GOOD', payload: { playerId: currentPlayer.id, goodType, quantity } });
    setQuantities(prev => ({ ...prev, [goodType]: 1 }));
  };

  const handleSell = (goodType: GoodType) => {
    const quantity = quantities[goodType] || 1;
    dispatch({ type: 'SELL_GOOD', payload: { playerId: currentPlayer.id, goodType, quantity } });
    setQuantities(prev => ({ ...prev, [goodType]: 1 }));
  };

  return (
    <div className="space-y-3">
      <div className="p-3 border rounded-lg">
        <h4 className="font-medium mb-2">📦 商品效果一览表</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {Object.entries(GOOD_EFFECTS_DISPLAY).map(([key, info]) => (
            <div key={key} className={`p-2 rounded ${info.essential ? 'bg-orange-50 dark:bg-orange-950/30' : 'bg-muted/30'}`}>
              <div className="flex items-center gap-1 font-medium">
                <span>{info.icon}</span>
                <span>{info.name}</span>
                {info.essential && <Badge variant="outline" className="text-xs ml-1">必</Badge>}
              </div>
              <div className="text-muted-foreground mt-1">
                {info.effects.happiness > 0 && <span>😊+{info.effects.happiness}</span>}
                {info.effects.health > 0 && <span>❤️+{info.effects.health}</span>}
                {info.effects.socialStatus > 0 && <span>⭐+{info.effects.socialStatus}</span>}
                {info.effects.incomeBonus > 0 && <span>💰+{info.effects.incomeBonus}%</span>}
              </div>
              {info.consumption > 0 && (
                <p className="text-orange-500 mt-1">每轮消耗{info.consumption}</p>
              )}
              {info.tips && (
                <p className="text-muted-foreground">{info.tips}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {(['food', 'daily_necessities', 'entertainment'] as GoodType[]).map(goodType => {
        const info = GOOD_EFFECTS_DISPLAY[goodType];
        const good = state.market.goods[goodType];
        const owned = currentPlayer.goods[goodType];
        
        return (
          <div key={goodType} className="p-3 border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{info.icon}</span>
                <span className="font-medium">{info.name}</span>
                {info.essential && <Badge variant="outline" className="text-xs">必需品</Badge>}
              </div>
              <span className="text-sm text-muted-foreground">
                库存: {owned} | 单价: ¥{formatCurrency(good.currentPrice)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{info.tips}</p>
            <div className="flex items-center gap-2">
              <Input 
                type="number" 
                min="1"
                value={quantities[goodType] ?? 1}
                onChange={(e) => setQuantities(prev => ({ ...prev, [goodType]: parseInt(e.target.value) || 1 }))}
                className="w-20"
              />
              <Button 
                size="sm"
                onClick={() => handleBuy(goodType)}
                disabled={currentPlayer.cash < good.currentPrice * (quantities[goodType] || 1)}
              >
                购买 ¥{formatCurrency(good.currentPrice * (quantities[goodType] || 1))}
              </Button>
              <Button 
                size="sm"
                variant="outline"
                onClick={() => handleSell(goodType)}
                disabled={owned < (quantities[goodType] || 1)}
              >
                出售 ¥{formatCurrency(good.currentPrice * 0.85 * (quantities[goodType] || 1))}
              </Button>
            </div>
          </div>
        );
      })}

      {/* 耐用品 */}
      {(['transportation', 'education', 'luxury'] as GoodType[]).map(goodType => {
        const info = GOOD_EFFECTS_DISPLAY[goodType];
        const good = state.market.goods[goodType];
        const owned = currentPlayer.goods[goodType];
        
        return (
          <div key={goodType} className="p-3 border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{info.icon}</span>
                <span className="font-medium">{info.name}</span>
                {owned > 0 && <Badge variant="default" className="text-xs">已拥有</Badge>}
              </div>
              <span className="text-sm text-muted-foreground">
                单价: ¥{formatCurrency(good.currentPrice)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{info.tips}</p>
            <div className="flex items-center gap-2">
              <Button 
                size="sm"
                onClick={() => dispatch({ type: 'BUY_GOOD', payload: { playerId: currentPlayer.id, goodType, quantity: 1 } })}
                disabled={currentPlayer.cash < good.currentPrice || owned > 0}
              >
                购买 ¥{formatCurrency(good.currentPrice)}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==================== 投资面板（修复输入问题）====================
function InvestmentPanel() {
  const { state, dispatch, getCurrentPlayer } = useGame();
  const currentPlayer = getCurrentPlayer();
  const [amount, setAmount] = React.useState('');
  const [selectedType, setSelectedType] = React.useState<InvestmentType>('stock');
  
  if (!currentPlayer) return null;

  const isInvestor = currentPlayer.profession === 'investor';
  const investorAbilities = currentPlayer.investorAbilities;
  const investments = Object.entries(INVESTMENT_CONFIGS) as [InvestmentType, typeof INVESTMENT_CONFIGS.stock][];
  const investmentAmount = parseInt(amount) || 0;
  const transactionFee = Math.round(investmentAmount * ECONOMY_BALANCE.investment.transactionFeeRate);
  const totalInvestmentCost = investmentAmount + transactionFee;

  // 学习费用计算
  const getLearningCost = () => {
    if (!investorAbilities) return 0;
    const skill = investorAbilities.investmentSkill;
    return Math.floor(500 + skill * 5); // 技能越高，学习费用越高
  };

  const learningCost = getLearningCost();
  const learningEffect = investorAbilities ? Math.max(3, 10 - Math.floor(investorAbilities.investmentSkill / 20)) : 0;

  return (
    <div className="space-y-3">
      {/* 经济周期提示 - 投资者可看到详细信息，其他人只能看到基础信息 */}
      {isInvestor ? (
        <div className="p-3 border rounded-lg bg-gradient-to-r from-cyan-50 to-cyan-100 dark:from-cyan-950/30 dark:to-cyan-900/30">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium flex items-center gap-2">
              {CYCLE_NAMES[state.market.economicCycle].icon} 经济周期: {CYCLE_NAMES[state.market.economicCycle].name}
              <Badge variant="outline" className="text-xs bg-cyan-50">投资者可见</Badge>
            </h4>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            {CYCLE_NAMES[state.market.economicCycle].description}
          </p>
          <div className="mt-2 p-2 bg-white/50 dark:bg-black/20 rounded text-xs">
            <div className="font-medium text-blue-600">
              投资者技能加成：+{(investorAbilities?.investmentSkill || 0) / 2}% 收益；技能越高，市场误判概率越低。
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 border rounded-lg bg-muted/30">
          <h4 className="font-medium mb-1 text-muted-foreground">
            {CYCLE_NAMES[state.market.economicCycle].icon} 经济周期: {CYCLE_NAMES[state.market.economicCycle].name}
          </h4>
          <p className="text-xs text-muted-foreground">
            其他玩家无法查看详细经济形势（投资者可查看）
          </p>
        </div>
      )}

      {isInvestor && (
        <AssetPricingPanel gameState={state} selectedType={selectedType} />
      )}

      {/* 投资者学习系统 */}
      {isInvestor && investorAbilities && (
        <div className="p-3 border rounded-lg border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium flex items-center gap-2">
              📚 投资学习
              <Badge variant="outline" className="text-xs bg-blue-50">投资者专属</Badge>
            </h4>
            <div className="text-right">
              <div className="text-lg font-bold text-blue-600">{investorAbilities.investmentSkill}%</div>
              <div className="text-xs text-muted-foreground">投资技能</div>
            </div>
          </div>
          
          <Progress value={investorAbilities.investmentSkill} className="h-2 mb-2" />
          
          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div className="bg-white/50 dark:bg-black/20 rounded p-1.5 text-center">
              <div className="font-medium">{investorAbilities.totalLearningSessions}</div>
              <div className="text-muted-foreground">累计学习</div>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded p-1.5 text-center">
              <div className="font-medium">{investorAbilities.learningPoints}</div>
              <div className="text-muted-foreground">学习点数</div>
            </div>
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <div>
              <span className="text-muted-foreground">学习效果：</span>
              <span className="font-medium text-green-600">+{learningEffect}% 技能</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: 'INVESTMENT_STUDY', payload: { playerId: currentPlayer.id, cost: learningCost } })}
              disabled={currentPlayer.cash < learningCost || investorAbilities.investmentSkill >= 100}
            >
              参加培训 ¥{formatCurrency(learningCost)}
            </Button>
          </div>
          
          {investorAbilities.investmentSkill >= 100 && (
            <p className="text-xs text-center text-green-600 mt-2 font-medium">🎉 已达到最高投资技能等级！</p>
          )}
        </div>
      )}

      <div className="p-3 border rounded-lg">
        <h4 className="font-medium mb-2">💰 持有投资</h4>
        {currentPlayer.assets.filter(a => ['stock', 'bond', 'gold', 'deposit'].includes(a.type)).length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无投资</p>
        ) : (
          <div className="space-y-2">
            {(['stock', 'bond', 'gold', 'deposit'] as InvestmentType[]).map(type => {
              const typeAssets = currentPlayer.assets.filter(a => a.type === type);
              if (typeAssets.length === 0) return null;
              const totalValue = typeAssets.reduce((sum, a) => sum + a.currentValue, 0);
              const totalCost = typeAssets.reduce((sum, a) => sum + a.purchasePrice, 0);
              
              return (
                <div key={type} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                  <div>
                    <span className="font-medium">{INVESTMENT_CONFIGS[type].icon} {INVESTMENT_CONFIGS[type].name}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      总额: ¥{formatCurrency(totalValue)}
                    </span>
                    {totalValue !== totalCost && (
                      <span className={`text-xs ml-2 ${totalValue > totalCost ? 'text-green-500' : 'text-red-500'}`}>
                        {totalValue > totalCost ? '+' : ''}{formatCurrency(totalValue - totalCost)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => dispatch({ type: 'CASH_OUT_ALL_INVESTMENT', payload: { playerId: currentPlayer.id, type } })}
                    >
                      全部变现
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 投资输入（修复：允许清空输入） */}
      <div className="p-3 border rounded-lg">
        <h4 className="font-medium mb-2">📊 新投资</h4>
        <div className="flex items-center gap-2 mb-3">
          <select 
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as InvestmentType)}
            className="border rounded px-2 py-1 text-sm"
          >
            {investments.map(([type, config]) => (
              <option key={type} value={type}>{config.icon} {config.name}</option>
            ))}
          </select>
          <Input 
            type="text"
            placeholder="输入金额"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32"
          />
        </div>
        <div className="flex gap-2">
          {[1000, 5000, 10000].map(val => (
            <Button
              key={val}
              size="sm"
              variant="outline"
              onClick={() => setAmount(val.toString())}
            >
              ¥{val.toLocaleString()}
            </Button>
          ))}
          <Button 
            size="sm"
            onClick={() => {
              if (investmentAmount >= 100) {
                dispatch({ type: 'INVEST', payload: { playerId: currentPlayer.id, investmentType: selectedType, amount: investmentAmount } });
                setAmount('');
              }
            }}
            disabled={investmentAmount < 100 || currentPlayer.cash < totalInvestmentCost}
          >
            投资 ¥{formatCurrency(investmentAmount)}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {INVESTMENT_CONFIGS[selectedType].description} | 手续费约 ¥{formatCurrency(transactionFee)}，盈利变现税率 {formatPercent(ECONOMY_BALANCE.investment.capitalGainsTaxRate, 0)}%
        </p>
        {isInvestor && (
          <p className="text-xs text-blue-600 mt-1">
            投资者技能加成：+{(investorAbilities?.investmentSkill || 0) / 2}% 收益
          </p>
        )}
      </div>
    </div>
  );
}

// ==================== 职业特殊功能 ====================
function SpecialActions() {
  const { getCurrentPlayer } = useGame();
  const currentPlayer = getCurrentPlayer();
  
  if (!currentPlayer) return null;

  const profession = PROFESSION_CONFIGS[currentPlayer.profession];

  return (
    <div className="space-y-3">
      <div className="p-3 border rounded-lg">
        <h4 className="font-medium flex items-center gap-2 mb-2">
          <span className="text-2xl">{profession.icon}</span>
          {profession.name}特殊能力
        </h4>
        <p className="text-sm text-muted-foreground mb-2">{profession.description}</p>
        <div className="text-xs">
          <p className="font-medium">目标：</p>
          <ul className="list-disc list-inside text-muted-foreground">
            {profession.goals.map((goal, i) => (
              <li key={i}>{goal}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* 企业家功能 */}
      {currentPlayer.profession === 'entrepreneur' && currentPlayer.company && (
        <EntrepreneurActions />
      )}

      {/* 政府官员功能 */}
      {currentPlayer.profession === 'government' && (
        <GovernmentActions />
      )}
    </div>
  );
}

// ==================== 企业家功能（增强版）====================
function EntrepreneurActions() {
  const { state, dispatch, getCurrentPlayer } = useGame();
  const currentPlayer = getCurrentPlayer();
  const [activeTab, setActiveTab] = useState('overview');
  const [saleProductType, setSaleProductType] = useState<ProductionGoodType>('daily_necessities');
  
  if (!currentPlayer || !currentPlayer.company) return null;

  const company = currentPlayer.company;
  const productInventory = getProductInventory(company);
  const saleConfig = PRODUCTION_CONFIGS[saleProductType];
  const saleInventory = productInventory[saleProductType] || 0;
  const lockedSalePrice = company.priceDecisions?.[saleProductType]?.round === state.currentRound
    ? company.priceDecisions[saleProductType]?.price
    : undefined;
  const currentSaleRecord = company.salesDecisions?.[saleProductType]?.round === state.currentRound
    ? company.salesDecisions[saleProductType]
    : undefined;
  const hasSoldThisRound = Boolean(currentSaleRecord);
  const effectiveDefaultSalePrice = lockedSalePrice ?? saleConfig.baseSellingPrice;
  const pricingScenarios = Array.from(new Set([
    saleConfig.minSellingPrice,
    saleConfig.baseSellingPrice,
    Math.round((saleConfig.minSellingPrice + saleConfig.maxSellingPrice) / 2),
    saleConfig.maxSellingPrice,
    ...(lockedSalePrice !== undefined ? [lockedSalePrice] : []),
  ])).sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      {/* 企业总览 */}
      <div className="p-3 border rounded-lg bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30">
        <h4 className="font-medium mb-2">🏢 {company.name}</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between">
            <span>员工:</span>
            <span className="font-medium">{company.employees}人</span>
          </div>
          <div className="flex justify-between">
            <span>机器:</span>
            <span className="font-medium">{company.machines}台</span>
          </div>
          <div className="flex justify-between">
            <span>产能:</span>
            <span className="font-medium">{company.productionCapacity}</span>
          </div>
          <div className="flex justify-between">
            <span>产品质量:</span>
            <span className="font-medium">{formatPercent(company.productQuality, 0)}%</span>
          </div>
          <div className="flex justify-between">
            <span>行业:</span>
            <span className="font-medium">{PRODUCTION_CONFIGS[company.productionType].name}</span>
          </div>
          <div className="flex justify-between">
            <span>市场参考价:</span>
            <span className="font-medium">¥{formatCurrency(state.market.priceAnchors[company.productionType].referencePrice)}</span>
          </div>
          <div className="flex justify-between">
            <span>库存压力:</span>
            <span className="font-medium">{formatPercent(state.market.inventoryPressure[company.productionType], 1)}%</span>
          </div>
          <div className="flex justify-between">
            <span>短缺指数:</span>
            <span className="font-medium">{formatPercent(state.market.shortageIndex[company.productionType], 1)}%</span>
          </div>
        </div>
      </div>

      {/* 运营指标 */}
      <div className="p-3 border rounded-lg">
        <h4 className="font-medium mb-2">📈 运营指标</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">生产效率</span>
            <div className="flex items-center gap-2">
              <Progress value={company.efficiency} className="w-24 h-2" />
              <span className="text-sm font-medium">{formatPercent(company.efficiency, 0)}%</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">员工士气</span>
            <div className="flex items-center gap-2">
              <Progress value={company.morale} className="w-24 h-2" />
              <span className="text-sm font-medium">{formatPercent(company.morale, 0)}%</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">企业声誉</span>
            <div className="flex items-center gap-2">
              <Progress value={company.reputation} className="w-24 h-2" />
              <span className="text-sm font-medium">{formatPercent(company.reputation, 0)}%</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">市场份额</span>
            <div className="flex items-center gap-2">
              <Progress value={company.marketShare} className="w-24 h-2" />
              <span className="text-sm font-medium">{formatPercent(company.marketShare, 1)}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button 
          size="sm" 
          variant={activeTab === 'overview' ? 'default' : 'outline'}
          onClick={() => setActiveTab('overview')}
        >
          人事管理
        </Button>
        <Button 
          size="sm" 
          variant={activeTab === 'production' ? 'default' : 'outline'}
          onClick={() => setActiveTab('production')}
        >
          生产研发
        </Button>
        <Button 
          size="sm" 
          variant={activeTab === 'marketing' ? 'default' : 'outline'}
          onClick={() => setActiveTab('marketing')}
        >
          市场运营
        </Button>
      </div>

      {/* 人事管理 */}
      {activeTab === 'overview' && (
        <div className="space-y-3">
          <div className="p-3 border rounded-lg">
            <h4 className="font-medium mb-2">👷 员工管理</h4>
            <p className="text-xs text-muted-foreground mb-2">
              💡 人工成本: ¥1,000/人/月 | 产能: 25件/轮 | 士气影响产能效率
            </p>
            <div className="flex items-center gap-2 mb-2">
              <Button 
                size="sm"
                onClick={() => dispatch({ type: 'HIRE_EMPLOYEE', payload: { playerId: currentPlayer.id, count: 1 } })}
                disabled={currentPlayer.cash < 3000}
              >
                + 雇佣 (¥3,000)
              </Button>
              <Button 
                size="sm"
                variant="outline"
                onClick={() => dispatch({ type: 'FIRE_EMPLOYEE', payload: { playerId: currentPlayer.id, count: 1 } })}
                disabled={company.employees < 1}
              >
                - 解雇
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs">批量:</span>
              <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'HIRE_EMPLOYEE', payload: { playerId: currentPlayer.id, count: 5 } })} disabled={currentPlayer.cash < 15000}>+5</Button>
              <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'HIRE_EMPLOYEE', payload: { playerId: currentPlayer.id, count: 10 } })} disabled={currentPlayer.cash < 30000}>+10</Button>
            </div>
          </div>

          <div className="p-3 border rounded-lg">
            <h4 className="font-medium mb-2">⚙️ 机器设备</h4>
            <p className="text-xs text-muted-foreground mb-2">
              💡 机器无需长期工资，产能更高。机器维护费较高。
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(MACHINE_CONFIGS).map(([key, config]) => (
                <Button 
                  key={key}
                  size="sm"
                  variant="outline"
                  onClick={() => dispatch({ type: 'BUY_MACHINE', payload: { playerId: currentPlayer.id, machineType: key } })}
                  disabled={currentPlayer.cash < config.price}
                  className="text-xs"
                >
                  {config.name} (¥{formatCurrency(config.price)})
                </Button>
              ))}
            </div>
          </div>

          <div className="p-3 border rounded-lg">
            <h4 className="font-medium mb-2">💰 工资调整</h4>
            <p className="text-xs text-muted-foreground mb-2">
              提高工资增加士气，降低工资节省成本但士气下降
            </p>
            <div className="flex items-center gap-2">
              <Button 
                size="sm"
                variant="outline"
                onClick={() => dispatch({ type: 'ADJUST_WAGES', payload: { playerId: currentPlayer.id, amount: -200 } })}
                disabled={company.employees < 1}
              >
                降薪 ¥200/人
              </Button>
              <Button 
                size="sm"
                variant="outline"
                onClick={() => dispatch({ type: 'ADJUST_WAGES', payload: { playerId: currentPlayer.id, amount: 200 } })}
                disabled={currentPlayer.cash < 200 * company.employees}
              >
                加薪 ¥200/人
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 生产研发 */}
      {activeTab === 'production' && (
        <div className="space-y-3">
          {/* 企业统计总览 */}
          <div className="p-3 border rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
            <h4 className="font-medium mb-2">📊 企业统计</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span>累计生产:</span>
                <span className="font-medium">{company.stats.totalProduced}单位</span>
              </div>
              <div className="flex justify-between">
                <span>累计销售:</span>
                <span className="font-medium">{company.stats.totalSold}单位</span>
              </div>
              <div className="flex justify-between">
                <span>累计收入:</span>
                <span className="font-medium text-green-600">¥{formatCurrency(company.stats.totalRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span>累计成本:</span>
                <span className="font-medium text-red-600">¥{formatCurrency(company.stats.totalCosts)}</span>
              </div>
            </div>
          </div>

          {/* 商品类型选择 */}
          <div className="p-3 border rounded-lg border-purple-200 dark:border-purple-800">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              🏭 选择生产商品类型
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(PRODUCTION_CONFIGS) as [string, typeof PRODUCTION_CONFIGS.daily_necessities][]).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => dispatch({ 
                    type: 'SET_PRODUCTION_TYPE', 
                    payload: { playerId: currentPlayer.id, productionType: type as 'daily_necessities' | 'food' | 'entertainment' | 'luxury' } 
                  })}
                  className={`min-w-0 p-3 rounded-lg border text-left transition-all ${
                    company.productionType === type 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="shrink-0 text-lg">{config.icon}</span>
                    <span className="min-w-0 truncate font-medium">{config.name}</span>
                    {company.productionType === type && (
                      <Badge variant="default" className="ml-auto shrink-0 text-xs">当前</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>变动成本: 约¥{formatCurrency(getEstimatedUnitVariableCost(type as ProductionGoodType, company))}/单位</div>
                    <div>售价: ¥{config.baseSellingPrice}/单位</div>
                    <div>产能: {config.capacityCost} 点/件</div>
                    <div className="text-muted-foreground/70">{config.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 当前生产参数 */}
          <div className="p-3 border rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              📦 当前生产参数
              <Badge variant="outline" className="ml-auto">
                {PRODUCTION_CONFIGS[company.productionType].icon} {PRODUCTION_CONFIGS[company.productionType].name}
              </Badge>
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div className="flex justify-between">
                <span>单位加工费:</span>
                <span className="font-medium text-red-600">-¥{formatCurrency(getUnitProcessingCost(company.productionType))}</span>
              </div>
              <div className="flex justify-between">
                <span>单位原材料:</span>
                <span className="font-medium">-{PRODUCTION_CONFIGS[company.productionType].materialConsumption}单位</span>
              </div>
              <div className="flex justify-between">
                <span>单位产能:</span>
                <span className="font-medium">{PRODUCTION_CONFIGS[company.productionType].capacityCost} 点/件</span>
              </div>
              <div className="flex justify-between">
                <span>原材料库存:</span>
                <span className="font-medium">{company.rawMaterials}单位</span>
              </div>
              <div className="flex justify-between">
                <span>产品库存:</span>
                <span className="font-medium text-green-600">{company.inventory || 0}件</span>
              </div>
              <div className="flex justify-between">
                <span>产能上限:</span>
                <span className="font-medium">{getCompanyCapacityUnits(company)}点/月</span>
              </div>
            </div>
            
            {/* 预估利润计算 */}
            <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded">
              <div className="text-xs space-y-1">
                <div className="flex justify-between font-medium">
                  <span>预估单位利润:</span>
                  <span className="text-green-600">
                    ¥{formatCurrency(PRODUCTION_CONFIGS[company.productionType].baseSellingPrice * (1 + (company.productQuality - 60) / 200) - PRODUCTION_CONFIGS[company.productionType].baseProductionCost)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>售价:</span>
                  <span>¥{PRODUCTION_CONFIGS[company.productionType].baseSellingPrice}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>原料采购价:</span>
                  <span>约 ¥{formatCurrency(getMaterialUnitPrice(100, company))}/单位</span>
                </div>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground mt-2">
              💡 生产商品存入公司库存，可随时在下方销售面板出售
            </p>
          </div>

          {/* 自动生产设定 */}
          <div className="p-3 border rounded-lg border-purple-200 dark:border-purple-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium flex items-center gap-2">
                🤖 自动生产
              </h4>
              <Button
                size="sm"
                variant={company.autoProduction.enabled ? "default" : "outline"}
                onClick={() => dispatch({ 
                  type: 'SET_AUTO_PRODUCTION', 
                  payload: { playerId: currentPlayer.id, enabled: !company.autoProduction.enabled } 
                })}
              >
                {company.autoProduction.enabled ? '已启用' : '启用'}
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground mb-3">
              {company.autoProduction.enabled 
                ? '✅ 每回合自动按设定生产并销售，收入自动到账'
                : '❌ 关闭后需手动生产'}
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">每月生产目标:</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    className="w-20 text-center"
                    value={company.autoProduction.monthlyTarget.toString()}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      dispatch({ 
                        type: 'SET_AUTO_PRODUCTION', 
                        payload: { playerId: currentPlayer.id, enabled: company.autoProduction.enabled, monthlyTarget: val } 
                      });
                    }}
                  />
                  <span className="text-sm text-muted-foreground">单位</span>
                </div>
              </div>
              
              {company.autoProduction.enabled && company.autoProduction.monthlyTarget > 0 && (
                <div className="p-2 bg-muted/30 rounded text-xs">
                  <div className="flex justify-between">
                    <span>预估成本（含原材料）:</span>
                    <span className="font-medium text-red-600">
                      -¥{formatCurrency(
                        company.autoProduction.monthlyTarget * 
                        getEstimatedUnitVariableCost(company.productionType, company, company.autoProduction.monthlyTarget)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>预计收入:</span>
                    <span className="font-medium text-green-600">
                      +¥{formatCurrency(company.autoProduction.monthlyTarget * PRODUCTION_CONFIGS[company.productionType].baseSellingPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>预估利润:</span>
                    <span className="font-medium text-green-600">
	                      ¥{formatCurrency(
	                        company.autoProduction.monthlyTarget * PRODUCTION_CONFIGS[company.productionType].baseSellingPrice -
	                        company.autoProduction.monthlyTarget * 
	                        getEstimatedUnitVariableCost(company.productionType, company, company.autoProduction.monthlyTarget)
	                      )}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>最大可生产:</span>
                    <span className="font-medium">
                      {Math.min(
                        company.autoProduction.monthlyTarget, 
                        getMaxProductionByCapacity(getCompanyCapacityUnits(company), 0, company.productionType), 
                        Math.floor(company.rawMaterials / PRODUCTION_CONFIGS[company.productionType].materialConsumption)
                      )}件
                    </span>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              💡 成本随产量递增，生产越多单价成本越高
            </p>
          </div>

          <div className="p-3 border rounded-lg">
            <h4 className="font-medium mb-3">📦 原材料采购</h4>
            <div className="grid grid-cols-2 gap-2">
              {[50, 200].map(quantity => {
                const totalCost = getMaterialPurchaseCost(quantity, company);
                return (
                  <Button
                    key={quantity}
                    size="sm"
                    variant="outline"
                    disabled={currentPlayer.cash < totalCost}
                    onClick={() => dispatch({ type: 'BUY_MATERIALS', payload: { playerId: currentPlayer.id, quantity } })}
                  >
                    采购 {quantity} 单位 (¥{formatCurrency(totalCost)})
                  </Button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              当前约 ¥{formatCurrency(getMaterialUnitPrice(100, company))}/单位；批量采购和适度规模会降低单价，过度扩张会推高土地与物流成本。
            </p>
          </div>

              {/* 手动生产面板（自动生产关闭时显示） */}
          {!company.autoProduction.enabled && (
            <div className="p-3 border rounded-lg border-amber-200 dark:border-amber-800">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                🔨 手动生产
              </h4>
              <div className="space-y-2 mb-3">
                {(() => {
                  const totalCapacity = getCompanyCapacityUnits(company);
                  const usedThisRound = company.productionUsedThisRound || 0;
                  const remainingCapacity = Math.max(0, totalCapacity - usedThisRound);
                  const maxByCapacity = getMaxProductionByCapacity(totalCapacity, usedThisRound, company.productionType);
                  const maxByMaterials = Math.floor((company.rawMaterials || 0) / PRODUCTION_CONFIGS[company.productionType].materialConsumption);
                  const maxByCash = Math.floor(currentPlayer.cash / getUnitProcessingCost(company.productionType));
                  const maxProduction = Math.min(maxByCapacity, maxByMaterials, maxByCash);
                  
                  return (
                    <>
                      <div className="text-xs text-muted-foreground">
                        本轮可生产：<span className="text-amber-600 font-medium">{maxProduction}</span> 件
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="p-2 bg-muted/30 rounded">
	                          <span className="text-muted-foreground">总产能:</span>
                          <span className="ml-1 font-medium">{totalCapacity}</span>
                        </div>
                        <div className="p-2 bg-muted/30 rounded">
                          <span className="text-muted-foreground">已使用:</span>
                          <span className="ml-1 font-medium text-orange-600">{usedThisRound}</span>
                        </div>
                        <div className="p-2 bg-muted/30 rounded">
	                          <span className="text-muted-foreground">剩余:</span>
                          <span className="ml-1 font-medium">{remainingCapacity}</span>
                        </div>
                        <div className="p-2 bg-muted/30 rounded">
                          <span className="text-muted-foreground">原料:</span>
                          <span className="ml-1 font-medium">{maxByMaterials}</span>
                        </div>
                        <div className="p-2 bg-muted/30 rounded">
                          <span className="text-muted-foreground">资金:</span>
                          <span className="ml-1 font-medium">{maxByCash}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
              
              {(() => {
                const totalCapacity = getCompanyCapacityUnits(company);
                const usedThisRound = company.productionUsedThisRound || 0;
                const maxByCapacity = getMaxProductionByCapacity(totalCapacity, usedThisRound, company.productionType);
                const maxByMaterials = Math.floor((company.rawMaterials || 0) / PRODUCTION_CONFIGS[company.productionType].materialConsumption);
                const maxByCash = Math.floor(currentPlayer.cash / getUnitProcessingCost(company.productionType));
                const maxProduction = Math.min(maxByCapacity, maxByMaterials, maxByCash);
                
                return (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <Input
                        type="number"
                        min={1}
                        max={maxProduction}
                        defaultValue={Math.min(1, maxProduction)}
                        className="flex-1"
                        id="manual-produce-quantity"
                      />
                      <span className="text-sm text-muted-foreground">件</span>
                    </div>
                    
                    <div className="text-xs text-muted-foreground mb-3">
                      加工费：¥{formatCurrency(getUnitProcessingCost(company.productionType))}/件 | 消耗原料：{PRODUCTION_CONFIGS[company.productionType].materialConsumption}单位/件 | 产能：{PRODUCTION_CONFIGS[company.productionType].capacityCost}点/件
                    </div>
                    
                    <Button 
                      className="w-full bg-amber-600 hover:bg-amber-700"
                      disabled={maxProduction === 0}
                      onClick={() => {
                        const input = document.getElementById('manual-produce-quantity') as HTMLInputElement;
                        const quantity = Math.min(parseInt(input?.value) || 1, maxProduction);
                        dispatch({ 
                          type: 'PRODUCE_GOODS', 
                          payload: { playerId: currentPlayer.id, quantity } 
                        });
                      }}
                    >
                      {maxProduction === 0 
                        ? '本轮产能已用完' 
                        : '开始生产'}
                    </Button>
                  </>
                );
              })()}
            </div>
          )}

          {/* 产品销售面板 */}
          <div className="p-3 border rounded-lg border-green-200 dark:border-green-800">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              💰 产品销售
            </h4>
            <div className="space-y-2 mb-3">
              <div className="flex justify-between items-center">
                <span>总库存:</span>
                <Badge variant="outline" className="text-lg px-3 py-1">
                  {company.inventory || 0} 件
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {productionGoodTypes.map((type) => {
                  const config = PRODUCTION_CONFIGS[type];
                  const stock = productInventory[type] || 0;
                  return (
                    <Button
                      key={type}
                      type="button"
                      size="sm"
                      variant={saleProductType === type ? 'default' : 'outline'}
                      className="min-w-0 justify-between gap-2 whitespace-normal px-2"
                      onClick={() => setSaleProductType(type)}
                    >
                      <span className="min-w-0 truncate text-left">{config.icon} {config.name}</span>
                      <span className="shrink-0">{stock} 件</span>
                    </Button>
                  );
                })}
              </div>
              <div className="text-xs text-muted-foreground">
                📌 {saleConfig.name} 售价范围：¥{formatCurrency(saleConfig.minSellingPrice)}-¥{formatCurrency(saleConfig.maxSellingPrice)}/件，市场税率 {formatPercent(ECONOMY_BALANCE.company.salesTaxRate, 0)}%
                {hasSoldThisRound && currentSaleRecord && (
                  <span className="ml-1 text-amber-600">
                    本轮已提交销售：成交 {currentSaleRecord.sold}/{currentSaleRecord.requested} 件，税后收入 ¥{formatCurrency(currentSaleRecord.netRevenue)}
                  </span>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-xs text-muted-foreground">数量</label>
                <Input
                  type="number"
                  min={1}
                  max={saleInventory}
                  defaultValue={1}
                  disabled={hasSoldThisRound}
                  className="w-full"
                  id="sell-quantity-local"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">单价 (¥)</label>
                <Input
                  key={`${saleProductType}-${lockedSalePrice ?? 'free'}`}
                  type="number"
                  min={saleConfig.minSellingPrice}
                  max={saleConfig.maxSellingPrice}
                  defaultValue={effectiveDefaultSalePrice}
                  disabled={hasSoldThisRound}
                  className="w-full"
                  id="sell-price-local"
                />
              </div>
            </div>

            <div className="mb-3 rounded-lg border bg-muted/30 p-2">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {hasSoldThisRound ? '本轮实际成交' : '定价-预计销量'}
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground">
                <span>单价</span>
                <span>预计成交</span>
                <span>成交率</span>
                <span>税后收入</span>
              </div>
              <div className="mt-1 space-y-1">
                {pricingScenarios.map((price) => {
                  const expectedSold = currentSaleRecord && currentSaleRecord.price === price
                    ? currentSaleRecord.sold
                    : hasSoldThisRound
                      ? 0
                      : estimateProductSales(state.market, company, saleProductType, saleInventory, price);
                  const netRevenue = currentSaleRecord && currentSaleRecord.price === price
                    ? currentSaleRecord.netRevenue
                    : Math.floor(expectedSold * price * (1 - ECONOMY_BALANCE.company.salesTaxRate));
                  const isLocked = currentSaleRecord?.price === price;
                  return (
                    <div key={price} className={`grid grid-cols-4 gap-2 rounded px-1 py-1 text-xs ${isLocked ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100' : ''}`}>
                      <span>¥{formatCurrency(price)}</span>
                      <span>{expectedSold}/{currentSaleRecord?.requested ?? saleInventory}</span>
                      <span>{currentSaleRecord?.requested ? formatPercent(expectedSold / currentSaleRecord.requested, 0) : saleInventory > 0 ? formatPercent(expectedSold / saleInventory, 0) : '0%'}</span>
                      <span>¥{formatCurrency(netRevenue)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <Button 
                size="sm" 
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                disabled={saleInventory === 0 || hasSoldThisRound}
                onClick={() => {
                  const qtyInput = document.getElementById('sell-quantity-local') as HTMLInputElement;
                  const priceInput = document.getElementById('sell-price-local') as HTMLInputElement;
                  const quantity = Math.min(parseInt(qtyInput?.value) || 1, saleInventory);
                  const price = parseInt(priceInput?.value) || saleConfig.baseSellingPrice;
                  dispatch({ 
                    type: 'SELL_COMPANY_PRODUCT', 
                    payload: { playerId: currentPlayer.id, quantity, pricePerUnit: price, productType: saleProductType } 
                  });
                }}
              >
                出售{saleConfig.name}
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                disabled={saleInventory === 0 || hasSoldThisRound}
                onClick={() => {
                  const bestOption = findBestSaleOption(state.market, company, saleProductType, saleInventory);
                  dispatch({ 
                    type: 'SELL_COMPANY_PRODUCT',
                    payload: { playerId: currentPlayer.id, quantity: saleInventory, pricePerUnit: bestOption.price, productType: saleProductType }
                  });
                }}
              >
                全部出售该商品
              </Button>
            </div>
            
            <div className="mt-2 text-xs text-muted-foreground">
              💡 每轮每个商品只能提交一次销售；提交后利润按本轮实际成交数量计算
            </div>
          </div>

          {/* 现金流和利润面板 */}
          <div className="p-3 border rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              💹 财务状况
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <div className="text-muted-foreground">本月收入</div>
                <div className="text-lg font-bold text-green-600">+¥{formatCurrency(company.cashFlow.income)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">本月支出</div>
                <div className="text-lg font-bold text-red-600">-¥{formatCurrency(company.cashFlow.expenses)}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t">
              <div className="flex justify-between items-center">
                <span className="font-medium">本月利润</span>
                <span className={`text-lg font-bold ${
                  company.stats.monthlyProfit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {company.stats.monthlyProfit >= 0 ? '+' : ''}¥{formatCurrency(company.stats.monthlyProfit)}
                </span>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>库存潜在销售额:</span>
                <span className="text-green-600">+¥{formatCurrency((company.inventory || 0) * PRODUCTION_CONFIGS[company.productionType].baseSellingPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span>工资支出:</span>
                <span>-¥{formatCurrency(company.cashFlow.wages)}</span>
              </div>
              <div className="flex justify-between">
                <span>生产成本:</span>
                <span>-¥{formatCurrency(company.cashFlow.productionCosts)}</span>
              </div>
              <div className="flex justify-between">
                <span>固定与持有成本:</span>
                <span>-¥{formatCurrency(company.fixedCosts + company.inventoryHoldingCost + company.depreciation)}</span>
              </div>
              <div className="flex justify-between">
                <span>营业利润:</span>
                <span className={company.incomeStatement.operatingProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {company.incomeStatement.operatingProfit >= 0 ? '+' : ''}¥{formatCurrency(company.incomeStatement.operatingProfit)}
                </span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">企业现金</span>
                <span className="font-bold">¥{formatCurrency(company.cashFlow.final)}</span>
              </div>
            </div>
          </div>

          {/* 质量升级 */}
          <div className="p-3 border rounded-lg">
            <h4 className="font-medium mb-2">🔬 质量升级</h4>
            <p className="text-xs text-muted-foreground mb-2">
              产品质量影响售价（当前: {company.productQuality.toFixed(0)}%）
            </p>
            <div className="flex flex-wrap gap-2">
              <Button 
                size="sm"
                variant="outline"
                onClick={() => dispatch({ type: 'UPGRADE_QUALITY', payload: { playerId: currentPlayer.id, amount: 1000 } })}
                disabled={currentPlayer.cash < 1000}
              >
                投入 ¥1,000 (质量+2%)
              </Button>
              <Button 
                size="sm"
                onClick={() => dispatch({ type: 'UPGRADE_QUALITY', payload: { playerId: currentPlayer.id, amount: 5000 } })}
                disabled={currentPlayer.cash < 5000}
              >
                投入 ¥5,000 (质量+10%)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 市场运营 */}
      {activeTab === 'marketing' && (
        <div className="space-y-3">
          <div className="p-3 border rounded-lg">
            <h4 className="font-medium mb-2">📢 市场推广</h4>
            <p className="text-xs text-muted-foreground mb-2">
              推广增加市场份额和企业声誉
            </p>
            <div className="flex flex-wrap gap-2">
              <Button 
                size="sm"
                variant="outline"
                onClick={() => dispatch({ type: 'MARKETING_SPEND', payload: { playerId: currentPlayer.id, amount: 1000 } })}
                disabled={currentPlayer.cash < 1000}
              >
                ¥1,000
              </Button>
              <Button 
                size="sm"
                variant="outline"
                onClick={() => dispatch({ type: 'MARKETING_SPEND', payload: { playerId: currentPlayer.id, amount: 5000 } })}
                disabled={currentPlayer.cash < 5000}
              >
                ¥5,000
              </Button>
              <Button 
                size="sm"
                onClick={() => dispatch({ type: 'MARKETING_SPEND', payload: { playerId: currentPlayer.id, amount: 10000 } })}
                disabled={currentPlayer.cash < 10000}
              >
                ¥10,000
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 政府官员功能（政策系统）====================
function GovernmentActions() {
  const { state, dispatch, getCurrentPlayer } = useGame();
  const currentPlayer = getCurrentPlayer();
  const [taxRate, setTaxRate] = React.useState(currentPlayer?.taxRate ? (currentPlayer.taxRate * 100).toString() : '20');
  const [subsidyAmount, setSubsidyAmount] = React.useState('1000');
  
  if (!currentPlayer) return null;

  const policies = Object.entries(POLICY_CONFIGS) as [PolicyType, typeof POLICY_CONFIGS.tax_raise][];
  const subsidyNum = parseInt(subsidyAmount) || 0;
  const taxRateNum = parseFloat(taxRate) || 0;

  return (
    <div className="space-y-3">
      <div className="p-3 border rounded-lg bg-gradient-to-r from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-900/30">
        <h4 className="font-medium mb-2">🏛️ 政府调控中心</h4>
        <p className="text-xs text-muted-foreground">
          政府官员可以通过多种政策影响经济。不同政策有不同效果和冷却时间。
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded bg-white/60 p-2 dark:bg-black/20">
            <div className="text-muted-foreground">政府声誉</div>
            <div className="font-bold">{Math.round(currentPlayer.govAbilities?.reputation ?? 60)}</div>
          </div>
          <div className="rounded bg-white/60 p-2 dark:bg-black/20">
            <div className="text-muted-foreground">支持率</div>
            <div className="font-bold">{Math.round(currentPlayer.govAbilities?.approvalRating ?? 60)}</div>
          </div>
        </div>
        {(currentPlayer.govAbilities?.approvalRating ?? 60) < 35 && (
          <p className="mt-2 text-xs text-red-600">
            支持率过低会削弱决策能力，低于 20 可能下台。
          </p>
        )}
      </div>

      {/* 财政状况 */}
      <div className="p-3 border rounded-lg">
        <h4 className="font-medium mb-2">💰 政府财政</h4>
        <div className="text-lg font-bold text-green-600">
          ¥{formatCurrency(currentPlayer.cash)}
        </div>
        <p className="text-xs text-muted-foreground">
          每轮预算收入: ¥15,000 | 当前税率: {formatPercent(currentPlayer.taxRate, 0)}%
        </p>
      </div>

      {currentPlayer.govAbilities && (
        <GovernmentFeedbackPanel government={currentPlayer} gameState={state} />
      )}

      {/* 税率调整 */}
      <div className="p-3 border rounded-lg">
        <h4 className="font-medium mb-2">📊 税率设定</h4>
        <div className="flex items-center gap-2 mb-2">
          <Input 
            type="text"
            placeholder="税率"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            className="w-24"
          />
          <span>%</span>
          <Button 
            size="sm"
            onClick={() => {
              const rate = Math.min(50, Math.max(0, taxRateNum));
              dispatch({ type: 'SET_TAX_RATE', payload: { playerId: currentPlayer.id, rate: rate / 100 } });
            }}
          >
            确定
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          高税率(&gt;35%)会大幅降低社会稳定 | 低税率(&lt;15%)社会稳定+5
        </div>
      </div>

      {/* 快捷补贴 */}
      <div className="p-3 border rounded-lg">
        <h4 className="font-medium mb-2">💵 快速补贴</h4>
        <div className="flex items-center gap-2 mb-2">
          <select 
            defaultValue="all"
            className="border rounded px-2 py-1 text-sm"
            id="subsidy-target"
          >
            <option value="all">全体玩家</option>
            <option value="poor">低收入玩家</option>
            <option value="business">企业</option>
          </select>
          <Input 
            type="text"
            placeholder="金额"
            value={subsidyAmount}
            onChange={(e) => setSubsidyAmount(e.target.value)}
            className="w-28"
          />
          <Button 
            size="sm"
            onClick={() => {
              const target = (document.getElementById('subsidy-target') as HTMLSelectElement).value as 'all' | 'poor' | 'business';
              dispatch({ type: 'ISSUE_SUBSIDY', payload: { playerId: currentPlayer.id, amount: subsidyNum, target } });
            }}
            disabled={currentPlayer.cash < subsidyNum}
          >
            发放
          </Button>
        </div>
      </div>

      {/* 政策列表 */}
      <div className="p-3 border rounded-lg">
        <h4 className="font-medium mb-2">📜 政策选项</h4>
        <div className="space-y-2">
          {policies.map(([type, policy]) => {
            const cooldown = currentPlayer.policyCooldowns?.[type] || 0;
            const isOnCooldown = cooldown > 0;
            
            return (
              <div key={type} className={`p-2 border rounded ${isOnCooldown ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{policy.icon}</span>
                    <div>
                      <span className="font-medium">{policy.name}</span>
                      {isOnCooldown && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          冷却{cooldown}轮
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button 
                    size="sm"
                    variant="outline"
                    disabled={isOnCooldown || currentPlayer.cash < policy.cost}
                    onClick={() => {
                      const explanation = window.prompt('请输入这项政策的新闻说明（下一轮会作为新闻播报）：', policy.description) || policy.description;
                      dispatch({ type: 'ENACT_POLICY', payload: { playerId: currentPlayer.id, policyType: type, explanation } });
                    }}
                  >
                    {policy.cost > 0 ? `¥${formatCurrency(policy.cost)}` : '免费'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{policy.description}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {policy.effect.socialStability !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      稳定{policy.effect.socialStability > 0 ? '+' : ''}{policy.effect.socialStability}
                    </Badge>
                  )}
                  {policy.effect.employment !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      就业{policy.effect.employment > 0 ? '+' : ''}{policy.effect.employment}
                    </Badge>
                  )}
                  {policy.effect.inflation !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      通胀{formatPercent(policy.effect.inflation, 0)}%
                    </Badge>
                  )}
                  {policy.effect.happiness !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      幸福{policy.effect.happiness > 0 ? '+' : ''}{policy.effect.happiness}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
