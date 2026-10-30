/*
 * Tema de Halloween (mesmo visual do Apex BI), adaptado ao layout da intranet.
 * Pecas em SVG; animacoes e cores globais em styles/tema-festivo.css.
 * Tudo com pointer-events-none e aria-hidden: enfeite nunca cobre clique nem e lido pelo leitor de tela.
 */
import type { CSSProperties } from 'react';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

/* ───────────── Pecas (SVG) ───────────── */

export function Pumpkin({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 64 64" className={className} style={style} aria-hidden="true">
      <path d="M31 14c0-5 2-8 6-10l2 3c-3 1-4 4-4 7z" fill="#3f7d2a" />
      <path d="M36 9c4-2 8-1 10 2-4 0-7 1-9 3z" fill="#5a9b3a" />
      <ellipse cx="20" cy="38" rx="14" ry="19" fill="#d9560f" />
      <ellipse cx="44" cy="38" rx="14" ry="19" fill="#d9560f" />
      <ellipse cx="32" cy="38" rx="13" ry="21" fill="#f2761c" />
      <path d="M20 31l6 5h-9z M44 31l-6 5h9z" fill="#2b1203" />
      <path d="M19 44c4 6 22 6 26 0l-4 1-3 3-3-3-3 3-3-3-3 3-3-3z" fill="#2b1203" />
      <path d="M20 31l6 5h-9z M44 31l-6 5h9z" fill="#ffb347" opacity="0.35" className="festivo-glow" />
      <ellipse cx="27" cy="27" rx="4" ry="7" fill="#ffffff" opacity="0.12" />
    </svg>
  );
}

export function Bat({ className, flap = true }: { className?: string; flap?: boolean }) {
  return (
    <svg viewBox="0 0 64 32" className={className} aria-hidden="true">
      <g className={flap ? 'festivo-flap' : undefined}>
        <path
          d="M32 10c2-3 3-3 4 0 2-1 3 0 3 2 6-6 15-8 23-5-5 1-8 5-8 9-3-2-7-1-9 2-1-2-4-3-6-2-1 3-3 6-7 8-4-2-6-5-7-8-2-1-5 0-6 2-2-3-6-4-9-2 0-4-3-8-8-9 8-3 17-1 23 5 0-2 1-3 3-2 1-3 2-3 4 0z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function Ghost({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 56" className={className} aria-hidden="true">
      <path d="M24 2C12 2 4 11 4 23v29l6-5 5 5 5-5 4 5 4-5 5 5 5-5 6 5V23C44 11 36 2 24 2z" fill="currentColor" />
      <ellipse cx="17" cy="22" rx="3" ry="4.5" fill="#1b1030" />
      <ellipse cx="31" cy="22" rx="3" ry="4.5" fill="#1b1030" />
      <ellipse cx="24" cy="33" rx="4" ry="3" fill="#1b1030" />
    </svg>
  );
}

export function WitchHat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden="true">
      <path d="M30 2c-6 10-10 22-12 32h28C42 26 40 18 44 10c-5 1-10-3-14-8z" fill="#2a1840" />
      <ellipse cx="32" cy="36" rx="30" ry="7" fill="#1f1030" />
      <path d="M19 30h26l1 5H18z" fill="#f2761c" />
      <rect x="28" y="29" width="7" height="7" rx="1" fill="none" stroke="#ffd166" strokeWidth="1.6" />
    </svg>
  );
}

export function Candy({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 24" className={className} aria-hidden="true">
      <path d="M2 4l12 8-12 8z M46 4l-12 8 12 8z" fill="#8b5cf6" />
      <ellipse cx="24" cy="12" rx="11" ry="8" fill="#f2761c" />
      <path
        d="M17 6c3 4 3 8 0 12 M24 4c3 5 3 11 0 16 M31 6c3 4 3 8 0 12"
        stroke="#fff"
        strokeWidth="1.4"
        fill="none"
        opacity="0.6"
      />
    </svg>
  );
}

