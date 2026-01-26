import type { MarketState, RoomSnapshot, PlayerState } from '@pk-candle/shared';
import { formatSessionStatus, useI18n } from '../i18n';

const formatTime = (seconds: number | null) => {
  if (seconds === null) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const calcPnl = (player: PlayerState | null, price: number) => {
  if (!player?.position) return 0;
  const delta = player.position.side === 'LONG'
    ? price - player.position.entryPrice
    : player.position.entryPrice - price;
  return delta * player.position.size;
};

type StatusPanelProps = {
  room: RoomSnapshot;
  market: MarketState;
  self: PlayerState | null;
  mode: 'player';
  countdown: number | null;
  timeLeft: number | null;
  connection: 'idle' | 'connecting' | 'connected' | 'error';
};

const StatusPanel = ({ room, market, self, countdown, timeLeft, connection }: StatusPanelProps) => {
  const { t, lang } = useI18n();
  const pnl = calcPnl(self, market.price);
  const equity = self ? self.cash + (self.position ? self.position.margin + pnl : 0) : 0;
  const connectionLabel = {
    idle: t('connectionIdle'),
    connecting: t('connectionConnecting'),
    connected: t('connectionConnected'),
    error: t('connectionError'),
  }[connection];

  const totalRounds = 6;
  const round = Math.max(1, Math.min(totalRounds, room.session.currentDay));
  const progressPct = (round / totalRounds) * 100;

  return (
    <div className="pixel-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="pixel-title text-sm">{t('sessionTitle')}</div>
          <div className="text-sm text-[var(--muted)]">
            {t('statusLabel')}: {formatSessionStatus(room.session.status, lang)}
          </div>
          <div className="text-sm text-[var(--muted)]">
            {t('roundLabel', { round, total: totalRounds })} · {t('timeLeftLabel', { time: formatTime(timeLeft) })}
          </div>
          <div className="h-2 w-56 bg-black/40 rounded">
            <div className="h-2 bg-[var(--accent)] rounded" style={{ width: `${progressPct}%` }} />
          </div>
          {countdown !== null && room.session.status === 'COUNTDOWN' && (
            <div className="text-sm text-[var(--accent)]">{t('startingIn', { seconds: countdown })}</div>
          )}
        </div>

        <div className="space-y-1 text-right">
          <div className="pixel-title text-sm">{t('you')}</div>
          <div className="text-sm">{t('cash')}: {self ? self.cash.toFixed(2) : '--'} U</div>
          <div className="text-sm">{t('equity')}: {equity.toFixed(2)} U</div>
          <div className={`text-sm ${pnl >= 0 ? 'text-[var(--accent-2)]' : 'text-[var(--danger)]'}`}>
            {t('pnl')}: {pnl.toFixed(2)}
          </div>
          <div className="text-sm">
            {t('stress')}: {self ? self.stress : '--'}
          </div>
          <div className="text-xs text-[var(--muted)]">{t('connection')}: {connectionLabel}</div>
        </div>
      </div>
    </div>
  );
};

export default StatusPanel;
