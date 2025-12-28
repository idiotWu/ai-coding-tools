import React, { useState } from 'react';
import { FaDeezer, FaMagnifyingGlassPlus } from 'react-icons/fa6';
import { ChatMessage } from '../types';
import { Badge, BadgeType } from './Badge';
import { Tooltip } from './Tooltip';
import { CodeBlock, parseMarkdownCodeBlocks } from './CodeBlock';

export interface ToolResultItem {
  tool_use_id: string;
  content: unknown;
}

export type ToolResultMap = Map<string, ToolResultItem>;

interface MessageCardProps {
  message: ChatMessage;
  searchTerm?: string;
  externalToolResults?: ToolResultMap;
}

function highlightText(text: string, searchTerm: string): React.ReactNode {
  if (!searchTerm.trim()) return text;

  const parts = text.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

  return parts.map((part, i) =>
    part.toLowerCase() === searchTerm.toLowerCase() ? (
      <mark key={i} className="search-highlight">{part}</mark>
    ) : (
      part
    )
  );
}

function renderTextWithCodeBlocks(text: string, key: string, searchTerm?: string): React.ReactNode {
  const parsed = parseMarkdownCodeBlocks(text);

  return parsed.map((block, index) => {
    if (block.type === 'code') {
      return (
        <CodeBlock
          key={`${key}-code-${index}`}
          code={block.content}
          language={block.language}
          searchTerm={searchTerm}
        />
      );
    }
    return (
      <div key={`${key}-text-${index}`} className="content">
        {searchTerm ? highlightText(block.content, searchTerm) : block.content}
      </div>
    );
  });
}

interface ToolInfo {
  name: string;
  keyParams: string | null;
}

interface ParsedMessageContent {
  textContent: Array<React.ReactNode>;
  toolUseContent: Array<React.ReactNode>;
  badgeType: BadgeType;
  toolNames: string[];
  toolInfos: ToolInfo[];
}

interface ToolUseItem {
  id: string;
  name: string;
  input: unknown;
}

// Extract key parameters to show in tool header based on tool type
function getToolKeyParams(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;

  const inputObj = input as Record<string, unknown>;

  switch (toolName) {
    case 'Read':
    case 'Write':
      if (inputObj.file_path) {
        const path = String(inputObj.file_path);
        // Show just the filename or last part of path
        const parts = path.split('/');
        return parts[parts.length - 1] || path;
      }
      break;

    case 'Edit':
      if (inputObj.file_path) {
        const path = String(inputObj.file_path);
        const parts = path.split('/');
        return parts[parts.length - 1] || path;
      }
      break;

    case 'Bash':
      if (inputObj.command) {
        const cmd = String(inputObj.command);
        // Truncate long commands
        return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd;
      }
      break;

    case 'Grep':
      if (inputObj.pattern) {
        const pattern = String(inputObj.pattern);
        const truncated = pattern.length > 40 ? pattern.slice(0, 40) + '...' : pattern;
        if (inputObj.path) {
          const path = String(inputObj.path);
          const pathParts = path.split('/');
          return `"${truncated}" in ${pathParts[pathParts.length - 1] || path}`;
        }
        return `"${truncated}"`;
      }
      break;

    case 'Glob':
      if (inputObj.pattern) {
        const pattern = String(inputObj.pattern);
        if (inputObj.path) {
          const path = String(inputObj.path);
          const pathParts = path.split('/');
          return `${pattern} in ${pathParts[pathParts.length - 1] || path}`;
        }
        return pattern;
      }
      break;

    case 'Task':
      if (inputObj.description) {
        return String(inputObj.description);
      }
      break;

    case 'WebFetch':
      if (inputObj.url) {
        const url = String(inputObj.url);
        // Show domain only
        try {
          const domain = new URL(url).hostname;
          return domain;
        } catch {
          return url.slice(0, 40);
        }
      }
      break;

    case 'TodoWrite':
      if (Array.isArray(inputObj.todos)) {
        return `${inputObj.todos.length} item(s)`;
      }
      break;

    case 'AskUserQuestion':
      if (Array.isArray(inputObj.questions) && inputObj.questions.length > 0) {
        const firstQ = inputObj.questions[0];
        if (typeof firstQ === 'object' && firstQ && 'question' in firstQ) {
          const q = String((firstQ as Record<string, unknown>).question);
          return q.length > 50 ? q.slice(0, 50) + '...' : q;
        }
      }
      break;

    case 'NotebookEdit':
      if (inputObj.notebook_path) {
        const path = String(inputObj.notebook_path);
        const parts = path.split('/');
        return parts[parts.length - 1] || path;
      }
      break;

    default:
      // For unknown tools (including MCP tools), try to extract meaningful params
      // Try common parameter names in order of priority
      const paramPriority = [
        'file_path', 'path', 'url', 'query', 'command', 'name', 'title',
        'target', 'message', 'content', 'text', 'description', 'input'
      ];

      for (const param of paramPriority) {
        if (inputObj[param] !== undefined && inputObj[param] !== null) {
          const value = String(inputObj[param]);
          if (value.trim()) {
            // For paths, show just filename
            if (param.includes('path') || param === 'file_path') {
              const parts = value.split('/');
              return parts[parts.length - 1] || value;
            }
            // For URLs, show domain
            if (param === 'url') {
              try {
                return new URL(value).hostname;
              } catch {
                return value.slice(0, 40);
              }
            }
            // For other params, truncate if needed
            return value.length > 50 ? value.slice(0, 50) + '...' : value;
          }
        }
      }

      // If no common params found, try to show first string value from input
      for (const [key, val] of Object.entries(inputObj)) {
        if (typeof val === 'string' && val.trim() && !key.startsWith('_')) {
          const truncated = val.length > 50 ? val.slice(0, 50) + '...' : val;
          return truncated;
        }
      }
      break;
  }

  return null;
}

