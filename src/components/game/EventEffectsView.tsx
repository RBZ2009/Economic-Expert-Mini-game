import { RandomEvent, formatPercent } from '@/types/game';

export function EventEffectsView({ effects, title = '事件影响' }: { effects: RandomEvent['effects']; title?: string }) {
  return (
    <div className="space-y-2">
      <h4 className="font-medium">{title}：</h4>
      {effects.inflation !== undefined && (
        <EffectRow
          label="通货膨胀率"
          value={`${effects.inflation > 0 ? '+' : ''}${formatPercent(effects.inflation, 1)}`}
          positive={effects.inflation < 0}
        />
      )}
      {effects.employment !== undefined && (
        <EffectRow
          label="就业率"
          value={`${effects.employment > 0 ? '+' : ''}${effects.employment}%`}
          positive={effects.employment > 0}
        />
      )}
      {effects.socialStability !== undefined && (
        <EffectRow
          label="社会稳定度"
          value={`${effects.socialStability > 0 ? '+' : ''}${effects.socialStability}`}
          positive={effects.socialStability > 0}
        />
      )}
      {effects.stockMarket && (
        <EffectRow
          label="股市指数"
          value={`${effects.stockMarket.indexChange > 0 ? '+' : ''}${formatPercent(effects.stockMarket.indexChange, 0)}`}
          positive={effects.stockMarket.indexChange > 0}
        />
      )}
      {effects.specificGoodPrice && (
        <EffectRow
          label="指定商品价格"
          value={`${effects.specificGoodPrice.goodType} x${effects.specificGoodPrice.multiplier}`}
          positive={effects.specificGoodPrice.multiplier < 1}
        />
      )}
    </div>
  );
}

function EffectRow({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
      <span className="text-sm">{label}</span>
      <span className={`font-bold ${positive ? 'text-green-600' : 'text-red-600'}`}>
        {positive ? '↑' : '↓'} {value}
      </span>
    </div>
  );
}
