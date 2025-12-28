import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Load environment variables from .env file only in development
if (process.env.NODE_ENV === 'development') {
  try {
    const dotenv = require('dotenv');
    dotenv.config();
  } catch (error) {
    // dotenv not available in production, which is fine
  }
}
import { ChatMessage, ProjectDirectorySummary } from '../types';
import { getChatSessions } from './getChatSessions';
import { getSessionDetails } from './getSessionDetails';
import { getAnalytics, AnalyticsData } from './getAnalytics';
import { initializeDatabase, isDismissed, dismissNotification, getFavorites, toggleFavorite, FavoriteSession } from './database';
import { exportSession, ExportOptions, ExportResult } from './exportSession';

let mainWindow: BrowserWindow;

function createWindow(): void {
  const windowWidth = parseInt(process.env.WINDOW_WIDTH || '1200');
  const windowHeight = parseInt(process.env.WINDOW_HEIGHT || '800');
  const rendererPort = process.env.RENDERER_PORT || '3447';
  const enableDevTools = process.env.ENABLE_DEV_TOOLS === 'true';

  mainWindow = new BrowserWindow({
    height: windowHeight,
    width: windowWidth,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(`http://localhost:${rendererPort}`);
    if (enableDevTools) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  initializeDatabase();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('get-chat-sessions', async (): Promise<ProjectDirectorySummary[]> => {
  return await getChatSessions();
});

ipcMain.handle('get-session-details', async (_, sessionId: string, projectName: string): Promise<ChatMessage[]> => {
  return await getSessionDetails(sessionId, projectName);
});

ipcMain.handle('get-analytics', async (): Promise<AnalyticsData> => {
  return await getAnalytics();
});

ipcMain.handle('is-notification-dismissed', async (_, contentCode: string): Promise<boolean> => {
  return isDismissed(contentCode);
});

ipcMain.handle('dismiss-notification', async (_, contentCode: string): Promise<void> => {
  dismissNotification(contentCode);
});

ipcMain.handle('get-api-hostname', async (): Promise<string> => {
  return process.env.API_HOSTNAME || 'https://api.mcp-eval.com';
});

// Export session handler
ipcMain.handle('export-session', async (
  _,
  messages: ChatMessage[],
  sessionTitle: string,
  projectPath: string,
  options: ExportOptions
): Promise<ExportResult> => {
  return await exportSession(messages, sessionTitle, projectPath, options);
});

// Favorites handlers
ipcMain.handle('get-favorites', async (): Promise<FavoriteSession[]> => {
  return getFavorites();
});

ipcMain.handle('toggle-favorite', async (_, sessionId: string, projectPath: string): Promise<boolean> => {
  return toggleFavorite(sessionId, projectPath);
});

// Session context handler - get CLAUDE.md content for a project
export interface SessionContext {
  claudeMd: string | null;
  globalClaudeMd: string | null;
}

ipcMain.handle('get-session-context', async (_, cwd: string): Promise<SessionContext> => {
  const result: SessionContext = {
    claudeMd: null,
    globalClaudeMd: null,
  };

  // Try to read project CLAUDE.md
  try {
    const projectClaudeMdPath = path.join(cwd, 'CLAUDE.md');
    if (fs.existsSync(projectClaudeMdPath)) {
      result.claudeMd = fs.readFileSync(projectClaudeMdPath, 'utf-8');
    }
  } catch (error) {
    console.error('Failed to read project CLAUDE.md:', error);
  }

  // Try to read global CLAUDE.md
  try {
    const globalClaudeMdPath = path.join(os.homedir(), '.claude', 'CLAUDE.md');
    if (fs.existsSync(globalClaudeMdPath)) {
      result.globalClaudeMd = fs.readFileSync(globalClaudeMdPath, 'utf-8');
    }
  } catch (error) {
    console.error('Failed to read global CLAUDE.md:', error);
  }

  return result;
});