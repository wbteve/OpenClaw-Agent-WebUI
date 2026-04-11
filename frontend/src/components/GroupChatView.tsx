import { useState, useEffect, useRef } from 'react';
import { Menu, Send, Users, AtSign, X, Circle, MessageSquare, CheckCircle2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface Agent {
  id: string;
  name: string;
  online?: boolean;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  mentions: string[];
  isTask?: boolean;
  taskStatus?: 'pending' | 'processing' | 'done';
  taskAssignee?: string;
}

interface GroupChatViewProps {
  isConnected: boolean;
  onMenuClick: () => void;
}

export default function GroupChatView({ isConnected, onMenuClick }: GroupChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showContacts, setShowContacts] = useState(true); // 默认显示联系人
  const [showTasks, setShowTasks] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);

  // 加载历史消息和Agent列表
  useEffect(() => {
    const loadData = async () => {
      try {
        // 加载群聊历史
        const msgRes = await fetch('/api/group-chat/messages');
        const msgData = await msgRes.json();
        if (msgData.success && msgData.messages.length > 0) {
          setMessages(msgData.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          })));
        } else {
          setMessages([{
            id: 'system-welcome',
            senderId: 'system',
            senderName: '系统',
            content: '🎉 群聊已开启！\n\n📌 **使用方式：**\n• 点击右侧「👥 联系人」中的Agent可直接@提及\n• 输入 `@Agent名称 + 任务描述` 分配任务\n• 任务会自动推送给对应Agent处理',
            timestamp: new Date(),
            mentions: [],
          }]);
        }

        // 加载Agent列表
        const agentRes = await fetch('/api/group-chat/agents');
        const agentData = await agentRes.json();
        if (agentData.success) {
          setAgents(agentData.agents);
        }
      } catch (err) {
        console.error('Failed to load group chat data:', err);
      }
    };

    loadData();
  }, []);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 自动调整输入框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  // 解析@mention
  const parseMentions = (text: string): { cleanText: string; mentions: string[] } => {
    const mentionRegex = /@(\S+)/g;
    const mentions: string[] = [];
    
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      const agentName = match[1];
      const found = agents.find(a => a.name.includes(agentName) || a.id.includes(agentName));
      if (found && !mentions.includes(found.id)) {
        mentions.push(found.id);
      }
    }
    
    const cleanText = text.replace(/@(\S+)/g, (_, name) => `**@${name}**`);
    return { cleanText, mentions };
  };

  const isTaskMessage = (mentions: string[], text: string): boolean => {
    if (mentions.length === 0) return false;
    const taskKeywords = ['请', '帮我', '需要', '应该', '必须', '麻烦', '安排', '任务'];
    return taskKeywords.some(kw => text.includes(kw));
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const { cleanText, mentions } = parseMentions(input);
    const isTask = isTaskMessage(mentions, input);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      senderId: 'user',
      senderName: '我',
      content: cleanText,
      timestamp: new Date(),
      mentions,
      isTask,
      taskStatus: isTask ? 'pending' : undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/group-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          mentions,
          isTask,
          senderName: 'User',  // TODO: 可以从用户设置获取真实用户名
        }),
      });

      if (response.ok) {
        // 重新加载消息列表，获取agent的响应
        setTimeout(async () => {
          try {
            const msgRes = await fetch('/api/group-chat/messages');
            const msgData = await msgRes.json();
            if (msgData.success) {
              setMessages(msgData.messages.map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp)
              })));
            }
          } catch (err) {
            console.error('Failed to reload messages:', err);
          }
        }, 1000); // 等待1秒让agent响应
      }
    } catch (err) {
      console.error('Failed to send group message:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateTaskStatus = async (messageId: string, status: 'pending' | 'processing' | 'done') => {
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, taskStatus: status } : m
    ));

    try {
      await fetch(`/api/group-chat/task/${messageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      console.error('Failed to update task status:', err);
    }
  };

  const getTaskStatusIcon = (status?: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'processing': return '🔄';
      case 'done': return '✅';
      default: return '';
    }
  };

  // 插入@mention - 核心功能：点击联系人插入@
  const insertMention = (agent: Agent) => {
    const atText = `@${agent.name} `;
    setInput(prev => prev + atText);
    textareaRef.current?.focus();
    // 自动切换到联系人面板（如果不在）
    setShowContacts(true);
    setShowTasks(false);
  };

  // 渲染消息
  const renderMessage = (msg: Message) => {
    const isSystem = msg.senderId === 'system';
    const isUser = msg.senderId === 'user';
    const isTask = msg.isTask;

    return (
      <div 
        key={msg.id}
        className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}
      >
        <div className={`flex flex-col max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
          {!isSystem && (
            <div className={`flex items-center gap-2 mb-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <span className="text-xs font-semibold text-slate-500">{msg.senderName}</span>
              {msg.mentions.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">
                  {msg.mentions.length}人已收到
                </span>
              )}
            </div>
          )}

          <div 
            className={`relative px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed ${
              isSystem 
                ? 'bg-slate-100 text-slate-600 text-sm' 
                : isUser 
                  ? 'bg-blue-500 text-white rounded-br-md' 
                  : 'bg-slate-100 text-slate-800 rounded-bl-md'
            } ${isTask ? 'border-l-4 border-blue-400' : ''}`}
          >
            {isTask && msg.taskStatus && (
              <div className={`absolute -top-2 ${isUser ? 'right-2' : 'left-2'} px-2 py-0.5 text-[10px] rounded-full ${
                msg.taskStatus === 'done' ? 'bg-green-100 text-green-600' :
                msg.taskStatus === 'processing' ? 'bg-yellow-100 text-yellow-600' :
                'bg-slate-100 text-slate-500'
              }`}>
                {getTaskStatusIcon(msg.taskStatus)} {msg.taskStatus === 'pending' ? '待处理' : msg.taskStatus === 'processing' ? '处理中' : '已完成'}
              </div>
            )}

            {isSystem ? (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {msg.content}
              </ReactMarkdown>
            ) : (
              <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : ''} prose-p:m-0 [&_p]:mb-0`}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            )}

            <div className={`text-[10px] mt-1 ${isUser ? 'text-blue-100' : 'text-slate-400'} text-right`}>
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          {!isSystem && (
            <button
              onClick={() => setQuotedMessage(msg)}
              className="text-[12px] text-slate-400 hover:text-blue-500 mt-1"
            >
              引用回复
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <header className="h-14 px-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white z-10">
        <div className="flex items-center space-x-3">
          <button
            className="md:hidden text-slate-500 hover:text-slate-900"
            onClick={onMenuClick}
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-[17px] font-bold text-slate-900">群聊</h1>
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                {agents.filter(a => a.online).length} 人在线
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowContacts(!showContacts); if (!showContacts) setShowTasks(false); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              showContacts ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            联系人
          </button>
          
          <button
            onClick={() => { setShowTasks(!showTasks); if (!showTasks) setShowContacts(false); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              showTasks ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            任务 {messages.filter(m => m.isTask && m.taskStatus !== 'done').length > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {messages.filter(m => m.isTask && m.taskStatus !== 'done').length}
              </span>
            )}
          </button>
          
          <div className={`flex items-center gap-1.5 text-xs ${isConnected ? 'text-green-600' : 'text-red-500'}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} ${isLoading ? 'animate-pulse' : ''}`} />
            {isConnected ? '已连接' : '未连接'}
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* 主聊天区域 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>

          {/* 引用预览 */}
          {quotedMessage && (
            <div className="mx-4 mb-2 px-3 py-2 bg-blue-50 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold text-blue-500 block">引用 @{quotedMessage.senderName}</span>
                <div className="text-[13px] text-slate-600 line-clamp-1">{quotedMessage.content}</div>
              </div>
              <button
                onClick={() => setQuotedMessage(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 输入区域 */}
          <div className="p-4 bg-white border-t border-slate-200">
            <div className="flex flex-col gap-3 max-w-5xl mx-auto">
              {/* 输入框 */}
              <div className="flex items-end gap-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="输入消息，使用 @Agent名称 分配任务..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none text-[15px]"
                    disabled={isLoading}
                  />
                  
                  {/* @按钮 - 打开联系人面板 */}
                  <button
                    onClick={() => { setShowContacts(!showContacts); if (!showContacts) setShowTasks(false); }}
                    className={`absolute right-3 bottom-3 transition-colors ${showContacts ? 'text-blue-500' : 'text-slate-400 hover:text-blue-500'}`}
                  >
                    <AtSign className="w-5 h-5" />
                  </button>
                </div>

                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className={`px-6 py-3 rounded-xl font-bold text-white transition-all flex items-center gap-2 ${
                    input.trim() && !isLoading
                      ? 'bg-blue-500 hover:bg-blue-600 active:scale-95'
                      : 'bg-slate-300 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  发送
                </button>
              </div>

              {/* 快捷提示 */}
              <div className="text-[12px] text-slate-400 flex items-center gap-4">
                <span>Enter 发送</span>
                <span>Shift+Enter 换行</span>
                <span className="text-blue-500">@名称 分配任务</span>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧面板：联系人 / 任务列表 */}
        {(showContacts || showTasks) && (
          <div className="w-80 border-l border-slate-200 bg-white flex flex-col animate-in slide-in-from-right-2">
            
            {/* 联系人面板 */}
            {showContacts && (
              <>
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Agents 联系人
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">点击即可 @提及</p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {agents.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="text-4xl mb-2">👻</div>
                      <p className="text-sm text-slate-500">暂无Agent</p>
                      <p className="text-xs text-slate-400 mt-1">先创建Agent再开始群聊</p>
                    </div>
                  ) : (
                    agents.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => insertMention(agent)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                          agent.online
                            ? 'bg-white border border-slate-100 hover:border-blue-300 hover:bg-blue-50 active:scale-[0.98]'
                            : 'bg-slate-50 border border-slate-100 opacity-60'
                        }`}
                      >
                        {/* Avatar */}
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                          agent.online
                            ? 'bg-gradient-to-br from-blue-400 to-purple-500'
                            : 'bg-slate-300'
                        }`}>
                          <span className="text-white font-bold">
                            {agent.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800 truncate">
                              {agent.name}
                            </span>
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              agent.online ? 'bg-green-500' : 'bg-slate-400'
                            }`} />
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {agent.online ? '在线' : '离线'}
                          </span>
                        </div>
                        
                        {/* Add hint */}
                        <div className="flex-shrink-0 text-blue-400">
                          <AtSign className="w-4 h-4" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            {/* 任务列表面板 */}
            {showTasks && (
              <>
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    任务列表
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">管理所有分配的任务</p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.filter(m => m.isTask).length === 0 ? (
                    <div className="text-center py-8">
                      <div className="text-4xl mb-2">📭</div>
                      <p className="text-sm text-slate-500">暂无任务</p>
                      <p className="text-xs text-slate-400 mt-1">使用 @Agent 分配任务</p>
                    </div>
                  ) : (
                    messages.filter(m => m.isTask).map(task => (
                      <div 
                        key={task.id}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-700 line-clamp-2">
                              {task.content.replace(/\*\*/g, '')}
                            </div>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className="text-[10px] text-slate-400">
                                {task.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {task.mentions.map(agentId => {
                                const agent = agents.find(a => a.id === agentId);
                                return agent ? (
                                  <span key={agentId} className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded flex items-center gap-1">
                                    <AtSign className="w-3 h-3" />
                                    {agent.name}
                                  </span>
                                ) : null;
                              })}
                            </div>
                          </div>
                          <div className={`px-2 py-1 rounded-full text-[10px] font-medium flex-shrink-0 ${
                            task.taskStatus === 'done' ? 'bg-green-100 text-green-600' :
                            task.taskStatus === 'processing' ? 'bg-yellow-100 text-yellow-600' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {task.taskStatus === 'pending' ? '⏳待处理' :
                             task.taskStatus === 'processing' ? '🔄处理中' : '✅完成'}
                          </div>
                        </div>
                        
                        {/* 任务操作 */}
                        <div className="flex gap-2 mt-3 pt-2 border-t border-slate-100">
                          {task.taskStatus !== 'processing' && (
                            <button
                              onClick={() => updateTaskStatus(task.id, 'processing')}
                              className="flex-1 text-xs py-1.5 px-2 bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-100 transition-colors font-medium"
                            >
                              开始处理
                            </button>
                          )}
                          {task.taskStatus !== 'done' && (
                            <button
                              onClick={() => updateTaskStatus(task.id, 'done')}
                              className="flex-1 text-xs py-1.5 px-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors font-medium flex items-center justify-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              完成
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
