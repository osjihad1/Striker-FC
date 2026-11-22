// Striker FC — ui/screens/SquadBuilderScreen.tsx
// Phase 07 squad builder (Blueprint 08 §2): all 10 formations, a live FC Mobile
// Team OVR counter, Auto-Build Best XI, an interactive pitch + subs tray
// (tap-to-swap and drag-and-drop via PitchFormationView), and the club
// inventory drawer with position / OVR / rarity sorting and instant swapping.
// Every edit is committed to SaveSystem immediately by the parent (onCommit)
// and re-applied to the 3D MatchEngine squad.

import { useMemo, useState } from 'react';
import type { Position, Rarity, SaveProfile } from '../../core/types';
import { ALL_POSITIONS, getCardEffectiveOvr, positionGroup } from '../../core/types';
import { getAllFormations, getFormationById } from '../../data/Formations';
import { getPlayerById } from '../../data/PlayerDatabase';
import { PitchFormationView } from '../components/PitchFormationView';
import { PlayerCard } from '../components/PlayerCard';
import {
FIT_COLORS, FIT_LABELS, assignCardToSlot, autoBuildBestXI, clearSquadSlot, positionFit,
setProfileFormation, squadTeamOvr, swapSquadSlots, zoneOf, type SlotRef,
} from '../../meta/SquadService';
import { findCard } from '../../meta/ProgressionService';
import { t } from '../../i18n/i18n';

type SortMode = 'OVR_DESC' | 'OVR_ASC' | 'POSITION' | 'RARITY';
const RARITY_ORDER: Record<Rarity, number> = { BRONZE: 0, SILVER: 1, GOLD: 2, ELITE: 3, MASTER: 4, LEGEND: 5 };

