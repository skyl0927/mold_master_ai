import { ApiConfig } from '../types';

export const DEFAULT_AGENT_SERVER_URL = 'http://127.0.0.1:8000';

const normalizeUrl = (value: string | undefined, fallback: string): string => {
    const candidate = value?.trim();
    if (!candidate) return fallback;
    return candidate.replace(/\/+$/, '');
};

export const getRuntimeConfig = async (): Promise<ApiConfig | null> => {
    try {
        return await window.electronAPI.getApiConfig();
    } catch (error) {
        console.warn('[runtimeConfig] Failed to load config:', error);
        return null;
    }
};

export const getAgentServerBaseUrl = async (): Promise<string> => {
    const config = await getRuntimeConfig();
    return normalizeUrl(config?.agentServerUrl, DEFAULT_AGENT_SERVER_URL);
};
