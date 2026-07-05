import { createInitialGameState } from '../src/game/initial-state';
import {
  recalculatePlayerMarketShare,
  updateMarketAnchors,
  updateNpcFirmsForMacro,
} from '../src/game/market';
import { Company, GameState, Market, NpcFirm, Player } from '../src/types/game';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createState(): GameState {
  return createInitialGameState([
    { id: 'strong', name: '强企业家', color: '#16a34a', profession: 'entrepreneur' },
    { id: 'weak', name: '弱企业家', color: '#f97316', profession: 'entrepreneur' },
  ], 'professional');
}

type CompanyOverride = Omit<Partial<Company>, 'balanceSheet' | 'cashFlow' | 'incomeStatement'> & {
  balanceSheet?: Partial<Company['balanceSheet']>;
  cashFlow?: Partial<Company['cashFlow']>;
  incomeStatement?: Partial<Company['incomeStatement']>;
};

function company(overrides: CompanyOverride): Company {
  const state = createState();
  const base = state.players.find(player => player.id === 'strong')!.company!;
  return {
    ...clone(base),
    ...overrides,
    cashFlow: {
      ...base.cashFlow,
      ...(overrides.cashFlow ?? {}),
    },
    balanceSheet: {
      ...base.balanceSheet,
      ...(overrides.balanceSheet ?? {}),
    },
    incomeStatement: {
      ...base.incomeStatement,
      ...(overrides.incomeStatement ?? {}),
    },
  };
}

function playerWithCompany(id: string, companyData: Company): Player {
  const state = createState();
  const base = state.players.find(player => player.id === id)!;
  return {
    ...base,
    company: companyData,
  };
}

function assertPlayerCompetitionAffectsShare(): void {
  const state = createState();
  const market = clone(state.market);
  market.npcFirms = [
    {
      id: 'npc_competitor',
      industry: 'food',
      employees: 30,
      capacity: 900,
      wageOffer: 5200,
      financialHealth: 64,
      plannedSupply: 860,
      pricingPower: 0.14,
      marketShare: 55,
      brand: 55,
      quality: 55,
      deliveryReliability: 58,
      costControl: 58,
      status: 'active',
    },
  ];
  const strongCompany = company({
    ownerId: 'strong',
    productionType: 'food',
    industry: 'food',
    productQuality: 88,
    reputation: 86,
    machines: 4,
    employees: 8,
    inventory: 120,
    efficiency: 84,
    morale: 86,
    marketShare: 12,
    cashFlow: { final: 120000 },
  });
  const weakCompany = company({
    ownerId: 'weak',
    productionType: 'food',
    industry: 'food',
    productQuality: 42,
    reputation: 36,
    machines: 1,
    employees: 3,
    inventory: 1500,
    efficiency: 42,
    morale: 38,
    marketShare: 12,
    cashFlow: { final: 3000 },
  });
  const players = [
    playerWithCompany('strong', strongCompany),
    playerWithCompany('weak', weakCompany),
  ];
  const nextPlayers = recalculatePlayerMarketShare(players, {
    strong: { type: 'food', sold: 500 },
    weak: { type: 'food', sold: 500 },
  }, market);
  const strongShare = nextPlayers.find(player => player.id === 'strong')!.company!.marketShare;
  const weakShare = nextPlayers.find(player => player.id === 'weak')!.company!.marketShare;
  if (strongShare <= weakShare + 18) {
    throw new Error(`品牌/质量/交付优势没有明显转化为市场份额: strong=${strongShare}, weak=${weakShare}`);
  }
}

function demandBoomMarket(base: Market): Market {
  const market = clone(base);
  market.creditConditions = {
    ...market.creditConditions,
    businessApprovalRate: 0.82,
    businessCreditTightness: 0.24,
  };
  market.macroState = {
    ...market.macroState,
    businessConfidence: 82,
    externalDemandIndex: 128,
  };
  market.supplyDemand.food = { supply: 520, demand: 1800 };
  market.priceAnchors.food = {
    ...market.priceAnchors.food,
    shortageIndex: 0.32,
    inventoryPressure: 0,
  };
  market.npcFirms = market.npcFirms.filter(firm => firm.industry !== 'food').slice(0, 3);
  return market;
}

function stressMarket(base: Market, firm: NpcFirm): Market {
  const market = clone(base);
  market.inflationRate = 0.12;
  market.creditConditions = {
    ...market.creditConditions,
    businessApprovalRate: 0.16,
    businessCreditTightness: 0.92,
  };
  market.externalSector = {
    ...market.externalSector,
    logisticsStress: 2.1,
    energyPriceIndex: 172,
    importCostIndex: 168,
  };
  market.macroState = {
    ...market.macroState,
    businessConfidence: 22,
    externalDemandIndex: 72,
  };
  market.supplyDemand.food = { supply: 2200, demand: 600 };
  market.priceAnchors.food = {
    ...market.priceAnchors.food,
    shortageIndex: 0,
    inventoryPressure: 0.42,
  };
  market.npcFirms = [firm];
  return updateMarketAnchors(market);
}

function assertNpcEntryAndExitRespondToMarket(): void {
  const state = createState();
  const boom = demandBoomMarket(state.market);
  const withEntrants = updateNpcFirmsForMacro(boom);
  if (!withEntrants.some(firm => firm.industry === 'food' && firm.id.includes('entrant'))) {
    throw new Error('需求强且信贷开放时，NPC 企业没有进入市场');
  }

  const weakFirm: NpcFirm = {
    id: 'npc_weak_food',
    industry: 'food',
    employees: 18,
    capacity: 500,
    wageOffer: 5200,
    financialHealth: 21,
    plannedSupply: 420,
    pricingPower: 0.08,
    marketShare: 30,
    brand: 28,
    quality: 34,
    deliveryReliability: 30,
    costControl: 26,
    status: 'distressed',
  };
  const stressed = stressMarket(state.market, weakFirm);
  const updated = updateNpcFirmsForMacro(stressed);
  const result = updated.find(firm => firm.id === weakFirm.id);
  if (!result || (result.status !== 'exited' && result.status !== 'distressed' && result.status !== 'shrinking')) {
    throw new Error(`成本冲击和库存压力下，弱 NPC 企业没有退出/收缩: ${result?.status}`);
  }
  if ((result?.plannedSupply ?? 1) > weakFirm.plannedSupply) {
    throw new Error('弱 NPC 企业在压力下反而扩大供给');
  }
}

assertPlayerCompetitionAffectsShare();
assertNpcEntryAndExitRespondToMarket();
console.log('Enterprise competition passed: brand/quality/delivery affect share, NPC firms enter strong markets and shrink or exit stressed markets.');
