// ============================================================
// WebSocket 游戏处理器 - /ws/game 端点
// ============================================================

import { WebSocketServer, WebSocket } from 'ws';
import { roomManager, GameRoom } from '@/lib/room-manager';
import { validateGameAction, validatePlayerProfession } from '@/game/actions';
import { applyMultiplayerGameAction, MultiplayerActionHandlers } from '@/game/engine';
import { createInitialGameState } from '@/game/initial-state';
import { applyNewsEvent, pickNewsEvent } from '@/game/news';
import {
  GameState,
  Player,
  Asset,
  AssetBatch,
  AssetType,
  Company,
  GoodType,
  ProductionGoodType,
  HousingStatus,
  EventType,
  Loan,
  LoanType,
  ECONOMY_BALANCE,
  INVESTMENT_CONFIGS,
  PROFESSION_CONFIGS,
  PRODUCTION_CONFIGS,
  HOUSING_CONFIGS,
  MACHINE_CONFIGS,
  CYCLE_MULTIPLIERS,
  POLICY_CONFIGS,
  PolicyType,
  calculateSocialStability,
  RandomEvent,
} from '@/types/game';


// ==================== 辅助函数 ====================

const generateId = () => Math.random().toString(36).substring(2, 15);
const generateBatchId = () => 'batch_' + Math.random().toString(36).substring(2, 15);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getBestJobOffer(players: Player[], worker: Player, marketEmploymentRate: number) {
  const ability = worker.workerAbilities;
  const skill = ability?.skill ?? 30;
  const entrepreneurOffers = players
    .filter(player => player.profession === 'entrepreneur' && player.company)
    .map(player => {
      const company = player.company!;
      const requiredSkill = Math.max(20, Math.min(85, 20 + company.productQuality * 0.45 + company.machines * 3));
      const wage = Math.round((company.productionCost || ECONOMY_BALANCE.company.wagePerEmployee) * (1 + Math.min(0.4, company.reputation / 250)));
      return {
        employerId: player.id,
        employerName: company.name,
        title: `${company.name} 生产岗位`,
        requiredSkill,
        wage,
      };
    });
  const npcOffers = [
    { employerId: 'npc_basic', employerName: 'NPC基础企业', title: '基础服务岗位', requiredSkill: 20, wage: Math.round(ECONOMY_BALANCE.worker.baseWage * 0.9) },
    { employerId: 'npc_factory', employerName: 'NPC制造企业', title: '制造业岗位', requiredSkill: 45, wage: Math.round(ECONOMY_BALANCE.worker.baseWage * 1.08) },
    { employerId: 'npc_tech', employerName: 'NPC成长企业', title: '技能型岗位', requiredSkill: 70, wage: Math.round(ECONOMY_BALANCE.worker.baseWage * 1.3) },
  ];
  const offers = [...entrepreneurOffers, ...npcOffers].sort((a, b) => b.wage - a.wage);
  return offers.find(offer => skill >= offer.requiredSkill)
    ?? offers.find(offer => skill + marketEmploymentRate * 0.2 >= offer.requiredSkill)
    ?? npcOffers[0];
}

function applyPendingPoliciesForRound(gameState: GameState, market: GameState['market'], round: number): { market: GameState['market']; appliedNews: RandomEvent | null; remainingPolicies: GameState['pendingPolicies'] } {
  const duePolicies = gameState.pendingPolicies.filter(policy => policy.effectiveRound <= round);
  const remainingPolicies = gameState.pendingPolicies.filter(policy => policy.effectiveRound > round);
  if (duePolicies.length === 0) return { market, appliedNews: null, remainingPolicies };

  const nextMarket = { ...market };
  for (const pending of duePolicies) {
    const policy = POLICY_CONFIGS[pending.policyType];
    if (policy.effect.socialStability) nextMarket.socialStability = clamp(nextMarket.socialStability + policy.effect.socialStability, 0, 100);
    if (policy.effect.inflation) nextMarket.inflationRate = clamp(nextMarket.inflationRate + policy.effect.inflation, -0.1, 0.3);
    if (policy.effect.employment) nextMarket.employmentRate = clamp(nextMarket.employmentRate + policy.effect.employment, 0, 100);
    if (pending.policyType === 'infrastructure') {
      nextMarket.productivityBonus = Math.min(0.25, (nextMarket.productivityBonus ?? 0) + policy.cost / 200000);
    }
  }

  const firstPolicy = duePolicies[0];
  const appliedNews: RandomEvent = {
    id: generateId(),
    type: 'policy_change',
    name: `政策生效：${firstPolicy.policyName}`,
    icon: '🏛️',
    description: firstPolicy.explanation,
    story: '政府政策通常不会立刻改变经济，而是经过公告、执行和市场反应后逐步生效。',
    explanation: duePolicies.map(policy => `${policy.policyName}：${policy.explanation}`).join('；'),
    effects: {
      inflation: duePolicies.reduce((sum, pending) => sum + (POLICY_CONFIGS[pending.policyType].effect.inflation ?? 0), 0),
      employment: duePolicies.reduce((sum, pending) => sum + (POLICY_CONFIGS[pending.policyType].effect.employment ?? 0), 0),
      socialStability: duePolicies.reduce((sum, pending) => sum + (POLICY_CONFIGS[pending.policyType].effect.socialStability ?? 0), 0),
    },
    probability: 1,
    duration: 1,
    remainingDuration: 1,
    warning: '这条新闻来自政府上一轮提交的政策说明。',
  };

  return { market: nextMarket, appliedNews, remainingPolicies };
}

function getBankRates(state: GameState) {
  const baseRate = state.market.bank?.centralBankRate ?? ECONOMY_BALANCE.bank.baseRate;
  return {
    centralBankRate: baseRate,
    depositRate: state.market.bank?.depositRate ?? Math.max(0, baseRate + ECONOMY_BALANCE.bank.depositRateSpread),
    consumerLoanRate: state.market.bank?.consumerLoanRate ?? baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.consumer,
    mortgageRate: state.market.bank?.mortgageRate ?? baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.mortgage,
    businessLoanRate: state.market.bank?.businessLoanRate ?? baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.business,
    defaultedLoans: state.market.bank?.defaultedLoans ?? 0,
  };
}

function getLoanRate(state: GameState, loanType: LoanType): number {
  const bank = getBankRates(state);
  if (loanType === 'mortgage') return bank.mortgageRate;
  if (loanType === 'business') return bank.businessLoanRate;
  return bank.consumerLoanRate;
}

function addTaxRevenue(state: GameState, amount: number): void {
  if (amount <= 0) return;
  state.market.monthlyTaxRevenue = (state.market.monthlyTaxRevenue ?? 0) + amount;
  const government = state.players.find(p => p.profession === 'government' && p.govAbilities);
  if (!government?.govAbilities) return;
  state.players = state.players.map(p => {
    if (p.id !== government.id || !p.govAbilities) return p;
    return {
      ...p,
      govAbilities: {
        ...p.govAbilities,
        treasuryBalance: p.govAbilities.treasuryBalance + amount,
      },
    };
  });
}

function calculateNetWorth(player: Player): number {
  const assetValue = player.assets.reduce((sum, asset) => sum + asset.currentValue, 0);
  const debt = (player.loans ?? []).reduce((sum, loan) => sum + loan.remaining, 0);
  return player.cash + assetValue - debt;
}

const investmentTypes: Array<keyof typeof INVESTMENT_CONFIGS> = ['stock', 'bond', 'gold', 'deposit'];

function isInvestmentAsset(asset: Asset): asset is Asset & { type: keyof typeof INVESTMENT_CONFIGS } {
  return investmentTypes.includes(asset.type as keyof typeof INVESTMENT_CONFIGS);
}

function calculatePortfolioRisk(player: Player): number {
  const investments = player.assets.filter(isInvestmentAsset);
  const totalValue = investments.reduce((sum, asset) => sum + asset.currentValue, 0);
  if (totalValue <= 0) return 0;

  const byType = Object.fromEntries(investmentTypes.map(type => [type, 0])) as Record<keyof typeof INVESTMENT_CONFIGS, number>;
  investments.forEach(asset => {
    byType[asset.type] += asset.currentValue;
  });

  const weightedRisk = investmentTypes.reduce((sum, type) => {
    const weight = byType[type] / totalValue;
    return sum + weight * INVESTMENT_CONFIGS[type].riskWeight;
  }, 0);
  const concentration = Math.max(...investmentTypes.map(type => byType[type] / totalValue));
  const concentrationPenalty = concentration > 0.65 ? (concentration - 0.65) * 0.8 : 0;
  return clamp(weightedRisk + concentrationPenalty, 0, 2);
}

function applyLingeringEventPressure(market: GameState['market'], events: RandomEvent[]): void {
  events.forEach(event => {
    if ((event.remainingDuration ?? event.duration ?? 0) <= 0) return;
    switch (event.type as string) {
      case 'inflation':
      case 'inflation_surge':
        market.inflationRate = clamp(market.inflationRate + 0.01, -0.1, 0.3);
        market.socialStability = clamp(market.socialStability - 1, 0, 100);
        break;
      case 'stock_crash':
      case 'economic_crisis':
        market.stockMarket.volatility = clamp(market.stockMarket.volatility + 0.03, 0.03, 1);
        market.employmentRate = clamp(market.employmentRate - 1.5, 30, 100);
        break;
      case 'health_epidemic':
      case 'natural_disaster':
        market.employmentRate = clamp(market.employmentRate - 1, 30, 100);
        market.inflationRate = clamp(market.inflationRate + 0.005, -0.1, 0.3);
        break;
      case 'social_unrest':
        market.socialStability = clamp(market.socialStability - 1.5, 0, 100);
        break;
      default:
        break;
    }
  });
}

function calculateHouseholdDemand(players: Player[]): Record<GoodType, number> {
  const population = Math.max(1, players.length);
  const avgCash = players.reduce((sum, player) => sum + Math.max(0, player.cash), 0) / population;
  const avgHappiness = players.reduce((sum, player) => sum + player.happiness, 0) / population;
  const lowHealthCount = players.filter(player => player.health < 55).length;
  const foodShortage = players.reduce((sum, player) => sum + Math.max(0, 2 - player.goods.food), 0);
  const dailyShortage = players.reduce((sum, player) => sum + Math.max(0, 1 - player.goods.daily_necessities), 0);
  const purchasingPower = clamp(avgCash / 20000, 0.4, 3);

  return {
    food: population * 2 + foodShortage * 2,
    daily_necessities: population * 1.2 + dailyShortage * 2,
    housing: population * 0.25,
    transportation: population * 0.25 * purchasingPower,
    entertainment: population * (0.3 + avgHappiness / 160) * purchasingPower,
    luxury: population * 0.08 * Math.max(0, purchasingPower - 0.6),
    education: population * 0.18 * purchasingPower,
    healthcare: Math.max(1, lowHealthCount * 1.5),
  };
}

function recalculateMarketShare(players: Player[], monthlySales: Record<string, { type: GoodType; sold: number }>): Player[] {
  const totalByType = Object.values(monthlySales).reduce((acc, sale) => {
    acc[sale.type] = (acc[sale.type] ?? 0) + sale.sold;
    return acc;
  }, {} as Partial<Record<GoodType, number>>);

  return players.map(player => {
    if (!player.company) return player;
    const sale = monthlySales[player.id];
    const totalSold = sale ? totalByType[sale.type] ?? 0 : 0;
    const currentShare = totalSold > 0 ? (sale.sold / totalSold) * 100 : player.company.marketShare * 0.92;
    return {
      ...player,
      company: {
        ...player.company,
        marketShare: clamp(currentShare, 0, 100),
      },
    };
  });
}

function emptyProductInventory(): Record<ProductionGoodType, number> {
  return {
    daily_necessities: 0,
    food: 0,
    entertainment: 0,
    luxury: 0,
  };
}

function getProductInventory(company: Company): Record<ProductionGoodType, number> {
  return {
    ...emptyProductInventory(),
    ...(company.productInventory ?? {
      [company.productionType]: company.inventory,
    }),
  };
}

function getTotalProductInventory(productInventory: Record<ProductionGoodType, number>): number {
  return Object.values(productInventory).reduce((sum, value) => sum + value, 0);
}

