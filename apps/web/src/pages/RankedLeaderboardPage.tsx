import type { RankedLeaderboardEntry } from '@pk-candle/shared';
import { useI18n } from '../i18n';

type RankedLeaderboardPageProps = {
  entries: RankedLeaderboardEntry[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

const RankedLeaderboardPage = ({ entries, loading, error, onRefresh }: RankedLeaderboardPageProps) => {
  const { t } = useI18n();

  return (
    <div className="h-full max-w-5xl mx-auto flex flex-col gap-4 min-h-0">
      <div className="pixel-card scanline flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <div className="pixel-title text-lg">{t('rankedLeaderboardTitle')}</div>
          <p className="text-sm text-[var(--muted)]">
            {t('rankedLeaderboardSubtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="pixel-button ghost text-xs" onClick={onRefresh} disabled={loading}>
            {loading ? t('loading') : t('refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="pixel-card border border-red-500 text-red-300 shrink-0">{error}</div>
      )}

      <div className="pixel-card flex-1 min-h-0 overflow-auto">
        {entries.length === 0 ? (
          <div className="text-sm text-[var(--muted)]">{t('rankedLeaderboardEmpty')}</div>
        ) : (
          <div className="space-y-2 text-sm">
            {entries.map((entry, index) => (
              <div key={`${entry.walletAddress}-${entry.rating}`} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate">
                    <span className="text-[var(--accent)]">#{index + 1}</span> · {entry.playerName}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {entry.tier} {entry.division} · {t('rankedMatchesLabel', { count: entry.matchesPlayed })}
                  </div>
                </div>
                <div className="text-right">
                  <div>{t('rankedRatingLabel', { rating: entry.rating })}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RankedLeaderboardPage;
