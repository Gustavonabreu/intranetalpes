export function Footer() {
  return (
    <footer className="footer-redesenhado">
      <div className="footer-container">
        <div className="footer-coluna sobre-grupo">
          <h3 className="footer-titulo">Grupo Alpes</h3>
          <p>
            O Grupo Alpes e referencia em solucoes tecnologicas, comunicacao empresarial e
            inovacao.
          </p>
        </div>

        <div className="footer-coluna sedes-secao">
          <h3 className="footer-titulo">Nossas Sedes</h3>
          <div className="sedes-container">
            <div className="sede-card">
              <img src="https://dummyimage.com/80x80/cccccc/333333&text=CWB" alt="Curitiba" />
              <div className="sede-info">
                <h4>Curitiba</h4>
                <p>Av. Desembargador Hugo Simas, 1231</p>
              </div>
            </div>
            <div className="sede-card">
              <img src="https://dummyimage.com/80x80/cccccc/333333&text=SP" alt="Sao Paulo" />
              <div className="sede-info">
                <h4>Sao Paulo</h4>
                <p>Av. Paulista, 807</p>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-coluna Contato-secao">
          <h3 className="footer-titulo">Contato</h3>
          <p>Whatsapp: (11) 99999-9999</p>
        </div>
      </div>

      <div className="footer-copyright">
        <p>© 2026 Grupo Alpes. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
