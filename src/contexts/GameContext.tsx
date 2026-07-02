'use client';

import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import {
  GameState,
  GamePhase,
  GameMode,
  Player,
  PlayerProfession,
  PlayerAttribute,
  Market,
  TradeOffer,
  RandomEvent,
  GameLogEntry,
  WorkState,
  GoodType,
  InvestmentType,
  ProductionGoodType,
  Loan,
  LoanType,
  Asset,
  AssetBatch,
  AssetType,
  Company,
  ECONOMY_BALANCE,
  INVESTMENT_CONFIGS,
  PROFESSION_CONFIGS,
  PRODUCTION_CONFIGS,
  INITIAL_GOODS,
  PLAYER_COLORS,
  RANDOM_EVENTS,
  MACHINE_CONFIGS,
  TradeType,
  HousingTier,
  HousingStatus,
  HOUSING_CONFIGS,
  POLICY_CONFIGS,
  PolicyType,
  EconomicCycle,
  CYCLE_MULTIPLIERS,
  calculateSocialStability,
} from '@/types/game';
import { applyNewsEvent, pickNewsEvent } from '@/game/news';
import { getEndTurnTutorialPrompt } from '@/game/education';

// ==================== 类型定义 ====================

type GameAction =
  | { type: 'INIT_GAME'; payload: { playerNames: string[]; playerProfessions: PlayerProfession[]; gameMode?: GameMode } }
  | { type: 'START_GAME' }
  | { type: 'DISMISS_NEWS' }
  | { type: 'END_TURN' }
  | { type: 'DISMISS_TUTORIAL' }
  | { type: 'CONFIRM_END_TURN' }  // 确认结束回合
  | { type: 'CANCEL_END_TURN' }    // 取消结束回合
  | { type: 'SET_PHASE'; payload: GamePhase }
  
  // 工作系统
  | { type: 'WORK'; payload: { playerId: string } }
  | { type: 'OVERTIME_WORK'; payload: { playerId: string } }
  | { type: 'WORKER_TRAINING'; payload: { playerId: string; cost: number } }
  | { type: 'NEGOTIATE_WAGE'; payload: { playerId: string } }
  | { type: 'SWITCH_JOB'; payload: { playerId: string } }
  | { type: 'SIDE_JOB'; payload: { playerId: string } }
  
  // 市场交易
  | { type: 'BUY_GOOD'; payload: { playerId: string; goodType: GoodType; quantity: number } }
  | { type: 'SELL_GOOD'; payload: { playerId: string; goodType: GoodType; quantity: number } }
  
  // 投资系统（统一涨跌幅）
  | { type: 'INVEST'; payload: { playerId: string; investmentType: InvestmentType; amount: number } }
  | { type: 'CASH_OUT_INVESTMENT'; payload: { playerId: string; assetId: string } }
  | { type: 'CASH_OUT_ALL_INVESTMENT'; payload: { playerId: string; type: InvestmentType } }
  | { type: 'TAKE_LOAN'; payload: { playerId: string; loanType: LoanType; amount: number } }
  | { type: 'REPAY_LOAN'; payload: { playerId: string; loanId: string; amount: number } }
  
  // 房地产
  | { type: 'RENT_HOUSE'; payload: { playerId: string; tier: HousingTier } }
  | { type: 'BUY_HOUSE'; payload: { playerId: string; tier: HousingTier } }
  | { type: 'SELL_HOUSE'; payload: { playerId: string } }
  | { type: 'CANCEL_RENT'; payload: { playerId: string } }
  
  // 企业系统
  | { type: 'HIRE_EMPLOYEE'; payload: { playerId: string; count: number } }
  | { type: 'FIRE_EMPLOYEE'; payload: { playerId: string; count: number } }
  | { type: 'BUY_MACHINE'; payload: { playerId: string; machineType: string } }
  | { type: 'PRODUCE_GOODS'; payload: { playerId: string; quantity: number } }
  | { type: 'SELL_COMPANY_PRODUCT'; payload: { playerId: string; quantity: number; pricePerUnit: number; productType?: ProductionGoodType } }
  | { type: 'SET_PRODUCT_PRICE'; payload: { playerId: string; price: number } }
  | { type: 'ADJUST_WAGES'; payload: { playerId: string; amount: number } }
  | { type: 'MARKETING_SPEND'; payload: { playerId: string; amount: number } }
  | { type: 'UPGRADE_QUALITY'; payload: { playerId: string; amount: number } }
  | { type: 'SET_PRODUCTION_TYPE'; payload: { playerId: string; productionType: 'daily_necessities' | 'food' | 'entertainment' | 'luxury' } }
  
  // 企业自动生产设定
  | { type: 'SET_AUTO_PRODUCTION'; payload: { playerId: string; enabled: boolean; monthlyTarget?: number } }
  
  // 政府系统
  | { type: 'SET_TAX_RATE'; payload: { playerId: string; rate: number } }
  | { type: 'ISSUE_SUBSIDY'; payload: { playerId: string; amount: number; target: 'all' | 'poor' | 'business' } }
  | { type: 'ENACT_POLICY'; payload: { playerId: string; policyType: PolicyType; explanation?: string } }
  | { type: 'RATE_GOVERNMENT'; payload: { playerId: string; governmentId: string; score: number } }
  
  // 投资学习系统（投资者专属）
  | { type: 'INVESTMENT_STUDY'; payload: { playerId: string; cost: number } }
  
  // 交易系统
  | { type: 'CREATE_TRADE'; payload: Partial<TradeOffer> & { type: TradeType; fromPlayerId: string; toPlayerId: string } }
  | { type: 'RESPOND_TRADE'; payload: { tradeId: string; accepted: boolean; counterOffer?: Partial<TradeOffer> } }
  
  // 健康系统
  | { type: 'BUY_MEDICINE'; payload: { playerId: string } }
  
  // 事件系统
  | { type: 'TRIGGER_EVENT'; payload: RandomEvent }
  | { type: 'DISMISS_EVENT' }
  | { type: 'SETTLE_ROUND' }
  | { type: 'ADD_LOG'; payload: GameLogEntry }
  | { type: 'END_GAME' };

// ==================== 辅助函数 ====================

const generateId = () => Math.random().toString(36).substring(2, 15);
const generateBatchId = () => 'batch_' + Math.random().toString(36).substring(2, 15);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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

