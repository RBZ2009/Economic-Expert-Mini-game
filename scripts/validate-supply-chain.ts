import {
  getEstimatedUnitVariableCost,
  getMaterialUnitPrice,
  getSupplyChainOverheadCost,
} from '../src/game/company-economics';
import { createInitialGameState } from '../src/game/initial-state';
import {
  deriveSupplyChainState,
  getIndustrySupplyChainPressure,
  updateMarketAnchors,
} from '../src/game/market';
import { Company, GameState, Market, ProductionGoodType } from '../src/types/game';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createState(): GameState {
  return createInitialGameState([
    { id: 'entrepreneur', name: '企业家', color: '#16a34a', profession: 'entrepreneur' },
  ], 'professional');
}

function createCompany(state: GameState, productType: ProductionGoodType): Company {
  const base = state.players.find(player => player.id === 'entrepreneur')!.company!;
  return {
    ...clone(base),
    productionType: productType,
    industry: productType,
    employees: 8,
    machines: 4,
    rawMaterials: 3000,
    inventory: 1200,
    productInventory: {
      daily_necessities: productType === 'daily_necessities' ? 1200 : 0,
      food: productType === 'food' ? 1200 : 0,
      entertainment: productType === 'entertainment' ? 1200 : 0,
      luxury: productType === 'luxury' ? 1200 : 0,
    },
  };
}

function assertSupplyChainLayersReactToExternalShocks(): void {
  const state = createState();
  const calm = clone(state.market);
  calm.supplyChain = deriveSupplyChainState(calm);

  const shocked = clone(state.market);
  shocked.externalSector = {
    ...shocked.externalSector,
    importCostIndex: 168,
    logisticsStress: 2.05,
    energyPriceIndex: 176,
    exportDemandIndex: 82,
  };
  shocked.creditConditions = {
    ...shocked.creditConditions,
    businessCreditTightness: 0.82,
  };
  shocked.supplyDemand.food = { supply: 520, demand: 2200 };
  shocked.supplyDemand.daily_necessities = { supply: 610, demand: 2100 };
  shocked.supplyChain = deriveSupplyChainState(shocked);

  const layerNames = ['basicMaterials', 'intermediateGoods', 'packagingLogistics', 'energy'] as const;
  const failures = layerNames.filter(layerName =>
    shocked.supplyChain.layers[layerName].priceIndex <= calm.supplyChain.layers[layerName].priceIndex,
  );

  if (failures.length > 0) {
    throw new Error(`外部冲击没有抬升这些供应链层级价格: ${failures.join(', ')}`);
  }
  if (shocked.supplyChain.layers.packagingLogistics.shortage <= calm.supplyChain.layers.packagingLogistics.shortage) {
    throw new Error('物流冲击没有形成包装/物流缺口');
  }
  if (shocked.supplyChain.layers.energy.costShock <= calm.supplyChain.layers.energy.costShock) {
    throw new Error('能源价格冲击没有形成能源成本冲击');
  }
}

