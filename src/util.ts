/// <reference lib="dom" />

/**
 * Converts various header formats to a plain object.
 *
 * This is a workaround for a bug in x402-fetch where Headers objects are not
 * properly preserved during 402 payment retries. The library uses the spread
 * operator on headers (...init.headers), which doesn't work correctly with
 * Headers objects - it spreads the object's methods instead of the actual
 * header key-value pairs.
 *
 * Without this conversion, critical headers like 'Accept: application/json, text/event-stream'
 * (required by MCP) are lost during the payment retry, causing 406 Not Acceptable errors.
 *
 * Fix submitted: https://github.com/coinbase/x402/pull/314
 *
 * This function handles three possible input formats:
 * - Headers instance (from the Fetch API)
 * - Array of tuples ([key, value][])
 * - Plain object (Record<string, string>)
 *
 * @param headers - The headers in any of the supported formats
 * @returns A plain object with header key-value pairs that can be safely spread
 */
export function convertHeaders(headers?: HeadersInit): Record<string, string> {
  const headersObject: Record<string, string> = {};

  if (!headers) {
    return headersObject;
  }

  if (headers instanceof Headers) {
    // Headers object from Fetch API
    headers.forEach((value, key) => {
      headersObject[key] = value;
    });
  } else if (Array.isArray(headers)) {
    // Array of tuples format: [["Content-Type", "application/json"], ...]
    headers.forEach(([key, value]) => {
      headersObject[key] = value;
    });
  } else {
    // Plain object format: { "Content-Type": "application/json", ... }
    Object.assign(headersObject, headers);
  }

  return headersObject;
}
