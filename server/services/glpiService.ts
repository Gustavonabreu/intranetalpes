const GLPI_API_URL = process.env.GLPI_API_URL;
const GLPI_APP_TOKEN = process.env.GLPI_APP_TOKEN;
const GLPI_USER_TOKEN = process.env.GLPI_USER_TOKEN;
const GLPI_ADMIN_NUMBER_FIELD = process.env.GLPI_ADMIN_NUMBER_FIELD || '16';
const GLPI_COMPUTER_USER_FIELD = process.env.GLPI_COMPUTER_USER_FIELD || '70';
const GLPI_COMPUTER_USER_FIELDS = (process.env.GLPI_COMPUTER_USER_FIELDS || GLPI_COMPUTER_USER_FIELD)
  .split(',')
  .map((field) => field.trim())
  .filter(Boolean);
const GLPI_USER_EMAIL_FIELD = process.env.GLPI_USER_EMAIL_FIELD || '5';
const GLPI_ACTIVE_PROFILE_ID = process.env.GLPI_ACTIVE_PROFILE_ID || '';
const GLPI_ACTIVE_ENTITY_ID = process.env.GLPI_ACTIVE_ENTITY_ID || '';

/**
 * Inicia a sessao na API do GLPI e retorna o session_token
 */
export async function initGLPISession(): Promise<string | null> {
  try {
    const url = `${GLPI_API_URL}/initSession`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': GLPI_APP_TOKEN as string,
        Authorization: `user_token ${GLPI_USER_TOKEN}`
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('GLPI initSession falhou:', response.status, errorBody);
      throw new Error(`Erro HTTP ${response.status}`);
    }

    const data = (await response.json()) as { session_token?: string };
    const sessionToken = data.session_token || null;
    if (!sessionToken) return null;

    // Alguns ambientes GLPI abrem sessao com perfil sem permissao de busca.
    // Se configurado, tentamos ativar perfil/entidade antes das consultas.
    if (GLPI_ACTIVE_PROFILE_ID) {
      await fetch(`${GLPI_API_URL}/changeActiveProfile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': GLPI_APP_TOKEN as string,
          'Session-Token': sessionToken
        },
        body: JSON.stringify({ profiles_id: Number(GLPI_ACTIVE_PROFILE_ID) })
      });
    }

    if (GLPI_ACTIVE_ENTITY_ID) {
      await fetch(`${GLPI_API_URL}/changeActiveEntities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': GLPI_APP_TOKEN as string,
          'Session-Token': sessionToken
        },
        body: JSON.stringify({
          entities_id: Number(GLPI_ACTIVE_ENTITY_ID),
          is_recursive: 1
        })
      });
    }

    return sessionToken;
  } catch (error: any) {
    console.error('Erro ao iniciar sessao no GLPI:', error?.message || error);
    return null;
  }
}

/**
 * Finaliza a sessao do GLPI
 */
export async function killGLPISession(sessionToken: string): Promise<void> {
  try {
    const url = `${GLPI_API_URL}/killSession`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': GLPI_APP_TOKEN as string,
        'Session-Token': sessionToken
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('GLPI killSession falhou:', response.status, errorBody);
    }
  } catch (error: any) {
    console.error('Erro ao encerrar sessao no GLPI:', error?.message || error);
  }
}

type SearchRow = Record<string, unknown> | unknown[];

function readSearchField(row: SearchRow, index: number, fallback: unknown = null) {
  if (Array.isArray(row)) return row[index] ?? fallback;
  return row[String(index)] ?? fallback;
}

type SearchResponse = {
  data?: SearchRow[];
  totalcount?: number;
  count?: number;
};

/**
 * Busca o ID numerico do usuario no GLPI baseado no Numero Administrativo (ID do MySQL)
 */
