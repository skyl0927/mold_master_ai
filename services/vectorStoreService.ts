
import { DocumentChunk } from '../types';
import { generateEmbedding } from './aiCore';

let documentChunks: DocumentChunk[] = [];
let isLoaded = false;

export const loadVectorStore = async () => {
    if (isLoaded) return;
    try {
        const data = await window.electronAPI.getVectorStore();
        if (Array.isArray(data)) {
            documentChunks = data;
        }
        isLoaded = true;
    } catch (e) {
        console.error("Error loading vector store:", e);
    }
};

// --- Vector Search Logic ---

const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * (vecB[i] ?? 0), 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
};

export const getRelevantChunks = async (query: string, topK = 3): Promise<DocumentChunk[]> => {
    if (!isLoaded) await loadVectorStore();
    if (documentChunks.length === 0) return [];

    const queryEmbedding = await generateEmbedding(query);

    const scoredChunks = documentChunks.map(chunk => ({
        ...chunk,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scoredChunks.sort((a, b) => b.similarity - a.similarity);

    return scoredChunks.slice(0, topK);
};
