import type { RankedMatchResult } from '@pk-candle/shared';
import { useI18n } from '../i18n';

type RankedResultModalProps = {
  result: RankedMatchResult;
  selfWallet?: string | null;
  onDismiss: () => void;
};

const RankedResultModal = ({ result, selfWallet, onDismiss }: RankedResultModalProps) => {
  const { t } = useI18n();
  const normalizedSelf = selfWallet?.toLowerCase() ?? null;
  const sorted = [...result.players].sort((a, b) => a.placement - b.placement);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center px-4">
      <div className="pixel-card max-w-xl w-full text-left">
        <div className="pixel-title text-lg mb-2">{t('rankedResultTitle')}</div>
        <p className="text-sm text-[var(--muted)] mb-4">{t('rankedResultSubtitle')}</p>
        <div className="space-y-2">
          {sorted.map((player) => {
            const isSelf = normalizedSelf && player.walletAddress.toLowerCase() === normalizedSelf;
            return (
              <div key={`${player.walletAddress}-${player.placement}`} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[var(--accent)]">#{player.placement}</span>
                  <span className="truncate">{player.playerName}</span>
                  {isSelf && <span className="pixel-badge">{t('rankedYou')}</span>}
                </div>
                <div className="text-right">
                  <div className={player.delta >= 0 ? 'text-[var(--accent-2)]' : 'text-[var(--danger)]'}>
                    {player.delta >= 0 ? '+' : ''}{player.delta}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {player.tierAfter} {player.divisionAfter} · {player.ratingAfter}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end">
          <button className="pixel-button" onClick={onDismiss}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
};

export default RankedResultModal;
