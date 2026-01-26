import type { FormEvent } from 'react';
import { memo, useState } from 'react';
import type { ChatMessage } from '@pk-candle/shared';
import { useI18n } from '../i18n';

type ChatPanelProps = {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  disabled?: boolean;
  title?: string | null;
  variant?: 'card' | 'plain';
  className?: string;
};

const ChatPanel = ({ messages, onSend, disabled, title, variant = 'card', className }: ChatPanelProps) => {
  const { t } = useI18n();
  const [text, setText] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const getTone = (type: ChatMessage['type']) => {
    switch (type) {
      case 'system':
        return 'text-[var(--accent)]';
      case 'spectator':
        return 'text-[var(--accent-3)]';
      case 'npc':
        return 'text-[var(--accent-2)]';
      default:
        return 'text-[var(--text)]';
    }
  };

  const resolvedTitle = title === undefined ? t('chatRoom') : title;
  const rootClassName = `${variant === 'card' ? 'pixel-card ' : ''}flex flex-col min-h-0 h-full ${className ?? ''}`.trim();

  return (
    <div className={rootClassName}>
      {resolvedTitle !== null && (
        <div className="pixel-title text-sm mb-3 shrink-0">{resolvedTitle}</div>
      )}
      <div
        className="flex-1 min-h-0 overflow-y-auto space-y-2 text-base"
        style={{ contentVisibility: 'auto', containIntrinsicSize: '360px' }}
      >
        {messages.map((message) => {
          const label = message.senderHandle ? `@${message.senderHandle}` : message.sender;
          return (
            <div key={message.id} className="text-sm flex items-start gap-2">
              {message.senderAvatarUrl ? (
                <img
                  src={message.senderAvatarUrl}
                  alt={label}
                  className="h-6 w-6 rounded-full border border-[rgba(148,163,184,0.3)]"
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-[rgba(148,163,184,0.2)] flex items-center justify-center text-[10px]">
                  {label.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <span className={`${getTone(message.type)} font-semibold`}>
                  {label}
                  {message.type === 'spectator' ? ` (${t('spectatorTag')})` : ''}:
                </span>{' '}
                <span className="text-[var(--text)]">{message.text}</span>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2 shrink-0">
        <input
          className="pixel-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={disabled ? t('chatJoinPlaceholder') : t('chatPlaceholder')}
          disabled={disabled}
        />
        <button className="pixel-button" type="submit" disabled={disabled}>
          {t('send')}
        </button>
      </form>
    </div>
  );
};

export default memo(ChatPanel);
