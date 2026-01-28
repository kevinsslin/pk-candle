import type { PlayerSummary } from '@pk-candle/shared';
import { memo, useMemo } from 'react';
import { useI18n } from '../i18n';

type RoomLeaderboardWidgetProps = {
  players: PlayerSummary[];
  price: number;
  max?: number;
};

const calcPnl = (player: PlayerSummary, price: number) => {
  const position = player.position;
  if (!position) {
    return player.cash - player.initialCash;
  }
  const delta = position.side === 'LONG' ? price - position.entryPrice : position.entryPrice - price;
  const pnl = delta * position.size;
  const netWorth = player.cash + position.margin + pnl;
  return netWorth - player.initialCash;
};

const formatPnl = (value: number) => {
  const formatted = value.toFixed(2);
  return value >= 0 ? `+${formatted}` : formatted;
};

const RoomLeaderboardWidget = ({ players, price, max = 6 }: RoomLeaderboardWidgetProps) => {
  const { t } = useI18n();
  const rows = useMemo(() => {
    return players
      .map((player) => ({ player, pnl: calcPnl(player, price) }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, max);
  }, [players, price, max]);

  return (
    <div className="pixel-card">
      <div className="flex items-center justify-between mb-3">
        <div className="pixel-title text-sm">{t('roomRank')}</div>
        <div className="text-xs text-[var(--muted)]">{t('topN', { count: max })}</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-[var(--muted)]">{t('noPlayersYet')}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {rows.map(({ player, pnl }, index) => (
            <div key={player.id} className="pixel-card inset p-3 flex items-center gap-2 min-w-0">
              <div className="text-xs text-[var(--accent)] shrink-0">#{index + 1}</div>
              {player.avatarUrl ? (
                <img
                  src={player.avatarUrl}
                  alt={player.handle ? `@${player.handle}` : player.name}
                  className="h-7 w-7 rounded-full border border-[rgba(148,163,184,0.35)] shrink-0"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-[rgba(148,163,184,0.2)] flex items-center justify-center text-[10px] shrink-0">
                  {player.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{player.handle ? `@${player.handle}` : player.name}</div>
                <div className={`text-xs ${pnl >= 0 ? 'text-[var(--accent-2)]' : 'text-[var(--danger)]'}`}>
                  {formatPnl(pnl)} U
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default memo(RoomLeaderboardWidget);