export function SquadBuilderScreen({
  profile, onCommit, onInspect, onReset, resetNote,
}: {
  profile: SaveProfile;
  onCommit: (next: SaveProfile, note: string) => void;
  onInspect: (instanceId: string) => void;
  onReset: () => void;
  resetNote: string | null;
}) {
  const [selected, setSelected] = useState<SlotRef | null>(null);
  const [sort, setSort] = useState<SortMode>('OVR_DESC');
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [note, setNote] = useState<string | null>(null);

  const formation = getFormationById(profile.activeFormationId) ?? getAllFormations()[0]!;
  const teamOvr = squadTeamOvr(profile);

  const commit = (next: SaveProfile, msg: string) => {
    setNote(msg);
    onCommit(next, msg);
  };

  const inventoryRows = useMemo(() => {
    const rows = profile.inventory
      .map((card) => ({ card, template: getPlayerById(card.templateId) }))
      .filter((r): r is { card: typeof r.card; template: NonNullable<typeof r.template> } => r.template !== undefined)
      .map((r) => ({ ...r, eff: getCardEffectiveOvr(r.template, r.card), zone: zoneOf(profile, r.card.instanceId) }));
    const filtered = posFilter === 'ALL'
      ? rows
      : rows.filter((r) => positionGroup(r.template.position) === posFilter || r.template.position === posFilter);
    const posIndex = (p: Position): number => ALL_POSITIONS.indexOf(p);
    switch (sort) {
      case 'OVR_DESC': filtered.sort((a, b) => b.eff - a.eff); break;
      case 'OVR_ASC': filtered.sort((a, b) => a.eff - b.eff); break;
      case 'POSITION': filtered.sort((a, b) => posIndex(a.template.position) - posIndex(b.template.position) || b.eff - a.eff); break;
      case 'RARITY': filtered.sort((a, b) => RARITY_ORDER[b.template.rarity] - RARITY_ORDER[a.template.rarity] || b.eff - a.eff); break;
    }
    return filtered;
  }, [profile, sort, posFilter]);

  const selectedCard = selected
    ? (() => {
        const id = selected.zone === 'XI' ? profile.startingXI[selected.index] : profile.substitutes[selected.index];
        return id ? findCard(profile, id) : undefined;
      })()
    : undefined;
  const selectedTemplate = selectedCard ? getPlayerById(selectedCard.templateId) : undefined;
  const selectedRole = selected
    ? selected.zone === 'XI'
      ? formation.slots[selected.index]?.role
      : selectedTemplate?.position
    : undefined;

  return (
    <section aria-label={t('squad.squadBuilder')} className="mt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
            {t('squad.myTeam')} <span className="text-[var(--dim)]">· {formation.name}</span>
          </h2>
          <p className="mt-1 max-w-prose text-sm text-[var(--dim)]">
            {t('squad.intro')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-[var(--dim)]">{t('squad.formation')}</span>
            <select
              aria-label={t('squad.formation')}
              value={profile.activeFormationId}
              onChange={(e) => {
                const f = getFormationById(e.target.value);
                commit(setProfileFormation(profile, e.target.value), t('squad.formationChanged', { name: f?.name ?? e.target.value }));
                setSelected(null);
              }}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm font-semibold"
            >
              {getAllFormations().map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              const built = autoBuildBestXI(profile);
              commit(built, t('squad.autoBuilt', { ovr: squadTeamOvr(built) }));
              setSelected(null);
            }}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-bold text-[#0a120c]"
          >
            {t('squad.autoBuild')}
          </button>
        </div>
      </div>

      {note && (
        <p aria-live="polite" className="mt-3 rounded-lg border border-[var(--accent-dim)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--accent)]">
          {note}
        </p>
      )}

      <div className="mt-4 grid gap-5">
        <div>
          <PitchFormationView
            profile={profile}
            formation={formation}
            selected={selected}
            onSelect={setSelected}
            onSwap={(a, b) => commit(swapSquadSlots(profile, a, b), t('squad.swapped'))}
            teamOvr={teamOvr}
          />
          {selected && (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3" aria-live="polite">
              {selectedTemplate && selectedCard ? (
                <>
                  <p className="text-sm">
                    <strong>{selectedTemplate.name}</strong>{' '}
                    <span className="text-[var(--dim)]">
                      {t('squad.slotLine', { role: selectedRole ?? '', ovr: getCardEffectiveOvr(selectedTemplate, selectedCard) })}
                      {selected.zone === 'XI' && selectedRole
                        ? ` · ${FIT_LABELS[positionFit(selectedTemplate, selectedRole, selectedCard.rank)]}`
                        : ''}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onInspect(selectedCard.instanceId)}
                      className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[#0a120c]"
                    >
                      {t('squad.inspectTrain')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        commit(clearSquadSlot(profile, selected), t('squad.movedToPool', { name: selectedTemplate.shortName }));
                        setSelected(null);
                      }}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
                    >
                      {t('squad.moveToPool')}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--dim)]">
                  {t('squad.emptySlotPick', { role: selectedRole ?? '' })}
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold uppercase tracking-widest text-[var(--accent)]">
              {t('squad.inventory', { n: inventoryRows.length })}
            </h3>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--dim)]">
                {t('squad.position')}
                <select
                  aria-label={t('squad.position')}
                  value={posFilter}
                  onChange={(e) => setPosFilter(e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs font-semibold text-[var(--text)]"
                >
                  <option value="ALL">{t('squad.all')}</option>
                  <option value="GK">{t('squad.goalkeepers')}</option>
                  <option value="DEF">{t('squad.defenders')}</option>
                  <option value="MID">{t('squad.midfielders')}</option>
                  <option value="ATT">{t('squad.attackers')}</option>
                  {ALL_POSITIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--dim)]">
                {t('squad.sort')}
                <select
                  aria-label={t('squad.sort')}
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortMode)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs font-semibold text-[var(--text)]"
                >
                  <option value="OVR_DESC">{t('squad.ovrHighLow')}</option>
                  <option value="OVR_ASC">{t('squad.ovrLowHigh')}</option>
                  <option value="POSITION">{t('squad.byPosition')}</option>
                  <option value="RARITY">{t('squad.byRarity')}</option>
                </select>
              </label>
            </div>
          </div>
          <p className="mt-1 text-xs text-[var(--dim)]">
            {t('squad.hint')}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {inventoryRows.map(({ card, template, eff, zone }) => {
              const fit = selected?.zone === 'XI' && selectedRole
                ? positionFit(template, selectedRole, card.rank)
                : null;
              return (
                <div key={card.instanceId} className="relative">
                  <PlayerCard
                    template={template}
                    card={card}
                    size="sm"
                    onClick={() => {
                      if (selected) {
                        commit(
                          assignCardToSlot(profile, card.instanceId, selected),
                          t('squad.placed', { name: template.shortName, slot: selected.zone === 'XI' ? (formation.slots[selected.index]?.role ?? '') : t('squad.substitute') }),
                        );
                        setSelected(null);
                      } else {
                        onInspect(card.instanceId);
                      }
                    }}
                  />
                  <span
                    className="absolute left-1 top-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                    style={{ background: zone === 'XI' ? '#15803d' : zone === 'SUB' ? '#0369a1' : 'rgba(0,0,0,0.6)' }}
                  >
                    {zone === 'XI' ? 'XI' : zone === 'SUB' ? 'Sub' : 'Club'}
                  </span>
                  {fit && (
                    <span
                      aria-label={t('squad.fitFor', { label: FIT_LABELS[fit] })}
                      className="absolute right-1 top-1 h-3 w-3 rounded-full border border-black/50"
                      style={{ background: FIT_COLORS[fit] }}
                    />
                  )}
                  <span className="sr-only">{t('squad.overall', { name: template.name, ovr: eff })}</span>
                </div>
              );
            })}
          </div>
          {inventoryRows.length === 0 && (
            <p className="mt-3 text-sm text-[var(--dim)]">{t('squad.noMatch')}</p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-[var(--danger)] px-3 py-2 text-sm font-semibold text-[var(--danger)]"
            >
              {t('squad.resetSave')}
            </button>
            {resetNote && <span className="text-sm text-[var(--accent)]">{resetNote}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
