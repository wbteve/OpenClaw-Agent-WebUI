/**
 * Harness Context Engine
 * 
 * 为 Agent 生成结构化上下文，替代自由格式的 SOUL.md
 * 基于 Harness Engineering 理念
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec as execSync } from 'child_process';

const exec = promisify(execSync);

/**
 * 模板接口
 */
export interface HarnessTemplate {
  id: string;
  name: string;
  description: string;
  category: 'webapp' | 'api' | 'cli' | 'agent' | 'other';
  
  project: {
    techStack: string[];
    description: string;
  };
  
  role: {
    persona: string;
    responsibilities: string[];
    constraints: string[];
  };
  
  tools: {
    allowed: string[];
    requireApproval: string[];
    blocked: string[];
  };
  
  validation: {
    successCriteria: string[];
    testPrompts: string[];
  };
  
  errorHandling: {
    retryPolicy: 'none' | 'once' | 'thrice';
    fallbackAction: string;
    escalationThreshold: number;
  };
}

/**
 * Agent 配置输入
 */
export interface AgentConfig {
  agentId: string;
  name: string;
  model: string;
  templateId?: string;
  customContext?: Partial<{
    project: Partial<HarnessTemplate['project']>;
    role: Partial<HarnessTemplate['role']>;
    tools: Partial<HarnessTemplate['tools']>;
    validation: Partial<HarnessTemplate['validation']>;
    errorHandling: Partial<HarnessTemplate['errorHandling']>;
  }>;
}

/**
 * 生成的上下文
 */
export interface GeneratedContext {
  soulContent: string;
  agentsContent: string;
  toolsContent: string;
  config: Record<string, unknown>;
}

const TEMPLATES_DIR = 'harness-templates';

/**
 * Harness Context Engine 主类
 */
export class HarnessContextEngine {
  private templatesDir: string;
  private templates: Map<string, HarnessTemplate> = new Map();
  
  constructor(baseDir: string = TEMPLATES_DIR) {
    this.templatesDir = path.join(baseDir);
    this.loadTemplates();
  }
  
