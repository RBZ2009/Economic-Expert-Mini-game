import { createInitialGameState } from '../src/game/initial-state';
import {
  describePolicyEvaluation,
  deriveGovernmentFeedback,
  getGovernmentPolicyBudgetLimit,
} from '../src/game/market';
import { GameState, Market, Player } from '../src/types/game';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createState(): GameState {
  return createInitialGameState([
    { id: 'government', name: '政府', color: '#dc2626', profession: 'government' },
    { id: 'worker', name: '员工', color: '#2563eb', profession: 'worker' },
    { id: 'entrepreneur', name: '企业家', color: '#16a34a', profession: 'entrepreneur' },
  ], 'professional');
}

function getGovernment(state: GameState): Player {
  const government = state.players.find(player => player.profession === 'government');
  if (!government?.govAbilities) throw new Error('测试状态缺少政府玩家');
  return government;
}

function createHealthyMarket(base: Market): Market {
  const market = clone(base);
  market.socialStability = 86;
  market.inflationRate = 0.02;
  market.globalTaxRate = 0.18;
  market.monthlyTaxRevenue = 42000;
  market.macroState = {
    ...market.macroState,
    consumerConfidence: 82,
    businessConfidence: 78,
    externalDemandIndex: 118,
    fiscalPressure: 0.12,
    unemploymentPressure: 0.08,
    inflationExpectation: 0.018,
  };
  market.creditConditions = {
    ...market.creditConditions,
    householdCreditTightness: 0.24,
    businessCreditTightness: 0.22,
    defaultRate: 0.018,
    badDebtPressure: 0.08,
  };
  return market;
}

function createStressedMarket(base: Market): Market {
  const market = clone(base);
  market.socialStability = 18;
  market.inflationRate = 0.13;
  market.globalTaxRate = 0.34;
  market.monthlyTaxRevenue = 1800;
  market.macroState = {
    ...market.macroState,
    consumerConfidence: 18,
    businessConfidence: 16,
    externalDemandIndex: 72,
    fiscalPressure: 0.9,
    unemploymentPressure: 0.82,
    inflationExpectation: 0.14,
  };
  market.creditConditions = {
    ...market.creditConditions,
    householdCreditTightness: 0.86,
    businessCreditTightness: 0.88,
    defaultRate: 0.16,
    badDebtPressure: 0.82,
  };
  return market;
}

function assertGovernmentFeedbackDifferentiatesOutcomes(): void {
  const state = createState();
  const government = getGovernment(state);
  const healthyGovernment = {
    ...government,
    govAbilities: {
      ...government.govAbilities!,
      treasuryBalance: 180000,
      decisionPower: 42,
      reputation: 72,
    },
  };
  const stressedGovernment = {
    ...government,
    govAbilities: {
      ...government.govAbilities!,
      treasuryBalance: 8000,
      decisionPower: 18,
      reputation: 24,
    },
  };

  const healthyFeedback = deriveGovernmentFeedback(
    [healthyGovernment, ...state.players.filter(player => player.id !== government.id)],
    createHealthyMarket(state.market),
  );
  const stressedFeedback = deriveGovernmentFeedback(
    [stressedGovernment, ...state.players.filter(player => player.id !== government.id)],
    createStressedMarket(state.market),
  );

  if (!healthyFeedback || !stressedFeedback) throw new Error('政府反馈为空');
  const failures: string[] = [];
  if ((healthyFeedback.approvalRating ?? 0) <= (stressedFeedback.approvalRating ?? 0) + 25) {
    failures.push('好环境和坏环境下的综合支持率区分不明显');
  }
  if ((healthyFeedback.decisionPower ?? 0) <= healthyGovernment.govAbilities.decisionPower) {
    failures.push('高支持率没有提高决策权');
  }
  if ((stressedFeedback.decisionPower ?? 100) >= stressedGovernment.govAbilities.decisionPower) {
    failures.push('低支持率没有削弱决策权');
  }
  if ((healthyFeedback.budgetSpace ?? 0) <= (stressedFeedback.budgetSpace ?? 0) + 30) {
    failures.push('财政健康没有明显影响预算空间');
  }
  if ((healthyFeedback.executionEfficiency ?? 0) <= (stressedFeedback.executionEfficiency ?? 0) + 25) {
    failures.push('支持率、财政和声誉没有明显影响执行效率');
  }
  if ((stressedFeedback.removalRisk ?? 0) <= (healthyFeedback.removalRisk ?? 0) + 35) {
    failures.push('坏环境没有显著提高下台风险');
  }
  if ((stressedFeedback.removalRisk ?? 0) < 70) {
    failures.push('极端坏环境下下台风险过低');
  }
  if (failures.length > 0) {
    throw new Error(`Government feedback validation failed:\n${failures.map(item => `- ${item}`).join('\n')}`);
  }
}

function assertBudgetSpaceConstrainsPolicyCost(): void {
  const state = createState();
  const government = getGovernment(state);
  const wideBudgetGov = {
    ...government.govAbilities!,
    treasuryBalance: 100000,
    budgetSpace: 80,
  };
  const tightBudgetGov = {
    ...government.govAbilities!,
    treasuryBalance: 100000,
    budgetSpace: 5,
  };
  const wideLimit = getGovernmentPolicyBudgetLimit(wideBudgetGov);
  const tightLimit = getGovernmentPolicyBudgetLimit(tightBudgetGov);

  if (wideLimit <= tightLimit * 2) throw new Error('预算空间没有明显改变政策支出上限');
  if (tightLimit >= 40000) throw new Error('预算空间极低时仍允许过高政策支出');
}

function assertPolicyEvaluationExplainsConsequences(): void {
  const state = createState();
  const market = createStressedMarket(state.market);
  const explanation = describePolicyEvaluation(market, ['import_tariff', 'subsidy_all']);
  const required = ['居民评价', '企业评价', '财政评价', '通胀评价', '坏账压力', '预算空间'];
  const missing = required.filter(fragment => !explanation.includes(fragment));
  if (missing.length > 0) {
    throw new Error(`政策评价说明缺少: ${missing.join(', ')}`);
  }
}

assertGovernmentFeedbackDifferentiatesOutcomes();
assertBudgetSpaceConstrainsPolicyCost();
assertPolicyEvaluationExplainsConsequences();
console.log('Government feedback passed: multidimensional support drives authority, budget space, execution efficiency, and removal risk.');
