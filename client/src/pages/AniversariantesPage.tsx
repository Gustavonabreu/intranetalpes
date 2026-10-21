import { useEffect, useMemo, useState } from 'react';
import { Cake, PartyPopper } from 'lucide-react';
import { legacyGetJson } from '../services/legacyApi';
import { FotoColaborador } from '../components/FotoColaborador';
import aniversariantesBg from '../assets/brand/aniversariantes.png';
import '../styles/aniversariantes.css';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

type Funcionario = {
  id?: number;
  nome_formatado?: string;
  cargo?: string;
  setor?: string;
  aniversario?: string;
  imagem_url?: string;
};

const CONFETES = [
  { left: '4%', color: '#2563eb', delay: '0s', duration: '7s' },
  { left: '11%', color: '#22d3ee', delay: '1.8s', duration: '8.5s' },
  { left: '19%', color: '#f59e0b', delay: '0.6s', duration: '6.5s' },
  { left: '27%', color: '#ec4899', delay: '2.6s', duration: '9s' },
  { left: '36%', color: '#2563eb', delay: '1.2s', duration: '7.5s' },
  { left: '45%', color: '#22d3ee', delay: '3.4s', duration: '8s' },
  { left: '55%', color: '#f59e0b', delay: '0.3s', duration: '9.5s' },
  { left: '64%', color: '#ec4899', delay: '2.1s', duration: '7s' },
  { left: '72%', color: '#2563eb', delay: '1s', duration: '8.5s' },
  { left: '81%', color: '#22d3ee', delay: '2.9s', duration: '6.8s' },
  { left: '89%', color: '#f59e0b', delay: '0.9s', duration: '8.2s' },
  { left: '96%', color: '#ec4899', delay: '3.8s', duration: '7.6s' }
];

