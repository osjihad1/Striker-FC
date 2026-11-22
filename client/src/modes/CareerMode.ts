// Striker FC — modes/CareerMode.ts (Epic fix round, P2-20 minimum spine)
// League Career: a 10-club league (your club + 9 from the 40-club database)
// played as a single round-robin — 9 rounds, your fixture is a real match
// in the 3D engine, the round's other four fixtures are simulated from the
// clubs' real Team OVRs. Between seasons the facilities grow (Training /
// Youth Academy / Stadium), the Academy graduates one young player into
// your inventory each season, and the table + titles persist on the
// profile. MOTM / player ratings ride the shared Match End path.

import { mulberry32 } from '../core/math';
import { formatNumber } from '../i18n/i18n';
import type { CareerState, SaveProfile } from '../core/types';
import { getClubTeam } from '../data/Clubs';
import { getAllPlayers } from '../data/PlayerDatabase';
import type { ModeRewardGrant } from './ModeRewards';

/** Sentinel id for the manager's own club in the career table. */
export const CAREER_USER_ID = 'career_user';

export type FacilityKind = 'training' | 'academy' | 'stadium';
export const FACILITY_MAX = 5;
/** Coins to raise a facility from `level` to `level + 1`. */
export function facilityCost(level: number): number {
  return 8000 * (level + 1);
}

/** The 9 league opponents: a fixed competitive spread from the club DB. */
const LEAGUE_OPPONENT_IDS = [
  'real_madrid', 'man_city', 'liverpool', 'dhaka_tigers', 'fc_barcelona',
  'bayern_munich', 'mersey_reds', 'tokyo_blazers', 'chittagong_thunder',
];

