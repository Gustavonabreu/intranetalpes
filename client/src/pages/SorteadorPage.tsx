import { useEffect, useMemo, useRef, useState } from 'react';
import { legacyGetJson } from '../services/legacyApi';

type Funcionario = {
  nome_formatado?: string;
};

export function SorteadorPage() {
  const [allNames, setAllNames] = useState<string[]>([]);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [premio, setPremio] = useState('');
  const [winner, setWinner] = useState('');
  const [spinningName, setSpinningName] = useState('');
  const [resultVisible, setResultVisible] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadFuncionarios() {
      setLoading(true);
      setError('');
      try {
        const data = await legacyGetJson<Funcionario[]>('/api/todos-funcionarios/');
        if (!mounted) return;

        const names = (data || [])
          .map((item) => item.nome_formatado?.trim())
          .filter((name): name is string => Boolean(name));

        setAllNames(names);
      } catch {
        if (!mounted) return;
        setError('Erro ao carregar funcionarios.');
        setAllNames([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadFuncionarios();
    return () => {
      mounted = false;
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  const allSelected = useMemo(() => {
    return allNames.length > 0 && selectedNames.length === allNames.length;
  }, [allNames, selectedNames]);

  function toggleName(name: string) {
    setSelectedNames((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    );
  }

  function toggleSelectAll() {
    setSelectedNames(allSelected ? [] : allNames);
  }

  function startDraw() {
    if (selectedNames.length < 2) {
      alert('Selecione pelo menos 2 participantes para o sorteio.');
      return;
    }
    if (!premio.trim()) {
      alert('Por favor, informe qual e o premio.');
      return;
    }

    setResultVisible(true);
    setWinner('');

    const chosenWinner = selectedNames[Math.floor(Math.random() * selectedNames.length)];
    let counter = 0;

    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      const randomName = selectedNames[Math.floor(Math.random() * selectedNames.length)];
      setSpinningName(randomName);
      counter += 1;

      if (counter > 20) {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
        setWinner(chosenWinner);
      }
    }, 100);
  }

  function drawAgain() {
    setResultVisible(false);
    setSpinningName('');
    setWinner('');
  }

  return (
    <>
      <div className="faixa-titulo">
        <h2>Sorteador de Premios</h2>
      </div>

      {!resultVisible ? (
        <div className="sorteador-container">
          <div id="etapa-selecao">
            <h3>1. Selecione os Participantes</h3>
            <div id="lista-funcionarios" className="lista-selecao">
              {loading ? <p>Carregando funcionarios...</p> : null}
              {error ? <p style={{ color: 'red' }}>{error}</p> : null}
              {!loading && !error
                ? allNames.map((name) => (
                    <label className="participante-item" key={name}>
                      <input
                        type="checkbox"
                        name="participante"
                        checked={selectedNames.includes(name)}
                        onChange={() => toggleName(name)}
                      />
                      <span>{name}</span>
                    </label>
                  ))
                : null}
            </div>
            <button id="selecionar-todos-btn" className="btn-secundario" onClick={toggleSelectAll}>
              {allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </button>
          </div>

          <div id="etapa-premio">
            <h3>2. Qual e o premio?</h3>
            <input
              type="text"
              id="premio-input"
              placeholder="Ex: Fone de ouvido Bluetooth"
              value={premio}
              onChange={(event) => setPremio(event.target.value)}
            />
          </div>

          <button id="iniciar-sorteio-btn" className="btn-principal" onClick={startDraw}>
            Sortear Agora!
          </button>
        </div>
      ) : (
        <div id="resultado-sorteio" className="resultado-container">
          <p>O premio e...</p>
          <h2 id="premio-sorteado">{premio}</h2>
          <p>E o vencedor(a) e...</p>
          {!winner ? <div id="animacao-vencedor" className="animacao-nomes">{spinningName}</div> : null}
          {winner ? <h1 id="nome-vencedor" className="nome-vencedor">{winner}</h1> : null}
          {winner ? (
            <button id="sortear-novamente-btn" className="btn-secundario" onClick={drawAgain}>
              Sortear Novamente
            </button>
          ) : null}
        </div>
      )}
    </>
  );
}
