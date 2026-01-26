import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createChart,
  type CandlestickData,
  type BusinessDay,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  CandlestickSeries,
} from 'lightweight-charts';
import type { MarketState, PlayerState } from '@pk-candle/shared';
import { useI18n } from '../i18n';

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

const formatPrice = (price: number) => {
  if (price === 0) return '$0.00';
  if (price < 0.00000001) return `$${price.toExponential(4)}`;
  if (price < 0.000001) return `$${price.toFixed(9)}`;
  if (price < 0.0001) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  if (price < 1000) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
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
      buckets.set(bucketTime, { ...candle, time: bucketTime });
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
  { key: '1s', labelKey: 'timeframe1s', ms: 1000 },
  { key: '5s', labelKey: 'timeframe5s', ms: 5_000 },
  { key: '10s', labelKey: 'timeframe10s', ms: 10_000 },
] as const;

const DEFAULT_TIMEFRAME = TIMEFRAMES[0];

type MarketChartPanelProps = {
  market: MarketState;
  player: PlayerState | null;
  heightClassName?: string;
  overlay?: ReactNode;
};

const MarketChartPanel = ({ market, player, heightClassName, overlay }: MarketChartPanelProps) => {
  const { t } = useI18n();
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const avgLineRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null);
  const liqLineRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null);
  const markLineRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastTimeRef = useRef<UTCTimestamp | null>(null);

  const [timeframeKey, setTimeframeKey] = useState<(typeof TIMEFRAMES)[number]['key']>(DEFAULT_TIMEFRAME.key);
  const [localNow, setLocalNow] = useState(() => Date.now());
  const [followLive, setFollowLive] = useState(true);

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
      height: 560,
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

    if (avgLineRef.current) {
      series.removePriceLine(avgLineRef.current);
      avgLineRef.current = null;
    }
    if (liqLineRef.current) {
      series.removePriceLine(liqLineRef.current);
      liqLineRef.current = null;
    }
    if (markLineRef.current) {
      series.removePriceLine(markLineRef.current);
      markLineRef.current = null;
    }

    if (!player?.position) return;

    avgLineRef.current = series.createPriceLine({
      price: player.position.entryPrice,
      color: 'rgba(251, 191, 36, 0.9)',
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: t('avgCostLine'),
    });

    liqLineRef.current = series.createPriceLine({
      price: player.position.liquidationPrice,
      color: 'rgba(248, 113, 113, 0.85)',
      lineWidth: 1,
      lineStyle: 1,
      axisLabelVisible: true,
      title: t('liquidationLine'),
    });

    markLineRef.current = series.createPriceLine({
      price: market.price,
      color: 'rgba(46, 247, 255, 0.9)',
      lineWidth: 1,
      lineStyle: 0,
      axisLabelVisible: true,
      title: t('markPriceLine'),
    });
  }, [market.price, player?.position, t]);

  useEffect(() => {
    if (!markLineRef.current || !player?.position) return;
    if (market.price <= 0) return;
    markLineRef.current.applyOptions({ price: market.price });
  }, [market.price, player?.position]);

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

  return (
    <div className="pixel-card">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <div className="pixel-title text-sm">{t('marketTitle')}</div>
          <div className="text-sm text-[var(--muted)]">{market.token?.name ?? t('loadingToken')}</div>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-lg">{formatPrice(market.price)}</div>
          <div className="text-xs text-[var(--muted)]">{t('phaseLabel', { phase: market.phase })}</div>
        </div>
      </div>

      <div className={`relative chart-panel w-full rounded-lg overflow-hidden ${heightClassName ?? 'h-[60vh] min-h-[420px]'}`}>
        <div ref={containerRef} className="h-full w-full" />
        {overlay}
        {!followLive && (
          <button
            className="pixel-button ghost absolute bottom-3 right-3 text-xs"
            onClick={() => {
              setFollowLive(true);
              chartRef.current?.timeScale().scrollToRealTime();
            }}
          >
            {t('goLive')}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-[var(--muted)]">
        <div className="flex flex-wrap items-center gap-2">
          {TIMEFRAMES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`pixel-button ghost tiny ${timeframeKey === item.key ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
              onClick={() => setTimeframeKey(item.key)}
            >
              {t(item.labelKey)}
            </button>
          ))}
          <button
            type="button"
            className="pixel-button ghost tiny"
            onClick={() => chartRef.current?.timeScale().fitContent()}
          >
            {t('fitView')}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span>{t('localTime', { time: formatClock(new Date(localNow)) })}</span>
          <span>·</span>
          <span>{t('lastCandle', { time: lastCandleTime ? formatClock(new Date(lastCandleTime)) : '--' })}</span>
          <span>·</span>
          <span>{t('scrollToZoom')}</span>
        </div>
      </div>
    </div>
  );
};

export default MarketChartPanel;