export async function buscarIdUsuarioGLPI(
  sessionToken: string,
  mysqlUserId: number,
  options?: { login?: string | null; email?: string | null }
): Promise<number | null> {
  try {
    const criteriaValue = encodeURIComponent(String(mysqlUserId));
    const searchTypes = ['equals', 'contains'];

    for (const searchType of searchTypes) {
      const urlBusca =
        `${GLPI_API_URL}/search/User` +
        `?criteria[0][field]=${GLPI_ADMIN_NUMBER_FIELD}` +
        `&criteria[0][searchtype]=${searchType}` +
        `&criteria[0][value]=${criteriaValue}` +
        '&forcedisplay[0]=2&forcedisplay[1]=1';

      const response = await fetch(urlBusca, {
        method: 'GET',
        headers: {
          'App-Token': GLPI_APP_TOKEN as string,
          'Session-Token': sessionToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('GLPI search/User falhou:', response.status, errorBody);
        throw new Error(`Erro HTTP ${response.status}`);
      }

      const data = (await response.json()) as SearchResponse;
      const total = Number(data.totalcount ?? data.count ?? data.data?.length ?? 0);
      if (!data?.data?.length) {
        console.log(
          `GLPI search/User sem resultado para mysql id ${mysqlUserId} (field=${GLPI_ADMIN_NUMBER_FIELD}, searchtype=${searchType})`
        );
        continue;
      }

      const userIdRaw = readSearchField(data.data[0], 2, null);
      const userName = String(readSearchField(data.data[0], 1, ''));
      const userId = Number(userIdRaw);

      if (Number.isFinite(userId) && userId > 0) {
        console.log(
          `GLPI search/User encontrou user_id=${userId} nome="${userName}" (total=${total}, searchtype=${searchType})`
        );
        return userId;
      }
    }

    const loginValues = [options?.login].map((v) => String(v || '').trim()).filter(Boolean);
    const emailValues = [options?.email].map((v) => String(v || '').trim()).filter(Boolean);

    for (const value of loginValues) {
      const criteriaValueFallback = encodeURIComponent(value);
      for (const searchType of ['equals', 'contains']) {
        const urlBusca =
          `${GLPI_API_URL}/search/User` +
          `?criteria[0][field]=1` +
          `&criteria[0][searchtype]=${searchType}` +
          `&criteria[0][value]=${criteriaValueFallback}` +
          '&forcedisplay[0]=2&forcedisplay[1]=1';

        const response = await fetch(urlBusca, {
          method: 'GET',
          headers: {
            'App-Token': GLPI_APP_TOKEN as string,
            'Session-Token': sessionToken,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) continue;
        const data = (await response.json()) as SearchResponse;
        if (!data?.data?.length) continue;

        const userIdRaw = readSearchField(data.data[0], 2, null);
        const userName = String(readSearchField(data.data[0], 1, ''));
        const userId = Number(userIdRaw);
        if (Number.isFinite(userId) && userId > 0) {
          console.log(
            `GLPI fallback search/User encontrou user_id=${userId} nome="${userName}" por field=1 valor="${value}" (${searchType})`
          );
          return userId;
        }
      }
    }

    for (const value of emailValues) {
      const criteriaValueFallback = encodeURIComponent(value.toLowerCase());
      for (const searchType of ['equals', 'contains']) {
        const urlBusca =
          `${GLPI_API_URL}/search/User` +
          `?criteria[0][field]=${GLPI_USER_EMAIL_FIELD}` +
          `&criteria[0][searchtype]=${searchType}` +
          `&criteria[0][value]=${criteriaValueFallback}` +
          '&forcedisplay[0]=2&forcedisplay[1]=1';

        const response = await fetch(urlBusca, {
          method: 'GET',
          headers: {
            'App-Token': GLPI_APP_TOKEN as string,
            'Session-Token': sessionToken,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) continue;
        const data = (await response.json()) as SearchResponse;
        if (!data?.data?.length) continue;

        const userIdRaw = readSearchField(data.data[0], 2, null);
        const userName = String(readSearchField(data.data[0], 1, ''));
        const userId = Number(userIdRaw);
        if (Number.isFinite(userId) && userId > 0) {
          console.log(
            `GLPI fallback search/User encontrou user_id=${userId} nome="${userName}" por email field=${GLPI_USER_EMAIL_FIELD} valor="${value}" (${searchType})`
          );
          return userId;
        }
      }
    }

    return null;
  } catch (error: any) {
    console.error('Erro ao buscar usuario no GLPI:', error?.message || error);
    return null;
  }
}

/**
 * Busca os computadores vinculados ao ID do usuario no GLPI
 */
export async function buscarEquipamentosUsuario(sessionToken: string, glpiUserId: number) {
  try {
    const criteriaValue = encodeURIComponent(String(glpiUserId));

    for (const field of GLPI_COMPUTER_USER_FIELDS) {
      const urlBusca =
        `${GLPI_API_URL}/search/Computer` +
        `?criteria[0][field]=${field}` +
        '&criteria[0][searchtype]=equals' +
        `&criteria[0][value]=${criteriaValue}` +
        '&forcedisplay[0]=2&forcedisplay[1]=1&forcedisplay[2]=23&forcedisplay[3]=31';

      const response = await fetch(urlBusca, {
        method: 'GET',
        headers: {
          'App-Token': GLPI_APP_TOKEN as string,
          'Session-Token': sessionToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('GLPI search/Computer falhou:', response.status, errorBody);
        throw new Error(`Erro HTTP ${response.status}`);
      }

      const data = (await response.json()) as SearchResponse;
      const equipamentos = (data.data || [])
        .map((row) => ({
          id_glpi: Number(readSearchField(row, 2, 0)) || 0,
          nome: String(readSearchField(row, 1, 'Sem nome')),
          fabricante: String(readSearchField(row, 23, 'Nao informado')),
          status: String(readSearchField(row, 31, 'Nao informado'))
        }))
        .filter((item) => item.id_glpi > 0);

      if (equipamentos.length > 0) {
        console.log(
          `GLPI search/Computer encontrou ${equipamentos.length} equipamento(s) para user_id=${glpiUserId} usando field=${field}`
        );
        return equipamentos;
      }

      console.log(
        `GLPI search/Computer sem equipamentos para user_id=${glpiUserId} usando field=${field}`
      );
    }

    return [];
  } catch (error: any) {
    console.error('Erro ao buscar equipamentos no GLPI:', error?.message || error);
    return [];
  }
}
