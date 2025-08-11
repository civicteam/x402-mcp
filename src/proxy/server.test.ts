import { describe, expect, it } from 'vitest';

// Test the ApiKeyHook separately since it's the part we can easily test
describe('ApiKeyHook integration', () => {
  it('should create ApiKeyHook with correct properties', async () => {
    const { ApiKeyHook } = await import('./hooks/apiKeyHook.js');

    const apiKey = 'sk-test-123456';
    const hook = new ApiKeyHook(apiKey);

    expect(hook).toBeDefined();
    expect(hook.name).toBe('api-key-injector');
  });

  it('should add Authorization header in processToolCallRequest', async () => {
    const { ApiKeyHook } = await import('./hooks/apiKeyHook.js');

    const apiKey = 'sk-test-789';
    const hook = new ApiKeyHook(apiKey);

    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {},
      id: 1,
    };

    const result = await hook.processToolCallRequest(request);

    expect(result.resultType).toBe('continue');
    expect(result.request.requestContext.headers.Authorization).toBe(`Bearer ${apiKey}`);
  });
});
