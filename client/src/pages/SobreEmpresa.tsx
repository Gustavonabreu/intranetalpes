import { useEffect, useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import mountainImage from '../assets/brand/montanha.png';
import sedeCuritiba from '../assets/brand/sede-curitiba.jpg';
import sedeSaoPaulo from '../assets/brand/sede-sao-paulo.jpg';
import sedeRio from '../assets/brand/sede-rio-de-janeiro.jpg';
import logoGrupoAlpesWhite from '../assets/brand/logo-alpes-white.png';
import { VideoFundo } from '../components/VideoFundo';
import { useNotifications } from '../notifications/NotificationsProvider';
import { legacyGetJson } from '../services/legacyApi';

const valores = [
  { nome: 'Respeito', cor: 'from-blue-500 to-blue-600' },
  { nome: 'Resiliência', cor: 'from-indigo-500 to-indigo-600' },
  { nome: 'Comprometimento', cor: 'from-cyan-500 to-cyan-600' },
  { nome: 'Empatia', cor: 'from-sky-500 to-blue-500' }
];

const sedes = [
  { cidade: 'Curitiba', estado: 'Paraná', imagem: sedeCuritiba },
  { cidade: 'São Paulo', estado: 'São Paulo', imagem: sedeSaoPaulo },
  { cidade: 'Rio de Janeiro', estado: 'Rio de Janeiro', imagem: sedeRio }
];

// Configuração padrão da animação (surge de baixo para cima com fade)
const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 50 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: 'easeOut' } }
};

// Título de seção numerado no lugar dos ícones: "01 —— MISSÃO"
function SecaoTitulo({ numero, titulo }: { numero: string; titulo: string }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <span className="text-sm font-black tabular-nums text-blue-600 dark:text-blue-400">{numero}</span>
      <span className="h-px w-12 bg-gradient-to-r from-blue-600 to-cyan-400" />
      {/* "!" porque .coluna-conteudo h2 (legado) sobrescreve cor/tamanho do Tailwind */}
      <h2 className="!m-0 !text-sm md:!text-base font-bold uppercase tracking-[0.35em] !text-slate-400 dark:!text-slate-500">
        {titulo}
      </h2>
    </div>
  );
}

export default function SobreEmpresa() {
  const { markSectionSeen } = useNotifications();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    markSectionSeen('empresa');
  }, [markSectionSeen]);

  useEffect(() => {
    let mounted = true;
    legacyGetJson<{ sobre_video_url?: string | null }>('/api/intranet-config')
      .then((config) => {
        if (mounted) setVideoUrl(config?.sobre_video_url || null);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="bg-slate-50 text-slate-800 font-sans overflow-x-hidden -m-[30px] dark:bg-slate-900 dark:text-slate-100">
      {/* 1. ABERTURA COM VÍDEO DE FUNDO (configurável no admin; sem vídeo usa a montanha) */}
      <section className="relative min-h-[80vh] flex flex-col items-center justify-center text-center p-6 overflow-hidden bg-slate-950">
        <VideoFundo url={videoUrl} poster={mountainImage} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/45 to-slate-950/90" />

        <motion.img
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          src={logoGrupoAlpesWhite}
          alt="Grupo Alpes"
          className="relative mb-8 h-8 md:h-10 w-auto"
        />

        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1 }}
          className="relative text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-cyan-200"
        >
          Nosso DNA
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 1 }}
          className="relative mt-5 max-w-xl text-white/80 text-lg"
        >
          Conheça o que nos move, onde queremos chegar e os valores que sustentam
          cada conquista.
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="relative mt-10 flex flex-col items-center gap-1 text-white/60 text-sm animate-bounce"
        >
          Role para descobrir
          <ChevronDown size={18} />
        </motion.p>
      </section>

      {/* 2. MISSÃO */}
      <section className="min-h-[70vh] flex items-center justify-center p-6 bg-white dark:bg-slate-900">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="max-w-4xl text-center space-y-8"
        >
          <SecaoTitulo numero="01" titulo="Missão" />
          <p className="text-2xl md:text-4xl font-medium leading-relaxed text-slate-700 dark:text-slate-200">
            Entregar Resultados através de estratégias de mídia personalizadas com
            análises de dados que proporcionam performance aos nossos parceiros.
          </p>
        </motion.div>
      </section>

      {/* 3. VISÃO */}
      <section className="min-h-[70vh] flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="max-w-4xl text-center space-y-8"
        >
          <SecaoTitulo numero="02" titulo="Visão" />
          <p className="text-2xl md:text-4xl font-medium leading-relaxed text-slate-700 dark:text-slate-200">
            Ser a empresa que entrega as melhores estratégias e performance de mídia
            no mundo.
          </p>
        </motion.div>
      </section>

      {/* 4. VALORES */}
      <section className="min-h-[70vh] flex items-center justify-center p-6 bg-white dark:bg-slate-900">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="max-w-5xl w-full text-center space-y-10"
        >
          <SecaoTitulo numero="03" titulo="Valores" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {valores.map((valor, index) => (
              <motion.div
                key={valor.nome}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15, duration: 0.5 }}
                className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 px-6 py-8 text-left shadow-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-xl dark:border-slate-700 dark:bg-slate-800"
              >
                <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${valor.cor}`} />
                <span className="block text-xs font-black tabular-nums text-slate-300 dark:text-slate-600">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="mt-2 block text-lg md:text-xl font-bold text-slate-700 group-hover:text-slate-900 dark:text-slate-200 dark:group-hover:text-white">
                  {valor.nome}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* 5. NOSSAS SEDES */}
      <section className="py-24 px-6 bg-slate-50 dark:bg-slate-950">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="max-w-6xl mx-auto text-center space-y-6"
        >
          <SecaoTitulo numero="04" titulo="Nossas Sedes" />
          <p className="text-slate-500 text-lg max-w-2xl mx-auto dark:text-slate-400">
            Presença nas principais praças do país, sempre perto de quem importa.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6">
            {sedes.map((sede, index) => (
              <motion.div
                key={sede.cidade}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15, duration: 0.6 }}
                className="group relative h-72 overflow-hidden rounded-3xl shadow-lg transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
              >
                <img
                  src={sede.imagem}
                  alt={`Sede ${sede.cidade}`}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-left text-white">
                  <h3 className="!m-0 text-2xl font-black !text-white">{sede.cidade}</h3>
                  <p className="mt-1 text-sm font-medium uppercase tracking-widest text-white/70">
                    {sede.estado}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* 6. GRAN FINALE: A MONTANHA ALPES */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden bg-slate-900">
        <motion.div
          initial={{ opacity: 0, scale: 1.2 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          viewport={{ once: true }}
          className="absolute inset-0 z-0"
        >
          <img
            src={mountainImage}
            alt="Montanha Alpes"
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 1 }}
          viewport={{ once: true }}
          className="relative z-10 text-center text-white"
        >
          <img src={logoGrupoAlpesWhite} alt="Grupo Alpes" className="mx-auto mb-6 h-10 w-auto opacity-90" />
          <p className="text-xl md:text-2xl mt-4 font-light tracking-wide text-white/80">
            O topo é o nosso destino.
          </p>
        </motion.div>
      </section>
    </div>
  );
}
