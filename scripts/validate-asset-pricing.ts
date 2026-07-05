import { createInitialGameState } from '../src/game/initial-state';
import { calculateAssetReturnMultiplier } from '../src/game/market';
import { ECONOMY_BALANCE, GameState, InvestmentType, Market } from '../src/types/game';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createState(): GameState {
  return createInitialGameState([
    { id: 'investor', name: '投资者', color: '#9333ea', profession: 'investor' },
  ], 'professional');
}

function priced(assetType: InvestmentType, market: Market): number {
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    return calculateAssetReturnMultiplier(assetType, market);
  } finally {
    Math.random = originalRandom;
  }
}

function withRates(market: Market, centralBankRate: number): Market {
  return {
    ...market,
    bank: {
      ...(market.bank ?? {
        centralBankRate: ECONOMY_BALANCE.bank.baseRate,
        depositRate: ECONOMY_BALANCE.bank.baseRate + ECONOMY_BALANCE.bank.depositRateSpread,
        consumerLoanRate: ECONOMY_BALANCE.bank.baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.consumer,
        mortgageRate: ECONOMY_BALANCE.bank.baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.mortgage,
        businessLoanRate: ECONOMY_BALANCE.bank.baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.business,
        defaultedLoans: 0,
      }),
      centralBankRate,
      depositRate: Math.max(0, centralBankRate + ECONOMY_BALANCE.bank.depositRateSpread),
    },
  };
}

function assertStocksUseEarningsAndDiscountRate(): void {
  const state = createState();
  const weak = withRates(clone(state.market), 0.058);
  weak.macroState = {
    ...weak.macroState,
    businessConfidence: 28,
    consumerConfidence: 34,
    externalDemandIndex: 76,
  };
  weak.creditConditions = {
    ...weak.creditConditions,
    businessCreditTightness: 0.86,
    defaultRate: 0.12,
  };
  weak.inventoryPressure.daily_necessities = 0.48;

  const strong = withRates(clone(state.market), 0.018);
  strong.macroState = {
    ...strong.macroState,
    businessConfidence: 84,
    consumerConfidence: 78,
    externalDemandIndex: 132,
  };
  strong.creditConditions = {
    ...strong.creditConditions,
    businessCreditTightness: 0.2,
    defaultRate: 0.018,
  };
  strong.inventoryPressure.daily_necessities = 0.02;

  const weakStock = priced('stock', weak);
  const strongStock = priced('stock', strong);
  if (strongStock <= weakStock + 0.04) {
    throw new Error(`股票没有明显反映盈利预期、风险偏好和折现率: weak=${weakStock}, strong=${strongStock}`);
  }
}

function assertBondsBalanceRatesAndCreditRisk(): void {
  const state = createState();
  const lowRate = withRates(clone(state.market), 0.012);
  lowRate.creditConditions = {
    ...lowRate.creditConditions,
    defaultRate: 0.018,
    householdCreditTightness: 0.28,
  };

  const highRateCleanCredit = withRates(clone(state.market), 0.062);
  highRateCleanCredit.creditConditions = {
    ...highRateCleanCredit.creditConditions,
    defaultRate: 0.018,
    householdCreditTightness: 0.28,
  };

  const highRateBadCredit = withRates(clone(state.market), 0.062);
  highRateBadCredit.creditConditions = {
    ...highRateBadCredit.creditConditions,
    defaultRate: 0.16,
    householdCreditTightness: 0.84,
  };

  const lowRateBond = priced('bond', lowRate);
  const highRateBond = priced('bond', highRateCleanCredit);
  const badCreditBond = priced('bond', highRateBadCredit);

  if (highRateBond <= lowRateBond) {
    throw new Error(`高利率没有提高债券票息吸引力: low=${lowRateBond}, high=${highRateBond}`);
  }
  if (badCreditBond >= highRateBond) {
    throw new Error(`违约风险没有压制债券收益预期: clean=${highRateBond}, bad=${badCreditBond}`);
  }
}

function assertGoldUsesInflationAndSafeHavenDemand(): void {
  const state = createState();
  const calm = clone(state.market);
  calm.macroState = {
    ...calm.macroState,
    inflationExpectation: 0.012,
    businessConfidence: 72,
    consumerConfidence: 74,
  };
  calm.creditConditions = {
    ...calm.creditConditions,
    defaultRate: 0.018,
    householdCreditTightness: 0.22,
  };
  calm.economicCycle = 'growth';

  const stressed = clone(state.market);
  stressed.inflationRate = 0.09;
  stressed.macroState = {
    ...stressed.macroState,
    inflationExpectation: 0.11,
    businessConfidence: 32,
    consumerConfidence: 30,
  };
  stressed.creditConditions = {
    ...stressed.creditConditions,
    defaultRate: 0.13,
    householdCreditTightness: 0.86,
  };
  stressed.economicCycle = 'downturn';

  const calmGold = priced('gold', calm);
  const stressedGold = priced('gold', stressed);
  if (stressedGold <= calmGold + 0.035) {
    throw new Error(`黄金没有体现通胀和避险需求: calm=${calmGold}, stressed=${stressedGold}`);
  }
}

function assertDepositsFollowPolicyRateAndOpportunityCost(): void {
  const state = createState();
  const lowRate = withRates(clone(state.market), 0.012);
  lowRate.inflationRate = 0.012;

  const highRate = withRates(clone(state.market), 0.062);
  highRate.inflationRate = 0.018;

  const highInflation = withRates(clone(state.market), 0.062);
  highInflation.inflationRate = 0.14;

  const lowDeposit = priced('deposit', lowRate);
  const highDeposit = priced('deposit', highRate);
  const highInflationDeposit = priced('deposit', highInflation);

  if (highDeposit <= lowDeposit) {
    throw new Error(`存款没有跟随政策利率上升: low=${lowDeposit}, high=${highDeposit}`);
  }
  if (highInflationDeposit >= highDeposit) {
    throw new Error(`高通胀没有压低存款实际吸引力: normal=${highDeposit}, inflation=${highInflationDeposit}`);
  }
}

assertStocksUseEarningsAndDiscountRate();
assertBondsBalanceRatesAndCreditRisk();
assertGoldUsesInflationAndSafeHavenDemand();
assertDepositsFollowPolicyRateAndOpportunityCost();

console.log('Asset pricing passed: stocks use earnings/discount rates, bonds balance rates/default risk, gold uses inflation/safe haven demand, and deposits follow policy rates.');
