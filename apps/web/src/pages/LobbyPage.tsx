import StartScreen from '../components/StartScreen';
import type { RoomListItem } from '@pk-candle/shared';

type LobbyPageProps = {
  rooms: RoomListItem[];
  roomsLoading?: boolean;
  onRefreshRooms?: () => void;
  prefillRoomId?: string | null;
};

const LobbyPage = (props: LobbyPageProps) => {
  return <StartScreen {...props} />;
};

export default LobbyPage;
