import type { LeaderboardEntry, PlayerState } from '@pk-candle/shared';
import { useI18n } from '../i18n';

type GameOverScreenProps = {
  player: PlayerState | null;
  leaderboard: LeaderboardEntry[];
  leaderboardName: string;
  onLeaderboardNameChange: (name: string) => void;
  claimLabel: string;
  claimDisabled?: boolean;
  claimNotice?: string | null;
  submittedEntryId?: string | null;
  onClaim: (name?: string) => void;
  onDismiss: () => void;
};

const GameOverScreen = ({
  player,
  leaderboard,
  leaderboardName,
  onLeaderboardNameChange,
  claimLabel,
  claimDisabled,
  claimNotice,
  submittedEntryId,
  onClaim,
  onDismiss,
}: GameOverScreenProps) => {
  const { t } = useI18n();
  const submittedRank = submittedEntryId
    ? leaderboard.findIndex((entry) => entry.id === submittedEntryId) + 1
    : 0;
  const handleShare = () => {
    const roi = player && player.initialCash > 0
      ? (((player.cash - player.initialCash) / player.initialCash) * 100).toFixed(2)
      : '0.00';
    const text = t('gameOverShare', { roi, url: window.location.origin });
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleClaim = () => {
    onClaim(leaderboardName);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center px-4">
      <div className="pixel-card max-w-xl w-full text-center">
        <div className="pixel-title text-lg mb-2">{t('gameOver')}</div>
        <p className="text-sm text-[var(--muted)] mb-4">
          {player?.status === 'ELIMINATED' ? t('youGotRekt') : t('sessionEnded')}
        </p>
        <div className="text-base space-y-1 mb-4">
          <div>{t('finalCash')}: {player ? player.cash.toFixed(2) : '--'} U</div>
        </div>
        <div className="pixel-card inset text-left mb-4">
          <label className="text-xs uppercase tracking-widest text-[var(--muted)]">{t('leaderboardNameLabel')}</label>
          <input
            className="pixel-input mt-2 w-full"
            value={leaderboardName}
            onChange={(event) => onLeaderboardNameChange(event.target.value)}
            placeholder={t('leaderboardNamePlaceholder')}
          />
          <div className="text-[11px] text-[var(--muted)] mt-2">{t('leaderboardNameHint')}</div>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button className="pixel-button secondary" onClick={handleShare}>{t('shareToTwitter')}</button>
          <button className="pixel-button" onClick={handleClaim} disabled={claimDisabled}>
            {claimLabel}
          </button>
          <button className="pixel-button ghost" onClick={onDismiss}>{t('close')}</button>
        </div>
        {claimNotice && (
          <div className="mt-3 text-xs text-[var(--accent)]">{claimNotice}</div>
        )}
        {submittedRank > 0 && (
          <div className="mt-2 text-xs text-[var(--accent)]">
            {t('leaderboardYourRank', { rank: submittedRank })}
          </div>
        )}
        <div className="mt-6 text-left">
          <div className="pixel-title text-sm mb-2">{t('topPlayers')}</div>
          <div className="space-y-1 text-sm">
            {leaderboard.slice(0, 5).map((entry, index) => (
              <div key={entry.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[var(--accent)]">#{index + 1}</span>
                  {entry.avatarUrl ? (
                    <img
                      src={entry.avatarUrl}
                      alt={entry.handle ? `@${entry.handle}` : entry.playerName}
                      className="h-6 w-6 rounded-full border border-[rgba(148,163,184,0.35)]"
                    />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-[rgba(148,163,184,0.2)] flex items-center justify-center text-[10px]">
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
                <span>{entry.roi.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameOverScreen;
