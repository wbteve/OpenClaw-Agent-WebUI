/**
 * Schema Validator
 * 
 * 用 JSON Schema 验证 Agent 配置，确保可验证、可测试
 * 基于 Harness Engineering 架构约束理念
 */

import Ajv, { ValidateFunction, JSONSchemaType } from 'ajv';

/**
 * Agent 配置 Schema
 */
export const agentConfigSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    agentId: {
      type: 'string',
      pattern: '^[a-zA-Z0-9_-]+$',
      minLength: 1,
      maxLength: 50
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 100
    },
    model: {
      type: 'string',
      minLength: 1
    },
    templateId: {
      type: 'string',
      enum: ['webapp', 'api', 'cli', 'agent', 'custom']
    },
    tools: {
      type: 'object',
      properties: {
        allowed: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 20
        },
        requireApproval: {
          type: 'array',
          items: { type: 'string' }
        },
        blocked: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    },
    limits: {
      type: 'object',
      properties: {
        maxTokensPerRequest: {
          type: 'integer',
          minimum: 1000,
          maximum: 100000
        },
        maxSessions: {
          type: 'integer',
          minimum: 1,
          maximum: 100
        },
        maxFileSize: {
          type: 'integer',
          minimum: 1024,
          maximum: 1073741824
        }
      }
    },
    customContext: {
      type: 'object'
    }
  },
  required: ['agentId', 'name', 'model']
} as const;

/**
 * Model Config Schema
 */
export const modelConfigSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      minLength: 1
    },
    provider: {
      type: 'string',
      enum: ['openai', 'anthropic', 'google', 'ollama', 'volcengine', 'minimax', 'deepseek', 'custom']
    },
    model: {
      type: 'string',
      minLength: 1
    },
    apiKey: {
      type: 'string',
      minLength: 0
    },
    baseUrl: {
      type: 'string',
      format: 'uri'
    }
  },
  required: ['id', 'provider', 'model']
} as const;

/**
 * Endpoint Config Schema
 */
export const endpointConfigSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      pattern: '^[a-zA-Z0-9_-]+$'
    },
    baseUrl: {
      type: 'string',
      format: 'uri'
    },
    api: {
      type: 'string',
      enum: ['openai', 'anthropic', 'google', 'ollama', 'volcengine', 'minimax', 'deepseek', 'custom']
    },
    apiKey: {
      type: 'string',
      minLength: 0
    }
  },
  required: ['id', 'baseUrl', 'api']
} as const;

/**
 * Validation Result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  keyword?: string;
  params?: Record<string, unknown>;
}

/**
 * Schema Validator 主类
 */
export class SchemaValidator {
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction> = new Map();
  
  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false
    });
    
    // 添加自定义关键字 (使用简单方式)
    // pattern 关键字使用 Ajv 内置的
    this.registerDefaults();
  }
  
  /**
   * 注册默认 Schema
   */
  private registerDefaults(): void {
    this.register('agentConfig', agentConfigSchema);
    this.register('modelConfig', modelConfigSchema);
    this.register('endpointConfig', endpointConfigSchema);
  }
  
  /**
   * 注册 Schema
   */
  register(name: string, schema: object): ValidateFunction {
    const validator = this.ajv.compile(schema);
    this.validators.set(name, validator);
    return validator;
  }
  
  /**
   * 验证数据
   */
  validate(name: string, data: unknown): ValidationResult {
    const validator = this.validators.get(name);
    
    if (!validator) {
      return {
        valid: false,
        errors: [{
          path: '',
          message: `Schema '${name}' not found`
        }]
      };
    }
    
    const valid = validator(data);
    
    if (valid) {
      return { valid: true, errors: [] };
    }
    
    const errors: ValidationError[] = (validator.errors || []).map(err => ({
      path: err.instancePath || '/',
      message: err.message || 'Validation error',
      keyword: err.keyword,
      params: err.params as Record<string, unknown>
    }));
    
    return { valid: false, errors };
  }
  
  /**
   * 验证 Agent 配置
   */
  validateAgentConfig(data: unknown): ValidationResult {
    return this.validate('agentConfig', data);
  }
  
  /**
   * 验证 Model 配置
   */
  validateModelConfig(data: unknown): ValidationResult {
    return this.validate('modelConfig', data);
  }
  
  /**
   * 验证 Endpoint 配置
   */
  validateEndpointConfig(data: unknown): ValidationResult {
    return this.validate('endpointConfig', data);
  }
  
  /**
   * 获取已注册的 Schema 列表
   */
  listSchemas(): string[] {
    return Array.from(this.validators.keys());
  }
  
  /**
   * 获取 Schema 定义
   */
  getSchemaDefinition(name: string): object | undefined {
    // 返回浅拷贝以防止意外修改
    const schema = this.validators.get(name)?.schema;
    if (schema && typeof schema === 'object') {
      return { ...schema };
    }
    return undefined;
  }
}

/**
 * 工具权限验证
 */
export const toolPermissionSchema = {
  type: 'object',
  properties: {
    allowed: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'read', 'write', 'exec', 'web_fetch', 'web_search',
          'message', 'tts', 'image_generate', 'video_generate',
          'music_generate', 'pdf', 'image', 'memory_search',
          'sessions_spawn', 'subagents', 'cron', 'gateway'
        ]
      }
    },
    requireApproval: {
      type: 'array',
      items: { type: 'string' }
    },
    blocked: {
      type: 'array',
      items: { type: 'string' }
    }
  }
} as const;

export default SchemaValidator;