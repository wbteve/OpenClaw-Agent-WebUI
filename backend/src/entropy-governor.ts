/**
 * Entropy Governor
 * 
 * 控制 Agent 行为混乱，包括 token 预算、会话限制、行为监控
 * 基于 Harness Engineering 熵治理理念
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export interface EntropyConfig {
  // Token 预算
  tokenBudget: {
    daily: number;           // 每日限制
    monthly: number;          // 每月限制
    warningThreshold: number; // 警告阈值 (0.0 - 1.0)
  };
  
  // 会话限制
  sessionLimits: {
    maxConcurrent: number;    // 最大并发会话
    maxHistoryLength: number; // 历史消息数
    autoArchiveAfter: number; // 自动归档时间(天)
  };
  
  // 行为监控
  behavior: {
    enableAuditLog: boolean;  // 审计日志
    blockPatterns: string[];   // 禁止模式
    alertOnAnomaly: boolean;  // 异常告警
  };
}

export interface AgentEntropyState {
  agentId: string;
  config: EntropyConfig;
  stats: {
    todayTokens: number;
    monthTokens: number;
    totalSessions: number;
    activeSessions: number;
    lastReset: number;       // 上次重置时间
  };
  auditLog: AuditEntry[];
}

export interface AuditEntry {
  timestamp: number;
  action: string;
  sessionId?: string;
  details?: string;
  risk: 'low' | 'medium' | 'high';
}

export interface EntropyCheckResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
}

const ENTROPY_DIR = '.clawui/entropy';

/**
 * Entropy Governor 主类
 */
export class EntropyGovernor {
  private entropyDir: string;
  private states: Map<string, AgentEntropyState> = new Map();
  
  constructor() {
    this.entropyDir = path.join(os.homedir(), ENTROPY_DIR);
    fs.mkdirSync(this.entropyDir, { recursive: true });
    this.loadAllStates();
  }
  
