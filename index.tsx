import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ApiConfig, DBStats, DefectAnalysis } from './types';

// --- WEB COMPATIBILITY MODE ---
if (!window.electronAPI) {
  console.warn("Electron API not found. Running in WEB TEST MODE.");

  window.electronAPI = {
    startCaptureSession: async () => {
      alert("웹 모드 알림: 전체 화면 캡처는 Electron 앱에서만 지원됩니다.\n하지만 이미지 드래그 앤 드롭 및 AI 진단 기능은 테스트 가능합니다.");
    },
    initiateRegionCapture: () => { },
    cancelCapture: () => { },
    regionCaptured: (dataUrl: string) => { },
    getCaptureData: async () => null,

    // Mock implementation for region capture in web mode
    performRegionCapture: async (rect: { x: number, y: number, width: number, height: number }) => {
      console.log("performRegionCapture called in Web Mode (Mock)", rect);
    },
    debugCapturePointer: async (payload: Record<string, unknown>) => {
      console.log("debugCapturePointer called in Web Mode (Mock)", payload);
    },

    // Events - Mock returning cleanup function
    onSetScreenshotUrl: () => { return () => { }; },
    onShowAnnotationEditor: () => { return () => { }; },
    onCaptureSessionEnded: () => { return () => { }; },

    // Mock Persistence using LocalStorage
    getApiConfig: async () => {
      const saved = localStorage.getItem('web_api_config');
      return saved ? JSON.parse(saved) : null;
    },
    setApiConfig: async (config: ApiConfig) => {
      localStorage.setItem('web_api_config', JSON.stringify(config));
      console.log("Config saved to LocalStorage (Web Mode)", config);
    },
    runVisionBenchmark: async () => {
      throw new Error('Vision 벤치마크는 Electron 앱에서만 실행할 수 있습니다.');
    },
    suggestVisionLabel: async () => {
      throw new Error('AI 라벨 제안은 Electron 앱에서만 실행할 수 있습니다.');
    },
    scanLocalVisionCandidates: async () => {
      throw new Error('로컬 Vision 후보 검색은 Electron 앱에서만 실행할 수 있습니다.');
    },
    scanPreparedVisionReviewPacket: async () => {
      throw new Error('준비된 Vision 검토 패킷은 Electron 앱에서만 열 수 있습니다.');
    },
    getLocalVisionCandidateImage: async () => {
      throw new Error('로컬 Vision 원본 이미지는 Electron 앱에서만 열 수 있습니다.');
    },
    suggestLocalVisionLabel: async () => {
      throw new Error('로컬 Vision 후보 AI 제안은 Electron 앱에서만 실행할 수 있습니다.');
    },
    importLocalVisionCandidate: async () => {
      throw new Error('로컬 Vision 후보 등록은 Electron 앱에서만 실행할 수 있습니다.');
    },
    setLocalVisionReviewDecision: async () => {
      throw new Error('로컬 Vision HITL 판정은 Electron 앱에서만 저장할 수 있습니다.');
    },
    getWebKnowledgeReviewQueue: async () => {
      throw new Error('웹 지식 HITL 큐는 Electron 앱에서만 열 수 있습니다.');
    },
    getWebKnowledgeCardImage: async () => {
      throw new Error('웹 지식 근거 이미지는 Electron 앱에서만 열 수 있습니다.');
    },
    setWebKnowledgeReview: async () => {
      throw new Error('웹 지식 HITL 판정은 Electron 앱에서만 저장할 수 있습니다.');
    },
    validateWebKnowledgeCard: async () => {
      throw new Error('Common Agent 검증은 Electron 앱에서만 실행할 수 있습니다.');
    },
    ingestWebKnowledgeCard: async () => {
      throw new Error('Common Agent 후보 적재는 Electron 앱에서만 실행할 수 있습니다.');
    },
    approveWebKnowledgeCard: async () => {
      throw new Error('Common Agent 중앙 승인은 Electron 앱에서만 실행할 수 있습니다.');
    },
    testWebKnowledgeRoundtrip: async () => {
      throw new Error('Graph 왕복 검증은 Electron 앱에서만 실행할 수 있습니다.');
    },

    // Mock File Reading using HTML Input
    readFileContents: async () => {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.txt,.pdf,.docx,.pptx,.xlsx,.csv';
        input.onchange = (e: any) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            const filePromises = Array.from(files).map((file: any) => {
              return new Promise((resolveFile) => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                  if (ev.target?.result) {
                    resolveFile({
                      name: file.name,
                      content: new Uint8Array(ev.target.result as ArrayBuffer)
                    });
                  } else {
                    resolveFile(null);
                  }
                };
                reader.readAsArrayBuffer(file);
              });
            });

            Promise.all(filePromises).then(results => {
              resolve(results.filter(Boolean) as any);
            });

          } else {
            resolve(null);
          }
        };
        input.click();
      });
    },

    // Mock Vector Store Persistence
    getVectorStore: async () => {
      const saved = localStorage.getItem('web_vector_store');
      return saved ? JSON.parse(saved) : [];
    },

    // Mock Database APIs (New)
    getDBStats: async () => {
      return {
        imageCount: 0,
        annotationCount: 0,
        metadataCount: 0,
        vectorCount: 0,
        knowledgeMatrixCount: 0,
        feedbackCount: 0,
        trainingSetCount: 0
      };
    },
    saveUserFeedback: async (analysis: DefectAnalysis, imageId: string, status?: 'approved' | 'pending' | 'rejected', isVerified?: boolean, dataUrl?: string) => {
      console.log("Mock saveUserFeedback called (Web Mode)", analysis, imageId, status, isVerified, dataUrl);
      return { success: true, id: Date.now() };
    },
    getUserFeedback: async () => {
      console.log("Mock getUserFeedback called (Web Mode)");
      return [];
    },
    deleteUserFeedback: async (id: number) => {
      console.log("Mock deleteUserFeedback called (Web Mode)", id);
    },
    exportVerifiedData: async () => {
      console.log("Mock exportVerifiedData called (Web Mode)");
      return { success: true, count: 0 };
    },
    searchDefects: async (query: string) => {
      console.log("Mock searchDefects called (Web Mode)", query);
      return [];
    },
    getDefectStats: async () => {
      console.log("Mock getDefectStats called (Web Mode)");
      return { total: 0, byType: {}, bySeverity: {}, byStatus: {}, recentTrend: [] };
    },
    getDefectsByFilter: async (filter: any) => {
      console.log("Mock getDefectsByFilter called (Web Mode)", filter);
      return [];
    },
    updateDefect: async (id: number, data: any) => {
      console.log("Mock updateDefect called (Web Mode)", id, data);
      return true;
    },
    importProcessKnowledge: async (records: any[]) => {
      console.log("Mock importProcessKnowledge called (Web Mode)", records);
      return { success: true, imported: records.length };
    },
    getProcessKnowledge: async (filter?: any) => {
      console.log("Mock getProcessKnowledge called (Web Mode)", filter);
      return [];
    },
    getReportLayouts: async () => {
      console.log("Mock getReportLayouts called (Web Mode)");
      return [];
    },
    saveReportLayouts: async (layouts: any[]) => {
      console.log("Mock saveReportLayouts called (Web Mode)", layouts);
      return true;
    },

    // Mock Mobile Server API (Web Mode)
    startMobileServer: async (port?: number) => {
      console.log(`Mock startMobileServer called (Web Mode) with port: ${port}`);
      // Dummy QR code (Base64 placeholder)
      const dummyQr = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
      return {
        url: `http://localhost:${port || 3000}/mock-mobile?token=mock-token`,
        token: "mock-token",
        ip: "127.0.0.1",
        port: port || 3000,
        availableIps: ["127.0.0.1", "192.168.0.5"],
        qrCode: dummyQr
      };
    },
    generateQrCode: async (url: string) => {
      console.log(`Mock generateQrCode called (Web Mode) for: ${url}`);
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
    },
    onMobileUploadSuccess: (callback: (payload: { filename: string; dataUrl: string }) => void) => {
      console.log("Mock onMobileUploadSuccess registered (Web Mode)");
      return () => console.log("Mock onMobileUploadSuccess cleanup");
    },
    // NEW: Debugging Mock
    onMobileConnectAttempt: (callback: (payload: { ip: string }) => void) => {
      console.log("Mock onMobileConnectAttempt registered (Web Mode)");
      return () => console.log("Mock onMobileConnectAttempt cleanup");
    }
  };
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
