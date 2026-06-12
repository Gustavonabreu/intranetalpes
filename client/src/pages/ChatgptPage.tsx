import { FormEvent, useEffect, useRef, useState } from 'react';
import { LEGACY_API_BASE_URL } from '../services/legacyApi';

type ChatMessage = {
  id: string;
  text: string;
  type: 'assistant' | 'user' | 'loading' | 'assistant error';
};

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

export function ChatgptPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      type: 'assistant',
      text: 'Ola! Sou o assistente de texto da Intranet Alpes. Como posso ajudar hoje?'
    }
  ]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  function autoResizeTextarea() {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const userMessage = input.trim();
    if (!userMessage) return;

    const loadingId = `loading-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, type: 'user', text: userMessage },
      { id: loadingId, type: 'loading', text: '' }
    ]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const csrfToken = getCookie('csrftoken');
      const response = await fetch(`${LEGACY_API_BASE_URL}/api/gerar-texto/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {})
        },
        credentials: 'include',
        body: JSON.stringify({ prompt: userMessage })
      });

      const data = (await response.json().catch(() => ({}))) as { response?: string; error?: string };
      setMessages((current) => {
        const withoutLoading = current.filter((msg) => msg.id !== loadingId);
        if (response.ok) {
          return [
            ...withoutLoading,
            {
              id: `assistant-${Date.now()}`,
              type: 'assistant',
              text: data.response || 'Sem resposta.'
            }
          ];
        }
        return [
          ...withoutLoading,
          {
            id: `assistant-error-${Date.now()}`,
            type: 'assistant error',
            text: data.error || 'Ocorreu um erro.'
          }
        ];
      });
    } catch {
      setMessages((current) => {
        const withoutLoading = current.filter((msg) => msg.id !== loadingId);
        return [
          ...withoutLoading,
          {
            id: `assistant-error-${Date.now()}`,
            type: 'assistant error',
            text: 'Erro de conexao. Tente novamente.'
          }
        ];
      });
    }
  }

  return (
    <div className="chat-page-container">
      <div className="chat-header">
        <img
          src="https://dummyimage.com/80x80/0f172a/ffffff&text=GPT"
          alt="Logo ChatGPT"
        />
        <div className="header-info">
          <h2>Assistente de Texto</h2>
          <p>Powered by OpenAI GPT-4</p>
        </div>
      </div>

      <div className="chat-messages" id="chat-messages" ref={messagesRef}>
        {messages.map((message) => (
          <div className={`message ${message.type}`} key={message.id}>
            {message.type === 'loading' ? (
              <div className="loading-dots">
                <span />
                <span />
                <span />
              </div>
            ) : (
              <p>{message.text}</p>
            )}
          </div>
        ))}
      </div>

      <div className="chat-input-area">
        <form className="chat-input-form" id="chat-form" onSubmit={onSubmit}>
          <textarea
            id="chat-input"
            placeholder="Digite sua pergunta..."
            rows={1}
            value={input}
            ref={textareaRef}
            onChange={(event) => {
              setInput(event.target.value);
              autoResizeTextarea();
            }}
            required
          />
          <button type="submit" title="Enviar Mensagem">
            <i className="fas fa-paper-plane" />
          </button>
        </form>
      </div>
    </div>
  );
}
