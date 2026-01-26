import { useMemo, useState } from 'react';
import type { MarketState, PlayerState, TradeRequest } from '@pk-candle/shared';
import { useI18n } from '../i18n';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const roundCash = (value: number) => Math.round(value * 100) / 100;

type MobileTradeDockProps = {
  market: MarketState;
  player: PlayerState | null;
  onTrade: (trade: TradeRequest) => void;
  disabled: boolean;
  disabledReason?: string;
};

const MobileTradeDock = ({ market, player, onTrade, disabled, disabledReason }: MobileTradeDockProps) => {
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sizePercent, setSizePercent] = useState(50);
  const [leverage, setLeverage] = useState(1);
  const [takeProfitPct, setTakeProfitPct] = useState('');
  const [stopLossPct, setStopLossPct] = useState('');

  const position = player?.position ?? null;
  const hasPosition = Boolean(position);
  const availableCash = Math.max(0, player?.cash ?? 0);
  const positionMargin = Math.max(0, position?.margin ?? 0);
  const addOrderCash = roundCash(availableCash * (sizePercent / 100));
  const reduceOrderCash = roundCash(positionMargin * (sizePercent / 100));

  const longAction = hasPosition && position?.side === 'SHORT' ? 'reduce' : 'add';
  const shortAction = hasPosition && position?.side === 'LONG' ? 'reduce' : 'add';
  const canOpenLong = !disabled && (longAction === 'add' ? addOrderCash > 0 : reduceOrderCash > 0);
  const canOpenShort = !disabled && (shortAction === 'add' ? addOrderCash > 0 : reduceOrderCash > 0);
  const canClose = !disabled && hasPosition;

  const handleOpen = (side: 'LONG' | 'SHORT') => {
    const payload: TradeRequest = {
      action: 'OPEN',
      side,
      leverage,
      sizePercent,
    };
    const parsedTakeProfit = Number(takeProfitPct);
    const parsedStopLoss = Number(stopLossPct);
    if (Number.isFinite(parsedTakeProfit) && parsedTakeProfit > 0) payload.takeProfitPct = parsedTakeProfit;
    if (Number.isFinite(parsedStopLoss) && parsedStopLoss > 0) payload.stopLossPct = parsedStopLoss;
    onTrade(payload);
  };

  const handleClose = () => onTrade({ action: 'CLOSE' });

  const statusText = useMemo(() => {
    if (disabled && disabledReason) return disabledReason;
    if (!player) return t('tradingDisabledJoin');
    if (!hasPosition) return `${t('orderSize')} ${sizePercent}% · ${leverage}x`;
    const sideLabel = player.position?.side === 'LONG' ? t('long') : t('short');
    return `${t('positionTitle')} ${sideLabel} · ${sizePercent}%`;
  }, [disabled, disabledReason, hasPosition, leverage, player, sizePercent, t]);

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40">
        <div className="px-3 pb-3 pt-2 bg-[rgba(4,7,15,0.92)] backdrop-blur border-t border-[rgba(37,52,82,0.8)]">
          <div className="flex items-center justify-between mb-2">
            <button type="button" className="pixel-button ghost text-xs" onClick={() => setAdvancedOpen(true)}>
              {t('advanced')}
            </button>
            <div className="text-xs text-[var(--muted)] truncate max-w-[70%]">{statusText}</div>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button className="pixel-button success lg" disabled={!canOpenLong} onClick={() => handleOpen('LONG')}>
                {!hasPosition ? t('openLong') : (position?.side === 'LONG' ? t('addLong') : t('reduceShort'))}
              </button>
              <button className="pixel-button danger lg" disabled={!canOpenShort} onClick={() => handleOpen('SHORT')}>
                {!hasPosition ? t('openShort') : (position?.side === 'SHORT' ? t('addShort') : t('reduceLong'))}
              </button>
            </div>
            <button className="pixel-button neutral lg w-full" disabled={!canClose} onClick={handleClose}>
              {t('closePosition')}
            </button>
          </div>
        </div>
      </div>

      {advancedOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 flex items-end" onClick={() => setAdvancedOpen(false)}>
          <div
            className="w-full pixel-card rounded-b-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="pixel-title text-sm">{t('advanced')}</div>
              <button className="pixel-button ghost text-xs" onClick={() => setAdvancedOpen(false)}>{t('done')}</button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs uppercase tracking-widest text-[var(--muted)]">
                  <span>{t('orderSize')}</span>
                  <span>{sizePercent}% (~{addOrderCash.toFixed(2)} U)</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={sizePercent}
                  onChange={(event) => setSizePercent(clamp(Number(event.target.value), 1, 100))}
                  className="w-full accent-[var(--accent)]"
                  disabled={disabled}
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {[10, 25, 50, 75, 100].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`pixel-button ghost text-xs ${sizePercent === value ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
                      onClick={() => setSizePercent(value)}
                      disabled={disabled}
                    >
                      {value}%
                    </button>
                  ))}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  {t('available')}: {availableCash.toFixed(2)} U · {t('positionMargin')}: {positionMargin.toFixed(2)} U
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs uppercase tracking-widest text-[var(--muted)]">
                  <span>{t('leverage')}</span>
                  <span>{leverage}x</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={leverage}
                  onChange={(event) => setLeverage(clamp(Number(event.target.value), 1, 100))}
                  className="w-full accent-[var(--accent)]"
                  disabled={disabled}
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {[1, 2, 5, 10, 20, 50, 100].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`pixel-button ghost text-xs ${leverage === value ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
                      onClick={() => setLeverage(value)}
                      disabled={disabled}
                    >
                      {value}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="pixel-card inset space-y-2">
                <div className="text-xs uppercase tracking-widest text-[var(--muted)]">{t('tpSlTitle')}</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                  step={1}
                  className="pixel-input"
                  value={takeProfitPct}
                  onChange={(event) => setTakeProfitPct(event.target.value)}
                  placeholder={t('tpPlaceholder')}
                  disabled={disabled}
                />
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="pixel-input"
                  value={stopLossPct}
                  onChange={(event) => setStopLossPct(event.target.value)}
                  placeholder={t('slPlaceholder')}
                  disabled={disabled}
                />
                </div>
                <div className="text-[11px] text-[var(--muted)]">{t('tpSlHint')}</div>
              </div>

              <div className="text-xs text-[var(--muted)]">
                {t('marketTitle')}: {market.token?.name ?? '--'} · {t('price')}: {market.price > 0 ? market.price.toFixed(6) : '--'}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileTradeDock;
