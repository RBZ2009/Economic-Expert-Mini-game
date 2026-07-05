import { findBestSaleOption, getProductInventory } from '../src/components/game/company-helpers';
import {
  getCompanyFixedCosts,
  getCompanyInventoryHoldingCost,
  getEffectiveCapacityUnits,
  getMaxProductionByCapacity,
  getMaterialPurchaseCost,
  getMaterialUnitPrice,
  getProcessingCost,
  getSupplyChainOverheadCost,
  updateCompanyFinanceSnapshot,
} from '../src/game/company-economics';
import { createInitialGameState } from '../src/game/initial-state';
import {
  calculateAssetReturnMultiplier,
  calculateHouseholdDemandBySegment,
  deriveCreditConditions,
  deriveEconomicCycle,
  deriveExternalSector,
  deriveGovernmentFeedback,
  deriveMacroState,
  deriveSupplyChainState,
  getBaselineMarketDemand,
  getNpcSupplyContribution,
  updateHouseholdsForMacro,
  updateMarketAnchors,
  updateNpcFirmsForMacro,
} from '../src/game/market';
import {
  ECONOMY_BALANCE,
  GameState,
  GoodType,
  Player,
  PRODUCTION_CONFIGS,
  ProductionGoodType,
} from '../src/types/game';

type RoundSnapshot = {
  round: number;
  cycle: string;
  entrepreneurCash: number;
  entrepreneurProfit: number;
  totalProduced: number;
  totalSold: number;
  inventory: number;
  gdp: number;
  inflation: number;
  avgPrice: number;
  creditTightness: number;
  importCost: number;
  exportDemand: number;
  govApproval: number;
};

function getTotalProductInventory(inventory: Record<ProductionGoodType, number>): number {
  return Object.values(inventory).reduce((sum, value) => sum + value, 0);
}

