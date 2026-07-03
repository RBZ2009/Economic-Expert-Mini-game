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
  const supplyPressure = Math.max(0.45, Math.min(1.35, availableDemand / Math.max(1, sd.supply)));
  const qualityFactor = 0.8 + company.productQuality / 100;
  const reputationFactor = 0.75 + company.reputation / 160;
  const priceFactor = Math.pow(prodConfig.baseSellingPrice / Math.max(1, pricePerUnit), prodConfig.demandElasticity);
  const demandAtPrice = Math.floor(
    availableDemand
      * prodConfig.marketDemand
      * supplyPressure
      * qualityFactor
      * reputationFactor
      * priceFactor
  );
  return Math.max(0, Math.min(quantity, demandAtPrice));
}
