// Striker FC — ui/screens/StoreAndWalkoutScreen.tsx (Phase 09, Blueprint 08 §4)
// The Pack Store: all 5 packs from the seed database with exact published
// drop odds, live currency checks and the Daily Welcome Pack's 24h cooldown.
// Opening an 85+ pull plays the full-screen 5-stage cinematic walkout —
// rarity-coloured tunnel flash + stadium bass hit, nationality flag slam,
// position + OVR slam, club crest reveal, then the holographic card bursting
// out over a canvas confetti/spark explosion — before the multi-card summary
// tray shows every pull. All openings run through meta/PackService and are
// committed to SaveSystem, so pulled cards are in the Squad Builder at once.

import { useEffect, useRef, useState } from 'react';
import { mulberry32 } from '../../core/math';
import { RARITY_COLORS } from '../../core/constants';
import type { PackDef, Rarity, SaveProfile } from '../../core/types';
import { ALL_RARITIES } from '../../core/types';
import { getAllPacks } from '../../data/PacksAndQuests';
import { ALL_CLUBS } from '../../data/Clubs';
import {
canOpenPack, exchangeDuplicates, freePackCooldownMs, openPack, type PackPull, type WalkoutMeta,
} from '../../meta/PackService';
import { getPlayerById } from '../../data/PlayerDatabase';
import { currentFeaturedPack } from '../../meta/SeasonService';
import { marketPriceOf } from '../../meta/MarketService';
import { audioEngine } from '../../audio/AudioEngine';
import { PlayerCard, RARITY_FOIL } from '../components/PlayerCard';
import { FlagArt } from '../components/FlagArt';
import { ClubCrestArt } from '../components/ClubCrestArt';
import { formatNumber, t } from '../../i18n/i18n';
import packGoldUrl from '../../assets/pack-gold.jpg';
import packBlueUrl from '../../assets/pack-blue.jpg';
import packTealUrl from '../../assets/pack-teal.jpg';
import stadiumBowlUrl from '../../assets/stadium-bowl.jpg';

/** FC Mobile skin pass: every pack has real pack ART (gold foil, blue
 *  starball foil, teal daily foil) — never a text-only row. */
export function packArtFor(packId: string): string {
  switch (packId) {
    case 'daily_free': return packTealUrl;
    case 'master_vault': return packBlueUrl;
    case 'elite_attack': return packBlueUrl;
    default: return packGoldUrl;
  }
}

/** The Daily Welcome Pack is presented as the Daily Resource Pack. */
export function packDisplayName(pack: PackDef): string {
  return pack.id === 'daily_free' ? t('store.dailyResourcePack') : pack.name;
}

const NATION_NAMES: Record<string, string> = {
  BR: 'Brazil', AR: 'Argentina', FR: 'France', IT: 'Italy', RU: 'Russia', NO: 'Norway',
  ES: 'Spain', GB: 'England', EG: 'Egypt', NL: 'Netherlands', BE: 'Belgium', MA: 'Morocco',
  BD: 'Bangladesh', JP: 'Japan', DE: 'Germany', PT: 'Portugal', NG: 'Nigeria', SN: 'Senegal',
  HR: 'Croatia', TR: 'Türkiye', PL: 'Poland', AT: 'Austria', RS: 'Serbia', UY: 'Uruguay',
  CO: 'Colombia', PY: 'Paraguay', CL: 'Chile', IN: 'India', NP: 'Nepal', KR: 'South Korea', AU: 'Australia',
};

