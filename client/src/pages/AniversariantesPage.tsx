import { useEffect, useMemo, useState } from 'react';
import { legacyGetJson } from '../services/legacyApi';
import { handlePhotoFallback } from '../services/photoFallback';

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
      .sort((a, b) => (getBirthdayDay(a.aniversario) || 0) - (getBirthdayDay(b.aniversario) || 0));
  }, [funcionarios]);

  return (
    <>
      <div className="faixa-titulo">
        <h2>Aniversariantes do Mes</h2>
      </div>

      <div className="aniversariantes-swiper">
        <div className="swiper-wrapper" id="aniversariantes-swiper-wrapper">
          {loading ? <p>Carregando aniversariantes...</p> : null}
          {error ? <p>{error}</p> : null}

          {!loading && !error && aniversariantesDoMes.length === 0 ? (
            <p>Nenhum aniversariante para exibir este mes.</p>
          ) : null}

          {!loading && !error
            ? aniversariantesDoMes.map((func, index) => {
                const day = getBirthdayDay(func.aniversario);
                const name = func.nome_formatado || 'Colaborador';
                return (
                  <div className="swiper-slide" key={func.id || `${name}-${index}`}>
                    <div className="card-aniv-pagina">
                      <div className="foto">
                        <img
                          src={func.imagem_url || 'https://dummyimage.com/120x120/cccccc/333333&text=U'}
                          alt={`Foto de ${name}`}
                          onError={(event) =>
                            handlePhotoFallback(
                              event,
                              'https://dummyimage.com/120x120/cccccc/333333&text=U'
                            )
                          }
                        />
                      </div>
                      <h3 className="nome">{name}</h3>
                      <p className="cargo">{func.cargo || ''}</p>
                      <p className="dia">Dia {day || '--'}</p>
                    </div>
                  </div>
                );
              })
            : null}
        </div>
      </div>
    </>
  );
}
