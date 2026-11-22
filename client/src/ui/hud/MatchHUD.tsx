// Striker FC — ui/hud/MatchHUD.tsx (Phase 06)
// The broadcast layer over the 3D viewport, fed at the GameLoop's strict
// 20Hz HUD sync (never per render frame): top-left scoreboard with club
// badges, colour bars, clock + added time and red-card pips; top-center
// mentality quick-switcher; animated event banners; bottom-center 2D radar
// minimap + commentary ticker; bottom-left active-player bar with stamina
// and shot-power meters. Only the pause button is interactive in the radar /
// ticker zones — everything else is pointer-events-none so touch play is
// never blocked.

import { useEffect, useRef, useState } from 'react';
import { PITCH } from '../../core/constants';
import { matchEventBus } from '../../core/EventBus';
import { t } from '../../i18n/i18n';
import type { Club, Mentality, TeamSide } from '../../core/types';

export interface HudDot {
  x: number;
  z: number;
  side: TeamSide;
}

export type BannerKind = 'GOAL' | 'OFFSIDE' | 'YELLOW' | 'RED' | 'PENALTY' | 'INFO';

export interface HudBanner {
  id: number;
  kind: BannerKind;
  title: string;
  sub?: string;
}

export interface MatchHudProps {
  homeClub: Club;
  awayClub: Club;
  scoreHome: number;
  scoreAway: number;
  minute: number;
  addedMinutes: number;
  periodLabel: string;
  stateLabel: string;
  redsHome: number;
  redsAway: number;
  dots: HudDot[];
  ball: { x: number; z: number };
  activeDotIndex: number;
  mentality: Mentality;
  onMentality: (m: Mentality) => void;
  showMentality: boolean;
  activeName: string;
  activeRole: string;
  activeStamina: number;
  shotPower: number;
  charging: boolean;
  banner: HudBanner | null;
  advantageSec: number;
  varActive: boolean;
  commentary: string[];
  onPause: () => void;
  paused: boolean;
  trainingMode: boolean;
  /** FC Mobile formation tag, e.g. "4-4-2 Holding" — top-right pill. */
  formationTag?: string;
  onFormationTap?: () => void;
}

const MENTALITY_PILLS: { id: Mentality; label: string }[] = [
  { id: 'ULTRA_DEFENDING', label: 'Ultra Def' },
  { id: 'DEFENDING', label: 'Def' },
  { id: 'BALANCED', label: 'Bal' },
  { id: 'ATTACKING', label: 'Att' },
  { id: 'ULTRA_ATTACKING', label: 'Ultra Att' },
];

function ClubBadge({ club, size = 30 }: { club: Club; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[4px] border border-white/30 font-display font-bold text-white"
      style={{
        width: size, height: size, fontSize: size * 0.34,
        background: `linear-gradient(135deg, ${club.primary} 55%, ${club.secondary} 55%)`,
        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
      }}
    >
      {club.abbr.slice(0, 1)}
    </span>
  );
}

function RedPips({ count, side }: { count: number; side: string }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1 inline-flex gap-0.5" role="img" aria-label={`${count} red card${count > 1 ? 's' : ''} for ${side}`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} aria-hidden className="inline-block h-3 w-2 rounded-[1px] bg-red-500 shadow" />
      ))}
    </span>
  );
}