function parseMessage(message: ChatMessage, searchTerm?: string, externalToolResults?: ToolResultMap): ParsedMessageContent {
  const textContent: Array<React.ReactNode> = [];
  const toolUseContent: Array<React.ReactNode> = [];
  const toolNames: string[] = [];
  const toolInfos: ToolInfo[] = [];

  let badgeType: BadgeType =
  message.type === 'user' ? BadgeType.User : BadgeType.Assistant;

  const messageContent = message.message?.content;

  if (typeof messageContent === 'string') {
    textContent.push(
      <React.Fragment key="text-0">
        {renderTextWithCodeBlocks(messageContent, 'msg-0', searchTerm)}
      </React.Fragment>
    );
  } else if (Array.isArray(messageContent)) {
      // First pass: collect all tool_use and tool_result items from THIS message
      const toolUseMap = new Map<string, ToolUseItem>();
      const internalToolResultMap = new Map<string, ToolResultItem>();
      const processedToolIds = new Set<string>();

      for (const contentItem of messageContent) {
        if (typeof contentItem === 'object' && contentItem !== null) {
          if (contentItem.type === 'tool_use' && contentItem.id) {
            toolUseMap.set(contentItem.id, {
              id: contentItem.id,
              name: contentItem.name || 'Unknown',
              input: contentItem.input,
            });
          } else if (contentItem.type === 'tool_result' && contentItem.tool_use_id) {
            const resultContent = (contentItem as { content?: unknown }).content;
            internalToolResultMap.set(contentItem.tool_use_id, {
              tool_use_id: contentItem.tool_use_id,
              content: resultContent,
            });
          }
        }
      }

      // Second pass: render content with aggregated tool calls
      let itemIndex = 0;
      for (const contentItem of messageContent) {
        itemIndex++;

        if (typeof contentItem === 'string') {
          textContent.push(
            <React.Fragment key={`text-${itemIndex}`}>
              {renderTextWithCodeBlocks(contentItem, `msg-${itemIndex}`, searchTerm)}
            </React.Fragment>
          );
          continue;
        }

        switch (contentItem.type) {
          case 'tool_use': {
            const toolName = contentItem.name || 'Unknown';
            const keyParams = getToolKeyParams(toolName, contentItem.input);

            if (contentItem.name) {
              toolNames.push(contentItem.name);
            }
            toolInfos.push({ name: toolName, keyParams });

            const toolId = contentItem.id;
            if (toolId && !processedToolIds.has(toolId)) {
              processedToolIds.add(toolId);
              // Look up result from internal map first, then external map
              const matchingResult = internalToolResultMap.get(toolId) || externalToolResults?.get(toolId);

              toolUseContent.push(
                <div key={`tool-${toolId}`} className="MessageCard__tool-block">
                  <div className="MessageCard__tool-use-section">
                    <div className="MessageCard__tool-name">
                      🔧 {contentItem.name}
                      {keyParams && (
                        <span className="MessageCard__tool-params">{keyParams}</span>
                      )}
                    </div>
                    <CodeBlock
                      code={JSON.stringify(contentItem.input, null, 2)}
                      language="json"
                    />
                  </div>
                  {matchingResult && (
                    <div className="MessageCard__tool-result-section">
                      <div className="MessageCard__tool-result-label">↳ Result</div>
                      <CodeBlock
                        code={typeof matchingResult.content === 'string'
                          ? matchingResult.content
                          : JSON.stringify(matchingResult.content, null, 2)}
                        language={typeof matchingResult.content === 'string' ? undefined : 'json'}
                      />
                    </div>
                  )}
                </div>
              );
            }
            badgeType = BadgeType.Tool;
            break;
          }

          case 'tool_result': {
            // Only render standalone if no matching tool_use was found (in this message or elsewhere)
            const toolUseId = contentItem.tool_use_id;

            // Skip rendering if this result is in the external map (will be shown with its tool_use)
            if (toolUseId && externalToolResults?.has(toolUseId)) {
              break;
            }

            if (toolUseId && !toolUseMap.has(toolUseId) && !processedToolIds.has(toolUseId)) {
              processedToolIds.add(toolUseId);
              const resultContent = (contentItem as { content?: unknown }).content;
              toolUseContent.push(
                <div key={`tool-result-${itemIndex}`} className="MessageCard__tool-block">
                  <div className="MessageCard__tool-result-section MessageCard__tool-result-standalone">
                    <div className="MessageCard__tool-result-label">📤 Tool Result</div>
                    <CodeBlock
                      code={typeof resultContent === 'string'
                        ? resultContent
                        : JSON.stringify(resultContent, null, 2)}
                      language={typeof resultContent === 'string' ? undefined : 'json'}
                    />
                  </div>
                </div>
              );
              badgeType = BadgeType.ToolResult;
            }
            break;
          }

          case 'text':
            textContent.push(
              <React.Fragment key={`text-${itemIndex}`}>
                {renderTextWithCodeBlocks(contentItem?.text || '', `msg-${itemIndex}`, searchTerm)}
              </React.Fragment>
            );
            break;

          case 'thinking':
            textContent.push(
              <div key={`thinking-${itemIndex}`} className="MessageCard__thinking">
                <div className="MessageCard__thinking-header">💭 Thinking</div>
                <div className="MessageCard__thinking-content">
                  {searchTerm ? highlightText(contentItem.thinking || '', searchTerm) : contentItem.thinking}
                </div>
              </div>
            );
            badgeType = BadgeType.Thinking;
            break;
        }
      }
  }

  if (message.internalMessageType) {
    if (message.internalMessageType === 'hook') {
      badgeType = BadgeType.Hook;
    } else {
      badgeType = BadgeType.Internal;
    }
  }

  if (message.isMeta) {
    badgeType = BadgeType.Internal;
  }

  return {
    textContent,
    toolUseContent,
    badgeType,
    toolNames,
    toolInfos
  };
}

