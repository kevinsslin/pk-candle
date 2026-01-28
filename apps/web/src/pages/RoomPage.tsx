import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { MarketEvent, PlayerState, RoomListItem, RoomSnapshot, TradeRequest } from '@pk-candle/shared';
import { DEFAULT_ROLE_KEY } from '@pk-candle/shared';
import StatusPanel from '../components/StatusPanel';
import TradePanel from '../components/TradePanel';
import PositionPanel from '../components/PositionPanel';
import TradeHistoryPanel from '../components/TradeHistoryPanel';
import RoomLeaderboardWidget from '../components/RoomLeaderboardWidget';
import RoomLeaderboardPanel from '../components/RoomLeaderboardPanel';
import FloatingChat from '../components/FloatingChat';
import DanmakuOverlay from '../components/DanmakuOverlay';
import MobileTradeDock from '../components/MobileTradeDock';
import LobbyPanel from '../components/LobbyPanel';
import ErrorBoundary from '../components/ErrorBoundary';
import { useI18n } from '../i18n';
import { normalizeRoomId } from '../utils/room';

const MarketChartPanel = lazy(() => import('../components/MarketChartPanel'));

const emptyMarket = {
  token: null,
  price: 0,
  candles: [],
  phase: 'IDLE' as const,
  volatility: 0.1,
  isRugged: false,
};

type RoomPageProps = {
  room: RoomSnapshot | null;
  mode: 'player';
  marketFeed: MarketEvent[];
  globalEvent: MarketEvent | null;
  respawnNotice: {
    reason: 'BROKE' | 'DEAD';
    endsAt: number;
    currentCash: number;
    respawnCash: number;
    penaltyPct: number;
  } | null;
  respawnLeftSeconds: number | null;
  connection: 'idle' | 'connecting' | 'connected' | 'error';
  countdown: number | null;
  timeLeft: number | null;
  canTrade: boolean;
  tradeDisabledReason: string | null;
  pauseLeftSeconds: number | null;
  joinError?: string | null;
  rooms: RoomListItem[];
  onJoin: (payload: {
    roomId: string;
    roomName?: string;
    playerName: string;
    roleKey: string;
    roomKey?: string;
    maxPlayers?: number;
    mode?: 'player' | 'spectator';
  }) => void;
  onSendChat: (text: string) => void;
  onTrade: (trade: TradeRequest) => void;
  onStartCountdown: () => void;
  onSetRoomKey: (roomKey?: string) => void;
  onSetReady: (ready: boolean) => void;
  onKickPlayer: (playerId: string) => void;
  onUpdateName: (name: string) => void;
};

