import { useState, useRef, useEffect, useCallback, Children, isValidElement, cloneElement, ReactNode } from 'react';
import { Menu, Plus, Quote, Copy, Check, Download, X, Search, ChevronUp, ChevronDown, Trash2, ChevronDown as ChevronDownIcon } from 'lucide-react';
import { getFileIconInfo } from '../utils/fileUtils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import FilePreviewModal from './FilePreviewModal';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  model?: string;
  agentId?: string;
  agentName?: string;
}

interface ChatViewProps {
  isConnected: boolean;
  activeSessionId: string;
  onMenuClick: () => void;
  sessions: {id: string, name: string, characterId?: string, model?: string, agentId?: string, key?: string | null, isSystemAgent?: boolean}[];
  systemAgents?: {id: string, name: string, characterId?: string, model?: string, agentId?: string, key?: string | null, isSystemAgent?: boolean}[];
  onSessionChange: (sessionId: string) => void;
}

export default function ChatView({ isConnected, activeSessionId, onMenuClick, sessions, systemAgents = [], onSessionChange }: ChatViewProps) {
  // --- States ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dynamicContents, setDynamicContents] = useState<Record<string, string>>({});
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [showCommands, setShowCommands] = useState(false);
  const [allCommands, setAllCommands] = useState<{ id: number; command: string; description: string }[]>([]);
  const [filteredCommands, setFilteredCommands] = useState<{ id: number; command: string; description: string }[]>([]);
  const [commandIndex, setCommandIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<{file: File, preview: string}[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<{url: string, filename: string} | null>(null);
  const [aiName, setAiName] = useState('OpenClaw');
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [_characters, setCharacters] = useState<any[]>([]);

  // --- Search States ---
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<string[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  // Find active session name - look in both sessions and systemAgents
  const activeSessionName = sessions.find(s => s.id === activeSessionId)?.name || systemAgents.find(s => s.id === activeSessionId)?.name || (aiName || '未命名角色');
  
  // Session dropdown state
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);
  
  // Get sessions belonging to the same agent as activeSession
  // Look in both user sessions and system agents
  const currentSession = sessions.find(s => s.id === activeSessionId) || systemAgents.find(s => s.id === activeSessionId);
  
  // For system agents: find user sessions where agentId matches the system agent's id
  // For user sessions: find other user sessions with same agentId or name
  const sameAgentSessions = sessions.filter(s => {
    // Don't include self
    if (s.id === activeSessionId) return false;
    
    // If current is a system agent (has isSystemAgent flag), match by agentId
    if (currentSession?.isSystemAgent) {
      return s.agentId === currentSession.id;
    }
    
    // For user sessions, match by agentId or name
    if (currentSession?.agentId && s.agentId === currentSession.agentId) return true;
    if (currentSession?.name && s.name === currentSession.name) return true;
    return false;
  });


  
  // --- Refs ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const commandListRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const justSelectedFileRef = useRef(false);
  const [navDots, setNavDots] = useState<{id: string; top: number; content: string}[]>([]);
  const [hoveredDot, setHoveredDot] = useState<string | null>(null);
  const [activeNavDot, setActiveNavDot] = useState<string | null>(null);

  // --- Nav dot calculation ---
  const recalcNavDots = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const totalScrollHeight = container.scrollHeight;
    if (totalScrollHeight <= 0) return;

    const userMsgs = messages.filter(m => m.role === 'user');
    const dots: {id: string; top: number; content: string}[] = [];

    userMsgs.forEach(msg => {
      const el = container.querySelector(`[data-user-msg-id="${msg.id}"]`) as HTMLElement | null;
      if (el) {
        const elTop = el.offsetTop;
        const proportional = (elTop / totalScrollHeight) * 100;
        dots.push({ id: msg.id, top: proportional, content: msg.content });
      }
    });

    setNavDots(dots);
  }, [messages]);

  // Update active dot on scroll
  const handleNavScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || navDots.length === 0) return;
    const scrollTop = container.scrollTop;
    const userMsgs = messages.filter(m => m.role === 'user');
    let closest: string | null = null;
    let closestDist = Infinity;

    userMsgs.forEach(msg => {
      const el = container.querySelector(`[data-user-msg-id="${msg.id}"]`) as HTMLElement | null;
      if (el) {
        const dist = Math.abs(el.offsetTop - scrollTop - container.clientHeight / 3);
        if (dist < closestDist) {
          closestDist = dist;
          closest = msg.id;
        }
      }
    });
    setActiveNavDot(closest);
  }, [messages, navDots]);

  useEffect(() => {
    recalcNavDots();
  }, [messages, recalcNavDots]);

  useEffect(() => {
    // Recalculate after images/content load
    const timer = setTimeout(recalcNavDots, 500);
    return () => clearTimeout(timer);
  }, [messages, recalcNavDots]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleNavScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleNavScroll);
  }, [handleNavScroll]);

  const scrollToUserMsg = (msgId: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-user-msg-id="${msgId}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const scrollToMessage = (msgId: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-msg-id="${msgId}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setActiveHighlightId(msgId);
      setTimeout(() => setActiveHighlightId(null), 2000);
    }
  };

  // Search logic effect
  useEffect(() => {
    if (!messageSearchQuery.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    const query = messageSearchQuery.toLowerCase();
    const matches = messages
      .filter(m => m.content.toLowerCase().includes(query))
      .map(m => m.id);

    setSearchMatches(matches);
    if (matches.length > 0) {
      // Start at the most recent match (bottom of the chat)
      const newIndex = matches.length - 1;
      setCurrentMatchIndex(newIndex);
      scrollToMessage(matches[newIndex]);
    } else {
      setCurrentMatchIndex(-1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageSearchQuery, messages.length]); // Don't re-run on 'messages' fully or it'll steal focus when typing

  const handleNextSearch = () => {
    if (searchMatches.length === 0) return;
    const newIdx = currentMatchIndex < searchMatches.length - 1 ? currentMatchIndex + 1 : 0;
    setCurrentMatchIndex(newIdx);
    scrollToMessage(searchMatches[newIdx]);
  };

  const handlePrevSearch = () => {
    if (searchMatches.length === 0) return;
    const newIdx = currentMatchIndex > 0 ? currentMatchIndex - 1 : searchMatches.length - 1;
    setCurrentMatchIndex(newIdx);
    scrollToMessage(searchMatches[newIdx]);
  };

  // --- Effects ---
  useEffect(() => {
    isInitialLoad.current = true; // Reset scroll behavior for new session
    // Abort any ongoing request when switching sessions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
    loadHistory();
  }, [activeSessionId]);

  useEffect(() => {
    // Fetch AI name from config
    fetch('/api/config')
      .then(r => r.json())
      .then(data => { if (data.aiName) setAiName(data.aiName); })
      .catch(() => {});
    
    fetchCommands();
    
    // Fetch characters for AI header details
    fetch('/api/characters')
      .then(res => res.json())
      .then(data => {
        if (data.success) setCharacters(data.characters);
      });
  }, []);

  const fetchCommands = async () => {
    try {
      const res = await fetch('/api/commands');
      const data = await res.json();
      if (data.success) setAllCommands(data.commands);
    } catch (err) {
      console.error('Failed to fetch commands:', err);
    }
  };

  const isInitialLoad = useRef(true);

  useEffect(() => {
    // Don't scroll (or flip the flag) when messages is empty — 
    // that's the initial state before loadHistory() completes.
    if (messages.length === 0) return;

    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        // Use 'instant' for initial load/session switch, 'smooth' for new messages
        messagesEndRef.current.scrollIntoView({ 
          behavior: isInitialLoad.current ? 'instant' : 'smooth',
          block: 'end'
        });
      }
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
      }
    };
    // Small delay to ensure DOM is rendered
    const timer = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timer);
  }, [messages]);

  // Auto-resize textarea logic
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${newHeight}px`;
    }

    // Handle command filtering
    if (input.startsWith('/') && !input.includes(' ')) {
      const filter = input.split(' ')[0].toLowerCase();
      const filtered = allCommands.filter(c => c.command.toLowerCase().includes(filter));
      setFilteredCommands(filtered);
      setShowCommands(filtered.length > 0);
      setCommandIndex(0);
    } else {
      setShowCommands(false);
    }
  }, [input, allCommands]);

  // Click outside to close commands
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (commandListRef.current && !commandListRef.current.contains(event.target as Node)) {
        setShowCommands(false);
      }
    };
    if (showCommands) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCommands]);

  // --- Handlers ---
  const loadHistory = async () => {
    try {
      const configRes = await fetch('/api/config');
      const configData = await configRes.json();
      if (configData?.defaultAgent && configData.defaultAgent !== 'main') {
        setCurrentModel(configData.defaultAgent);
      }

      const r = await fetch(`/api/history/${activeSessionId}`);
      const d = await r.json();
      if (d?.success && Array.isArray(d.messages)) {
        // Capture the session/model at load time as a FROZEN fallback for old messages
        // without stored snapshots. This prevents renames from retroactively polluting old messages.
        const loadTimeSession = sessions.find(s => s.id === activeSessionId) || systemAgents.find(s => s.id === activeSessionId);
        const loadTimeAgentName = loadTimeSession?.name || aiName || '';
        const loadTimeModel = loadTimeSession?.model || currentModel || '';

        const rows = d.messages.map((m: any) => ({
          id: String(m.id || Math.random()),
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content || ''),
          timestamp: new Date(m.created_at || Date.now()),
          model: m.model_used || loadTimeModel || undefined,
          agentId: m.agent_id || undefined,
          agentName: m.agent_name || loadTimeAgentName || undefined,
        }));
        setMessages(rows);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const handleCopy = (text: string, id: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }).catch(err => {
        console.error('Clipboard API failed, trying fallback', err);
        fallbackCopy(text, id);
      });
    } else {
      fallbackCopy(text, id);
    }
  };

  const fallbackCopy = (text: string, id: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Fallback copy failed', err);
    }
    document.body.removeChild(textArea);
  };

  const handleQuote = (msg: Message) => {
    setQuotedMessage(msg);
    textareaRef.current?.focus();
  };

  const handleDeleteMessage = (msgId: string) => {
    setMessageToDelete(msgId);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;
    try {
      const res = await fetch(`/api/messages/${messageToDelete}`, { method: 'DELETE' });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== messageToDelete));
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setIsDeleteModalOpen(false);
      setMessageToDelete(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCommandIndex(prev => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCommandIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const cmd = filteredCommands[commandIndex].command;
        setInput(cmd + ' ');
        setShowCommands(false);
        return;
      }
      if (e.key === 'Escape') {
        setShowCommands(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      // Ignore Enter immediately after a file was selected (file picker closed with Enter)
      if (justSelectedFileRef.current) {
        justSelectedFileRef.current = false;
        e.preventDefault();
        return;
      }
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!input.trim() && pendingFiles.length === 0 && !quotedMessage) || isLoading) return;

    const currentInput = input.trim();
    const currentFiles = [...pendingFiles];
    const currentQuote = quotedMessage;
    
    setInput('');
    setPendingFiles([]);
    setQuotedMessage(null);
    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // For display: markdown image format
      // For sending to OpenClaw: [附件: path] format
      let displayContent = '';
      let sendContent = '';
      if (currentFiles.length > 0) {
        const fd = new FormData();
        fd.append('sessionId', activeSessionId);
        currentFiles.forEach(f => fd.append('files', f.file));
        const upRes = await fetch('/api/files/upload', { method: 'POST', body: fd });
        const upData = await upRes.json();
        if (upData?.success && upData.files) {
          // Display format: markdown images
          displayContent = upData.files.map((f: any) => {
            const isImage = f.mimeType?.startsWith('image/');
            const name = f.name || '文件';
            if (isImage) {
              return `![${name}](${f.url})`;
            }
            return `[${name}](${f.url})`;
          }).join('\n');
          // Send format: [附件: path] for OpenClaw
          sendContent = upData.files.map((f: any) => {
            return `[附件: ${f.absolutePath}]`;
          }).join('\n');
        }
      }

      let textContent = currentInput;
      if (currentQuote) {
        const lines = currentQuote.content.split('\n');
        if (lines.length > 0) {
           lines[0] = `⟦quote:${currentQuote.id}⟧ ${lines[0]}`;
        }
        const quoteBlock = lines.map(line => `> ${line}`).join('\n');
        textContent = `${quoteBlock}\n\n${currentInput}`.trim();
      }

      // Display message uses markdown format
      const displayMessage = [displayContent, textContent].filter(Boolean).join('\n\n');
      // Send message uses [附件: path] format for OpenClaw
      const sendMessage = [sendContent, textContent].filter(Boolean).join('\n\n');
      if (!sendMessage) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: displayMessage, // Store markdown format for display
        timestamp: new Date(),
      };

      const assistantId = (Date.now() + 1).toString();
      // Snapshot the current model at send time so the badge doesn't change if the model switches later
      const currentSession = sessions.find(s => s.id === activeSessionId);
      const snapshotModel = currentSession?.model || currentModel || undefined;
      const snapshotAgentName = currentSession?.name || activeSessionName || undefined;

      setMessages(prev => [...prev, userMessage, {
        id: assistantId,
        role: 'assistant' as const,
        content: '',
        timestamp: new Date(),
        model: snapshotModel,
        agentName: snapshotAgentName,
      }]);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          message: sendMessage, // [附件: path] format for OpenClaw
          displayContent: displayMessage, // markdown format for database storage
        }),
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) throw new Error('API Error');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'delta' || evt.type === 'final') {
              setMessages(prev => prev.map(m => 
                m.id === assistantId ? { ...m, content: evt.text } : m
              ));
            }
            if (evt.type === 'error') {
              setMessages(prev => prev.map(m => 
                m.id === assistantId ? { ...m, content: `❌ Error: ${evt.error}` } : m
              ));
            }
          } catch {}
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // User cancelled
      } else {
        setMessages(prev => {
          // Update the placeholder if it exists, otherwise add error
          const hasPlaceholder = prev.some(m => m.role === 'assistant' && m.content === '');
          if (hasPlaceholder) {
            return prev.map(m => m.role === 'assistant' && m.content === '' 
              ? { ...m, content: `❌ Error: ${error.message}` } : m);
          }
          return [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `❌ Error: ${error.message}`,
            timestamp: new Date(),
          }];
        });
      }
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleFileChange = (files: File[]) => {
    if (!files.length) return;
    justSelectedFileRef.current = true;
    // Clear the flag after a short delay so normal Enter works again
    setTimeout(() => { justSelectedFileRef.current = false; }, 500);
    const newPending = files.map(f => ({
      file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : ''
    }));
    setPendingFiles(prev => [...prev, ...newPending]);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => {
      const target = prev[index];
      if (target.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData && e.clipboardData.files.length > 0) {
      e.preventDefault();
      const files = Array.from(e.clipboardData.files);
      handleFileChange(files);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      // Let handleFileChange manage the files as pending, identical to Plus button behavior
      handleFileChange(files);
    }
  };

  // --- Quick command sender (for interactive buttons) ---
  const sendQuickCommand = async (command: string) => {
    if (isLoading) return;
    setIsLoading(true);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: command,
      timestamp: new Date(),
    };
    const assistantId = (Date.now() + 1).toString();
    const qcSession = sessions.find(s => s.id === activeSessionId);
    const qcSnapshotModel = qcSession?.model || currentModel || undefined;
    const qcSnapshotAgentName = qcSession?.name || activeSessionName || undefined;
    setMessages(prev => [...prev, userMessage, {
      id: assistantId,
      role: 'assistant' as const,
      content: '',
      timestamp: new Date(),
      model: qcSnapshotModel,
      agentName: qcSnapshotAgentName,
    }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId, message: command }),
      });
      if (!response.ok) throw new Error('API Error');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'delta' || evt.type === 'final') {
              setMessages(prev => prev.map(m => 
                m.id === assistantId ? { ...m, content: evt.text } : m
              ));
            }
          } catch {}
        }
      }
    } catch (error: any) {
      setMessages(prev => prev.map(m => 
        m.id === assistantId ? { ...m, content: `❌ Error: ${error.message}` } : m
      ));
    } finally {
      setIsLoading(false);
    }
  };

  // --- Silent command sender (for in-place UI updates) ---
  const sendSilentCommand = async (messageId: string, command: string) => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat/silent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId, message: command }),
      });
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      if (data.response) {
        setDynamicContents(prev => ({
          ...prev,
          [messageId]: data.response
        }));
      }
    } catch (error: any) {
      console.error('Silent command failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Model response parser ---
  type ModelSelectorData = {
    type: 'providers' | 'models';
    header: string;
    items: { label: string; command: string }[];
  };

  const parseModelResponse = (content: string): ModelSelectorData | null => {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;

    // Detect provider listing: "Providers:" header + lines like "- ark (4)" or "ark (4)"
    if (lines[0]?.toLowerCase().startsWith('providers')) {
      const items: { label: string; command: string }[] = [];
      for (let i = 1; i < lines.length; i++) {
        let line = lines[i];
        if (line.startsWith('Use:') || line.startsWith('Switch:')) continue;
        // Strip markdown list bullets: "- ", "* ", "• "
        line = line.replace(/^[-*•]\s+/, '');
        const match = line.match(/^([a-zA-Z0-9_-]+(?:\s*\([^)]*\))?)\s*$/);
        if (match) {
          const providerName = line.replace(/\s*\(.*\)/, '').trim();
          items.push({ label: line, command: `/models ${providerName}` });
        }
      }
      if (items.length >= 2) {
        return { type: 'providers', header: 'Select a provider:', items };
      }
    }

    // Detect model listing: "Models (...): " header  + lines like "provider/model-name"
    if (lines[0]?.toLowerCase().startsWith('models')) {
      const items: { label: string; command: string }[] = [];
      for (let i = 1; i < lines.length; i++) {
        let line = lines[i];
        if (line.startsWith('Use:') || line.startsWith('Switch:')) continue;
        // Strip markdown list bullets
        line = line.replace(/^[-*•]\s+/, '');
        // Models typically have a "/" in them like "ark/doubao-1-5-pro-32k"
        const match = line.match(/^([a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+)/);
        if (match) {
          items.push({ label: match[1], command: `/model ${match[1]}` });
        }
      }
      if (items.length >= 1) {
        return { type: 'models', header: lines[0], items };
      }
    }

    return null;
  };

  const renderModelSelector = (messageId: string, data: ModelSelectorData) => {
    return (
      <div className="w-full">
        <p className="text-[14px] font-semibold text-slate-700 mb-3">{data.header}</p>
        <div className="grid grid-cols-2 gap-2 w-full max-w-md">
          {data.items.map((item, idx) => {
            const isProvider = data.type === 'providers';
            const isSelected = !isProvider && currentModel === item.command;
            
            return (
              <button
                key={idx}
                onClick={() => {
                  if (isProvider) {
                    // Navigate to provider (silent)
                    sendSilentCommand(messageId, item.command);
                  } else {
                    // Select model (normal log)
                    sendQuickCommand(`/model ${item.command}`);
                    setCurrentModel(item.command);
                    // Automatically return to providers list after a delay
                    setTimeout(() => {
                      sendSilentCommand(messageId, '/models');
                    }, 1200);
                  }
                }}
                disabled={isLoading}
                className={`px-4 py-2.5 rounded-xl text-[14px] font-medium transition-all text-center truncate border active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  isSelected
                    ? 'bg-brand-50 text-brand-600 border-brand-200'
                    : 'bg-slate-50 text-slate-700 border-transparent hover:bg-brand-50 hover:text-brand-600 hover:border-brand-200'
                }`}
              >
                {item.label}
                {isSelected && <span className="font-bold flex-shrink-0">V</span>}
              </button>
            );
          })}
          
          {/* Back button logic */}
          {data.type === 'models' && (
            <button
              onClick={() => sendSilentCommand(messageId, '/models')}
              disabled={isLoading}
              className="col-span-2 px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-[14px] font-bold text-slate-500 transition-all text-center border border-slate-200 active:scale-95 disabled:opacity-50"
            >
              ⬅️ 返回上一级 (Back)
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div 
      className="flex flex-col h-full bg-white relative"
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-[100] bg-brand-500/10 backdrop-blur-sm border-4 border-dashed border-brand-400 flex items-center justify-center p-12 transition-all">
          <div className="bg-white p-10 rounded-[40px] flex flex-col items-center gap-6 animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-brand-50 rounded-3xl flex items-center justify-center border border-brand-100">
              <Plus className="w-10 h-10 text-brand-600" />
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-slate-900 tracking-tight">释放文件以上传</p>
              <p className="text-sm text-slate-500 mt-1 font-medium italic">支持多文件、图片预览</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-14 px-4 sm:px-6 border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white z-10 w-full relative">
        {!showMobileSearch && (
          <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
            <button
              className="md:hidden text-slate-500 hover:text-slate-900 focus:outline-none pr-1"
              onClick={onMenuClick}
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
              <h1 className="text-[17px] sm:text-lg font-bold text-slate-900 leading-tight truncate flex items-center gap-2">
                <span className="truncate" title={activeSessionName || aiName}>
                  {activeSessionName || aiName}
                </span>
                {currentSession?.key && (
                  <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded truncate flex-shrink-0" title={decodeURIComponent(currentSession.key)}>
                    {decodeURIComponent(currentSession.key)}
                  </span>
                )}
              </h1>
              <div className={`flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm flex-shrink-0 ${isConnected ? 'text-emerald-600' : 'text-red-500'}`}>
                <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'} ${isLoading && isConnected ? 'animate-pulse' : ''}`}></span>
                <span className={`font-medium ${isLoading && isConnected ? 'animate-pulse' : ''}`}>
                  {!isConnected ? '未连接' : (isLoading ? '正在输入...' : '已连接')}
                </span>
              </div>
              
              {/* Session Selector Dropdown */}
              {sameAgentSessions.length > 0 && (
                <div className="relative flex items-center gap-2">
                  {/* Full session key display */}
                  {currentSession?.key && (
                    <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded max-w-[200px] truncate hidden lg:inline-block" title={currentSession.key}>
                      {decodeURIComponent(currentSession.key)}
                    </span>
                  )}
                  <button
                    onClick={() => setShowSessionDropdown(!showSessionDropdown)}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg border border-blue-200 transition-colors"
                    title="切换会话"
                  >
                    <span className="hidden sm:inline">会话</span>
                    <span className="sm:hidden">切</span>
                    <span className="bg-blue-200 text-blue-700 px-1 rounded text-[10px] font-bold">{sameAgentSessions.length + 1}</span>
                    <ChevronDownIcon className="w-3 h-3" />
                  </button>
                  
                  {showSessionDropdown && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowSessionDropdown(false)}
                      />
                      <div className="absolute top-full left-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl py-1 min-w-[200px] max-w-[320px] z-50">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                          同一 Agent 的会话
                        </div>
                        
                        {/* Current session */}
                        <button
                          onClick={() => setShowSessionDropdown(false)}
                          className="w-full flex flex-col items-start px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="truncate font-medium">当前: {activeSessionName}</span>
                            <span className="text-[10px] bg-blue-200 px-1.5 py-0.5 rounded text-blue-700 ml-2">当前</span>
                          </div>
                          {currentSession?.key && (
                            <span className="text-[10px] font-mono text-gray-500 mt-1 truncate w-full">{decodeURIComponent(currentSession.key)}</span>
                          )}
                        </button>
                        
                        {/* Other sessions of same agent */}
                        {sameAgentSessions.map(session => (
                          <button
                            key={session.id}
                            onClick={() => {
                              setShowSessionDropdown(false);
                              onSessionChange(session.id);
                            }}
                            className="w-full flex flex-col items-start px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="truncate">{session.name || session.id}</span>
                              <span className="text-xs text-gray-400 ml-2">{session.model ? session.model.split('/').pop() : ''}</span>
                            </div>
                            {session.key && (
                              <span className="text-[10px] font-mono text-gray-400 mt-0.5 truncate w-full">{decodeURIComponent(session.key)}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!showMobileSearch && (
          <button
            className="md:hidden p-2 text-slate-500 hover:text-slate-900 ml-auto"
            onClick={() => setShowMobileSearch(true)}
          >
            <Search className="w-5 h-5" />
          </button>
        )}

        {/* Global Message Search */}
        <div className={`flex-1 max-w-sm ml-auto items-center justify-end md:pl-6 ${showMobileSearch ? 'flex w-full' : 'hidden md:flex'}`}>
          <div className="relative w-full group flex items-center gap-1 sm:gap-2">
            {showMobileSearch && (
              <button onClick={() => { setShowMobileSearch(false); setMessageSearchQuery(''); }} className="md:hidden p-2 text-slate-500 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            )}
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
              </div>
            <input
              type="text"
              placeholder="搜索当前对话内容..."
              value={messageSearchQuery}
              onChange={(e) => setMessageSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) handlePrevSearch();
                  else handleNextSearch();
                }
              }}
              className="block w-full pl-9 pr-24 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:border-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-sm font-medium placeholder:text-slate-400"
            />
            {messageSearchQuery && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-1.5 space-x-1">
                <span className="text-[11px] font-bold text-slate-400 px-1 border-r border-slate-200 mr-0.5">
                  {searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : '0/0'}
                </span>
                <button
                  onClick={handlePrevSearch}
                  disabled={searchMatches.length === 0}
                  className="p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-md disabled:opacity-30 disabled:hover:bg-transparent"
                  title="上一个 (Shift+Enter)"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextSearch}
                  disabled={searchMatches.length === 0}
                  className="p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-md disabled:opacity-30 disabled:hover:bg-transparent"
                  title="下一个 (Enter)"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setMessageSearchQuery('')}
                  className="p-1 mr-1 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-md ml-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          </div>
        </div>
      </header>

      {/* Message List Area */}
      <div className="flex-1 flex relative min-h-0">
        {/* Navigation dots overlaying the Sidebar border */}
        {navDots.length > 0 && (
          <div className="hidden md:block absolute left-0 top-0 bottom-0 w-0 z-[60]">
            <div className="absolute inset-0 flex flex-col pt-4 pb-4">
              {navDots.map((dot) => (
                <div
                  key={dot.id}
                  className="absolute left-0 -translate-x-1/2 z-10"
                  style={{ top: `${Math.max(2, Math.min(98, dot.top))}%` }}
                  onMouseEnter={() => setHoveredDot(dot.id)}
                  onMouseLeave={() => setHoveredDot(null)}
                >
                  <button
                    onClick={() => scrollToUserMsg(dot.id)}
                    className={`rounded-full transition-all duration-200 hover:scale-150 relative ${
                      activeNavDot === dot.id
                        ? 'w-3 h-3 bg-brand-500'
                        : 'w-2.5 h-2.5 bg-slate-400 hover:bg-brand-400'
                    }`}
                  />
                  {/* Tooltip */}
                  {hoveredDot === dot.id && (
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 w-max max-w-[240px] px-3 py-2 bg-slate-800 text-white text-[12px] rounded-lg whitespace-pre-wrap break-words leading-relaxed pointer-events-none animate-in fade-in duration-150 z-50">
                      <div className="line-clamp-3">{dot.content}</div>
                      <div className="absolute top-1/2 -translate-y-1/2 left-[-4px] w-0 h-0 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-slate-800" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:px-8 sm:py-4 space-y-6 bg-white scroll-smooth pb-0 relative">
        <div className="flex justify-center mb-8">
            <span className="px-4 py-1.5 bg-slate-100 text-slate-500 text-[11px] rounded-full font-bold">
                {messages.length > 0 ? messages[0].timestamp.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '开始对话'}
            </span>
        </div>

        {messages.map((msg, index) => {
          const isHighlighted = activeHighlightId === msg.id;
          const prevMsg = index > 0 ? messages[index - 1] : null;
          const showDateDivider = prevMsg && msg.timestamp.toDateString() !== prevMsg.timestamp.toDateString();

          return (
          <div key={msg.id}>
            {showDateDivider && (
              <div className="flex items-center justify-center my-8 gap-4">
                <div className="h-px bg-slate-200 flex-1"></div>
                <span className="px-4 py-1.5 bg-slate-100 text-slate-500 text-[11px] rounded-full font-bold">
                  {msg.timestamp.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
                <div className="h-px bg-slate-200 flex-1"></div>
              </div>
            )}
            <div data-msg-id={msg.id} {...(msg.role === 'user' ? {'data-user-msg-id': msg.id} : {})} className={`flex w-full mb-4 transition-all duration-500 group/msg ${isHighlighted ? 'ring-4 ring-brand-500/20 bg-brand-50/30 -mx-4 px-4 py-2 rounded-2xl' : ''} ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex flex-col min-w-0 ${msg.role === 'user' ? 'items-end max-w-[85%] sm:max-w-[70%]' : 'items-start max-w-[85%] sm:max-w-[70%]'}`}>
                {msg.role === 'assistant' ? (
                  <div className="flex gap-3 w-full">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-500 flex items-center justify-center mt-0.5">
                      <span className="text-sm">{activeSessionName?.charAt(0) || '🤖'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="group relative text-[15px] leading-[1.7] transition-all duration-300 text-slate-800 p-0 bg-transparent">
                        <div className={`prose prose-sm max-w-none prose-slate prose-pre:border prose-pre:border-slate-100 text-[15px] ${isHighlighted ? 'prose-pre:bg-brand-50' : 'prose-pre:bg-slate-50'}`}>
                          {(() => {
                            const content = dynamicContents[msg.id] || msg.content;
                            const selectorData = parseModelResponse(content);
                            if (selectorData) return renderModelSelector(msg.id, selectorData);
                            return (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkBreaks]}
                                components={{
                                  code({ node, inline, className, children, ...props }: any) {
                                    const match = /language-(\w+)/.exec(className || '');
                                    const codeText = String(children).replace(/\n$/, '');
                                    return !inline && match ? (
                                      <div className="relative group/code mt-4 mb-4">
                                        <div className="absolute right-2 top-2 z-20">
                                          <button
                                            onClick={() => handleCopy(codeText, `code-${msg.id}`)}
                                            className="p-1 px-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50 transition-all opacity-0 group-hover/code:opacity-100 flex items-center gap-1.5 text-[13px] font-sans font-medium"
                                          >
                                            {copiedId === `code-${msg.id}` ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            <span>{copiedId === `code-${msg.id}` ? '已复制' : '复制'}</span>
                                          </button>
                                        </div>
                                        <SyntaxHighlighter
                                          style={oneLight}
                                          language={match[1]}
                                          PreTag="div"
                                          className="rounded-2xl !text-[14px] !bg-slate-50 !p-5 !m-0 border border-slate-100"
                                          {...props}
                                        >
                                          {codeText}
                                        </SyntaxHighlighter>
                                      </div>
                                    ) : (
                                      <code className="bg-slate-100 text-rose-600 px-1.5 py-0.5 rounded font-mono text-[14px]" {...props}>
                                        {children}
                                      </code>
                                    );
                                  },
                                  blockquote({ node, children, ...props }: any) {
                                    let quoteId = '';
                                    const processChildren = (childArray: ReactNode[]): ReactNode[] => {
                                      const mapped = Children.map(childArray, (child) => {
                                        if (typeof child === 'string') {
                                          const match = child.match(/⟦quote:(.+?)⟧/);
                                          if (match) {
                                            quoteId = match[1];
                                            return child.replace(/⟦quote:(.+?)⟧\s*/, '');
                                          }
                                          return child;
                                        }
                                        if (isValidElement(child)) {
                                          if (child.props && (child.props as any).children) {
                                            return cloneElement(child, {
                                              ...child.props,
                                              children: processChildren(Children.toArray((child.props as any).children))
                                            } as any);
                                          }
                                        }
                                        return child;
                                      });
                                      return mapped ? (mapped as ReactNode[]) : [];
                                    };
                                    const processedChildren = processChildren(Children.toArray(children));
                                    return (
                                      <blockquote
                                        className={`bg-slate-50 px-4 py-3 mt-2 mb-4 text-[14px] rounded-xl border border-slate-200 ${quoteId ? 'cursor-pointer hover:bg-slate-100 transition-colors' : 'text-slate-600'}`}
                                        onClick={() => { if (quoteId) scrollToMessage(quoteId); }}
                                        {...props}
                                      >
                                        <div className={quoteId ? "line-clamp-2 overflow-hidden break-all text-slate-500 [&_p]:!m-0 [&_a]:!m-0 [&_a]:break-all [&_a]:break-words" : "break-all [&_p]:!m-0 [&_a]:!m-0 [&_a]:break-all [&_a]:break-words"}>
                                          {processedChildren}
                                        </div>
                                      </blockquote>
                                    );
                                  },
                                  img({ src, alt }) {
                                    return (
                                      <div
                                        className="inline-block relative overflow-hidden rounded-xl border border-slate-200/60 max-w-[200px] m-1 transition-transform hover:scale-[1.02] cursor-pointer bg-white"
                                        onClick={() => { if (src) setPreviewFile({ url: src, filename: alt || 'image.png' }); }}
                                      >
                                        <img src={src} alt={alt} className="w-full h-auto block m-0" loading="lazy" />
                                      </div>
                                    );
                                  },
                                  a({ href, children, ...props }) {
                                    const isUpload = href?.startsWith('/uploads/') || href?.startsWith('/openclaw/') || href?.startsWith('/api/files/download');
                                    if (!isUpload) {
                                      return (
                                        <span className="relative inline group/link">
                                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline" {...props}>{children}</a>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              const url = href || '';
                                              const btn = e.currentTarget;
                                              const orig = btn.textContent;
                                              const done = () => { btn.textContent = '\u5df2\u590d\u5236!'; setTimeout(() => { btn.textContent = orig; }, 1500); };
                                              if (navigator.clipboard?.writeText) {
                                                navigator.clipboard.writeText(url).then(done).catch(() => {
                                                  const el = document.createElement('textarea');
                                                  el.value = url; el.style.position = 'fixed'; el.style.opacity = '0';
                                                  document.body.appendChild(el); el.focus(); el.select();
                                                  document.execCommand('copy'); document.body.removeChild(el); done();
                                                });
                                              } else {
                                                const el = document.createElement('textarea');
                                                el.value = url; el.style.position = 'fixed'; el.style.opacity = '0';
                                                document.body.appendChild(el); el.focus(); el.select();
                                                document.execCommand('copy'); document.body.removeChild(el); done();
                                              }
                                            }}
                                            className="opacity-0 group-hover/link:opacity-100 pointer-events-none group-hover/link:pointer-events-auto absolute top-full left-0 mt-0 px-2 py-1 bg-slate-100 border border-slate-300 text-slate-900 text-sm font-medium rounded-md whitespace-nowrap cursor-pointer transition-opacity duration-150 z-50"
                                          >
                                            复制链接
                                          </button>
                                        </span>
                                      );
                                    }
                                    const displayName = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : href?.split('/').pop() || 'file';
                                    const { Icon, typeText, bgColor } = getFileIconInfo(displayName);
                                    return (
                                      <div
                                        className="inline-flex items-center gap-3 p-3 w-[260px] rounded-2xl bg-white border border-slate-200 transition-all group no-underline flex-shrink-0 cursor-pointer hover:border-brand-300 hover:bg-brand-50/50"
                                        onClick={() => { if (!href) return; setPreviewFile({ url: href, filename: displayName }); }}
                                      >
                                        <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center flex-shrink-0 text-white border border-black/10`}>
                                          <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0 pr-2">
                                          <div className="text-[14px] font-semibold text-slate-800 truncate m-0 leading-tight">{children}</div>
                                          <div className="text-[11px] font-medium text-slate-400 mt-1 uppercase tracking-wider">{typeText}</div>
                                        </div>
                                        <div
                                          className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-all flex-shrink-0 cursor-pointer z-10 hover:bg-brand-50"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const link = document.createElement('a');
                                            link.href = href || '';
                                            link.download = displayName;
                                            document.body.appendChild(link);
                                            link.click();
                                            document.body.removeChild(link);
                                          }}
                                        >
                                          <Download className="w-4 h-4 text-slate-400 group-hover:text-brand-500" />
                                        </div>
                                      </div>
                                    );
                                  },
                                  p(props: any) {
                                    const nodes = props.node?.children || [];
                                    const isAttachmentBlock = nodes.length > 0 && nodes.every(
                                      (child: any) =>
                                        (child.type === 'element' && child.tagName === 'img') ||
                                        (child.type === 'element' && child.tagName === 'a') ||
                                        (child.type === 'text' && child.value.trim() === '') ||
                                        (child.type === 'element' && child.tagName === 'br')
                                    );
                                    const attachmentCount = nodes.filter(
                                      (c: any) => c.type === 'element' && (c.tagName === 'img' || c.tagName === 'a')
                                    ).length;
                                    if (isAttachmentBlock && attachmentCount > 0) {
                                      return (
                                        <div className="flex flex-wrap gap-3 mb-4 w-full items-start">
                                          {props.children}
                                        </div>
                                      );
                                    }
                                    return <p className="mb-4 last:mb-0 break-words" {...props} />;
                                  }
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center space-x-3 text-[14px] text-slate-500 font-sans font-normal">
                        <span className="text-[12px] opacity-70 font-sans">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <button onClick={() => handleQuote(msg)} className="hover:text-brand-600 transition-colors flex items-center gap-1.5">
                          <Quote className="w-4 h-4" /> 引用
                        </button>
                        <span className="text-slate-200 font-extralight">|</span>
                        <button
                          onClick={() => handleCopy(msg.content, msg.id)}
                          className={`hover:text-brand-600 transition-colors flex items-center gap-1 ${copiedId === msg.id ? 'text-brand-600' : ''}`}
                        >
                          {copiedId === msg.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {copiedId === msg.id ? '已复制' : '复制'}
                        </button>
                        <span className="text-slate-200 font-extralight">|</span>
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="hover:text-red-500 transition-colors flex items-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" /> 删除
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="group relative text-[15px] leading-[1.7] transition-all duration-300 text-slate-700 px-4 py-2.5 rounded-2xl rounded-br-md bg-user-bubble">
                      <div className={`prose prose-sm max-w-none prose-slate prose-pre:border prose-pre:border-slate-100 text-[15px] ${isHighlighted ? 'prose-pre:bg-brand-50' : 'prose-pre:bg-slate-50'}`}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkBreaks]}
                          components={{
                            code({ node, inline, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '');
                              const codeText = String(children).replace(/\n$/, '');
                              return !inline && match ? (
                                <div className="relative group/code mt-4 mb-4">
                                  <div className="absolute right-2 top-2 z-20">
                                    <button
                                      onClick={() => handleCopy(codeText, `code-${msg.id}`)}
                                      className="p-1 px-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50 transition-all opacity-0 group-hover/code:opacity-100 flex items-center gap-1.5 text-[13px] font-sans font-medium"
                                    >
                                      {copiedId === `code-${msg.id}` ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                      <span>{copiedId === `code-${msg.id}` ? '已复制' : '复制'}</span>
                                    </button>
                                  </div>
                                  <SyntaxHighlighter
                                    style={oneLight}
                                    language={match[1]}
                                    PreTag="div"
                                    className="rounded-2xl !text-[14px] !bg-slate-50 !p-5 !m-0 border border-slate-100"
                                    {...props}
                                  >
                                    {codeText}
                                  </SyntaxHighlighter>
                                </div>
                              ) : (
                                <code className="bg-slate-100 text-rose-600 px-1.5 py-0.5 rounded font-mono text-[14px]" {...props}>
                                  {children}
                                </code>
                              );
                            },
                            img({ src, alt }) {
                              return (
                                <div
                                  className="inline-block relative overflow-hidden rounded-xl border border-slate-200/60 max-w-[200px] m-1 transition-transform hover:scale-[1.02] cursor-pointer bg-white"
                                  onClick={() => { if (src) setPreviewFile({ url: src, filename: alt || 'image.png' }); }}
                                >
                                  <img src={src} alt={alt} className="w-full h-auto block m-0" loading="lazy" />
                                </div>
                              );
                            },
                            a({ href, children, ...props }) {
                              const isUpload = href?.startsWith('/uploads/') || href?.startsWith('/openclaw/') || href?.startsWith('/api/files/download');
                              if (!isUpload) {
                                return <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline" {...props}>{children}</a>;
                              }
                              const displayName = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : href?.split('/').pop() || 'file';
                              const { Icon, typeText, bgColor } = getFileIconInfo(displayName);
                              return (
                                <div
                                  className="inline-flex items-center gap-3 p-3 w-[260px] rounded-2xl bg-white border border-slate-200 transition-all group no-underline flex-shrink-0 cursor-pointer hover:border-brand-300 hover:bg-brand-50/50"
                                  onClick={() => { if (!href) return; setPreviewFile({ url: href, filename: displayName }); }}
                                >
                                  <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center flex-shrink-0 text-white border border-black/10`}>
                                    <Icon className="w-5 h-5" />
                                  </div>
                                  <div className="flex-1 min-w-0 pr-2">
                                    <div className="text-[14px] font-semibold text-slate-800 truncate m-0 leading-tight">{children}</div>
                                    <div className="text-[11px] font-medium text-slate-400 mt-1 uppercase tracking-wider">{typeText}</div>
                                  </div>
                                </div>
                              );
                            },
                            p(props: any) {
                              const nodes = props.node?.children || [];
                              const isAttachmentBlock = nodes.length > 0 && nodes.every(
                                (child: any) =>
                                  (child.type === 'element' && child.tagName === 'img') ||
                                  (child.type === 'element' && child.tagName === 'a') ||
                                  (child.type === 'text' && child.value.trim() === '') ||
                                  (child.type === 'element' && child.tagName === 'br')
                              );
                              const attachmentCount = nodes.filter(
                                (c: any) => c.type === 'element' && (c.tagName === 'img' || c.tagName === 'a')
                              ).length;
                              if (isAttachmentBlock && attachmentCount > 0) {
                                return (
                                  <div className="flex flex-wrap gap-3 mb-4 w-full items-start">
                                    {props.children}
                                  </div>
                                );
                              }
                              return <p className="mb-4 last:mb-0 break-words" {...props} />;
                            }
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center space-x-3 text-[14px] text-slate-500 font-sans font-normal justify-end">
                      <span className="text-[12px] opacity-70 font-sans">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <button onClick={() => handleQuote(msg)} className="hover:text-brand-600 transition-colors flex items-center gap-1.5">
                        <Quote className="w-4 h-4" /> 引用
                      </button>
                      <span className="text-slate-200 font-extralight">|</span>
                      <button
                        onClick={() => handleCopy(msg.content, msg.id)}
                        className={`hover:text-brand-600 transition-colors flex items-center gap-1 ${copiedId === msg.id ? 'text-brand-600' : ''}`}
                      >
                        {copiedId === msg.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedId === msg.id ? '已复制' : '复制'}
                      </button>
                      <span className="text-slate-200 font-extralight">|</span>
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="hover:text-red-500 transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="w-4 h-4" /> 删除
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
        <div ref={messagesEndRef} />
      </div>


      </div>

      {/* Input Area - Gemini Style */}
      <div className="px-4 sm:px-6 pb-6 sm:pb-4 pt-2 flex-shrink-0 bg-white">
        <div className="max-w-5xl mx-auto flex flex-col gap-3">
          {/* Previews (TG Style) */}
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-3 pb-2 animate-in slide-in-from-bottom-2 duration-300">
              {pendingFiles.map((pf, idx) => (
                <div key={idx} className={`relative group ${pf.preview ? 'w-24 h-24' : 'w-max min-w-[120px] max-w-[200px] h-14 pl-2 pr-3 flex items-center gap-2'} rounded-xl overflow-hidden bg-white border border-slate-200 flex-shrink-0 transition-all hover:scale-[1.02] active:scale-95 hover:bg-brand-50/50 hover:border-brand-200`}>
                   {pf.preview ? (
                    <img src={pf.preview} className="w-full h-full object-cover" alt="preview" />
                  ) : (
                    (() => {
                      const { Icon, typeText, bgColor } = getFileIconInfo(pf.file.name);
                      return (
                        <>
                          <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center flex-shrink-0 text-white`}>
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex flex-col min-w-0 pr-4">
                            <span className="text-[12px] font-semibold text-slate-700 truncate w-full">{pf.file.name}</span>
                            <span className="text-[10px] text-slate-400 capitalize">{typeText}</span>
                          </div>
                        </>
                      );
                    })()
                  )}
                  <button 
                    onClick={() => removePendingFile(idx)}
                    className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-red-500 text-white rounded-full p-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all border border-transparent hover:border-white/20"
                  >
                    <Plus className="w-3.5 h-3.5 rotate-45" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Gemini-style input card */}
          <form onSubmit={handleSubmit} className="relative flex flex-col border border-slate-200 rounded-2xl bg-white overflow-visible focus-within:border-slate-300 transition-colors">
            {/* Quote Preview */}
            {quotedMessage && (
              <div className="mx-4 mt-3 mb-1 px-3 py-2 bg-slate-100 rounded-lg relative group flex items-start justify-between animate-in fade-in slide-in-from-bottom-2">
                 <div className="flex-1 min-w-0 pr-4">
                    <span className="text-[11px] font-bold text-slate-500 mb-0.5 block tracking-wider">引用内容</span>
                    <div className="text-[13px] text-slate-700 line-clamp-2 break-words text-ellipsis overflow-hidden">
                       {quotedMessage.content}
                    </div>
                 </div>
                 <button
                   type="button"
                   onClick={() => setQuotedMessage(null)}
                   className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-200 transition-all flex-shrink-0"
                 >
                   <X className="w-4 h-4" />
                 </button>
              </div>
            )}

            {/* Command Suggestions (Unified at top-left) */}
            {showCommands && filteredCommands.length > 0 && (
              <div
                ref={commandListRef}
                className="absolute bottom-full left-0 mb-4 w-72 bg-white rounded-2xl border border-slate-200 z-[100] py-2 overflow-hidden animate-in fade-in slide-in-from-bottom-2"
              >
                <div className="px-4 py-2.5 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-1 flex justify-between items-center">
                  <span>快捷指令</span>
                  <span>{filteredCommands.length} 个结果</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredCommands.map((cmd, idx) => (
                    <button 
                      key={cmd.id}
                      type="button"
                      onClick={() => { 
                          setInput(cmd.command + ' '); 
                          setShowCommands(false); 
                          textareaRef.current?.focus();
                      }} 
                      onMouseEnter={() => setCommandIndex(idx)}
                      className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 transition-colors ${idx === commandIndex ? 'bg-brand-100' : 'hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-extrabold ${idx === commandIndex ? 'text-brand-600' : 'text-slate-900'}`}>{cmd.command}</span>
                      </div>
                      <div className="text-[13px] text-slate-500 truncate">{cmd.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter 发送消息，Shift + Enter 换行"
              disabled={isLoading}
              className="w-full min-h-[44px] max-h-[200px] py-3 pl-5 pr-8 bg-transparent focus:outline-none text-[16px] font-medium placeholder:text-slate-400 resize-none overflow-y-auto leading-relaxed border-none scrollbar-hide"
            />
            
            {/* Bottom toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100">
              {/* Left actions */}
              <div className="flex items-center gap-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileChange(Array.from(e.target.files || []))}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                >
                  <Plus className="w-5 h-5" />
                </button>

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      if (showCommands) {
                        setShowCommands(false);
                      } else {
                        setFilteredCommands(allCommands);
                        setCommandIndex(0);
                        setShowCommands(true);
                      }
                    }}
                    className="h-9 px-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all font-bold text-base"
                  >
                    /
                  </button>
                </div>
              </div>

              {/* Right: Stop / Send button */}
              {isLoading ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="px-4 h-9 flex items-center gap-1.5 justify-center rounded-lg transition-all font-bold text-sm bg-red-100 text-red-600 hover:bg-red-200 active:scale-95"
                >
                  <span className="w-3 h-3 rounded-sm bg-red-600 inline-block flex-shrink-0" />
                  停止
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() && pendingFiles.length === 0 && !quotedMessage}
                  className={`px-4 h-9 flex items-center justify-center rounded-lg transition-all font-bold text-sm ${
                    input.trim() || pendingFiles.length > 0 || quotedMessage
                      ? 'bg-brand-600 text-white hover:bg-brand-700 active:scale-95'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  发送
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Unified File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          url={previewFile.url}
          filename={previewFile.filename}
          onClose={() => setPreviewFile(null)}
        />
      )}
      {/* Custom Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsDeleteModalOpen(false)}
          ></div>
          <div className="bg-white rounded-[32px] border border-slate-200 w-full max-w-[340px] overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-8 text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-3xl bg-red-50 mb-6 border border-red-100">
                <Trash2 className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2 tracking-tight">确认删除消息？</h3>
              <p className="text-sm text-slate-500 leading-relaxed px-2">该操作将永久从对话历史中移除此条消息，且无法撤销。</p>
            </div>
            <div className="p-5 bg-slate-50/80 flex gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 px-4 py-3 text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 active:scale-95 rounded-2xl font-bold text-sm transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDeleteMessage}
                className="flex-1 px-4 py-3 text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-2xl font-bold text-sm transition-all"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
