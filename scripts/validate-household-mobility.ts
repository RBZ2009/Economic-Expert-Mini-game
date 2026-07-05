import { createInitialGameState } from '../src/game/initial-state';
import { getJobOffers, isQualifiedForJob } from '../src/game/jobs';
import {
  calculateHouseholdDemandBySegment,
  deriveMacroState,
  updateHouseholdsForMacro,
} from '../src/game/market';
import { GameState, HouseholdSegment, Market, Player } from '../src/types/game';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createState(): GameState {
  return createInitialGameState([
    { id: 'worker', name: '员工', color: '#2563eb', profession: 'worker' },
    { id: 'entrepreneur', name: '企业家', color: '#16a34a', profession: 'entrepreneur' },
    { id: 'investor', name: '投资者', color: '#9333ea', profession: 'investor' },
  ], 'professional');
}

function withWorker(state: GameState, overrides: Partial<Player>): GameState {
  return {
    ...state,
    players: state.players.map(player => player.profession === 'worker'
      ? {
          ...player,
          ...overrides,
          workerAbilities: {
            ...player.workerAbilities!,
            ...(overrides.workerAbilities ?? {}),
          },
        }
      : player),
  };
}

function createMobilityMarket(base: Market): Market {
  const market = clone(base);
  market.employmentRate = 82;
  market.inflationRate = 0.018;
  market.globalTaxRate = 0.18;
  market.creditConditions = {
    ...market.creditConditions,
    householdCreditTightness: 0.26,
    mortgageApprovalRate: 0.78,
  };
  market.macroState = {
    ...market.macroState,
    consumerConfidence: 76,
    businessConfidence: 72,
    externalDemandIndex: 116,
    unemploymentPressure: 0.08,
    socialMobilityIndex: 68,
  };
  return market;
}

function createStressMarket(base: Market): Market {
  const market = clone(base);
  market.employmentRate = 48;
  market.inflationRate = 0.11;
  market.globalTaxRate = 0.24;
  market.creditConditions = {
    ...market.creditConditions,
    householdCreditTightness: 0.84,
    mortgageApprovalRate: 0.28,
  };
  market.macroState = {
    ...market.macroState,
    consumerConfidence: 34,
    businessConfidence: 38,
    externalDemandIndex: 78,
    unemploymentPressure: 0.64,
    socialMobilityIndex: 34,
  };
  return market;
}

function shareOf(households: HouseholdSegment[], id: string): number {
  return households.find(household => household.id === id)?.populationShare ?? 0;
}

function assertSkillsUnlockBetterJobs(): void {
  const state = createState();
  const worker = state.players.find(player => player.profession === 'worker')!;
  const entryWorker = {
    ...worker,
    workerAbilities: {
      ...worker.workerAbilities!,
      skill: 25,
      educationLevel: 0,
      experience: 0,
    },
  };
  const skilledWorker = {
    ...worker,
    goods: {
      ...worker.goods,
      education: 8,
    },
    workerAbilities: {
      ...worker.workerAbilities!,
      skill: 76,
      educationLevel: 3,
      experience: 5,
    },
  };
  const market = createMobilityMarket(state.market);
  const entryQualified = getJobOffers(state.players, entryWorker, market.employmentRate, market)
    .filter(offer => isQualifiedForJob(entryWorker, offer));
  const skilledQualified = getJobOffers(state.players, skilledWorker, market.employmentRate, market)
    .filter(offer => isQualifiedForJob(skilledWorker, offer));
  const entryBest = Math.max(...entryQualified.map(offer => offer.wage));
  const skilledBest = Math.max(...skilledQualified.map(offer => offer.wage));
  if (skilledBest <= entryBest * 1.35) {
    throw new Error(`技能和学历提升没有显著改善岗位工资: entry=${entryBest}, skilled=${skilledBest}`);
  }
  if (!skilledQualified.some(offer => offer.requiredEducation >= 2 || offer.requiredExperience >= 3)) {
    throw new Error('高能力员工没有解锁高门槛岗位');
  }
}

