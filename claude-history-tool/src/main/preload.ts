import { contextBridge, ipcRenderer } from 'electron';
import { ProjectDirectory, ChatMessage } from '../types';
import { AnalyticsData } from './getAnalytics';
import type { FavoriteSession } from './database';
import type { ExportOptions, ExportResult } from './exportSession';

const electronAPI = {
  getChatSessions: (): Promise<ProjectDirectory[]> =>
    ipcRenderer.invoke('get-chat-sessions'),

  getSessionDetails: (sessionId: string, projectName: string): Promise<ChatMessage[]> =>
    ipcRenderer.invoke('get-session-details', sessionId, projectName),

  getAnalytics: (): Promise<AnalyticsData> =>
    ipcRenderer.invoke('get-analytics'),

  isNotificationDismissed: (contentCode: string): Promise<boolean> =>
    ipcRenderer.invoke('is-notification-dismissed', contentCode),

  dismissNotification: (contentCode: string): Promise<void> =>
    ipcRenderer.invoke('dismiss-notification', contentCode),

  getApiHostname: (): Promise<string> =>
    ipcRenderer.invoke('get-api-hostname'),

  // Export
  exportSession: (
    messages: ChatMessage[],
    sessionTitle: string,
    projectPath: string,
    options: ExportOptions
  ): Promise<ExportResult> =>
    ipcRenderer.invoke('export-session', messages, sessionTitle, projectPath, options),

  // Favorites
  getFavorites: (): Promise<FavoriteSession[]> =>
    ipcRenderer.invoke('get-favorites'),

  toggleFavorite: (sessionId: string, projectPath: string): Promise<boolean> =>
    ipcRenderer.invoke('toggle-favorite', sessionId, projectPath),

  // Session context
  getSessionContext: (cwd: string): Promise<SessionContext> =>
    ipcRenderer.invoke('get-session-context', cwd),
};

export interface SessionContext {
  claudeMd: string | null;
  globalClaudeMd: string | null;
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type { FavoriteSession };
export type { ExportOptions, ExportResult };

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}