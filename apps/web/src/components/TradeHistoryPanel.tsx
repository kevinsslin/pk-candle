import type { PlayerState } from '@pk-candle/shared';
import { memo, useMemo } from 'react';
import { useI18n } from '../i18n';

const formatPrice = (price: number) => {
  if (price === 0) return '$0.00';
  if (price < 0.00000001) return `$${price.toExponential(4)}`;
  if (price < 0.000001) return `$${price.toFixed(9)}`;
  if (price < 0.0001) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  if (price < 1000) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
};

const formatClock = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

type TradeHistoryPanelProps = {
  player: PlayerState | null;
};

const TradeHistoryPanel = ({ player }: TradeHistoryPanelProps) => {
  const { t } = useI18n();
  const history = player?.history ?? [];
  const recent = useMemo(() => history.slice(-6).reverse(), [history]);

  return (
    <div className="pixel-card">
      <div className="pixel-title text-sm">{t('tradeHistory')}</div>
      {!history.length ? (
        <div className="mt-2 text-sm text-[var(--muted)]">{t('noTradesYet')}</div>
      ) : (
        <div className="mt-2 space-y-2 text-sm">
          {recent.map((item, index) => {
            const typeLabel = item.type === 'OPEN'
              ? t('tradeOpen')
              : item.type === 'CLOSE'
                ? t('tradeClose')
                : t('tradeLiquidation');
            const sideLabel = item.side === 'LONG' ? t('long') : t('short');
            return (
              <div key={`${item.time}-${index}`} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[var(--muted)]">{formatClock(item.time)}</div>
                  <div>
                    <span>{typeLabel}</span>
                    {' '}
                    <span className={item.side === 'LONG' ? 'text-[var(--accent-2)]' : 'text-[var(--danger)]'}>
                      {sideLabel}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div>{formatPrice(item.price)}</div>
                  {item.pnl !== undefined && (
                    <div className={`text-xs ${item.pnl >= 0 ? 'text-[var(--accent-2)]' : 'text-[var(--danger)]'}`}>
                      {item.pnl.toFixed(2)} U
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default memo(TradeHistoryPanel);
