import {
  Company,
  GameMode,
  GameState,
  Player,
  PlayerProfession,
  WorkState,
  ECONOMY_BALANCE,
  INITIAL_GOODS,
  PLAYER_COLORS,
} from '@/types/game';

export interface InitialRoomPlayer {
  id: string;
  name: string;
  color: string;
  profession?: PlayerProfession;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

function createInitialWorkState(): WorkState {
  return { workCount: 0, fatigueLevel: 0 };
}

function createInitialCompany(ownerId: string): Company {
  return {
    id: generateId(),
    ownerId,
    name: '创业公司',
    employees: 0,
    machines: 0,
    rawMaterials: 50,
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
