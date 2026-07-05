import { GameState, GoodType, RandomEvent } from '@/types/game';
import { applyDemandMultiplier } from '@/game/market';

const generateId = () => Math.random().toString(36).substring(2, 15);

type NewsTemplate = Omit<RandomEvent, 'id' | 'probability'> & {
  id: string;
  probability: number;
};

export const NEWS_EVENTS: NewsTemplate[] = [
  {
    id: 'harvest_delay',
    type: 'natural_disaster',
    name: '粮食运输受阻',
    icon: '🚚',
    description: '连续降雨让部分城市的食品运输变慢，超市补货减少。',
    story: '新闻里说，食品不是凭空出现在货架上的。农场、道路、仓库和商店构成供应链，任何一环变慢，食品供应都会减少。',
    explanation: '食品供给减少后，食品价格上升；如果玩家没有储备食品，回合结算时健康和幸福度会受到影响。',
    effects: {
      inflation: 0.02,
      socialStability: -2,
      specificGoodPrice: { goodType: 'food', multiplier: 1.18 },
      demandMultiplier: { food: 1.18 },
      externalSector: {
        logisticsStress: 0.16,
        energyPriceIndex: 3,
      },
    },
    probability: 0.15,
    duration: 1,
    warning: '食品属于必需品，优先储备可以降低生活风险。',
    transmissionChannels: ['enterprise_cost', 'logistics'],
  },
  {
    id: 'school_training',
    type: 'growth',
    name: '职业培训计划',
    icon: '🎓',
    description: '城市推出职业培训课程，更多人能找到合适工作。',
    story: '当劳动者学会新技能，企业更容易招聘到合适员工，整体就业率会提高。',
    explanation: '就业率上升通常会提高社会稳定，也会改善劳动者议价能力。',
    effects: {
      employment: 6,
      socialStability: 3,
    },
    probability: 0.14,
    duration: 1,
    warning: '教育和培训是提升长期收入的重要方式。',
    transmissionChannels: ['household_income', 'policy_expectation'],
  },
  {
    id: 'credit_tightening',
    type: 'policy_change',
    name: '银行收紧贷款',
    icon: '🏦',
    description: '银行担心坏账增加，提高贷款审核标准。',
    story: '贷款不是免费的钱。银行借钱给别人时，会考虑对方能否按时还款。风险升高时，贷款更贵也更难拿到。',
    explanation: '信贷收紧会让企业扩张和买房更谨慎，短期内经济活动降温，但也能减少过度借债。',
    effects: {
      inflation: -0.01,
      employment: -2,
      socialStability: -1,
      stockMarket: { indexChange: -0.04, volatilityChange: 0.04 },
      creditTightness: {
        household: 0.06,
        business: 0.08,
        defaultRate: 0.01,
      },
    },
    probability: 0.13,
    duration: 1,
    warning: '负债越高，越需要关注现金流和利息。',
    transmissionChannels: ['credit', 'policy_expectation'],
  },
  {
    id: 'consumer_festival',
    type: 'market_boom',
    name: '消费节开幕',
    icon: '🛍️',
    description: '商场和平台推出促销活动，居民消费意愿明显提高。',
    story: '当大家更愿意消费，企业更容易卖出商品，市场需求会上升。',
    explanation: '需求上升会推高企业销量和股市情绪，但如果供给跟不上，也可能带来通胀。',
    effects: {
      inflation: 0.02,
      employment: 3,
      socialStability: 2,
      stockMarket: { indexChange: 0.06, volatilityChange: 0.02 },
      externalSector: {
        exportDemandIndex: 4,
      },
      demandMultiplier: {
        food: 1.08,
        daily_necessities: 1.1,
        entertainment: 1.35,
        luxury: 1.25,
      },
    },
    probability: 0.16,
    duration: 1,
    warning: '需求变强时，企业可扩产，但也要避免库存过多。',
    transmissionChannels: ['household_income', 'external_demand'],
  },
  {
    id: 'medical_capacity',
    type: 'policy_change',
    name: '社区医疗扩容',
    icon: '🏥',
    description: '社区医院增加药品和医生排班，医疗服务更容易获得。',
    story: '公共服务能降低家庭面对疾病时的压力。医疗供给越充足，健康风险越容易被控制。',
    explanation: '医疗供给改善会提升社会稳定，并缓和健康类商品价格压力。',
    effects: {
      socialStability: 4,
      specificGoodPrice: { goodType: 'healthcare', multiplier: 0.9 },
    },
    probability: 0.12,
    duration: 1,
    warning: '健康是劳动、学习和经营的基础。',
    transmissionChannels: ['policy_expectation', 'household_income'],
  },
  {
    id: 'factory_automation',
    type: 'tech_breakthrough',
    name: '工厂自动化升级',
    icon: '🤖',
    description: '新机器降低部分企业的生产成本，市场供应增加。',
    story: '技术进步会让同样的人和材料生产出更多商品，这叫生产率提高。',
    explanation: '生产率提高通常会增加就业机会和股市信心，也可能让商品价格更稳定。',
    effects: {
      inflation: -0.01,
      employment: 4,
      stockMarket: { indexChange: 0.08, volatilityChange: 0.03 },
      cycleShift: 'growth',
      externalSector: {
        energyPriceIndex: -2,
        logisticsStress: -0.04,
      },
      demandMultiplier: {
        daily_necessities: 1.08,
        entertainment: 1.12,
        luxury: 1.08,
      },
    },
    probability: 0.15,
    duration: 1,
    warning: '企业投资机器时，要比较机器成本和新增产能。',
    transmissionChannels: ['enterprise_cost', 'logistics'],
  },
  {
    id: 'energy_price_shock',
    type: 'inflation_surge',
    name: '国际能源价格跳升',
    icon: '⛽',
    description: '国际能源价格上涨，运输和工厂用能成本同步抬升。',
    story: '能源是很多行业共同的上游投入。油价、电价和运输费用上涨后，企业生产同样数量商品需要付出更高成本。',
    explanation: '能源冲击会先推高企业成本和物流费用，再传导到食品、日用品等终端价格，也会压缩企业利润。',
    effects: {
      inflation: 0.025,
      employment: -1,
      socialStability: -2,
      specificGoodPrice: { goodType: 'transportation', multiplier: 1.14 },
      demandMultiplier: {
        food: 1.04,
        daily_necessities: 1.05,
        entertainment: 0.94,
        luxury: 0.9,
      },
      stockMarket: { indexChange: -0.03, volatilityChange: 0.04 },
      externalSector: {
        energyPriceIndex: 14,
        logisticsStress: 0.08,
        importCostIndex: 4,
        tradeBalance: -18,
      },
    },
    probability: 0.1,
    duration: 2,
    warning: '能源上涨会同时影响成本、价格和居民可支配收入。',
    transmissionChannels: ['enterprise_cost', 'logistics', 'household_income'],
  },
  {
    id: 'port_congestion',
    type: 'natural_disaster',
    name: '港口物流拥堵',
    icon: '🚢',
    description: '主要港口出现排队和延误，进口原料与出口订单交付变慢。',
    story: '供应链不只看工厂产能，还要看货物能不能按时进出。港口堵塞会让原料到厂变慢，也会让成品交付变慢。',
    explanation: '物流压力上升会提高包装/物流成本，食品和日用品更容易缺货，出口导向行业的收入也会承压。',
    effects: {
      inflation: 0.018,
      employment: -2,
      socialStability: -2,
      demandMultiplier: {
        food: 1.08,
        daily_necessities: 1.08,
        entertainment: 0.96,
        luxury: 0.92,
      },
      externalSector: {
        logisticsStress: 0.22,
        importCostIndex: 7,
        exportDemandIndex: -6,
        tradeBalance: -24,
      },
    },
    probability: 0.1,
    duration: 2,
    warning: '物流压力高时，库存周转和现金流管理会更重要。',
    transmissionChannels: ['logistics', 'enterprise_cost', 'external_demand'],
  },
  {
    id: 'import_material_spike',
    type: 'inflation_surge',
    name: '进口原材料涨价',
    icon: '🏗️',
    description: '海外矿产和中间品价格上涨，依赖进口投入的企业成本上升。',
    story: '很多商品需要先购买上游原料或中间品。上游涨价不会立刻等于终端涨价，但会通过生产成本逐步传导。',
    explanation: '进口成本上升会推高企业材料成本，日用品和奢侈品受中间品影响更明显，企业若定价不当会被压缩利润。',
    effects: {
      inflation: 0.02,
      employment: -1,
      stockMarket: { indexChange: -0.025, volatilityChange: 0.025 },
      externalSector: {
        importCostIndex: 13,
        tradeBalance: -20,
      },
      demandMultiplier: {
        daily_necessities: 1.04,
        luxury: 0.9,
      },
    },
    probability: 0.1,
    duration: 2,
    warning: '原料成本冲击下，企业要比较涨价、减产和库存策略。',
    transmissionChannels: ['enterprise_cost', 'external_demand'],
  },
  {
    id: 'export_order_boom',
    type: 'market_boom',
    name: '海外订单增加',
    icon: '🌐',
    description: '海外客户增加采购，本地企业获得更多外部需求。',
    story: '企业的销量不只来自本地居民，也可能来自外部市场。外需改善会增加订单，带动就业和企业利润。',
    explanation: '出口需求上升会提高企业销量、改善贸易余额，并让股票市场更看好企业盈利。',
    effects: {
      employment: 3,
      socialStability: 2,
      stockMarket: { indexChange: 0.055, volatilityChange: 0.015 },
      cycleShift: 'growth',
      externalSector: {
        exportDemandIndex: 14,
        tradeBalance: 34,
      },
      demandMultiplier: {
        daily_necessities: 1.12,
        entertainment: 1.08,
        luxury: 1.1,
      },
    },
    probability: 0.1,
    duration: 2,
    warning: '外需改善适合扩产，但仍要防止过度库存。',
    transmissionChannels: ['external_demand', 'enterprise_cost', 'household_income'],
  },
  {
    id: 'foreign_recession',
    type: 'downturn',
    name: '海外经济放缓',
    icon: '📉',
    description: '主要海外市场消费降温，外部订单减少。',
    story: '当外部市场进入衰退，本地企业即使生产效率不变，也可能因为订单减少而卖不出去。',
    explanation: '外需下滑会降低企业销量和盈利预期，压制股票表现，并使企业招聘和扩产更谨慎。',
    effects: {
      inflation: -0.008,
      employment: -3,
      socialStability: -2,
      stockMarket: { indexChange: -0.07, volatilityChange: 0.06 },
      creditTightness: {
        business: 0.035,
        defaultRate: 0.008,
      },
      externalSector: {
        exportDemandIndex: -16,
        tradeBalance: -30,
      },
      demandMultiplier: {
        entertainment: 0.86,
        luxury: 0.78,
      },
    },
    probability: 0.1,
    duration: 2,
    warning: '外需下降时，企业应优先控制库存和债务。',
    transmissionChannels: ['external_demand', 'credit', 'policy_expectation'],
  },
  {
    id: 'currency_import_pressure',
    type: 'inflation_surge',
    name: '汇率带来进口压力',
    icon: '💱',
    description: '汇率波动使进口商品和原料折算成本上升。',
    story: '如果进口需要用更贵的外币结算，同样数量的海外原料会变得更贵，企业的采购预算会被挤压。',
    explanation: '进口成本上升会抬高材料价格和通胀预期，同时让银行更关注企业现金流和债务压力。',
    effects: {
      inflation: 0.018,
      socialStability: -1,
      creditTightness: {
        household: 0.018,
        business: 0.025,
      },
      externalSector: {
        importCostIndex: 10,
        tradeBalance: -16,
      },
      demandMultiplier: {
        luxury: 0.88,
      },
    },
    probability: 0.09,
    duration: 2,
    warning: '进口成本上升时，高进口依赖行业更容易利润承压。',
    transmissionChannels: ['enterprise_cost', 'credit', 'external_demand'],
  },
  {
    id: 'global_risk_off',
    type: 'economic_crisis',
    name: '全球避险情绪升温',
    icon: '🛡️',
    description: '全球投资者降低风险资产仓位，银行也更谨慎放贷。',
    story: '金融市场的风险偏好会影响实体经济。投资者更保守时，股票承压，银行更重视坏账，企业融资变难。',
    explanation: '避险情绪上升会提高信贷紧缩度和股市波动，债券、黄金和存款的相对吸引力会提高。',
    effects: {
      employment: -2,
      socialStability: -2,
      stockMarket: { indexChange: -0.09, volatilityChange: 0.09 },
      creditTightness: {
        household: 0.04,
        business: 0.06,
        defaultRate: 0.012,
      },
      externalSector: {
        exportDemandIndex: -5,
        tradeBalance: -10,
      },
      demandMultiplier: {
        entertainment: 0.88,
        luxury: 0.76,
      },
    },
    probability: 0.09,
    duration: 2,
    warning: '金融收紧时，高杠杆和高库存都会放大风险。',
    transmissionChannels: ['credit', 'external_demand', 'policy_expectation'],
  },
  {
    id: 'shipping_recovery',
    type: 'growth',
    name: '航运恢复正常',
    icon: '🧭',
    description: '航运排队缓解，物流成本下降，进口和出口交付改善。',
    story: '当运输恢复顺畅，原料更快到厂，成品也更快送达客户，供应链成本会下降。',
    explanation: '物流恢复会缓解通胀压力，改善企业交付能力和外部订单完成率。',
    effects: {
      inflation: -0.012,
      employment: 2,
      socialStability: 2,
      stockMarket: { indexChange: 0.035, volatilityChange: -0.02 },
      externalSector: {
        logisticsStress: -0.18,
        importCostIndex: -5,
        exportDemandIndex: 6,
        energyPriceIndex: -3,
        tradeBalance: 18,
      },
      demandMultiplier: {
        daily_necessities: 1.06,
        entertainment: 1.08,
      },
    },
    probability: 0.09,
    duration: 2,
    warning: '物流改善时，企业可以提高周转，但也要防止盲目扩产。',
    transmissionChannels: ['logistics', 'enterprise_cost', 'external_demand'],
  },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function applyLingeringNewsPressure(market: GameState['market'], events: RandomEvent[]): void {
  events.forEach(event => {
    if ((event.remainingDuration ?? event.duration ?? 0) <= 0) return;

    if (event.effects.inflation) {
      market.inflationRate = clamp(market.inflationRate + event.effects.inflation * 0.18, -0.1, 0.3);
    }
    if (event.effects.employment) {
      market.employmentRate = clamp(market.employmentRate + event.effects.employment * 0.12, 30, 100);
    }
    if (event.effects.socialStability) {
      market.socialStability = clamp(market.socialStability + event.effects.socialStability * 0.12, 0, 100);
    }
    if (event.effects.stockMarket) {
      market.stockMarket = {
        ...market.stockMarket,
        volatility: clamp(market.stockMarket.volatility + event.effects.stockMarket.volatilityChange * 0.12, 0.03, 1),
      };
    }
    if (event.effects.creditTightness) {
      market.creditConditions = {
        ...market.creditConditions,
        householdCreditTightness: clamp(market.creditConditions.householdCreditTightness + (event.effects.creditTightness.household ?? 0) * 0.16, 0.1, 0.95),
        businessCreditTightness: clamp(market.creditConditions.businessCreditTightness + (event.effects.creditTightness.business ?? 0) * 0.16, 0.1, 0.97),
        defaultRate: clamp(market.creditConditions.defaultRate + (event.effects.creditTightness.defaultRate ?? 0) * 0.14, 0.01, 0.22),
      };
    }
    if (event.effects.externalSector) {
      market.externalSector = {
        ...market.externalSector,
        importCostIndex: clamp(market.externalSector.importCostIndex + (event.effects.externalSector.importCostIndex ?? 0) * 0.16, 70, 190),
        exportDemandIndex: clamp(market.externalSector.exportDemandIndex + (event.effects.externalSector.exportDemandIndex ?? 0) * 0.16, 70, 170),
        logisticsStress: clamp(market.externalSector.logisticsStress + (event.effects.externalSector.logisticsStress ?? 0) * 0.16, 0.2, 2.4),
        energyPriceIndex: clamp(market.externalSector.energyPriceIndex + (event.effects.externalSector.energyPriceIndex ?? 0) * 0.16, 70, 190),
        tradeBalance: clamp(market.externalSector.tradeBalance + (event.effects.externalSector.tradeBalance ?? 0) * 0.12, -500, 500),
      };
    }
    if (event.effects.demandMultiplier) {
      const lingeringMultipliers = Object.fromEntries(
        (Object.entries(event.effects.demandMultiplier) as Array<[GoodType, number]>).map(([goodType, multiplier]) => [
          goodType,
          clamp(1 + (multiplier - 1) * 0.1, 0.94, 1.08),
        ]),
      ) as Partial<Record<GoodType, number>>;
      Object.assign(market, applyDemandMultiplier(market, lingeringMultipliers));
    }

    if (!event.effects.inflation && !event.effects.employment && !event.effects.socialStability) {
      switch (event.type as string) {
        case 'inflation':
        case 'inflation_surge':
          market.inflationRate = clamp(market.inflationRate + 0.006, -0.1, 0.3);
          market.socialStability = clamp(market.socialStability - 0.6, 0, 100);
          break;
        case 'stock_crash':
        case 'economic_crisis':
          market.stockMarket.volatility = clamp(market.stockMarket.volatility + 0.02, 0.03, 1);
          market.employmentRate = clamp(market.employmentRate - 0.8, 30, 100);
          break;
        case 'health_epidemic':
        case 'natural_disaster':
          market.employmentRate = clamp(market.employmentRate - 0.6, 30, 100);
          market.inflationRate = clamp(market.inflationRate + 0.004, -0.1, 0.3);
          break;
        case 'social_unrest':
          market.socialStability = clamp(market.socialStability - 1, 0, 100);
          break;
        default:
          break;
      }
    }
  });
}

export function pickNewsEvent(round: number): RandomEvent {
  const template = NEWS_EVENTS[(round - 1) % NEWS_EVENTS.length];
  return {
    ...template,
    id: `${template.id}_${generateId()}`,
    remainingDuration: template.duration ?? 1,
  };
}

export function applyNewsEvent(state: GameState, event: RandomEvent): GameState {
  const market = {
    ...state.market,
    goods: { ...state.market.goods },
    stockMarket: { ...state.market.stockMarket },
  };

  if (event.effects.inflation) {
    market.inflationRate = Math.max(-0.1, Math.min(0.3, market.inflationRate + event.effects.inflation));
  }
  if (event.effects.employment) {
    market.employmentRate = Math.max(0, Math.min(100, market.employmentRate + event.effects.employment));
  }
  if (event.effects.socialStability) {
    market.socialStability = Math.max(0, Math.min(100, market.socialStability + event.effects.socialStability));
  }
  if (event.effects.stockMarket) {
    market.stockMarket = {
      ...market.stockMarket,
      index: market.stockMarket.index * (1 + event.effects.stockMarket.indexChange),
      volatility: Math.max(0.03, Math.min(1, market.stockMarket.volatility + event.effects.stockMarket.volatilityChange)),
    };
  }
  if (event.effects.cycleShift) {
    market.economicCycle = event.effects.cycleShift;
  }
  if (event.effects.creditTightness) {
    market.creditConditions = {
      ...market.creditConditions,
      householdCreditTightness: Math.max(0.1, Math.min(0.95, market.creditConditions.householdCreditTightness + (event.effects.creditTightness.household ?? 0))),
      businessCreditTightness: Math.max(0.1, Math.min(0.97, market.creditConditions.businessCreditTightness + (event.effects.creditTightness.business ?? 0))),
      defaultRate: Math.max(0.01, Math.min(0.22, market.creditConditions.defaultRate + (event.effects.creditTightness.defaultRate ?? 0))),
    };
  }
  if (event.effects.externalSector) {
    market.externalSector = {
      ...market.externalSector,
      importCostIndex: Math.max(70, Math.min(190, market.externalSector.importCostIndex + (event.effects.externalSector.importCostIndex ?? 0))),
      exportDemandIndex: Math.max(70, Math.min(170, market.externalSector.exportDemandIndex + (event.effects.externalSector.exportDemandIndex ?? 0))),
      logisticsStress: Math.max(0.2, Math.min(2.4, market.externalSector.logisticsStress + (event.effects.externalSector.logisticsStress ?? 0))),
      energyPriceIndex: Math.max(70, Math.min(190, market.externalSector.energyPriceIndex + (event.effects.externalSector.energyPriceIndex ?? 0))),
      tradeBalance: Math.max(-500, Math.min(500, market.externalSector.tradeBalance + (event.effects.externalSector.tradeBalance ?? 0))),
    };
  }
  if (event.effects.specificGoodPrice) {
    const { goodType, multiplier } = event.effects.specificGoodPrice;
    const current = market.goods[goodType as GoodType];
    if (current) {
      const nextPrice = Math.max(1, Math.round(current.currentPrice * multiplier));
      market.goods[goodType as GoodType] = {
        ...current,
        currentPrice: nextPrice,
        priceHistory: [...current.priceHistory, nextPrice],
      };
    }
  }
  const demandAdjustedMarket = event.effects.demandMultiplier
    ? applyDemandMultiplier(market, event.effects.demandMultiplier)
    : market;

  return {
    ...state,
    market: demandAdjustedMarket,
    currentNews: event,
    recentEvent: event,
    eventHistory: [...state.eventHistory, event],
    gameLog: [
      ...state.gameLog,
      {
        id: generateId(),
        round: state.currentRound,
        timestamp: Date.now(),
        type: 'event',
        message: `${event.icon ?? '📰'} 新闻：${event.name}。${event.explanation ?? event.description}`,
      },
    ],
  };
}
