import React, { useState, useEffect, useMemo } from 'react';
import { VList } from 'virtua';
import { IoClose, IoSearch } from 'react-icons/io5';
import { ChatSessionSummary, ChatMessage } from '../types';
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

  useEffect(() => {
    loadSessionDetails();
  }, [session.sessionId]);

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
      </div>

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