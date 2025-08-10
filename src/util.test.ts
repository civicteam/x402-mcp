import { describe, expect, it } from 'vitest';
import { convertHeaders } from './util.js';

describe('convertHeaders', () => {
  it('should return empty object when headers are undefined', () => {
    const result = convertHeaders(undefined);
    expect(result).toEqual({});
  });

  it('should return empty object when headers are null', () => {
    const result = convertHeaders(null as any);
    expect(result).toEqual({});
  });

  it('should convert Headers instance to plain object', () => {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json, text/event-stream');

    const result = convertHeaders(headers);
    expect(result).toEqual({
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    });
  });

  it('should convert array of tuples to plain object', () => {
    const headers: [string, string][] = [
      ['Content-Type', 'application/json'],
      ['Accept', 'application/json, text/event-stream'],
      ['X-Custom-Header', 'value'],
    ];

    const result = convertHeaders(headers);
    expect(result).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-Custom-Header': 'value',
    });
  });

  it('should return plain object as-is', () => {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-Custom-Header': 'value',
    };

    const result = convertHeaders(headers);
    expect(result).toEqual(headers);
  });

  it('should handle empty Headers instance', () => {
    const headers = new Headers();
    const result = convertHeaders(headers);
    expect(result).toEqual({});
  });

  it('should handle empty array of tuples', () => {
    const headers: [string, string][] = [];
    const result = convertHeaders(headers);
    expect(result).toEqual({});
  });

  it('should handle empty plain object', () => {
    const headers = {};
    const result = convertHeaders(headers);
    expect(result).toEqual({});
  });

  it('should handle Headers with multiple values for same key', () => {
    const headers = new Headers();
    headers.append('Set-Cookie', 'session=abc');
    headers.append('Set-Cookie', 'user=123');

    const result = convertHeaders(headers);
    // Note: In Node.js environment, Headers may handle multiple values differently
    // The last value might override previous ones instead of concatenating
    expect(result['set-cookie']).toBeDefined();
    // Accept either the last value or concatenated values
    expect(['user=123', 'session=abc, user=123']).toContain(result['set-cookie']);
  });
});
