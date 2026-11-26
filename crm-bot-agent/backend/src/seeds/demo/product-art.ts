/** Ilustraciones de producto (SVG) para los datos de demostración: degradado vivo + icono blanco. Sin recursos externos. */
const PAL: [string, string][] = [['#fb7185', '#e11d48'], ['#fbbf24', '#d97706'], ['#22d3ee', '#0e7490'], ['#a78bfa', '#6d28d9'], ['#34d399', '#047857'], ['#60a5fa', '#1d4ed8'], ['#f472b6', '#be185d'], ['#fb923c', '#c2410c']];
const W = '#ffffff', SH = 'rgba(0,0,0,.16)';
const star = (x: number, y: number, r: number) => `<path d="M${x},${y - r} Q${x},${y} ${x + r},${y} Q${x},${y} ${x},${y + r} Q${x},${y} ${x - r},${y} Q${x},${y} ${x},${y - r}Z" fill="${W}"/>`;
const TOOTH = `<path d="M0,-130 Q-80,-175 -130,-120 Q-175,-60 -120,40 Q-100,170 -50,170 Q-12,170 -5,70 Q0,40 5,70 Q12,170 50,170 Q100,170 120,40 Q175,-60 130,-120 Q80,-175 0,-130Z" fill="${W}"/><path d="M-85,-95 Q-40,-120 -10,-100" stroke="${SH}" stroke-width="12" fill="none" stroke-linecap="round"/>`;

