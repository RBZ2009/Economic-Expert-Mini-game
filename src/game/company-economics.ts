import { Company, ECONOMY_BALANCE, PRODUCTION_CONFIGS, ProductionGoodType } from '@/types/game';

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

export function getMaterialUnitPrice(quantity: number, company: Company): number {
  const basePrice = ECONOMY_BALANCE.company.materialPrice;
  const capacityUnits = getCompanyCapacityUnits(company);
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

  return Math.max(
    6,
    Math.round(
      basePrice * (1 - scaleEfficiency - bulkDiscount + overExpansionPressure + oversizeOrderPressure + undersizedOrderPenalty) * 100,
    ) / 100,
  );
}

export function getMaterialPurchaseCost(quantity: number, company: Company): number {
  return Math.round(getMaterialUnitPrice(quantity, company) * quantity);
}

export function getEstimatedUnitVariableCost(productType: ProductionGoodType, company: Company, materialOrderQuantity = 100): number {
  const config = PRODUCTION_CONFIGS[productType];
  return getUnitProcessingCost(productType) + config.materialConsumption * getMaterialUnitPrice(materialOrderQuantity, company);
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
