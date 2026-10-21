import { DragEvent, FormEvent, useState } from 'react';
import { ImagePlus, UploadCloud, X } from 'lucide-react';
import { validarImagemUpload } from '../utils/imagemUpload';

export type NoticiaFormValues = {
  titulo: string;
  conteudo: string;
  autor_nome: string;
  imagem_destaque_url: string;
  data_inicio: string;
  data_fim: string;
  ativo: boolean;
};

export const NOTICIA_VAZIA: NoticiaFormValues = {
  titulo: '',
  conteudo: '',
  autor_nome: '',
  imagem_destaque_url: '',
  data_inicio: '',
  data_fim: '',
  ativo: true
};

type Props = {
  modo: 'criar' | 'editar';
  inicial: NoticiaFormValues;
  autorPadrao: string;
  uploadImagem: (file: File) => Promise<string>;
  onSubmit: (values: NoticiaFormValues) => Promise<boolean>;
  onCancel: () => void;
};

const TITULO_MAX = 255;
const RESUMO_CARD = 150; // mesmo corte do card em NoticiasPage

export function NoticiaForm({ modo, inicial, autorPadrao, uploadImagem, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<NoticiaFormValues>(inicial);
  const [erro, setErro] = useState('');
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mostrarUrl, setMostrarUrl] = useState(false);

  function set<K extends keyof NoticiaFormValues>(campo: K, valor: NoticiaFormValues[K]) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function enviarArquivo(file: File) {
    const problema = validarImagemUpload(file);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro('');
    try {
      setEnviandoImagem(true);
      set('imagem_destaque_url', await uploadImagem(file));
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao enviar imagem.');
    } finally {
      setEnviandoImagem(false);
    }
  }

  function soltar(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) enviarArquivo(file);
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    if (form.data_inicio && form.data_fim && form.data_fim <= form.data_inicio) {
      setErro('O fim da exibicao precisa ser depois do inicio.');
      return;
    }
    setErro('');
    setSalvando(true);
    const ok = await onSubmit({ ...form, titulo: form.titulo.trim() });
    setSalvando(false);
    if (ok && modo === 'criar') setForm(NOTICIA_VAZIA);
  }

  const resumo =
    form.conteudo.length > RESUMO_CARD ? `${form.conteudo.slice(0, RESUMO_CARD)}...` : form.conteudo;

  return (
    <form className="noticia-form" onSubmit={enviar}>
      <div className="noticia-form-preview">
        <span className="noticia-form-label">Previa do card</span>
        <div className="noticia-form-card">
          <label
            className={`noticia-form-imagem${dragOver ? ' is-over' : ''}${form.imagem_destaque_url ? ' has-image' : ''}`}
            style={
              form.imagem_destaque_url
                ? { backgroundImage: `url('${form.imagem_destaque_url}')` }
                : undefined
            }
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={soltar}
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) enviarArquivo(file);
              }}
            />
            <span className="noticia-form-imagem-cta">
              {enviandoImagem ? (
                'Enviando imagem...'
              ) : (
                <>
                  {form.imagem_destaque_url ? <ImagePlus size={20} /> : <UploadCloud size={26} />}
                  <strong>{form.imagem_destaque_url ? 'Trocar imagem' : 'Adicionar imagem'}</strong>
                  {!form.imagem_destaque_url ? <small>Clique ou arraste aqui</small> : null}
                </>
              )}
            </span>
          </label>
          <div className="noticia-form-card-body">
            <strong>{form.titulo.trim() || 'Titulo da noticia'}</strong>
            <p>{resumo || 'O inicio do conteudo aparece aqui no card.'}</p>
            <span>Por: {form.autor_nome.trim() || autorPadrao}</span>
          </div>
        </div>
        <small className="agenda-hint">
          Imagem ideal: 1200 × 600 px (2:1), JPG, PNG ou WEBP ate 5 MB. No card ela e cortada em
          200 px de altura; ao abrir a noticia aparece inteira.
        </small>
        <div className="noticia-form-url">
          {form.imagem_destaque_url ? (
            <button
              type="button"
              className="admin-btn secondary"
              onClick={() => set('imagem_destaque_url', '')}
            >
              <X size={14} /> Remover imagem
            </button>
          ) : null}
          <button type="button" className="noticia-form-link" onClick={() => setMostrarUrl((v) => !v)}>
            {mostrarUrl ? 'Ocultar URL' : 'Usar URL de imagem'}
          </button>
        </div>
        {mostrarUrl ? (
          <label className="agenda-field">
            <span>URL da imagem</span>
            <input
              placeholder="https://..."
              value={form.imagem_destaque_url}
              onChange={(e) => set('imagem_destaque_url', e.target.value)}
            />
          </label>
        ) : null}
      </div>

      <div className="noticia-form-campos">
        <label className="agenda-field">
          <span>
            Titulo{' '}
            <em>
              ({form.titulo.length}/{TITULO_MAX})
            </em>
          </span>
          <input
            placeholder="Ex.: Nova sede em Sao Paulo"
            value={form.titulo}
            maxLength={TITULO_MAX}
            onChange={(e) => set('titulo', e.target.value)}
            required
          />
        </label>

        <label className="agenda-field">
          <span>
            Autor <em>(em branco usa "{autorPadrao}")</em>
          </span>
          <input
            placeholder={autorPadrao}
            value={form.autor_nome}
            onChange={(e) => set('autor_nome', e.target.value)}
          />
        </label>

        <label className="agenda-field">
          <span>Conteudo</span>
          <textarea
            rows={8}
            placeholder="Escreva a noticia. Os primeiros 150 caracteres aparecem no card."
            value={form.conteudo}
            onChange={(e) => set('conteudo', e.target.value)}
            required
          />
        </label>

        <fieldset className="noticia-form-periodo">
          <legend>Periodo de exibicao</legend>
          <div className="agenda-form-row noticia-form-datas">
            <label className="agenda-field">
              <span>Inicio</span>
              <input
                type="datetime-local"
                value={form.data_inicio}
                onChange={(e) => set('data_inicio', e.target.value)}
              />
            </label>
            <label className="agenda-field">
              <span>Fim</span>
              <input
                type="datetime-local"
                value={form.data_fim}
                min={form.data_inicio || undefined}
                onChange={(e) => set('data_fim', e.target.value)}
              />
            </label>
          </div>
          <small className="agenda-hint">
            Em branco: aparece assim que publicar e fica no ar sem data para sair.
          </small>
        </fieldset>

        <label className="check">
          <input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} />
          Ativa (visivel no portal)
        </label>

        {erro ? <p className="hero-aviso">{erro}</p> : null}

        <div className="agenda-form-actions">
          <button type="button" className="admin-btn secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="admin-btn primary" disabled={salvando || enviandoImagem}>
            {salvando ? 'Salvando...' : modo === 'criar' ? 'Publicar noticia' : 'Salvar alteracoes'}
          </button>
        </div>
      </div>
    </form>
  );
}