function assertClassMobilityRespondsToHumanCapital(): void {
  const state = createState();
  const skilledState = withWorker(state, {
    cash: 90000,
    health: 88,
    housingStatus: 'owned',
    housingTier: 'standard',
    loans: [],
    workerAbilities: {
      ...state.players.find(player => player.profession === 'worker')!.workerAbilities!,
      skill: 82,
      educationLevel: 3,
      experience: 6,
      paymentType: 'monthly',
      currentJobId: 'npc_tech_monthly',
    },
  });
  const stressedState = withWorker(state, {
    cash: 1000,
    health: 28,
    housingStatus: 'none',
    loans: [{ id: 'debt', type: 'consumer', principal: 80000, remaining: 80000, monthlyRate: 0.025, createdRound: 1 }],
    workerAbilities: {
      ...state.players.find(player => player.profession === 'worker')!.workerAbilities!,
      skill: 18,
      educationLevel: 0,
      experience: 0,
      unemployedRounds: 2,
      paymentType: 'hourly',
      currentJobId: 'npc_service_hourly',
    },
  });
  const skilledMarket = createMobilityMarket(state.market);
  skilledMarket.macroState = deriveMacroState(skilledState.players, skilledMarket);
  const stressedMarket = createStressMarket(state.market);
  stressedMarket.macroState = deriveMacroState(stressedState.players, stressedMarket);

  const skilledHouseholds = updateHouseholdsForMacro(skilledState.players, skilledMarket);
  const stressedHouseholds = updateHouseholdsForMacro(stressedState.players, stressedMarket);
  const skilledMiddleHigh = shareOf(skilledHouseholds, 'middle_income') + shareOf(skilledHouseholds, 'high_income');
  const stressedMiddleHigh = shareOf(stressedHouseholds, 'middle_income') + shareOf(stressedHouseholds, 'high_income');

  if (skilledMiddleHigh <= stressedMiddleHigh + 0.08) {
    throw new Error(`人力资本改善没有明显提高中高收入占比: skilled=${skilledMiddleHigh}, stressed=${stressedMiddleHigh}`);
  }
  if (shareOf(stressedHouseholds, 'low_income') <= shareOf(skilledHouseholds, 'low_income') + 0.08) {
    throw new Error('高债务低健康状态没有明显推高低收入占比');
  }
}

function assertConsumptionBasketsDifferByClass(): void {
  const state = createState();
  const market = createMobilityMarket(state.market);
  const lowOnly = state.market.households
    .filter(household => household.id === 'low_income')
    .map(household => ({ ...household, populationShare: 1 }));
  const highOnly = state.market.households
    .filter(household => household.id === 'high_income')
    .map(household => ({ ...household, populationShare: 1 }));
  const lowDemand = calculateHouseholdDemandBySegment(lowOnly, market);
  const highDemand = calculateHouseholdDemandBySegment(highOnly, market);
  const lowDiscretionary = lowDemand.entertainment + lowDemand.luxury;
  const highDiscretionary = highDemand.entertainment + highDemand.luxury;
  const lowEssential = lowDemand.food + lowDemand.daily_necessities;
  const highEssential = highDemand.food + highDemand.daily_necessities;
  const lowEssentialShare = lowEssential / Math.max(1, lowEssential + lowDiscretionary);
  const highEssentialShare = highEssential / Math.max(1, highEssential + highDiscretionary);

  if (highDiscretionary <= lowDiscretionary * 2.2) {
    throw new Error(`高收入家庭可选消费不够突出: high=${highDiscretionary}, low=${lowDiscretionary}`);
  }
  if (lowEssentialShare <= highEssentialShare + 0.18) {
    throw new Error(`低收入家庭必需品消费占比不够突出: low=${lowEssentialShare}, high=${highEssentialShare}`);
  }
}

assertSkillsUnlockBetterJobs();
assertClassMobilityRespondsToHumanCapital();
assertConsumptionBasketsDifferByClass();
console.log('Household mobility passed: skills unlock better jobs, class shares move with human capital, and consumption baskets differ by income.');
