import {
  Company,
  ECONOMY_BALANCE,
  GoodType,
  HouseholdSegment,
  IndustryType,
  Market,
  NpcFirm,
  Player,
} from '@/types/game';

export const MARKET_DEMAND_SCALE = 12;

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
    const effectiveBudget = purchasingPower * confidence * inflationPenalty * incomeStress;

    base.food += 9 * household.populationShare * (household.demandBias.food ?? 1) * Math.max(0.85, effectiveBudget);
    base.daily_necessities += 6 * household.populationShare * (household.demandBias.daily_necessities ?? 1) * Math.max(0.82, effectiveBudget);
    base.housing += 0.8 * household.populationShare * clamp(1 - market.creditConditions.mortgageApprovalRate * 0.15 + market.creditConditions.householdCreditTightness * 0.2, 0.5, 1.25);
    base.transportation += 1.5 * household.populationShare * effectiveBudget;
    base.entertainment += 2.4 * household.populationShare * (household.demandBias.entertainment ?? 1) * effectiveBudget;
    base.luxury += 0.9 * household.populationShare * (household.demandBias.luxury ?? 1) * Math.max(0, effectiveBudget - 0.45);
    base.education += 1.1 * household.populationShare * (0.9 + household.averageIncome / 30000);
    base.healthcare += 0.9 * household.populationShare * (1 + market.shortageIndex.healthcare * 0.2);
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

  const nextShares = market.households.map(household => {
    const movement = household.id === 'low_income'
      ? clamp(0.02 + market.macroState.unemploymentPressure * 0.05 + market.inflationRate * 0.1 - mobility * 0.03, -0.04, 0.06)
      : household.id === 'high_income'
        ? clamp(0.01 + mobility * 0.03 - market.macroState.unemploymentPressure * 0.02, -0.03, 0.04)
        : clamp(-0.01 + market.macroState.socialMobilityIndex * 0.0005, -0.03, 0.03);
    return {
      ...household,
      populationShare: Math.max(0.05, household.populationShare + movement),
    };
  });
  const shareTotal = nextShares.reduce((sum, household) => sum + household.populationShare, 0);

  return nextShares.map(household => {
    const normalizedShare = household.populationShare / Math.max(0.1, shareTotal);
    const incomeGrowth = clamp(
      employmentPulse * 0.06 + market.macroState.externalDemandIndex / 1000 - market.inflationRate * 0.6,
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
  return market.npcFirms.map(firm => {
    const goodType = industryToGoodType[firm.industry];
    const anchor = goodType ? market.priceAnchors[goodType] : null;
    const demandSupport = goodType ? market.supplyDemand[goodType].demand / Math.max(1, initialSupplyDemand[goodType].demand) : 1;
    const costPressure = market.inflationRate * 0.8 + market.creditConditions.businessCreditTightness * 0.15;
    const financialHealth = clamp(
      firm.financialHealth
      + demandSupport * 8
      + market.macroState.businessConfidence * 0.04
      + market.macroState.externalDemandIndex * 0.02
      - costPressure * 100 * 0.35
      - (anchor?.inventoryPressure ?? 0) * 12,
      20,
      90,
    );
    const expansionFactor = clamp(
      0.82 + financialHealth / 130 + market.macroState.businessConfidence / 220 - market.creditConditions.businessCreditTightness * 0.18,
      0.55,
      1.5,
    );
    const plannedSupply = Math.max(60, Math.round(firm.capacity * expansionFactor));
    const wageOffer = Math.round(
      firm.wageOffer
      * (1 + (market.laborMarket?.skillPremium ?? 0.01) * 0.8)
      * (1 + Math.max(-0.04, (market.employmentRate - 70) / 500)),
    );

    return {
      ...firm,
      financialHealth,
      capacity: Math.max(120, Math.round(firm.capacity * clamp(0.96 + financialHealth / 260, 0.86, 1.08))),
      plannedSupply,
      wageOffer,
      pricingPower: clamp(firm.pricingPower + (anchor?.shortageIndex ?? 0) * 0.03 - (anchor?.inventoryPressure ?? 0) * 0.04, 0.04, 0.55),
    };
  });
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
      - market.inflationRate * 100 * 0.2
      - market.creditConditions.householdCreditTightness * 10,
      25,
      85,
    ),
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
    const priceShock = shortage * 0.16 - inventory * 0.12 + market.inflationRate * 0.1 + market.macroState.inflationExpectation * 0.08;
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

    if (inventoryRatio > 1.25) {
      market.supplyDemand[goodType].demand = Math.round(sd.demand * 0.96);
    } else if (inventoryRatio < 0.92) {
      market.supplyDemand[goodType].demand = Math.round(sd.demand * 1.03);
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
    if (!goodType) return acc;
    acc[goodType] = (acc[goodType] ?? 0) + firm.plannedSupply;
    return acc;
  }, {} as Partial<Record<GoodType, number>>);
}

export function getCompanyIndustry(company: Company): IndustryType {
  return company.industry ?? company.productionType;
}
