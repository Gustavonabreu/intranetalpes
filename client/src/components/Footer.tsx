import imgCuritiba from '../assets/brand/sede-curitiba.jpg';
import imgSaoPaulo from '../assets/brand/sede-sao-paulo.jpg';
import imgRioJaneiro from '../assets/brand/sede-rio-de-janeiro.jpg';

export function Footer() {
  return (
    <footer className="footer-redesenhado">
      <div className="footer-container">
        <div className="footer-coluna sobre-grupo">
          <h3 className="footer-titulo">Grupo Alpes</h3>
          <p>
            As empresas do grupo oferecem solucoes inovadoras e qualidade excepcional. Com
            compromisso e expertise, destacam-se no mercado com servicos de alto padrao.
          </p>
        </div>

        <div className="footer-coluna sedes-secao">
          <h3 className="footer-titulo">Nossas Sedes</h3>
          <div className="sedes-container">
            <div className="sede-card">
              <img src={imgCuritiba} alt="Curitiba" />
              <div className="sede-info">
                <h4>Curitiba</h4>
                <p>R. Inacio Lustosa, 1000 - Sao Francisco</p>
              </div>
            </div>
            <div className="sede-card">
              <img src={imgSaoPaulo} alt="Sao Paulo" />
              <div className="sede-info">
                <h4>Sao Paulo</h4>
                <p>Av. Paulista, 807, 5o Andar - Conjunto 502 - Bela Vista</p>
              </div>
            </div>
            <div className="sede-card">
              <img src={imgRioJaneiro} alt="Rio de Janeiro" />
              <div className="sede-info">
                <h4>Rio de Janeiro</h4>
                <p>Rua Santa Luzia, 651 - Centro</p>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-coluna Contato-secao">
          <h3 className="footer-titulo">Contato</h3>
          <p>Whatsapp: 0800 887 1567</p>
        </div>
      </div>

      <div className="footer-copyright">
        <p>(c) 2026 Grupo Alpes. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
