import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CommonAgentGateway } from '../services/commonAgentGateway';
import {
  deleteManualDocument,
  listManualDocuments,
  MANUAL_DOCUMENTS_CHANGED_EVENT,
  readManualDocumentSyncMap,
  saveManualDocumentSyncMap,
  syncManualDocument
} from '../services/manualKnowledgeSyncService';
import { RetrievalMode } from '../types';
import { CloseIcon, SendIcon, BotIcon, UploadIcon, TrashIcon, SpinnerIcon } from './Icons';

interface ChatbotProps {
  onClose: () => void;
  isOnline: boolean;
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface DocumentFile {
    name: string;
    status: 'processing' | 'ready' | 'error';
    id: string;
    centralDocumentId?: string;
}

const Chatbot: React.FC<ChatbotProps> = ({ onClose, isOnline }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useRag, setUseRag] = useState(false);
  const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>('hybrid');
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [docProcessingMessage, setDocProcessingMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef(`mold-master-chat-${Date.now()}`);

  const updateDocumentList = useCallback(() => {
    setDocuments(listManualDocuments().map(({ fileName, documentId }) => ({
      name: fileName,
      status: 'ready',
      id: fileName,
      centralDocumentId: documentId
    })));
  }, []);

  useEffect(() => {
    const initializeChat = async () => {
      if (!isOnline) {
        const offlineMessage = '오프라인 상태입니다. AI 어시스턴트를 사용하려면 네트워크 연결을 확인해 주세요.';
        setMessages([{ role: 'model', text: offlineMessage }]);
        setError(offlineMessage);
        return;
      }

      setMessages([{ role: 'model', text: '안녕하세요. 사출 금형 문제를 함께 분석할 Mold Master AI입니다. 무엇을 도와드릴까요?' }]);
      setError(null);
    };

    void initializeChat();
    updateDocumentList();
    inputRef.current?.focus();
  }, [isOnline, updateDocumentList]);

  useEffect(() => {
    window.addEventListener(MANUAL_DOCUMENTS_CHANGED_EVENT, updateDocumentList);
    return () => {
      window.removeEventListener(MANUAL_DOCUMENTS_CHANGED_EVENT, updateDocumentList);
    };
  }, [updateDocumentList]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading || error) return;

    const userMessage: Message = { role: 'user', text: userInput };
    setMessages((prev) => [...prev, userMessage]);
    setUserInput('');
    setIsLoading(true);

    try {
      setMessages((prev) => [...prev, { role: 'model', text: '' }]);

      const conversationHistory = messages.filter((message) => !(message.role === 'model' && message.text.includes('안녕하세요.')));
      const result = await CommonAgentGateway.askQuestion({
        messages: [...conversationHistory, userMessage],
        useKnowledge: useRag,
        retrievalMode: useRag ? retrievalMode : 'direct',
        sessionId: sessionIdRef.current
      });
      setMessages((prev) => {
        const updatedMessages = [...prev];
        updatedMessages[updatedMessages.length - 1] = { role: 'model', text: result.text };
        return updatedMessages;
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '메시지 전송에 실패했습니다.';
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage.role === 'model' && lastMessage.text === '') {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'model', text: `오류: ${errorMessage}` };
          return updated;
        }
        return [...prev, { role: 'model', text: `오류: ${errorMessage}` }];
      });
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadDocument = async () => {
    if (!isOnline) return;
    const files = await window.electronAPI.readFileContents();
    if (!files || files.length === 0) return;

    for (const file of files) {
      const docId = `${file.name}-${Date.now()}`;
      setDocuments((prev) => [...prev, { name: file.name, status: 'processing', id: docId }]);
      setDocProcessingMessage(`${file.name} 처리 중...`);

      try {
        const centralDocumentId = await syncManualDocument(file.name, file.content);
        setDocuments((prev) => prev.map((doc) => doc.id === docId ? {
          ...doc,
          status: 'ready',
          centralDocumentId
        } : doc));
        setDocProcessingMessage(`${file.name} 문서를 Common Agent에 추가했습니다.`);
      } catch (err) {
        console.error('Common Agent document sync failed:', err);
        setDocuments((prev) => prev.map((doc) => doc.id === docId ? {
          ...doc,
          status: 'error'
        } : doc));
        setDocProcessingMessage(`${file.name}: Common Agent 등록 실패`);
      }
    }

    setTimeout(() => setDocProcessingMessage(null), 4000);
  };

  const handleRemoveDocument = async (fileName: string) => {
    try {
      await deleteManualDocument(fileName);
      updateDocumentList();
    } catch (err) {
      console.error('Failed to delete central document:', err);
      setDocProcessingMessage(`중앙 문서 삭제 실패: ${fileName}`);
    }
  };

  const handleClearAllDocuments = async () => {
    if (!window.confirm('Common Agent에서 모든 수동 문서를 삭제하시겠습니까?')) return;
    const fileNames = Object.keys(readManualDocumentSyncMap());
    const failed: string[] = [];
    for (const fileName of fileNames) {
      try {
        await deleteManualDocument(fileName);
      } catch (err) {
        console.error(`Failed to delete central document: ${fileName}`, err);
        failed.push(fileName);
      }
    }
    if (failed.length === 0) saveManualDocumentSyncMap({});
    updateDocumentList();
    setDocProcessingMessage(
      failed.length > 0
        ? `${failed.length}개 중앙 문서를 삭제하지 못했습니다.`
        : 'Common Agent 수동 문서를 모두 삭제했습니다.'
    );
  };

