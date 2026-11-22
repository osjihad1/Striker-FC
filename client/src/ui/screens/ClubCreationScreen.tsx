// Striker FC — ui/screens/ClubCreationScreen.tsx (Addendum 1)
// First-run club creation: the manager names himself and his club, picks
// the crest colours and the formation. Everything is editable later in
// Settings; "Made by Jihad" stays only as the creator credit on the
// splash, never as the manager's name.

import { useState } from 'react';
import type { SaveProfile } from '../../core/types';
import { getAllFormations } from '../../data/Formations';
import { currentLanguage, t } from '../../i18n/i18n';

const COLOR_CHOICES = [
  '#a3e635', '#38bdf8', '#f43f5e', '#f5c542', '#a855f7', '#f97316', '#14b8a6', '#f8fafc',
];

export function ClubCreationScreen({
  profile, onDone,
}: {
  profile: SaveProfile;
  onDone: (next: SaveProfile, startTutorial: boolean) => void;
}) {
  const [managerName, setManagerName] = useState(profile.managerName === 'Manager' ? '' : profile.managerName);
  const [clubName, setClubName] = useState(profile.clubName === 'Striker FC' ? '' : profile.clubName);
  const [primary, setPrimary] = useState(profile.clubPrimaryColor);
  const [secondary, setSecondary] = useState(profile.clubSecondaryColor);
  const [formationId, setFormationId] = useState(profile.activeFormationId);
  const [error, setError] = useState<string | null>(null);

  const abbr = (clubName.trim().replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('') || 'FC').toUpperCase().padEnd(2, 'C').slice(0, 3);

  const finish = (startTutorial: boolean) => {
    const manager = managerName.trim();
    const club = clubName.trim();
    if (manager.length < 2) { setError(t('err.managerShort')); return; }
    if (club.length < 3) { setError(t('err.clubShort')); return; }
    onDone({
      ...profile,
      managerName: manager,
      clubName: club,
      clubAbbr: abbr,
      clubPrimaryColor: primary,
      clubSecondaryColor: secondary,
      activeFormationId: formationId,
      onboarded: true,
      clubCreatedAtIso: profile.clubCreatedAtIso ?? new Date().toISOString(),
    }, startTutorial);
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-5 py-8">
      <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--accent)]">{t('create.welcome')}</p>
      <h1 className="font-display mt-1 text-4xl font-bold uppercase leading-none tracking-wide">{t('create.title')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--dim)]">
        {t('create.intro')}
      </p>

      <label className="mt-6 block text-xs font-bold uppercase tracking-widest text-[var(--dim)]">
        {t('create.managerName')}
        <input
          value={managerName}
          onChange={(e) => setManagerName(e.target.value)}
          maxLength={24}
          placeholder="e.g. Jihad"
          aria-label={t('create.managerName')}
          className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-base font-semibold text-[var(--text)]"
        />
      </label>
      <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-[var(--dim)]">
        {t('create.clubName')}
        <input
          value={clubName}
          onChange={(e) => setClubName(e.target.value)}
          maxLength={28}
          placeholder="e.g. Dhaka Strikers"
          aria-label={t('create.clubName')}
          className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-base font-semibold text-[var(--text)]"
        />
      </label>
      {clubName.trim().length >= 3 && (
        <p className="tnum mt-1.5 text-xs text-[var(--dim)]">{t('create.crestInitials')}: <span className="font-bold text-[var(--text)]">{abbr}</span></p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--dim)]">{t('create.primary')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLOR_CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`${t('create.primary')} ${c}`}
                aria-pressed={primary === c}
                onClick={() => setPrimary(c)}
                className="h-9 w-9 rounded-full border-2"
                style={{ background: c, borderColor: primary === c ? '#fff' : 'transparent' }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--dim)]">{t('create.secondary')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLOR_CHOICES.map((c) => (
              <button
                key={`s-${c}`}
                type="button"
                aria-label={`${t('create.secondary')} ${c}`}
                aria-pressed={secondary === c}
                onClick={() => setSecondary(c)}
                className="h-9 w-9 rounded-full border-2"
                style={{ background: c, borderColor: secondary === c ? '#fff' : 'transparent' }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Crest preview */}
      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <svg viewBox="0 0 100 110" width={52} height={57} role="img" aria-label={t('create.crestPreview')}>
          <path d="M6 6 H94 V62 C94 86 74 99 50 106 C26 99 6 86 6 62 Z" fill={primary} stroke="rgba(255,255,255,0.55)" strokeWidth={3} />
          <path d="M6 34 H94" stroke={secondary} strokeWidth={7} />
          <text x={50} y={72} textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight={700} fontSize={30} fill={secondary}>{abbr}</text>
        </svg>
        <div className="min-w-0">
          <p className="font-display truncate text-2xl font-bold uppercase leading-none">{clubName.trim() || t('hub.yourClub')}</p>
          <p className="mt-1 text-xs text-[var(--dim)]">{t('create.managedBy', { name: managerName.trim() || (currentLanguage() === 'bn' ? 'আপনি' : 'you') })} · {getAllFormations().find((f) => f.id === formationId)?.name ?? formationId}</p>
        </div>
      </div>

      <label className="mt-5 block text-xs font-bold uppercase tracking-widest text-[var(--dim)]">
        {t('create.formation')}
        <select
          value={formationId}
          onChange={(e) => setFormationId(e.target.value)}
          aria-label={t('create.formation')}
          className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-base font-semibold text-[var(--text)]"
        >
          {getAllFormations().map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </label>

      {error && <p role="alert" className="mt-3 rounded-lg border border-[var(--danger)]/60 bg-[var(--danger)]/15 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}

      <button
        type="button"
        onClick={() => finish(true)}
        className="play-glow font-display mt-6 w-full rounded-2xl bg-[var(--accent)] px-4 py-3.5 text-[22px] font-bold uppercase tracking-[0.14em] text-[#0a120c]"
      >
        {t('create.createLearn')}
      </button>
      <button
        type="button"
        onClick={() => finish(false)}
        className="mt-2.5 w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-bold uppercase tracking-widest text-[var(--dim)]"
      >
        {t('create.skipTutorial')}
      </button>
    </div>
  );
}
