import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { encodeUserNodeId, encodeRepoNodeId, extractDatabaseId } from '../src/index';

try {
  process.loadEnvFile(resolve(import.meta.dirname, '..', '.env'));
} catch {
  // .env file is optional — CI uses env vars directly
}

const TOKEN = process.env['TEST_GITHUB_TOKEN'];

const GraphQLResponseSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

const RestUserSchema = z.object({
  id: z.number(),
  node_id: z.string(),
  login: z.string(),
});

const NodeUserSchema = z.object({
  login: z.string(),
  databaseId: z.number(),
});

const NodeRepoSchema = z.object({
  nameWithOwner: z.string(),
  databaseId: z.number(),
  id: z.string(),
});

const ViewerSchema = z.object({
  id: z.string(),
  databaseId: z.number(),
  login: z.string(),
});

const SearchRepoNodeSchema = z.object({
  id: z.string(),
  databaseId: z.number(),
  nameWithOwner: z.string(),
});

const graphql = async (query: string, variables?: Record<string, unknown>) => {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'X-Github-Next-Global-ID': '1',
    },
    body: JSON.stringify({ query, variables }),
  });
  const raw: unknown = await response.json();
  return GraphQLResponseSchema.parse(raw);
};

const restUser = async (databaseId: number) => {
  const response = await fetch(`https://api.github.com/user/${databaseId}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'X-Github-Next-Global-ID': '1',
    },
  });
  if (!response.ok) return null;
  const raw: unknown = await response.json();
  return RestUserSchema.parse(raw);
};

describe('node ID encoding against live GitHub API', { timeout: 30000 }, () => {
  if (!TOKEN) {
    it.skip('TEST_GITHUB_TOKEN not set', () => {});
    return;
  }

  const knownUsers: ReadonlyArray<[number, string]> = [
    [1, 'mojombo'],
    [2, 'defunkt'],
    [3, 'pjhyett'],
    [4, 'wycats'],
    [5, 'ezmobius'],
    [17, 'vanpelt'],
    [100, 'kmarsh'],
  ];

  for (const [databaseId, login] of knownUsers) {
    it(`should generate correct node ID for user ${login} (id: ${databaseId})`, async () => {
      const crafted = encodeUserNodeId(databaseId);

      const user = await restUser(databaseId);
      expect(user).not.toBeNull();
      expect(user?.node_id).toBe(crafted);

      const result = await graphql(
        `
          query ($id: ID!) {
            node(id: $id) {
              ... on User {
                login
                databaseId
              }
            }
          }
        `,
        { id: crafted },
      );
      expect(result.errors).toBeUndefined();
      const node = NodeUserSchema.parse(result.data?.node);
      expect(node.login).toBe(login);
      expect(node.databaseId).toBe(databaseId);
    });
  }

  it('should generate correct node ID for torvalds/linux repo', async () => {
    const crafted = encodeRepoNodeId(2325298);

    const result = await graphql(
      `
        query ($id: ID!) {
          node(id: $id) {
            ... on Repository {
              nameWithOwner
              databaseId
              id
            }
          }
        }
      `,
      { id: crafted },
    );
    expect(result.errors).toBeUndefined();
    const node = NodeRepoSchema.parse(result.data?.node);
    expect(node.nameWithOwner).toBe('torvalds/linux');
    expect(node.databaseId).toBe(2325298);
    expect(node.id).toBe(crafted);
  });

  it('should generate correct node ID for facebook/react repo', async () => {
    const crafted = encodeRepoNodeId(10270250);

    const result = await graphql(
      `
        query ($id: ID!) {
          node(id: $id) {
            ... on Repository {
              nameWithOwner
              databaseId
              id
            }
          }
        }
      `,
      { id: crafted },
    );
    expect(result.errors).toBeUndefined();
    const node = NodeRepoSchema.parse(result.data?.node);
    expect(node.nameWithOwner).toBe('facebook/react');
    expect(node.databaseId).toBe(10270250);
    expect(node.id).toBe(crafted);
  });

  it('should roundtrip: fetch user node ID from GitHub, decode it, re-encode it', async () => {
    const result = await graphql(`
      {
        viewer {
          id
          databaseId
          login
        }
      }
    `);
    const viewer = ViewerSchema.parse(result.data?.viewer);

    const decoded = extractDatabaseId(viewer.id);
    expect(decoded).toBe(viewer.databaseId);

    const reEncoded = encodeUserNodeId(viewer.databaseId);
    expect(reEncoded).toBe(viewer.id);
  });

  it('should roundtrip: search repos, decode IDs, re-encode them', async () => {
    const result = await graphql(`
      {
        search(query: "stars:>100000", type: REPOSITORY, first: 5) {
          nodes {
            ... on Repository {
              id
              databaseId
              nameWithOwner
            }
          }
        }
      }
    `);

    const search = z.object({ nodes: z.array(SearchRepoNodeSchema) }).parse(result.data?.search);
    expect(search.nodes.length).toBeGreaterThan(0);

    for (const node of search.nodes) {
      const decoded = extractDatabaseId(node.id);
      expect(decoded).toBe(node.databaseId);

      const reEncoded = encodeRepoNodeId(node.databaseId);
      expect(reEncoded).toBe(node.id);
    }
  });
});
