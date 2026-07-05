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
  calculateSocialStability,
} from '@/types/game';
import { applyLingeringNewsPressure, applyNewsEvent, pickNewsEvent } from '@/game/news';
import { getEndTurnTutorialPrompt } from '@/game/education';
import { getJobOffers, getWorkerCurrentJob, isQualifiedForJob } from '@/game/jobs';
import {
  buildWageNegotiationContext,
  FORCED_REST_DURATION,
  FORCED_REST_RECOVERY_HEALTH,
  FORCED_REST_TRIGGER,
  getActionBlockReasonForPlayer,
  getDefaultWorkerAbilities,
  getForcedRestTrigger,
  getWageNegotiationOutcome,
  getWageRaiseMultiplier,
  WORK_HEALTH_THRESHOLD,
} from '@/game/labor';
import { estimateProductSales, findBestSaleOption } from '@/components/game/company-helpers';
import {
  getCompanyCapacityUnits,
  getCompanyDepreciation,
  getCompanyFixedCosts,
  getEffectiveCapacityUnits,
  getCompanyInventoryHoldingCost,
  getMaterialPurchaseCost,
  getMaxProductionByCapacity,
  getProcessingCost,
  getProductionCapacityUsage,
  getSupplyChainOverheadCost,
  updateCompanyFinanceSnapshot,
} from '@/game/company-economics';
import {
  applyPolicyTransmission,
  applyPolicyEffectsToMarket,
  createInitialSupplyDemand,
  describePolicyEvaluation,
  describeRoundCausalChain,
  describePolicyTransmission,
  deriveCreditConditions,
  deriveEconomicCycle,
  deriveExternalSector,
  deriveGovernmentFeedback,
  deriveMacroState,
  deriveSupplyChainState,
  evaluateLoanApplication,
  getGovernmentPolicyBudgetLimit,
  getBaselineMarketDemand,
  getNpcSupplyContribution,
  recalculatePlayerMarketShare,
  updateHouseholdsForMacro,
  updateMarketAnchors,
  updateNpcFirmsForMacro,
  calculateHouseholdDemandBySegment,
  calculateAssetReturnMultiplier,
} from '@/game/market';

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
  | { type: 'SWITCH_JOB'; payload: { playerId: string; jobId: string } }
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
  | { type: 'BUY_MATERIALS'; payload: { playerId: string; quantity: number } }
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

function getActionBlockReason(player: Player): string | null {
  return getActionBlockReasonForPlayer(player);
}

function applyPendingPoliciesForRound(state: GameState, market: Market, round: number): { market: Market; appliedNews: RandomEvent | null; remainingPolicies: GameState['pendingPolicies'] } {
  const duePolicies = state.pendingPolicies.filter(policy => policy.effectiveRound <= round);
  const remainingPolicies = state.pendingPolicies.filter(policy => policy.effectiveRound > round);
  if (duePolicies.length === 0) return { market, appliedNews: null, remainingPolicies };

  const nextMarket = { ...market };
  const marketAfterPolicies = applyPolicyEffectsToMarket(nextMarket, duePolicies.map(policy => policy.policyType));

  const firstPolicy = duePolicies[0];
  const appliedNews: RandomEvent = {
    id: generateId(),
    type: 'policy_change',
    name: `政策生效：${firstPolicy.policyName}`,
    icon: '🏛️',
    description: firstPolicy.explanation,
    story: '政府政策通常不会立刻改变经济，而是经过公告、执行和市场反应后逐步生效。',
    explanation: `${duePolicies.map(policy => `${policy.policyName}：${policy.explanation}`).join('；')}。传导链：${describePolicyTransmission(marketAfterPolicies, duePolicies.map(policy => policy.policyType))} 政策评价：${describePolicyEvaluation(marketAfterPolicies, duePolicies.map(policy => policy.policyType))}`,
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

  return { market: marketAfterPolicies, appliedNews, remainingPolicies };
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
  forcedRestRounds: 0,
});

