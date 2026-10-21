import { FormEvent, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Pencil, Trash2 } from 'lucide-react';

export type SedeAlvo = 'todas' | 'curitiba' | 'sao_paulo' | 'rio';

export type EventoIntranet = {
  id: number;
  titulo: string;
  descricao?: string | null;
  data_evento: string;
  sede_alvo?: SedeAlvo;
  ativo: number;
};

export type NovoEventoIntranet = Omit<EventoIntranet, 'id'>;

type Props = {
  eventos: EventoIntranet[];
  onCreate: (evento: NovoEventoIntranet) => Promise<boolean>;
  onUpdate: (evento: EventoIntranet) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
};

type FormState = {
  titulo: string;
  descricao: string;
  hora: string;
  diaInteiro: boolean;
  sede_alvo: SedeAlvo;
  ativo: boolean;
};

const FORM_VAZIO: FormState = {
  titulo: '',
  descricao: '',
  hora: '09:00',
  diaInteiro: false,
  sede_alvo: 'todas',
  ativo: true
};

const SEDES: { value: SedeAlvo; label: string }[] = [
  { value: 'todas', label: 'Todas as sedes' },
  { value: 'curitiba', label: 'Curitiba' },
  { value: 'sao_paulo', label: 'Sao Paulo' },
  { value: 'rio', label: 'Rio de Janeiro' }
];

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

// Sem horario (00:00) a sidebar exibe "Dia inteiro".
const HORA_DIA_INTEIRO = '00:00';

function toDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function eventoDateKey(evento: EventoIntranet) {
  return evento.data_evento.slice(0, 10);
}