  /**
   * 加载所有状态的配置
   */
  private loadAllStates(): void {
    try {
      const files = fs.readdirSync(this.entropyDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.entropyDir, file), 'utf-8');
          const state: AgentEntropyState = JSON.parse(content);
          const agentId = file.replace('.json', '');
          this.states.set(agentId, state);
        } catch (e) {
          console.error(`[EntropyGovernor] Failed to load ${file}:`, e);
        }
      }
    } catch (e) {
      console.log('[EntropyGovernor] No existing entropy states');
    }
  }
  
  /**
   * 获取或创建 Agent 状态
   */
  getOrCreateState(agentId: string): AgentEntropyState {
    if (this.states.has(agentId)) {
      return this.states.get(agentId)!;
    }
    
    const state: AgentEntropyState = {
      agentId,
      config: this.getDefaultConfig(),
      stats: {
        todayTokens: 0,
        monthTokens: 0,
        totalSessions: 0,
        activeSessions: 0,
        lastReset: Date.now()
      },
      auditLog: []
    };
    
    this.states.set(agentId, state);
    return state;
  }
  
  /**
   * 获取默认配置
   */
  private getDefaultConfig(): EntropyConfig {
    return {
      tokenBudget: {
        daily: 50000,
        monthly: 1000000,
        warningThreshold: 0.8
      },
      sessionLimits: {
        maxConcurrent: 5,
        maxHistoryLength: 1000,
        autoArchiveAfter: 30
      },
      behavior: {
        enableAuditLog: true,
        blockPatterns: [],
        alertOnAnomaly: true
      }
    };
  }
  
  /**
   * 更新配置
   */
  updateConfig(agentId: string, config: Partial<EntropyConfig>): void {
    const state = this.getOrCreateState(agentId);
    state.config = {
      ...state.config,
      ...config,
      tokenBudget: { ...state.config.tokenBudget, ...config.tokenBudget },
      sessionLimits: { ...state.config.sessionLimits, ...config.sessionLimits },
      behavior: { ...state.config.behavior, ...config.behavior }
    };
    this.saveState(state);
  }
  
  /**
   * 检查操作是否允许
   */
  checkOperation(agentId: string, operation: string, details?: string): EntropyCheckResult {
    const state = this.getOrCreateState(agentId);
    const warnings: string[] = [];
    
    // 检查 token 预算
    const todayUsage = state.stats.todayTokens / state.config.tokenBudget.daily;
    if (todayUsage >= 1) {
      return {
        allowed: false,
        reason: 'Daily token budget exceeded',
        warnings: ['Daily limit reached']
      };
    }
    if (todayUsage >= state.config.tokenBudget.warningThreshold) {
      warnings.push(`Token usage at ${Math.round(todayUsage * 100)}% of daily limit`);
    }
    
    // 检查并发会话
    if (state.stats.activeSessions >= state.config.sessionLimits.maxConcurrent) {
      return {
        allowed: false,
        reason: 'Maximum concurrent sessions reached',
        warnings: ['Session limit reached']
      };
    }
    
    // 检查禁止模式
    for (const pattern of state.config.behavior.blockPatterns) {
      if (details && details.includes(pattern)) {
        return {
          allowed: false,
          reason: `Blocked pattern detected: ${pattern}`,
          warnings: ['Blocked operation']
        };
      }
    }
    
    return { allowed: true, warnings };
  }
  
  /**
   * 记录 token 使用
   */
  recordTokenUsage(agentId: string, tokens: number): void {
    const state = this.getOrCreateState(agentId);
    state.stats.todayTokens += tokens;
    state.stats.monthTokens += tokens;
    this.saveState(state);
  }
  
  /**
   * 记录会话活动
   */
  recordSessionActivity(agentId: string, sessionId: string, action: 'start' | 'end'): void {
    const state = this.getOrCreateState(agentId);
    
    if (action === 'start') {
      state.stats.totalSessions++;
      state.stats.activeSessions++;
    } else {
      state.stats.activeSessions = Math.max(0, state.stats.activeSessions - 1);
    }
    
    this.saveState(state);
  }
  
  /**
   * 添加审计日志
   */
  addAuditEntry(agentId: string, entry: Omit<AuditEntry, 'timestamp'>): void {
    const state = this.getOrCreateState(agentId);
    
    if (!state.config.behavior.enableAuditLog) return;
    
    state.auditLog.push({
      ...entry,
      timestamp: Date.now()
    });
    
    // 只保留最近 1000 条
    if (state.auditLog.length > 1000) {
      state.auditLog = state.auditLog.slice(-1000);
    }
    
    this.saveState(state);
  }
  
  /**
   * 获取状态
   */
  getState(agentId: string): AgentEntropyState | undefined {
    return this.states.get(agentId);
  }
  
  /**
   * 获取所有 Agent 状态摘要
   */
  getAllStates(): { agentId: string; summary: { todayTokens: number; monthTokens: number; activeSessions: number } }[] {
    return Array.from(this.states.entries()).map(([agentId, state]) => ({
      agentId,
      summary: {
        todayTokens: state.stats.todayTokens,
        monthTokens: state.stats.monthTokens,
        activeSessions: state.stats.activeSessions
      }
    }));
  }
  
  /**
   * 重置每日统计
   */
  resetDailyStats(agentId: string): void {
    const state = this.getOrCreateState(agentId);
    state.stats.todayTokens = 0;
    state.stats.lastReset = Date.now();
    this.saveState(state);
  }
  
  /**
   * 保存状态到文件
   */
  private saveState(state: AgentEntropyState): void {
    try {
      const filePath = path.join(this.entropyDir, `${state.agentId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
    } catch (e) {
      console.error(`[EntropyGovernor] Failed to save state for ${state.agentId}:`, e);
    }
  }
  
  /**
   * 获取使用报告
   */
  getUsageReport(agentId: string): {
    daily: { used: number; limit: number; percentage: number };
    monthly: { used: number; limit: number; percentage: number };
    sessions: { active: number; max: number };
    warnings: string[];
  } | null {
    const state = this.states.get(agentId);
    if (!state) return null;
    
    const warnings: string[] = [];
    const dailyPct = state.stats.todayTokens / state.config.tokenBudget.daily;
    const monthlyPct = state.stats.monthTokens / state.config.tokenBudget.monthly;
    
    if (dailyPct >= state.config.tokenBudget.warningThreshold) {
      warnings.push(`Daily token usage at ${Math.round(dailyPct * 100)}%`);
    }
    if (monthlyPct >= state.config.tokenBudget.warningThreshold) {
      warnings.push(`Monthly token usage at ${Math.round(monthlyPct * 100)}%`);
    }
    if (state.stats.activeSessions >= state.config.sessionLimits.maxConcurrent) {
      warnings.push('Max concurrent sessions reached');
    }
    
    return {
      daily: {
        used: state.stats.todayTokens,
        limit: state.config.tokenBudget.daily,
        percentage: Math.round(dailyPct * 100)
      },
      monthly: {
        used: state.stats.monthTokens,
        limit: state.config.tokenBudget.monthly,
        percentage: Math.round(monthlyPct * 100)
      },
      sessions: {
        active: state.stats.activeSessions,
        max: state.config.sessionLimits.maxConcurrent
      },
      warnings
    };
  }
}

export default EntropyGovernor;