function estimateProductSales(
  market: GameState['market'],
  company: Company,
  productType: ProductionGoodType,
  quantity: number,
  pricePerUnit: number,
): number {
  const prodConfig = PRODUCTION_CONFIGS[productType];
  const sd = market.supplyDemand[productType];
  const demandSupplyRatio = sd.demand / Math.max(1, sd.supply);
  const qualityFactor = 0.8 + company.productQuality / 100;
  const reputationFactor = 0.75 + company.reputation / 160;
  const priceFactor = Math.pow(prodConfig.baseSellingPrice / Math.max(1, pricePerUnit), prodConfig.demandElasticity);
  return Math.max(0, Math.min(quantity, Math.floor(quantity * prodConfig.marketDemand * demandSupplyRatio * qualityFactor * reputationFactor * priceFactor)));
}

function calculateVictoryScores(players: Player[], market: GameState['market']): GameState['victoryScores'] {
  const averageWealth = players.length
    ? players.reduce((sum, player) => sum + Math.max(0, calculateNetWorth(player)), 0) / players.length
    : 0;

  return Object.fromEntries(players.map(player => {
    const netWorth = calculateNetWorth(player);
    if (player.profession === 'worker') {
      const score = player.happiness * 0.35 + player.health * 0.25 + Math.min(40, netWorth / 1000);
      return [player.id, { score, goal: '生活质量与净资产', details: `幸福${Math.round(player.happiness)} 健康${Math.round(player.health)} 净资产¥${Math.round(netWorth)}` }];
    }
    if (player.profession === 'entrepreneur') {
      const company = player.company;
      const score = (company?.profit ?? 0) / 1000 + (company?.marketShare ?? 0) + (company?.reputation ?? 0) * 0.3;
      return [player.id, { score, goal: '企业利润、市占率与声誉', details: `利润¥${Math.round(company?.profit ?? 0)} 市占${Math.round(company?.marketShare ?? 0)}%` }];
    }
    if (player.profession === 'investor') {
      const investmentValue = player.assets.filter(a => ['stock', 'bond', 'gold', 'deposit'].includes(a.type)).reduce((sum, asset) => sum + asset.currentValue, 0);
      const portfolioRisk = calculatePortfolioRisk(player);
      const score = Math.max(0, investmentValue - ECONOMY_BALANCE.startingCash.investor) / 1000 + (player.investorAbilities?.investmentSkill ?? 0) * 0.4 - portfolioRisk * 18;
      return [player.id, { score, goal: '风险调整后资产增值', details: `投资资产¥${Math.round(investmentValue)} 风险${portfolioRisk.toFixed(2)} 技能${player.investorAbilities?.investmentSkill ?? 0}` }];
    }
    const score = market.socialStability * 0.45 + Math.max(0, market.gdp / Math.max(1, players.length)) / 1000 - market.giniCoefficient * 40 + Math.max(0, averageWealth / 1000);
    return [player.id, { score, goal: '稳定、GDP与贫富差距', details: `稳定${Math.round(market.socialStability)} GDP¥${Math.round(market.gdp)} 基尼${market.giniCoefficient.toFixed(2)}` }];
  }));
}

// ==================== 随机事件系统 ====================

interface RandomEventConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  duration?: number;
  warning?: string;
  effects?: RandomEvent['effects'];
  effect: (state: GameState) => GameState;
}

const RANDOM_EVENTS: RandomEventConfig[] = [
  {
    id: 'economic_boom',
    name: '经济繁荣',
    description: '经济蓬勃发展，所有人收入增加20%！',
    icon: '📈',
    effects: { inflation: -0.01, employment: 5, socialStability: 5, stockMarket: { indexChange: 0.08, volatilityChange: -0.03 } },
    effect: (state) => ({
      ...state,
      market: { ...state.market, inflationRate: Math.max(-0.05, state.market.inflationRate - 0.01) },
    }),
  },
  {
    id: 'inflation',
    name: '通货膨胀',
    description: '物价上涨，所有商品价格+15%',
    icon: '💰',
    duration: 2,
    warning: '物价压力可能延续，现金流紧张者应减少非必需消费。',
    effects: { inflation: 0.03, socialStability: -3 },
    effect: (state) => {
      const newGoods = { ...state.market.goods };
      Object.keys(newGoods).forEach(key => {
        newGoods[key as GoodType] = {
          ...newGoods[key as GoodType],
          currentPrice: Math.round(newGoods[key as GoodType].currentPrice * 1.15),
          priceHistory: [...newGoods[key as GoodType].priceHistory, Math.round(newGoods[key as GoodType].currentPrice * 1.15)],
        };
      });
      return {
        ...state,
        market: { ...state.market, goods: newGoods, inflationRate: state.market.inflationRate + 0.03 },
      };
    },
  },
  {
    id: 'stock_crash',
    name: '股市崩盘',
    description: '股市暴跌30%，投资者损失惨重！',
    icon: '📉',
    duration: 2,
    warning: '市场波动会延续，投资者需降低集中仓位和杠杆风险。',
    effects: { employment: -5, socialStability: -6, stockMarket: { indexChange: -0.3, volatilityChange: 0.25 } },
    effect: (state) => ({
      ...state,
      market: {
        ...state.market,
        stockMarket: { ...state.market.stockMarket, index: state.market.stockMarket.index * 0.7 },
      },
      players: state.players.map(p => ({
        ...p,
        assets: p.assets.map(a => 
          a.type === 'stock' ? { ...a, currentValue: a.currentValue * 0.7 } : a
        ),
      })),
    }),
  },
  {
    id: 'health_epidemic',
    name: '疫情爆发',
    description: '疫情来袭，所有人健康值-15！',
    icon: '🦠',
    duration: 2,
    warning: '健康风险会影响劳动效率，建议储备医疗和现金。',
    effects: { employment: -4, socialStability: -5 },
    effect: (state) => ({
      ...state,
      players: state.players.map(p => ({
        ...p,
        health: Math.max(0, p.health - 15),
        happiness: Math.max(0, p.happiness - 5),
      })),
    }),
  },
  {
    id: 'lucky_discovery',
    name: '意外之财',
    description: '你发现了隐藏的财富，所有人现金+5000！',
    icon: '💎',
    effects: { socialStability: 2 },
    effect: (state) => ({
      ...state,
      players: state.players.map(p => ({
        ...p,
        cash: p.cash + 5000,
      })),
    }),
  },
  {
    id: 'social_unrest',
    name: '社会动荡',
    description: '社会不稳定，幸福度-10，社会稳定度-5',
    icon: '⚠️',
    duration: 2,
    warning: '稳定度下行会影响就业和政策空间，政府应优先修复民生。',
    effects: { socialStability: -5, employment: -2 },
    effect: (state) => ({
      ...state,
      market: { ...state.market, socialStability: Math.max(0, state.market.socialStability - 5) },
      players: state.players.map(p => ({
        ...p,
        happiness: Math.max(0, p.happiness - 10),
      })),
    }),
  },
  {
    id: 'tech_breakthrough',
    name: '技术突破',
    description: '科技进步，投资者收益+50%',
    icon: '🔬',
    effects: { employment: 3, stockMarket: { indexChange: 0.12, volatilityChange: 0.05 } },
    effect: (state) => ({
      ...state,
      market: { ...state.market, stockMarket: { ...state.market.stockMarket, trend: 'bull' as const } },
    }),
  },
  {
    id: 'tax_reform',
    name: '税收改革',
    description: '政府实施新税收政策，通货膨胀率+2%',
    icon: '📋',
    effects: { inflation: 0.02, socialStability: 1 },
    effect: (state) => ({
      ...state,
      market: { ...state.market, inflationRate: state.market.inflationRate + 0.02 },
    }),
  },
  {
    id: 'housing_boom',
    name: '房产热',
    description: '房产价格上涨，房租成本+25%',
    icon: '🏠',
    duration: 2,
    warning: '居住成本可能持续偏高，租房玩家应保留流动资金。',
    effects: { inflation: 0.02, socialStability: -2 },
    effect: (state) => {
      // 租房玩家租金增加
      return {
        ...state,
        players: state.players.map(p => 
          p.housingStatus === 'renting' 
            ? { ...p, currentRent: Math.round(p.currentRent * 1.25) }
            : p
        ),
      };
    },
  },
  {
    id: 'market_surplus',
    name: '市场过剩',
    description: '商品供应过剩，食品和日用品价格-10%',
    icon: '📦',
    effects: { inflation: -0.01, specificGoodPrice: { goodType: 'food', multiplier: 0.9 } },
    effect: (state) => {
      const newGoods = { ...state.market.goods };
      ['food', 'daily_necessities'].forEach(key => {
        if (newGoods[key as GoodType]) {
          newGoods[key as GoodType] = {
            ...newGoods[key as GoodType],
            currentPrice: Math.round(newGoods[key as GoodType].currentPrice * 0.9),
            priceHistory: [...newGoods[key as GoodType].priceHistory, Math.round(newGoods[key as GoodType].currentPrice * 0.9)],
          };
        }
      });
      return {
        ...state,
        market: { ...state.market, goods: newGoods },
      };
    },
  },
];

function generateRandomEvent(): RandomEventConfig {
  const index = Math.floor(Math.random() * RANDOM_EVENTS.length);
  return RANDOM_EVENTS[index];
}

function maybeGenerateRandomEvent(): RandomEventConfig | null {
  const roll = Math.random();
  if (roll < ECONOMY_BALANCE.events.majorProbability) {
    const majorEvents = RANDOM_EVENTS.filter(event => ['stock_crash', 'health_epidemic', 'social_unrest', 'inflation'].includes(event.id));
    return majorEvents[Math.floor(Math.random() * majorEvents.length)] ?? generateRandomEvent();
  }
  if (roll < ECONOMY_BALANCE.events.majorProbability + ECONOMY_BALANCE.events.normalProbability) {
    return generateRandomEvent();
  }
  return null;
}

function createRandomEventMessage(event: RandomEventConfig): RandomEvent {
  return {
    id: generateId(),
    type: event.id as EventType,
    name: event.name,
    description: event.description,
    icon: event.icon,
    duration: event.duration ?? 1,
    remainingDuration: event.duration ?? 1,
    warning: event.warning,
    effects: event.effects ?? {},
    probability: 0.1,
  };
}

// ==================== 消息处理器 ====================

interface WsMessage {
  type: string;
  payload: unknown;
}

function toPublicRoom(room: GameRoom) {
  return {
    id: room.id,
    status: room.status,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      profession: p.profession,
      isReady: p.isReady,
      isHost: p.isHost,
      color: p.color,
      isConnected: p.isConnected,
    })),
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
  };
}

