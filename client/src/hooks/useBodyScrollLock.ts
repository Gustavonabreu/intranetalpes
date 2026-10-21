import { useEffect } from 'react';

// Trava a rolagem da pagina enquanto `active` (ex.: modal aberto).
// O html tem overflow-x: hidden, entao a rolagem e do <html>, nao do <body>: trava os dois.
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const html = document.documentElement;
    const { body } = document;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight
    };

    // Compensa a barra de rolagem que some, para o layout nao "pular".
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.paddingRight = previous.bodyPaddingRight;
    };
  }, [active]);
}
