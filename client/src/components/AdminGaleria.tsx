import { ChangeEvent, DragEvent, FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Images, Pencil, Plus, Star, Trash2, UploadCloud, X } from 'lucide-react';
import { legacyGetJson, legacyMutateJson } from '../services/legacyApi';
import { GaleriaAlbum, GaleriaFoto, formatarDataAlbum, prepararFotoGaleria } from '../services/galeria';
import { AvisoTipo, mensagemDeErro } from './AvisoFlutuante';

type AlbumForm = { titulo: string; descricao: string; data_evento: string; ativo: boolean };

const FORM_VAZIO: AlbumForm = { titulo: '', descricao: '', data_evento: '', ativo: true };

type Envio = { total: number; feitos: number; falhas: number };

export function AdminGaleria({ avisar }: { avisar: (mensagem: string, tipo?: AvisoTipo) => void }) {
  const [albuns, setAlbuns] = useState<GaleriaAlbum[]>([]);
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  // null = sem formulario; 0 = novo album; id = editando.
  const [formId, setFormId] = useState<number | null>(null);
  const [form, setForm] = useState<AlbumForm>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const [fotos, setFotos] = useState<GaleriaFoto[]>([]);
  const [carregandoFotos, setCarregandoFotos] = useState(false);
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const selecionado = albuns.find((album) => album.id === selecionadoId) || null;

  async function carregarAlbuns(selecionar?: number) {
    try {
      const data = await legacyGetJson<GaleriaAlbum[]>('/api/admin/galeria');
      setAlbuns(data || []);
      if (selecionar) setSelecionadoId(selecionar);
      else if (!selecionadoId && data?.length) setSelecionadoId(data[0].id);
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao carregar albuns.'), 'erro');
    }
  }

  useEffect(() => {
    carregarAlbuns();
  }, []);

  useEffect(() => {
    if (!selecionadoId) {
      setFotos([]);
      return;
    }
    let ativo = true;
    setCarregandoFotos(true);
    legacyGetJson<GaleriaFoto[]>(`/api/admin/galeria/${selecionadoId}/fotos`)
      .then((data) => ativo && setFotos(data || []))
      .catch((error) => ativo && avisar(mensagemDeErro(error, 'Falha ao carregar fotos.'), 'erro'))
      .finally(() => ativo && setCarregandoFotos(false));
    return () => {
      ativo = false;
    };
  }, [selecionadoId]);

  function abrirNovo() {
    setForm({ ...FORM_VAZIO, data_evento: new Date().toLocaleDateString('en-CA') });
    setFormId(0);
  }

  function abrirEdicao(album: GaleriaAlbum) {
    setForm({
      titulo: album.titulo,
      descricao: album.descricao || '',
      data_evento: album.data_evento || '',
      ativo: Boolean(Number(album.ativo))
    });
    setFormId(album.id);
  }

  async function salvarAlbum(event: FormEvent) {
    event.preventDefault();
    setSalvando(true);
    try {
      if (formId) {
        await legacyMutateJson('PUT', `/api/admin/galeria/${formId}`, form);
        await carregarAlbuns(formId);
        avisar('Album atualizado.');
      } else {
        const result = await legacyMutateJson<{ id: number }>('POST', '/api/admin/galeria', form);
        await carregarAlbuns(result.id);
        avisar('Album criado. Agora envie as fotos.');
      }
      setFormId(null);
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao salvar album.'), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarPublicado(album: GaleriaAlbum) {
    try {
      await legacyMutateJson('PUT', `/api/admin/galeria/${album.id}`, {
        titulo: album.titulo,
        descricao: album.descricao,
        data_evento: album.data_evento,
        ativo: !Number(album.ativo)
      });
      await carregarAlbuns(album.id);
      avisar(Number(album.ativo) ? 'Album ocultado da galeria.' : 'Album publicado na galeria.');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao alterar o album.'), 'erro');
    }
  }

  async function excluirAlbum(album: GaleriaAlbum) {
    const fotosTexto = album.total_fotos ? ` e as ${album.total_fotos} fotos dele` : '';
    if (!window.confirm(`Excluir o album "${album.titulo}"${fotosTexto}? Nao da para desfazer.`)) return;
    try {
      await legacyMutateJson('DELETE', `/api/admin/galeria/${album.id}`);
      if (selecionadoId === album.id) setSelecionadoId(null);
      if (formId === album.id) setFormId(null);
      await carregarAlbuns();
      avisar('Album excluido.');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao excluir album.'), 'erro');
    }
  }

  // Envia em sequencia (uma requisicao por foto), mostrando o progresso.
  async function enviarFotos(arquivos: File[]) {
    const albumId = selecionadoId;
    if (!albumId || !arquivos.length || envio) return;
    const estado: Envio = { total: arquivos.length, feitos: 0, falhas: 0 };
    setEnvio({ ...estado });
    let primeiroErro = '';

    for (const arquivo of arquivos) {
      try {
        const preparada = await prepararFotoGaleria(arquivo);
        const result = await legacyMutateJson<{ foto: GaleriaFoto }>('POST', `/api/admin/galeria/${albumId}/fotos`, {
          data_url: preparada.dataUrl,
          largura: preparada.largura,
          altura: preparada.altura
        });
        setFotos((prev) => [...prev, result.foto]);
      } catch (error) {
        estado.falhas += 1;
        if (!primeiroErro) primeiroErro = mensagemDeErro(error, `Falha ao enviar "${arquivo.name}".`);
      }
      estado.feitos += 1;
      setEnvio({ ...estado });
    }

    setEnvio(null);
    await carregarAlbuns(albumId);
    const enviadas = estado.total - estado.falhas;
    if (estado.falhas) {
      avisar(`${enviadas} de ${estado.total} fotos enviadas. ${primeiroErro}`, 'erro');
    } else {
      avisar(enviadas === 1 ? 'Foto enviada.' : `${enviadas} fotos enviadas.`);
    }
  }

  function escolherArquivos(event: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(event.target.files || []);
    event.target.value = '';
    enviarFotos(arquivos);
  }

  function soltarArquivos(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setArrastando(false);
    enviarFotos(Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith('image/')));
  }

  async function definirCapa(foto: GaleriaFoto) {
    if (!selecionado) return;
    try {
      await legacyMutateJson('PUT', `/api/admin/galeria/${selecionado.id}/capa`, { foto_id: foto.id });
      await carregarAlbuns(selecionado.id);
      avisar('Capa do album atualizada.');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao definir capa.'), 'erro');
    }
  }

  async function moverFoto(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;
    if (!selecionado || destino < 0 || destino >= fotos.length) return;
    const anterior = fotos;
    const nova = [...fotos];
    [nova[indice], nova[destino]] = [nova[destino], nova[indice]];
    setFotos(nova);
    try {
      await legacyMutateJson('PUT', `/api/admin/galeria/${selecionado.id}/ordem`, { ids: nova.map((f) => f.id) });
      // A capa padrao e a primeira foto: recarrega a lista para refletir a troca.
      if (!selecionado.capa_foto_id && (indice === 0 || destino === 0)) await carregarAlbuns(selecionado.id);
    } catch (error) {
      setFotos(anterior);
      avisar(mensagemDeErro(error, 'Falha ao reordenar.'), 'erro');
    }
  }

  async function salvarLegenda(foto: GaleriaFoto, legenda: string) {
    const valor = legenda.trim();
    if (valor === (foto.legenda || '')) return;
    try {
      await legacyMutateJson('PUT', `/api/admin/galeria/fotos/${foto.id}`, { legenda: valor });
      setFotos((prev) => prev.map((item) => (item.id === foto.id ? { ...item, legenda: valor || null } : item)));
      avisar('Legenda salva.');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao salvar legenda.'), 'erro');
    }
  }

  async function removerFoto(foto: GaleriaFoto) {
    if (!selecionado || !window.confirm('Remover esta foto do album?')) return;
    try {
      await legacyMutateJson('DELETE', `/api/admin/galeria/fotos/${foto.id}`);
      setFotos((prev) => prev.filter((item) => item.id !== foto.id));
      await carregarAlbuns(selecionado.id);
      avisar('Foto removida.');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao remover foto.'), 'erro');
    }
  }

  function renderForm() {
    return (
      <form className="agenda-form" onSubmit={salvarAlbum}>
        <div className="agenda-form-head">
          <h5>{formId ? 'Editar album' : 'Novo album'}</h5>
        </div>

        <label className="agenda-field">
          <span>Titulo</span>
          <input
            value={form.titulo}
            maxLength={120}
            required
            placeholder="Ex.: Festa de fim de ano 2026"
            onChange={(event) => setForm((prev) => ({ ...prev, titulo: event.target.value }))}
          />
        </label>

        <label className="agenda-field">
          <span>Data do evento</span>
          <input
            type="date"
            value={form.data_evento}
            onChange={(event) => setForm((prev) => ({ ...prev, data_evento: event.target.value }))}
          />
        </label>

        <label className="agenda-field">
          <span>
            Descricao <em>(opcional)</em>
          </span>
          <textarea
            rows={3}
            maxLength={2000}
            value={form.descricao}
            onChange={(event) => setForm((prev) => ({ ...prev, descricao: event.target.value }))}
          />
        </label>

        <div className="agenda-checks">
          <label className="check">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(event) => setForm((prev) => ({ ...prev, ativo: event.target.checked }))}
            />
            Publicado na galeria
          </label>
        </div>

        <small className="agenda-hint">
          O album so aparece na Galeria quando estiver publicado e tiver pelo menos uma foto.
        </small>

        <div className="agenda-form-actions">
          <button type="button" className="admin-btn secondary" onClick={() => setFormId(null)}>
            Cancelar
          </button>
          <button type="submit" className="admin-btn primary" disabled={salvando}>
            {salvando ? 'Salvando...' : formId ? 'Salvar alteracoes' : 'Criar album'}
          </button>
        </div>
      </form>
    );
  }

  function renderFotos() {
    if (!selecionado) {
      return (
        <div className="agenda-empty">Crie um album (ex.: Confraternizacao de Natal) e envie as fotos do evento.</div>
      );
    }

    const capaId = selecionado.capa_foto_id || fotos[0]?.id;
    const progresso = envio ? Math.round((envio.feitos / envio.total) * 100) : 0;

    return (
      <>
        <div className="campanha-detalhe-head">
          <div>
            <h4>{selecionado.titulo}</h4>
            <p>
              {selecionado.data_evento ? `${formatarDataAlbum(selecionado.data_evento)} · ` : ''}
              {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}
              <span className={`campanha-status ${Number(selecionado.ativo) ? 'no-ar' : 'desativada'}`}>
                {Number(selecionado.ativo) ? 'Publicado' : 'Oculto'}
              </span>
            </p>
          </div>
          <button type="button" className="admin-btn secondary" onClick={() => abrirEdicao(selecionado)}>
            <Pencil size={14} /> Editar
          </button>
        </div>

        <label
          className={`galeria-admin-drop${arrastando ? ' arrastando' : ''}${envio ? ' enviando' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={soltarArquivos}
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            disabled={Boolean(envio)}
            onChange={escolherArquivos}
          />
          {envio ? (
            <>
              <strong>
                Enviando {Math.min(envio.feitos + 1, envio.total)} de {envio.total}...
              </strong>
              <span className="galeria-admin-barra">
                <span style={{ width: `${progresso}%` }} />
              </span>
            </>
          ) : (
            <>
              <UploadCloud size={28} />
              <strong>Arraste as fotos aqui ou clique para escolher</strong>
              <small>Pode selecionar varias de uma vez. JPG, PNG ou WEBP; reduzimos o tamanho automaticamente.</small>
            </>
          )}
        </label>

        {carregandoFotos ? <p className="agenda-hint">Carregando fotos...</p> : null}
        {!carregandoFotos && !fotos.length ? <div className="agenda-empty">Este album ainda nao tem fotos.</div> : null}

        <ul className="galeria-admin-fotos">
          {fotos.map((foto, indice) => (
            <li key={foto.id} className={`galeria-admin-foto${foto.id === capaId ? ' capa' : ''}`}>
              <div className="galeria-admin-foto-img">
                <img src={foto.imagem_url} alt={foto.legenda || `Foto ${indice + 1}`} loading="lazy" />
                {foto.id === capaId ? <span className="galeria-admin-capa-selo">Capa</span> : null}
                <button
                  type="button"
                  className="galeria-admin-remover"
                  aria-label="Remover foto"
                  title="Remover foto"
                  onClick={() => removerFoto(foto)}
                >
                  <X size={14} />
                </button>
              </div>
              <input
                className="galeria-admin-legenda"
                placeholder="Legenda (opcional)"
                maxLength={255}
                defaultValue={foto.legenda || ''}
                onBlur={(event) => salvarLegenda(foto, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <div className="galeria-admin-foto-acoes">
                <button
                  type="button"
                  className="admin-icon-btn"
                  title="Mover para antes"
                  aria-label="Mover para antes"
                  disabled={indice === 0}
                  onClick={() => moverFoto(indice, -1)}
                >
                  <ArrowLeft size={14} />
                </button>
                <button
                  type="button"
                  className={`admin-icon-btn${foto.id === capaId ? ' ativo' : ''}`}
                  title={foto.id === capaId ? 'Capa do album' : 'Usar como capa'}
                  aria-label="Usar como capa"
                  disabled={foto.id === capaId}
                  onClick={() => definirCapa(foto)}
                >
                  <Star size={14} fill={foto.id === capaId ? 'currentColor' : 'none'} />
                </button>
                <button
                  type="button"
                  className="admin-icon-btn"
                  title="Mover para depois"
                  aria-label="Mover para depois"
                  disabled={indice === fotos.length - 1}
                  onClick={() => moverFoto(indice, 1)}
                >
                  <ArrowRight size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="campanhas-admin">
      <aside className="campanhas-lista">
        <div className="campanhas-lista-head">
          <h4>Albuns</h4>
          <button type="button" className="admin-btn primary" onClick={abrirNovo}>
            <Plus size={14} /> Novo
          </button>
        </div>

        {!albuns.length ? <div className="agenda-empty">Nenhum album ainda.</div> : null}

        <ul>
          {albuns.map((album) => (
            <li key={album.id}>
              <button
                type="button"
                className={`campanha-item ${selecionadoId === album.id ? 'ativo' : ''}`}
                onClick={() => {
                  setSelecionadoId(album.id);
                  setFormId(null);
                }}
              >
                <span className="galeria-admin-item-capa" aria-hidden="true">
                  {album.capa_url ? <img src={album.capa_url} alt="" /> : <Images size={18} />}
                </span>
                <span className="campanha-item-info">
                  <strong>{album.titulo}</strong>
                  <small>
                    {album.data_evento ? `${formatarDataAlbum(album.data_evento)} · ` : ''}
                    {album.total_fotos} {Number(album.total_fotos) === 1 ? 'foto' : 'fotos'}
                  </small>
                  <span className={`campanha-status ${Number(album.ativo) ? 'no-ar' : 'desativada'}`}>
                    {Number(album.ativo) ? 'Publicado' : 'Oculto'}
                  </span>
                </span>
              </button>
              <div className="campanha-item-acoes">
                <button
                  type="button"
                  className="admin-icon-btn"
                  title={Number(album.ativo) ? 'Ocultar da galeria' : 'Publicar na galeria'}
                  aria-label={Number(album.ativo) ? `Ocultar ${album.titulo}` : `Publicar ${album.titulo}`}
                  onClick={() => alternarPublicado(album)}
                >
                  {Number(album.ativo) ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  className="admin-icon-btn"
                  title="Excluir"
                  aria-label={`Excluir ${album.titulo}`}
                  onClick={() => excluirAlbum(album)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <section className="campanhas-detalhe">{formId !== null ? renderForm() : renderFotos()}</section>
    </div>
  );
}