  /**
   * 加载所有模板
   */
  private loadTemplates(): void {
    try {
      const files = fs.readdirSync(this.templatesDir).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.templatesDir, file), 'utf-8');
          const template: HarnessTemplate = JSON.parse(content);
          this.templates.set(template.id, template);
          console.log(`[HarnessContext] Loaded template: ${template.name} (${template.id})`);
        } catch (e) {
          console.error(`[HarnessContext] Failed to load template ${file}:`, e);
        }
      }
    } catch (e) {
      console.log(`[HarnessContext] Templates directory not found, using defaults`);
      this.loadDefaultTemplates();
    }
  }
  
  /**
   * 加载默认模板
   */
  private loadDefaultTemplates(): void {
    const defaults: HarnessTemplate[] = [
      this.getWebAppTemplate(),
      this.getApiTemplate(),
      this.getCliTemplate(),
      this.getAgentTemplate()
    ];
    
    for (const t of defaults) {
      this.templates.set(t.id, t);
    }
  }
  
  /**
   * 获取所有可用模板
   */
  getTemplates(): HarnessTemplate[] {
    return Array.from(this.templates.values());
  }
  
  /**
   * 获取模板 by ID
   */
  getTemplate(id: string): HarnessTemplate | undefined {
    return this.templates.get(id);
  }
  
  /**
   * 根据类别获取模板
   */
  getTemplatesByCategory(category: HarnessTemplate['category']): HarnessTemplate[] {
    return Array.from(this.templates.values()).filter(t => t.category === category);
  }
  
  /**
   * 生成上下文
   */
  generateContext(config: AgentConfig): GeneratedContext {
    // 获取模板
    let template: HarnessTemplate | undefined;
    if (config.templateId) {
      template = this.templates.get(config.templateId);
    }
    
    // 如果没有指定模板，根据 agentId 猜测
    if (!template) {
      template = this.guessTemplate(config.agentId);
    }
    
    // 合并自定义配置
    const context = this.mergeConfig(template, config.customContext);
    
    // 生成 SOUL.md 内容
    const soulContent = this.generateSoulContent(config, context);
    
    // 生成 AGENTS.md 内容
    const agentsContent = this.generateAgentsContent(context);
    
    // 生成 TOOLS.md 内容
    const toolsContent = this.generateToolsContent(context);
    
    return {
      soulContent,
      agentsContent,
      toolsContent,
      config: context as unknown as Record<string, unknown>
    };
  }
  
  /**
   * 根据 agentId 猜测合适的模板
   */
  private guessTemplate(agentId: string): HarnessTemplate | undefined {
    const id = agentId.toLowerCase();
    
    if (id.includes('web') || id.includes('front') || id.includes('react')) {
      return this.templates.get('webapp');
    }
    if (id.includes('api') || id.includes('backend')) {
      return this.templates.get('api');
    }
    if (id.includes('cli') || id.includes('tool')) {
      return this.templates.get('cli');
    }
    if (id.includes('agent') || id.includes('bot')) {
      return this.templates.get('agent');
    }
    
    // 默认返回 webapp
    return this.templates.get('webapp');
  }
  
  /**
   * 合并模板和自定义配置
   */
  private mergeConfig(template: HarnessTemplate | undefined, custom?: AgentConfig['customContext']): HarnessTemplate {
    const base: HarnessTemplate = template || {
      id: 'custom',
      name: 'Custom Agent',
      description: 'Custom agent configuration',
      category: 'other',
      project: { techStack: [], description: '' },
      role: { persona: 'AI Assistant', responsibilities: [], constraints: [] },
      tools: { allowed: [], requireApproval: [], blocked: [] },
      validation: { successCriteria: [], testPrompts: [] },
      errorHandling: { retryPolicy: 'once', fallbackAction: 'apologize', escalationThreshold: 3 }
    };
    
    if (!custom) return base;
    
    return {
      ...base,
      project: { ...base.project, ...custom.project },
      role: { ...base.role, ...custom.role },
      tools: { ...base.tools, ...custom.tools },
      validation: { ...base.validation, ...custom.validation },
      errorHandling: { ...base.errorHandling, ...custom.errorHandling }
    };
  }
  
  /**
   * 生成 SOUL.md 内容
   */
  private generateSoulContent(config: AgentConfig, ctx: HarnessTemplate): string {
    const lines: string[] = [];
    
    lines.push('# SOUL.md - Who You Are');
    lines.push('');
    lines.push('_You are an AI agent defined by the Harness Engineering framework._');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Core Identity');
    lines.push('');
    lines.push(`**Name:** ${config.name}`);
    lines.push(`**Role:** ${ctx.role.persona}`);
    lines.push(`**Agent ID:** ${config.agentId}`);
    lines.push('');
    lines.push('## Project Context');
    lines.push('');
    lines.push(ctx.project.description || '_No project description provided._');
    lines.push('');
    lines.push(`**Tech Stack:** ${ctx.project.techStack.join(', ') || 'None specified'}`);
    lines.push('');
    lines.push('## Responsibilities');
    lines.push('');
    for (const r of ctx.role.responsibilities) {
      lines.push(`- ${r}`);
    }
    lines.push('');
    lines.push('## Constraints');
    lines.push('');
    lines.push('**Hard constraints (never bypass):**');
    for (const c of ctx.role.constraints) {
      lines.push(`- ${c}`);
    }
    lines.push('');
    lines.push('## Tools');
    lines.push('');
    lines.push('**Allowed:** ' + ctx.tools.allowed.join(', ') || '_None specified_');
    lines.push('');
    lines.push('**Require approval:** ' + ctx.tools.requireApproval.join(', ') || '_None_');
    lines.push('');
    lines.push('**Blocked:** ' + ctx.tools.blocked.join(', ') || '_None_');
    lines.push('');
    lines.push('## Validation Criteria');
    lines.push('');
    for (const v of ctx.validation.successCriteria) {
      lines.push(`- ${v}`);
    }
    lines.push('');
    lines.push('## Error Handling');
    lines.push('');
    lines.push(`**Retry Policy:** ${ctx.errorHandling.retryPolicy}`);
    lines.push(`**Fallback:** ${ctx.errorHandling.fallbackAction}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('_This agent was generated using Harness Engineering context template._');
    
    return lines.join('\n');
  }
  
  /**
   * 生成 AGENTS.md 内容
   */
  private generateAgentsContent(ctx: HarnessTemplate): string {
    const lines: string[] = [];
    
    lines.push('# AGENTS.md - Agent Team');
    lines.push('');
    lines.push('This file defines the multi-agent collaboration structure.');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Team Structure');
    lines.push('');
    lines.push('Currently, this is a single-agent setup.');
    lines.push('');
    lines.push('### Communication');
    lines.push('');
    lines.push('- Direct communication between user and agent');
    lines.push('- No agent-to-agent delegation');
    lines.push('');
    lines.push('## Context Isolation');
    lines.push('');
    lines.push('- Each agent operates in its own workspace');
    lines.push('- Memory files are isolated per agent');
    lines.push('');
    
    return lines.join('\n');
  }
  
  /**
   * 生成 TOOLS.md 内容
   */
  private generateToolsContent(ctx: HarnessTemplate): string {
    const lines: string[] = [];
    
    lines.push('# TOOLS.md - Tool Configuration');
    lines.push('');
    lines.push('Tool permissions and configurations for this agent.');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Available Tools');
    lines.push('');
    
    const toolDescriptions: Record<string, string> = {
      'read': 'Read files from the filesystem',
      'write': 'Create or modify files',
      'exec': 'Execute shell commands',
      'web_fetch': 'Fetch web content',
      'web_search': 'Search the web',
      'message': 'Send messages via channels',
      'tts': 'Text to speech',
      'image_generate': 'Generate images',
      'pdf': 'Analyze PDF documents',
      'image': 'Analyze images'
    };
    
    for (const tool of ctx.tools.allowed) {
      const desc = toolDescriptions[tool] || 'Custom tool';
      lines.push(`- **${tool}**: ${desc}`);
    }
    lines.push('');
    lines.push('## Approval Requirements');
    lines.push('');
    for (const tool of ctx.tools.requireApproval) {
      lines.push(`- **${tool}**: Requires user approval before execution`);
    }
    lines.push('');
    lines.push('## Blocked Commands');
    lines.push('');
    for (const pattern of ctx.tools.blocked) {
      lines.push(`- ${pattern}`);
    }
    lines.push('');
    
    return lines.join('\n');
  }
  
  // ========== 默认模板定义 ==========
  
  private getWebAppTemplate(): HarnessTemplate {
    return {
      id: 'webapp',
      name: 'Web 应用开发 Agent',
      description: 'Full-stack web application development agent',
      category: 'webapp',
      project: {
        techStack: ['React', 'Node.js', 'PostgreSQL', 'TypeScript'],
        description: 'Full-stack web application development with modern JavaScript frameworks.'
      },
      role: {
        persona: '全栈开发工程师',
        responsibilities: [
          'Implement business requirements',
          'Write unit and integration tests',
          'Perform code review',
          'Follow best practices'
        ],
        constraints: [
          'Never modify production config directly',
          'Always write tests for new features',
          'Use TypeScript strict mode'
        ]
      },
      tools: {
        allowed: ['read', 'write', 'exec', 'web_fetch'],
        requireApproval: ['exec'],
        blocked: ['rm -rf /', 'drop table', 'curl | sh']
      },
      validation: {
        successCriteria: [
          'Can implement a REST API endpoint',
          'Can create a React component',
          'Can write SQL queries'
        ],
        testPrompts: [
          'Create a user registration API',
          'Build a login form component',
          'Write a SQL query for user list'
        ]
      },
      errorHandling: {
        retryPolicy: 'once',
        fallbackAction: 'apologize and suggest alternatives',
        escalationThreshold: 3
      }
    };
  }
  
  private getApiTemplate(): HarnessTemplate {
    return {
      id: 'api',
      name: 'API 开发 Agent',
      description: 'Backend API development agent',
      category: 'api',
      project: {
        techStack: ['Node.js', 'Express/Fastify', 'PostgreSQL', 'Redis'],
        description: 'RESTful API development for mobile and web clients.'
      },
      role: {
        persona: '后端开发工程师',
        responsibilities: [
          'Design and implement REST APIs',
          'Write database queries',
          'Implement authentication',
          'Optimize performance'
        ],
        constraints: [
          'Follow RESTful conventions',
          'Never expose sensitive data',
          'Add rate limiting'
        ]
      },
      tools: {
        allowed: ['read', 'write', 'exec', 'web_fetch'],
        requireApproval: ['exec'],
        blocked: ['rm -rf /', 'drop database', 'curl | sh']
      },
      validation: {
        successCriteria: [
          'Can create a resource API',
          'Can implement auth middleware',
          'Can write complex SQL'
        ],
        testPrompts: [
          'Create user CRUD API',
          'Add JWT authentication',
          'Write a join query'
        ]
      },
      errorHandling: {
        retryPolicy: 'once',
        fallbackAction: 'return error response',
        escalationThreshold: 3
      }
    };
  }
  
  private getCliTemplate(): HarnessTemplate {
    return {
      id: 'cli',
      name: 'CLI 工具 Agent',
      description: 'Command-line tool development agent',
      category: 'cli',
      project: {
        techStack: ['Node.js', 'TypeScript', 'Commander.js'],
        description: 'Command-line interface tools and scripts.'
      },
      role: {
        persona: 'CLI 工具开发者',
        responsibilities: [
          'Build CLI commands',
          'Handle arguments and flags',
          'Format output nicely'
        ],
        constraints: [
          'Provide helpful usage docs',
          'Handle errors gracefully',
          'Support common flags (-h, -v)'
        ]
      },
      tools: {
        allowed: ['read', 'write', 'exec'],
        requireApproval: ['exec'],
        blocked: ['rm -rf /', 'format c:', 'dd if=']
      },
      validation: {
        successCriteria: [
          'Can create a command',
          'Can handle arguments',
          'Can format output'
        ],
        testPrompts: [
          'Create a greet command',
          'Add --verbose flag',
          'Format as table'
        ]
      },
      errorHandling: {
        retryPolicy: 'thrice',
        fallbackAction: 'show help',
        escalationThreshold: 5
      }
    };
  }
  
  private getAgentTemplate(): HarnessTemplate {
    return {
      id: 'agent',
      name: '通用智能体 Agent',
      description: 'General-purpose AI agent',
      category: 'agent',
      project: {
        techStack: [],
        description: 'General-purpose assistant for various tasks.'
      },
      role: {
        persona: 'AI 助手',
        responsibilities: [
          'Understand user intent',
          'Provide helpful responses',
          'Ask clarifying questions when needed'
        ],
        constraints: [
          'Be honest about limitations',
          'Respect user privacy',
          'Decline harmful requests'
        ]
      },
      tools: {
        allowed: ['read', 'write', 'web_fetch', 'web_search'],
        requireApproval: [],
        blocked: ['rm -rf /', 'curl | sh']
      },
      validation: {
        successCriteria: [
          'Can understand and respond',
          'Can follow instructions',
          'Can complete multi-step tasks'
        ],
        testPrompts: [
          'What is the weather?',
          'Help me write a summary',
          'Research topic X'
        ]
      },
      errorHandling: {
        retryPolicy: 'once',
        fallbackAction: 'apologize',
        escalationThreshold: 3
      }
    };
  }
}

export default HarnessContextEngine;