export function Tombstone({ className, label = 'RIP' }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 48 56" className={className} aria-hidden="true">
      <path d="M6 56V22C6 11 14 4 24 4s18 7 18 18v34z" fill="currentColor" />
      <text x="24" y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#00000055" fontFamily="serif">
        {label}
      </text>
      <path d="M0 56c8-5 40-5 48 0z" fill="#3f7d2a" opacity="0.7" />
    </svg>
  );
}

export function Moon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <defs>
        <radialGradient id="festivo-lua" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fff6d6" />
          <stop offset="100%" stopColor="#f3c969" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="#f3c969" opacity="0.15" />
      <circle cx="50" cy="50" r="34" fill="url(#festivo-lua)" />
      <circle cx="40" cy="42" r="5" fill="#e0b14f" opacity="0.6" />
      <circle cx="58" cy="60" r="7" fill="#e0b14f" opacity="0.5" />
      <circle cx="60" cy="38" r="3" fill="#e0b14f" opacity="0.6" />
    </svg>
  );
}

/** Bruxa na vassoura (silhueta). */
export function WitchOnBroom({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" className={className} aria-hidden="true">
      <path d="M4 44 L84 34" stroke="#7a4a1f" strokeWidth="3" strokeLinecap="round" />
      <path d="M84 30 L112 22 L114 44 L84 38 z" fill="#c98a2e" />
      <path d="M88 32 L112 26 M88 36 L113 36 M88 38 L112 42" stroke="#8a5a1a" strokeWidth="1" />
      <path d="M40 38 C42 26 50 20 58 22 C64 24 66 32 62 38 z" fill="#1f1030" />
      <path d="M44 38 L36 50 L46 46 z" fill="#1f1030" />
      <circle cx="55" cy="18" r="6" fill="#7bd389" />
      <path d="M46 14 L58 0 L62 13 z" fill="#1f1030" />
      <ellipse cx="55" cy="13" rx="12" ry="3" fill="#1f1030" />
      <path d="M50 20 C44 24 40 30 36 34" stroke="#f2761c" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M70 34 c0-5 3-8 7-8 l1-4 2 3 2-3 1 4 c3 1 4 4 4 8 z" fill="#111" />
      <circle cx="78" cy="29" r="0.9" fill="#ffd166" />
      <circle cx="81" cy="29" r="0.9" fill="#ffd166" />
    </svg>
  );
}