function applyPendingPoliciesForRound(state: GameState, market: Market, round: number): { market: Market; appliedNews: RandomEvent | null; remainingPolicies: GameState['pendingPolicies'] } {
  const duePolicies = state.pendingPolicies.filter(policy => policy.effectiveRound <= round);
  const remainingPolicies = state.pendingPolicies.filter(policy => policy.effectiveRound > round);
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

function getBankRates(market: Market) {
  const baseRate = market.bank?.centralBankRate ?? ECONOMY_BALANCE.bank.baseRate;
  return {
    centralBankRate: baseRate,
    depositRate: market.bank?.depositRate ?? Math.max(0, baseRate + ECONOMY_BALANCE.bank.depositRateSpread),
    consumerLoanRate: market.bank?.consumerLoanRate ?? baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.consumer,
    mortgageRate: market.bank?.mortgageRate ?? baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.mortgage,
    businessLoanRate: market.bank?.businessLoanRate ?? baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.business,
    defaultedLoans: market.bank?.defaultedLoans ?? 0,
  };
}

function getLoanRate(market: Market, loanType: LoanType): number {
  const bank = getBankRates(market);
  if (loanType === 'mortgage') return bank.mortgageRate;
  if (loanType === 'business') return bank.businessLoanRate;
  return bank.consumerLoanRate;
}

function creditTaxToGovernment(players: Player[], taxPaid: number): Player[] {
  if (taxPaid <= 0) return players;
  const government = players.find(player => player.profession === 'government' && player.govAbilities);
  if (!government?.govAbilities) return players;
  return players.map(player => {
    if (player.id !== government.id || !player.govAbilities) return player;
    return {
      ...player,
      govAbilities: {
        ...player.govAbilities,
        treasuryBalance: player.govAbilities.treasuryBalance + taxPaid,
      },
    };
  });
}

function calculateNetWorth(player: Player): number {
  const assetValue = player.assets.reduce((sum, asset) => sum + asset.currentValue, 0);
  const debt = (player.loans ?? []).reduce((sum, loan) => sum + loan.remaining, 0);
  return player.cash + assetValue - debt;
}

const investmentTypes: InvestmentType[] = ['stock', 'bond', 'gold', 'deposit'];

function isInvestmentAsset(asset: Asset): asset is Asset & { type: InvestmentType } {
  return investmentTypes.includes(asset.type as InvestmentType);
}

function calculatePortfolioRisk(player: Player): number {
  const investments = player.assets.filter(isInvestmentAsset);
  const totalValue = investments.reduce((sum, asset) => sum + asset.currentValue, 0);
  if (totalValue <= 0) return 0;

  const byType = Object.fromEntries(investmentTypes.map(type => [type, 0])) as Record<InvestmentType, number>;
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

function applyLingeringEventPressure(market: Market, events: RandomEvent[]): void {
  events.forEach(event => {
    if ((event.remainingDuration ?? event.duration ?? 0) <= 0) return;
    if (event.effects.inflation) {
      market.inflationRate = clamp(market.inflationRate + event.effects.inflation * 0.2, -0.1, 0.3);
    }
    if (event.effects.employment) {
      market.employmentRate = clamp(market.employmentRate + event.effects.employment * 0.15, 30, 100);
    }
    if (event.effects.socialStability) {
      market.socialStability = clamp(market.socialStability + event.effects.socialStability * 0.15, 0, 100);
    }
    if (event.effects.stockMarket) {
      market.stockMarket = {
        ...market.stockMarket,
        volatility: clamp(market.stockMarket.volatility + event.effects.stockMarket.volatilityChange * 0.1, 0.03, 1),
      };
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
  market: Market,
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

function calculateVictoryScores(players: Player[], market: Market): GameState['victoryScores'] {
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
      const investmentValue = player.assets.filter(asset => ['stock', 'bond', 'gold', 'deposit'].includes(asset.type)).reduce((sum, asset) => sum + asset.currentValue, 0);
      const portfolioRisk = calculatePortfolioRisk(player);
      const score = Math.max(0, investmentValue - ECONOMY_BALANCE.startingCash.investor) / 1000 + (player.investorAbilities?.investmentSkill ?? 0) * 0.4 - portfolioRisk * 18;
      return [player.id, { score, goal: '风险调整后资产增值', details: `投资资产¥${Math.round(investmentValue)} 风险${portfolioRisk.toFixed(2)} 技能${player.investorAbilities?.investmentSkill ?? 0}` }];
    }
    const score = market.socialStability * 0.45 + market.gdp / 1000 - market.giniCoefficient * 40;
    return [player.id, { score, goal: '稳定、GDP与贫富差距', details: `稳定${Math.round(market.socialStability)} GDP¥${Math.round(market.gdp)} 基尼${market.giniCoefficient.toFixed(2)}` }];
  }));
}

const createInitialWorkState = (): WorkState => ({
  workCount: 0,
  fatigueLevel: 0,
});

const createInitialCompany = (ownerId: string): Company => ({
  id: generateId(),
  ownerId,
  name: '创业公司',
  employees: 0,
  machines: 0,
  rawMaterials: 50,  // 初始原材料库存
  inventory: 0,      // 初始产品库存
  productInventory: {
    daily_necessities: 0,
    food: 0,
    entertainment: 0,
    luxury: 0,
  },
  priceDecisions: {},
  salesDecisions: {},
  productionCapacity: 0,
  productionCost: ECONOMY_BALANCE.company.wagePerEmployee,
  productQuality: 60,
  revenue: 0,
  costs: 0,
  profit: 0,
  marketShare: 5,
  stockPrice: 100,
  cashFlow: {
    initial: ECONOMY_BALANCE.startingCash.entrepreneur,
    income: 0,
    expenses: 0,
    final: ECONOMY_BALANCE.startingCash.entrepreneur,
    wages: 0,
    productionCosts: 0,
    otherCosts: 0,
  },
  efficiency: 100,
  morale: 70,
  reputation: 50,
  productionType: 'daily_necessities',  // 默认生产日用品
  autoProduction: {
    enabled: false,
    monthlyTarget: 0,
  },
  stats: {
    totalProduced: 0,
    totalSold: 0,
    totalRevenue: 0,
    totalCosts: 0,
    monthlyProfit: 0,
  },
  productionUsedThisRound: 0,
});

const createInitialPlayer = (
  id: string,
  name: string,
  color: string,
  profession: PlayerProfession
): Player => {
  // 根据职业设置不同的初始属性（符合现实情况）
  const professionInitialStats = {
    worker: {
      happiness: 55,      // 工作压力大，幸福度较低
      health: 65,         // 体力劳动，健康消耗较大
      socialStatus: 40,   // 基层员工，社会地位较低
    },
    entrepreneur: {
      happiness: 65,      // 经营有压力，幸福度中等
      health: 80,         // 需要维系企业，健康较好
      socialStatus: 60,   // 商业精英，社会地位较高
    },
    investor: {
      happiness: 75,      // 时间自由灵活，幸福度高
      health: 85,         // 生活规律，健康状况好
      socialStatus: 50,   // 专业领域，社会地位中等
    },
    government: {
      happiness: 65,      // 工作稳定但压力大，幸福度中等
      health: 75,         // 福利保障好，健康较好
      socialStatus: 70,   // 公务人员，社会地位高
    },
  };

  const stats = professionInitialStats[profession];

  return {
    id,
    name,
    color,
    profession,
    attributes: ['consumer'],
    cash: ECONOMY_BALANCE.startingCash[profession],
    assets: [],
    goods: {
      food: profession === 'entrepreneur' ? 10 : 5,
      daily_necessities: 3,
      housing: 0,
      transportation: 0,
      entertainment: 0,
      luxury: 0,
      education: 0,
      healthcare: 2,
    },
    housingStatus: 'none',
    housingTier: null,
    currentRent: 0,
    rentPaid: false,
    happiness: stats.happiness,
    health: stats.health,
    socialStatus: stats.socialStatus,
    workState: createInitialWorkState(),
    taxRate: 0.2,
    subsidiesBudget: 0,
    company: profession === 'entrepreneur' ? createInitialCompany(id) : undefined,
    loans: [],
    creditScore: 70,
    hasActedThisRound: false,
    isBankrupt: false,
    governmentRatings: {},
    permanentBonuses: {
      incomeBonus: 0,
      happinessBonus: 0,
    },
    workerAbilities: profession === 'worker' ? {
      skill: 30,
      wageLevel: ECONOMY_BALANCE.worker.baseWage,
      trainingSessions: 0,
      unemployedRounds: 0,
      negotiationPower: 20,
    } : undefined,
    policyCooldowns: profession === 'government' ? {
      tax_raise: 0,
      tax_cut: 0,
      subsidy_all: 0,
      subsidy_poor: 0,
      subsidy_business: 0,
      infrastructure: 0,
      wage_control: 0,
      price_control: 0,
      import_tariff: 0,
      export_promotion: 0,
    } : undefined,
    investorAbilities: profession === 'investor' ? {
      investmentSkill: 30,         // 初始投资技能30%
      learningPoints: 0,          // 学习点数
      totalLearningSessions: 0,   // 累计学习次数
      canSeeEconomicTrends: true, // 投资者能看到经济形势
      lastMarketAnalysis: 0,     // 上次分析时间
    } : undefined,
    govAbilities: profession === 'government' ? {
      treasuryBalance: 100000,
      publicFunds: 0,
      governanceExp: 0,
      decisionPower: 10,
      reputation: 60,
      approvalRating: 60,
      policyHistory: [],
    } : undefined,
  };
};

// 经济周期转换图
const CYCLE_TRANSITIONS: Record<EconomicCycle, EconomicCycle[]> = {
  overheating: ['overheating', 'growth', 'downturn'],
  growth: ['growth', 'overheating', 'downturn'],
  downturn: ['downturn', 'contraction', 'growth'],
  contraction: ['contraction', 'downturn', 'growth'],
};

const getNextCycle = (current: EconomicCycle): EconomicCycle => {
  const options = CYCLE_TRANSITIONS[current];
  const weights = [0.5, 0.3, 0.2];
  const roll = Math.random();
  let cumulative = 0;
  for (let i = 0; i < options.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) return options[i];
  }
  return current;
};

const createInitialMarket = (): Market => ({
  goods: JSON.parse(JSON.stringify(INITIAL_GOODS)),
  stockMarket: {
    index: 100,
    volatility: 0.1,
    trend: 'stable',
  },
  gdp: 0,
  inflationRate: 0.02,
  employmentRate: 70,
  giniCoefficient: 0.4,
  socialStability: 75,
  supplyDemand: {
    food: { supply: 100, demand: 100 },
    daily_necessities: { supply: 100, demand: 100 },
    housing: { supply: 50, demand: 50 },
    transportation: { supply: 100, demand: 100 },
    entertainment: { supply: 50, demand: 50 },
    luxury: { supply: 20, demand: 20 },
    education: { supply: 30, demand: 30 },
    healthcare: { supply: 50, demand: 50 },
  },
  economicCycle: 'growth',
  cyclePhase: 0,
  globalTaxRate: 0.2,
  policyStabilityModifier: 0,
  monthlyTaxRevenue: 0,
  productivityBonus: 0,
  timeUnit: 'month',
  bank: {
    centralBankRate: ECONOMY_BALANCE.bank.baseRate,
    depositRate: Math.max(0, ECONOMY_BALANCE.bank.baseRate + ECONOMY_BALANCE.bank.depositRateSpread),
    consumerLoanRate: ECONOMY_BALANCE.bank.baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.consumer,
    mortgageRate: ECONOMY_BALANCE.bank.baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.mortgage,
    businessLoanRate: ECONOMY_BALANCE.bank.baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.business,
    defaultedLoans: 0,
  },
  laborMarket: {
    baseWage: ECONOMY_BALANCE.worker.baseWage,
    unemploymentRate: 0.06,
    skillPremium: 0.01,
    minimumWage: 3500,
  },
});

const initialState: GameState = {
  phase: 'setup',
  gameMode: 'professional',
  currentRound: 1,
  currentPlayerIndex: 0,
  players: [],
  market: createInitialMarket(),
  tradeOffers: [],
  pendingTrade: null,
  recentEvent: null,
  currentNews: null,
  tutorialPrompt: null,
  pendingPolicies: [],
  activeEvents: [],
  eventHistory: [],
  gameLog: [],
  winner: null,
  assetBatches: [],
  roundCompletedPlayers: [],
};

// ==================== Reducer ====================

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'INIT_GAME': {
      const { playerNames, playerProfessions, gameMode = 'professional' } = action.payload;
      const players = playerNames.map((name, index) =>
        createInitialPlayer(
          generateId(),
          name,
          PLAYER_COLORS[index % PLAYER_COLORS.length],
          playerProfessions[index]
        )
      );
      return {
        ...state,
        gameMode,
        players,
        phase: 'setup',
        gameLog: [{
          id: generateId(),
          round: 0,
          timestamp: Date.now(),
          type: 'system',
          message: '游戏初始化完成，等待开始...',
        }],
      };
    }

    case 'START_GAME':
      return applyNewsEvent({
        ...state,
        phase: 'news',
        currentPlayerIndex: 0,
        gameLog: [{
          id: generateId(),
          round: 1,
          timestamp: Date.now(),
          type: 'system',
          message: '第 1 轮游戏开始！',
        }],
      }, pickNewsEvent(1));

    case 'DISMISS_NEWS':
      return {
        ...state,
        phase: 'player_turn',
      };

    case 'CONFIRM_END_TURN': {
      const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
      if (nextIndex === 0) {
        return { ...state, phase: 'settlement' };
      }
      return {
        ...state,
        phase: 'player_turn',
        currentPlayerIndex: nextIndex,
        gameLog: [...state.gameLog, {
          id: generateId(),
          round: state.currentRound,
          timestamp: Date.now(),
          type: 'system',
          message: `轮到 ${state.players[nextIndex]?.name} 操作`,
        }],
      };
    }

    case 'CANCEL_END_TURN':
      return { ...state, phase: 'player_turn' };

    case 'END_TURN': {
      const prompt = getEndTurnTutorialPrompt(state.players[state.currentPlayerIndex] ?? null);
      if (prompt) {
        return { ...state, tutorialPrompt: prompt };
      }
      // 先显示确认弹窗
      return { ...state, phase: 'confirm_turn_end' };
    }

    case 'DISMISS_TUTORIAL':
      return {
        ...state,
        tutorialPrompt: null,
        phase: 'confirm_turn_end',
      };

    case 'SET_PHASE':
      return { ...state, phase: action.payload };

    // ==================== 工作系统 ====================
    case 'WORK': {
      const { playerId } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (!player) return state;
      if (player.profession === 'worker' && (player.workerAbilities?.unemployedRounds ?? 0) > 0) return state;

      const professionConfig = PROFESSION_CONFIGS[player.profession];
      
      // 检查工作限制
      if (player.workState.workCount >= professionConfig.maxWorkPerRound) {
        return state;
      }

      // 疲劳惩罚
      const fatiguePenalty = player.workState.workCount > 0 ? 
        player.workState.workCount * 0.2 : 0;
      
      const skillBonus = player.workerAbilities ? player.workerAbilities.skill * 0.01 : 0;
      const workerWage = player.workerAbilities?.wageLevel ?? state.market.laborMarket?.baseWage ?? ECONOMY_BALANCE.worker.baseWage;
      let income = (player.profession === 'worker' ? workerWage : professionConfig.baseIncome) * (1 - fatiguePenalty) * (1 + skillBonus);
      let healthCost = 5;
      let fatigueIncrease = 20;

      // 特殊职业处理
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

      // 应用永久加成和税率
      income = income * (1 + player.permanentBonuses.incomeBonus);
      const taxPaid = Math.max(0, income * state.market.globalTaxRate);
      const afterTax = income - taxPaid;

      const updatedPlayers = creditTaxToGovernment(state.players.map(p => {
        if (p.id !== playerId) return p;
        
        const extraHealthCost = player.workState.workCount >= professionConfig.maxWorkPerRound - 1 ? 
          healthCost * 2 : 0;
        
        return {
          ...p,
          cash: p.cash + afterTax,
          health: Math.max(0, p.health - healthCost - extraHealthCost),
          happiness: Math.min(100, p.happiness + 2 - player.workState.workCount),
          workState: {
            workCount: p.workState.workCount + 1,
            fatigueLevel: Math.min(100, p.workState.fatigueLevel + fatigueIncrease),
            lastWorkTime: Date.now(),
          },
        };
      }), taxPaid);

      return {
        ...state,
        players: updatedPlayers,
        market: {
          ...state.market,
          monthlyTaxRevenue: (state.market.monthlyTaxRevenue ?? 0) + taxPaid,
        },
      };
    }

    case 'OVERTIME_WORK': {
      const { playerId } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.profession !== 'worker') return state;
      if ((player.workerAbilities?.unemployedRounds ?? 0) > 0) return state;
      if (player.health < 35 || player.workState.fatigueLevel >= 85 || (player.workState.overtimeCount ?? 0) >= 1) return state;

      const wage = player.workerAbilities?.wageLevel ?? ECONOMY_BALANCE.worker.baseWage;
      const income = wage * ECONOMY_BALANCE.worker.overtimeMultiplier;
      const taxPaid = income * state.market.globalTaxRate;
      const updatedPlayers = creditTaxToGovernment(state.players.map(p => {
        if (p.id !== playerId) return p;
        return {
          ...p,
          cash: p.cash + income - taxPaid,
          health: Math.max(0, p.health - 12),
          happiness: Math.max(0, p.happiness - 4),
          workState: {
            workCount: p.workState.workCount + 1,
            overtimeCount: (p.workState.overtimeCount ?? 0) + 1,
            fatigueLevel: Math.min(100, p.workState.fatigueLevel + 35),
            lastWorkTime: Date.now(),
          },
        };
      }), taxPaid);

      return {
        ...state,
        players: updatedPlayers,
        market: {
          ...state.market,
          monthlyTaxRevenue: (state.market.monthlyTaxRevenue ?? 0) + taxPaid,
        },
      };
    }

    case 'WORKER_TRAINING': {
      const { playerId, cost } = action.payload;
      return {
        ...state,
        players: state.players.map(p => {
          if (p.id !== playerId || p.profession !== 'worker' || p.cash < cost) return p;
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
        }),
      };
    }

    case 'NEGOTIATE_WAGE': {
      const { playerId } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.profession !== 'worker') return state;
      const ability = player.workerAbilities ?? {
        skill: 30,
        wageLevel: ECONOMY_BALANCE.worker.baseWage,
        trainingSessions: 0,
        unemployedRounds: 0,
        negotiationPower: 20,
      };
      if (ability.lastNegotiationRound === state.currentRound) return state;
      const employmentPenalty = (100 - state.market.employmentRate) * 0.4;
      const successChance = clamp((ability.skill + ability.negotiationPower - employmentPenalty) / 120, 0.15, 0.85);
      const succeeded = Math.random() < successChance;

      return {
        ...state,
        players: state.players.map(p => {
          if (p.id !== playerId) return p;
          const current = p.workerAbilities ?? ability;
          return {
            ...p,
            happiness: clamp(p.happiness + (succeeded ? 4 : -3), 0, 100),
            workerAbilities: {
              ...current,
              wageLevel: succeeded ? Math.round(current.wageLevel * 1.08) : current.wageLevel,
              negotiationPower: Math.min(100, current.negotiationPower + 3),
              lastNegotiationRound: state.currentRound,
            },
          };
        }),
        gameLog: [...state.gameLog, {
          id: generateId(),
          round: state.currentRound,
          timestamp: Date.now(),
          type: 'action',
          message: succeeded ? `${player.name} 谈薪成功，工资上调 8%` : `${player.name} 谈薪失败，积累了谈判经验`,
          playerId,
        }],
      };
    }

    case 'SWITCH_JOB': {
      const { playerId } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.profession !== 'worker') return state;
      const ability = player.workerAbilities ?? {
        skill: 30,
        wageLevel: ECONOMY_BALANCE.worker.baseWage,
        trainingSessions: 0,
        unemployedRounds: 0,
        negotiationPower: 20,
      };
      if (player.cash < ECONOMY_BALANCE.worker.jobSwitchCost) return state;
      const offer = getBestJobOffer(state.players, player, state.market.employmentRate);

      const employmentBonus = (state.market.employmentRate - 60) * 0.006;
      const skillGap = ability.skill - offer.requiredSkill;
      const successChance = clamp(0.25 + skillGap * 0.012 + ability.negotiationPower * 0.003 + employmentBonus, 0.08, 0.92);
      const succeeded = Math.random() < successChance;

      return {
        ...state,
        players: state.players.map(p => {
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
        }),
        gameLog: [...state.gameLog, {
          id: generateId(),
          round: state.currentRound,
          timestamp: Date.now(),
          type: 'action',
          message: succeeded ? `${player.name} 跳槽到 ${offer.employerName}，获得 ${offer.title}，月薪 ¥${offer.wage}` : `${player.name} 未达到 ${offer.title} 门槛，跳槽失败并短暂失业 1 个月`,
          playerId,
        }],
      };
    }

    case 'SIDE_JOB': {
      const { playerId } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.profession !== 'worker') return state;

      const income = ECONOMY_BALANCE.worker.sideJobIncome;
      const taxPaid = income * state.market.globalTaxRate;
      const updatedPlayers = creditTaxToGovernment(state.players.map(p => {
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
      }), taxPaid);

      return {
        ...state,
        players: updatedPlayers,
        market: {
          ...state.market,
          monthlyTaxRevenue: (state.market.monthlyTaxRevenue ?? 0) + taxPaid,
        },
      };
    }

    // ==================== 市场交易 ====================
    case 'BUY_GOOD': {
      const { playerId, goodType, quantity } = action.payload;
      const good = state.market.goods[goodType];
      const totalCost = good.currentPrice * quantity * (1 + state.market.inflationRate);

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.cash < totalCost) return player;

        // 特殊处理
        if (goodType === 'education') {
          return {
            ...player,
            cash: player.cash - totalCost,
            goods: { ...player.goods, [goodType]: player.goods[goodType] + quantity },
            socialStatus: player.socialStatus + 10,
            permanentBonuses: {
              ...player.permanentBonuses,
              incomeBonus: player.permanentBonuses.incomeBonus + 0.1,
            },
          };
        }

        if (goodType === 'transportation') {
          return {
            ...player,
            cash: player.cash - totalCost,
            goods: { ...player.goods, [goodType]: player.goods[goodType] + quantity },
            socialStatus: player.socialStatus + 2,
            permanentBonuses: {
              ...player.permanentBonuses,
              incomeBonus: player.permanentBonuses.incomeBonus + 0.05,
            },
          };
        }

        if (goodType === 'luxury') {
          return {
            ...player,
            cash: player.cash - totalCost,
            goods: { ...player.goods, [goodType]: player.goods[goodType] + quantity },
            happiness: Math.min(100, player.happiness + 15),
            socialStatus: player.socialStatus + 20,
          };
        }

        if (goodType === 'healthcare') {
          return {
            ...player,
            cash: player.cash - totalCost,
            goods: { ...player.goods, [goodType]: player.goods[goodType] + quantity },
            health: Math.min(100, player.health + 20),
          };
        }

        return {
          ...player,
          cash: player.cash - totalCost,
          goods: {
            ...player.goods,
            [goodType]: player.goods[goodType] + quantity,
          },
        };
      });

      return {
        ...state,
        players: updatedPlayers,
        market: {
          ...state.market,
          supplyDemand: {
            ...state.market.supplyDemand,
            [goodType]: {
              ...state.market.supplyDemand[goodType],
              demand: state.market.supplyDemand[goodType].demand + quantity,
            }
          }
        }
      };
    }

    case 'SELL_GOOD': {
      const { playerId, goodType, quantity } = action.payload;
      const good = state.market.goods[goodType];
      const totalRevenue = good.currentPrice * quantity * 0.85;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.goods[goodType] < quantity) return player;

        return {
          ...player,
          cash: player.cash + totalRevenue,
          goods: {
            ...player.goods,
            [goodType]: player.goods[goodType] - quantity,
          },
        };
      });

      return {
        ...state,
        players: updatedPlayers,
        market: {
          ...state.market,
          supplyDemand: {
            ...state.market.supplyDemand,
            [goodType]: {
              ...state.market.supplyDemand[goodType],
              supply: state.market.supplyDemand[goodType].supply + quantity,
            }
          }
        }
      };
    }

    // ==================== 企业家产品销售 ====================
    case 'SELL_COMPANY_PRODUCT': {
      const { playerId, quantity, pricePerUnit } = action.payload;
      
      const seller = state.players.find(player => player.id === playerId);
      if (!seller?.company) return state;
      const productType: ProductionGoodType = action.payload.productType ?? seller.company.productionType;
      const prodConfig = PRODUCTION_CONFIGS[productType];
      const lockedPrice = seller.company.priceDecisions?.[productType]?.round === state.currentRound
        ? seller.company.priceDecisions[productType]?.price
        : undefined;
      if (lockedPrice !== undefined) return state;
      const effectivePrice = lockedPrice ?? pricePerUnit;
      const minPrice = prodConfig.minSellingPrice;
      const maxPrice = prodConfig.maxSellingPrice;
      
      if (effectivePrice < minPrice || effectivePrice > maxPrice) {
        console.error(`售价应在 ¥${minPrice}~¥${maxPrice} 之间`);
        return state;
      }
      if (lockedPrice !== undefined && pricePerUnit !== lockedPrice) return state;
      
      if (quantity <= 0) {
        console.error('出售数量必须大于0');
        return state;
      }
      
      const sellerInventory = getProductInventory(seller.company);
      const inventory = sellerInventory[productType] || 0;
      if (inventory < quantity) return state;
      const actualSold = estimateProductSales(state.market, seller.company, productType, quantity, effectivePrice);
      if (actualSold <= 0) return state;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (!player.company) return player;

        // 计算收入（扣除10%市场税）
        const grossRevenue = effectivePrice * actualSold;
        const marketTax = Math.floor(grossRevenue * ECONOMY_BALANCE.company.salesTaxRate);
        const netRevenue = grossRevenue - marketTax;
        const productInventory = getProductInventory(player.company);
        productInventory[productType] = Math.max(0, productInventory[productType] - actualSold);
        
        return {
          ...player,
          cash: player.cash + netRevenue,
          company: {
            ...player.company,
            inventory: getTotalProductInventory(productInventory),
            productInventory,
            priceDecisions: {
              ...(player.company.priceDecisions ?? {}),
              [productType]: { price: effectivePrice, round: state.currentRound },
            },
            salesDecisions: {
              ...(player.company.salesDecisions ?? {}),
              [productType]: {
                round: state.currentRound,
                price: effectivePrice,
                requested: quantity,
                sold: actualSold,
                grossRevenue,
                netRevenue,
              },
            },
            cashFlow: {
              ...player.company.cashFlow,
              income: player.company.cashFlow.income + grossRevenue,
              final: player.company.cashFlow.final + netRevenue,
            },
            revenue: player.company.revenue + grossRevenue,
            costs: player.company.costs + marketTax,
            profit: player.company.profit + netRevenue,
            marketShare: clamp(actualSold / Math.max(1, actualSold + state.market.supplyDemand[productType].demand) * 100, 0, 100),
            stats: {
              ...player.company.stats,
              totalSold: player.company.stats.totalSold + actualSold,
              totalRevenue: player.company.stats.totalRevenue + netRevenue,
            },
          },
        };
      });
      
      return {
        ...state,
        players: updatedPlayers,
        market: {
          ...state.market,
          monthlyTaxRevenue: (state.market.monthlyTaxRevenue ?? 0) + Math.floor(effectivePrice * actualSold * ECONOMY_BALANCE.company.salesTaxRate),
          supplyDemand: {
            ...state.market.supplyDemand,
            [productType]: {
              ...state.market.supplyDemand[productType],
              demand: Math.max(0, state.market.supplyDemand[productType].demand - actualSold),
              supply: state.market.supplyDemand[productType].supply + Math.max(0, quantity - actualSold),
            },
          },
        },
      };
    }

    // ==================== 投资系统（统一涨跌幅）====================
    case 'INVEST': {
      const { playerId, investmentType, amount } = action.payload;
      const config = INVESTMENT_CONFIGS[investmentType];
      const batchId = generateBatchId();
      const fee = Math.round(amount * ECONOMY_BALANCE.investment.transactionFeeRate);
      const totalCost = amount + fee;

      // 创建新的批次
      const newBatch: AssetBatch = {
        batchId,
        type: investmentType,
        totalValue: amount,
        units: 1,
        purchaseTime: Date.now(),
      };

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.cash < totalCost) return player;

        const newAsset: Asset = {
          id: generateId(),
          type: investmentType,
          name: config.name,
          batchId,
          purchasePrice: amount,
          currentValue: amount,
        };

        return {
          ...player,
          cash: player.cash - totalCost,
          assets: [...player.assets, newAsset],
          attributes: !player.attributes.includes('investor') ?
            [...player.attributes, 'investor' as PlayerAttribute] :
            player.attributes,
        };
      });

      return {
        ...state,
        players: updatedPlayers,
        market: {
          ...state.market,
          monthlyTaxRevenue: (state.market.monthlyTaxRevenue ?? 0) + fee * 0.2,
        },
        assetBatches: [...state.assetBatches, newBatch],
      };
    }

    case 'CASH_OUT_INVESTMENT': {
      const { playerId, assetId } = action.payload;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        const asset = player.assets.find(a => a.id === assetId);
        if (!asset) return player;
        const gain = Math.max(0, asset.currentValue - asset.purchasePrice);
        const tax = gain * ECONOMY_BALANCE.investment.capitalGainsTaxRate;
        const fee = asset.currentValue * ECONOMY_BALANCE.investment.transactionFeeRate;

        return {
          ...player,
          cash: player.cash + Math.max(0, asset.currentValue - tax - fee),
          assets: player.assets.filter(a => a.id !== assetId),
        };
      });

      const taxPaid = state.players
        .filter(player => player.id === playerId)
        .flatMap(player => player.assets.filter(asset => asset.id === assetId))
        .reduce((sum, asset) => sum + Math.max(0, asset.currentValue - asset.purchasePrice) * ECONOMY_BALANCE.investment.capitalGainsTaxRate, 0);

      return {
        ...state,
        players: creditTaxToGovernment(updatedPlayers, taxPaid),
        market: {
          ...state.market,
          monthlyTaxRevenue: (state.market.monthlyTaxRevenue ?? 0) + taxPaid,
        },
      };
    }

    case 'CASH_OUT_ALL_INVESTMENT': {
      const { playerId, type } = action.payload;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        
        const typeAssets = player.assets.filter(a => a.type === type);
        const totalValue = typeAssets.reduce((sum, a) => sum + a.currentValue, 0);
        const gains = typeAssets.reduce((sum, a) => sum + Math.max(0, a.currentValue - a.purchasePrice), 0);
        const tax = gains * ECONOMY_BALANCE.investment.capitalGainsTaxRate;
        const fee = totalValue * ECONOMY_BALANCE.investment.transactionFeeRate;

        return {
          ...player,
          cash: player.cash + Math.max(0, totalValue - tax - fee),
          assets: player.assets.filter(a => a.type !== type),
        };
      });

      const taxPaid = state.players
        .filter(player => player.id === playerId)
        .flatMap(player => player.assets.filter(asset => asset.type === type))
        .reduce((sum, asset) => sum + Math.max(0, asset.currentValue - asset.purchasePrice) * ECONOMY_BALANCE.investment.capitalGainsTaxRate, 0);

      return {
        ...state,
        players: creditTaxToGovernment(updatedPlayers, taxPaid),
        market: {
          ...state.market,
          monthlyTaxRevenue: (state.market.monthlyTaxRevenue ?? 0) + taxPaid,
        },
      };
    }

    case 'TAKE_LOAN': {
      const { playerId, loanType, amount } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (!player) return state;
      if (loanType === 'business' && !player.company) return state;
      if (loanType === 'mortgage' && player.housingStatus !== 'owned') return state;

      const currentDebt = (player.loans ?? []).reduce((sum, loan) => sum + loan.remaining, 0);
      const creditScore = player.creditScore ?? 70;
      const debtLimit = creditScore * (loanType === 'business' ? 5000 : loanType === 'mortgage' ? 4000 : 1200);
      if (currentDebt + amount > debtLimit) return state;

      const loan: Loan = {
        id: generateId(),
        type: loanType,
        principal: amount,
        remaining: amount,
        monthlyRate: getLoanRate(state.market, loanType),
        collateral: loanType === 'mortgage' ? player.housingTier ?? undefined : undefined,
        createdRound: state.currentRound,
      };

      return {
        ...state,
        players: state.players.map(p => {
          if (p.id !== playerId) return p;
          return {
            ...p,
            cash: p.cash + amount,
            loans: [...(p.loans ?? []), loan],
            creditScore: Math.max(0, (p.creditScore ?? 70) - Math.ceil(amount / 50000)),
          };
        }),
      };
    }

    case 'REPAY_LOAN': {
      const { playerId, loanId, amount } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      const loan = player?.loans?.find(item => item.id === loanId);
      if (!player || !loan) return state;
      const payment = Math.min(amount, loan.remaining);
      if (player.cash < payment) return state;

      return {
        ...state,
        players: state.players.map(p => {
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
        }),
      };
    }

    // ==================== 房地产 ====================
    case 'RENT_HOUSE': {
      const { playerId, tier } = action.payload;
      const config = HOUSING_CONFIGS[tier];
      const firstMonthRent = config.rentPrice;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.cash < firstMonthRent) return player;
        if (player.housingStatus === 'owned') return player;

        return {
          ...player,
          cash: player.cash - firstMonthRent,
          housingStatus: 'renting' as HousingStatus,
          housingTier: tier,
          currentRent: config.rentPrice,
          rentPaid: true,
          happiness: player.happiness + config.effect.happiness,
          health: Math.min(100, player.health + config.effect.health),
          socialStatus: player.socialStatus + config.effect.socialStatus,
        };
      });

      return { ...state, players: updatedPlayers };
    }

    case 'BUY_HOUSE': {
      const { playerId, tier } = action.payload;
      const config = HOUSING_CONFIGS[tier];

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.cash < config.purchasePrice) return player;
        if (player.housingStatus === 'owned' && player.housingTier === tier) return player;

        const oldTierEffect = player.housingTier ? HOUSING_CONFIGS[player.housingTier].effect : null;
        
        const newAsset: Asset = {
          id: generateId(),
          type: 'real_estate' as AssetType,
          name: `${config.name}产权`,
          batchId: 'real_estate',
          purchasePrice: config.purchasePrice,
          currentValue: config.purchasePrice,
          rentalIncome: config.rentPrice,
        };

        return {
          ...player,
          cash: player.cash - config.purchasePrice,
          housingStatus: 'owned' as HousingStatus,
          housingTier: tier,
          currentRent: 0,
          assets: player.assets.filter(a => a.type !== 'real_estate').concat(newAsset),
          happiness: player.happiness - (oldTierEffect?.happiness || 0) + config.effect.happiness,
          health: Math.min(100, player.health - (oldTierEffect?.health || 0) + config.effect.health),
          socialStatus: player.socialStatus - (oldTierEffect?.socialStatus || 0) + config.effect.socialStatus,
          permanentBonuses: {
            ...player.permanentBonuses,
            incomeBonus: player.permanentBonuses.incomeBonus + config.effect.incomeBonus,
          },
        };
      });

      return { ...state, players: updatedPlayers };
    }

    case 'SELL_HOUSE': {
      const { playerId } = action.payload;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.housingStatus !== 'owned') return player;

        const sellPrice = player.housingTier ? 
          HOUSING_CONFIGS[player.housingTier].purchasePrice * 0.8 : 0;
        const oldEffect = player.housingTier ? 
          HOUSING_CONFIGS[player.housingTier].effect : null;

        return {
          ...player,
          cash: player.cash + sellPrice,
          housingStatus: 'none' as HousingStatus,
          housingTier: null,
          currentRent: 0,
          assets: player.assets.filter(a => a.type !== 'real_estate'),
          happiness: player.happiness - (oldEffect?.happiness || 0),
          socialStatus: player.socialStatus - (oldEffect?.socialStatus || 0),
          permanentBonuses: {
            ...player.permanentBonuses,
            incomeBonus: player.permanentBonuses.incomeBonus - (oldEffect?.incomeBonus || 0),
          },
        };
      });

      return { ...state, players: updatedPlayers };
    }

    case 'CANCEL_RENT': {
      const { playerId } = action.payload;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.housingStatus !== 'renting') return player;

        const oldEffect = player.housingTier ? 
          HOUSING_CONFIGS[player.housingTier].effect : null;

        return {
          ...player,
          housingStatus: 'none' as HousingStatus,
          housingTier: null,
          currentRent: 0,
          rentPaid: false,
          happiness: player.happiness - (oldEffect?.happiness || 0),
          health: player.health - (oldEffect?.health || 0),
          socialStatus: player.socialStatus - (oldEffect?.socialStatus || 0),
        };
      });

      return { ...state, players: updatedPlayers };
    }

    // ==================== 企业系统 ====================
    case 'HIRE_EMPLOYEE': {
      const { playerId, count } = action.payload;
      const totalCost = ECONOMY_BALANCE.company.hiringCostPerEmployee * count;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.profession !== 'entrepreneur' || !player.company) return player;
        if (player.cash < totalCost) return player;

        const newMorale = Math.min(100, player.company.morale + count * 2);

        return {
          ...player,
          cash: player.cash - totalCost,
          company: {
            ...player.company,
            employees: player.company.employees + count,
            costs: player.company.costs + totalCost,
            productionCapacity: (player.company.employees + count) * ECONOMY_BALANCE.company.employeeCapacity + player.company.machines * ECONOMY_BALANCE.company.machineCapacity,
            morale: newMorale,
            cashFlow: {
              ...player.company.cashFlow,
              expenses: player.company.cashFlow.expenses + totalCost,
            },
          },
        };
      });

      return { ...state, players: updatedPlayers };
    }

    case 'FIRE_EMPLOYEE': {
      const { playerId, count } = action.payload;
      const wagePerEmployee = (player: Player) => player.company?.productionCost || ECONOMY_BALANCE.company.wagePerEmployee;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.profession !== 'entrepreneur' || !player.company) return player;

        const actualFire = Math.min(count, player.company.employees);
        const severance = actualFire * Math.round((wagePerEmployee(player) / 10));  // 简化遣散费

        return {
          ...player,
          cash: player.cash - severance,
          company: {
            ...player.company,
            employees: Math.max(0, player.company.employees - actualFire),
            costs: player.company.costs + severance,
            productionCapacity: Math.max(0, (player.company.employees - actualFire) * ECONOMY_BALANCE.company.employeeCapacity + player.company.machines * ECONOMY_BALANCE.company.machineCapacity),
            morale: Math.max(0, player.company.morale - actualFire * 3),
            cashFlow: {
              ...player.company.cashFlow,
              expenses: player.company.cashFlow.expenses + severance,
            },
          },
        };
      });

      return { ...state, players: updatedPlayers };
    }

    case 'BUY_MACHINE': {
      const { playerId, machineType } = action.payload;
      const config = MACHINE_CONFIGS[machineType];
      if (!config) return state;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.profession !== 'entrepreneur' || !player.company) return player;
        if (player.cash < config.price) return player;

        const newAsset: Asset = {
          id: generateId(),
          type: 'machine' as AssetType,
          name: config.name,
          batchId: 'machine',
          purchasePrice: config.price,
          currentValue: config.price * 0.8,
        };

        return {
          ...player,
          cash: player.cash - config.price,
          assets: [...player.assets, newAsset],
          company: {
            ...player.company,
            machines: player.company.machines + 1,
            productionCapacity: player.company.employees * ECONOMY_BALANCE.company.employeeCapacity + player.company.machines * ECONOMY_BALANCE.company.machineCapacity + config.capacityGain,
            costs: player.company.costs + config.maintenanceCost,
            efficiency: Math.min(100, player.company.efficiency + config.efficiency),
            cashFlow: {
              ...player.company.cashFlow,
              expenses: player.company.cashFlow.expenses + config.price,
            },
          },
        };
      });

      return { ...state, players: updatedPlayers };
    }

    case 'PRODUCE_GOODS': {
      const { playerId, quantity } = action.payload;
      
      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.profession !== 'entrepreneur' || !player.company) return player;
        
        const company = player.company;
        
        // 计算剩余产能
        const totalCapacity = company.employees * ECONOMY_BALANCE.company.employeeCapacity + company.machines * ECONOMY_BALANCE.company.machineCapacity;
        const usedThisRound = company.productionUsedThisRound || 0;
        const remainingCapacity = Math.max(0, totalCapacity - usedThisRound);
        
        // 验证数量
        if (quantity <= 0) return player;
        
        // 检查剩余产能
        if (quantity > remainingCapacity) return player;
        
        // 原材料限制
        const prodConfig = PRODUCTION_CONFIGS[company.productionType];
        const maxByMaterials = Math.floor(Math.max(0, company.rawMaterials || 0) / prodConfig.materialConsumption);
        if (quantity > maxByMaterials) return player;
        
        const processingCost = ECONOMY_BALANCE.company.processingCostPerUnit * quantity;
        if (player.cash < processingCost) return player;
        
        // 实际产出
        const actualProduction = Math.min(quantity, maxByMaterials, remainingCapacity);
        if (actualProduction <= 0) return player;
        const productInventory = getProductInventory(company);
        productInventory[company.productionType] += actualProduction;
        
        return {
          ...player,
          cash: player.cash - processingCost,
          company: {
            ...company,
            rawMaterials: (company.rawMaterials || 0) - actualProduction * prodConfig.materialConsumption,
            inventory: getTotalProductInventory(productInventory),
            productInventory,
            productionUsedThisRound: usedThisRound + actualProduction,
            costs: company.costs + processingCost,
            stats: {
              ...company.stats,
              totalProduced: company.stats.totalProduced + actualProduction,
              totalCosts: company.stats.totalCosts + processingCost,
            },
          },
        };
      });

      const producer = state.players.find(player => player.id === playerId)?.company;
      const productionType = producer?.productionType;
      const updatedProducer = updatedPlayers.find(player => player.id === playerId)?.company;
      const actualProduced = Math.max(0, (updatedProducer?.stats.totalProduced ?? 0) - (producer?.stats.totalProduced ?? 0));
      return {
        ...state,
        players: updatedPlayers,
        market: productionType ? {
          ...state.market,
          supplyDemand: {
            ...state.market.supplyDemand,
            [productionType]: {
              ...state.market.supplyDemand[productionType],
              supply: state.market.supplyDemand[productionType].supply + actualProduced,
            },
          },
        } : state.market,
      };
    }

    // ==================== 企业自动生产设定 ====================
    case 'SET_AUTO_PRODUCTION': {
      const { playerId, enabled, monthlyTarget } = action.payload;
      
      return {
        ...state,
        players: state.players.map(p => {
          if (p.id !== playerId || p.profession !== 'entrepreneur' || !p.company) return p;
          return {
            ...p,
            company: {
              ...p.company,
              autoProduction: {
                ...p.company.autoProduction,
                enabled,
                monthlyTarget: monthlyTarget !== undefined ? Math.max(0, monthlyTarget) : p.company.autoProduction.monthlyTarget,
              },
            },
          };
        }),
      };
    }

    case 'SET_PRODUCT_PRICE': {
      const { playerId, price } = action.payload;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.profession !== 'entrepreneur' || !player.company) return player;

        return {
          ...player,
          company: {
            ...player.company,
            productionCost: price,
          },
        };
      });

      return { ...state, players: updatedPlayers };
    }

    case 'ADJUST_WAGES': {
      const { playerId, amount } = action.payload;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.profession !== 'entrepreneur' || !player.company) return player;

        const newWage = clamp(amount, ECONOMY_BALANCE.company.wagePerEmployee * 0.6, ECONOMY_BALANCE.company.wagePerEmployee * 1.8);
        const moraleChange = newWage >= ECONOMY_BALANCE.company.wagePerEmployee ? 8 : -10;

        return {
          ...player,
          company: {
            ...player.company,
            productionCost: Math.round(newWage),
            morale: Math.max(0, Math.min(100, player.company.morale + moraleChange)),
          },
        };
      });

      return { ...state, players: updatedPlayers };
    }

    case 'MARKETING_SPEND': {
      const { playerId, amount } = action.payload;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.profession !== 'entrepreneur' || !player.company) return player;
        if (player.cash < amount) return player;

        return {
          ...player,
          cash: player.cash - amount,
          company: {
            ...player.company,
            reputation: Math.min(100, player.company.reputation + amount / 500),
            marketShare: Math.min(100, player.company.marketShare + amount / 1000),
            cashFlow: {
              ...player.company.cashFlow,
              expenses: player.company.cashFlow.expenses + amount,
            },
          },
        };
      });

      return { ...state, players: updatedPlayers };
    }

    case 'SET_PRODUCTION_TYPE': {
      const { playerId, productionType } = action.payload;
      
      return {
        ...state,
        players: state.players.map(p => {
          if (p.id !== playerId || p.profession !== 'entrepreneur' || !p.company) return p;
          return {
            ...p,
            company: {
              ...p.company,
              productionType,
            },
          };
        }),
      };
    }

    case 'UPGRADE_QUALITY': {
      const { playerId, amount } = action.payload;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.profession !== 'entrepreneur' || !player.company) return player;
        if (player.cash < amount) return player;

        return {
          ...player,
          cash: player.cash - amount,
          company: {
            ...player.company,
            productQuality: Math.min(100, player.company.productQuality + Math.max(1, Math.floor(amount / ECONOMY_BALANCE.company.qualityUpgradeCost) * ECONOMY_BALANCE.company.qualityUpgradeGain)),
            reputation: Math.min(100, player.company.reputation + 4),
            costs: player.company.costs + amount,
            cashFlow: {
              ...player.company.cashFlow,
              expenses: player.company.cashFlow.expenses + amount,
            },
          },
        };
      });

      return { ...state, players: updatedPlayers };
    }

    // ==================== 政府系统 ====================
    case 'SET_TAX_RATE': {
      const { playerId, rate } = action.payload;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        return { ...player, taxRate: rate };
      });

      const newSocialStability = rate > 0.35 ? 
        -8 : rate > 0.3 ? -3 : 
        rate < 0.1 ? 5 : rate < 0.15 ? 2 : 0;

      return {
        ...state,
        players: updatedPlayers,
        market: {
          ...state.market,
          socialStability: Math.max(0, Math.min(100, state.market.socialStability + newSocialStability)),
          globalTaxRate: rate,
          employmentRate: clamp(state.market.employmentRate - Math.max(0, rate - 0.25) * 20, 40, 98),
          policyStabilityModifier: (state.market.policyStabilityModifier ?? 0) + (rate <= 0.2 ? 1 : -2),
        },
      };
    }

    case 'ISSUE_SUBSIDY': {
      const { playerId, amount, target } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.profession !== 'government') return state;
      if ((player.govAbilities?.treasuryBalance ?? 0) < amount) return state;

      let targetPlayers = state.players.filter(p => p.id !== playerId);
      if (target === 'poor') {
        targetPlayers = targetPlayers.filter(p => p.cash < 5000);
      } else if (target === 'business') {
        targetPlayers = targetPlayers.filter(p => p.profession === 'entrepreneur');
      }

      const perPerson = amount / targetPlayers.length;

      const updatedPlayers = state.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            govAbilities: p.govAbilities ? {
              ...p.govAbilities,
              treasuryBalance: p.govAbilities.treasuryBalance - amount,
            } : p.govAbilities,
          };
        }
        if (targetPlayers.some(tp => tp.id === p.id)) {
          return {
            ...p,
            cash: p.cash + perPerson,
            happiness: Math.min(100, p.happiness + 3),
          };
        }
        return p;
      });

      return {
        ...state,
        players: updatedPlayers,
        market: {
          ...state.market,
          socialStability: Math.min(100, state.market.socialStability + 2),
          inflationRate: clamp(state.market.inflationRate + amount / 1_000_000, -0.1, 0.3),
        },
      };
    }

    case 'ENACT_POLICY': {
      const { playerId, policyType, explanation } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.profession !== 'government') return state;
      
      const policy = POLICY_CONFIGS[policyType];
      const cooldown = player.policyCooldowns?.[policyType] || 0;
      if (cooldown > 0 || (player.govAbilities?.treasuryBalance ?? 0) < policy.cost) return state;

      return {
        ...state,
        pendingPolicies: [
          ...state.pendingPolicies,
          {
            id: generateId(),
            policyType,
            policyName: policy.name,
            proposerId: playerId,
            explanation: explanation || `${policy.name} 将在下一轮生效。`,
            effectiveRound: state.currentRound + 1,
          },
        ],
        players: state.players.map(p => {
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
        }),
        gameLog: [...state.gameLog, {
          id: generateId(),
          round: state.currentRound,
          timestamp: Date.now(),
          type: 'policy',
          message: `${player.name} 提交政策：${policy.name}，将在第 ${state.currentRound + 1} 轮生效。说明：${explanation || '无'}`,
          playerId,
        }],
      };

    }

    case 'RATE_GOVERNMENT': {
      const { playerId, governmentId, score } = action.payload;
      if (playerId === governmentId) return state;
      const voter = state.players.find(p => p.id === playerId);
      const government = state.players.find(p => p.id === governmentId && p.profession === 'government');
      if (!voter || !government?.govAbilities) return state;
      if (voter.governmentRatings?.[state.currentRound] !== undefined) return state;
      const normalizedScore = clamp(Math.round(score), 1, 5);
      const delta = (normalizedScore - 3) * 4;

      return {
        ...state,
        players: state.players.map(player => {
          if (player.id === playerId) {
            return {
              ...player,
              governmentRatings: {
                ...(player.governmentRatings ?? {}),
                [state.currentRound]: normalizedScore,
              },
            };
          }
          if (player.id !== governmentId || !player.govAbilities) return player;
          const reputation = clamp(player.govAbilities.reputation + delta, 0, 100);
          const approvalRating = clamp(player.govAbilities.approvalRating * 0.7 + normalizedScore * 20 * 0.3, 0, 100);
          const removed = approvalRating < 20;
          return {
            ...player,
            profession: removed ? 'worker' : player.profession,
            govAbilities: removed ? undefined : {
              ...player.govAbilities,
              reputation,
              approvalRating,
              decisionPower: clamp(player.govAbilities.decisionPower + (approvalRating >= 75 ? 2 : approvalRating < 35 ? -2 : 0), 0, 100),
            },
            workerAbilities: removed ? {
              skill: 35,
              wageLevel: ECONOMY_BALANCE.worker.baseWage,
              trainingSessions: 0,
              unemployedRounds: 0,
              negotiationPower: 20,
            } : player.workerAbilities,
            policyCooldowns: removed ? undefined : player.policyCooldowns,
          };
        }),
        gameLog: [...state.gameLog, {
          id: generateId(),
          round: state.currentRound,
          timestamp: Date.now(),
          type: 'policy',
          message: `${voter.name} 给政府评分 ${normalizedScore}/5${normalizedScore <= 2 ? '，政府声誉下降' : normalizedScore >= 4 ? '，政府声誉上升' : ''}`,
          playerId,
        }],
      };
    }

    // ==================== 投资学习系统（投资者专属）====================
    case 'INVESTMENT_STUDY': {
      const { playerId, cost } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.profession !== 'investor') return state;
      if (!player.investorAbilities || player.cash < cost) return state;
      
      // 学习费用：技能越高，费用越高
      const skillLevel = player.investorAbilities.investmentSkill;
      const learningEffect = Math.max(3, 10 - Math.floor(skillLevel / 20)); // 技能越高，每次学习提升越少
      
      // 更新玩家投资技能
      const newSkill = Math.min(100, skillLevel + learningEffect);
      
      return {
        ...state,
        players: state.players.map(p => {
          if (p.id !== playerId) return p;
          const abilities = p.investorAbilities!;
          return {
            ...p,
            cash: p.cash - cost,
            investorAbilities: {
              ...abilities,
              investmentSkill: newSkill,
              learningPoints: abilities.learningPoints + learningEffect,
              totalLearningSessions: abilities.totalLearningSessions + 1,
            },
          };
        }),
        gameLog: [...state.gameLog, {
          id: generateId(),
          round: state.currentRound,
          timestamp: Date.now(),
          type: 'system',
          message: `${player.name} 参加投资培训，技能提升 +${learningEffect}（当前技能: ${newSkill}%）`,
          playerId,
        }],
      };
    }

    // ==================== 交易系统 ====================
    case 'CREATE_TRADE': {
      const { type, fromPlayerId, toPlayerId, ...rest } = action.payload;
      const trade: TradeOffer = {
        id: generateId(),
        type,
        fromPlayerId,
        toPlayerId,
        description: rest.description || '交易请求',
        offeredItems: rest.offeredItems,
        offeredCash: rest.offeredCash,
        requestedItems: rest.requestedItems,
        requestedCash: rest.requestedCash,
        status: 'pending',
        createdAt: Date.now(),
      };

      return {
        ...state,
        phase: 'trade_pending',
        pendingTrade: trade,
        tradeOffers: [...state.tradeOffers, trade],
      };
    }

    case 'RESPOND_TRADE': {
      const { tradeId, accepted } = action.payload;
      const trade = state.pendingTrade;
      if (!trade || trade.id !== tradeId) return state;

      if (accepted) {
        const updatedPlayers = state.players.map(player => {
          let cashChange = 0;
          const goodsChanges: Partial<Record<GoodType, number>> = {};

          if (player.id === trade.fromPlayerId) {
            cashChange -= trade.offeredCash || 0;
            cashChange += trade.requestedCash || 0;
            trade.offeredItems?.forEach(item => {
              goodsChanges[item.goodType] = -(goodsChanges[item.goodType] || 0) - item.quantity;
            });
            trade.requestedItems?.forEach(item => {
              goodsChanges[item.goodType] = (goodsChanges[item.goodType] || 0) + item.quantity;
            });
          }

          if (player.id === trade.toPlayerId) {
            cashChange += trade.offeredCash || 0;
            cashChange -= trade.requestedCash || 0;
            trade.offeredItems?.forEach(item => {
              goodsChanges[item.goodType] = (goodsChanges[item.goodType] || 0) + item.quantity;
            });
            trade.requestedItems?.forEach(item => {
              goodsChanges[item.goodType] = -(goodsChanges[item.goodType] || 0) - item.quantity;
            });
          }

          if (cashChange === 0 && Object.keys(goodsChanges).length === 0) return player;

          return {
            ...player,
            cash: player.cash + cashChange,
            goods: {
              ...player.goods,
              ...goodsChanges,
            },
          };
        });

        return {
          ...state,
          players: updatedPlayers,
          pendingTrade: null,
          phase: 'player_turn',
        };
      }

      return {
        ...state,
        pendingTrade: null,
        phase: 'player_turn',
      };
    }

    case 'BUY_MEDICINE': {
      const { playerId } = action.payload;
      const medicinePrice = state.market.goods.healthcare.currentPrice;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.cash < medicinePrice) return player;

        return {
          ...player,
          cash: player.cash - medicinePrice,
          health: Math.min(100, player.health + 20),
        };
      });

      return { ...state, players: updatedPlayers };
    }

    // ==================== 事件系统 ====================
    case 'TRIGGER_EVENT': {
      const event = {
        ...action.payload,
        remainingDuration: action.payload.duration ?? 0,
      };
      const newMarket = { ...state.market };

      if (event.effects.inflation) {
        newMarket.inflationRate += event.effects.inflation;
      }
      if (event.effects.employment) {
        newMarket.employmentRate = Math.max(0, Math.min(100, newMarket.employmentRate + event.effects.employment));
      }
      if (event.effects.socialStability) {
        newMarket.socialStability = Math.max(0, Math.min(100, newMarket.socialStability + event.effects.socialStability));
      }
      if (event.effects.stockMarket) {
        newMarket.stockMarket = {
          ...newMarket.stockMarket,
          index: newMarket.stockMarket.index * (1 + event.effects.stockMarket.indexChange),
          volatility: Math.min(1, newMarket.stockMarket.volatility + event.effects.stockMarket.volatilityChange),
        };
      }
      if (event.effects.specificGoodPrice) {
        const { goodType, multiplier } = event.effects.specificGoodPrice;
        if (newMarket.goods[goodType]) {
          newMarket.goods[goodType] = {
            ...newMarket.goods[goodType],
            currentPrice: newMarket.goods[goodType].currentPrice * multiplier,
          };
        }
      }
      if (event.effects.cycleShift) {
        newMarket.economicCycle = event.effects.cycleShift;
      }

      return {
        ...state,
        market: newMarket,
        recentEvent: event,
        activeEvents: event.duration ? [...state.activeEvents, event] : state.activeEvents,
        eventHistory: [...state.eventHistory, event],
        phase: 'event',
      };
    }

    case 'DISMISS_EVENT':
      return {
        ...state,
        recentEvent: null,
        phase: 'player_turn',
      };

    // ==================== 回合结算 ====================
    case 'SETTLE_ROUND': {
      const newMarket = { ...state.market };
      newMarket.timeUnit = 'month';
      const oldBank = getBankRates(newMarket);
      const centralBankDrift = newMarket.inflationRate > 0.06 ? 0.001 : newMarket.inflationRate < 0 ? -0.0005 : 0;
      newMarket.bank = {
        centralBankRate: clamp(oldBank.centralBankRate + centralBankDrift, 0.001, 0.025),
        depositRate: 0,
        consumerLoanRate: 0,
        mortgageRate: 0,
        businessLoanRate: 0,
        defaultedLoans: oldBank.defaultedLoans,
      };
      newMarket.bank.depositRate = Math.max(0, newMarket.bank.centralBankRate + ECONOMY_BALANCE.bank.depositRateSpread);
      newMarket.bank.consumerLoanRate = newMarket.bank.centralBankRate + ECONOMY_BALANCE.bank.loanRiskSpread.consumer;
      newMarket.bank.mortgageRate = newMarket.bank.centralBankRate + ECONOMY_BALANCE.bank.loanRiskSpread.mortgage;
      newMarket.bank.businessLoanRate = newMarket.bank.centralBankRate + ECONOMY_BALANCE.bank.loanRiskSpread.business;
      
      // 经济周期演进
      newMarket.cyclePhase += 1;
      if (newMarket.cyclePhase >= 4) {
        newMarket.cyclePhase = 0;
        newMarket.economicCycle = getNextCycle(newMarket.economicCycle);
      }

      // 计算统一的投资收益
      const cycleMultipliers = CYCLE_MULTIPLIERS[newMarket.economicCycle];
      const updatedBatches = [...state.assetBatches];

      // 按批次统一计算涨跌幅
      const batchReturns: Record<string, number> = {};
      updatedBatches.forEach(batch => {
        const config = INVESTMENT_CONFIGS[batch.type];
        const cycleMultiplier = cycleMultipliers[batch.type];
        const ratePressure = batch.type === 'bond'
          ? ((newMarket.bank?.centralBankRate ?? ECONOMY_BALANCE.bank.baseRate) - ECONOMY_BALANCE.bank.baseRate) * -4
          : 0;
        const inflationHedge = batch.type === 'gold' ? Math.max(0, newMarket.inflationRate) * 0.35 : 0;
        const marketReturn = config.baseReturn + ratePressure + inflationHedge + (Math.random() - 0.5) * config.volatility;
        const totalReturn = marketReturn * cycleMultiplier;
        batchReturns[batch.batchId] = 1 + totalReturn;
      });

      let taxRevenue = 0;
      const monthlyCompanySales: Record<string, { type: GoodType; sold: number }> = {};

      // 更新玩家资产（统一涨跌幅）
      const updatedPlayers = state.players.map(player => {
        let newCash = player.cash;
        let newHealth = player.health;
        let newHappiness = player.happiness;
        let newSocialStatus = player.socialStatus;
        let loans = (player.loans ?? []).map(loan => ({ ...loan }));
        let creditScore = player.creditScore ?? 70;
        const workerAbilities = player.workerAbilities ? { ...player.workerAbilities } : undefined;
        const investorAbilities = player.investorAbilities ? { ...player.investorAbilities } : undefined;

        // 1. 统一投资收益（投资者有技能加成）
        const investorSkillBonus = investorAbilities 
          ? investorAbilities.investmentSkill / 200 // 0-0.5 bonus
          : 0;
        player.assets.forEach(asset => {
          if (!isInvestmentAsset(asset)) return;
          const returnRate = batchReturns[asset.batchId] || 1;
          const depositReturn = asset.type === 'deposit' ? 1 + (newMarket.bank?.depositRate ?? 0.003) : returnRate;
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
        });
        if (investorAbilities) {
          investorAbilities.lastPortfolioRisk = calculatePortfolioRisk(player);
          investorAbilities.lastMarketAnalysis = state.currentRound;
        }

        // 2. 租金收入（房东）
        player.assets.filter(a => a.type === 'real_estate' && a.rentalIncome).forEach(asset => {
          newCash += asset.rentalIncome!;
        });

        // 3. 租金支出（租客）
        if (player.housingStatus === 'renting' && player.currentRent > 0) {
          newCash -= player.currentRent;
          if (newCash < 0) {
            newHappiness -= 10;
            const oldEffect = player.housingTier ? HOUSING_CONFIGS[player.housingTier].effect : null;
            return {
              ...player,
              cash: 0,
              housingStatus: 'none' as HousingStatus,
              housingTier: null,
              currentRent: 0,
              happiness: Math.max(0, newHappiness - (oldEffect?.happiness || 0)),
              socialStatus: player.socialStatus - (oldEffect?.socialStatus || 0),
              loans,
              creditScore,
            };
          }
        }

        // 4. 必需品消耗
        const essentialGoods: GoodType[] = ['food', 'daily_necessities'];
        essentialGoods.forEach(goodType => {
          const good = state.market.goods[goodType];
          const consumption = good.consumptionRate;
          
          const beforeConsumption = player.goods[goodType];
          player.goods[goodType] = Math.max(0, player.goods[goodType] - consumption);
          
          if (beforeConsumption > 0) {
            const effectMultiplier = Math.min(1, beforeConsumption / (consumption * 3));
            const effect = good.effect;
            newHappiness += effect.happiness * effectMultiplier;
            newHealth += effect.health * effectMultiplier;
          }
          
          if (beforeConsumption < consumption) {
            const shortage = consumption - beforeConsumption;
            newHealth -= shortage * 10;
            newHappiness -= shortage * 15;
          }
        });

        // 5. 娱乐消耗
        if (player.goods.entertainment > 0) {
          player.goods.entertainment = Math.max(0, player.goods.entertainment - 1);
          newHappiness += 10;
        }

        // 6. 住房状态效果
        if (player.housingStatus === 'renting' && player.housingTier) {
          const effect = HOUSING_CONFIGS[player.housingTier].effect;
          newHappiness += effect.happiness;
          newHealth = Math.min(100, newHealth + effect.health);
          newHappiness = Math.min(100, newHappiness);
        } else if (player.housingStatus === 'owned' && player.housingTier) {
          const effect = HOUSING_CONFIGS[player.housingTier].effect;
          newHappiness += effect.happiness;
          newHealth = Math.min(100, newHealth + effect.health);
          newHappiness = Math.min(100, newHappiness);
        } else if (player.housingStatus === 'none') {
          newHappiness -= 10;
        }

        // 7. 疲劳恢复
        const fatiguePenalty = Math.max(0, player.workState.fatigueLevel - 60);
        newHealth += 5 - Math.floor(fatiguePenalty / 10);
        newHappiness -= Math.floor(fatiguePenalty / 12);
        newHealth = Math.min(100, newHealth);

        // 8. 健康警告
        if (newHealth < 30) {
          newHappiness -= 10;
        }

        if (player.profession === 'worker' && workerAbilities) {
          if (workerAbilities.unemployedRounds > 0) {
            workerAbilities.unemployedRounds = Math.max(0, workerAbilities.unemployedRounds - 1);
            newHappiness -= 8;
            newCash -= Math.round(workerAbilities.wageLevel * 0.25);
            const reemploymentChance = clamp(
              0.25 + workerAbilities.skill * 0.004 + state.market.employmentRate * 0.004,
              0.2,
              0.9,
            );
            if (Math.random() < reemploymentChance) {
              workerAbilities.unemployedRounds = 0;
              workerAbilities.wageLevel = Math.max(
                state.market.laborMarket?.minimumWage ?? Math.round(ECONOMY_BALANCE.worker.baseWage * 0.6),
                Math.round(workerAbilities.wageLevel * 0.96),
              );
            }
          } else {
            const laborStress = Math.max(0, 75 - state.market.employmentRate) / 75;
            const unemploymentRisk = ECONOMY_BALANCE.worker.unemploymentBaseRisk + laborStress * ECONOMY_BALANCE.worker.unemploymentLowEmploymentRisk;
            if (Math.random() < unemploymentRisk) {
              workerAbilities.unemployedRounds = 1;
              newHappiness -= 10;
            }
          }
        }

        // 8. 企业自动生产（企业家）- 直接销售，成本递增
        let monthlyWages = 0;
        let monthlyProductionCosts = 0;
        let monthlyRevenue = 0;
        
        if (player.company) {
          const company = player.company;
          
          // 计算员工工资
          monthlyWages = company.employees * (company.productionCost > 0 ? company.productionCost : ECONOMY_BALANCE.company.wagePerEmployee);
          taxRevenue += Math.max(0, monthlyWages * newMarket.globalTaxRate * 0.3);
          
          // 自动生产并直接销售
          if (player.company.autoProduction.enabled) {
            const autoProd = company.autoProduction;
            const prodConfig = PRODUCTION_CONFIGS[company.productionType];
            
            // 获取该商品类型的成本和售价
            const unitSellingPrice = prodConfig.baseSellingPrice * (1 + (company.productQuality - 60) / 200);
            
            // 计算实际可生产的数量（受产能和原材料限制）
            const moraleFactor = 0.75 + company.morale / 200;
            const productivityFactor = 1 + (newMarket.productivityBonus ?? 0);
            const totalCapacity = Math.floor((company.employees * ECONOMY_BALANCE.company.employeeCapacity + company.machines * ECONOMY_BALANCE.company.machineCapacity) * moraleFactor * productivityFactor);
            const maxByCapacity = totalCapacity;
            const maxByMaterials = Math.max(0, Math.floor(company.rawMaterials / prodConfig.materialConsumption));
            const actualProduction = Math.min(autoProd.monthlyTarget, maxByCapacity, maxByMaterials);
            
            if (actualProduction > 0) {
              const totalProductionCost = Math.round(actualProduction * ECONOMY_BALANCE.company.processingCostPerUnit);
              const totalMaterialUsed = actualProduction * prodConfig.materialConsumption;
              const sd = newMarket.supplyDemand[company.productionType];
              const demandSupplyRatio = sd.demand / Math.max(1, sd.supply);
              const saleRatio = clamp(prodConfig.marketDemand * demandSupplyRatio * (0.7 + company.reputation / 200), 0.1, 1.3);
              const sold = Math.min(actualProduction, Math.floor(actualProduction * saleRatio));
              const totalRevenue = Math.round(sold * unitSellingPrice);
              
              monthlyProductionCosts += totalProductionCost;
              monthlyRevenue += totalRevenue;
              
              // 扣除成本
              newCash -= totalProductionCost;
              company.rawMaterials -= totalMaterialUsed;
              
              // 记录统计
              company.stats.totalProduced += actualProduction;
              company.stats.totalSold += sold;
              company.stats.totalCosts += totalProductionCost;
              company.stats.totalRevenue += totalRevenue;
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
        }

        // 9. 企业盈利结算（企业家）
        if (player.company) {
          const company = player.company;
          
          // 计算总成本
          const totalCosts = monthlyWages + monthlyProductionCosts;
          
          // 更新现金流记录
          company.cashFlow = {
            initial: company.cashFlow.final,
            income: monthlyRevenue,
            expenses: totalCosts,
            wages: monthlyWages,
            productionCosts: monthlyProductionCosts,
            otherCosts: 0,
            final: company.cashFlow.final + monthlyRevenue - totalCosts,
          };
          
          // 计算本月利润
          const monthlyProfit = monthlyRevenue - totalCosts;
          company.stats.monthlyProfit = monthlyProfit;
          
          // 更新企业财务
          company.revenue += monthlyRevenue;
          company.costs += totalCosts;
          company.profit += monthlyProfit;
          
          // 将企业利润转给玩家（分红）
          if (monthlyProfit > 0) {
            newCash += monthlyProfit;
          }
          
          // 士气恢复
          company.morale = Math.min(100, company.morale + 5);
          
          // 声誉自然衰减
          company.reputation = Math.max(0, company.reputation - 1);
        }

        if (loans.length > 0) {
          let defaulted = false;
          loans = loans.map(loan => {
            const interest = Math.round(loan.remaining * loan.monthlyRate);
            newCash -= interest;
            taxRevenue += interest * 0.05;
            return { ...loan, remaining: loan.remaining + interest };
          });
          if (newCash < ECONOMY_BALANCE.bank.defaultGraceCash) {
            defaulted = true;
            newMarket.bank = {
              ...getBankRates(newMarket),
              defaultedLoans: (newMarket.bank?.defaultedLoans ?? 0) + 1,
            };
            creditScore = Math.max(0, creditScore - 15);
            loans = loans.map(loan => ({ ...loan, remaining: Math.round(loan.remaining * 1.03) }));
          } else if (newCash > 0) {
            creditScore = Math.min(100, creditScore + 1);
          }
          if (defaulted) {
            newHappiness -= 8;
            newSocialStatus -= 3;
          }
        }

        // 更新政策冷却
        const updatedCooldowns = player.policyCooldowns ? 
          Object.fromEntries(
            Object.entries(player.policyCooldowns).map(([k, v]) => [k, Math.max(0, v - 1)])
          ) as Record<PolicyType, number> : undefined;

        // 重置公司本轮生产计数
        let updatedCompany = player.company;
        if (updatedCompany) {
          updatedCompany = {
            ...updatedCompany,
            productionUsedThisRound: 0,
          };
        }

        return {
          ...player,
          cash: Math.round(newCash * 100) / 100,
          health: Math.max(0, Math.min(100, newHealth)),
          happiness: Math.max(0, Math.min(100, newHappiness)),
          socialStatus: Math.max(0, newSocialStatus),
          loans,
          creditScore,
          workerAbilities,
          investorAbilities,
          workState: {
            workCount: 0,
            overtimeCount: 0,
            fatigueLevel: Math.max(0, player.workState.fatigueLevel - 20),
          },
          hasActedThisRound: false,
          rentPaid: false,
          isBankrupt: newCash < ECONOMY_BALANCE.company.bankruptcyLimit,
          policyCooldowns: updatedCooldowns,
          company: updatedCompany,
        };
      });

      const playersWithMarketShare = recalculateMarketShare(updatedPlayers, monthlyCompanySales);
      const finalPlayers = creditTaxToGovernment(playersWithMarketShare, taxRevenue);
      newMarket.monthlyTaxRevenue = Math.round(taxRevenue * 100) / 100;

      // 更新市场价格
      const householdDemand = calculateHouseholdDemand(finalPlayers);
      Object.keys(newMarket.goods).forEach(key => {
        const good = newMarket.goods[key as GoodType];
        const sd = newMarket.supplyDemand[key as GoodType];
        sd.demand += householdDemand[key as GoodType] ?? 0;
        
        const demandSupplyRatio = sd.demand / Math.max(1, sd.supply);
        const marketPressure = clamp((demandSupplyRatio - 1) * 0.14, -0.16, 0.22);
        const inflation = newMarket.inflationRate * 0.1;
        const volatility = (Math.random() - 0.5) * 0.05;
        
        const totalChange = marketPressure + inflation + volatility;
        const newPrice = good.currentPrice * (1 + totalChange);
        
        good.priceHistory.push(newPrice);
        if (good.priceHistory.length > 10) good.priceHistory.shift();
        newMarket.goods[key as GoodType] = {
          ...good,
          currentPrice: Math.max(good.basePrice * 0.3, Math.min(good.basePrice * 3, newPrice)),
        };

        const baselineDemand = householdDemand[key as GoodType] ?? 20;
        sd.demand = Math.max(baselineDemand, sd.demand * 0.72 + baselineDemand * 0.28);
        sd.supply = Math.max(5, sd.supply * 0.82);
      });

      // 更新股票市场
      const trendMultiplier = newMarket.stockMarket.trend === 'bull' ? 1.02 :
        newMarket.stockMarket.trend === 'bear' ? 0.98 : 1;
      newMarket.stockMarket.index *= trendMultiplier;
      newMarket.stockMarket.volatility = Math.max(0.05, newMarket.stockMarket.volatility * 0.95);

      // 计算GDP
      newMarket.gdp = finalPlayers.reduce((sum, p) => sum + Math.max(0, p.cash), 0);

      // 更新基尼系数（使用标准洛伦兹曲线公式）
      const incomes = finalPlayers.map(p => Math.max(0, p.cash)).sort((a, b) => a - b);
      const n = incomes.length;
      if (n > 0 && incomes.reduce((a, b) => a + b, 0) > 0) {
        const sumIncomes = incomes.reduce((a, b) => a + b, 0);
        let sumWeighted = 0;
        incomes.forEach((income, index) => {
          sumWeighted += (index + 1) * income;
        });
        // Gini = (2 * Σ(i * y_i) - (n + 1) * Σ(y_i)) / (n * Σ(y_i))
        const gini = (2 * sumWeighted - (n + 1) * sumIncomes) / (n * sumIncomes);
        newMarket.giniCoefficient = Math.max(0, Math.min(1, gini));
      } else {
        newMarket.giniCoefficient = 0;
      }

      // 动态计算社会稳定度
      newMarket.policyStabilityModifier = (newMarket.policyStabilityModifier ?? 0) * 0.75;
      newMarket.productivityBonus = (newMarket.productivityBonus ?? 0) * 0.95;
      applyLingeringEventPressure(newMarket, state.activeEvents);
      newMarket.socialStability = clamp(calculateSocialStability(finalPlayers) + (newMarket.policyStabilityModifier ?? 0), 0, 100);

      const nextActiveEvents = state.activeEvents
        .map((event: RandomEvent) => ({
          ...event,
          remainingDuration: Math.max(0, (event.remainingDuration ?? event.duration ?? 1) - 1),
        }))
        .filter((event: RandomEvent) => (event.remainingDuration ?? 0) > 0);
      const nextRound = state.currentRound + 1;
      const policyApplication = applyPendingPoliciesForRound(state, newMarket, nextRound);
      const marketAfterPolicies = policyApplication.market;
      const nextNews = policyApplication.appliedNews ?? pickNewsEvent(nextRound);

      // 检查游戏结束
      const maxRounds = 30;
      const avgHappiness = finalPlayers.reduce((sum, p) => sum + p.happiness, 0) / finalPlayers.length;

      if (state.currentRound >= maxRounds || avgHappiness < 10) {
        const victoryScores = calculateVictoryScores(finalPlayers, marketAfterPolicies);
        const winner = finalPlayers.reduce((best, player) => {
          const score = victoryScores?.[player.id]?.score ?? 0;
          const bestScore = best ? victoryScores?.[best.id]?.score ?? 0 : 0;
          return score > bestScore ? player : best;
        }, null as Player | null);

        return {
          ...state,
          players: finalPlayers,
          market: marketAfterPolicies,
          phase: 'game_over',
          winner,
          assetBatches: updatedBatches,
          victoryScores,
        };
      }

      return applyNewsEvent({
        ...state,
        players: finalPlayers,
        market: marketAfterPolicies,
        activeEvents: nextActiveEvents,
        currentRound: nextRound,
        currentPlayerIndex: 0,
        phase: 'news',
        assetBatches: updatedBatches,
        pendingPolicies: policyApplication.remainingPolicies,
        victoryScores: calculateVictoryScores(finalPlayers, marketAfterPolicies),
        gameLog: [
          ...state.gameLog,
          {
            id: generateId(),
            round: nextRound,
            timestamp: Date.now(),
            type: 'system',
            message: `第 ${nextRound} 轮开始！`,
          },
        ],
      }, nextNews);
    }

    case 'ADD_LOG':
      return {
        ...state,
        gameLog: [...state.gameLog, action.payload],
      };

    case 'END_GAME':
      return {
        ...state,
        phase: 'game_over',
      };

    default:
      return state;
  }
}

