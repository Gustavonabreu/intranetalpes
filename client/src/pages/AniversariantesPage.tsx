import { useEffect, useMemo, useState } from 'react';
import { Cake, PartyPopper, Gift } from 'lucide-react';
import { legacyGetJson } from '../services/legacyApi';
import { handlePhotoFallback } from '../services/photoFallback';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

type Funcionario = {
  id?: number;
  nome_formatado?: string;
  cargo?: string;
  aniversario?: string;
  imagem_url?: string;
};

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

function getBirthdayDay(birthday?: string) {
  if (!birthday) return null;

  const parts = birthday.split('-');
  if (parts.length < 3) return null;

  const day = parseInt(parts[2], 10);

  return Number.isNaN(day) ? null : day;
}

function isBirthdayInCurrentMonth(birthday?: string) {
  if (!birthday) return false;

  const parts = birthday.split('-');
  if (parts.length < 3) return false;

  const month = parseInt(parts[1], 10) - 1;

  if (Number.isNaN(month)) return false;

  return month === new Date().getMonth();
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
    <div className="min-h-screen bg-gradient-to-b from-white via-blue-50/40 to-slate-100 py-16 -m-[30px] px-6 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
      <div className="max-w-7xl mx-auto">
        {/* Cabeçalho */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-200 bg-white/70 px-4 py-1.5 text-sm font-semibold text-blue-700 backdrop-blur mb-6 dark:border-blue-900 dark:bg-slate-800/70 dark:text-blue-300">
            <Cake size={16} /> {mesAtual}
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-cyan-500 flex items-center justify-center gap-4">
            <PartyPopper className="text-blue-500 shrink-0" size={44} />
            Aniversariantes
          </h1>
          <p className="text-slate-500 mt-4 text-lg dark:text-slate-400">
            Celebrando quem faz parte da nossa história
          </p>
        </div>

        {loading && (
          <p className="text-slate-600 text-xl text-center dark:text-slate-300">
            Carregando aniversariantes...
          </p>
        )}

        {error && <p className="text-red-500 text-xl text-center">{error}</p>}

        {/* Destaque: aniversariantes de hoje */}
        {!loading && !error && aniversariantesHoje.length > 0 && (
          <div className="mb-12 rounded-3xl bg-gradient-to-r from-blue-600 to-cyan-500 p-6 md:p-8 shadow-xl text-white">
            <div className="flex items-center gap-3 mb-5">
              <Gift size={28} />
              <h2 className="text-2xl font-black">É hoje! 🎉</h2>
            </div>
            <div className="flex flex-wrap gap-4">
              {aniversariantesHoje.map((func, index) => {
                const name = func.nome_formatado || 'Colaborador';
                return (
                  <div
                    key={func.id || `hoje-${name}-${index}`}
                    className="flex items-center gap-3 rounded-2xl bg-white/15 backdrop-blur px-4 py-3"
                  >
                    <img
                      src={func.imagem_url || 'https://dummyimage.com/80x80/cccccc/333333&text=U'}
                      alt={`Foto de ${name}`}
                      className="w-12 h-12 rounded-full object-cover object-top ring-2 ring-white/70"
                      onError={(event) =>
                        handlePhotoFallback(
                          event,
                          'https://dummyimage.com/80x80/cccccc/333333&text=U'
                        )
                      }
                    />
                    <span className="font-bold uppercase text-sm">{name}</span>
                  </div>
                );
              })}
            </div>
          </div>
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
            modules={[Navigation, Pagination]}
            spaceBetween={30}
            slidesPerView={1}
            navigation
            pagination={{
              clickable: true
            }}
            breakpoints={{
              768: {
                slidesPerView: 2
              },
              1280: {
                slidesPerView: 3
              }
            }}
            className="pb-16"
          >
            {aniversariantesDoMes.map((func, index) => {
              const day = getBirthdayDay(func.aniversario);
              const name = func.nome_formatado || 'Colaborador';
              const hoje = isBirthdayToday(func.aniversario);

              return (
                <SwiperSlide key={func.id || `${name}-${index}`}>
                  <div className="p-3">
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

                      <div className="h-80 bg-slate-200 overflow-hidden dark:bg-slate-700">
                        <img
                          src={
                            func.imagem_url ||
                            'https://dummyimage.com/600x600/cccccc/333333&text=U'
                          }
                          alt={`Foto de ${name}`}
                          className="w-full h-full object-cover object-top transition-transform duration-500 hover:scale-105"
                          onError={(event) =>
                            handlePhotoFallback(
                              event,
                              'https://dummyimage.com/600x600/cccccc/333333&text=U'
                            )
                          }
                        />
                      </div>

                      <div className="p-6 text-center">
                        <h3 className="text-slate-800 font-black text-xl uppercase mb-4 dark:text-slate-100">
                          {name}
                        </h3>

                        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold shadow-md">
                          <Cake size={16} /> Dia {day || '--'}
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
