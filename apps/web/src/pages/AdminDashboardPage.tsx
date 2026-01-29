import { useEffect, useMemo } from 'react';
import type { AdminMetrics } from '@pk-candle/shared';
import { useI18n } from '../i18n';

type AdminDashboardPageProps = {
  metrics: AdminMetrics | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString();
};

const AdminDashboardPage = ({ metrics, loading, error, onRefresh }: AdminDashboardPageProps) => {
  const { t } = useI18n();

  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const updatedAt = metrics ? new Date(metrics.generatedAt).toLocaleString() : '—';

  const liveMetrics = useMemo(() => ([
    { label: t('adminMetricActivePlayers'), value: metrics?.live.activePlayers },
    { label: t('adminMetricActiveRooms'), value: metrics?.live.activeRooms },
    { label: t('adminMetricLiveRooms'), value: metrics?.live.liveRooms },
    { label: t('adminMetricRankedRooms'), value: metrics?.live.rankedRooms },
    { label: t('adminMetricRankedQueue'), value: metrics?.live.rankedQueue },
  ]), [metrics, t]);

  const totalMetrics = useMemo(() => ([
    { label: t('adminMetricTotalGames'), value: metrics?.totals.totalGames },
    { label: t('adminMetricRankedMatches'), value: metrics?.totals.rankedMatches },
    { label: t('adminMetricRankedParticipants'), value: metrics?.totals.rankedParticipants },
    { label: t('adminMetricLeaderboardEntries'), value: metrics?.totals.leaderboardEntries },
    { label: t('adminMetricPlayerStarts'), value: metrics?.totals.playerStarts },
  ]), [metrics, t]);

  return (
    <div className="h-full max-w-5xl mx-auto flex flex-col gap-4 min-h-0">
      <div className="pixel-card scanline flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <div className="pixel-title text-lg">{t('adminTitle')}</div>
          <p className="text-sm text-[var(--muted)]">{t('adminSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">{t('adminUpdatedAt', { time: updatedAt })}</span>
          <button className="pixel-button ghost text-xs" onClick={onRefresh} disabled={loading}>
            {loading ? t('loading') : t('refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="pixel-card border border-red-500 text-red-300 shrink-0">{error}</div>
      )}

      <div className="pixel-card shrink-0">
        <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-3">{t('adminSectionLive')}</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {liveMetrics.map((item) => (
            <div key={item.label} className="pixel-card">
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{item.label}</div>
              <div className="pixel-title text-lg mt-2">{formatNumber(item.value)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="pixel-card shrink-0">
        <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-3">{t('adminSectionTotals')}</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {totalMetrics.map((item) => (
            <div key={item.label} className="pixel-card">
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{item.label}</div>
              <div className="pixel-title text-lg mt-2">{formatNumber(item.value)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
