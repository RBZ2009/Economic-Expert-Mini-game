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
    },
    probability: 0.15,
    duration: 1,
    warning: '食品属于必需品，优先储备可以降低生活风险。',
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
    },
    probability: 0.13,
    duration: 1,
    warning: '负债越高，越需要关注现金流和利息。',
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
      demandMultiplier: {
        daily_necessities: 1.08,
        entertainment: 1.12,
        luxury: 1.08,
      },
    },
    probability: 0.15,
    duration: 1,
    warning: '企业投资机器时，要比较机器成本和新增产能。',
  },
];

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