function formatCooldown(ms: number): string {
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${formatNumber(h)}${t('time.hourUnit')} ${formatNumber(m)}${t('time.minUnit')}` : `${formatNumber(m)}${t('time.minUnit')}`;
}

/** Stadium bass hit for the tunnel flash — a 96Hz→34Hz sub drop on the SFX bus. */
function playBassHit(): void {
  try {
    if (!audioEngine.ensure() || !audioEngine.ctx || !audioEngine.sfxOut) return;
    const ctx = audioEngine.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(96, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.connect(g);
    g.connect(audioEngine.sfxOut);
    osc.start(t);
    osc.stop(t + 0.72);
    const swell = ctx.createOscillator();
    swell.type = 'sawtooth';
    swell.frequency.setValueAtTime(220, t);
    swell.frequency.exponentialRampToValueAtTime(440, t + 0.4);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.06, t + 0.3);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    swell.connect(sg);
    sg.connect(audioEngine.sfxOut);
    swell.start(t);
    swell.stop(t + 0.62);
  } catch {
    // Audio is an enhancement — the walkout plays silently without it.
  }
}

// ---------- Canvas confetti / sparks (Stage 5) ------------------------------------

interface Particle {
  x: number; y: number; vx: number; vy: number; size: number;
  color: string; rot: number; vr: number; life: number; spark: boolean;
}

function ConfettiCanvas({ colors, burstKey }: { colors: string[]; burstKey: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth ?? 360;
    const h = parent?.clientHeight ?? 480;
    canvas.width = w;
    canvas.height = h;
    const cx = w / 2;
    const cy = h / 2;
    const particles: Particle[] = [];
    for (let i = 0; i < 150; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 9;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3.5,
        size: 3 + Math.random() * 6,
        color: colors[i % colors.length] ?? '#ffffff',
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 1,
        spark: i % 3 === 0,
      });
    }
    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - started) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.vy += p.spark ? 0.06 : 0.16;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - elapsed / 2.6);
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.spark) ctx.fillRect(-p.size / 2, -1, p.size, 2);
        else ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      }
      if (elapsed < 2.7) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [colors, burstKey]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}

// ---------- The 5-stage walkout ------------------------------------------------------

const STAGE_MS = [1400, 1100, 1050, 1050, 3400];

function WalkoutOverlay({
  walkout, pulls, packName, packId, profile, onDone,
}: {
  walkout: WalkoutMeta;
  pulls: PackPull[];
  packName: string;
  packId: string;
  profile: SaveProfile;
  onDone: () => void;
}) {
  const [stage, setStage] = useState(0);
  const [runId, setRunId] = useState(0);
  const template = walkout.template;
  const club = ALL_CLUBS.find((c) => c.id === template.clubId);
  const rarityColor = RARITY_COLORS[template.rarity] ?? RARITY_COLORS.GOLD!;

  useEffect(() => {
    playBassHit();
  }, [runId]);

  const watchAgain = () => {
    setRunId((n) => n + 1);
    setStage(0);
  };
  useEffect(() => {
    if (stage >= 5) return;
    const t = window.setTimeout(() => setStage((s) => s + 1), STAGE_MS[stage] ?? 900);
    return () => window.clearTimeout(t);
  }, [stage]);

  const stageLabel = [t('store.stageTunnel'), t('store.stageNation'), t('store.stagePosOvr'), t('store.stageClub'), t('store.stageCard')][Math.min(stage, 4)] ?? '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('store.packAria', { name: template.name, ovr: template.baseOvr })}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-black"
      onClick={() => { if (stage === 0) setStage(1); }}
    >
      {/* Stage 1: the pack itself, floating in a spotlight on the aurora */}
      {stage === 0 && (
        <>
          <div className="aurora-bg absolute inset-0" aria-hidden />
          <div className="absolute inset-0" style={{ background: `radial-gradient(55% 45% at 50% 46%, ${rarityColor.edge}44 0%, transparent 70%)` }} aria-hidden />
          <div key={`pack-${runId}`} className="pack-float relative z-10 flex flex-col items-center px-4">
            <img
              src={packArtFor(packId)}
              alt={packName}
              className="h-64 w-auto rounded-xl shadow-2xl sm:h-80"
              style={{ boxShadow: `0 24px 70px rgba(0,0,0,0.75), 0 0 60px ${rarityColor.edge}66` }}
            />
            <p className="font-display mt-5 text-center text-3xl font-bold uppercase tracking-[0.18em] text-white" style={{ textShadow: '0 3px 18px rgba(0,0,0,0.8)' }}>
              {packName}
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.35em] text-white/75">{t('store.tapToOpen')}</p>
          </div>
        </>
      )}
      {(stage === 2 || stage === 3) && (
        <div className="gold-beams absolute inset-0" aria-hidden />
      )}
      {stage === 1 && (
        <img src={stadiumBowlUrl} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden />
      )}
      {stage >= 4 && (
        <>
          <img src={stadiumBowlUrl} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 60% at 50% 42%, transparent 0%, rgba(2,6,18,0.55) 78%, rgba(2,6,18,0.88) 100%)' }} aria-hidden />
          <div key={`flash-${runId}`} className="white-flash pointer-events-none absolute inset-0 z-20" aria-hidden />
        </>
      )}
      <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/70">
          {packName} · {t('store.walkoutStage', { a: Math.min(stage + 1, 5) })} — {stageLabel}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full border border-white/40 bg-black/60 px-3 py-1.5 text-xs font-bold text-white"
        >
          {t('store.skipWalkout')}
        </button>
      </div>

      {/* Stage 2: the real nation FLAG slams in over the stadium bowl */}
      {stage === 1 && (
        <div key={`flag-${runId}`} className="walkout-slam z-10 px-4 text-center">
          <div className="mx-auto w-fit" style={{ filter: 'drop-shadow(0 18px 44px rgba(0,0,0,0.85))' }}>
            <FlagArt code={template.nationality} width={340} className="max-w-[78vw]" />
          </div>
          <p className="mt-5 font-display text-3xl font-bold uppercase tracking-[0.25em] text-white" style={{ textShadow: '0 3px 16px rgba(0,0,0,0.9)' }}>
            {NATION_NAMES[template.nationality] ?? template.nationality}
          </p>
          <p className="mt-1 font-display text-xl font-bold uppercase tracking-widest" style={{ color: rarityColor.text, textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
            {rarityColor.label} {t('store.walkoutWord')}
          </p>
        </div>
      )}

      {/* Stage 3: position letters on the gold beams, then the OVR slam */}
      {stage === 2 && (
        <div key={`ovr-${runId}`} className="walkout-slam z-10 text-center">
          <p className="font-display text-7xl font-bold uppercase tracking-[0.35em] text-white sm:text-8xl" style={{ textShadow: '0 4px 30px rgba(0,0,0,0.85)' }}>{template.position}</p>
          <p className="font-display mt-1 text-[10rem] font-bold leading-none sm:text-[13rem]" style={{ color: rarityColor.text, textShadow: `0 0 60px ${rarityColor.edge}, 0 4px 24px rgba(0,0,0,0.8)` }}>
            {formatNumber(template.baseOvr)}
          </p>
          <p className="mt-1 text-sm font-bold uppercase tracking-[0.35em] text-white/80">{rarityColor.label} · {NATION_NAMES[template.nationality] ?? template.nationality}</p>
        </div>
      )}

      {/* Stage 4: the real club CREST centred on the gold beams */}
      {stage === 3 && (
        <div key={`crest-${runId}`} className="walkout-slam z-10 px-4 text-center">
          {club && (
            <div className="mx-auto w-fit" style={{ filter: 'drop-shadow(0 16px 40px rgba(0,0,0,0.8))' }}>
              <ClubCrestArt clubId={club.id} primary={club.primary} secondary={club.secondary} abbr={club.abbr} name={club.name} size={190} />
            </div>
          )}
          <p className="mt-4 font-display text-4xl font-bold uppercase tracking-wide text-white" style={{ textShadow: '0 3px 16px rgba(0,0,0,0.9)' }}>{club?.name ?? template.clubId}</p>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/75">{club?.league ?? ''}</p>
        </div>
      )}

      {/* Stage 5: the card rises on a gold podium in the stadium bowl,
          flanked by OVR side panels, gold sparks bursting — then the full
          pack results with per-card market value and WATCH AGAIN /
          CONTINUE (the bible's results screen). */}
      {stage >= 4 && (
        <div className="app-scroll relative z-10 flex max-h-full w-full flex-col items-center px-4 py-16">
          <ConfettiCanvas colors={[rarityColor.edge, rarityColor.text, '#ffffff', club?.primary ?? '#a3e635']} burstKey={runId * 10 + stage} />
          <div key={`card-${runId}`} className="podium-rise relative flex items-end justify-center gap-3 sm:gap-5">
            <div className="mb-10 hidden w-[86px] flex-col items-center rounded-xl border border-[var(--gold)]/50 bg-black/60 px-2 py-3 text-center backdrop-blur-sm min-[480px]:flex" aria-hidden>
              <span className="tnum font-display text-4xl font-bold leading-none" style={{ color: rarityColor.text }}>{formatNumber(template.baseOvr)}</span>
              <span className="mt-1 font-display text-sm font-bold uppercase tracking-widest text-white">{rarityColor.label}</span>
              <span className="mt-2"><FlagArt code={template.nationality} width={30} /></span>
            </div>
            <div className="flex flex-col items-center">
              <PlayerCard template={template} card={walkout.card} size="lg" eventFoil={packId === 'master_vault' || packId === 'elite_attack' ? 'DREAM' : undefined} />
              <div aria-hidden className="mt-1 h-4 w-[130%] rounded-[50%]" style={{ background: 'radial-gradient(50% 100% at 50% 0%, rgba(245,197,66,0.75) 0%, rgba(245,197,66,0.18) 55%, transparent 75%)' }} />
              <p className="font-display -mt-1 text-center text-2xl font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--gold)', textShadow: '0 2px 14px rgba(0,0,0,0.9)' }}>
                {rarityColor.label}
              </p>
            </div>
            <div className="mb-10 hidden w-[86px] flex-col items-center rounded-xl border border-[var(--gold)]/50 bg-black/60 px-2 py-3 text-center backdrop-blur-sm min-[480px]:flex" aria-hidden>
              <span className="font-display text-4xl font-bold leading-none text-white">{template.position}</span>
              <span className="mt-1 font-display text-sm font-bold uppercase tracking-widest text-white/85">{club?.abbr ?? ''}</span>
              <span className="mt-2">{club && <ClubCrestArt clubId={club.id} primary={club.primary} secondary={club.secondary} abbr={club.abbr} name={club.name} size={26} />}</span>
            </div>
          </div>
          <p className="relative mt-3 text-center font-display text-3xl font-bold uppercase tracking-wide text-white" style={{ textShadow: '0 3px 16px rgba(0,0,0,0.9)' }}>
            {template.name}
          </p>
          <p className="tnum relative text-sm font-semibold text-white/85">
            {formatNumber(template.baseOvr)} OVR · {template.position} · {club?.name ?? ''} — {t('store.addedToClub')}
          </p>
          <p className="tnum relative mt-0.5 text-sm font-bold text-[var(--gold)]">
            {t('store.currentValue')} 🪙 {formatNumber(marketPriceOf(profile, template))}
          </p>
          <div className="relative mt-5 w-full max-w-2xl rounded-2xl border border-white/15 bg-black/70 p-3 backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">
              {t('store.fullPack', { n: pulls.length })}
            </p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {pulls.map((pull) => (
                <li
                  key={pull.card.instanceId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2"
                  style={pull.card.instanceId === walkout.card.instanceId ? { outline: `2px solid ${rarityColor.edge}` } : undefined}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-white">{pull.template.name}</span>
                    <span className="text-[11px] uppercase tracking-wide text-white/60">
                      {pull.template.position} · {pull.template.rarity} · {pull.template.nationality}
                    </span>
                    <span className="tnum block text-[11px] font-bold text-[var(--gold)]">
                      {t('store.currentValue')} 🪙 {formatNumber(marketPriceOf(profile, pull.template))}
                    </span>
                  </span>
                  <span className="tnum font-display text-2xl font-bold" style={{ color: RARITY_COLORS[pull.template.rarity]?.text ?? '#fff' }}>
                    {formatNumber(pull.template.baseOvr)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={watchAgain}
                className="flex-1 rounded-full border border-white/35 bg-[#0b1526] px-4 py-2.5 font-display text-base font-bold uppercase tracking-widest text-white"
              >
                {t('store.watchAgain')}
              </button>
              <button
                type="button"
                onClick={onDone}
                className="flex-1 rounded-full bg-[#2d7dff] px-4 py-2.5 font-display text-base font-bold uppercase tracking-widest text-white"
              >
                {t('store.continueBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {stage === 4 ? t('store.srSummary', { name: template.name, ovr: template.baseOvr, pos: template.position, club: club?.name ?? template.clubId }) : ''}
      </span>
    </div>
  );
}

// ---------- Store screen ------------------------------------------------------------

export function StoreAndWalkoutScreen({
  profile, onCommit, onGoToSquad, focusExchange = 0,
}: {
  profile: SaveProfile;
  onCommit: (next: SaveProfile) => void;
  onGoToSquad: () => void;
  /** Bumped by the shell's Exchange nav tab: scrolls the Exchange panel
   *  into view and rings it, so Exchange is a real destination. */
  focusExchange?: number;
}) {
  const packs = getAllPacks();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const featured = currentFeaturedPack(nowMs);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [walkout, setWalkout] = useState<{ meta: WalkoutMeta; pulls: PackPull[]; packName: string; packId: string } | null>(null);
  const [summary, setSummary] = useState<{ pulls: PackPull[]; packName: string; packId: string } | null>(null);
  const [oddsOpen, setOddsOpen] = useState<string | null>(null);

  // Live cooldown countdown for the Daily Welcome Pack.
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const open = (pack: PackDef) => {
    setError(null);
    setNotice(null);
    const result = openPack(profile, pack.id, mulberry32((Date.now() & 0xffffff) ^ pack.cardsCount * 7919), Date.now());
    if (result.error || result.pulls.length === 0) {
      setError(result.error ?? 'The pack could not be opened.');
      return;
    }
    onCommit(result.profile);
    if (result.walkout?.isWalkout) {
      setWalkout({ meta: result.walkout, pulls: result.pulls, packName: packDisplayName(pack), packId: pack.id });
      setSummary(null);
    } else {
      setWalkout(null);
      setSummary({ pulls: result.pulls, packName: packDisplayName(pack), packId: pack.id });
      const best = result.walkout?.template;
      setNotice(t('store.openedNotice', { pack: packDisplayName(pack), best: best ? t('store.bestPullPart', { name: best.name, ovr: best.baseOvr }) : '' }));
    }
  };

  const finishWalkout = () => {
    setWalkout(null);
    onGoToSquad();
  };

  return (
    <section aria-label={t('store.packStore')} className="mt-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl font-bold uppercase tracking-wide">{t('store.packStore')}</h2>
          <p className="mt-1 max-w-prose text-sm text-[var(--dim)]">
            {t('store.intro')}
          </p>
        </div>
        <div className="flex gap-2">
          <span className="tnum rounded-lg bg-black/40 px-3 py-1.5 font-display text-xl font-bold text-[var(--gold)]">
            {formatNumber(profile.coins)} <span className="text-[10px] uppercase tracking-widest text-[var(--dim)]">{t('common.coins')}</span>
          </span>
          <span className="tnum rounded-lg bg-black/40 px-3 py-1.5 font-display text-xl font-bold text-sky-300">
            {formatNumber(profile.gems)} <span className="text-[10px] uppercase tracking-widest text-[var(--dim)]">{t('common.gems')}</span>
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-[var(--danger)] bg-red-950/40 px-3 py-2 text-sm font-medium text-red-200">{error}</p>
      )}
      {notice && !summary && (
        <p aria-live="polite" className="mt-3 rounded-lg border border-[var(--accent-dim)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--accent)]">{notice}</p>
      )}

      {/* Addendum 3: the rotating featured pack — one spotlight pack at a
          time with a hard weekly expiry, straight from the live clock. */}
      {featured && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--gold)]/60 bg-gradient-to-r from-[#1a1405] via-[#0f172a] to-[#0f172a] p-4" aria-label={t('store.featured')}>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--gold)]">{t('store.featured')} · {t('store.limitedTime')}</p>
            <p className="font-display mt-0.5 text-2xl font-bold uppercase leading-none tracking-wide">{packDisplayName(featured.pack)}</p>
            <p className="tnum mt-1 text-sm text-[var(--dim)]">
              {featured.daysLeft === 1 ? t('store.rotatesOutOne') : t('store.rotatesOut', { d: featured.daysLeft })} · {t('store.cardsN', { n: featured.pack.cardsCount })}{featured.pack.guaranteedMinRarity ? ` · ${t('store.guarantees', { r: featured.pack.guaranteedMinRarity })}` : ''}
            </p>
          </div>
          <span className="tnum rounded-lg bg-black/40 px-3 py-2 font-display text-lg font-bold text-[var(--gold)]">
            {featured.pack.currency === 'COINS' ? `${formatNumber(featured.pack.price)} ${t('store.coinsWord')}` : `${formatNumber(featured.pack.price)} ${t('store.gemsWord')}`}
          </span>
        </div>
      )}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {packs.map((pack) => {
          const gate = canOpenPack(profile, pack, nowMs);
          const cooldown = pack.id === 'daily_free' ? freePackCooldownMs(profile, nowMs) : 0;
          const balance = pack.currency === 'COINS' ? profile.coins : profile.gems;
          const displayName = packDisplayName(pack);
          return (
            <li key={pack.id} className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a]/70 backdrop-blur">
              {/* Pack ART header — the pack itself, not a text row */}
              <div className="relative">
                <img src={packArtFor(pack.id)} alt={displayName} className="h-48 w-full object-cover object-[50%_18%]" loading="lazy" />
                <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 46%, rgba(5,9,20,0.88) 100%)' }} />
                {pack.guaranteedMinRarity && (
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[var(--gold)] ring-1 ring-[var(--gold)]/60 backdrop-blur-sm">
                    {t('store.guaranteesCard', { r: pack.guaranteedMinRarity })}
                  </span>
                )}
                <span className="tnum absolute bottom-2.5 right-2.5 rounded-full bg-black/70 px-3 py-1.5 font-display text-lg font-bold backdrop-blur-sm" style={{ color: pack.currency === 'COINS' ? 'var(--gold)' : '#7dd3fc' }}>
                  {pack.price === 0 ? t('store.free') : `${formatNumber(pack.price)} ${pack.currency === 'COINS' ? '🪙' : '◆'}`}
                </span>
                <p className="font-display absolute bottom-2.5 left-3 right-24 text-[22px] font-bold uppercase leading-[0.95] tracking-wide text-white" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
                  {displayName}
                </p>
              </div>
              <div className="flex flex-1 flex-col p-4 pt-3">
              <p className="tnum text-sm text-[var(--dim)]">
                {t('store.playersLine', { n: pack.cardsCount })}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {ALL_RARITIES.filter((r) => (pack.odds[r] ?? 0) > 0).map((r) => (
                  <span key={r} className="tnum rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-bold" style={{ color: RARITY_FOIL[r].edge }}>
                    {r} {((pack.odds[r] ?? 0) * 100).toFixed((pack.odds[r] ?? 0) < 0.1 ? 1 : 0)}%
                  </span>
                ))}
              </div>
              <button
                type="button"
                aria-expanded={oddsOpen === pack.id}
                onClick={() => setOddsOpen((v) => (v === pack.id ? null : pack.id))}
                className="mt-2.5 self-start rounded-full border border-[var(--teal)]/60 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-[var(--teal)]"
              >
                {t('store.packContains')} {oddsOpen === pack.id ? '▾' : '▸'}
              </button>
              {oddsOpen === pack.id && (
                <div className="mt-1.5 space-y-1 rounded-lg bg-black/40 p-2.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--gold)]">
                    {t('store.guaranteedRewards')}
                  </p>
                  <p className="text-[12px] font-semibold text-white/90">
                    {t('store.playersLine', { n: pack.cardsCount })}
                    {pack.guaranteedMinRarity ? ` · ${t('store.guaranteesCard', { r: pack.guaranteedMinRarity })}` : ''}
                  </p>
                  <p className="pt-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--teal)]">
                    {t('store.possibleRewards')}
                  </p>
                  {ALL_RARITIES.filter((r) => (pack.odds[r] ?? 0) > 0).map((r: Rarity) => (
                    <div key={r} className="flex items-center gap-2">
                      <span className="w-16 text-[10px] font-bold uppercase" style={{ color: RARITY_COLORS[r]?.text }}>{r}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full" style={{ width: `${(pack.odds[r] ?? 0) * 100}%`, background: RARITY_COLORS[r]?.edge }} />
                      </div>
                      <span className="tnum w-14 text-right text-[11px] text-[var(--dim)]">{((pack.odds[r] ?? 0) * 100).toFixed(2)}%</span>
                    </div>
                  ))}
                  <p className="pt-1 text-[11px] leading-snug text-[var(--dim)]">
                    {pack.guaranteedMinRarity ? t('store.oddsNote', { band: `${pack.guaranteedMinRarity}+` }) : t('store.oddsNotePlain')}
                  </p>
                </div>
              )}
              <div className="mt-auto pt-3">
                {cooldown > 0 ? (
                  <p className="tnum rounded-lg border border-[var(--border)] px-3 py-2 text-center text-sm font-semibold text-[var(--dim)]">
                    {t('store.nextFree', { time: formatCooldown(cooldown) })}
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={!gate.ok}
                    onClick={() => open(pack)}
                    aria-label={displayName}
                    className="w-full rounded-full bg-[#c6f135] px-4 py-3 font-display text-lg font-bold uppercase tracking-widest text-[#111827] shadow-[0_6px_20px_rgba(198,241,53,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    {pack.price === 0 ? t('store.openFree') : t('store.openFor', { price: formatNumber(pack.price), currency: pack.currency === 'COINS' ? t('common.coins') : t('common.gems') })}
                  </button>
                )}
                <p className="tnum mt-1.5 text-center text-[11px] text-[var(--dim)]">
                  {t('store.yourBalance', { n: balance, currency: pack.currency === 'COINS' ? t('common.coins') : t('common.gems') })}
                  {!gate.ok && cooldown === 0 ? ` · ${gate.error}` : ''}
                </p>
              </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Non-walkout openings: the full multi-card summary tray */}
      {summary && (
        <div className="mt-4 rounded-2xl border border-[var(--accent-dim)] bg-[var(--surface)] p-4" aria-label={t('store.yourPulls', { pack: summary.packName })}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-xl font-bold uppercase tracking-wide">{t('store.yourPulls', { pack: summary.packName })}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const again = packs.find((p) => p.id === summary.packId);
                  setSummary(null);
                  if (again) open(again);
                }}
                className="rounded-full border border-white/30 bg-[#0b1526] px-4 py-2 font-display text-sm font-bold uppercase tracking-widest text-white"
              >
                {t('store.watchAgain')}
              </button>
              <button type="button" onClick={onGoToSquad} className="rounded-full bg-[#2d7dff] px-4 py-2 font-display text-sm font-bold uppercase tracking-widest text-white">
                {t('store.continueBtn')}
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {summary.pulls.map((pull) => (
              <div key={pull.card.instanceId} className="flex flex-col items-center gap-1">
                <PlayerCard template={pull.template} card={pull.card} size="md" />
                <p className="tnum text-[12px] font-bold text-[var(--gold)]">
                  {t('store.currentValue')} 🪙 {formatNumber(marketPriceOf(profile, pull.template))}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {walkout && (
        <WalkoutOverlay
          walkout={walkout.meta}
          pulls={walkout.pulls}
          packName={walkout.packName}
          packId={walkout.packId}
          profile={profile}
          onDone={finishWalkout}
        />
      )}

      <ExchangePanel profile={profile} onCommit={onCommit} focusSignal={focusExchange} />
    </section>
  );
}

/**
 * Epic fix round (P2-18) — Exchange: pick any 3 unlocked duplicate cards
 * of the same rarity and trade them for one card of the next rarity up.
 * Eligibility mirrors PackService.exchangeDuplicates exactly (duplicates
 * only, never squad or locked cards, LEGEND stays pack-gated).
 */
function ExchangePanel({ profile, onCommit, focusSignal = 0 }: { profile: SaveProfile; onCommit: (next: SaveProfile) => void; focusSignal?: number }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [ringOn, setRingOn] = useState(false);
  useEffect(() => {
    if (focusSignal <= 0) return;
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setRingOn(true);
    const t = window.setTimeout(() => setRingOn(false), 2200);
    return () => window.clearTimeout(t);
  }, [focusSignal]);
  const xi = new Set(profile.startingXI.filter((v): v is string => v !== null));
  const subs = new Set(profile.substitutes.filter((v): v is string => v !== null));
  const counts = new Map<string, number>();
  for (const c of profile.inventory) counts.set(c.templateId, (counts.get(c.templateId) ?? 0) + 1);
  const eligible = profile.inventory.filter((c) =>
    !c.locked && !xi.has(c.instanceId) && !subs.has(c.instanceId) && (counts.get(c.templateId) ?? 0) > 1);
  const toggle = (id: string) => {
    setMsg(null);
    setErr(null);
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : prev.length >= 3 ? prev : [...prev, id]));
  };
  const doExchange = () => {
    const r = exchangeDuplicates(profile, picked, mulberry32(Date.now() & 0xffffff), Date.now());
    if (r.error || !r.granted) { setErr(r.error ?? 'The exchange failed.'); return; }
    onCommit(r.profile);
    setPicked([]);
    setMsg(t('store.exchangeDone', { name: r.granted.name, ovr: r.granted.baseOvr, rarity: r.granted.rarity }));
  };
  return (
    <div
      ref={panelRef}
      className="mt-5 scroll-mt-4 rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4"
      style={ringOn ? { boxShadow: '0 0 0 3px var(--teal), 0 0 26px rgba(0,217,192,0.5)' } : undefined}
      aria-label={t('store.exchange')}
    >
      <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-fuchsia-300">{t('store.exchange')}</h3>
      <p className="mt-0.5 max-w-prose text-[13px] leading-snug text-[var(--dim)]">
        {t('store.exchangeDesc')}
      </p>
      {eligible.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--dim)]">{t('store.noExchange')}</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t('store.exchange')}>
            {eligible.slice(0, 24).map((c) => {
              const tpl = getPlayerById(c.templateId);
              if (!tpl) return null;
              const on = picked.includes(c.instanceId);
              return (
                <li key={c.instanceId}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(c.instanceId)}
                    className="rounded-lg px-2.5 py-1.5 text-[12px] font-bold ring-1"
                    style={{
                      background: on ? 'var(--gold)' : 'rgba(0,0,0,0.35)',
                      color: on ? '#231a02' : 'var(--text)',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.2)',
                    }}
                  >
                    {tpl.shortName} · {formatNumber(tpl.baseOvr)} · {tpl.rarity}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={picked.length !== 3}
            onClick={doExchange}
            className="mt-3 rounded-lg bg-fuchsia-400 px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('store.exchangeBtn', { a: picked.length })}
          </button>
        </>
      )}
      {err && <p role="alert" className="mt-2 text-sm font-medium text-red-300">{err}</p>}
      {msg && <p aria-live="polite" className="mt-2 text-sm font-medium text-[var(--accent)]">{msg}</p>}
    </div>
  );
}
