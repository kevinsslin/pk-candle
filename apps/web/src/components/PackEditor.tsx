import { useMemo, useState } from 'react';
import type { EventPackInput } from '@pk-candle/shared';
import { useI18n } from '../i18n';

type PackEditorProps = {
  mode: 'create' | 'edit';
  initial: EventPackInput;
  onSave: (pack: EventPackInput) => void;
  onCancel: () => void;
};

const PackEditor = ({ mode, initial, onSave, onCancel }: PackEditorProps) => {
  const { t } = useI18n();
  const initialJson = useMemo(() => JSON.stringify(initial, null, 2), [initial]);
  const [value, setValue] = useState(initialJson);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(value) as EventPackInput;
      onSave(parsed);
      setError(null);
    } catch {
      setError(t('packInvalidJson'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center px-4">
      <div className="pixel-card max-w-3xl w-full">
        <div className="pixel-title text-sm mb-3">
          {mode === 'create' ? t('packCreateTitle') : t('packEditTitle')}
        </div>
        <p className="text-sm text-[var(--muted)] mb-3">
          {t('packEditorBody')}
        </p>
        <textarea
          className="pixel-textarea h-[320px] font-mono text-xs"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        {error && <div className="text-sm text-[var(--danger)] mt-2">{error}</div>}
        <div className="flex justify-end gap-3 mt-4">
          <button className="pixel-button ghost" onClick={onCancel}>{t('cancel')}</button>
          <button className="pixel-button" onClick={handleSave}>{t('savePack')}</button>
        </div>
      </div>
    </div>
  );
};

export default PackEditor;
