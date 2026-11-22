// Striker FC — ui/screens/PreMatchScreen.tsx
// Match presentation theatre (lobby-redesign pass, checker fix 4):
// before a full match kicks off, the game presents a proper pre-match
// lobby — both captains face off in their real 3D kits with club crests,
// Team OVR badges and kit colours, FC Mobile style. Tapping KICK OFF runs
// a short walkout beat (floodlight sweep, teams walking out) and only then
// hands control back to App, which starts the real match engine. Nothing
// here is decorative-only: the captains, kits and OVRs are the exact data
// the match itself will use.
import { useEffect, useState } from 'react';
import type { PlayerTemplate } from '../../core/types';
import type { KitColors } from '../../rendering/PlayerRig';
import { PlayerShowcase } from '../../rendering/PlayerShowcase';
import { WalkoutScene, WALKOUT_DURATION_SEC } from '../../rendering/WalkoutScene';
import { useSettingsStore } from '../../store/useSettingsStore';
import { formatNumber, t } from '../../i18n/i18n';

export interface PreMatchSide {
  clubName: string;
  abbr: string;
  kit: KitColors;
  captain: PlayerTemplate | null;
  captainNumber: number;
  captainOvr: number | null;
  teamOvr: number;
  /** Epic fix round (P0-2): the full XI for the 3D walkout, when known. */
  xi?: PlayerTemplate[];
}

export interface PreMatchData {
  modeLabel: string;
  home: PreMatchSide;
  away: PreMatchSide;
}

function CrestDisc({ side, size = 44 }: { side: PreMatchSide; size?: number }) {
  return (
    <svg viewBox="0 0 100 110" width={size} height={size * 1.1} role="img" aria-label={`${side.clubName} crest`} className="shrink-0 drop-shadow">
      <path d="M6 6 H94 V62 C94 86 74 99 50 106 C26 99 6 86 6 62 Z" fill={side.kit.primary} stroke="rgba(255,255,255,0.55)" strokeWidth={3} />
      <path d="M6 34 H94" stroke={side.kit.secondary} strokeWidth={7} />
      <text x={50} y={76} textAnchor="middle" fontSize={30} fontWeight={800} fill="#ffffff" fontFamily="'Barlow Condensed', sans-serif">{side.abbr}</text>
    </svg>
  );
}

function KitChips({ kit }: { kit: KitColors }) {
  const chip = (color: string, label: string) => (
    <span key={label} className="flex items-center gap-1 rounded-full bg-black/45 py-0.5 pl-1 pr-2 ring-1 ring-white/15">
      <span className="h-3.5 w-3.5 rounded-full ring-1 ring-white/40" style={{ background: color }} />
      <span className="text-[9px] font-bold uppercase tracking-wider text-white/75">{label}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {chip(kit.primary, t('prematch.shirt'))}
      {chip(kit.shorts, t('prematch.shorts'))}
      {chip(kit.socks, t('prematch.socks'))}
    </div>
  );
}

