
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export const OPENAI_PRIMARY_MODEL = 'gpt-5.6';
export const OPENAI_EFFICIENT_MODEL = 'gpt-5.6-luna';
export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const OPENAI_VISION_MAX_COMPLETION_TOKENS = 1200;

// --- API Client Management ---
export const getClients = async () => {
    // Retrieve config from Electron main process (encrypted store)
    const config = await window.electronAPI.getApiConfig();

    // Fallback to env if no config (for dev/web mode), but prioritize config
    // Logic update: Select key based on provider
    const provider = config?.provider || 'gemini';
    let apiKey = '';

    if (config) {
        if (provider === 'gemini') {
            apiKey = config.geminiApiKey || config.apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY || '';
        } else {
            apiKey = config.openAiApiKey || config.apiKey || process.env.OPENAI_API_KEY || process.env.API_KEY || '';
        }
    } else {
        apiKey = provider === 'gemini'
            ? (process.env.GEMINI_API_KEY || process.env.API_KEY || '')
            : (process.env.OPENAI_API_KEY || process.env.API_KEY || '');
    }

    if (!apiKey) {
        console.error("API Key not found for provider:", provider);
        throw new Error(`${provider === 'gemini' ? 'Google Gemini' : 'OpenAI'} API 키가 설정되지 않았습니다. 설정 메뉴에서 키를 입력해주세요.`);
    }

    if (provider === 'gemini') {
        const geminiClient = new GoogleGenAI({ apiKey: apiKey });
        return { provider: 'gemini' as const, client: geminiClient, apiKey: apiKey };
    } else {
        const openaiClient = new OpenAI({
            apiKey: apiKey,
            dangerouslyAllowBrowser: true,
            maxRetries: 3,
            timeout: 20000
        });
        return { provider: 'openai' as const, client: openaiClient, apiKey: apiKey };
    }
};

// --- Error Handling ---
export const handleApiError = (error: unknown): Error => {
    console.error("AI Service Error:", error);
    if (error instanceof Error) {
        const msg = error.message;

        if (msg.includes('401')) return new Error(`인증 실패 (401): API 키가 올바르지 않습니다. 설정에서 키를 확인해주세요.`);
        if (msg.includes('429')) return new Error(`할당량 초과 (429): API 사용량 한도를 확인해주세요.`);
        if (msg.includes('Failed to fetch')) return new Error(`네트워크 차단됨: 방화벽이나 프록시 설정을 확인해주세요.`);
        if (msg.includes('Connection error')) return new Error(`연결 실패: 인터넷 연결을 확인해주세요.`);

        return new Error(`AI 처리 오류: ${msg}`);
    }
    return new Error("알 수 없는 오류가 발생했습니다.");
};

export const generateEmbedding = async (text: string): Promise<number[]> => {
    try {
        const { provider, client } = await getClients();
        if (provider === 'gemini' && client instanceof GoogleGenAI) {
            const res = await client.models.embedContent({ model: "text-embedding-004", contents: { parts: [{ text }] } });
            if (!res.embeddings || !res.embeddings[0]) throw new Error("Gemini Embedding failed");
            return res.embeddings[0].values;
        } else if (provider === 'openai' && client instanceof OpenAI) {
        const response = await client.embeddings.create({
                model: OPENAI_EMBEDDING_MODEL,
                input: text,
            });
            return response.data[0].embedding;
        }
    } catch (e) {
        throw handleApiError(e);
    }
    return [];
};
