import React from 'react';
import { motion, Variants } from 'framer-motion';
import { Target, Eye, Heart, Mountain } from 'lucide-react';
import mountainImage from '../assets/brand/montanha.png';

export default function SobreEmpresa() {
  // Configuração padrão da animação (surge de baixo para cima com fade)
  const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
  };

  return (
    <div className="bg-slate-50 text-slate-800 font-sans overflow-x-hidden">
      
      {/* 1. HEADER / INTRODUÇÃO */}
      <section className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <motion.h1 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1 }}
          className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-cyan-500"
        >
          Nosso DNA
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 1 }}
          className="mt-4 text-slate-500 text-lg animate-bounce"
        >
          Role para descobrir ↓
        </motion.p>
      </section>

      {/* 2. MISSÃO */}
      <section className="min-h-[70vh] flex items-center justify-center p-6 bg-white">
        <motion.div 
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="max-w-4xl text-center space-y-6"
        >
          <div className="inline-flex items-center justify-center p-4 bg-blue-50 text-blue-600 rounded-full mb-4">
            <Target size={40} />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest text-slate-300">Missão</h2>
          <p className="text-2xl md:text-4xl font-medium leading-relaxed text-slate-700">
            Entregar Resultados através de estratégias de mídia personalizadas com análises de dados que proporcionam performance aos nossos parceiros.
          </p>
        </motion.div>
      </section>

      {/* 3. VISÃO */}
      <section className="min-h-[70vh] flex items-center justify-center p-6 bg-slate-50">
        <motion.div 
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="max-w-4xl text-center space-y-6"
        >
          <div className="inline-flex items-center justify-center p-4 bg-indigo-50 text-indigo-600 rounded-full mb-4">
            <Eye size={40} />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest text-slate-300">Visão</h2>
          <p className="text-2xl md:text-4xl font-medium leading-relaxed text-slate-700">
            Ser a empresa que entrega as melhores estratégias e performance de mídia no mundo.
          </p>
        </motion.div>
      </section>

      {/* 4. VALORES */}
      <section className="min-h-[70vh] flex items-center justify-center p-6 bg-white">
        <motion.div 
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="max-w-5xl text-center space-y-8"
        >
          <div className="inline-flex items-center justify-center p-4 bg-rose-50 text-rose-600 rounded-full mb-4">
            <Heart size={40} />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest text-slate-300">Valores</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
            {['Respeito', 'Resiliência', 'Comprometimento', 'Empatia'].map((valor, index) => (
              <motion.div
                key={valor}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2, duration: 0.5 }}
                className="bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center"
              >
                <span className="text-xl font-bold text-slate-700">{valor}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* 5. GRAN FINALE: A MONTANHA ALPES */}
      {/* Aqui a imagem surge com um zoom suave */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden bg-slate-900">
        <motion.div
          initial={{ opacity: 0, scale: 1.2 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          viewport={{ once: true }}
          className="absolute inset-0 z-0"
        >
          {/* Substitua o src abaixo pela imagem oficial da montanha da Alpes */}
          <img 
            src={mountainImage} 
            alt="Montanha Alpes" 
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
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