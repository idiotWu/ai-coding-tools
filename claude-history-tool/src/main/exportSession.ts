import { dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { ChatMessage } from '../types';

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

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function getMessageContent(message: ChatMessage): string {
  const content = message.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(item => {
      if (typeof item === 'string') return item;
      if (item.type === 'text') return item.text || '';
      if (item.type === 'tool_use') {
        return `[Tool Use: ${item.name}]\n\`\`\`json\n${JSON.stringify(item.input, null, 2)}\n\`\`\``;
      }
      if (item.type === 'tool_result') {
        const resultContent = (item as { content?: unknown }).content;
        return `[Tool Result]\n\`\`\`\n${typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent, null, 2)}\n\`\`\``;
      }
      return '';
    }).filter(Boolean).join('\n\n');
  }

  return '';
}

function convertToMarkdown(messages: ChatMessage[], sessionTitle: string, options: ExportOptions): string {
  const lines: string[] = [];

  lines.push(`# ${sessionTitle}`);
  lines.push('');
  lines.push(`> Exported on ${new Date().toLocaleString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const message of messages) {
    const content = message.message?.content;
    const hasToolContent = Array.isArray(content) && content.some(item =>
      typeof item === 'object' && item !== null && (item.type === 'tool_use' || item.type === 'tool_result')
    );

    // Skip tool messages if not included
    if (!options.includeToolCalls && hasToolContent) {
      continue;
    }

    const role = message.type === 'user' ? 'User' : 'Assistant';
    const timestamp = options.includeTimestamps ? ` (${formatTimestamp(message.timestamp)})` : '';

    lines.push(`## ${role}${timestamp}`);
    lines.push('');

    const msgContent = getMessageContent(message);
    if (msgContent) {
      lines.push(msgContent);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function convertToJSON(messages: ChatMessage[], sessionTitle: string, options: ExportOptions): string {
  const filteredMessages = options.includeToolCalls
    ? messages
    : messages.filter(message => {
        const content = message.message?.content;
        if (!Array.isArray(content)) return true;
        return !content.some(item =>
          typeof item === 'object' && item !== null && (item.type === 'tool_use' || item.type === 'tool_result')
        );
      });

  const exportData = {
    title: sessionTitle,
    exportedAt: new Date().toISOString(),
    messageCount: filteredMessages.length,
    messages: filteredMessages.map(message => ({
      type: message.type,
      timestamp: message.timestamp,
      content: getMessageContent(message),
      ...(options.includeTimestamps && { formattedTime: formatTimestamp(message.timestamp) }),
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

export async function exportSession(
  messages: ChatMessage[],
  sessionTitle: string,
  projectPath: string,
  options: ExportOptions
): Promise<ExportResult> {
  const ext = options.format === 'markdown' ? 'md' : 'json';
  const defaultFilename = `${sessionTitle.slice(0, 50).replace(/[/\\?%*:|"<>]/g, '-')}.${ext}`;

  const result = await dialog.showSaveDialog({
    title: 'Export Chat Session',
    defaultPath: path.join(process.env.HOME || '', 'Downloads', defaultFilename),
    filters: [
      options.format === 'markdown'
        ? { name: 'Markdown', extensions: ['md'] }
        : { name: 'JSON', extensions: ['json'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return { success: false, error: 'Export cancelled' };
  }

  try {
    const content = options.format === 'markdown'
      ? convertToMarkdown(messages, sessionTitle, options)
      : convertToJSON(messages, sessionTitle, options);

    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
