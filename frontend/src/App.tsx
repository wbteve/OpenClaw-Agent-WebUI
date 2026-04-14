import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import GroupChatView from './components/GroupChatView';
import SettingsView from './components/SettingsView';
import LoginScreen from './components/LoginScreen';

export type ViewType = 'chat' | 'groupchat' | 'settings';
export type SettingsTab = 'gateway' | 'general' | 'models' | 'commands' | 'usage';

export default function App() {
  const getHashState = () => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return { view: 'chat' as ViewType, tab: 'gateway' as SettingsTab };
    
    if (hash === 'settings') return { view: 'settings' as ViewType, tab: 'gateway' as SettingsTab };
    if (hash.startsWith('settings/')) {
      const tab = hash.split('/')[1] as SettingsTab;
      return { view: 'settings' as ViewType, tab };
    }
    if (hash === 'groupchat') return { view: 'groupchat' as ViewType, tab: 'gateway' as SettingsTab };
    return { view: 'chat' as ViewType, tab: 'gateway' as SettingsTab };
  };

  // Parse URL search params for deep linking
  // Note: Since the URL format is #chat?session=xxx, the ? is after #, so we need to parse from hash
  const getSessionFromUrl = (): string | null => {
    // First try window.location.search (standard query string)
    let params = new URLSearchParams(window.location.search);
    let sessionParam = params.get('session');
    
    // If not found, try parsing from hash (for URLs like #chat?session=xxx)
    if (!sessionParam) {
      const hash = window.location.hash;
      const hashMatch = hash.match(/\?(.*)$/);  // Extract everything after ? in the hash
      if (hashMatch && hashMatch[1]) {
        params = new URLSearchParams(hashMatch[1]);
        sessionParam = params.get('session');
      }
    }
    
    if (sessionParam) {
      console.log('[DeepLink] Found session param:', sessionParam);
      return decodeURIComponent(sessionParam);
    }
    return null;
  };

  const initialState = getHashState();

  const [currentView, setCurrentView] = useState<ViewType>(
    initialState.view === 'groupchat' ? 'groupchat' : initialState.view
  );
  const [isConnected, setIsConnected] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(initialState.tab);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null); // null = checking
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return localStorage.getItem('clawui_active_session') || '';
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sessions, setSessions] = useState<{id: string, name: string, characterId?: string, model?: string, key?: string}[]>([]);
  const [systemAgents, setSystemAgents] = useState<{id: string, name: string, characterId?: string, model?: string, key?: string}[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // --- Hash Routing Integration for Back Gesture & Deep Linking ---
  useEffect(() => {
    const handleHashChange = () => {
      const { view, tab } = getHashState();
      setCurrentView(view);
      setSettingsTab(tab);
      // If we navigate back via hash, close mobile menu
      setIsMobileMenuOpen(false);
    };

    window.addEventListener('hashchange', handleHashChange);
    
    // Set initial hash if it's empty to normalize URL
    if (!window.location.hash) {
      window.location.hash = currentView === 'settings' ? `settings/${settingsTab}` : 'chat';
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Sync view state to hash and localStorage
  useEffect(() => {
    const newHash = currentView === 'settings' ? `settings/${settingsTab}` : 'chat';
    if (window.location.hash.replace('#', '') !== newHash) {
      window.location.hash = newHash;
    }
    localStorage.setItem('clawui_current_view', currentView);
    localStorage.setItem('clawui_settings_tab', settingsTab);
  }, [currentView, settingsTab]);

  // Sync activeSessionId to localStorage
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('clawui_active_session', activeSessionId);
    }
  }, [activeSessionId]);

  // Wrapper for view/tab changes
  const navigateTo = (view: ViewType, tab?: SettingsTab, openMenu?: boolean) => {
    const nextTab = tab || settingsTab;
    const nextOpen = openMenu !== undefined ? openMenu : isMobileMenuOpen;
    
    if (view !== currentView || nextTab !== settingsTab || nextOpen !== isMobileMenuOpen) {
      setCurrentView(view);
      if (tab) setSettingsTab(tab);
      setIsMobileMenuOpen(nextOpen);
      // Hash is updated automatically by the useEffect above
    }
  };

  const reloadSessions = async () => {
    try {
      // Fetch both /api/agents (authoritative list from openclaw CLI) and /api/sessions (user sessions)
      const [agentsRes, sessionsRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/sessions')
      ]);
      
      const agentsData = await agentsRes.json();
      const sessionsData = await sessionsRes.json();
      
      // Use /api/agents for system agents (from openclaw CLI - authoritative)
      const cliAgents = agentsData.agents || [];
      
      // Filter out agents that are in CLI list from user sessions to avoid duplicates
      const cliAgentIds = new Set(cliAgents.map((a: any) => a.id));
      const userSessions = (sessionsData.userSessions || sessionsData || []).filter(
        (s: any) => !cliAgentIds.has(s.id)
      );
      
      // Add isSystemAgent flag to CLI agents
      const systemAgentsFromCli = cliAgents.map((a: any) => ({
        id: a.id,
        name: a.name,
        model: a.model,
        key: a.key,
        isSystemAgent: true,
        identity: a.identity,
        workspace: a.workspace
      }));
      
      setSystemAgents(systemAgentsFromCli);
      setSessions(userSessions);
      setSessionsLoaded(true);
      
      // Combine for auto-select logic (both system + user for selection)
      const allSessions = [...systemAgentsFromCli, ...userSessions];
      
      // Default behavior: select previously active session or first available
      if (allSessions.length > 0) {
        setActiveSessionId(prev => {
          const exists = allSessions.find((s: any) => s.id === prev);
          return exists ? prev : allSessions[0].id;
        });
      }
    } catch (err) {
      console.error('Failed to reload sessions:', err);
    }
  };

  // Helper function to find matching session from sessionKey
  const findSessionByKey = (sessionKey: string, allSessions: any[]): any => {
    return allSessions.find((s: any) => {
      // Match by id directly
      if (s.id === sessionKey) return true;
      // Match by full key
      if (s.key === sessionKey) return true;
      // Match by last segment of sessionKey (the actual sessionId)
      const parts = sessionKey.split(':');
      const lastPart = parts[parts.length - 1];
      if (lastPart && (s.id === lastPart || s.key?.endsWith(`:${lastPart}`))) return true;
      return false;
    });
  };

  // Reload sessions with a specific sessionKey from URL (for deep linking)
  const reloadSessionsWithSessionKey = async (sessionKey: string) => {
    try {
      // Fetch both /api/agents (authoritative list from openclaw CLI) and /api/sessions (user sessions)
      const [agentsRes, sessionsRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/sessions')
      ]);
      
      const agentsData = await agentsRes.json();
      const sessionsData = await sessionsRes.json();
      
      // Use /api/agents for system agents (from openclaw CLI - authoritative)
      const cliAgents = agentsData.agents || [];
      
      // Filter out agents that are in CLI list from user sessions to avoid duplicates
      const cliAgentIds = new Set(cliAgents.map((a: any) => a.id));
      const userSessions = (sessionsData.userSessions || sessionsData || []).filter(
        (s: any) => !cliAgentIds.has(s.id)
      );
      
      // Add isSystemAgent flag to CLI agents
      const systemAgentsFromCli = cliAgents.map((a: any) => ({
        id: a.id,
        name: a.name,
        model: a.model,
        key: a.key,
        isSystemAgent: true,
        identity: a.identity,
        workspace: a.workspace
      }));
      
      setSystemAgents(systemAgentsFromCli);
      setSessions(userSessions);
      setSessionsLoaded(true);
      
      // Combine for matching
      const allSessions = [...systemAgentsFromCli, ...userSessions];
      
      // Find matching session for the URL sessionKey
      const found = findSessionByKey(sessionKey, allSessions);
      
      if (found) {
        console.log('[DeepLink] Found matching session:', found.id, found.name);
        setActiveSessionId(found.id);
      } else {
        console.warn('[DeepLink] No matching session found for:', sessionKey);
        // Fallback to first session
        setActiveSessionId(allSessions[0]?.id || '');
      }
    } catch (err) {
      console.error('Failed to reload sessions:', err);
    }
  };

  const reorderSessions = async (newSessions: {id: string, name: string}[]) => {
    // Optimistic update
    setSessions(newSessions);
    try {
      await fetch('/api/sessions/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newSessions.map(s => s.id) }),
      });
    } catch (err) {
      console.error('Failed to save session order:', err);
      // Fallback on failure
      reloadSessions();
    }
  };

  // Check if login is required on mount and periodically
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('clawui_auth_token');
        const url = token ? `/api/auth/check?token=${encodeURIComponent(token)}` : '/api/auth/check';
        const res = await fetch(url);
        const data = await res.json();
        if (data.loginRequired) {
          localStorage.removeItem('clawui_auth_token');
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(true);
        }
      } catch {
        // If can't reach server, allow access (offline mode)
        setIsAuthenticated(prev => prev === null ? true : prev);
      }
    };
    checkAuth();
    
    // Periodically poll auth to log out instantly on password change
    const tokenTimer = setInterval(checkAuth, 3000);
    return () => clearInterval(tokenTimer);
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/gateway/status');
        if (res.ok) {
          const data = await res.json();
          setIsConnected(!!data.connected); 
        } else {
          setIsConnected(false);
        }
      } catch (e) {
        setIsConnected(false);
      }
    };

    checkStatus();
    
    // Check for deep-link session parameter in URL and apply immediately
    const urlSessionKey = getSessionFromUrl();
    if (urlSessionKey) {
      console.log('[DeepLink] Found session in URL:', urlSessionKey);
      // Directly reload sessions with the URL sessionKey
      reloadSessionsWithSessionKey(urlSessionKey);
    } else {
      reloadSessions();
    }
    const timer = setInterval(checkStatus, 10000);
    return () => clearInterval(timer);
  }, []);

  // Show login screen if not authenticated (and auth check is done)
  if (isAuthenticated === false) {
    return <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  // Always render the real UI, but hide it until data is ready.
  // This prevents progressive paint / "expanding" artifacts.
  const appReady = isAuthenticated === true && sessionsLoaded;

  return (
    <div
      className="flex fixed inset-0 h-[100dvh] w-full overflow-hidden bg-gray-50 text-gray-900 font-sans antialiased"
      style={{ opacity: appReady ? 1 : 0 }}
    >
      <Sidebar 
        currentView={currentView} 
        settingsTab={settingsTab} 
        activeSessionId={activeSessionId}
        setActiveSessionId={setActiveSessionId}
        isMobileMenuOpen={isMobileMenuOpen}
        sessions={sessions}
        systemAgents={systemAgents}
        sessionsLoaded={sessionsLoaded}
        reloadSessions={reloadSessions}
        reorderSessions={reorderSessions}
        navigateTo={navigateTo}
      />
      <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden md:overflow-visible md:relative md:z-[60]">
        {currentView === 'chat' ? (
          <ChatView 
            isConnected={isConnected} 
            activeSessionId={activeSessionId} 
            onMenuClick={() => navigateTo(currentView, settingsTab, true)}
            sessions={sessions}
            systemAgents={systemAgents}
            onSessionChange={setActiveSessionId}
          />
        ) : currentView === 'groupchat' ? (
          <GroupChatView
            isConnected={isConnected}
            onMenuClick={() => navigateTo(currentView, settingsTab, true)}
          />
        ) : (
          <SettingsView 
            isConnected={isConnected} 
            settingsTab={settingsTab} 
            onMenuClick={() => navigateTo(currentView, settingsTab, true)}
            navigateTo={navigateTo}
            setActiveSessionId={setActiveSessionId}
            sessions={sessions}
            systemAgents={systemAgents}
          />
        )}
      </main>
    </div>
  );
}
