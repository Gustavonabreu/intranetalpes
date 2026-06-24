import { useEffect, useMemo, useRef, useState } from 'react';
import { legacyGetJson } from '../services/legacyApi';

type Funcionario = {
  nome_formatado?: string;
};

export function SorteadorPage() {
  const [allNames, setAllNames] = useState<string[]>([]);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [nameFilter, setNameFilter] = useState('');
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

  const visibleNames = useMemo(() => {
    const filter = nameFilter.trim().toLowerCase();
    if (!filter) return allNames;
    return allNames.filter((name) => name.toLowerCase().includes(filter));
  }, [allNames, nameFilter]);

  function toggleName(name: string) {
    setSelectedNames((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    );
  }

  function toggleSelectAll() {
    setSelectedNames(allSelected ? [] : allNames);
  }

  function clearSelection() {
    setSelectedNames([]);
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
          <div className="sorteador-summary">
            <div className="summary-card">
              <small>Total de colaboradores</small>
              <strong>{allNames.length}</strong>
            </div>
            <div className="summary-card">
              <small>Selecionados</small>
              <strong>{selectedNames.length}</strong>
            </div>
            <div className="summary-card">
              <small>Prêmio</small>
              <strong>{premio.trim() ? 'Definido' : 'Pendente'}</strong>
            </div>
          </div>

          <div id="etapa-selecao" className="sorteador-step-card">
            <h3>1. Selecione os participantes</h3>
            <div className="sorteador-toolbar">
              <input
                type="text"
                className="sorteador-search"
                placeholder="Buscar participante..."
                value={nameFilter}
                onChange={(event) => setNameFilter(event.target.value)}
              />
              <div className="sorteador-toolbar-actions">
                <button id="selecionar-todos-btn" className="btn-secundario" onClick={toggleSelectAll}>
                  {allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
                </button>
                <button className="btn-secundario" onClick={clearSelection}>
                  Limpar
                </button>
              </div>
            </div>
            <div id="lista-funcionarios" className="lista-selecao">
              {loading ? <p>Carregando funcionarios...</p> : null}
              {error ? <p style={{ color: 'red' }}>{error}</p> : null}
              {!loading && !error
                ? visibleNames.map((name) => (
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
          </div>

          <div id="etapa-premio" className="sorteador-step-card">
            <h3>2. Qual e o prêmio?</h3>
            <input
              type="text"
              id="premio-input"
              placeholder="Ex: Fone de ouvido Bluetooth"
              value={premio}
              onChange={(event) => setPremio(event.target.value)}
            />
          </div>

          <div className="sorteador-footer-action">
            <button id="iniciar-sorteio-btn" className="btn-principal" onClick={startDraw}>
              Sortear Agora!
            </button>
          </div>
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
