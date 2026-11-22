// Striker FC — ui/components/FlagArt.tsx
// FC Mobile skin pass: real national FLAG artwork (inline SVG, fully
// offline — no external image URLs, so the APK works without a network).
// Simplified-but-accurate flag designs for every nation in the database;
// unknown codes fall back to a bicolour in the nation's kit colours.

import { NATIONS } from '../../data/RealPlayers';

const W = 60;
const H = 40;

function star(cx: number, cy: number, r: number, fill: string, key?: string) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return <polygon key={key} points={pts.join(' ')} fill={fill} />;
}

function cross(cx: number, cy: number, armW: number, len: number, fill: string, key?: string) {
  return (
    <g key={key} fill={fill}>
      <rect x={cx - armW / 2} y={cy - len} width={armW} height={len * 2} />
      <rect x={cx - len} y={cy - armW / 2} width={len * 2} height={armW} />
    </g>
  );
}

function FlagDesign({ code }: { code: string }) {
  switch (code) {
    case 'AR':
      return (<><rect width={W} height={H / 3} fill="#75aadb" /><rect y={H / 3} width={W} height={H / 3} fill="#fff" /><rect y={(2 * H) / 3} width={W} height={H / 3} fill="#75aadb" /><circle cx={30} cy={20} r={4.6} fill="#f6b40e" stroke="#d99a06" strokeWidth={0.8} /></>);
    case 'PT':
      return (<><rect width={24} height={H} fill="#046a38" /><rect x={24} width={36} height={H} fill="#da291c" /><circle cx={24} cy={20} r={6.4} fill="#ffe900" /><circle cx={24} cy={20} r={4} fill="#da291c" /></>);
    case 'FR':
      return (<><rect width={20} height={H} fill="#0055a4" /><rect x={20} width={20} height={H} fill="#fff" /><rect x={40} width={20} height={H} fill="#ef4135" /></>);
    case 'BR':
      return (<><rect width={W} height={H} fill="#009739" /><polygon points="30,4 56,20 30,36 4,20" fill="#fedD00" /><circle cx={30} cy={20} r={7.4} fill="#012169" /><path d="M 23.4 17.4 A 8 8 0 0 1 36.6 22.6" stroke="#fff" strokeWidth={1.6} fill="none" /></>);
    case 'GB':
      return (<><rect width={W} height={H} fill="#fff" /><rect x={26} width={8} height={H} fill="#ce1124" /><rect y={16} width={W} height={8} fill="#ce1124" /></>);
    case 'ES':
      return (<><rect width={W} height={10} fill="#aa151b" /><rect y={10} width={W} height={20} fill="#f1bf00" /><rect y={30} width={W} height={10} fill="#aa151b" /><rect x={13} y={15} width={6} height={10} fill="#aa151b" stroke="#f1bf00" strokeWidth={0.8} /></>);
    case 'DE':
      return (<><rect width={W} height={H / 3} fill="#000" /><rect y={H / 3} width={W} height={H / 3} fill="#dd0000" /><rect y={(2 * H) / 3} width={W} height={H / 3} fill="#ffcc00" /></>);
    case 'IT':
      return (<><rect width={20} height={H} fill="#009246" /><rect x={20} width={20} height={H} fill="#fff" /><rect x={40} width={20} height={H} fill="#ce2b37" /></>);
    case 'NL':
      return (<><rect width={W} height={H / 3} fill="#ae1c28" /><rect y={H / 3} width={W} height={H / 3} fill="#fff" /><rect y={(2 * H) / 3} width={W} height={H / 3} fill="#21468b" /></>);
    case 'BE':
      return (<><rect width={20} height={H} fill="#000" /><rect x={20} width={20} height={H} fill="#fdda24" /><rect x={40} width={20} height={H} fill="#ef3340" /></>);
    case 'NO':
      return (<><rect width={W} height={H} fill="#ba0c2f" /><rect x={14} width={10} height={H} fill="#fff" /><rect y={15} width={W} height={10} fill="#fff" /><rect x={16.5} width={5} height={H} fill="#00205b" /><rect y={17.5} width={W} height={5} fill="#00205b" /></>);
    case 'EG':
      return (<><rect width={W} height={H / 3} fill="#ce1126" /><rect y={H / 3} width={W} height={H / 3} fill="#fff" /><rect y={(2 * H) / 3} width={W} height={H / 3} fill="#000" /><rect x={26} y={16.5} width={8} height={7} fill="#c09300" /></>);
    case 'KR':
      return (<><rect width={W} height={H} fill="#fff" /><path d="M 30 12.5 A 7.5 7.5 0 0 1 30 27.5 Z" fill="#cd2e3a" /><path d="M 30 12.5 A 7.5 7.5 0 0 0 30 27.5 Z" fill="#0047a0" /><circle cx={30} cy={16.2} r={3.7} fill="#cd2e3a" /><circle cx={30} cy={23.8} r={3.7} fill="#0047a0" /><g fill="#000"><rect x={7} y={6} width={9} height={1.8} /><rect x={7} y={9.4} width={9} height={1.8} /><rect x={44} y={6} width={9} height={1.8} /><rect x={44} y={28.8} width={9} height={1.8} /><rect x={7} y={28.8} width={9} height={1.8} /></g></>);
    case 'JP':
      return (<><rect width={W} height={H} fill="#fff" /><circle cx={30} cy={20} r={8} fill="#bc002d" /></>);
    case 'US':
      return (<><rect width={W} height={H} fill="#fff" />{[0, 2, 4, 6, 8, 10, 12].map((i) => (<rect key={i} y={(i * H) / 13} width={W} height={H / 13} fill="#b22234" />))}<rect width={27} height={(7 * H) / 13} fill="#3c3b6e" /><g fill="#fff">{[4, 10, 16, 22].map((x) => [4, 9, 14, 19].map((y) => (<circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} />)))}</g></>);
    case 'MX':
      return (<><rect width={20} height={H} fill="#006847" /><rect x={20} width={20} height={H} fill="#fff" /><rect x={40} width={20} height={H} fill="#ce1126" /><circle cx={30} cy={20} r={4.4} fill="#8a6d1d" /><circle cx={30} cy={20} r={2.6} fill="#006847" /></>);
    case 'MA':
      return (<><rect width={W} height={H} fill="#c1272d" /><polygon points="30,13.5 32.1,18.6 37.6,18.8 33.3,22.2 34.8,27.5 30,24.4 25.2,27.5 26.7,22.2 22.4,18.8 27.9,18.6" fill="none" stroke="#006233" strokeWidth={1.7} /></>);
    case 'HR':
      return (<><rect width={W} height={H / 3} fill="#e8112d" /><rect y={H / 3} width={W} height={H / 3} fill="#fff" /><rect y={(2 * H) / 3} width={W} height={H / 3} fill="#0c4076" /><g><rect x={26} y={14} width={8} height={12} fill="#fff" stroke="#999" strokeWidth={0.5} /><rect x={26} y={14} width={4} height={4} fill="#e8112d" /><rect x={30} y={18} width={4} height={4} fill="#e8112d" /><rect x={26} y={22} width={4} height={4} fill="#e8112d" /></g></>);
    case 'UY':
      return (<><rect width={W} height={H} fill="#fff" />{[1, 3, 5, 7].map((i) => (<rect key={i} y={(i * H) / 9} width={W} height={H / 9} fill="#0038a8" />))}<rect width={24} height={(5 * H) / 9} fill="#fff" /><circle cx={12} cy={11} r={4.6} fill="#fcd116" stroke="#d99a06" strokeWidth={0.7} /></>);
    case 'BD':
      return (<><rect width={W} height={H} fill="#006a4e" /><circle cx={27} cy={20} r={9} fill="#f42a41" /></>);
    case 'PL':
      return (<><rect width={W} height={20} fill="#fff" /><rect y={20} width={W} height={20} fill="#dc143c" /></>);
    case 'SN':
      return (<><rect width={20} height={H} fill="#00853f" /><rect x={20} width={20} height={H} fill="#fdef42" /><rect x={40} width={20} height={H} fill="#e31b23" />{star(30, 20, 4.6, '#00853f')}</>);
    case 'CH':
      return (<><rect width={W} height={H} fill="#da291c" />{cross(30, 20, 6.4, 10.5, '#fff')}</>);
    case 'DK':
      return (<><rect width={W} height={H} fill="#c8102e" /><rect x={16} width={6} height={H} fill="#fff" /><rect y={17} width={W} height={6} fill="#fff" /></>);
    case 'TR':
      return (<><rect width={W} height={H} fill="#e30a17" /><circle cx={25} cy={20} r={8.6} fill="#fff" /><circle cx={27.4} cy={20} r={6.9} fill="#e30a17" />{star(36.5, 20, 4.6, '#fff')}</>);
    case 'CO':
      return (<><rect width={W} height={20} fill="#fcd116" /><rect y={20} width={W} height={10} fill="#003893" /><rect y={30} width={W} height={10} fill="#ce1126" /></>);
    case 'NG':
      return (<><rect width={20} height={H} fill="#008751" /><rect x={20} width={20} height={H} fill="#fff" /><rect x={40} width={20} height={H} fill="#008751" /></>);
    case 'GH':
      return (<><rect width={W} height={H / 3} fill="#ce1126" /><rect y={H / 3} width={W} height={H / 3} fill="#fcd116" /><rect y={(2 * H) / 3} width={W} height={H / 3} fill="#006b3f" />{star(30, 20, 5.4, '#000')}</>);
    case 'CM':
      return (<><rect width={20} height={H} fill="#007a5e" /><rect x={20} width={20} height={H} fill="#ce1126" /><rect x={40} width={20} height={H} fill="#fcd116" />{star(30, 20, 4.4, '#007a5e')}</>);
    case 'SA':
      return (<><rect width={W} height={H} fill="#165d31" /><rect x={10} y={13} width={40} height={4.6} rx={2.3} fill="#fff" /><rect x={12} y={25} width={36} height={2.2} fill="#fff" /></>);
    case 'AU':
      return (<><rect width={W} height={H} fill="#00247d" /><rect width={30} height={20} fill="#012169" /><path d="M0 0 L30 20 M30 0 L0 20" stroke="#fff" strokeWidth={3.4} /><path d="M0 0 L30 20 M30 0 L0 20" stroke="#c8102e" strokeWidth={1.4} /><rect x={13} width={4} height={20} fill="#fff" /><rect y={8.5} width={30} height={3.4} fill="#fff" /><rect x={14} width={2} height={20} fill="#c8102e" /><rect y={9.3} width={30} height={1.8} fill="#c8102e" /><g fill="#fff">{star(15, 30, 3.6, '#fff', 'a')}{star(44, 10, 2.6, '#fff', 'b')}{star(50, 22, 2.2, '#fff', 'c')}{star(42, 30, 2.2, '#fff', 'd')}{star(52, 33, 1.8, '#fff', 'e')}</g></>);
    case 'CA':
      return (<><rect width={15} height={H} fill="#d80621" /><rect x={15} width={30} height={H} fill="#fff" /><rect x={45} width={15} height={H} fill="#d80621" /><path d="M30 9 L32.6 15.4 L37 13.6 L34.9 18.6 L39.4 18.4 L34.4 22.6 L36.8 25.4 L32.4 25 L31.6 31 L28.4 31 L27.6 25 L23.2 25.4 L25.6 22.6 L20.6 18.4 L25.1 18.6 L23 13.6 L27.4 15.4 Z" fill="#d80621" /></>);
    case 'RU':
      return (<><rect width={W} height={H / 3} fill="#fff" /><rect y={H / 3} width={W} height={H / 3} fill="#0039a6" /><rect y={(2 * H) / 3} width={W} height={H / 3} fill="#d52b1e" /></>);
    case 'UA':
      return (<><rect width={W} height={20} fill="#005bbb" /><rect y={20} width={W} height={20} fill="#ffd500" /></>);
    case 'AT':
      return (<><rect width={W} height={H / 3} fill="#ed2939" /><rect y={H / 3} width={W} height={H / 3} fill="#fff" /><rect y={(2 * H) / 3} width={W} height={H / 3} fill="#ed2939" /></>);
    case 'RS':
      return (<><rect width={W} height={H / 3} fill="#c6363c" /><rect y={H / 3} width={W} height={H / 3} fill="#0c4076" /><rect y={(2 * H) / 3} width={W} height={H / 3} fill="#fff" /></>);
    case 'PY':
      return (<><rect width={W} height={H / 3} fill="#d52b1e" /><rect y={H / 3} width={W} height={H / 3} fill="#fff" /><rect y={(2 * H) / 3} width={W} height={H / 3} fill="#0038a8" /><circle cx={30} cy={20} r={4} fill="none" stroke="#009b77" strokeWidth={1.6} /></>);
    case 'CL':
      return (<><rect width={W} height={20} fill="#fff" /><rect y={20} width={W} height={20} fill="#d52b1e" /><rect width={22} height={20} fill="#0039a6" />{star(11, 10, 4.4, '#fff')}</>);
    case 'IN':
      return (<><rect width={W} height={H / 3} fill="#ff9932" /><rect y={H / 3} width={W} height={H / 3} fill="#fff" /><rect y={(2 * H) / 3} width={W} height={H / 3} fill="#138808" /><circle cx={30} cy={20} r={4.6} fill="none" stroke="#000080" strokeWidth={1.6} /></>);
    case 'DZ':
      return (<><rect width={30} height={H} fill="#006233" /><rect x={30} width={30} height={H} fill="#fff" /><circle cx={30} cy={20} r={7} fill="#d21034" /><circle cx={31.8} cy={20} r={5.6} fill="#fff" /><circle cx={30.4} cy={20} r={5.2} fill="#fff" />{star(33.4, 20, 3.6, '#d21034')}</>);
    case 'CI':
      return (<><rect width={20} height={H} fill="#f77f00" /><rect x={20} width={20} height={H} fill="#fff" /><rect x={40} width={20} height={H} fill="#009e60" /></>);
    case 'SE':
      return (<><rect width={W} height={H} fill="#006aa7" /><rect x={16} width={6} height={H} fill="#fecc00" /><rect y={17} width={W} height={6} fill="#fecc00" /></>);
    case 'GR':
      return (<><rect width={W} height={H} fill="#fff" />{[0, 2, 4, 6, 8].map((i) => (<rect key={i} y={(i * H) / 9} width={W} height={H / 9} fill="#0d5eaf" />))}<rect width={22} height={(5 * H) / 9} fill="#0d5eaf" /><rect x={9} width={4} height={(5 * H) / 9} fill="#fff" /><rect y={(2 * H) / 9} width={22} height={H / 9} fill="#fff" /></>);
    default: {
      const nation = NATIONS.find((n) => n.code === code);
      const p = nation?.primary ?? '#334155';
      const s = nation?.secondary ?? '#f8fafc';
      return (<><rect width={W} height={20} fill={p} /><rect y={20} width={W} height={20} fill={s} /></>);
    }
  }
}

export function FlagArt({
  code, width = 30, className,
}: {
  code: string;
  width?: number;
  className?: string;
}) {
  const nation = NATIONS.find((n) => n.code === code);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={width}
      role="img"
      aria-label={`${nation?.name ?? code} flag`}
      className={className}
      style={{ borderRadius: 2, boxShadow: '0 0 0 1px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.4)', display: 'block', height: 'auto' }}
    >
      <FlagDesign code={code} />
    </svg>
  );
}
