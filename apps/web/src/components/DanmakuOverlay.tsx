import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '@pk-candle/shared';

type DanmakuOverlayProps = {
  enabled: boolean;
  messages: ChatMessage[];
};

type DanmakuItem = {
  id: string;
  text: string;
  topPct: number;
  durationMs: number;
  tone: 'system' | 'npc' | 'chat' | 'spectator';
};

const pickTop = () => {
  // Keep it away from the very top/bottom to avoid UI overlap.
  const min = 8;
  const max = 82;
  return min + Math.random() * (max - min);
};

const DanmakuOverlay = ({ enabled, messages }: DanmakuOverlayProps) => {
  const [items, setItems] = useState<DanmakuItem[]>([]);
  const lastSeenIdRef = useRef<string | null>(null);

  const lastMessage = useMemo(() => {
    if (!messages.length) return null;
    return messages[messages.length - 1] ?? null;
  }, [messages]);

  useEffect(() => {
    if (!enabled) return;
    if (!lastMessage) return;

    if (lastSeenIdRef.current === lastMessage.id) return;
    lastSeenIdRef.current = lastMessage.id;

    const label = lastMessage.senderHandle ? `@${lastMessage.senderHandle}` : lastMessage.sender;
    const text = lastMessage.type === 'system'
      ? lastMessage.text
      : `${label}: ${lastMessage.text}`;

    const item: DanmakuItem = {
      id: `${lastMessage.id}-${Date.now()}`,
      text,
      topPct: pickTop(),
      durationMs: 9000 + Math.floor(Math.random() * 4000),
      tone: lastMessage.type,
    };

    setItems((prev) => [...prev, item].slice(-20));

    const timer = setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    }, item.durationMs + 200);

    return () => clearTimeout(timer);
  }, [enabled, lastMessage]);

  if (!enabled) return null;

  return (
    <div className="danmaku-overlay" aria-hidden>
      {items.map((item) => (
        <div
          key={item.id}
          className={`danmaku-item ${item.tone}`}
          style={{ top: `${item.topPct}%`, animationDuration: `${item.durationMs}ms` }}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
};

export default DanmakuOverlay;
