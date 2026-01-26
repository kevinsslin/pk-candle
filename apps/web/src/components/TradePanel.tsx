import { useEffect, useMemo, useState } from 'react';
import type { MarketState, PlayerState, TradeRequest } from '@pk-candle/shared';
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
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const roundCash = (value: number) => Math.round(value * 100) / 100;

const calcPnl = (player: PlayerState | null, price: number) => {
  if (!player?.position) return 0;
  const delta = player.position.side === 'LONG'
    ? price - player.position.entryPrice
    : player.position.entryPrice - price;
  return delta * player.position.size;
};

const MAX_LEVERAGE = 100;
const LEVERAGE_PRESETS = [1, 2, 5, 10, 20, 50, 100];

type TradePanelProps = {
  market: MarketState;
  player: PlayerState | null;
  onTrade: (trade: TradeRequest) => void;
  disabled: boolean;
  disabledReason?: string;
};

const TradePanel = ({ market, player, onTrade, disabled, disabledReason }: TradePanelProps) => {
  const { t } = useI18n();
  const [sizeMode, setSizeMode] = useState<'percent' | 'amount'>('percent');
  const [sizePercent, setSizePercent] = useState(50);
  const [sizeCash, setSizeCash] = useState(0);
  const [takeProfitPct, setTakeProfitPct] = useState('');
  const [stopLossPct, setStopLossPct] = useState('');
  const [leverage, setLeverage] = useState(1);

  const pnl = calcPnl(player, market.price);
  const position = player?.position ?? null;
  const hasPosition = Boolean(position);
  const availableCash = Math.max(0, player?.cash ?? 0);
  const positionMargin = Math.max(0, position?.margin ?? 0);
  const maxBudget = hasPosition ? Math.max(availableCash, positionMargin) : availableCash;

  const calcOrderCash = (budget: number) => {
    const raw = sizeMode === 'percent'
      ? budget * (sizePercent / 100)
      : sizeCash;
    return roundCash(clamp(raw, 0, budget));
  };

  const addOrderCash = calcOrderCash(availableCash);
  const reduceOrderCash = calcOrderCash(positionMargin);
  const orderSize = market.price > 0 ? addOrderCash / market.price : 0;

  const equity = player
    ? player.cash + (player.position ? player.position.margin + pnl : 0)
    : 0;

  const amountStep = useMemo(() => Math.max(0.01, roundCash(maxBudget / 100)), [maxBudget]);

  useEffect(() => {
    if (sizeMode !== 'amount') return;
    setSizeCash((prev) => clamp(roundCash(prev), 0, maxBudget));
  }, [maxBudget, sizeMode]);

  const switchSizeMode = (next: 'percent' | 'amount') => {
    if (next === sizeMode) return;
    if (next === 'amount') {
      setSizeCash(roundCash(maxBudget * (sizePercent / 100)));
    } else if (maxBudget > 0) {
      const nextPercent = Math.round((sizeCash / maxBudget) * 100);
      setSizePercent(clamp(nextPercent, 1, 100));
    }
    setSizeMode(next);
  };

  const handleOpen = (side: 'LONG' | 'SHORT') => {
    const payload: TradeRequest = {
      action: 'OPEN',
      side,
      leverage,
    };
    if (sizeMode === 'amount') {
      payload.sizeCash = roundCash(clamp(sizeCash, 0, maxBudget));
    } else {
      payload.sizePercent = sizePercent;
    }
    const parsedTakeProfit = Number(takeProfitPct);
    const parsedStopLoss = Number(stopLossPct);
    if (Number.isFinite(parsedTakeProfit) && parsedTakeProfit > 0) payload.takeProfitPct = parsedTakeProfit;
    if (Number.isFinite(parsedStopLoss) && parsedStopLoss > 0) payload.stopLossPct = parsedStopLoss;
    onTrade(payload);
  };

  const handleClose = () => onTrade({ action: 'CLOSE' });

  const longAction = hasPosition && position?.side === 'SHORT' ? 'reduce' : 'add';
  const shortAction = hasPosition && position?.side === 'LONG' ? 'reduce' : 'add';
  const openLongDisabled = disabled || (longAction === 'add' ? addOrderCash <= 0 : reduceOrderCash <= 0);
  const openShortDisabled = disabled || (shortAction === 'add' ? addOrderCash <= 0 : reduceOrderCash <= 0);
  const closeDisabled = disabled || !hasPosition;

  return (
    <div className="pixel-card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="pixel-title text-sm">{t('tradeTitle')}</div>
          <div className="text-xs text-[var(--muted)]">{market.token?.name ?? '—'} · {formatPrice(market.price)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--muted)]">{t('equity')}</div>
          <div className="text-sm">{equity.toFixed(2)} U</div>
        </div>
      </div>

      {disabled && (
        <div className="pixel-card inset mb-3">
          <div className="text-xs uppercase tracking-widest text-[var(--muted)]">{t('tradingDisabledTitle')}</div>
          <div className="text-sm mt-1">{disabledReason ?? t('tradingDisabledGeneric')}</div>
        </div>
      )}

      <div className="pixel-card inset space-y-3">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          <span>{t('orderSize')}</span>
          <span>{sizeMode === 'percent' ? `${sizePercent}%` : formatCash(roundCash(clamp(sizeCash, 0, maxBudget)))}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`pixel-button ghost text-xs ${sizeMode === 'percent' ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
            onClick={() => switchSizeMode('percent')}
            disabled={disabled}
          >
            {t('percent')}
          </button>
          <button
            type="button"
            className={`pixel-button ghost text-xs ${sizeMode === 'amount' ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
            onClick={() => switchSizeMode('amount')}
            disabled={disabled}
          >
            {t('amount')}
          </button>
        </div>

        {sizeMode === 'percent' ? (
          <>
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
            <div className="flex flex-wrap gap-2">
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
          </>
        ) : (
          <>
            <input
              type="range"
              min={0}
              max={maxBudget}
              step={amountStep}
              value={Number.isFinite(sizeCash) ? sizeCash : 0}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) {
                  setSizeCash(0);
                  return;
                }
                setSizeCash(clamp(roundCash(next), 0, maxBudget));
              }}
              className="w-full accent-[var(--accent)]"
              disabled={disabled}
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                className="pixel-input"
                value={Number.isFinite(sizeCash) ? sizeCash : 0}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) {
                    setSizeCash(0);
                    return;
                  }
                  setSizeCash(clamp(roundCash(next), 0, maxBudget));
                }}
                disabled={disabled}
              />
              <span className="text-xs text-[var(--muted)]">U</span>
            </div>
          </>
        )}

        {!hasPosition ? (
          <div className="text-xs text-[var(--muted)]">
            {t('available')}: {formatCash(availableCash)} · {t('orderValue')}: {formatCash(addOrderCash)} · {t('size')}: {orderSize.toFixed(4)}
          </div>
        ) : (
          <div className="text-xs text-[var(--muted)] space-y-1">
            <div>
              {t('available')}: {formatCash(availableCash)} · {t('positionMargin')}: {formatCash(positionMargin)}
            </div>
            <div>
              {t('addOrderValue')}: {formatCash(addOrderCash)} · {t('reduceOrderValue')}: {formatCash(reduceOrderCash)}
            </div>
          </div>
        )}

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

        <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          <span>{t('leverage')}</span>
          <span>{leverage}x</span>
        </div>
        <input
          type="range"
          min={1}
          max={MAX_LEVERAGE}
          step={1}
          value={leverage}
          onChange={(event) => setLeverage(clamp(Number(event.target.value), 1, MAX_LEVERAGE))}
          className="w-full accent-[var(--accent)]"
          disabled={disabled}
        />
        <div className="flex flex-wrap gap-2">
          {LEVERAGE_PRESETS.map((value) => (
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

        <div className="grid grid-cols-2 gap-2">
          <button className="pixel-button success xl" disabled={openLongDisabled} onClick={() => handleOpen('LONG')}>
            {!hasPosition ? t('openLong') : (position?.side === 'LONG' ? t('addLong') : t('reduceShort'))}
          </button>
          <button className="pixel-button danger xl" disabled={openShortDisabled} onClick={() => handleOpen('SHORT')}>
            {!hasPosition ? t('openShort') : (position?.side === 'SHORT' ? t('addShort') : t('reduceLong'))}
          </button>
        </div>
        <button className="pixel-button neutral xl w-full" disabled={closeDisabled} onClick={handleClose}>
          {t('closePosition')}
        </button>
      </div>
    </div>
  );
};

export default TradePanel;