function emptyRow(clubId: string): CareerState['table'][number] {
  return { clubId, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
}

/** Circle-method round-robin for 10 teams → 9 rounds of 5 fixtures. */
export function buildRoundRobin(teamIds: string[]): CareerState['fixtures'] {
  const teams = [...teamIds];
  const fixtures: CareerState['fixtures'] = [];
  const n = teams.length;
  const rounds = n - 1;
  const rotating = teams.slice(1);
  for (let r = 0; r < rounds; r += 1) {
    const left = [teams[0]!, ...rotating.slice(0, n / 2 - 1)];
    const right = rotating.slice(n / 2 - 1).reverse();
    for (let i = 0; i < n / 2; i += 1) {
      const home = left[i]!;
      const away = right[i]!;
      fixtures.push({
        round: r,
        homeId: r % 2 === 0 ? home : away,
        awayId: r % 2 === 0 ? away : home,
        played: false, homeGoals: 0, awayGoals: 0,
      });
    }
    rotating.push(rotating.shift()!);
  }
  return fixtures;
}

export function createCareer(userClubId: string): CareerState {
  const teamIds = [CAREER_USER_ID, ...LEAGUE_OPPONENT_IDS];
  return {
    season: 1,
    userClubId,
    table: teamIds.map(emptyRow),
    fixtures: buildRoundRobin(teamIds),
    nextFixture: 0,
    facilities: { training: 0, academy: 0, stadium: 0 },
    academyPromotedSeason: 0,
    titlesWon: 0,
  };
}

/** The user's next unplayed fixture (their matches are what get played live). */
export function nextUserFixture(career: CareerState): CareerState['fixtures'][number] | null {
  return career.fixtures.find(
    (f) => !f.played && (f.homeId === CAREER_USER_ID || f.awayId === CAREER_USER_ID),
  ) ?? null;
}

export function careerOpponentOf(fixture: CareerState['fixtures'][number]): string {
  return fixture.homeId === CAREER_USER_ID ? fixture.awayId : fixture.homeId;
}

function applyResult(table: CareerState['table'], homeId: string, awayId: string, hg: number, ag: number): void {
  const home = table.find((r) => r.clubId === homeId);
  const away = table.find((r) => r.clubId === awayId);
  if (!home || !away) return;
  home.p += 1; away.p += 1;
  home.gf += hg; home.ga += ag;
  away.gf += ag; away.ga += hg;
  if (hg > ag) { home.w += 1; away.l += 1; home.pts += 3; }
  else if (ag > hg) { away.w += 1; home.l += 1; away.pts += 3; }
  else { home.d += 1; away.d += 1; home.pts += 1; away.pts += 1; }
}

function simGoals(teamOvr: number, oppOvr: number, rng: () => number): number {
  const base = 1.15 + (teamOvr - oppOvr) * 0.09;
  const roll = rng();
  if (roll < 0.22) return 0;
  if (roll < 0.52) return 1;
  if (roll < 0.78) return 2;
  if (roll < 0.93) return Math.max(0, Math.round(base + 1));
  return Math.max(0, Math.round(base + 2));
}

export interface CareerMatchOutcome {
  career: CareerState;
  grant: ModeRewardGrant;
  userWon: boolean;
  seasonOver: boolean;
  champion: boolean;
}

/**
 * Record the user's live result: their fixture is written verbatim, the
 * other fixtures of that round are simulated from real club OVRs, and the
 * reward grant scales with the Stadium facility (gate receipts).
 */
export function recordCareerResult(
  career: CareerState,
  homeGoals: number,
  awayGoals: number,
  rng: () => number,
): CareerMatchOutcome {
  const fixture = nextUserFixture(career);
  if (!fixture) {
    return {
      career, userWon: false, seasonOver: true, champion: false,
      grant: { coins: 0, gems: 0, xp: 0, trainingXp: 0, fans: 0 },
    };
  }
  const next: CareerState = {
    ...career,
    table: career.table.map((r) => ({ ...r })),
    fixtures: career.fixtures.map((f) => ({ ...f })),
  };
  const target = next.fixtures.find((f) => f.round === fixture.round && f.homeId === fixture.homeId && f.awayId === fixture.awayId)!;
  const userIsHome = fixture.homeId === CAREER_USER_ID;
  target.played = true;
  target.homeGoals = userIsHome ? homeGoals : awayGoals;
  target.awayGoals = userIsHome ? awayGoals : homeGoals;
  applyResult(next.table, target.homeId, target.awayId, target.homeGoals, target.awayGoals);
  // Simulate the rest of the round from the clubs' real Team OVRs.
  for (const f of next.fixtures) {
    if (f.round !== fixture.round || f.played) continue;
    const homeOvr = f.homeId === CAREER_USER_ID ? 78 : (getClubTeam(f.homeId)?.teamOvr ?? 75);
    const awayOvr = f.awayId === CAREER_USER_ID ? 78 : (getClubTeam(f.awayId)?.teamOvr ?? 75);
    f.homeGoals = simGoals(homeOvr, awayOvr, rng);
    f.awayGoals = simGoals(awayOvr, homeOvr, rng);
    f.played = true;
    applyResult(next.table, f.homeId, f.awayId, f.homeGoals, f.awayGoals);
  }
  const userWon = homeGoals > awayGoals;
  const drawn = homeGoals === awayGoals;
  const stadiumMult = 1 + next.facilities.stadium * 0.15;
  const grant: ModeRewardGrant = {
    coins: Math.round((userWon ? 4000 : drawn ? 2200 : 1200) * stadiumMult),
    gems: userWon ? 8 : 0,
    xp: userWon ? 320 : drawn ? 200 : 120,
    trainingXp: 120 + next.facilities.training * 40,
    fans: 0,
  };
  const seasonOver = nextUserFixture(next) === null;
  const sorted = sortedTable(next);
  const champion = seasonOver && sorted[0]?.clubId === CAREER_USER_ID;
  if (champion) next.titlesWon += 1;
  return { career: next, grant, userWon, seasonOver, champion };
}

/** Table sorted by points, then goal difference, then goals for. */
export function sortedTable(career: CareerState): CareerState['table'] {
  return [...career.table].sort((a, b) =>
    b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
}

/** Start the next season: fresh table/fixtures, facilities + titles kept. */
export function advanceCareerSeason(career: CareerState): CareerState {
  const teamIds = [CAREER_USER_ID, ...LEAGUE_OPPONENT_IDS];
  return {
    ...career,
    season: career.season + 1,
    table: teamIds.map(emptyRow),
    fixtures: buildRoundRobin(teamIds),
    nextFixture: 0,
  };
}

/** Raise a facility one level for coins (caller commits the profile). */
export function upgradeFacility(
  profile: SaveProfile,
  kind: FacilityKind,
): { profile: SaveProfile; error: string | null } {
  const career = profile.career;
  if (!career) return { profile, error: 'Start a league career first.' };
  const level = career.facilities[kind];
  if (level >= FACILITY_MAX) return { profile, error: 'That facility is already at max level.' };
  const cost = facilityCost(level);
  if (profile.coins < cost) return { profile, error: `You need ${formatNumber(cost)} coins for the next level.` };
  return {
    profile: {
      ...profile,
      coins: profile.coins - cost,
      career: { ...career, facilities: { ...career.facilities, [kind]: level + 1 } },
    },
    error: null,
  };
}

/**
 * Youth Academy graduation: once per season, one unowned young profile
 * (a generated prospect, never a real-world star) joins the club. Higher
 * Academy levels graduate stronger prospects.
 */
export function promoteAcademyPlayer(
  profile: SaveProfile,
  rng: () => number,
): { profile: SaveProfile; grantedName: string | null; error: string | null } {
  const career = profile.career;
  if (!career) return { profile, grantedName: null, error: 'Start a league career first.' };
  if (career.facilities.academy <= 0) return { profile, grantedName: null, error: 'Build the Youth Academy (Facilities) to graduate a prospect.' };
  if (career.academyPromotedSeason === career.season) {
    return { profile, grantedName: null, error: 'Your academy has already graduated a player this season.' };
  }
  const owned = new Set(profile.inventory.map((c) => c.templateId));
  const minOvr = 62 + career.facilities.academy * 3;
  const pool = getAllPlayers().filter(
    (p) => !owned.has(p.id) && !p.id.startsWith('rw_') && p.rarity !== 'LEGEND' && p.rarity !== 'MASTER'
      && p.baseOvr >= minOvr && p.baseOvr <= minOvr + 10,
  );
  const pick = pool[Math.floor(rng() * pool.length)];
  if (!pick) return { profile, grantedName: null, error: 'No academy prospect is ready this season.' };
  return {
    profile: {
      ...profile,
      inventory: [...profile.inventory, {
        instanceId: `card_academy_${pick.id}_s${career.season}`,
        templateId: pick.id,
        trainingLevel: 0, trainingXp: 0, rank: 0,
        skillPoints: { dexterity: 0, shooting: 0, passing: 0, defending: 0, physical: 0, gkDivingFocus: 0 },
        locked: false,
      }],
      career: { ...career, academyPromotedSeason: career.season },
    },
    grantedName: pick.name,
    error: null,
  };
}

export interface CareerLabResult {
  fixturesOk: boolean;
  tableOk: boolean;
  facilityOk: boolean;
  academyOk: boolean;
  detail: string;
}

/** Deterministic checks of the career spine on synthetic state. */
export function runCareerLab(): CareerLabResult {
  const career = createCareer('career_user');
  const userFixtures = career.fixtures.filter((f) => f.homeId === CAREER_USER_ID || f.awayId === CAREER_USER_ID);
  const fixturesOk = career.fixtures.length === 45 && userFixtures.length === 9 && career.table.length === 10;
  let state = career;
  const rng = mulberry32(1234);
  let guard = 0;
  while (nextUserFixture(state) && guard < 12) {
    guard += 1;
    state = recordCareerResult(state, 2, 1, rng).career;
  }
  const played = state.table.reduce((sum, r) => sum + r.p, 0);
  const tableOk = guard === 9 && played === 90 && state.table.every((r) => r.p === 9);
  const richProfile = {
    coins: 1_000_000, career: state, inventory: [],
  } as unknown as SaveProfile;
  const upgraded = upgradeFacility(richProfile, 'academy');
  const facilityOk = upgraded.error === null && upgraded.profile.career?.facilities.academy === 1
    && upgraded.profile.coins === 1_000_000 - facilityCost(0);
  const promoted = promoteAcademyPlayer(upgraded.profile, mulberry32(5));
  const academyOk = promoted.error === null && promoted.grantedName !== null
    && promoted.profile.inventory.length === 1
    && promoteAcademyPlayer(promoted.profile, mulberry32(5)).error !== null;
  return {
    fixturesOk, tableOk, facilityOk, academyOk,
    detail: `10 clubs · 45 fixtures · 9 user rounds · facilities to Lv${FACILITY_MAX} · 1 academy graduate/season · titles ${state.titlesWon}`,
  };
}
