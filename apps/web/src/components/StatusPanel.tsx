import type { MarketState, RoomSnapshot, PlayerState } from '@pk-candle/shared';
import { useEffect, useState } from 'react';
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
  onRename?: (name: string) => void;
};

const StatusPanel = ({ room, market, self, countdown, timeLeft, connection, onRename }: StatusPanelProps) => {
  const { t, lang } = useI18n();
  const [editingName, setEditingName] = useState(false);
  const [nextName, setNextName] = useState(self?.name ?? '');
  const pnl = calcPnl(self, market.price);
  const equity = self ? self.cash + (self.position ? self.position.margin + pnl : 0) : 0;
  const connectionLabel = {
    idle: t('connectionIdle'),
    connecting: t('connectionConnecting'),
    connected: t('connectionConnected'),
    error: t('connectionError'),
  }[connection];

  useEffect(() => {
    if (editingName) return;
    setNextName(self?.name ?? '');
  }, [editingName, self?.name]);

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
          <div className="flex items-center justify-end gap-2">
            <div className="pixel-title text-sm">{t('you')}</div>
            {self && onRename && (
              <button
                type="button"
                className="pixel-button ghost text-[10px] px-2 py-1"
                onClick={() => setEditingName((prev) => !prev)}
                aria-label={t('editName')}
                title={t('editName')}
              >
                <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M13.6 2.6l3.8 3.8-9.7 9.7H3.9v-3.8l9.7-9.7z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            )}
          </div>
          {self && (
            <div className="text-sm">
              {t('nameLabel')}: {self.name}
            </div>
          )}
          {self && onRename && editingName && (
            <div className="space-y-2">
              <input
                className="pixel-input text-xs"
                value={nextName}
                onChange={(event) => setNextName(event.target.value)}
                placeholder={t('nameLabel')}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="pixel-button ghost text-[10px]"
                  onClick={() => {
                    setEditingName(false);
                    setNextName(self.name);
                  }}
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  className="pixel-button secondary text-[10px]"
                  onClick={() => {
                    const trimmed = nextName.trim();
                    if (trimmed && trimmed !== self.name) {
                      onRename(trimmed);
                    }
                    setEditingName(false);
                  }}
                >
                  {t('save')}
                </button>
              </div>
            </div>
          )}
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
