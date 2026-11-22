// Striker FC — ui/components/PitchFormationView.tsx
// FC Mobile skin pass (visual bible §2.2): the XI stands as mini PHOTO
// CARDS on a full-bleed stadium-pitch photograph — floodlit stands, mowing
// stripes and all — never OVR circles on a flat CSS pitch. The Team OVR
// rides in a red shield badge with a gold rim, floating top-right over
// the stands. Tap a slot to select it, tap another to swap; HTML5
// drag-and-drop does the same on desktop. Landscape phones get the
// landscape pitch (attacking right); narrow portrait keeps the tall pitch.

import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { Formation, SaveProfile } from '../../core/types';
import { FIT_COLORS, resolveXI, type SlotRef } from '../../meta/SquadService';
import { findCard } from '../../meta/ProgressionService';
import { getPlayerById } from '../../data/PlayerDatabase';
import { getSlotEffectiveOvr } from '../../core/types';
import { PlayerCard } from './PlayerCard';
import { formatNumber } from '../../i18n/i18n';
import stadiumPitchUrl from '../../assets/stadium-pitch.jpg';

export interface PitchFormationViewProps {
  profile: SaveProfile;
  formation: Formation;
  selected: SlotRef | null;
  onSelect: (ref: SlotRef | null) => void;
  onSwap: (a: SlotRef, b: SlotRef) => void;
  /** Team OVR for the red shield badge floating over the stands. */
  teamOvr?: number;
}

export function TeamOvrShield({ ovr, size = 76 }: { ovr: number; size?: number }) {
  return (
    <div
      className="relative flex flex-col items-center justify-center text-center"
      style={{ width: size, height: size * 1.14, filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.6))' }}
      role="img"
      aria-label={`Team overall ${ovr}`}
    >
      <svg viewBox="0 0 100 114" className="absolute inset-0 h-full w-full" aria-hidden>
        <path d="M6 4 H94 V56 C94 84 74 100 50 110 C26 100 6 84 6 56 Z" fill="#c8102e" stroke="#f5c542" strokeWidth={4} />
        <path d="M14 12 H86 V54 C86 78 70 92 50 101 C30 92 14 78 14 54 Z" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.6} />
      </svg>
      <span className="relative font-display text-[11px] font-bold uppercase tracking-[0.3em] text-white/85" style={{ marginTop: size * 0.1 }}>OVR</span>
      <span className="tnum relative font-display font-bold leading-none text-white" style={{ fontSize: size * 0.46 }}>{formatNumber(ovr)}</span>
    </div>
  );
}

