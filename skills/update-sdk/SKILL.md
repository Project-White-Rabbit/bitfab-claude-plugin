---
name: update-sdk
description: Update SDK phase of the Bitfab Update flow. Invoked by the update flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Grep", "Glob", "Edit", "AskUserQuestion"]
---

# Bitfab Update: Update SDK

**Mode:** you were dispatched with a mode (`all` or `sdk`); the gates and Next routing below depend on it.

**Run only when mode is `all` or `sdk`.**

1. Each line inside `<bitfab-sdk-status>` is a JSON object with fields:

   - `workspacePath` — relative path of the workspace from the repo root (`"."` for non-monorepos or the root package itself)
   - `language` — `"typescript" | "python" | "ruby" | "go"`
   - `packageName` — the canonical SDK package name (`@bitfab/sdk`, `bitfab-py`, `bitfab`, `github.com/Project-White-Rabbit/bitfab-go`)
   - `declaredVersion` — the range from the workspace's manifest. May be `null` or a loose range.
   - `resolvedVersion` — the exact version from the lockfile (workspace's own lockfile, or the monorepo root lockfile used as fallback). This is the truth — what the user is actually running.
   - `current` — `resolvedVersion ?? declaredVersion`. Use this for user-facing messages.
   - `latest` — the latest published version (from the source indicated by `latestSource`)
   - `latestSource` — `"remote"` (fetched live from the registry) or `"baked"` (snapshot from the plugin build)
   - `remoteCheckFailed` — `true` when the live registry lookup failed; trigger the agent fallback (step 3)
   - `updateAvailable` — `true` when `latest > current` OR when `renameFrom` is set (package rename needed)
   - `renameFrom` — when non-null (e.g. `"bitfab"`), the workspace uses the legacy package name and must be switched to `packageName` (`@bitfab/sdk`). The update step should remove the old package and install the new one, then update imports in source files.
   - `deprecated` — `true` when the workspace uses the legacy `bitfab` package name instead of `@bitfab/sdk`. Equivalent to `renameFrom !== null`; kept for backward compatibility.
   - `manifestPath` / `lockfilePath` — absolute paths of the files the info came from

   If there are **no lines** inside `<bitfab-sdk-status>`, the programmatic check found no SDK — but don't stop yet, run step 2 first. After that step, distinguish two cases:

   - **No SDK anywhere** (no lines AND step 2 found no imports): the project isn't instrumented yet. Tell the user the Bitfab SDK isn't installed and suggest running `/bitfab:setup` to instrument the project. Stop.
   - **SDKs present and current** (every entry has `updateAvailable: false` AND step 2 finds no extras): tell the user their SDKs are up to date and stop.
2. The programmatic detection is regex-based and only knows the workspace formats we hand-coded (pnpm/npm/yarn workspaces, uv workspaces, go.work). It can miss unusual monorepo layouts, vendored SDKs, or projects using package managers we don't parse. **Always run this verification** before offering updates.

   - Grep the project for SDK imports (run these in parallel):
     - TypeScript: `import .* from ["'](?:@bitfab/sdk|bitfab)["']` or `require\(["'](?:@bitfab/sdk|bitfab)["']\)`
     - Python: `^\s*(from|import) bitfab\b`
     - Ruby: `require ['"]bitfab['"]`
     - Go: `"github.com/Project-White-Rabbit/bitfab-go"`
   - For each import, find its workspace directory by walking up to the nearest `package.json` / `pyproject.toml` / `Gemfile` / `go.mod`.
   - Compare that set against the `workspacePath` values in `<bitfab-sdk-status>`.
   - For each workspace that has imports but **no** corresponding status entry, treat it as a missed detection: ask the user which package manager that workspace uses, then go to step 3 for it (same flow as `remoteCheckFailed: true`).
   - If the sets match, proceed.
3. For each entry where `remoteCheckFailed: true`, or any workspace discovered only in step 2, run the package manager's native outdated command from the workspace directory. The command is authoritative — it respects private registries, mirrors, and offline caches.

   | Language | Detection (from workspace/repo) | Command (run from workspace dir) |
   |---|---|---|
   | typescript | `pnpm-lock.yaml` at repo root → pnpm; `yarn.lock` → yarn; `bun.lock` → bun; otherwise npm | `pnpm outdated @bitfab/sdk --json` / `npm outdated @bitfab/sdk --json` / `yarn outdated @bitfab/sdk` / `bun outdated @bitfab/sdk` |
   | python | `uv.lock` → uv; `poetry.lock` → poetry; otherwise pip | `uv pip list --outdated --format=json` / `poetry show -o bitfab-py` / `pip list --outdated --format=json` |
   | ruby | `Gemfile.lock` | `bundle outdated bitfab --parseable` |
   | go | `go.mod` | `go list -m -u -json github.com/Project-White-Rabbit/bitfab-go` |

   Use the real latest from the command's output in place of `latest` when deciding whether to offer an upgrade.
4. If there are **3 or more** workspaces with `updateAvailable: true`, ask with `AskUserQuestion` — **one decision per question**:

   > A) **Update all N outdated workspaces** *(recommended)* → step 7
   > B) **Ask me per workspace** → step 5
   > C) **Skip everything** → stop

   **Always recommend "Update all" (option A).** Do not downgrade the recommendation based on the range specifier or lockfile shape — not for `workspace:*` / `workspace:^`, not for git refs, not for pinned `"=X.Y.Z"`, not for path deps. An outdated SDK is an outdated SDK. If the user is working inside a monorepo where the dep is workspace-linked to a sibling SDK package, they are free to pick **Skip** themselves, but the recommended action is still **Update**.

   If there are **fewer than 3** outdated workspaces, skip this prompt and go straight to per-workspace.
