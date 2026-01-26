import type { MarketState, PlayerState } from '@pk-candle/shared';
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

const formatCash = (value: number) => `${value.toFixed(2)} U`;

const calcPnl = (player: PlayerState | null, price: number) => {
  if (!player?.position) return 0;
  const delta = player.position.side === 'LONG'
    ? price - player.position.entryPrice
    : player.position.entryPrice - price;
  return delta * player.position.size;
};

type PositionPanelProps = {
  market: MarketState;
  player: PlayerState | null;
  disabled?: boolean;
  disabledReason?: string;
};

const PositionPanel = ({ market, player, disabled, disabledReason }: PositionPanelProps) => {
  const { t } = useI18n();
  const pnl = calcPnl(player, market.price);
  const equity = player
    ? player.cash + (player.position ? player.position.margin + pnl : 0)
    : 0;
  const position = player?.position ?? null;
  const positionSideLabel = position ? (position.side === 'LONG' ? t('long') : t('short')) : '';

  return (
    <div className="pixel-card">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="pixel-title text-sm">{t('positionTitle')}</div>
        {position && (
          <span className={`pixel-badge ${position.side === 'LONG' ? 'ready' : 'waiting'}`}>
            {positionSideLabel}
          </span>
        )}
      </div>

      {disabled && disabledReason && (
        <div className="pixel-card inset mb-3">
          <div className="text-xs uppercase tracking-widest text-[var(--muted)]">{t('tradingDisabledTitle')}</div>
          <div className="text-sm mt-1">{disabledReason}</div>
        </div>
      )}

      {position ? (
        <div className="grid gap-3 md:grid-cols-2 text-sm">
          <div className="space-y-1">
            <div className="flex items-center justify-between"><span>{t('side')}</span><span>{positionSideLabel}</span></div>
            <div className="flex items-center justify-between"><span>{t('entry')}</span><span>{formatPrice(position.entryPrice)}</span></div>
            <div className="flex items-center justify-between"><span>{t('liquidation')}</span><span>{formatPrice(position.liquidationPrice)}</span></div>
            <div className="flex items-center justify-between"><span>{t('margin')}</span><span>{formatCash(position.margin)}</span></div>
            <div className="flex items-center justify-between"><span>{t('leverage')}</span><span>{position.leverage}x</span></div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between"><span>{t('cash')}</span><span>{formatCash(player?.cash ?? 0)}</span></div>
            <div className="flex items-center justify-between"><span>{t('equity')}</span><span>{equity.toFixed(2)} U</span></div>
            <div className={`flex items-center justify-between ${pnl >= 0 ? 'text-[var(--accent-2)]' : 'text-[var(--danger)]'}`}>
              <span>{t('pnl')}</span>
              <span>{pnl.toFixed(2)} U</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-[var(--muted)]">{t('noOpenPosition')}</div>
      )}

    </div>
  );
};

export default PositionPanel;
