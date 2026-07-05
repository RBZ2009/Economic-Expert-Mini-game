'use client';

import React, { useState } from 'react';
import { useRoom } from '@/contexts/RoomContext';
import type { RoomPlayerInfo } from '@/lib/ws-client';
import { 
  formatCurrency, 
  formatPercent, 
  PROFESSION_CONFIGS, 
  HOUSING_CONFIGS,
  GOOD_EFFECTS_INFO,
  INVESTMENT_CONFIGS,
  MACHINE_CONFIGS,
  PRODUCTION_CONFIGS,
  POLICY_CONFIGS,
  CYCLE_NAMES,
  GoodType,
  HousingTier,
  InvestmentType,
  PlayerProfession,
  Player,
  ProfessionConfig,
  GameState,
  RandomEvent,
  ProductionGoodType,
  PolicyType,
  ECONOMY_BALANCE,
} from '@/types/game';
import { estimateProductSales, findBestSaleOption, getProductInventory, productionGoodTypes } from '@/components/game/company-helpers';
import { getJobOffers, getWorkerCurrentJob, getWorkerEducationLevel, getWorkerExperience, isQualifiedForJob } from '@/game/jobs';
import {
  getCompanyCapacityUnits,
  getEstimatedUnitVariableCost,
  getMaterialPurchaseCost,
  getMaterialUnitPrice,
  getMaxProductionByCapacity,
  getUnitProcessingCost,
} from '@/game/company-economics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ActionSection, ActionWorkspace, GameWorkbench, MetricStrip, StatusBadge, type ActionAdapter } from '@/components/game/workbench';
import { RoomOptionsMenu } from '@/components/room/RoomOptionsMenu';
import { EventEffectsView } from '@/components/game/EventEffectsView';
import { EconomyCausalPanel } from '@/components/game/EconomyCausalPanel';
import { AssetPricingPanel } from '@/components/game/AssetPricingPanel';
import { GovernmentFeedbackPanel } from '@/components/game/GovernmentFeedbackPanel';

type SendGameAction = (action: { type: string; payload: Record<string, unknown> }) => void;

interface RoundEndPayload {
  event: {
    icon?: string;
    name?: string;
    description?: string;
    story?: string;
    explanation?: string;
    duration?: number;
    remainingDuration?: number;
    warning?: string;
    effects?: RandomEvent['effects'];
  } | null;
  completedRound: number;
  newRound?: number;
  round?: number;
}

export function MultiplayerGamePage() {
  const { 
    room, 
    playerId, 
    players, 
    gameState, 
    hasCompletedRound,
    roundEndEvent,
    sendAction,
    dismissRoundEndEvent,
    error,
    clearError,
  } = useRoom();

  if (!room || !gameState || !playerId) return null;

  const myPlayer = gameState.players.find(p => p.id === playerId);
  if (!myPlayer) return null;

  // 计算完成进度（添加安全检查）
  const completedCount = gameState.roundCompletedPlayers?.length ?? 0;
  const totalPlayers = gameState.players?.length ?? 0;
  const remainingPlayers = totalPlayers - completedCount;
  const actionAdapter: ActionAdapter = {
    mode: 'multi',
    player: myPlayer,
    gameState,
    isTurnLocked: hasCompletedRound,
    send: (type, payload) => sendAction({ type, payload }),
    endTurn: () => sendAction({ type: 'END_TURN', payload: {} }),
  };

  const topBar = (
    <Card className="gap-3 rounded-lg border-2 p-3 shadow-xs">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white shadow-sm"
              style={{ backgroundColor: myPlayer.color }}
            >
              {myPlayer.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-lg font-bold">{myPlayer.name}</span>
                <Badge variant="outline">
                  {PROFESSION_CONFIGS[myPlayer.profession]?.icon} {PROFESSION_CONFIGS[myPlayer.profession]?.name}
                </Badge>
                {hasCompletedRound && <Badge variant="default" className="bg-green-600">已结束</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {hasCompletedRound ? '等待其他玩家完成操作' : '完成关键操作后结束本轮'}
              </div>
            </div>
          </div>

          <div className="min-w-[180px] text-left md:text-right">
            <div className="text-2xl font-bold">第 {gameState.currentRound} 轮</div>
            <div className="text-sm text-muted-foreground">
              {completedCount}/{totalPlayers} 玩家已完成 · {remainingPlayers > 0 ? `还差 ${remainingPlayers} 人` : '即将进入下一轮'}
            </div>
          </div>
        </div>
        <Progress value={(completedCount / Math.max(1, totalPlayers)) * 100} className="mt-3 h-2" />
      </CardContent>
    </Card>
  );

  return (
    <>
      <RoomOptionsMenu />
      {/* 错误提示 */}
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <span>{error}</span>
          <button onClick={clearError} className="font-bold">×</button>
        </div>
      )}
      
      {/* 轮次结束弹窗 */}
      <RoundEndEventDialog event={roundEndEvent} onDismiss={dismissRoundEndEvent} />

      <GameWorkbench
        top={topBar}
        left={(
          <>
            <PlayerStatsPanel myPlayer={myPlayer} />
            <MyGoodsPanel myPlayer={myPlayer} isMyTurn={!hasCompletedRound} sendAction={sendAction} gameState={gameState} />
          </>
        )}
        main={(
          <div className="space-y-3">
            {!hasCompletedRound ? (
              <FullActionPanel adapter={actionAdapter} />
            ) : (
              <WaitingForOthersCard 
                gameState={gameState} 
                players={players}
                myPlayerId={playerId}
              />
            )}
          </div>
        )}
        right={(
          <>
            <EconomyCausalPanel gameState={gameState} />
            <MarketPricesPanel gameState={gameState} />
            <OtherPlayersPanel 
              gameState={gameState} 
              players={players} 
              myPlayerId={playerId}
              sendAction={sendAction}
            />
          </>
        )}
      />
    </>
  );
}

// ==================== 轮次结束弹窗 ====================
function RoundEndEventDialog({ event, onDismiss }: { event: RoundEndPayload | null; onDismiss: () => void }) {
  if (!event) return null;

  return (
    <AlertDialog open={!!event} onOpenChange={() => onDismiss()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-xl">
            <span className="text-3xl">{event.event?.icon || '📰'}</span>
            <span>第 {event.newRound ?? event.round ?? event.completedRound + 1} 轮新闻播报</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-2">
            <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="font-bold text-lg text-yellow-800 dark:text-yellow-200 mb-1">
                {event.event?.name || '随机事件'}
              </div>
              <div className="text-yellow-700 dark:text-yellow-300">
                {event.event?.description || '发生了意想不到的事情！'}
              </div>
              {event.event?.story && (
                <div className="mt-2 rounded bg-white/60 p-2 text-xs text-yellow-900 dark:bg-black/20 dark:text-yellow-100">
                  {event.event.story}
                </div>
              )}
              {event.event?.explanation && (
                <div className="mt-2 rounded border border-yellow-300 bg-white/60 p-2 text-xs text-yellow-800 dark:border-yellow-700 dark:bg-black/20 dark:text-yellow-200">
                  <div className="font-medium mb-1">经济逻辑</div>
                  {event.event.explanation}
                </div>
              )}
              {event.event?.duration && (
                <div className="mt-2 text-xs text-yellow-700 dark:text-yellow-300">
                  预计持续 {event.event.duration} 轮，剩余 {event.event.remainingDuration ?? event.event.duration} 轮
                </div>
              )}
              {event.event?.warning && (
                <div className="mt-2 rounded border border-yellow-300 bg-white/60 p-2 text-xs text-yellow-800 dark:border-yellow-700 dark:bg-black/20 dark:text-yellow-200">
                  {event.event.warning}
                </div>
              )}
              {event.event?.effects && Object.keys(event.event.effects).length > 0 && (
                <div className="mt-3 rounded border border-yellow-200 bg-white/60 p-2 text-xs dark:border-yellow-800 dark:bg-black/20">
                  <EventEffectsView effects={event.event.effects} />
                </div>
              )}
            </div>
            <p className="text-center text-muted-foreground">
              即将开始第 {event.newRound ?? event.round ?? event.completedRound + 1} 轮...
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onDismiss}>确定</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ==================== 等待其他玩家卡片 ====================
function WaitingForOthersCard({ gameState, players }: { gameState: GameState; players: RoomPlayerInfo[]; myPlayerId: string }) {
  return (
    <Card className="border-2 border-yellow-500 bg-yellow-500/10">
      <CardContent className="py-8 text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center text-4xl bg-yellow-500/20 animate-pulse">
          ⏳
        </div>
        <p className="text-xl font-medium mb-2">
          等待其他玩家完成操作
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          {gameState.roundCompletedPlayers?.length ?? 0}/{gameState.players?.length ?? 0} 玩家已完成
        </p>
        
        {/* 玩家完成状态列表 */}
        <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
          {gameState.players.map(player => {
            const isCompleted = gameState.roundCompletedPlayers.includes(player.id);
            const roomPlayer = players.find(rp => rp.id === player.id);
            return (
              <div 
                key={player.id}
                className={`p-2 rounded-lg flex items-center gap-2 ${
                  isCompleted 
                    ? 'bg-green-100 dark:bg-green-900/30' 
                    : 'bg-muted'
                }`}
              >
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ backgroundColor: roomPlayer?.color || player.color }}
                >
                  {player.name.charAt(0)}
                </div>
                <span className="text-sm truncate">{player.name}</span>
                {isCompleted ? (
                  <span className="ml-auto text-green-600">✓</span>
                ) : (
                  <span className="ml-auto text-muted-foreground">...</span>
                )}
              </div>
            );
          })}
        </div>
        
        <p className="text-xs text-muted-foreground mt-4">
          所有玩家完成后将自动进入下一轮，并触发随机事件
        </p>
      </CardContent>
    </Card>
  );
}

