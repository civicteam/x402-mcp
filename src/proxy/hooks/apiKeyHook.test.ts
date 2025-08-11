import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyHook } from './apiKeyHook.js';

describe('ApiKeyHook', () => {
  let hook: ApiKeyHook;
  const testApiKey = 'sk-test-123456789';

  beforeEach(() => {
    hook = new ApiKeyHook(testApiKey);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor and name', () => {
    it('should initialize with provided API key', () => {
      expect(hook).toBeDefined();
      expect(hook).toBeInstanceOf(ApiKeyHook);
    });

    it('should have correct name', () => {
      expect(hook.name).toBe('api-key-injector');
    });
  });

  describe('processToolCallRequest', () => {
    it('should add Authorization header to request', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'test-tool' },
        id: 1,
      };

      const result = await hook.processToolCallRequest(request);

      expect(result).toEqual({
        resultType: 'continue',
        request: {
          ...request,
          requestContext: {
            headers: {
              Authorization: `Bearer ${testApiKey}`,
            },
          },
        },
      });
    });

    it('should preserve existing requestContext', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'test-tool' },
        id: 1,
        requestContext: {
          existingField: 'value',
          headers: {
            'X-Custom-Header': 'custom-value',
          },
        },
      };

      const result = await hook.processToolCallRequest(request);

      expect(result).toEqual({
        resultType: 'continue',
        request: {
          ...request,
          requestContext: {
            existingField: 'value',
            headers: {
              'X-Custom-Header': 'custom-value',
              Authorization: `Bearer ${testApiKey}`,
            },
          },
        },
      });
    });

    it('should override existing Authorization header', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {},
        id: 3,
        requestContext: {
          headers: {
            Authorization: 'Bearer old-key',
          },
        },
      };

      const result = await hook.processToolCallRequest(request);

      expect(result.request.requestContext.headers.Authorization).toBe(`Bearer ${testApiKey}`);
    });

    it('should handle request without requestContext', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {},
        id: 4,
      };

      const result = await hook.processToolCallRequest(request);

      expect(result).toEqual({
        resultType: 'continue',
        request: {
          ...request,
          requestContext: {
            headers: {
              Authorization: `Bearer ${testApiKey}`,
            },
          },
        },
      });
    });
  });

  describe('processToolsListRequest', () => {
    it('should add Authorization header to tools list request', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 1,
      };

      const result = await hook.processToolsListRequest(request);

      expect(result).toEqual({
        resultType: 'continue',
        request: {
          ...request,
          requestContext: {
            headers: {
              Authorization: `Bearer ${testApiKey}`,
            },
          },
        },
      });
    });

    it('should preserve existing headers in tools list', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 2,
        requestContext: {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      };

      const result = await hook.processToolsListRequest(request);

      expect(result.request.requestContext.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testApiKey}`,
      });
    });
  });

  describe('processInitializeRequest', () => {
    it('should add Authorization header to initialize request', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
        id: 1,
      };

      const result = await hook.processInitializeRequest(request);

      expect(result).toEqual({
        resultType: 'continue',
        request: {
          ...request,
          requestContext: {
            headers: {
              Authorization: `Bearer ${testApiKey}`,
            },
          },
        },
      });
    });

    it('should preserve existing requestContext in initialize', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {},
        id: 2,
        requestContext: {
          sessionId: 'session-123',
          headers: {
            'User-Agent': 'TestClient/1.0',
          },
        },
      };

      const result = await hook.processInitializeRequest(request);

      expect(result).toEqual({
        resultType: 'continue',
        request: {
          ...request,
          requestContext: {
            sessionId: 'session-123',
            headers: {
              'User-Agent': 'TestClient/1.0',
              Authorization: `Bearer ${testApiKey}`,
            },
          },
        },
      });
    });
  });

  describe('different API key formats', () => {
    it('should work with various API key formats', async () => {
      const apiKeys = [
        'simple-key',
        'sk-proj-very-long-api-key-with-many-characters',
        'Bearer existing-token',
        'ApiKey 12345',
      ];

      for (const apiKey of apiKeys) {
        const customHook = new ApiKeyHook(apiKey);
        const request = {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {},
          id: 1,
        };

        const result = await customHook.processToolCallRequest(request);

        expect(result.request.requestContext.headers.Authorization).toBe(`Bearer ${apiKey}`);
      }
    });
  });

  describe('all methods add the same header', () => {
    it('should add consistent headers across all methods', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
        id: 1,
      };

      const toolCallResult = await hook.processToolCallRequest(request);
      const toolsListResult = await hook.processToolsListRequest(request);
      const initializeResult = await hook.processInitializeRequest(request);

      const expectedHeader = `Bearer ${testApiKey}`;

      expect(toolCallResult.request.requestContext.headers.Authorization).toBe(expectedHeader);
      expect(toolsListResult.request.requestContext.headers.Authorization).toBe(expectedHeader);
      expect(initializeResult.request.requestContext.headers.Authorization).toBe(expectedHeader);
    });
  });
});
