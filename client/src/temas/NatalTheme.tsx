/*
 * Tema de Natal da intranet, no mesmo formato do tema de Halloween (HalloweenTheme.tsx):
 * pecas em SVG + areas (cabecalho, logo, menu, fundo, login). Animacoes em styles/tema-festivo.css.
 * Tudo com pointer-events-none e aria-hidden.
 */
import type { CSSProperties } from 'react';

const CORES_LUZES = ['#ef4444', '#22c55e', '#facc15', '#3b82f6'];

/* ───────────── Pecas (SVG) ───────────── */

export function GorroNoel({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden="true">
      <path d="M8 36 C14 18 30 6 50 8 C56 9 60 14 58 20 C52 16 44 16 40 22 C36 28 38 34 40 36 Z" fill="#c81e1e" />
      <path d="M14 34 C20 20 32 12 46 12 C38 16 30 24 26 34 Z" fill="#ffffff" opacity="0.12" />
      <rect x="4" y="32" width="42" height="10" rx="5" fill="#ffffff" />
      <circle cx="57" cy="22" r="6" fill="#ffffff" />
    </svg>
  );
}

export function Floco({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={style}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      {[0, 60, 120].map((angulo) => (
        <g key={angulo} transform={`rotate(${angulo} 12 12)`}>
          <line x1="12" y1="2" x2="12" y2="22" />
          <path d="M9 5 L12 8 L15 5 M9 19 L12 16 L15 19" />
        </g>
      ))}
    </svg>
  );
}

export function Estrela({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <path
        d="M12 1.5l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 8.7l7.1-.6z"
        fill="#facc15"
        stroke="#eab308"
        strokeWidth="0.8"
      />
    </svg>
  );
}

export function Arvore({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 48 64" className={className} style={style} aria-hidden="true">
      <rect x="21" y="52" width="6" height="10" rx="1" fill="#7c4a1e" />
      <path d="M24 6 L38 26 H10 Z" fill="#16a34a" />
      <path d="M24 16 L42 40 H6 Z" fill="#15803d" />
      <path d="M24 28 L46 54 H2 Z" fill="#166534" />
      <path d="M12 38 C20 42 30 40 38 35 M8 50 C18 54 32 52 42 47" stroke="#facc15" strokeWidth="1.2" fill="none" opacity="0.8" />
      {[
        [16, 36, '#ef4444'],
        [30, 31, '#facc15'],
        [22, 46, '#3b82f6'],
        [35, 48, '#ef4444'],
        [12, 50, '#facc15'],
        [26, 22, '#ef4444']
      ].map(([cx, cy, cor], indice) => (
        <circle
          key={indice}
          cx={cx}
          cy={cy}
          r="2.3"
          fill={String(cor)}
          className="festivo-pisca"
          style={{ animationDelay: `${indice * 0.3}s` }}
        />
      ))}
      <path
        d="M24 0.5l1.6 3.6 3.9.3-3 2.6.9 3.8L24 8.8l-3.4 2 .9-3.8-3-2.6 3.9-.3z"
        fill="#facc15"
        className="festivo-glow"
      />
    </svg>
  );
}

export function Presente({
  className,
  cor = '#dc2626',
  fita = '#facc15'
}: {
  className?: string;
  cor?: string;
  fita?: string;
}) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect x="4" y="16" width="32" height="22" rx="2" fill={cor} />
      <rect x="2" y="12" width="36" height="7" rx="1.5" fill={cor} />
      <rect x="2" y="12" width="36" height="7" rx="1.5" fill="#000000" opacity="0.12" />
      <rect x="18" y="12" width="4" height="26" fill={fita} />
      <path d="M20 12 C14 3 7 7 12 12 Z M20 12 C26 3 33 7 28 12 Z" fill={fita} />
    </svg>
  );
}

export function Bengala({ className }: { className?: string }) {
  const caminho = 'M16 46 V14 A6 6 0 0 0 4 14';
  return (
    <svg viewBox="0 0 22 48" className={className} aria-hidden="true" fill="none" strokeLinecap="round">
      <path d={caminho} stroke="#ffffff" strokeWidth="5" />
      <path d={caminho} stroke="#dc2626" strokeWidth="5" strokeDasharray="4 4" />
    </svg>
  );
}

