export type GaleriaAlbum = {
  id: number;
  titulo: string;
  descricao: string | null;
  data_evento: string | null;
  ativo: number;
  capa_foto_id: number | null;
  total_fotos: number;
  capa_url: string | null;
};

export type GaleriaFoto = {
  id: number;
  imagem_url: string;
  legenda: string | null;
  largura: number | null;
  altura: number | null;
  ordem: number;
};

export type GaleriaAlbumComFotos = GaleriaAlbum & { fotos: GaleriaFoto[] };

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// "2026-11-10" -> "10 nov 2026"
export function formatarDataAlbum(iso: string | null) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return '';
  return `${dia} ${MESES[mes - 1]} ${ano}`;
}

// Lado maior da foto enviada. Fotos de celular (4000px+, 5-10 MB) ficam com ~300-600 KB.
const LADO_MAXIMO = 2000;
const QUALIDADE_JPEG = 0.85;

export type FotoPreparada = { dataUrl: string; largura: number; altura: number };

// Reduz e converte para JPEG no navegador antes do upload (o servidor aceita ate 5 MB).
export async function prepararFotoGaleria(file: File): Promise<FotoPreparada> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    throw new Error(`"${file.name}": formato nao suportado. Use JPG, PNG ou WEBP.`);
  }

  // createImageBitmap ja aplica a rotacao da camera (EXIF) nos navegadores atuais.
  const bitmap = await createImageBitmap(file);
  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Seu navegador nao conseguiu processar a imagem.');
    // PNG com transparencia: fundo branco em vez de preto no JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(bitmap, 0, 0, largura, altura);

    return { dataUrl: canvas.toDataURL('image/jpeg', QUALIDADE_JPEG), largura, altura };
  } finally {
    bitmap.close();
  }
}
