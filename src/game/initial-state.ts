import {
  Company,
  GameMode,
  GameState,
  HouseholdSegment,
  NpcFirm,
  Player,
  PlayerProfession,
  WorkState,
  ECONOMY_BALANCE,
  INITIAL_GOODS,
  PLAYER_COLORS,
} from '@/types/game';
import { createInitialSupplyDemand } from '@/game/market';

export interface InitialRoomPlayer {
  id: string;
  name: string;
  color: string;
  profession?: PlayerProfession;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

function createInitialWorkState(): WorkState {
  return { workCount: 0, fatigueLevel: 0, forcedRestRounds: 0 };
}

function createInitialCompany(ownerId: string): Company {
  return {
    id: generateId(),
    ownerId,
    name: '创业公司',
    employees: 0,
    machines: 0,
    rawMaterials: 180,
    inventory: 0,
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
    productionType: 'daily_necessities',
    autoProduction: { enabled: false, monthlyTarget: 0 },
    stats: {
      totalProduced: 0,
      totalSold: 0,
      totalRevenue: 0,
      totalCosts: 0,
      monthlyProfit: 0,
    },
    productionUsedThisRound: 0,
  };
}

export function createInitialPlayer(
  id: string,
  name: string,
  color: string,
  profession: PlayerProfession
): Player {
  const professionInitialStats: Record<PlayerProfession, { happiness: number; health: number; socialStatus: number }> = {
    worker: { happiness: 55, health: 65, socialStatus: 40 },
    entrepreneur: { happiness: 65, health: 80, socialStatus: 60 },
    investor: { happiness: 75, health: 85, socialStatus: 50 },
    government: { happiness: 65, health: 75, socialStatus: 70 },
  };

  const stats = professionInitialStats[profession];

  const player: Player = {
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
    hasActedThisRound: false,
    isBankrupt: false,
    governmentRatings: {},
    permanentBonuses: { incomeBonus: 0, happinessBonus: 0 },
    loans: [],
    creditScore: 70,
  };

  if (profession === 'worker') {
    player.workerAbilities = {
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
      contractType: 'hourly',
      hoursPerRound: 8,
      benefits: 0.08,
      promotionTrack: '服务业->制造业->技能岗',
      jobSecurity: 55,
      industry: 'public_service',
    };
  }

  if (profession === 'entrepreneur') {
    player.company = createInitialCompany(id);
  }

  if (profession === 'government') {
    player.policyCooldowns = {
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
    };
    player.govAbilities = {
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
    };
  }

  if (profession === 'investor') {
    player.investorAbilities = {
      investmentSkill: 30,
      learningPoints: 0,
      totalLearningSessions: 0,
      canSeeEconomicTrends: true,
      lastMarketAnalysis: 0,
    };
  }

  return player;
}

function createInitialHouseholds(): HouseholdSegment[] {
  return [
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
  ];
}

function createInitialNpcFirms(): NpcFirm[] {
  return [
    { id: 'npc_food', industry: 'food', employees: 36, capacity: 1100, wageOffer: 5600, financialHealth: 65, plannedSupply: 980, pricingPower: 0.12, marketShare: 32, brand: 48, quality: 54, deliveryReliability: 72, costControl: 64, status: 'active' },
    { id: 'npc_daily', industry: 'daily_necessities', employees: 34, capacity: 980, wageOffer: 5400, financialHealth: 62, plannedSupply: 960, pricingPower: 0.1, marketShare: 30, brand: 52, quality: 56, deliveryReliability: 70, costControl: 66, status: 'active' },
    { id: 'npc_entertainment', industry: 'entertainment', employees: 22, capacity: 520, wageOffer: 6800, financialHealth: 58, plannedSupply: 540, pricingPower: 0.18, marketShare: 22, brand: 58, quality: 62, deliveryReliability: 60, costControl: 55, status: 'active' },
    { id: 'npc_luxury', industry: 'luxury', employees: 12, capacity: 220, wageOffer: 8800, financialHealth: 61, plannedSupply: 240, pricingPower: 0.26, marketShare: 16, brand: 70, quality: 74, deliveryReliability: 56, costControl: 48, status: 'active' },
  ];
}

export function createInitialGameState(players: InitialRoomPlayer[], gameMode: GameMode = 'professional'): GameState {
  const gamePlayers = players.map((player, index) =>
    createInitialPlayer(
      player.id,
      player.name,
      player.color || PLAYER_COLORS[index % PLAYER_COLORS.length],
      player.profession || 'worker'
    )
  );

  return {
    phase: 'player_turn',
    gameMode,
    currentRound: 1,
    roundCompletedPlayers: [],
    currentPlayerIndex: 0,
    players: gamePlayers,
    market: {
      goods: JSON.parse(JSON.stringify(INITIAL_GOODS)) as GameState['market']['goods'],
      stockMarket: { index: 100, volatility: 0.1, trend: 'stable' },
      gdp: 0,
      inflationRate: 0.02,
      employmentRate: 70,
      giniCoefficient: 0.4,
      socialStability: 75,
      households: createInitialHouseholds(),
      npcFirms: createInitialNpcFirms(),
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
    },
    tradeOffers: [],
    pendingTrade: null,
    recentEvent: null,
    currentNews: null,
    tutorialPrompt: null,
    pendingPolicies: [],
    activeEvents: [],
    eventHistory: [],
    gameLog: [{
      id: generateId(),
      round: 1,
      timestamp: Date.now(),
      type: 'system',
      message: '游戏开始！',
    }],
    winner: null,
    assetBatches: [],
  };
}
