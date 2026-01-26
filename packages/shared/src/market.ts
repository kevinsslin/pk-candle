import { TOKEN_NAMES, TOKEN_SUFFIXES } from './constants';
import type { Candle, MarketEvent, MarketPhase, MarketState, TokenInfo } from './types';

export const MIN_PRICE = 0.00000001;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const generateToken = (): TokenInfo => {
  const name = TOKEN_NAMES[Math.floor(Math.random() * TOKEN_NAMES.length)];
  const suffix = TOKEN_SUFFIXES[Math.floor(Math.random() * TOKEN_SUFFIXES.length)];
  const ticker = `${name}${suffix}`.substring(0, 5);
  const startPrice = Math.random() * 0.001 + 0.00001;

  return {
    name: `${name} ${suffix}`,
    ticker,
    initialPrice: startPrice,
    narrative: 'The next 1000x coin!',
    risk: Math.floor(Math.random() * 100),
    rugPullChance: Math.random() * 0.3,
    isRug: Math.random() < 0.3,
  };
};

const generateCandle = (prevClose: number, phase: MarketPhase, volatility: number): Candle => {
  let changePercent = 0;
  const smoothVol = clamp(volatility, 0.01, 0.2);

  switch (phase) {
    case 'PUMP':
      changePercent = Math.random() * 0.015 + 0.005;
      break;
    case 'DUMP':
      changePercent = -(Math.random() * 0.015 + 0.005);
      break;
    case 'RUG':
      changePercent = -(0.2 + Math.random() * 0.25);
      break;
    case 'MOON':
      changePercent = Math.random() * 0.03 + 0.01;
      break;
    case 'Accumulation':
    default:
      changePercent = (Math.random() - 0.5) * smoothVol;
      break;
  }

  const close = Math.max(MIN_PRICE, prevClose * (1 + changePercent));
  const open = prevClose;

  const bodyHigh = Math.max(open, close);
  const bodyLow = Math.min(open, close);
  const baseWick = Math.max(Math.abs(close - open), prevClose * smoothVol * 0.12);
  const wickUp = baseWick * (0.3 + Math.random() * 0.6);
  const wickDown = baseWick * (0.3 + Math.random() * 0.6);
  const high = bodyHigh + wickUp;
  const low = Math.max(MIN_PRICE, bodyLow - wickDown);

  return { open, close, high, low, time: Date.now() };
};

export const createInitialMarketState = (): MarketState => {
  const token = generateToken();
  const initialCandle: Candle = {
    open: token.initialPrice,
    close: token.initialPrice,
    high: token.initialPrice,
    low: token.initialPrice,
    time: Date.now(),
  };

  return {
    token,
    price: token.initialPrice,
    candles: [initialCandle],
    phase: 'Accumulation',
    volatility: 0.02,
    isRugged: false,
  };
};

export const applyMarketEvent = (market: MarketState, event: MarketEvent): MarketState => {
  const next = { ...market };

  if (event.effect.phase) {
    next.phase = event.effect.phase;
  }

  if (event.effect.volatilityDelta) {
    next.volatility = clamp(next.volatility + event.effect.volatilityDelta, 0.01, 0.2);
  }

  if (event.effect.priceMultiplier) {
    const multiplier = clamp(event.effect.priceMultiplier, 0.1, 5);
    next.price = Math.max(MIN_PRICE, next.price * multiplier);
    const last = next.candles[next.candles.length - 1];
    if (last) {
      const adjusted = {
        ...last,
        close: Math.max(MIN_PRICE, last.close * multiplier),
        high: Math.max(MIN_PRICE, last.high * multiplier),
        low: Math.max(MIN_PRICE, last.low * multiplier),
        open: Math.max(MIN_PRICE, last.open * multiplier),
      };
      next.candles = [...next.candles.slice(0, -1), adjusted];
    }
  }

  return next;
};

export const simulateMarketTick = (market: MarketState) => {
  const { candles, phase, volatility, token } = market;
  const safeToken = token ?? generateToken();

  const lastCandle = candles.at(-1);
  const prevClose = lastCandle?.close ?? safeToken.initialPrice;

  let newPhase = phase;
  let newVolatility = volatility;

  const rand = Math.random();

  if (phase === 'Accumulation') {
    if (rand < 0.1) { newPhase = 'PUMP'; newVolatility = 0.06; }
    else if (rand < 0.13) { newPhase = 'MOON'; newVolatility = 0.1; }
  } else if (phase === 'PUMP') {
    if (rand < 0.18) {
      newPhase = safeToken.isRug ? 'RUG' : 'DUMP';
      newVolatility = 0.08;
    } else if (rand > 0.92) {
      newPhase = 'Accumulation';
      newVolatility = 0.03;
    } else if (rand < 0.05) {
      newPhase = 'MOON';
      newVolatility = 0.12;
    }
  } else if (phase === 'MOON') {
    if (rand < 0.28) { newPhase = 'DUMP'; newVolatility = 0.09; }
    else if (rand > 0.82) { newPhase = 'PUMP'; newVolatility = 0.06; }
  } else if (phase === 'DUMP') {
    if (rand < 0.15) {
      newPhase = 'Accumulation';
      newVolatility = 0.03;
    }
  }

  const newCandle = generateCandle(prevClose, newPhase, newVolatility);
  const newCandles = [...candles, newCandle].slice(-300);

  return {
    newCandles,
    newPrice: newCandle.close,
    newPhase,
    newVolatility,
  };
};
