// Striker FC — ui/components/PitchFormationView.tsx
// Phase 07 interactive tactical pitch (Blueprint 08 §2): 11 formation slots +
// a 7-man substitutes tray. Tap a slot to select it, tap another to swap;
// HTML5 drag-and-drop does the same on desktop. Each node shows the
// slot-effective OVR with a green/amber/red position-fit ring.

import type { DragEvent } from 'react';
import type { Formation, SaveProfile } from '../../core/types';
import { FIT_COLORS, resolveXI, type SlotRef } from '../../meta/SquadService';
import { findCard } from '../../meta/ProgressionService';
import { getPlayerById } from '../../data/PlayerDatabase';
import { getSlotEffectiveOvr } from '../../core/types';

export interface PitchFormationViewProps {
  profile: SaveProfile;
  formation: Formation;
  selected: SlotRef | null;
  onSelect: (ref: SlotRef | null) => void;
  onSwap: (a: SlotRef, b: SlotRef) => void;
}

export function PitchFormationView({ profile, formation, selected, onSelect, onSwap }: PitchFormationViewProps) {
  const xi = resolveXI(profile);

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
        className="relative mx-auto aspect-[68/100] w-full max-w-[430px] overflow-hidden rounded-xl border border-[var(--border)]"
        style={{ background: 'repeating-linear-gradient(0deg, #12240f 0 10%, #172c12 10% 20%)' }}
        aria-label={`Tactical pitch, ${formation.name}. Tap two slots to swap players, or drag one onto another.`}
      >
        <div aria-hidden className="absolute inset-[3.5%] rounded border-2 border-white/35" />
        <div aria-hidden className="absolute left-[3.5%] right-[3.5%] top-1/2 border-t-2 border-white/25" />
        <div aria-hidden className="absolute left-1/2 top-1/2 h-[15%] w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-white/25" />
        <div aria-hidden className="absolute left-1/2 top-[3.5%] h-[13%] w-[52%] -translate-x-1/2 border-2 border-t-0 border-white/25" />
        <div aria-hidden className="absolute bottom-[3.5%] left-1/2 h-[13%] w-[52%] -translate-x-1/2 border-2 border-b-0 border-white/25" />
        {xi.map((row) => {
          const slot = formation.slots[row.index];
          if (!slot) return null;
          const ref: SlotRef = { zone: 'XI', index: row.index };
          const fitColor = row.fit ? FIT_COLORS[row.fit] : '#64748b';
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
              className="absolute z-10 flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${slot.ny * 100}%`, top: `${(1 - slot.nx) * 100}%` }}
            >
              <span
                className="tnum flex h-10 w-10 items-center justify-center rounded-full font-display text-[15px] font-bold text-white"
                style={{
                  background: 'rgba(0,0,0,0.72)',
                  border: `3px solid ${fitColor}`,
                  boxShadow: isSelected(ref) ? '0 0 0 3px var(--accent), 0 0 14px rgba(163,230,53,0.6)' : '0 2px 6px rgba(0,0,0,0.5)',
                }}
              >
                {row.slotOvr ?? '—'}
              </span>
              <span className="mt-0.5 rounded bg-black/65 px-1 text-[9px] font-bold uppercase tracking-wide text-white">
                {slot.role}
              </span>
              <span className="max-w-16 truncate rounded bg-black/55 px-1 text-[9px] font-semibold text-white/90">
                {row.template?.shortName ?? 'Empty'}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-center text-[11px] text-[var(--dim)]" aria-live="polite">
        {selected
          ? 'Now tap any other slot to swap — or tap the same slot again to cancel.'
          : 'Tap a player to select, then tap another slot to swap. Ring: green natural · amber off-role · red wrong group.'}
      </p>

      {/* Substitutes tray */}
      <h3 className="font-display mt-4 text-lg font-semibold uppercase tracking-widest text-[var(--accent)]">Substitutes</h3>
      <div className="mt-2 grid grid-cols-7 gap-1.5" role="group" aria-label="Substitutes tray">
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
              className="flex min-h-[64px] flex-col items-center justify-center rounded-lg border px-1 py-1.5"
              style={{
                borderColor: isSelected(ref) ? 'var(--accent)' : 'var(--border)',
                background: isSelected(ref) ? 'var(--accent-dim)' : 'var(--surface)',
                boxShadow: isSelected(ref) ? '0 0 10px rgba(163,230,53,0.45)' : undefined,
              }}
            >
              <span className="tnum font-display text-lg font-bold leading-none">{eff ?? '—'}</span>
              <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--dim)]">{template?.position ?? 'SUB'}</span>
              <span className="max-w-full truncate text-[9px] font-semibold">{template?.shortName ?? 'Empty'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
