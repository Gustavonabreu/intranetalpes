import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Expand, Images, X } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow, Keyboard, Navigation, Pagination, Zoom } from 'swiper/modules';
import { legacyGetJson } from '../services/legacyApi';
import { GaleriaAlbum, GaleriaAlbumComFotos, formatarDataAlbum } from '../services/galeria';

import 'swiper/css';
import 'swiper/css/effect-coverflow';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'swiper/css/zoom';
import '../styles/galeria.css';

function totalFotosTexto(total: number) {
  return `${total} ${total === 1 ? 'foto' : 'fotos'}`;
}

export function GaleriaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [albuns, setAlbuns] = useState<GaleriaAlbum[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [albumId, setAlbumId] = useState<number | null>(null);
  const [album, setAlbum] = useState<GaleriaAlbumComFotos | null>(null);
  const [carregandoAlbum, setCarregandoAlbum] = useState(false);

  const [fotoAtual, setFotoAtual] = useState(0);
  const [telaCheia, setTelaCheia] = useState<number | null>(null);

  useEffect(() => {
    let ativo = true;
    legacyGetJson<GaleriaAlbum[]>('/api/galeria')
      .then((data) => {
        if (!ativo) return;
        const lista = data || [];
        setAlbuns(lista);
        // ?album=ID abre direto naquele album (link compartilhado).
        const pedido = Number(searchParams.get('album'));
        const inicial = lista.find((item) => item.id === pedido) || lista[0];
        if (inicial) setAlbumId(inicial.id);
      })
      .catch(() => ativo && setErro('Nao foi possivel carregar a galeria.'))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (!albumId) return;
    let ativo = true;
    setCarregandoAlbum(true);
    setFotoAtual(0);
    legacyGetJson<GaleriaAlbumComFotos>(`/api/galeria/${albumId}`)
      .then((data) => ativo && setAlbum(data))
      .catch(() => ativo && setAlbum(null))
      .finally(() => ativo && setCarregandoAlbum(false));
    return () => {
      ativo = false;
    };
  }, [albumId]);

  // Esc fecha a tela cheia; a rolagem da pagina fica travada enquanto ela esta aberta.
  useEffect(() => {
    if (telaCheia === null) return;
    function teclado(event: KeyboardEvent) {
      if (event.key === 'Escape') setTelaCheia(null);
    }
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', teclado);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener('keydown', teclado);
    };
  }, [telaCheia]);

  function escolherAlbum(id: number) {
    setAlbumId(id);
    setSearchParams({ album: String(id) }, { replace: true });
  }

  const fotos = album?.id === albumId ? album.fotos : [];
  const albumAtual = useMemo(() => albuns.find((item) => item.id === albumId) || null, [albuns, albumId]);
  const detalheAlbum = [albumAtual?.titulo, formatarDataAlbum(albumAtual?.data_evento || null)]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="galeria">
      <header className="galeria-topo">
        <h2>Galeria</h2>
        <p>Os registros dos nossos eventos e encontros.</p>
      </header>

      {carregando ? <div className="galeria-vazio">Carregando galeria...</div> : null}
      {erro ? <div className="galeria-vazio">{erro}</div> : null}
      {!carregando && !erro && !albuns.length ? (
        <div className="galeria-vazio">
          <Images size={40} />
          Nenhum album publicado ainda. Em breve as fotos dos nossos eventos aparecem aqui.
        </div>
      ) : null}

      {albuns.length > 1 ? (
        <nav className="galeria-abas" aria-label="Albuns">
          {albuns.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === albumId ? 'ativo' : ''}
              aria-pressed={item.id === albumId}
              onClick={() => escolherAlbum(item.id)}
            >
              {item.titulo}
              <span>{item.total_fotos}</span>
            </button>
          ))}
        </nav>
      ) : null}

      {albumAtual ? (
        <div className="galeria-album-cabecalho">
          <h3>{albumAtual.titulo}</h3>
          <p>
            {[formatarDataAlbum(albumAtual.data_evento), totalFotosTexto(albumAtual.total_fotos)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {album?.descricao ? <p className="galeria-album-descricao">{album.descricao}</p> : null}
        </div>
      ) : null}

      {carregandoAlbum && !fotos.length ? <div className="galeria-vazio">Carregando fotos...</div> : null}

      {fotos.length ? (
        <div className="galeria-carrossel">
          <button type="button" className="galeria-seta anterior" aria-label="Foto anterior">
            <ChevronLeft size={34} strokeWidth={1.75} />
          </button>

          {/* Foto do centro em destaque; as vizinhas aparecem menores e apagadas nas laterais. */}
          <Swiper
            key={albumId}
            className="galeria-slides"
            modules={[EffectCoverflow, Keyboard, Navigation, Pagination]}
            effect="coverflow"
            centeredSlides
            slidesPerView="auto"
            slideToClickedSlide
            grabCursor
            speed={600}
            keyboard={{ enabled: true, onlyInViewport: true }}
            navigation={{ prevEl: '.galeria-seta.anterior', nextEl: '.galeria-seta.proxima' }}
            pagination={{ clickable: true, dynamicBullets: fotos.length > 7 }}
            coverflowEffect={{ rotate: 0, stretch: 0, depth: 160, modifier: 1, scale: 0.82, slideShadows: false }}
            onSlideChange={(swiper) => setFotoAtual(swiper.activeIndex)}
          >
            {fotos.map((foto, indice) => (
              <SwiperSlide key={foto.id} className="galeria-slide">
                <img
                  src={foto.imagem_url}
                  alt={foto.legenda || `Foto ${indice + 1} de ${albumAtual?.titulo || 'album'}`}
                  loading={indice < 3 ? 'eager' : 'lazy'}
                  onClick={() => indice === fotoAtual && setTelaCheia(indice)}
                />
                <div className="galeria-slide-legenda">
                  <h4>{foto.legenda || albumAtual?.titulo}</h4>
                  <p>{foto.legenda ? detalheAlbum : formatarDataAlbum(albumAtual?.data_evento || null)}</p>
                </div>
                <button
                  type="button"
                  className="galeria-expandir"
                  aria-label="Ver em tela cheia"
                  title="Tela cheia"
                  tabIndex={indice === fotoAtual ? 0 : -1}
                  onClick={() => setTelaCheia(indice)}
                >
                  <Expand size={16} />
                </button>
              </SwiperSlide>
            ))}
          </Swiper>

          <button type="button" className="galeria-seta proxima" aria-label="Proxima foto">
            <ChevronRight size={34} strokeWidth={1.75} />
          </button>
        </div>
      ) : null}

      {telaCheia !== null && fotos.length ? (
        <div className="galeria-tela-cheia" role="dialog" aria-modal="true" aria-label="Foto em tela cheia">
          <button type="button" className="galeria-fechar" aria-label="Fechar" onClick={() => setTelaCheia(null)}>
            <X size={22} />
          </button>
          <Swiper
            modules={[Keyboard, Navigation, Zoom]}
            initialSlide={telaCheia}
            zoom={{ maxRatio: 3 }}
            keyboard={{ enabled: true }}
            navigation
            spaceBetween={24}
            onSlideChange={(swiper) => setTelaCheia(swiper.activeIndex)}
          >
            {fotos.map((foto, indice) => (
              <SwiperSlide key={foto.id}>
                <div className="swiper-zoom-container">
                  <img src={foto.imagem_url} alt={foto.legenda || `Foto ${indice + 1}`} />
                </div>
                {foto.legenda ? <p className="galeria-tela-cheia-legenda">{foto.legenda}</p> : null}
              </SwiperSlide>
            ))}
          </Swiper>
          <span className="galeria-tela-cheia-dica">
            {telaCheia + 1} / {fotos.length} · duplo clique para dar zoom · Esc para fechar
          </span>
        </div>
      ) : null}
    </section>
  );
}
