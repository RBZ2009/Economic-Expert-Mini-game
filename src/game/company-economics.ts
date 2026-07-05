import { Market, Company, ECONOMY_BALANCE, PRODUCTION_CONFIGS, ProductionGoodType } from '@/types/game';
import { getIndustrySupplyChainPressure } from '@/game/market';

const DEFAULT_EXTERNAL_SECTOR = {
  importCostIndex: 100,
  exportDemandIndex: 100,
  logisticsStress: 1,
  energyPriceIndex: 100,
  tradeBalance: 0,
};

export function getCompanyCapacityUnits(company: Company): number {
  return company.employees * ECONOMY_BALANCE.company.employeeCapacity
    + company.machines * ECONOMY_BALANCE.company.machineCapacity;
}

export function getEffectiveCapacityUnits(company: Company, productivityBonus = 0): number {
  const moraleFactor = 0.75 + company.morale / 200;
  return Math.floor(getCompanyCapacityUnits(company) * moraleFactor * (1 + productivityBonus));
}

export function getProductCapacityCost(productType: ProductionGoodType): number {
  return PRODUCTION_CONFIGS[productType].capacityCost;
}

export function getMaxProductionByCapacity(capacityUnits: number, usedCapacityUnits: number, productType: ProductionGoodType): number {
  const remainingCapacity = Math.max(0, capacityUnits - usedCapacityUnits);
  return Math.floor(remainingCapacity / getProductCapacityCost(productType));
}

export function getProductionCapacityUsage(productType: ProductionGoodType, quantity: number): number {
  return Math.ceil(quantity * getProductCapacityCost(productType));
}

export function getUnitProcessingCost(productType: ProductionGoodType): number {
  return PRODUCTION_CONFIGS[productType].baseProductionCost;
}

export function getProcessingCost(productType: ProductionGoodType, quantity: number): number {
  return Math.round(getUnitProcessingCost(productType) * quantity);
}

export function getSupplyChainOverheadCost(
  productType: ProductionGoodType,
  quantity: number,
  market?: Market,
): number {
  const config = PRODUCTION_CONFIGS[productType];
  const externalSector = market?.externalSector ?? DEFAULT_EXTERNAL_SECTOR;
  const input = config.supplyChain;
  const supplyChain = market?.supplyChain;
  const layers = supplyChain?.layers;
  const industryPressure = market ? getIndustrySupplyChainPressure(market, productType) : 0;
  const packagingLogistics = (2.4 + externalSector.logisticsStress * 2.1 + ((layers?.packagingLogistics.priceIndex ?? 100) - 100) / 55) * input.packagingLogistics;
  const energy = (2.1 + (externalSector.energyPriceIndex - 100) / 45 + ((layers?.energy.priceIndex ?? 100) - 100) / 65) * input.energy;
  const intermediateGoods = (1.6 + (externalSector.importCostIndex - 100) / 70 + ((layers?.intermediateGoods.priceIndex ?? 100) - 100) / 70) * input.intermediateGoods;
  const importExposure = (1.2 + externalSector.tradeBalance / 900) * input.importExposure;
  return Math.round(quantity * Math.max(0.45, packagingLogistics + energy + intermediateGoods + importExposure) * (1 + industryPressure * 0.55));
}

export function getMaterialUnitPrice(quantity: number, company: Company, market?: Market): number {
  const basePrice = ECONOMY_BALANCE.company.materialPrice;
  const capacityUnits = getCompanyCapacityUnits(company);
  const externalSector = market?.externalSector ?? DEFAULT_EXTERNAL_SECTOR;
  const productSupplyChain = PRODUCTION_CONFIGS[company.productionType].supplyChain;
  const scaleEfficiency = capacityUnits <= 900
    ? Math.min(0.22, capacityUnits / 4200)
    : Math.max(0.08, 0.22 - (capacityUnits - 900) / 9000);
  const bulkDiscount = Math.min(0.12, Math.log10(Math.max(1, quantity)) * 0.055);
  const optimalOrder = Math.max(180, capacityUnits * 0.28);
  const overExpansionPressure = capacityUnits > 1200 ? Math.min(0.18, (capacityUnits - 1200) / 2600) : 0;
  const oversizeOrderPressure = quantity > optimalOrder
    ? Math.min(0.34, ((quantity - optimalOrder) / Math.max(220, optimalOrder)) * 0.42)
    : 0;
  const undersizedOrderPenalty = quantity < optimalOrder * 0.35
    ? Math.min(0.08, ((optimalOrder * 0.35 - quantity) / Math.max(80, optimalOrder)) * 0.25)
    : 0;
  const importPressure = (externalSector.importCostIndex - 100) / 260;
  const logisticsPressure = (externalSector.logisticsStress - 1) * 0.12;
  const energyPressure = (externalSector.energyPriceIndex - 100) / 420;
  const supplyChain = market?.supplyChain;
  const basicMaterialPressure = ((supplyChain?.layers.basicMaterials.priceIndex ?? 100) - 100) / 180
    + (supplyChain?.layers.basicMaterials.shortage ?? 0) * 0.18;
  const chainExposure = productSupplyChain.rawMaterials * importPressure
    + productSupplyChain.packagingLogistics * logisticsPressure
    + productSupplyChain.energy * energyPressure
    + productSupplyChain.rawMaterials * basicMaterialPressure
    + (market ? getIndustrySupplyChainPressure(market, company.productionType) * 0.35 : 0);

  return Math.max(
    6,
    Math.round(
      basePrice * (1 - scaleEfficiency - bulkDiscount + overExpansionPressure + oversizeOrderPressure + undersizedOrderPenalty + chainExposure) * 100,
    ) / 100,
  );
}

export function getMaterialPurchaseCost(quantity: number, company: Company, market?: Market): number {
  return Math.round(getMaterialUnitPrice(quantity, company, market) * quantity);
}

export function getEstimatedUnitVariableCost(productType: ProductionGoodType, company: Company, materialOrderQuantity = 100, market?: Market): number {
  const config = PRODUCTION_CONFIGS[productType];
  return getUnitProcessingCost(productType)
    + config.materialConsumption * getMaterialUnitPrice(materialOrderQuantity, company, market)
    + getSupplyChainOverheadCost(productType, Math.max(1, Math.round(materialOrderQuantity / Math.max(0.5, config.materialConsumption))), market) / Math.max(1, Math.round(materialOrderQuantity / Math.max(0.5, config.materialConsumption)));
}

export function getCompanyFixedCosts(company: Company): number {
  return Math.round(1200 + company.machines * 220 + company.employees * 45);
}

export function getCompanyDepreciation(company: Company): number {
  return Math.round(company.machines * 160);
}

export function getCompanyInventoryHoldingCost(company: Company): number {
  return Math.round(company.inventory * 1.4);
}

export function updateCompanyFinanceSnapshot(company: Company, debt = 0): Company {
  const fixedCosts = getCompanyFixedCosts(company);
  const depreciation = getCompanyDepreciation(company);
  const inventoryHoldingCost = getCompanyInventoryHoldingCost(company);
  return {
    ...company,
    fixedCosts,
    depreciation,
    inventoryHoldingCost,
    balanceSheet: {
      ...company.balanceSheet,
      cash: company.cashFlow.final,
      debt,
      equity: Math.max(0, company.cashFlow.final + company.inventory * getUnitProcessingCost(company.productionType) - debt),
      inventoryValue: company.inventory * getUnitProcessingCost(company.productionType),
      retainedEarnings: company.profit,
    },
  };
}