5. For the next workspace with `updateAvailable: true`, ask with `AskUserQuestion` — **one decision per question**:

   > We recommend **Update**: `<workspacePath>` — `<language>` SDK `<current>` → `<latest>`.
   > If `renameFrom` is set, append: (also renames `<renameFrom>` → `<packageName>`)
   >
   > A) **Update** — run the package manager update command now *(recommended)* → step 6
   > B) **Skip** — leave this workspace on `<current>` → step 5

   When no outdated workspaces remain, exit and acknowledge.
6. Detect the package manager from the lockfiles and run the update **from the workspace directory** (not repo root — matters in monorepos):

   | Language | Command |
   |---|---|
   | typescript | If `renameFrom` is set (legacy `bitfab` package): remove the old package and add the new one in a single command: `pnpm remove bitfab && pnpm add @bitfab/sdk@latest` / `npm uninstall bitfab && npm install @bitfab/sdk@latest` / `yarn remove bitfab && yarn add @bitfab/sdk@latest` / `bun remove bitfab && bun add @bitfab/sdk@latest`. Then update imports in source files from `bitfab` to `@bitfab/sdk`. If no rename: `pnpm update @bitfab/sdk@latest` / `yarn upgrade @bitfab/sdk@latest` / `bun update @bitfab/sdk` / `npm install @bitfab/sdk@latest` |
   | python | `uv add bitfab-py@latest` / `poetry add bitfab-py@latest` / `pip install -U bitfab-py` (and bump the pin in `requirements.txt` via Edit) |
   | ruby | `bundle update bitfab` |
   | go | `go get github.com/Project-White-Rabbit/bitfab-go@latest && go mod tidy` |

   After the update, Read the manifest to verify the new version and confirm to the user. If a rename was performed (`renameFrom` was set), also grep the workspace for old import paths and update them (e.g. `from "bitfab"` to `from "@bitfab/sdk"`). Then return to the per-workspace prompt for the next workspace.
7. For every workspace with `updateAvailable: true`, detect the package manager from the lockfiles and run the update **from each workspace directory** (not repo root):

   | Language | Command |
   |---|---|
   | typescript | If `renameFrom` is set (legacy `bitfab` package): remove the old package and add the new one in a single command: `pnpm remove bitfab && pnpm add @bitfab/sdk@latest` / `npm uninstall bitfab && npm install @bitfab/sdk@latest` / `yarn remove bitfab && yarn add @bitfab/sdk@latest` / `bun remove bitfab && bun add @bitfab/sdk@latest`. Then update imports in source files from `bitfab` to `@bitfab/sdk`. If no rename: `pnpm update @bitfab/sdk@latest` / `yarn upgrade @bitfab/sdk@latest` / `bun update @bitfab/sdk` / `npm install @bitfab/sdk@latest` |
   | python | `uv add bitfab-py@latest` / `poetry add bitfab-py@latest` / `pip install -U bitfab-py` (and bump the pin in `requirements.txt` via Edit) |
   | ruby | `bundle update bitfab` |
   | go | `go get github.com/Project-White-Rabbit/bitfab-go@latest && go mod tidy` |

   After each update, Read the manifest to verify the new version and confirm to the user. If a rename was performed (`renameFrom` was set), also grep the workspace for old import paths and update them (e.g. `from "bitfab"` to `from "@bitfab/sdk"`).
