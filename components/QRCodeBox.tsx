'use client';

import { Copy, QrCode, Share2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n';
import { getJoinUrl } from '@/lib/utils';

export function QRCodeBox({ code }: { code: string }) {
  const { t } = useLanguage();
  const [src, setSrc] = useState('');
  const [copied, setCopied] = useState(false);
  const url = getJoinUrl(code);

  useEffect(() => { QRCode.toDataURL(url, { width: 250, margin: 1 }).then(setSrc).catch(() => undefined); }, [url]);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  }

  async function share() {
    if (navigator.share) await navigator.share({ title: t('brand'), text: t('shareText', { code }), url });
    else await copy();
  }

  return <div className="glass rounded-3xl p-4">
    <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-bold"><QrCode size={17}/> {t('scanJoin')}</div><div className="rounded-full bg-black px-3 py-1 text-xs font-black tracking-widest text-white">{code}</div></div>
    <div className="mt-4 overflow-hidden rounded-2xl bg-white p-3">{src ? <img src={src} alt={`${t('roomCode')} ${code}`} className="mx-auto h-52 w-52" /> : <div className="grid h-52 place-items-center text-gray-400">{t('generating')}</div>}</div>
    <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={copy} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white/75 px-3 py-3 text-sm font-bold">{copied ? `✓ ${t('copied')}` : <><Copy size={15}/> {t('copy')}</>}</button><button onClick={share} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-3 py-3 text-sm font-bold text-white"><Share2 size={15}/> {t('share')}</button></div>
  </div>;
}
