import React, { useState } from 'react';
import { FaDeezer, FaMagnifyingGlassPlus } from 'react-icons/fa6';
import { ChatMessage } from '../types';
import { Badge, BadgeType } from './Badge';
import { Tooltip } from './Tooltip';
import { CodeBlock, parseMarkdownCodeBlocks } from './CodeBlock';

interface MessageCardProps {
  message: ChatMessage;
  searchTerm?: string;
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

interface ParsedMessageContent {
  textContent: Array<any>;
  toolUseContent: Array<any>;
  badgeType: BadgeType;
  toolNames: string[];
}

function parseMessage(message: ChatMessage, searchTerm?: string): ParsedMessageContent {
  const textContent: Array<React.ReactNode> = [];
  const toolUseContent: Array<React.ReactNode> = [];
  const toolNames: string[] = [];

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
          case 'tool_use':
            if (contentItem.name) {
              toolNames.push(contentItem.name);
            }
            toolUseContent.push(
              <div key={`tool-use-${itemIndex}`} className="MessageCard__tool-use-block">
                <div className="MessageCard__tool-name">[Tool: {contentItem.name}]</div>
                <CodeBlock
                  code={JSON.stringify(contentItem.input, null, 2)}
                  language="json"
                />
              </div>
            );

            badgeType = BadgeType.Tool;
            break;

          case 'tool_result': {
            // tool_result has a content property but it's not in the base type
            const resultContent = (contentItem as { content?: unknown }).content;
            toolUseContent.push(
              <div key={`tool-result-${itemIndex}`} className="MessageCard__tool-result-block">
                <div className="MessageCard__tool-name">[Tool Result]</div>
                <CodeBlock
                  code={typeof resultContent === 'string'
                    ? resultContent
                    : JSON.stringify(resultContent, null, 2)}
                  language={typeof resultContent === 'string' ? undefined : 'json'}
                />
              </div>
            );
            badgeType = BadgeType.ToolResult;
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
    toolNames
  };
}

export const MessageCard: React.FC<MessageCardProps> = ({ message, searchTerm }) => {
  const { textContent, toolUseContent, badgeType, toolNames } = parseMessage(message, searchTerm);
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

  // Parse the message content into a list of text and tool use/result items

  // Determine if this should use background styling (less prominent)

  const isForegroundMessage = contentExpanded || fullJsonExpanded;

  const cardClassName = isForegroundMessage ? "MessageCard message-foreground" : "MessageCard message-background";

  return (
    <div className={cardClassName} onClick={(evt) => {
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

      {contentExpanded && (
        <>
          <div onClick={(evt) => evt.stopPropagation()}>
            {textContent}
            {toolUseContent}
          </div>
        </>
      )}

      {/* temp - show the full message for debugging */} 
      {fullJsonExpanded && (
        <>
          <h3>Full Event JSON:</h3>
        <pre className="full-message">
          {JSON.stringify(message, null, 2)}
        </pre>
        </>
      )}
    </div>
  );
};