function CaptainPanel({ side, align }: { side: PreMatchSide; align: 'left' | 'right' }) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col items-center ${align === 'right' ? 'sm:items-end' : 'sm:items-start'}`}>
      <CrestDisc side={side} />
      <p className="font-display mt-1.5 flex min-h-[38px] w-full items-start justify-center text-center text-[15px] font-bold uppercase leading-tight text-white">{side.clubName}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="rounded-md bg-black/50 px-1.5 py-0.5 ring-1 ring-[var(--gold)]/50">
          <span className="tnum font-display text-[15px] font-bold leading-none text-[var(--gold)]">{formatNumber(side.teamOvr)}</span>
          <span className="ml-1 text-[8px] font-black uppercase tracking-widest text-white/70">OVR</span>
        </span>
        {side.captainOvr !== null && (
          <span className="rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-bold text-white/80 ring-1 ring-white/15">
            {t('squad.captain')} {formatNumber(side.captainOvr)}
          </span>
        )}
      </div>
      <div className="mt-1 w-full max-w-[190px]">
        {side.captain ? (
          <PlayerShowcase template={side.captain} kit={side.kit} shirtNumber={side.captainNumber} height={196} />
        ) : (
          <div className="flex h-[196px] items-center justify-center">
            <CrestDisc side={side} size={72} />
          </div>
        )}
      </div>
      <p className="w-full truncate text-center text-[12px] font-bold uppercase tracking-wide text-white">
        {side.captain ? side.captain.name : t('squad.captain')}
      </p>
      <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]">{t('squad.captain')}</p>
      <KitChips kit={side.kit} />
    </div>
  );
}

export function PreMatchScreen({
  data, onReady, onCancel,
}: {
  data: PreMatchData;
  onReady: () => void;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState<'faceoff' | 'walkout'>('faceoff');
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  // P0-2: the 3D tunnel walkout plays on MEDIUM+ when both XIs are known;
  // LOW keeps this screen's 2D walkout card as its fallback.
  const walkout3d = graphicsQuality !== 'LOW'
    && (data.home.xi?.length ?? 0) === 11
    && (data.away.xi?.length ?? 0) === 11;

  useEffect(() => {
    if (stage !== 'walkout' || walkout3d) return;
    const t = window.setTimeout(onReady, 2700);
    return () => window.clearTimeout(t);
  }, [stage, onReady, walkout3d]);

  const walking = stage === 'walkout';
  if (walking && walkout3d) {
    return (
      <div className="fixed inset-0 z-50 bg-[#05080f]" role="dialog" aria-modal="true" aria-label={t('prematch.walkoutAria')}>
        <WalkoutScene
          homeXI={data.home.xi!}
          awayXI={data.away.xi!}
          homeKit={data.home.kit}
          awayKit={data.away.kit}
          onDone={onReady}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <span className="rounded-full bg-black/55 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white ring-1 ring-white/25">
            {data.modeLabel}
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60">{t('prematch.tunnelCam')} · {formatNumber(WALKOUT_DURATION_SEC)}s</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
          <p className="font-display text-lg font-bold uppercase tracking-wider text-white drop-shadow">
            {t('prematch.walkingLine', { home: data.home.abbr, away: data.away.abbr })}
          </p>
          <button
            type="button"
            onClick={onReady}
            className="font-display rounded-xl bg-[var(--accent)] px-5 py-2.5 text-lg font-bold uppercase tracking-wider text-[#0a120c]"
          >
            {t('prematch.skipKickOff')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Pre-match lobby — ${data.home.clubName} versus ${data.away.clubName}`}
      style={{
        background:
          'radial-gradient(90% 55% at 85% -10%, rgba(245,197,66,0.25) 0%, transparent 55%),'
          + 'radial-gradient(70% 50% at 8% -12%, rgba(163,230,53,0.2) 0%, transparent 55%),'
          + 'linear-gradient(165deg, #0a1a33 0%, #081226 55%, #04140b 100%)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.85) 1px, transparent 1.4px)', backgroundSize: '9px 9px' }}
      />
      {walking && <div aria-hidden className="walkout-sweep pointer-events-none absolute inset-0" />}

      <div className="relative mx-auto flex w-full max-w-[560px] flex-1 flex-col px-4 pb-6 pt-5">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-[var(--accent)]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--accent)] ring-1 ring-[var(--accent)]/40">
            {data.modeLabel}
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/50">
            {walking ? t('prematch.tunnelCam') : t('prematch.lobby')}
          </span>
        </div>

        <h2 className="font-display mt-3 text-center text-[26px] font-bold uppercase leading-none tracking-wide text-white">
          {walking ? t('prematch.walkingOutTitle') : t('prematch.faceOff')}
        </h2>
        <p className="mt-1 text-center text-[12px] font-medium text-white/60">
          {walking
            ? t('prematch.walkingSub')
            : t('prematch.faceOffSub')}
        </p>

        <div className="relative mt-3 flex items-start gap-2">
          <div className={`min-w-0 flex-1 transition-transform duration-700 ${walking ? 'translate-x-2' : ''}`}>
            <CaptainPanel side={data.home} align="left" />
          </div>
          <div className="flex shrink-0 flex-col items-center pt-24">
            <span className="font-display flex h-12 w-12 items-center justify-center rounded-full bg-[var(--gold)] text-[19px] font-bold text-[#231a02] shadow-[0_0_24px_rgba(245,197,66,0.45)] ring-2 ring-white/50">
              {t('prematch.vs')}
            </span>
          </div>
          <div className={`min-w-0 flex-1 transition-transform duration-700 ${walking ? '-translate-x-2' : ''}`}>
            <CaptainPanel side={data.away} align="right" />
          </div>
        </div>

        {walking ? (
          <div className="mt-6" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="walkout-progress h-full rounded-full bg-[var(--accent)]" />
            </div>
            <p className="mt-2 text-center text-[11px] font-bold uppercase tracking-[0.24em] text-white/70">
              {t('prematch.walkingOut')}
            </p>
          </div>
        ) : (
          <div className="mt-6 flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="font-display rounded-2xl border border-white/25 bg-white/5 px-4 py-3.5 text-lg font-bold uppercase tracking-wider text-white/85"
            >
              {t('prematch.back')}
            </button>
            <button
              type="button"
              onClick={() => setStage('walkout')}
              className="play-glow font-display flex-1 rounded-2xl bg-[var(--accent)] px-4 py-3.5 text-[24px] font-bold uppercase tracking-[0.16em] text-[#0a120c]"
            >
              ▶ {t('prematch.kickOff')}
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] leading-relaxed text-white/45">
          {t('prematch.footnote', { ha: data.home.abbr, ho: data.home.teamOvr, aa: data.away.abbr, ao: data.away.teamOvr })}
        </p>
      </div>
    </div>
  );
}
