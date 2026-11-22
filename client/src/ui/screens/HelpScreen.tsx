// Striker FC — ui/screens/HelpScreen.tsx (Addendum 1)
// How to Play: the controls diagram, every skill move and its swipe, the
// set-piece rules, auto-switch behaviour and the difficulty ladder —
// everything the tutorial teaches, written down. Replayable tutorial
// button at the top.

import { ALL_SKILL_MOVES } from '../../physics/SkillMoveEngine';
import { t } from '../../i18n/i18n';

function swipeLabel(id: string): string {
  switch (id) {
    case 'BALL_ROLL': return t('help.swipeLeft');
    case 'LANE_CHANGE': return t('help.swipeRight');
    case 'ROULETTE': return t('help.swipeUp');
    case 'HEEL_TO_HEEL': return t('help.swipeDown');
    case 'KNOCK_ON':
    case 'RAINBOW_FLICK': return t('help.holdWheel');
    default: return t('help.tapSkill');
  }
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 py-2 last:border-0">
      <span className="font-display shrink-0 text-base font-bold uppercase tracking-wide text-[var(--gold)]">{k}</span>
      <span className="text-right text-sm leading-snug text-white/80">{v}</span>
    </div>
  );
}

export function HelpScreen({ onReplayTutorial }: { onReplayTutorial: () => void }) {
  return (
    <section aria-label={t('help.title')} className="mx-auto w-full max-w-2xl px-1 pb-6 pt-5">
      <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-wide">{t('help.title')}</h2>
      <p className="mt-1.5 text-sm text-[var(--dim)]">
        {t('help.intro')}
      </p>
      <button
        type="button"
        onClick={onReplayTutorial}
        className="play-glow font-display mt-4 w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-xl font-bold uppercase tracking-[0.12em] text-[#0a120c]"
      >
        {t('help.replayTutorial')}
      </button>

      <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="font-display text-xl font-bold uppercase tracking-wide">{t('help.controls')}</h3>
        <div className="mt-2">
          <Row k={t('help.joystick')} v={t('help.joystickDesc')} />
          <Row k={t('help.pass')} v={t('help.passDesc')} />
          <Row k={t('help.through')} v={t('help.throughDesc')} />
          <Row k={t('help.shoot')} v={t('help.shootDesc')} />
          <Row k={t('help.sprint')} v={t('help.sprintDesc')} />
          <Row k={t('help.tackle')} v={t('help.tackleDesc')} />
          <Row k={t('help.matchUp')} v={t('help.matchUpDesc')} />
          <Row k={t('help.switch')} v={t('help.switchDesc')} />
          <Row k={t('help.secondDef')} v={t('help.secondDefDesc')} />
          <Row k={t('help.gkRush')} v={t('help.gkRushDesc')} />
          <Row k={t('help.autoSwitch')} v={t('help.autoSwitchDesc')} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="font-display text-xl font-bold uppercase tracking-wide">{t('help.skillMoves')}</h3>
        <p className="mt-1 text-sm text-[var(--dim)]">{t('help.skillNote')}</p>
        <div className="mt-2">
          {ALL_SKILL_MOVES.map((m) => (
            <Row key={m.id} k={`${m.name} · ${'★'.repeat(m.stars)}`} v={swipeLabel(m.id)} />
          ))}
          <Row k={t('help.fakeShot')} v={t('help.fakeShotDesc')} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="font-display text-xl font-bold uppercase tracking-wide">{t('help.setPieces')}</h3>
        <div className="mt-2">
          <Row k={t('help.freeKicks')} v={t('help.freeKicksDesc')} />
          <Row k={t('help.penalties')} v={t('help.penaltiesDesc')} />
          <Row k={t('help.offside')} v={t('help.offsideDesc')} />
          <Row k={t('help.cards')} v={t('help.cardsDesc')} />
          <Row k={t('help.advantage')} v={t('help.advantageDesc')} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="font-display text-xl font-bold uppercase tracking-wide">{t('help.difficulty')}</h3>
        <p className="mt-1 text-sm leading-relaxed text-white/80">
          {t('help.difficultyDesc')}
        </p>
      </div>
    </section>
  );
}
