import { useEffect, useMemo, useState } from 'react';
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

export function AniversariantesPage() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
          (getBirthdayDay(a.aniversario) || 0) -
          (getBirthdayDay(b.aniversario) || 0)
      );
  }, [funcionarios]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-100 py-16">

      <div className="max-w-7xl mx-auto px-4">

        <div className="text-center mb-14">
          <h1 className="text-5xl md:text-6xl font-black text-slate-800">
             Aniversariantes
          </h1>

          <p className="text-slate-500 mt-4 text-lg">
            Celebrando quem faz parte da nossa história
          </p>
        </div>

        {loading && (
          <p className="text-slate-600 text-xl text-center">
            Carregando aniversariantes...
          </p>
        )}

        {error && (
          <p className="text-red-500 text-xl text-center">
            {error}
          </p>
        )}

        {!loading &&
          !error &&
          aniversariantesDoMes.length === 0 && (
            <div className="bg-white rounded-3xl shadow-md p-8 text-center">
              <p className="text-slate-500 text-xl">
                Nenhum aniversariante para exibir este mês.
              </p>
            </div>
          )}

        {!loading &&
          !error &&
          aniversariantesDoMes.length > 0 && (
            <Swiper
              modules={[Navigation, Pagination]}
              spaceBetween={30}
              slidesPerView={1}
              navigation
              pagination={{
                clickable: true,
              }}
              breakpoints={{
                768: {
                  slidesPerView: 2,
                },
                1280: {
                  slidesPerView: 3,
                },
              }}
              className="pb-16"
            >
              {aniversariantesDoMes.map((func, index) => {
                const day = getBirthdayDay(func.aniversario);
                const name = func.nome_formatado || 'Colaborador';

                return (
                  <SwiperSlide
                    key={func.id || `${name}-${index}`}
                  >
                    <div className="p-3">

                      <div
                        className="
                          bg-white
                          rounded-3xl
                          overflow-hidden
                          border
                          border-slate-200
                          shadow-lg
                          transition-all
                          duration-300
                          hover:-translate-y-2
                          hover:shadow-2xl
                        "
                      >
                        <div className="h-80 bg-slate-200 overflow-hidden">
                          <img
                            src={
                              func.imagem_url ||
                              'https://dummyimage.com/600x600/cccccc/333333&text=U'
                            }
                            alt={`Foto de ${name}`}
                            className="w-full h-full object-cover object-top"
                            onError={(event) =>
                              handlePhotoFallback(
                                event,
                                'https://dummyimage.com/600x600/cccccc/333333&text=U'
                              )
                            }
                          />
                        </div>

                        <div className="p-6 text-center">

                          <h3 className="text-slate-800 font-black text-xl uppercase">
                            {name}
                          </h3>


                          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-blue-600 text-white font-bold">
                            Dia {day || '--'}
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