const createInitialCompany = (ownerId: string): Company => ({
  id: generateId(),
  ownerId,
  name: '创业公司',
  employees: 0,
  machines: 0,
  rawMaterials: 180,  // 初始原材料库存
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
  fixedCosts: 2400,
  depreciation: 800,
  financingCosts: 0,
  inventoryHoldingCost: 0,
  industry: 'daily_necessities',
  cashFlow: {
    initial: ECONOMY_BALANCE.startingCash.entrepreneur,
    income: 0,
    expenses: 0,
    final: ECONOMY_BALANCE.startingCash.entrepreneur,
    wages: 0,
    productionCosts: 0,
    otherCosts: 0,
  },
  balanceSheet: {
    cash: ECONOMY_BALANCE.startingCash.entrepreneur,
    debt: 0,
    equity: ECONOMY_BALANCE.startingCash.entrepreneur,
    inventoryValue: 0,
    retainedEarnings: 0,
  },
  incomeStatement: {
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    operatingProfit: 0,
    netProfit: 0,
    taxes: 0,
    interestExpense: 0,
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
      wageLevel: Math.round(ECONOMY_BALANCE.worker.baseWage * 0.32),
      trainingSessions: 0,
      unemployedRounds: 0,
      negotiationPower: 20,
      currentJobId: 'npc_service_hourly',
      paymentType: 'hourly',
      educationLevel: 0,
      experience: 0,
      employerId: 'npc_service',
      jobTitle: '小时工服务员',
      lastNegotiationOutcome: 'normal_raise',
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
      residentSupport: 60,
      enterpriseSupport: 60,
      fiscalHealth: 60,
      stabilitySupport: 60,
      inflationSatisfaction: 60,
      budgetSpace: 60,
      executionEfficiency: 60,
      removalRisk: 20,
    } : undefined,
  };
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
  households: [
    {
      id: 'low_income',
      label: '低收入家庭',
      populationShare: 0.45,
      averageIncome: 5200,
      disposableIncome: 3900,
      savingsRate: 0.04,
      confidence: 52,
      essentialShare: 0.72,
      discretionaryShare: 0.18,
      demandBias: { food: 1.18, daily_necessities: 1.12, entertainment: 0.65, luxury: 0.18 },
    },
    {
      id: 'middle_income',
      label: '中等收入家庭',
      populationShare: 0.4,
      averageIncome: 9800,
      disposableIncome: 7200,
      savingsRate: 0.1,
      confidence: 60,
      essentialShare: 0.56,
      discretionaryShare: 0.3,
      demandBias: { food: 1, daily_necessities: 1, entertainment: 1.05, luxury: 0.55 },
    },
    {
      id: 'high_income',
      label: '高收入家庭',
      populationShare: 0.15,
      averageIncome: 24000,
      disposableIncome: 17000,
      savingsRate: 0.22,
      confidence: 68,
      essentialShare: 0.38,
      discretionaryShare: 0.44,
      demandBias: { food: 0.88, daily_necessities: 0.92, entertainment: 1.18, luxury: 1.45 },
    },
  ],
  npcFirms: [
    { id: 'npc_food', industry: 'food', employees: 36, capacity: 1100, wageOffer: 5600, financialHealth: 65, plannedSupply: 980, pricingPower: 0.12, marketShare: 32, brand: 48, quality: 54, deliveryReliability: 72, costControl: 64, status: 'active' },
    { id: 'npc_daily', industry: 'daily_necessities', employees: 34, capacity: 980, wageOffer: 5400, financialHealth: 62, plannedSupply: 960, pricingPower: 0.1, marketShare: 30, brand: 52, quality: 56, deliveryReliability: 70, costControl: 66, status: 'active' },
    { id: 'npc_entertainment', industry: 'entertainment', employees: 22, capacity: 520, wageOffer: 6800, financialHealth: 58, plannedSupply: 540, pricingPower: 0.18, marketShare: 22, brand: 58, quality: 62, deliveryReliability: 60, costControl: 55, status: 'active' },
    { id: 'npc_luxury', industry: 'luxury', employees: 12, capacity: 220, wageOffer: 8800, financialHealth: 61, plannedSupply: 240, pricingPower: 0.26, marketShare: 16, brand: 70, quality: 74, deliveryReliability: 56, costControl: 48, status: 'active' },
  ],
  creditConditions: {
    householdCreditTightness: 0.42,
    businessCreditTightness: 0.38,
    defaultRate: 0.03,
    lendingSentiment: 0.58,
    mortgageApprovalRate: 0.68,
    consumerApprovalRate: 0.62,
    businessApprovalRate: 0.58,
    collateralHaircut: 0.28,
    riskPremium: 0.018,
    badDebtPressure: 0.12,
  },
  supplyChain: {
    layers: {
      basicMaterials: { priceIndex: 100, availability: 0.88, shortage: 0.12, costShock: 0 },
      intermediateGoods: { priceIndex: 100, availability: 0.86, shortage: 0.14, costShock: 0 },
      packagingLogistics: { priceIndex: 100, availability: 0.9, shortage: 0.1, costShock: 0 },
      energy: { priceIndex: 100, availability: 0.9, shortage: 0.1, costShock: 0 },
    },
    industryExposure: {
      food: { basicMaterials: 0.36, intermediateGoods: 0.08, packagingLogistics: 0.4, energy: 0.16 },
      daily_necessities: { basicMaterials: 0.42, intermediateGoods: 0.28, packagingLogistics: 0.22, energy: 0.08 },
      entertainment: { basicMaterials: 0.16, intermediateGoods: 0.42, packagingLogistics: 0.12, energy: 0.3 },
      luxury: { basicMaterials: 0.18, intermediateGoods: 0.36, packagingLogistics: 0.1, energy: 0.36 },
      public_service: { basicMaterials: 0.08, intermediateGoods: 0.2, packagingLogistics: 0.32, energy: 0.4 },
      finance: { basicMaterials: 0.04, intermediateGoods: 0.12, packagingLogistics: 0.14, energy: 0.7 },
    },
  },
  macroState: {
    consumerConfidence: 60,
    businessConfidence: 58,
    externalDemandIndex: 100,
    fiscalPressure: 0.28,
    unemploymentPressure: 0.3,
    inflationExpectation: 0.03,
    socialMobilityIndex: 55,
  },
  externalSector: {
    importCostIndex: 100,
    exportDemandIndex: 100,
    logisticsStress: 1,
    energyPriceIndex: 100,
    tradeBalance: 0,
  },
  priceAnchors: {
    food: { referencePrice: INITIAL_GOODS.food.basePrice, lastClearingPrice: INITIAL_GOODS.food.currentPrice, inventoryPressure: 0, shortageIndex: 0 },
    daily_necessities: { referencePrice: INITIAL_GOODS.daily_necessities.basePrice, lastClearingPrice: INITIAL_GOODS.daily_necessities.currentPrice, inventoryPressure: 0, shortageIndex: 0 },
    housing: { referencePrice: INITIAL_GOODS.housing.basePrice, lastClearingPrice: INITIAL_GOODS.housing.currentPrice, inventoryPressure: 0, shortageIndex: 0 },
    transportation: { referencePrice: INITIAL_GOODS.transportation.basePrice, lastClearingPrice: INITIAL_GOODS.transportation.currentPrice, inventoryPressure: 0, shortageIndex: 0 },
    entertainment: { referencePrice: INITIAL_GOODS.entertainment.basePrice, lastClearingPrice: INITIAL_GOODS.entertainment.currentPrice, inventoryPressure: 0, shortageIndex: 0 },
    luxury: { referencePrice: INITIAL_GOODS.luxury.basePrice, lastClearingPrice: INITIAL_GOODS.luxury.currentPrice, inventoryPressure: 0, shortageIndex: 0 },
    education: { referencePrice: INITIAL_GOODS.education.basePrice, lastClearingPrice: INITIAL_GOODS.education.currentPrice, inventoryPressure: 0, shortageIndex: 0 },
    healthcare: { referencePrice: INITIAL_GOODS.healthcare.basePrice, lastClearingPrice: INITIAL_GOODS.healthcare.currentPrice, inventoryPressure: 0, shortageIndex: 0 },
  },
  inventoryPressure: {
    food: 0,
    daily_necessities: 0,
    housing: 0,
    transportation: 0,
    entertainment: 0,
    luxury: 0,
    education: 0,
    healthcare: 0,
  },
  shortageIndex: {
    food: 0,
    daily_necessities: 0,
    housing: 0,
    transportation: 0,
    entertainment: 0,
    luxury: 0,
    education: 0,
    healthcare: 0,
  },
  supplyDemand: createInitialSupplyDemand(),
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
      if (getActionBlockReason(player)) return state;
      if (player.profession === 'worker' && (player.workerAbilities?.unemployedRounds ?? 0) > 0) return state;
      if (player.health < WORK_HEALTH_THRESHOLD) return state;

      const professionConfig = PROFESSION_CONFIGS[player.profession];

      const currentJob = player.profession === 'worker'
        ? getWorkerCurrentJob(player, state.players, state.market)
        : null;
      const maxWorkPerRound = currentJob?.paymentType === 'hourly'
        ? currentJob.maxWorkPerRound
        : professionConfig.maxWorkPerRound;

      if (player.profession === 'worker' && currentJob?.paymentType === 'monthly') return state;
      if (player.workState.workCount >= maxWorkPerRound) return state;

      const fatiguePenalty = player.workState.workCount > 0 ? player.workState.workCount * 0.12 : 0;
      const skillBonus = player.workerAbilities ? player.workerAbilities.skill * 0.004 : 0;
      let income = player.profession === 'worker' && currentJob
        ? currentJob.wage * (1 - fatiguePenalty) * (1 + skillBonus)
        : professionConfig.baseIncome * (1 - fatiguePenalty) * (1 + skillBonus);
      let healthCost = 0;
      let happinessDelta = 2 - player.workState.workCount;
      let fatigueIncrease = 20;

      if (player.profession === 'worker' && currentJob) {
        healthCost = currentJob.healthCost;
        happinessDelta = -currentJob.happinessCost;
        fatigueIncrease = currentJob.fatigueCost;
      }

      if (player.profession === 'entrepreneur') {
        income = player.company?.profit || 0;
        healthCost = 0;
        fatigueIncrease = 15;
      }

      if (player.profession === 'government') {
        income = professionConfig.baseIncome;
        healthCost = 0;
        fatigueIncrease = 10;
      }

      income = income * (1 + player.permanentBonuses.incomeBonus);
      const taxPaid = Math.max(0, income * state.market.globalTaxRate);
      const afterTax = income - taxPaid;

      const updatedPlayers = creditTaxToGovernment(state.players.map(p => {
        if (p.id !== playerId) return p;
        
        const extraHealthCost = player.workState.workCount >= maxWorkPerRound - 1
          ? Math.max(0, Math.floor(healthCost * 0.5))
          : 0;
        const ability = p.workerAbilities;
        
        return {
          ...p,
          cash: p.cash + afterTax,
          health: Math.max(0, p.health - healthCost - extraHealthCost),
          happiness: clamp(p.happiness + happinessDelta, 0, 100),
          workerAbilities: ability ? {
            ...ability,
            experience: (ability.experience ?? 0) + (player.profession === 'worker' ? 1 : 0),
          } : ability,
          workState: {
            ...p.workState,
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
      if (getActionBlockReason(player)) return state;
      if ((player.workerAbilities?.unemployedRounds ?? 0) > 0) return state;
      if (player.health < WORK_HEALTH_THRESHOLD || player.workState.fatigueLevel >= 85 || (player.workState.overtimeCount ?? 0) >= 1) return state;

      const currentJob = getWorkerCurrentJob(player, state.players, state.market);
      if (!currentJob.overtimeAllowed || currentJob.paymentType !== 'monthly') return state;
      const wage = player.workerAbilities?.wageLevel ?? currentJob.wage;
      const income = wage * ECONOMY_BALANCE.worker.overtimeMultiplier;
      const taxPaid = income * state.market.globalTaxRate;
      const updatedPlayers = creditTaxToGovernment(state.players.map(p => {
        if (p.id !== playerId) return p;
        const ability = p.workerAbilities;
        return {
          ...p,
          cash: p.cash + income - taxPaid,
          health: Math.max(0, p.health - Math.max(4, currentJob.healthCost + 4)),
          happiness: Math.max(0, p.happiness - currentJob.happinessCost - 3),
          workerAbilities: ability ? {
            ...ability,
            experience: (ability.experience ?? 0) + 1,
          } : ability,
          workState: {
            workCount: p.workState.workCount + 1,
            overtimeCount: (p.workState.overtimeCount ?? 0) + 1,
            fatigueLevel: Math.min(100, p.workState.fatigueLevel + 35),
            lastWorkTime: Date.now(),
            forcedRestRounds: p.workState.forcedRestRounds ?? 0,
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
          if (getActionBlockReason(p)) return p;
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
              educationLevel: Math.min(4, (ability.educationLevel ?? 0) + (ability.trainingSessions % 2 === 1 ? 1 : 0)),
              experience: (ability.experience ?? 0) + 1,
            },
          };
        }),
      };
    }

    case 'NEGOTIATE_WAGE': {
      const { playerId } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.profession !== 'worker') return state;
      if (getActionBlockReason(player)) return state;
      const ability = player.workerAbilities ?? getDefaultWorkerAbilities();
      if (ability.lastNegotiationRound === state.currentRound) return state;
      const negotiation = buildWageNegotiationContext(player, state.players, state.market);
      const currentJob = negotiation.currentJob;
      const roll = Math.random();
      const outcome = getWageNegotiationOutcome(negotiation.successChance, roll);
      const newWage = Math.max(negotiation.marketMinimum, Math.round(ability.wageLevel * getWageRaiseMultiplier(outcome)));

      return {
        ...state,
        players: state.players.map(p => {
          if (p.id !== playerId) return p;
          const current = p.workerAbilities ?? ability;
          return {
            ...p,
            happiness: clamp(p.happiness + (outcome === 'rejected' ? -3 : outcome === 'small_raise' ? 2 : 4), 0, 100),
            workerAbilities: {
              ...current,
              wageLevel: newWage,
              negotiationPower: Math.min(100, current.negotiationPower + (outcome === 'rejected' ? 2 : 3)),
              lastNegotiationRound: state.currentRound,
              lastNegotiationAsk: currentJob.wage,
              lastNegotiationOutcome: outcome,
            },
          };
        }),
        gameLog: [...state.gameLog, {
          id: generateId(),
          round: state.currentRound,
          timestamp: Date.now(),
          type: 'action',
          message:
            outcome === 'strong_raise' ? `${player.name} 谈薪表现出色，工资上调 10%`
              : outcome === 'normal_raise' ? `${player.name} 谈薪成功，工资上调 6%`
                : outcome === 'small_raise' ? `${player.name} 谈到小幅加薪，工资上调 3%`
                  : `${player.name} 谈薪被拒，但积累了谈判经验`,
          playerId,
        }],
      };
    }

    case 'SWITCH_JOB': {
      const { playerId, jobId } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.profession !== 'worker') return state;
      if (getActionBlockReason(player)) return state;
      const ability = player.workerAbilities ?? {
        skill: 30,
        wageLevel: ECONOMY_BALANCE.worker.baseWage,
        trainingSessions: 0,
        unemployedRounds: 0,
        negotiationPower: 20,
      };
      if (player.cash < ECONOMY_BALANCE.worker.jobSwitchCost) return state;
      const offer = getJobOffers(state.players, player, state.market.employmentRate, state.market).find(item => item.id === jobId);
      if (!offer) return state;
      const qualified = isQualifiedForJob(player, offer);

      return {
        ...state,
        players: state.players.map(p => {
          if (p.id !== playerId) return p;
          const current = p.workerAbilities ?? ability;
          return {
            ...p,
            cash: p.cash - ECONOMY_BALANCE.worker.jobSwitchCost,
            happiness: clamp(p.happiness + (qualified ? 6 : -5), 0, 100),
            workerAbilities: {
              ...current,
              wageLevel: qualified ? offer.wage : current.wageLevel,
              unemployedRounds: qualified ? 0 : Math.max(current.unemployedRounds, 1),
              negotiationPower: Math.min(100, current.negotiationPower + 4),
              employerId: qualified ? offer.employerId : current.employerId,
              jobTitle: qualified ? offer.title : current.jobTitle,
              currentJobId: qualified ? offer.id : current.currentJobId,
              paymentType: qualified ? offer.paymentType : current.paymentType,
            },
          };
        }),
        gameLog: [...state.gameLog, {
          id: generateId(),
          round: state.currentRound,
          timestamp: Date.now(),
          type: 'action',
          message: qualified ? `${player.name} 入职 ${offer.employerName}：${offer.title}，${offer.paymentType === 'monthly' ? '月薪' : '时薪'} ¥${offer.wage}` : `${player.name} 未达到 ${offer.title} 门槛，跳槽失败并短暂失业 1 个月`,
          playerId,
        }],
      };
    }

    case 'SIDE_JOB': {
      const { playerId } = action.payload;
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.profession !== 'worker') return state;
      if (getActionBlockReason(player)) return state;
      if (player.health < WORK_HEALTH_THRESHOLD) return state;

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
      const actingPlayer = state.players.find(player => player.id === playerId);
      if (!actingPlayer || getActionBlockReason(actingPlayer)) return state;
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
            health: Math.min(100, player.health + 18 * quantity),
            happiness: clamp(player.happiness + 2 * quantity, 0, 100),
            workState: {
              ...player.workState,
              fatigueLevel: Math.max(0, player.workState.fatigueLevel - 6 * quantity),
            },
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
      const actingPlayer = state.players.find(player => player.id === playerId);
      if (!actingPlayer || getActionBlockReason(actingPlayer)) return state;
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
      if (getActionBlockReason(seller)) return state;
      const productType: ProductionGoodType = action.payload.productType ?? seller.company.productionType;
      const prodConfig = PRODUCTION_CONFIGS[productType];
      const lockedPrice = seller.company.priceDecisions?.[productType]?.round === state.currentRound
        ? seller.company.priceDecisions[productType]?.price
        : undefined;
      if (lockedPrice !== undefined) return state;
      const minPrice = prodConfig.minSellingPrice;
      const maxPrice = prodConfig.maxSellingPrice;
      
      if (quantity <= 0) {
        console.error('出售数量必须大于0');
        return state;
      }
      
      const sellerInventory = getProductInventory(seller.company);
      const inventory = sellerInventory[productType] || 0;
      if (inventory < quantity) return state;
      const requestedQuantity = Math.min(quantity, inventory);
      const autoBest = requestedQuantity >= inventory
        ? findBestSaleOption(state.market, seller.company, productType, requestedQuantity)
        : null;
      const effectivePrice = lockedPrice ?? autoBest?.price ?? pricePerUnit;
      if (effectivePrice < minPrice || effectivePrice > maxPrice) {
        console.error(`售价应在 ¥${minPrice}~¥${maxPrice} 之间`);
        return state;
      }
      const actualSold = estimateProductSales(state.market, seller.company, productType, requestedQuantity, effectivePrice);
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
                requested: requestedQuantity,
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
              supply: state.market.supplyDemand[productType].supply + Math.max(0, requestedQuantity - actualSold),
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
      const loanCheck = evaluateLoanApplication(player, loanType, amount, state.market);
      if (!loanCheck.approved) return state;

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
            productionCapacity: getCompanyCapacityUnits({ ...player.company, employees: player.company.employees + count }),
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
            productionCapacity: getCompanyCapacityUnits({ ...player.company, employees: Math.max(0, player.company.employees - actualFire) }),
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
            productionCapacity: getCompanyCapacityUnits({ ...player.company, machines: player.company.machines + 1 }),
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

    case 'BUY_MATERIALS': {
      const { playerId, quantity } = action.payload;
      if (quantity <= 0) return state;

      const updatedPlayers = state.players.map(player => {
        if (player.id !== playerId) return player;
        if (player.profession !== 'entrepreneur' || !player.company) return player;

        const totalCost = getMaterialPurchaseCost(quantity, player.company, state.market);
        if (player.cash < totalCost) return player;

        return {
          ...player,
          cash: player.cash - totalCost,
          company: {
            ...player.company,
            rawMaterials: (player.company.rawMaterials || 0) + quantity,
            costs: player.company.costs + totalCost,
            cashFlow: {
              ...player.company.cashFlow,
              expenses: player.company.cashFlow.expenses + totalCost,
              productionCosts: player.company.cashFlow.productionCosts + totalCost,
              final: player.company.cashFlow.final - totalCost,
            },
            stats: {
              ...player.company.stats,
              totalCosts: player.company.stats.totalCosts + totalCost,
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
        const totalCapacity = getCompanyCapacityUnits(company);
        const usedThisRound = company.productionUsedThisRound || 0;
        const maxByCapacity = getMaxProductionByCapacity(totalCapacity, usedThisRound, company.productionType);
        
        // 验证数量
        if (quantity <= 0) return player;
        
        // 检查剩余产能
        if (quantity > maxByCapacity) return player;
        
        // 原材料限制
        const prodConfig = PRODUCTION_CONFIGS[company.productionType];
        const maxByMaterials = Math.floor(Math.max(0, company.rawMaterials || 0) / prodConfig.materialConsumption);
        if (quantity > maxByMaterials) return player;
        
        const processingCost = getProcessingCost(company.productionType, quantity)
          + getSupplyChainOverheadCost(company.productionType, quantity, state.market);
        if (player.cash < processingCost) return player;
        
        // 实际产出
        const actualProduction = Math.min(quantity, maxByMaterials, maxByCapacity);
        if (actualProduction <= 0) return player;
        const actualProcessingCost = getProcessingCost(company.productionType, actualProduction)
          + getSupplyChainOverheadCost(company.productionType, actualProduction, state.market);
        const capacityUsed = getProductionCapacityUsage(company.productionType, actualProduction);
        const productInventory = getProductInventory(company);
        productInventory[company.productionType] += actualProduction;
        
        return {
          ...player,
          cash: player.cash - actualProcessingCost,
          company: {
            ...company,
            rawMaterials: (company.rawMaterials || 0) - actualProduction * prodConfig.materialConsumption,
            inventory: getTotalProductInventory(productInventory),
            productInventory,
            productionUsedThisRound: usedThisRound + capacityUsed,
            costs: company.costs + actualProcessingCost,
            cashFlow: {
              ...company.cashFlow,
              expenses: company.cashFlow.expenses + actualProcessingCost,
              productionCosts: company.cashFlow.productionCosts + actualProcessingCost,
              final: company.cashFlow.final - actualProcessingCost,
            },
            stats: {
              ...company.stats,
              totalProduced: company.stats.totalProduced + actualProduction,
              totalCosts: company.stats.totalCosts + actualProcessingCost,
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
      if (player.govAbilities && policy.cost > getGovernmentPolicyBudgetLimit(player.govAbilities)) return state;

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
        if (getActionBlockReason(player)) return player;
        if (player.cash < medicinePrice) return player;

        return {
          ...player,
          cash: player.cash - medicinePrice,
          goods: { ...player.goods, healthcare: player.goods.healthcare + 1 },
          health: Math.min(100, player.health + 25),
          happiness: clamp(player.happiness + 3, 0, 100),
          workState: {
            ...player.workState,
            fatigueLevel: Math.max(0, player.workState.fatigueLevel - 10),
          },
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
      let newMarket = { ...state.market };
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
      
      const cycleSignal = deriveEconomicCycle(newMarket, state.players);
      newMarket.economicCycle = cycleSignal.economicCycle;
      newMarket.cyclePhase = cycleSignal.cyclePhase;

      const updatedBatches = [...state.assetBatches];

      // 按批次统一计算涨跌幅
      const batchReturns: Record<string, number> = {};
      updatedBatches.forEach(batch => {
        batchReturns[batch.batchId] = calculateAssetReturnMultiplier(batch.type, newMarket);
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
        let monthlyJobFatigueCost = 0;
        const forcedRestBeforeSettlement = getForcedRestTrigger(player);

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
        const fatigueHealthPenalty = player.workState.fatigueLevel >= 80
          ? Math.ceil((player.workState.fatigueLevel - 70) / 4)
          : 0;
        newHealth += 7 - Math.floor(fatiguePenalty / 8) - fatigueHealthPenalty;
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
            const currentJob = getWorkerCurrentJob({ ...player, workerAbilities }, state.players, state.market);
            if (
              currentJob.paymentType === 'monthly'
              && player.workState.monthlySalaryPaidRound !== state.currentRound
            ) {
              const monthlyIncome = Math.round(currentJob.wage * (1 + player.permanentBonuses.incomeBonus));
              const salaryTax = Math.max(0, monthlyIncome * newMarket.globalTaxRate);
              newCash += monthlyIncome - salaryTax;
              taxRevenue += salaryTax;
              newHealth -= currentJob.healthCost;
              newHappiness -= currentJob.happinessCost;
              monthlyJobFatigueCost = currentJob.fatigueCost;
              workerAbilities.experience = (workerAbilities.experience ?? 0) + 1;
            }
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
        let monthlyOtherCosts = 0;
        let monthlyTaxCosts = 0;
        
        if (player.company) {
          const company = player.company;
          
          company.industry = company.productionType;

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
            const productivityFactor = 1 + (newMarket.productivityBonus ?? 0);
            const totalCapacity = getEffectiveCapacityUnits(company, productivityFactor - 1);
            const maxByCapacity = getMaxProductionByCapacity(totalCapacity, 0, company.productionType);
            const maxByMaterials = Math.max(0, Math.floor(company.rawMaterials / prodConfig.materialConsumption));
            const actualProduction = Math.min(autoProd.monthlyTarget, maxByCapacity, maxByMaterials);
            
            if (actualProduction > 0) {
              const totalProductionCost = getProcessingCost(company.productionType, actualProduction)
                + getSupplyChainOverheadCost(company.productionType, actualProduction, newMarket);
              const totalMaterialUsed = actualProduction * prodConfig.materialConsumption;
              const sd = newMarket.supplyDemand[company.productionType];
              const sold = estimateProductSales(newMarket, company, company.productionType, actualProduction, unitSellingPrice);
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
          
          const fixedCosts = getCompanyFixedCosts(company);
          const depreciation = getCompanyDepreciation(company);
          const inventoryHoldingCost = getCompanyInventoryHoldingCost(company);
          const financingCosts = Math.round((player.loans ?? []).filter(loan => loan.type === 'business').reduce((sum, loan) => sum + loan.remaining, 0) * 0.01);
          monthlyOtherCosts = fixedCosts + depreciation + inventoryHoldingCost + financingCosts;
          monthlyTaxCosts = Math.max(0, Math.round(monthlyRevenue * newMarket.globalTaxRate * 0.08));
          const totalCosts = monthlyWages + monthlyProductionCosts + monthlyOtherCosts + monthlyTaxCosts;
          
          // 更新现金流记录
          company.cashFlow = {
            initial: company.cashFlow.final,
            income: monthlyRevenue,
            expenses: totalCosts,
            wages: monthlyWages,
            productionCosts: monthlyProductionCosts,
            otherCosts: monthlyOtherCosts + monthlyTaxCosts,
            final: company.cashFlow.final + monthlyRevenue - totalCosts,
          };
          
          // 计算本月利润
          const monthlyProfit = monthlyRevenue - totalCosts;
          company.stats.monthlyProfit = monthlyProfit;
          
          // 更新企业财务
          company.revenue += monthlyRevenue;
          company.costs += totalCosts;
          company.profit += monthlyProfit;
          company.fixedCosts = fixedCosts;
          company.depreciation = depreciation;
          company.financingCosts = financingCosts;
          company.inventoryHoldingCost = inventoryHoldingCost;
          company.incomeStatement = {
            revenue: monthlyRevenue,
            cogs: monthlyWages + monthlyProductionCosts,
            grossProfit: monthlyRevenue - monthlyWages - monthlyProductionCosts,
            operatingProfit: monthlyRevenue - monthlyWages - monthlyProductionCosts - fixedCosts - inventoryHoldingCost,
            netProfit: monthlyProfit,
            taxes: monthlyTaxCosts,
            interestExpense: financingCosts,
          };
          
          // 将企业利润转给玩家（分红）
          if (monthlyProfit > 0) {
            newCash += monthlyProfit;
          }
          
          // 士气恢复
          company.morale = Math.min(100, company.morale + 5);
          
          // 声誉自然衰减
          company.reputation = Math.max(0, company.reputation - 1);
          Object.assign(company, updateCompanyFinanceSnapshot(company, (player.loans ?? []).filter(loan => loan.type === 'business').reduce((sum, loan) => sum + loan.remaining, 0)));
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

        let forcedRestAfterSettlement = forcedRestBeforeSettlement;
        if (forcedRestAfterSettlement > 0) {
          forcedRestAfterSettlement -= 1;
          newHealth = Math.max(newHealth, forcedRestAfterSettlement === 0 ? FORCED_REST_RECOVERY_HEALTH : 12);
          newHappiness = Math.min(100, newHappiness + 4);
        } else if (newHealth < FORCED_REST_TRIGGER) {
          forcedRestAfterSettlement = FORCED_REST_DURATION;
        }

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
            fatigueLevel: Math.max(0, player.workState.fatigueLevel - 20 + monthlyJobFatigueCost),
            monthlySalaryPaidRound: player.profession === 'worker' && getWorkerCurrentJob({ ...player, workerAbilities }, state.players, state.market).paymentType === 'monthly'
              ? state.currentRound
              : player.workState.monthlySalaryPaidRound,
            forcedRestRounds: forcedRestAfterSettlement,
          },
          hasActedThisRound: false,
          rentPaid: false,
          isBankrupt: newCash < ECONOMY_BALANCE.company.bankruptcyLimit,
          policyCooldowns: updatedCooldowns,
          company: updatedCompany,
        };
      });

      const playersWithMarketShare = recalculatePlayerMarketShare(updatedPlayers, monthlyCompanySales, newMarket);
      const finalPlayers = creditTaxToGovernment(playersWithMarketShare, taxRevenue);
      newMarket.monthlyTaxRevenue = Math.round(taxRevenue * 100) / 100;

      newMarket.externalSector = deriveExternalSector(newMarket);
      newMarket.creditConditions = deriveCreditConditions(newMarket);
      newMarket.bank = {
        ...getBankRates(newMarket),
        consumerLoanRate: newMarket.bank.centralBankRate + ECONOMY_BALANCE.bank.loanRiskSpread.consumer + (newMarket.creditConditions.riskPremium ?? 0),
        mortgageRate: newMarket.bank.centralBankRate + ECONOMY_BALANCE.bank.loanRiskSpread.mortgage + (newMarket.creditConditions.riskPremium ?? 0) * 0.55,
        businessLoanRate: newMarket.bank.centralBankRate + ECONOMY_BALANCE.bank.loanRiskSpread.business + (newMarket.creditConditions.riskPremium ?? 0) * 1.25,
      };
      newMarket.macroState = deriveMacroState(finalPlayers, newMarket);
      newMarket.supplyChain = deriveSupplyChainState(newMarket);
      newMarket.households = updateHouseholdsForMacro(finalPlayers, newMarket);
      newMarket.npcFirms = updateNpcFirmsForMacro(newMarket);
      const householdDemand = calculateHouseholdDemandBySegment(newMarket.households, newMarket);
      const npcSupply = getNpcSupplyContribution(newMarket.npcFirms);
      Object.keys(newMarket.goods).forEach(key => {
        const goodType = key as GoodType;
        const sd = newMarket.supplyDemand[goodType];
        const baselineDemand = Math.max(getBaselineMarketDemand(goodType) * 0.35, householdDemand[goodType] ?? 20);
        sd.demand = Math.max(1, Math.round(sd.demand * 0.46 + baselineDemand * 0.54));
        sd.supply = Math.max(5, Math.round(sd.supply * 0.58 + (npcSupply[goodType] ?? 0) * 0.42));
      });
      const policyTransmission = applyPolicyTransmission(newMarket, finalPlayers);
      newMarket = updateMarketAnchors(policyTransmission.market);
      const finalCycleSignal = deriveEconomicCycle(newMarket, finalPlayers);
      newMarket.economicCycle = finalCycleSignal.economicCycle;
      newMarket.cyclePhase = finalCycleSignal.cyclePhase;
      const finalPlayersWithPolicy = finalPlayers.map(player => {
        const delta = policyTransmission.playerCashDelta[player.id] ?? 0;
        return delta === 0 ? player : { ...player, cash: Math.round((player.cash + delta) * 100) / 100 };
      });
      const governmentFeedback = deriveGovernmentFeedback(finalPlayersWithPolicy, newMarket);
      const finalPlayersWithGovernment = finalPlayersWithPolicy.map(player => {
        if (player.profession !== 'government' || !player.govAbilities || !governmentFeedback) return player;
        const removedByEconomicOutcome = (governmentFeedback.removalRisk ?? 0) >= 92 && (governmentFeedback.approvalRating ?? 100) < 22;
        if (removedByEconomicOutcome) {
          return {
            ...player,
            profession: 'worker' as const,
            govAbilities: undefined,
            policyCooldowns: undefined,
            workerAbilities: ({
              wageLevel: ECONOMY_BALANCE.worker.baseWage,
              skill: 35,
              trainingSessions: 0,
              negotiationPower: 20,
              experience: 0,
              educationLevel: 0,
              currentJobId: 'temp_delivery',
              unemployedRounds: 1,
              paymentType: 'hourly',
              employerId: 'npc_service',
              jobTitle: '临时服务岗',
              contractType: 'hourly',
              hoursPerRound: 8,
              benefits: 0.05,
              promotionTrack: '临时岗->服务业->管理岗',
              jobSecurity: 40,
              industry: 'public_service',
            } satisfies NonNullable<Player['workerAbilities']>),
          };
        }
        return {
          ...player,
          govAbilities: {
            ...player.govAbilities,
            ...governmentFeedback,
          },
        };
      });

      // 更新股票市场
      const trendMultiplier = newMarket.stockMarket.trend === 'bull' ? 1.02 :
        newMarket.stockMarket.trend === 'bear' ? 0.98 : 1;
      newMarket.stockMarket.index *= trendMultiplier;
      newMarket.stockMarket.volatility = Math.max(0.05, newMarket.stockMarket.volatility * 0.95);

      // 计算GDP
      newMarket.gdp = finalPlayersWithGovernment.reduce((sum, p) => sum + Math.max(0, p.cash), 0)
        + newMarket.npcFirms.reduce((sum, firm) => sum + firm.plannedSupply * 4, 0);

      // 更新基尼系数（使用标准洛伦兹曲线公式）
      const incomes = finalPlayersWithGovernment.map(p => Math.max(0, p.cash)).sort((a, b) => a - b);
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
      applyLingeringNewsPressure(newMarket, state.activeEvents);
      newMarket.socialStability = clamp(
        calculateSocialStability(finalPlayersWithGovernment)
        + (newMarket.policyStabilityModifier ?? 0)
        + newMarket.macroState.consumerConfidence * 0.03
        - newMarket.creditConditions.defaultRate * 40,
        0,
        100,
      );

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
      const roundCausalSummary = describeRoundCausalChain(marketAfterPolicies, finalPlayersWithGovernment);

      // 检查游戏结束
      const maxRounds = 30;
      const avgHappiness = finalPlayers.reduce((sum, p) => sum + p.happiness, 0) / finalPlayers.length;

      if (state.currentRound >= maxRounds || avgHappiness < 10) {
        const victoryScores = calculateVictoryScores(finalPlayersWithGovernment, marketAfterPolicies);
        const winner = finalPlayersWithGovernment.reduce((best, player) => {
          const score = victoryScores?.[player.id]?.score ?? 0;
          const bestScore = best ? victoryScores?.[best.id]?.score ?? 0 : 0;
          return score > bestScore ? player : best;
        }, null as Player | null);

        return {
          ...state,
          players: finalPlayersWithGovernment,
          market: marketAfterPolicies,
          phase: 'game_over',
          winner,
          assetBatches: updatedBatches,
          victoryScores,
        };
      }

      return applyNewsEvent({
        ...state,
        players: finalPlayersWithGovernment,
        market: marketAfterPolicies,
        activeEvents: nextActiveEvents,
        currentRound: nextRound,
        currentPlayerIndex: 0,
        phase: 'news',
        assetBatches: updatedBatches,
        pendingPolicies: policyApplication.remainingPolicies,
        victoryScores: calculateVictoryScores(finalPlayersWithGovernment, marketAfterPolicies),
        gameLog: [
          ...state.gameLog,
          {
            id: generateId(),
            round: nextRound,
            timestamp: Date.now(),
            type: 'system',
            message: `第 ${nextRound} 轮开始！`,
          },
          {
            id: generateId(),
            round: nextRound,
            timestamp: Date.now(),
            type: 'system',
            message: `经济因果链：${roundCausalSummary}`,
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
