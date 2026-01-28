import type { FormEvent } from 'react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoomListItem } from '@pk-candle/shared';
import { formatSessionStatus, getHowToPlaySections, useI18n } from '../i18n';
import { normalizeRoomId } from '../utils/room';

type StartScreenProps = {
  rooms: RoomListItem[];
  roomsLoading?: boolean;
  onRefreshRooms?: () => void;
  prefillRoomId?: string | null;
};

const generateRoomCode = () => Math.random().toString(36).slice(2, 8);

const StartScreen = ({
  rooms,
  roomsLoading,
  onRefreshRooms,
  prefillRoomId,
}: StartScreenProps) => {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [createRoomId, setCreateRoomId] = useState(() => generateRoomCode());
  const [joinCode, setJoinCode] = useState('');
  const [roomQuery, setRoomQuery] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [roomName, setRoomName] = useState('');
  const [lockRoom, setLockRoom] = useState(false);
  const [roomKey, setRoomKey] = useState('');
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'create' | 'rooms'>('create');

  const deferredQuery = useDeferredValue(roomQuery);

  const filteredRooms = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase();
    if (!query) return rooms;
    return rooms.filter((room) => (
      room.roomId.toLowerCase().includes(query)
      || room.displayName.toLowerCase().includes(query)
      || (room.hostName?.toLowerCase().includes(query) ?? false)
    ));
  }, [deferredQuery, rooms]);

  useEffect(() => {
    if (!prefillRoomId) return;
    setJoinCode(prefillRoomId.slice(0, 32));
    setMobilePane('rooms');
  }, [prefillRoomId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedRoom = params.get('room');
    if (sharedRoom) {
      setJoinCode(sharedRoom.slice(0, 32));
      setMobilePane('rooms');
    }
  }, []);

  const resolveRoomCode = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/\/room\/([^/]+)/i);
      if (match?.[1]) return normalizeRoomId(match[1].slice(0, 32));
      const queryRoom = url.searchParams.get('room');
      if (queryRoom) return normalizeRoomId(queryRoom.slice(0, 32));
    } catch {
      // Not a URL.
    }
    return normalizeRoomId(trimmed.slice(0, 32));
  };

  const buildRoomUrl = (targetRoomId: string, includeConfig: boolean) => {
    const params = new URLSearchParams();
    const trimmedName = name.trim();
    if (trimmedName) params.set('name', trimmedName);
    if (includeConfig) {
      const trimmedRoomName = roomName.trim();
      if (trimmedRoomName) params.set('roomName', trimmedRoomName.slice(0, 24));
      params.set('max', String(maxPlayers));
      if (lockRoom) {
        const trimmedKey = roomKey.trim();
        if (trimmedKey) params.set('key', trimmedKey);
      }
    }
    const query = params.toString();
    const normalizedRoomId = normalizeRoomId(targetRoomId);
    return `/room/${normalizedRoomId}${query ? `?${query}` : ''}`;
  };

  const goToRoom = (targetRoomId?: string, includeConfig = false) => {
    const resolvedRoomId = (targetRoomId ?? createRoomId).trim() || 'public';
    navigate(buildRoomUrl(resolvedRoomId, includeConfig));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    goToRoom(undefined, true);
  };

  const handleNewCode = () => {
    setCreateRoomId(generateRoomCode());
  };

  const resolvedJoinCode = resolveRoomCode(joinCode);

  const handleQuickJoin = () => {
    if (!resolvedJoinCode) return;
    navigate(buildRoomUrl(resolvedJoinCode, false));
  };

  return (
    <div className="h-full max-w-6xl mx-auto flex flex-col gap-4">
      <div className="pixel-card scanline shrink-0">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="pixel-title text-xl">{t('startTitle')}</div>
            <button
              type="button"
              className="pixel-button secondary text-xs"
              onClick={() => setHowToPlayOpen(true)}
            >
              {t('howToPlay')}
            </button>
          </div>
          <p className="text-base text-[var(--muted)]">
            {t('startTagline')}
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="pixel-badge">{t('startBadgeLive')}</span>
            <span className="pixel-badge">{t('startBadgeLobbies')}</span>
            <span className="pixel-badge">{t('startBadgeLeaderboard')}</span>
          </div>
        </div>
      </div>

      <div className="md:hidden pixel-card scanline flex items-center gap-2">
        <button
          type="button"
          className={`pixel-button ghost text-xs flex-1 ${mobilePane === 'create' ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
          onClick={() => setMobilePane('create')}
        >
          {t('createRoomTitle')}
        </button>
        <button
          type="button"
          className={`pixel-button ghost text-xs flex-1 ${mobilePane === 'rooms' ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
          onClick={() => setMobilePane('rooms')}
        >
          {t('activeRooms')}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.05fr_1fr] flex-1 min-h-0 md:overflow-hidden">
        <div className={`flex flex-col gap-4 min-h-0 ${mobilePane === 'create' ? '' : 'hidden md:flex'}`}>
          <div className="pixel-card scanline space-y-3 shrink-0">
            <div className="pixel-title text-base">{t('createRoomTitle')}</div>
            <p className="text-sm text-[var(--muted)]">
              {t('createRoomBody')}
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-widest">{t('playerNameLabel')}</label>
                <input
                  className="pixel-input mt-2"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('playerNamePlaceholder')}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest">{t('roomCodeLabel')}</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    className="pixel-input flex-1"
                    value={createRoomId}
                    onChange={(event) => setCreateRoomId(event.target.value)}
                    placeholder={t('roomCodeAutoPlaceholder')}
                  />
                  <button type="button" className="pixel-button ghost text-xs" onClick={handleNewCode}>
                    {t('newCode')}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest">{t('maxPlayersLabel')}</label>
                <select
                  className="pixel-select mt-2"
                  value={maxPlayers}
                  onChange={(event) => setMaxPlayers(Number(event.target.value))}
                >
                  {[2, 3, 4, 5, 6].map((count) => (
                    <option key={count} value={count}>
                      {t('playersCount', { count })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest">{t('roomLockLabel')}</label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`pixel-button text-xs ${lockRoom ? 'success' : 'ghost'}`}
                    onClick={() => setLockRoom((prev) => !prev)}
                  >
                    {lockRoom ? t('roomLockOn') : t('roomLockOff')}
                  </button>
                  <span className="text-xs text-[var(--muted)]">{t('roomLockHint')}</span>
                </div>
              </div>
              {lockRoom && (
                <div>
                  <label className="text-xs uppercase tracking-widest">{t('roomKeyLabel')}</label>
                  <input
                    className="pixel-input mt-2"
                    value={roomKey}
                    onChange={(event) => setRoomKey(event.target.value)}
                    placeholder={t('roomKeyPlaceholder')}
                  />
                </div>
              )}
              <div>
                <label className="text-xs uppercase tracking-widest">{t('roomNameLabelShort')}</label>
                <input
                  className="pixel-input mt-2"
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  placeholder={t('roomNamePlaceholder')}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="pixel-button" type="submit" disabled={lockRoom && !roomKey.trim()}>
                  {t('createRoom')}
                </button>
              </div>
            </form>
          </div>

          {howToPlayOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
              <div className="pixel-card scanline w-full max-w-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="pixel-title text-base">{t('howToPlay')}</div>
                  <button type="button" className="pixel-button ghost text-xs" onClick={() => setHowToPlayOpen(false)}>
                    {t('close')}
                  </button>
                </div>
                <div className="mt-4 space-y-4 text-sm text-[var(--muted)] max-h-[70vh] overflow-y-auto pr-1">
                  {getHowToPlaySections(lang).map((section) => (
                    <div key={section.title}>
                      <div className="text-[var(--text)] font-semibold uppercase tracking-widest text-xs">{section.title}</div>
                      <p className="mt-1">{section.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`flex flex-col gap-4 min-h-0 ${mobilePane === 'rooms' ? '' : 'hidden md:flex'}`}>
          <div className="pixel-card scanline space-y-3 shrink-0">
            <div className="pixel-title text-base">{t('quickJoin')}</div>
            <p className="text-sm text-[var(--muted)]">
              {t('quickJoinBody')}
            </p>
            <input
              className="pixel-input"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              placeholder={t('roomCodePlaceholder')}
            />
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                className="pixel-button secondary text-xs"
                onClick={handleQuickJoin}
                disabled={!resolvedJoinCode}
              >
                {t('joinRoom')}
              </button>
            </div>
            <div className="text-xs text-[var(--muted)]">
              {t('lockedNote')}
            </div>
          </div>

          <div className="pixel-card space-y-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between">
              <div className="pixel-title text-base">{t('activeRooms')}</div>
              <button
                type="button"
                className="pixel-button ghost text-xs"
                onClick={onRefreshRooms}
                disabled={!onRefreshRooms || roomsLoading}
              >
                {roomsLoading ? t('loading') : t('refresh')}
              </button>
            </div>
            <input
              className="pixel-input"
              value={roomQuery}
              onChange={(event) => setRoomQuery(event.target.value)}
              placeholder={t('searchRoomPlaceholder')}
            />
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              {filteredRooms.length === 0 ? (
                <div className="text-sm text-[var(--muted)]">
                  {rooms.length === 0 ? t('noPublicRooms') : t('noRoomsMatch')}
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  {filteredRooms.map((room) => (
                    <div key={room.roomId} className="pixel-card inset flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-base">{room.displayName}</div>
                        <div className="text-xs text-[var(--muted)]">
                          {formatSessionStatus(room.status, lang)}
                          {' · '}
                          {t('playersOnline', { current: room.playerCount, max: room.maxPlayers })}
                          {' · '}
                          {t('roomCodeLabel')}: {room.roomId}
                          {room.hostName ? ` · ${t('hostLabel')}: ${room.hostName}` : ''}
                          {room.isLocked ? ` · ${t('locked')}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {room.playerCount >= room.maxPlayers ? (
                          <span className="text-xs text-[var(--muted)]">{t('full')}</span>
                        ) : (
                          <button
                            type="button"
                            className="pixel-button secondary text-xs"
                            onClick={() => goToRoom(room.roomId)}
                          >
                            {t('join')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default StartScreen;