function settleSimulatedRound(state: GameState): GameState {
  let market = {
    ...state.market,
    goods: { ...state.market.goods },
    supplyDemand: JSON.parse(JSON.stringify(state.market.supplyDemand)) as GameState['market']['supplyDemand'],
    stockMarket: { ...state.market.stockMarket },
  };
  let taxRevenue = 0;
  const monthlyCompanySales: Record<string, { type: GoodType; sold: number }> = {};

  let players = state.players.map((player): Player => {
    let cash = player.cash;
    const company = player.company ? JSON.parse(JSON.stringify(player.company)) as Player['company'] : undefined;
    const assets = player.assets.map(asset => ({ ...asset }));

    for (const asset of assets) {
      if (asset.type === 'stock' || asset.type === 'bond' || asset.type === 'gold' || asset.type === 'deposit') {
        asset.currentValue = Math.max(0, asset.currentValue * calculateAssetReturnMultiplier(asset.type, market));
      }
    }

    if (company) {
      const productType = company.productionType;
      const config = PRODUCTION_CONFIGS[productType];
      const productInventory = getProductInventory(company);
      const currentInventory = productInventory[productType] ?? 0;
      const inventoryBrake = currentInventory > 900
        ? 0.28
        : currentInventory > 500
          ? 0.45
          : currentInventory > 220
            ? 0.68
            : 1;
      const target = Math.max(35, Math.round(getEffectiveCapacityUnits(company, market.productivityBonus ?? 0) / Math.max(1, config.capacityCost) * 0.65 * inventoryBrake));
      const materialTarget = Math.max(260, Math.round(target * config.materialConsumption * 2.2));
      let materialPurchaseCost = 0;
      if (company.rawMaterials < materialTarget) {
        const purchaseQuantity = Math.round(materialTarget - company.rawMaterials);
        materialPurchaseCost = getMaterialPurchaseCost(purchaseQuantity, company, market);
        company.rawMaterials += purchaseQuantity;
      }
      const maxByCapacity = getMaxProductionByCapacity(getEffectiveCapacityUnits(company, market.productivityBonus ?? 0), 0, productType);
      const maxByMaterials = Math.floor(company.rawMaterials / config.materialConsumption);
      const actualProduction = Math.min(target, maxByCapacity, maxByMaterials);
      const materialUnitPrice = getMaterialUnitPrice(Math.max(80, materialTarget), company, market);
      const availableForSale = currentInventory + actualProduction;
      const saleOption = findBestSaleOption(market, company, productType, availableForSale);
      const salePrice = saleOption.price;
      const sold = saleOption.sold;
      const revenue = sold * salePrice;
      const processingCost = getProcessingCost(productType, actualProduction) + getSupplyChainOverheadCost(productType, actualProduction, market);
      const materialConsumedCost = Math.round(actualProduction * config.materialConsumption * materialUnitPrice);
      const wages = company.employees * (company.productionCost || ECONOMY_BALANCE.company.wagePerEmployee);
      const fixedCosts = getCompanyFixedCosts(company);
      const inventoryHoldingCost = getCompanyInventoryHoldingCost(company);
      const tax = Math.max(0, revenue * market.globalTaxRate * 0.08);
      const profit = revenue - processingCost - materialConsumedCost - wages - fixedCosts - inventoryHoldingCost - tax;
      productInventory[productType] += actualProduction - sold;

      cash += revenue - processingCost - materialPurchaseCost - wages - fixedCosts - inventoryHoldingCost - tax;
      taxRevenue += tax + wages * market.globalTaxRate * 0.3;
      company.rawMaterials = Math.max(0, company.rawMaterials - actualProduction * config.materialConsumption);
      company.productInventory = productInventory;
      company.inventory = getTotalProductInventory(productInventory);
      company.revenue += revenue;
      company.costs += processingCost + materialConsumedCost + wages + fixedCosts + inventoryHoldingCost + tax;
      company.profit += profit;
      company.stats.totalProduced += actualProduction;
      company.stats.totalSold += sold;
      company.stats.totalRevenue += revenue;
      company.stats.totalCosts += processingCost + materialConsumedCost + wages + fixedCosts + inventoryHoldingCost + tax;
      company.stats.monthlyProfit = profit;
      company.cashFlow = {
        initial: company.cashFlow.final,
        income: revenue,
        expenses: processingCost + materialPurchaseCost + wages + fixedCosts + inventoryHoldingCost + tax,
        wages,
        productionCosts: processingCost + materialPurchaseCost,
        otherCosts: fixedCosts + inventoryHoldingCost + tax,
        final: company.cashFlow.final + revenue - processingCost - materialPurchaseCost - wages - fixedCosts - inventoryHoldingCost - tax,
      };
      company.incomeStatement = {
        revenue,
        cogs: processingCost + materialConsumedCost + wages,
        grossProfit: revenue - processingCost - materialConsumedCost - wages,
        operatingProfit: revenue - processingCost - materialConsumedCost - wages - fixedCosts - inventoryHoldingCost,
        netProfit: profit,
        taxes: tax,
        interestExpense: 0,
      };
      Object.assign(company, updateCompanyFinanceSnapshot(company));

      market.supplyDemand[productType].supply += Math.max(0, actualProduction - sold);
      market.supplyDemand[productType].demand = Math.max(0, market.supplyDemand[productType].demand - sold);
      monthlyCompanySales[player.id] = { type: productType, sold };
    }

    return {
      ...player,
      cash: Math.round(cash),
      assets,
      company,
    };
  });

  market.monthlyTaxRevenue = Math.round(taxRevenue);
  market.externalSector = deriveExternalSector(market);
  market.creditConditions = deriveCreditConditions(market);
  market.macroState = deriveMacroState(players, market);
  market.supplyChain = deriveSupplyChainState(market);
  market.households = updateHouseholdsForMacro(players, market);
  market.npcFirms = updateNpcFirmsForMacro(market);

  const householdDemand = calculateHouseholdDemandBySegment(market.households, market);
  const npcSupply = getNpcSupplyContribution(market.npcFirms);
  Object.keys(market.goods).forEach(key => {
    const goodType = key as GoodType;
    const sd = market.supplyDemand[goodType];
    const baselineDemand = Math.max(getBaselineMarketDemand(goodType) * 0.35, householdDemand[goodType] ?? 20);
    sd.demand = Math.max(1, Math.round(sd.demand * 0.46 + baselineDemand * 0.54));
    sd.supply = Math.max(5, Math.round(sd.supply * 0.58 + (npcSupply[goodType] ?? 0) * 0.42));
  });

  market = updateMarketAnchors(market);
  const cycleSignal = deriveEconomicCycle(market, players);
  market.economicCycle = cycleSignal.economicCycle;
  market.cyclePhase = cycleSignal.cyclePhase;
  market.gdp = players.reduce((sum, player) => sum + Math.max(0, player.cash), 0)
    + market.npcFirms.reduce((sum, firm) => sum + firm.plannedSupply * 4, 0);

  const governmentFeedback = deriveGovernmentFeedback(players, market);
  players = players.map(player => {
    if (player.profession !== 'government' || !player.govAbilities || !governmentFeedback) return player;
    return {
      ...player,
      govAbilities: {
        ...player.govAbilities,
        treasuryBalance: player.govAbilities.treasuryBalance + taxRevenue,
        ...governmentFeedback,
      },
    };
  });

  return {
    ...state,
    currentRound: state.currentRound + 1,
    players,
    market,
  };
}

