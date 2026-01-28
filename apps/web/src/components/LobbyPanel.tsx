import { useState } from 'react';
import type { RoomSnapshot } from '@pk-candle/shared';
import { useI18n } from '../i18n';

type LobbyPanelProps = {
  room: RoomSnapshot;
  isHost: boolean;
  countdown: number | null;
  onStart: () => void;
  onSetRoomKey: (roomKey?: string) => void;
  onSetReady: (ready: boolean) => void;
  onKickPlayer: (playerId: string) => void;
};

const LobbyPanel = ({
  room,
  isHost,
  countdown,
  onStart,
  onSetRoomKey,
  onSetReady,
  onKickPlayer,
}: LobbyPanelProps) => {
  const { t } = useI18n();
  const [roomKey, setRoomKey] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const canEditLock = isHost && room.session.status === 'LOBBY';
  const readyCount = room.players.filter((player) => player.ready).length;
  const totalPlayers = room.players.length;
  const allReady = totalPlayers >= 1 && readyCount === totalPlayers;
  const selfReady = Boolean(room.self?.ready);
  const hostName = room.players.find((player) => player.isHost)?.name ?? '--';

  const handleInvite = async () => {
    try {
      const url = new URL(window.location.origin);
      url.pathname = `/room/${room.roomId}`;
      const lockNote = room.isLocked ? t('inviteLockedNote') : t('inviteUnlockedNote');
      const text = [
        t('inviteTitle'),
        t('inviteRoomCode', { roomId: room.roomId }),
        t('inviteBringTrades'),
        lockNote,
        t('inviteJoin', { url: url.toString() }),
      ].join('\n');
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        window.prompt(t('inviteCopyPrompt'), text);
      }
      setInviteStatus('copied');
      setTimeout(() => setInviteStatus('idle'), 1800);
    } catch {
      setInviteStatus('failed');
      setTimeout(() => setInviteStatus('idle'), 1800);
    }
  };

  return (
    <div className="pixel-card flex flex-col min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 shrink-0">
        <div>
          <div className="pixel-title text-sm">{t('lobbyTitle')}</div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <span>{t('roomLabel', { roomId: room.roomId })}</span>
            <span>{t('hostLabel')}: {hostName}</span>
            <button
              type="button"
              className="pixel-button ghost text-xs"
              onClick={handleInvite}
            >
              {inviteStatus === 'copied' ? t('inviteCopied') : inviteStatus === 'failed' ? t('inviteFailed') : t('inviteCrew')}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`pixel-badge ${allReady ? 'ready' : 'waiting'}`}>
            {t('readyCount', { ready: readyCount, total: totalPlayers || 0 })}
          </span>
          {room.self && (
            <button
              className={`pixel-button ${selfReady ? 'danger' : 'success'} text-xs`}
              onClick={() => onSetReady(!selfReady)}
            >
              {selfReady ? t('cancelReady') : t('readyUp')}
            </button>
          )}
          {isHost ? (
            <button className="pixel-button secondary" onClick={onStart} disabled={!allReady}>
              {countdown ? t('startingIn', { seconds: countdown }) : t('startCountdown')}
            </button>
          ) : (
            <span className="pixel-badge">
              {countdown ? t('startingIn', { seconds: countdown }) : allReady ? t('waitingHost') : t('readyUpToStart')}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 space-y-3 md:overflow-y-auto md:pr-1">
        <div>
          <div className="text-sm uppercase tracking-widest">{t('roomLockTitle')}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`pixel-badge ${room.isLocked ? 'text-[var(--accent-3)]' : 'text-[var(--accent-2)]'}`}>
              {room.isLocked ? t('locked') : t('unlocked')}
            </span>
            {!isHost && <span className="text-xs text-[var(--muted)]">{t('hostControlsKey')}</span>}
          </div>
          {isHost && (
            <div className="mt-3 space-y-2">
              <label className="text-xs uppercase tracking-widest" htmlFor="room-key-input">
                {t('setUpdateKey')}
              </label>
              <input
                id="room-key-input"
                className="pixel-input"
                value={roomKey}
                onChange={(event) => setRoomKey(event.target.value)}
                placeholder={room.isLocked ? t('setNewRoomKeyPlaceholder') : t('setRoomKeyPlaceholder')}
                disabled={!canEditLock}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  className="pixel-button ghost"
                  onClick={() => {
                    const nextKey = roomKey.trim();
                    if (!nextKey) return;
                    onSetRoomKey(nextKey);
                    setRoomKey('');
                  }}
                  disabled={!canEditLock || !roomKey.trim()}
                >
                  {t('updateKey')}
                </button>
                <button
                  className="pixel-button ghost"
                  onClick={() => {
                    onSetRoomKey(undefined);
                    setRoomKey('');
                  }}
                  disabled={!canEditLock || !room.isLocked}
                >
                  {t('removeLock')}
                </button>
              </div>
              <div className="text-xs text-[var(--muted)]">{t('lockHelp')}</div>
              {!canEditLock && (
                <div className="text-xs text-[var(--muted)]">{t('lockDisabled')}</div>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="text-sm uppercase tracking-widest">{t('seatsTitle', { max: room.maxPlayers })}</div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Array.from({ length: room.maxPlayers }).map((_, idx) => {
              const player = room.players[idx] ?? null;
              return (
                <div key={idx} className="pixel-card inset flex items-center justify-between gap-3 min-h-[72px]">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
                      {t('seatLabel', { number: idx + 1 })}
                    </div>
                    {player ? (
                      <>
                        <div className="flex items-center gap-2 min-w-0 mt-1">
                          <span className="text-sm truncate">{player.name}</span>
                          {player.isHost && (
                            <span className="text-[10px] uppercase tracking-widest text-[var(--accent)]">
                              {t('hostTag')}
                            </span>
                          )}
                          <span className={`pixel-badge ${player.ready ? 'ready' : 'waiting'} text-[10px] px-2 py-0.5`}>
                            {player.ready ? t('ready') : t('notReady')}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--muted)] mt-1">
                          {player.online ? t('online') : t('offline')}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-[var(--muted)] mt-1">{t('emptySeat')}</div>
                    )}
                  </div>
                  {player && isHost && !player.isHost && (
                    <button
                      type="button"
                      className="pixel-button ghost text-[10px]"
                      onClick={() => onKickPlayer(player.id)}
                    >
                      {t('kick')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-sm uppercase tracking-widest">{t('spectatorsTitle')}</div>
          <div className="mt-2 text-xs text-[var(--muted)]">{t('spectatorDisabled')}</div>
        </div>
      </div>
    </div>
  );
};

export default LobbyPanel;
