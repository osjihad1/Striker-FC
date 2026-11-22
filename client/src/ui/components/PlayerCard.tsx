// Striker FC — ui/components/PlayerCard.tsx
// Phase 07 holographic shield card (Blueprint 08 §1): angled crest silhouette,
// animated metallic foil shimmer per rarity, procedural SVG portrait rendered
// from the player's FaceAppearance + club kit (so the card matches the 3D rig),
// effective OVR, position, nationality, club badge, rank gem and training level.

import type { FaceAppearance, OwnedPlayerCard, PlayerTemplate } from '../../core/types';
import { getCardEffectiveOvr } from '../../core/types';
import { ALL_CLUBS } from '../../data/Clubs';

export const RARITY_FOIL: Record<PlayerTemplate['rarity'], { foil: string; edge: string; ink: string; label: string }> = {
  BRONZE: { foil: 'linear-gradient(150deg, #8a5a30 0%, #c98d4e 34%, #5e3a1e 68%, #a06a35 100%)', edge: '#b0793f', ink: '#ffe3ba', label: 'Bronze' },
  SILVER: { foil: 'linear-gradient(150deg, #9aa5b1 0%, #e8edf2 34%, #5f6b78 68%, #c3ccd6 100%)', edge: '#c3ccd6', ink: '#10151c', label: 'Silver' },
  GOLD: { foil: 'linear-gradient(150deg, #a97b12 0%, #ffd94d 32%, #8a5f08 66%, #f5c542 100%)', edge: '#ffd94d', ink: '#241a02', label: 'Gold' },
  ELITE: { foil: 'linear-gradient(150deg, #7f1d1d 0%, #b91c1c 30%, #450a0a 62%, #f59e0b 130%)', edge: '#f59e0b', ink: '#ffe9c9', label: 'Elite' },
  MASTER: { foil: 'linear-gradient(150deg, #164e63 0%, #06b6d4 30%, #4c1d95 68%, #22d3ee 105%)', edge: '#22d3ee', ink: '#e0fbff', label: 'Master' },
  LEGEND: { foil: 'linear-gradient(150deg, #f8ecd0 0%, #ffffff 30%, #e9c766 62%, #fff6da 100%)', edge: '#f5c542', ink: '#2a1e02', label: 'Legend' },
};

export const RANK_GEMS: { color: string; name: string }[] = [
  { color: 'transparent', name: 'Base' },
  { color: '#22c55e', name: 'Green' },
  { color: '#3b82f6', name: 'Blue' },
  { color: '#a855f7', name: 'Purple' },
  { color: '#ef4444', name: 'Red' },
  { color: '#f5c542', name: 'Gold' },
];

const SHIELD_CLIP = 'polygon(8% 0%, 92% 0%, 100% 10%, 100% 68%, 50% 100%, 0% 68%, 0% 10%)';