/** Aranha pendurada num fio (balanca). */
export function HangingSpider({ className, length = 40 }: { className?: string; length?: number }) {
  return (
    <div className={cn('festivo-swing', className)} aria-hidden="true">
      <svg viewBox={`0 0 24 ${length + 16}`} width="24" height={length + 16} fill="none" stroke="currentColor">
        <line x1="12" y1="0" x2="12" y2={length} strokeWidth="0.7" />
        <ellipse cx="12" cy={length + 5} rx="4" ry="4.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy={length} r="2.6" fill="currentColor" stroke="none" />
        <path
          d={`M8 ${length + 3}l-5-4 M8 ${length + 5}l-6 0 M8 ${length + 7}l-5 4 M16 ${length + 3}l5-4 M16 ${length + 5}l6 0 M16 ${length + 7}l5 4`}
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

/** Teia de canto (canto superior esquerdo; gire/espelhe para os outros cantos). */
export function SpiderWeb({ className }: { className?: string }) {
  const angles = [0, 15, 30, 45, 60, 75, 90];
  const rings = [22, 42, 64, 88, 112];
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.8"
    >
      {angles.map((a) => {
        const r = (a * Math.PI) / 180;
        return <line key={a} x1="0" y1="0" x2={Math.cos(r) * 120} y2={Math.sin(r) * 120} />;
      })}
      {rings.map((d) => {
        const pts = angles.map((a) => {
          const r = (a * Math.PI) / 180;
          return [Math.cos(r) * d, Math.sin(r) * d];
        });
        const path = pts.slice(1).reduce((acc, [x, y], i) => {
          const [px, py] = pts[i];
          return `${acc} Q ${((px + x) / 2) * 0.88} ${((py + y) / 2) * 0.88} ${x} ${y}`;
        }, `M ${pts[0][0]} ${pts[0][1]}`);
        return <path key={d} d={path} />;
      })}
    </svg>
  );
}

/** Varal de bandeirinhas (laranja/roxo com morcego). */
export function Garland({ className, count = 14 }: { className?: string; count?: number }) {
  const w = 1000;
  const step = w / count;
  const sag = (x: number) => 6 + Math.sin((x / w) * Math.PI) * 14;
  return (
    <svg viewBox={`0 0 ${w} 56`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d={`M0 6 Q ${w / 2} 34 ${w} 6`} stroke="#9ca3af" strokeWidth="1.2" fill="none" opacity="0.7" />
      {Array.from({ length: count }, (_, i) => {
        const x = step * i + step / 2;
        const y = sag(x);
        const color = i % 2 === 0 ? '#f2761c' : '#7c3aed';
        return (
          <g key={i}>
            <path d={`M${x - 16} ${y} L${x + 16} ${y} L${x} ${y + 26} Z`} fill={color} opacity="0.85" />
            {i % 2 === 1 && <circle cx={x} cy={y + 9} r="3" fill="#fde68a" opacity="0.8" />}
            {i % 2 === 0 && (
              <path d={`M${x - 6} ${y + 8} l3 3 3-3 3 3 3-3`} stroke="#2b1203" strokeWidth="1.4" fill="none" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ───────────── Areas da intranet ───────────── */

/** Dentro do cabecalho, atras dos itens: varal e bruxa cruzando. */
export function HalloweenHeader() {
  return (
    <div className="festivo-header" aria-hidden="true">
      <Garland className="absolute inset-x-0 top-0 h-full w-full opacity-50" />
      <div className="festivo-fly absolute left-0 top-1">
        <WitchOnBroom className="h-11 w-24 drop-shadow" />
      </div>
    </div>
  );
}

/** Saudacao no canto esquerdo do cabecalho. */
export function HalloweenSaudacao() {
  return (
    <div className="festivo-saudacao" aria-hidden="true">
      <Pumpkin className="festivo-float h-8 w-8 drop-shadow" />
      <span className="text-orange-300">Feliz Halloween!</span>
      <Candy className="h-4 w-8" />
      <Bat className="ml-2 h-4 w-8 text-violet-300/90" />
      <Ghost className="festivo-float ml-1 h-6 w-5 text-white/80" />
    </div>
  );
}

/** Chapeu de bruxa e morcego na logo do cabecalho. */
export function HalloweenLogo() {
  return (
    <div className="festivo-logo" aria-hidden="true">
      <WitchHat className="absolute -left-4 -top-3 h-8 w-10 -rotate-[18deg] drop-shadow" />
      <Bat className="absolute -right-8 top-0 h-3.5 w-7 text-violet-300/90" />
    </div>
  );
}

/** Rodape do menu lateral. */
export function HalloweenMenu() {
  return (
    <div className="festivo-menu" aria-hidden="true">
      <Pumpkin className="festivo-float h-9 w-9" />
      <Pumpkin className="h-6 w-6" style={{ opacity: 0.9 }} />
    </div>
  );
}

/** Fundo fixo da pagina: teias, lua, morcegos, fantasmas e cemiterio. */
export function HalloweenFundo({ topo = 60 }: { topo?: number }) {
  return (
    <div className="festivo-fundo" aria-hidden="true">
      {[
        ['8%', '22%'], ['22%', '12%'], ['38%', '28%'], ['55%', '16%'], ['68%', '30%'],
        ['84%', '40%'], ['14%', '62%'], ['92%', '70%'], ['48%', '46%'], ['76%', '55%']
      ].map(([left, top], i) => (
        <span
          key={i}
          className="festivo-twinkle absolute h-1 w-1 rounded-full bg-amber-300"
          style={{ left, top, animationDelay: `${(i % 5) * 0.5}s` }}
        />
      ))}

      <div className="festivo-fog absolute -bottom-10 -left-[10%] h-40 w-[120%] rounded-[50%] bg-violet-500/15 blur-3xl" />
      <div
        className="festivo-fog absolute -bottom-12 left-[10%] h-32 w-[80%] rounded-[50%] bg-orange-400/10 blur-3xl"
        style={{ animationDelay: '5s' }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60rem 30rem at 100% 100%, hsl(270 60% 45% / 0.14), transparent 70%),' +
            'radial-gradient(45rem 24rem at 0% 0%, hsl(28 92% 55% / 0.10), transparent 70%),' +
            'radial-gradient(30rem 18rem at 100% 0%, hsl(270 60% 50% / 0.08), transparent 70%)'
        }}
      />

      <div className="absolute left-0" style={{ top: topo }}>
        <SpiderWeb className="h-44 w-44 text-slate-400/40" />
      </div>
      <div className="absolute right-0" style={{ top: topo }}>
        <SpiderWeb className="h-44 w-44 -scale-x-100 text-slate-400/40" />
      </div>
      <SpiderWeb className="absolute bottom-0 left-0 h-40 w-40 -scale-y-100 text-slate-400/25" />
      <SpiderWeb className="absolute bottom-0 right-0 h-40 w-40 rotate-180 text-slate-400/25" />

      <div className="absolute left-24" style={{ top: topo }}>
        <HangingSpider className="text-slate-500/60" length={70} />
      </div>
      <div className="absolute right-28" style={{ top: topo }}>
        <HangingSpider className="text-slate-500/60" length={50} />
      </div>

      <Moon className="absolute right-16 h-24 w-24 opacity-50" style={{ top: topo + 20 }} />
      <div className="festivo-drift absolute right-48" style={{ top: topo + 40 }}>
        <Bat className="h-5 w-10 text-violet-500/40" />
      </div>
      <div className="festivo-drift absolute left-1/3" style={{ top: topo + 30, animationDelay: '2s' }}>
        <Bat className="h-4 w-8 text-violet-500/30" />
      </div>
      <div className="festivo-drift absolute right-1/3" style={{ top: topo + 90, animationDelay: '4s' }}>
        <Bat className="h-3 w-6 text-violet-500/30" />
      </div>

      <Ghost className="festivo-float absolute left-3 top-1/2 h-14 w-12 text-slate-400/25" />
      <Ghost className="festivo-float absolute right-4 top-[60%] h-12 w-10 text-slate-400/25" />

      <div className="absolute bottom-0 left-36 flex items-end gap-3 opacity-40">
        <Tombstone className="h-14 w-12 text-slate-500" />
        <Pumpkin className="h-10 w-10" />
        <Tombstone className="h-10 w-9 text-slate-500" label="" />
      </div>
      <div className="absolute bottom-0 right-44 flex items-end gap-3 opacity-40">
        <Pumpkin className="h-9 w-9" />
        <Tombstone className="h-12 w-10 text-slate-500" />
        <Candy className="mb-1 h-5 w-10" />
      </div>
    </div>
  );
}

/** Saudacao acima do formulario de login. */
export function HalloweenLoginSaudacao() {
  return (
    <div className="festivo-login-saudacao" aria-hidden="true">
      <Pumpkin className="festivo-float h-9 w-9" />
      <span className="text-orange-500">Feliz Halloween!</span>
      <Pumpkin className="festivo-float h-9 w-9" style={{ animationDelay: '1.2s' }} />
    </div>
  );
}
