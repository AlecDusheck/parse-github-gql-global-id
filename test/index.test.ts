import { describe, it, expect } from 'vitest';
import { encodeNodeId, decodeNodeId, encodeUserNodeId, encodeRepoNodeId, extractDatabaseId } from '../src/index';

// All fixtures verified against live GitHub API responses with X-Github-Next-Global-ID: 1

describe('encodeUserNodeId', () => {
  const fixtures: ReadonlyArray<[number, string]> = [
    [1, 'U_kgAB'],
    [2, 'U_kgAC'],
    [3, 'U_kgAD'],
    [4, 'U_kgAE'],
    [5, 'U_kgAF'],
    [17, 'U_kgAR'],
    [100, 'U_kgBk'],
    [1000, 'U_kgDNA-g'],
    [10000, 'U_kgDNJxA'],
    [1000000, 'U_kgDOAA9CQA'],
    [100000000, 'U_kgDOBfXhAA'],
    [269053494, 'U_kgDOEAluNg'],
  ];

  for (const [databaseId, expected] of fixtures) {
    it(`should encode user ${databaseId} as ${expected}`, () => {
      expect(encodeUserNodeId(databaseId)).toBe(expected);
    });
  }

  it('should handle the smallest possible ID', () => {
    expect(encodeUserNodeId(0)).toBe('U_kgAA');
  });

  it('should handle msgpack fixint boundary (127)', () => {
    expect(encodeUserNodeId(127)).toBe(encodeNodeId('User', 127));
  });

  it('should handle msgpack uint8 boundary (128)', () => {
    const encoded = encodeUserNodeId(128);
    expect(extractDatabaseId(encoded)).toBe(128);
  });

  it('should handle msgpack uint8 max (255)', () => {
    const encoded = encodeUserNodeId(255);
    expect(extractDatabaseId(encoded)).toBe(255);
  });

  it('should handle msgpack uint16 boundary (256)', () => {
    const encoded = encodeUserNodeId(256);
    expect(extractDatabaseId(encoded)).toBe(256);
  });

  it('should handle msgpack uint16 max (65535)', () => {
    const encoded = encodeUserNodeId(65535);
    expect(extractDatabaseId(encoded)).toBe(65535);
  });

  it('should handle msgpack uint32 boundary (65536)', () => {
    const encoded = encodeUserNodeId(65536);
    expect(extractDatabaseId(encoded)).toBe(65536);
  });

  it('should handle msgpack uint32 max (4294967295)', () => {
    const encoded = encodeUserNodeId(4294967295);
    expect(extractDatabaseId(encoded)).toBe(4294967295);
  });
});

describe('encodeRepoNodeId', () => {
  const fixtures: ReadonlyArray<[number, string]> = [
    [2325298, 'R_kgDOACN7Mg'],
    [10270250, 'R_kgDOAJy2Kg'],
  ];

  for (const [databaseId, expected] of fixtures) {
    it(`should encode repo ${databaseId} as ${expected}`, () => {
      expect(encodeRepoNodeId(databaseId)).toBe(expected);
    });
  }
});

describe('encodeNodeId', () => {
  it('should encode Issue type', () => {
    const encoded = encodeNodeId('Issue', 12345);
    expect(encoded).toMatch(/^I_/);
    expect(extractDatabaseId(encoded)).toBe(12345);
  });

  it('should encode PullRequest type', () => {
    const encoded = encodeNodeId('PullRequest', 99999);
    expect(encoded).toMatch(/^PR_/);
    expect(extractDatabaseId(encoded)).toBe(99999);
  });

  it('should encode repo-scoped objects with two IDs', () => {
    const encoded = encodeNodeId('PullRequestReviewComment', 47954445, 2475899260);
    expect(encoded).toMatch(/^PRRC_/);
    const { ids } = decodeNodeId(encoded);
    expect(ids).toEqual([47954445, 2475899260]);
  });
});

describe('decodeNodeId', () => {
  const fixtures: ReadonlyArray<[string, string, ReadonlyArray<number>]> = [
    ['U_kgAB', 'U_', [1]],
    ['U_kgAC', 'U_', [2]],
    ['U_kgAR', 'U_', [17]],
    ['U_kgBk', 'U_', [100]],
    ['U_kgDNA-g', 'U_', [1000]],
    ['U_kgDNJxA', 'U_', [10000]],
    ['U_kgDOAA9CQA', 'U_', [1000000]],
    ['U_kgDOBfXhAA', 'U_', [100000000]],
    ['U_kgDOEAluNg', 'U_', [269053494]],
    ['R_kgDOACN7Mg', 'R_', [2325298]],
    ['R_kgDOAJy2Kg', 'R_', [10270250]],
  ];

  for (const [nodeId, expectedPrefix, expectedIds] of fixtures) {
    it(`should decode ${nodeId}`, () => {
      const { prefix, ids } = decodeNodeId(nodeId);
      expect(prefix).toBe(expectedPrefix);
      expect(ids).toEqual(expectedIds);
    });
  }

  it('should throw on missing prefix', () => {
    expect(() => decodeNodeId('kgAB')).toThrow('missing prefix');
  });

  it('should throw on invalid msgpack data', () => {
    expect(() => decodeNodeId('U_AAAA')).toThrow();
  });
});

describe('extractDatabaseId', () => {
  it('should extract last ID from single-ID node', () => {
    expect(extractDatabaseId('U_kgAB')).toBe(1);
  });

  it('should extract last ID from multi-ID node', () => {
    const encoded = encodeNodeId('PullRequestReviewComment', 47954445, 2475899260);
    expect(extractDatabaseId(encoded)).toBe(2475899260);
  });
});

describe('roundtrip encode/decode', () => {
  const testValues = [
    0, 1, 2, 17, 100, 127, 128, 255, 256, 1000, 10000, 65535, 65536, 1000000, 100000000, 269053494, 4294967295,
  ];

  for (const id of testValues) {
    it(`should roundtrip user ID ${id}`, () => {
      const encoded = encodeUserNodeId(id);
      const decoded = extractDatabaseId(encoded);
      expect(decoded).toBe(id);
    });
  }

  for (const id of testValues) {
    it(`should roundtrip repo ID ${id}`, () => {
      const encoded = encodeRepoNodeId(id);
      const decoded = extractDatabaseId(encoded);
      expect(decoded).toBe(id);
    });
  }

  it('should roundtrip repo-scoped IDs', () => {
    const repoId = 47954445;
    const objectId = 2475899260;
    const encoded = encodeNodeId('PullRequestReviewComment', repoId, objectId);
    const { ids } = decodeNodeId(encoded);
    expect(ids).toEqual([repoId, objectId]);
  });
});

describe('base64url handling', () => {
  it('should produce base64url characters for ID 1000 (contains -)', () => {
    const encoded = encodeUserNodeId(1000);
    expect(encoded).toBe('U_kgDNA-g');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('should decode base64url characters correctly', () => {
    expect(extractDatabaseId('U_kgDNA-g')).toBe(1000);
  });

  it('should never produce padding characters', () => {
    for (const id of [1, 2, 100, 1000, 10000, 1000000, 100000000]) {
      const encoded = encodeUserNodeId(id);
      expect(encoded).not.toContain('=');
    }
  });
});
