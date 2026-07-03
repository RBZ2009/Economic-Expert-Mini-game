import {
  Company,
  Market,
  ProductionGoodType,
  PRODUCTION_CONFIGS,
} from '@/types/game';

export const productionGoodTypes = Object.keys(PRODUCTION_CONFIGS) as ProductionGoodType[];

export function emptyProductInventory(): Record<ProductionGoodType, number> {
  return {
    daily_necessities: 0,
    food: 0,
    entertainment: 0,
    luxury: 0,
  };
}

export function getProductInventory(company: Company): Record<ProductionGoodType, number> {
  return {
    ...emptyProductInventory(),
    ...(company.productInventory ?? {
      [company.productionType]: company.inventory,
    }),
  };
}

export function estimateProductSales(
  market: Market,
  company: Company,
  productType: ProductionGoodType,
  quantity: number,
  pricePerUnit: number,
): number {
  const prodConfig = PRODUCTION_CONFIGS[productType];
  const sd = market.supplyDemand[productType];
  const availableDemand = Math.max(0, sd.demand);
  const supplyPressure = Math.max(0.55, Math.min(1.45, availableDemand / Math.max(1, sd.supply)));
  const qualityFactor = 0.84 + company.productQuality / 120;
  const reputationFactor = 0.8 + company.reputation / 180;
  const marketPrice = Math.max(prodConfig.minSellingPrice, Math.min(prodConfig.maxSellingPrice, market.goods[productType].currentPrice || prodConfig.baseSellingPrice));
  const anchor = market.priceAnchors[productType];
  const priceRatioToMarket = Math.max(0.45, pricePerUnit / Math.max(1, marketPrice));
  const overpricingPenalty = priceRatioToMarket > 1
    ? Math.pow(1 / priceRatioToMarket, prodConfig.demandElasticity * 1.45)
    : 1;
  const underpricingPenalty = priceRatioToMarket < 1
    ? Math.max(0.82, 1 - (1 - priceRatioToMarket) * 0.22)
    : 1;
  const priceFactor = overpricingPenalty * underpricingPenalty;
  const marketAlignmentFactor = Math.max(0.78, 1 - Math.abs(pricePerUnit - marketPrice) / Math.max(30, marketPrice * 1.15) * 0.24);
  const cycleMultiplier = Math.max(0.75, Math.min(1.35, prodConfig.baseSellingPrice / Math.max(1, marketPrice)));
  const householdSupport = 0.88 + market.macroState.consumerConfidence / 170;
  const externalDemandSupport = 0.8 + market.macroState.externalDemandIndex / 240;
  const inventoryPenalty = Math.max(0.68, 1 - (anchor?.inventoryPressure ?? 0) * 0.22);
  const shortageBoost = 1 + (anchor?.shortageIndex ?? 0) * 0.18;
  const demandAtPrice = Math.floor(
    availableDemand
      * prodConfig.marketDemand
      * supplyPressure
      * qualityFactor
      * reputationFactor
      * priceFactor
      * marketAlignmentFactor
      * cycleMultiplier
      * householdSupport
      * externalDemandSupport
      * inventoryPenalty
      * shortageBoost
  );
  return Math.max(0, Math.min(quantity, demandAtPrice));
}

export function findBestSaleOption(
  market: Market,
  company: Company,
  productType: ProductionGoodType,
  quantity: number,
): { price: number; sold: number; netRevenue: number } {
  const config = PRODUCTION_CONFIGS[productType];
  let best = {
    price: config.baseSellingPrice,
    sold: estimateProductSales(market, company, productType, quantity, config.baseSellingPrice),
    netRevenue: 0,
  };

  for (let price = config.minSellingPrice; price <= config.maxSellingPrice; price += 1) {
    const sold = estimateProductSales(market, company, productType, quantity, price);
    const netRevenue = Math.floor(sold * price * (1 - 0.08));
    if (
      netRevenue > best.netRevenue
      || (netRevenue === best.netRevenue && Math.abs(price - config.baseSellingPrice) < Math.abs(best.price - config.baseSellingPrice))
    ) {
      best = { price, sold, netRevenue };
    }
  }

  return best;
}
