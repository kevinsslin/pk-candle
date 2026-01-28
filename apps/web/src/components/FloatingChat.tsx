import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '@pk-candle/shared';
import ChatPanel from './ChatPanel';
import { useI18n } from '../i18n';

type FloatingChatProps = {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  disabled?: boolean;
  danmakuEnabled: boolean;
  onToggleDanmaku: (next: boolean) => void;
};

const FloatingChat = ({
  messages,
  onSend,
  disabled,
  danmakuEnabled,
  onToggleDanmaku,
}: FloatingChatProps) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
  } | null>(null);

  const lastMessage = useMemo(() => {
    if (!messages.length) return null;
    return messages[messages.length - 1] ?? null;
  }, [messages]);

  useEffect(() => {
    if (open) return;
    if (!lastMessage) return;
    // Increment unread for non-system chat.
    if (lastMessage.type === 'system') return;
    setUnread((prev) => Math.min(99, prev + 1));
  }, [lastMessage, open]);

  useEffect(() => {
    if (!open) return;
    setUnread(0);
  }, [open]);

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!dragRef.current) return;
    const { startX, startY, originX, originY, width, height } = dragRef.current;
    const nextX = clamp(originX + (event.clientX - startX), 8, window.innerWidth - width - 8);
    const nextY = clamp(originY + (event.clientY - startY), 8, window.innerHeight - height - 8);
    setFloatingPos({ x: nextX, y: nextY });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const originX = floatingPos?.x ?? rect.left;
    const originY = floatingPos?.y ?? rect.top;
    setFloatingPos({ x: originX, y: originY });
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX,
      originY,
      width: rect.width,
      height: rect.height,
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  return (
    <div
      className={`fixed z-50 ${floatingPos ? '' : 'bottom-32 sm:bottom-24 md:bottom-4 right-3 sm:right-4'}`}
      style={floatingPos ? { left: floatingPos.x, top: floatingPos.y } : undefined}
    >
      {open ? (
        <div ref={panelRef} className="w-[92vw] max-w-[380px] h-[60vh] max-h-[60vh] md:h-[70vh] md:max-h-[70vh]">
          <div className="pixel-card flex flex-col h-full">
            <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
              <div
                className="pixel-title text-sm cursor-move select-none"
                onPointerDown={handlePointerDown}
                title={t('chat')}
              >
                {t('chat')}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="pixel-button ghost text-xs"
                  onClick={() => onToggleDanmaku(!danmakuEnabled)}
                >
                  {t('danmakuLabel')}: {danmakuEnabled ? t('danmakuOn') : t('danmakuOff')}
                </button>
                <button
                  type="button"
                  className="pixel-button ghost text-xs"
                  onClick={() => setOpen(false)}
                >
                  {t('close')}
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ChatPanel
                messages={messages}
                onSend={onSend}
                disabled={disabled}
                title={null}
                variant="plain"
                className="flex flex-col h-full"
              />
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="pixel-button"
          onClick={() => setOpen(true)}
        >
          {t('chat')}{unread > 0 ? ` (${unread})` : ''}
        </button>
      )}
    </div>
  );
};

export default FloatingChat;
