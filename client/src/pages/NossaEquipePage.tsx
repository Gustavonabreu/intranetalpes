import { useEffect, useState } from 'react';
import { legacyGetJson } from '../services/legacyApi';
import { handlePhotoFallback } from '../services/photoFallback';
import logoAlpesWhite from '../assets/brand/logo-alpes-white.png';
import mountainImage from '../assets/brand/montanha.png';

type Funcionario = {
  id?: number;
  nome_formatado?: string;
  email?: string;
  telefone?: string;
  imagem_url?: string;
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

  return (
    <>
      <div className="faixa-titulo">
        <div className="faixa-container">
          <h2>Nossa Equipe</h2>
        </div>
      </div>

      <div id="equipe-container" className="equipe-grid">
        {loading ? <p>Carregando equipe...</p> : null}
        {error ? <p>{error}</p> : null}

        {!loading && !error
          ? funcionarios.map((func, index) => {
              const phone = formatPhoneDigits(func.telefone);
              const name = func.nome_formatado || 'Colaborador';
              const profileName = firstName(name);
              const photoFallback = 'https://dummyimage.com/120x120/cccccc/333333&text=U';
              const photoUrl = func.imagem_url || photoFallback;
              const contactUrl = phone
                ? `https://wa.me/55${phone}`
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

                      <div className="profile-pic-front">
                        <img
                          src={photoUrl}
                          loading="lazy"
                          alt={`Foto de ${name}`}
                          onError={(event) => handlePhotoFallback(event, photoFallback)}
                        />
                      </div>

                      <h3 className="profile-name-front">{name}</h3>
                    </div>

                    <div className="card-interaction-equipe">
                      <img className="mountain-graphic-equipe" src={mountainImage} alt="" aria-hidden="true" />

                      <div className="contact-details-equipe">
                        {phone ? (
                          <div className="contact-item-equipe">
                            <i className="fab fa-whatsapp" />
                            <span>{func.telefone}</span>
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

      <p className="equipe-instruction-text">Passe o mouse para ver detalhes</p>
    </>
  );
}