export const MessageCard: React.FC<MessageCardProps> = ({ message, searchTerm, externalToolResults }) => {
  const { textContent, toolUseContent, badgeType, toolNames, toolInfos } = parseMessage(message, searchTerm, externalToolResults);
  const isBackgroundMessageByDefault = message.isMeta
    || toolUseContent.length > 0
    || badgeType === BadgeType.Hook
    || badgeType === BadgeType.Tool
    || badgeType === BadgeType.ToolResult
    || badgeType === BadgeType.Internal
    || badgeType === BadgeType.Thinking;

  const [contentExpanded, setContentExpanded] = useState(!isBackgroundMessageByDefault);
  const [fullJsonExpanded, setFullJsonExpanded] = useState(false);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const renderTokenUsage = () => {
    if (!message.message?.usage) return null;
    
    return (
      <div style={{ textAlign: 'left' }}>
        <div>Token Usage:</div>
        <div>Input: {message.message.usage.input_tokens || 0}</div>
        <div>Output: {message.message.usage.output_tokens || 0}</div>
        {message.message.usage.cache_creation_input_tokens && (
          <div>Cache Creation: {message.message.usage.cache_creation_input_tokens}</div>
        )}
      </div>
    );
  };

  // Determine message alignment for bubble layout
  const isUserMessage = badgeType === BadgeType.User;
  const isForegroundMessage = contentExpanded || fullJsonExpanded;

  const cardClasses = [
    'MessageCard',
    isForegroundMessage ? 'message-foreground' : 'message-background',
    isUserMessage ? 'MessageCard--user' : 'MessageCard--agent'
  ].join(' ');

  return (
    <div className={cardClasses} onClick={(evt) => {
      setContentExpanded(!contentExpanded)
      evt.stopPropagation();
    }}>
      <div className="header">
        <div className="header-left">
          <Badge type={badgeType} className="badge" toolNames={toolNames} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="timestamp">
            {formatTimestamp(message.timestamp)}
          </span>
          {message.message?.usage && (
            <Tooltip content={renderTokenUsage()}>
              <FaDeezer
                style={{
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                  fontSize: '14px'
                }}
              />
            </Tooltip>
          )}
          <Tooltip content="See Full JSON">
            <FaMagnifyingGlassPlus
              onClick={(evt) => {
                setFullJsonExpanded(!fullJsonExpanded)
                evt.stopPropagation();
              }}
              style={{
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                fontSize: '14px'
              }}
            />
          </Tooltip>
        </div>
      </div>

      {/* Full JSON at top when expanded */}
      {fullJsonExpanded && (
        <div className="MessageCard__full-json" onClick={(evt) => evt.stopPropagation()}>
          <div className="MessageCard__full-json-header">Full Event JSON</div>
          <div className="MessageCard__full-json-content">
            <CodeBlock
              code={JSON.stringify(message, null, 2)}
              language="json"
            />
          </div>
        </div>
      )}

      {/* Show tool key params in header (visible even when collapsed) - only show tools that have params */}
      {toolInfos.some(info => info.keyParams) && !contentExpanded && !fullJsonExpanded && (
        <div className="MessageCard__tool-preview">
          {toolInfos.filter(info => info.keyParams).map((info, idx) => (
            <div key={idx} className="MessageCard__tool-preview-item">
              <span className="MessageCard__tool-preview-params">{info.keyParams}</span>
            </div>
          ))}
        </div>
      )}

      {contentExpanded && !fullJsonExpanded && (
        <div onClick={(evt) => evt.stopPropagation()}>
          {textContent}
          {toolUseContent}
        </div>
      )}
    </div>
  );
};