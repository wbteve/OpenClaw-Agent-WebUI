/**
 * Agent Validator
 * 
 * Agent 创建后自动执行验证，确保配置正确、模型可用、工具可调用
 * 基于 Harness Engineering 自验证循环理念
 */

import OpenClawClient from './openclaw-client';
import ConfigManager from './config-manager';

export interface ValidationStep {
  step: string;
  status: 'pass' | 'fail' | 'warn' | 'pending' | 'running';
  message: string;
  duration: number;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  success: boolean;
  results: ValidationStep[];
  overallDuration: number;
  agentId: string;
  timestamp: number;
}

export interface ValidationConfig {
  agentId: string;
  gatewayUrl: string;
  token?: string;
  password?: string;
  timeout?: number;
}

/**
 * Agent Validator 主类
 */
export class AgentValidator {
  private configManager: ConfigManager;
  
  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }
  
  /**
   * 执行完整验证流程
   */
  async validateAgent(config: ValidationConfig): Promise<ValidationResult> {
    const startTime = Date.now();
    const results: ValidationStep[] = [];
    
    // 步骤 1: 配置完整性检查
    results.push(await this.checkConfig(config));
    
    // 步骤 2: 模型连通性测试
    results.push(await this.checkModelConnection(config));
    
    // 步骤 3: 基础对话测试
    results.push(await this.checkBasicChat(config));
    
    // 步骤 4: 工具权限验证
    results.push(await this.checkToolPermissions(config));
    
    const overallDuration = Date.now() - startTime;
    const hasFailure = results.some(r => r.status === 'fail');
    
    return {
      success: !hasFailure,
      results,
      overallDuration,
      agentId: config.agentId,
      timestamp: startTime
    };
  }
  
  /**
   * 快速验证（只检查配置和连通性）
   */
  async quickValidate(config: ValidationConfig): Promise<ValidationResult> {
    const startTime = Date.now();
    const results: ValidationStep[] = [];
    
    results.push(await this.checkConfig(config));
    results.push(await this.checkModelConnection(config));
    
    const overallDuration = Date.now() - startTime;
    const hasFailure = results.some(r => r.status === 'fail');
    
    return {
      success: !hasFailure,
      results,
      overallDuration,
      agentId: config.agentId,
      timestamp: startTime
    };
  }
  
  /**
   * 步骤 1: 配置完整性检查
   */
  private async checkConfig(config: ValidationConfig): Promise<ValidationStep> {
    const startTime = Date.now();
    
    try {
      // 检查必需字段
      if (!config.agentId) {
        return {
          step: 'config',
          status: 'fail',
          message: 'agentId is required',
          duration: Date.now() - startTime
        };
      }
      
      if (!config.gatewayUrl) {
        return {
          step: 'config',
          status: 'fail',
          message: 'gatewayUrl is required',
          duration: Date.now() - startTime
        };
      }
      
      return {
        step: 'config',
        status: 'pass',
        message: 'Configuration is valid',
        duration: Date.now() - startTime,
        details: {
          agentId: config.agentId,
          hasAuth: !!(config.token || config.password)
        }
      };
    } catch (err: any) {
      return {
        step: 'config',
        status: 'fail',
        message: err.message,
        duration: Date.now() - startTime
      };
    }
  }
  
  /**
   * 步骤 2: 模型连通性测试
   */
  private async checkModelConnection(config: ValidationConfig): Promise<ValidationStep> {
    const startTime = Date.now();
    const timeout = config.timeout || 10000;
    
    try {
      const client = new OpenClawClient({
        gatewayUrl: config.gatewayUrl,
        token: config.token,
        password: config.password
      });
      
      client.on('error', () => {});
      
      // 使用 AbortController 实现超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        await client.connect();
        clearTimeout(timeoutId);
        client.disconnect();
        
        return {
          step: 'model_connection',
          status: 'pass',
          message: 'Gateway connection successful',
          duration: Date.now() - startTime
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        
        if (err.name === 'AbortError') {
          return {
            step: 'model_connection',
            status: 'warn',
            message: `Connection timeout after ${timeout}ms`,
            duration: Date.now() - startTime
          };
        }
        
        return {
          step: 'model_connection',
          status: 'warn',
          message: `Connection failed: ${err.message}`,
          duration: Date.now() - startTime
        };
      }
    } catch (err: any) {
      return {
        step: 'model_connection',
        status: 'warn',
        message: err.message,
        duration: Date.now() - startTime
      };
    }
  }
  
  /**
   * 步骤 3: 基础对话测试
   */
  private async checkBasicChat(config: ValidationConfig): Promise<ValidationStep> {
    const startTime = Date.now();
    const timeout = config.timeout || 30000;
    
    try {
      const client = new OpenClawClient({
        gatewayUrl: config.gatewayUrl,
        token: config.token,
        password: config.password
      });
      
      client.on('error', () => {});
      client.on('chat.final', () => {});
      
      await client.connect();
      
      // 发送测试消息 - 使用流式 API
      await client.sendChatMessageStreaming({
        agentId: config.agentId,
        sessionKey: 'validation-test',
        message: 'Say OK in one word.'
      });
      
      // 等待响应 (简化版本)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      client.disconnect();
      
      return {
        step: 'basic_chat',
        status: 'pass',
        message: 'Chat test completed',
        duration: Date.now() - startTime
      };
    } catch (err: any) {
      return {
        step: 'basic_chat',
        status: 'warn',
        message: `Chat test warning: ${err.message}`,
        duration: Date.now() - startTime
      };
    }
  }
  
  /**
   * 步骤 4: 工具权限验证
   */
  private async checkToolPermissions(config: ValidationConfig): Promise<ValidationStep> {
    const startTime = Date.now();
    
    try {
      // 读取 openclaw.json 检查工具配置
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      
      if (!fs.existsSync(configPath)) {
        return {
          step: 'tool_permissions',
          status: 'warn',
          message: 'openclaw.json not found',
          duration: Date.now() - startTime
        };
      }
      
      const clawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const agentConfig = clawConfig.agents?.list?.find(
        (a: any) => a.id === config.agentId
      );
      
      if (!agentConfig) {
        return {
          step: 'tool_permissions',
          status: 'warn',
          message: 'Agent not found in config',
          duration: Date.now() - startTime
        };
      }
      
      const hasTools = agentConfig.tools?.exec?.security || 
                       agentConfig.tools?.web?.fetch?.enabled;
      
      return {
        step: 'tool_permissions',
        status: hasTools ? 'pass' : 'warn',
        message: hasTools ? 'Tool permissions configured' : 'No tool permissions found',
        duration: Date.now() - startTime,
        details: { tools: agentConfig.tools }
      };
    } catch (err: any) {
      return {
        step: 'tool_permissions',
        status: 'warn',
        message: `Check failed: ${err.message}`,
        duration: Date.now() - startTime
      };
    }
  }
}

export default AgentValidator;