// ==================== Context ====================

interface GameContextType {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  getCurrentPlayer: () => Player | null;
  getPlayerById: (id: string) => Player | undefined;
  triggerRandomEvent: () => RandomEvent | null;
  calculateScore: (player: Player) => number;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

// ==================== Provider ====================

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  const getCurrentPlayer = useCallback(() => {
    return state.players[state.currentPlayerIndex] || null;
  }, [state.currentPlayerIndex, state.players]);

  const getPlayerById = useCallback((id: string) => {
    return state.players.find(p => p.id === id);
  }, [state.players]);

  const triggerRandomEvent = useCallback(() => {
    const roll = Math.random();
    if (roll > ECONOMY_BALANCE.events.normalProbability + ECONOMY_BALANCE.events.majorProbability) return null;

    const eventPool = roll < ECONOMY_BALANCE.events.majorProbability
      ? RANDOM_EVENTS.filter(event => ['economic_crisis', 'natural_disaster', 'inflation_surge', 'recession'].includes(event.id))
      : RANDOM_EVENTS;
    
    const weightedRoll = Math.random();
    let cumulative = 0;
    
    for (const event of eventPool) {
      cumulative += event.probability;
      if (weightedRoll < cumulative) {
        dispatch({ type: 'TRIGGER_EVENT', payload: event });
        return event;
      }
    }
    return null;
  }, []);

  const calculateScore = useCallback((player: Player) => {
    return Math.round(state.victoryScores?.[player.id]?.score ?? calculateVictoryScores(state.players, state.market)?.[player.id]?.score ?? 0);
  }, [state.market, state.players, state.victoryScores]);

  return (
    <GameContext.Provider
      value={{
        state,
        dispatch,
        getCurrentPlayer,
        getPlayerById,
        triggerRandomEvent,
        calculateScore,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
