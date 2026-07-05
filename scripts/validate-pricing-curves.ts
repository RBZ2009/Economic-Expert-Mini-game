import { estimateProductSales, findBestSaleOption } from '../src/components/game/company-helpers';
import { getEstimatedUnitVariableCost } from '../src/game/company-economics';
import { createInitialGameState } from '../src/game/initial-state';
import {
  Company,
  PRODUCTION_CONFIGS,
  ProductionGoodType,
} from '../src/types/game';

type PricingPoint = {
  price: number;
  sold: number;
  unitCost: number;
  profit: number;
};

type PricingSummary = {
  product: string;
  marketPrice: number;
  lowPrice: PricingPoint;
  marketPricePoint: PricingPoint;
  highPrice: PricingPoint;
  bestPrice: PricingPoint;
};

const productionGoods = Object.keys(PRODUCTION_CONFIGS) as ProductionGoodType[];

function createCompany(productType: ProductionGoodType): Company {
  return {
    id: `pricing_company_${productType}`,
    name: '定价校验企业',
    ownerId: 'entrepreneur',
    employees: 6,
    machines: 3,
    productQuality: 72,
    reputation: 68,
    productionType: productType,
    autoProduction: {
      enabled: false,
      monthlyTarget: 0,
    },
    industry: productType,
    productionCost: 3600,
    inventory: 1200,
    productInventory: {
      daily_necessities: productType === 'daily_necessities' ? 1200 : 0,
      food: productType === 'food' ? 1200 : 0,
      entertainment: productType === 'entertainment' ? 1200 : 0,
      luxury: productType === 'luxury' ? 1200 : 0,
    },
    rawMaterials: 1800,
    revenue: 0,
    costs: 0,
    profit: 0,
    marketShare: 12,
    stockPrice: 100,
    fixedCosts: 1800,
    depreciation: 600,
    financingCosts: 0,
    inventoryHoldingCost: 0,
    balanceSheet: {
      cash: 70000,
      debt: 15000,
      equity: 105000,
      inventoryValue: 18000,
      retainedEarnings: 0,
    },
    productionCapacity: 360,
    efficiency: 82,
    morale: 74,
    incomeStatement: {
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      operatingProfit: 0,
      netProfit: 0,
      taxes: 0,
      interestExpense: 0,
    },
    cashFlow: {
      initial: 70000,
      income: 0,
      expenses: 0,
      wages: 0,
      productionCosts: 0,
      otherCosts: 0,
      final: 70000,
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

function pointForPrice(productType: ProductionGoodType, price: number): PricingPoint {
  const state = createInitialGameState([
    { id: 'entrepreneur', name: '企业家', color: '#16a34a', profession: 'entrepreneur' },
  ], 'professional');
  const company = createCompany(productType);
  const quantity = company.productInventory?.[productType] ?? company.inventory;
  const sold = estimateProductSales(state.market, company, productType, quantity, price);
  const unitCost = getEstimatedUnitVariableCost(productType, company, quantity, state.market);
  return {
    price,
    sold,
    unitCost: Math.round(unitCost * 100) / 100,
    profit: Math.round(sold * (price - unitCost)),
  };
}

function summarizeProduct(productType: ProductionGoodType): PricingSummary {
  const state = createInitialGameState([
    { id: 'entrepreneur', name: '企业家', color: '#16a34a', profession: 'entrepreneur' },
  ], 'professional');
  const company = createCompany(productType);
  const config = PRODUCTION_CONFIGS[productType];
  const visibleMarketPrice = state.market.goods[productType].currentPrice || config.baseSellingPrice;
  const marketPrice = Math.round(
    visibleMarketPrice >= config.baseSellingPrice * 0.85 && visibleMarketPrice <= config.baseSellingPrice * 3.2
      ? visibleMarketPrice
      : config.baseSellingPrice,
  );
  const quantity = company.productInventory?.[productType] ?? company.inventory;
  const best = findBestSaleOption(state.market, company, productType, quantity);
  const bestPoint = pointForPrice(productType, best.price);
  const lowPrice = pointForPrice(productType, config.minSellingPrice);
  const marketPricePoint = pointForPrice(productType, marketPrice);
  const highPrice = pointForPrice(productType, config.maxSellingPrice);
  return {
    product: config.name,
    marketPrice,
    lowPrice,
    marketPricePoint,
    highPrice,
    bestPrice: bestPoint,
  };
}

function assertPricingCurves(summaries: PricingSummary[]): void {
  const failures: string[] = [];

  summaries.forEach(summary => {
    const config = Object.values(PRODUCTION_CONFIGS).find(item => item.name === summary.product);
    if (!config) return;
    const priceDistance = Math.abs(summary.bestPrice.price - summary.marketPrice) / Math.max(1, summary.marketPrice);
    if (priceDistance > 0.38) {
      failures.push(`${summary.product} 最优价 ${summary.bestPrice.price} 距离市场价 ${summary.marketPrice} 过远`);
    }
    if (summary.highPrice.price === summary.bestPrice.price) {
      failures.push(`${summary.product} 最高价仍是最优价`);
    }
    if (summary.highPrice.sold >= summary.marketPricePoint.sold) {
      failures.push(`${summary.product} 高价销量没有低于市场价销量`);
    }
    if (summary.lowPrice.sold < summary.marketPricePoint.sold * 0.82) {
      failures.push(`${summary.product} 低价销量下降过多，不符合促销直觉`);
    }
    if (summary.bestPrice.profit <= 0) {
      failures.push(`${summary.product} 最优定价仍无法盈利`);
    }
  });

  const food = summaries.find(item => item.product === PRODUCTION_CONFIGS.food.name);
  const luxury = summaries.find(item => item.product === PRODUCTION_CONFIGS.luxury.name);
  if (food && luxury) {
    const foodDemandDrop = 1 - food.highPrice.sold / Math.max(1, food.marketPricePoint.sold);
    const luxuryDemandDrop = 1 - luxury.highPrice.sold / Math.max(1, luxury.marketPricePoint.sold);
    if (luxuryDemandDrop <= foodDemandDrop) {
      failures.push('奢侈品高价需求下降幅度应高于食品');
    }
  }

  if (failures.length > 0) {
    throw new Error(`Pricing validation failed:\n${failures.map(item => `- ${item}`).join('\n')}`);
  }
}

const summaries = productionGoods.map(summarizeProduct);
console.table(summaries.map(summary => ({
  product: summary.product,
  marketPrice: summary.marketPrice,
  low: `${summary.lowPrice.price}/${summary.lowPrice.sold}/${summary.lowPrice.profit}`,
  market: `${summary.marketPricePoint.price}/${summary.marketPricePoint.sold}/${summary.marketPricePoint.profit}`,
  high: `${summary.highPrice.price}/${summary.highPrice.sold}/${summary.highPrice.profit}`,
  best: `${summary.bestPrice.price}/${summary.bestPrice.sold}/${summary.bestPrice.profit}`,
})));
assertPricingCurves(summaries);
console.log('Pricing curves passed: market-near pricing beats naive extremes and high prices reduce demand.');