function sendJson(ws: WebSocket, message: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function getPlayerFromGame(state: GameState, playerId: string): Player | undefined {
  return state.players.find(p => p.id === playerId);
}

function broadcastToRoom(room: GameRoom, message: object, excludePlayerId?: string): void {
  const data = JSON.stringify(message);
  for (const player of room.players) {
    if (excludePlayerId && player.id === excludePlayerId) continue;
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  }
}

// ==================== 游戏逻辑处理 ====================

function isPlayerActionBlocked(room: GameRoom, playerId: string): string | null {
  if (!room.gameState) return '游戏未开始';
  if (room.gameState.roundCompletedPlayers.includes(playerId)) {
    return '你已经完成了本轮操作，等待其他玩家';
  }
  return null;
}

function handleWork(room: GameRoom, playerId: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (player.profession === 'worker' && (player.workerAbilities?.unemployedRounds ?? 0) > 0) {
    return { success: false, error: '当前处于失业期，不能进行正式工作' };
  }

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const professionConfig = PROFESSION_CONFIGS[player.profession];
  
  if (player.workState.workCount >= professionConfig.maxWorkPerRound) {
    return { success: false, error: '本轮工作次数已用完' };
  }

  const fatiguePenalty = player.workState.workCount > 0 ? player.workState.workCount * 0.2 : 0;
  const skillBonus = player.workerAbilities ? player.workerAbilities.skill * 0.01 : 0;
  const workerWage = player.workerAbilities?.wageLevel ?? room.gameState.market.laborMarket?.baseWage ?? ECONOMY_BALANCE.worker.baseWage;
  let income = (player.profession === 'worker' ? workerWage : professionConfig.baseIncome) * (1 - fatiguePenalty) * (1 + skillBonus);
  let healthCost = 5;
  let fatigueIncrease = 20;

  if (player.profession === 'entrepreneur') {
    income = player.company?.profit || 0;
    healthCost = 3;
    fatigueIncrease = 15;
  }

  if (player.profession === 'government') {
    income = professionConfig.baseIncome;
    healthCost = 2;
    fatigueIncrease = 10;
  }

  income = income * (1 + player.permanentBonuses.incomeBonus);
  const taxPaid = Math.max(0, income * room.gameState.market.globalTaxRate);
  const afterTax = income - taxPaid;
  addTaxRevenue(room.gameState, taxPaid);

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash + afterTax,
      health: Math.max(0, p.health - healthCost),
      happiness: Math.min(100, p.happiness + 2 - p.workState.workCount),
      workState: {
        workCount: p.workState.workCount + 1,
        fatigueLevel: Math.min(100, p.workState.fatigueLevel + fatigueIncrease),
        lastWorkTime: Date.now(),
      },
    };
  });
  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleOvertimeWork(room: GameRoom, playerId: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (player.profession !== 'worker') return { success: false, error: '只有员工可以加班' };
  if ((player.workerAbilities?.unemployedRounds ?? 0) > 0) return { success: false, error: '失业期间不能加班' };
  if (player.health < 35) return { success: false, error: '健康值过低，不能继续加班' };
  if (player.workState.fatigueLevel >= 85) return { success: false, error: '疲劳度过高，不能继续加班' };
  if ((player.workState.overtimeCount ?? 0) >= 1) return { success: false, error: '每轮最多加班 1 次' };
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const wage = player.workerAbilities?.wageLevel ?? ECONOMY_BALANCE.worker.baseWage;
  const income = wage * ECONOMY_BALANCE.worker.overtimeMultiplier;
  const taxPaid = income * room.gameState.market.globalTaxRate;
  addTaxRevenue(room.gameState, taxPaid);

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash + income - taxPaid,
      health: Math.max(0, p.health - 12),
      happiness: Math.max(0, p.happiness - 4),
      workState: {
        ...p.workState,
        workCount: p.workState.workCount + 1,
        overtimeCount: (p.workState.overtimeCount ?? 0) + 1,
        fatigueLevel: Math.min(100, p.workState.fatigueLevel + 35),
      },
    };
  });
  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleWorkerTraining(room: GameRoom, playerId: string, cost: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (player.profession !== 'worker') return { success: false, error: '只有员工可以参加职业培训' };
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };
  if (player.cash < cost) return { success: false, error: '现金不足' };

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    const ability = p.workerAbilities ?? {
      skill: 30,
      wageLevel: ECONOMY_BALANCE.worker.baseWage,
      trainingSessions: 0,
      unemployedRounds: 0,
      negotiationPower: 20,
    };
    return {
      ...p,
      cash: p.cash - cost,
      happiness: Math.max(0, p.happiness - 2),
      workerAbilities: {
        ...ability,
        skill: Math.min(100, ability.skill + ECONOMY_BALANCE.worker.trainingSkillGain),
        trainingSessions: ability.trainingSessions + 1,
        negotiationPower: Math.min(100, ability.negotiationPower + 6),
      },
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleNegotiateWage(room: GameRoom, playerId: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (player.profession !== 'worker') return { success: false, error: '只有员工可以谈薪' };
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const ability = player.workerAbilities ?? {
    skill: 30,
    wageLevel: ECONOMY_BALANCE.worker.baseWage,
    trainingSessions: 0,
    unemployedRounds: 0,
    negotiationPower: 20,
  };
  if (ability.lastNegotiationRound === room.gameState.currentRound) {
    return { success: false, error: '每轮只能谈薪 1 次' };
  }
  const employmentPenalty = (100 - room.gameState.market.employmentRate) * 0.4;
  const successChance = clamp((ability.skill + ability.negotiationPower - employmentPenalty) / 120, 0.15, 0.85);
  const succeeded = Math.random() < successChance;

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    const current = p.workerAbilities ?? ability;
    return {
      ...p,
      happiness: clamp(p.happiness + (succeeded ? 4 : -3), 0, 100),
      workerAbilities: {
        ...current,
        wageLevel: succeeded ? Math.round(current.wageLevel * 1.08) : current.wageLevel,
        negotiationPower: Math.min(100, current.negotiationPower + 3),
        lastNegotiationRound: room.gameState!.currentRound,
      },
    };
  });

  room.gameState.gameLog.push({
    id: generateId(),
    round: room.gameState.currentRound,
    timestamp: Date.now(),
    type: 'action',
    message: succeeded ? `${player.name} 谈薪成功，工资上调 8%` : `${player.name} 谈薪失败，积累了谈判经验`,
    playerId,
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleSwitchJob(room: GameRoom, playerId: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (player.profession !== 'worker') return { success: false, error: '只有员工可以跳槽' };
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };
  if (player.cash < ECONOMY_BALANCE.worker.jobSwitchCost) return { success: false, error: '现金不足，无法承担跳槽成本' };

  const ability = player.workerAbilities ?? {
    skill: 30,
    wageLevel: ECONOMY_BALANCE.worker.baseWage,
    trainingSessions: 0,
    unemployedRounds: 0,
    negotiationPower: 20,
  };
  const offer = getBestJobOffer(room.gameState.players, player, room.gameState.market.employmentRate);
  const employmentBonus = (room.gameState.market.employmentRate - 60) * 0.006;
  const skillGap = ability.skill - offer.requiredSkill;
  const successChance = clamp(0.25 + skillGap * 0.012 + ability.negotiationPower * 0.003 + employmentBonus, 0.08, 0.92);
  const succeeded = Math.random() < successChance;

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    const current = p.workerAbilities ?? ability;
    return {
      ...p,
      cash: p.cash - ECONOMY_BALANCE.worker.jobSwitchCost,
      happiness: clamp(p.happiness + (succeeded ? 6 : -5), 0, 100),
      workerAbilities: {
        ...current,
        wageLevel: succeeded ? Math.max(current.wageLevel, offer.wage) : current.wageLevel,
        unemployedRounds: succeeded ? 0 : Math.max(current.unemployedRounds, 1),
        negotiationPower: Math.min(100, current.negotiationPower + 4),
        employerId: succeeded ? offer.employerId : current.employerId,
        jobTitle: succeeded ? offer.title : current.jobTitle,
      },
    };
  });

  room.gameState.gameLog.push({
    id: generateId(),
    round: room.gameState.currentRound,
    timestamp: Date.now(),
    type: 'action',
    message: succeeded ? `${player.name} 跳槽到 ${offer.employerName}，获得 ${offer.title}，月薪 ¥${offer.wage}` : `${player.name} 未达到 ${offer.title} 门槛，跳槽失败并短暂失业 1 个月`,
    playerId,
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleSideJob(room: GameRoom, playerId: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (player.profession !== 'worker') return { success: false, error: '只有员工可以做副业' };
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const income = ECONOMY_BALANCE.worker.sideJobIncome;
  const taxPaid = income * room.gameState.market.globalTaxRate;
  addTaxRevenue(room.gameState, taxPaid);

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    const ability = p.workerAbilities ?? {
      skill: 30,
      wageLevel: ECONOMY_BALANCE.worker.baseWage,
      trainingSessions: 0,
      unemployedRounds: 0,
      negotiationPower: 20,
    };
    return {
      ...p,
      cash: p.cash + income - taxPaid,
      health: Math.max(0, p.health - 8),
      happiness: Math.max(0, p.happiness - ECONOMY_BALANCE.worker.sideJobHappinessCost),
      workerAbilities: {
        ...ability,
        sideJobRounds: (ability.sideJobRounds ?? 0) + 1,
      },
      workState: {
        ...p.workState,
        fatigueLevel: Math.min(100, p.workState.fatigueLevel + ECONOMY_BALANCE.worker.sideJobFatigue),
      },
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleBuyGood(room: GameRoom, playerId: string, goodType: GoodType, quantity: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const good = room.gameState.market.goods[goodType];
  const totalCost = good.currentPrice * quantity * (1 + room.gameState.market.inflationRate);

  if (player.cash < totalCost) {
    return { success: false, error: '现金不足' };
  }

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash - totalCost,
      goods: { ...p.goods, [goodType]: p.goods[goodType] + quantity },
    };
  });
  room.gameState.market.supplyDemand[goodType].demand += quantity;
  room.gameState.market.supplyDemand[goodType].supply = Math.max(0, room.gameState.market.supplyDemand[goodType].supply - quantity * 0.5);

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleSellGood(room: GameRoom, playerId: string, goodType: GoodType, quantity: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  if ((player.goods[goodType] || 0) < quantity) {
    return { success: false, error: '物品数量不足' };
  }

  const good = room.gameState.market.goods[goodType];
  const sellPrice = good.currentPrice * 0.85 * quantity;

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash + sellPrice,
      goods: { ...p.goods, [goodType]: p.goods[goodType] - quantity },
    };
  });
  room.gameState.market.supplyDemand[goodType].supply += quantity;

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

// 企业家卖出公司产品
function handleSellCompanyProduct(room: GameRoom, playerId: string, quantity: number, pricePerUnit: number, productType?: ProductionGoodType): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (!player.company) return { success: false, error: '你没有公司' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const company = player.company;
  const saleProductType = productType ?? company.productionType;
  const productInventory = getProductInventory(company);
  const inventory = productInventory[saleProductType] || 0;
  
  // 验证数量有效性
  if (quantity <= 0) {
    return { success: false, error: '出售数量必须大于 0' };
  }
  
  if (inventory < quantity) {
    return { success: false, error: `库存不足，当前库存 ${inventory} 件` };
  }

  const prodConfig = PRODUCTION_CONFIGS[saleProductType];
  const minPrice = prodConfig.minSellingPrice;
  const maxPrice = prodConfig.maxSellingPrice;
  const lockedPrice = company.priceDecisions?.[saleProductType]?.round === room.gameState.currentRound
    ? company.priceDecisions[saleProductType]?.price
    : undefined;
  if (lockedPrice !== undefined) {
    return { success: false, error: `${prodConfig.name} 本轮已经提交过销售，下轮才能再次销售` };
  }
  const effectivePrice = lockedPrice ?? pricePerUnit;
  
  if (effectivePrice < minPrice || effectivePrice > maxPrice) {
    return { success: false, error: `售价应在 ¥${minPrice}~¥${maxPrice} 之间` };
  }
  if (lockedPrice !== undefined && pricePerUnit !== lockedPrice) {
    return { success: false, error: `${prodConfig.name} 本轮售价已锁定为 ¥${lockedPrice}，下轮才能调整` };
  }

  const market = room.gameState.market;
  const actualSold = estimateProductSales(market, company, saleProductType, quantity, effectivePrice);
  if (actualSold <= 0) {
    return { success: false, error: '售价过高或需求不足，本轮没有成交' };
  }

  // 计算收入
  const grossRevenue = effectivePrice * actualSold;
  const marketTax = Math.floor(grossRevenue * ECONOMY_BALANCE.company.salesTaxRate);
  const netRevenue = grossRevenue - marketTax;
  addTaxRevenue(room.gameState, marketTax);

  // 更新玩家现金和公司库存
  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    const nextInventory = getProductInventory(p.company!);
    nextInventory[saleProductType] = Math.max(0, nextInventory[saleProductType] - actualSold);
    return {
      ...p,
      cash: p.cash + netRevenue,
      company: {
        ...p.company!,
        inventory: getTotalProductInventory(nextInventory),
        productInventory: nextInventory,
        priceDecisions: {
          ...(p.company!.priceDecisions ?? {}),
          [saleProductType]: { price: effectivePrice, round: room.gameState!.currentRound },
        },
        salesDecisions: {
          ...(p.company!.salesDecisions ?? {}),
          [saleProductType]: {
            round: room.gameState!.currentRound,
            price: effectivePrice,
            requested: quantity,
            sold: actualSold,
            grossRevenue,
            netRevenue,
          },
        },
        cashFlow: {
          ...p.company!.cashFlow,
          income: p.company!.cashFlow.income + grossRevenue,
          final: p.company!.cashFlow.final + netRevenue,
        },
        revenue: p.company!.revenue + grossRevenue,
        costs: p.company!.costs + marketTax,
        profit: p.company!.profit + netRevenue,
        marketShare: clamp(actualSold / Math.max(1, actualSold + market.supplyDemand[saleProductType].demand) * 100, 0, 100),
        stats: {
          ...p.company!.stats,
          totalSold: p.company!.stats.totalSold + actualSold,
          totalRevenue: p.company!.stats.totalRevenue + netRevenue,
        },
      },
    };
  });
  room.gameState.market.supplyDemand[saleProductType].supply += quantity - actualSold;
  room.gameState.market.supplyDemand[saleProductType].demand = Math.max(0, room.gameState.market.supplyDemand[saleProductType].demand - actualSold);

  roomManager.updateGameState(room.id, room.gameState);
  console.log(`[SellProduct] player=${playerId}, product=${saleProductType}, requested=${quantity}, sold=${actualSold}, price=${effectivePrice}, netRevenue=${netRevenue}, newCash=${player.cash + netRevenue}`);
  return { success: true };
}

