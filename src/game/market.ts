import {
  Company,
  ECONOMY_BALANCE,
  GoodType,
  HouseholdSegment,
  IndustryType,
  InvestmentType,
  INVESTMENT_CONFIGS,
  LoanType,
  Market,
  NpcFirm,
  Player,
  PolicyType,
  POLICY_CONFIGS,
} from '@/types/game';

export const MARKET_DEMAND_SCALE = 12;

const DEFAULT_EXTERNAL_SECTOR: Market['externalSector'] = {
  importCostIndex: 100,
  exportDemandIndex: 100,
  logisticsStress: 1,
  energyPriceIndex: 100,
  tradeBalance: 0,
};

const DEFAULT_CREDIT_CONDITIONS = {
  householdCreditTightness: 0.42,
  businessCreditTightness: 0.38,
  defaultRate: 0.03,
  lendingSentiment: 0.58,
  mortgageApprovalRate: 0.68,
  consumerApprovalRate: 0.62,
  businessApprovalRate: 0.58,
  collateralHaircut: 0.28,
  riskPremium: 0.018,
  badDebtPressure: 0.12,
};

const DEFAULT_SUPPLY_CHAIN: Market['supplyChain'] = {
  layers: {
    basicMaterials: { priceIndex: 100, availability: 0.88, shortage: 0.12, costShock: 0 },
    intermediateGoods: { priceIndex: 100, availability: 0.86, shortage: 0.14, costShock: 0 },
    packagingLogistics: { priceIndex: 100, availability: 0.9, shortage: 0.1, costShock: 0 },
    energy: { priceIndex: 100, availability: 0.9, shortage: 0.1, costShock: 0 },
  },
  industryExposure: {
    food: { basicMaterials: 0.36, intermediateGoods: 0.08, packagingLogistics: 0.4, energy: 0.16 },
    daily_necessities: { basicMaterials: 0.42, intermediateGoods: 0.28, packagingLogistics: 0.22, energy: 0.08 },
    entertainment: { basicMaterials: 0.16, intermediateGoods: 0.42, packagingLogistics: 0.12, energy: 0.3 },
    luxury: { basicMaterials: 0.18, intermediateGoods: 0.36, packagingLogistics: 0.1, energy: 0.36 },
    public_service: { basicMaterials: 0.08, intermediateGoods: 0.2, packagingLogistics: 0.32, energy: 0.4 },
    finance: { basicMaterials: 0.04, intermediateGoods: 0.12, packagingLogistics: 0.14, energy: 0.7 },
  },
};

const initialSupplyDemand: Record<GoodType, { supply: number; demand: number }> = {
  food: { supply: 900, demand: 1200 },
  daily_necessities: { supply: 900, demand: 1200 },
  housing: { supply: 250, demand: 300 },
  transportation: { supply: 700, demand: 900 },
  entertainment: { supply: 450, demand: 650 },
  luxury: { supply: 180, demand: 280 },
  education: { supply: 300, demand: 360 },
  healthcare: { supply: 450, demand: 550 },
};

const industryToGoodType: Record<IndustryType, GoodType | null> = {
  food: 'food',
  daily_necessities: 'daily_necessities',
  entertainment: 'entertainment',
  luxury: 'luxury',
  public_service: null,
  finance: null,
};

const goodToIndustry: Partial<Record<GoodType, IndustryType>> = {
  food: 'food',
  daily_necessities: 'daily_necessities',
  entertainment: 'entertainment',
  luxury: 'luxury',
  transportation: 'public_service',
  education: 'public_service',
  healthcare: 'public_service',
  housing: 'public_service',
};

export function createInitialSupplyDemand(): Record<GoodType, { supply: number; demand: number }> {
  return JSON.parse(JSON.stringify(initialSupplyDemand)) as Record<GoodType, { supply: number; demand: number }>;
}

export function getBaselineMarketDemand(goodType: GoodType): number {
  return Math.round((initialSupplyDemand[goodType]?.demand ?? 20) * 0.55);
}

export function scaleHouseholdDemand(demand: Record<GoodType, number>): Record<GoodType, number> {
  return {
    food: demand.food * MARKET_DEMAND_SCALE,
    daily_necessities: demand.daily_necessities * MARKET_DEMAND_SCALE,
    housing: demand.housing * 6,
    transportation: demand.transportation * 10,
    entertainment: demand.entertainment * 11,
    luxury: demand.luxury * 12,
    education: demand.education * 8,
    healthcare: demand.healthcare * 8,
  };
}

