/**
 * GitHub node ID encoding/decoding utilities.
 *
 * GitHub's new global IDs use MessagePack-encoded arrays, base64url-encoded with a type prefix.
 * Format: PREFIX_ + base64url(msgpack([version, ...ids]))
 *
 * For users: U_ + base64url(msgpack([0, databaseId]))
 * For repos: R_ + base64url(msgpack([0, databaseId]))
 * For repo-scoped objects: PREFIX_ + base64url(msgpack([0, repoDatabaseId, objectDatabaseId]))
 */

const NODE_ID_PREFIXES = {
  User: 'U_',
  Repository: 'R_',
  Issue: 'I_',
  PullRequest: 'PR_',
  PullRequestReviewComment: 'PRRC_',
} as const;

type NodeIdType = keyof typeof NODE_ID_PREFIXES;

const encodeMsgpackUint = (n: number): Uint8Array => {
  if (n >= 0 && n <= 0x7f) {
    return new Uint8Array([n]);
  }
  if (n <= 0xff) {
    return new Uint8Array([0xcc, n]);
  }
  if (n <= 0xffff) {
    const buf = new Uint8Array(3);
    buf[0] = 0xcd;
    buf[1] = (n >> 8) & 0xff;
    buf[2] = n & 0xff;
    return buf;
  }
  const buf = new Uint8Array(5);
  buf[0] = 0xce;
  buf[1] = (n >>> 24) & 0xff;
  buf[2] = (n >>> 16) & 0xff;
  buf[3] = (n >>> 8) & 0xff;
  buf[4] = n & 0xff;
  return buf;
};

const encodeMsgpackArray = (items: ReadonlyArray<number>): Uint8Array => {
  if (items.length > 15) {
    throw new Error('Array too large for fixarray encoding');
  }
  const encoded = items.map(encodeMsgpackUint);
  const totalLen = encoded.reduce((sum, e) => sum + e.length, 0);
  const result = new Uint8Array(1 + totalLen);
  result[0] = 0x90 | items.length;
  let offset = 1;
  for (const e of encoded) {
    result.set(e, offset);
    offset += e.length;
  }
  return result;
};

// --- msgpack decoding (minimal) ---

type DecodeResult = { value: number; bytesRead: number };

const decodeMsgpackUint = (buf: Uint8Array, offset: number): DecodeResult => {
  const byte = buf[offset];
  if (byte === undefined) throw new Error('Unexpected end of msgpack data');
  if (byte <= 0x7f) return { value: byte, bytesRead: 1 };
  if (byte === 0xcc) return { value: buf[offset + 1]!, bytesRead: 2 };
  if (byte === 0xcd) return { value: (buf[offset + 1]! << 8) | buf[offset + 2]!, bytesRead: 3 };
  if (byte === 0xce) {
    return {
      value:
        ((buf[offset + 1]! << 24) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 8) | buf[offset + 4]!) >>> 0,
      bytesRead: 5,
    };
  }
  throw new Error(`Unsupported msgpack type: 0x${byte.toString(16)}`);
};

const decodeMsgpackArray = (buf: Uint8Array): ReadonlyArray<number> => {
  const header = buf[0];
  if (header === undefined || (header & 0xf0) !== 0x90) {
    throw new Error('Expected msgpack fixarray');
  }
  const length = header & 0x0f;
  const result: Array<number> = [];
  let offset = 1;
  for (let i = 0; i < length; i++) {
    const decoded = decodeMsgpackUint(buf, offset);
    result.push(decoded.value);
    offset += decoded.bytesRead;
  }
  return result;
};

// --- base64url helpers (works in Node, Bun, Deno, and browsers) ---

const toBase64Url = (bytes: Uint8Array): string => {
  let b64: string;
  if (typeof Buffer !== 'undefined') {
    b64 = Buffer.from(bytes).toString('base64');
  } else {
    b64 = btoa(String.fromCharCode(...bytes));
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (str: string): Uint8Array => {
  const standard = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

export const encodeNodeId = (type: NodeIdType, ...ids: ReadonlyArray<number>): string => {
  const prefix = NODE_ID_PREFIXES[type];
  const packed = encodeMsgpackArray([0, ...ids]);
  return prefix + toBase64Url(packed);
};

export const decodeNodeId = (nodeId: string): { prefix: string; ids: ReadonlyArray<number> } => {
  const underscoreIdx = nodeId.indexOf('_');
  if (underscoreIdx === -1) throw new Error('Invalid node ID: missing prefix');

  const prefix = nodeId.slice(0, underscoreIdx + 1);
  const encoded = nodeId.slice(underscoreIdx + 1);
  const packed = fromBase64Url(encoded);
  const array = decodeMsgpackArray(packed);

  return { prefix, ids: array.slice(1) };
};

export const encodeUserNodeId = (databaseId: number): string => encodeNodeId('User', databaseId);

export const encodeRepoNodeId = (databaseId: number): string => encodeNodeId('Repository', databaseId);

export const extractDatabaseId = (nodeId: string): number => {
  const { ids } = decodeNodeId(nodeId);
  const last = ids[ids.length - 1];
  if (last === undefined) throw new Error('No database ID found in node ID');
  return last;
};
