import { getAgentServerBaseUrl } from './runtimeConfig';

export interface ServerHealthStatus {
    rag: 'online' | 'offline';
    agent: 'online' | 'offline';
    checkedAt: number;
}

const tryGet = async (url: string): Promise<boolean> => {
    try {
        const response = await fetch(url, { method: 'GET' });
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
        const candidates = [`${baseUrl}/healthz`, `${baseUrl}/v1/vision/status`, `${baseUrl}/health`];

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