const ICONS: Record<string, string> = {
  shirt: `<path d="M-90,-170 L-45,-185 Q0,-150 45,-185 L90,-170 L190,-90 L140,-40 L100,-70 L100,170 L-100,170 L-100,-70 L-140,-40 L-190,-90Z" fill="${W}"/><path d="M-45,-185 Q0,-150 45,-185 Q0,-118 -45,-185Z" fill="${SH}"/>`,
  pants: `<path d="M-95,-170 H95 L112,175 H26 L0,-20 L-26,175 H-112Z" fill="${W}"/><rect x="-95" y="-170" width="190" height="30" fill="${SH}"/><path d="M0,-140 V-20" stroke="${SH}" stroke-width="8"/>`,
  dress: `<path d="M-45,-175 H45 L55,-90 Q130,-40 150,175 H-150 Q-130,-40 -55,-90Z" fill="${W}"/><path d="M-55,-90 Q0,-70 55,-90 L58,-62 Q0,-42 -58,-62Z" fill="${SH}"/>`,
  jacket: `<path d="M-100,-165 L-45,-185 L0,-140 L45,-185 L100,-165 L185,100 L135,115 L105,0 L105,175 H-105 L-105,0 L-135,115 L-185,100Z" fill="${W}"/><path d="M0,-140 V175" stroke="${SH}" stroke-width="10"/><rect x="-80" y="60" width="50" height="14" rx="7" fill="${SH}"/><rect x="30" y="60" width="50" height="14" rx="7" fill="${SH}"/>`,
  shoe: `<path d="M-200,60 Q-200,-40 -110,-60 L-40,-10 Q40,0 110,30 Q200,50 200,110 Q200,140 170,140 H-170 Q-200,140 -200,60Z" fill="${W}"/><path d="M-205,140 H205 V158 Q205,172 190,172 H-190 Q-205,172 -205,158Z" fill="${SH}"/><path d="M-60,-30 L-20,10 M-30,-45 L10,0 M0,-55 L40,-10" stroke="${SH}" stroke-width="9" stroke-linecap="round"/>`,
  cap: `<path d="M-150,70 Q-150,-110 0,-110 Q150,-110 150,70Z" fill="${W}"/><path d="M130,55 Q230,60 250,95 Q170,118 120,100Z" fill="${SH}"/><circle cx="0" cy="-112" r="13" fill="${SH}"/><path d="M0,-110 V70" stroke="${SH}" stroke-width="8"/>`,
  belt: `<rect x="-210" y="-34" width="420" height="68" rx="14" fill="${W}"/><rect x="62" y="-72" width="84" height="144" rx="12" fill="none" stroke="${W}" stroke-width="20"/><path d="M104,-6 H190" stroke="${SH}" stroke-width="10" stroke-linecap="round"/>${[-150, -110, -70, -30].map(x => `<circle cx="${x}" cy="0" r="8" fill="${SH}"/>`).join('')}`,
  bag: `<path d="M-140,-60 H140 L168,175 H-168Z" fill="${W}"/><path d="M-72,-60 Q-72,-175 0,-175 Q72,-175 72,-60" stroke="${W}" stroke-width="22" fill="none"/><rect x="-60" y="30" width="120" height="70" rx="12" fill="${SH}"/>`,
  socks: `<path d="M-60,-170 H20 V30 Q20 100 -30 125 L-120 165 Q-160 178 -160 138 Q-160 108 -120 93 L-60 55Z" fill="${W}"/><path d="M60,-150 H140 V50 Q140 120 90 145 L0 185 Q-40 198 -40 158 Q-40 128 0 113 L60 75Z" fill="${W}" opacity=".78"/><rect x="-60" y="-170" width="80" height="26" fill="${SH}"/>`,
  scarf: `<path d="M-200,-90 Q-100,-145 0,-90 T200,-90 V-5 Q100,50 0,-5 T-200,-5Z" fill="${W}"/><path d="M60,-8 V175 H150 V10Z" fill="${W}"/><path d="M-170,-60 Q-100,-100 -30,-60 M30,-60 Q100,-100 170,-60" stroke="${SH}" stroke-width="9" fill="none"/>`,
  gift: `<rect x="-150" y="-15" width="300" height="185" rx="10" fill="${W}"/><rect x="-168" y="-70" width="336" height="58" rx="10" fill="${W}"/><rect x="-22" y="-70" width="44" height="240" fill="${SH}"/><ellipse cx="-50" cy="-98" rx="48" ry="30" fill="${W}" transform="rotate(-20 -50 -98)"/><ellipse cx="50" cy="-98" rx="48" ry="30" fill="${W}" transform="rotate(20 50 -98)"/><circle cx="0" cy="-92" r="18" fill="${SH}"/>`,
  tooth: TOOTH,
  'tooth-sparkle': `${TOOTH}${star(170, -150, 34)}${star(-190, -60, 22)}${star(200, 10, 16)}`,
  'tooth-rays': `${TOOTH}${[-75, -45, -15, 15, 45, 75].map(a => `<path d="M0,-190 L0,-230" stroke="${W}" stroke-width="12" stroke-linecap="round" transform="rotate(${a} 0 20)"/>`).join('')}`,
  'tooth-braces': `${TOOTH}<path d="M-125,-30 H125" stroke="${SH}" stroke-width="10"/><rect x="-100" y="-52" width="44" height="44" rx="9" fill="${SH}"/><rect x="56" y="-52" width="44" height="44" rx="9" fill="${SH}"/>`,
  'tooth-filling': `${TOOTH}<circle cx="-48" cy="-35" r="26" fill="${SH}"/><circle cx="-48" cy="-35" r="12" fill="${W}" opacity=".55"/>`,
  'tooth-out': `${TOOTH}<path d="M0,-215 V-175 M-26,-195 L0,-220 L26,-195" stroke="${W}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  xray: `<rect x="-200" y="-130" width="400" height="260" rx="22" fill="${SH}" stroke="${W}" stroke-width="12"/><path d="M-150,40 Q-150,-70 0,-70 Q150,-70 150,40" stroke="${W}" stroke-width="22" fill="none" stroke-linecap="round"/>${[-120, -80, -40, 0, 40, 80, 120].map(x => `<rect x="${x - 12}" y="${-62 + Math.abs(x) / 10}" width="24" height="46" rx="10" fill="${W}"/>`).join('')}`,
  kit: `<rect x="-160" y="-95" width="320" height="250" rx="22" fill="${W}"/><rect x="-160" y="-95" width="320" height="60" rx="22" fill="${SH}"/><g transform="translate(0 35) scale(.42)">${TOOTH.replace(new RegExp(W, 'g'), '#0e7490')}</g>${star(115, -5, 18)}`,
  toothbrush: `<g transform="rotate(-32)"><rect x="-210" y="-18" width="310" height="36" rx="18" fill="${W}"/><rect x="92" y="-34" width="118" height="68" rx="14" fill="${W}"/>${[104, 126, 148, 170, 192].map(x => `<rect x="${x}" y="-68" width="12" height="38" rx="6" fill="${W}"/>`).join('')}<rect x="-150" y="-8" width="110" height="16" rx="8" fill="${SH}"/></g>`,
  floss: `<circle cx="-20" cy="0" r="130" fill="${W}"/><circle cx="-20" cy="0" r="46" fill="${SH}"/><circle cx="-20" cy="0" r="100" fill="none" stroke="${SH}" stroke-width="8"/><path d="M105,15 Q190,40 205,125" stroke="${W}" stroke-width="10" fill="none" stroke-linecap="round"/>`,
  mouthwash: `<path d="M-60,-165 H60 V-120 L100,-88 V170 Q100,186 84,186 H-84 Q-100,186 -100,170 V-88 L-60,-120Z" fill="${W}"/><rect x="-48" y="-208" width="96" height="46" rx="10" fill="${SH}"/><rect x="-100" y="-20" width="200" height="90" fill="${SH}"/><path d="M-60,25 Q-20,5 20,25 T60,25" stroke="${W}" stroke-width="9" fill="none"/>`,
  toothpaste: `<path d="M-200,-62 L110,-88 Q155,-91 155,-50 V50 Q155,91 110,88 L-200,62Z" fill="${W}"/><path d="M155,-36 H208 V36 H155Z" fill="${SH}"/><path d="M-200,-62 L-170,-60 V60 L-200,62Z" fill="${SH}"/><path d="M-120,0 Q-70,-28 -20,0 T80,0" stroke="${SH}" stroke-width="12" fill="none" stroke-linecap="round"/>`,
  mouthguard: `<path d="M-150,70 Q-150,-110 0,-110 Q150,-110 150,70" stroke="${W}" stroke-width="72" fill="none" stroke-linecap="round"/><path d="M-110,60 Q-110,-70 0,-70 Q110,-70 110,60" stroke="${SH}" stroke-width="10" fill="none" stroke-linecap="round"/>`,
};

const KIND: Record<string, string> = {
  'CAM-001': 'shirt', 'CAM-002': 'shirt', 'PAN-001': 'pants', 'VES-001': 'dress', 'CHA-001': 'jacket', 'ZAP-001': 'shoe', 'ACC-001': 'cap', 'ACC-002': 'belt', 'ACC-003': 'bag', 'ACC-004': 'socks', 'ACC-005': 'scarf', 'GIF-001': 'gift',
  'SRV-001': 'tooth-sparkle', 'SRV-002': 'tooth-rays', 'SRV-003': 'tooth-braces', 'SRV-004': 'tooth-filling', 'SRV-005': 'tooth-out', 'SRV-006': 'xray',
  'PRD-001': 'kit', 'PRD-002': 'toothbrush', 'PRD-003': 'floss', 'PRD-004': 'mouthwash', 'PRD-005': 'toothpaste', 'PRD-006': 'mouthguard',
};

export function renderArt(sku: string, index: number): string {
  const [a, b] = PAL[index % PAL.length]!;
  const icon = ICONS[KIND[sku] ?? 'gift']!;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<radialGradient id="h" cx=".3" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#000" flood-opacity=".28"/></filter></defs>
<rect width="960" height="720" fill="url(#g)"/><rect width="960" height="720" fill="url(#h)"/>
<circle cx="800" cy="120" r="170" fill="#fff" opacity=".1"/><circle cx="130" cy="640" r="210" fill="#000" opacity=".08"/>
<ellipse cx="480" cy="585" rx="230" ry="26" fill="#000" opacity=".22"/>
<g transform="translate(480 330) scale(1.12)" filter="url(#s)">${icon}</g></svg>`;
}