  return (
    <div className="fixed bottom-20 right-4 sm:right-8 w-[calc(100%-2rem)] max-w-sm h-[70vh] max-h-[600px] bg-gray-800 rounded-2xl shadow-2xl flex flex-col z-50 transition-all transform-gpu">
      <header className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <BotIcon className="w-6 h-6 text-indigo-400" />
          <h2 className="text-lg font-bold text-gray-100">AI 어시스턴트</h2>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Close chat">
          <CloseIcon className="w-5 h-5" />
        </button>
      </header>

      <div className="p-4 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center justify-between mb-3">
          <label htmlFor="rag-toggle" className="flex items-center cursor-pointer">
            <span className="text-sm font-medium text-gray-200 mr-3">지식 검색 사용</span>
            <div className="relative">
              <input
                type="checkbox"
                id="rag-toggle"
                className="sr-only"
                checked={useRag}
                onChange={() => setUseRag(!useRag)}
                disabled={!isOnline}
              />
              <div className={`block w-10 h-6 rounded-full ${useRag ? 'bg-indigo-600' : 'bg-gray-600'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${useRag ? 'translate-x-4' : ''}`}></div>
            </div>
          </label>
          <button
            onClick={handleUploadDocument}
            disabled={!isOnline}
            className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md transition-colors disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            <UploadIcon className="w-4 h-4" />
            문서 업로드
          </button>
        </div>

        {useRag && (
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setRetrievalMode('hybrid')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${retrievalMode === 'hybrid' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              Hybrid
            </button>
            <button
              onClick={() => setRetrievalMode('graph_only')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${retrievalMode === 'graph_only' ? 'bg-sky-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              Graph Only
            </button>
          </div>
        )}

        {docProcessingMessage && <p className="text-xs text-center text-yellow-300 mb-2">{docProcessingMessage}</p>}

        {documents.length > 0 && (
          <div className="text-xs text-gray-400 max-h-20 overflow-y-auto pr-2">
            <div className="flex justify-between items-center mb-1">
              <span className="font-semibold">수동 지식 문서</span>
              <button onClick={handleClearAllDocuments} className="text-red-400 hover:text-red-300">모두 지우기</button>
            </div>
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between bg-gray-700/50 p-1 rounded">
                <span className="truncate w-4/5" title={doc.name}>{doc.name}</span>
                {doc.status === 'ready' && (
                  <span className="mr-1 rounded bg-cyan-900 px-1 text-[9px] text-cyan-200">
                    AGENT
                  </span>
                )}
                {doc.status === 'processing' && <SpinnerIcon className="w-3 h-3 text-indigo-400" />}
                {doc.status === 'ready' && (
                  <button onClick={() => handleRemoveDocument(doc.name)}>
                    <TrashIcon className="w-3 h-3 text-gray-500 hover:text-red-400" />
                  </button>
                )}
                {doc.status === 'error' && <span className="text-red-500 text-xs">오류</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <div className="flex flex-col gap-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex gap-3 items-start ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'model' && <BotIcon className="w-6 h-6 flex-shrink-0 text-gray-400" />}
              <div className={`max-w-xs md:max-w-sm rounded-xl px-4 py-2 whitespace-pre-wrap break-words ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                {msg.text || <span className="inline-block w-2 h-4 bg-white animate-pulse"></span>}
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex gap-3 items-start">
              <BotIcon className="w-6 h-6 flex-shrink-0 text-gray-400" />
              <div className="max-w-xs md:max-w-sm rounded-xl px-4 py-2 bg-gray-700 text-gray-200 rounded-bl-none">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 bg-indigo-400 rounded-full animate-pulse"></span>
                  <span className="h-2 w-2 bg-indigo-400 rounded-full animate-pulse [animation-delay:0.2s]"></span>
                  <span className="h-2 w-2 bg-indigo-400 rounded-full animate-pulse [animation-delay:0.4s]"></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <footer className="p-4 border-t border-gray-700">
        <div className="flex items-center bg-gray-700 rounded-lg">
          <input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={
              !isOnline
                ? '오프라인 상태입니다.'
                : useRag
                  ? retrievalMode === 'graph_only'
                    ? '그래프 경로 기반으로 질문하기...'
                    : '문서와 지식 기반으로 질문하기...'
                  : '메시지 입력...'
            }
            disabled={!isOnline || !!error || isLoading}
            className="flex-grow bg-transparent border-none rounded-md px-4 py-2 text-white focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSendMessage}
            disabled={!userInput.trim() || isLoading || !!error || !isOnline}
            className="p-2 text-indigo-400 hover:text-indigo-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <SendIcon className="w-6 h-6" />
          </button>
        </div>
      </footer>
    </div>
  );
};

export default Chatbot;
