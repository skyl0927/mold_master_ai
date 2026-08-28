import { getAgentServerBaseUrl } from './runtimeConfig';
import { fetchWithCommonAgentPolicy } from '../commonAgentTransport';
import { COMMON_AGENT_HEALTH_PATHS } from '../commonAgentHealthPolicy';

export interface ServerHealthStatus {
    rag: 'online' | 'offline';
    agent: 'online' | 'offline';
    checkedAt: number;
}

const tryGet = async (url: string): Promise<boolean> => {
    try {
        const response = await fetchWithCommonAgentPolicy(
            url,
            { method: 'GET' },
            { timeoutMs: 5000 }
        );
        if (!response.ok) return false;

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
};

export const checkAgentServerStatus = async (): Promise<boolean> => {
    try {
        const baseUrl = await getAgentServerBaseUrl();
        const candidates = COMMON_AGENT_HEALTH_PATHS.map(path => `${baseUrl}${path}`);

        for (const url of candidates) {
            if (await tryGet(url)) return true;
        }
        return false;
    } catch {
        return false;
    }
};

export const checkServerHealth = async (): Promise<ServerHealthStatus> => {
    const agentOnline = await checkAgentServerStatus();
    return {
        rag: agentOnline ? 'online' : 'offline',
        agent: agentOnline ? 'online' : 'offline',
        checkedAt: Date.now()
    };
};
