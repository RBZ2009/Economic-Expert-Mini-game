import { createInitialGameState } from '../src/game/initial-state';
import {
  calculateAssetReturnMultiplier,
  deriveCreditConditions,
  evaluateLoanApplication,
} from '../src/game/market';
import {
  Company,
  ECONOMY_BALANCE,
  GameState,
  Market,
  LoanType,
  Player,
} from '../src/types/game';

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

function createBank(overrides: Partial<NonNullable<Market['bank']>> = {}): NonNullable<Market['bank']> {
  const baseRate = Number(ECONOMY_BALANCE.bank.baseRate);
  return {
    centralBankRate: baseRate,
    depositRate: Math.max(0, baseRate + ECONOMY_BALANCE.bank.depositRateSpread),
    consumerLoanRate: baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.consumer,
    mortgageRate: baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.mortgage,
    businessLoanRate: baseRate + ECONOMY_BALANCE.bank.loanRiskSpread.business,
    defaultedLoans: 0,
    ...overrides,
  };
}

function createCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'company_credit_test',
    ownerId: 'entrepreneur',
    name: '信贷测试企业',
    employees: 5,
    machines: 3,
    rawMaterials: 1000,
    inventory: 300,
    productInventory: {
      daily_necessities: 0,
      food: 300,
      entertainment: 0,
      luxury: 0,
    },
    productionCapacity: 0,
    productionCost: ECONOMY_BALANCE.company.wagePerEmployee,
    productQuality: 70,
    revenue: 0,
    costs: 0,
    profit: 0,
    marketShare: 12,
    stockPrice: 100,
    fixedCosts: 0,
    depreciation: 0,
    financingCosts: 0,
    inventoryHoldingCost: 0,
    industry: 'food',
    cashFlow: {
      initial: 70000,
      income: 85000,
      expenses: 46000,
      final: 109000,
      wages: 15000,
      productionCosts: 23000,
      otherCosts: 8000,
    },
    balanceSheet: {
      cash: 70000,
      debt: 25000,
      equity: 140000,
      inventoryValue: 16000,
      retainedEarnings: 22000,
    },
    incomeStatement: {
      revenue: 85000,
      cogs: 38000,
      grossProfit: 47000,
      operatingProfit: 31000,
      netProfit: 26000,
      taxes: 3000,
      interestExpense: 2000,
    },
    efficiency: 78,
    morale: 76,
    reputation: 70,
    productionType: 'food',
    autoProduction: {
      enabled: false,
      monthlyTarget: 0,
    },
    stats: {
      totalProduced: 0,
      totalSold: 0,
      totalRevenue: 0,
      totalCosts: 0,
      monthlyProfit: 26000,
    },
    productionUsedThisRound: 0,
    ...overrides,
  };
}

function withPlayer(base: Player, overrides: Partial<Player>): Player {
  return {
    ...base,
    ...overrides,
  };
}

function assertCreditTightensAfterBadDebt(): void {
  const state = createState();
  const calmMarket = clone(state.market);
  calmMarket.bank = createBank({ ...(calmMarket.bank ?? {}), defaultedLoans: 0 });
  calmMarket.creditConditions = deriveCreditConditions(calmMarket);

  const stressedMarket = clone(state.market);
  stressedMarket.bank = createBank({ ...(stressedMarket.bank ?? {}), defaultedLoans: 12 });
  stressedMarket.inflationRate += 0.04;
  stressedMarket.macroState = {
    ...stressedMarket.macroState,
    unemploymentPressure: 0.55,
    consumerConfidence: 42,
    businessConfidence: 38,
  };
  stressedMarket.creditConditions = deriveCreditConditions(stressedMarket);

  const failures: string[] = [];
  if (stressedMarket.creditConditions.consumerApprovalRate! >= calmMarket.creditConditions.consumerApprovalRate!) {
    failures.push('坏账上升后消费贷审批率没有下降');
  }
  if (stressedMarket.creditConditions.businessApprovalRate! >= calmMarket.creditConditions.businessApprovalRate!) {
    failures.push('坏账上升后企业贷审批率没有下降');
  }
  if (stressedMarket.creditConditions.mortgageApprovalRate >= calmMarket.creditConditions.mortgageApprovalRate) {
    failures.push('坏账上升后房贷审批率没有下降');
  }
  if (stressedMarket.creditConditions.collateralHaircut! <= calmMarket.creditConditions.collateralHaircut!) {
    failures.push('坏账上升后抵押折扣没有上升');
  }
  if (stressedMarket.creditConditions.riskPremium! <= calmMarket.creditConditions.riskPremium!) {
    failures.push('坏账上升后风险溢价没有上升');
  }

  if (failures.length > 0) throw new Error(`Credit tightening validation failed:\n${failures.map(item => `- ${item}`).join('\n')}`);
}

