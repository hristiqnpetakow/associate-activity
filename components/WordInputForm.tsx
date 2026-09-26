'use client';

import { Check, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { WordInput } from '@/lib/types';
import { useLanguage } from '@/lib/i18n';
import { normalizeWord } from '@/lib/utils';

export function WordInputForm({ onSubmit, initial }: { onSubmit: (words: WordInput) => Promise<void>; initial?: WordInput | null }) {
  const { t } = useLanguage();
  const fields: { key: keyof WordInput; title: string; emoji: string }[] = [
    { key: 'предмети', title: t('item'), emoji: '🧩' },
    { key: 'животни', title: t('animal'), emoji: '🐼' },
    { key: 'личности', title: t('personality'), emoji: '🌟' },
    { key: 'професии', title: t('profession'), emoji: '🧑‍🚀' },
  ];
  const [data, setData] = useState<WordInput>(initial ?? { предмети: ['', '', ''], животни: ['', '', ''], личности: ['', '', ''], професии: ['', '', ''] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allValues = useMemo(() => fields.flatMap(({ key }) => data[key]).map(normalizeWord), [data, fields]);
  const valid = allValues.length === 12 && allValues.every(Boolean) && new Set(allValues.map((x) => x.toLowerCase())).size === 12;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) { setError(t('wordsValidation')); return; }
    setError(''); setSaving(true);
    try { await onSubmit(Object.fromEntries(fields.map(({ key }) => [key, data[key].map(normalizeWord)])) as WordInput); }
    catch (err) { setError(err instanceof Error ? err.message : t('saveFailed')); }
    finally { setSaving(false); }
  }

  function update(key: keyof WordInput, index: number, value: string) {
    setData((current) => ({ ...current, [key]: current[key].map((item, i) => i === index ? value : item) }));
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map(({ key, title, emoji }) => (
          <section key={key} className="glass rounded-3xl p-5">
            <div className="mb-4 flex items-center gap-2 font-bold">{emoji} {title}</div>
            <div className="space-y-2">
              {data[key].map((value, index) => (
                <input key={`${key}-${index}`} value={value} onChange={(e) => update(key, index, e.target.value)} maxLength={40} placeholder={t('wordPlaceholder', { n: index + 1 })} className="w-full rounded-2xl border border-black/10 bg-white/75 px-4 py-3 outline-none transition focus:border-black/30 focus:ring-4 focus:ring-black/5" />
              ))}
            </div>
          </section>
        ))}
      </div>
      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}
      <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 font-bold text-white shadow-xl transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">
        <Check size={18} /> {saving ? t('saving') : t('done')} <Sparkles size={16} />
      </button>
    </form>
  );
}
