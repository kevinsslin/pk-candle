import { useEffect, useMemo, useState } from 'react';
import LeaderboardPanel from '../components/LeaderboardPanel';
import type { LeaderboardEntry } from '@pk-candle/shared';
import { useI18n } from '../i18n';

type LeaderboardPageProps = {
  entries: LeaderboardEntry[];
  loading: boolean;
  error: string | null;
  leaderboardName: string;
  onUpdateName: (name: string) => void;
  submittedEntryId?: string | null;
  localHistory: Array<{
    id: string;
    roomId: string;
    playerName: string;
    cash: number;
    roi: number;
    finishedAt: number;
    day: number;
  }>;
  onRefresh: () => void;
};

const LeaderboardPage = ({
  entries,
  loading,
  error,
  leaderboardName,
  onUpdateName,
  submittedEntryId,
  localHistory,
  onRefresh,
}: LeaderboardPageProps) => {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const pageInfo = t('pageOf', { page, total: pageCount });
  const submittedRank = useMemo(() => {
    if (!submittedEntryId) return null;
    const index = entries.findIndex((entry) => entry.id === submittedEntryId);
    return index >= 0 ? index + 1 : null;
  }, [entries, submittedEntryId]);
  const pagedEntries = useMemo(() => {
    const start = (page - 1) * pageSize;
    return entries.slice(start, start + pageSize);
  }, [entries, page, pageSize]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const handleShare = () => {
    const best = entries[0];
    const headline = best
      ? t('leaderboardShareHeadline', { name: best.playerName, roi: best.roi.toFixed(2) })
      : t('leaderboardShareFallback');
    const text = t('leaderboardShareBody', { headline });
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="h-full max-w-5xl mx-auto flex flex-col gap-4 min-h-0">
      <div className="pixel-card scanline flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <div className="pixel-title text-lg">{t('leaderboardTitle')}</div>
          <p className="text-sm text-[var(--muted)]">
            {t('leaderboardSubtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {submittedRank !== null && (
            <span className="pixel-badge">{t('leaderboardYourRank', { rank: submittedRank })}</span>
          )}
          <button className="pixel-button ghost text-xs" onClick={onRefresh} disabled={loading}>
            {loading ? t('loading') : t('refresh')}
          </button>
          <button className="pixel-button text-xs" onClick={handleShare}>
            {t('share')}
          </button>
        </div>
      </div>

      <div className="pixel-card shrink-0 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="text-xs uppercase tracking-widest text-[var(--muted)]">{t('leaderboardNameLabel')}</div>
          <input
            className="pixel-input mt-2 w-full"
            value={leaderboardName}
            onChange={(event) => onUpdateName(event.target.value)}
            placeholder={t('leaderboardNamePlaceholder')}
          />
          <div className="text-[11px] text-[var(--muted)] mt-2">{t('leaderboardNameHint')}</div>
        </div>
      </div>

      {error && (
        <div className="pixel-card border border-red-500 text-red-300 shrink-0">{error}</div>
      )}

      <div className="pixel-card shrink-0">
        <div className="pixel-title text-sm mb-3">{t('localHistoryTitle')}</div>
        {localHistory.length === 0 ? (
          <div className="text-sm text-[var(--muted)]">{t('localHistoryEmpty')}</div>
        ) : (
          <div className="space-y-2 text-sm">
            {localHistory.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate">{entry.playerName} · {entry.roomId}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {new Date(entry.finishedAt).toLocaleString()} · {t('localHistoryRound', { round: entry.day })}
                  </div>
                </div>
                <div className="text-right">
                  <div>{t('localHistoryCash', { cash: entry.cash.toFixed(2) })}</div>
                  <div className={entry.roi >= 0 ? 'text-[var(--accent-2)]' : 'text-[var(--danger)]'}>
                    {t('localHistoryRoi', { roi: entry.roi.toFixed(2) })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pixel-card flex items-center justify-between gap-2 text-xs">
        <button
          type="button"
          className="pixel-button ghost text-xs"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={page <= 1}
        >
          {t('paginationPrev')}
        </button>
        <span className="text-[var(--muted)]">{pageInfo}</span>
        <button
          type="button"
          className="pixel-button ghost text-xs"
          onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
          disabled={page >= pageCount}
        >
          {t('paginationNext')}
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <LeaderboardPanel entries={pagedEntries} highlightId={submittedEntryId ?? null} />
      </div>
    </div>
  );
};

export default LeaderboardPage;
