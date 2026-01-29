import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DEFAULT_ROLE_KEY } from '@pk-candle/shared';
import type {
  AdminMetrics,
  LeaderboardEntry,
  MarketEvent,
  PersonalEvent,
  RankedLeaderboardEntry,
  RankedMatchResult,
  RankedQueueStatus,
  RoomListItem,
  RoomSnapshot,
  ServerMessage,
  TradeRequest,
} from '@pk-candle/shared';
import EventModal from './components/EventModal';
import GameOverScreen from './components/GameOverScreen';
import RankedResultModal from './components/RankedResultModal';
import { useI18n } from './i18n';
import { normalizeRoomId } from './utils/room';
import { useAccount, useChainId, useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';

const LobbyPage = lazy(() => import('./pages/LobbyPage'));
const RoomPage = lazy(() => import('./pages/RoomPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const RankedLeaderboardPage = lazy(() => import('./pages/RankedLeaderboardPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));

const RAW_WS_URL = import.meta.env.VITE_WS_URL as string | undefined;
const WS_URL = RAW_WS_URL || (import.meta.env.DEV ? 'ws://localhost:8080' : '');
const MISSING_WS_URL = !RAW_WS_URL && import.meta.env.PROD;
const PERSONAL_EVENT_DECISION_MS = 10_000;
const LOCAL_HISTORY_KEY = 'pk-candle-local-history';
const MAX_LOCAL_HISTORY = 20;

const toHttpUrl = (wsUrl: string, path: string) => {
  try {
    const url = new URL(wsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
};

const ROOMS_URL = WS_URL ? toHttpUrl(WS_URL, '/rooms') : '';
const LEADERBOARD_URL = WS_URL ? toHttpUrl(WS_URL, '/leaderboard') : '';
const LEADERBOARD_SUBMIT_URL = LEADERBOARD_URL ? LEADERBOARD_URL.replace(/\/leaderboard$/, '/leaderboard/submit') : '';
const RANKED_LEADERBOARD_URL = WS_URL ? toHttpUrl(WS_URL, '/ranked/leaderboard') : '';
const ADMIN_METRICS_URL = WS_URL ? toHttpUrl(WS_URL, '/admin/metrics') : '';
const SIWE_STATEMENT =
  'Sign in with Ethereum to verify your wallet. No transactions will be sent.';

const loadClientId = () => {
  const existing = localStorage.getItem('pk-candle-client-id');
  if (existing) return existing;
  const next = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  localStorage.setItem('pk-candle-client-id', next);
  return next;
};

type LocalRun = {
  id: string;
  roomId: string;
  playerName: string;
  cash: number;
  roi: number;
  finishedAt: number;
  day: number;
};

const loadLocalHistory = (): LocalRun[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as LocalRun[];
  } catch {
    return [];
  }
};

const App = () => {
  const clientIdRef = useRef(loadClientId());
  const wsRef = useRef<WebSocket | null>(null);
  const rankedWsRef = useRef<WebSocket | null>(null);
  const nonceResolverRef = useRef<((nonce: string) => void) | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [personalEvent, setPersonalEvent] = useState<PersonalEvent | null>(null);
  const [personalEventEndsAt, setPersonalEventEndsAt] = useState<number | null>(null);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [dismissedGameOver, setDismissedGameOver] = useState(false);
  const [connection, setConnection] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [globalEvent, setGlobalEvent] = useState<MarketEvent | null>(null);
  const [marketFeed, setMarketFeed] = useState<MarketEvent[]>([]);
  const [mode, setMode] = useState<'player'>('player');
  const [respawnNotice, setRespawnNotice] = useState<{
    reason: 'BROKE' | 'DEAD';
    endsAt: number;
    currentCash: number;
    respawnCash: number;
    penaltyPct: number;
  } | null>(null);
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardNotice, setLeaderboardNotice] = useState<string | null>(null);
  const [leaderboardClaiming, setLeaderboardClaiming] = useState(false);
  const [leaderboardName, setLeaderboardName] = useState('');
  const [localHistory, setLocalHistory] = useState<LocalRun[]>(loadLocalHistory);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [lastSubmittedEntryId, setLastSubmittedEntryId] = useState<string | null>(null);
  const [rankedQueueStatus, setRankedQueueStatus] = useState<RankedQueueStatus | null>(null);
  const [rankedQueueError, setRankedQueueError] = useState<string | null>(null);
  const [rankedMatchResult, setRankedMatchResult] = useState<RankedMatchResult | null>(null);
  const [rankedLeaderboard, setRankedLeaderboard] = useState<RankedLeaderboardEntry[]>([]);
  const [rankedLeaderboardLoading, setRankedLeaderboardLoading] = useState(false);
  const [rankedLeaderboardError, setRankedLeaderboardError] = useState<string | null>(null);
  const [adminMetrics, setAdminMetrics] = useState<AdminMetrics | null>(null);
  const [adminMetricsLoading, setAdminMetricsLoading] = useState(false);
  const [adminMetricsError, setAdminMetricsError] = useState<string | null>(null);
  const [rankedVerifiedAddress, setRankedVerifiedAddress] = useState<string | null>(null);
  const rankedPlayerNameRef = useRef<string>('');
  const languageRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const leaderboardTimeoutRef = useRef<number | null>(null);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  const { t, lang, setLang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const mapLeaderboardError = useCallback((message: string) => {
    switch (message) {
      case 'Leaderboard already submitted.':
      case 'Already submitted.':
        return t('leaderboardAlreadySubmitted');
      case 'Failed to submit leaderboard.':
        return t('leaderboardSubmitFailed');
      case 'No result found for client.':
        return t('leaderboardNoResult');
      case 'Database not configured. Set DATABASE_URL.':
      case 'Database not configured. Set DATABASE_URL or DB_URL.':
      case 'Database not configured.':
        return t('leaderboardDbMissing');
      case 'Database unavailable.':
        return t('leaderboardDbUnavailable');
      case 'Database schema missing. Run pnpm db:push.':
        return t('leaderboardDbSchemaMissing');
      case 'Leaderboard service unavailable.':
        return t('leaderboardServiceUnavailable');
      default:
        return message;
    }
  }, [t]);

  const isNonBlockingError = useCallback((message: string) => {
    return message === 'Login is temporarily unavailable.';
  }, []);

  useEffect(() => {
    if (!languageOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!languageRef.current) return;
      if (!languageRef.current.contains(event.target as Node)) {
        setLanguageOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLanguageOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [languageOpen]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    if (leaderboardName) return;
    const stored = localStorage.getItem('pk-candle-leaderboard-name');
    setLeaderboardName(stored ?? t('leaderboardNameDefault'));
  }, [leaderboardName, t]);

  useEffect(() => {
    if (!leaderboardName) return;
    localStorage.setItem('pk-candle-leaderboard-name', leaderboardName);
  }, [leaderboardName]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(localHistory));
  }, [localHistory]);

  useEffect(() => {
    if (!isConnected) {
      setRankedVerifiedAddress(null);
    }
  }, [isConnected]);

  useEffect(() => {
    if (!address || !rankedVerifiedAddress) return;
    if (address.toLowerCase() !== rankedVerifiedAddress.toLowerCase()) {
      setRankedVerifiedAddress(null);
    }
  }, [address, rankedVerifiedAddress]);

  const leaveRoom = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setRoom(null);
    setPersonalEvent(null);
    setPersonalEventEndsAt(null);
    setDismissedGameOver(false);
    setConnection('idle');
    setError(null);
    setGlobalEvent(null);
    setMarketFeed([]);
    setMode('player');
    setRankedMatchResult(null);
  }, []);

  useEffect(() => {
    setLeaderboardNotice(null);
    setLeaderboardClaiming(false);
    setLastSubmittedEntryId(null);
    if (leaderboardTimeoutRef.current) {
      window.clearTimeout(leaderboardTimeoutRef.current);
      leaderboardTimeoutRef.current = null;
    }
  }, [room?.roomId]);

  const fetchRooms = useCallback(async () => {
    if (!ROOMS_URL) return;
    setRoomsLoading(true);
    try {
      const response = await fetch(ROOMS_URL);
      if (!response.ok) throw new Error('rooms');
      const payload = await response.json() as { rooms?: RoomListItem[] };
      setRooms(Array.isArray(payload.rooms) ? payload.rooms : []);
    } catch {
      setRooms([]);
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    if (!LEADERBOARD_URL) return;
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const response = await fetch(LEADERBOARD_URL);
      if (!response.ok) throw new Error('leaderboard');
      const payload = await response.json() as { leaderboard?: LeaderboardEntry[] };
      setGlobalLeaderboard(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);
    } catch {
      setLeaderboardError(t('leaderboardLoadFailed'));
      setGlobalLeaderboard([]);
    } finally {
      setLeaderboardLoading(false);
    }
  }, [t]);

  const fetchRankedLeaderboard = useCallback(async () => {
    if (!RANKED_LEADERBOARD_URL) return;
    setRankedLeaderboardLoading(true);
    setRankedLeaderboardError(null);
    try {
      const response = await fetch(RANKED_LEADERBOARD_URL);
      if (!response.ok) throw new Error('ranked');
      const payload = await response.json() as { leaderboard?: RankedLeaderboardEntry[] };
      setRankedLeaderboard(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);
    } catch {
      setRankedLeaderboardError(t('rankedLeaderboardLoadFailed'));
      setRankedLeaderboard([]);
    } finally {
      setRankedLeaderboardLoading(false);
    }
  }, [t]);

  const fetchAdminMetrics = useCallback(async () => {
    if (!ADMIN_METRICS_URL) {
      setAdminMetricsError(t('adminMetricsLoadFailed'));
      return;
    }
    setAdminMetricsLoading(true);
    setAdminMetricsError(null);
    try {
      const response = await fetch(ADMIN_METRICS_URL);
      if (!response.ok) throw new Error('admin-metrics');
      const payload = await response.json() as { metrics?: AdminMetrics };
      setAdminMetrics(payload.metrics ?? null);
    } catch {
      setAdminMetricsError(t('adminMetricsLoadFailed'));
      setAdminMetrics(null);
    } finally {
      setAdminMetricsLoading(false);
    }
  }, [t]);

  const submitLeaderboardHttp = useCallback(async (playerName: string) => {
    if (!LEADERBOARD_SUBMIT_URL) {
      throw new Error('Leaderboard submit URL missing.');
    }
    const response = await fetch(LEADERBOARD_SUBMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: clientIdRef.current,
        playerName,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to submit leaderboard.');
    }
    const entry = payload.entry as LeaderboardEntry | undefined;
    if (!entry) {
      throw new Error('Failed to submit leaderboard.');
    }
    setLastSubmittedEntryId(entry.id);
    setGlobalLeaderboard((prev) => {
      if (prev.find((row) => row.id === entry.id)) return prev;
      return [entry, ...prev].sort((a, b) => b.roi - a.roi);
    });
    setLeaderboardNotice(t('leaderboardSubmitted'));
    return entry;
  }, [t]);

  const needsClock = Boolean(
    room?.session.countdownEndsAt
    || room?.session.endsAt
    || room?.session.pauseEndsAt
    || personalEventEndsAt
    || respawnNotice?.endsAt,
  );

  useEffect(() => {
    if (!needsClock) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [needsClock]);

  useEffect(() => {
    if (!ROOMS_URL) return;
    void fetchRooms();
    const interval = setInterval(() => {
      if (!room) void fetchRooms();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchRooms, room]);

  useEffect(() => {
    if (!LEADERBOARD_URL) return;
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    if (!RANKED_LEADERBOARD_URL) return;
    void fetchRankedLeaderboard();
  }, [fetchRankedLeaderboard]);

  useEffect(() => {
    if (room?.session.status === 'ENDED' || room?.self?.status === 'ELIMINATED') {
      setDismissedGameOver(false);
    }
  }, [room?.session.status, room?.self?.status]);

  useEffect(() => {
    if (!room) return;
    if (!location.pathname.startsWith('/room/')) {
      leaveRoom();
    }
  }, [leaveRoom, location.pathname, room]);

  const sendMessage = useCallback((message: unknown) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(message));
  }, []);

  const handleServerMessage = useCallback((payload: ServerMessage) => {
    switch (payload.type) {
      case 'room_state':
        setRoom(payload.room);
        return;
      case 'rooms':
        setRooms(payload.rooms);
        return;
      case 'personal_event':
        setPersonalEvent(payload.event);
        setPersonalEventEndsAt(payload.expiresAt ?? (Date.now() + PERSONAL_EVENT_DECISION_MS));
        return;
      case 'market_event':
        setGlobalEvent(payload.event);
        setMarketFeed((prev) => [payload.event, ...prev].slice(0, 20));
        return;
      case 'respawn_notice': {
        const endsAt = Date.now() + payload.pauseMs;
        setRespawnNotice({
          reason: payload.reason,
          endsAt,
          currentCash: payload.currentCash,
          respawnCash: payload.respawnCash,
          penaltyPct: payload.penaltyPct,
        });
        return;
      }
      case 'market_tick':
        setRoom((prev) => prev ? { ...prev, market: payload.market } : prev);
        return;
      case 'presence':
        setRoom((prev) => {
          if (!prev) return prev;
          const selfSummary = prev.selfId
            ? payload.players.find((player) => player.id === prev.selfId)
            : null;
          const nextSelf = prev.self && selfSummary ? { ...prev.self, ...selfSummary } : prev.self;
          return { ...prev, players: payload.players, spectators: payload.spectators, hostId: payload.hostId, self: nextSelf };
        });
        return;
      case 'session_status':
        setRoom((prev) => prev ? { ...prev, session: payload.session } : prev);
        return;
      case 'leaderboard':
        setGlobalLeaderboard(payload.entries);
        return;
      case 'chat':
        setRoom((prev) => prev ? { ...prev, chat: [...prev.chat, payload.message].slice(-120) } : prev);
        return;
      case 'leaderboard_submitted':
        if (leaderboardTimeoutRef.current) {
          window.clearTimeout(leaderboardTimeoutRef.current);
          leaderboardTimeoutRef.current = null;
        }
        setLeaderboardClaiming(false);
        setLeaderboardNotice(t('leaderboardSubmitted'));
        setLastSubmittedEntryId(payload.entry.id);
        setGlobalLeaderboard((prev) => {
          const exists = prev.find((entry) => entry.id === payload.entry.id);
          if (exists) return prev;
          const next = [payload.entry, ...prev].sort((a, b) => b.roi - a.roi);
          return next;
        });
        void fetchLeaderboard();
        return;
      case 'ranked_match_result':
        setRankedMatchResult(payload.result);
        void fetchRankedLeaderboard();
        return;
      case 'self_state':
        setRoom((prev) => {
          if (!prev) return prev;
          const nextPlayers = prev.players.map((player) => {
            if (player.id !== payload.state.id) return player;
            return {
              ...player,
              name: payload.state.name,
              roleKey: payload.state.roleKey,
              role: payload.state.role,
              initialCash: payload.state.initialCash,
              cash: payload.state.cash,
              stress: payload.state.stress,
              status: payload.state.status,
              position: payload.state.position,
              ready: payload.state.ready,
            };
          });
          return { ...prev, self: payload.state, players: nextPlayers };
        });
        return;
      case 'pong':
      case 'connected':
        return;
      case 'game_over':
        setRoom((prev) => prev ? { ...prev, self: payload.result } : prev);
        setLocalHistory((prev) => {
          const currentRoom = roomRef.current;
          const finishedAt = Date.now();
          const roi = payload.result.initialCash > 0
            ? ((payload.result.cash - payload.result.initialCash) / payload.result.initialCash) * 100
            : 0;
          const entry: LocalRun = {
            id: `${currentRoom?.roomId ?? 'room'}-${finishedAt}`,
            roomId: currentRoom?.roomId ?? 'unknown',
            playerName: payload.result.name,
            cash: payload.result.cash,
            roi,
            finishedAt,
            day: currentRoom?.session.currentDay ?? 0,
          };
          return [entry, ...prev].slice(0, MAX_LOCAL_HISTORY);
        });
        return;
      case 'error':
        if (!isNonBlockingError(payload.message)) {
          setError(payload.message);
        }
        if (leaderboardClaiming) {
          if (leaderboardTimeoutRef.current) {
            window.clearTimeout(leaderboardTimeoutRef.current);
            leaderboardTimeoutRef.current = null;
          }
          setLeaderboardClaiming(false);
          setLeaderboardNotice(mapLeaderboardError(payload.message));
        }
        return;
      default:
        return;
    }
  }, [fetchLeaderboard, fetchRankedLeaderboard, isNonBlockingError, leaderboardClaiming, mapLeaderboardError, t]);

  const connect = useCallback((params: {
    roomId: string;
    roomName?: string;
    playerName: string;
    roleKey: string;
    roomKey?: string;
    maxPlayers?: number;
    mode?: 'player' | 'spectator';
  }) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setConnection('connecting');
    setError(null);

    if (!WS_URL) {
      setConnection('error');
      setError(t('missingWsBody'));
      return;
    }

    setMode('player');

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnection('connected');
      sendMessage({
        type: 'join',
        roomId: params.roomId,
        roomName: params.roomName,
        playerName: params.playerName,
        roleKey: params.roleKey,
        roomKey: params.roomKey,
        maxPlayers: params.maxPlayers,
        clientId: clientIdRef.current,
        mode: params.mode,
      });
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      handleServerMessage(message);
    };

    ws.onerror = () => {
      setConnection('error');
      setError(t('wsError'));
    };

    ws.onclose = () => {
      setConnection('idle');
      wsRef.current = null;
      setRoom(null);
      setPersonalEvent(null);
      setPersonalEventEndsAt(null);
    };
  }, [handleServerMessage, sendMessage]);

  const handleRankedMessage = useCallback((payload: ServerMessage) => {
    switch (payload.type) {
      case 'siwe_nonce':
        if (nonceResolverRef.current) {
          nonceResolverRef.current(payload.nonce);
          nonceResolverRef.current = null;
        }
        return;
      case 'siwe_authenticated':
        setRankedVerifiedAddress(payload.walletAddress);
        setRankedQueueError(null);
        return;
      case 'ranked_queue_status':
        if (payload.status.status === 'cancelled') {
          setRankedQueueStatus(null);
        } else {
          setRankedQueueStatus(payload.status);
        }
        if (payload.status.status === 'queued') {
          setRankedQueueError(null);
        }
        return;
      case 'ranked_match_found': {
        setRankedQueueStatus(null);
        setRankedQueueError(null);
        const name = rankedPlayerNameRef.current || t('guest');
        connect({
          roomId: payload.roomId,
          roomName: 'Ranked Match',
          playerName: name,
          roleKey: DEFAULT_ROLE_KEY,
          roomKey: payload.roomKey,
          maxPlayers: payload.playerCount,
        });
        navigate(`/room/${payload.roomId}`);
        if (rankedWsRef.current) {
          rankedWsRef.current.close();
          rankedWsRef.current = null;
        }
        return;
      }
      case 'error':
        setRankedQueueError(payload.message);
        return;
      default:
        return;
    }
  }, [connect, navigate, t]);

  const ensureRankedSocket = useCallback(() => {
    if (!WS_URL) throw new Error('WS URL missing');
    if (rankedWsRef.current) {
      if (rankedWsRef.current.readyState === WebSocket.OPEN) {
        return Promise.resolve(rankedWsRef.current);
      }
      if (rankedWsRef.current.readyState === WebSocket.CONNECTING) {
        return new Promise<WebSocket>((resolve, reject) => {
          const ws = rankedWsRef.current!;
          const handleOpen = () => {
            ws.removeEventListener('open', handleOpen);
            resolve(ws);
          };
          const handleError = () => {
            ws.removeEventListener('error', handleError);
            reject(new Error('Ranked socket error'));
          };
          ws.addEventListener('open', handleOpen);
          ws.addEventListener('error', handleError);
        });
      }
    }

    return new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      rankedWsRef.current = ws;
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerMessage;
        handleRankedMessage(message);
      };
      ws.onerror = () => {
        setRankedQueueError(t('wsError'));
      };
      ws.onopen = () => resolve(ws);
      ws.onclose = () => {
        rankedWsRef.current = null;
      };
      ws.addEventListener('error', () => reject(new Error('Ranked socket error')));
    });
  }, [handleRankedMessage, t]);

  const requestSiweNonce = useCallback(async () => {
    const ws = await ensureRankedSocket();
    return new Promise<string>((resolve) => {
      nonceResolverRef.current = resolve;
      ws.send(JSON.stringify({ type: 'siwe_nonce_request', clientId: clientIdRef.current }));
    });
  }, [ensureRankedSocket]);

  const handleVerifyWallet = useCallback(async () => {
    if (!address) {
      setRankedQueueError(t('rankedConnectWalletFirst'));
      return;
    }
    try {
      setRankedQueueError(null);
      const nonce = await requestSiweNonce();
      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address,
        statement: SIWE_STATEMENT,
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce,
      });
      const message = siweMessage.prepareMessage();
      const signature = await signMessageAsync({ message });
      const ws = await ensureRankedSocket();
      ws.send(JSON.stringify({
        type: 'siwe_auth',
        clientId: clientIdRef.current,
        message,
        signature,
      }));
    } catch (err) {
      setRankedQueueError(err instanceof Error ? err.message : t('rankedVerifyFailed'));
    }
  }, [address, chainId, ensureRankedSocket, requestSiweNonce, signMessageAsync, t]);

  const handleJoinRankedQueue = useCallback(async (playerName: string) => {
    if (!rankedVerifiedAddress) {
      setRankedQueueError(t('rankedVerifyRequired'));
      return;
    }
    try {
      setRankedQueueError(null);
      rankedPlayerNameRef.current = playerName.trim() || t('guest');
      const ws = await ensureRankedSocket();
      ws.send(JSON.stringify({
        type: 'ranked_queue_join',
        clientId: clientIdRef.current,
        playerName: rankedPlayerNameRef.current,
      }));
    } catch (err) {
      setRankedQueueError(err instanceof Error ? err.message : t('rankedQueueFailed'));
    }
  }, [ensureRankedSocket, rankedVerifiedAddress, t]);

  const handleCancelRankedQueue = useCallback(() => {
    if (!rankedWsRef.current || rankedWsRef.current.readyState !== WebSocket.OPEN) {
      setRankedQueueStatus(null);
      return;
    }
    rankedWsRef.current.send(JSON.stringify({ type: 'ranked_queue_cancel', clientId: clientIdRef.current }));
    setRankedQueueStatus(null);
  }, []);

  const handleSendChat = (text: string) => sendMessage({ type: 'chat', text });
  const handleTrade = (trade: TradeRequest) => sendMessage({ type: 'trade', trade });
  const handleStartCountdown = () => sendMessage({ type: 'start_countdown' });
  const handleSetRoomKey = (roomKey?: string) => sendMessage({ type: 'set_room_key', roomKey });
  const handleSetReady = (readyState: boolean) => sendMessage({ type: 'set_ready', ready: readyState });
  const handleKickPlayer = (playerId: string) => sendMessage({ type: 'kick_player', playerId });
  const handleUpdateName = (name: string) => sendMessage({ type: 'update_name', name });

  const handleEventChoice = (eventId: string, choiceId: string) => {
    sendMessage({ type: 'event_choice', eventId, choiceId });
    setPersonalEvent(null);
    setPersonalEventEndsAt(null);
  };

  const countdown = useMemo(() => {
    if (!room?.session.countdownEndsAt) return null;
    const seconds = Math.ceil((room.session.countdownEndsAt - now) / 1000);
    return Math.max(0, seconds);
  }, [now, room?.session.countdownEndsAt]);

  const timeLeft = useMemo(() => {
    if (!room?.session.endsAt) return null;
    const seconds = Math.ceil((room.session.endsAt - now) / 1000);
    return Math.max(0, seconds);
  }, [now, room?.session.endsAt]);

  const pauseLeft = room?.session.pauseEndsAt ? room.session.pauseEndsAt - now : null;
  const pauseLeftSeconds = pauseLeft !== null ? Math.max(0, Math.ceil(pauseLeft / 1000)) : null;
  const personalEventLeft = personalEventEndsAt !== null ? personalEventEndsAt - now : null;
  const personalEventLeftSeconds = personalEventLeft !== null ? Math.max(0, Math.ceil(personalEventLeft / 1000)) : null;
  const respawnLeft = respawnNotice ? respawnNotice.endsAt - now : null;
  const respawnLeftSeconds = respawnLeft !== null ? Math.max(0, Math.ceil(respawnLeft / 1000)) : null;
  const respawnActive = respawnLeftSeconds !== null && respawnLeftSeconds > 0;
  const showEventOverlay = room?.session.status === 'LIVE' && pauseLeft !== null && pauseLeft > 0;
  const personalEventActive = Boolean(personalEvent && personalEventLeftSeconds !== null && personalEventLeftSeconds > 0);
  const canTrade = Boolean(
    room?.self
    && room.self.status === 'ACTIVE'
    && room.session.status === 'LIVE'
    && !showEventOverlay
    && !personalEventActive
    && !respawnActive
    && mode === 'player'
    && (room.market?.price ?? 0) > 0,
  );
  const tradeDisabledReason = (() => {
    if (!room?.self) return t('tradingDisabledJoin');
    if (room.self.status !== 'ACTIVE') return t('tradingDisabledNotActive');
    if (room.session.status !== 'LIVE') return t('tradingDisabledNotLive');
    if (respawnActive) return t('respawnPaused', { seconds: respawnLeftSeconds ?? 0 });
    if (personalEventActive) return t('tradingDisabledPersonalEvent');
    if (showEventOverlay) return t('tradingDisabledPaused');
    if ((room.market?.price ?? 0) <= 0) return t('tradingDisabledInvalidPrice');
    return null;
  })();

  useEffect(() => {
    if (!showEventOverlay && globalEvent) {
      setGlobalEvent(null);
    }
  }, [globalEvent, showEventOverlay]);

  useEffect(() => {
    if (!respawnNotice) return;
    if (respawnLeftSeconds !== null && respawnLeftSeconds <= 0) {
      setRespawnNotice(null);
    }
  }, [respawnLeftSeconds, respawnNotice]);

  useEffect(() => {
    if (!personalEvent) return;
    if (personalEventLeftSeconds !== null && personalEventLeftSeconds <= 0) {
      setPersonalEvent(null);
      setPersonalEventEndsAt(null);
    }
  }, [personalEvent, personalEventLeftSeconds]);

  const handleClaimLeaderboard = (playerName?: string) => {
    const finalName = (playerName ?? leaderboardName).trim() || t('leaderboardNameDefault');
    const confirmed = window.confirm(t('leaderboardConfirmSubmit', { name: finalName }));
    if (!confirmed) return;
    setLeaderboardNotice(t('leaderboardSubmitting'));
    setLeaderboardClaiming(true);
    if (leaderboardTimeoutRef.current) {
      window.clearTimeout(leaderboardTimeoutRef.current);
    }
    const useWebSocket = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
    if (useWebSocket) {
      leaderboardTimeoutRef.current = window.setTimeout(() => {
        submitLeaderboardHttp(finalName).catch((err) => {
          setLeaderboardNotice(mapLeaderboardError(err?.message ?? t('leaderboardSubmitFailed')));
        }).finally(() => {
          setLeaderboardClaiming(false);
          leaderboardTimeoutRef.current = null;
        });
      }, 10000);
      sendMessage({ type: 'claim_leaderboard', playerName: finalName });
      return;
    }
    submitLeaderboardHttp(finalName).catch((err) => {
      setLeaderboardNotice(mapLeaderboardError(err?.message ?? t('leaderboardSubmitFailed')));
    }).finally(() => {
      setLeaderboardClaiming(false);
    });
  };

  if (MISSING_WS_URL) {
    return (
      <div className="pixel-card max-w-xl mx-auto text-center">
        <div className="pixel-title text-lg">{t('missingWsTitle')}</div>
        <p className="text-sm text-[var(--muted)] mt-2">{t('missingWsBody')}</p>
      </div>
    );
  }

  const rawQueryRoomId = new URLSearchParams(location.search).get('room');
  const queryRoomId = rawQueryRoomId ? normalizeRoomId(rawQueryRoomId) : null;

  return (
    <div className="h-full px-4 py-4 md:px-6 flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="PK Candle" className="h-8 w-8 rounded-md border border-[var(--border)]" />
            <span className="pixel-title text-xl md:text-2xl glow-text">{t('appName')}</span>
          </Link>
          <span className="pixel-badge">{t('turboRoom')}</span>
          {/* no spectator mode */}
        </div>
        <nav className="flex items-center gap-2">
          <Link to="/" onClick={() => room && leaveRoom()} className="pixel-button ghost text-xs">
            {t('lobby')}
          </Link>
          <button
            type="button"
            onClick={() => {
              if (room) leaveRoom();
              navigate('/ranked');
            }}
            className="pixel-button ghost text-xs"
          >
            {t('rankedLeaderboardNav')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (room) leaveRoom();
              navigate('/leaderboard');
            }}
            className="pixel-button ghost text-xs"
          >
            {t('leaderboard')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (room) leaveRoom();
              navigate('/admin');
            }}
            className="pixel-button ghost text-xs"
          >
            {t('adminNav')}
          </button>
          {room && (
            <button className="pixel-button ghost text-xs" onClick={leaveRoom}>
              {t('leaveRoom')}
            </button>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <div className="relative" ref={languageRef}>
            <button
              type="button"
              className="pixel-button ghost text-xs flex items-center gap-2"
              onClick={() => setLanguageOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={languageOpen}
            >
              <span>{t('languageLabel')}</span>
              <span className="text-[var(--muted)]">{lang === 'zh-CN' ? '简体' : 'EN'}</span>
              <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 7l5 6 5-6H5z" fill="currentColor" />
              </svg>
            </button>
            {languageOpen && (
              <div className="pixel-card absolute right-0 mt-2 w-56 z-50 p-3" role="menu">
                <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-2">
                  {t('languageFlagsTitle')}
                </div>
                <button
                  type="button"
                  className="pixel-button ghost text-xs w-full justify-start gap-2 flex"
                  onClick={() => {
                    setLang('zh-CN');
                    setLanguageOpen(false);
                  }}
                  role="menuitem"
                >
                  <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
                    <rect width="20" height="14" fill="#DE2910" />
                    <polygon
                      fill="#FFDE00"
                      points="4,1.5 4.8,3.5 7,3.5 5.2,4.7 5.9,6.8 4,5.5 2.1,6.8 2.8,4.7 1,3.5 3.2,3.5"
                    />
                  </svg>
                  <span>{t('languageChinese')}</span>
                </button>
                <button
                  type="button"
                  className="pixel-button ghost text-xs w-full justify-start gap-2 flex mt-2"
                  onClick={() => {
                    setLang('en');
                    setLanguageOpen(false);
                  }}
                  role="menuitem"
                >
                  <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
                    <rect width="20" height="14" fill="#B22234" />
                    <rect y="2" width="20" height="2" fill="#FFFFFF" />
                    <rect y="6" width="20" height="2" fill="#FFFFFF" />
                    <rect y="10" width="20" height="2" fill="#FFFFFF" />
                    <rect width="8" height="6" fill="#3C3B6E" />
                    <circle cx="2" cy="2" r="0.6" fill="#FFFFFF" />
                    <circle cx="4" cy="2" r="0.6" fill="#FFFFFF" />
                    <circle cx="6" cy="2" r="0.6" fill="#FFFFFF" />
                    <circle cx="2" cy="4" r="0.6" fill="#FFFFFF" />
                    <circle cx="4" cy="4" r="0.6" fill="#FFFFFF" />
                    <circle cx="6" cy="4" r="0.6" fill="#FFFFFF" />
                  </svg>
                  <span>{t('languageEnglish')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="pixel-card border border-red-500 text-red-300 shrink-0">{error}</div>
      )}

      {leaderboardNotice && (
        <div className="pixel-card border border-[var(--accent)] text-[var(--text)] shrink-0">{leaderboardNotice}</div>
      )}

      <main className="flex-1 min-h-0 overflow-y-auto">
        <Suspense
          fallback={(
            <div className="pixel-card max-w-xl mx-auto text-center">
              <div className="pixel-title text-lg">{t('loading')}</div>
            </div>
          )}
        >
          <Routes>
            <Route
              path="/"
              element={(
                <LobbyPage
                  rooms={rooms}
                  roomsLoading={roomsLoading}
                  onRefreshRooms={fetchRooms}
                  prefillRoomId={queryRoomId}
                  rankedQueueStatus={rankedQueueStatus}
                  rankedQueueError={rankedQueueError}
                  rankedVerifiedAddress={rankedVerifiedAddress}
                  onRankedVerify={handleVerifyWallet}
                  onRankedJoin={handleJoinRankedQueue}
                  onRankedCancel={handleCancelRankedQueue}
                />
              )}
            />
            <Route
              path="/room/:roomId"
              element={(
                <RoomPage
                  room={room}
                  mode={mode}
                  marketFeed={marketFeed}
                  globalEvent={globalEvent}
                  respawnNotice={respawnNotice}
                  respawnLeftSeconds={respawnLeftSeconds}
                  connection={connection}
                  countdown={countdown}
                  timeLeft={timeLeft}
                  canTrade={canTrade}
                  tradeDisabledReason={tradeDisabledReason}
                  pauseLeftSeconds={pauseLeftSeconds}
                  joinError={error}
                  rooms={rooms}
                  roomsLoading={roomsLoading}
                  onJoin={connect}
                  onSendChat={handleSendChat}
                  onTrade={handleTrade}
                  onStartCountdown={handleStartCountdown}
                  onSetRoomKey={handleSetRoomKey}
                  onSetReady={handleSetReady}
                  onKickPlayer={handleKickPlayer}
                  onUpdateName={handleUpdateName}
                />
              )}
            />
            <Route
              path="/leaderboard"
              element={(
                <LeaderboardPage
                  entries={globalLeaderboard}
                  loading={leaderboardLoading}
                  error={leaderboardError}
                  leaderboardName={leaderboardName}
                  onUpdateName={setLeaderboardName}
                  localHistory={localHistory}
                  submittedEntryId={lastSubmittedEntryId}
                  onRefresh={fetchLeaderboard}
                />
              )}
            />
            <Route
              path="/ranked"
              element={(
                <RankedLeaderboardPage
                  entries={rankedLeaderboard}
                  loading={rankedLeaderboardLoading}
                  error={rankedLeaderboardError}
                  onRefresh={fetchRankedLeaderboard}
                />
              )}
            />
            <Route
              path="/admin"
              element={(
                <AdminDashboardPage
                  metrics={adminMetrics}
                  loading={adminMetricsLoading}
                  error={adminMetricsError}
                  onRefresh={fetchAdminMetrics}
                />
              )}
            />
            <Route
              path="*"
              element={(
                <div className="pixel-card max-w-xl mx-auto text-center">
                  <div className="pixel-title text-lg">{t('pageNotFoundTitle')}</div>
                  <p className="text-sm text-[var(--muted)] mt-2">{t('pageNotFoundBody')}</p>
                  <Link to="/" className="pixel-button mt-4 inline-flex">{t('goHome')}</Link>
                </div>
              )}
            />
          </Routes>
        </Suspense>
      </main>

      {personalEvent && (
        <EventModal
          event={personalEvent}
          secondsLeft={personalEventLeftSeconds ?? 0}
          onSelect={handleEventChoice}
        />
      )}

      {!dismissedGameOver && room?.session.status === 'ENDED' && room?.mode === 'ranked' && rankedMatchResult && (
        <RankedResultModal
          result={rankedMatchResult}
          selfWallet={rankedVerifiedAddress}
          onDismiss={() => {
            setDismissedGameOver(true);
            leaveRoom();
          }}
        />
      )}

      {!dismissedGameOver && room?.session.status === 'ENDED' && room?.mode !== 'ranked' && (
        <GameOverScreen
          player={room.self}
          leaderboard={globalLeaderboard}
          leaderboardName={leaderboardName}
          onLeaderboardNameChange={setLeaderboardName}
          claimLabel={leaderboardClaiming ? t('leaderboardSubmitting') : t('claimLeaderboard')}
          claimDisabled={leaderboardClaiming}
          claimNotice={leaderboardNotice}
          submittedEntryId={lastSubmittedEntryId}
          onClaim={(name) => handleClaimLeaderboard(name)}
          onDismiss={() => {
            setDismissedGameOver(true);
            leaveRoom();
          }}
        />
      )}
    </div>
  );
};

export default App;
