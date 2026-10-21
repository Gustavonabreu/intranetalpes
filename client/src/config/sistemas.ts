// Atalhos do cabecalho para os outros sistemas do grupo.
// URLs padrao abaixo; podem ser sobrescritas por VITE_* no build. Sem URL o item fica desabilitado.
// Logos: versao compacta dark do APEX-BRAND-KIT (o menu usa card escuro).
import apexEscuro from '../assets/apex/apex_sistema_compact_dark.svg?raw';
import apexBiEscuro from '../assets/apex/apex_bi_compact_dark.svg?raw';
import apexDemandasEscuro from '../assets/apex/apex_demandas_e_projetos_compact_dark.svg?raw';

export type SistemaAtalho = {
  id: string;
  nome: string;
  logo: string;
  url: string;
};

export const SISTEMAS: SistemaAtalho[] = [
  {
    id: 'apex',
    nome: 'Apex Sistema',
    logo: apexEscuro,
    url: (import.meta.env.VITE_APEX_URL || 'https://apex.alpesmidia.digital/login').trim()
  },
  {
    id: 'apex-bi',
    nome: 'Apex BI',
    logo: apexBiEscuro,
    url: (import.meta.env.VITE_APEX_BI_URL || 'https://apexbi.alpesmidia.digital/login').trim()
  },
  {
    id: 'apex-solicitacoes',
    nome: 'Apex Demandas e Projetos',
    logo: apexDemandasEscuro,
    url: (import.meta.env.VITE_APEX_SOLICITACOES_URL || 'https://apexsolicitacoes.alpesmidia.digital/').trim()
  }
];