export function applyDemandMultiplier(
  market: Market,
  multipliers: Partial<Record<GoodType, number>>,
): Market {
  const supplyDemand = { ...market.supplyDemand };
  (Object.entries(multipliers) as Array<[GoodType, number]>).forEach(([goodType, multiplier]) => {
    const current = supplyDemand[goodType];
    if (!current) return;
    supplyDemand[goodType] = {
      ...current,
      demand: Math.max(0, Math.round(current.demand * multiplier)),
    };
  });
  return { ...market, supplyDemand };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getAverageShortageIndex(market: Market): number {
  const values = Object.values(market.shortageIndex ?? {});
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getAverageInventoryPressure(market: Market): number {
  const values = Object.values(market.inventoryPressure ?? {});
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getIndustrySupplyChainPressure(market: Market, industry: IndustryType): number {
  const supplyChain = market.supplyChain ?? DEFAULT_SUPPLY_CHAIN;
  const exposure = supplyChain.industryExposure[industry] ?? DEFAULT_SUPPLY_CHAIN.industryExposure[industry];
  const layers = supplyChain.layers;
  return round(
    exposure.basicMaterials * (layers.basicMaterials.costShock + layers.basicMaterials.shortage * 0.16)
    + exposure.intermediateGoods * (layers.intermediateGoods.costShock + layers.intermediateGoods.shortage * 0.18)
    + exposure.packagingLogistics * (layers.packagingLogistics.costShock + layers.packagingLogistics.shortage * 0.15)
    + exposure.energy * (layers.energy.costShock + layers.energy.shortage * 0.2),
    4,
  );
}

function getGoodSupplyChainPressure(market: Market, goodType: GoodType): number {
  const industry = goodToIndustry[goodType];
  return industry ? getIndustrySupplyChainPressure(market, industry) : 0;
}

export function calculateHouseholdDemandBySegment(
  households: HouseholdSegment[],
  market: Market,
): Record<GoodType, number> {
  const base: Record<GoodType, number> = {
    food: 0,
    daily_necessities: 0,
    housing: 0,
    transportation: 0,
    entertainment: 0,
    luxury: 0,
    education: 0,
    healthcare: 0,
  };

  households.forEach(household => {
    const purchasingPower = clamp(household.disposableIncome / 7000, 0.35, 2.8);
    const confidence = clamp(household.confidence / 60, 0.5, 1.5);
    const inflationPenalty = clamp(1 - market.inflationRate * 2.2, 0.7, 1.15);
    const incomeStress = clamp(1 - market.creditConditions.householdCreditTightness * 0.25, 0.7, 1.1);
    const externalDemandBoost = 0.9 + (market.externalSector?.exportDemandIndex ?? market.macroState.externalDemandIndex) / 260;
    const effectiveBudget = purchasingPower * confidence * inflationPenalty * incomeStress * externalDemandBoost;
    const essentialWeight = clamp(household.essentialShare / 0.56, 0.62, 1.42);
    const discretionaryWeight = clamp(household.discretionaryShare / 0.3, 0.45, 1.75);
    const luxuryIncomeBoost = clamp((household.disposableIncome - 9000) / 11000, 0, 1.6);
    const educationMobilityBoost = clamp(market.macroState.socialMobilityIndex / 60, 0.65, 1.45);
    const priceAffordability = (goodType: GoodType, elasticity: number) => {
      const good = market.goods[goodType];
      const priceRatio = good.currentPrice / Math.max(1, good.basePrice);
      return clamp(Math.pow(1 / Math.max(0.55, priceRatio), elasticity), 0.28, 1.35);
    };

    base.food += 9 * household.populationShare * (household.demandBias.food ?? 1) * essentialWeight * Math.max(0.85, effectiveBudget) * priceAffordability('food', 0.18);
    base.daily_necessities += 6 * household.populationShare * (household.demandBias.daily_necessities ?? 1) * essentialWeight * Math.max(0.82, effectiveBudget) * priceAffordability('daily_necessities', 0.24);
    base.housing += 0.8 * household.populationShare * clamp(1 - market.creditConditions.mortgageApprovalRate * 0.15 + market.creditConditions.householdCreditTightness * 0.2, 0.5, 1.25) * priceAffordability('housing', 0.35);
    base.transportation += 1.5 * household.populationShare * effectiveBudget * (0.75 + discretionaryWeight * 0.25) * priceAffordability('transportation', 0.42);
    base.entertainment += 2.4 * household.populationShare * (household.demandBias.entertainment ?? 1) * effectiveBudget * discretionaryWeight * priceAffordability('entertainment', 0.95);
    base.luxury += 0.9 * household.populationShare * (household.demandBias.luxury ?? 1) * Math.max(0, effectiveBudget - 0.45) * (1 + luxuryIncomeBoost) * discretionaryWeight * priceAffordability('luxury', 1.35);
    base.education += 1.1 * household.populationShare * (0.9 + household.averageIncome / 30000) * educationMobilityBoost * priceAffordability('education', 0.55);
    base.healthcare += 0.9 * household.populationShare * (1 + market.shortageIndex.healthcare * 0.2) * priceAffordability('healthcare', 0.2);
  });

  return scaleHouseholdDemand(base);
}

export function updateHouseholdsForMacro(players: Player[], market: Market): HouseholdSegment[] {
  const avgCash = players.length
    ? players.reduce((sum, player) => sum + Math.max(0, player.cash), 0) / players.length
    : 0;
  const lowHealthShare = players.length
    ? players.filter(player => player.health < 45).length / players.length
    : 0;
  const mobility = clamp(market.macroState.socialMobilityIndex / 100, 0.2, 1.2);
  const employmentPulse = clamp(market.employmentRate / 100, 0.3, 1.1);
  const workers = players.filter(player => player.profession === 'worker');
  const avgEducation = workers.length
    ? workers.reduce((sum, player) => sum + (player.workerAbilities?.educationLevel ?? 0), 0) / workers.length
    : 0;
  const avgExperience = workers.length
    ? workers.reduce((sum, player) => sum + (player.workerAbilities?.experience ?? 0), 0) / workers.length
    : 0;
  const debtBurden = players.length
    ? players.reduce((sum, player) => sum + (player.loans ?? []).reduce((loanSum, loan) => loanSum + loan.remaining, 0), 0) / Math.max(1, players.reduce((sum, player) => sum + Math.max(1000, player.cash), 0))
    : 0;
  const ownedHousingShare = players.length
    ? players.filter(player => player.housingStatus === 'owned').length / players.length
    : 0;
  const skilledWorkerShare = workers.length
    ? workers.filter(player =>
      (player.workerAbilities?.skill ?? 0) >= 65
      && (player.workerAbilities?.educationLevel ?? 0) >= 2
      && (player.workerAbilities?.experience ?? 0) >= 3,
    ).length / workers.length
    : 0;
  const monthlyJobShare = workers.length
    ? workers.filter(player => player.workerAbilities?.paymentType === 'monthly').length / workers.length
    : 0;
  const upwardMobility = clamp(avgEducation * 0.04 + avgExperience * 0.008 + skilledWorkerShare * 0.28 + monthlyJobShare * 0.12 + ownedHousingShare * 0.18, 0, 0.7);
  const downwardPressure = clamp(debtBurden * 0.18 + lowHealthShare * 0.26 + market.macroState.unemploymentPressure * 0.12 + market.creditConditions.householdCreditTightness * 0.08, 0, 0.65);
  const humanCapitalMobility = clamp(upwardMobility - downwardPressure, -0.3, 0.55);

  const nextShares = market.households.map(household => {
    const movement = household.id === 'low_income'
      ? clamp(0.02 + market.macroState.unemploymentPressure * 0.05 + market.inflationRate * 0.1 + downwardPressure * 0.06 - mobility * 0.03 - upwardMobility * 0.07, -0.055, 0.065)
      : household.id === 'high_income'
        ? clamp(0.006 + mobility * 0.028 - market.macroState.unemploymentPressure * 0.025 + upwardMobility * 0.055 - downwardPressure * 0.03, -0.035, 0.055)
        : clamp(-0.006 + market.macroState.socialMobilityIndex * 0.00045 + upwardMobility * 0.025 - downwardPressure * 0.018, -0.035, 0.04);
    return {
      ...household,
      populationShare: Math.max(0.05, household.populationShare + movement),
    };
  });
  const shareTotal = nextShares.reduce((sum, household) => sum + household.populationShare, 0);

  return nextShares.map(household => {
    const normalizedShare = household.populationShare / Math.max(0.1, shareTotal);
    const incomeGrowth = clamp(
      employmentPulse * 0.06
      + market.macroState.externalDemandIndex / 1000
      + (market.externalSector?.exportDemandIndex ?? 100) / 2600
      + humanCapitalMobility * 0.045
      - market.inflationRate * 0.6,
      -0.04,
      0.06,
    );
    const averageIncome = Math.round(household.averageIncome * (1 + incomeGrowth));
    const disposableIncome = Math.round(
      averageIncome
      * (1 - household.savingsRate)
      * (1 - market.globalTaxRate * 0.35)
      * (1 - market.creditConditions.householdCreditTightness * 0.08),
    );
    const confidence = clamp(
      household.confidence
      + market.macroState.consumerConfidence * 0.06
      - market.inflationRate * 100 * 0.18
      - lowHealthShare * 6
      + avgCash / 40000,
      35,
      88,
    );

    return {
      ...household,
      populationShare: normalizedShare,
      averageIncome,
      disposableIncome,
      confidence,
    };
  });
}

export function updateNpcFirmsForMacro(market: Market): NpcFirm[] {
  const updatedFirms: NpcFirm[] = market.npcFirms.map((firm): NpcFirm => {
    const goodType = industryToGoodType[firm.industry];
    const anchor = goodType ? market.priceAnchors[goodType] : null;
    const demandSupport = goodType ? market.supplyDemand[goodType].demand / Math.max(1, initialSupplyDemand[goodType].demand) : 1;
    const supplyChainPressure = getIndustrySupplyChainPressure(market, firm.industry);
    const alreadyExited = firm.status === 'exited';
    const costPressure = market.inflationRate * 0.8
      + market.creditConditions.businessCreditTightness * 0.15
      + (market.externalSector?.logisticsStress ?? 1) * 0.06
      + ((market.externalSector?.energyPriceIndex ?? 100) - 100) / 500
      + supplyChainPressure * 0.9;
    const financialHealth = alreadyExited ? 0 : clamp(
      firm.financialHealth
      + demandSupport * 8
      + market.macroState.businessConfidence * 0.04
      + market.macroState.externalDemandIndex * 0.02
      + (market.externalSector?.exportDemandIndex ?? 100) * 0.02
      - costPressure * 100 * 0.35
      - (anchor?.inventoryPressure ?? 0) * 12
      - supplyChainPressure * 28,
      20,
      90,
    );
    const competitionBase = (firm.brand ?? 50) * 0.24
      + (firm.quality ?? 55) * 0.24
      + (firm.deliveryReliability ?? 60) * 0.2
      + (firm.costControl ?? 55) * 0.18
      + financialHealth * 0.14;
    const exitRisk = financialHealth < 24 && (anchor?.inventoryPressure ?? 0) > 0.24;
    const status = alreadyExited || exitRisk
      ? 'exited'
      : financialHealth < 30
        ? 'distressed'
        : financialHealth > 74 && demandSupport > 1.05
          ? 'expanding'
          : financialHealth < 45 || demandSupport < 0.82
            ? 'shrinking'
            : 'active';
    const expansionFactor = clamp(
      0.82
      + financialHealth / 130
      + market.macroState.businessConfidence / 220
      + (anchor?.shortageIndex ?? 0) * 0.42
      - market.creditConditions.businessCreditTightness * 0.18
      - supplyChainPressure * 0.35,
      0.55,
      1.85,
    );
    const plannedSupply = status === 'exited' ? 0 : Math.max(60, Math.round(firm.capacity * expansionFactor));
    const wageOffer = Math.round(
      firm.wageOffer
      * (1 + (market.laborMarket?.skillPremium ?? 0.01) * 0.8)
      * (1 + Math.max(-0.04, (market.employmentRate - 70) / 500)),
    );

    return {
      ...firm,
      financialHealth,
      capacity: status === 'exited' ? 0 : Math.max(120, Math.round(firm.capacity * clamp(0.96 + financialHealth / 260, 0.86, 1.08))),
      plannedSupply,
      wageOffer,
      pricingPower: clamp(firm.pricingPower + (anchor?.shortageIndex ?? 0) * 0.03 - (anchor?.inventoryPressure ?? 0) * 0.04, 0.04, 0.55),
      marketShare: clamp((firm.marketShare ?? 20) * 0.76 + competitionBase * 0.24, 0, 100),
      brand: clamp((firm.brand ?? 50) + (status === 'expanding' ? 0.8 : status === 'distressed' ? -1.2 : 0), 0, 100),
      quality: clamp((firm.quality ?? 55) - supplyChainPressure * 3 + (financialHealth > 70 ? 0.4 : 0), 0, 100),
      deliveryReliability: clamp((firm.deliveryReliability ?? 60) - supplyChainPressure * 8 - (market.externalSector?.logisticsStress ?? 1) + 1, 0, 100),
      costControl: clamp((firm.costControl ?? 55) + (financialHealth > 65 ? 0.5 : -0.4) - supplyChainPressure * 4, 0, 100),
      status,
    };
  });

  const entrants = createNpcEntrants(updatedFirms, market);
  const activeFirms = [...updatedFirms, ...entrants];
  return normalizeNpcMarketShares(activeFirms);
}

function getPlayerCompanyCompetitionScore(player: Player, market?: Market): number {
  const company = player.company;
  if (!company) return 0;
  const inventoryPressure = clamp(company.inventory / 1600, 0, 1.2);
  const deliveryReliability = clamp(
    58
    + company.machines * 4
    + company.employees * 0.8
    + company.morale * 0.18
    - inventoryPressure * 18
    - (market ? getIndustrySupplyChainPressure(market, company.industry ?? company.productionType) * 30 : 0),
    20,
    95,
  );
  const costControl = clamp(
    54
    + company.efficiency * 0.18
    + company.machines * 1.2
    - (company.productionCost / Math.max(1, ECONOMY_BALANCE.company.wagePerEmployee) - 1) * 16
    - inventoryPressure * 10,
    20,
    95,
  );
  return clamp(
    company.reputation * 0.24
    + company.productQuality * 0.24
    + deliveryReliability * 0.2
    + costControl * 0.18
    + clamp(company.cashFlow.final / 1200, -18, 32) * 0.14,
    5,
    95,
  );
}

export function recalculatePlayerMarketShare(
  players: Player[],
  monthlySales: Record<string, { type: GoodType; sold: number }>,
  market?: Market,
): Player[] {
  const totalByType = Object.values(monthlySales).reduce((acc, sale) => {
    acc[sale.type] = (acc[sale.type] ?? 0) + sale.sold;
    return acc;
  }, {} as Partial<Record<GoodType, number>>);

  return players.map(player => {
    if (!player.company) return player;
    const sale = monthlySales[player.id];
    const productType = sale?.type ?? player.company.productionType;
    const totalSold = sale ? totalByType[sale.type] ?? 0 : 0;
    const playerSalesShare = totalSold > 0 ? (sale!.sold / totalSold) * 100 : player.company.marketShare * 0.9;
    const npcPeers = market?.npcFirms.filter(firm => firm.industry === productType && firm.status !== 'exited') ?? [];
    const npcCompetitionScore = npcPeers.length
      ? npcPeers.reduce((sum, firm) => sum + ((firm.brand ?? 50) * 0.24 + (firm.quality ?? 55) * 0.24 + (firm.deliveryReliability ?? 60) * 0.2 + (firm.costControl ?? 55) * 0.18 + firm.financialHealth * 0.14), 0) / npcPeers.length
      : 50;
    const playerCompetitionScore = getPlayerCompanyCompetitionScore(player, market);
    const competitivePosition = clamp(playerCompetitionScore / Math.max(1, npcCompetitionScore), 0.45, 1.8);
    const inventoryPenalty = clamp(player.company.inventory / 2400, 0, 0.28);
    const qualityMomentum = clamp((player.company.productQuality - 60) / 180 + (player.company.reputation - 50) / 220, -0.18, 0.32);
    const targetShare = clamp(
      playerSalesShare * 0.48
      + playerCompetitionScore * 0.28
      + player.company.marketShare * 0.18
      + (competitivePosition - 1) * 16
      + qualityMomentum * 20
      - inventoryPenalty * 100,
      0,
      100,
    );
    return {
      ...player,
      company: {
        ...player.company,
        marketShare: round(clamp(targetShare * 0.72 + player.company.marketShare * 0.28, 0, 100), 2),
      },
    };
  });
}

function createNpcEntrants(existingFirms: NpcFirm[], market: Market): NpcFirm[] {
  const entrantIndustries = (['food', 'daily_necessities', 'entertainment', 'luxury'] as IndustryType[]).filter(industry => {
    const goodType = industryToGoodType[industry];
    if (!goodType) return false;
    const activeCount = existingFirms.filter(firm => firm.industry === industry && firm.status !== 'exited').length;
    const demandSupport = market.supplyDemand[goodType].demand / Math.max(1, initialSupplyDemand[goodType].demand);
    const shortage = market.priceAnchors[goodType].shortageIndex;
    const creditOpen = (market.creditConditions.businessApprovalRate ?? 0.5) > 0.5 && market.creditConditions.businessCreditTightness < 0.55;
    return activeCount < 5 && creditOpen && (demandSupport > 1.12 || shortage > 0.16);
  });

  return entrantIndustries.map((industry, index): NpcFirm => {
    const goodType = industryToGoodType[industry]!;
    const demandSupport = market.supplyDemand[goodType].demand / Math.max(1, initialSupplyDemand[goodType].demand);
    const baseCapacity = industry === 'luxury' ? 180 : industry === 'entertainment' ? 380 : 760;
    return {
      id: `npc_${industry}_entrant_${market.gdp.toFixed(0)}_${index}`,
      industry,
      employees: industry === 'luxury' ? 8 : industry === 'entertainment' ? 14 : 24,
      capacity: Math.round(baseCapacity * clamp(demandSupport, 0.8, 1.45)),
      wageOffer: Math.round((market.laborMarket?.baseWage ?? ECONOMY_BALANCE.worker.baseWage) * (industry === 'luxury' ? 1.35 : industry === 'entertainment' ? 1.12 : 0.95)),
      financialHealth: 56,
      plannedSupply: Math.round(baseCapacity * 0.86),
      pricingPower: industry === 'luxury' ? 0.2 : 0.1,
      marketShare: 6,
      brand: 34,
      quality: 48,
      deliveryReliability: 52,
      costControl: 50,
      status: 'active',
    };
  });
}

function normalizeNpcMarketShares(firms: NpcFirm[]): NpcFirm[] {
  return firms.map(firm => {
    if (firm.status === 'exited') return { ...firm, marketShare: 0, plannedSupply: 0 };
    const peers = firms.filter(peer => peer.industry === firm.industry && peer.status !== 'exited');
    const total = peers.reduce((sum, peer) => sum + Math.max(0.1, peer.marketShare ?? 0.1), 0);
    const normalizedShare = Math.max(0, ((firm.marketShare ?? 0) / Math.max(0.1, total)) * 100);
    return {
      ...firm,
      marketShare: round(normalizedShare, 2),
    };
  });
}

export function deriveSupplyChainState(market: Market): Market['supplyChain'] {
  const prior = market.supplyChain ?? DEFAULT_SUPPLY_CHAIN;
  const avgShortage = getAverageShortageIndex(market);
  const avgInventory = getAverageInventoryPressure(market);
  const importPressure = ((market.externalSector?.importCostIndex ?? 100) - 100) / 100;
  const energyPressure = ((market.externalSector?.energyPriceIndex ?? 100) - 100) / 100;
  const logisticsPressure = (market.externalSector?.logisticsStress ?? 1) - 1;
  const creditPressure = market.creditConditions.businessCreditTightness - 0.35;
  const demandPressure = clamp(avgShortage - avgInventory * 0.55, -0.7, 1);

  const nextLayer = (
    layer: keyof Market['supplyChain']['layers'],
    targetShock: number,
    targetAvailability: number,
  ) => {
    const previous = prior.layers[layer];
    const costShock = clamp(previous.costShock * 0.62 + targetShock * 0.38, -0.24, 0.65);
    const availability = clamp(previous.availability * 0.68 + targetAvailability * 0.32, 0.35, 1.08);
    const shortage = clamp(1 - availability + Math.max(0, demandPressure) * 0.14, 0, 0.9);
    const priceIndex = clamp(previous.priceIndex * 0.58 + (100 * (1 + costShock + shortage * 0.22)) * 0.42, 65, 210);
    return {
      priceIndex: round(priceIndex),
      availability: round(availability, 3),
      shortage: round(shortage, 3),
      costShock: round(costShock, 4),
    };
  };

  return {
    industryExposure: prior.industryExposure ?? DEFAULT_SUPPLY_CHAIN.industryExposure,
    layers: {
      basicMaterials: nextLayer('basicMaterials', importPressure * 0.28 + demandPressure * 0.08 + creditPressure * 0.05, 0.9 - importPressure * 0.1 - demandPressure * 0.08),
      intermediateGoods: nextLayer('intermediateGoods', importPressure * 0.2 + energyPressure * 0.06 + creditPressure * 0.08 + demandPressure * 0.07, 0.87 - importPressure * 0.08 - creditPressure * 0.07),
      packagingLogistics: nextLayer('packagingLogistics', logisticsPressure * 0.26 + energyPressure * 0.08 + demandPressure * 0.06, 0.91 - logisticsPressure * 0.12 - demandPressure * 0.05),
      energy: nextLayer('energy', energyPressure * 0.32 + demandPressure * 0.05, 0.9 - energyPressure * 0.1),
    },
  };
}

export function deriveMacroState(players: Player[], market: Market): Market['macroState'] {
  const averageCash = players.length
    ? players.reduce((sum, player) => sum + Math.max(0, player.cash), 0) / players.length
    : 0;
  const unemployedWorkers = players.filter(player => player.profession === 'worker' && (player.workerAbilities?.unemployedRounds ?? 0) > 0).length;
  const totalWorkers = Math.max(1, players.filter(player => player.profession === 'worker').length);
  const unemploymentPressure = clamp(unemployedWorkers / totalWorkers + Math.max(0, 0.08 - market.employmentRate / 100), 0, 1);
  const consumerConfidence = clamp(52 + averageCash / 1200 - market.inflationRate * 100 * 0.45 - unemploymentPressure * 26, 25, 90);
  const businessConfidence = clamp(50 + market.employmentRate * 0.18 - market.creditConditions.businessCreditTightness * 35 - market.inflationRate * 100 * 0.2, 25, 88);
  const fiscalPressure = clamp((market.globalTaxRate * 0.3) + ((market.monthlyTaxRevenue ?? 0) < 5000 ? 0.18 : 0.08), 0.1, 0.85);
  const inflationExpectation = clamp(market.inflationRate * 0.7 + market.macroState.inflationExpectation * 0.3, -0.02, 0.18);
  const workers = players.filter(player => player.profession === 'worker');
  const workerEducation = workers.length
    ? workers.reduce((sum, player) => sum + (player.workerAbilities?.educationLevel ?? 0), 0) / workers.length
    : 0;
  const workerExperience = workers.length
    ? workers.reduce((sum, player) => sum + (player.workerAbilities?.experience ?? 0), 0) / workers.length
    : 0;
  const skilledWorkerShare = workers.length
    ? workers.filter(player =>
      (player.workerAbilities?.skill ?? 0) >= 65
      && (player.workerAbilities?.educationLevel ?? 0) >= 2
      && (player.workerAbilities?.experience ?? 0) >= 3,
    ).length / workers.length
    : 0;
  const debtRatio = players.length
    ? players.reduce((sum, player) => sum + (player.loans ?? []).reduce((loanSum, loan) => loanSum + loan.remaining, 0), 0)
      / Math.max(1, players.reduce((sum, player) => sum + Math.max(0, player.cash), 0))
    : 0;
  const housingSecurity = players.length
    ? players.filter(player => player.housingStatus !== 'none').length / players.length
    : 0;
  const lowHealthShare = players.length
    ? players.filter(player => player.health < 45).length / players.length
    : 0;

  return {
    consumerConfidence,
    businessConfidence,
    externalDemandIndex: clamp(market.macroState.externalDemandIndex + (market.economicCycle === 'growth' ? 2 : market.economicCycle === 'downturn' ? -3 : 0), 70, 135),
    fiscalPressure,
    unemploymentPressure,
    inflationExpectation,
    socialMobilityIndex: clamp(
      46
      + market.employmentRate * 0.12
      + market.macroState.consumerConfidence * 0.08
      + workerEducation * 1.7
      + workerExperience * 0.18
      + skilledWorkerShare * 9
      + housingSecurity * 5
      - market.inflationRate * 100 * 0.2
      - market.creditConditions.householdCreditTightness * 10
      - debtRatio * 4.2
      - lowHealthShare * 8,
      25,
      85,
    ),
  };
}

export function deriveExternalSector(market: Market): Market['externalSector'] {
  const prior = market.externalSector ?? DEFAULT_EXTERNAL_SECTOR;
  const shortageIndex = getAverageShortageIndex(market);
  const inventoryPressure = getAverageInventoryPressure(market);
  const cycleBias = market.economicCycle === 'growth'
    ? -3
    : market.economicCycle === 'overheating'
      ? 2
      : market.economicCycle === 'downturn'
        ? -5
        : -2;

  const importCostIndex = clamp(
    prior.importCostIndex * 0.62
    + (100 + market.inflationRate * 120 + market.creditConditions.businessCreditTightness * 22 + shortageIndex * 10 + cycleBias) * 0.38,
    70,
    180,
  );
  const exportDemandIndex = clamp(
    prior.exportDemandIndex * 0.64
    + (
      100
      + market.macroState.externalDemandIndex * 0.22
      + market.macroState.businessConfidence * 0.12
      + cycleBias * 3
      - Math.max(0, prior.exportDemandIndex - 118) * 0.28
      - (market.economicCycle === 'overheating' ? 6 : 0)
    ) * 0.36,
    70,
    170,
  );
  const logisticsStress = clamp(
    prior.logisticsStress * 0.58
    + (1 + shortageIndex * 0.75 + inventoryPressure * 0.35 + market.creditConditions.householdCreditTightness * 0.18) * 0.42,
    0.2,
    2.4,
  );
  const energyPriceIndex = clamp(
    prior.energyPriceIndex * 0.52
    + (100 + market.inflationRate * 150 + shortageIndex * 20 + (market.economicCycle === 'overheating' ? 10 : 0) + (market.economicCycle === 'downturn' ? -6 : 0)) * 0.48,
    70,
    190,
  );
  const tradeBalance = clamp(
    prior.tradeBalance * 0.5
    + (exportDemandIndex - importCostIndex * 0.62 - logisticsStress * 12) * 0.5,
    -500,
    500,
  );

  return {
    importCostIndex: round(importCostIndex),
    exportDemandIndex: round(exportDemandIndex),
    logisticsStress: round(logisticsStress, 3),
    energyPriceIndex: round(energyPriceIndex),
    tradeBalance: round(tradeBalance),
  };
}

export function deriveCreditConditions(market: Market): Market['creditConditions'] {
  const prior = market.creditConditions ?? DEFAULT_CREDIT_CONDITIONS;
  const bankDefaults = market.bank?.defaultedLoans ?? 0;
  const defaultPressure = clamp(
    bankDefaults * 0.06 + market.macroState.unemploymentPressure * 0.35 + market.inflationRate * 2.2 + market.macroState.fiscalPressure * 0.18,
    0,
    1.6,
  );
  const consumerConfidence = market.macroState.consumerConfidence / 100;
  const businessConfidence = market.macroState.businessConfidence / 100;
  const logisticsPenalty = (market.externalSector?.logisticsStress ?? 1) - 1;
  const importPressure = ((market.externalSector?.importCostIndex ?? 100) - 100) / 200;

  const householdCreditTightness = clamp(
    0.24
    + defaultPressure * 0.28
    + market.inflationRate * 1.1
    - consumerConfidence * 0.16
    + logisticsPenalty * 0.06
    + (market.economicCycle === 'overheating' ? 0.055 : 0),
    0.15,
    0.95,
  );
  const businessCreditTightness = clamp(
    0.2
    + defaultPressure * 0.34
    + market.inflationRate * 1.2
    - businessConfidence * 0.2
    + importPressure * 0.08
    + (market.economicCycle === 'overheating' ? 0.075 : 0),
    0.12,
    0.97,
  );
  const defaultRate = clamp(
    0.01 + defaultPressure * 0.045 + market.macroState.unemploymentPressure * 0.025 + market.inflationRate * 0.05,
    0.01,
    0.22,
  );
  const lendingSentiment = clamp(
    0.45 + consumerConfidence * 0.22 + businessConfidence * 0.18 - defaultPressure * 0.12 - (market.economicCycle === 'overheating' ? 0.06 : 0),
    0.05,
    0.95,
  );
  const mortgageApprovalRate = clamp(
    0.8 - householdCreditTightness * 0.55 + market.socialStability / 500,
    0.18,
    0.95,
  );
  const badDebtPressure = clamp((prior.badDebtPressure ?? 0.12) * 0.72 + defaultPressure * 0.28 + bankDefaults * 0.025, 0, 1);
  const collateralHaircut = clamp(0.18 + badDebtPressure * 0.34 + defaultRate * 0.45, 0.12, 0.65);
  const riskPremium = clamp(0.008 + defaultRate * 0.26 + badDebtPressure * 0.045 + businessCreditTightness * 0.018, 0.006, 0.09);
  const consumerApprovalRate = clamp(
    0.86 - householdCreditTightness * 0.52 - badDebtPressure * 0.22 + lendingSentiment * 0.18,
    0.12,
    0.94,
  );
  const businessApprovalRate = clamp(
    0.82 - businessCreditTightness * 0.58 - badDebtPressure * 0.24 + lendingSentiment * 0.16 + market.macroState.businessConfidence / 700,
    0.08,
    0.92,
  );

  return {
    householdCreditTightness: round(prior.householdCreditTightness * 0.65 + householdCreditTightness * 0.35, 3),
    businessCreditTightness: round(prior.businessCreditTightness * 0.65 + businessCreditTightness * 0.35, 3),
    defaultRate: round(prior.defaultRate * 0.55 + defaultRate * 0.45, 3),
    lendingSentiment: round(prior.lendingSentiment * 0.6 + lendingSentiment * 0.4, 3),
    mortgageApprovalRate: round(prior.mortgageApprovalRate * 0.6 + mortgageApprovalRate * 0.4, 3),
    consumerApprovalRate: round((prior.consumerApprovalRate ?? 0.62) * 0.6 + consumerApprovalRate * 0.4, 3),
    businessApprovalRate: round((prior.businessApprovalRate ?? 0.58) * 0.6 + businessApprovalRate * 0.4, 3),
    collateralHaircut: round((prior.collateralHaircut ?? 0.28) * 0.65 + collateralHaircut * 0.35, 3),
    riskPremium: round((prior.riskPremium ?? 0.018) * 0.6 + riskPremium * 0.4, 4),
    badDebtPressure: round(badDebtPressure, 3),
  };
}

export function deriveGovernmentFeedback(players: Player[], market: Market): Partial<NonNullable<Player['govAbilities']>> | null {
  const government = players.find(player => player.profession === 'government' && player.govAbilities);
  if (!government?.govAbilities) return null;

  const residentSupport = clamp(
    50
    + market.macroState.consumerConfidence * 0.28
    + market.socialStability * 0.18
    - market.inflationRate * 100 * 0.22
    - market.creditConditions.householdCreditTightness * 12,
    0,
    100,
  );
  const enterpriseSupport = clamp(
    48
    + market.macroState.businessConfidence * 0.28
    + market.macroState.externalDemandIndex * 0.08
    - market.creditConditions.businessCreditTightness * 18
    - market.globalTaxRate * 18,
    0,
    100,
  );
  const fiscalHealth = clamp(
    55
    + (market.monthlyTaxRevenue ?? 0) / 1400
    - market.macroState.fiscalPressure * 35
    - market.creditConditions.defaultRate * 120,
    0,
    100,
  );
  const stabilitySupport = clamp(
    50
    + market.socialStability * 0.32
    + market.macroState.consumerConfidence * 0.12
    - market.macroState.unemploymentPressure * 16,
    0,
    100,
  );
  const inflationSatisfaction = clamp(
    60
    - Math.abs(market.inflationRate - 0.02) * 1000 * 0.35
    - market.creditConditions.householdCreditTightness * 10,
    0,
    100,
  );
  const approvalRating = clamp(
    residentSupport * 0.26
    + enterpriseSupport * 0.22
    + fiscalHealth * 0.18
    + stabilitySupport * 0.2
    + inflationSatisfaction * 0.14,
    0,
    100,
  );
  const mandateDelta = approvalRating >= 72
    ? 2.4
    : approvalRating < 38
      ? -3.2
      : approvalRating < 50
        ? -1.1
        : 0.7;
  const fiscalMandatePenalty = fiscalHealth < 35 ? 1.8 : 0;
  const reputationDelta = (approvalRating - 55) / 18 + (stabilitySupport - 50) / 35 - (fiscalHealth < 30 ? 1.2 : 0);
  const budgetSpace = clamp(
    fiscalHealth * 0.42
    + clamp(government.govAbilities.treasuryBalance / 1800, 0, 42)
    + clamp((market.monthlyTaxRevenue ?? 0) / 1800, 0, 12)
    - market.macroState.fiscalPressure * 18,
    0,
    100,
  );
  const executionEfficiency = clamp(
    government.govAbilities.decisionPower * 0.28
    + government.govAbilities.reputation * 0.22
    + approvalRating * 0.22
    + fiscalHealth * 0.16
    + stabilitySupport * 0.12
    - (market.creditConditions.badDebtPressure ?? 0.12) * 9,
    0,
    100,
  );
  const removalRisk = clamp(
    72
    - approvalRating * 0.45
    - reputationDelta * 3
    - fiscalHealth * 0.18
    - stabilitySupport * 0.16
    - inflationSatisfaction * 0.12
    + market.macroState.unemploymentPressure * 16
    + market.macroState.fiscalPressure * 18,
    0,
    100,
  );

  return {
    residentSupport: round(residentSupport),
    enterpriseSupport: round(enterpriseSupport),
    fiscalHealth: round(fiscalHealth),
    stabilitySupport: round(stabilitySupport),
    inflationSatisfaction: round(inflationSatisfaction),
    budgetSpace: round(budgetSpace),
    executionEfficiency: round(executionEfficiency),
    removalRisk: round(removalRisk),
    approvalRating: round(approvalRating),
    decisionPower: round(clamp(government.govAbilities.decisionPower + mandateDelta - fiscalMandatePenalty, 0, 100)),
    reputation: round(clamp(government.govAbilities.reputation + reputationDelta, 0, 100)),
  };
}

export function getGovernmentPolicyBudgetLimit(govAbilities: NonNullable<Player['govAbilities']>): number {
  const budgetSpace = govAbilities.budgetSpace ?? 60;
  return Math.round(govAbilities.treasuryBalance * (0.25 + budgetSpace / 100));
}

export function evaluateLoanApplication(
  player: Player,
  loanType: LoanType,
  amount: number,
  market: Market,
): { approved: boolean; reason?: string; maxAmount?: number } {
  if (amount <= 0) return { approved: false, reason: '贷款金额无效' };

  const creditScore = player.creditScore ?? 70;
  const existingDebt = (player.loans ?? []).reduce((sum, loan) => sum + loan.remaining, 0);
  const income = player.company?.cashFlow.income ?? Math.max(0, player.cash * 0.35);
  const expenses = player.company?.cashFlow.expenses ?? Math.max(1, player.cash * 0.2 + 1);
  const coverage = income / Math.max(1, expenses);
  const debtToIncome = existingDebt / Math.max(1, income * 3);
  const equity = player.company?.balanceSheet?.equity ?? player.cash;
  const debtToAssets = loanType === 'business' && player.company
    ? (existingDebt + amount + Math.max(0, player.company.balanceSheet.debt ?? 0)) / Math.max(1, player.company.balanceSheet.cash + player.company.balanceSheet.inventoryValue + Math.max(0, equity))
    : (existingDebt + amount) / Math.max(1, player.cash + Math.max(0, equity));
  const negativeCashFlowPenalty = coverage < 0.85 ? (0.85 - coverage) * 0.34 : 0;
  const balanceSheetPenalty = debtToAssets > 0.62 ? (debtToAssets - 0.62) * 0.28 : 0;
  const collateral = loanType === 'mortgage'
    ? (player.housingStatus === 'owned'
      ? (player.housingTier === 'luxury' ? 400000 : player.housingTier === 'standard' ? 150000 : 50000)
      : 0)
    : loanType === 'business'
      ? Math.max(0, equity + (player.company?.balanceSheet.inventoryValue ?? 0) * 0.35)
      : Math.max(0, player.cash * 0.55);
  const haircut = market.creditConditions.collateralHaircut ?? 0.28;
  const collateralCoverage = collateral * (1 - haircut) / Math.max(1, amount);
  if (loanType === 'mortgage' && collateralCoverage <= 0) {
    return { approved: false, reason: '房贷需要可用于抵押的房产', maxAmount: 0 };
  }
  const bankTightness = loanType === 'business'
    ? market.creditConditions.businessCreditTightness
    : market.creditConditions.householdCreditTightness;
  const approvalRate = loanType === 'business'
    ? market.creditConditions.businessApprovalRate ?? 0.58
    : loanType === 'mortgage'
      ? market.creditConditions.mortgageApprovalRate
      : market.creditConditions.consumerApprovalRate ?? 0.62;
  const defaultHistoryPenalty = creditScore < 55 ? 0.18 + (55 - creditScore) / 100 * 0.22 : 0;
  const leveragePenalty = loanType === 'business'
    ? clamp((existingDebt + amount) / Math.max(1, equity + player.cash), 0, 3) * 0.1 + balanceSheetPenalty
    : clamp(debtToIncome, 0, 2) * 0.06;

  const riskScore = clamp(
    creditScore / 100 * 0.3
    + Math.min(1.25, coverage) * 0.22
    + Math.min(1.2, collateralCoverage) * 0.2
    + Math.max(0, 1 - debtToIncome) * 0.15
    + (market.creditConditions.lendingSentiment ?? 0.5) * 0.08
    + approvalRate * 0.12
    - bankTightness * 0.25
    - (market.creditConditions.badDebtPressure ?? 0.12) * 0.12
    - defaultHistoryPenalty
    - leveragePenalty
    - negativeCashFlowPenalty,
    0.05,
    1.4,
  );

  const baseLimit = loanType === 'business'
    ? 420000
    : loanType === 'mortgage'
      ? 280000
      : 60000;
  let maxAmount = Math.round(baseLimit * (0.55 + riskScore));
  if (loanType === 'business') {
    if (coverage < 0.65 && creditScore < 58) {
      maxAmount = Math.min(maxAmount, Math.round(Math.max(0, collateral * (1 - haircut) * 0.18)));
    }
    if (debtToAssets > 1.15) {
      maxAmount = Math.min(maxAmount, Math.round(Math.max(0, collateral * (1 - haircut) * 0.12)));
    }
    if (coverage < 0.45 && debtToAssets > 0.85 && creditScore < 55) {
      maxAmount = Math.min(maxAmount, Math.round(amount * 0.35));
    }
  }

  if (amount > maxAmount) {
    return {
      approved: false,
      reason: loanType === 'business'
        ? '企业现金流、抵押物或信用记录不足'
        : loanType === 'mortgage'
          ? '房贷审批未通过，抵押物或还款能力不足'
          : '信用额度不足',
      maxAmount,
    };
  }

  return { approved: true, maxAmount };
}

export function calculateAssetReturnMultiplier(assetType: InvestmentType, market: Market): number {
  const config = INVESTMENT_CONFIGS[assetType];
  const bankRate = market.bank?.centralBankRate ?? ECONOMY_BALANCE.bank.baseRate;
  const defaultRisk = market.creditConditions?.defaultRate ?? 0.03;
  const riskAppetite = clamp((market.macroState.businessConfidence + market.macroState.consumerConfidence) / 200, 0.25, 1.05);
  const profitExpectation = clamp(
    market.macroState.businessConfidence / 100
    + market.macroState.externalDemandIndex / 180
    - market.inventoryPressure.daily_necessities * 0.12
    - market.creditConditions.businessCreditTightness * 0.22,
    0.25,
    1.35,
  );
  const rateGap = bankRate - ECONOMY_BALANCE.bank.baseRate;
  const discountRatePressure = rateGap * 5;
  const rateIncomeBoost = Math.max(-0.02, rateGap * 4.2);
  const inflationExpectation = market.macroState.inflationExpectation;
  const safeHavenDemand = clamp(
    defaultRisk * 3
    + market.creditConditions.householdCreditTightness * 0.5
    + (market.economicCycle === 'downturn' || market.economicCycle === 'contraction' ? 0.18 : 0),
    0,
    1,
  );

  let expectedReturn = config.baseReturn;
  if (assetType === 'stock') {
    expectedReturn += profitExpectation * 0.06 + riskAppetite * 0.03 - discountRatePressure - defaultRisk * 0.18;
  } else if (assetType === 'bond') {
    expectedReturn += rateIncomeBoost - defaultRisk * 0.14 + (1 - riskAppetite) * 0.025 + safeHavenDemand * 0.018;
  } else if (assetType === 'gold') {
    expectedReturn += Math.max(0, inflationExpectation) * 0.55 + safeHavenDemand * 0.075 - riskAppetite * 0.02;
  } else if (assetType === 'deposit') {
    expectedReturn = Math.max(0, (market.bank?.depositRate ?? 0.003) - Math.max(0, market.inflationRate) * 0.15);
  }

  const volatility = assetType === 'deposit'
    ? 0
    : config.volatility * (assetType === 'stock' ? 0.75 + riskAppetite : assetType === 'gold' ? 0.7 + safeHavenDemand : 0.75 + defaultRisk);
  return Math.max(0.15, 1 + expectedReturn + (Math.random() - 0.5) * volatility);
}

export function applyPolicyEffectsToMarket(market: Market, policyTypes: PolicyType[]): Market {
  const nextMarket: Market = {
    ...market,
    goods: { ...market.goods },
    priceAnchors: { ...market.priceAnchors },
    externalSector: { ...(market.externalSector ?? DEFAULT_EXTERNAL_SECTOR) },
    laborMarket: market.laborMarket ? { ...market.laborMarket } : undefined,
    creditConditions: { ...(market.creditConditions ?? DEFAULT_CREDIT_CONDITIONS) },
  };

  for (const policyType of policyTypes) {
    const policy = POLICY_CONFIGS[policyType];
    if (policy.effect.socialStability) nextMarket.socialStability = clamp(nextMarket.socialStability + policy.effect.socialStability, 0, 100);
    if (policy.effect.inflation) nextMarket.inflationRate = clamp(nextMarket.inflationRate + policy.effect.inflation, -0.1, 0.3);
    if (policy.effect.employment) nextMarket.employmentRate = clamp(nextMarket.employmentRate + policy.effect.employment, 0, 100);

    if (policyType === 'infrastructure') {
      nextMarket.productivityBonus = Math.min(0.28, (nextMarket.productivityBonus ?? 0) + policy.cost / 180000);
      nextMarket.externalSector.logisticsStress = clamp(nextMarket.externalSector.logisticsStress - 0.08, 0.2, 2.4);
    }
    if (policyType === 'wage_control') {
      nextMarket.laborMarket = {
        baseWage: nextMarket.laborMarket?.baseWage ?? ECONOMY_BALANCE.worker.baseWage,
        unemploymentRate: nextMarket.laborMarket?.unemploymentRate ?? 0.06,
        skillPremium: nextMarket.laborMarket?.skillPremium ?? 0.01,
        minimumWage: Math.max(nextMarket.laborMarket?.minimumWage ?? 3500, ECONOMY_BALANCE.worker.baseWage * 0.82),
      };
      nextMarket.creditConditions.householdCreditTightness = clamp(nextMarket.creditConditions.householdCreditTightness - 0.025, 0.1, 0.95);
      nextMarket.creditConditions.businessCreditTightness = clamp(nextMarket.creditConditions.businessCreditTightness + 0.035, 0.1, 0.97);
    }
    if (policyType === 'price_control') {
      (['food', 'daily_necessities'] as GoodType[]).forEach(goodType => {
        const good = nextMarket.goods[goodType];
        nextMarket.goods[goodType] = {
          ...good,
          currentPrice: Math.max(good.basePrice * 0.75, good.currentPrice * 0.94),
          priceHistory: [...good.priceHistory.slice(-8), Math.round(Math.max(good.basePrice * 0.75, good.currentPrice * 0.94) * 100) / 100],
        };
        nextMarket.supplyDemand[goodType] = {
          ...nextMarket.supplyDemand[goodType],
          supply: Math.max(1, Math.round(nextMarket.supplyDemand[goodType].supply * 0.98)),
          demand: Math.max(1, Math.round(nextMarket.supplyDemand[goodType].demand * 1.03)),
        };
      });
    }
    if (policyType === 'import_tariff') {
      nextMarket.externalSector.importCostIndex = clamp(nextMarket.externalSector.importCostIndex + 8, 70, 190);
      nextMarket.externalSector.tradeBalance = clamp(nextMarket.externalSector.tradeBalance + 18, -500, 500);
      nextMarket.externalSector.logisticsStress = clamp(nextMarket.externalSector.logisticsStress + 0.04, 0.2, 2.4);
      nextMarket.creditConditions.businessCreditTightness = clamp(nextMarket.creditConditions.businessCreditTightness + 0.025, 0.1, 0.97);
    }
    if (policyType === 'export_promotion') {
      nextMarket.externalSector.exportDemandIndex = clamp(nextMarket.externalSector.exportDemandIndex + 10, 70, 170);
      nextMarket.externalSector.tradeBalance = clamp(nextMarket.externalSector.tradeBalance + 24, -500, 500);
      nextMarket.macroState = {
        ...nextMarket.macroState,
        externalDemandIndex: clamp(nextMarket.macroState.externalDemandIndex + 5, 70, 150),
      };
    }
    if (policyType === 'subsidy_business') {
      nextMarket.creditConditions.businessCreditTightness = clamp(nextMarket.creditConditions.businessCreditTightness - 0.035, 0.1, 0.97);
      nextMarket.macroState = {
        ...nextMarket.macroState,
        businessConfidence: clamp(nextMarket.macroState.businessConfidence + 4, 0, 100),
      };
    }
    if (policyType === 'subsidy_all' || policyType === 'subsidy_poor' || policyType === 'tax_cut') {
      nextMarket.creditConditions.householdCreditTightness = clamp(nextMarket.creditConditions.householdCreditTightness - 0.025, 0.1, 0.95);
      nextMarket.macroState = {
        ...nextMarket.macroState,
        consumerConfidence: clamp(nextMarket.macroState.consumerConfidence + 3, 0, 100),
      };
    }
  }

  return nextMarket;
}

export function describePolicyTransmission(market: Market, policyTypes: PolicyType[]): string {
  const fragments: string[] = [];
  if (policyTypes.includes('import_tariff')) fragments.push('进口关税提高进口成本，先推高企业上游投入，再传到商品价格');
  if (policyTypes.includes('export_promotion')) fragments.push('出口促进扩大外需，企业订单改善，但也会占用产能');
  if (policyTypes.includes('infrastructure')) fragments.push('基建改善物流和生产率，通常滞后降低供应链压力');
  if (policyTypes.includes('wage_control')) fragments.push('最低工资提升居民收入，同时抬高低利润企业用工成本');
  if (policyTypes.includes('price_control')) fragments.push('价格管制短期压低必需品价格，但可能让供给端更谨慎');
  if (policyTypes.includes('subsidy_business')) fragments.push('企业补贴缓解融资压力并改善企业信心');
  if (policyTypes.includes('subsidy_all') || policyTypes.includes('subsidy_poor') || policyTypes.includes('tax_cut')) fragments.push('居民现金流改善会先推升消费信心，再传导到市场需求');

  fragments.push(`当前外需指数 ${Math.round(market.externalSector?.exportDemandIndex ?? market.macroState.externalDemandIndex)}，进口成本指数 ${Math.round(market.externalSector?.importCostIndex ?? 100)}，信贷紧缩度 ${Math.round(((market.creditConditions.householdCreditTightness + market.creditConditions.businessCreditTightness) / 2) * 100)}。`);
  return fragments.join('；');
}

export function describePolicyEvaluation(market: Market, policyTypes: PolicyType[]): string {
  const residentNotes: string[] = [];
  const enterpriseNotes: string[] = [];
  const fiscalNotes: string[] = [];
  const inflationNotes: string[] = [];

  if (policyTypes.includes('tax_cut')) {
    residentNotes.push('减税改善居民现金流');
    enterpriseNotes.push('减税改善企业预期');
    fiscalNotes.push('短期压低财政收入');
  }
  if (policyTypes.includes('tax_raise')) {
    fiscalNotes.push('增税改善财政空间');
    residentNotes.push('居民可支配收入承压');
    enterpriseNotes.push('企业税负上升');
  }
  if (policyTypes.includes('subsidy_all') || policyTypes.includes('subsidy_poor')) {
    residentNotes.push('补贴提高居民满意度');
    fiscalNotes.push('补贴消耗国库资金');
    inflationNotes.push('需求被刺激后可能增加通胀压力');
  }
  if (policyTypes.includes('subsidy_business')) {
    enterpriseNotes.push('企业补贴缓解融资和成本压力');
    fiscalNotes.push('补贴需要财政承担');
  }
  if (policyTypes.includes('infrastructure')) {
    enterpriseNotes.push('基建改善物流和长期生产率');
    fiscalNotes.push('基建占用预算但可能扩大未来税基');
  }
  if (policyTypes.includes('wage_control')) {
    residentNotes.push('最低工资提高劳动者收入');
    enterpriseNotes.push('低利润企业用工成本上升');
  }
  if (policyTypes.includes('price_control')) {
    residentNotes.push('价格管制短期保护必需品消费');
    enterpriseNotes.push('利润受压可能削弱供给意愿');
  }
  if (policyTypes.includes('import_tariff')) {
    enterpriseNotes.push('进口依赖行业成本上升');
    fiscalNotes.push('关税可能改善贸易余额');
    inflationNotes.push('进口成本会推高终端价格');
  }
  if (policyTypes.includes('export_promotion')) {
    enterpriseNotes.push('出口促进扩大订单');
    fiscalNotes.push('外需改善有助于未来税收');
  }

  const macroContext = `当前财政压力${Math.round(market.macroState.fiscalPressure * 100)}%，通胀预期${formatSignedPercent(market.macroState.inflationExpectation)}，社会稳定${Math.round(market.socialStability)}/100。`;
  const fiscalContext = market.monthlyTaxRevenue !== undefined
    ? `本轮税收约¥${Math.round(market.monthlyTaxRevenue)}，信贷坏账压力${Math.round((market.creditConditions.badDebtPressure ?? 0.12) * 100)}%，会影响后续预算空间和政策执行效率。`
    : null;
  return [
    residentNotes.length ? `居民评价：${residentNotes.join('，')}` : null,
    enterpriseNotes.length ? `企业评价：${enterpriseNotes.join('，')}` : null,
    fiscalNotes.length ? `财政评价：${fiscalNotes.join('，')}` : null,
    inflationNotes.length ? `通胀评价：${inflationNotes.join('，')}` : null,
    macroContext,
    fiscalContext,
  ].filter(Boolean).join('；');
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
}

export function describeRoundCausalChain(market: Market, players: Player[]): string {
  const supplyLayers = [
    { label: '基础原料', layer: market.supplyChain.layers.basicMaterials },
    { label: '中间品', layer: market.supplyChain.layers.intermediateGoods },
    { label: '包装物流', layer: market.supplyChain.layers.packagingLogistics },
    { label: '能源', layer: market.supplyChain.layers.energy },
  ].sort((a, b) => (b.layer.priceIndex + b.layer.shortage * 80) - (a.layer.priceIndex + a.layer.shortage * 80));
  const movedGood = (Object.keys(market.priceAnchors) as GoodType[])
    .map(goodType => ({
      goodType,
      goodName: market.goods[goodType].name,
      pressure: market.priceAnchors[goodType].shortageIndex - market.priceAnchors[goodType].inventoryPressure,
      priceRatio: market.goods[goodType].currentPrice / Math.max(1, market.goods[goodType].basePrice),
    }))
    .sort((a, b) => Math.abs(b.pressure) + Math.abs(b.priceRatio - 1) - (Math.abs(a.pressure) + Math.abs(a.priceRatio - 1)))[0];
  const companyProfits = players
    .map(player => player.company?.stats.monthlyProfit ?? 0)
    .filter(value => Number.isFinite(value));
  const averageCompanyProfit = companyProfits.length
    ? companyProfits.reduce((sum, value) => sum + value, 0) / companyProfits.length
    : 0;
  const creditTightness = (market.creditConditions.householdCreditTightness + market.creditConditions.businessCreditTightness) / 2;
  const government = players.find(player => player.profession === 'government' && player.govAbilities);
  const approval = government?.govAbilities?.approvalRating;

  return [
    `本轮${CYCLE_LABEL[market.economicCycle]}由需求/库存、信贷和利润共同决定`,
    `${supplyLayers[0].label}压力最高（价格指数${Math.round(supplyLayers[0].layer.priceIndex)}、缺口${Math.round(supplyLayers[0].layer.shortage * 100)}%），已传导到行业成本`,
    `${movedGood.goodName}${movedGood.pressure >= 0 ? '短缺' : '库存'}压力最明显，终端价为基础价${movedGood.priceRatio.toFixed(2)}倍`,
    `信贷紧缩度${Math.round(creditTightness * 100)}%，坏账率${Math.round(market.creditConditions.defaultRate * 100)}%，会影响贷款审批和风险溢价`,
    `企业平均利润¥${Math.round(averageCompanyProfit)}，外需指数${Math.round(market.externalSector.exportDemandIndex)}，进口成本指数${Math.round(market.externalSector.importCostIndex)}`,
    approval === undefined ? null : `政府综合支持率${Math.round(approval)}%，会继续影响决策权和政策空间`,
  ].filter(Boolean).join('；');
}

const CYCLE_LABEL: Record<Market['economicCycle'], string> = {
  growth: '增长期',
  overheating: '过热期',
  downturn: '下行期',
  contraction: '收缩期',
};

export function deriveEconomicCycle(
  market: Market,
  players: Player[],
): { economicCycle: Market['economicCycle']; cyclePhase: number } {
  const demandSupplyRatio = Object.values(market.supplyDemand).reduce((sum, sd) => sum + sd.demand / Math.max(1, sd.supply), 0)
    / Math.max(1, Object.values(market.supplyDemand).length);
  const inventoryPressure = getAverageInventoryPressure(market);
  const shortagePressure = getAverageShortageIndex(market);
  const companyProfits = players
    .map(player => player.company?.stats.monthlyProfit ?? 0)
    .filter(profit => Number.isFinite(profit));
  const averageProfit = companyProfits.length
    ? companyProfits.reduce((sum, profit) => sum + profit, 0) / companyProfits.length
    : 0;
  const creditEase = 1 - (market.creditConditions.businessCreditTightness + market.creditConditions.householdCreditTightness) / 2;
  const demandHeat = demandSupplyRatio + shortagePressure * 0.6 - inventoryPressure * 0.45;
  const inflationHeat = market.inflationRate + market.macroState.inflationExpectation;
  const profitPulse = clamp(averageProfit / 12000, -0.6, 0.8);
  const expansionScore = demandHeat * 0.45 + creditEase * 0.28 + profitPulse * 0.2 + market.macroState.businessConfidence / 350;
  const stressScore = market.creditConditions.defaultRate * 2
    + market.macroState.unemploymentPressure * 0.9
    + inventoryPressure * 0.55
    - profitPulse * 0.25;

  let economicCycle: Market['economicCycle'];
  if (stressScore > 0.72 || expansionScore < 0.62) {
    economicCycle = 'contraction';
  } else if (stressScore > 0.46 || inventoryPressure > 0.42) {
    economicCycle = 'downturn';
  } else if (inflationHeat > 0.105 || demandHeat > 1.28) {
    economicCycle = 'overheating';
  } else {
    economicCycle = 'growth';
  }

  const phaseDirection = economicCycle === market.economicCycle ? 1 : -1;
  return {
    economicCycle,
    cyclePhase: economicCycle === market.economicCycle
      ? Math.min(5, market.cyclePhase + phaseDirection)
      : 0,
  };
}

export function applyPolicyTransmission(market: Market, players: Player[]): { market: Market; playerCashDelta: Record<string, number> } {
  const playerCashDelta: Record<string, number> = {};
  let nextMarket = { ...market };

  if (market.globalTaxRate < 0.18) {
    nextMarket = {
      ...nextMarket,
      macroState: {
        ...nextMarket.macroState,
        consumerConfidence: clamp(nextMarket.macroState.consumerConfidence + 2, 0, 100),
        businessConfidence: clamp(nextMarket.macroState.businessConfidence + 2, 0, 100),
      },
    };
  }

  if ((market.laborMarket?.minimumWage ?? 0) > ECONOMY_BALANCE.worker.baseWage * 0.8) {
    players.forEach(player => {
      if (player.profession === 'worker') {
        playerCashDelta[player.id] = (playerCashDelta[player.id] ?? 0) + 260;
      }
      if (player.company) {
        playerCashDelta[player.id] = (playerCashDelta[player.id] ?? 0) - player.company.employees * 90;
      }
    });
    nextMarket.employmentRate = clamp(nextMarket.employmentRate - 0.8, 30, 100);
  }

  if (market.globalTaxRate > 0.22) {
    nextMarket.externalSector = {
      ...(nextMarket.externalSector ?? DEFAULT_EXTERNAL_SECTOR),
      importCostIndex: clamp((nextMarket.externalSector?.importCostIndex ?? 100) + 2, 70, 190),
      tradeBalance: clamp((nextMarket.externalSector?.tradeBalance ?? 0) - 8, -500, 500),
    };
  }

  if (market.globalTaxRate < 0.18) {
    nextMarket.externalSector = {
      ...(nextMarket.externalSector ?? DEFAULT_EXTERNAL_SECTOR),
      exportDemandIndex: clamp((nextMarket.externalSector?.exportDemandIndex ?? 100) + 2, 70, 170),
    };
  }

  return { market: nextMarket, playerCashDelta };
}

export function updateMarketAnchors(market: Market): Market {
  const priceAnchors = { ...market.priceAnchors };
  const inventoryPressure = { ...market.inventoryPressure };
  const shortageIndex = { ...market.shortageIndex };
  const goods = { ...market.goods };

  (Object.keys(market.goods) as GoodType[]).forEach(goodType => {
    const sd = market.supplyDemand[goodType];
    const good = goods[goodType];
    const inventoryRatio = sd.supply / Math.max(1, sd.demand);
    const shortage = clamp((sd.demand - sd.supply) / Math.max(1, sd.demand), 0, 1.25);
    const inventory = clamp((sd.supply - sd.demand) / Math.max(1, sd.supply), 0, 1.25);
    const anchor = priceAnchors[goodType];
    const externalCostShock = ((market.externalSector?.importCostIndex ?? 100) - 100) / 420
      + ((market.externalSector?.energyPriceIndex ?? 100) - 100) / 650
      + ((market.externalSector?.logisticsStress ?? 1) - 1) * 0.05
      + getGoodSupplyChainPressure(market, goodType) * 0.28;
    const currentPriceRatio = good.currentPrice / Math.max(1, good.basePrice);
    const highPriceMeanReversion = currentPriceRatio > 1.55
      ? Math.min(good.essential ? 0.12 : 0.24, (currentPriceRatio - 1.55) * (good.essential ? 0.06 : 0.095))
      : 0;
    const shortagePassThrough = shortage * (currentPriceRatio > 1.8 ? 0.055 : 0.145);
    const priceShock = shortagePassThrough
      - inventory * 0.12
      + market.inflationRate * 0.1
      + market.macroState.inflationExpectation * 0.08
      + externalCostShock
      - highPriceMeanReversion;
    const nextPrice = Math.max(good.basePrice * 0.45, Math.min(good.basePrice * 3.2, good.currentPrice * (1 + priceShock)));

    inventoryPressure[goodType] = Number(inventory.toFixed(3));
    shortageIndex[goodType] = Number(shortage.toFixed(3));
    priceAnchors[goodType] = {
      referencePrice: Number((anchor.referencePrice * 0.82 + nextPrice * 0.18).toFixed(2)),
      lastClearingPrice: Number(nextPrice.toFixed(2)),
      inventoryPressure: inventoryPressure[goodType],
      shortageIndex: shortageIndex[goodType],
    };
    goods[goodType] = {
      ...good,
      currentPrice: Math.round(nextPrice * 100) / 100,
      priceHistory: [...good.priceHistory.slice(-8), Math.round(nextPrice * 100) / 100],
    };

    const priceRatio = nextPrice / Math.max(1, good.basePrice);
    const elasticity = good.essential ? 0.22 : good.elasticity;
    const priceDemandDrag = priceRatio > 1.25
      ? clamp((priceRatio - 1.25) * elasticity * 0.12, 0, good.essential ? 0.08 : 0.24)
      : 0;
    if (inventoryRatio > 1.25) {
      market.supplyDemand[goodType].demand = Math.round(sd.demand * (0.96 - priceDemandDrag));
    } else if (inventoryRatio < 0.92) {
      market.supplyDemand[goodType].demand = Math.round(sd.demand * (1.03 - priceDemandDrag));
    } else if (priceDemandDrag > 0) {
      market.supplyDemand[goodType].demand = Math.round(sd.demand * (1 - priceDemandDrag));
    }
  });

  return {
    ...market,
    goods,
    priceAnchors,
    inventoryPressure,
    shortageIndex,
  };
}

export function getNpcSupplyContribution(npcFirms: NpcFirm[]): Partial<Record<GoodType, number>> {
  return npcFirms.reduce((acc, firm) => {
    const goodType = industryToGoodType[firm.industry];
    if (!goodType || firm.status === 'exited') return acc;
    acc[goodType] = (acc[goodType] ?? 0) + firm.plannedSupply;
    return acc;
  }, {} as Partial<Record<GoodType, number>>);
}

export function getCompanyIndustry(company: Company): IndustryType {
  return company.industry ?? company.productionType;
}
