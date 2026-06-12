import React from 'react';
import MeusEquipamentos from '../components/MeusEquipamentos'; // Deixe sem o .tsx no final da importação

export default function EquipamentosPage() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Inventário de TI</h1>
        <p className="text-slate-500 text-sm">Visualize os equipamentos vinculados ao seu usuário.</p>
      </div>
      
      {/* Aqui chamamos o componente que faz a mágica de bater na API do GLPI */}
      <MeusEquipamentos />
    </div>
  );
}