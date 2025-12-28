import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as readline from 'readline';
import { ChatMessage, ChatSessionSummary, ProjectDirectorySummary } from '../types';

function getFirstUserMessage(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find(msg =>
    msg.type === 'user' && !msg.isMeta && !msg.internalMessageType
  );

  if (firstUserMessage && firstUserMessage.message && typeof firstUserMessage.message.content === 'string') {
    return firstUserMessage.message.content.slice(0, 100) + (firstUserMessage.message.content.length > 100 ? '...' : '');
  }
  return 'No user message found';
}

async function readSessionMetadata(filePath: string): Promise<{
  firstMessages: ChatMessage[];
  lastMessage: ChatMessage | null;
  lineCount: number;
} | null> {
  return new Promise((resolve) => {
    const firstMessages: ChatMessage[] = [];
    let lastMessage: ChatMessage | null = null;
    let lineCount = 0;
    const maxFirstLines = 10; // Read first 10 lines to find user message

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      lineCount++;

      try {
        const msg = JSON.parse(line) as ChatMessage;
        if (lineCount <= maxFirstLines) {
          firstMessages.push(msg);
        }
        lastMessage = msg;
      } catch {
        // Skip invalid lines
      }
    });

    rl.on('close', () => {
      if (lineCount === 0 || firstMessages.length === 0) {
        resolve(null);
      } else {
        resolve({ firstMessages, lastMessage, lineCount });
      }
    });

    rl.on('error', () => {
      resolve(null);
    });
  });
}

export async function getChatSessions(): Promise<ProjectDirectorySummary[]> {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');

  console.log(`[getChatSessions] Starting scan of Claude directory: ${claudeDir}`);

  if (!fs.existsSync(claudeDir)) {
    console.log('[getChatSessions] Claude directory does not exist');
    return [];
  }

  const projectDirs = fs.readdirSync(claudeDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  console.log(`[getChatSessions] Found ${projectDirs.length} project directories`);

  const projects: ProjectDirectorySummary[] = [];
  const seenSessionIds = new Set<string>();

  for (const projectDir of projectDirs) {
    const projectPath = path.join(claudeDir, projectDir);
    const files = fs.readdirSync(projectPath)
      .filter(file => file.endsWith('.jsonl'));

    const sessions: ChatSessionSummary[] = [];

    for (const file of files) {
      const filePath = path.join(projectPath, file);

      try {
        const metadata = await readSessionMetadata(filePath);
        if (!metadata) continue;

        const { firstMessages, lastMessage, lineCount } = metadata;
        const sessionId = firstMessages[0].sessionId;

        if (!sessionId || typeof sessionId !== 'string') continue;
        if (seenSessionIds.has(sessionId)) continue;

        seenSessionIds.add(sessionId);

        sessions.push({
          sessionId,
          firstMessageTimestamp: firstMessages[0].timestamp,
          lastMessageTimestamp: lastMessage?.timestamp || firstMessages[0].timestamp,
          projectPath: projectDir,
          messageCount: lineCount,
          firstUserMessage: getFirstUserMessage(firstMessages),
          cwd: firstMessages[0].cwd
        });
      } catch (error) {
        console.error(`[getChatSessions] Error processing file ${filePath}:`, error);
        continue;
      }
    }

    if (sessions.length > 0) {
      sessions.sort((a, b) =>
        new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
      );

      projects.push({
        path: projectDir,
        sessions
      });
    }
  }

  console.log(`[getChatSessions] Found ${projects.length} projects, ${seenSessionIds.size} sessions`);

  projects.sort((a, b) => {
    const aLatest = new Date(a.sessions[0]?.lastMessageTimestamp || 0).getTime();
    const bLatest = new Date(b.sessions[0]?.lastMessageTimestamp || 0).getTime();
    return bLatest - aLatest;
  });

  return projects;
}