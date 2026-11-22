// Striker FC — ui/components/ClubCrestArt.tsx
// FC Mobile skin pass: a proper club CREST (not a plain coloured circle
// with initials). Each club gets a heraldic shield — or a roundel for the
// modern badge clubs — with a kit pattern (stripes / sash / hoops / chief
// / halves) derived from its identity, a gold rim, a ball motif and the
// club monogram. Fully offline inline SVG in the club's real colours.

export type CrestPattern = 'STRIPES' | 'SASH' | 'HOOPS' | 'CHIEF' | 'HALVES' | 'ROUNDEL';

const SHIELD_PATH = 'M8 4 H92 V58 C92 82 74 95 50 103 C26 95 8 82 8 58 Z';

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Roundel-badge clubs (modern circular crests); everyone else gets a shield. */
const ROUNDEL_IDS = new Set(['man_city', 'psg', 'man_sky', 'paris_etoile', 'napoli_azzurri', 'naples_azzurri']);

export function crestPatternFor(clubId: string): CrestPattern {
  if (ROUNDEL_IDS.has(clubId)) return 'ROUNDEL';
  const patterns: CrestPattern[] = ['STRIPES', 'SASH', 'HOOPS', 'CHIEF', 'HALVES'];
  return patterns[hashCode(clubId) % patterns.length]!;
}

function PatternFill({ pattern, primary, secondary, uid }: { pattern: CrestPattern; primary: string; secondary: string; uid: string }) {
  switch (pattern) {
    case 'STRIPES':
      return (<><rect width={100} height={110} fill={primary} />{[0, 2, 4].map((i) => (<rect key={i} x={8 + i * 17} y={0} width={8.5} height={110} fill={secondary} opacity={0.92} />))}</>);
    case 'SASH':
      return (<><rect width={100} height={110} fill={primary} /><polygon points="0,78 100,8 100,34 0,104" fill={secondary} opacity={0.92} /></>);
    case 'HOOPS':
      return (<><rect width={100} height={110} fill={primary} />{[0, 2].map((i) => (<rect key={i} x={0} y={16 + i * 34} width={100} height={15} fill={secondary} opacity={0.92} />))}</>);
    case 'CHIEF':
      return (<><rect width={100} height={110} fill={primary} /><rect width={100} height={30} fill={secondary} opacity={0.95} /></>);
    case 'HALVES':
      return (<><rect width={50} height={110} fill={primary} /><rect x={50} width={50} height={110} fill={secondary} /><rect width={100} height={110} fill="none" /></>);
    default:
      return (<rect width={100} height={110} fill={primary} />);
  }

  void uid;
}

export function ClubCrestArt({
  clubId, primary, secondary, abbr, name, size = 34,
}: {
  clubId: string;
  primary: string;
  secondary: string;
  abbr: string;
  name?: string;
  size?: number;
}) {
  const pattern = crestPatternFor(clubId);
  const uid = `crest-${clubId.replace(/[^a-z0-9]/gi, '')}`;
  const inkOnPrimary = '#ffffff';
  const label = name ?? abbr;

  if (pattern === 'ROUNDEL') {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label} crest`} style={{ display: 'block', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.45))' }}>
        <circle cx={50} cy={50} r={46} fill={primary} stroke="#d8b45a" strokeWidth={3.5} />
        <circle cx={50} cy={50} r={37} fill="none" stroke={secondary} strokeWidth={2} opacity={0.9} />
        <circle cx={50} cy={41} r={10.5} fill={secondary} />
        <polygon points="50,33.5 53,38.8 47,38.8" fill={primary} />
        <polygon points="42.5,44.5 47.5,40.5 47,47" fill={primary} opacity={0.85} />
        <polygon points="57.5,44.5 52.5,40.5 53,47" fill={primary} opacity={0.85} />
        <text x={50} y={76} textAnchor="middle" fontFamily="'Barlow Condensed', sans-serif" fontWeight={700} fontSize={21} letterSpacing={1} fill={inkOnPrimary} style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
          {abbr}
        </text>
      </svg>
    );
  }

  const darkText = pattern === 'CHIEF' || pattern === 'HALVES';
  return (
    <svg viewBox="0 0 100 110" width={size} height={size * 1.1} role="img" aria-label={`${label} crest`} style={{ display: 'block', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.45))' }}>
      <defs>
        <clipPath id={uid}><path d={SHIELD_PATH} /></clipPath>
      </defs>
      <g clipPath={`url(#${uid})`}>
        <PatternFill pattern={pattern} primary={primary} secondary={secondary} uid={uid} />
      </g>
      <path d={SHIELD_PATH} fill="none" stroke="#d8b45a" strokeWidth={3.2} />
      <path d={SHIELD_PATH} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={7} opacity={0.25} transform="translate(0 1.5)" />
      {/* ball motif */}
      <circle cx={50} cy={pattern === 'CHIEF' ? 52 : 40} r={11} fill="#f8fafc" stroke="rgba(0,0,0,0.45)" strokeWidth={1.2} />
      <polygon points="50,33.5 54.5,38.5 52.8,44.5 47.2,44.5 45.5,38.5" fill="#111827" transform={pattern === 'CHIEF' ? 'translate(0 12)' : undefined} />
      <text
        x={50}
        y={pattern === 'CHIEF' ? 88 : 76}
        textAnchor="middle"
        fontFamily="'Barlow Condensed', sans-serif"
        fontWeight={700}
        fontSize={23}
        letterSpacing={1}
        fill={darkText ? '#ffffff' : secondary}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={0.7}
      >
        {abbr}
      </text>
    </svg>
  );
}
