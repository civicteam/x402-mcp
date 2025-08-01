import { Request } from 'express';

// Dummy auth - will be replaced with civic-auth using @civic/auth-mcp
export const extractFromAuthHeader = (req: Request): string => {
    return req.headers['x-user-id'] as string;
};