function createState(): GameState {
  const state = createInitialGameState([
    { id: 'worker', name: '员工', color: '#2563eb', profession: 'worker' },
    { id: 'entrepreneur', name: '企业家', color: '#16a34a', profession: 'entrepreneur' },
    { id: 'investor', name: '投资者', color: '#9333ea', profession: 'investor' },
    { id: 'government', name: '政府', color: '#dc2626', profession: 'government' },
  ], 'professional');
  const entrepreneur = state.players.find(player => player.id === 'entrepreneur');
  if (entrepreneur?.company) {
    entrepreneur.company.employees = 4;
    entrepreneur.company.machines = 2;
    entrepreneur.company.rawMaterials = 900;
    entrepreneur.company.productionType = 'food';
    entrepreneur.company.industry = 'food';
    entrepreneur.company.productQuality = 68;
    entrepreneur.company.productionCost = 3600;
  }
  return state;
}

function snapshot(state: GameState): RoundSnapshot {
  const entrepreneur = state.players.find(player => player.id === 'entrepreneur');
  const government = state.players.find(player => player.id === 'government');
  const priceRatios = (['food', 'daily_necessities', 'entertainment', 'luxury'] as ProductionGoodType[])
    .map(goodType => state.market.goods[goodType].currentPrice / Math.max(1, state.market.goods[goodType].basePrice));
  return {
    round: state.currentRound,
    cycle: state.market.economicCycle,
    entrepreneurCash: entrepreneur?.cash ?? 0,
    entrepreneurProfit: entrepreneur?.company?.stats.monthlyProfit ?? 0,
    totalProduced: entrepreneur?.company?.stats.totalProduced ?? 0,
    totalSold: entrepreneur?.company?.stats.totalSold ?? 0,
    inventory: entrepreneur?.company?.inventory ?? 0,
    gdp: Math.round(state.market.gdp),
    inflation: Number(state.market.inflationRate.toFixed(4)),
    avgPrice: Number((priceRatios.reduce((sum, ratio) => sum + ratio, 0) / priceRatios.length).toFixed(3)),
    creditTightness: Number(((state.market.creditConditions.householdCreditTightness + state.market.creditConditions.businessCreditTightness) / 2).toFixed(3)),
    importCost: Math.round(state.market.externalSector.importCostIndex),
    exportDemand: Math.round(state.market.externalSector.exportDemandIndex),
    govApproval: Math.round(government?.govAbilities?.approvalRating ?? 0),
  };
}

function assertStable(history: RoundSnapshot[]): void {
  const last = history[history.length - 1];
  const profitableRounds = history.filter(item => item.entrepreneurProfit > 0).length;
  const cycles = new Set(history.map(item => item.cycle));
  const lateAveragePrice = history.slice(-10).reduce((sum, item) => sum + item.avgPrice, 0) / Math.max(1, history.slice(-10).length);
  const invalid = history.find(item =>
    !Number.isFinite(item.gdp)
    || !Number.isFinite(item.avgPrice)
    || item.avgPrice <= 0
    || item.avgPrice > 4
    || item.creditTightness < 0
    || item.creditTightness > 1
    || item.importCost < 50
    || item.importCost > 220
    || item.govApproval < 0
    || item.govApproval > 100
  );

  if (invalid) {
    throw new Error(`仿真出现异常指标: ${JSON.stringify(invalid)}`);
  }
  if (profitableRounds < 12) {
    throw new Error(`企业正常经营盈利轮数不足: ${profitableRounds}/40`);
  }
  if (cycles.size < 3) {
    throw new Error(`经济周期缺少内生变化: ${Array.from(cycles).join(',')}`);
  }
  if (lateAveragePrice > 2.85) {
    throw new Error(`后期价格长期偏离基础价过高: ${lateAveragePrice.toFixed(2)}x`);
  }
  if (last.entrepreneurCash < -50000) {
    throw new Error(`企业家现金过度恶化: ${last.entrepreneurCash}`);
  }
}

let state = createState();
const history: RoundSnapshot[] = [];
for (let i = 0; i < 40; i++) {
  state = settleSimulatedRound(state);
  history.push(snapshot(state));
}

console.table(history.filter((_, index) => index % 5 === 0 || index === history.length - 1));
assertStable(history);
console.log(`Simulation passed: profitableRounds=${history.filter(item => item.entrepreneurProfit > 0).length}/40, cycles=${Array.from(new Set(history.map(item => item.cycle))).join(',')}`);
