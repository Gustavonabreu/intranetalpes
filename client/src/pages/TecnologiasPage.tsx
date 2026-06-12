import { Link } from 'react-router-dom';

export function TecnologiasPage() {
  return (
    <>
      <div className="faixa-titulo">
        <h2>Ferramentas de IA</h2>
      </div>

      <div className="tecnologias-grid">
        <Link to="/ia/chatgpt" className="container-card-tech">
          <div
            className="card-tech"
            style={{
              backgroundImage: "url('https://dummyimage.com/320x440/0f172a/ffffff&text=ChatGPT')"
            }}
          >
            <div className="card-tech-title">ChatGPT 4.0</div>
          </div>
        </Link>

        <Link to="/ia/elevenlabs" className="container-card-tech">
          <div
            className="card-tech"
            style={{
              backgroundImage: "url('https://dummyimage.com/320x440/1f2937/ffffff&text=ElevenLabs')"
            }}
          >
            <div className="card-tech-title">ElevenLabs Audio</div>
          </div>
        </Link>
      </div>
    </>
  );
}