function assertLoanUnderwritingDifferentiatesRisk(): void {
  const state = createState();
  const market = {
    ...state.market,
    creditConditions: deriveCreditConditions(state.market),
  };
  const baseEntrepreneur = state.players.find(player => player.profession === 'entrepreneur')!;
  const strongBusiness = withPlayer(baseEntrepreneur, {
    cash: 70000,
    creditScore: 82,
    company: createCompany(),
    loans: [],
  });
  const weakBusiness = withPlayer(baseEntrepreneur, {
    cash: -2000,
    creditScore: 42,
    company: createCompany({
      cashFlow: {
        initial: 12000,
        income: 12000,
        expenses: 36000,
        final: -12000,
        wages: 16000,
        productionCosts: 15000,
        otherCosts: 5000,
      },
      balanceSheet: {
        cash: -12000,
        debt: 190000,
        equity: 8000,
        inventoryValue: 4000,
        retainedEarnings: -25000,
      },
      stats: {
        totalProduced: 0,
        totalSold: 0,
        totalRevenue: 0,
        totalCosts: 0,
        monthlyProfit: -25000,
      },
    }),
    loans: [{ id: 'old_bad_debt', type: 'business', principal: 180000, remaining: 180000, monthlyRate: 0.02, createdRound: 1 }],
  });

  const strongLoan = evaluateLoanApplication(strongBusiness, 'business', 90000, market);
  const weakLoan = evaluateLoanApplication(weakBusiness, 'business', 90000, market);
  if (!strongLoan.approved) throw new Error(`强企业贷款被拒绝: ${strongLoan.reason}`);
  if (weakLoan.approved || (weakLoan.maxAmount ?? 0) >= (strongLoan.maxAmount ?? 0)) {
    throw new Error('弱企业没有因为现金流、杠杆和信用历史而被明显限制');
  }
}

function assertLoanTypesBehaveDifferently(): void {
  const state = createState();
  const market = {
    ...state.market,
    creditConditions: deriveCreditConditions(state.market),
  };
  const worker = state.players.find(player => player.profession === 'worker')!;
  const renter = withPlayer(worker, {
    cash: 18000,
    creditScore: 72,
    housingStatus: 'renting',
    housingTier: 'standard',
  });
  const homeowner = withPlayer(worker, {
    cash: 18000,
    creditScore: 72,
    housingStatus: 'owned',
    housingTier: 'standard',
  });

  const checks: Record<LoanType, ReturnType<typeof evaluateLoanApplication>> = {
    consumer: evaluateLoanApplication(renter, 'consumer', 40000, market),
    mortgage: evaluateLoanApplication(homeowner, 'mortgage', 120000, market),
    business: evaluateLoanApplication(withPlayer(renter, { company: createCompany() }), 'business', 120000, market),
  };

  if (!checks.consumer.approved) throw new Error('正常信用消费贷应可获批');
  if (!checks.mortgage.approved) throw new Error('有房产抵押的房贷应可获批');
  if (!checks.business.approved) throw new Error('有企业和抵押资产的企业贷应可获批');

  const renterMortgage = evaluateLoanApplication(renter, 'mortgage', 120000, market);
  if (renterMortgage.approved) throw new Error('无房产抵押者不应通过同等房贷审批');
  if ((checks.business.maxAmount ?? 0) <= (checks.consumer.maxAmount ?? 0)) {
    throw new Error('企业贷额度应高于消费贷额度');
  }
}

function assertAssetPricingUsesCreditAndRates(): void {
  const state = createState();
  const normalMarket = {
    ...state.market,
    bank: createBank({ ...(state.market.bank ?? {}), centralBankRate: Number(ECONOMY_BALANCE.bank.baseRate) }),
    creditConditions: deriveCreditConditions(state.market),
  };
  const highRateMarket = clone(normalMarket);
  highRateMarket.bank = {
    ...highRateMarket.bank,
    centralBankRate: Number(ECONOMY_BALANCE.bank.baseRate) + 0.018,
    depositRate: Number(ECONOMY_BALANCE.bank.baseRate) + 0.012,
  };
  highRateMarket.creditConditions = {
    ...highRateMarket.creditConditions,
    defaultRate: normalMarket.creditConditions.defaultRate,
    businessCreditTightness: Math.min(0.97, normalMarket.creditConditions.businessCreditTightness + 0.08),
  };

  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const normalBond = calculateAssetReturnMultiplier('bond', normalMarket);
    const highRateBond = calculateAssetReturnMultiplier('bond', highRateMarket);
    const normalStock = calculateAssetReturnMultiplier('stock', normalMarket);
    const highRateStock = calculateAssetReturnMultiplier('stock', highRateMarket);
    const highRateDeposit = calculateAssetReturnMultiplier('deposit', highRateMarket);
    if (highRateBond <= normalBond) throw new Error('利率上升后债券票息吸引力没有提高');
    if (highRateStock >= normalStock) throw new Error('利率和信贷压力上升后股票估值没有承压');
    if (highRateDeposit <= 1) throw new Error('高利率环境下存款收益没有体现');
  } finally {
    Math.random = originalRandom;
  }
}

assertCreditTightensAfterBadDebt();
assertLoanUnderwritingDifferentiatesRisk();
assertLoanTypesBehaveDifferently();
assertAssetPricingUsesCreditAndRates();
console.log('Credit system passed: bad debt tightens credit, underwriting differentiates risk, loan types differ, and rates feed asset pricing.');