// ==================== 我的状态面板 ====================
function PlayerStatsPanel({ myPlayer }: { myPlayer: Player }) {
  const profession = PROFESSION_CONFIGS[myPlayer.profession] as ProfessionConfig;
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <span>💰</span> 我的财务
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">现金</span>
          <span className="text-xl font-bold text-green-600">
            ¥{formatCurrency(myPlayer.cash)}
          </span>
        </div>
        
        {/* 职业提示 */}
        <div className="p-2 bg-muted/50 rounded-lg text-sm">
          <div className="flex items-center gap-1 mb-1">
            <span>{profession.icon}</span>
            <span className="font-medium">{profession.name}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {profession.description}
          </p>
        </div>

        {/* 属性进度 */}
        <div className="space-y-2">
          <StatBar label="幸福度" value={myPlayer.happiness} icon="😊" />
          <StatBar label="健康值" value={myPlayer.health} icon="❤️" />
          <StatBar label="社会地位" value={myPlayer.socialStatus} icon="🏆" />
          <StatBar label="疲劳度" value={myPlayer.workState.fatigueLevel} icon="😴" max={100} inverse />
        </div>

        {/* 住房状态 */}
        <div className="pt-2 border-t">
          <div className="flex justify-between items-center text-sm">
            <span>🏠 住房</span>
            <span>
              {myPlayer.housingStatus === 'owned' && myPlayer.housingTier && (
                <span>{HOUSING_CONFIGS[myPlayer.housingTier].icon} {HOUSING_CONFIGS[myPlayer.housingTier].name}</span>
              )}
              {myPlayer.housingStatus === 'renting' && myPlayer.housingTier && (
                <span className="text-orange-500">{HOUSING_CONFIGS[myPlayer.housingTier].icon} 租住中</span>
              )}
              {myPlayer.housingStatus === 'none' && <span className="text-red-500">无住房</span>}
            </span>
          </div>
        </div>

        {/* 永久加成 */}
        {myPlayer.permanentBonuses.incomeBonus > 0 && (
          <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded-lg text-sm text-green-600">
            💰 收入加成: +{formatPercent(myPlayer.permanentBonuses.incomeBonus, 0)}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBar({ label, value, icon, max = 100, inverse = false }: { label: string; value: number; icon: string; max?: number; inverse?: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{icon} {label}</span>
        <span>{value}/{max}</span>
      </div>
      <Progress 
        value={inverse ? max - value : value} 
        className="h-2" 
        color={inverse ? (value > 50 ? 'destructive' : 'default') : undefined}
      />
    </div>
  );
}

// ==================== 我的物品面板 ====================
function MyGoodsPanel({ myPlayer, isMyTurn, sendAction, gameState }: { myPlayer: Player; isMyTurn: boolean; sendAction: SendGameAction; gameState: GameState }) {
  // 过滤掉住房（住房在专门的住房面板中处理）
  const consumableGoods = Object.entries(myPlayer.goods).filter(([key]) => key !== 'housing');
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <span>🎒</span> 我的物品
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-2">
          {consumableGoods.map(([key, value]) => {
            const good = GOOD_EFFECTS_INFO[key as GoodType];
            return (
              <div key={key} className="min-w-0 text-center p-2 bg-muted rounded-lg">
                <div className="text-xl leading-none">{good?.icon || '📦'}</div>
                <div className="text-lg font-bold">{value}</div>
                <div className="text-xs text-muted-foreground truncate">{good?.name || key}</div>
              </div>
            );
          })}
        </div>

        {/* 快速购买必需品 */}
        {isMyTurn && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <p className="text-sm font-medium">快速购买必需品</p>
            <div className="grid grid-cols-2 gap-2">
              {(['food', 'daily_necessities'] as GoodType[]).map(goodType => {
                const good = gameState.market.goods[goodType];
                const price = good?.currentPrice || 0;
                const canAfford = myPlayer.cash >= price;
                return (
                  <Button
                    key={goodType}
                    size="sm"
                    variant="outline"
                    disabled={!canAfford}
                    onClick={() => sendAction({ type: 'BUY_GOOD', payload: { goodType, quantity: 1 } })}
                    className="min-w-0 justify-between gap-1 whitespace-normal px-2 text-xs"
                  >
                    <span className="min-w-0 truncate text-left">{good?.icon} {good?.name}</span>
                    <span className="shrink-0">¥{formatCurrency(price)}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== 完整操作面板 ====================
function FullActionPanel({ adapter }: { adapter: ActionAdapter }) {
  const { player: myPlayer, gameState } = adapter;
  const sendAction: SendGameAction = (action) => adapter.send(action.type, action.payload);
  const isSimpleMode = gameState.gameMode === 'simple';
  const totalDebt = (myPlayer.loans ?? []).reduce((sum, loan) => sum + loan.remaining, 0);
  const defaultOpen = myPlayer.profession === 'worker' ? ['required', 'market'] : ['profession', 'required'];
  const requiredSummary = `食品 ${myPlayer.goods.food} / 日用品 ${myPlayer.goods.daily_necessities} / 健康 ${myPlayer.health}`;
  const marketSummary = `现金 ¥${formatCurrency(myPlayer.cash)} / 通胀 ${formatPercent(gameState.market.inflationRate, 1)}`;
  const assetSummary = `资产 ${myPlayer.assets.length} / 负债 ¥${formatCurrency(totalDebt)}`;
  const professionSummary = `${PROFESSION_CONFIGS[myPlayer.profession]?.name ?? '职业'}${myPlayer.company ? ` / 库存 ${myPlayer.company.inventory}` : ''}`;

  return (
    <ActionWorkspace defaultOpen={defaultOpen}>
      {isSimpleMode && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
          简单模式：先学会照顾生活必需品、工作赚钱、观察价格，再逐步理解更复杂的投资和贷款。
        </div>
      )}
      {!isSimpleMode && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-100">
          专业模式：完整展示供应链、信用、外需、利润结构和政策反馈，适合根据经济环境制定策略。
        </div>
      )}

      <ActionSection
        value="required"
        icon="✅"
        title="本轮必做"
        summary={requiredSummary}
        badge={myPlayer.workState.fatigueLevel > 50 ? <StatusBadge tone="warn">疲劳</StatusBadge> : undefined}
      >
        <MetricStrip
          items={[
            { label: '现金', value: `¥${formatCurrency(myPlayer.cash)}`, tone: 'good' },
            { label: '幸福', value: `${myPlayer.happiness}/100` },
            { label: '健康', value: `${myPlayer.health}/100`, tone: myPlayer.health < 50 ? 'bad' : 'default' },
            { label: '疲劳', value: `${myPlayer.workState.fatigueLevel}/100`, tone: myPlayer.workState.fatigueLevel > 50 ? 'warn' : 'default' },
          ]}
        />
        <WorkActionPanel myPlayer={myPlayer} gameState={gameState} sendAction={sendAction} />
        <HealthPanel myPlayer={myPlayer} sendAction={sendAction} gameState={gameState} />
        <HousingPanel myPlayer={myPlayer} sendAction={sendAction} />
      </ActionSection>

      <ActionSection value="market" icon="🛒" title="市场交易" summary={marketSummary}>
        <MarketBuyPanel myPlayer={myPlayer} sendAction={sendAction} gameState={gameState} />
        <MarketSellPanel myPlayer={myPlayer} sendAction={sendAction} gameState={gameState} />
      </ActionSection>

      {!isSimpleMode && (
        <ActionSection value="assets" icon="📈" title="资产与信贷" summary={assetSummary}>
          <InvestmentPanel myPlayer={myPlayer} sendAction={sendAction} gameState={gameState} />
          <InvestmentList myPlayer={myPlayer} sendAction={sendAction} />
          <BankPanel myPlayer={myPlayer} sendAction={sendAction} gameState={gameState} />
        </ActionSection>
      )}

      <ActionSection
        value="profession"
        icon={PROFESSION_CONFIGS[myPlayer.profession]?.icon}
        title="职业能力"
        summary={professionSummary}
        badge={<StatusBadge>{PROFESSION_CONFIGS[myPlayer.profession]?.name}</StatusBadge>}
      >
        <SpecialProfessionPanel myPlayer={myPlayer} sendAction={sendAction} gameState={gameState} />
      </ActionSection>

        {/* 结束回合 */}
      <div className="sticky bottom-2 z-10 mt-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <Button 
          onClick={adapter.endTurn} 
          className="w-full text-lg py-6"
        >
          ✅ 结束本轮操作，轮到下一位
        </Button>
      </div>
    </ActionWorkspace>
  );
}

// ==================== 工作面板 ====================
function WorkActionPanel({ myPlayer, gameState, sendAction }: { myPlayer: Player; gameState: GameState; sendAction: SendGameAction }) {
  const [showJobOffers, setShowJobOffers] = useState(false);
  const profession = PROFESSION_CONFIGS[myPlayer.profession] as ProfessionConfig;
  const workerAbilities = myPlayer.workerAbilities;
  const isUnemployed = (workerAbilities?.unemployedRounds ?? 0) > 0;
  const currentJob = myPlayer.profession === 'worker' ? getWorkerCurrentJob(myPlayer, gameState.players, gameState.market) : null;
  const jobOffers = myPlayer.profession === 'worker'
    ? getJobOffers(gameState.players, myPlayer, gameState.market.employmentRate, gameState.market)
    : [];
  const workLimit = currentJob?.paymentType === 'hourly' ? currentJob.maxWorkPerRound : profession.maxWorkPerRound;
  const workRemaining = Math.max(0, workLimit - myPlayer.workState.workCount);
  const isMonthlyJob = currentJob?.paymentType === 'monthly';
  const forcedRestRounds = myPlayer.workState.forcedRestRounds ?? 0;
  const canWork = workRemaining > 0 && !isUnemployed && !isMonthlyJob && forcedRestRounds <= 0 && myPlayer.health >= 25;
  const wageLevel = currentJob?.wage ?? workerAbilities?.wageLevel ?? profession.baseIncome;

  if (myPlayer.profession === 'worker') {
    return (
      <div className="p-3 border rounded-lg">
        <h4 className="font-medium mb-3">👷 工作</h4>
        {workerAbilities && (
          <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
            <div className="bg-muted/50 rounded p-2 text-center">
              <div className="font-bold">{workerAbilities.skill}</div>
              <div className="text-muted-foreground">技能</div>
            </div>
            <div className="bg-muted/50 rounded p-2 text-center">
              <div className="font-bold">¥{formatCurrency(wageLevel)}</div>
              <div className="text-muted-foreground">{isMonthlyJob ? '月薪' : '时薪'}</div>
            </div>
            <div className="bg-muted/50 rounded p-2 text-center">
              <div className="font-bold">{getWorkerEducationLevel(myPlayer)} / {getWorkerExperience(myPlayer)}</div>
              <div className="text-muted-foreground">学历/经验</div>
            </div>
          </div>
        )}
        {currentJob && (
          <div className="mb-3 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{currentJob.title} · {currentJob.employerName}</div>
            <div>{currentJob.paymentType === 'monthly' ? '每轮自动发薪，不能重复普通工作。' : `按工时结算，每轮最多 ${currentJob.maxWorkPerRound} 次。`}</div>
            <div>消耗：健康 -{currentJob.healthCost} / 幸福 -{currentJob.happinessCost} / 疲劳 +{currentJob.fatigueCost}</div>
          </div>
        )}
        {forcedRestRounds > 0 && (
          <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
            强制休息中，剩余 {forcedRestRounds} 轮，期间无法进行任何操作。
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm">剩余工作次数: {workRemaining}/{workLimit}</span>
          {myPlayer.workState.fatigueLevel > 50 && (
            <Badge variant="destructive" className="text-xs">疲劳警告</Badge>
          )}
        </div>
        <Progress value={100 - myPlayer.workState.fatigueLevel} className="h-2 mb-2" />
        <p className="text-xs text-muted-foreground mb-2">
          疲劳度: {myPlayer.workState.fatigueLevel}/100
        </p>
        {isUnemployed && (
          <p className="text-xs text-red-600 mb-2">
            当前失业，剩余 {workerAbilities?.unemployedRounds} 个月，可做副业或等待再就业。
          </p>
        )}
        {myPlayer.health < 25 && forcedRestRounds <= 0 && (
          <p className="text-xs text-red-600 mb-2">
            健康值过低，当前不能工作。
          </p>
        )}
        <Button 
          className="w-full" 
          disabled={!canWork}
          onClick={() => sendAction({ type: 'WORK', payload: { playerId: myPlayer.id } })}
        >
          {isUnemployed ? '失业中，不能正式工作' : isMonthlyJob ? '月薪自动发放' : canWork ? `工作 (约 ¥${formatCurrency(wageLevel)})` : '本轮工作次数已用完'}
        </Button>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            disabled={myPlayer.cash < ECONOMY_BALANCE.worker.trainingCost}
            onClick={() => sendAction({ type: 'WORKER_TRAINING', payload: { playerId: myPlayer.id, cost: ECONOMY_BALANCE.worker.trainingCost } })}
          >
            培训
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => sendAction({ type: 'NEGOTIATE_WAGE', payload: { playerId: myPlayer.id } })}
          >
            谈薪
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!isMonthlyJob}
            onClick={() => sendAction({ type: 'OVERTIME_WORK', payload: { playerId: myPlayer.id } })}
          >
            加班
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => sendAction({ type: 'SIDE_JOB', payload: { playerId: myPlayer.id } })}
          >
            副业
          </Button>
        </div>
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
          {showJobOffers && jobOffers.map(offer => {
              const qualified = isQualifiedForJob(myPlayer, offer);
              const isCurrent = offer.id === workerAbilities?.currentJobId;
              return (
                <div key={offer.id} className="rounded-md border p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{offer.title}</div>
                      <div className="text-muted-foreground">{offer.employerName}</div>
                    </div>
                    <Badge variant={qualified ? 'default' : 'secondary'}>{qualified ? '符合' : '未达标'}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                    <span>{offer.paymentType === 'monthly' ? '月薪' : '时薪'} ¥{formatCurrency(offer.wage)}</span>
                    <span>{offer.paymentType === 'hourly' ? `${offer.maxWorkPerRound} 次/轮` : '自动发薪'}</span>
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
                    disabled={isCurrent || !qualified || myPlayer.cash < ECONOMY_BALANCE.worker.jobSwitchCost}
                    onClick={() => sendAction({ type: 'SWITCH_JOB', payload: { playerId: myPlayer.id, jobId: offer.id } })}
                  >
                    {isCurrent ? '当前岗位' : qualified ? '申请岗位' : '门槛不足'}
                  </Button>
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  // 非员工职业
  return (
    <div className="p-3 border rounded-lg">
      <h4 className="font-medium mb-2">💼 {profession.name} 行动</h4>
      <p className="text-sm text-muted-foreground">{profession.description}</p>
      <div className="mt-3 p-2 bg-muted/50 rounded text-sm">
        <div className="flex items-center gap-2">
          <span>{profession.icon}</span>
          <span>{profession.name}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {profession.incomeDescription}
        </p>
      </div>
    </div>
  );
}

// ==================== 健康面板 ====================
function HealthPanel({ myPlayer, sendAction, gameState }: { myPlayer: Player; sendAction: SendGameAction; gameState: GameState }) {
  const medicinePrice = gameState.market.goods.healthcare?.currentPrice || 300;
  const forcedRestRounds = myPlayer.workState.forcedRestRounds ?? 0;
  
  return (
    <div className="p-3 border rounded-lg">
      <h4 className="font-medium mb-3">❤️ 健康管理</h4>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm">健康值: {myPlayer.health}/100</p>
          {myPlayer.health < 50 && (
            <p className="text-xs text-red-500">健康状况不佳！</p>
          )}
          {forcedRestRounds > 0 && (
            <p className="text-xs text-red-500">强制休息剩余 {forcedRestRounds} 轮，结束后健康恢复到 30。</p>
          )}
          <p className="text-xs text-muted-foreground">每轮会自然恢复一些健康；疲劳过高会额外伤害健康。</p>
        </div>
        <Button 
          size="sm" 
          variant="outline"
          disabled={myPlayer.cash < medicinePrice}
          onClick={() => sendAction({ type: 'BUY_GOOD', payload: { playerId: myPlayer.id, goodType: 'healthcare', quantity: 1 } })}
        >
          🏥 药品 ¥{formatCurrency(medicinePrice)}
        </Button>
      </div>
    </div>
  );
}

// ==================== 住房面板 ====================
function HousingPanel({ myPlayer, sendAction }: { myPlayer: Player; sendAction: SendGameAction }) {
  const [selectedTier, setSelectedTier] = useState<HousingTier>('standard');
  const tiers: HousingTier[] = ['economy', 'standard', 'luxury'];

  return (
    <div className="p-3 border rounded-lg">
      <h4 className="font-medium mb-3">🏠 住房系统</h4>
      
      {/* 当前住房状态 */}
      <div className="mb-3 p-2 bg-muted/30 rounded">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              {myPlayer.housingStatus === 'owned' && myPlayer.housingTier && (
                <span className="text-green-600">
                  ✓ 已拥有 {HOUSING_CONFIGS[myPlayer.housingTier].icon} {HOUSING_CONFIGS[myPlayer.housingTier].name}
                </span>
              )}
              {myPlayer.housingStatus === 'renting' && myPlayer.housingTier && (
                <span className="text-orange-500">
                  🏠 租住中 {HOUSING_CONFIGS[myPlayer.housingTier].icon} {HOUSING_CONFIGS[myPlayer.housingTier].name}
                </span>
              )}
              {myPlayer.housingStatus === 'none' && (
                <span className="text-red-500">⚠️ 无住房</span>
              )}
            </p>
            {myPlayer.housingStatus === 'renting' && (
              <p className="text-xs text-muted-foreground">
                月租: ¥{formatCurrency(myPlayer.currentRent)} (每轮自动扣除)
              </p>
            )}
            {myPlayer.housingStatus === 'owned' && (
              <p className="text-xs text-green-600">
                已付清，永久享受住房加成
              </p>
            )}
          </div>
          {(myPlayer.housingStatus === 'renting' || myPlayer.housingStatus === 'owned') && (
            <Button 
              size="sm" 
              variant="destructive"
              onClick={() => {
                if (myPlayer.housingStatus === 'owned') {
                  sendAction({ type: 'SELL_HOUSE', payload: { playerId: myPlayer.id } });
                } else {
                  sendAction({ type: 'CANCEL_RENT', payload: { playerId: myPlayer.id } });
                }
              }}
            >
              {myPlayer.housingStatus === 'owned' ? '出售' : '退租'}
            </Button>
          )}
        </div>
      </div>

      {/* 住房档次选择 */}
      <div className="space-y-2">
        {tiers.map(tier => {
          const config = HOUSING_CONFIGS[tier];
          const canAffordRent = myPlayer.cash >= config.rentPrice;
          const canAffordBuy = myPlayer.cash >= config.purchasePrice;
          const isSelected = selectedTier === tier;
          const isCurrentTier = myPlayer.housingTier === tier;
          
          return (
            <div 
              key={tier}
              className={`p-2 border rounded-lg cursor-pointer transition-all text-sm ${
                isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'hover:border-gray-400'
              } ${isCurrentTier ? 'ring-2 ring-green-500' : ''}`}
              onClick={() => setSelectedTier(tier)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{config.icon}</span>
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
              <div className="flex items-center justify-between text-xs">
                <div className="flex gap-2 text-muted-foreground">
                  <span>租: ¥{formatCurrency(config.rentPrice)}</span>
                  <span>买: ¥{formatCurrency(config.purchasePrice)}</span>
                </div>
                {!isCurrentTier && (
                  <div className="flex gap-1">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={!canAffordRent || myPlayer.housingStatus === 'owned'}
                      onClick={(e) => {
                        e.stopPropagation();
                        sendAction({ type: 'RENT_HOUSE', payload: { playerId: myPlayer.id, tier } });
                      }}
                    >
                      租房
                    </Button>
                    <Button 
                      size="sm" 
                      className="h-7 text-xs"
                      disabled={!canAffordBuy}
                      onClick={(e) => {
                        e.stopPropagation();
                        sendAction({ type: 'BUY_HOUSE', payload: { playerId: myPlayer.id, tier } });
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
        💡 租房每月自动扣租，适合短期居住；买房一次性付清，永久享受加成
      </p>
    </div>
  );
}

// ==================== 市场购买面板 ====================
function MarketBuyPanel({ myPlayer, sendAction, gameState }: { myPlayer: Player; sendAction: SendGameAction; gameState: GameState }) {
  const [quantity, setQuantity] = useState<Record<string, number>>({});
  const [selectedGood, setSelectedGood] = useState<GoodType>('food');

  // 过滤掉住房商品（住房在专门的住房面板中处理）
  const consumableGoods = Object.entries(gameState.market.goods).filter(([key]) => key !== 'housing');
  
  const good = gameState.market.goods[selectedGood];
  const qty = quantity[selectedGood] || 1;
  const totalPrice = (good?.currentPrice || 0) * qty * (1 + gameState.market.inflationRate);

  return (
    <div className="p-3 border rounded-lg">
      <h4 className="font-medium mb-3">🛒 购买商品</h4>
      
      <div className="grid grid-cols-4 gap-2 mb-3">
        {(consumableGoods as [GoodType, GameState['market']['goods'][GoodType]][]).map(([key, g]) => (
          <Button
            key={key}
            size="sm"
            variant={selectedGood === key ? 'default' : 'outline'}
            className="h-14 min-w-0 whitespace-normal px-1 py-1"
            onClick={() => setSelectedGood(key as GoodType)}
          >
            <div className="flex min-w-0 flex-col items-center justify-center leading-tight">
              <div className="text-lg leading-none">{g.icon}</div>
              <div className="mt-1 w-full truncate text-xs">{g.name}</div>
            </div>
          </Button>
        ))}
      </div>

      {good && (
        <div className="p-2 bg-muted/50 rounded-lg mb-3">
          <div className="flex justify-between text-sm">
            <span>{good.icon} {good.name}</span>
            <span>¥{formatCurrency(good.currentPrice)}/件</span>
          </div>
          {good.essential && (
            <p className="text-xs text-orange-500 mt-1">⚠️ 必需品</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <Button size="sm" variant="outline" onClick={() => setQuantity(prev => ({ ...prev, [selectedGood]: Math.max(1, (prev[selectedGood] || 1) - 1) }))}>-</Button>
        <Input 
          type="number" 
          min={1} 
          value={qty} 
          onChange={(e) => setQuantity(prev => ({ ...prev, [selectedGood]: Math.max(1, parseInt(e.target.value) || 1) }))}
          className="w-20 text-center"
        />
        <Button size="sm" variant="outline" onClick={() => setQuantity(prev => ({ ...prev, [selectedGood]: (prev[selectedGood] || 1) + 1 }))}>+</Button>
        <span className="text-sm ml-auto">
          总价: ¥{formatCurrency(totalPrice)}
        </span>
      </div>

      <Button 
        className="w-full" 
        disabled={myPlayer.cash < totalPrice}
        onClick={() => sendAction({ type: 'BUY_GOOD', payload: { playerId: myPlayer.id, goodType: selectedGood, quantity: qty } })}
      >
        购买 {qty} 件
      </Button>
    </div>
  );
}

// ==================== 市场出售面板 ====================
function MarketSellPanel({ myPlayer, sendAction, gameState }: { myPlayer: Player; sendAction: SendGameAction; gameState: GameState }) {
  const [selectedGood, setSelectedGood] = useState<GoodType>('food');
  const [quantity, setQuantity] = useState(1);

  const owned = myPlayer.goods[selectedGood] || 0;
  const good = gameState.market.goods[selectedGood];
  const sellPrice = (good?.currentPrice || 0) * 0.85 * quantity;

  return (
    <div className="p-3 border rounded-lg">
      <h4 className="font-medium mb-3">💵 出售商品</h4>
      
      <div className="grid grid-cols-4 gap-2 mb-3">
        {(Object.entries(gameState.market.goods) as [GoodType, { icon: string; name: string }][]).map(([key, g]) => {
          return (
            <Button
              key={key}
              size="sm"
              variant={selectedGood === key ? 'default' : 'outline'}
              className="h-14 min-w-0 whitespace-normal px-1 py-1"
              onClick={() => setSelectedGood(key)}
            >
              <div className="flex min-w-0 flex-col items-center justify-center leading-tight">
                <div className="text-lg leading-none">{g.icon}</div>
                <div className="mt-1 w-full truncate text-xs">库存:{myPlayer.goods[key] || 0}</div>
              </div>
            </Button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Button size="sm" variant="outline" disabled={quantity <= 1} onClick={() => setQuantity(q => q - 1)}>-</Button>
        <Input 
          type="number" 
          min={1} 
          max={owned}
          value={quantity} 
          onChange={(e) => setQuantity(Math.min(owned, Math.max(1, parseInt(e.target.value) || 1)))}
          className="w-20 text-center"
        />
        <Button size="sm" variant="outline" disabled={quantity >= owned} onClick={() => setQuantity(q => q + 1)}>+</Button>
        <span className="text-sm ml-auto">
          售出价: ¥{formatCurrency(sellPrice)}
        </span>
      </div>

      <Button 
        className="w-full" 
        variant="outline"
        disabled={owned < quantity}
        onClick={() => sendAction({ type: 'SELL_GOOD', payload: { playerId: myPlayer.id, goodType: selectedGood, quantity } })}
      >
        出售 {quantity} 件给市场
      </Button>
    </div>
  );
}

// ==================== 投资面板 ====================
function InvestmentPanel({ myPlayer, sendAction, gameState }: { myPlayer: Player; sendAction: SendGameAction; gameState: GameState }) {
  const [investmentType, setInvestmentType] = useState<InvestmentType>('stock');
  const [amount, setAmount] = useState('10000');

  const isInvestor = myPlayer.profession === 'investor';
  const investorAbilities = myPlayer.investorAbilities;
  const types: InvestmentType[] = ['stock', 'bond', 'gold', 'deposit'];
  const config = INVESTMENT_CONFIGS[investmentType];
  const investmentAmount = parseInt(amount) || 0;
  const transactionFee = Math.round(investmentAmount * ECONOMY_BALANCE.investment.transactionFeeRate);
  const totalInvestmentCost = investmentAmount + transactionFee;

  // 学习费用计算
  const getLearningCost = () => {
    if (!investorAbilities) return 0;
    const skill = investorAbilities.investmentSkill;
    return Math.floor(500 + skill * 5);
  };

  const learningCost = getLearningCost();
  const learningEffect = investorAbilities ? Math.max(3, 10 - Math.floor(investorAbilities.investmentSkill / 20)) : 0;

  return (
    <div className="space-y-3">
      {/* 经济周期信息 - 投资者可看到详细信息 */}
      {isInvestor ? (
        <div className="p-3 border rounded-lg bg-gradient-to-r from-cyan-50 to-cyan-100 dark:from-cyan-950/30 dark:to-cyan-900/30">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium flex items-center gap-2">
              {CYCLE_NAMES[gameState.market.economicCycle].icon} 经济周期: {CYCLE_NAMES[gameState.market.economicCycle].name}
              <Badge variant="outline" className="text-xs bg-cyan-50">投资者可见</Badge>
            </h4>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            {CYCLE_NAMES[gameState.market.economicCycle].description}
          </p>
          <div className="mt-2 p-2 bg-white/50 dark:bg-black/20 rounded text-xs">
            <div className="font-medium text-green-600">
              💡 投资者技能加成：+{(investorAbilities?.investmentSkill || 0) / 2}% 收益
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 border rounded-lg bg-muted/30">
          <h4 className="font-medium mb-1 text-muted-foreground">
            {CYCLE_NAMES[gameState.market.economicCycle].icon} 经济周期: {CYCLE_NAMES[gameState.market.economicCycle].name}
          </h4>
          <p className="text-xs text-muted-foreground">
            其他玩家无法查看详细经济形势（投资者可查看）
          </p>
        </div>
      )}

      {isInvestor && (
        <AssetPricingPanel gameState={gameState} selectedType={investmentType} />
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
              onClick={() => sendAction({ type: 'INVESTMENT_STUDY', payload: { playerId: myPlayer.id, cost: learningCost } })}
              disabled={myPlayer.cash < learningCost || investorAbilities.investmentSkill >= 100}
            >
              参加培训 ¥{formatCurrency(learningCost)}
            </Button>
          </div>
          
          {investorAbilities.investmentSkill >= 100 && (
            <p className="text-xs text-center text-green-600 mt-2 font-medium">🎉 已达到最高投资技能等级！</p>
          )}
        </div>
      )}

      {/* 投资选择 */}
      <div className="p-3 border rounded-lg">
        <h4 className="font-medium mb-3">💰 新投资</h4>
        
        <div className="grid grid-cols-4 gap-2 mb-3">
          {types.map(type => {
            const cfg = INVESTMENT_CONFIGS[type];
            return (
              <Button
                key={type}
                size="sm"
                variant={investmentType === type ? 'default' : 'outline'}
                className="h-14 min-w-0 whitespace-normal px-1 py-1"
                onClick={() => setInvestmentType(type)}
              >
                <div className="flex min-w-0 flex-col items-center justify-center leading-tight">
                  <div className="text-lg leading-none">{cfg.icon}</div>
                  <div className="mt-1 w-full truncate text-xs">{cfg.name}</div>
                </div>
              </Button>
            );
          })}
        </div>

        <div className="p-2 bg-muted/50 rounded-lg mb-3 text-sm">
          <div className="flex justify-between">
            <span>{config.icon} {config.name}</span>
            <span>收益率: {formatPercent(config.baseReturn, 0)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {config.description} | 风险权重 {config.riskWeight.toFixed(2)} | 手续费约 ¥{formatCurrency(transactionFee)}
          </p>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Input 
            type="text"
            placeholder="输入金额"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32"
          />
        </div>

        <div className="flex gap-2 mb-3">
          {[1000, 5000, 10000].map(val => (
            <Button key={val} size="sm" variant="outline" onClick={() => setAmount(val.toString())}>
              ¥{val.toLocaleString()}
            </Button>
          ))}
        </div>

        <Button 
          className="w-full" 
          disabled={investmentAmount < 100 || myPlayer.cash < totalInvestmentCost}
          onClick={() => {
            if (investmentAmount >= 100) {
              sendAction({ type: 'INVEST', payload: { playerId: myPlayer.id, investmentType, amount: investmentAmount } });
              setAmount('10000');
            }
          }}
        >
          投资 ¥{formatCurrency(investmentAmount)}
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          盈利变现税率 {formatPercent(ECONOMY_BALANCE.investment.capitalGainsTaxRate, 0)}%，技能越高，市场误判概率越低。
        </p>
      </div>
    </div>
  );
}

// ==================== 投资列表 ====================
function InvestmentList({ myPlayer, sendAction }: { myPlayer: Player; sendAction: SendGameAction }) {
  if (myPlayer.assets.length === 0) {
    return (
      <div className="p-3 border rounded-lg text-center text-muted-foreground">
        <p>暂无投资，点击上方进行投资</p>
      </div>
    );
  }

  // 按类型分组
  const assetsByType = myPlayer.assets.reduce<Record<string, Player['assets']>>((acc, asset) => {
    if (!acc[asset.type]) acc[asset.type] = [];
    acc[asset.type].push(asset);
    return acc;
  }, {});

  return (
    <div className="p-3 border rounded-lg">
      <h4 className="font-medium mb-3">📊 我的投资</h4>
      
      {Object.entries(assetsByType).map(([type, assets]) => {
        const config = INVESTMENT_CONFIGS[type as InvestmentType];
        const totalValue = assets.reduce((sum, asset) => sum + asset.currentValue, 0);
        
        return (
          <div key={type} className="mb-3 p-2 bg-muted/50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium">
                {config?.icon} {config?.name}
              </span>
              <span className="text-sm">总计: ¥{formatCurrency(totalValue)}</span>
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => sendAction({ type: 'CASH_OUT_ALL_INVESTMENT', payload: { playerId: myPlayer.id, type } })}
              >
                全部赎回
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BankPanel({ myPlayer, sendAction, gameState }: { myPlayer: Player; sendAction: SendGameAction; gameState: GameState }) {
  const [loanAmount, setLoanAmount] = useState('10000');
  const amount = parseInt(loanAmount) || 0;
  const bank = gameState.market.bank;
  const loans = myPlayer.loans ?? [];
  const totalDebt = loans.reduce((sum, loan) => sum + loan.remaining, 0);

  return (
    <div className="p-3 border rounded-lg">
      <h4 className="font-medium mb-3">🏦 银行与信贷</h4>
      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div className="bg-muted/50 rounded p-2 text-center">
          <div className="font-bold">{formatPercent(bank?.centralBankRate ?? ECONOMY_BALANCE.bank.baseRate, 2)}%</div>
          <div className="text-muted-foreground">央行月利率</div>
        </div>
        <div className="bg-muted/50 rounded p-2 text-center">
          <div className="font-bold">{myPlayer.creditScore ?? 70}</div>
          <div className="text-muted-foreground">信用分</div>
        </div>
        <div className="bg-muted/50 rounded p-2 text-center">
          <div className="font-bold">¥{formatCurrency(totalDebt)}</div>
          <div className="text-muted-foreground">负债</div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <CreditMetric label="消费贷审批" value={formatPercent(gameState.market.creditConditions.consumerApprovalRate ?? 0.62, 0)} tone={(gameState.market.creditConditions.consumerApprovalRate ?? 0.62) > 0.55 ? 'good' : 'warn'} />
        <CreditMetric label="企业贷审批" value={formatPercent(gameState.market.creditConditions.businessApprovalRate ?? 0.58, 0)} tone={(gameState.market.creditConditions.businessApprovalRate ?? 0.58) > 0.5 ? 'good' : 'warn'} />
        <CreditMetric label="房贷审批" value={formatPercent(gameState.market.creditConditions.mortgageApprovalRate, 0)} tone={gameState.market.creditConditions.mortgageApprovalRate > 0.55 ? 'good' : 'warn'} />
        <CreditMetric label="抵押折扣" value={formatPercent(gameState.market.creditConditions.collateralHaircut ?? 0.28, 0)} tone={(gameState.market.creditConditions.collateralHaircut ?? 0.28) > 0.45 ? 'bad' : 'default'} />
        <CreditMetric label="风险溢价" value={formatPercent(gameState.market.creditConditions.riskPremium ?? 0.018, 2)} tone={(gameState.market.creditConditions.riskPremium ?? 0.018) > 0.04 ? 'bad' : 'default'} />
        <CreditMetric label="坏账压力" value={formatPercent(gameState.market.creditConditions.badDebtPressure ?? 0.12, 0)} tone={(gameState.market.creditConditions.badDebtPressure ?? 0.12) > 0.45 ? 'bad' : 'default'} />
      </div>

      <div className="flex items-center gap-2 mb-2">
        <Input value={loanAmount} onChange={(event) => setLoanAmount(event.target.value)} className="w-28" />
        <Button size="sm" variant="outline" disabled={amount < 1000} onClick={() => sendAction({ type: 'TAKE_LOAN', payload: { playerId: myPlayer.id, loanType: 'consumer', amount } })}>
          消费贷
        </Button>
        <Button size="sm" variant="outline" disabled={amount < 1000 || myPlayer.housingStatus !== 'owned'} onClick={() => sendAction({ type: 'TAKE_LOAN', payload: { playerId: myPlayer.id, loanType: 'mortgage', amount } })}>
          房贷
        </Button>
        <Button size="sm" variant="outline" disabled={amount < 1000 || !myPlayer.company} onClick={() => sendAction({ type: 'TAKE_LOAN', payload: { playerId: myPlayer.id, loanType: 'business', amount } })}>
          企业贷
        </Button>
      </div>

      {loans.length > 0 && (
        <div className="space-y-2 mt-3">
          {loans.map(loan => (
            <div key={loan.id} className="flex items-center justify-between p-2 bg-muted/40 rounded text-xs">
              <span>{loan.type} ¥{formatCurrency(loan.remaining)} / 月息 {formatPercent(loan.monthlyRate, 2)}%</span>
              <Button size="sm" variant="outline" disabled={myPlayer.cash <= 0} onClick={() => sendAction({ type: 'REPAY_LOAN', payload: { playerId: myPlayer.id, loanId: loan.id, amount: Math.min(myPlayer.cash, loan.remaining) } })}>
                尽量还款
              </Button>
            </div>
          ))}
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

// ==================== 职业特殊功能面板 ====================
function SpecialProfessionPanel({ myPlayer, sendAction, gameState }: { myPlayer: Player; sendAction: SendGameAction; gameState: GameState }) {
  const profession = myPlayer.profession;
  const [saleProductType, setSaleProductType] = useState<ProductionGoodType>('daily_necessities');

  if (profession === 'worker') {
    return (
      <div className="p-3 border rounded-lg text-center text-muted-foreground">
        <p>👷 员工职业没有特殊功能</p>
        <p className="text-sm mt-2">专注工作，积累财富</p>
      </div>
    );
  }

  if (profession === 'entrepreneur' && myPlayer.company) {
    const company = myPlayer.company;
    const productInventory = getProductInventory(company);
    const saleConfig = PRODUCTION_CONFIGS[saleProductType];
    const saleInventory = productInventory[saleProductType] || 0;
    const lockedSalePrice = company.priceDecisions?.[saleProductType]?.round === gameState.currentRound
      ? company.priceDecisions[saleProductType]?.price
      : undefined;
    const currentSaleRecord = company.salesDecisions?.[saleProductType]?.round === gameState.currentRound
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
    const totalCapacity = getCompanyCapacityUnits(company);
    const remainingCapacity = Math.max(0, totalCapacity - (company.productionUsedThisRound || 0));
    const productionUnitCashCost = getUnitProcessingCost(company.productionType);
    const currentRoundSales = Object.values(company.salesDecisions ?? {}).filter((sale) => sale?.round === gameState.currentRound);
    const actualRoundGrossRevenue = currentRoundSales.reduce((total, sale) => total + (sale?.grossRevenue ?? 0), 0);
    const actualRoundNetRevenue = currentRoundSales.reduce((total, sale) => total + (sale?.netRevenue ?? 0), 0);
    const actualRoundSold = currentRoundSales.reduce((total, sale) => total + (sale?.sold ?? 0), 0);
    const potentialInventoryRevenue = productionGoodTypes.reduce((total, type) => {
      const stock = productInventory[type] || 0;
      if (stock <= 0) return total;
      return total + findBestSaleOption(gameState.market, company, type, stock).netRevenue;
    }, 0);
    const estimatedOperatingCost =
      company.employees * (company.productionCost || ECONOMY_BALANCE.company.wagePerEmployee) +
      company.machines * MACHINE_CONFIGS.basic.maintenanceCost;
    const profitBasisRevenue = currentRoundSales.length > 0 ? actualRoundNetRevenue : potentialInventoryRevenue;
    const estimatedGrossProfit = profitBasisRevenue - estimatedOperatingCost;
    
    return (
      <div className="space-y-3">
        {/* 企业信息概览 */}
        <div className="p-3 border rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium flex items-center gap-2">
              🏢 {company.name || '我的企业'}
              <Badge variant="outline" className="text-xs bg-amber-50">企业家</Badge>
            </h4>
            <div className="text-right">
              <div className="font-bold text-amber-600">¥{formatCurrency(company.profit)}</div>
              <div className="text-xs text-muted-foreground">利润率</div>
            </div>
          </div>
          
          <div className="grid grid-cols-5 gap-2 text-sm">
            <div className="bg-white/50 dark:bg-black/20 rounded p-2 text-center">
              <div className="text-lg font-bold">{company.employees}</div>
              <div className="text-xs text-muted-foreground">员工</div>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded p-2 text-center">
              <div className="text-lg font-bold">{company.machines}</div>
              <div className="text-xs text-muted-foreground">机器</div>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded p-2 text-center">
              <div className="text-lg font-bold">{totalCapacity}</div>
              <div className="text-xs text-muted-foreground">总产能</div>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded p-2 text-center">
              <div className="text-lg font-bold">{company.rawMaterials || 0}</div>
              <div className="text-xs text-muted-foreground">原材料</div>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded p-2 text-center">
              <div className="text-lg font-bold">{company.reputation}</div>
              <div className="text-xs text-muted-foreground">声誉</div>
            </div>
          </div>
        </div>

        {/* 生产线管理 */}
        <div className="p-3 border rounded-lg">
          <h5 className="font-medium mb-2 flex items-center gap-2">
            ⚙️ 生产线
          </h5>
          
          <div className="grid grid-cols-2 gap-2">
            <Button 
              size="sm" 
              variant="outline"
              disabled={myPlayer.cash < ECONOMY_BALANCE.company.hiringCostPerEmployee}
              onClick={() => sendAction({ type: 'HIRE_EMPLOYEE', payload: { playerId: myPlayer.id, count: 1 } })}
            >
              👷 招聘员工 (¥{formatCurrency(ECONOMY_BALANCE.company.hiringCostPerEmployee)})
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              disabled={company.employees <= 0}
              onClick={() => sendAction({ type: 'FIRE_EMPLOYEE', payload: { playerId: myPlayer.id, count: 1 } })}
            >
              🚫 解雇员工
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              disabled={myPlayer.cash < MACHINE_CONFIGS.basic.price}
              onClick={() => sendAction({ type: 'BUY_MACHINE', payload: { playerId: myPlayer.id, machineType: 'basic' } })}
            >
              ⚙️ 基础机器 (¥{formatCurrency(MACHINE_CONFIGS.basic.price)})
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              disabled={company.machines <= 0}
              onClick={() => sendAction({ type: 'UPGRADE_MACHINE', payload: { playerId: myPlayer.id } })}
            >
              🔧 升级机器 (¥15,000)
            </Button>
          </div>

          <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
            <div className="flex justify-between">
              <span>员工产能:</span>
              <span>每人 {ECONOMY_BALANCE.company.employeeCapacity} 产能点/月</span>
            </div>
            <div className="flex justify-between">
              <span>机器产能:</span>
              <span>基础每台 {ECONOMY_BALANCE.company.machineCapacity} 产能点/月</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={() => sendAction({ type: 'ADJUST_WAGES', payload: { playerId: myPlayer.id, amount: ECONOMY_BALANCE.company.wagePerEmployee * 1.1 } })}>
              提薪 10%
            </Button>
            <Button size="sm" variant="outline" disabled={myPlayer.cash < ECONOMY_BALANCE.company.qualityUpgradeCost} onClick={() => sendAction({ type: 'UPGRADE_QUALITY', payload: { playerId: myPlayer.id, amount: ECONOMY_BALANCE.company.qualityUpgradeCost } })}>
              升级质量
            </Button>
          </div>
        </div>

        {/* 原材料采购 */}
        <div className="p-3 border rounded-lg">
          <h5 className="font-medium mb-2 flex items-center gap-2">
            📦 原材料采购
          </h5>
          <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-muted/40 p-2">
              <div className="text-muted-foreground">原料动态单价</div>
              <div className="font-medium">¥{formatCurrency(getMaterialUnitPrice(100, company, gameState.market))}</div>
            </div>
            <div className="rounded bg-muted/40 p-2">
              <div className="text-muted-foreground">上游指数/短缺</div>
              <div className="font-medium">
                {Math.round(gameState.market.supplyChain.layers.basicMaterials.priceIndex)} / {formatPercent(gameState.market.supplyChain.layers.basicMaterials.shortage, 1)}%
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            {[50, 200].map(quantity => {
              const totalCost = getMaterialPurchaseCost(quantity, company, gameState.market);
              return (
                <Button 
                  key={quantity}
                  size="sm" 
                  variant="outline"
                  disabled={myPlayer.cash < totalCost}
                  onClick={() => sendAction({ type: 'BUY_MATERIALS', payload: { playerId: myPlayer.id, quantity } })}
                >
                  采购 {quantity} 单位 (¥{formatCurrency(totalCost)})
                </Button>
              );
            })}
          </div>
          
          <div className="mt-2 text-xs text-muted-foreground">
            当前约 ¥{formatCurrency(getMaterialUnitPrice(100, company, gameState.market))}/单位；批量采购和适度规模会降低单价，过度扩张会推高土地与物流成本。当前持有: {company.rawMaterials || 0} 单位
          </div>
        </div>

        {/* 生产与销售 */}
        <div className="p-3 border rounded-lg">
          <h5 className="font-medium mb-2 flex items-center gap-2">
            🏭 生产管理
          </h5>
          
          {/* 产能信息 */}
          {(() => {
            const usedThisRound = company.productionUsedThisRound || 0;
            const maxByCapacity = getMaxProductionByCapacity(totalCapacity, usedThisRound, company.productionType);
            const maxByMaterials = Math.floor((company.rawMaterials || 0) / PRODUCTION_CONFIGS[company.productionType].materialConsumption);
            const maxByCash = Math.floor(myPlayer.cash / productionUnitCashCost);
            const maxProduction = Math.min(maxByCapacity, maxByMaterials, maxByCash);
            
            return (
              <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-xs">
                <div className="flex justify-between font-medium">
                  <span>本轮可生产:</span>
                  <span className="text-blue-600">{maxProduction} 件</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>总产能:</span>
                  <span>{totalCapacity} 点</span>
                </div>
                <div className="flex justify-between">
                  <span>已使用:</span>
                  <span className="text-orange-600">-{usedThisRound} 点</span>
                </div>
                <div className="flex justify-between">
                  <span>剩余产能:</span>
                  <span>{remainingCapacity} 点</span>
                </div>
                <div className="flex justify-between">
                  <span>原材料限制:</span>
                  <span>{maxByMaterials} 件</span>
                </div>
                <div className="flex justify-between">
                  <span>资金限制:</span>
                  <span>{maxByCash} 件</span>
                </div>
                <div className="flex justify-between">
                  <span>员工贡献:</span>
                  <span>{company.employees} 人 × {ECONOMY_BALANCE.company.employeeCapacity} = {company.employees * ECONOMY_BALANCE.company.employeeCapacity} 点</span>
                </div>
                <div className="flex justify-between">
                  <span>机器贡献:</span>
                  <span>{company.machines} 台 × {ECONOMY_BALANCE.company.machineCapacity} = {company.machines * ECONOMY_BALANCE.company.machineCapacity} 点</span>
                </div>
              </div>
            );
          })()}
          
          {/* 生产类型选择 */}
          <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-1">选择生产类型:</div>
            <div className="grid grid-cols-4 gap-1">
              {[
                ...productionGoodTypes.map((type) => {
                  const config = PRODUCTION_CONFIGS[type];
                  return {
                    id: type,
                    icon: config.icon,
                    name: config.name,
                    cost: Math.round(getEstimatedUnitVariableCost(type, company, 100, gameState.market)),
                  };
                }),
              ].map(type => (
                <Button
                  key={type.id}
                  size="sm"
                  variant={company.productionType === type.id ? 'default' : 'outline'}
                  className="h-16 min-w-0 whitespace-normal px-1 py-1 text-xs"
                  onClick={() => sendAction({ type: 'SET_PRODUCTION_TYPE', payload: { playerId: myPlayer.id, productionType: type.id } })}
                >
                  <div className="flex min-w-0 flex-col items-center justify-center leading-tight">
                    <div className="text-lg leading-none">{type.icon}</div>
                    <div className="mt-1 w-full truncate text-xs">{type.name}</div>
	                    <div className="mt-0.5 w-full truncate text-xs text-muted-foreground">¥{type.cost}/件</div>
                  </div>
                </Button>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            {/* 生产数量输入 */}
            <div className="flex items-center gap-2">
              <Input 
                type="number" 
                placeholder="输入数量"
                min={1}
                max={(() => {
                  return Math.min(
                    getMaxProductionByCapacity(totalCapacity, company.productionUsedThisRound || 0, company.productionType),
                    Math.floor((company.rawMaterials || 0) / PRODUCTION_CONFIGS[company.productionType].materialConsumption),
                    Math.floor(myPlayer.cash / productionUnitCashCost),
                  );
                })()}
                defaultValue={(() => {
                  return Math.min(
                    5,
                    getMaxProductionByCapacity(totalCapacity, company.productionUsedThisRound || 0, company.productionType),
                    Math.floor((company.rawMaterials || 0) / PRODUCTION_CONFIGS[company.productionType].materialConsumption),
                    Math.floor(myPlayer.cash / productionUnitCashCost),
                  );
                })()}
                className="w-24"
                id="produce-quantity"
              />
              <Button 
                size="sm" 
                variant="default"
                className="flex-1"
                disabled={
	                  getMaxProductionByCapacity(totalCapacity, company.productionUsedThisRound || 0, company.productionType) === 0 || 
	                  (company.rawMaterials || 0) === 0 || 
	                  myPlayer.cash < productionUnitCashCost
                }
                onClick={() => {
                  const input = document.getElementById('produce-quantity') as HTMLInputElement;
                  const maxVal = Math.max(0, Math.min(
	                    getMaxProductionByCapacity(totalCapacity, company.productionUsedThisRound || 0, company.productionType),
	                    Math.floor((company.rawMaterials || 0) / PRODUCTION_CONFIGS[company.productionType].materialConsumption),
	                    Math.floor(myPlayer.cash / productionUnitCashCost)
                  ));
                  const quantity = Math.min(parseInt(input?.value) || 1, maxVal);
                  sendAction({ type: 'PRODUCE_GOODS', payload: { playerId: myPlayer.id, quantity } });
                }}
              >
                📦 生产商品
              </Button>
            </div>
            
            <div className="p-2 bg-muted/50 rounded text-sm">
              <div className="flex justify-between">
                <span>库存商品:</span>
                <span className="font-bold">{company.inventory || 0} 件</span>
              </div>
              <div className="flex justify-between">
                <span>原材料:</span>
                <span>{company.rawMaterials || 0} 单位</span>
              </div>
            </div>
          </div>
        </div>

        {/* 产品销售 */}
        <div className="p-3 border rounded-lg">
          <h5 className="font-medium mb-2 flex items-center gap-2">
            💰 产品销售
          </h5>
          
          <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded mb-3">
            <div className="flex justify-between text-sm">
              <span>公司总库存:</span>
              <span className="font-bold text-green-600">{company.inventory || 0} 件</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
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
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{saleConfig.name} 售价范围:</span>
              <span>¥{formatCurrency(saleConfig.minSellingPrice)} - ¥{formatCurrency(saleConfig.maxSellingPrice)}/件</span>
            </div>
            {currentSaleRecord && (
              <div className="mt-1 text-xs text-amber-600">
                本轮已提交销售：成交 {currentSaleRecord.sold}/{currentSaleRecord.requested} 件，税后收入 ¥{formatCurrency(currentSaleRecord.netRevenue)}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 mb-3">
            <Input 
              type="number" 
              placeholder="数量"
              min={1}
              max={saleInventory}
              disabled={hasSoldThisRound}
              className="w-20"
              id="sell-quantity"
            />
            <span className="text-sm">件 @ ¥</span>
            <Input 
              key={`${saleProductType}-${lockedSalePrice ?? 'free'}`}
              type="number" 
              placeholder="单价"
              min={saleConfig.minSellingPrice}
              max={saleConfig.maxSellingPrice}
              defaultValue={effectiveDefaultSalePrice}
              disabled={hasSoldThisRound}
              className="w-24"
              id="sell-price"
            />
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
                    : estimateProductSales(gameState.market, company, saleProductType, saleInventory, price);
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
                const qtyInput = document.getElementById('sell-quantity') as HTMLInputElement;
                const priceInput = document.getElementById('sell-price') as HTMLInputElement;
                const quantity = Math.min(parseInt(qtyInput?.value) || 1, saleInventory);
                const price = parseInt(priceInput?.value) || saleConfig.baseSellingPrice;
                sendAction({ type: 'SELL_COMPANY_PRODUCT', payload: { playerId: myPlayer.id, quantity, pricePerUnit: price, productType: saleProductType } });
              }}
            >
              出售{saleConfig.name}
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              disabled={saleInventory === 0 || hasSoldThisRound}
              onClick={() => {
                const bestOption = findBestSaleOption(gameState.market, company, saleProductType, saleInventory);
                sendAction({ type: 'SELL_COMPANY_PRODUCT', payload: { playerId: myPlayer.id, quantity: saleInventory, pricePerUnit: bestOption.price, productType: saleProductType } });
              }}
            >
              全部出售该商品
            </Button>
          </div>
          
          <div className="mt-2 text-xs text-muted-foreground">
            📌 每轮每个商品只能提交一次销售；提交后利润按本轮实际成交数量计算，市场税率 {formatPercent(ECONOMY_BALANCE.company.salesTaxRate, 0)}%
          </div>
        </div>

        {/* 市场运营 */}
        <div className="p-3 border rounded-lg">
          <h5 className="font-medium mb-2 flex items-center gap-2">
            📢 市场运营
          </h5>
          
          <div className="grid grid-cols-2 gap-2">
            <Button 
              size="sm" 
              variant="outline"
              disabled={myPlayer.cash < 1000}
              onClick={() => sendAction({ type: 'ADVERTISE', payload: { playerId: myPlayer.id, amount: 1000 } })}
            >
              📣 小额广告 (¥1,000) +5声誉
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              disabled={myPlayer.cash < 5000}
              onClick={() => sendAction({ type: 'ADVERTISE', payload: { playerId: myPlayer.id, amount: 5000 } })}
            >
              📺 大幅广告 (¥5,000) +30声誉
            </Button>
          </div>
          
          <div className="mt-2 text-xs text-muted-foreground">
            声誉会提升销量并增强高价承受度 | 声誉满 100 时需求系数最高可到 2.0x
          </div>
        </div>

        {/* 成本收益分析 */}
        <div className="p-3 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
          <h5 className="font-medium mb-2">📊 成本收益分析</h5>
          
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span>{currentRoundSales.length > 0 ? '本轮实际税后收入:' : '库存按最优售价估算税后收入:'}</span>
              <span className="text-green-600">+¥{formatCurrency(profitBasisRevenue)}</span>
            </div>
            {currentRoundSales.length > 0 && (
              <>
                <div className="flex justify-between">
                  <span>本轮实际成交:</span>
                  <span>{actualRoundSold} 件</span>
                </div>
                <div className="flex justify-between">
                  <span>本轮销售额:</span>
                  <span>¥{formatCurrency(actualRoundGrossRevenue)}</span>
                </div>
              </>
            )}
            {currentRoundSales.length === 0 && (
              <div className="flex justify-between">
                <span>说明:</span>
                <span className="text-muted-foreground">提交销售后改按实际成交计算</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>市场税费:</span>
              <span className="text-red-500">-¥{formatCurrency(Math.max(0, actualRoundGrossRevenue - actualRoundNetRevenue))}</span>
            </div>
            <div className="flex justify-between">
              <span>员工成本:</span>
              <span className="text-red-500">-¥{formatCurrency(company.employees * (company.productionCost || ECONOMY_BALANCE.company.wagePerEmployee))}/月</span>
            </div>
            <div className="flex justify-between">
              <span>机器折旧:</span>
              <span className="text-red-500">-¥{formatCurrency(company.machines * MACHINE_CONFIGS.basic.maintenanceCost)}/月</span>
            </div>
            <div className="flex justify-between">
              <span>固定与持有成本:</span>
              <span className="text-red-500">-¥{formatCurrency(company.fixedCosts + company.inventoryHoldingCost + company.depreciation)}</span>
            </div>
            <div className="flex justify-between">
              <span>营业利润:</span>
              <span className={company.incomeStatement.operatingProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                {company.incomeStatement.operatingProfit >= 0 ? '+' : '-'}¥{formatCurrency(Math.abs(company.incomeStatement.operatingProfit))}
              </span>
            </div>
            <div className="flex justify-between border-t pt-1 font-medium">
              <span>{currentRoundSales.length > 0 ? '本轮实际毛利:' : '预计毛利:'}</span>
              <span className={estimatedGrossProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                {estimatedGrossProfit >= 0 ? '+' : '-'}¥{formatCurrency(Math.abs(estimatedGrossProfit))}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (profession === 'government') {
    const govAbilities = myPlayer.govAbilities;
    const treasuryBalance = myPlayer.govAbilities?.treasuryBalance || 0;
    
    // 税率建议
    const getTaxAdvice = () => {
      const rate = gameState.market.globalTaxRate;
      if (rate < 0.1) return { text: '税率过低，财政收入不足', color: 'text-yellow-600' };
      if (rate > 0.35) return { text: '税率过高，经济活力下降', color: 'text-red-600' };
      if (gameState.market.socialStability < 40) return { text: '社会稳定度低，考虑降税', color: 'text-orange-600' };
      return { text: '税率适中，经济平稳', color: 'text-green-600' };
    };

    return (
      <div className="space-y-3">
        {/* 政府信息概览 */}
        <div className="p-3 border rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium flex items-center gap-2">
              🏛️ 政府调控中心
              <Badge variant="outline" className="text-xs bg-blue-50">政府官员</Badge>
            </h4>
            <div className="text-right">
              <div className="font-bold text-blue-600">¥{formatCurrency(treasuryBalance)}</div>
              <div className="text-xs text-muted-foreground">国库</div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="bg-white/50 dark:bg-black/20 rounded p-2 text-center">
              <div className="text-lg font-bold">{formatPercent(gameState.market.globalTaxRate, 0)}</div>
              <div className="text-xs text-muted-foreground">当前税率</div>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded p-2 text-center">
              <div className="text-lg font-bold">{gameState.market.socialStability}</div>
              <div className="text-xs text-muted-foreground">社会稳定</div>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded p-2 text-center">
              <div className="text-lg font-bold">{govAbilities?.publicFunds || 0}</div>
              <div className="text-xs text-muted-foreground">公共基金</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs mt-2">
            <div className="bg-white/50 dark:bg-black/20 rounded p-2">
              <div className="text-muted-foreground">政府声誉</div>
              <div className="font-bold">{Math.round(govAbilities?.reputation ?? 60)}</div>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded p-2">
              <div className="text-muted-foreground">支持率</div>
              <div className="font-bold">{Math.round(govAbilities?.approvalRating ?? 60)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs mt-2">
            <div className="bg-white/50 dark:bg-black/20 rounded p-2">
              <div className="text-muted-foreground">本月税收</div>
              <div className="font-bold">¥{formatCurrency(gameState.market.monthlyTaxRevenue ?? 0)}</div>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded p-2">
              <div className="text-muted-foreground">央行月利率</div>
              <div className="font-bold">{formatPercent(gameState.market.bank?.centralBankRate ?? ECONOMY_BALANCE.bank.baseRate, 2)}%</div>
            </div>
          </div>

          <div className={`mt-2 text-xs ${getTaxAdvice().color}`}>
            💡 {getTaxAdvice().text}
          </div>
          {gameState.victoryScores?.[myPlayer.id] && (
            <div className="mt-2 text-xs text-muted-foreground">
              目标: {gameState.victoryScores[myPlayer.id].goal} · 分数 {Math.round(gameState.victoryScores[myPlayer.id].score)}
            </div>
          )}
        </div>

        {myPlayer.govAbilities && (
          <GovernmentFeedbackPanel government={myPlayer} gameState={gameState} />
        )}

        {/* 税收政策 */}
        <div className="p-3 border rounded-lg">
          <h5 className="font-medium mb-2 flex items-center gap-2">
            📋 税收政策
          </h5>
          
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => sendAction({ type: 'SET_TAX_RATE', payload: { playerId: myPlayer.id, rate: Math.max(0.05, gameState.market.globalTaxRate - 0.05) } })}
            >
              📉 降低税率 5%
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => sendAction({ type: 'SET_TAX_RATE', payload: { playerId: myPlayer.id, rate: Math.min(0.4, gameState.market.globalTaxRate + 0.05) } })}
            >
              📈 提高税率 5%
            </Button>
          </div>
          
          {/* 预设税率方案 */}
          <div className="p-2 bg-muted/50 rounded text-xs space-y-1">
            <div className="font-medium mb-1">快速方案:</div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => sendAction({ type: 'SET_TAX_RATE', payload: { playerId: myPlayer.id, rate: 0.1 } })}>
                低税 10%
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => sendAction({ type: 'SET_TAX_RATE', payload: { playerId: myPlayer.id, rate: 0.2 } })}>
                中税 20%
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => sendAction({ type: 'SET_TAX_RATE', payload: { playerId: myPlayer.id, rate: 0.3 } })}>
                高税 30%
              </Button>
            </div>
          </div>
        </div>

        {/* 延迟生效政策 */}
        <div className="p-3 border rounded-lg">
          <h5 className="font-medium mb-2 flex items-center gap-2">
            📜 政策制定
            <Badge variant="outline" className="text-xs">下一轮生效</Badge>
          </h5>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(POLICY_CONFIGS) as [PolicyType, typeof POLICY_CONFIGS.tax_raise][]).slice(0, 6).map(([type, policy]) => {
              const cooldown = myPlayer.policyCooldowns?.[type] || 0;
              return (
                <Button
                  key={type}
                  size="sm"
                  variant="outline"
                  className="h-auto justify-start py-2 text-left"
                  disabled={cooldown > 0 || treasuryBalance < policy.cost}
                  onClick={() => {
                    const explanation = window.prompt('请输入这项政策的新闻说明（下一轮会作为新闻播报）：', policy.description) || policy.description;
                    sendAction({ type: 'ENACT_POLICY', payload: { policyType: type, explanation } });
                  }}
                >
                  <div>
                    <div>{policy.icon} {policy.name}</div>
                    <div className="text-xs opacity-70">{cooldown > 0 ? `冷却 ${cooldown} 轮` : policy.cost > 0 ? `成本 ¥${formatCurrency(policy.cost)}` : '免费'}</div>
                  </div>
                </Button>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            政策会先进入公告，下一轮作为新闻生效；声誉高会提高政府决策能力，支持率过低会下台。
          </div>
        </div>

        {/* 补贴政策 */}
        <div className="p-3 border rounded-lg">
          <h5 className="font-medium mb-2 flex items-center gap-2">
            💵 补贴政策
          </h5>
          
          <div className="grid grid-cols-2 gap-2">
            <Button 
              size="sm" 
              variant="outline"
              disabled={treasuryBalance < 5000}
              onClick={() => sendAction({ type: 'ISSUE_SUBSIDY', payload: { playerId: myPlayer.id, amount: 5000, target: 'all' } })}
            >
              🌐 全民补贴 ¥5,000
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              disabled={treasuryBalance < 10000}
              onClick={() => sendAction({ type: 'ISSUE_SUBSIDY', payload: { playerId: myPlayer.id, amount: 10000, target: 'all' } })}
            >
              🏠 大规模补贴 ¥10,000
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              disabled={treasuryBalance < 3000}
              onClick={() => sendAction({ type: 'ISSUE_SUBSIDY', payload: { playerId: myPlayer.id, amount: 2000, target: 'worker' } })}
            >
              👷 员工补贴 ¥2,000
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              disabled={treasuryBalance < 5000}
              onClick={() => sendAction({ type: 'ISSUE_SUBSIDY', payload: { playerId: myPlayer.id, amount: 5000, target: 'entrepreneur' } })}
            >
              🏢 企业补贴 ¥5,000
            </Button>
          </div>
          
          <div className="mt-2 text-xs text-muted-foreground">
            补贴资金来源于国库存款或公共基金
          </div>
        </div>

        {/* 社会稳定措施 */}
        <div className="p-3 border rounded-lg">
          <h5 className="font-medium mb-2 flex items-center gap-2">
            🛡️ 社会稳定
            {gameState.market.socialStability < 50 && <Badge variant="destructive" className="text-xs">⚠️ 偏低</Badge>}
          </h5>
          
          <div className="grid grid-cols-2 gap-2">
            <Button 
              size="sm" 
              variant="outline"
              disabled={treasuryBalance < 3000}
              onClick={() => sendAction({ type: 'STABILIZE_SOCIETY', payload: { playerId: myPlayer.id, amount: 3000 } })}
            >
              🎭 维稳措施 ¥3,000 (+5稳定)
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              disabled={treasuryBalance < 8000}
              onClick={() => sendAction({ type: 'STABILIZE_SOCIETY', payload: { playerId: myPlayer.id, amount: 8000 } })}
            >
              🎪 大型活动 ¥8,000 (+15稳定)
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              disabled={treasuryBalance < 5000}
              onClick={() => sendAction({ type: 'BUILD_PUBLIC_SERVICE', payload: { playerId: myPlayer.id, amount: 5000 } })}
            >
              🏥 公共服务 ¥5,000
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              disabled={treasuryBalance < 10000}
              onClick={() => sendAction({ type: 'BUILD_PUBLIC_SERVICE', payload: { playerId: myPlayer.id, amount: 10000 } })}
            >
              🏫 基础设施建设 ¥10,000
            </Button>
          </div>
          
          <Progress value={gameState.market.socialStability} className="h-2 mt-2" />
        </div>

        {/* 政府能力 */}
        <div className="p-3 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
          <h5 className="font-medium mb-2">📊 政府能力</h5>
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-white/50 dark:bg-black/20 rounded p-2">
              <div className="text-muted-foreground text-xs">执政经验</div>
              <div className="font-bold">{govAbilities?.governanceExp || 0}</div>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded p-2">
              <div className="text-muted-foreground text-xs">决策能力</div>
              <div className="font-bold">{govAbilities?.decisionPower || 0}</div>
            </div>
          </div>
          
          <div className="mt-2 text-xs text-muted-foreground">
            💡 通过制定政策和维护稳定来积累经验和能力
          </div>
        </div>
      </div>
    );
  }

  if (profession === 'investor') {
    return (
      <div className="p-3 border rounded-lg">
        <h4 className="font-medium mb-3">📈 投资分析</h4>
        
        {myPlayer.investorAbilities && (
          <div className="mb-3 p-2 bg-muted/50 rounded-lg text-sm">
            <div className="flex justify-between mb-1">
              <span>投资技能</span>
              <span>{myPlayer.investorAbilities.investmentSkill}%</span>
            </div>
            <Progress value={myPlayer.investorAbilities.investmentSkill} className="h-2" />
          </div>
        )}

        <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm mb-3">
          <p className="font-medium mb-1">🌡️ 当前经济周期</p>
          <div className="flex items-center gap-2">
            <span>{CYCLE_NAMES[gameState.market.economicCycle as keyof typeof CYCLE_NAMES].icon}</span>
            <span>{CYCLE_NAMES[gameState.market.economicCycle as keyof typeof CYCLE_NAMES].name}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {CYCLE_NAMES[gameState.market.economicCycle as keyof typeof CYCLE_NAMES].description}
          </p>
        </div>

        <Button 
          size="sm" 
          variant="outline"
          className="w-full"
          disabled={myPlayer.cash < 2000}
          onClick={() => sendAction({ type: 'INVESTMENT_STUDY', payload: { playerId: myPlayer.id, cost: 2000 } })}
        >
          📚 学习投资 (¥2000) +5%技能
        </Button>
      </div>
    );
  }

  return (
    <div className="p-3 border rounded-lg text-center text-muted-foreground">
      <p>该职业特殊功能开发中</p>
    </div>
  );
}

// ==================== 市场行情 ====================
function MarketPricesPanel({ gameState }: { gameState: GameState }) {
  // 过滤掉住房（住房在专门的住房面板中处理）
  const consumableGoods = Object.values(gameState.market.goods).filter(good => good.id !== 'housing');
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <span>📊</span> 市场行情
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-3">
          {consumableGoods.map(good => {
            const priceChange = good.priceHistory?.length >= 2
              ? ((good.currentPrice - good.priceHistory[good.priceHistory.length - 2]) / good.priceHistory[good.priceHistory.length - 2])
              : 0;
            
            return (
              <div key={good.id} className="min-w-0 rounded-lg bg-muted p-2 text-center">
                <div className="text-xl leading-none">{good.icon}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{good.name}</div>
                <div className="truncate text-sm font-bold leading-tight">¥{formatCurrency(good.currentPrice)}</div>
                {priceChange !== 0 && (
                  <Badge 
                    variant={priceChange > 0 ? "destructive" : "default"}
                    className="text-xs mt-1"
                  >
                    {priceChange > 0 ? '↑' : '↓'} {formatPercent(Math.abs(priceChange), 0)}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>

        {/* 股市 */}
        <div className="mt-3 p-2 bg-muted/50 rounded-lg">
          <div className="flex justify-between items-center">
            <span>📈 股市指数</span>
            <span className="font-bold">{gameState.market.stockMarket.index.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== 其他玩家 ====================
function OtherPlayersPanel({ gameState, players, myPlayerId, currentPlayerId, sendAction }: { gameState: GameState; players: RoomPlayerInfo[]; myPlayerId: string; currentPlayerId?: string; sendAction: SendGameAction }) {
  const myPlayer = gameState.players.find(player => player.id === myPlayerId);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <span>👥</span> 其他玩家
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {gameState.players.filter(player => player.id !== myPlayerId).map(player => {
            const roomPlayer = players.find(rp => rp.id === player.id);
            const isActive = currentPlayerId === player.id;
            
            return (
              <div 
                key={player.id}
                className={`flex items-center gap-3 p-2 rounded ${
                  isActive ? 'bg-primary/10 border border-primary' : 'bg-muted/50'
                }`}
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white"
                  style={{ backgroundColor: roomPlayer?.color || player.color }}
                >
                  {player.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {player.name}
                    {isActive && <Badge className="text-xs">操作中</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {PROFESSION_CONFIGS[player.profession as PlayerProfession]?.icon} {PROFESSION_CONFIGS[player.profession as PlayerProfession]?.name}
                  </div>
                  {player.profession === 'government' && player.govAbilities && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                      <Badge variant="outline">声誉 {Math.round(player.govAbilities.reputation)}</Badge>
                      <Badge variant="outline">支持率 {Math.round(player.govAbilities.approvalRating)}</Badge>
                      {myPlayer?.governmentRatings?.[gameState.currentRound] === undefined && (
                        <div className="flex gap-1">
                          {[1, 3, 5].map(score => (
                            <Button
                              key={score}
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() => sendAction({ type: 'RATE_GOVERNMENT', payload: { governmentId: player.id, score } })}
                            >
                              {score}分
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-green-600">
                    ¥{formatCurrency(player.cash)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