function assertIndustryExposureDifferentiatesCosts(): void {
  const state = createState();
  const logisticsMarket = clone(state.market);
  logisticsMarket.supplyChain = {
    ...logisticsMarket.supplyChain,
    layers: {
      basicMaterials: { priceIndex: 104, availability: 0.86, shortage: 0.08, costShock: 0.02 },
      intermediateGoods: { priceIndex: 106, availability: 0.84, shortage: 0.09, costShock: 0.03 },
      packagingLogistics: { priceIndex: 188, availability: 0.48, shortage: 0.52, costShock: 0.48 },
      energy: { priceIndex: 108, availability: 0.82, shortage: 0.1, costShock: 0.04 },
    },
  };
  const energyMarket = clone(state.market);
  energyMarket.supplyChain = {
    ...energyMarket.supplyChain,
    layers: {
      basicMaterials: { priceIndex: 104, availability: 0.86, shortage: 0.08, costShock: 0.02 },
      intermediateGoods: { priceIndex: 106, availability: 0.84, shortage: 0.09, costShock: 0.03 },
      packagingLogistics: { priceIndex: 108, availability: 0.82, shortage: 0.1, costShock: 0.04 },
      energy: { priceIndex: 190, availability: 0.46, shortage: 0.54, costShock: 0.5 },
    },
  };
  const intermediateMarket = clone(state.market);
  intermediateMarket.supplyChain = {
    ...intermediateMarket.supplyChain,
    layers: {
      basicMaterials: { priceIndex: 104, availability: 0.86, shortage: 0.08, costShock: 0.02 },
      intermediateGoods: { priceIndex: 186, availability: 0.5, shortage: 0.5, costShock: 0.46 },
      packagingLogistics: { priceIndex: 108, availability: 0.82, shortage: 0.1, costShock: 0.04 },
      energy: { priceIndex: 110, availability: 0.82, shortage: 0.11, costShock: 0.05 },
    },
  };

  const logisticsFoodPressure = getIndustrySupplyChainPressure(logisticsMarket, 'food');
  const logisticsLuxuryPressure = getIndustrySupplyChainPressure(logisticsMarket, 'luxury');
  const energyLuxuryPressure = getIndustrySupplyChainPressure(energyMarket, 'luxury');
  const energyFoodPressure = getIndustrySupplyChainPressure(energyMarket, 'food');
  const intermediateEntertainmentPressure = getIndustrySupplyChainPressure(intermediateMarket, 'entertainment');
  const intermediateFoodPressure = getIndustrySupplyChainPressure(intermediateMarket, 'food');

  if (logisticsFoodPressure <= logisticsLuxuryPressure + 0.12) {
    throw new Error(`物流冲击没有更明显影响食品行业: food=${logisticsFoodPressure}, luxury=${logisticsLuxuryPressure}`);
  }
  if (energyLuxuryPressure <= energyFoodPressure + 0.09) {
    throw new Error(`能源冲击没有更明显影响高能源暴露行业: luxury=${energyLuxuryPressure}, food=${energyFoodPressure}`);
  }
  if (intermediateEntertainmentPressure <= intermediateFoodPressure + 0.16) {
    throw new Error(`中间品冲击没有更明显影响娱乐行业: entertainment=${intermediateEntertainmentPressure}, food=${intermediateFoodPressure}`);
  }

  const food = createCompany(state, 'food');
  const luxury = createCompany(state, 'luxury');
  const calmFoodCost = getEstimatedUnitVariableCost('food', food, 600, state.market);
  const stressedFoodCost = getEstimatedUnitVariableCost('food', food, 600, logisticsMarket);
  const calmLuxuryCost = getEstimatedUnitVariableCost('luxury', luxury, 600, state.market);
  const stressedLuxuryCost = getEstimatedUnitVariableCost('luxury', luxury, 600, energyMarket);

  if (stressedFoodCost <= calmFoodCost || stressedLuxuryCost <= calmLuxuryCost) {
    throw new Error(`供应链冲击没有传导到单位可变成本: food ${calmFoodCost}->${stressedFoodCost}, luxury ${calmLuxuryCost}->${stressedLuxuryCost}`);
  }
}

function assertUpstreamCostsReachTerminalPrices(): void {
  const state = createState();
  const calmMarket = updateMarketAnchors({
    ...clone(state.market),
    supplyChain: deriveSupplyChainState(state.market),
  });

  const shockedMarket: Market = clone(state.market);
  shockedMarket.externalSector = {
    ...shockedMarket.externalSector,
    importCostIndex: 172,
    logisticsStress: 2.2,
    energyPriceIndex: 184,
  };
  shockedMarket.creditConditions = {
    ...shockedMarket.creditConditions,
    businessCreditTightness: 0.84,
  };
  shockedMarket.supplyDemand.food = { supply: 520, demand: 2100 };
  shockedMarket.supplyDemand.daily_necessities = { supply: 580, demand: 2000 };
  shockedMarket.supplyChain = deriveSupplyChainState(shockedMarket);
  const shockedAnchors = updateMarketAnchors(shockedMarket);

  (['food', 'daily_necessities'] as ProductionGoodType[]).forEach(productType => {
    const calmPrice = calmMarket.priceAnchors[productType].referencePrice;
    const shockedPrice = shockedAnchors.priceAnchors[productType].referencePrice;
    if (shockedPrice <= calmPrice) {
      throw new Error(`${productType} 上游涨价没有传导到终端参考价: ${calmPrice}->${shockedPrice}`);
    }
  });

  const company = createCompany(state, 'daily_necessities');
  const calmMaterial = getMaterialUnitPrice(500, company, calmMarket);
  const shockedMaterial = getMaterialUnitPrice(500, company, shockedAnchors);
  const calmOverhead = getSupplyChainOverheadCost('daily_necessities', 500, calmMarket);
  const shockedOverhead = getSupplyChainOverheadCost('daily_necessities', 500, shockedAnchors);

  if (shockedMaterial <= calmMaterial || shockedOverhead <= calmOverhead) {
    throw new Error(`上游冲击没有同时进入原材料和供应链附加成本: material ${calmMaterial}->${shockedMaterial}, overhead ${calmOverhead}->${shockedOverhead}`);
  }
}

assertSupplyChainLayersReactToExternalShocks();
assertIndustryExposureDifferentiatesCosts();
assertUpstreamCostsReachTerminalPrices();

console.log('Supply chain passed: four layers react to shocks, industry exposure differentiates costs, and upstream pressure reaches company costs and terminal prices.');
