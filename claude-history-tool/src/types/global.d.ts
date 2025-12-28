import { AnalyticsData } from '../main/getAnalytics';
import { ProjectDirectorySummary, ChatMessage } from './index';

export interface ExportOptions {
  format: 'markdown' | 'json';
  includeToolCalls: boolean;
  includeTimestamps: boolean;
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface FavoriteSession {
  sessionId: string;
  projectPath: string;
  starredAt: string;
}

declare global {
  interface Window {
    electronAPI: {
      getChatSessions: () => Promise<ProjectDirectorySummary[]>;
      getSessionDetails: (sessionId: string, projectName: string) => Promise<ChatMessage[]>;
      getAnalytics: () => Promise<AnalyticsData>;
      isNotificationDismissed: (contentCode: string) => Promise<boolean>;
      dismissNotification: (contentCode: string) => Promise<void>;
      getApiHostname: () => Promise<string>;
      exportSession: (
        messages: ChatMessage[],
        sessionTitle: string,
        projectPath: string,
        options: ExportOptions
      ) => Promise<ExportResult>;
      getFavorites: () => Promise<FavoriteSession[]>;
      toggleFavorite: (sessionId: string, projectPath: string) => Promise<boolean>;
    };
  }
}

export {};