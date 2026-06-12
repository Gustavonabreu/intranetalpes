import { useEffect, useMemo, useRef, useState } from 'react';
import { LEGACY_API_BASE_URL, legacyGetJson } from '../services/legacyApi';

type AudioHistoryItem = {
  id?: number;
  texto_original?: string;
  audio_url?: string;
};

const VOICES = [
  { id: 'oWAxZDx7w5z9XcHIZtL4', label: 'Glinda (Calma, Narracao)' },
  { id: 'ODq5zmih8GrVes37Dizd', label: 'Daniel (Profissional, Locutor)' },
  { id: 'jsCqWAovK2LkecY7zXl4', label: 'Gigi (Casual, Conversacional)' },
  { id: 'wViXBP_i9ESryB11t9sH', label: 'James (Calmo, Narrador)' }
];

function getCookie(name: string) {
  if (!document.cookie) return null;
  const cookies = document.cookie.split(';');
  for (const rawCookie of cookies) {
    const cookie = rawCookie.trim();
    if (cookie.startsWith(`${name}=`)) {
      return decodeURIComponent(cookie.substring(name.length + 1));
    }
  }
  return null;
}

export function ElevenLabsPage() {
  const [text, setText] = useState('');
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [history, setHistory] = useState<AudioHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [resultAudioUrl, setResultAudioUrl] = useState('');
  const [resultError, setResultError] = useState('');
  const resultObjectUrlRef = useRef<string>('');

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const data = await legacyGetJson<AudioHistoryItem[]>('/api/historico-audios/');
      setHistory(data || []);
    } catch {
      setHistory([]);
      setHistoryError('Nao foi possivel carregar o historico.');
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
    return () => {
      if (resultObjectUrlRef.current) {
        URL.revokeObjectURL(resultObjectUrlRef.current);
      }
    };
  }, []);

  const charCount = useMemo(() => text.length, [text]);

  async function generateAudio() {
    setResultError('');
    setGenerating(true);

    if (resultObjectUrlRef.current) {
      URL.revokeObjectURL(resultObjectUrlRef.current);
      resultObjectUrlRef.current = '';
      setResultAudioUrl('');
    }

    try {
      const csrfToken = getCookie('csrftoken');
      const response = await fetch(`${LEGACY_API_BASE_URL}/api/gerar-audio/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          texto: text,
          voz_id: voiceId
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || 'Erro ao gerar audio.');
      }

      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);
      resultObjectUrlRef.current = url;
      setResultAudioUrl(url);
      await loadHistory();
    } catch (error) {
      setResultError(error instanceof Error ? error.message : 'Erro ao gerar audio.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="audio-page-container">
      <div className="audio-header">
        <img
          src="https://dummyimage.com/80x80/1f2937/ffffff&text=11"
          alt="Logo ElevenLabs"
        />
        <div className="header-info">
          <h2>Gerador de Audio</h2>
          <p>Powered by ElevenLabs</p>
        </div>
      </div>

      <div className="audio-main-content">
        <div className="gerador-coluna">
          <h3>Criar Novo Audio</h3>
          <textarea
            id="texto-para-audio-input"
            rows={8}
            placeholder="Digite ou cole o texto que deseja converter em audio..."
            value={text}
            onChange={(event) => setText(event.target.value)}
          />

          <div className="configuracoes-audio">
            <div className="seletor-voz">
              <label htmlFor="voz-select">Voz</label>
              <select
                name="voz"
                id="voz-select"
                value={voiceId}
                onChange={(event) => setVoiceId(event.target.value)}
              >
                {VOICES.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="controles-geracao">
            <div id="char-counter" className="char-counter">
              {charCount} / 2500
            </div>
            <button
              id="gerar-audio-btn"
              className="gerar-btn"
              disabled={generating || !text.trim()}
              onClick={generateAudio}
            >
              <i className="fas fa-magic" /> {generating ? 'Gerando...' : 'Gerar Audio'}
            </button>
          </div>

          <div id="audio-resultado-container">
            {resultError ? <p style={{ color: 'red' }}>{resultError}</p> : null}
            {resultAudioUrl ? <audio src={resultAudioUrl} controls autoPlay /> : null}
          </div>
        </div>

        <div className="historico-coluna">
          <h3>Seu Historico</h3>
          <div id="audio-history-list">
            {historyLoading ? <p>Carregando historico...</p> : null}
            {historyError ? <p style={{ color: 'red' }}>{historyError}</p> : null}
            {!historyLoading && !historyError && history.length === 0 ? (
              <p>Nenhum audio gerado ainda.</p>
            ) : null}

            {!historyLoading && !historyError
              ? history.map((item) => (
                  <div className="historico-item" key={item.id || item.audio_url}>
                    <p className="historico-texto">
                      "{(item.texto_original || '').substring(0, 50)}
                      ..."
                    </p>
                    {item.audio_url ? <audio src={item.audio_url} controls /> : null}
                  </div>
                ))
              : null}
          </div>
        </div>
      </div>
    </div>
  );
}
