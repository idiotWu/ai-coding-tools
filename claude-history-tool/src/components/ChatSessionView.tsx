import React, { useState, useEffect, useMemo } from 'react';
import { VList } from 'virtua';
import { IoClose, IoSearch, IoDownloadOutline, IoChevronDown, IoChevronUp, IoInformationCircleOutline } from 'react-icons/io5';
import { ChatSessionSummary, ChatMessage } from '../types';
import { SessionContext } from '../types/global.d';
import { MessageCard } from './MessageCard';
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

  const filteredMessages = useMemo(() => {
    if (!searchTerm.trim()) {
      return messages;
    }
    const term = searchTerm.toLowerCase();
    return messages.filter(msg => getMessageText(msg).toLowerCase().includes(term));
  }, [messages, searchTerm]);

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
          />
        ))}
      </VList>
    </div>
  );
};