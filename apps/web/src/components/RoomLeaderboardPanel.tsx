import type { PlayerSummary } from '@pk-candle/shared';
import { memo, useMemo } from 'react';
import { formatPlayerStatus, useI18n } from '../i18n';

type RoomLeaderboardPanelProps = {
  players: PlayerSummary[];
  price: number;
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

const statusLabel = (status: PlayerSummary['status'], lang: Parameters<typeof formatPlayerStatus>[1]) => {
  return formatPlayerStatus(status, lang);
};

const RoomLeaderboardPanel = ({ players, price }: RoomLeaderboardPanelProps) => {
  const { t, lang } = useI18n();
  const rows = useMemo(() => {
    return players
      .map((player) => ({
        player,
        pnl: calcPnl(player, price),
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [players, price]);

  return (
    <div className="pixel-card flex flex-col min-h-0">
      <div className="pixel-title text-sm mb-3 shrink-0">{t('roomPnl')}</div>
      <div
        className="flex-1 min-h-0 overflow-y-auto space-y-2 text-sm pr-1"
        style={{ contentVisibility: 'auto', containIntrinsicSize: '360px' }}
      >
        {rows.length === 0 && (
          <div className="text-[var(--muted)]">{t('noPlayersYet')}</div>
        )}
        {rows.map(({ player, pnl }, index) => (
          <div
            key={player.id}
            className={`flex items-center justify-between ${player.status === 'ACTIVE' ? '' : 'text-[var(--muted)]'}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[var(--accent)]">#{index + 1}</span>
              {player.avatarUrl ? (
                <img
                  src={player.avatarUrl}
                  alt={player.handle ? `@${player.handle}` : player.name}
                  className="h-6 w-6 rounded-full border border-[rgba(148,163,184,0.35)]"
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-[rgba(148,163,184,0.2)] flex items-center justify-center text-[10px]">
                  {player.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate">{player.name}</div>
                {player.handle && (
                  <div className="text-xs text-[var(--muted)] truncate">@{player.handle}</div>
                )}
              </div>
              <span className="text-xs text-[var(--muted)]">{statusLabel(player.status, lang)}</span>
            </div>
            <div className={pnl >= 0 ? 'text-[var(--accent-2)]' : 'text-[var(--danger)]'}>
              {formatPnl(pnl)} U
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default memo(RoomLeaderboardPanel);
