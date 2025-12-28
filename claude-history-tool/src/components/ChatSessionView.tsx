import React, { useState, useEffect, useMemo } from 'react';
import { VList } from 'virtua';
import { IoClose, IoSearch, IoDownloadOutline, IoChevronDown, IoChevronUp, IoInformationCircleOutline } from 'react-icons/io5';
import { ChatSessionSummary, ChatMessage } from '../types';
import { SessionContext } from '../types/global.d';
import { MessageCard, ToolResultMap } from './MessageCard';
import { LoadingSpinner } from './LoadingSpinner';

interface ChatViewerProps {
  session: ChatSessionSummary;
}

function getMessageText(message: ChatMessage): string {
  const content = message.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item.type === 'text') return item.text || '';
        if (item.type === 'tool_use') return item.name || '';
        return '';
      })
      .join(' ');
  }
  return '';
}

export const ChatSessionView: React.FC<ChatViewerProps> = ({ session }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sessionContext, setSessionContext] = useState<SessionContext | null>(null);
  const [showContext, setShowContext] = useState(false);

  useEffect(() => {
    loadSessionDetails();
  }, [session.sessionId]);

  // Load session context when cwd is available
  useEffect(() => {
    if (session.cwd) {
      loadSessionContext(session.cwd);
    }
  }, [session.cwd]);

  const loadSessionContext = async (cwd: string) => {
    try {
      const context = await window.electronAPI.getSessionContext(cwd);
      setSessionContext(context);
    } catch (error) {
      console.error('Failed to load session context:', error);
    }
  };

  const loadSessionDetails = async () => {
    try {
      setLoading(true);
      const data = await window.electronAPI.getSessionDetails(session.sessionId, session.projectPath);
      setMessages(data);
    } catch (error) {
      console.error('Failed to load session details:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getProjectDisplayName = (session: ChatSessionSummary) => {
    // Use cwd from session summary
    if (session.cwd) {
      return session.cwd;
    }
    // Fallback to the encoded directory name conversion
    return session.projectPath.replace(/^-Users-[^-]+-/, '').replace(/-/g, '/');
  };

  // Build a map of tool_use_id -> tool_result content from all messages
  const toolResultMap = useMemo<ToolResultMap>(() => {
    const map: ToolResultMap = new Map();
    for (const message of messages) {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (typeof item === 'object' && item !== null && item.type === 'tool_result' && item.tool_use_id) {
            map.set(item.tool_use_id, {
              tool_use_id: item.tool_use_id,
              content: (item as { content?: unknown }).content,
            });
          }
        }
      }
    }
    return map;
  }, [messages]);

  // Track which tool_use_ids have been aggregated (shown with their tool_use)
  const aggregatedToolResultIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (typeof item === 'object' && item !== null && item.type === 'tool_use' && item.id) {
            // If there's a matching tool_result in the map, mark it as aggregated
            if (toolResultMap.has(item.id)) {
              ids.add(item.id);
            }
          }
        }
      }
    }
    return ids;
  }, [messages, toolResultMap]);

  // Check if a message only contains tool_results that have been aggregated
  const isMessageFullyAggregated = (message: ChatMessage): boolean => {
    const content = message.message?.content;
    if (!Array.isArray(content)) return false;

    // Check if all items in this message are either:
    // 1. tool_result items that have been aggregated
    // 2. Non-content items (we should still show other content)
    const toolResultItems = content.filter(
      item => typeof item === 'object' && item !== null && item.type === 'tool_result'
    );

    // If no tool_result items, don't hide the message
    if (toolResultItems.length === 0) return false;

    // Check if ALL tool_results are aggregated
    const allAggregated = toolResultItems.every(
      item => typeof item === 'object' && item !== null &&
        item.type === 'tool_result' && item.tool_use_id &&
        aggregatedToolResultIds.has(item.tool_use_id)
    );

    // Only hide if message contains ONLY tool_results (no text or other content)
    const hasOtherContent = content.some(
      item => typeof item === 'string' ||
        (typeof item === 'object' && item !== null && item.type !== 'tool_result')
    );

    return allAggregated && !hasOtherContent;
  };

  const filteredMessages = useMemo(() => {
    let result = messages;

    // Filter out messages that only contain aggregated tool_results
    result = result.filter(msg => !isMessageFullyAggregated(msg));

    if (!searchTerm.trim()) {
      return result;
    }
    const term = searchTerm.toLowerCase();
    return result.filter(msg => getMessageText(msg).toLowerCase().includes(term));
  }, [messages, searchTerm, aggregatedToolResultIds]);

  const handleExport = async (format: 'markdown' | 'json') => {
    setExporting(true);
    setShowExportMenu(false);
    try {
      const sessionTitle = session.firstUserMessage.slice(0, 50) || `Session ${session.sessionId}`;
      const result = await window.electronAPI.exportSession(
        messages,
        sessionTitle,
        session.projectPath,
        { format, includeToolCalls: true, includeTimestamps: true }
      );
      if (!result.success && result.error !== 'Export cancelled') {
        console.error('Export failed:', result.error);
      }
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="ChatViewer__loading">
        <LoadingSpinner 
          size={40} 
          message="Loading session details..." 
        />
      </div>
    );
  }

  return (
    <div className="ChatViewer">
      <div className="ChatViewer__toolbar">
        <div className="ChatViewer__info">
          <span className="ChatViewer__title">{getProjectDisplayName(session)}</span>
          <span className="ChatViewer__meta">
            {session.messageCount} messages · {formatTimestamp(session.lastMessageTimestamp)}
          </span>
        </div>
        <div className="ChatViewer__search">
          <IoSearch className="ChatViewer__search-icon" />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="ChatViewer__search-input"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="ChatViewer__search-clear"
              title="Clear search"
            >
              <IoClose />
            </button>
          )}
          {searchTerm && (
            <span className="ChatViewer__search-count">
              {filteredMessages.length}/{messages.length}
            </span>
          )}
        </div>
        <div className="ChatViewer__export">
          <button
            className="ChatViewer__export-btn"
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={exporting}
            title="Export session"
          >
            <IoDownloadOutline />
            {exporting ? 'Exporting...' : 'Export'}
          </button>
          {showExportMenu && (
            <div className="ChatViewer__export-menu">
              <button onClick={() => handleExport('markdown')}>
                Export as Markdown
              </button>
              <button onClick={() => handleExport('json')}>
                Export as JSON
              </button>
            </div>
          )}
        </div>
        {(sessionContext?.claudeMd || sessionContext?.globalClaudeMd) && (
          <button
            className="ChatViewer__context-btn"
            onClick={() => setShowContext(!showContext)}
            title="Show session context"
          >
            <IoInformationCircleOutline />
            Context
            {showContext ? <IoChevronUp /> : <IoChevronDown />}
          </button>
        )}
      </div>

      {showContext && sessionContext && (
        <div className="ChatViewer__context-panel">
          {session.cwd && (
            <div className="ChatViewer__context-section">
              <h4>Session Metadata</h4>
              <div className="ChatViewer__context-meta">
                <div><strong>Working Directory:</strong> {session.cwd}</div>
                {messages[0]?.gitBranch && (
                  <div><strong>Git Branch:</strong> {messages[0].gitBranch}</div>
                )}
                {messages[0]?.version && (
                  <div><strong>Claude Code Version:</strong> {messages[0].version}</div>
                )}
              </div>
            </div>
          )}
          {sessionContext.claudeMd && (
            <div className="ChatViewer__context-section">
              <h4>Project CLAUDE.md</h4>
              <pre className="ChatViewer__context-content">{sessionContext.claudeMd}</pre>
            </div>
          )}
          {sessionContext.globalClaudeMd && (
            <div className="ChatViewer__context-section">
              <h4>Global CLAUDE.md (~/.claude/CLAUDE.md)</h4>
              <pre className="ChatViewer__context-content">{sessionContext.globalClaudeMd}</pre>
            </div>
          )}
        </div>
      )}

      <VList className="ChatViewer__content">
        {filteredMessages.map((message, index) => (
          <MessageCard
            key={`${message.uuid}-${index}`}
            message={message}
            searchTerm={searchTerm}
            externalToolResults={toolResultMap}
          />
        ))}
      </VList>
    </div>
  );
};