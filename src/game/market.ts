import { GoodType, Market } from '@/types/game';

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
