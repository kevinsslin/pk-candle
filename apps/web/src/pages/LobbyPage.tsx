import StartScreen from '../components/StartScreen';
import type { RankedQueueStatus, RoomListItem } from '@pk-candle/shared';

type LobbyPageProps = {
  rooms: RoomListItem[];
  roomsLoading?: boolean;
  onRefreshRooms?: () => void;
  prefillRoomId?: string | null;
  rankedQueueStatus?: RankedQueueStatus | null;
  rankedQueueError?: string | null;
  rankedVerifiedAddress?: string | null;
  onRankedVerify?: () => void;
  onRankedJoin?: (playerName: string) => void;
  onRankedCancel?: () => void;
};

const LobbyPage = (props: LobbyPageProps) => {
  return <StartScreen {...props} />;
};

export default LobbyPage;
