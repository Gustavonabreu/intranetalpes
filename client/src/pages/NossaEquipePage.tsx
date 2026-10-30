import { useEffect, useState } from 'react';
import { legacyGetJson } from '../services/legacyApi';
import { FotoColaborador } from '../components/FotoColaborador';
import { CampanhaFotoAtiva, temaFotoCampanha } from '../config/fotoCampanhas';
import logoAlpesWhite from '../assets/brand/logo-alpes-white.png';
import mountainImage from '../assets/brand/montanha.png';

type Funcionario = {
  id?: number;
  nome_formatado?: string;
  setor?: string;
  email?: string;
  fone?: string;
  imagem_url?: string;
  imagem_oficial_url?: string | null;
  campanha?: CampanhaFotoAtiva;
};

function formatPhoneDigits(phone?: string) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

function firstName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 'Colaborador';
  return trimmed.split(/\s+/)[0];
}

export function NossaEquipePage() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadTeam() {
      setLoading(true);
      setError('');

      try {
        const data = await legacyGetJson<Funcionario[]>('/api/equipe/');
        if (!mounted) return;
        setFuncionarios(data || []);
      } catch {
        if (!mounted) return;
        setError('Nao foi possivel carregar a equipe.');
        setFuncionarios([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadTeam();
    return () => {
      mounted = false;
    };
  }, []);

  const campanhaAtiva = funcionarios.find((func) => func.campanha)?.campanha;
  const temaAtivo = campanhaAtiva ? temaFotoCampanha(campanhaAtiva.tema) : null;

  return (
    <>
      <div className="faixa-titulo">
        <div className="faixa-container">
          <h2>Nossa Equipe</h2>
        </div>
      </div>

      {campanhaAtiva && temaAtivo ? (
        <div className="equipe-campanha-faixa">
          <span aria-hidden="true">{temaAtivo.emoji}</span>
          <p>
            <strong>{campanhaAtiva.nome}:</strong> as fotos estao no clima da campanha.
            {campanhaAtiva.revelar ? ' Passe o mouse no card para ver como cada um esta hoje.' : ''}
          </p>
        </div>
      ) : null}

      <div id="equipe-container" className="equipe-grid">
        {loading ? <p>Carregando equipe...</p> : null}
        {error ? <p>{error}</p> : null}

        {!loading && !error
          ? funcionarios.map((func, index) => {
              const phone = formatPhoneDigits(func.fone);
              const name = func.nome_formatado || 'Colaborador';
              const profileName = firstName(name);
              const tema = func.campanha ? temaFotoCampanha(func.campanha.tema) : null;
              const fotoHoje = func.campanha?.revelar ? func.imagem_oficial_url : null;
              const contactUrl = phone
                ? `https://wa.me/${phone}`
                : func.email
                  ? `mailto:${func.email}`
                  : '#';
              const contactLabel = phone
                ? `Falar com ${profileName}`
                : func.email
                  ? `Enviar e-mail para ${profileName}`
                  : 'Sem contato disponivel';

              return (
                <div className="card-container-equipe" key={func.id || `${name}-${index}`}>
                  <article className="card-equipe modelo-assinatura">
                    <div className="card-content-equipe">
                      <div className="card-logo-equipe">
                        <img src={logoAlpesWhite} alt="Grupo Alpes" />
                      </div>

                      <div className="profile-pic-wrap">
                        <div className="profile-pic-front">
                          <FotoColaborador
                            src={func.imagem_url}
                            name={name}
                            className="h-full w-full"
                            initialsClassName="text-6xl"
                          />
                        </div>
                        {tema ? (
                          <span className="profile-pic-selo" title={func.campanha?.nome}>
                            {tema.emoji}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="profile-name-front">{name}</h3>

                      {func.setor && (
                        <p className="profile-sector-front">{func.setor}</p>
                      )}
                    </div>

                    <div className="card-interaction-equipe">
                      <img className="mountain-graphic-equipe" src={mountainImage} alt="" aria-hidden="true" />

                      <div className="contact-details-equipe">
                        {fotoHoje ? (
                          <div className="contact-item-equipe contato-hoje">
                            <img src={fotoHoje} alt={`Foto atual de ${name}`} loading="lazy" />
                            <span>
                              <strong>{profileName} hoje</strong>
                            </span>
                          </div>
                        ) : null}

                        {phone ? (
                          <div className="contact-item-equipe">
                            <i className="fab fa-whatsapp" />
                            <span>{func.fone}</span>
                          </div>
                        ) : null}

                        {func.email ? (
                          <div className="contact-item-equipe">
                            <i className="fas fa-envelope" />
                            <span>{func.email}</span>
                          </div>
                        ) : null}

                        {(phone || func.email) && contactUrl !== '#' ? (
                          <a
                            href={contactUrl}
                            target="_blank"
                            rel={phone ? 'noreferrer' : undefined}
                            className="contact-button-equipe"
                            title={contactLabel}
                          >
                            {contactLabel}
                          </a>
                        ) : (
                          <span className="contact-button-equipe disabled">{contactLabel}</span>
                        )}
                      </div>
                    </div>
                  </article>
                </div>
              );
            })
          : null}
      </div>
    </>
  );
}