const RoomPage = ({
  room,
  mode,
  marketFeed,
  globalEvent,
  respawnNotice,
  respawnLeftSeconds,
  connection,
  countdown,
  timeLeft,
  canTrade,
  tradeDisabledReason,
  pauseLeftSeconds,
  joinError,
  rooms,
  onJoin,
  onSendChat,
  onTrade,
  onStartCountdown,
  onSetRoomKey,
  onSetReady,
  onKickPlayer,
  onUpdateName,
}: RoomPageProps) => {
  const params = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const routeRoomId = params.roomId ?? '';
  const normalizedRoomId = normalizeRoomId(routeRoomId);
  const prefillName = searchParams.get('name') ?? '';
  const prefillRoomName = searchParams.get('roomName') ?? '';
  const prefillRoomKey = searchParams.get('key') ?? '';
  const prefillMaxRaw = Number.parseInt(searchParams.get('max') ?? '', 10);
  const isCreatingRoom = searchParams.has('max') || searchParams.has('roomName');
  const prefillMaxPlayers = Number.isFinite(prefillMaxRaw)
    ? Math.min(6, Math.max(2, prefillMaxRaw))
    : 4;

  const [name, setName] = useState(prefillName);
  const [roomKey, setRoomKey] = useState(prefillRoomKey);
  const [roomName, setRoomName] = useState(prefillRoomName);
  const [maxPlayers, setMaxPlayers] = useState(prefillMaxPlayers);
  const [danmakuEnabled, setDanmakuEnabled] = useState(true);
  const [rightTab, setRightTab] = useState<'trade' | 'events' | 'lobby'>('lobby');
  const [requiresKey, setRequiresKey] = useState(false);

  useEffect(() => {
    if (!routeRoomId) return;
    if (normalizedRoomId === routeRoomId) return;
    const query = searchParams.toString();
    navigate(`/room/${normalizedRoomId}${query ? `?${query}` : ''}`, { replace: true });
  }, [navigate, normalizedRoomId, routeRoomId, searchParams]);

  useEffect(() => {
    setName(prefillName);
    setRoomName(prefillRoomName);
    setMaxPlayers(prefillMaxPlayers);
    setRoomKey(prefillRoomKey);
    setRequiresKey(false);
  }, [prefillName, prefillRoomKey, prefillRoomName, prefillMaxPlayers, routeRoomId]);

  useEffect(() => {
    if (!room) return;
    const nextTab = room.session.status === 'LIVE' ? 'trade' : 'lobby';
    setRightTab(nextTab);
  }, [room]);

  useEffect(() => {
    if (joinError === 'Room key required.') {
      setRequiresKey(true);
    }
  }, [joinError]);

  useEffect(() => {
    if (!normalizedRoomId) return;
    const match = rooms.find((room) => room.roomId === normalizedRoomId);
    if (match?.isLocked) {
      setRequiresKey(true);
    }
  }, [normalizedRoomId, rooms]);

  const market = room?.market ?? emptyMarket;
  const self: PlayerState | null = room?.self ?? null;
  const isHost = room?.hostId === room?.selfId;
  const isLobby = room ? (room.session.status === 'LOBBY' || room.session.status === 'COUNTDOWN') : false;
  const showLobbyPanel = room ? room.session.status !== 'LIVE' : false;
  const showCountdownOverlay = room?.session.status === 'COUNTDOWN' && countdown !== null;
  const showPauseOverlay = room?.session.status === 'LIVE'
    && pauseLeftSeconds !== null
    && pauseLeftSeconds > 0;
  const showRespawnOverlay = Boolean(respawnNotice && respawnLeftSeconds !== null && respawnLeftSeconds > 0);
  const showLobbyOverlay = isLobby;
  const isLive = room?.session.status === 'LIVE';
  const showMobileLobbyOnly = !isLive;

  const isRoomLocked = requiresKey;

  const impactLines = useMemo(() => {
    if (!globalEvent) return [];
    const formatImpactDelta = (value: number) => {
      const percent = value * 100;
      const sign = percent >= 0 ? '+' : '';
      return `${sign}${percent.toFixed(1)}%`;
    };
    const lines: string[] = [];
    if (globalEvent.effect.phase) {
      lines.push(t('eventImpactPhase', { phase: globalEvent.effect.phase }));
    }
    if (globalEvent.effect.volatilityDelta) {
      lines.push(t('eventImpactVolatility', { value: formatImpactDelta(globalEvent.effect.volatilityDelta) }));
    }
    if (globalEvent.effect.priceMultiplier) {
      lines.push(t('eventImpactPrice', { value: globalEvent.effect.priceMultiplier.toFixed(2) }));
    }
    if (!lines.length) {
      lines.push(t('eventImpactNeutral'));
    }
    return lines;
  }, [globalEvent, t]);

  const eventMarqueeText = useMemo(() => {
    return [
      t('globalEvents'),
      globalEvent?.title ?? t('eventPausedTitle'),
      globalEvent?.description ?? t('eventPausedBody'),
      ...impactLines,
    ].join(' | ');
  }, [globalEvent, impactLines, t]);

  const rightTabs = useMemo(() => ([
    { key: 'trade' as const, label: t('tradeTitle') },
    { key: 'events' as const, label: t('globalEvents') },
    ...(showLobbyPanel ? [{ key: 'lobby' as const, label: t('lobbyTitle') }] : []),
  ]), [showLobbyPanel, t]);

  const handleJoin = () => {
    if (!normalizedRoomId) return;
    onJoin({
      roomId: normalizedRoomId,
      roomName: isCreatingRoom ? (roomName.trim() || undefined) : undefined,
      playerName: name.trim() || t('guest'),
      roleKey: DEFAULT_ROLE_KEY,
      roomKey: roomKey.trim() || undefined,
      maxPlayers: isCreatingRoom ? maxPlayers : undefined,
      // mode omitted (no spectators)
    });
  };

  if (!routeRoomId) {
    return (
      <div className="pixel-card max-w-xl mx-auto text-center">
        <div className="pixel-title text-lg">{t('roomNotFoundTitle')}</div>
        <p className="text-sm text-[var(--muted)] mt-2">{t('roomNotFoundBody')}</p>
        <Link to="/" className="pixel-button mt-4 inline-flex">{t('backToLobby')}</Link>
      </div>
    );
  }

  if (room && room.roomId !== normalizedRoomId) {
    return (
      <div className="pixel-card max-w-xl mx-auto text-center">
        <div className="pixel-title text-lg">{t('alreadyInRoomTitle', { roomId: room.roomId })}</div>
        <p className="text-sm text-[var(--muted)] mt-2">{t('alreadyInRoomBody')}</p>
        <Link to={`/room/${room.roomId}`} className="pixel-button mt-4 inline-flex">{t('goToRoom')}</Link>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="pixel-card scanline">
          <div className="pixel-title text-lg">{t('joinRoomTitle', { roomId: routeRoomId })}</div>
          <p className="text-sm text-[var(--muted)] mt-2">
            {isRoomLocked ? t('enterRoomKey') : t('joiningRoom')}
          </p>
          <div className="mt-4 grid gap-4">
            <div>
              <label className="text-sm uppercase tracking-widest">{t('nameLabel')}</label>
              <input
                className="pixel-input mt-2"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('playerNamePlaceholder')}
              />
            </div>
            {(isRoomLocked || roomKey) && (
              <div>
                <label className="text-sm uppercase tracking-widest">{t('roomKeyLabel')}</label>
                <input
                  className="pixel-input mt-2"
                  value={roomKey}
                  onChange={(event) => setRoomKey(event.target.value)}
                  placeholder={t('roomKeyPlaceholder')}
                />
              </div>
            )}
            {isCreatingRoom && (
              <>
                <div>
                  <label className="text-sm uppercase tracking-widest">{t('roomNameLabel')}</label>
                  <input
                    className="pixel-input mt-2"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    placeholder={t('roomNamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="text-sm uppercase tracking-widest">{t('maxPlayersLabel')}</label>
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
              </>
            )}
            {joinError && (
              <div className="pixel-card inset border border-red-500 text-red-300 text-sm">
                {joinError}
              </div>
            )}
            <button
              className="pixel-button"
              onClick={handleJoin}
              disabled={connection === 'connecting' || (isRoomLocked && !roomKey.trim())}
            >
              {connection === 'connecting' ? t('connecting') : t('enterRoom')}
            </button>
          </div>
        </div>
        <Link to="/" className="pixel-button ghost inline-flex">{t('backToLobby')}</Link>
      </div>
    );
  }

  const session = room.session;

  return (
    <div className="flex flex-col gap-4 relative min-h-0 pb-24 lg:pb-0">
      {showRespawnOverlay && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90">
          <div className="pixel-card text-center max-w-lg">
            <div className="text-xs uppercase tracking-widest text-[var(--muted)]">{t('respawnWarning')}</div>
            <div className="text-4xl font-black mt-2 glow-text">
              {respawnNotice?.reason === 'BROKE' ? t('respawnTitleBroke') : t('respawnTitleDead')}
            </div>
            <div className="mt-3 text-sm text-[var(--muted)]">{t('respawnPenalty', { percent: respawnNotice?.penaltyPct ?? 0 })}</div>
            <div className="mt-3 space-y-1 text-sm">
              <div>{t('respawnCurrentCash', { cash: respawnNotice?.currentCash.toFixed(2) ?? '0.00' })}</div>
              <div>{t('respawnNewCash', { cash: respawnNotice?.respawnCash.toFixed(2) ?? '0.00' })}</div>
            </div>
            <div className="text-base font-black mt-4">{t('respawnCountdown', { seconds: respawnLeftSeconds ?? 0 })}</div>
          </div>
        </div>
      )}

      {showCountdownOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.85)]">
          <div className="pixel-card scanline text-center">
            <div className="text-xs uppercase tracking-widest text-[var(--muted)]">{t('getReady')}</div>
            <div className="text-6xl font-black mt-2 glow-text">{countdown}</div>
          </div>
        </div>
      )}

      {showPauseOverlay && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/85">
          <div className="absolute top-8 left-1/2 w-[min(96vw,1200px)] -translate-x-1/2">
            <div className="event-marquee event-marquee--global" role="status" aria-live="polite">
              <div className="event-marquee-track">
                <span className="event-marquee-text">{eventMarqueeText}</span>
                <span className="event-marquee-text" aria-hidden="true">{eventMarqueeText}</span>
              </div>
            </div>
          </div>
          <div className="pixel-card event-banner text-center max-w-lg mx-4">
            <div className="text-xs uppercase tracking-widest">{t('paused')}</div>
            <div className="text-2xl font-black mt-2">
              {globalEvent?.title ?? t('eventPausedTitle')}
            </div>
            <div className="text-sm text-[var(--muted)] mt-2">
              {globalEvent?.description ?? t('eventPausedBody')}
            </div>
            <div className="mt-3 text-xs uppercase tracking-widest">{t('eventImpactTitle')}</div>
            <div className="mt-2 space-y-1 text-sm text-[var(--text)]">
              {impactLines.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>
            <div className="text-base font-black mt-4">{t('nextRoundIn', { seconds: pauseLeftSeconds ?? 0 })}</div>
          </div>
        </div>
      )}

      <StatusPanel
        room={room}
        market={market}
        self={self}
        mode={mode}
        countdown={countdown}
        timeLeft={timeLeft}
        connection={connection}
        onRename={onUpdateName}
      />

      {showMobileLobbyOnly && (
        <div className="lg:hidden">
          <LobbyPanel
            room={room}
            isHost={isHost && mode === 'player'}
            countdown={countdown}
            onStart={onStartCountdown}
            onSetRoomKey={onSetRoomKey}
            onSetReady={onSetReady}
            onKickPlayer={onKickPlayer}
          />
        </div>
      )}

      <div
        className={
          showMobileLobbyOnly
            ? 'hidden lg:grid gap-4 lg:grid-cols-[2.4fr_1.1fr]'
            : 'grid gap-4 lg:grid-cols-[2.4fr_1.1fr]'
        }
      >
        <div className="flex flex-col gap-4 min-w-0">
          <ErrorBoundary
            fallback={(
              <div className="pixel-card flex flex-col items-center justify-center h-[60vh] min-h-[360px] text-center gap-3">
                <div className="pixel-title text-sm">{t('chartLoadFailed')}</div>
                <div className="text-xs text-[var(--muted)]">{t('chartLoadFailedHint')}</div>
                <button className="pixel-button ghost text-xs" onClick={() => window.location.reload()}>
                  {t('reload')}
                </button>
              </div>
            )}
          >
            <Suspense
              fallback={(
                <div className="pixel-card flex items-center justify-center h-[60vh] min-h-[360px]">
                  <div className="text-sm text-[var(--muted)]">{t('loading')}</div>
                </div>
              )}
            >
              <MarketChartPanel
                market={market}
                player={self}
                heightClassName="h-[60vh] min-h-[360px]"
                overlay={(
                  <>
                    <DanmakuOverlay enabled={danmakuEnabled} messages={room.chat} />
                    {showLobbyOverlay && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <div className="pixel-card event-banner text-center">
                          <div className="text-xs uppercase tracking-widest text-[var(--muted)]">{t('lobbyTitle')}</div>
                          <div className="text-2xl font-black mt-2">{t('readyUpToStart')}</div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              />
            </Suspense>
          </ErrorBoundary>

          <div className="grid gap-4 lg:grid-cols-[0.85fr_1fr_1fr]">
            <PositionPanel
              market={market}
              player={self}
              disabled={!canTrade}
              disabledReason={tradeDisabledReason ?? undefined}
            />
            <TradeHistoryPanel player={self} />
            <div className="hidden lg:block">
              <RoomLeaderboardPanel players={room.players} price={market.price} />
            </div>
          </div>

          <div className="lg:hidden">
            <RoomLeaderboardWidget players={room.players} price={market.price} />
          </div>
        </div>

        <div className="hidden lg:flex flex-col gap-3 min-w-0 min-h-0">
          <div className="flex flex-wrap gap-2">
            {rightTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`pixel-button ghost text-xs ${rightTab === tab.key ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
                onClick={() => setRightTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {rightTab === 'trade' && (
            <TradePanel
              market={market}
              player={self}
              onTrade={onTrade}
              disabled={!canTrade}
              disabledReason={tradeDisabledReason ?? undefined}
            />
          )}

          {rightTab === 'events' && (
            <div className="pixel-card shrink-0">
              <div className="pixel-title text-sm mb-2">{t('globalEvents')}</div>
              {marketFeed.length === 0 ? (
                <div className="text-sm text-[var(--muted)]">{t('noMarketShocks')}</div>
              ) : (
                <div
                  className="space-y-2 text-sm max-h-72 overflow-y-auto pr-1"
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '240px' }}
                >
                  {marketFeed.map((event) => (
                    <div key={event.id} className="pixel-card inset">
                      <div className="text-sm">{event.title}</div>
                      <div className="text-xs text-[var(--muted)]">{event.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {rightTab === 'lobby' && showLobbyPanel && (
            <LobbyPanel
              room={room}
              isHost={isHost && mode === 'player'}
              countdown={countdown}
              onStart={onStartCountdown}
              onSetRoomKey={onSetRoomKey}
              onSetReady={onSetReady}
              onKickPlayer={onKickPlayer}
            />
          )}
        </div>
      </div>

      <FloatingChat
        messages={room.chat}
        onSend={onSendChat}
        disabled={session.status === 'ENDED'}
        danmakuEnabled={danmakuEnabled}
        onToggleDanmaku={setDanmakuEnabled}
      />

      {isLive && (
        <MobileTradeDock
          market={market}
          player={self}
          onTrade={onTrade}
          disabled={!canTrade}
          disabledReason={tradeDisabledReason ?? undefined}
        />
      )}
    </div>
  );
};

export default RoomPage;
