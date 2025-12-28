import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { VList } from 'virtua';
import { IoClose, IoStar, IoStarOutline } from 'react-icons/io5';
import { isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { ProjectDirectorySummary, ChatSessionSummary } from '../types';
import { FavoriteSession } from '../types/global.d';

type FilterMode = 'all' | 'favorites' | 'date';

type ListItem =
  | { type: 'project'; project: ProjectDirectorySummary; isExpanded: boolean }
  | { type: 'session'; session: ChatSessionSummary; projectPath: string };

interface ChatListProps {
  projects: ProjectDirectorySummary[];
  onSessionSelect: (session: ChatSessionSummary) => void;
  onRefresh?: () => void;
}

export const ChatList: React.FC<ChatListProps> = ({ projects, onSessionSelect, onRefresh }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Initialize expanded projects from URL params
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => {
    const expanded = searchParams.get('expanded');
    return expanded ? new Set(expanded.split(',')) : new Set();
  });

  // Load favorites on mount
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const favs = await window.electronAPI.getFavorites();
        setFavorites(new Set(favs.map(f => f.sessionId)));
      } catch (err) {
        console.error('Failed to load favorites:', err);
      }
    };
    loadFavorites();
  }, []);

  const handleToggleFavorite = async (e: React.MouseEvent, sessionId: string, projectPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const isFavorited = await window.electronAPI.toggleFavorite(sessionId, projectPath);
      setFavorites(prev => {
        const newFavs = new Set(prev);
        if (isFavorited) {
          newFavs.add(sessionId);
        } else {
          newFavs.delete(sessionId);
        }
        return newFavs;
      });
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const isSessionInDateRange = useCallback((session: ChatSessionSummary): boolean => {
    if (!dateFrom && !dateTo) return true;

    try {
      const sessionDate = parseISO(session.lastMessageTimestamp);
      const from = dateFrom ? startOfDay(parseISO(dateFrom)) : new Date(0);
      const to = dateTo ? endOfDay(parseISO(dateTo)) : new Date();

      return isWithinInterval(sessionDate, { start: from, end: to });
    } catch {
      return true;
    }
  }, [dateFrom, dateTo]);

  // Restore scroll position when coming back from a session
  useEffect(() => {
    if (location.state?.scrollPosition) {
      window.scrollTo(0, location.state.scrollPosition);
    }
    if (location.state?.expandedProjects) {
      setExpandedProjects(new Set(location.state.expandedProjects));
    }
  }, [location.state]);

  // Update URL when expanded projects change
  useEffect(() => {
    const expandedArray = Array.from(expandedProjects);
    if (expandedArray.length > 0) {
      setSearchParams({ expanded: expandedArray.join(',') });
    } else {
      setSearchParams({});
    }
  }, [expandedProjects, setSearchParams]);

  const getProjectDisplayName = useCallback((project: ProjectDirectorySummary) => {
    // Try to get the actual path from the first session's cwd
    if (project.sessions.length > 0 && project.sessions[0].cwd) {
      return project.sessions[0].cwd;
    }
    // Fallback to the encoded directory name conversion
    return project.path.replace(/^-Users-[^-]+-/, '').replace(/-/g, '/');
  }, []);
  
  // Filter projects based on search term, filter mode, and date range
  const filteredProjects = useMemo(() => {
    let result = projects;

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      result = result.map(project => {
        const projectName = getProjectDisplayName(project).toLowerCase();
        const hasMatchingProject = projectName.includes(searchLower);

        if (hasMatchingProject) {
          return project;
        }

        // Filter sessions within project
        const matchingSessions = project.sessions.filter(session =>
          session.firstUserMessage.toLowerCase().includes(searchLower)
        );

        if (matchingSessions.length > 0) {
          return { ...project, sessions: matchingSessions };
        }

        return null;
      }).filter((p): p is ProjectDirectorySummary => p !== null);
    }

    // Apply filter mode
    if (filterMode === 'favorites') {
      result = result.map(project => {
        const favoriteSessions = project.sessions.filter(s => favorites.has(s.sessionId));
        if (favoriteSessions.length > 0) {
          return { ...project, sessions: favoriteSessions };
        }
        return null;
      }).filter((p): p is ProjectDirectorySummary => p !== null);
    }

    // Apply date range filter
    if (filterMode === 'date' && (dateFrom || dateTo)) {
      result = result.map(project => {
        const filteredSessions = project.sessions.filter(isSessionInDateRange);
        if (filteredSessions.length > 0) {
          return { ...project, sessions: filteredSessions };
        }
        return null;
      }).filter((p): p is ProjectDirectorySummary => p !== null);
    }

    return result;
  }, [projects, searchTerm, getProjectDisplayName, filterMode, favorites, dateFrom, dateTo, isSessionInDateRange]);

  // Flatten projects and sessions into a single list for virtual scrolling
  const flattenedItems = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    for (const project of filteredProjects) {
      const isExpanded = expandedProjects.has(project.path);
      items.push({ type: 'project', project, isExpanded });
      if (isExpanded) {
        for (const session of project.sessions) {
          items.push({ type: 'session', session, projectPath: project.path });
        }
      }
    }
    return items;
  }, [filteredProjects, expandedProjects]);

  const toggleProject = (projectPath: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectPath)) {
      newExpanded.delete(projectPath);
    } else {
      newExpanded.add(projectPath);
    }
    setExpandedProjects(newExpanded);
  };

  const clearSearch = () => {
    setSearchTerm('');
  };
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };


  return (
    <div className="ChatList">
      <h2 className="ChatList__header">Session History</h2>
      
      <div className="ChatList__search">
        <input
          type="text"
          placeholder="Search projects and sessions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ChatList__search-input"
        />
        {searchTerm && (
          <button
            onClick={clearSearch}
            className="ChatList__search-clear"
            title="Clear search"
          >
            <IoClose />
          </button>
        )}
      </div>

      <div className="ChatList__filters">
        <button
          className={`ChatList__filter-btn ${filterMode === 'all' ? 'ChatList__filter-btn--active' : ''}`}
          onClick={() => setFilterMode('all')}
        >
          All
        </button>
        <button
          className={`ChatList__filter-btn ${filterMode === 'favorites' ? 'ChatList__filter-btn--active' : ''}`}
          onClick={() => setFilterMode('favorites')}
        >
          <IoStar /> Favorites
        </button>
        <button
          className={`ChatList__filter-btn ${filterMode === 'date' ? 'ChatList__filter-btn--active' : ''}`}
          onClick={() => setFilterMode('date')}
        >
          Date Range
        </button>
      </div>

      {filterMode === 'date' && (
        <div className="ChatList__date-filter">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="ChatList__date-input"
            placeholder="From"
          />
          <span className="ChatList__date-separator">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="ChatList__date-input"
            placeholder="To"
          />
        </div>
      )}
      
      {filteredProjects.length === 0 && projects.length > 0 ? (
        <div className="ChatList__empty">
          <p>No projects found matching "{searchTerm}"</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="ChatList__empty">
          <p>No chat history found in ~/.claude/projects</p>
        </div>
      ) : (
        <VList className="ChatList__vlist">
          {flattenedItems.map((item) => {
            if (item.type === 'project') {
              const { project, isExpanded } = item;
              return (
                <div
                  key={`project-${project.path}`}
                  onClick={() => toggleProject(project.path)}
                  className="ChatList__project-header"
                >
                  <span className={`ChatList__project-arrow ${isExpanded ? 'ChatList__project-arrow--expanded' : ''}`}>
                    ▶
                  </span>
                  <span className="ChatList__project-name">
                    {getProjectDisplayName(project)}
                  </span>
                  <span className="ChatList__project-count">
                    ({project.sessions.length} session{project.sessions.length !== 1 ? 's' : ''})
                  </span>
                </div>
              );
            } else {
              const { session, projectPath } = item;
              const isFavorited = favorites.has(session.sessionId);
              return (
                <a
                  key={`session-${session.sessionId}`}
                  href={`/chat/${session.sessionId}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onSessionSelect(session);
                  }}
                  className="ChatList__session"
                >
                  <div className="ChatList__session-header">
                    <div className="ChatList__session-content">
                      {session.firstUserMessage}
                    </div>
                    <button
                      className={`ChatList__session-star ${isFavorited ? 'ChatList__session-star--active' : ''}`}
                      onClick={(e) => handleToggleFavorite(e, session.sessionId, projectPath)}
                      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {isFavorited ? <IoStar /> : <IoStarOutline />}
                    </button>
                  </div>
                  <div className="ChatList__session-meta">
                    <span>{formatTimestamp(session.lastMessageTimestamp)}</span>
                    <span>{session.messageCount} messages</span>
                  </div>
                </a>
              );
            }
          })}
        </VList>
      )}
    </div>
  );
};