export function PitchFormationView({ profile, formation, selected, onSelect, onSwap, teamOvr }: PitchFormationViewProps) {
  const xi = resolveXI(profile);
  const pitchRef = useRef<HTMLDivElement>(null);
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    const el = pitchRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setLandscape(r.width > r.height * 1.02);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleTap = (ref: SlotRef) => {
    if (!selected) {
      onSelect(ref);
      return;
    }
    if (selected.zone === ref.zone && selected.index === ref.index) {
      onSelect(null);
      return;
    }
    onSwap(selected, ref);
    onSelect(null);
  };

  const isSelected = (ref: SlotRef): boolean =>
    selected !== null && selected.zone === ref.zone && selected.index === ref.index;

  const dropProps = (ref: SlotRef) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData('text/plain', `${ref.zone}:${ref.index}`);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('text/plain');
      const [zone, idx] = raw.split(':');
      const index = Number(idx);
      if ((zone === 'XI' || zone === 'SUB') && Number.isInteger(index)) {
        onSwap({ zone, index }, ref);
        onSelect(null);
      }
    },
  });

  return (
    <div>
      <div
        ref={pitchRef}
        className="relative w-full overflow-hidden rounded-2xl border border-white/20 shadow-2xl aspect-[68/100] min-[560px]:aspect-[16/9]"
        aria-label={`Squad pitch, ${formation.name}. Tap two slots to swap players, or drag one onto another.`}
      >
        <img src={stadiumPitchUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(3,10,4,0.42) 0%, rgba(3,10,4,0.08) 30%, rgba(3,10,4,0.10) 70%, rgba(3,10,4,0.45) 100%)' }} />
        {/* pitch line overlay, oriented with the pitch */}
        {landscape ? (
          <>
            <div aria-hidden className="absolute inset-[3%] rounded border-2 border-white/40" />
            <div aria-hidden className="absolute bottom-[3%] left-1/2 top-[3%] border-l-2 border-white/30" />
            <div aria-hidden className="absolute left-1/2 top-1/2 h-[34%] w-[19%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-white/30" />
          </>
        ) : (
          <>
            <div aria-hidden className="absolute inset-[3%] rounded border-2 border-white/40" />
            <div aria-hidden className="absolute left-[3%] right-[3%] top-1/2 border-t-2 border-white/30" />
            <div aria-hidden className="absolute left-1/2 top-1/2 h-[15%] w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-white/30" />
          </>
        )}
        {teamOvr !== undefined && (
          <div className="absolute right-2.5 top-2.5 z-20">
            <TeamOvrShield ovr={teamOvr} size={64} />
          </div>
        )}
        <span className="absolute left-2.5 top-2.5 z-20 rounded-full bg-black/60 px-2.5 py-1 font-display text-[12px] font-bold uppercase tracking-widest text-white backdrop-blur-sm">
          {formation.name}
        </span>
        {xi.map((row) => {
          const slot = formation.slots[row.index];
          if (!slot) return null;
          const ref: SlotRef = { zone: 'XI', index: row.index };
          const fitColor = row.fit ? FIT_COLORS[row.fit] : '#64748b';
          const pos = landscape
            ? { left: `${8 + slot.nx * 84}%`, top: `${10 + slot.ny * 80}%` }
            : { left: `${slot.ny * 100}%`, top: `${(1 - slot.nx) * 100}%` };
          return (
            <button
              key={row.index}
              type="button"
              {...dropProps(ref)}
              onClick={() => handleTap(ref)}
              aria-pressed={isSelected(ref)}
              aria-label={row.template
                ? `${slot.role}: ${row.template.name}, ${row.slotOvr} overall${row.fit ? `, ${row.fit.toLowerCase()} fit` : ''}${isSelected(ref) ? ', selected' : ''}`
                : `${slot.role}: empty slot${isSelected(ref) ? ', selected' : ''}`}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={pos}
            >
              {row.template && row.card ? (
                <span
                  className="block rounded-[10px]"
                  style={{ boxShadow: `0 0 0 2.5px ${fitColor}, 0 6px 14px rgba(0,0,0,0.55)${isSelected(ref) ? ', 0 0 0 5px var(--teal), 0 0 18px rgba(0,217,192,0.7)' : ''}` }}
                >
                  <PlayerCard template={row.template} card={row.card} size="xs" />
                </span>
              ) : (
                <span
                  className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 border-dashed bg-black/55 font-display font-bold text-white"
                  style={{ borderColor: fitColor, boxShadow: isSelected(ref) ? '0 0 0 3px var(--teal)' : undefined }}
                >
                  <span className="text-[13px] leading-none">{slot.role}</span>
                  <span className="mt-0.5 text-[8px] uppercase tracking-wider text-white/70">Empty</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-center text-[11px] text-[var(--dim)]" aria-live="polite">
        {selected
          ? 'Now tap any other slot to swap — or tap the same slot again to cancel.'
          : 'Tap a player to select, then tap another slot to swap. Card rim: green natural · amber off-role · red wrong group.'}
      </p>

      {/* Substitutes tray — mini photo cards, same as the pitch */}
      <h3 className="font-display mt-4 text-lg font-semibold uppercase tracking-widest text-[var(--accent)]">Substitutes</h3>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Substitutes tray">
        {profile.substitutes.map((instanceId, i) => {
          const ref: SlotRef = { zone: 'SUB', index: i };
          const card = instanceId ? findCard(profile, instanceId) : undefined;
          const template = card ? getPlayerById(card.templateId) : undefined;
          const eff = template && card ? getSlotEffectiveOvr(template, card, template.position) : null;
          return (
            <button
              key={i}
              type="button"
              {...dropProps(ref)}
              onClick={() => handleTap(ref)}
              aria-pressed={isSelected(ref)}
              aria-label={template
                ? `Substitute ${i + 1}: ${template.name}, ${eff} overall${isSelected(ref) ? ', selected' : ''}`
                : `Substitute slot ${i + 1}: empty${isSelected(ref) ? ', selected' : ''}`}
              className="rounded-[10px]"
              style={{ boxShadow: isSelected(ref) ? '0 0 0 3px var(--teal), 0 0 14px rgba(0,217,192,0.6)' : undefined }}
            >
              {template && card ? (
                <PlayerCard template={template} card={card} size="xs" />
              ) : (
                <span className="flex h-[98px] w-[76px] flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-[var(--border)] bg-[var(--surface)] text-[var(--dim)]">
                  <span className="font-display text-lg font-bold">—</span>
                  <span className="text-[9px] font-bold uppercase tracking-wide">Sub {i + 1}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