/** Procedural athlete portrait: skin, hair style/color and kit from FaceAppearance. */
export function AthletePortrait({
  appearance, primary, secondary, label,
}: {
  appearance: FaceAppearance;
  primary: string;
  secondary: string;
  label: string;
}) {
  const shoulderHalf = appearance.build === 'STOCKY' ? 40 : appearance.build === 'ATHLETIC' ? 35 : 30;
  const hair = appearance.hairColor;
  const skin = appearance.skinTone;
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={label} className="h-full w-full">
      {/* torso / kit */}
      <path
        d={`M ${50 - shoulderHalf} 100 C ${50 - shoulderHalf} 78, ${50 - 13} 72, 50 70 C ${50 + 13} 72, ${50 + shoulderHalf} 78, ${50 + shoulderHalf} 100 Z`}
        fill={primary}
      />
      <path d="M 41 73 L 50 84 L 59 73 L 59 79 L 50 90 L 41 79 Z" fill={secondary} opacity={0.9} />
      <rect x={50 - shoulderHalf} y={93} width={shoulderHalf * 2} height={3.4} fill={secondary} opacity={0.65} />
      {/* neck + head */}
      <rect x={45.5} y={58} width={9} height={12} rx={3} fill={skin} />
      {appearance.hairStyle === 'AFRO' && <circle cx={50} cy={33} r={19} fill={hair} />}
      {appearance.hairStyle === 'LONG' && <path d="M 33 30 C 33 62, 36 70, 39 74 L 44 74 C 40 62, 39 44, 40 32 Z M 67 30 C 67 62, 64 70, 61 74 L 56 74 C 60 62, 61 44, 60 32 Z" fill={hair} />}
      <circle cx={50} cy={42} r={14.5} fill={skin} />
      {/* hair styles drawn over the head */}
      {appearance.hairStyle === 'SHORT' && <path d="M 35.5 42 C 35 29, 42 26.5, 50 26.5 C 58 26.5, 65 29, 64.5 42 C 62 33, 57 31, 50 31 C 43 31, 38 33, 35.5 42 Z" fill={hair} />}
      {appearance.hairStyle === 'FADE' && <path d="M 36 40 C 36.5 30, 43 28, 50 28 C 57 28, 63.5 30, 64 40 C 61 34.5, 56.5 33.5, 50 33.5 C 43.5 33.5, 39 34.5, 36 40 Z" fill={hair} />}
      {appearance.hairStyle === 'CURLY' && (
        <g fill={hair}>
          <circle cx={40} cy={31} r={5.4} /><circle cx={47} cy={27.5} r={5.8} /><circle cx={54} cy={27.5} r={5.8} />
          <circle cx={60} cy={31} r={5.4} /><circle cx={36.5} cy={37} r={4.6} /><circle cx={63.5} cy={37} r={4.6} />
        </g>
      )}
      {appearance.hairStyle === 'MOHAWK' && <path d="M 46.5 14 C 49 12, 51 12, 53.5 14 L 52.5 30 C 51 29, 49 29, 47.5 30 Z" fill={hair} />}
      {appearance.hairStyle === 'BUZZ' && <path d="M 36.5 39 C 37.5 31, 43.5 29.5, 50 29.5 C 56.5 29.5, 62.5 31, 63.5 39 C 60.5 35, 55.5 34.5, 50 34.5 C 44.5 34.5, 39.5 35, 36.5 39 Z" fill={hair} />}
      {appearance.hairStyle === 'BALD_FADE' && <path d="M 37 38 C 38 32, 44 30.5, 50 30.5 C 56 30.5, 62 32, 63 38 C 60 35.5, 55.5 35, 50 35 C 44.5 35, 40 35.5, 37 38 Z" fill={hair} opacity={0.75} />}
      {appearance.hairStyle === 'SIDEPART' && <path d="M 35.5 42 C 35 29, 42 26.5, 50 26.5 C 58 26.5, 65 29, 64.5 42 C 62 33, 57 31, 50 31 C 43 31, 38 33, 35.5 42 Z M 38 30 L 62 28.4 L 62 30.6 L 38 32.4 Z" fill={hair} />}
      {appearance.hairStyle === 'FRINGE' && <path d="M 35.5 42 C 35 29, 42 26.5, 50 26.5 C 58 26.5, 65 29, 64.5 42 C 62 34, 57 33.5, 50 33.5 C 43 33.5, 38 34, 35.5 42 Z M 37 33 L 63 33 L 63 36.5 L 37 36.5 Z" fill={hair} />}
      {(appearance.hairStyle === 'CURLY_TOP') && (
        <g fill={hair}>
          <circle cx={42} cy={30} r={4.8} /><circle cx={49} cy={27.5} r={5.2} /><circle cx={56} cy={28} r={5} />
          <circle cx={61} cy={32} r={4.2} /><circle cx={39} cy={34} r={4} />
        </g>
      )}
      {appearance.hairStyle === 'TOPKNOT' && (
        <g fill={hair}>
          <path d="M 36.5 39 C 37.5 31, 43.5 29.5, 50 29.5 C 56.5 29.5, 62.5 31, 63.5 39 C 60.5 35, 55.5 34.5, 50 34.5 C 44.5 34.5, 39.5 35, 36.5 39 Z" />
          <circle cx={50} cy={24.5} r={4.6} />
        </g>
      )}
      {(appearance.hairStyle === 'DREADLOCKS' || appearance.hairStyle === 'BRAIDS') && (
        <g fill={hair}>
          <path d="M 35.5 42 C 35 29, 42 26.5, 50 26.5 C 58 26.5, 65 29, 64.5 42 C 62 33, 57 31, 50 31 C 43 31, 38 33, 35.5 42 Z" />
          <rect x={33.4} y={36} width={3.4} height={20} rx={1.7} /><rect x={63.2} y={36} width={3.4} height={20} rx={1.7} />
          <rect x={36.5} y={40} width={3} height={15} rx={1.5} /><rect x={60.5} y={40} width={3} height={15} rx={1.5} />
        </g>
      )}
      {appearance.headband && <path d="M 35.8 36.5 C 42 33.8, 58 33.8, 64.2 36.5 L 64.2 39.8 C 58 37.2, 42 37.2, 35.8 39.8 Z" fill={secondary} />}
      {/* Epic P0-4 face: brows, eyes, nose line, mouth — and the beard.
          Beard first (behind the mouth), drawn from beardStyle so Messi's
          full beard and Salah's curls+beard read on the card too. */}
      {appearance.beardStyle === 'FULL' && (
        <path d="M 38.5 44 C 38 54, 42 58.5, 50 58.5 C 58 58.5, 62 54, 61.5 44 C 59 52, 55 54.5, 50 54.5 C 45 54.5, 41 52, 38.5 44 Z" fill={appearance.beardColor ?? hair} />
      )}
      {appearance.beardStyle === 'SHORT' && (
        <path d="M 39.5 45.5 C 39.5 53, 43.5 56.5, 50 56.5 C 56.5 56.5, 60.5 53, 60.5 45.5 C 58 51.5, 54.5 53, 50 53 C 45.5 53, 42 51.5, 39.5 45.5 Z" fill={appearance.beardColor ?? hair} opacity={0.9} />
      )}
      {appearance.beardStyle === 'STUBBLE' && (
        <path d="M 40 46 C 40.5 52.5, 44 55.5, 50 55.5 C 56 55.5, 59.5 52.5, 60 46 C 57.5 51, 54 52.2, 50 52.2 C 46 52.2, 42.5 51, 40 46 Z" fill={appearance.beardColor ?? hair} opacity={0.45} />
      )}
      {appearance.beardStyle === 'GOATEE' && (
        <path d="M 45.5 51 C 46 55.5, 47.5 57.5, 50 57.5 C 52.5 57.5, 54 55.5, 54.5 51 C 52.5 53, 47.5 53, 45.5 51 Z" fill={appearance.beardColor ?? hair} />
      )}
      {appearance.beardStyle === 'MOUSTACHE' && (
        <path d="M 44.5 49.6 C 47 48.6, 49 48.8, 50 49.4 C 51 48.8, 53 48.6, 55.5 49.6 C 53.5 51, 46.5 51, 44.5 49.6 Z" fill={appearance.beardColor ?? hair} />
      )}
      <path d="M 41.8 40.4 L 47.6 40.4" stroke={appearance.beardColor ?? hair} strokeWidth={appearance.browStyle === 'THICK' ? 1.7 : 1.15} strokeLinecap="round" />
      <path d="M 52.4 40.4 L 58.2 40.4" stroke={appearance.beardColor ?? hair} strokeWidth={appearance.browStyle === 'THICK' ? 1.7 : 1.15} strokeLinecap="round" />
      <circle cx={45} cy={43} r={1.15} fill="#00000055" />
      <circle cx={55} cy={43} r={1.15} fill="#00000055" />
      <path d="M 50 43.5 L 49.2 47.6 C 49.6 48.3, 50.4 48.3, 50.9 47.8" stroke="#00000038" strokeWidth={1} fill="none" strokeLinecap="round" />
      <path d="M 45.5 50.5 C 48 52.4, 52 52.4, 54.5 50.5" stroke="#00000044" strokeWidth={1.3} fill="none" strokeLinecap="round" />
    </svg>
  );
}