export function BonecoNeve({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 58" className={className} aria-hidden="true">
      <circle cx="20" cy="44" r="13" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
      <circle cx="20" cy="24" r="9.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
      <rect x="12" y="3" width="16" height="10" rx="1" fill="#1f2937" />
      <rect x="9" y="12" width="22" height="3" rx="1.5" fill="#1f2937" />
      <rect x="12" y="10" width="16" height="2.5" fill="#dc2626" />
      <circle cx="16.5" cy="22" r="1.2" fill="#1f2937" />
      <circle cx="23.5" cy="22" r="1.2" fill="#1f2937" />
      <path d="M20 25 L27 26.5 L20 27.5 Z" fill="#f97316" />
      <path d="M11 31 C16 34 24 34 29 31 L29 34 C24 37 16 37 11 34 Z" fill="#dc2626" />
      <rect x="23" y="33" width="4" height="9" rx="1" fill="#dc2626" />
      <circle cx="20" cy="40" r="1.2" fill="#1f2937" />
      <circle cx="20" cy="46" r="1.2" fill="#1f2937" />
    </svg>
  );
}

/** Treno com rena (silhueta colorida), voando para a direita. */
export function Treno({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 50" className={className} aria-hidden="true">
      {/* rena */}
      <path d="M96 22 L60 22" stroke="#78350f" strokeWidth="1" />
      <ellipse cx="110" cy="26" rx="13" ry="6" fill="#8b5a2b" />
      <path d="M100 30 l-4 10 M104 31 l-1 10 M116 31 l2 10 M120 30 l5 9" stroke="#6b4423" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M120 23 C124 18 126 14 128 12 L133 14 C131 18 127 23 123 27 Z" fill="#8b5a2b" />
      <ellipse cx="132" cy="13" rx="4.5" ry="3.2" fill="#8b5a2b" />
      <circle cx="136" cy="13.5" r="1.8" fill="#ef4444" className="festivo-glow" />
      <path d="M129 10 L126 3 M127 6 L123 5 M131 10 L132 2 M131.5 6 L135 4" stroke="#5b3714" strokeWidth="1.3" strokeLinecap="round" />
      {/* treno */}
      <path d="M12 24 H50 C55 24 57 28 55 33 L52 40 H18 C11 40 8 33 12 24 Z" fill="#b91c1c" />
      <path d="M14 27 H50" stroke="#facc15" strokeWidth="1.4" />
      <path d="M6 45 H54 C58 45 60 42 60 39" stroke="#facc15" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M20 40 V45 M46 40 V45" stroke="#facc15" strokeWidth="1.6" />
      <ellipse cx="22" cy="20" rx="9" ry="8" fill="#a16207" />
      {/* Noel */}
      <circle cx="38" cy="18" r="7" fill="#dc2626" />
      <circle cx="39" cy="9" r="4" fill="#fcd5b4" />
      <path d="M35 11 C35 15 43 15 43 11 L42 14 C40 17 37 17 36 14 Z" fill="#ffffff" />
      <path d="M35 8 L41 1 L43 8 Z" fill="#dc2626" />
      <circle cx="41" cy="1.5" r="1.5" fill="#ffffff" />
      <rect x="34.5" y="7" width="9" height="2.2" rx="1.1" fill="#ffffff" />
    </svg>
  );
}

