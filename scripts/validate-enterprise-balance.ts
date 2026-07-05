import { estimateProductSales, findBestSaleOption, getReputationDemandFactor } from '../src/components/game/company-helpers';
import {
  getCompanyCapacityUnits,
  getEstimatedUnitVariableCost,
  getMaterialUnitPrice,
  getMaxProductionByCapacity,
} from '../src/game/company-economics';
import { createInitialGameState } from '../src/game/initial-state';
import {
  Company,
  ECONOMY_BALANCE,
  PRODUCTION_CONFIGS,
  ProductionGoodType,
} from '../src/types/game';

const productionGoods = Object.keys(PRODUCTION_CONFIGS) as ProductionGoodType[];

function createCompany(productType: ProductionGoodType, employees: number, machines: number): Company {
  return {
    id: `balance_${productType}`,
    ownerId: 'entrepreneur',
    name: '企业平衡校验企业',
    employees,
    machines,
    rawMaterials: 5000,
    inventory: 1500,
    productInventory: {
      daily_necessities: productType === 'daily_necessities' ? 1500 : 0,
      food: productType === 'food' ? 1500 : 0,
      entertainment: productType === 'entertainment' ? 1500 : 0,
      luxury: productType === 'luxury' ? 1500 : 0,
    },
    productionCapacity: 0,
    productionCost: ECONOMY_BALANCE.company.wagePerEmployee,
    productQuality: 70,
    revenue: 0,
    costs: 0,
    profit: 0,
    marketShare: 10,
    stockPrice: 100,
    fixedCosts: 0,
    depreciation: 0,
    financingCosts: 0,
    inventoryHoldingCost: 0,
    industry: productType,
    cashFlow: {
      initial: 60000,
      income: 0,
      expenses: 0,
      final: 60000,
      wages: 0,
      productionCosts: 0,
      otherCosts: 0,
    },
    balanceSheet: {
      cash: 60000,
      debt: 0,
      equity: 60000,
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
    efficiency: 78,
    morale: 74,
    reputation: 68,
    productionType: productType,
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
  };
}

function assertEmployeeCapacityValue(): void {
  const state = createInitialGameState([
    { id: 'entrepreneur', name: '企业家', color: '#16a34a', profession: 'entrepreneur' },
  ], 'professional');
  const failures: string[] = [];

  (['food', 'daily_necessities'] as ProductionGoodType[]).forEach(productType => {
    const company = createCompany(productType, 1, 0);
    const config = PRODUCTION_CONFIGS[productType];
    const capacityUnits = getCompanyCapacityUnits(company);
    const producible = getMaxProductionByCapacity(capacityUnits, 0, productType);
    const best = findBestSaleOption(state.market, company, productType, producible);
    const unitCost = getEstimatedUnitVariableCost(productType, company, producible, state.market);
    const contribution = best.sold * Math.max(0, best.price - unitCost);
    const wage = company.productionCost || ECONOMY_BALANCE.company.wagePerEmployee;
    if (contribution < wage * 1.5) {
      failures.push(`${config.name} 单名员工产能贡献 ${Math.round(contribution)} 未达到工资 ${wage} 的 1.5 倍`);
    }
  });

  if (failures.length > 0) {
    throw new Error(`Employee capacity validation failed:\n${failures.map(item => `- ${item}`).join('\n')}`);
  }
}

function assertMaterialScaleCurve(): void {
  const state = createInitialGameState([
    { id: 'entrepreneur', name: '企业家', color: '#16a34a', profession: 'entrepreneur' },
  ], 'professional');
  const company = createCompany('food', 6, 3);
  const small = getMaterialUnitPrice(60, company, state.market);
  const efficient = getMaterialUnitPrice(420, company, state.market);
  const oversized = getMaterialUnitPrice(1800, company, state.market);

  if (efficient >= small) {
    throw new Error(`Material scale validation failed: 中等采购单价 ${efficient} 未低于小批量 ${small}`);
  }
  if (oversized <= efficient) {
    throw new Error(`Material scale validation failed: 超大采购单价 ${oversized} 未体现规模不经济，高于中等采购 ${efficient} 才合理`);
  }
}

function assertReputationDemandCurve(): void {
  const low = getReputationDemandFactor(0);
  const mid = getReputationDemandFactor(50);
  const high = getReputationDemandFactor(100);

  if (Math.abs(high - 2) > 0.02) {
    throw new Error(`Reputation curve validation failed: 声誉 100 的需求系数应约为 2.0，当前为 ${high.toFixed(2)}`);
  }
  if (mid <= low || high <= mid) {
    throw new Error(`Reputation curve validation failed: 需求系数未随声誉单调提升（0=${low.toFixed(2)}, 50=${mid.toFixed(2)}, 100=${high.toFixed(2)}）`);
  }

  const state = createInitialGameState([
    { id: 'entrepreneur', name: '企业家', color: '#16a34a', profession: 'entrepreneur' },
  ], 'professional');
  const lowRepCompany = { ...createCompany('food', 6, 3), reputation: 0 };
  const highRepCompany = { ...lowRepCompany, reputation: 100 };
  const quantity = 9000;
  const marketPrice = state.market.goods.food.currentPrice || PRODUCTION_CONFIGS.food.baseSellingPrice;
  const lowSales = estimateProductSales(state.market, lowRepCompany, 'food', quantity, marketPrice);
  const highSales = estimateProductSales(state.market, highRepCompany, 'food', quantity, marketPrice);

  if (highSales <= lowSales * 2.1) {
    throw new Error(`Reputation curve validation failed: 满声誉销量 ${highSales} 未明显高于低声誉 ${lowSales}`);
  }
}

function assertBadPricingIsPunished(): void {
  const state = createInitialGameState([
    { id: 'entrepreneur', name: '企业家', color: '#16a34a', profession: 'entrepreneur' },
  ], 'professional');
  const failures: string[] = [];

  productionGoods.forEach(productType => {
    const company = createCompany(productType, 6, 3);
    const config = PRODUCTION_CONFIGS[productType];
    const quantity = company.productInventory?.[productType] ?? company.inventory;
    const best = findBestSaleOption(state.market, company, productType, quantity);
    const highSold = estimateProductSales(state.market, company, productType, quantity, config.maxSellingPrice);
    const highUnitCost = getEstimatedUnitVariableCost(productType, company, quantity, state.market);
    const highProfit = highSold * Math.max(0, config.maxSellingPrice - highUnitCost);

    if (highProfit > best.netRevenue * 0.65) {
      failures.push(`${config.name} 最高价利润 ${Math.round(highProfit)} 仍过于接近合理定价 ${best.netRevenue}`);
    }
  });

  if (failures.length > 0) {
    throw new Error(`Bad pricing validation failed:\n${failures.map(item => `- ${item}`).join('\n')}`);
  }
}

assertEmployeeCapacityValue();
assertMaterialScaleCurve();
assertReputationDemandCurve();
assertBadPricingIsPunished();
console.log('Enterprise balance passed: employee capacity covers wages, materials show scale curve, reputation can reach 2.0x demand, and bad high-price strategy is punished.');
