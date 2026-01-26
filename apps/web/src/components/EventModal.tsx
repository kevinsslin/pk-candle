import type { PersonalEvent } from '@pk-candle/shared';
import { useI18n } from '../i18n';

type EventModalProps = {
  event: PersonalEvent;
  secondsLeft: number;
  onSelect: (eventId: string, choiceId: string) => void;
};

const EventModal = ({ event, secondsLeft, onSelect }: EventModalProps) => {
  const { t } = useI18n();
  const expired = secondsLeft <= 0;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 px-4">
      <div className="pixel-card max-w-lg w-full">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="pixel-title text-base">{event.title}</div>
          <div className="text-xs uppercase tracking-widest text-[var(--muted)]">
            {t('personalEventCountdown', { seconds: Math.max(0, secondsLeft) })}
          </div>
        </div>
        <p className="text-sm text-[var(--muted)] mb-4">{event.description}</p>
        <div className="grid gap-2">
          {event.choices.map((choice) => (
            <button
              key={choice.id}
              className="pixel-button secondary"
              onClick={() => onSelect(event.id, choice.id)}
              disabled={expired}
            >
              {choice.text}
            </button>
          ))}
        </div>
        {expired && (
          <div className="text-xs text-[var(--muted)] mt-3">{t('personalEventExpired')}</div>
        )}
      </div>
    </div>
  );
};

export default EventModal;
