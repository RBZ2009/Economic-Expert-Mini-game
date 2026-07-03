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
  const scaleDiscount = Math.min(0.28, capacityUnits / 1800);
  const bulkDiscount = Math.min(0.16, Math.log10(Math.max(1, quantity)) * 0.08);
  const overExpansionPressure = capacityUnits > 900 ? Math.min(0.35, (capacityUnits - 900) / 2400) : 0;
  const oversizeOrderPressure = quantity > 320 ? Math.min(0.3, (quantity - 320) / 1200) : 0;
  return Math.max(6, Math.round(basePrice * (1 - scaleDiscount - bulkDiscount + overExpansionPressure + oversizeOrderPressure) * 100) / 100);
}

export function getMaterialPurchaseCost(quantity: number, company: Company): number {
  return Math.round(getMaterialUnitPrice(quantity, company) * quantity);
}

export function getEstimatedUnitVariableCost(productType: ProductionGoodType, company: Company, materialOrderQuantity = 100): number {
  const config = PRODUCTION_CONFIGS[productType];
  return getUnitProcessingCost(productType) + config.materialConsumption * getMaterialUnitPrice(materialOrderQuantity, company);
}
