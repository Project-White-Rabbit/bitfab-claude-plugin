---
name: setup-cloud
description: Cloud replay phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "Write", "AskUserQuestion", "Skill"]
---

# Bitfab Setup: Cloud replay

**Run only when mode is `cloud`.**

Run replay in the customer's GitHub Actions. Use this standalone mode for 'setup cloud', 'set up cloud replay', or 'replay on GitHub'. Do not enter login or connect a repository to Bitfab. Normal replay still uses a Bitfab API key on the runner.

1. Read the existing GitHub Actions, runtime manifests, lockfiles, replay registry, gitignore, and environment-variable NAMES. Never read or print secret values. Check git origin, Python 3.10+, and gh authentication. Local dispatch supports macOS/Linux and github.com. Inspect all push-triggered workflows and deployment integrations. Temporary branches use bitfab-replay/** and can trigger those systems. Ask before changing existing CI or deployment behavior. Do not set pushTriggersReviewed until these triggers have been reviewed with the user.

   Choose one existing replay pipeline and reproduce its runtime, dependency installation, build steps, working directory, caches, and required services from CI. Use the installed SDK's cloud-capable CLI. TypeScript/Python/Ruby registry imports happen on the runner only. Go must dispatch cloud flags before building its registry or initializing the application. A private database needs runner network access or a replay-safe service fixture. Do not silently give replay production side effects. Submodules/gitlinks and credential-like tracked files are rejected by the snapshot helper. Surface blockers instead of claiming the environment is ready.

   Present the proposed workflow, fixed replay command, required secret/variable names, and any required CI trigger exclusions. Ask only about unresolved project choices. Never ask for secret values in chat.
2. Create a reviewed JSON setup specification containing version: 1, provider: "github", workflow: "bitfab-replay.yml", workingDirectory (repository-relative), registry (repository-relative path or null for Go), pipeline, command (a JSON argv array without the pipeline argument or cloud flags), pushTriggersReviewed: true, setupSteps (GitHub Actions step objects), secrets (names including BITFAB_API_KEY), and variables (names only). Optional runsOn, services, and environment match the existing CI. Prefer a GitHub Environment with required reviewers when replay code receives sensitive credentials. Pin third-party actions to reviewed commit SHAs. Ensure Python 3.10+ exists on the runner. Commands run in workingDirectory. Registry in the command must be relative to that directory. Set step working-directory explicitly where needed. Do not copy deployment steps, local env values, or API keys into the specification.

   Run python3 "${CLAUDE_PLUGIN_ROOT}/scripts/cloudReplay.py" init --config <specification-path>. This creates .bitfab/cloud.json, .bitfab/cloudReplay.py, and .github/workflows/bitfab-replay.yml. The generated workflow is JSON, which is valid YAML. Existing files are never overwritten. For an existing setup, review the diff and edit project configuration deliberately. Remove only your temporary specification after successful installation. If .bitfab is ignored, propose a narrow gitignore exception for these two files. Never force-add secrets or arbitrary ignored files.

   Tell the user which repository or Environment secrets to create in GitHub Settings → Secrets and variables → Actions. BITFAB_API_KEY belongs to their intended Bitfab organization. Other names come from their application, such as OPENAI_API_KEY. BITFAB_SERVICE_URL is optional. Do not override the SDK's default with an empty GitHub variable. Runtime secrets belong on the replay step. Any install-time credentials need explicit references on the relevant setup step. Local gh authentication is separate from these runner secrets. Do not create a Bitfab cloud target, install a GitHub App, or request a repository connection.
3. Validate workflow syntax (actionlint when available) and run the installed SDK CLI with --cloud --help. The workflow must land on the default branch once before workflow_dispatch can run it on temporary branches. Explain the required commit/merge. Do not push, merge, change repository permissions, or set secrets without authorization.

   After the setup files are tracked, run bitfab-replay --cloud <pipeline> --trace-ids <real-trace-uuid> --cloud-dry-run using the selected SDK command. It reports changed tracked files and omitted new files. Include new source files explicitly with repeated --cloud-include <repository-relative-file>. Review the entire snapshot for credentials. Filename screening is not a secret scanner. Then, only when remote replay is authorized, run without --cloud-dry-run. The helper creates a commit through an isolated index, pushes bitfab-replay/<UUID>, dispatches that branch, waits, retrieves the test-run identity, and deletes the branch with an exact-SHA lease. HEAD, staged changes, and working files stay untouched. Never reset or undo the user's work.

   Use --cloud-detach to return immediately. Explain --cloud-status, --cloud-watch, --cloud-cancel, and --cloud-cleanup with the printed execution UUID. Records live under this worktree's Git directory. Interrupted/lost-response submissions must be recovered, not blindly dispatched again. Cancel requests do not imply the job stopped. Watch/status confirms completion before deleting the branch. Detached jobs do not automatically clean themselves without a later local lifecycle command. Report separately whether files are generated, secrets configured, workflow merged, dry-run verified, and an actual remote replay completed. Never call a mock smoke run a real replay.

   **Next:**

   - Mode `cloud`: invoke the `setup-cleanup` skill with mode `cloud`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
