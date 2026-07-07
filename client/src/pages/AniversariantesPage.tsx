import { useEffect, useMemo, useState } from 'react';
import { Cake, PartyPopper, Gift } from 'lucide-react';
import { legacyGetJson } from '../services/legacyApi';
import { handlePhotoFallback } from '../services/photoFallback';
import aniversariantesBg from '../assets/brand/aniversariantes.png';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';

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
    <div
      className="relative py-8 md:py-10 px-4 md:px-6"
      style={{
        backgroundImage: `url('${aniversariantesBg}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div
          className="
            relative
            w-full
            aspect-[16/4]
            min-h-[clamp(120px,18vw,220px)]
          "
        >
          <div
            className="
              absolute
              left-1/2
              -translate-x-1/2
              top-[56%]
              sm:top-[57%]
              md:top-[58%]
              lg:top-[59%]
              xl:top-[60%]
              z-20
              text-center
              pointer-events-none
            "
          >
            <h2
              className="
                text-white
                uppercase
                font-black
                tracking-wider
                drop-shadow-lg
                text-2xl
                sm:text-3xl
                md:text-4xl
              "
            >
              {mesAtual}
            </h2>
          </div>
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
