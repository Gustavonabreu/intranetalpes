import mysql from 'mysql2/promise';

type GlpiEquipmentRow = {
  id: number;
  name: string | null;
  serial: string | null;
  otherserial: string | null;
  last_inventory_update: string | Date | null;
  modelo: string | null;
  fabricante: string | null;
  tipo: string; // Adicionado para sabermos o que é o objeto se precisar
};

const glpiDbPool = mysql.createPool({
  host: process.env.GLPI_DB_HOST,
  user: process.env.GLPI_DB_USER,
  password: process.env.GLPI_DB_PASSWORD,
  database: process.env.GLPI_DB_DATABASE,
  port: parseInt(process.env.GLPI_DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 8,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

function ensureGlpiDbConfig() {
  if (
    !process.env.GLPI_DB_HOST ||
    !process.env.GLPI_DB_USER ||
    !process.env.GLPI_DB_DATABASE
  ) {
    throw new Error(
      'GLPI DB nao configurado. Defina GLPI_DB_HOST, GLPI_DB_USER, GLPI_DB_PASSWORD, GLPI_DB_DATABASE e GLPI_DB_PORT.'
    );
  }
}

export async function fetchEquipamentosByGlpiUserId(glpiUserId: number) {
  ensureGlpiDbConfig();

  // A query agora faz um UNION buscando de múltiplos tipos de ativos do GLPI
  const [rows] = await glpiDbPool.query(
    `
    -- 1. Computadores
    SELECT c.id, c.name, c.serial, c.otherserial, c.last_inventory_update, cm.name AS modelo, m.name AS fabricante, 'Computador' AS tipo
    FROM glpi_computers c
    LEFT JOIN glpi_computermodels cm ON cm.id = c.computermodels_id
    LEFT JOIN glpi_manufacturers m ON m.id = c.manufacturers_id
    WHERE c.users_id = ? AND c.is_deleted = 0

    UNION ALL

    -- 2. Monitores
    SELECT mo.id, mo.name, mo.serial, mo.otherserial, NULL as last_inventory_update, mm.name AS modelo, m.name AS fabricante, 'Monitor' AS tipo
    FROM glpi_monitors mo
    LEFT JOIN glpi_monitormodels mm ON mm.id = mo.monitormodels_id
    LEFT JOIN glpi_manufacturers m ON m.id = mo.manufacturers_id
    WHERE mo.users_id = ? AND mo.is_deleted = 0

    UNION ALL

    -- 3. Periféricos (Mouses, Teclados, Webcams, etc)
    SELECT p.id, p.name, p.serial, p.otherserial, NULL as last_inventory_update, pm.name AS modelo, m.name AS fabricante, 'Periférico' AS tipo
    FROM glpi_peripherals p
    LEFT JOIN glpi_peripheralmodels pm ON pm.id = p.peripheralmodels_id
    LEFT JOIN glpi_manufacturers m ON m.id = p.manufacturers_id
    WHERE p.users_id = ? AND p.is_deleted = 0

    UNION ALL

    -- 4. Telefones
    SELECT ph.id, ph.name, ph.serial, ph.otherserial, NULL as last_inventory_update, phm.name AS modelo, m.name AS fabricante, 'Telefone' AS tipo
    FROM glpi_phones ph
    LEFT JOIN glpi_phonemodels phm ON phm.id = ph.phonemodels_id
    LEFT JOIN glpi_manufacturers m ON m.id = ph.manufacturers_id
    WHERE ph.users_id = ? AND ph.is_deleted = 0

    UNION ALL

    -- 5. Equipamentos de Rede (Roteadores, Switches, etc)
    SELECT n.id, n.name, n.serial, n.otherserial, NULL as last_inventory_update, nm.name AS modelo, m.name AS fabricante, 'Rede' AS tipo
    FROM glpi_networkequipments n
    LEFT JOIN glpi_networkequipmentmodels nm ON nm.id = n.networkequipmentmodels_id
    LEFT JOIN glpi_manufacturers m ON m.id = n.manufacturers_id
    WHERE n.users_id = ? AND n.is_deleted = 0

    ORDER BY name ASC, id ASC
    `,
    [glpiUserId, glpiUserId, glpiUserId, glpiUserId, glpiUserId] // Passando o ID para cada um dos 5 blocos do UNION
  );

  const data = rows as GlpiEquipmentRow[];
  return data.map((item) => ({
    id_glpi: Number(item.id || 0),
    nome: String(item.name || 'Sem nome'),
    tipo: String(item.tipo), // Adicionado no retorno caso queira exibir na listagem
    fabricante: String(item.fabricante || 'Nao informado'),
    modelo: String(item.modelo || 'Nao informado'),
    serial: String(item.serial || ''),
    patrimonio: String(item.otherserial || ''),
    last_inventory_update: item.last_inventory_update || null
  }));
}