// 设置生产类型
function handleSetProductionType(room: GameRoom, playerId: string, productionType: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (!player.company) return { success: false, error: '你没有公司' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  // 验证生产类型
  const validTypes = ['daily_necessities', 'food', 'entertainment', 'luxury'];
  if (!validTypes.includes(productionType)) {
    return { success: false, error: '无效的生产类型' };
  }

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      company: {
        ...p.company!,
        productionType: productionType as 'daily_necessities' | 'food' | 'entertainment' | 'luxury',
      },
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleRentHouse(room: GameRoom, playerId: string, tier: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const config = HOUSING_CONFIGS[tier as keyof typeof HOUSING_CONFIGS];
  if (!config) return { success: false, error: '住房类型无效' };
  const rent = config.rentPrice;

  if (player.cash < rent) {
    return { success: false, error: '现金不足' };
  }

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash - rent,
      housingStatus: 'renting',
      housingTier: config.tier,
      currentRent: rent,
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleBuyHouse(room: GameRoom, playerId: string, tier: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const config = HOUSING_CONFIGS[tier as keyof typeof HOUSING_CONFIGS];
  if (!config) return { success: false, error: '住房类型无效' };
  const price = config.purchasePrice;

  if (player.cash < price) {
    return { success: false, error: '现金不足' };
  }

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash - price,
      housingStatus: 'owned',
      housingTier: config.tier,
      currentRent: 0,
      happiness: Math.min(100, p.happiness + config.effect.happiness),
      socialStatus: p.socialStatus + config.effect.socialStatus,
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleSellHouse(room: GameRoom, playerId: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };

  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };

  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  if (player.housingStatus !== 'owned' || !player.housingTier) {
    return { success: false, error: '你没有可出售的住房' };
  }

  const refund = Math.round(HOUSING_CONFIGS[player.housingTier].purchasePrice * 0.8);
  const oldEffect = HOUSING_CONFIGS[player.housingTier]?.effect;

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash + refund,
      housingStatus: 'none' as HousingStatus,
      housingTier: null,
      currentRent: 0,
      happiness: Math.max(0, p.happiness - (oldEffect?.happiness || 0)),
      socialStatus: Math.max(0, p.socialStatus - (oldEffect?.socialStatus || 0)),
      attributes: p.assets.some(a => a.type === 'real_estate') ? p.attributes : p.attributes.filter(a => a !== 'landlord'),
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleCancelRent(room: GameRoom, playerId: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };

  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };

  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  if (player.housingStatus !== 'renting' || !player.housingTier) {
    return { success: false, error: '你当前没有租住房' };
  }

  const oldEffect = HOUSING_CONFIGS[player.housingTier]?.effect;

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      housingStatus: 'none' as HousingStatus,
      housingTier: null,
      currentRent: 0,
      happiness: Math.max(0, p.happiness - (oldEffect?.happiness || 0)),
      socialStatus: Math.max(0, p.socialStatus - (oldEffect?.socialStatus || 0)),
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleInvest(room: GameRoom, playerId: string, investmentType: string, amount: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  if (player.cash < amount) {
    return { success: false, error: '现金不足' };
  }

  if (!INVESTMENT_CONFIGS[investmentType as keyof typeof INVESTMENT_CONFIGS]) {
    return { success: false, error: '无效的投资类型' };
  }

  const fee = Math.round(amount * ECONOMY_BALANCE.investment.transactionFeeRate);
  const totalCost = amount + fee;
  if (player.cash < totalCost) {
    return { success: false, error: `现金不足，投资含手续费需 ¥${totalCost}` };
  }

  const batchId = generateBatchId();

  const newAsset: Asset = {
    id: generateId(),
    type: investmentType as AssetType,
    name: INVESTMENT_CONFIGS[investmentType as keyof typeof INVESTMENT_CONFIGS]?.name || investmentType,
    batchId,
    purchasePrice: amount,
    currentValue: amount,
  };

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash - totalCost,
      assets: [...p.assets, newAsset],
      attributes: p.attributes.includes('investor') ? p.attributes : [...p.attributes, 'investor'],
    };
  });

  const newBatch: AssetBatch = {
    batchId,
    type: investmentType as AssetBatch['type'],
    totalValue: amount,
    units: 1,
    purchaseTime: room.gameState.currentRound,
  };
  room.gameState.assetBatches = [...room.gameState.assetBatches, newBatch];
  addTaxRevenue(room.gameState, fee * 0.2);

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleCashOutInvestment(room: GameRoom, playerId: string, type: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const typeAssets = player.assets.filter(a => a.type === type);
  if (typeAssets.length === 0) {
    return { success: false, error: '没有该类型的投资' };
  }

  const totalValue = typeAssets.reduce((sum, a) => sum + a.currentValue, 0);
  const gains = typeAssets.reduce((sum, a) => sum + Math.max(0, a.currentValue - a.purchasePrice), 0);
  const tax = gains * ECONOMY_BALANCE.investment.capitalGainsTaxRate;
  const fee = totalValue * ECONOMY_BALANCE.investment.transactionFeeRate;

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash + Math.max(0, totalValue - tax - fee),
      assets: p.assets.filter(a => a.type !== type),
    };
  });
  addTaxRevenue(room.gameState, tax);

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleTakeLoan(room: GameRoom, playerId: string, loanType: LoanType, amount: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };
  if (loanType === 'business' && !player.company) return { success: false, error: '企业贷款需要拥有公司' };
  if (loanType === 'mortgage' && player.housingStatus !== 'owned') return { success: false, error: '房贷需要已有房产作为抵押' };

  const currentDebt = (player.loans ?? []).reduce((sum, loan) => sum + loan.remaining, 0);
  const creditScore = player.creditScore ?? 70;
  const debtLimit = creditScore * (loanType === 'business' ? 5000 : loanType === 'mortgage' ? 4000 : 1200);
  if (currentDebt + amount > debtLimit) {
    return { success: false, error: `信用额度不足，当前最高可负债约 ¥${Math.max(0, Math.round(debtLimit - currentDebt))}` };
  }

  const loan: Loan = {
    id: generateId(),
    type: loanType,
    principal: amount,
    remaining: amount,
    monthlyRate: getLoanRate(room.gameState, loanType),
    collateral: loanType === 'mortgage' ? player.housingTier ?? undefined : undefined,
    createdRound: room.gameState.currentRound,
  };

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash + amount,
      loans: [...(p.loans ?? []), loan],
      creditScore: Math.max(0, (p.creditScore ?? 70) - Math.ceil(amount / 50000)),
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleRepayLoan(room: GameRoom, playerId: string, loanId: string, amount: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };
  const loan = (player.loans ?? []).find(item => item.id === loanId);
  if (!loan) return { success: false, error: '未找到贷款' };
  const payment = Math.min(amount, loan.remaining);
  if (player.cash < payment) return { success: false, error: '现金不足' };

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    const loans = (p.loans ?? [])
      .map(item => item.id === loanId ? { ...item, remaining: Math.max(0, item.remaining - payment) } : item)
      .filter(item => item.remaining > 0);
    return {
      ...p,
      cash: p.cash - payment,
      loans,
      creditScore: Math.min(100, (p.creditScore ?? 70) + 2),
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleHireEmployee(room: GameRoom, playerId: string, count: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (!player.company) return { success: false, error: '你没有公司' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const totalCost = ECONOMY_BALANCE.company.hiringCostPerEmployee * count;
  if (player.cash < totalCost) {
    return { success: false, error: '现金不足' };
  }

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash - totalCost,
      company: {
        ...p.company!,
        employees: p.company!.employees + count,
        productionCapacity: p.company!.productionCapacity + ECONOMY_BALANCE.company.employeeCapacity * count,
        morale: Math.min(100, p.company!.morale + 5),
      },
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleBuyMachine(room: GameRoom, playerId: string, machineType: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (!player.company) return { success: false, error: '你没有公司' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const machineConfig = MACHINE_CONFIGS[machineType];
  if (!machineConfig) return { success: false, error: '机器类型无效' };
  const price = machineConfig.price;

  if (player.cash < price) {
    return { success: false, error: '现金不足' };
  }

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash - price,
      company: {
        ...p.company!,
        machines: p.company!.machines + 1,
        productionCapacity: p.company!.productionCapacity + machineConfig.capacityGain,
        efficiency: Math.min(100, p.company!.efficiency + 10),
      },
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

// 购买原材料
function handleBuyMaterials(room: GameRoom, playerId: string, quantity: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (!player.company) return { success: false, error: '你没有公司' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const materialPrice = ECONOMY_BALANCE.company.materialPrice;
  const totalCost = materialPrice * quantity;
  
  if (player.cash < totalCost) {
    return { success: false, error: `资金不足，需要 ¥${totalCost}，当前现金 ¥${player.cash}` };
  }

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash - totalCost,
      company: {
        ...p.company!,
        rawMaterials: (p.company!.rawMaterials || 0) + quantity,
      },
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleProduceGoods(room: GameRoom, playerId: string, quantity: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (!player.company) return { success: false, error: '你没有公司' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  // 验证数量有效性
  if (quantity <= 0) {
    return { success: false, error: '生产数量必须大于 0' };
  }

  const company = player.company;
  
  const totalCapacity = company.employees * ECONOMY_BALANCE.company.employeeCapacity + company.machines * ECONOMY_BALANCE.company.machineCapacity;
  
  // 检查产能
  if (totalCapacity === 0) {
    return { success: false, error: '无法生产：没有产能（请先雇佣员工或购买机器）' };
  }
  
  // 检查请求数量是否超过产能
  if (quantity > totalCapacity) {
    return { success: false, error: `请求数量 ${quantity} 超过产能 ${totalCapacity}，本轮最多生产 ${totalCapacity} 件` };
  }
  
  const prodConfig = PRODUCTION_CONFIGS[company.productionType];
  const materialNeeded = quantity * prodConfig.materialConsumption;

  if ((company.rawMaterials || 0) < materialNeeded) {
    return { success: false, error: `原材料不足，需要 ${materialNeeded} 单位，当前只有 ${company.rawMaterials} 单位` };
  }

  // 原材料在采购时已付费，生产时只扣加工费，避免重复扣材料现金。
  const processingCost = ECONOMY_BALANCE.company.processingCostPerUnit * quantity;
  if (player.cash < processingCost) {
    return { success: false, error: `资金不足，需要 ¥${processingCost}，当前现金 ¥${player.cash}` };
  }

  // 实际产出：取请求数量、原材料、产能的最小值
  const maxByMaterials = Math.floor((company.rawMaterials || 0) / prodConfig.materialConsumption);
  const actualProduction = Math.min(quantity, maxByMaterials, totalCapacity);
  if (actualProduction <= 0) {
    return { success: false, error: '无法完成生产' };
  }

  // 实际消耗
  const actualMaterialUsed = actualProduction * prodConfig.materialConsumption;
  const actualProcessingCost = ECONOMY_BALANCE.company.processingCostPerUnit * actualProduction;

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    const productInventory = getProductInventory(p.company!);
    productInventory[p.company!.productionType] += actualProduction;
    return {
      ...p,
      cash: p.cash - actualProcessingCost,
      company: {
        ...p.company!,
        rawMaterials: p.company!.rawMaterials - actualMaterialUsed,
        inventory: getTotalProductInventory(productInventory),
        productInventory,
        productionUsedThisRound: p.company!.productionUsedThisRound + actualProduction,
        costs: p.company!.costs + actualProcessingCost,
        stats: {
          ...p.company!.stats,
          totalProduced: p.company!.stats.totalProduced + actualProduction,
          totalCosts: p.company!.stats.totalCosts + actualProcessingCost,
        },
      },
    };
  });
  room.gameState.market.supplyDemand[company.productionType].supply += actualProduction;

  console.log(`[ProduceGoods] player=${playerId}, requested=${quantity}, actual=${actualProduction}, capacity=${totalCapacity}, cash=${player.cash - actualProcessingCost}`);
  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

// 解雇员工
function handleFireEmployee(room: GameRoom, playerId: string, count: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (!player.company) return { success: false, error: '你没有公司' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const fireCount = Math.min(count, player.company.employees);
  if (fireCount <= 0) {
    return { success: false, error: '没有员工可以解雇' };
  }

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      company: {
        ...p.company!,
        employees: p.company!.employees - fireCount,
        // 解雇员工减少产能：每人 -25件/轮
        productionCapacity: Math.max(0, p.company!.productionCapacity - 25 * fireCount),
      },
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

// 升级机器
function handleUpgradeMachine(room: GameRoom, playerId: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (!player.company) return { success: false, error: '你没有公司' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const upgradeCost = 15000;
  if (player.cash < upgradeCost) {
    return { success: false, error: `升级费用 ¥${upgradeCost}，现金不足` };
  }
  if (player.company.machines <= 0) {
    return { success: false, error: '没有机器可以升级' };
  }

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash - upgradeCost,
      company: {
        ...p.company!,
        // 升级后每台机器产能 +5（从 30 提升到 35）
        productionCapacity: p.company!.productionCapacity + 5 * p.company!.machines,
        efficiency: Math.min(100, p.company!.efficiency + 15),
        productQuality: Math.min(100, p.company!.productQuality + 10),
      },
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

// 做广告提升声誉
function handleAdvertise(room: GameRoom, playerId: string, amount: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (!player.company) return { success: false, error: '你没有公司' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  if (player.cash < amount) {
    return { success: false, error: `广告费用 ¥${amount}，现金不足` };
  }

  // 广告效果：小额 ¥1000 +5声誉，大额 ¥5000 +30声誉
  const reputationGain = amount >= 5000 ? 30 : amount >= 1000 ? 5 : 1;

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash - amount,
      company: {
        ...p.company!,
        reputation: Math.min(100, p.company!.reputation + reputationGain),
      },
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleAdjustWages(room: GameRoom, playerId: string, amount: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (!player.company) return { success: false, error: '你没有公司' };
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const newWage = clamp(amount, ECONOMY_BALANCE.company.wagePerEmployee * 0.6, ECONOMY_BALANCE.company.wagePerEmployee * 1.8);
  const moraleDelta = newWage >= ECONOMY_BALANCE.company.wagePerEmployee ? 8 : -10;
  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId || !p.company) return p;
    return {
      ...p,
      company: {
        ...p.company,
        productionCost: Math.round(newWage),
        morale: clamp(p.company.morale + moraleDelta, 0, 100),
      },
    };
  });
  room.gameState.market.laborMarket = {
    baseWage: newWage,
    unemploymentRate: room.gameState.market.laborMarket?.unemploymentRate ?? 0.06,
    skillPremium: room.gameState.market.laborMarket?.skillPremium ?? 0.01,
    minimumWage: room.gameState.market.laborMarket?.minimumWage ?? 3500,
  };

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleUpgradeQuality(room: GameRoom, playerId: string, amount: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (!player.company) return { success: false, error: '你没有公司' };
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };
  if (player.cash < amount) return { success: false, error: '现金不足' };

  const qualityGain = Math.max(1, Math.floor(amount / ECONOMY_BALANCE.company.qualityUpgradeCost) * ECONOMY_BALANCE.company.qualityUpgradeGain);
  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId || !p.company) return p;
    return {
      ...p,
      cash: p.cash - amount,
      company: {
        ...p.company,
        productQuality: clamp(p.company.productQuality + qualityGain, 0, 100),
        reputation: clamp(p.company.reputation + Math.floor(qualityGain / 2), 0, 100),
        costs: p.company.costs + amount,
      },
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleSetTaxRate(room: GameRoom, playerId: string, rate: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (player.profession !== 'government') return { success: false, error: '只有政府官员可以调整税率' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const newRate = Math.max(0.05, Math.min(0.4, rate));
  room.gameState.market.globalTaxRate = newRate;
  room.gameState.market.employmentRate = clamp(room.gameState.market.employmentRate - Math.max(0, newRate - 0.25) * 20, 40, 98);
  room.gameState.market.policyStabilityModifier = (room.gameState.market.policyStabilityModifier ?? 0) + (newRate <= 0.2 ? 1 : -2);
  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleEnactPolicy(room: GameRoom, playerId: string, policyType: PolicyType, explanation?: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (player.profession !== 'government') return { success: false, error: '只有政府官员可以制定政策' };
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };
  const policy = POLICY_CONFIGS[policyType];
  const cooldown = player.policyCooldowns?.[policyType] || 0;
  if (cooldown > 0) return { success: false, error: `政策冷却中，还需 ${cooldown} 轮` };
  if ((player.govAbilities?.treasuryBalance ?? 0) < policy.cost) return { success: false, error: '国库余额不足' };

  room.gameState.pendingPolicies = [
    ...room.gameState.pendingPolicies,
    {
      id: generateId(),
      policyType,
      policyName: policy.name,
      proposerId: playerId,
      explanation: explanation || policy.description,
      effectiveRound: room.gameState.currentRound + 1,
    },
  ];
  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      govAbilities: p.govAbilities ? {
        ...p.govAbilities,
        treasuryBalance: p.govAbilities.treasuryBalance - policy.cost,
        governanceExp: p.govAbilities.governanceExp + 1,
        policyHistory: [...p.govAbilities.policyHistory, `${policy.name}（待生效）`],
      } : p.govAbilities,
      policyCooldowns: {
        ...p.policyCooldowns!,
        [policyType]: policy.cooldown,
      },
    };
  });
  room.gameState.gameLog.push({
    id: generateId(),
    round: room.gameState.currentRound,
    timestamp: Date.now(),
    type: 'policy',
    message: `${player.name} 提交政策：${policy.name}，将在下一轮生效。说明：${explanation || policy.description}`,
    playerId,
  });
  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleRateGovernment(room: GameRoom, playerId: string, governmentId: string, score: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  if (playerId === governmentId) return { success: false, error: '不能给自己评分' };
  const voter = getPlayerFromGame(room.gameState, playerId);
  const government = getPlayerFromGame(room.gameState, governmentId);
  if (!voter || !government?.govAbilities || government.profession !== 'government') return { success: false, error: '政府官员不存在' };
  if (voter.governmentRatings?.[room.gameState.currentRound] !== undefined) return { success: false, error: '本轮已经评分' };
  const normalizedScore = clamp(Math.round(score), 1, 5);
  const delta = (normalizedScore - 3) * 4;

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id === playerId) {
      return {
        ...p,
        governmentRatings: {
          ...(p.governmentRatings ?? {}),
          [room.gameState!.currentRound]: normalizedScore,
        },
      };
    }
    if (p.id !== governmentId || !p.govAbilities) return p;
    const reputation = clamp(p.govAbilities.reputation + delta, 0, 100);
    const approvalRating = clamp(p.govAbilities.approvalRating * 0.7 + normalizedScore * 20 * 0.3, 0, 100);
    const removed = approvalRating < 20;
    return {
      ...p,
      profession: removed ? 'worker' : p.profession,
      govAbilities: removed ? undefined : {
        ...p.govAbilities,
        reputation,
        approvalRating,
        decisionPower: clamp(p.govAbilities.decisionPower + (approvalRating >= 75 ? 2 : approvalRating < 35 ? -2 : 0), 0, 100),
      },
      workerAbilities: removed ? {
        skill: 35,
        wageLevel: ECONOMY_BALANCE.worker.baseWage,
        trainingSessions: 0,
        unemployedRounds: 0,
        negotiationPower: 20,
      } : p.workerAbilities,
      policyCooldowns: removed ? undefined : p.policyCooldowns,
    };
  });
  room.gameState.gameLog.push({
    id: generateId(),
    round: room.gameState.currentRound,
    timestamp: Date.now(),
    type: 'policy',
    message: `${voter.name} 给政府评分 ${normalizedScore}/5`,
    playerId,
  });
  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleIssueSubsidy(room: GameRoom, playerId: string, amount: number, target: string = 'all'): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (player.profession !== 'government') return { success: false, error: '只有政府官员可以发放补贴' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  // 政府官员使用国库余额发放补贴
  const govBalance = player.govAbilities?.treasuryBalance || 0;
  if (govBalance < amount) {
    return { success: false, error: `国库余额 ¥${govBalance}，预算不足` };
  }

  // 确定补贴目标
  let targetPlayers = room.gameState.players;
  if (target === 'worker') {
    targetPlayers = room.gameState.players.filter(p => p.profession === 'worker');
  } else if (target === 'entrepreneur') {
    targetPlayers = room.gameState.players.filter(p => p.profession === 'entrepreneur');
  }

  if (targetPlayers.length === 0) {
    return { success: false, error: '没有符合条件的目标玩家' };
  }

  const subsidyPerPerson = Math.floor(amount / targetPlayers.length);

  room.gameState.players = room.gameState.players.map(p => {
    // 只有目标玩家获得补贴
    if (!targetPlayers.find(tp => tp.id === p.id)) return p;
    
    return {
      ...p,
      cash: p.cash + subsidyPerPerson,
      happiness: Math.min(100, p.happiness + 5),
    };
  });

  // 扣除政府国库
  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      govAbilities: {
        ...p.govAbilities!,
        treasuryBalance: (p.govAbilities?.treasuryBalance || 0) - amount,
      },
    };
  });

  room.gameState.market.socialStability = Math.min(100, room.gameState.market.socialStability + 2);
  room.gameState.market.inflationRate = clamp(room.gameState.market.inflationRate + amount / 1_000_000, -0.1, 0.3);
  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

// 维护社会稳定
function handleStabilizeSociety(room: GameRoom, playerId: string, amount: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (player.profession !== 'government') return { success: false, error: '只有政府官员可以维护社会稳定' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const govBalance = player.govAbilities?.treasuryBalance || 0;
  if (govBalance < amount) {
    return { success: false, error: `国库余额 ¥${govBalance}，资金不足` };
  }

  // 维稳效果：小额 ¥3000 +5稳定，大额 ¥8000 +15稳定
  const stabilityGain = amount >= 8000 ? 15 : amount >= 3000 ? 5 : 2;

  room.gameState.market.socialStability = Math.min(100, room.gameState.market.socialStability + stabilityGain);
  room.gameState.market.policyStabilityModifier = (room.gameState.market.policyStabilityModifier ?? 0) + stabilityGain * 0.5;
  
  // 扣除国库并增加执政经验
  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      govAbilities: {
        ...p.govAbilities!,
        treasuryBalance: (p.govAbilities?.treasuryBalance || 0) - amount,
        governanceExp: (p.govAbilities?.governanceExp || 0) + 2,
      },
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

// 建设公共服务
function handleBuildPublicService(room: GameRoom, playerId: string, amount: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (player.profession !== 'government') return { success: false, error: '只有政府官员可以建设公共服务' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  const govBalance = player.govAbilities?.treasuryBalance || 0;
  if (govBalance < amount) {
    return { success: false, error: `国库余额 ¥${govBalance}，资金不足` };
  }

  // 公共服务效果：增加公共基金、提升稳定度和声誉
  const publicFundGain = Math.floor(amount / 2);

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      govAbilities: {
        ...p.govAbilities!,
        treasuryBalance: (p.govAbilities?.treasuryBalance || 0) - amount,
        publicFunds: (p.govAbilities?.publicFunds || 0) + publicFundGain,
        governanceExp: (p.govAbilities?.governanceExp || 0) + 3,
        decisionPower: Math.min(100, (p.govAbilities?.decisionPower || 0) + 1),
      },
    };
  });

  // 所有玩家受益
  room.gameState.market.socialStability = Math.min(100, room.gameState.market.socialStability + 3);
  room.gameState.market.productivityBonus = Math.min(0.25, (room.gameState.market.productivityBonus ?? 0) + amount / 200000);
  room.gameState.market.employmentRate = clamp(room.gameState.market.employmentRate + amount / 5000, 40, 98);
  room.gameState.players = room.gameState.players.map(p => ({
    ...p,
    happiness: Math.min(100, p.happiness + 2),
  }));

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function handleInvestmentStudy(room: GameRoom, playerId: string, cost: number): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  const player = getPlayerFromGame(room.gameState, playerId);
  if (!player) return { success: false, error: '玩家不存在' };
  if (player.profession !== 'investor') return { success: false, error: '只有投资者可以学习' };

  // 检查是否已完成本轮操作
  const blockReason = isPlayerActionBlocked(room, playerId);
  if (blockReason) return { success: false, error: blockReason };

  if (player.cash < cost) {
    return { success: false, error: '现金不足' };
  }

  room.gameState.players = room.gameState.players.map(p => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      cash: p.cash - cost,
      investorAbilities: {
        ...p.investorAbilities!,
        investmentSkill: Math.min(100, (p.investorAbilities?.investmentSkill || 30) + 5),
        totalLearningSessions: (p.investorAbilities?.totalLearningSessions || 0) + 1,
      },
    };
  });

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true };
}

function settleRound(gameState: GameState): GameState {
  const market = {
    ...gameState.market,
    goods: JSON.parse(JSON.stringify(gameState.market.goods)) as GameState['market']['goods'],
    supplyDemand: JSON.parse(JSON.stringify(gameState.market.supplyDemand)) as GameState['market']['supplyDemand'],
    stockMarket: { ...gameState.market.stockMarket },
  };
  market.timeUnit = 'month';
  const bankRates = getBankRates({ ...gameState, market });
  const centralBankDrift = market.inflationRate > 0.06 ? 0.001 : market.inflationRate < 0 ? -0.0005 : 0;
  market.bank = {
    centralBankRate: clamp(bankRates.centralBankRate + centralBankDrift, 0.001, 0.025),
    depositRate: 0,
    consumerLoanRate: 0,
    mortgageRate: 0,
    businessLoanRate: 0,
    defaultedLoans: bankRates.defaultedLoans,
  };
  market.bank.depositRate = Math.max(0, market.bank.centralBankRate + ECONOMY_BALANCE.bank.depositRateSpread);
  market.bank.consumerLoanRate = market.bank.centralBankRate + ECONOMY_BALANCE.bank.loanRiskSpread.consumer;
  market.bank.mortgageRate = market.bank.centralBankRate + ECONOMY_BALANCE.bank.loanRiskSpread.mortgage;
  market.bank.businessLoanRate = market.bank.centralBankRate + ECONOMY_BALANCE.bank.loanRiskSpread.business;

  market.cyclePhase += 1;
  if (market.cyclePhase >= 4) {
    market.cyclePhase = 0;
    const transitions = {
      overheating: ['overheating', 'growth', 'downturn'],
      growth: ['growth', 'overheating', 'downturn'],
      downturn: ['downturn', 'contraction', 'growth'],
      contraction: ['contraction', 'downturn', 'growth'],
    } as const;
    const options = transitions[market.economicCycle];
    const weights = [0.5, 0.3, 0.2];
    const roll = Math.random();
    market.economicCycle = roll < weights[0] ? options[0] : roll < weights[0] + weights[1] ? options[1] : options[2];
  }

  const assetBatches = [...gameState.assetBatches];
  const batchReturns: Record<string, number> = {};
  const cycleMultipliers = CYCLE_MULTIPLIERS[market.economicCycle];

  for (const batch of assetBatches) {
    const config = INVESTMENT_CONFIGS[batch.type];
    const ratePressure = batch.type === 'bond'
      ? (market.bank.centralBankRate - ECONOMY_BALANCE.bank.baseRate) * -4
      : 0;
    const inflationHedge = batch.type === 'gold' ? Math.max(0, market.inflationRate) * 0.35 : 0;
    const marketReturn = config.baseReturn + ratePressure + inflationHedge + (Math.random() - 0.5) * config.volatility;
    batchReturns[batch.batchId] = 1 + marketReturn * cycleMultipliers[batch.type];
  }

  let taxRevenue = 0;
  const monthlyCompanySales: Record<string, { type: GoodType; sold: number }> = {};
  const players = gameState.players.map(player => {
    let cash = player.cash;
    let health = player.health;
    let happiness = player.happiness;
    let socialStatus = player.socialStatus;
    const goods = { ...player.goods };
    const assets = player.assets.map(asset => ({ ...asset }));
    let housingStatus = player.housingStatus;
    let housingTier = player.housingTier;
    let currentRent = player.currentRent;
    const company = player.company ? JSON.parse(JSON.stringify(player.company)) as Company : undefined;
    let loans = (player.loans ?? []).map(loan => ({ ...loan }));
    let creditScore = player.creditScore ?? 70;
    const workerAbilities = player.workerAbilities ? { ...player.workerAbilities } : undefined;
    const investorAbilities = player.investorAbilities ? { ...player.investorAbilities } : undefined;

    const investorSkillBonus = investorAbilities ? investorAbilities.investmentSkill / 200 : 0;
    for (const asset of assets) {
      if (isInvestmentAsset(asset)) {
        const returnRate = batchReturns[asset.batchId] || 1;
        const depositReturn = asset.type === 'deposit' ? 1 + (market.bank?.depositRate ?? 0.003) : returnRate;
        const errorChance = investorAbilities
          ? Math.max(0.03, ECONOMY_BALANCE.investment.informationErrorBaseChance - investorAbilities.investmentSkill * ECONOMY_BALANCE.investment.informationErrorSkillReduction)
          : ECONOMY_BALANCE.investment.informationErrorBaseChance;
        const misjudged = asset.type !== 'deposit' && Math.random() < errorChance;
        const informationDrag = misjudged ? INVESTMENT_CONFIGS[asset.type].volatility * 0.35 : 0;
        const skillBoostedReturn = depositReturn + investorSkillBonus * (depositReturn - 1) - informationDrag;
        asset.currentValue = Math.max(0, asset.currentValue * skillBoostedReturn);
        if (misjudged && investorAbilities) {
          investorAbilities.lastMistakeRounds = (investorAbilities.lastMistakeRounds ?? 0) + 1;
        }
      }
      if (asset.type === 'real_estate' && asset.rentalIncome) {
        cash += asset.rentalIncome;
      }
    }
    if (investorAbilities) {
      investorAbilities.lastPortfolioRisk = calculatePortfolioRisk({ ...player, assets });
      investorAbilities.lastMarketAnalysis = gameState.currentRound;
    }

    if (housingStatus === 'renting' && currentRent > 0) {
      cash -= currentRent;
      if (cash < 0) {
        const oldEffect = housingTier ? HOUSING_CONFIGS[housingTier].effect : null;
        cash = 0;
        housingStatus = 'none';
        housingTier = null;
        currentRent = 0;
        happiness -= 10 + (oldEffect?.happiness || 0);
        socialStatus -= oldEffect?.socialStatus || 0;
      }
    }

    for (const goodType of ['food', 'daily_necessities'] as GoodType[]) {
      const good = market.goods[goodType];
      const consumption = good.consumptionRate;
      const before = goods[goodType] || 0;
      goods[goodType] = Math.max(0, before - consumption);

      if (before > 0) {
        const effectMultiplier = Math.min(1, before / Math.max(1, consumption));
        happiness += good.effect.happiness * effectMultiplier;
        health += good.effect.health * effectMultiplier;
      }

      if (before < consumption) {
        const shortage = consumption - before;
        health -= shortage * 10;
        happiness -= shortage * 15;
        market.supplyDemand[goodType].demand += shortage * 5;
      }
    }

    if (goods.entertainment > 0) {
      goods.entertainment = Math.max(0, goods.entertainment - 1);
      happiness += 10;
    }

    if (housingStatus !== 'none' && housingTier) {
      const effect = HOUSING_CONFIGS[housingTier].effect;
      happiness += effect.happiness;
      health += effect.health;
      socialStatus += effect.socialStatus > 0 ? 1 : 0;
    } else {
      happiness -= 10;
    }

    const fatiguePenalty = Math.max(0, player.workState.fatigueLevel - 60);
    health += 5 - Math.floor(fatiguePenalty / 10);
    happiness -= Math.floor(fatiguePenalty / 12);
    if (health < 30) happiness -= 10;

    if (player.profession === 'worker' && workerAbilities) {
      if (workerAbilities.unemployedRounds > 0) {
        workerAbilities.unemployedRounds = Math.max(0, workerAbilities.unemployedRounds - 1);
        happiness -= 8;
        cash -= Math.round(workerAbilities.wageLevel * 0.25);
        const reemploymentChance = clamp(0.25 + workerAbilities.skill * 0.004 + market.employmentRate * 0.004, 0.2, 0.9);
        if (Math.random() < reemploymentChance) {
          workerAbilities.unemployedRounds = 0;
          workerAbilities.wageLevel = Math.max(
            market.laborMarket?.minimumWage ?? Math.round(ECONOMY_BALANCE.worker.baseWage * 0.6),
            Math.round(workerAbilities.wageLevel * 0.96),
          );
        }
      } else {
        const laborStress = Math.max(0, 75 - market.employmentRate) / 75;
        const unemploymentRisk = ECONOMY_BALANCE.worker.unemploymentBaseRisk + laborStress * ECONOMY_BALANCE.worker.unemploymentLowEmploymentRisk;
        if (Math.random() < unemploymentRisk) {
          workerAbilities.unemployedRounds = 1;
          happiness -= 10;
        }
      }
    }

    if (company) {
      const wagePerEmployee = company.productionCost > 0 ? company.productionCost : ECONOMY_BALANCE.company.wagePerEmployee;
      const monthlyWages = company.employees * wagePerEmployee;
      let monthlyProductionCosts = 0;
      let monthlyRevenue = 0;

      cash -= monthlyWages;
      taxRevenue += Math.max(0, monthlyWages * market.globalTaxRate * 0.3);

      if (company.autoProduction.enabled && company.autoProduction.monthlyTarget > 0) {
        const prodConfig = PRODUCTION_CONFIGS[company.productionType];
        const moraleFactor = 0.75 + company.morale / 200;
        const productivityFactor = 1 + (market.productivityBonus ?? 0);
        const capacity = Math.floor((company.employees * ECONOMY_BALANCE.company.employeeCapacity + company.machines * ECONOMY_BALANCE.company.machineCapacity) * moraleFactor * productivityFactor);
        const maxByMaterials = Math.floor(company.rawMaterials / prodConfig.materialConsumption);
        const actualProduction = Math.min(company.autoProduction.monthlyTarget, capacity, maxByMaterials);

        if (actualProduction > 0) {
          const productionCost = actualProduction * ECONOMY_BALANCE.company.processingCostPerUnit;
          const materialUsed = actualProduction * prodConfig.materialConsumption;
          const sellingPrice = prodConfig.baseSellingPrice * (1 + (company.productQuality - 60) / 200);
          const sd = market.supplyDemand[company.productionType];
          const demandSupplyRatio = sd.demand / Math.max(1, sd.supply);
          const saleRatio = clamp(prodConfig.marketDemand * demandSupplyRatio * (0.7 + company.reputation / 200), 0.1, 1.3);
          const sold = Math.min(actualProduction, Math.floor(actualProduction * saleRatio));
          monthlyProductionCosts = productionCost;
          monthlyRevenue = Math.round(sold * sellingPrice);

          cash -= productionCost;
          cash += monthlyRevenue;
          company.rawMaterials -= materialUsed;
          company.stats.totalProduced += actualProduction;
          company.stats.totalSold += sold;
          company.stats.totalCosts += productionCost;
          company.stats.totalRevenue += monthlyRevenue;
          const productInventory = getProductInventory(company);
          productInventory[company.productionType] += actualProduction - sold;
          company.productInventory = productInventory;
          company.inventory = getTotalProductInventory(productInventory);
          sd.supply += actualProduction - sold;
          sd.demand = Math.max(0, sd.demand - sold);
          monthlyCompanySales[player.id] = {
            type: company.productionType,
            sold: (monthlyCompanySales[player.id]?.sold ?? 0) + sold,
          };
        }
      }

      const monthlyProfit = monthlyRevenue - monthlyProductionCosts - monthlyWages;
      company.cashFlow = {
        initial: company.cashFlow.final,
        income: monthlyRevenue,
        expenses: monthlyProductionCosts + monthlyWages,
        wages: monthlyWages,
        productionCosts: monthlyProductionCosts,
        otherCosts: 0,
        final: company.cashFlow.final + monthlyProfit,
      };
      company.revenue += monthlyRevenue;
      company.costs += monthlyProductionCosts + monthlyWages;
      company.profit += monthlyProfit;
      company.stats.monthlyProfit = monthlyProfit;
      company.morale = monthlyWages > 0 && cash < 0 ? Math.max(0, company.morale - 10) : Math.min(100, company.morale + 5);
      company.reputation = Math.max(0, company.reputation - 1);
      company.productionUsedThisRound = 0;
    }

  if (loans.length > 0) {
      const bank = market.bank;
      let defaulted = false;
      loans = loans.map(loan => {
        const interest = Math.round(loan.remaining * loan.monthlyRate);
        cash -= interest;
        taxRevenue += interest * 0.05;
        return { ...loan, remaining: loan.remaining + interest };
      });
      if (cash < ECONOMY_BALANCE.bank.defaultGraceCash) {
        defaulted = true;
        const penalty = Math.min(loans.reduce((sum, loan) => sum + loan.remaining, 0) * 0.05, Math.abs(cash));
        loans = loans.map(loan => ({ ...loan, remaining: loan.remaining + Math.round(penalty / Math.max(1, loans.length)) }));
        creditScore = Math.max(0, creditScore - 15);
        if (bank) bank.defaultedLoans += 1;
      } else if (cash > 0 && loans.length > 0) {
        creditScore = Math.min(100, creditScore + 1);
      }
      if (defaulted) {
        happiness -= 8;
        socialStatus -= 3;
      }
    }

    const policyCooldowns = player.policyCooldowns
      ? Object.fromEntries(Object.entries(player.policyCooldowns).map(([k, v]) => [k, Math.max(0, v - 1)])) as Player['policyCooldowns']
      : undefined;

    return {
      ...player,
      cash: Math.round(cash * 100) / 100,
      assets,
      goods,
      housingStatus,
      housingTier,
      currentRent,
      loans,
      creditScore,
      workerAbilities,
      investorAbilities,
      health: Math.max(0, Math.min(100, health)),
      happiness: Math.max(0, Math.min(100, happiness)),
      socialStatus: Math.max(0, socialStatus),
      workState: { workCount: 0, overtimeCount: 0, fatigueLevel: Math.max(0, player.workState.fatigueLevel - 20) },
      rentPaid: false,
      hasActedThisRound: false,
      isBankrupt: cash < ECONOMY_BALANCE.company.bankruptcyLimit,
      policyCooldowns,
      company,
    };
  });

  const playersWithMarketShare = recalculateMarketShare(players, monthlyCompanySales);
  const householdDemand = calculateHouseholdDemand(playersWithMarketShare);
  Object.keys(market.goods).forEach(key => {
    const goodType = key as GoodType;
    const good = market.goods[goodType];
    const sd = market.supplyDemand[goodType];
    sd.demand += householdDemand[goodType] ?? 0;
    const demandSupplyRatio = sd.demand / Math.max(1, sd.supply);
    const marketPressure = clamp((demandSupplyRatio - 1) * 0.14, -0.16, 0.22);
    const inflation = market.inflationRate * 0.1;
    const volatility = (Math.random() - 0.5) * 0.05;
    const newPrice = good.currentPrice * (1 + marketPressure + inflation + volatility);
    good.currentPrice = Math.max(good.basePrice * 0.3, Math.min(good.basePrice * 3, newPrice));
    good.priceHistory.push(good.currentPrice);
    if (good.priceHistory.length > 10) good.priceHistory.shift();
    const baselineDemand = householdDemand[goodType] ?? 20;
    sd.demand = Math.max(baselineDemand, sd.demand * 0.72 + baselineDemand * 0.28);
    sd.supply = Math.max(5, sd.supply * 0.82);
  });

  const stockChange = 1 + (Math.random() - 0.5) * market.stockMarket.volatility * 2;
  market.stockMarket.index = Math.max(10, market.stockMarket.index * stockChange);
  market.stockMarket.volatility = Math.max(0.05, market.stockMarket.volatility * 0.95);
  const government = playersWithMarketShare.find(player => player.profession === 'government' && player.govAbilities);
  const playersWithTax = taxRevenue > 0 && government?.govAbilities
    ? playersWithMarketShare.map(player => player.id === government.id && player.govAbilities
      ? { ...player, govAbilities: { ...player.govAbilities, treasuryBalance: player.govAbilities.treasuryBalance + taxRevenue } }
      : player)
    : playersWithMarketShare;

  market.monthlyTaxRevenue = Math.round(taxRevenue * 100) / 100;
  market.gdp = playersWithTax.reduce((sum, player) => sum + Math.max(0, player.cash), 0);
  market.inflationRate = Math.max(-0.1, Math.min(0.3, market.inflationRate + (Math.random() - 0.5) * 0.02));
  market.policyStabilityModifier = (market.policyStabilityModifier ?? 0) * 0.75;
  market.productivityBonus = (market.productivityBonus ?? 0) * 0.95;
  applyLingeringEventPressure(market, gameState.activeEvents);
  market.socialStability = clamp(calculateSocialStability(playersWithTax) + (market.policyStabilityModifier ?? 0), 0, 100);

  const incomes = playersWithTax.map(p => Math.max(0, p.cash)).sort((a, b) => a - b);
  const sumIncomes = incomes.reduce((sum, income) => sum + income, 0);
  if (incomes.length > 0 && sumIncomes > 0) {
    let weighted = 0;
    incomes.forEach((income, index) => {
      weighted += (index + 1) * income;
    });
    market.giniCoefficient = Math.max(0, Math.min(1, (2 * weighted - (incomes.length + 1) * sumIncomes) / (incomes.length * sumIncomes)));
  } else {
    market.giniCoefficient = 0;
  }

  const nextActiveEvents = gameState.activeEvents
    .map(event => ({
      ...event,
      remainingDuration: Math.max(0, (event.remainingDuration ?? event.duration ?? 1) - 1),
    }))
    .filter(event => (event.remainingDuration ?? 0) > 0);
  const nextRound = gameState.currentRound + 1;
  const policyApplication = applyPendingPoliciesForRound(gameState, market, nextRound);

  return {
    ...gameState,
    players: playersWithTax,
    market: policyApplication.market,
    activeEvents: nextActiveEvents,
    assetBatches,
    pendingPolicies: policyApplication.remainingPolicies,
    currentNews: policyApplication.appliedNews,
    victoryScores: calculateVictoryScores(playersWithTax, policyApplication.market),
  };
}

function handleEndTurn(room: GameRoom, playerId: string): { success: boolean; error?: string } {
  if (!room.gameState) return { success: false, error: '游戏未开始' };
  
  // 保存 gameState 引用，避免 TypeScript 重复检查
  const gameState = room.gameState;

  // 检查玩家是否已经完成过这轮操作
  if (gameState.roundCompletedPlayers.includes(playerId)) {
    return { success: false, error: '你已经完成本轮操作了' };
  }

  // 将玩家标记为已完成
  gameState.roundCompletedPlayers.push(playerId);

  // 获取当前房间玩家信息
  const roomPlayer = room.players.find(p => p.id === playerId);
  const playerName = roomPlayer?.name || '玩家';

  // 添加日志
  gameState.gameLog.push({
    id: generateId(),
    round: gameState.currentRound,
    timestamp: Date.now(),
    type: 'action',
    message: `${playerName} 完成了第 ${gameState.currentRound} 轮操作`,
    playerId,
  });

  // 通知所有玩家该玩家已完成
  broadcastToRoom(room, {
    type: 'game:player_completed',
    payload: {
      playerId,
      playerName,
      completedPlayers: gameState.roundCompletedPlayers,
      totalPlayers: room.players.length,
    }
  });

  // 检查是否所有玩家都完成了
  const allCompleted = gameState.roundCompletedPlayers.length >= room.players.length;

  if (allCompleted) {
    // 所有玩家都完成了，执行轮次结算
    
    // 1. 生成随机事件：普通事件约35%，重大事件约8%，其他回合用于玩家策略沉淀。
    const randomEvent = maybeGenerateRandomEvent();
    const eventMessage = randomEvent ? createRandomEventMessage(randomEvent) : null;

    if (randomEvent && eventMessage) {
      room.gameState = randomEvent.effect(gameState);
      const updatedGameState = room.gameState;
      updatedGameState.recentEvent = eventMessage;
      if (eventMessage.duration) {
        updatedGameState.activeEvents = [...updatedGameState.activeEvents, eventMessage];
      }
      updatedGameState.eventHistory.push(eventMessage);
      updatedGameState.gameLog.push({
        id: generateId(),
        round: updatedGameState.currentRound,
        timestamp: Date.now(),
        type: 'event',
        message: `${randomEvent.icon} ${eventMessage.name}: ${eventMessage.description}`,
      });
    }

    const settledGameState = settleRound(room.gameState);

    // 6. 进入下一轮
    settledGameState.currentRound++;
    settledGameState.roundCompletedPlayers = []; // 重置完成状态
    settledGameState.currentPlayerIndex = 0;
    const newsEvent = settledGameState.currentNews ?? pickNewsEvent(settledGameState.currentRound);
    const newsGameState = applyNewsEvent(settledGameState, newsEvent);

    // 通知所有玩家轮次结算完成，新一轮开始
    broadcastToRoom(room, {
      type: 'game:round_end',
      payload: {
        round: newsGameState.currentRound,
        completedRound: newsGameState.currentRound - 1,
        event: newsEvent ?? eventMessage,
        market: newsGameState.market,
        // 发送完整玩家数据用于前端同步
        players: newsGameState.players.map(p => ({
          id: p.id,
          name: p.name,
          cash: p.cash,
          health: p.health,
          happiness: p.happiness,
          company: p.company,
          assets: p.assets,
          loans: p.loans,
          creditScore: p.creditScore,
          workerAbilities: p.workerAbilities,
          investorAbilities: p.investorAbilities,
          govAbilities: p.govAbilities,
          goods: p.goods,
          workState: p.workState,
          housingStatus: p.housingStatus,
          housingTier: p.housingTier,
        })),
        victoryScores: newsGameState.victoryScores,
      }
    });

    room.gameState = newsGameState;
    roomManager.updateGameState(room.id, newsGameState);

    return { success: true, error: undefined };
  }

  roomManager.updateGameState(room.id, room.gameState);
  return { success: true, error: undefined };
}

const multiplayerActionHandlers: MultiplayerActionHandlers<GameRoom> = {
  WORK: (room, playerId) => handleWork(room, playerId),
  OVERTIME_WORK: (room, playerId) => handleOvertimeWork(room, playerId),
  WORKER_TRAINING: (room, playerId, action) => handleWorkerTraining(room, playerId, action.payload.cost),
  NEGOTIATE_WAGE: (room, playerId) => handleNegotiateWage(room, playerId),
  SWITCH_JOB: (room, playerId) => handleSwitchJob(room, playerId),
  SIDE_JOB: (room, playerId) => handleSideJob(room, playerId),
  BUY_GOOD: (room, playerId, action) => handleBuyGood(room, playerId, action.payload.goodType, action.payload.quantity),
  SELL_GOOD: (room, playerId, action) => handleSellGood(room, playerId, action.payload.goodType, action.payload.quantity),
  SELL_COMPANY_PRODUCT: (room, playerId, action) => handleSellCompanyProduct(room, playerId, action.payload.quantity, action.payload.pricePerUnit, action.payload.productType),
  SET_PRODUCTION_TYPE: (room, playerId, action) => handleSetProductionType(room, playerId, action.payload.productionType),
  RENT_HOUSE: (room, playerId, action) => handleRentHouse(room, playerId, action.payload.tier),
  BUY_HOUSE: (room, playerId, action) => handleBuyHouse(room, playerId, action.payload.tier),
  SELL_HOUSE: (room, playerId) => handleSellHouse(room, playerId),
  CANCEL_RENT: (room, playerId) => handleCancelRent(room, playerId),
  INVEST: (room, playerId, action) => handleInvest(room, playerId, action.payload.investmentType, action.payload.amount),
  CASH_OUT_ALL_INVESTMENT: (room, playerId, action) => handleCashOutInvestment(room, playerId, action.payload.type),
  TAKE_LOAN: (room, playerId, action) => handleTakeLoan(room, playerId, action.payload.loanType, action.payload.amount),
  REPAY_LOAN: (room, playerId, action) => handleRepayLoan(room, playerId, action.payload.loanId, action.payload.amount),
  HIRE_EMPLOYEE: (room, playerId, action) => handleHireEmployee(room, playerId, action.payload.count),
  BUY_MACHINE: (room, playerId, action) => handleBuyMachine(room, playerId, action.payload.machineType),
  BUY_MATERIALS: (room, playerId, action) => handleBuyMaterials(room, playerId, action.payload.quantity),
  FIRE_EMPLOYEE: (room, playerId, action) => handleFireEmployee(room, playerId, action.payload.count),
  UPGRADE_MACHINE: (room, playerId) => handleUpgradeMachine(room, playerId),
  ADVERTISE: (room, playerId, action) => handleAdvertise(room, playerId, action.payload.amount),
  ADJUST_WAGES: (room, playerId, action) => handleAdjustWages(room, playerId, action.payload.amount),
  UPGRADE_QUALITY: (room, playerId, action) => handleUpgradeQuality(room, playerId, action.payload.amount),
  PRODUCE_GOODS: (room, playerId, action) => handleProduceGoods(room, playerId, action.payload.quantity),
  SET_TAX_RATE: (room, playerId, action) => handleSetTaxRate(room, playerId, action.payload.rate),
  ENACT_POLICY: (room, playerId, action) => handleEnactPolicy(room, playerId, action.payload.policyType, action.payload.explanation),
  RATE_GOVERNMENT: (room, playerId, action) => handleRateGovernment(room, playerId, action.payload.governmentId, action.payload.score),
  ISSUE_SUBSIDY: (room, playerId, action) => handleIssueSubsidy(room, playerId, action.payload.amount, action.payload.target),
  STABILIZE_SOCIETY: (room, playerId, action) => handleStabilizeSociety(room, playerId, action.payload.amount),
  BUILD_PUBLIC_SERVICE: (room, playerId, action) => handleBuildPublicService(room, playerId, action.payload.amount),
  INVESTMENT_STUDY: (room, playerId, action) => handleInvestmentStudy(room, playerId, action.payload.cost),
  END_TURN: (room, playerId) => handleEndTurn(room, playerId),
};

// ==================== 主处理器 ====================

export function setupGameHandler(wss: WebSocketServer) {
  // 存储所有连接
  const connections = new Map<string, WebSocket>();
  const cleanupTimer = setInterval(() => {
    const deletedRooms = roomManager.cleanupExpiredRooms();
    if (deletedRooms.length > 0) {
      console.info(`[RoomCleanup] removed ${deletedRooms.length} expired rooms`);
    }
  }, 10 * 60 * 1000);
  cleanupTimer.unref?.();

  wss.on('connection', (ws: WebSocket, req) => {
    // 从 URL 获取 deviceId
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const deviceId = url.searchParams.get('deviceId') || generateId();
    
    connections.set(deviceId, ws);
    roomManager.updatePlayerWs(deviceId, ws);

    const existingRoom = roomManager.getRoomByDevice(deviceId);
    const existingConnection = roomManager.getPlayerConnection(deviceId);
    if (existingRoom && existingConnection) {
      sendJson(ws, {
        type: 'room:join_result',
        payload: {
          success: true,
          playerId: existingConnection.playerId,
          room: toPublicRoom(existingRoom),
        },
      });
      broadcastToRoom(existingRoom, {
        type: 'room:player_list',
        payload: { players: toPublicRoom(existingRoom).players },
      });
      if (existingRoom.gameState) {
        sendJson(ws, {
          type: 'game:state',
          payload: { gameState: existingRoom.gameState },
        });
      }
    }

    ws.on('message', (raw) => {
      try {
        const msg: WsMessage = JSON.parse(raw.toString());
        
        // 心跳
        if (msg.type === 'ping') {
          sendJson(ws, { type: 'pong', payload: null });
          return;
        }

        // 处理各种消息
        handleMessage(ws, deviceId, msg);
      } catch (error) {
        console.error('Error handling message:', error);
        sendJson(ws, { type: 'error', payload: { message: 'Invalid message format' } });
      }
    });

    ws.on('close', () => {
      connections.delete(deviceId);
      const { room, playerId } = roomManager.markPlayerDisconnected(deviceId);
      if (room && playerId) {
        broadcastToRoom(room, {
          type: 'room:player_list',
          payload: { players: toPublicRoom(room).players },
        });
      }
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${deviceId}:`, error);
    });
  });

  function handleMessage(ws: WebSocket, deviceId: string, msg: WsMessage) {
    const { type, payload } = msg;

    switch (type) {
      case 'room:create': {
        const { playerName, maxPlayers, gameMode } = payload as { playerName: string; maxPlayers?: number; gameMode?: 'simple' | 'professional' };
        if (typeof playerName !== 'string' || playerName.trim().length === 0 || playerName.trim().length > 20) {
          sendJson(ws, { type: 'room:create_result', payload: { success: false, error: '玩家名称无效' } });
          return;
        }
        const result = roomManager.createRoom({ playerName, deviceId, maxPlayers, gameMode });
        
        // 更新 WebSocket 连接
        roomManager.updatePlayerWs(deviceId, ws);
        
        sendJson(ws, {
          type: 'room:create_result',
          payload: {
            success: true,
            roomId: result.room.id,
            playerId: result.playerId,
            room: toPublicRoom(result.room),
          },
        });
        break;
      }

      case 'room:join': {
        const { roomId, playerName } = payload as { roomId: string; playerName: string };
        if (typeof roomId !== 'string' || typeof playerName !== 'string' || playerName.trim().length === 0 || playerName.trim().length > 20) {
          sendJson(ws, { type: 'room:join_result', payload: { success: false, error: '房间号或玩家名称无效' } });
          return;
        }
        const result = roomManager.joinRoom({ roomId: roomId.toUpperCase(), playerName: playerName.trim(), deviceId });
        
        if (result.success && result.room && result.playerId) {
          roomManager.updatePlayerWs(deviceId, ws);
          
          sendJson(ws, {
            type: 'room:join_result',
            payload: {
              success: true,
              playerId: result.playerId,
              room: toPublicRoom(result.room),
            },
          });

          // 广播给房间内其他玩家
          const room = roomManager.getRoom(roomId.toUpperCase());
          if (room) {
            broadcastToRoom(room, {
              type: 'room:player_list',
              payload: { players: toPublicRoom(room).players },
            }, result.playerId);
            if (room.gameState) {
              sendJson(ws, {
                type: 'game:state',
                payload: { gameState: room.gameState },
              });
            }
          }
        } else {
          sendJson(ws, {
            type: 'room:join_result',
            payload: { success: false, error: result.error },
          });
        }
        break;
      }

      case 'room:leave': {
        const result = roomManager.leaveRoom(deviceId);
        sendJson(ws, {
          type: 'room:leave_result',
          payload: { success: result.success },
        });
        break;
      }

      case 'room:player_update': {
        const { profession, isReady } = payload as { profession?: unknown; isReady?: unknown };
        const connection = roomManager.getPlayerConnection(deviceId);
        if (!connection) {
          sendJson(ws, { type: 'room:error', payload: { message: 'Not in a room' } });
          return;
        }

        const room = roomManager.getRoom(connection.roomId);
        if (!room) return;

        if (profession !== undefined) {
          if (!validatePlayerProfession(profession)) {
            sendJson(ws, { type: 'room:error', payload: { message: '职业无效' } });
            return;
          }
          roomManager.setPlayerProfession(connection.roomId, connection.playerId, profession);
        }
        if (isReady !== undefined) {
          if (typeof isReady !== 'boolean') {
            sendJson(ws, { type: 'room:error', payload: { message: '准备状态无效' } });
            return;
          }
          roomManager.setPlayerReady(connection.roomId, connection.playerId, isReady);
        }

        // 广播更新
        broadcastToRoom(room, {
          type: 'room:player_list',
          payload: { players: toPublicRoom(room).players },
        });
        break;
      }

      case 'game:start': {
        const connection = roomManager.getPlayerConnection(deviceId);
        if (!connection) {
          sendJson(ws, { type: 'game:start_result', payload: { success: false, error: 'Not in a room' } });
          return;
        }

        const room = roomManager.getRoom(connection.roomId);
        if (!room) return;

        // 检查是否是房主
        if (room.hostId !== connection.playerId) {
          sendJson(ws, { type: 'game:start_result', payload: { success: false, error: '只有房主可以开始游戏' } });
          return;
        }

        // 检查是否所有玩家都选择了职业
        const allProfessionsSelected = room.players.every(p => p.profession !== undefined);
        if (!allProfessionsSelected) {
          sendJson(ws, { type: 'game:start_result', payload: { success: false, error: '所有玩家必须先选择职业' } });
          return;
        }

        // 检查是否所有玩家都准备了
        const allReady = room.players.every(p => p.isReady);
        if (!allReady) {
          sendJson(ws, { type: 'game:start_result', payload: { success: false, error: '所有玩家必须准备后才能开始' } });
          return;
        }

        // 创建游戏状态
        const gameState = applyNewsEvent(createInitialGameState(room.players, room.gameMode), pickNewsEvent(1));
        roomManager.updateGameState(room.id, gameState);

        // 广播游戏开始
        broadcastToRoom(room, {
          type: 'game:state',
          payload: {
            gameState,
            currentPlayerId: room.players[0].id,
          },
        });

        sendJson(ws, {
          type: 'game:start_result',
          payload: { success: true },
        });
        break;
      }

      case 'game:action': {
        const connection = roomManager.getPlayerConnection(deviceId);
        if (!connection) {
          sendJson(ws, { type: 'game:action_result', payload: { success: false, error: 'Not in a room' } });
          return;
        }

        const room = roomManager.getRoom(connection.roomId);
        if (!room || !room.gameState) {
          sendJson(ws, { type: 'game:action_result', payload: { success: false, error: 'Game not started' } });
          return;
        }

        const rawAction = (payload as { action?: unknown }).action;
        const validation = validateGameAction(rawAction);
        if (!validation.success || !validation.value) {
          sendJson(ws, {
            type: 'game:action_result',
            payload: { success: false, error: validation.error || '操作无效' },
          });
          return;
        }
        const action = validation.value;
        const result = applyMultiplayerGameAction(room, connection.playerId, action, multiplayerActionHandlers);
        roomManager.appendActionLog({
          roomId: room.id,
          playerId: connection.playerId,
          actionType: action.type,
          round: room.gameState.currentRound,
          success: result.success,
          error: result.error,
        });

        if (result.success) {
          sendJson(ws, {
            type: 'game:action_result',
            payload: { success: true, gameState: room.gameState },
          });
          broadcastToRoom(room, {
            type: 'game:state',
            payload: { gameState: room.gameState },
          }, connection.playerId);
        } else {
          sendJson(ws, {
            type: 'game:action_result',
            payload: { success: false, error: result.error },
          });
        }
        break;
      }

      case 'room:list': {
        const rooms = roomManager.getAllRooms();
        sendJson(ws, {
          type: 'room:list_result',
          payload: {
            rooms: rooms.map(r => ({
              id: r.id,
              playerCount: r.players.length,
              maxPlayers: r.maxPlayers,
              createdAt: r.createdAt,
            })),
          },
        });
        break;
      }

      default:
        sendJson(ws, { type: 'error', payload: { message: `Unknown message type: ${type}` } });
    }
  }
}
