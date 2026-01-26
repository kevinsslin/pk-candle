import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  type CandlestickData,
  type BusinessDay,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  CandlestickSeries,
} from 'lightweight-charts';
import type { MarketState, PlayerState, TradeRequest } from '@pk-candle/shared';

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

const formatClock = (date: Date) => date.toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const formatLocalTick = (time: UTCTimestamp | BusinessDay) => {
  if (typeof time === 'number') {
    return formatClock(new Date(time * 1000));
  }
  const { year, month, day } = time;
  return new Date(year, month - 1, day).toLocaleDateString();
};

const calcPnl = (player: PlayerState | null, price: number) => {
  if (!player?.position) return 0;
  const delta = player.position.side === 'LONG'
    ? price - player.position.entryPrice
    : player.position.entryPrice - price;
  return delta * player.position.size;
};

const buildSeriesData = (candles: MarketState['candles']): CandlestickData<UTCTimestamp>[] => {
  let lastTime = 0;
  return candles.map((candle) => {
    const nextTime = Math.max(Math.floor(candle.time / 1000), lastTime + 1);
    lastTime = nextTime;
    return {
      time: nextTime as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    };
  });
};

const aggregateCandles = (candles: MarketState['candles'], timeframeMs: number | null) => {
  if (!timeframeMs) return candles;
  const buckets = new Map<number, MarketState['candles'][number]>();
  for (const candle of candles) {
    const bucketTime = Math.floor(candle.time / timeframeMs) * timeframeMs;
    const existing = buckets.get(bucketTime);
    if (!existing) {
      buckets.set(bucketTime, {
        ...candle,
        time: bucketTime,
      });
      continue;
    }
    buckets.set(bucketTime, {
      ...existing,
      high: Math.max(existing.high, candle.high),
      low: Math.min(existing.low, candle.low),
      close: candle.close,
      time: bucketTime,
    });
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
};

const TIMEFRAMES = [
  { key: 'tick', label: 'Tick', ms: null },
  { key: '1m', label: '1m', ms: 60_000 },
  { key: '5m', label: '5m', ms: 5 * 60_000 },
  { key: '15m', label: '15m', ms: 15 * 60_000 },
] as const;

const DEFAULT_TIMEFRAME = TIMEFRAMES[0];
const MAX_LEVERAGE = 100;
const LEVERAGE_PRESETS = [1, 2, 5, 10, 20, 50, 100];

type MarketPanelProps = {
  market: MarketState;
  player: PlayerState | null;
  onTrade: (trade: TradeRequest) => void;
  disabled?: boolean;
};

const MarketPanel = ({ market, player, onTrade, disabled }: MarketPanelProps) => {
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const entryLineRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null);
  const liqLineRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastTimeRef = useRef<UTCTimestamp | null>(null);
  const [sizeMode, setSizeMode] = useState<'percent' | 'amount'>('percent');
  const [sizePercent, setSizePercent] = useState(50);
  const [sizeCash, setSizeCash] = useState(0);
  const [takeProfitPct, setTakeProfitPct] = useState('');
  const [stopLossPct, setStopLossPct] = useState('');
  const [timeframeKey, setTimeframeKey] = useState('tick');
  const [localNow, setLocalNow] = useState(() => Date.now());
  const [leverage, setLeverage] = useState(1);
  const [followLive, setFollowLive] = useState(true);

  const pnl = calcPnl(player, market.price);
  const hasPosition = Boolean(player?.position);
  const availableCash = Math.max(0, player?.cash ?? 0);
  const orderCash = sizeMode === 'percent'
    ? availableCash * (sizePercent / 100)
    : sizeCash;
  const orderCashRounded = roundCash(Math.min(orderCash, availableCash));
  const orderSize = market.price > 0 ? orderCashRounded / market.price : 0;
  const equity = player
    ? player.cash + (player.position ? player.position.margin + pnl : 0)
    : 0;
  const amountStep = useMemo(() => Math.max(0.01, roundCash(availableCash / 100)), [availableCash]);

  const timeframe = TIMEFRAMES.find((item) => item.key === timeframeKey) ?? DEFAULT_TIMEFRAME;
  const timeframeMs = timeframe.ms ?? null;
  const aggregatedCandles = useMemo(
    () => aggregateCandles(market.candles, timeframeMs),
    [market.candles, timeframeMs],
  );
  const seriesData = useMemo(() => buildSeriesData(aggregatedCandles), [aggregatedCandles]);
  const lastCandleTime = aggregatedCandles.length ? aggregatedCandles[aggregatedCandles.length - 1]?.time ?? null : null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || chartRef.current) return;

    const styles = getComputedStyle(document.documentElement);
    const chartBg = styles.getPropertyValue('--chart-bg').trim() || '#05070f';
    const gridColor = styles.getPropertyValue('--chart-grid').trim() || 'rgba(92, 243, 255, 0.18)';
    const upColor = styles.getPropertyValue('--chart-up').trim() || '#32ff9d';
    const downColor = styles.getPropertyValue('--chart-down').trim() || '#ff4d6d';
    const wickColor = styles.getPropertyValue('--chart-wick').trim() || '#7dd3fc';
    const textColor = styles.getPropertyValue('--chart-text').trim() || '#cbd5f5';

    const chart = createChart(container, {
      layout: {
        background: { color: chartBg },
        textColor,
        fontFamily: '"VT323", monospace',
      },
      localization: {
        timeFormatter: (time: UTCTimestamp | BusinessDay) => formatLocalTick(time),
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: gridColor,
      },
      timeScale: {
        borderColor: gridColor,
        rightOffset: 6,
        barSpacing: 8,
        fixLeftEdge: true,
        lockVisibleTimeRangeOnResize: true,
        timeVisible: true,
        secondsVisible: true,
        tickMarkFormatter: (time: UTCTimestamp | BusinessDay) => formatLocalTick(time),
      },
      height: 280,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor,
      downColor,
      borderUpColor: upColor,
      borderDownColor: downColor,
      wickUpColor: wickColor,
      wickDownColor: wickColor,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      chart.applyOptions({ width: rect.width, height: rect.height });
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const handleRange = () => {
      if (!lastTimeRef.current) return;
      const range = chart.timeScale().getVisibleRange();
      if (!range) return;
      const rangeTo = range.to;
      if (typeof rangeTo !== 'number') return;
      const isLive = rangeTo >= lastTimeRef.current - 2;
      setFollowLive(isLive);
    };

    chart.timeScale().subscribeVisibleTimeRangeChange(handleRange);

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleRange);
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (!seriesData.length) return;
    series.setData(seriesData);
    lastTimeRef.current = seriesData[seriesData.length - 1]?.time ?? null;

    if (followLive) {
      chartRef.current?.timeScale().scrollToRealTime();
    }
  }, [seriesData, followLive]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    if (entryLineRef.current) {
      series.removePriceLine(entryLineRef.current);
      entryLineRef.current = null;
    }
    if (liqLineRef.current) {
      series.removePriceLine(liqLineRef.current);
      liqLineRef.current = null;
    }

    if (!player?.position) return;

    entryLineRef.current = series.createPriceLine({
      price: player.position.entryPrice,
      color: 'rgba(251, 191, 36, 0.9)',
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'Entry',
    });

    liqLineRef.current = series.createPriceLine({
      price: player.position.liquidationPrice,
      color: 'rgba(248, 113, 113, 0.85)',
      lineWidth: 1,
      lineStyle: 1,
      axisLabelVisible: true,
      title: 'Liq',
    });
  }, [player?.position]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const secondsVisible = timeframeMs ? timeframeMs < 60_000 : true;
    chart.applyOptions({
      timeScale: {
        timeVisible: true,
        secondsVisible,
        tickMarkFormatter: (time: UTCTimestamp | BusinessDay) => formatLocalTick(time),
      },
    });
  }, [timeframeMs]);

  useEffect(() => {
    const timer = setInterval(() => setLocalNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (sizeMode !== 'amount') return;
    setSizeCash((prev) => clamp(roundCash(prev), 0, availableCash));
  }, [availableCash, sizeMode]);

  const switchSizeMode = (next: 'percent' | 'amount') => {
    if (next === sizeMode) return;
    if (next === 'amount') {
      setSizeCash(roundCash(availableCash * (sizePercent / 100)));
    } else if (availableCash > 0) {
      const nextPercent = Math.round((sizeCash / availableCash) * 100);
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
      payload.sizeCash = orderCashRounded;
    } else {
      payload.sizePercent = sizePercent;
    }
    const parsedTakeProfit = Number(takeProfitPct);
    const parsedStopLoss = Number(stopLossPct);
    if (Number.isFinite(parsedTakeProfit) && parsedTakeProfit > 0) {
      payload.takeProfitPct = parsedTakeProfit;
    }
    if (Number.isFinite(parsedStopLoss) && parsedStopLoss > 0) {
      payload.stopLossPct = parsedStopLoss;
    }
    onTrade(payload);
  };

  const handleClose = () => {
    onTrade({ action: 'CLOSE' });
  };

  return (
    <div className="pixel-card">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <div className="pixel-title text-sm">Market</div>
          <div className="text-sm text-[var(--muted)]">{market.token?.name ?? 'Loading token...'}</div>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-lg">{formatPrice(market.price)}</div>
          <div className="text-xs text-[var(--muted)]">Phase: {market.phase}</div>
        </div>
      </div>

      <div className="relative chart-panel h-[240px] md:h-[260px] w-full rounded-lg overflow-hidden">
        <div ref={containerRef} className="h-full w-full" />
        {!followLive && (
          <button
            className="pixel-button ghost absolute bottom-3 right-3 text-xs"
            onClick={() => {
              setFollowLive(true);
              chartRef.current?.timeScale().scrollToRealTime();
            }}
          >
            Go Live
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
        <div className="flex flex-wrap items-center gap-2">
          {TIMEFRAMES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`pixel-button ghost text-xs ${timeframeKey === item.key ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
              onClick={() => setTimeframeKey(item.key)}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className="pixel-button ghost text-xs"
            onClick={() => chartRef.current?.timeScale().fitContent()}
          >
            Fit View
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span>Local time: {formatClock(new Date(localNow))}</span>
          <span>·</span>
          <span>Last candle: {lastCandleTime ? formatClock(new Date(lastCandleTime)) : '--'}</span>
          <span>·</span>
          <span>Scroll to zoom</span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            <span>Order Size</span>
            <span>{sizeMode === 'percent' ? `${sizePercent}%` : formatCash(orderCashRounded)}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={`pixel-button ghost text-xs ${sizeMode === 'percent' ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
              onClick={() => switchSizeMode('percent')}
              disabled={disabled || hasPosition}
            >
              Percent
            </button>
            <button
              type="button"
              className={`pixel-button ghost text-xs ${sizeMode === 'amount' ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
              onClick={() => switchSizeMode('amount')}
              disabled={disabled || hasPosition}
            >
              Amount
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
                disabled={disabled || hasPosition}
              />
              <div className="flex flex-wrap gap-2">
                {[10, 25, 50, 75, 100].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`pixel-button ghost text-xs ${sizePercent === value ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
                    onClick={() => setSizePercent(value)}
                    disabled={disabled || hasPosition}
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
                max={availableCash}
                step={amountStep}
                value={Number.isFinite(sizeCash) ? sizeCash : 0}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) {
                    setSizeCash(0);
                    return;
                  }
                  setSizeCash(clamp(roundCash(next), 0, availableCash));
                }}
                className="w-full accent-[var(--accent)]"
                disabled={disabled || hasPosition}
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
                    setSizeCash(clamp(roundCash(next), 0, availableCash));
                  }}
                  disabled={disabled || hasPosition}
                />
                <span className="text-xs text-[var(--muted)]">U</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[10, 25, 50, 75, 100].map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    className="pixel-button ghost text-xs"
                    onClick={() => setSizeCash(roundCash((availableCash * percent) / 100))}
                    disabled={disabled || hasPosition}
                  >
                    {percent}%
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="text-xs text-[var(--muted)]">
            Available: {formatCash(availableCash)} · Order value: {formatCash(orderCashRounded)} · Size: {orderSize.toFixed(4)}
          </div>
          <div className="pixel-card inset space-y-2">
            <div className="text-xs uppercase tracking-widest text-[var(--muted)]">Optional TP/SL</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                step={1}
                className="pixel-input"
                value={takeProfitPct}
                onChange={(event) => setTakeProfitPct(event.target.value)}
                placeholder="Take Profit %"
                disabled={disabled || hasPosition}
              />
              <input
                type="number"
                min={0}
                step={1}
                className="pixel-input"
                value={stopLossPct}
                onChange={(event) => setStopLossPct(event.target.value)}
                placeholder="Stop Loss %"
                disabled={disabled || hasPosition}
              />
            </div>
            <div className="text-[11px] text-[var(--muted)]">
              Auto-close when price hits your target.
            </div>
          </div>
          <div className="pixel-card inset space-y-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              <span>Leverage</span>
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
              disabled={disabled || hasPosition}
            />
            <div className="flex flex-wrap gap-2">
              {LEVERAGE_PRESETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`pixel-button ghost text-xs ${leverage === value ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
                  onClick={() => setLeverage(value)}
                  disabled={disabled || hasPosition}
                >
                  {value}x
                </button>
              ))}
            </div>
            <div className="text-[11px] text-[var(--muted)]">
              Higher leverage = faster liquidation. Server caps at {MAX_LEVERAGE}x.
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="pixel-button secondary"
              onClick={() => handleOpen('LONG')}
              disabled={disabled || hasPosition || orderCashRounded <= 0}
            >
              Open Long
            </button>
            <button
              className="pixel-button"
              onClick={() => handleOpen('SHORT')}
              disabled={disabled || hasPosition || orderCashRounded <= 0}
            >
              Open Short
            </button>
          </div>
          <button className="pixel-button ghost" onClick={handleClose} disabled={disabled || !hasPosition}>
            Close Position
          </button>
        </div>

        <div className="pixel-card inset">
          <div className="text-sm uppercase tracking-widest">Position</div>
          {player?.position ? (
            <div className="mt-2 space-y-1 text-sm">
              <div>Side: {player.position.side}</div>
              <div>Entry: {formatPrice(player.position.entryPrice)}</div>
              <div>Liquidation: {formatPrice(player.position.liquidationPrice)}</div>
              {player.position.takeProfitPrice ? (
                <div>Take Profit: {formatPrice(player.position.takeProfitPrice)}</div>
              ) : null}
              {player.position.stopLossPrice ? (
                <div>Stop Loss: {formatPrice(player.position.stopLossPrice)}</div>
              ) : null}
              <div>Leverage: {player.position.leverage}x</div>
              <div>Equity: {equity.toFixed(2)} U</div>
              <div className={pnl >= 0 ? 'text-[var(--accent-2)]' : 'text-[var(--danger)]'}>
                PnL: {pnl.toFixed(2)}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-[var(--muted)]">No open position.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketPanel;