function eventoHora(evento: EventoIntranet) {
  return evento.data_evento.slice(11, 16) || HORA_DIA_INTEIRO;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sedeLabel(sede?: SedeAlvo) {
  return SEDES.find((item) => item.value === sede)?.label || 'Todas as sedes';
}

export function AdminEventosCalendario({ eventos, onCreate, onUpdate, onDelete }: Props) {
  const hojeKey = toDateKey(new Date());
  const [selectedKey, setSelectedKey] = useState(hojeKey);
  const [mesVisivel, setMesVisivel] = useState(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [saving, setSaving] = useState(false);

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, EventoIntranet[]>();
    for (const evento of eventos) {
      const key = eventoDateKey(evento);
      if (!key) continue;
      map.set(key, [...(map.get(key) || []), evento]);
    }
    for (const lista of map.values()) {
      lista.sort((a, b) => a.data_evento.localeCompare(b.data_evento));
    }
    return map;
  }, [eventos]);

  // Grade fixa de 6 semanas comecando no domingo anterior ao dia 1.
  const dias = useMemo(() => {
    const inicio = new Date(mesVisivel);
    inicio.setDate(1 - mesVisivel.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const dia = new Date(inicio);
      dia.setDate(inicio.getDate() + index);
      return dia;
    });
  }, [mesVisivel]);

  const selectedDate = parseDateKey(selectedKey);
  const eventosDoDia = eventosPorDia.get(selectedKey) || [];
  const mesLabel = capitalize(
    mesVisivel.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  );
  const diaLabel = capitalize(
    selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  );

  function mudarMes(delta: number) {
    setMesVisivel((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function selecionarDia(date: Date) {
    setSelectedKey(toDateKey(date));
    if (date.getMonth() !== mesVisivel.getMonth() || date.getFullYear() !== mesVisivel.getFullYear()) {
      setMesVisivel(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  function cancelarEdicao() {
    setEditingId(null);
    setForm(FORM_VAZIO);
  }

  function iniciarEdicao(evento: EventoIntranet) {
    const hora = eventoHora(evento);
    setEditingId(evento.id);
    selecionarDia(parseDateKey(eventoDateKey(evento)));
    setForm({
      titulo: evento.titulo,
      descricao: evento.descricao || '',
      hora: hora === HORA_DIA_INTEIRO ? FORM_VAZIO.hora : hora,
      diaInteiro: hora === HORA_DIA_INTEIRO,
      sede_alvo: evento.sede_alvo || 'todas',
      ativo: Boolean(evento.ativo)
    });
  }

  async function excluir(evento: EventoIntranet) {
    const ok = await onDelete(evento.id);
    if (ok && editingId === evento.id) cancelarEdicao();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    const titulo = form.titulo.trim();
    if (!titulo) return;

    const payload: NovoEventoIntranet = {
      titulo,
      descricao: form.descricao.trim(),
      data_evento: `${selectedKey}T${form.diaInteiro ? HORA_DIA_INTEIRO : form.hora}`,
      sede_alvo: form.sede_alvo,
      ativo: form.ativo ? 1 : 0
    };

    setSaving(true);
    const ok = editingId
      ? await onUpdate({ id: editingId, ...payload })
      : await onCreate(payload);
    setSaving(false);
    if (ok) cancelarEdicao();
  }

  return (
    <div className="agenda-admin">
      <div className="agenda-cal">
        <div className="agenda-cal-head">
          <button type="button" className="admin-icon-btn" aria-label="Mes anterior" onClick={() => mudarMes(-1)}>
            <ChevronLeft size={18} />
          </button>
          <strong className="agenda-cal-title">{mesLabel}</strong>
          <button type="button" className="admin-icon-btn" aria-label="Proximo mes" onClick={() => mudarMes(1)}>
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="agenda-weekdays">
          {DIAS_SEMANA.map((dia) => (
            <span key={dia}>{dia}</span>
          ))}
        </div>

        <div className="agenda-grid">
          {dias.map((dia) => {
            const key = toDateKey(dia);
            const lista = eventosPorDia.get(key) || [];
            const classes = [
              'agenda-day',
              dia.getMonth() !== mesVisivel.getMonth() ? 'is-outside' : '',
              key === hojeKey ? 'is-today' : '',
              key === selectedKey ? 'is-selected' : ''
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                type="button"
                key={key}
                className={classes}
                aria-pressed={key === selectedKey}
                aria-label={`${dia.toLocaleDateString('pt-BR')}${lista.length ? `, ${lista.length} evento(s)` : ''}`}
                onClick={() => selecionarDia(dia)}
              >
                <span>{dia.getDate()}</span>
                {lista.length ? (
                  <span className="agenda-dots" aria-hidden="true">
                    {lista.slice(0, 3).map((evento) => (
                      <i key={evento.id} className={evento.ativo ? '' : 'is-inactive'} />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="agenda-cal-foot">
          <button type="button" className="admin-btn secondary" onClick={() => selecionarDia(new Date())}>
            Hoje
          </button>
          <span className="agenda-legend">
            <i /> Ativo <i className="is-inactive" /> Inativo
          </span>
        </div>
      </div>

      <div className="agenda-side">
        <div className="agenda-side-head">
          <h4>{diaLabel}</h4>
          <span>
            {eventosDoDia.length
              ? `${eventosDoDia.length} evento${eventosDoDia.length > 1 ? 's' : ''}`
              : 'Sem eventos'}
          </span>
        </div>

        {eventosDoDia.length ? (
          <ul className="agenda-list">
            {eventosDoDia.map((evento) => {
              const hora = eventoHora(evento);
              return (
                <li
                  key={evento.id}
                  className={`agenda-event${editingId === evento.id ? ' is-editing' : ''}${evento.ativo ? '' : ' is-inactive'}`}
                >
                  <span className="agenda-event-time">
                    {hora === HORA_DIA_INTEIRO ? 'Dia inteiro' : hora}
                  </span>
                  <div className="agenda-event-info">
                    <strong>{evento.titulo}</strong>
                    <span className="agenda-event-meta">
                      <MapPin size={12} /> {sedeLabel(evento.sede_alvo)}
                      {!evento.ativo ? <em className="agenda-badge">Inativo</em> : null}
                    </span>
                    {evento.descricao ? <p>{evento.descricao}</p> : null}
                  </div>
                  <div className="agenda-event-actions">
                    <button
                      type="button"
                      className="admin-icon-btn"
                      aria-label={`Editar ${evento.titulo}`}
                      onClick={() => iniciarEdicao(evento)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn danger"
                      aria-label={`Excluir ${evento.titulo}`}
                      onClick={() => excluir(evento)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="agenda-empty">Nenhum evento neste dia. Cadastre um abaixo.</p>
        )}

        <form className="agenda-form" onSubmit={enviar}>
          <div className="agenda-form-head">
            <h5>{editingId ? 'Editar evento' : 'Novo evento'}</h5>
            <span>{selectedDate.toLocaleDateString('pt-BR')}</span>
          </div>
          {editingId ? (
            <small className="agenda-hint">Para mudar a data, selecione outro dia no calendario.</small>
          ) : null}

          <label className="agenda-field">
            <span>Titulo</span>
            <input
              placeholder="Ex.: Festa de fim de ano"
              value={form.titulo}
              onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
              required
            />
          </label>

          <div className="agenda-form-row">
            <label className="agenda-field">
              <span>Horario</span>
              <input
                type="time"
                value={form.diaInteiro ? '' : form.hora}
                disabled={form.diaInteiro}
                required={!form.diaInteiro}
                onChange={(e) => setForm((p) => ({ ...p, hora: e.target.value }))}
              />
            </label>
            <label className="agenda-field">
              <span>Sede</span>
              <select
                value={form.sede_alvo}
                onChange={(e) => setForm((p) => ({ ...p, sede_alvo: e.target.value as SedeAlvo }))}
              >
                {SEDES.map((sede) => (
                  <option key={sede.value} value={sede.value}>
                    {sede.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="agenda-checks">
            <label className="check">
              <input
                type="checkbox"
                checked={form.diaInteiro}
                onChange={(e) => setForm((p) => ({ ...p, diaInteiro: e.target.checked }))}
              />
              Dia inteiro
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
              />
              Ativo (aparece na sidebar)
            </label>
          </div>

          <label className="agenda-field">
            <span>
              Descricao <em>(opcional)</em>
            </span>
            <textarea
              rows={3}
              value={form.descricao}
              onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
            />
          </label>

          <div className="agenda-form-actions">
            {editingId ? (
              <button type="button" className="admin-btn secondary" onClick={cancelarEdicao}>
                Cancelar
              </button>
            ) : null}
            <button type="submit" className="admin-btn primary" disabled={saving}>
              {saving ? 'Salvando...' : editingId ? 'Salvar alteracoes' : 'Cadastrar evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
