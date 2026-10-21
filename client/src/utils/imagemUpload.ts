// Mesmo limite do backend (saveBase64Image em api.routes.ts).
export const IMAGEM_MAX_BYTES = 5 * 1024 * 1024;

export function formatMb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

// Valida antes de enviar, para nao gastar o upload com um arquivo que o servidor recusaria.
export function validarImagemUpload(file: File) {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    return 'Formato nao suportado. Use JPG, PNG ou WEBP.';
  }
  if (file.size > IMAGEM_MAX_BYTES) {
    return `O arquivo tem ${formatMb(file.size)} e o limite e 5 MB. Exporte em JPG/WEBP com qualidade ~80%.`;
  }
  return null;
}