export interface PlayerCardProps {
  template: PlayerTemplate;
  card?: OwnedPlayerCard | null;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  selected?: boolean;
}

const SIZE_CLASS = {
  sm: 'w-[104px]',
  md: 'w-[148px]',
  lg: 'w-[196px]',
} as const;

export function PlayerCard({ template, card, size = 'md', onClick, selected }: PlayerCardProps) {
  const foil = RARITY_FOIL[template.rarity];
  const club = ALL_CLUBS.find((c) => c.id === template.clubId);
  const ovr = card ? getCardEffectiveOvr(template, card) : template.baseOvr;
  const rank = card?.rank ?? 0;
  const gem = RANK_GEMS[rank] ?? RANK_GEMS[0]!;
  const scale = size === 'sm' ? 0.72 : size === 'lg' ? 1.32 : 1;

  const inner = (
    <div
      className={`relative overflow-hidden ${template.rarity === 'LEGEND' ? 'legend-aura' : ''}`}
      style={{
        clipPath: SHIELD_CLIP,
        background: foil.foil,
        boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.25)',
        aspectRatio: '3 / 3.9',
      }}
    >
      <div className="holo-shine" aria-hidden />
      <div className="absolute inset-0 flex flex-col" style={{ color: foil.ink }}>
        {/* top row: OVR + position / flag + club */}
        <div className="flex items-start justify-between px-[9%] pt-[7%]">
          <div className="text-center leading-none">
            <p className="font-display font-bold" style={{ fontSize: 30 * scale }}>{ovr}</p>
            <p className="font-display font-bold uppercase" style={{ fontSize: 14 * scale }}>{template.position}</p>
            <p
              className="mx-auto mt-1 rounded-sm bg-black/45 px-1 font-bold tracking-widest text-white"
              style={{ fontSize: 9 * scale }}
              aria-label={`Nationality ${template.nationality}`}
            >
              {template.nationality}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span
              className="flex items-center justify-center rounded-full border font-display font-bold"
              style={{
                width: 30 * scale, height: 30 * scale, fontSize: 9.5 * scale,
                background: club?.primary ?? '#222', color: club?.secondary ?? '#fff',
                borderColor: 'rgba(255,255,255,0.55)',
              }}
              aria-label={club?.name ?? template.clubId}
            >
              {club?.abbr ?? '—'}
            </span>
            <span className="font-bold uppercase tracking-wider opacity-80" style={{ fontSize: 8.5 * scale }}>
              {foil.label}
            </span>
          </div>
        </div>
        {/* portrait */}
        <div className="mx-auto mt-[1%] w-[62%] flex-1">
          <AthletePortrait
            appearance={template.appearance}
            primary={club?.primary ?? '#14532d'}
            secondary={club?.secondary ?? '#ffffff'}
            label={`${template.name} portrait`}
          />
        </div>
        {/* name + badges — kept clear of the shield's narrowing tip */}
        <div className="px-[7%] pb-[21%]">
          <p
            className="truncate text-center font-display font-bold uppercase leading-tight"
            style={{ fontSize: 13.5 * scale, textShadow: '0 1px 0 rgba(255,255,255,0.25)' }}
          >
            {template.shortName}
          </p>
          <div className="mt-1 flex items-center justify-center gap-1.5" style={{ fontSize: 9.5 * scale }}>
            <span className="flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 font-bold text-white">
              PAC {template.stats.pac} · SHO {template.stats.sho} · PAS {template.stats.pas}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-center gap-1.5" style={{ fontSize: 9.5 * scale }}>
            <span className="flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 font-bold text-white">
              DRI {template.stats.dri} · DEF {template.stats.def} · PHY {template.stats.phy}
            </span>
            <span className="rounded-full bg-black/45 px-1.5 py-0.5 font-bold text-white" aria-label={`Skill moves ${template.skillMoves} stars, weak foot ${template.weakFoot} stars`}>
              ★{template.skillMoves} · WF {template.weakFoot}★
            </span>
          </div>
          {club && (
            <p className="mt-1 truncate text-center font-semibold uppercase tracking-wider opacity-75" style={{ fontSize: 8.5 * scale }}>
              {club.name}
            </p>
          )}
          {card && (
            <div className="mt-1 flex items-center justify-center gap-1.5" style={{ fontSize: 9.5 * scale }}>
              {rank > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 font-bold text-white">
                  <span
                    aria-hidden
                    className="inline-block rotate-45"
                    style={{ width: 7 * scale, height: 7 * scale, background: gem.color, boxShadow: '0 0 4px rgba(0,0,0,0.6)' }}
                  />
                  Rank {rank} · {gem.name}
                </span>
              )}
              <span className="rounded-full bg-black/50 px-1.5 py-0.5 font-bold text-white">
                Train Lv {card.trainingLevel}
              </span>
              {card.locked && <span className="rounded-full bg-black/50 px-1.5 py-0.5 font-bold text-white">Locked</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const wrapStyle = selected
    ? { outline: '3px solid var(--accent)', outlineOffset: 2, borderRadius: 10 }
    : undefined;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${template.name}, ${ovr} overall, ${template.position}${card ? `, rank ${rank}, training level ${card.trainingLevel}` : ''}`}
        className={`${SIZE_CLASS[size]} shrink-0 text-left`}
        style={wrapStyle}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={`${SIZE_CLASS[size]} shrink-0`} style={wrapStyle} role="img" aria-label={`${template.name}, ${ovr} overall, ${template.position}`}>
      {inner}
    </div>
  );
}
