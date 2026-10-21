type Props = {
  svg: string;
  // Prefixo unico por logo: os SVGs do brand kit repetem os ids dos gradientes (g1, g2).
  idPrefix: string;
  className?: string;
};

// SVG inline (e nao <img>) para o texto usar a Montserrat carregada pela pagina.
// Conteudo vem dos arquivos locais do brand kit, nao de entrada do usuario.
export function ApexLogo({ svg, idPrefix, className }: Props) {
  const html = svg
    .replace(/id="(g\d+)"/g, `id="${idPrefix}-$1"`)
    .replace(/url\(#(g\d+)\)/g, `url(#${idPrefix}-$1)`)
    .replace('<svg ', '<svg aria-hidden="true" focusable="false" ');

  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
