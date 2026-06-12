import { useEffect, useMemo, useState } from 'react';
import { legacyGetJson } from '../services/legacyApi';

type PostRecente = {
  id?: number;
  titulo?: string;
  data_publicacao?: string;
};

type EnqueteOpcao = {
  id?: number;
  texto_opcao?: string;
  votos?: number;
};

type EnqueteAtiva = {
  id?: number;
  pergunta?: string;
  opcoes?: EnqueteOpcao[];
};

type MembroEquipe = {
  id?: number;
  nome_formatado?: string;
  aniversario?: string | null;
};

export function WidgetsSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [posts, setPosts] = useState<PostRecente[]>([]);
  const [enquete, setEnquete] = useState<EnqueteAtiva | null>(null);
  const [aniversariantes, setAniversariantes] = useState<MembroEquipe[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadWidgets() {
      try {
        const data = await legacyGetJson<PostRecente[]>('/api/noticias-recentes/');
        if (mounted) setPosts(data || []);
      } catch {
        if (mounted) setPosts([]);
      }

      try {
        const data = await legacyGetJson<EnqueteAtiva>('/api/enquete-ativa/');
        if (mounted) setEnquete(data?.id ? data : null);
      } catch {
        if (mounted) setEnquete(null);
      }

      try {
        const data = await legacyGetJson<MembroEquipe[]>('/api/equipe/');
        if (!mounted) return;

        const mesAtual = new Date().getMonth() + 1;
        const aniversariantesMes = (data || [])
          .filter((pessoa) => {
            if (!pessoa.aniversario) return false;
            const dt = new Date(pessoa.aniversario);
            return Number.isFinite(dt.getTime()) && dt.getMonth() + 1 === mesAtual;
          })
          .slice(0, 5);

        setAniversariantes(aniversariantesMes);
      } catch {
        if (mounted) setAniversariantes([]);
      }
    }

    loadWidgets();
    return () => {
      mounted = false;
    };
  }, []);

  const totalVotos = useMemo(() => {
    if (!enquete?.opcoes?.length) return 0;
    return enquete.opcoes.reduce((acc, opcao) => acc + Number(opcao.votos || 0), 0);
  }, [enquete]);

  return (
    <aside className={`coluna-widgets${collapsed ? ' recolhida' : ''}`}>
      <button
        id="toggle-widgets-btn"
        title="Alternar barra lateral"
        type="button"
        onClick={() => setCollapsed((current) => !current)}
      >
        <i className="fas fa-chevron-right" />
      </button>

      <div className="widgets-content">
        <div className="widget">
          <h3>Aniversariantes do Mes</h3>
          {aniversariantes.length > 0 ? (
            <ul>
              {aniversariantes.map((item) => (
                <li key={item.id || item.nome_formatado}>{item.nome_formatado || 'Colaborador'}</li>
              ))}
            </ul>
          ) : (
            <p>Sem aniversariantes cadastrados para este mes.</p>
          )}
        </div>

        <div className="widget">
          <h3>Posts Recentes</h3>
          {posts.length > 0 ? (
            <ul>
              {posts.map((post) => (
                <li key={post.id || post.titulo}>
                  <strong>{post.titulo || 'Post sem titulo'}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhum post recente encontrado.</p>
          )}
        </div>

        <div className="widget">
          <h3>Enquete da Semana</h3>
          {enquete?.id ? (
            <>
              <p>{enquete.pergunta || 'Pergunta sem texto'}</p>
              <ul>
                {(enquete.opcoes || []).map((opcao) => (
                  <li key={opcao.id || opcao.texto_opcao}>
                    {opcao.texto_opcao || 'Opcao'} ({opcao.votos || 0})
                  </li>
                ))}
              </ul>
              <small>Total de votos: {totalVotos}</small>
            </>
          ) : (
            <p>Nenhuma enquete ativa.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
