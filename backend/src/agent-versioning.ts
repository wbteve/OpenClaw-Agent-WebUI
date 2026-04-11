/**
 * Agent Versioning
 * 
 * 记录 Agent 配置变更历史，支持回滚
 * 基于 Harness Engineering 可拆卸性理念
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export interface AgentVersion {
  version: number;
  timestamp: number;
  author: string;  // 'user' | 'system'
  changes: {
    field: string;
    oldValue: string;
    newValue: string;
  }[];
  diff: string;   // 完整 diff
  label?: string;  // 可选的版本标签
}

export interface VersionHistory {
  agentId: string;
  versions: AgentVersion[];
  currentVersion: number;
}

export interface RollbackResult {
  success: boolean;
  targetVersion: number;
  message: string;
}

const VERSIONS_DIR = '.clawui/versions';
const MAX_VERSIONS = 50;  // 最多保留版本数

/**
 * Agent Versioning 主类
 */
export class AgentVersioning {
  private versionsDir: string;
  private histories: Map<string, VersionHistory> = new Map();
  
  constructor() {
    this.versionsDir = path.join(os.homedir(), VERSIONS_DIR);
    fs.mkdirSync(this.versionsDir, { recursive: true });
    this.loadAllHistories();
  }
  
  /**
   * 加载所有历史记录
   */
  private loadAllHistories(): void {
    try {
      const files = fs.readdirSync(this.versionsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.versionsDir, file), 'utf-8');
          const history: VersionHistory = JSON.parse(content);
          const agentId = file.replace('.json', '');
          this.histories.set(agentId, history);
        } catch (e) {
          console.error(`[AgentVersioning] Failed to load ${file}:`, e);
        }
      }
    } catch (e) {
      console.log('[AgentVersioning] No existing version histories');
    }
  }
  
  /**
   * 获取或创建历史记录
   */
  getOrCreateHistory(agentId: string): VersionHistory {
    if (this.histories.has(agentId)) {
      return this.histories.get(agentId)!;
    }
    
    const history: VersionHistory = {
      agentId,
      versions: [],
      currentVersion: 0
    };
    
    this.histories.set(agentId, history);
    return history;
  }
  
  /**
   * 记录变更
   */
  recordChange(
    agentId: string,
    changes: {
      field: string;
      oldValue: string;
      newValue: string;
    }[],
    author: 'user' | 'system' = 'user',
    label?: string
  ): AgentVersion {
    const history = this.getOrCreateHistory(agentId);
    
    // 生成 diff
    const diff = this.generateDiff(changes);
    
    // 创建新版本
    const version: AgentVersion = {
      version: history.currentVersion + 1,
      timestamp: Date.now(),
      author,
      changes,
      diff,
      label
    };
    
    // 添加到历史
    history.versions.push(version);
    history.currentVersion = version.version;
    
    // 限制版本数量
    if (history.versions.length > MAX_VERSIONS) {
      history.versions = history.versions.slice(-MAX_VERSIONS);
    }
    
    this.saveHistory(history);
    return version;
  }
  
  /**
   * 生成 diff 文本
   */
  private generateDiff(changes: { field: string; oldValue: string; newValue: string }[]): string {
    const lines: string[] = [];
    
    for (const change of changes) {
      lines.push(`- ${change.field}: ${change.oldValue || '(empty)'}`);
      lines.push(`+ ${change.field}: ${change.newValue || '(empty)'}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * 获取版本历史
   */
  getHistory(agentId: string): AgentVersion[] {
    const history = this.histories.get(agentId);
    return history ? history.versions : [];
  }
  
  /**
   * 获取指定版本
   */
  getVersion(agentId: string, version: number): AgentVersion | undefined {
    const history = this.histories.get(agentId);
    return history?.versions.find(v => v.version === version);
  }
  
  /**
   * 回滚到指定版本
   */
  rollback(agentId: string, targetVersion: number): RollbackResult {
    const history = this.histories.get(agentId);
    
    if (!history) {
      return {
        success: false,
        targetVersion,
        message: 'Agent not found'
      };
    }
    
    const version = history.versions.find(v => v.version === targetVersion);
    
    if (!version) {
      return {
        success: false,
        targetVersion,
        message: 'Version not found'
      };
    }
    
    // 记录回滚操作
    const rollbackChanges = version.changes.map(c => ({
      field: c.field,
      oldValue: c.newValue,
      newValue: c.oldValue
    }));
    
    this.recordChange(agentId, rollbackChanges, 'system', `Rollback to v${targetVersion}`);
    
    return {
      success: true,
      targetVersion,
      message: `Rolled back to version ${targetVersion}`,
      ...version
    } as RollbackResult & AgentVersion;
  }
  
  /**
   * 比较两个版本
   */
  compareVersions(agentId: string, fromVersion: number, toVersion: number): {
    from: AgentVersion | undefined;
    to: AgentVersion | undefined;
    diff: string;
  } {
    const from = this.getVersion(agentId, fromVersion);
    const to = this.getVersion(agentId, toVersion);
    
    let diff = '';
    if (from && to) {
      diff = this.generateComparisonDiff(from, to);
    }
    
    return { from, to, diff };
  }
  
  /**
   * 生成版本比较 diff
   */
  private generateComparisonDiff(from: AgentVersion, to: AgentVersion): string {
    const lines: string[] = [];
    
    lines.push(`--- v${from.version} (${new Date(from.timestamp).toISOString()})`);
    lines.push(`+++ v${to.version} (${new Date(to.timestamp).toISOString()})`);
    lines.push('');
    
    // 收集所有改变的字段
    const allFields = new Set([
      ...from.changes.map(c => c.field),
      ...to.changes.map(c => c.field)
    ]);
    
    for (const field of allFields) {
      const fromChange = from.changes.find(c => c.field === field);
      const toChange = to.changes.find(c => c.field === field);
      
      if (fromChange && toChange) {
        if (fromChange.newValue !== toChange.newValue) {
          lines.push(`- ${field}: ${fromChange.newValue}`);
          lines.push(`+ ${field}: ${toChange.newValue}`);
        }
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * 获取版本统计
   */
  getStats(agentId: string): {
    totalVersions: number;
    lastModified: number | null;
    authorBreakdown: Record<string, number>;
  } | null {
    const history = this.histories.get(agentId);
    
    if (!history || history.versions.length === 0) {
      return null;
    }
    
    const authorBreakdown: Record<string, number> = {};
    for (const v of history.versions) {
      authorBreakdown[v.author] = (authorBreakdown[v.author] || 0) + 1;
    }
    
    return {
      totalVersions: history.versions.length,
      lastModified: history.versions[history.versions.length - 1].timestamp,
      authorBreakdown
    };
  }
  
  /**
   * 保存历史到文件
   */
  private saveHistory(history: VersionHistory): void {
    try {
      const filePath = path.join(this.versionsDir, `${history.agentId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
    } catch (e) {
      console.error(`[AgentVersioning] Failed to save history for ${history.agentId}:`, e);
    }
  }
  
  /**
   * 删除历史
   */
  deleteHistory(agentId: string): boolean {
    if (!this.histories.has(agentId)) {
      return false;
    }
    
    this.histories.delete(agentId);
    
    try {
      const filePath = path.join(this.versionsDir, `${agentId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error(`[AgentVersioning] Failed to delete history for ${agentId}:`, e);
    }
    
    return true;
  }
  
  /**
   * 导出历史
   */
  exportHistory(agentId: string): string | null {
    const history = this.histories.get(agentId);
    if (!history) return null;
    
    return JSON.stringify(history, null, 2);
  }
  
  /**
   * 导入历史
   */
  importHistory(agentId: string, json: string): boolean {
    try {
      const history: VersionHistory = JSON.parse(json);
      if (history.agentId !== agentId) {
        history.agentId = agentId;  // 强制使用指定的 agentId
      }
      
      this.histories.set(agentId, history);
      this.saveHistory(history);
      return true;
    } catch (e) {
      console.error(`[AgentVersioning] Failed to import history for ${agentId}:`, e);
      return false;
    }
  }
}

export default AgentVersioning;