function RadarCanvas({ dots, ball, activeDotIndex, homeClub, awayClub }: {
  dots: HudDot[]; ball: { x: number; z: number }; activeDotIndex: number;
  homeClub: Club; awayClub: Club;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const px = (x: number) => ((x + PITCH.HALF_LENGTH) / PITCH.LENGTH) * W;
    const pz = (z: number) => ((z + PITCH.HALF_WIDTH) / PITCH.WIDTH) * H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(7, 22, 10, 0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(3.5, 3.5, W - 7, H - 7);
    ctx.beginPath();
    ctx.moveTo(W / 2, 3);
    ctx.lineTo(W / 2, H - 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, H * 0.135, 0, Math.PI * 2);
    ctx.stroke();
    // Boxes.
    const boxW = (PITCH.PENALTY_AREA_LENGTH / PITCH.LENGTH) * W;
    const boxH = ((PITCH.PENALTY_AREA_HALF_WIDTH * 2) / PITCH.WIDTH) * H;
    ctx.strokeRect(3, (H - boxH) / 2, boxW, boxH);
    ctx.strokeRect(W - 3 - boxW, (H - boxH) / 2, boxW, boxH);
    // Players.
    dots.forEach((d, i) => {
      const x = px(d.x);
      const y = pz(d.z);
      if (i === activeDotIndex) {
        ctx.beginPath();
        ctx.arc(x, y, 6.4, 0, Math.PI * 2);
        ctx.strokeStyle = '#f5c542';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = d.side === 'HOME' ? homeClub.primary : awayClub.primary;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });
    // Ball.
    ctx.beginPath();
    ctx.arc(px(ball.x), pz(ball.z), 2.3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }, [dots, ball, activeDotIndex, homeClub, awayClub]);

  return (
    <canvas
      ref={ref}
      width={264}
      height={168}
      className="h-auto w-[148px] rounded-md border border-white/20 shadow-lg sm:w-[196px]"
      role="img"
      aria-label={t('hud.radar')}
    />
  );
}

const BANNER_STYLES: Record<BannerKind, { bg: string; border: string; text: string }> = {
  GOAL: { bg: 'rgba(20, 42, 8, 0.88)', border: 'var(--gold)', text: 'var(--gold)' },
  OFFSIDE: { bg: 'rgba(30, 27, 8, 0.88)', border: '#eab308', text: '#fde047' },
  YELLOW: { bg: 'rgba(30, 27, 8, 0.88)', border: '#eab308', text: '#fde047' },
  RED: { bg: 'rgba(46, 10, 10, 0.9)', border: '#ef4444', text: '#fca5a5' },
  PENALTY: { bg: 'rgba(24, 16, 44, 0.9)', border: '#c084fc', text: '#e9d5ff' },
  INFO: { bg: 'rgba(8, 26, 38, 0.88)', border: '#38bdf8', text: '#a5e3ff' },
};

export function MatchHUD(props: MatchHudProps) {
  const {
    homeClub, awayClub, scoreHome, scoreAway, minute, addedMinutes, periodLabel, stateLabel,
    redsHome, redsAway, mentality, onMentality, showMentality,
    activeName, activeRole, activeStamina, shotPower, charging,
    banner, advantageSec, varActive, commentary, onPause, paused, trainingMode,
    formationTag, onFormationTap,
  } = props;
  // Cycle-2 switch flash: PLAYER_SWITCHED drives a name-tag flash that
  // lives ~1.4 s; MATCH_UP drives the contain chip while the user's man
  // holds the carrier at 0.9 m.
  const [switchFlash, setSwitchFlash] = useState<{ name: string; key: number } | null>(null);
  const [containing, setContaining] = useState(false);
  useEffect(() => {
    let timer = 0;
    const offSwitch = matchEventBus.on('PLAYER_SWITCHED', (p) => {
      if (p.reason === 'KICKOFF') return;
      setSwitchFlash({ name: p.name, key: Date.now() });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSwitchFlash(null), 1400);
    });
    const offMatchUp = matchEventBus.on('MATCH_UP', (p) => setContaining(p.containing));
    return () => {
      offSwitch();
      offMatchUp();
      window.clearTimeout(timer);
    };
  }, []);
  const periodText = periodLabel === '1st Half' ? t('hud.firstHalf')
    : periodLabel === '2nd Half' ? t('hud.secondHalf')
    : periodLabel === 'Extra Time' ? t('hud.extraTime')
    : periodLabel;
  const staminaPct = Math.round(Math.max(0, Math.min(1, activeStamina)) * 100);
  const staminaColor = staminaPct > 50 ? 'var(--accent)' : staminaPct > 25 ? '#eab308' : 'var(--danger)';
  const latestLine = commentary.length > 0 ? commentary[commentary.length - 1] : null;
  const bannerStyle = banner ? BANNER_STYLES[banner.kind] : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* Top-left broadcast scoreboard — FC Mobile white pill: black text
          on white, club crests, and the bright-green clock chip. */}
      <div className="absolute left-2 top-[3.4rem]" role="status" aria-label={t('hud.scoreboard')}>
        <div className="flex items-stretch overflow-hidden rounded-md shadow-lg">
          <div className="flex items-center gap-1.5 bg-white py-1 pl-1.5 pr-2 text-black">
            <ClubBadge club={homeClub} />
            <span className="font-display text-base font-bold tracking-wider">{homeClub.abbr}</span>
            <RedPips count={redsHome} side={homeClub.name} />
          </div>
          <div className="tnum flex items-center bg-white px-1.5 font-display text-xl font-bold text-black">
            {trainingMode ? '—' : `${scoreHome} – ${scoreAway}`}
          </div>
          <div className="flex items-center gap-1.5 bg-white py-1 pl-2 pr-1.5 text-black">
            <span className="font-display text-base font-bold tracking-wider">{awayClub.abbr}</span>
            <RedPips count={redsAway} side={awayClub.name} />
            <ClubBadge club={awayClub} />
          </div>
          <div className="tnum flex items-center justify-center px-2.5 py-0.5 text-black" style={{ background: '#7ed321' }}>
            <span className="font-display text-lg font-bold leading-none">
              {trainingMode ? 'TRN' : `${minute}'`}
              {!trainingMode && addedMinutes > 0 ? `+${addedMinutes}` : ''}
            </span>
          </div>
        </div>
        <div className="flex h-1 overflow-hidden rounded-b-md">
          <span className="flex-1" style={{ background: homeClub.primary }} />
          <span className="flex-1" style={{ background: awayClub.primary }} />
        </div>
        {!trainingMode && stateLabel && (
          <p className="mt-1 inline-block rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/80 backdrop-blur-sm">
            {stateLabel} · {periodText}
          </p>
        )}
      </div>

      {/* Top-center mentality quick-switcher */}
      {showMentality && (
        <div className="pointer-events-auto absolute left-1/2 top-[3.4rem] flex -translate-x-1/2 overflow-hidden rounded-full border border-white/20 bg-black/70 shadow-lg backdrop-blur-sm" role="group" aria-label="Team mentality quick switch">
          {MENTALITY_PILLS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={mentality === p.id}
              aria-label={`Mentality ${p.label}`}
              onClick={() => onMentality(p.id)}
              className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide sm:px-2.5 sm:text-[11px]"
              style={{
                background: mentality === p.id ? 'var(--accent)' : 'transparent',
                color: mentality === p.id ? '#0a120c' : 'rgba(255,255,255,0.75)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Top-right formation tag pill (FC Mobile: "← 4-4-2 Holding ⌄") —
          tapping it opens the mentality switcher. */}
      {formationTag && (
        <button
          type="button"
          onClick={onFormationTap}
          aria-label={`Formation and game plan: ${formationTag}. Tap to switch mentality.`}
          className="pointer-events-auto absolute right-2 top-[3.4rem] flex items-center gap-1.5 rounded-full bg-black/70 py-1.5 pl-2.5 pr-3 shadow-lg backdrop-blur-sm"
        >
          <span aria-hidden className="text-[11px] text-white/70">←</span>
          <span className="font-display text-[13px] font-bold tracking-wide text-white">{formationTag}</span>
          <span aria-hidden className="text-[10px] text-white/70">⌄</span>
        </button>
      )}

      {/* Pause button — under the formation pill */}
      <button
        type="button"
        onClick={onPause}
        aria-label={paused ? 'Resume match' : 'Pause match — statistics, substitutions and settings'}
        className="pointer-events-auto absolute right-2 top-[5.9rem] flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/70 font-display text-base font-bold text-white shadow-lg backdrop-blur-sm"
      >
        {paused ? '▶' : '❚❚'}
      </button>

      {/* Event banners + advantage / VAR badges */}
      <div className="absolute inset-x-0 top-[6.9rem] flex flex-col items-center gap-1.5 px-3 sm:top-[7.4rem]">
        {banner && bannerStyle && (
          <div
            key={banner.id}
            role="alert"
            className="hud-banner max-w-[92vw] rounded-lg border-2 px-4 py-2 text-center shadow-2xl backdrop-blur-sm"
            style={{ background: bannerStyle.bg, borderColor: bannerStyle.border }}
          >
            <p className="font-display text-2xl font-bold uppercase leading-none tracking-widest sm:text-3xl" style={{ color: bannerStyle.text }}>
              {banner.title}
            </p>
            {banner.sub && <p className="mt-1 text-xs font-semibold text-white/90">{banner.sub}</p>}
          </div>
        )}
        <div className="flex gap-1.5">
          {advantageSec > 0 && (
            <span className="tnum rounded-full border border-yellow-400 bg-black/70 px-2.5 py-0.5 font-display text-xs font-bold uppercase tracking-widest text-yellow-300 backdrop-blur-sm">
              {t('help.advantage')} · {advantageSec.toFixed(1)}s
            </span>
          )}
          {varActive && (
            <span className="rounded-full border border-red-400 bg-black/70 px-2.5 py-0.5 font-display text-xs font-bold uppercase tracking-widest text-red-300 backdrop-blur-sm">
              {t('hud.varCheck')}
            </span>
          )}
        </div>
      </div>

      {/* Bottom-left active player bar */}
      <div className="absolute bottom-2 left-2 w-[118px] rounded-md bg-black/70 px-2 py-1.5 backdrop-blur-sm sm:w-[150px]" aria-label={t('hud.activePlayer')}>
        <p className="truncate font-display text-sm font-bold uppercase leading-tight tracking-wide">
          {activeName} <span className="text-[var(--gold)]">{activeRole}</span>
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/60">{t('hud.stamina')}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15" role="img" aria-label={`Stamina ${staminaPct} percent`}>
            <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${staminaPct}%`, background: staminaColor }} />
          </div>
          <span className="tnum text-[10px] font-bold text-white/80">{staminaPct}%</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/60">{t('hud.power')}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15" role="img" aria-label={`Shot power ${Math.round(shotPower * 100)} percent`}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(Math.max(0, Math.min(1, shotPower)) * 100)}%`,
                background: charging ? '#f97316' : 'rgba(255,255,255,0.55)',
                transition: charging ? 'none' : 'width 0.4s ease',
              }}
            />
          </div>
          <span className="tnum text-[10px] font-bold text-white/80">{Math.round(shotPower * 100)}%</span>
        </div>
      </div>

      {/* Bottom-center commentary ticker + radar */}
      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        {switchFlash && (
          <p
            key={switchFlash.key}
            role="status"
            className="hud-banner whitespace-nowrap rounded-full border border-[var(--gold)] bg-black/80 px-3.5 py-1.5 font-display text-[15px] font-bold uppercase tracking-widest text-[var(--gold)] shadow-2xl backdrop-blur-sm"
          >
            ▶ {t('hud.switchedTo', { name: switchFlash.name })}
          </p>
        )}
        {containing && (
          <p role="status" className="whitespace-nowrap rounded-full border border-sky-300 bg-sky-950/85 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-sky-200 backdrop-blur-sm">
            {t('hud.containing')}
          </p>
        )}
        {latestLine && (
          <p aria-live="polite" className="max-w-[86vw] truncate rounded-full bg-black/65 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm sm:max-w-[430px]">
            <span className="mr-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">{t('hud.comms')}</span>
            {latestLine}
          </p>
        )}
        <RadarCanvas
          dots={props.dots}
          ball={props.ball}
          activeDotIndex={props.activeDotIndex}
          homeClub={homeClub}
          awayClub={awayClub}
        />
      </div>
    </div>
  );
}
