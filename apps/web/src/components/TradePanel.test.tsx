import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MarketState, PlayerState } from '@pk-candle/shared';
import TradeHistoryPanel from './TradeHistoryPanel';
import { I18nProvider } from '../i18n';

const market: MarketState = {
  token: {
    name: 'Gemini',
    ticker: 'GEM',
    initialPrice: 1,
    narrative: 'Test token',
    risk: 10,
    rugPullChance: 0,
    isRug: false,
  },
  price: 1,
  candles: [],
  phase: 'Accumulation',
  volatility: 0.02,
  isRugged: false,
};

const player: PlayerState = {
  id: 'p1',
  name: 'Kevin',
  roleKey: 'worker',
  role: 'Worker',
  initialCash: 5000,
  cash: 5200,
  stress: 0,
  history: [
    { type: 'OPEN', side: 'LONG', price: 1.0, time: Date.now() - 10_000 },
    { type: 'CLOSE', side: 'LONG', price: 1.1, time: Date.now() - 5_000, pnl: 100 },
  ],
  position: null,
  status: 'ACTIVE',
  ready: true,
};

describe('TradePanel', () => {
  it('shows recent trade history in history panel', () => {
    window.localStorage.setItem('pkcandle-lang', 'en');

    render(
      <I18nProvider>
        <TradeHistoryPanel player={player} />
      </I18nProvider>
    );

    expect(screen.getByText('Recent Trades')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });
});
