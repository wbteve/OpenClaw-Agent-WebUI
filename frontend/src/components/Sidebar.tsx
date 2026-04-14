import { useState, useEffect, useRef } from 'react';
import { Plus, Settings, ArrowLeft, X, Network, Terminal, Trash2, Cpu, MoreHorizontal, Edit3, Trash, ChevronRightIcon, Search, User, Bot, Activity } from 'lucide-react';
import { Reorder } from 'motion/react';
import { ViewType, SettingsTab } from '../App';

interface SidebarProps {
  currentView: ViewType;
  settingsTab?: SettingsTab;
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  isMobileMenuOpen: boolean;
  sessions: {id: string, name: string}[];
  systemAgents?: {id: string, name: string}[];
  sessionsLoaded: boolean;
  reloadSessions: () => Promise<void>;
  reorderSessions: (newSessions: {id: string, name: string}[]) => Promise<void>;
  navigateTo: (view: ViewType, tab?: SettingsTab, openMenu?: boolean) => void;
}

// Session Card with Tooltip - must be a separate component for hooks
function SessionCardWithTooltip({ 
  session, 
  isActive, 
  onSelect, 
  onContextMenu 
}: { 
  session: {id: string, name: string, isSystemAgent?: boolean, model?: string, key?: string};
  isActive: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Position tooltip to the right of the card, vertically centered
    const tooltipX = rect.right + 12;
    const tooltipY = rect.top + rect.height / 2;
    setTooltipPos({ x: tooltipX, y: tooltipY });
    setShowTooltip(true);
  };
  
  const handleMouseLeave = () => {
    setShowTooltip(false);
  };
  
  // Build tooltip content
  const tooltipContent = (
    <div 
      className="bg-slate-800 text-white text-xs rounded-xl shadow-2xl p-4 min-w-[280px] max-w-[380px] border border-slate-600"
      style={{ 
        transform: 'translateY(-50%)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)'
      }}
    >
      <div className="font-bold mb-2 text-sm truncate border-b border-slate-600 pb-2">
        {session.name || `智能体 ${session.id}`}
      </div>
      <div className="space-y-1.5 text-slate-300">
        {session.key && (
          <div className="flex items-start gap-2">
            <span className="text-slate-400 shrink-0 w-12">Key:</span>
            <span className="font-mono text-slate-200 break-all text-[10px]">{session.key}</span>
          </div>
        )}
        <div className="flex items-start gap-2">
          <span className="text-slate-400 shrink-0 w-12">ID:</span>
          <span className="font-mono text-slate-200 break-all">{session.id}</span>
        </div>
        {session.model && (
          <div className="flex items-start gap-2">
            <span className="text-slate-400 shrink-0 w-12">模型:</span>
            <span className="font-mono text-slate-200 break-all">{session.model}</span>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-slate-400 shrink-0 w-12">类型:</span>
          <span className={session.isSystemAgent ? 'text-blue-400 font-medium' : 'text-green-400 font-medium'}>
            {session.isSystemAgent ? '⚙ 系统助手' : '👤 用户会话'}
          </span>
        </div>
      </div>
      {/* Arrow pointing left */}
      <div 
        className="absolute top-1/2 -left-2 -translate-y-1/2 w-0 h-0"
        style={{ 
          borderTop: '8px solid transparent', 
          borderBottom: '8px solid transparent', 
          borderRight: '8px solid #1e293b'
        }}
      ></div>
    </div>
  );
  
  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={`${session.name || session.id}${session.model ? ` - ${session.model}` : ''}`}
      className={`w-full group text-left py-2.5 px-3 text-sm rounded-xl transition-all duration-200 flex items-center justify-between cursor-pointer border ${isActive ? 'bg-brand-50 border-brand-200 text-slate-800' : 'text-slate-700 hover:bg-slate-100 border-transparent'}`}
    >
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {session.isSystemAgent && (
          <span className="flex-shrink-0 w-5 h-5 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
            ⚙
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className={`text-[14px] truncate w-full flex-1 min-w-0 ${isActive ? 'font-semibold' : 'font-medium'}`}>
            {session.name || ''}
          </div>
          <div className="text-[11px] mt-0.5 text-slate-400 flex items-center gap-2 flex-wrap">
            <span className="font-mono">{session.key || session.id}</span>
            {session.model && (
              <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                {session.model}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
        <button
          onClick={onContextMenu}
          className="p-1.5 text-slate-400 hover:text-brand-500 hover:bg-brand-50 rounded-lg transition-all"
          title="更多操作"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      
      {/* Floating Tooltip - positioned fixed */}
      {showTooltip && (
        <div 
          className="fixed z-[99999] pointer-events-none"
          style={{ 
            left: `${tooltipPos.x}px`, 
            top: `${tooltipPos.y}px`,
          }}
        >
          {tooltipContent}
        </div>
      )}
    </div>
  );
}

function SessionSkeleton() {
  return (
    <div className="space-y-1">
      {[1, 2, 3].map(i => (
        <div key={i} className="w-full py-2 px-3 rounded-xl border border-transparent animate-pulse">
          <div className="flex items-baseline gap-2">
            <div className="h-4 bg-gray-200 rounded-md w-20" />
            <div className="h-3 bg-gray-100 rounded-md w-12" />
          </div>
          <div className="mt-2">
            <div className="h-5 bg-gray-100 rounded-full w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SidebarHeader() {
  const [aiName, setAiName] = useState('OpenClaw');
  
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        if (data.aiName) {
          setAiName(data.aiName);
          document.title = data.pageTitle || 'OPC管理系统';
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center gap-2.5 p-4 border-b border-slate-100">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </div>
      <span className="text-slate-800 font-semibold text-sm">{aiName}</span>
    </div>
  );
}

export default function Sidebar({ 
  currentView, 
  settingsTab = 'gateway', 
  activeSessionId, 
  setActiveSessionId, 
  isMobileMenuOpen, 
  sessions,
  systemAgents = [],
  sessionsLoaded,
  reloadSessions,
  reorderSessions,
  navigateTo
}: SidebarProps) {
  
  // On first render, use a plain static list (no Framer Motion).
  // After mount, switch to Reorder for drag support.
  const [enableReorder, setEnableReorder] = useState(false);
  useEffect(() => {
    // Use requestAnimationFrame to ensure the first paint has completed
    requestAnimationFrame(() => {
      setEnableReorder(true);
    });
  }, []);

  // Collapse state for sections
  const [agentsCollapsed, setAgentsCollapsed] = useState(false);
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);
  
  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Modal State
  const [newSessionData, setNewSessionData] = useState({ 
    id: '', name: '', model: '',
    soulContent: '', userContent: '', agentsContent: '', toolsContent: '', heartbeatContent: '', identityContent: ''
  });
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'soul'|'user'|'agents'|'tools'|'heartbeat'|'identity'>('soul');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');


  
  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  // New Session/Persona Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch models on mount and whenever modal opens to ensure fresh list
  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        if (data.success) setAvailableModels(data.models);
      })
      .catch(console.error);
  }, [isModalOpen]);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    session: { id: string; name: string } | null;
  }>({ visible: false, x: 0, y: 0, session: null });

  // Rename Modal State
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Model Selector Modal State
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [modelSessionId, setModelSessionId] = useState<string | null>(null);
  
  // Agent Files Editor Modal State
  const [isFilesEditorOpen, setIsFilesEditorOpen] = useState(false);
  const [filesEditorAgentId, setFilesEditorAgentId] = useState<string | null>(null);
  const [filesEditorAgentName, setFilesEditorAgentName] = useState('');
  const [agentFiles, setAgentFiles] = useState<any[]>([]);
  const [agentWorkspacePath, setAgentWorkspacePath] = useState('');
  const [activeFileTab, setActiveFileTab] = useState('SOUL.md');
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);

  // Template contents for new agents
  const templates = {
    soul: `# SOUL.md - 智能体人格与核心设定
在此定义智能体的性格、价值观、语言风格以及核心行为准则。

## 示范：
- 性格：专业、严谨且富有耐心。
- 语言：多用短句，语气温和，避免使用过多的表情符号。
- 准则：在处理代码时，必须优先考虑安全性和性能。`,
    user: `# USER.md - 用户画像
在此记录关于用户的偏好、背景信息以及智能体应该如何对待用户。

## 示范：
- 用户身份：一名资深的全栈开发工程师。
- 偏好：喜欢直接了当的回答，不需要过多的解释背景。
- 项目背景：目前正在开发一个基于 TypeScript 的分布式网关系统。`,
    agents: `# AGENTS.md - 协作智能体
在此定义智能体知晓的其他协作角色及其交互协议。

## 示范：
- 协作对象：[DevOps_Agent](agent_id)
- 场景：当代码通过审核后，自动将部署包发送给 DevOps_Agent。`,
    tools: `# TOOLS.md - 工具与能力
在此描述智能体可以调用的特殊工具、API 及其使用说明。

## 示范：
- 搜索：使用 DuckDuckGo 搜索最新的技术文档。
- 计算：支持复杂的数学运算和数据绘图能力。`,
    heartbeat: `# HEARTBEAT.md - 定时任务
在此定义智能体在后台运行时的周期性动作或自我思考逻辑。

## 示范：
- 每隔 1 小时：核查项目进度并整理待办事项。
- 每日凌晨：自动备份最近的对话摘要到记忆库。`,
    identity: `# IDENTITY.md - 身份认同
在此定义智能体对自我的称呼、起源以及其在系统中的定位。

## 示范：
- 称呼：首席架构师助手。
- 角色：负责代码审查、技术方案设计以及核心库维护。`
  };

  // --- Search Handler ---
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results);
        setShowSearchResults(true);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };
  
  // Navigate to search result
  const handleSearchResultClick = (result: any) => {
    // Extract session id from session_key
    let sessionId = result.session_key;
    // If session_key is like "agent:xxx:chat:xxx", extract the last part
    if (sessionId.includes(':')) {
      const parts = sessionId.split(':');
      sessionId = parts[parts.length - 1];
    }
    
    // Check if session exists in our lists
    const sessionExists = [...sessions, ...systemAgents].some(s => s.id === sessionId);
    
    if (sessionExists) {
      setActiveSessionId(sessionId);
      navigateTo('chat');
      setShowSearchResults(false);
      setSearchQuery('');
    } else {
      // If session doesn't exist, try to use the session_key directly
      setActiveSessionId(result.session_key);
      navigateTo('chat');
      setShowSearchResults(false);
      setSearchQuery('');
    }
  };


  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionData.name.trim()) return;

    try {
      let res;
      if (modalMode === 'create') {
        res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: newSessionData.id,
            name: newSessionData.name,
            model: newSessionData.model,
            soulContent: newSessionData.soulContent,
            userContent: newSessionData.userContent,
            agentsContent: newSessionData.agentsContent,
            toolsContent: newSessionData.toolsContent,
            heartbeatContent: newSessionData.heartbeatContent,
            identityContent: newSessionData.identityContent,
          })
        });
      } else if (modalMode === 'edit' && editingSessionId) {
        res = await fetch(`/api/sessions/${editingSessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newSessionData.name,
            model: newSessionData.model,
            soulContent: newSessionData.soulContent,
            userContent: newSessionData.userContent,
            agentsContent: newSessionData.agentsContent,
            toolsContent: newSessionData.toolsContent,
            heartbeatContent: newSessionData.heartbeatContent,
            identityContent: newSessionData.identityContent,
          })
        });
      }

      if (res && res.ok) {
        const data = await res.json();
        if (data.success) {
          setIsModalOpen(false);
          setSubmitError(null);
          setNewSessionData({ id: '', name: '', model: '', soulContent: '', userContent: '', agentsContent: '', toolsContent: '', heartbeatContent: '', identityContent: '' });
          await reloadSessions();
          if (modalMode === 'create' && data.session?.id) {
            setActiveSessionId(data.session.id);
            navigateTo('chat');
          }
        } else {
          setSubmitError(data.error || '创建失败，请重试');
        }
      } else if (res && !res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error || '请求失败，请检查网络或日志');
      }
    } catch (err) {
      console.error('Failed to handle modal submit:', err);
      setSubmitError('网络错误，请重试');
    }
  };

  const confirmDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingSessionId(id);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteSession = async () => {
    if (deletingSessionId) {
      try {
        const res = await fetch(`/api/sessions/${deletingSessionId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          setIsDeleteModalOpen(false);
          await reloadSessions();
        }
      } catch (err) {
        console.error('Failed to delete session:', err);
      } finally {
        setIsDeleteModalOpen(false);
        setDeletingSessionId(null);
      }
    }
  };

  // Context Menu Handlers
  const handleContextMenu = (e: React.MouseEvent, session: {id: string, name: string}) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      session,
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, session: null });
  };

  const handleRename = (session: {id: string, name: string}) => {
    closeContextMenu();
    setRenameSessionId(session.id);
    setRenameValue(session.name || '');
    setIsRenameModalOpen(true);
  };

  const handleChangeModel = (session: {id: string, name: string}) => {
    closeContextMenu();
    setModelSessionId(session.id);
    setIsModelModalOpen(true);
  };

  const handleDeleteFromContext = (e: React.MouseEvent, session: {id: string, name: string}) => {
    e.stopPropagation();
    closeContextMenu();
    confirmDeleteSession(e, session.id);
  };

  const submitRename = async () => {
    if (!renameSessionId || !renameValue.trim()) return;
    
    try {
      const res = await fetch(`/api/sessions/${renameSessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: renameValue.trim(),
        }),
      });
      
      if (res.ok) {
        setIsRenameModalOpen(false);
        await reloadSessions();
      }
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
  };

  const submitModelChange = async (modelId: string) => {
    if (!modelSessionId) return;
    
    try {
      // First get the session configs
      const configRes = await fetch(`/api/sessions/${modelSessionId}/configs`);
      const configData = await configRes.json();
      
      const res = await fetch(`/api/sessions/${modelSessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sessions.find(s => s.id === modelSessionId)?.name,
          model: modelId,
          soulContent: configData.configs?.soulContent || '',
        }),
      });
      
      if (res.ok) {
        setIsModelModalOpen(false);
        await reloadSessions();
      }
    } catch (err) {
      console.error('Failed to change model:', err);
    }
  };

  // --- Agent Files Editor Handlers ---
  const handleEditAgentInfo = (session: {id: string, name: string}) => {
    closeContextMenu();
    setFilesEditorAgentId(session.id);
    setFilesEditorAgentName(session.name || session.id);
    setIsFilesEditorOpen(true);
    loadAgentFiles(session.id);
  };

  const loadAgentFiles = async (agentId: string) => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/files`);
      const data = await res.json();
      if (data.success) {
        setAgentFiles(data.files);
        setAgentWorkspacePath(data.workspacePath || '');
        // Load content for each file
        const contents: Record<string, string> = {};
        for (const file of data.files) {
          const fileRes = await fetch(`/api/agents/${agentId}/files/${file.name}`);
          const fileData = await fileRes.json();
          if (fileData.success) {
            contents[file.name] = fileData.content;
          }
        }
        setFileContents(contents);
        if (data.files.length > 0) {
          setActiveFileTab(data.files[0].name);
        }
      }
    } catch (err) {
      console.error('Failed to load agent files:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const saveAgentFile = async (filename: string) => {
    if (!filesEditorAgentId) return;
    setIsSavingFile(true);
    try {
      const res = await fetch(`/api/agents/${filesEditorAgentId}/files/${filename}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fileContents[filename] || '' }),
      });
      const data = await res.json();
      if (data.success) {
        // Refresh the files list
        await loadAgentFiles(filesEditorAgentId);
      }
    } catch (err) {
      console.error('Failed to save agent file:', err);
    } finally {
      setIsSavingFile(false);
    }
  };


  const renderSessionCard = (s: {id: string, name: string, isSystemAgent?: boolean, model?: string, key?: string}) => {
    return (
      <SessionCardWithTooltip
        session={s}
        isActive={activeSessionId === s.id}
        onSelect={() => { setActiveSessionId(s.id); navigateTo('chat', settingsTab, false); }}
        onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, s)}
      />
    );
  };


  if (currentView === 'settings') {
    return (
      <>
        {/* Mobile Backdrop */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
            onClick={() => navigateTo(currentView, settingsTab, false)}
          />
        )}
        <aside className={`fixed inset-y-0 left-0 z-50 w-[75vw] md:w-64 lg:w-72 flex-shrink-0 flex-col border-r border-slate-200 bg-white h-full transition-transform duration-300 md:relative md:translate-x-0 md:flex ${isMobileMenuOpen ? 'translate-x-0 flex' : '-translate-x-full hidden'}`}>
          <SidebarHeader />
        <nav className="flex-1 px-3 py-2 space-y-1">
          <div className="mb-2 px-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">设置</span>
          </div>
          <button
            onClick={() => navigateTo('settings', 'gateway', false)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 font-medium ${settingsTab === 'gateway' ? 'bg-brand-50 border border-brand-200 text-brand-600' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Network className="w-5 h-5" />
            网关设置
          </button>
          <button
            onClick={() => navigateTo('settings', 'general', false)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 font-medium ${settingsTab === 'general' ? 'bg-brand-50 border border-brand-200 text-brand-600' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Settings className="w-5 h-5" />
            通用设置
          </button>
          <button
            onClick={() => navigateTo('settings', 'models', false)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 font-medium ${settingsTab === 'models' ? 'bg-brand-50 border border-brand-200 text-brand-600' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Cpu className="w-5 h-5" />
            模型管理
          </button>

          <button
            onClick={() => navigateTo('settings', 'commands', false)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 font-medium ${settingsTab === 'commands' ? 'bg-brand-50 border border-brand-200 text-brand-600' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Terminal className="w-5 h-5" />
            快捷指令
          </button>
          <button
            onClick={() => navigateTo('settings', 'usage', false)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 font-medium ${settingsTab === 'usage' ? 'bg-brand-50 border border-brand-200 text-brand-600' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Activity className="w-5 h-5" />
            使用统计
          </button>
        </nav>
        <div className="p-3 border-t border-slate-100">
          <button
            onClick={() => navigateTo('chat', settingsTab, false)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-xl transition-all font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">返回对话</span>
          </button>
        </div>
      </aside>
      </>
    );
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => navigateTo(currentView, settingsTab, false)}
        />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[75vw] md:w-64 lg:w-72 flex-shrink-0 flex-col border-r border-slate-200 bg-white h-full transition-transform duration-300 md:relative md:translate-x-0 md:flex ${isMobileMenuOpen ? 'translate-x-0 flex' : '-translate-x-full hidden'}`}>
        <SidebarHeader />

      <div className="px-3 pb-3">
        {/* 群聊入口按钮 */}
        <button
          onClick={() => navigateTo('groupchat', settingsTab, false)}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border transition-all duration-200 font-medium text-sm active:scale-[0.98] mb-2 ${
            currentView === 'groupchat'
              ? 'bg-orange-50 border-orange-200 text-orange-600'
              : 'border-orange-200 text-orange-600 hover:bg-orange-50 hover:border-orange-300'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          群聊
        </button>
        
        {/* 新建Agent按钮 */}
        <button
          onClick={() => {
            setModalMode('create');
            setEditingSessionId(null);
            setSubmitError(null);
            setNewSessionData({
              id: '',
              name: `新智能体 ${sessions.length + 1}`,
              model: '',
              soulContent: '',
              userContent: '',
              agentsContent: '',
              toolsContent: '',
              heartbeatContent: '',
              identityContent: ''
            });
            setIsModalOpen(true);
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 transition-all duration-200 bg-white font-medium text-sm active:scale-[0.98] mb-2"
        >
          <Plus className="w-5 h-5" />
          新建Agent
        </button>
        
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchQuery.trim().length >= 2 && setShowSearchResults(true)}
            onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
            placeholder="搜索聊天记录..."
            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-slate-300 border-t-brand-500 rounded-full animate-spin"></div>
            </div>
          )}
          {searchQuery && !isSearching && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setShowSearchResults(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          
          {/* Search Results Dropdown */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-[400px] overflow-y-auto z-[100]">
              <div className="p-2">
                {searchResults.map((result, index) => (
                  <button
                    key={`${result.id}-${index}`}
                    onClick={() => handleSearchResultClick(result)}
                    className="w-full text-left p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200 mb-1 last:mb-0"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      {result.role === 'user' ? (
                        <User className="w-3.5 h-3.5 text-blue-500" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 text-green-500" />
                      )}
                      <span className="text-xs font-semibold text-slate-700">
                        {result.session_name || result.session_key}
                      </span>
                      <span className="text-xs text-slate-400 ml-auto">
                        {new Date(result.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                      {result.content.length > 150 ? result.content.substring(0, 150) + '...' : result.content}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* No Results */}
          {showSearchResults && searchResults.length === 0 && searchQuery.trim().length >= 2 && !isSearching && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl p-4 text-center z-[100]">
              <div className="text-slate-400 text-sm">未找到匹配的记录</div>
            </div>
          )}
        </div>
      </div>
      {/* System Agents Section - 助手列表 */}
      <div className="px-3 py-1.5 flex items-center justify-between cursor-pointer hover:bg-slate-100 rounded-lg transition-colors mx-2" onClick={() => setAgentsCollapsed(!agentsCollapsed)}>
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">助手列表</span>
        <ChevronRightIcon className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${agentsCollapsed ? '' : 'rotate-90'}`} />
      </div>
      <div className={`flex-1 overflow-y-auto sidebar-scroll px-3 py-1 min-h-0 transition-all duration-200 ${agentsCollapsed ? 'max-h-0 py-0 opacity-0' : 'flex-1'}`}>
        {!sessionsLoaded ? (
          <SessionSkeleton />
        ) : (
          <>
            {/* 系统预置 Agents */}
            {systemAgents.length > 0 && (
              <div className="mb-3">
                <ul className="space-y-1">
                  {systemAgents.map((s) => (
                    <li key={s.id} className="w-full">
                      {renderSessionCard({ ...s, isSystemAgent: true })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Divider + 我的会话 Header */}
            {systemAgents.length > 0 && sessions.length > 0 && (
              <div className="my-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-px bg-slate-200"></div>
                  <span 
                    className="text-[10px] text-slate-400 font-medium uppercase tracking-wider cursor-pointer hover:text-slate-600 flex items-center gap-1"
                    onClick={(e) => { e.stopPropagation(); setSessionsCollapsed(!sessionsCollapsed); }}
                  >
                    我的会话
                    <ChevronRightIcon className={`w-3 h-3 transition-transform duration-200 ${sessionsCollapsed ? '' : 'rotate-90'}`} />
                  </span>
                  <div className="flex-1 h-px bg-slate-200"></div>
                </div>
              </div>
            )}
            
            {/* User Sessions - wrapped in collapsible div */}
            <div className={`transition-all duration-200 ${sessionsCollapsed ? 'max-h-0 py-0 opacity-0 overflow-hidden' : 'max-h-[500px] py-1'}`}>
            {sessions.length > 0 ? (
              enableReorder ? (
                <Reorder.Group axis="y" values={sessions} onReorder={reorderSessions} className="space-y-1" layout={false}>
                  {sessions.map((s) => (
                    <Reorder.Item
                      key={s.id}
                      value={s}
                      className="w-full"
                      initial={false}
                    >
                      {renderSessionCard(s)}
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              ) : (
                <ul className="space-y-1">
                  {sessions.map((s) => (
                    <li key={s.id} className="w-full">
                      {renderSessionCard(s)}
                    </li>
                  ))}
                </ul>
              )
            ) : systemAgents.length === 0 ? (
              <div className="px-4 py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 mt-2">
                <p className="text-sm text-slate-400 font-medium">暂无智能体</p>
              </div>
            ) : null}
            </div> {/* End of sessions collapsible div */}
          </>
        )}
      </div>

      {/* 系统设置按钮 - 贴在底边 */}
      <div className="mt-auto px-3 py-2 border-t border-slate-200 bg-white">
        <button
          onClick={() => navigateTo('settings')}
          className="flex items-center w-full py-2.5 px-3 text-slate-600 hover:text-brand-600 hover:bg-brand-50 transition-all duration-200 font-medium text-sm rounded-xl gap-3"
        >
          <Settings className="w-5 h-5 text-slate-400" />
          系统设置
        </button>
      </div>

    </aside>

      {/* Create Agent Modal - outside aside to center properly */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-[80%] overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-xl font-bold text-gray-900">{modalMode === 'create' ? '新建智能体' : '智能体修改'}</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleModalSubmit} className="p-6 space-y-4">
              {submitError && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                  {submitError}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">智能体ID <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={newSessionData.id}
                  onChange={e => {
                    // Only allow alphanumeric and dashes/underscores for ID
                    const val = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
                    setNewSessionData(prev => ({...prev, id: val}));
                    setSubmitError(null);
                  }}
                  disabled={modalMode === 'edit'}
                  placeholder="如：translation_agent (不可修改)"
                  autoFocus={modalMode === 'create'}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">智能体名称 <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={newSessionData.name}
                  onChange={e => setNewSessionData(prev => ({...prev, name: e.target.value}))}
                  placeholder="给智能体起个名字，如：翻译助手"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  required
                />
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">独立模型配置 (选填)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={isModelDropdownOpen ? modelSearchQuery : (newSessionData.model || '')}
                    onChange={e => {
                      setModelSearchQuery(e.target.value);
                      if (!isModelDropdownOpen) setIsModelDropdownOpen(true);
                    }}
                    onFocus={() => {
                      setModelSearchQuery('');
                      setIsModelDropdownOpen(true);
                    }}
                    placeholder={newSessionData.model ? newSessionData.model : '点击选择模型 (留空使用默认)'}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-mono text-gray-900 pr-8"
                  />
                  {newSessionData.model && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewSessionData(prev => ({...prev, model: ''}));
                        setModelSearchQuery('');
                        setIsModelDropdownOpen(false);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-all"
                      title="清除"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {isModelDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-[10]" onClick={() => setIsModelDropdownOpen(false)} />
                    <div className="absolute z-[20] top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl max-h-[160px] overflow-y-auto shadow-lg">
                      {availableModels
                        .filter(m => {
                          if (!modelSearchQuery) return true;
                          const q = modelSearchQuery.toLowerCase();
                          return m.id.toLowerCase().includes(q) || (m.alias && m.alias.toLowerCase().includes(q));
                        })
                        .sort((a, b) => {
                          if (a.primary && !b.primary) return -1;
                          if (!a.primary && b.primary) return 1;
                          return a.id.localeCompare(b.id, undefined, { sensitivity: 'base' });
                        })
                        .map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setNewSessionData(prev => ({...prev, model: m.id}));
                              setModelSearchQuery('');
                              setIsModelDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 ${
                              newSessionData.model === m.id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                            }`}
                          >
                            <span className="font-mono text-xs max-w-[200px] truncate">{m.id}</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {m.primary && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 rounded text-blue-600 font-medium">默认</span>}
                            </div>
                          </button>
                        ))
                      }
                    </div>
                  </>
                )}
              </div>
              
              <div className="flex-1 flex flex-col min-h-0 border border-gray-100 rounded-2xl overflow-hidden mt-2 bg-gray-50/30">
                <div className="flex p-1 bg-gray-100/50 gap-1 overflow-x-auto no-scrollbar">
                  {[
                    { id: 'soul', name: 'SOUL.md | 人格' },
                    { id: 'user', name: 'USER.md | 用户' },
                    { id: 'agents', name: 'AGENTS.md | 智能体' },
                    { id: 'tools', name: 'TOOLS.md | 工具' },
                    { id: 'heartbeat', name: 'HEARTBEAT.md | 心跳' },
                    { id: 'identity', name: 'IDENTITY.md | 身份' }
                  ].map(tab => (
                    <button
                      key={tab.id} type="button" onClick={() => setActiveTab(tab.id as any)}
                      className={`flex-none px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
                    >
                      {tab.name}
                    </button>
                  ))}
                </div>
                <div className="flex-1 relative">
                  <textarea 
                    value={newSessionData[`${activeTab}Content` as keyof typeof newSessionData]}
                    onChange={e => setNewSessionData(prev => ({...prev, [`${activeTab}Content`]: e.target.value}))}
                    placeholder={templates[activeTab as keyof typeof templates]}
                    className="w-full h-36 p-4 bg-transparent outline-none transition-all resize-none text-[13px] font-mono text-gray-900 border-0 focus:ring-0 leading-relaxed"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold transition-all active:scale-[0.98]"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  disabled={!newSessionData.name.trim()}
                  className="flex-1 px-4 py-2.5 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]"
                >
                  {modalMode === 'create' ? '确认创建' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Session Info Modal removed - use context menu instead */}
      {/* Delete Confirmation Modal - outside aside to center properly */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsDeleteModalOpen(false)}></div>
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-sm overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">删除智能体</h3>
              <p className="text-sm text-gray-500">
                确定要删除此智能体吗？此操作将清空该智能体的所有记录且不可恢复。
              </p>
            </div>
            <div className="p-4 bg-gray-50 flex gap-3 border-t border-gray-100">
              <button 
                type="button" 
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl font-semibold transition-all"
              >
                取消
              </button>
              <button 
                type="button" 
                onClick={handleDeleteSession}
                className="flex-1 px-4 py-2.5 text-white bg-red-600 hover:bg-red-700 rounded-xl font-semibold transition-all"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <>
          <div 
            className="fixed inset-0 z-[300]" 
            onClick={closeContextMenu}
          />
          <div 
            className="fixed z-[301] bg-white rounded-xl border border-gray-200 shadow-xl py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-150"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => contextMenu.session && handleRename(contextMenu.session)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
              <span>重命名</span>
            </button>
            <button
              onClick={() => contextMenu.session && handleChangeModel(contextMenu.session)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
            >
              <Cpu className="w-4 h-4" />
              <span>指定API模型</span>
            </button>
            <button
              onClick={() => contextMenu.session && handleEditAgentInfo(contextMenu.session)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>编辑信息</span>
            </button>
            <div className="h-px bg-gray-100 my-1" />
            <button
              onClick={(e) => contextMenu.session && handleDeleteFromContext(e, contextMenu.session)}
              disabled={contextMenu.session?.id === 'main' || contextMenu.session?.id === 'main'}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash className="w-4 h-4" />
              <span>删除</span>
            </button>
          </div>
        </>
      )}

      {/* Rename Modal */}
      {isRenameModalOpen && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsRenameModalOpen(false)}></div>
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-sm overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Edit3 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">重命名智能体</h3>
                  <p className="text-xs text-gray-500">修改显示名称</p>
                </div>
              </div>
              <button 
                onClick={() => setIsRenameModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                智能体名称
              </label>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                placeholder="输入新名称..."
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                autoFocus
              />
            </div>
            <div className="p-4 bg-gray-50 flex gap-3 border-t border-gray-100">
              <button 
                type="button" 
                onClick={() => setIsRenameModalOpen(false)}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl font-semibold transition-all"
              >
                取消
              </button>
              <button 
                type="button" 
                onClick={submitRename}
                disabled={!renameValue.trim()}
                className="flex-1 px-4 py-2.5 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold transition-all"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model Selector Modal */}
      {isModelModalOpen && (
        <ModelSelectModal
          modelSessionId={modelSessionId}
          sessions={sessions}
          availableModels={availableModels}
          onClose={() => setIsModelModalOpen(false)}
          onSelect={submitModelChange}
        />
      )}
      
      {/* Agent Files Editor Modal */}
      {isFilesEditorOpen && (
        <AgentFilesEditorModal
          isOpen={isFilesEditorOpen}
          onClose={() => setIsFilesEditorOpen(false)}
          agentId={filesEditorAgentId}
          agentName={filesEditorAgentName}
          workspacePath={agentWorkspacePath}
          files={agentFiles}
          activeFileTab={activeFileTab}
          setActiveFileTab={setActiveFileTab}
          fileContents={fileContents}
          setFileContents={setFileContents}
          isLoading={isLoadingFiles}
          isSaving={isSavingFile}
          onSave={saveAgentFile}
        />
      )}
    </>
  );
}

// Model Select Modal Component
function ModelSelectModal({ modelSessionId, sessions, availableModels, onClose, onSelect }: {
  modelSessionId: string | null;
  sessions: {id: string, name: string}[];
  availableModels: any[];
  onClose: () => void;
  onSelect: (modelId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const session = sessions.find(s => s.id === modelSessionId);
  const currentModel = (session as any)?.model;

  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">指定API模型</h3>
              <p className="text-xs text-gray-500">为当前智能体选择独立模型</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 max-h-[400px] overflow-y-auto">
          {/* Search */}
          <div className="relative mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模型..."
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all text-sm pl-10"
            />
            <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          {/* Current model info */}
          <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-xs text-gray-500">当前模型：</span>
            <span className="text-sm font-mono text-gray-700 ml-2">{currentModel || '使用默认模型'}</span>
          </div>
          
          {/* Model list */}
          <div className="space-y-2">
            {/* Clear option */}
            <button
              onClick={() => onSelect('')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                !currentModel
                  ? 'bg-blue-50 border-blue-200 text-blue-600'
                  : 'bg-white border-gray-100 text-gray-700 hover:border-gray-200'
              }`}
            >
              <span className="text-sm font-medium">使用默认模型</span>
              {!currentModel && (
                <span className="text-xs bg-blue-100 px-2 py-0.5 rounded-full">当前</span>
              )}
            </button>
            
            {availableModels
              .filter(m => {
                if (!search) return true;
                const q = search.toLowerCase();
                return m.id.toLowerCase().includes(q) || (m.alias && m.alias.toLowerCase().includes(q));
              })
              .sort((a, b) => {
                if (a.primary && !b.primary) return -1;
                if (!a.primary && b.primary) return 1;
                return a.id.localeCompare(b.id, undefined, { sensitivity: 'base' });
              })
              .map(m => {
                const isSelected = currentModel === m.id;
                
                return (
                  <button
                    key={m.id}
                    onClick={() => onSelect(m.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-200 text-blue-600'
                        : 'bg-white border-gray-100 text-gray-700 hover:border-gray-200'
                    }`}
                  >
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-sm font-medium truncate">{m.alias || m.id}</div>
                      <div className="text-xs text-gray-400 font-mono truncate">{m.id}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {m.primary && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 rounded text-blue-600 font-medium">默认</span>
                      )}
                      {isSelected && (
                        <span className="text-xs bg-blue-100 px-2 py-0.5 rounded-full">当前</span>
                      )}
                    </div>
                  </button>
                );
              })
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// Agent Files Editor Modal Component
function AgentFilesEditorModal({ 
  isOpen, 
  onClose, 
  agentId, 
  agentName, 
  workspacePath, 
  files, 
  activeFileTab, 
  setActiveFileTab, 
  fileContents, 
  setFileContents, 
  isLoading, 
  isSaving, 
  onSave 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  agentId: string | null; 
  agentName: string; 
  workspacePath: string; 
  files: any[]; 
  activeFileTab: string; 
  setActiveFileTab: (tab: string) => void; 
  fileContents: Record<string, string>; 
  setFileContents: (contents: Record<string, string>) => void; 
  isLoading: boolean; 
  isSaving: boolean; 
  onSave: (filename: string) => void; 
}) {
  if (!isOpen || !agentId) return null;
  
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="bg-white rounded-2xl border border-gray-200 w-[80vw] h-[80vh] overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Settings className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">编辑智能体信息</h3>
              <p className="text-xs text-gray-500">{agentName} (ID: {agentId})</p>
              {workspacePath && (
                <p className="text-xs text-gray-400 mt-1 font-mono truncate max-w-[400px]" title={workspacePath}>
                  📁 {workspacePath}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeFileTab && (
              <button
                onClick={() => onSave(activeFileTab)}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98] flex items-center gap-2"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : null}
                保存
              </button>
            )}
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-center">
              <div className="w-10 h-10 border-3 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
              <div className="text-gray-500">加载文件...</div>
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Settings className="w-8 h-8 text-gray-400" />
              </div>
              <div className="text-gray-500 mb-2">暂无可编辑的文件</div>
              <div className="text-xs text-gray-400">该智能体的工作区中没有 .md 文件</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* File Tabs */}
            <div className="flex p-1 bg-gray-100/50 gap-1 overflow-x-auto no-scrollbar">
              {files.map((file) => (
                <button
                  key={file.name}
                  type="button"
                  onClick={() => setActiveFileTab(file.name)}
                  className={`flex-none px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap ${activeFileTab === file.name ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
                >
                  {file.name}
                </button>
              ))}
            </div>
            
            {/* File Editor */}
            {activeFileTab && (
              <div className="flex-1 relative min-h-0">
                <textarea
                  value={fileContents[activeFileTab] || ''}
                  onChange={(e) => setFileContents({
                    ...fileContents,
                    [activeFileTab]: e.target.value
                  })}
                  placeholder="在此编辑文件内容..."
                  className="w-full h-full p-4 bg-transparent outline-none transition-all resize-none text-[13px] font-mono text-gray-900 border-0 focus:ring-0 leading-relaxed"
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
