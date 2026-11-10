import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Expand, Images, X } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { Swiper as SwiperInstance } from 'swiper';
import { EffectCoverflow, EffectCreative, FreeMode, Keyboard, Navigation, Thumbs, Zoom } from 'swiper/modules';
import { legacyGetJson } from '../services/legacyApi';
import { GaleriaAlbum, GaleriaAlbumComFotos, formatarDataAlbum } from '../services/galeria';

import 'swiper/css';
import 'swiper/css/effect-coverflow';
import 'swiper/css/effect-creative';
import 'swiper/css/free-mode';
import 'swiper/css/navigation';
import 'swiper/css/thumbs';
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
  const [thumbs, setThumbs] = useState<SwiperInstance | null>(null);
  const [visor, setVisor] = useState<SwiperInstance | null>(null);
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
    setThumbs(null);
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

  const indiceAlbum = useMemo(() => Math.max(0, albuns.findIndex((item) => item.id === albumId)), [albuns, albumId]);

  // Chamado pelo Swiper (que guarda o handler da montagem): nao comparar com albumId aqui,
  // ele estaria desatualizado. Repetir o mesmo id nao recarrega nada.
  function escolherAlbum(indice: number) {
    const escolhido = albuns[indice];
    if (!escolhido) return;
    setAlbumId(escolhido.id);
    setSearchParams({ album: String(escolhido.id) }, { replace: true });
  }

  function fecharTelaCheia(indice: number) {
    setTelaCheia(null);
    visor?.slideTo(indice, 0);
  }

  const fotos = album?.id === albumId ? album.fotos : [];
  const legendaAtual = fotos[fotoAtual]?.legenda;

  return (
    <section className="galeria">
      <header className="galeria-topo">
        <span className="galeria-selo">
          <Images size={14} /> Galeria
        </span>
        <h2>Momentos Alpes</h2>
        <p>
          {albuns.length
            ? `${albuns.length} ${albuns.length === 1 ? 'album' : 'albuns'} · deslize para escolher`
            : 'Os registros dos nossos eventos e encontros.'}
        </p>
      </header>

      {carregando ? <div className="galeria-vazio">Carregando galeria...</div> : null}
      {erro ? <div className="galeria-vazio">{erro}</div> : null}
      {!carregando && !erro && !albuns.length ? (
        <div className="galeria-vazio">
          <Images size={40} />
          Nenhum album publicado ainda. Em breve as fotos dos nossos eventos aparecem aqui.
        </div>
      ) : null}

      {albuns.length ? (
        <>
          {/* Albuns em carrossel 3D: o do centro e o que esta aberto no visor abaixo. */}
          <Swiper
            className="galeria-albuns"
            modules={[EffectCoverflow, Keyboard]}
            effect="coverflow"
            centeredSlides
            slidesPerView="auto"
            slideToClickedSlide
            grabCursor
            initialSlide={indiceAlbum}
            keyboard={{ enabled: true, onlyInViewport: true }}
            coverflowEffect={{ rotate: 0, stretch: 0, depth: 220, modifier: 1, scale: 0.86, slideShadows: false }}
            onSlideChange={(swiper) => escolherAlbum(swiper.activeIndex)}
          >
            {albuns.map((item) => (
              <SwiperSlide key={item.id} className="galeria-album-slide">
                <article className={`galeria-album${item.id === albumId ? ' ativo' : ''}`}>
                  {item.capa_url ? <img src={item.capa_url} alt="" loading="lazy" /> : null}
                  <div className="galeria-album-info">
                    <span className="galeria-album-qtd">{totalFotosTexto(item.total_fotos)}</span>
                    <h3>{item.titulo}</h3>
                    {item.data_evento ? <time>{formatarDataAlbum(item.data_evento)}</time> : null}
                  </div>
                </article>
              </SwiperSlide>
            ))}
          </Swiper>

          <div className="galeria-visor-area">
            <div className="galeria-visor-cabecalho">
              <div>
                <h3>{album?.titulo || albuns[indiceAlbum]?.titulo}</h3>
                {album?.descricao ? <p>{album.descricao}</p> : null}
              </div>
              {fotos.length ? (
                <span className="galeria-contador">
                  <strong>{String(fotoAtual + 1).padStart(2, '0')}</strong> / {String(fotos.length).padStart(2, '0')}
                </span>
              ) : null}
            </div>

            {carregandoAlbum && !fotos.length ? <div className="galeria-vazio">Carregando fotos...</div> : null}

            {fotos.length ? (
              <>
                <div className="galeria-visor">
                  <Swiper
                    key={albumId}
                    modules={[EffectCreative, Keyboard, Navigation, Thumbs]}
                    effect="creative"
                    creativeEffect={{
                      prev: { shadow: false, translate: ['-30%', 0, -500], opacity: 0 },
                      next: { shadow: false, translate: ['100%', 0, 0] }
                    }}
                    speed={650}
                    grabCursor
                    keyboard={{ enabled: true, onlyInViewport: true }}
                    navigation={{ prevEl: '.galeria-seta.anterior', nextEl: '.galeria-seta.proxima' }}
                    thumbs={{ swiper: thumbs && !thumbs.destroyed ? thumbs : null }}
                    onSwiper={setVisor}
                    onSlideChange={(swiper) => setFotoAtual(swiper.activeIndex)}
                  >
                    {fotos.map((foto, indice) => (
                      <SwiperSlide key={foto.id} className="galeria-foto-slide">
                        {/* Fundo: a propria foto desfocada, para fotos em pe nao ficarem com faixas vazias. */}
                        <div className="galeria-foto-fundo" style={{ backgroundImage: `url("${foto.imagem_url}")` }} />
                        <img
                          src={foto.imagem_url}
                          alt={foto.legenda || `Foto ${indice + 1} de ${album?.titulo || 'album'}`}
                          loading={indice < 2 ? 'eager' : 'lazy'}
                          onClick={() => setTelaCheia(indice)}
                        />
                      </SwiperSlide>
                    ))}
                  </Swiper>

                  <button type="button" className="galeria-seta anterior" aria-label="Foto anterior">
                    <ChevronLeft size={24} />
                  </button>
                  <button type="button" className="galeria-seta proxima" aria-label="Proxima foto">
                    <ChevronRight size={24} />
                  </button>
                  <button
                    type="button"
                    className="galeria-expandir"
                    aria-label="Ver em tela cheia"
                    title="Tela cheia"
                    onClick={() => setTelaCheia(fotoAtual)}
                  >
                    <Expand size={18} />
                  </button>
                  {legendaAtual ? <p className="galeria-legenda">{legendaAtual}</p> : null}
                </div>

                <Swiper
                  key={`thumbs-${albumId}`}
                  className="galeria-miniaturas"
                  modules={[FreeMode, Thumbs]}
                  onSwiper={setThumbs}
                  slidesPerView="auto"
                  spaceBetween={10}
                  freeMode
                  watchSlidesProgress
                >
                  {fotos.map((foto, indice) => (
                    <SwiperSlide key={foto.id} className="galeria-miniatura">
                      <img src={foto.imagem_url} alt={`Miniatura ${indice + 1}`} loading="lazy" />
                    </SwiperSlide>
                  ))}
                </Swiper>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      {telaCheia !== null && fotos.length ? (
        <div className="galeria-tela-cheia" role="dialog" aria-modal="true" aria-label="Foto em tela cheia">
          <button
            type="button"
            className="galeria-fechar"
            aria-label="Fechar"
            onClick={() => fecharTelaCheia(telaCheia)}
          >
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
