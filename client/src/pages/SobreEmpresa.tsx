import { useEffect } from 'react';
import { motion, Variants } from 'framer-motion';
import { Target, Eye, Heart, Mountain, MapPin } from 'lucide-react';
import mountainImage from '../assets/brand/montanha.png';
import sedeCuritiba from '../assets/brand/sede-curitiba.jpg';
import sedeSaoPaulo from '../assets/brand/sede-sao-paulo.jpg';
import sedeRio from '../assets/brand/sede-rio-de-janeiro.jpg';
import { useNotifications } from '../notifications/NotificationsProvider';

const valores = [
  { nome: 'Respeito', cor: 'from-blue-500 to-blue-600' },
  { nome: 'Resiliência', cor: 'from-indigo-500 to-indigo-600' },
  { nome: 'Comprometimento', cor: 'from-cyan-500 to-cyan-600' },
  { nome: 'Empatia', cor: 'from-rose-500 to-rose-600' }
];

const sedes = [
  { cidade: 'Curitiba', estado: 'Paraná', imagem: sedeCuritiba },
  { cidade: 'São Paulo', estado: 'São Paulo', imagem: sedeSaoPaulo },
  { cidade: 'Rio de Janeiro', estado: 'Rio de Janeiro', imagem: sedeRio }
];

export default function SobreEmpresa() {
  const { markSectionSeen } = useNotifications();

  useEffect(() => {
    markSectionSeen('empresa');
  }, [markSectionSeen]);

  // Configuração padrão da animação (surge de baixo para cima com fade)
  const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: 'easeOut' } }
  };

  return (
    <div className="bg-slate-50 text-slate-800 font-sans overflow-x-hidden -m-[30px] dark:bg-slate-900 dark:text-slate-100">
      {/* 1. HEADER / INTRODUÇÃO */}
      <section className="relative min-h-[70vh] flex flex-col items-center justify-center text-center p-6 overflow-hidden bg-gradient-to-b from-white via-blue-50/40 to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
        <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-500/10" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-cyan-200/40 blur-3xl dark:bg-cyan-500/10" />

        <motion.span
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/70 px-4 py-1.5 text-sm font-semibold text-blue-700 backdrop-blur dark:border-blue-900 dark:bg-slate-800/70 dark:text-blue-300"
        >
          <Mountain size={16} /> Grupo Alpes
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1 }}
          className="relative text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-cyan-500"
        >
          Nosso DNA
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 1 }}
          className="relative mt-5 max-w-xl text-slate-500 text-lg dark:text-slate-400"
        >
          Conheça o que nos move, onde queremos chegar e os valores que sustentam
          cada conquista.
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="relative mt-8 text-slate-400 text-sm animate-bounce dark:text-slate-500"
        >
          Role para descobrir ↓
        </motion.p>
      </section>

      {/* 2. MISSÃO */}
      <section className="min-h-[70vh] flex items-center justify-center p-6 bg-white dark:bg-slate-900">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="max-w-4xl text-center space-y-6"
        >
          <div className="inline-flex items-center justify-center p-4 bg-blue-50 text-blue-600 rounded-2xl mb-4 shadow-sm ring-1 ring-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900">
            <Target size={40} />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest text-slate-300 dark:text-slate-600">
            Missão
          </h2>
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
          className="max-w-4xl text-center space-y-6"
        >
          <div className="inline-flex items-center justify-center p-4 bg-indigo-50 text-indigo-600 rounded-2xl mb-4 shadow-sm ring-1 ring-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-900">
            <Eye size={40} />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest text-slate-300 dark:text-slate-600">
            Visão
          </h2>
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
          className="max-w-5xl w-full text-center space-y-8"
        >
          <div className="inline-flex items-center justify-center p-4 bg-rose-50 text-rose-600 rounded-2xl mb-4 shadow-sm ring-1 ring-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900">
            <Heart size={40} />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest text-slate-300 dark:text-slate-600">
            Valores
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
            {valores.map((valor, index) => (
              <motion.div
                key={valor.nome}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15, duration: 0.5 }}
                className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-8 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-xl dark:border-slate-700 dark:bg-slate-800"
              >
                <div
                  className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${valor.cor}`}
                />
                <span className="text-lg md:text-xl font-bold text-slate-700 group-hover:text-slate-900 dark:text-slate-200 dark:group-hover:text-white">
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
          className="max-w-6xl mx-auto text-center space-y-4"
        >
          <div className="inline-flex items-center justify-center p-4 bg-cyan-50 text-cyan-600 rounded-2xl mb-2 shadow-sm ring-1 ring-cyan-100 dark:bg-cyan-950 dark:text-cyan-300 dark:ring-cyan-900">
            <MapPin size={40} />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest text-slate-300 dark:text-slate-600">
            Nossas Sedes
          </h2>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto dark:text-slate-400">
            Presença nas principais praças do país, sempre perto de quem importa.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
            {sedes.map((sede, index) => (
              <motion.div
                key={sede.cidade}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15, duration: 0.6 }}
                className="group overflow-hidden rounded-3xl bg-white shadow-lg border border-slate-100 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl dark:bg-slate-800 dark:border-slate-700"
              >
                <div className="h-56 overflow-hidden">
                  <img
                    src={sede.imagem}
                    alt={`Sede ${sede.cidade}`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                </div>
                <div className="p-6 text-left">
                  <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">{sede.cidade}</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-slate-500 text-sm dark:text-slate-400">
                    <MapPin size={14} /> {sede.estado}
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
          <Mountain size={64} className="mx-auto mb-6 text-white/80" />
          <h2 className="text-4xl md:text-7xl font-black tracking-tighter">ALPES</h2>
          <p className="text-xl md:text-2xl mt-4 font-light tracking-wide text-white/80">
            O topo é o nosso destino.
          </p>
        </motion.div>
      </section>
    </div>
  );
}
