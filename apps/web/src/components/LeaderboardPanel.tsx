import type { LeaderboardEntry } from '@pk-candle/shared';
import { memo } from 'react';
import { useI18n } from '../i18n';

type LeaderboardPanelProps = {
  entries: LeaderboardEntry[];
  highlightId?: string | null;
};

const LeaderboardPanel = ({ entries, highlightId }: LeaderboardPanelProps) => {
  const { t } = useI18n();
  return (
    <div className="pixel-card flex flex-col min-h-0">
      <div className="pixel-title text-sm mb-3 shrink-0">{t('leaderboard')}</div>
      <div
        className="flex-1 min-h-0 overflow-y-auto space-y-2 text-sm pr-1"
        style={{ contentVisibility: 'auto', containIntrinsicSize: '360px' }}
      >
        {entries.length === 0 && (
          <div className="text-[var(--muted)]">{t('noScoresYet')}</div>
        )}
        {entries.map((entry, index) => (
          <div
            key={entry.id}
            className={`flex items-center justify-between ${entry.id === highlightId ? 'leaderboard-highlight' : ''}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[var(--accent)]">#{index + 1}</span>
              {entry.avatarUrl ? (
                <img
                  src={entry.avatarUrl}
                  alt={entry.handle ? `@${entry.handle}` : entry.playerName}
                  className="h-7 w-7 rounded-full border border-[rgba(148,163,184,0.35)]"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-[rgba(148,163,184,0.2)] flex items-center justify-center text-[10px]">
                  {entry.playerName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate">{entry.playerName}</div>
                {entry.handle && (
                  <div className="text-xs text-[var(--muted)] truncate">@{entry.handle}</div>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className={entry.roi >= 0 ? 'text-[var(--accent-2)]' : 'text-[var(--danger)]'}>
                {entry.roi.toFixed(2)}%
              </div>
              <div className="text-xs text-[var(--muted)]">{t('peak')}: {entry.peakCash.toFixed(2)} U</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default memo(LeaderboardPanel);
