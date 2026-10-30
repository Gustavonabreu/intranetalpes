// Temas das campanhas de foto (mesma lista de FOTO_CAMPANHA_TEMAS no backend).
export type FotoCampanhaTema = 'criancas' | 'natal' | 'pascoa' | 'halloween' | 'outro';

export const FOTO_CAMPANHA_TEMAS: { id: FotoCampanhaTema; label: string; emoji: string }[] = [
  { id: 'criancas', label: 'Dia das Criancas', emoji: '🎈' },
  { id: 'natal', label: 'Natal', emoji: '🎄' },
  { id: 'pascoa', label: 'Pascoa', emoji: '🐰' },
  { id: 'halloween', label: 'Halloween', emoji: '🎃' },
  { id: 'outro', label: 'Outro', emoji: '⭐' }
];

export function temaFotoCampanha(id?: string) {
  return FOTO_CAMPANHA_TEMAS.find((tema) => tema.id === id) || FOTO_CAMPANHA_TEMAS[4];
}

// Campanha vigente que o /api/equipe anexa ao colaborador.
export type CampanhaFotoAtiva = {
  id: number;
  nome: string;
  tema: FotoCampanhaTema;
  revelar: boolean;
};