/** Pisca-pisca: fio com lampadas coloridas piscando alternado. */
export function PiscaPisca({ className, quantidade = 18 }: { className?: string; quantidade?: number }) {
  const w = 1000;
  const passo = w / quantidade;
  const curva = (x: number) => 6 + Math.sin((x / w) * Math.PI) * 14;
  return (
    <svg viewBox={`0 0 ${w} 56`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d={`M0 6 Q ${w / 2} 34 ${w} 6`} stroke="#1f2937" strokeWidth="1.4" fill="none" opacity="0.7" />
      {Array.from({ length: quantidade }, (_, i) => {
        const x = passo * i + passo / 2;
        const y = curva(x);
        const cor = CORES_LUZES[i % CORES_LUZES.length];
        return (
          <g key={i}>
            <rect x={x - 2.5} y={y} width="5" height="5" rx="1" fill="#374151" />
            <ellipse
              cx={x}
              cy={y + 12}
              rx="4.5"
              ry="8"
              fill={cor}
              className="festivo-pisca"
              style={{ animationDelay: `${(i % 4) * 0.4}s` }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ───────────── Areas da intranet ───────────── */

/** Dentro do cabecalho, atras dos itens: pisca-pisca e treno cruzando. */
export function NatalHeader() {
  return (
    <div className="festivo-header" aria-hidden="true">
      <PiscaPisca className="absolute inset-x-0 top-0 h-full w-full opacity-80" />
      <div className="festivo-fly absolute left-0 top-1">
        <Treno className="h-11 w-28 drop-shadow" />
      </div>
    </div>
  );
}

/** Saudacao no canto esquerdo do cabecalho. */
export function NatalSaudacao() {
  return (
    <div className="festivo-saudacao" aria-hidden="true">
      <Arvore className="h-9 w-7 drop-shadow" />
      <span className="text-amber-200">Feliz Natal!</span>
      <Presente className="h-6 w-6" cor="#16a34a" fita="#fde68a" />
      <Bengala className="h-6 w-3" />
      <Estrela className="festivo-twinkle ml-1 h-4 w-4" />
    </div>
  );
}

/** Gorro de Papai Noel na logo do cabecalho. */
export function NatalLogo() {
  return (
    <div className="festivo-logo" aria-hidden="true">
      <GorroNoel className="absolute -left-5 -top-3 h-8 w-10 -rotate-[18deg] drop-shadow" />
      <Floco className="festivo-twinkle absolute -right-6 top-0 h-3.5 w-3.5 text-white/90" />
    </div>
  );
}

/** Rodape do menu lateral. */
export function NatalMenu() {
  return (
    <div className="festivo-menu" aria-hidden="true">
      <Arvore className="h-12 w-9" />
      <Presente className="h-6 w-6" />
      <Presente className="h-5 w-5" cor="#16a34a" fita="#fde68a" />
    </div>
  );
}

const NEVE = Array.from({ length: 34 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  tamanho: 7 + (i % 4) * 3,
  duracao: `${10 + (i % 7) * 1.6}s`,
  // Atraso negativo: a neve ja esta caindo quando a pagina abre.
  atraso: `-${(i * 1.3) % 14}s`,
  opacidade: 0.45 + (i % 5) * 0.1
}));

/** Fundo fixo da pagina: neve caindo, brilhos, arvores, presentes e boneco de neve no rodape. */
export function NatalFundo() {
  return (
    <div className="festivo-fundo" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(55rem 28rem at 0% 100%, hsl(142 70% 30% / 0.12), transparent 70%),' +
            'radial-gradient(50rem 26rem at 100% 100%, hsl(0 72% 45% / 0.10), transparent 70%),' +
            'radial-gradient(40rem 20rem at 50% 0%, hsl(45 95% 55% / 0.10), transparent 70%)'
        }}
      />

      {NEVE.map((floco, i) => (
        <div
          key={i}
          className="festivo-neve absolute"
          style={{ left: floco.left, animationDuration: floco.duracao, animationDelay: floco.atraso }}
        >
          <Floco
            className="text-sky-300 dark:text-white"
            style={{ width: floco.tamanho, height: floco.tamanho, opacity: floco.opacidade }}
          />
        </div>
      ))}

      {[['12%', '18%'], ['30%', '10%'], ['63%', '14%'], ['82%', '22%'], ['46%', '30%']].map(([left, top], i) => (
        <Estrela
          key={i}
          className="festivo-twinkle absolute h-3 w-3"
          style={{ left, top, animationDelay: `${i * 0.5}s` }}
        />
      ))}

      {/* Monte de neve no rodape */}
      <div className="absolute -bottom-10 -left-[5%] h-24 w-[60%] rounded-[50%] bg-sky-100/80 dark:bg-white/10" />
      <div className="absolute -bottom-12 right-[-5%] h-24 w-[55%] rounded-[50%] bg-sky-100/80 dark:bg-white/10" />

      <div className="absolute bottom-0 left-28 flex items-end gap-2 opacity-60">
        <Arvore className="h-20 w-16" />
        <Presente className="h-9 w-9" />
        <Arvore className="h-14 w-11" />
        <Presente className="h-7 w-7" cor="#16a34a" fita="#fde68a" />
      </div>
      <div className="absolute bottom-0 right-40 flex items-end gap-3 opacity-60">
        <Presente className="h-8 w-8" cor="#2563eb" fita="#f8fafc" />
        <BonecoNeve className="festivo-float h-16 w-11" />
        <Arvore className="h-16 w-12" />
      </div>
    </div>
  );
}

/** Saudacao acima do formulario de login. */
export function NatalLoginSaudacao() {
  return (
    <div className="festivo-login-saudacao" aria-hidden="true">
      <Arvore className="h-10 w-8" />
      <span className="text-red-600">Feliz Natal!</span>
      <Presente className="h-8 w-8" cor="#16a34a" fita="#fde68a" />
    </div>
  );
}
