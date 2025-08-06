# Civic MCP Development Guidelines

## Overview
- The project requires heavy understanding of the Model Context Protocol (MCP), which is defined here: https://modelcontextprotocol.io/specification/2025-06-18 , and x402, which is defined here: https://x402.gitbook.io/x402

## Style Guidelines
- All code should be typescript.
- Use pnpm as the package manager.
- Do not use dynamic imports unless there's a very good reason to do so.
- Except in tests, no stub or placeholder code unless explicitly requested or stated in the spec.
- Keep functions small where appropriate.

### Testing Strategy

- **Unit Tests**: Test individual functions and services in isolation
- **Integration Tests**: Test the interaction between multiple services
- Place tests alongside source files when testing specific functions
- Use mocks/stubs for external services
- Use vitest for unit testing.
- Use playwright for browser-based e2e testing where appropriate
- Avoid use of 'any'
- Use stubGlobal and stubEnv if needed, do not change the global or env vars directly
- Use vi.mocked(...) to provide typesafety when creating expectations
- Use the Martin Fowler definitions of stubs, mocks, fakes, dummies etc rather than always calling things mocks.
- Target 90% unit test coverage

# Overall guidelines
- Whenever making any large changes, first propose a plan, and wait for confirmation before implementing it.
- No "in a real implementation", you are building the real implementation.
- No need to maintain legacy solutions, unless explicitly stated, clean up old solutions as you go, to keep the code clean and well-structured.
- So unless told otherwise, no "backwards-compatibility"
