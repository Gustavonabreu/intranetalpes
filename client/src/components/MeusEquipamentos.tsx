import React, { useEffect, useState } from 'react';
import { Monitor, Laptop, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { LEGACY_API_BASE_URL } from '../services/legacyApi';

interface Equipamento {
  id_glpi: number;
  nome: string;
  fabricante: string;
  status: string;
}

export default function MeusEquipamentos() {
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    const carregarEquipamentos = async () => {
      try {
        const response = await fetch(`${LEGACY_API_BASE_URL}/api/meus-equipamentos`, {
          method: 'GET',
          credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || data.mensagem || 'Falha ao carregar equipamentos.');
        }

        setEquipamentos(data.equipamentos || []);
        setMensagem(data.mensagem || '');
      } catch (err: any) {
        setErro(err.message);
      } finally {
        setLoading(false);
      }
    };

    carregarEquipamentos();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
        <p>Buscando inventario no GLPI...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center space-x-3">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <p>{erro}</p>
      </div>
    );
  }

  if (equipamentos.length === 0) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 text-center shadow-sm">
        <Monitor className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-slate-800">Nenhum equipamento encontrado</h3>
        <p className="text-slate-500 text-sm mt-1">
          {mensagem || 'Voce nao possui computadores vinculados no momento.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2">
        Meus Equipamentos (TI)
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {equipamentos.map((item) => (
          <div
            key={item.id_glpi}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                {item.nome.toUpperCase().includes('NOTE') ? <Laptop size={24} /> : <Monitor size={24} />}
              </div>

              <span className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
                <CheckCircle2 size={12} />
                <span>{item.status || 'Ativo'}</span>
              </span>
            </div>

            <div className="mt-auto">
              <h4 className="text-slate-800 font-bold text-lg">{item.nome}</h4>
              <p className="text-slate-500 text-sm mt-1">
                Fabricante: <span className="font-medium text-slate-700">{item.fabricante || 'Nao informado'}</span>
              </p>
              <p className="text-slate-400 text-xs mt-3 uppercase tracking-wider">ID GLPI: #{item.id_glpi}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
