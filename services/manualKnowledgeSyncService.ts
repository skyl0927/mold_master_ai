import { CommonAgentApiService } from './commonAgentApiService';

export const MANUAL_DOCUMENT_SYNC_STORAGE_KEY = 'mold-master-ai:manual-documents:v1';
export const MANUAL_DOCUMENTS_CHANGED_EVENT = 'mold-master:manual-documents-changed';

export const readManualDocumentSyncMap = (): Record<string, string> => {
    try {
        const value = JSON.parse(localStorage.getItem(MANUAL_DOCUMENT_SYNC_STORAGE_KEY) || '{}');
        return value && typeof value === 'object' ? value : {};
    } catch {
        return {};
    }
};

export const saveManualDocumentSyncMap = (value: Record<string, string>): void => {
    localStorage.setItem(MANUAL_DOCUMENT_SYNC_STORAGE_KEY, JSON.stringify(value));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event(MANUAL_DOCUMENTS_CHANGED_EVENT));
    }
};

export const listManualDocuments = (): Array<{ fileName: string; documentId: string }> =>
    Object.entries(readManualDocumentSyncMap())
        .filter(([fileName, documentId]) =>
            fileName.trim().length > 0
            && typeof documentId === 'string'
            && documentId.trim().length > 0
        )
        .map(([fileName, documentId]) => ({ fileName, documentId }));

export const getManualDocumentMimeType = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLocaleLowerCase();
    const types: Record<string, string> = {
        txt: 'text/plain',
        csv: 'text/csv',
        md: 'text/markdown',
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    return types[extension || ''] || 'application/octet-stream';
};

export const syncManualDocument = async (
    fileName: string,
    content: Uint8Array
): Promise<string> => {
    const central = await CommonAgentApiService.ingestDocument(fileName, content, {
        mimeType: getManualDocumentMimeType(fileName),
        category: 'mold-master'
    });
    const syncMap = readManualDocumentSyncMap();
    syncMap[fileName] = central.document_id;
    saveManualDocumentSyncMap(syncMap);
    return central.document_id;
};

export const deleteManualDocument = async (fileName: string): Promise<void> => {
    const syncMap = readManualDocumentSyncMap();
    const documentId = syncMap[fileName];
    if (documentId) await CommonAgentApiService.deleteDocument(documentId);
    delete syncMap[fileName];
    saveManualDocumentSyncMap(syncMap);
};
