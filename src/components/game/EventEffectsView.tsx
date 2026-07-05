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
      {effects.creditTightness?.household !== undefined && (
        <EffectRow
          label="居民信贷紧缩"
          value={`${effects.creditTightness.household > 0 ? '+' : ''}${formatPercent(effects.creditTightness.household, 1)}`}
          positive={effects.creditTightness.household < 0}
        />
      )}
      {effects.creditTightness?.business !== undefined && (
        <EffectRow
          label="企业信贷紧缩"
          value={`${effects.creditTightness.business > 0 ? '+' : ''}${formatPercent(effects.creditTightness.business, 1)}`}
          positive={effects.creditTightness.business < 0}
        />
      )}
      {effects.externalSector?.importCostIndex !== undefined && (
        <EffectRow
          label="进口成本指数"
          value={`${effects.externalSector.importCostIndex > 0 ? '+' : ''}${effects.externalSector.importCostIndex}`}
          positive={effects.externalSector.importCostIndex < 0}
        />
      )}
      {effects.externalSector?.exportDemandIndex !== undefined && (
        <EffectRow
          label="外部需求指数"
          value={`${effects.externalSector.exportDemandIndex > 0 ? '+' : ''}${effects.externalSector.exportDemandIndex}`}
          positive={effects.externalSector.exportDemandIndex > 0}
        />
      )}
      {effects.externalSector?.logisticsStress !== undefined && (
        <EffectRow
          label="物流压力"
          value={`${effects.externalSector.logisticsStress > 0 ? '+' : ''}${formatPercent(effects.externalSector.logisticsStress, 1)}`}
          positive={effects.externalSector.logisticsStress < 0}
        />
      )}
      {effects.externalSector?.energyPriceIndex !== undefined && (
        <EffectRow
          label="能源价格指数"
          value={`${effects.externalSector.energyPriceIndex > 0 ? '+' : ''}${effects.externalSector.energyPriceIndex}`}
          positive={effects.externalSector.energyPriceIndex < 0}
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
