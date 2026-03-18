# parse-github-gql-global-id

Encode and decode GitHub's new GraphQL global node IDs.

GitHub's GraphQL API returns node IDs like `U_kgDOEAluNg` or `R_kgDOACN7Mg`. These are MessagePack-encoded arrays containing the object's database ID, base64url-encoded with a type prefix. This library lets you construct these IDs from database IDs and extract database IDs from them.

## Install

```sh
pnpm add parse-github-gql-global-id
```

## Usage

```ts
import {
  encodeUserNodeId,
  encodeRepoNodeId,
  encodeNodeId,
  decodeNodeId,
  extractDatabaseId,
} from 'parse-github-gql-global-id';

// Encode database IDs into node IDs
encodeUserNodeId(1);         // "U_kgAB" (mojombo)
encodeRepoNodeId(2325298);   // "R_kgDOACN7Mg" (torvalds/linux)

// Encode other object types
encodeNodeId('PullRequest', 123456);
encodeNodeId('PullRequestReviewComment', repoDbId, commentDbId);

// Decode node IDs
decodeNodeId('U_kgDOEAluNg');
// { prefix: "U_", ids: [269053494] }

// Extract just the database ID
extractDatabaseId('R_kgDOACN7Mg'); // 2325298
```

## Supported types

| Type | Prefix |
|------|--------|
| User | `U_` |
| Repository | `R_` |
| Issue | `I_` |
| PullRequest | `PR_` |
| PullRequestReviewComment | `PRRC_` |

## How it works

GitHub's new global IDs follow this format:

```
PREFIX_ + base64url(msgpack([0, ...databaseIds]))
```

The first element is always `0` (version). Users and repos have one ID. Repo-scoped objects (issues, PRs, comments) include the repo's database ID followed by the object's database ID.

Based on the reverse-engineering work from [Greptile's blog post](https://www.greptile.com/blog/github-ids).