function toTitleCase(text: string) {
  return text.toLowerCase().replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

// Aceita DD/MM (API de funcionarios) e YYYY-MM-DD.
function parseBirthday(birthday?: string) {
  if (!birthday) return null;

  const trimmed = birthday.trim();
  const dayMonth = trimmed.match(/^(\d{2})\/(\d{2})$/);
  if (dayMonth) return { day: Number(dayMonth[1]), month: Number(dayMonth[2]) };

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { day: Number(iso[3]), month: Number(iso[2]) };

  return null;
}

function getBirthdayDay(birthday?: string) {
  return parseBirthday(birthday)?.day ?? null;
}

function isBirthdayInCurrentMonth(birthday?: string) {
  const parsed = parseBirthday(birthday);
  if (!parsed) return false;

  return parsed.month - 1 === new Date().getMonth();
}

function isBirthdayToday(birthday?: string) {
  const day = getBirthdayDay(birthday);
  if (day == null) return false;
  return isBirthdayInCurrentMonth(birthday) && day === new Date().getDate();
}

export function AniversariantesPage() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const mesAtual = MESES[new Date().getMonth()];

  useEffect(() => {
    let mounted = true;

    async function loadBirthdays() {
      setLoading(true);
      setError('');

      try {
        const data = await legacyGetJson<Funcionario[]>('/api/equipe/');

        if (!mounted) return;

        setFuncionarios(data || []);
      } catch {
        if (!mounted) return;

        setError('Erro ao carregar aniversariantes.');
        setFuncionarios([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadBirthdays();

    return () => {
      mounted = false;
    };
  }, []);

  const aniversariantesDoMes = useMemo(() => {
    return funcionarios
      .filter((func) => isBirthdayInCurrentMonth(func.aniversario))
      .sort(
        (a, b) =>
          (getBirthdayDay(a.aniversario) || 0) - (getBirthdayDay(b.aniversario) || 0)
      );
  }, [funcionarios]);

  const aniversariantesHoje = useMemo(
    () => aniversariantesDoMes.filter((func) => isBirthdayToday(func.aniversario)),
    [aniversariantesDoMes]
  );

  return (
    <div
      className="aniv-page relative pb-8 md:pb-10"
      style={{ backgroundImage: `url('${aniversariantesBg}')` }}
    >
      {/* Mes ancorado a arte "Feliz Aniversario" da imagem (ver aniversariantes.css) */}
      <header className="aniv-header">
        <h2 className="aniv-mes">{mesAtual}</h2>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6">

        {loading && (
          <p className="text-slate-600 text-xl text-center dark:text-slate-300">
            Carregando aniversariantes...
          </p>
        )}

        {error && <p className="text-red-500 text-xl text-center">{error}</p>}

        {/* Destaque: aniversariantes de hoje */}
        {!loading && !error && aniversariantesHoje.length > 0 && (
          <section className="relative mx-auto mb-12 max-w-5xl overflow-hidden rounded-[28px] bg-white/90 px-6 pb-8 pt-9 shadow-2xl ring-1 ring-white/70 backdrop-blur-md md:px-10 dark:bg-slate-900/85 dark:ring-slate-700">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-600" />
            <div className="aniv-confetes" aria-hidden="true">
              {CONFETES.map((confete, index) => (
                <span
                  key={index}
                  style={{
                    left: confete.left,
                    background: confete.color,
                    animationDelay: confete.delay,
                    animationDuration: confete.duration
                  }}
                />
              ))}
            </div>

            <header className="relative mb-8 text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white shadow-md">
                <PartyPopper size={14} /> É hoje!
              </span>
              <h2 className="mt-4 text-2xl font-black text-slate-800 md:text-3xl dark:text-slate-100">
                {aniversariantesHoje.length === 1
                  ? `Feliz aniversário, ${toTitleCase(
                      (aniversariantesHoje[0].nome_formatado || 'Colaborador').split(/\s+/)[0]
                    )}!`
                  : `Hoje temos ${aniversariantesHoje.length} aniversariantes!`}
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                {toTitleCase(
                  new Date().toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long'
                  })
                )}
              </p>
            </header>

            <div className="relative flex flex-wrap justify-center gap-6">
              {aniversariantesHoje.map((func, index) => {
                const name = func.nome_formatado || 'Colaborador';
                const detalhe = [func.cargo, func.setor].filter(Boolean).join(' · ');
                return (
                  <article
                    key={func.id || `hoje-${name}-${index}`}
                    className="flex w-full max-w-[300px] flex-col items-center rounded-3xl bg-gradient-to-b from-blue-50 to-white px-6 pb-6 pt-7 text-center shadow-lg ring-1 ring-blue-100 dark:from-slate-800 dark:to-slate-900 dark:ring-slate-700"
                  >
                    <div className="relative mb-5">
                      <div className="aniv-aro rounded-full bg-gradient-to-tr from-blue-600 via-cyan-400 to-blue-600 p-1 shadow-xl">
                        <FotoColaborador
                          src={func.imagem_url}
                          name={name}
                          className="h-32 w-32 rounded-full border-4 border-white dark:border-slate-900"
                          initialsClassName="text-4xl"
                        />
                      </div>
                      <span className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full bg-amber-400 text-white shadow-lg ring-4 ring-white dark:ring-slate-900">
                        <Cake size={18} />
                      </span>
                    </div>

                    <h3 className="text-lg font-black uppercase leading-tight text-slate-800 dark:text-slate-100">
                      {name}
                    </h3>
                    {detalhe ? (
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {detalhe}
                      </p>
                    ) : null}
                    <p className="mt-4 rounded-full bg-blue-600/10 px-4 py-1.5 text-sm font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                      Parabéns! Muitas felicidades 🎉
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {!loading && !error && aniversariantesDoMes.length === 0 && (
          <div className="bg-white rounded-3xl shadow-md p-10 text-center max-w-xl mx-auto dark:bg-slate-800">
            <Cake className="mx-auto text-slate-300 mb-4 dark:text-slate-600" size={48} />
            <p className="text-slate-500 text-xl dark:text-slate-400">
              Nenhum aniversariante para exibir este mês.
            </p>
          </div>
        )}

        {!loading && !error && aniversariantesDoMes.length > 0 && (
          <Swiper
            modules={[Navigation, Pagination, Autoplay]}
            spaceBetween={12}
            slidesPerView={1}
            centeredSlides={false}
            loop={aniversariantesDoMes.length > 2}
            autoplay={
              aniversariantesDoMes.length > 2
                ? {
                    delay: 2000,
                    disableOnInteraction: false,
                    pauseOnMouseEnter: true
                  }
                : false
            }
            pagination={{
              clickable: true
            }}
            breakpoints={{
              768: {
                slidesPerView: 2,
                spaceBetween: 14
              }
            }}
            className="mt-2 md:mt-3 pb-4 md:pb-6 w-full max-w-[960px] mx-auto"
          >
            {aniversariantesDoMes.map((func, index) => {
              const day = getBirthdayDay(func.aniversario);
              const name = func.nome_formatado || 'Colaborador';
              const hoje = isBirthdayToday(func.aniversario);

              return (
                <SwiperSlide key={func.id || `${name}-${index}`}>
                  <div className="p-0.5 md:p-1 w-full max-w-[430px] mx-auto">
                    <div
                      className={`
                        relative bg-white rounded-3xl overflow-hidden border shadow-lg
                        transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl
                        dark:bg-slate-800
                        ${
                          hoje
                            ? 'border-blue-400 ring-2 ring-blue-300 dark:border-blue-500 dark:ring-blue-700'
                            : 'border-slate-200 dark:border-slate-700'
                        }
                      `}
                    >
                      {hoje && (
                        <span className="absolute top-4 left-4 z-10 inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-lg">
                          <PartyPopper size={12} /> HOJE
                        </span>
                      )}

                      <div className="aspect-square bg-slate-200 overflow-hidden dark:bg-slate-700">
                        <FotoColaborador
                          src={func.imagem_url}
                          name={name}
                          className="w-full h-full transition-transform duration-500 hover:scale-105"
                          initialsClassName="text-8xl"
                        />
                      </div>

                      <div className="p-2 md:p-5 text-center">
                        <h3
                          className="
                            h-14
                            flex
                            items-center
                            justify-center
                            text-center
                            text-slate-800
                            font-black
                            text-lg
                            md:text-xl
                            uppercase
                            leading-tight
                            px-2
                            mb-3
                            dark:text-slate-100
                          "
                        >
                          {name}
                        </h3>

                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold text-sm shadow-md">
                          <Cake size={16} /> DIA {day || '--'}
                        </div>
                      </div>
                    </div>
                  </div>
                </SwiperSlide>
              );
            })}
          </Swiper>
        )}
      </div>
    </div>
  );
}
