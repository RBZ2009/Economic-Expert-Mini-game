import { Player, TutorialPrompt } from '@/types/game';

const REQUIRED_GOODS = [
  { key: 'food' as const, name: '食品', needed: 2 },
  { key: 'daily_necessities' as const, name: '日用品', needed: 1 },
];

export function getEndTurnTutorialPrompt(player: Player | null): TutorialPrompt | null {
  if (!player) return null;

  const shortages = REQUIRED_GOODS
    .map(item => ({ ...item, owned: player.goods[item.key] ?? 0 }))
    .filter(item => item.owned < item.needed);

  if (shortages.length > 0) {
    return {
      id: 'essential_goods_shortage',
      title: '必需品不足',
      severity: 'warning',
      body: `你现在缺少 ${shortages.map(item => item.name).join('、')}。必需品是每天生活必须消耗的商品，比如食品和日用品。`,
      tips: [
        '食品不足会影响健康，因为人需要稳定摄入营养。',
        '日用品不足会影响幸福度，因为基本生活会变得不方便。',
        '先买够必需品，再考虑娱乐、奢侈品或投资，会让现金流更安全。',
      ],
    };
  }

  if (player.cash < 0) {
    return {
      id: 'negative_cash',
      title: '现金流告急',
      severity: 'warning',
      body: '现金为负说明你的支出已经超过手头资金。经济里这叫现金流压力。',
      tips: [
        '短期缺钱时，可以减少非必需消费或出售部分资产。',
        '借款能缓解眼前压力，但未来要支付利息。',
        '稳定现金流比账面财富更能帮助你度过风险事件。',
      ],
    };
  }

  if ((player.loans ?? []).length > 0) {
    return {
      id: 'loan_reminder',
      title: '贷款会产生利息',
      severity: 'info',
      body: '你持有贷款。贷款可以提前消费或扩大经营，但利息会增加未来支出。',
      tips: [
        '借钱投资时，要判断投资收益是否高于贷款利率。',
        '如果收入不稳定，过多贷款会让回合结算压力变大。',
      ],
    };
  }

  return null;
}
