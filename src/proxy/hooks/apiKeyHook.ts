import { AbstractHook } from '@civic/passthrough-mcp-server';

/**
 * Hook that adds an API key to outgoing requests to authenticate with upstream MCP servers
 */
export class ApiKeyHook extends AbstractHook {
  constructor(private apiKey: string) {
    super();
  }

  get name(): string {
    return 'api-key-injector';
  }

  /**
   * Add API key to tool call requests
   */
  async processToolCallRequest(request: any): Promise<any> {
    const modifiedRequest = {
      ...request,
      requestContext: {
        ...request.requestContext,
        headers: {
          ...request.requestContext?.headers,
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    };

    return {
      resultType: 'continue',
      request: modifiedRequest,
    };
  }

  /**
   * Add API key to tools list requests
   */
  async processToolsListRequest(request: any): Promise<any> {
    const modifiedRequest = {
      ...request,
      requestContext: {
        ...request.requestContext,
        headers: {
          ...request.requestContext?.headers,
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    };

    return {
      resultType: 'continue',
      request: modifiedRequest,
    };
  }

  /**
   * Add API key to initialize requests
   */
  async processInitializeRequest(request: any): Promise<any> {
    const modifiedRequest = {
      ...request,
      requestContext: {
        ...request.requestContext,
        headers: {
          ...request.requestContext?.headers,
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    };

    return {
      resultType: 'continue',
      request: modifiedRequest,
    };
  }
}
