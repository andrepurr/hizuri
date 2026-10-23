# Files

Scope: for users.

Every file this repo tracks has one line here: what the file holds, why the repo needs it, and the mark that someone read it and found nothing personal in it. A file without such a line does not ship: `scripts/personal-guard.mjs` refuses the commit.

## How to read it

1. Files are grouped by folder; each heading is a folder's path, `./` is the repo root.
2. ``- `path` — what it holds. Why: what uses it. checked: nothing personal`` is a file hizuri wrote or changed, described from reading it.
3. ``- `path` — Paseo, unchanged. checked: nothing personal`` is Paseo's file exactly as upstream has it at that path. Its reason is the folder's note, `Paseo's files here: ...`. hizuri keeps Paseo's files unchanged so each Paseo release merges in without conflicts.
4. `not checked` marks a line nobody has finished yet. A commit that adds the file is refused until the line is written; an older file's unfinished line fails `--check`, and the file does not ship until the line is done.

## How to update it

1. Add, move or delete a file: change its line in the same commit. `node scripts/files-map.mjs --update` adds a line for every new file in the index (`git add` it first), drops the lines of deleted files and sorts the map. A new file that is byte-identical to Paseo's gets a Paseo line; any other new file gets a `not checked` stub, and you replace the stub with what the file holds and why it is needed, written from reading it.
2. Change a file: keep its line true. When the change alters what the file holds or why it is needed, rewrite the line. The first time hizuri edits a Paseo file, its Paseo line becomes false: the check names it, and you write the file's own line.
3. Check: `node scripts/files-map.mjs --check` checks the whole map against the index. The commit hook (`scripts/personal-guard.mjs --staged`) checks what the commit changes: an added file needs a finished line, a deleted file loses its line, and a changed file and every line the commit writes must be well formed and true.
4. A merge never stops on this file (`merge=union` in `.gitattributes`). Two branches that touch the same line leave both versions in the file; the check then reports the path as listed twice, and you keep the right one.

## `./`

Paseo's files here: Root configuration coordinates monorepo builds, linting, tests, and tool versions; hizuri keeps it so standard developer workflows and type checking remain fully functional across all packages.

- `.dockerignore` — Paseo, unchanged. checked: nothing personal
- `.gitattributes` — Git attributes: FILES.md merges with the union driver. Why: Parallel branches that add lines to the same folder of FILES.md merge without stopping; the check then reports any doubled path. checked: nothing personal
- `.gitignore` — Paseo's ignore rules plus the files built after install, the product docs and the streaming recogniser clients, both kept outside the repo. Why: git reads it on every status and add. checked: nothing personal
- `.mise.toml` — Paseo, unchanged. checked: nothing personal
- `.oxfmtrc.json` — Paseo, unchanged. checked: nothing personal
- `.oxlintrc.json` — Paseo, unchanged. checked: nothing personal
- `.tool-versions` — Paseo, unchanged. checked: nothing personal
- `AGENTS.md` — Paseo, unchanged. checked: nothing personal
- `CHANGELOG.md` — Release notes documenting changes, additions, fixes, and fork differences across versions. Why: Informs users and contributors of product updates, fork modifications, and upstream version history. checked: nothing personal
- `CLAUDE.md` — Repository overview and instruction guide for AI coding assistants working on the project. Why: Provides agents with repository layout, documentation index, file tracking rules, and coding context. checked: nothing personal
- `FILES.md` — This map: every tracked file with what it holds, why it is needed and the check mark. Why: Scripts/files-map.mjs checks it on every commit and before publishing; a file without its line does not ship. checked: nothing personal
- `LICENSE` — Paseo, unchanged. checked: nothing personal
- `NOTICE` — The legal notice detailing project copyright, upstream project attribution, and third-party license acknowledgements. Why: Ensures compliance with open-source licenses by documenting copyright holders and original project origins. checked: nothing personal
- `README.md` — The front page: hero picture, links and badges, a table of what the assistant does, the cast clips, quick install, «How it works», install steps, what else ships, how to work on hizuri, credits. Why: introduces hizuri on GitHub to people and to coding agents that install it. checked: nothing personal
- `install.sh` — A shell script that automates prerequisites checking, folder setup, memory database initialization, and daemon installation. Why: Executed by users to set up the assistant environment, configure Claude Code, and start the daemon. checked: nothing personal
- `knip.json` — Knip configuration for detecting unused files, dependencies, and exports across the monorepo workspaces. Why: Used by Knip during repository linting to catch dead code and unreferenced workspace dependencies. checked: nothing personal
- `lefthook.yml` — The Git hooks configuration for running formatters, linters, type checks, and the personal data guard. Why: Lefthook runs this during commit workflows to block personal data leaks and code style errors. checked: nothing personal
- `package-lock.json` — The locked dependency tree for npm packages across all workspace packages. Why: Read by npm install to reproduce exact dependency versions across development and build environments. checked: nothing personal
- `package.json` — Root package configuration defining workspace packages, devDependencies, and monorepo scripts. Why: Runs npm scripts for development, testing, formatting, and building all workspace packages. checked: nothing personal
- `paseo.json` — Paseo, unchanged. checked: nothing personal
- `tsconfig.base.json` — Paseo, unchanged. checked: nothing personal
- `tsconfig.json` — Paseo, unchanged. checked: nothing personal
- `vitest.config.ts` — Paseo, unchanged. checked: nothing personal

## `.claude-plugin/`

- `.claude-plugin/marketplace.json` — Marketplace catalog entry defining the hizuri Claude Code plugin. Why: Read by Claude Code to register and install the plugin from its repository path. checked: nothing personal

## `.github/`

Paseo's files here: the CI's path filters, which tell each CI job which changes concern it.

- `.github/ci-paths.yml` — CI path filters that decide which jobs run for a change; the public-docs filter is gone with that folder. Why: the CI workflow reads it to skip unrelated jobs. checked: nothing personal

## `.github/ISSUE_TEMPLATE/`

The issue forms of this repository.

- `.github/ISSUE_TEMPLATE/bug-report.yml` — The bug report form: what broke, steps, surface, the hizuri commit, provider, logs from the daemon's home folder, screenshots. Why: GitHub shows it for every new issue. checked: nothing personal
- `.github/ISSUE_TEMPLATE/config.yml` — Turns off blank issues and sends bugs that also happen in Paseo to Paseo's tracker. Why: GitHub reads it to build the new-issue page. checked: nothing personal

## `.github/workflows/`

The one workflow GitHub Actions runs: Paseo's CI on pushes and pull requests, plus a job that checks the tree with the generic rules of the personal guard.

- `.github/workflows/ci.yml` — Paseo's CI workflow (formatting, lint, types, test suites routed by path) plus the personal-guard job, which checks the tree with the guard's generic rules against Paseo's lines. Why: GitHub Actions runs it on pushes and pull requests. checked: nothing personal

## `claude/`

- `claude/.mcp.json` — MCP server configuration pointing to the local hizuri daemon. Why: Used by Claude Code to connect to hizuri's daemon tools over HTTP. checked: nothing personal
- `claude/README.md` — Documentation describing the hizuri Claude Code plugin, its components, rules, and installation. Why: Explains how the plugin operates and directs developers on installing and configuring it. checked: nothing personal

## `claude/.claude-plugin/`

- `claude/.claude-plugin/plugin.json` — The manifest defining metadata and configuration options for the hizuri Claude Code plugin. Why: Read by Claude Code when loading the plugin and setting up Guardian options. checked: nothing personal

## `claude/agents/`

- `claude/agents/skill-reviewer.md` — An agent definition for reviewing newly written skills and rules for bloat or defects. Why: Invoked by Claude Code to check authoring guidelines and formatting rules before finishing instruction edits. checked: nothing personal

## `claude/bin/`

- `claude/bin/hizuri-memory` — A CLI utility to initialize the database, sync transcripts, inspect stats, and manage notes. Why: Run from the terminal or scripts to manage local memory records and sync conversation logs. checked: nothing personal
- `claude/bin/hizuri-recall` — A CLI tool to search session transcripts and user notes. Why: Run by agents or users via Bash to find prior context and spoken phrases before acting. checked: nothing personal
- `claude/bin/hizuri-retro` — A CLI tool to record, query, and manage weekly retrospective log entries. Why: Used by the Guardian and agent tasks to track rule infractions and retro reviews. checked: nothing personal
- `claude/bin/hizuri-secret` — A CLI tool to access Bitwarden credentials safely without exposing secrets directly to agents. Why: Run by agents to type, pipe, or inject environment secrets into commands without leaking plaintext. checked: nothing personal

## `claude/hooks/`

- `claude/hooks/core.ts` — The Guardian engine logic managing rule evaluation, note books, compacting pauses, and retro logging. Why: Imported by registration hooks to schedule checks, evaluate agent actions, and issue rule reminders. checked: nothing personal
- `claude/hooks/guardian.ts` — Pure utility functions, system prompts, parser logic, and fingerprinting for the Guardian side checker. Why: Imported by core.ts and test suites to build prompts, analyze message turns, and parse check verdicts. checked: nothing personal
- `claude/hooks/hizuri.test.ts` — Tests for the Guardian: parsing, prompts, moments, guards, the loop, notes, the reply gate and words loaded from a language file. Why: `claude plugin test ./claude` runs it. checked: nothing personal
- `claude/hooks/hooks.json` — The hook configuration file registering modules and session startup commands for Claude Code. Why: Read by Claude Code on startup to register lifecycle modules and bootstrap scripts. checked: nothing personal
- `claude/hooks/moments.ts` — Detection rules identifying trigger moments such as questions, credentials, file creation, and prior context reads. Why: Imported by core.ts and guardian.ts to flag high-risk actions and ensure agents checked memory first. checked: nothing personal
- `claude/hooks/register.ts` — Claude Code hook registrations for the Guardian checker, vault guard, rule edits and turn steps; at session start it also loads the Guardian's words from the user's language files. Why: Loaded by Claude Code to monitor agent actions, prevent secret leaks, and check rules during turns. checked: nothing personal
- `claude/hooks/reply.ts` — The Guardian's reply gate: rule-based sure misses (an account or key ask before memory and the vault, a claim that a tool cannot do something with no docs look, a clock time with no clock read) that refuse a spoken or typed reply, with the repeat limit and the refusal text. Why: Called by register.ts on every speak tool call and at a turn's Stop; tested in hizuri.test.ts. checked: nothing personal
- `claude/hooks/session-start.mjs` — Script running on session start to trigger background memory sync and notify about due retros. Why: Executed by Claude Code's SessionStart hook to index recent transcripts and remind about weekly retros. checked: nothing personal
- `claude/hooks/words.ts` — The Guardian's word lists for the user's other languages: the list names, the loader that takes the "guardian" section of each language file, and the pattern helper that rebuilds a regex after the words change. Why: guardian.ts, moments.ts and reply.ts build their patterns with it; register.ts fills it at session start. checked: nothing personal

## `claude/lib/`

- `claude/lib/hizuri.mjs` — Shared utility functions and environment paths for memory containers, SQL execution, and CLI flags. Why: Imported by memory and retro commands to manage containerized Postgres execution and local storage paths. checked: nothing personal
- `claude/lib/memory.mjs` — Module managing the Postgres memory container lifecycle and indexing Claude Code transcripts. Why: Used by hizuri-memory CLI and background sync hooks to ingest user and agent messages. checked: nothing personal
- `claude/lib/retro.mjs` — Helper module for logging and querying weekly retrospective notes in Markdown files. Why: Imported by retro CLI commands and session start hooks to check and record rule breaks. checked: nothing personal

## `claude/memory/`

- `claude/memory/schema.sql` — PostgreSQL schema defining tables, full-text search indexes, and functions for session memory and notes. Why: Executed during container initialization in memory.mjs to prepare the transcript search database. checked: nothing personal

## `claude/rules/`

- `claude/rules/core.md` — Core rules instructing the self-learning agent on memory retrieval, retros, secrets, and task handling. Why: Loaded by register.ts and referenced by Guardian hooks to validate agent behavior during sessions. checked: nothing personal
- `claude/rules/hizuri.md` — The entry rule file for the Claude Code plugin explaining the machine layout and referencing user rules. Why: Loaded by Claude Code to orient the agent within the hizuri directory structure and configuration files. checked: nothing personal

## `claude/skills/creating-a-persona/`

- `claude/skills/creating-a-persona/SKILL.md` — Skill instructions for defining or updating the assistant's persona, speaking tone, language, and output style. Why: Invoked by Claude Code when the user requests changes to how the assistant speaks or behaves. checked: nothing personal

## `claude/skills/refreshing-rules/`

- `claude/skills/refreshing-rules/SKILL.md` — Skill instructions for identifying broken rules after user complaints and regenerating the last response. Why: Invoked by Claude Code when a user complains about an answer or triggers rule refreshing. checked: nothing personal

## `claude/skills/searching-memory/`

- `claude/skills/searching-memory/SKILL.md` — Skill instructions for querying past conversations and saving structured user notes into the memory database. Why: Invoked by Claude Code whenever the agent needs to recall prior context or store user facts. checked: nothing personal

## `claude/skills/using-secrets/`

- `claude/skills/using-secrets/SKILL.md` — Skill instructions for retrieving and using vault secrets via hizuri-secret without exposing plaintext values. Why: Invoked by Claude Code whenever credentials, API keys, or payment details are needed for tasks. checked: nothing personal

## `claude/skills/weekly-retro/`

- `claude/skills/weekly-retro/SKILL.md` — The weekly retrospective skill: groups the week's retro lines by rule and fixes the rules, skills or hooks behind the worst ones. Why: the session-start hook asks the assistant to run it when the retro is due. checked: nothing personal

## `claude/skills/writing-skills/`

- `claude/skills/writing-skills/SKILL.md` — Skill guidance and size rules for authoring and revising skills, rules, and assistant styles. Why: Invoked by Claude Code when drafting new skills or modifying rules to maintain quality standards. checked: nothing personal

## `docker/`

Paseo's files here: Compose files and sample container manifests package the daemon with coding assistants; hizuri keeps them to let users deploy self-hosted environments using familiar container tooling.

- `docker/Dockerfile.agents.example` — Paseo, unchanged. checked: nothing personal
- `docker/README.md` — Paseo, unchanged. checked: nothing personal
- `docker/docker-compose.example.yml` — Paseo, unchanged. checked: nothing personal

## `docker/base/`

Paseo's files here: The base Dockerfile compiles daemon source code into a runnable container image; hizuri keeps it to produce predictable server runtime images without manual machine setup.

- `docker/base/Dockerfile` — Paseo, unchanged. checked: nothing personal

## `docker/base/rootfs/usr/local/bin/`

Paseo's files here: The container entrypoint script initializes default paths and environment variables; hizuri keeps it so containerized daemon instances boot reliably with proper permission defaults.

- `docker/base/rootfs/usr/local/bin/paseo-docker-entrypoint` — Paseo, unchanged. checked: nothing personal

## `docker/promo/`

- `docker/promo/Dockerfile` — Dockerfile creating a hosted demo container with the daemon, web UI, Claude Code, and Codex. Why: Builds the hizuri-promo container image used by the promo provisioner to launch disposable demo sandboxes. checked: nothing personal

## `docker/promo/provisioner/`

- `docker/promo/provisioner/promo` — Bash admin CLI for creating, inspecting, revoking, and removing demo provisioner environments and codes. Why: Executed by administrators on the demo host to manage disposable containerized promo environments. checked: nothing personal
- `docker/promo/provisioner/server.mjs` — Node.js service managing redemption codes, cloudflared tunnels, and Docker lifecycle for demo sandboxes. Why: Runs as the backend promo provisioner daemon handling redemption requests and environment orchestration. checked: nothing personal

## `docker/promo/provisioner/public/`

- `docker/promo/provisioner/public/index.html` — Web interface for redeeming promo demo codes and monitoring environment setup progress. Why: Served by the promo provisioner daemon so a visitor can redeem a demo code and open their demo instance. checked: nothing personal

## `docker/promo/rootfs/etc/hizuri-promo/`

- `docker/promo/rootfs/etc/hizuri-promo/config.json` — Default configuration disabling external agent providers in promo demo environments. Why: Copied into the promo container to restrict agent providers until the user authenticates. checked: nothing personal
- `docker/promo/rootfs/etc/hizuri-promo/free-brain-role.md` — Prompt instructions for the free starter AI model in demo environments. Why: Guides the starter brain to help users connect their own provider during hosted demos. checked: nothing personal

## `docker/promo/rootfs/usr/local/bin/`

- `docker/promo/rootfs/usr/local/bin/hizuri-brain` — CLI script to connect Claude, ChatGPT, or API keys to the demo daemon. Why: Allows demo environment users to sign into providers and enable them in daemon configuration. checked: nothing personal
- `docker/promo/rootfs/usr/local/bin/hizuri-promo-entrypoint` — Entrypoint script initializing demo daemon configuration and trial brain tokens. Why: Bootstraps container settings before delegating execution to the main Paseo Docker entrypoint. checked: nothing personal

## `docs/`

Paseo's files here: Technical documentation explains daemon architecture, testing setups, and platform integrations; hizuri keeps these docs so assistants and developers understand underlying protocol behavior before making changes.

- `docs/ad-hoc-daemon-testing.md` — Paseo, unchanged. checked: nothing personal
- `docs/agent-lifecycle.md` — Documentation of agent states, runtime residency, cancellation semantics, parentage relationships, and subagent handling. Why: Explains daemon lifecycle transitions and tab management for developers modifying AgentManager and client views. checked: nothing personal
- `docs/agent-stream-performance.md` — Architecture guide explaining streaming text pacing, coalescing invariants, and rendering performance. Why: Documents performance constraints for rendering live agent output without UI stalls or excessive re-renders. checked: nothing personal
- `docs/android.md` — Developer documentation for building, running, debugging, and profiling the Android app. Why: Guides developers through native Android prerequisites, emulator networking, logging diagnostics, and APK packaging. checked: nothing personal
- `docs/architecture.md` — Architecture guide describing system components, daemon internals, client packages, and communication protocols. Why: Informs developers about package organization, WebSocket boundaries, agent lifecycles, and synchronization patterns. checked: nothing personal
- `docs/brand.md` — The brand design specification defining the Fluctuation concept, mark geometry, typography, and wordmark rules. Why: Guides visual asset generation, icon implementations, and UI typography consistency across apps and website pages. checked: nothing personal
- `docs/browser-capture-harness.md` — Paseo, unchanged. checked: nothing personal
- `docs/coding-standards.md` — Paseo, unchanged. checked: nothing personal
- `docs/connected-hosts.md` — How the daemon registers connected hosts and routes SDK scopes; its reference links point at Paseo's published docs. Why: the developer docs index links it. checked: nothing personal
- `docs/custom-providers.md` — Custom provider configuration (Z.AI, Qwen, ACP agents, profiles); its SDK link points at Paseo's published docs. Why: the developer docs index links it. checked: nothing personal
- `docs/data-model.md` — Data model documentation covering daemon files, project records, workspaces, and tool hub storage. Why: Defines persistent storage schemas and file layout conventions under the user's home directory. checked: nothing personal
- `docs/design.md` — The design token system, typography scales, layout hierarchy, and component reuse guidelines for UI surfaces. Why: Directs UI styling and component usage across packages/app screens, ensuring consistent tokens and interaction targets. checked: nothing personal
- `docs/development.md` — Dev server, build sync and CLI reference; its user-guide links point at Paseo's published docs. Why: the developer docs index links it. checked: nothing personal
- `docs/docker.md` — Paseo's guide to running the daemon and web UI in Docker, without the image publishing of Paseo's release workflow. Why: CLAUDE.md links it for container setups. checked: nothing personal
- `docs/explorer-sidebar.md` — Paseo, unchanged. checked: nothing personal
- `docs/expo-router.md` — Guidelines for Expo Router layout boundaries, route topology, startup routing, and native stack stability. Why: Prevents blank-screen crashes and navigation deck errors when altering packages/app route structures and deep links. checked: nothing personal
- `docs/face-mouth.md` — How the face's mouth is driven: the plain mouth, a model of your own in the avatar folder with its message format, or a hosted server. Why: The doc that tells avatar page authors how to ask for the voice PCM and draw from it. checked: nothing personal
- `docs/file-icons.md` — Paseo, unchanged. checked: nothing personal
- `docs/file-observation.md` — Paseo, unchanged. checked: nothing personal
- `docs/floating-panels.md` — Paseo, unchanged. checked: nothing personal
- `docs/forge-providers.md` — Paseo, unchanged. checked: nothing personal
- `docs/forms.md` — Paseo, unchanged. checked: nothing personal
- `docs/glossary.md` — Paseo, unchanged. checked: nothing personal
- `docs/hover.md` — Paseo, unchanged. checked: nothing personal
- `docs/hub.md` — Paseo, unchanged. checked: nothing personal
- `docs/i18n.md` — Internationalization guidelines and migration history for client user interface translations. Why: Guides developers on adding UI translation strings and maintaining parity across supported locales. checked: nothing personal
- `docs/markdown-renderer.md` — Paseo, unchanged. checked: nothing personal
- `docs/menus.md` — Paseo, unchanged. checked: nothing personal
- `docs/mobile-panels.md` — The state, gesture arbitration, and animation architecture for compact mobile multi-panel views. Why: Documents gesture handling and panel transitions implemented in packages/app/src/mobile-panels to prevent gesture conflicts. checked: nothing personal
- `docs/mobile-testing.md` — Paseo, unchanged. checked: nothing personal
- `docs/native-text-selection.md` — Paseo, unchanged. checked: nothing personal
- `docs/permissions.md` — Paseo, unchanged. checked: nothing personal
- `docs/plugins.md` — Documentation explaining plugin development, native modules, packaging requirements, and security practices. Why: Guides developers building plugins and explains client runtime constraints like Hermes and worklet limitations. checked: nothing personal
- `docs/product.md` — What the product is and where it is going. Why: the developer docs index links it. checked: nothing personal
- `docs/protocol-compatibility.md` — Paseo, unchanged. checked: nothing personal
- `docs/protocol-validation.md` — Paseo, unchanged. checked: nothing personal
- `docs/providers.md` — Adding an agent provider end to end; its public guide links point at Paseo's published docs. Why: the developer docs index links it. checked: nothing personal
- `docs/qa.md` — Paseo, unchanged. checked: nothing personal
- `docs/rpc-namespacing.md` — Paseo, unchanged. checked: nothing personal
- `docs/service-proxy.md` — Paseo, unchanged. checked: nothing personal
- `docs/terminal-activity.md` — Paseo, unchanged. checked: nothing personal
- `docs/terminal-performance.md` — Paseo, unchanged. checked: nothing personal
- `docs/testing.md` — Paseo's testing guide (TDD, determinism, suites and CI routing), without the packaging workflows hizuri does not keep. Why: CLAUDE.md sends every change through it. checked: nothing personal
- `docs/timeline-sync.md` — Paseo, unchanged. checked: nothing personal
- `docs/tool-hub.md` — Documentation detailing the tool hub workflow, MCP tool discovery, sandbox execution, and review system. Why: Explains how agents discover, install, and execute sandboxed MCP tools via the daemon endpoint. checked: nothing personal
- `docs/unistyles.md` — Paseo, unchanged. checked: nothing personal

## `docs/images/`

- `docs/images/readme-show.png` — Screenshot illustrating the Show interface for the project README. Why: Displays the second screen stage in documentation and repository landing pages. checked: nothing personal
- `docs/images/cast.webp` — Five short clips of 3D characters from VRoid Hub (posing, dancing, walking), licensed for commercial use. Why: the README's «Make your agent anyone» picture. checked: nothing personal
- `docs/images/hero.webp` — The hizuri.com hero: the headline next to a phone showing the assistant's avatar (a VRoid Hub character) speaking. Why: the README's top picture. checked: nothing personal
- `docs/images/how-it-works-dark.svg` — Diagram: the phone or a browser talks to the hizuri daemon over an end-to-end encrypted relay or a VPN; the daemon runs Claude Code, memory and speech. Why: the README's «How it works» picture, dark theme. checked: nothing personal
- `docs/images/how-it-works-light.svg` — The same «How it works» diagram for the light theme. Why: the README picks it when GitHub shows the light theme. checked: nothing personal

## `packages/app/`

Paseo's files here: Expo configuration, Babel plugins, and test harnesses manage the cross-platform frontend; hizuri keeps them to compile and test the mobile and web client.

- `packages/app/.fingerprintignore` — Ignore rules for Expo native fingerprint generation. Why: Expo CLI reads it to skip Kotlin build caches when computing native project hashes. checked: nothing personal
- `packages/app/.gitignore` — Paseo, unchanged. checked: nothing personal
- `packages/app/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/app/app.config.js` — The Expo application configuration defining bundle identifiers, permissions, native plugins, and update settings. Why: Used by Expo and EAS build processes to generate native Android and iOS mobile application bundles. checked: nothing personal
- `packages/app/app.config.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/babel.config.js` — Paseo, unchanged. checked: nothing personal
- `packages/app/eas.json` — Paseo, unchanged. checked: nothing personal
- `packages/app/eslint.config.js` — Paseo, unchanged. checked: nothing personal
- `packages/app/global.d.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/index.ts` — The entry point for the Expo client application. Why: Loaded by Metro at app launch to run polyfills, start the watchdog, render the root component, and register floating UI. checked: nothing personal
- `packages/app/metro.config.cjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/native-release-version.js` — Paseo, unchanged. checked: nothing personal
- `packages/app/native-release-version.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/package.json` — The npm package manifest for the React Native mobile and web client application. Why: Declares dependencies, build scripts, and configuration for Expo, React Native, and web builds. checked: nothing personal
- `packages/app/playwright.config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/playwright.profile.config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/react-native-web.d.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/tsconfig.json` — Paseo, unchanged. checked: nothing personal
- `packages/app/vitest-environment.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/vitest.config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/vitest.setup.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/assets/audio/`

Paseo's files here: An audio clip provides acoustic feedback while agents process requests; hizuri includes it so the client interface can play subtle status cues.

- `packages/app/assets/audio/thinking-tone.wav` — Paseo, unchanged. checked: nothing personal

## `packages/app/assets/fonts/`

- `packages/app/assets/fonts/Geist-Light.ttf` — The Geist Light TrueType font file for interface typography. Why: Loaded by the mobile app UI to display light text styling across interface screens. checked: nothing personal
- `packages/app/assets/fonts/Geist-Medium.ttf` — The Geist Medium TrueType font file for interface typography. Why: Loaded by the mobile app UI to display medium-weight text styling across interface screens. checked: nothing personal
- `packages/app/assets/fonts/Geist-OFL.txt` — The open font license text covering the bundled Geist font families. Why: Provides legal distribution compliance for including the Geist and Geist Mono font files in the app bundle. checked: nothing personal
- `packages/app/assets/fonts/Geist-Regular.ttf` — The Geist Regular font file used for primary application typography. Why: Loaded by the Expo client to display standard body text and interface labels across platforms. checked: nothing personal
- `packages/app/assets/fonts/GeistMono-Light.ttf` — The Geist Mono Light font file used for monospaced UI text. Why: Loaded by the Expo client to render lightweight code and terminal text in the app interface. checked: nothing personal
- `packages/app/assets/fonts/GeistMono-Regular.ttf` — The Geist Mono Regular font file used for monospaced UI text. Why: Loaded by the Expo client to render standard code and terminal text in the app interface. checked: nothing personal

## `packages/app/assets/icons/`

Paseo's files here: Vector provider icons identify Claude and Codex throughout the client; hizuri keeps them so chat interfaces display recognizable provider badges.

- `packages/app/assets/icons/claude.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/assets/icons/codex.svg` — Paseo, unchanged. checked: nothing personal

## `packages/app/assets/images/`

Paseo's files here: Branding artwork and system notification graphics support visual styling; hizuri retains these image resources for consistent push notifications and app backgrounds.

- `packages/app/assets/images/android-icon-foreground.png` — The foreground layer icon image for the Android application launcher. Why: Referenced by app configuration to build the adaptive launcher icon on Android devices. checked: nothing personal
- `packages/app/assets/images/android-icon-monochrome.png` — The monochrome icon image for Android themed app icons. Why: Referenced by app configuration to support themed monochrome launcher icons on modern Android releases. checked: nothing personal
- `packages/app/assets/images/favicon-dark-attention.png` — The tab icon while an agent waits for the user: the brand dot mark with a green status dot. Why: the web app shows it in the browser tab, on light and dark themes alike. checked: nothing personal
- `packages/app/assets/images/favicon-dark-running.png` — The tab icon while an agent runs: the brand dot mark with a blue status dot. Why: the web app shows it in the browser tab, on light and dark themes alike. checked: nothing personal
- `packages/app/assets/images/favicon-dark.png` — The tab icon at rest: the brand dot mark. Why: the web app shows it in the browser tab, on light and dark themes alike. checked: nothing personal
- `packages/app/assets/images/favicon.png` — The standard browser favicon image for the web client. Why: Browsers load it as the default page icon in tabs and bookmarks. checked: nothing personal
- `packages/app/assets/images/icon.png` — The main application icon image for mobile and desktop builds. Why: Expo and native app builds use it as the launcher and application icon. checked: nothing personal
- `packages/app/assets/images/notification-icon.png` — Paseo, unchanged. checked: nothing personal
- `packages/app/assets/images/splash-icon.png` — The splash screen icon graphic. Why: Expo displays it on the launch splash screen during mobile application startup. checked: nothing personal

## `packages/app/assets/images/editor-apps/`

Paseo's files here: These icon images display external editor applications in the workspace UI; hizuri keeps them to show familiar editor choices when opening project files.

- `packages/app/assets/images/editor-apps/antigravity.png` — Paseo, unchanged. checked: nothing personal
- `packages/app/assets/images/editor-apps/cursor.png` — Paseo, unchanged. checked: nothing personal
- `packages/app/assets/images/editor-apps/file-explorer.png` — Paseo, unchanged. checked: nothing personal
- `packages/app/assets/images/editor-apps/finder.png` — Paseo, unchanged. checked: nothing personal
- `packages/app/assets/images/editor-apps/vscode.png` — Paseo, unchanged. checked: nothing personal
- `packages/app/assets/images/editor-apps/webstorm.png` — Paseo, unchanged. checked: nothing personal
- `packages/app/assets/images/editor-apps/zed.png` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/browser/`

Paseo's files here: These Playwright test suites verify core desktop and web workflows; hizuri keeps them to prevent regressions across composer interactions, timeline rendering, and workspace navigation.

- `packages/app/e2e/browser/acp-permission-choices.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/acp-provider-catalog.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/add-changed-file-to-chat.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/add-project-flow.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/add-project-github.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-consecutive-turns.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-message-rewind.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-message-submission.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-profile-modeless-preferences.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-profiles-picker.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-profiles-settings.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-relative-time.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-scroll-return.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-skills-settings.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-stream-smoothness.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-stream-ui.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-tab-image-stability.spec.ts` — Playwright test: images in an agent's chat keep their place and size when tabs switch, a file name with an accented letter included. Why: The app's browser e2e suite runs it. checked: nothing personal
- `packages/app/e2e/browser/agent-timeline-pagination.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-timeline-resume.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-timeline-scroll-smoothness.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/agent-timeline-sync-retry.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/appearance-font-family.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/appearance-theme-picker.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/archive-finished-subagents.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/archive-tab.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/archived-codex-agent.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/assistant-fork-menu.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/assistant-message-render-limit.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/assistant-selection-copy.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/auto-archive-after-merge.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/background-reconnect.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/bottom-sheet-reopen.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/branch-switcher.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/changes-first-edit.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/changes-pane.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/changes-shortcut-placement.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/chat-find.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/chat-outline.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/claude-workflow-project-inspection.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/claude-workflow-subagent.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/client-slash-commands.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/codex-plan-approval.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/codex-speed.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/command-center-agent-controls.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/command-center-file-search.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/command-center-grouping.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/command-center-scroll.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/command-center-workspace-actions.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/command-center-workspace-management.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/command-center-workspaces.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/commit-diff-panel.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/compact-git-actions-menu.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/compact-workspace-header.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/compact-workspace-sheet.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/composer-attachments.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/composer-autocomplete.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/composer-control-density.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/composer-diff-stat.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/composer-email-mentions.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/composer-focus.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/composer-whitespace.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/content-width.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/context-window-meter.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/creation-idempotency.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/creation-old-daemon.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/custom-model-removal.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/daemon-lifecycle.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/developer-ui.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/diff-performance-baseline.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/diff-performance.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/direct-terminal-shortcut-pane-placement.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/directory-bootstrap.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/empty-pane-keyboard.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/empty-project-persists.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/explorer-pane-placement.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/explorer-plugin-menu.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/explorer-resize-performance.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/explorer-sidebar.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/explorer-surface-upgrade.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/file-change-conflicts.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/file-editing.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/file-explorer-collapse.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/file-explorer-context-actions.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/file-transition.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/folder-links.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/fork-workspace-setup-gate.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/hoplite-model-discovery.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/host-appearance.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/host-confirmation.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/host-version-after-daemon-restart.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/import-session-flow.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/import-session.opencode.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/keyboard-chord-modifier-step.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/keyboard-shortcut-sequence.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/launcher-tab.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/markdown-relative-links.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/mermaid-fullscreen.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/mermaid-streaming.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/metadata-generation-settings.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/model-search-across-providers.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-tab-startup.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-codex-mode-preferences.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-composer-draft.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-dictation-submit.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-entry.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-host-project-preservation.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-isolation-memory.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-launch-composer.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-launch-memory.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-launch-terminal.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-meta-row-layout.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-mode-cycle-safety.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-model-memory.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-model-memory.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-model-recovery.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-navigation-guard.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace-preselect.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/new-workspace.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/offline-draft.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/open-project-scroll.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/opencode-model-switch.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/out-of-band-command.codex.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/owned-subscriptions-old-daemon.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/pair-device-relay.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/pane-find.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/paseo-tool-call-details.codex.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/permission-steer.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plan-approval.claude.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plan-card-markdown.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-button-example.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-buttons.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-file-panel-examples.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-file-panel-picker.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-file-panel-settings.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-file-panels.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-host-ui.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-hosts.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-icons.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-management.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-modal-body.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-popover.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-provider-icons.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-requirements.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-settings.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-sidebar-items.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-theme.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-timeline.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/plugin-workspace-panels.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/pr-pane.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/project-path-spaces.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/project-status-badge.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/projects-settings.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/provider-catalog-icons.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/provider-removal.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/provider-settings-refresh.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/provider-subagents.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/provider-task-list.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/question-prompt-pagination.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/relay-deployment-reconnect.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/replica-cache-performance.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/rewind-flow.claude.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/rewind-flow.codex.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/rewind-flow.opencode.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/rewind-flow.pi.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/rewind-flow.shared.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/rewind-menu.ui-contract.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/root-error-recovery.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/same-directory-workspaces.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/schedules-edit-model-hydration.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/schedules-project-target.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/schedules-relative-time.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sessions-empty.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sessions-search-hosts.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sessions-search.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/settings-host-page.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/settings-host-selection.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/settings-i18n.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/settings-navigation.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/settings-toggle-tab-regression.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-context-menu.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-help.spec.ts` — Browser tests for the sidebar help menu, diagnostics, and keyboard shortcuts. Why: Playwright runs it to verify troubleshooting tools and version display in the browser UI. checked: nothing personal
- `packages/app/e2e/browser/sidebar-host-filter-multi.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-mobile-menu-sheets.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-model-b.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-nav-settings.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-project-filter.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-project-grouping.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-project-name-whitespace.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-reorder.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-title-width.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-workspace-mark-unread.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-workspace-pin-shortcut.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-workspace-rename.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/sidebar-workspace.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/startup-loading.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/streaming-markdown.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/subagent-detach.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/subagent-origin-pane.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/terminal-activity-indicators.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/terminal-alternate-screen.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/terminal-find.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/terminal-keystroke-stress.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/terminal-performance.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/terminal-profile-icons.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/terminal-protocol-query.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/terminal-retained-tab-stream.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/terminal-split-resize.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/terminal-stuck-size.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/terminal-tab-title-loading.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/tool-call-overview-sheet.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/tool-call-shimmer.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/usage-modal.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/usage-settings.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/usage-sidebar-item.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/viewed-agent-timelines.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-agent-tab-rename.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-agent-tab-tooltip.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-agent-title-handoff.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-archive-cache.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-archive-shortcut.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-draft-thinking-preferences.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-focus-mode.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-labels.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-lifecycle.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-model-regressions.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-model-restart.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-multiplicity.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-navigation-regression.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-pane-remount.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-relative-navigation.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-scripts-menu-resize.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-setup-runtime.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-setup-streaming.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-tab-switcher-rename.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/workspace-terminal-tab-rename.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/worktree-archive-risk-warning.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/worktree-archive.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/worktree-codex-restore.real.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/worktree-restore-after-restart.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/browser/worktree-restore.spec.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/fixtures/`

Paseo's files here: These mock provider scripts simulate model catalogs and RPC streams; hizuri keeps them to run automated browser tests without external model services.

- `packages/app/e2e/fixtures/catalog-codex.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/fixtures/fake-pi-rpc.mjs` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/fixtures/claude-workflow/`

Paseo's files here: These test definitions run sample multi-phase subagent tasks; hizuri keeps them to validate workflow execution and row state transitions in end-to-end tests.

- `packages/app/e2e/fixtures/claude-workflow/inspect-project.js` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/fixtures/claude-workflow/one-child.js` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/helpers/`

Paseo's files here: This helper seeds workspaces with varying activity states; hizuri keeps it to verify project status badges reliably in browser tests.

- `packages/app/e2e/helpers/project-status-badge.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/mobile/`

Paseo's files here: This script tests clipboard image attachments over native Metro connections; hizuri keeps it to ensure mobile image pasting does not drop data.

- `packages/app/e2e/mobile/clipboard-image.mjs` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/mobile/agent-device/`

Paseo's files here: These automated device scripts drive native UI interactions; hizuri keeps them to verify mobile menus, sidebars, and terminals across mobile platforms.

- `packages/app/e2e/mobile/agent-device/file-context-menu.ios.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-compact-workspace-scripts-preconditions.md` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-compact-workspace-scripts.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-composer-fullscreen.ios.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-question-option-preview-preconditions.md` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-question-option-preview.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-sidebar-drag-release.ios.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-sidebar-scroll-retention.android.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-terminal-basic.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-terminal-basic.ios.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-terminal-hardware-keyboard.ios.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-terminal-scroll.ios.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-terminal-selection-panels.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-terminal-selection-panels.ios.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-terminal-wide-keybar.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-terminal-wide-keybar.ios.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-terminal-wide-paste.ios.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-terminal-wide-preconditions.md` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-terminal-word-selection.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-agent-tab-menu.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-agent-tab-menu.ios.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-context-meter.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-context-meter.ios.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-menu-preconditions.md` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-overlay-dismissal.android.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-overlay-dismissal.ios.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-sidebar-rename.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-sidebar-rename.ios.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-tab-scroll.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-tab-scroll.ios.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-tooltip-dismissal.android.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/agent-device/native-wide-tooltip-dismissal.ios.yaml` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/mobile/appearance-keyboard/`

Paseo's files here: This test script launches Android appearance settings under software keyboard constraints; hizuri keeps it to prevent layout breakages during theme switching.

- `packages/app/e2e/mobile/appearance-keyboard/android.mjs` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/mobile/composer-keyboard/`

Paseo's files here: These scripts inspect native view bounds when the keyboard opens; hizuri keeps them to ensure the message composer stays visible and usable.

- `packages/app/e2e/mobile/composer-keyboard/android.sh` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/composer-keyboard/assert-composer-keyboard.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/composer-keyboard/stall-hermes.mjs` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/mobile/composer-overlay/`

Paseo's files here: These verification tools inspect snapshot layouts; hizuri keeps them to ensure composer action pills do not overlap finished conversation footers.

- `packages/app/e2e/mobile/composer-overlay/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/composer-overlay/android.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/composer-overlay/assert-footer-clear.mjs` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/mobile/diff-tree/`

Paseo's files here: This guide documents reproducing row shadows in the Changes pane; hizuri keeps it to test smooth scrolling through long lists of modified files.

- `packages/app/e2e/mobile/diff-tree/README.md` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/mobile/diff-tree/evidence/`

Paseo's files here: These reference images capture visual diff tree states; hizuri keeps them to benchmark proper list rendering and contrast across themes.

- `packages/app/e2e/mobile/diff-tree/evidence/after.png` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/diff-tree/evidence/before.png` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/diff-tree/evidence/dark.png` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/diff-tree/evidence/light.png` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/mobile/modal-sheet/`

Paseo's files here: These automation files test bottom sheet gestures and nested selectors; hizuri keeps them to guarantee sheets open, scroll, and dismiss properly on tablets and phones.

- `packages/app/e2e/mobile/modal-sheet/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/modal-sheet/gestures.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/modal-sheet/model-tablet-agent.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/modal-sheet/model-tablet.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/modal-sheet/model.android.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/modal-sheet/stacked-pairing.ad` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/modal-sheet/stacked-settings.ad` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/mobile/pair-device/`

Paseo's files here: This script tests the device pairing flow over relays; hizuri keeps it to guarantee mobile clients can pair with remote daemons smoothly.

- `packages/app/e2e/mobile/pair-device/android.mjs` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/mobile/status-ring/`

Paseo's files here: This harness measures UI thread rotation updates; hizuri keeps it to ensure loading indicators animate smoothly without locking mobile thread loops.

- `packages/app/e2e/mobile/status-ring/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/status-ring/android.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/mobile/status-ring/native.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/mobile/system-bars/`

Paseo's files here: This script tests system bar color adaptations; hizuri keeps it to ensure status and navigation bars correctly match dynamic theme changes.

- `packages/app/e2e/mobile/system-bars/android.mjs` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/mobile/terminal-keyboard/`

Paseo's files here: This automation script verifies software keyboard interactions with native terminal prompts; hizuri keeps it to prevent keyboard overlap regressions during coding sessions.

- `packages/app/e2e/mobile/terminal-keyboard/android.mjs` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/support/`

Paseo's files here: These global configuration files manage test setups and toast visibility; hizuri keeps them to provide stable browser test environments without flaky overlays.

- `packages/app/e2e/support/creation-fixtures.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/developer-ui.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/fixtures.ts` — Playwright test fixture extensions providing isolated daemon and browser environments. Why: Imported by browser e2e tests to seed configuration, manage test daemons, and route connections. checked: nothing personal
- `packages/app/e2e/support/global-setup.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/metro-warmup.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/recovery-app.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/support/fixtures/`

Paseo's files here: These mock protocol servers and recorded audio files supply test inputs; hizuri keeps them to test speech uploads and model handshakes reliably.

- `packages/app/e2e/support/fixtures/catalog-acp.cjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/fixtures/recording.baseline.txt` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/fixtures/recording.wav` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/fixtures/recording.webm` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/support/fixtures/acp-chunks-plugin/`

Paseo's files here: This test plugin streams chunked protocol messages; hizuri keeps it to verify agent message handling under fragmented transport conditions.

- `packages/app/e2e/support/fixtures/acp-chunks-plugin/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/fixtures/acp-chunks-plugin/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `packages/app/e2e/support/helpers/`

Paseo's files here: These shared utilities manage workspace navigation, mock agents, and DOM assertions; hizuri keeps them to support browser integration tests cleanly.

- `packages/app/e2e/support/helpers/acp-streaming-markdown.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/add-project-flow.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/agent-bottom-anchor.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/agent-message-gate.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/agent-profiles.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/agent-skills.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/agent-stream.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/agent-timeline-gate.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/app.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/archive-tab.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/assistant-fork.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/assistant-images.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/branch-switcher.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/chat-outline.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/claude-workflow.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/codex-workspace-restore.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/command-center-agent-controls.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/command-center-file-search.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/command-center-scroll.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/command-center-workspace-actions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/command-center.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/compact-workspace-scripts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/composer-control-density.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/composer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/content-width.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/context-window.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/creation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/custom-models.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/daemon-client-loader.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/daemon-lifecycle.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/daemon-port.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/daemon-registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/daemon-update.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/daemon-websocket-gate.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/diagram.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/directory-bootstrap-scenario.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/e2e-worker.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/explorer-plugin-menu.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/file-callouts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/file-explorer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/file-read-gate.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/github-fixtures.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/host-confirmation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/hosts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/import-session.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/isolated-host-daemon.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/launcher.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/local-elixir-relay.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/markdown-file-panel-plugin.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/mock-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/model-memory.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/new-workspace-launch.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/new-workspace-navigation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/new-workspace.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/no-truncation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/node-ws-factory.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/packaged-web-daemon.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/pair-device.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/paseo-home-fork.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/permissions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/plugin-button-example.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/plugin-buttons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/plugin-fixture.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/plugin-hosts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/plugin-provider-icons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/plugin-requirements.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/plugin-settings.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/plugin-sidebar-items.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/plugin-timeline.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/plugin-translations.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/pr-pane.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/project-grouping.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/project-ownership.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/project-picker-fixture.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/project-picker-ui.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/project-settings.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/project-view-key.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/provider-subagents.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/questions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/regex.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/relay-deployment.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/rename.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/replica-cache-perf.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/replica-cache-storage.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/rewind-flow.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/route-assertions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/schedule-host.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/seed-client.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/server-id.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/settings.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/settled.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/sheet-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/sheet.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/sidebar-nav-settings.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/sidebar.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/spawn-node.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/speech-env.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/startup-dsl.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/stream-smoothness.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/stream-smoothness.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/streaming-markdown.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/subagents.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/task-list.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/terminal-dsl.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/terminal-perf.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/terminal-probes.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/timeline-delivery.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/timeline-pagination.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/timeline-resume.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/timeline-scroll-smoothness.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/usage-login.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/usage-reports.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/usage-sidebar-item.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/versioned-host-daemon.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/with-workspace.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/workspace-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/workspace-lifecycle.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/workspace-recovery.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/workspace-setup.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/workspace-tabs.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/workspace-ui.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/e2e/support/helpers/workspace.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/maestro/`

Paseo's files here: These mobile UI flows test gestures, pairing, and autocomplete; hizuri keeps them to prevent crashes and interface regressions across mobile operating systems.

- `packages/app/maestro/.gitignore` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/assert-online.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/command-autocomplete.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/image-picker-repro.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/ios-sidebar-close-regression.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/launch-clear.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/poc.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/record-workspace-create-android-focus.sh` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/relay-pairing.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/relay-then-direct.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/sidebar-drag-cancellation-regression.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/sidebar-scroll-retention.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/sidebar-swipe-bug.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/sidebar-theme-repro.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/test-sidebar-drag-cancellation-ios.sh` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/test-sidebar-theme.sh` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/test-workspace-create-android-crash.sh` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/workspace-create-android-crash.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/workspace-create-android-create-focused.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/workspace-create-android-ready-sidebar.yaml` — Paseo, unchanged. checked: nothing personal

## `packages/app/maestro/flows/`

Paseo's files here: The client app uses Maestro UI automation flows to test onboarding and workspace creation, ensuring cross-platform regression checks run reliably.

- `packages/app/maestro/flows/android-dev-client.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/flows/connect-direct-if-welcome.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/flows/dev-client.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/flows/land-in-chat.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/flows/launch.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/flows/new-workspace-open-from-sidebar.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/flows/new-workspace-select-codex-gpt54.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/flows/new-workspace-submit-and-assert-created.yaml` — Paseo, unchanged. checked: nothing personal
- `packages/app/maestro/flows/open-prepared-project-sidebar.yaml` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/hizuri-float/`

- `packages/app/modules/hizuri-float/LICENSE-react-native-android-overlay` — MIT license attribution for adapted react-native-android-overlay code. Why: Fulfills legal licensing obligations for borrowed Android overlay code. checked: nothing personal
- `packages/app/modules/hizuri-float/expo-module.config.json` — Expo autolinking configuration for the hizuri-float native module. Why: Read by Expo CLI during prebuild to register HizuriFloatModule on Android. checked: nothing personal
- `packages/app/modules/hizuri-float/package.json` — Package manifest for the hizuri-float Expo native module. Why: Defines the workspace package name and version for package managers and Expo autolinking. checked: nothing personal

## `packages/app/modules/hizuri-float/android/`

- `packages/app/modules/hizuri-float/android/build.gradle` — Gradle build script for the Android floating overlay module. Why: Configures dependencies and Android library settings when Gradle builds the hizuri-float native module. checked: nothing personal

## `packages/app/modules/hizuri-float/android/src/main/`

- `packages/app/modules/hizuri-float/android/src/main/AndroidManifest.xml` — Android manifest declaring permissions and the foreground service for the floating overlay. Why: Enables the Android system to grant alert window permissions and host the floating overlay service. checked: nothing personal

## `packages/app/modules/hizuri-float/android/src/main/java/com/hizuri/floating/`

- `packages/app/modules/hizuri-float/android/src/main/java/com/hizuri/floating/FloatBus.kt` — Event bus singleton bridging Android overlay service events to JavaScript. Why: Used by FloatService and HizuriFloatModule to forward window and screen events to the React Native app. checked: nothing personal
- `packages/app/modules/hizuri-float/android/src/main/java/com/hizuri/floating/FloatGeometry.kt` — Geometry calculations for overlay window clamping, walking, and falling animations. Why: Imported by FloatService to constrain window placement within screen boundaries and calculate animation timing. checked: nothing personal
- `packages/app/modules/hizuri-float/android/src/main/java/com/hizuri/floating/FloatService.kt` — Foreground service managing the floating Android overlay window and its React surface. Why: Controls creating, showing, hiding, and animating the floating window over other applications. checked: nothing personal
- `packages/app/modules/hizuri-float/android/src/main/java/com/hizuri/floating/FloatWindowView.kt` — Custom FrameLayout handling drag, tap, and long-press gestures for the floating overlay. Why: Instantiated by FloatService as the root overlay container to process touch events. checked: nothing personal
- `packages/app/modules/hizuri-float/android/src/main/java/com/hizuri/floating/HizuriFloatModule.kt` — Expo native module exposing floating overlay controls to JavaScript. Why: Enables the React Native client to start, stop, move, and query the overlay service. checked: nothing personal

## `packages/app/modules/hizuri-float/android/src/test/java/com/hizuri/floating/`

- `packages/app/modules/hizuri-float/android/src/test/java/com/hizuri/floating/FloatGeometryTest.kt` — Unit tests for window bounds clamping and movement physics calculations. Why: Tested by JUnit to verify overlay positioning and animation math. checked: nothing personal

## `packages/app/modules/hizuri-media-control/`

- `packages/app/modules/hizuri-media-control/expo-module.config.json` — The Expo module configuration for the native media control package. Why: Tells Expo autolinking to register the HizuriMediaControlModule on the Android platform. checked: nothing personal
- `packages/app/modules/hizuri-media-control/package.json` — The package manifest for the local hizuri media control Expo module. Why: Identifies the module package so package managers and Expo autolinking can discover it. checked: nothing personal

## `packages/app/modules/hizuri-media-control/android/`

- `packages/app/modules/hizuri-media-control/android/build.gradle` — The Gradle build script for the Android native media control module. Why: Compiles the native Android media control library into the Expo app during Android builds. checked: nothing personal

## `packages/app/modules/hizuri-media-control/android/src/main/`

- `packages/app/modules/hizuri-media-control/android/src/main/AndroidManifest.xml` — The Android manifest declaring the notification listener service for media session control. Why: Enables the app to register the service required by Android to inspect and steer media sessions. checked: nothing personal

## `packages/app/modules/hizuri-media-control/android/src/main/java/com/hizuri/media/`

- `packages/app/modules/hizuri-media-control/android/src/main/java/com/hizuri/media/HizuriMediaControlModule.kt` — The Kotlin Expo module exposing Android MediaSession playback controls to JavaScript. Why: Allows the assistant to open external media apps, search playback, and control volume or track progress. checked: nothing personal
- `packages/app/modules/hizuri-media-control/android/src/main/java/com/hizuri/media/HizuriMediaListener.kt` — The stub Android notification listener service class. Why: Satisfies Android requirements granting access to active media sessions across the system. checked: nothing personal

## `packages/app/modules/paseo-diff-prototype/`

Paseo's files here: The client app provides configuration for an experimental native Android diff module, enabling fast custom code diff rendering.

- `packages/app/modules/paseo-diff-prototype/.gitignore` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-diff-prototype/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-diff-prototype/expo-module.config.json` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-diff-prototype/package.json` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-diff-prototype/android/`

- `packages/app/modules/paseo-diff-prototype/android/CMakeLists.txt` — The CMake configuration file compiling C++ diff layout code with Skia libraries. Why: Builds the native shared library required by the diff prototype component on Android. checked: nothing personal
- `packages/app/modules/paseo-diff-prototype/android/build.gradle` — The Gradle build file configuring C++ Skia libraries for the diff prototype module. Why: Resolves Skia package headers and prebuilt static binaries during native Android compilation. checked: nothing personal

## `packages/app/modules/paseo-diff-prototype/android/src/main/`

Paseo's files here: The client app declares the Android library manifest for the native diff prototype, allowing Gradle to package the component.

- `packages/app/modules/paseo-diff-prototype/android/src/main/AndroidManifest.xml` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-diff-prototype/android/src/main/java/sh/paseo/diffprototype/`

Paseo's files here: The client app provides Kotlin Expo bindings to native C++ diff layout functions, letting UI screens measure and render code diffs.

- `packages/app/modules/paseo-diff-prototype/android/src/main/java/sh/paseo/diffprototype/PaseoDiffPrototypeModule.kt` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-diff-prototype/cpp/`

Paseo's files here: The client app implements C++ text layout and Unicode grapheme handling via JNI, providing fast text calculations for code comparisons.

- `packages/app/modules/paseo-diff-prototype/cpp/generate-graphemes.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-diff-prototype/cpp/jni.cpp` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-diff-prototype/cpp/layout.cpp` — The C++ text layout and grapheme measurement implementation using Skia and ICU. Why: Measures and shapes text in code diff views with a cached SkUnicode instance. checked: nothing personal
- `packages/app/modules/paseo-diff-prototype/cpp/layout.h` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-hardware-keyboard/`

Paseo's files here: The client app configures the iOS native hardware keyboard module, enabling physical keyboard shortcut support on iPad and iPhone devices.

- `packages/app/modules/paseo-hardware-keyboard/expo-module.config.json` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-hardware-keyboard/package.json` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-hardware-keyboard/ios/`

Paseo's files here: The client app implements Swift delegate handlers for hardware keyboard events on iOS, allowing key combinations to submit prompts.

- `packages/app/modules/paseo-hardware-keyboard/ios/PaseoHardwareKeyboard.podspec` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-hardware-keyboard/ios/PaseoHardwareKeyboardModule.swift` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-native-trace/`

Paseo's files here: The client app configures the native trace module package, enabling background performance logging and diagnostic capture on Android devices.

- `packages/app/modules/paseo-native-trace/expo-module.config.json` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-native-trace/package.json` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-native-trace/android/`

Paseo's files here: The client app supplies the Android Gradle build setup for native tracing, ensuring logging dependencies compile into mobile builds.

- `packages/app/modules/paseo-native-trace/android/build.gradle` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-native-trace/android/src/main/`

Paseo's files here: The client app provides the Android manifest for the native trace module, satisfying Android build requirements for tracing libraries.

- `packages/app/modules/paseo-native-trace/android/src/main/AndroidManifest.xml` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-native-trace/android/src/main/java/sh/paseo/trace/`

Paseo's files here: The client app records diagnostic traces and heartbeats on background threads, helping developers troubleshoot hangs and crashes on Android devices.

- `packages/app/modules/paseo-native-trace/android/src/main/java/sh/paseo/trace/DiagnosticRecorder.kt` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-native-trace/android/src/main/java/sh/paseo/trace/DownloadsLogStorage.kt` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-native-trace/android/src/main/java/sh/paseo/trace/HeartbeatWatchdog.kt` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-native-trace/android/src/main/java/sh/paseo/trace/PaseoNativeTraceModule.kt` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-native-trace/android/src/main/java/sh/paseo/trace/RotatingLog.kt` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-native-trace/android/src/test/java/sh/paseo/trace/`

Paseo's files here: The client app tests watchdog timing and rotating log storage, ensuring diagnostic logs rotate safely without losing crash details.

- `packages/app/modules/paseo-native-trace/android/src/test/java/sh/paseo/trace/HeartbeatWatchdogTest.kt` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-native-trace/android/src/test/java/sh/paseo/trace/RotatingLogTest.kt` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-scroll/`

Paseo's files here: The client app configures custom Android scroll handling, ensuring native text selection inside scroll views works smoothly without gesture conflicts.

- `packages/app/modules/paseo-scroll/.gitignore` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-scroll/app.plugin.js` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-scroll/app.plugin.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-scroll/expo-module.config.json` — Paseo, unchanged. checked: nothing personal
- `packages/app/modules/paseo-scroll/package.json` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-scroll/android/`

Paseo's files here: The client app defines the Android library build configuration for custom scroll management within React Native.

- `packages/app/modules/paseo-scroll/android/build.gradle` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-scroll/android/src/androidTest/java/sh/paseo/scroll/`

Paseo's files here: The client app tests Android text selection inside scroll containers, verifying touch events do not break code selection.

- `packages/app/modules/paseo-scroll/android/src/androidTest/java/sh/paseo/scroll/ScrollSelectionTest.kt` — Paseo, unchanged. checked: nothing personal

## `packages/app/modules/paseo-scroll/android/src/main/java/sh/paseo/scroll/`

Paseo's files here: The client app implements custom Android scroll view package overrides, keeping text selection functional across chat and diff views.

- `packages/app/modules/paseo-scroll/android/src/main/java/sh/paseo/scroll/PaseoScrollPackage.kt` — Paseo, unchanged. checked: nothing personal

## `packages/app/perf/`

Paseo's files here: The client app runs Playwright tests measuring diff pane rendering speed, preventing UI lag when opening large workspace changes.

- `packages/app/perf/side-pane-performance.spec.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/perf/helpers/`

Paseo's files here: The client app provides helper utilities to profile side pane rendering and memory usage during automated performance testing.

- `packages/app/perf/helpers/side-pane-performance.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/plugins/`

Paseo's files here: The client app uses Expo configuration plugins to customize Android storage limits, camera requirements, and paste handling during builds.

- `packages/app/plugins/with-android-async-storage-size.js` — Paseo, unchanged. checked: nothing personal
- `packages/app/plugins/with-android-optional-camera.js` — Paseo, unchanged. checked: nothing personal
- `packages/app/plugins/with-android-pip-config-changes.js` — The Expo config plugin adjusting Android activity configuration change flags for picture-in-picture mode. Why: Prevents Android from destroying and restarting the main activity when entering picture-in-picture mode. checked: nothing personal
- `packages/app/plugins/with-android-profileable.js` — Paseo, unchanged. checked: nothing personal
- `packages/app/plugins/with-fdroid-autolinking.js` — The Expo config plugin configuring Gradle autolinking and ABI suffixes for F-Droid builds. Why: Ensures local native modules link properly and dependencies match F-Droid build requirements. checked: nothing personal
- `packages/app/plugins/with-paste-input.js` — Paseo, unchanged. checked: nothing personal
- `packages/app/plugins/with-paste-input.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/public/`

Paseo's files here: The client app defines web crawler rules that disallow indexing, keeping private web client interfaces unindexed by search engines.

- `packages/app/public/apple-touch-icon.png` — The home screen icon for Apple mobile web app shortcuts. Why: Web browsers request this icon when users save the client app to their home screens. checked: nothing personal
- `packages/app/public/index.html` — The base HTML page for hosting the web build of the app. Why: Web browsers and web bundlers load this page to mount the React Native web application. checked: nothing personal
- `packages/app/public/manifest.json` — The progressive web app manifest defining app metadata and icons. Why: Browsers use this manifest when installing or launching the client as a standalone web app. checked: nothing personal
- `packages/app/public/pwa-icon-192.png` — A 192-pixel square app icon for progressive web app installations. Why: Browsers display this icon on home screens and application switchers for web app installs. checked: nothing personal
- `packages/app/public/pwa-icon-512.png` — A 512-pixel square app icon for progressive web app splash screens and installations. Why: High-resolution mobile screens and app manifests display this icon during web app installation and launch. checked: nothing personal
- `packages/app/public/robots.txt` — Paseo, unchanged. checked: nothing personal

## `packages/app/scripts/`

Paseo's files here: The client app uses build and profiling scripts to bundle web terminal views, generate placeholders, and benchmark interface interactions.

- `packages/app/scripts/build-terminal-webview-html.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/scripts/generate-markdown-image-placeholder.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/scripts/lower-thinking-tone.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/scripts/profile-composer-typing.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/scripts/profile-explorer-toggle.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/scripts/profile-workspace-switching.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/scripts/profile-workspace-tabs.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/scripts/reset-project.js` — Paseo, unchanged. checked: nothing personal
- `packages/app/scripts/verify-android-ndk.gradle` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/`

Paseo's files here: The client app tests bundle readiness and Android storage settings, verifying test server availability and build configuration accuracy.

- `packages/app/src/android-async-storage-config.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/e2e-metro-readiness.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/root-app.tsx` — The root application component wrapping the app with query, layout, error boundary, and routing providers. Why: Acts as the top-level React entry point loaded by Expo router. checked: nothing personal

## `packages/app/src/add-project-flow/`

Paseo's files here: The client app manages the multi-step flow for adding local directories or GitHub repositories, guiding the user through workspace setup.

- `packages/app/src/add-project-flow/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/add-project-flow/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/add-project-flow/options.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/agent-controls/`

Paseo's files here: The client app renders icons and formats mode labels for agent permissions, giving the user clear controls over model behavior.

- `packages/app/src/agent-controls/icons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-controls/labels.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-controls/labels.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-controls/policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-controls/policy.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/agent-pages/`

- `packages/app/src/agent-pages/agent-page-tabs.tsx` — The tab bar and hook for switching agent pages on wider screens. Why: AgentPages imports it to render page navigation tabs when displayed on desktop or tablet viewports. checked: nothing personal
- `packages/app/src/agent-pages/agent-pages.tsx` — The swipeable multi-page container hosting face, chat, and show pages side by side. Why: CompactAgentPages imports it to render phone-sized horizontal paging between agent viewports. checked: nothing personal
- `packages/app/src/agent-pages/chat-page-menu.tsx` — The top-level menu button on the chat page providing voice session termination controls. Why: Chat interfaces render this control so the user can quickly end an active voice session. checked: nothing personal
- `packages/app/src/agent-pages/compact-agent-pages.tsx` — The compact layout manager coordinating the face, chat, and stage pages on mobile devices. Why: The mobile agent screen imports it to assemble and switch between agent views. checked: nothing personal
- `packages/app/src/agent-pages/model.test.ts` — Tests for agent page navigation helpers, gesture evaluation, and page call extractors. Why: Vitest runs it to verify page transitions, gestures, and tool call handling in agent-pages/model.ts. checked: nothing personal
- `packages/app/src/agent-pages/model.ts` — Page types, index calculations, swipe gesture logic, and tool call extractors for agent pages. Why: AgentPages and its hooks import these models to track page indices and handle navigation gestures. checked: nothing personal
- `packages/app/src/agent-pages/use-agent-page-commands.ts` — A React hook listening for agent show_page commands and changing the current page. Why: CompactAgentPages imports it to let the assistant switch pages through tool call events. checked: nothing personal
- `packages/app/src/agent-pages/use-wheel-paging.ts` — A no-op hook stub for trackpad wheel paging on native mobile platforms. Why: Provides React Native platforms with the hook interface implemented for web in use-wheel-paging.web.ts. checked: nothing personal
- `packages/app/src/agent-pages/use-wheel-paging.web.ts` — A hook listening for horizontal trackpad wheel gestures to switch pages on web. Why: Imported by web agent page components to enable sideways paging on laptops without touch screens. checked: nothing personal
- `packages/app/src/agent-pages/wheel-paging.test.ts` — Tests for the wheel paging state accumulator and gesture momentum handling. Why: Runs under vitest to verify sideways wheel events properly trigger single page steps. checked: nothing personal
- `packages/app/src/agent-pages/wheel-paging.ts` — Pure state machine calculating page transitions and debounce locks from wheel events. Why: Used by use-wheel-paging.web.ts to convert raw horizontal wheel deltas into discrete page steps. checked: nothing personal

## `packages/app/src/agent-profiles/`

Paseo's files here: The client app provides interfaces to create and edit agent profiles, letting the user customize model configurations and prompts.

- `packages/app/src/agent-profiles/agent-profile-editor.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/agent-profiles/internal/`

Paseo's files here: The client app builds profile forms, capability checks, and icons; hizuri keeps them to let the user customize and pick agent configurations across platforms.

- `packages/app/src/agent-profiles/internal/agent-profile-glyph.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/capabilities.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/capabilities.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/materialize-profile.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/materialize-profile.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/profile-appearance.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/profile-form-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/profile-form-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/profile-id.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/profile-summary.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/use-agent-profile-picker.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/use-agent-profiles.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/use-profile-form-inputs.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/internal/use-profile-form-model.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/agent-profiles/migration/`

Paseo's files here: The client app migrates legacy favorite model preferences into formal agent profiles; hizuri keeps them to preserve user configurations when upgrading older stored settings.

- `packages/app/src/agent-profiles/migration/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/migration/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/agent-profiles/settings/`

Paseo's files here: The client app renders settings forms and edit sheets for agent profiles; hizuri keeps them so the user can configure models, appearances, and parameters cleanly.

- `packages/app/src/agent-profiles/settings/agent-profile-appearance-field.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/settings/agent-profile-edit-modal.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/settings/agent-profile-row.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-profiles/settings/agent-profiles-section.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/agent-skills/`

Paseo's files here: The client app handles skill selection sheets and legacy skill migrations; hizuri keeps them so the user can pick enabled skills and transfer desktop settings.

- `packages/app/src/agent-skills/index.tsx` — A settings section component for managing and reconciling host agent skills. Why: Rendered in host settings to allow users to select, install, update, and remove skills. checked: nothing personal
- `packages/app/src/agent-skills/legacy-migration.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-skills/legacy-migration.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-skills/selection-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-skills/use-agent-skills.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-skills/use-agent-skills.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/agent-stream/`

Paseo's files here: The client app controls stream virtualization, message pagination, and bottom anchoring; hizuri keeps them to render real-time assistant responses smoothly without layout jumps.

- `packages/app/src/agent-stream/bottom-anchor-controller.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/bottom-anchor-controller.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/bottom-overlay-inset.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/bottom-overlay-inset.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/footer-spacing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/history-row-revision.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/history-start-pagination.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/history-start-pagination.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/history-start-settle-scheduler.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/history-start-settle-scheduler.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/history-window.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/model-retention.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/native-scroll-animation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/native-scroll-animation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/presentation.test.ts` — Tests for stream timeline rendering, plugin transformations, and spoken input envelope parsing. Why: Runs under vitest to ensure voice input wrappers and agent notes format correctly for chat. checked: nothing personal
- `packages/app/src/agent-stream/presentation.ts` — Functions stripping daemon voice envelopes and agent notes from incoming user messages. Why: Called during stream rendering to present spoken transcripts cleanly while preserving raw agent instructions. checked: nothing personal
- `packages/app/src/agent-stream/prompt-jump-settle.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/prompt-jump-settle.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/reading-anchor.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/reading-anchor.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/render-strategy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/spacing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/spacing.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/strategy-native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/strategy-resolver.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/strategy-web.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/strategy-web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/strategy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/stream-tick.bench.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/text-reveal.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/text-reveal.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/timeline-tail-navigation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/timeline-tail-navigation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/top-overlay.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/turn-boundary.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/turn-boundary.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/turn-footer.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/turn-membership.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/turn-membership.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/use-scroll-to-message.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/use-stream-history-window.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/use-stream-history-window.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/view.tsx` — The main conversation timeline view rendering stream messages, tool calls, and guardian notes. Why: Central chat view rendered on the agent screen to display live and historical conversation items. checked: nothing personal
- `packages/app/src/agent-stream/web-virtualization.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/web-virtualization.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/agent-stream/chat-find/`

Paseo's files here: The client app provides in-chat text search and highlight navigation; hizuri keeps them so the user can quickly search and locate terms in message streams.

- `packages/app/src/agent-stream/chat-find/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/chat-find/index.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/chat-find/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/chat-find/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/chat-find/ranges.browser.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/chat-find/ranges.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/chat-find/types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/chat-find/viewport.browser.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/chat-find/viewport.web.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/agent-stream/chat-outline/`

Paseo's files here: The client app provides an outline rail and hover tracking for long chats; hizuri keeps them so the user can quickly jump between sections in streams.

- `packages/app/src/agent-stream/chat-outline/hover-intent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/chat-outline/hover-intent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/chat-outline/model.test.ts` — Tests for chat outline prompt magnification, index epoch matching, and tick sampling. Why: Runs under vitest to verify outline timeline math, sampling capacity, and active sequence tracking. checked: nothing personal
- `packages/app/src/agent-stream/chat-outline/model.ts` — Data structures and sampling utilities for chat outline ticks and active prompt tracking. Why: Imported by the chat outline rail and hook to downsample timeline prompts onto vertical rails. checked: nothing personal
- `packages/app/src/agent-stream/chat-outline/rail.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/chat-outline/rail.web.tsx` — A web timeline rail rendering magnified ticks representing prompts across conversation history. Why: Displays jump-to-prompt ticks alongside long chats, sampling items based on measured layout height. checked: nothing personal
- `packages/app/src/agent-stream/chat-outline/use-chat-outline.test.tsx` — Tests for the chat outline prompt indexing hook and viewport scrolling interactions. Why: Runs under vitest to verify prompt fetching, caching, jump callbacks, and timeline synchronization. checked: nothing personal
- `packages/app/src/agent-stream/chat-outline/use-chat-outline.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/agent-stream/scroll-keyboard-dismiss/`

Paseo's files here: The client app detects scroll gestures to dismiss the software keyboard; hizuri keeps them to give the user natural touch scrolling in chat timelines on mobile.

- `packages/app/src/agent-stream/scroll-keyboard-dismiss/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/scroll-keyboard-dismiss/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/agent-stream/scroll-keyboard-dismiss/use-scroll-keyboard-dismiss.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/app/`

Paseo's files here: The client app defines top-level Expo navigation routes for sessions, projects, and pairing; hizuri keeps them to guide the user into workspaces and connection flows.

- `packages/app/src/app/_layout.tsx` — The root application layout component configuring global providers, diagnostics, updates, and navigation. Why: Loaded by Expo Router as the top-level wrapper for all app screens and background sync services. checked: nothing personal
- `packages/app/src/app/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/app/new.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/app/open-project.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/app/pair-scan.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/app/schedules.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/app/sessions.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/app/welcome.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/app/h/[serverId]/`

Paseo's files here: The client app routes host-specific navigation stacks for sessions and settings; hizuri keeps them so the user connects seamlessly to designated daemon server environments.

- `packages/app/src/app/h/[serverId]/_layout.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/app/h/[serverId]/index.tsx` — The host entry route redirecting either to an active voice agent or to the remembered workspace. Why: Loaded by Expo Router when opening a host; redirects the user to the correct initial screen. checked: nothing personal
- `packages/app/src/app/h/[serverId]/open-project.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/app/h/[serverId]/sessions.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/app/h/[serverId]/settings.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/app/h/[serverId]/agent/`

Paseo's files here: The client app routes directly to a specific agent conversation; hizuri keeps them so the user can open active agent sessions across connected daemon hosts.

- `packages/app/src/app/h/[serverId]/agent/[agentId].tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/app/h/[serverId]/plugin/[pluginId]/`

Paseo's files here: The client app handles backwards-compatible navigation redirects for legacy plugin surfaces; hizuri keeps them to preserve existing links into plugin views without breaking transitions.

- `packages/app/src/app/h/[serverId]/plugin/[pluginId]/[surfaceId].tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/app/h/[serverId]/plugin/[pluginId]/[contributionKind]/`

Paseo's files here: The client app routes contribution screens rendered by loaded plugins; hizuri keeps them so the user can interact directly with custom host plugin UI surfaces.

- `packages/app/src/app/h/[serverId]/plugin/[pluginId]/[contributionKind]/[contributionId].tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/app/h/[serverId]/workspace/[workspaceId]/`

Paseo's files here: The client app routes the main workspace interface for a host session; hizuri keeps them so the user can run agents and inspect project tabs.

- `packages/app/src/app/h/[serverId]/workspace/[workspaceId]/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/app/settings/`

Paseo's files here: The client app routes general settings views and categorized preference panels; hizuri keeps them so the user can manage global application options across form factors.

- `packages/app/src/app/settings/[section].tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/app/settings/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/app/settings/hosts/[serverId]/`

Paseo's files here: The client app routes host-level configuration screens for connections and daemons; hizuri keeps them so the user can adjust host-specific runtime preferences and network setups.

- `packages/app/src/app/settings/hosts/[serverId]/[hostSection].tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/app/settings/hosts/[serverId]/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/app/settings/hosts/[serverId]/plugins/[pluginId]/`

Paseo's files here: The client app routes host plugin configuration screens; hizuri keeps them so the user can view and edit custom settings for individual daemon plugins.

- `packages/app/src/app/settings/hosts/[serverId]/plugins/[pluginId]/[screenId].tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/app/settings/hosts/[serverId]/projects/`

Paseo's files here: The client app routes host project settings and project detail pages; hizuri keeps them so the user can manage project directories and permissions per host.

- `packages/app/src/app/settings/hosts/[serverId]/projects/[projectId].tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/app/settings/hosts/[serverId]/projects/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/appearance/`

Paseo's files here: The client app manages dynamic font styles and system bars; hizuri keeps them to ensure clear UI fonts and coherent system bar styling across platforms.

- `packages/app/src/appearance/apply-root-font.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/appearance/apply-root-font.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/appearance/apply.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/appearance/apply.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/appearance/provider.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/appearance/system-bars.android.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/appearance/system-bars.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/assets/`

Paseo's files here: The client app bundles inline SVG icons for external agent providers; hizuri keeps them to show correct provider branding across client interface screens.

- `packages/app/src/assets/acp-provider-icons.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/assets/acp-provider-icons/`

Paseo's files here: The client app stores standalone SVG icon files for agent providers; hizuri keeps them to render clear provider brand logos across client platforms.

- `packages/app/src/assets/acp-provider-icons/agoragentic-acp.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/amp-acp.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/auggie.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/autohand.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/claude-acp.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/cline.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/codebuddy-code.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/codewhale.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/codex-acp.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/cortex-code.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/corust-agent.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/crow-cli.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/cursor.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/deepagents.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/devin.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/dimcode.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/dirac.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/factory-droid.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/fast-agent.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/gemini.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/github-copilot-cli.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/gjc.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/glm-acp-agent.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/goose.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/grok.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/hermes.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/hoplite.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/junie.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/kilo.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/kimi.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/kiro.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/minimax-code.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/minion-code.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/mistral-vibe.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/nova.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/opencode.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/pi-acp.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/poolside.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/qoder.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/qwen-code.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/sigit.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/stakpak.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/traecli.svg` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assets/acp-provider-icons/vtcode.svg` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/assistant-file-links/`

Paseo's files here: The client app parses and opens file paths mentioned in chat; hizuri keeps them so the user can jump directly to code files referenced by agents.

- `packages/app/src/assistant-file-links/extensions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-file-links/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-file-links/parse.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-file-links/parse.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-file-links/path-open.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-file-links/path-open.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-file-links/provider.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-file-links/resolver.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-file-links/resolver.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-file-links/tooltip-path.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-file-links/tooltip-path.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-file-links/use-file-link.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-file-links/use-file-link.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/assistant-image/`

Paseo's files here: The client app caches and fetches assistant-generated images with garbage collection; hizuri keeps them so the user sees preview images reliably without leaking client storage.

- `packages/app/src/assistant-image/acquisition-cache.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-image/acquisition-cache.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-image/file-acquisition.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-image/file-acquisition.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/assistant-selection-copy/`

Paseo's files here: The client app cleans and formats copied chat text into valid markdown; hizuri keeps them so the user pastes clean formatted text outside the app.

- `packages/app/src/assistant-selection-copy/content.browser.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-selection-copy/content.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-selection-copy/markup.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-selection-copy/surface.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/assistant-selection-copy/surface.web.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/attachments/`

Paseo's files here: The client app manages file uploads, drag-and-drop actions, and preview pills; hizuri keeps them so the user can supply local context files to agents.

- `packages/app/src/attachments/attachment-file-system.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/attachment-pill-content.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/attachment-pill-content.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/file-types.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/file-types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/gc-retention.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/gc-retention.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/local-file-attachment-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/local-file-attachment-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/selected-file.ts` — File attachment abstractions and desktop file-reading helpers supporting chunked stream sources. Why: Imported by attachment pickers and upload flows to read or stream selected files without excessive memory use. checked: nothing personal
- `packages/app/src/attachments/service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/test-attachment-file-system.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/use-attachment-preview-url.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/use-workspace-file-drag-source.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/use-workspace-file-drag-source.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/utils.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/workspace-attachment-utils.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/workspace-attachment-utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/workspace-attachments-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/workspace-attachments-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/workspace-file-drag-source.types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/workspace-file-drag.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/workspace-file-drag.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/workspace-file.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/workspace-file.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/attachments/native/`

Paseo's files here: The client app uses this store to save and resolve file attachments on mobile devices, keeping attachment handling intact when running natively.

- `packages/app/src/attachments/native/native-file-attachment-store.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/attachments/web/`

Paseo's files here: The client app uses this store to persist file attachments inside browser IndexedDB, letting web users upload and preview attachments across sessions.

- `packages/app/src/attachments/web/indexeddb-attachment-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/attachments/web/indexeddb-attachment-store.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/audio/`

Paseo's files here: The client app uses these playback helpers to load and play audio files across platforms, supporting audio previews and notifications alongside hizuri voice features.

- `packages/app/src/audio/audio-engine-types.test.ts` — Tests for the output route classifier parsing audio device strings into speaker or headphones. Why: Run by Vitest to ensure audio device output route descriptions parse correctly. checked: nothing personal
- `packages/app/src/audio/audio-engine-types.ts` — Types and utility functions for audio engine callbacks, playback options, and output route detection. Why: Imported by native and web audio engines to share audio interfaces and route definitions. checked: nothing personal
- `packages/app/src/audio/audio-engine.d.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/audio/audio-engine.native.ts` — The native mobile audio engine managing microphone capture, route changes, output timing, and PCM playback. Why: Imported by mobile audio providers to run two-way voice streaming and playback through native device audio. checked: nothing personal
- `packages/app/src/audio/audio-engine.web.ts` — The browser audio engine managing microphone input, unlock triggers, and PCM audio playback with face synchronization. Why: Imported by web runtime audio providers to stream and play voice audio in the browser. checked: nothing personal
- `packages/app/src/audio/file-playback.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/audio/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/audio/play-audio.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/audio/play-audio.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/audio/playback.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/audio/playback.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/audio/voice-output.ts` — An event bus broadcasting raw PCM playback chunks and stop events to visual face listeners. Why: Imported by audio engines and face animation components to synchronize mouth movements with played sound. checked: nothing personal

## `packages/app/src/audio/pcm/`

- `packages/app/src/audio/pcm/index.test.ts` — Tests for PCM audio playback prefeed timing, queue draining, and voice output event publishing. Why: Run by Vitest to verify queue timing, drainage, and output events in the PCM player. checked: nothing personal
- `packages/app/src/audio/pcm/index.ts` — PCM audio resampling, queue timing, and playback management helpers feeding chunks to audio outputs. Why: Imported by audio engines to resample and smoothly schedule PCM playback without stuttering. checked: nothing personal

## `packages/app/src/changelog/`

Paseo's files here: The client app displays repository release notes directly in a modal sheet, allowing users to view recent updates without leaving the application.

- `packages/app/src/changelog/changelog-host.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/changelog/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/changelog/open-changelog.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/changelog/internal/`

Paseo's files here: The client app uses these parsers and components to fetch, cache, and render markdown release notes inside the changelog sheet.

- `packages/app/src/changelog/internal/changelog-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/changelog/internal/changelog-source.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/changelog/internal/changelog-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/changelog/internal/parse-changelog.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/changelog/internal/parse-changelog.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/changelog/internal/use-revealed-releases.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/client-slash-commands/`

Paseo's files here: The client app registers and executes local slash commands in the composer, letting users archive agents or start fresh drafts quickly.

- `packages/app/src/client-slash-commands/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/client-slash-commands/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/command-center/`

Paseo's files here: The client app uses this command palette to search workspaces, switch agent modes, and trigger quick actions from a central keyboard-driven interface.

- `packages/app/src/command-center/agent-control-contributions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/agent-control-contributions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/agent-control-registration.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/command-center.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/contributions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/list-metrics.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/provider.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/registry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/results.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/results.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/root-contributions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/root-contributions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/root-registration.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/workspace-contributions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/workspace-contributions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/workspace-file-search-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/workspace-file-search.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/workspace-file-search.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/workspace-registration.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/workspace-search.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/workspace-search.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/workspace-shortcuts.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/command-center/workspace-shortcuts.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/`

Paseo's files here: The client app relies on these core UI views, dialogs, and controls to render the primary coding workspace, agent lists, and diffs.

- `packages/app/src/components/adaptive-modal-sheet-layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/adaptive-modal-sheet-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/adaptive-modal-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/adaptive-text-input.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/adaptive-text-input.web.browser.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/add-host-method-modal.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/add-host-modal.tsx` — A modal dialog for entering connection details or pairing links to connect to a daemon host. Why: Rendered when a user adds or pairs a new host daemon connection. checked: nothing personal
- `packages/app/src/components/add-project-flow-host.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/add-project-flow.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/add-remote-ssh-host-modal.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/agent-list.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/agent-status-dot.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/app-diagnostic-host.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/app-diagnostic-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/appearance-style-boundary.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/appearance-style-boundary.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/archived-agent-callout.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/assistant-fork-menu.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/assistant-message-render-limit.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/assistant-message-render-limit.shared.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/assistant-message-render-limit.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/assistant-message-render-limit.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/assistant-message-render-limit.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/assistant-turn-footer-label.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/assistant-turn-footer-label.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/attachment-lightbox.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/attachment-lightbox.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/attachment-pill.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/branch-switcher.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/code-insets.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/combined-model-selector.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/connection-failure-copy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/connection-failure-copy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/context-window-details.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/context-window-meter.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/context-window-meter.utils.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/context-window-meter.utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/context-window-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/desktop-sidebar-layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/desktop-sidebar-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/dictation-controls.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/diff-stat.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/diff-viewer.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/download-toast.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/draggable-list.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/draggable-list.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/draggable-list.types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/draggable-list.web.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/draggable-list.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/end-voice-session-menu-item.tsx` — A dropdown menu item and hook providing a confirmation dialog to terminate an active voice session. Why: Rendered in header and chat menus to allow the user to cleanly stop real-time voice sessions. checked: nothing personal
- `packages/app/src/components/explorer-sidebar-layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/explorer-sidebar-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/file-actions-menu.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/file-change-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/file-explorer-pane.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/file-icon-svg.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/file-icon-svg.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/file-pane-enabled.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/file-pane-enabled.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/guardian-note.test.tsx` — Tests for the guardian note parser and banner component. Why: Runs in vitest to verify guardian notes parse valid payload structures and render their labels correctly. checked: nothing personal
- `packages/app/src/components/guardian-note.tsx` — A banner component displaying rule violations and fixes detected by the guardian agent. Why: Imported by chat timeline renderers to show guardian audit notes and suggested fixes. checked: nothing personal
- `packages/app/src/components/highlighted-code-block.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/highlighted-content.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/host-route-bootstrap-boundary.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/host-status-dot.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/import-session-sheet-view-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/import-session-sheet-view-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/import-session-sheet.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/import-session-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/keyboard-shortcuts-dialog.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/left-sidebar.tsx` — The primary collapsible navigation sidebar supporting simple mode and workspace project listings. Why: Imported by app layouts to navigate workspaces, projects, hosts, and settings. checked: nothing personal
- `packages/app/src/components/material-file-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/material-file-icons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/message-compaction-label.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/message-compaction-label.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/message.tsx` — Chat message bubbles rendering user turns, spoken indicators, tool calls, and assistant responses. Why: Imported by the conversation stream view to display chat history and live speech arrivals. checked: nothing personal
- `packages/app/src/components/model-browser-view.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/model-browser-view.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/model-browser.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/pair-link-credentials.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/pair-link-credentials.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/pair-link-modal.tsx` — A modal dialog for entering daemon pairing URLs and passwords. Why: Imported by host management screens to pair the client with a remote or local daemon. checked: nothing personal
- `packages/app/src/components/plan-card.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/project-edit-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/project-icon-image.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/project-icon-image.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/project-icon-view.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/project-picker-options.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/project-picker-options.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/provider-catalog-list.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/provider-catalog-search.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/provider-catalog-search.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/provider-diagnostic-models.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/provider-diagnostic-models.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/provider-diagnostic-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/provider-icon-name.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/provider-icon-name.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/provider-icons.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/provider-icons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/provider-settings-host.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/question-form-card-core.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/question-form-card-core.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/question-form-card.browser.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/question-form-card.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/quitting-overlay.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/realtime-voice-overlay.tsx` — A phone-call style bottom bar with mute, image attachment, and typing switch controls. Why: Rendered during active voice sessions to manage mute states and switch back to text. checked: nothing personal
- `packages/app/src/components/rename-modal.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/rename-modal.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/resize-handle-drag.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/resize-handle-drag.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/resize-handle-sizes.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/resize-handle-sizes.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/resize-handle.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/retained-panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/root-error-boundary.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/root-error-boundary.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/root-error-details.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/root-error-details.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/settings-textarea.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar-agent-list-skeleton.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar-callout-slot.d.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar-callout-slot.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar-callout-slot.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar-callout-slot.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar-callout.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar-callout.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar-resize-handle-layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar-resize-handle-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar-resize-handle.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar-workspace-list.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar-workspace-list.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sortable-inline-list.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sortable-inline-list.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sortable-inline-list.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/split-container-focus.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/split-container-focus.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/split-container-pane-focus.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/split-container-pane-focus.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/split-container-tab-drop-preview.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/split-container-tab-drop-preview.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/split-container.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/split-drop-zone.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/svg-root-transform.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/synced-loader-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/synced-loader-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/synced-loader.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/task-list-row.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/task-list-row.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-copy-paste-actions.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-emulator-contract.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-emulator-native-grid.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-emulator-webview.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-emulator.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-emulator.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-pane-focus-claim.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-pane-focus-claim.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-pane.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-profile-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-resize-debouncer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-resize-debouncer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-webview-message-routing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-webview-message-routing.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-webview-readiness.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/terminal-webview-readiness.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/toast-host.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/tool-call-details.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/tool-call-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/tree-primitives.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/tree-rail-layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/tree-rail-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/tree-rail-toggle.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/tree-rail.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/voice-live-words.tsx` — A floating transcript bubble displaying live speech-to-text words before they land in the chat stream. Why: Rendered in the chat UI during voice sessions to provide real-time transcription feedback to the user. checked: nothing personal
- `packages/app/src/components/volume-meter.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/welcome-screen.tsx` — The onboarding welcome screen component displaying host connection options and the application logo. Why: Mounted during onboarding to allow users to scan QR codes, paste pairing links, or connect to hosts. checked: nothing personal
- `packages/app/src/components/workspace-hover-card.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/workspace-pin-shortcut-handler.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/workspace-rename-host.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/workspace-rename-modal.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/workspace-setup-dialog.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/workspace-shortcut-targets-subscriber.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/workspace-shortcut-targets-subscriber.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/workspace-tab-drag-context.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/workspace-tab-drag-policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/workspace-tab-drag-scope.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/workspace-tab-drag-scope.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/worktree-setup-callout-policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/worktree-setup-callout-policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/worktree-setup-callout-source.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/desktop/`

Paseo's files here: The client app uses these controls to render window minimize, maximize, and custom titlebar drag regions when running inside desktop Electron wrappers.

- `packages/app/src/components/desktop/titlebar-drag-region.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/desktop/window-controls.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/drag-reorder/`

Paseo's files here: The client app manages pointer gestures and state transitions for dragging items, letting users reorder list elements smoothly across platforms.

- `packages/app/src/components/drag-reorder/drag-reducer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/drag-reorder/drag-reducer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/drag-reorder/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/drag-reorder/pointer-activation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/drag-reorder/pointer-activation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/drag-reorder/reorder-items.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/drag-reorder/reorder-items.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/drag-reorder/use-drag-reorder-state.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/file-drop/`

Paseo's files here: The client app renders visual drop overlays and handles drag-and-drop events, allowing users to drop files directly into composer inputs.

- `packages/app/src/components/file-drop/context.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/file-drop/file-drop-backdrop.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/file-drop/file-drop-zone.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/file-drop/types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/file-drop/use-drop-listeners.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/file-drop/use-file-drop.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/floating-header/`

Paseo's files here: The client app provides a floating top header with edge fading, keeping titles visible while content scrolls smoothly underneath.

- `packages/app/src/components/floating-header/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/headers/`

Paseo's files here: The client app renders top navigation bars, back buttons, and sidebar toggles to provide standard navigation across compact and full screens.

- `packages/app/src/components/headers/back-header.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/headers/compact-header.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/headers/header-icon-badge.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/headers/header-toggle-button.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/headers/menu-header.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/headers/screen-header.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/headers/screen-title.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/headers/sidebar-close-button.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/headers/sidebar-menu-toggle.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/hosts/`

Paseo's files here: The client app renders selector menus and filters for connected daemon servers, letting users switch between local and remote hosts.

- `packages/app/src/components/hosts/host-filter.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/hosts/host-picker-constants.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/hosts/host-picker.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/hosts/host-picker.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/icons/`

Paseo's files here: The client app renders vector icons for AI providers, source control platforms, and tools across all navigation bars and menus.

- `packages/app/src/components/icons/antigravity-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/claude-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/codeberg-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/codex-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/copilot-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/discord-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/editor-target-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/forgejo-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/gitea-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/github-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/gitlab-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/hizuri-mark.tsx` — The brand logo mark rendering a geometric dot spectrum with optional breathing animation. Why: Imported across app screens and navigation headers to display the brand logo. checked: nothing personal
- `packages/app/src/components/icons/kiro-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/manual-status-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/minimax-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/omp-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/opencode-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/pi-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/source-control-panel-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/icons/svg-path-icon.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/markdown/`

Paseo's files here: The client app parses and renders streaming markdown, code blocks, and images generated during assistant responses.

- `packages/app/src/components/markdown/block-stack.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/html.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/image-decoding.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/image-source.test.ts` — Tests for resolving Markdown image sources: workspace-relative, absolute and encoded paths, a folder name with an accented letter included. Why: Run by vitest for the Markdown renderer's image loading. checked: nothing personal
- `packages/app/src/components/markdown/image-source.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/images.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/renderer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/renderer.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/renderers.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/renderers.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/source.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/streaming.fixture.md` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/streaming.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/streaming.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/styles.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/markdown/fence/mermaid/`

Paseo's files here: The client app renders and expands interactive Mermaid diagrams parsed from markdown code fences within agent messages.

- `packages/app/src/components/markdown/fence/mermaid/build-runtime.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/fullscreen-viewer.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/host.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/host.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/host.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/iframe-runtime.web.tsx` — A web iframe runtime that lazily imports and renders Mermaid markdown diagrams. Why: Used by the markdown renderer on web to isolate heavy diagram rendering outside the initial bundle. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/presentation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/render-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/render-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/segments.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/source-policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/source-policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/use-render-model.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/markdown/fence/mermaid/runtime/`

Paseo's files here: The client app bundles this isolated webview runtime script to safely evaluate and display Mermaid diagram graphics on all platforms.

- `packages/app/src/components/markdown/fence/mermaid/runtime/entry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/runtime/messages.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/runtime/request-driver.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/runtime/request-driver.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/runtime/runtime-html.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/markdown/fence/mermaid/runtime/runtime.browser.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/page-layout/`

Paseo's files here: The client app structures standard scrollable screens with headers and keyboard insets, ensuring consistent layout across phones and desktops.

- `packages/app/src/components/page-layout/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/rewind/`

Paseo's files here: The client app controls rolling back agent conversation turns and restoring previous prompt text into the composer.

- `packages/app/src/components/rewind/composer-restore.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/rewind/composer-restore.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/rewind/rewind-menu.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/rewind/rewind-mode.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/rewind/use-rewind-agent-mutation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/rewind/use-rewind-capabilities.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/rewind/use-rewind-capabilities.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/schedules/`

Paseo's files here: The client app renders forms, rows, and cadence selectors for configuring recurring automated agent tasks.

- `packages/app/src/components/schedules/cadence-editor.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/schedules/schedule-form-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/schedules/schedule-row.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/schedules/schedules-table.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/settings/`

Paseo's files here: The client app renders collapsible row components in configuration views, organizing detailed user options cleanly.

- `packages/app/src/components/settings/collapsible-row.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/settings/index.tsx` — Form controls and card layouts for settings menus, including descriptions on select options. Why: Imported by configuration screens to construct consistent settings forms and dropdowns. checked: nothing personal

## `packages/app/src/components/settings/headings/`

Paseo's files here: The client app formats section titles, tooltips, and informational callouts across all configuration screens.

- `packages/app/src/components/settings/headings/settings-group.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/settings/headings/settings-info-tip.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/settings/headings/settings-section.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/sidebar/`

Paseo's files here: The client app renders workspace lists, project trees, and status rows inside the collapsible navigation sidebar.

- `packages/app/src/components/sidebar/empty-states.browser.test.tsx` — Browser tests for the sidebar's empty states in every app language. Why: Run by the app's browser vitest suite. checked: nothing personal
- `packages/app/src/components/sidebar/empty-states.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/project-leading-visual.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-footer-icon-highlight.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-group-toggle-row.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-header-row.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-help-menu.tsx` — A dropdown menu showing app version, host versions, shortcuts, and diagnostic links. Why: Imported by the sidebar footer to let users inspect versions and launch diagnostics. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-labels.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-labels.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-model.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-nav-rows.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-popover.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-project-filter.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-project-filter.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-projection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-projection.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-row-backdrop.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-row-backdrop.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-section-header.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-separator.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-status-list.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-workspace-menu.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-workspace-row.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-workspace-title.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/sidebar-workspace-title.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/use-limited-sidebar-group.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/use-long-press-drag-interaction.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/use-open-kebab-menu-visibility.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/sidebar/display-preferences/`

Paseo's files here: The client app manages menus and validation for customizing sidebar badges, CI check icons, and row visibility options.

- `packages/app/src/components/sidebar/display-preferences/checks-display.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/display-preferences/menu.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/display-preferences/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/display-preferences/row-items.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/display-preferences/row-items.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/sidebar/workspace-meta-row/`

Paseo's files here: The client app displays CI checks and service status indicators in workspace rows; hizuri keeps this to visualize background build health alongside active agents.

- `packages/app/src/components/sidebar/workspace-meta-row/check-indicator.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/workspace-meta-row/check-summary.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/workspace-meta-row/check-summary.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/workspace-meta-row/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/workspace-meta-row/meta-items.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/workspace-meta-row/meta-items.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/workspace-meta-row/service-summary.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/sidebar/workspace-meta-row/service-summary.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/sidebar/workspace-trailing/`

Paseo's files here: The client app renders trailing diff stats and timestamps in sidebar items; hizuri keeps this to display workspace freshness and change volume consistently.

- `packages/app/src/components/sidebar/workspace-trailing/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/status-ring/`

Paseo's files here: The client app animates circular progress indicators across native and web; hizuri keeps this to visually signal ongoing agent operations and voice turns.

- `packages/app/src/components/status-ring/clock.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/status-ring/clock.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/status-ring/frame.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/status-ring/geometry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/status-ring/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/status-ring/index.web.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/ui/`

Paseo's files here: The client app provides core UI building blocks such as buttons, alerts, and tooltips; hizuri keeps them to build its voice-enabled screens and panels.

- `packages/app/src/components/ui/alert.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/anchor.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/anchor.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/autocomplete-popover.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/autocomplete-utils.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/autocomplete-utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/autocomplete.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/bottom-sheet-scope.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/button.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/combobox-frame-style.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/combobox-frame-style.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/combobox-keyboard.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/combobox-keyboard.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/combobox-options.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/combobox-options.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/combobox-trigger.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/combobox.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/context-menu.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/context-menu.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/control-geometry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/control-geometry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/density-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/dropdown-menu.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/dropdown-trigger.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/edge-fade.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/external-link.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/floating-action-button.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/floating-action-layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/floating-action-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/floating-panel-portal.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/floating.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/form-field.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/highlighted-text-segments.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/highlighted-text-segments.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/highlighted-text.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/horizontal-scroll-boundary.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/hover-card.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/icon-button-chrome.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/icon-color.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/keyboard-dismiss.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/loading-spinner.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/normalize-display-chord.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/normalize-display-chord.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/pane-content-toolbar.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/pane-content-toolbar.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/press-highlight.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/press-highlight.shape.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/press-highlight.shape.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/press-highlight.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/press-highlight.types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/scroll-reveal.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/scroll-reveal.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/scroll-view.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/scroll-view.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/scrollable-code-surface.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/search-field.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/segmented-control.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/select-field.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/shortcut.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/status-badge.browser.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/status-badge.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/switch.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/switch.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/toolbar-label-trigger.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/tooltip.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/tooltip.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/trailing-action-scrim.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/ui/isolated-bottom-sheet-modal/`

Paseo's files here: The client app isolates modal bottom sheets with custom back-press tracking; hizuri keeps this to handle mobile overlays and configuration drawers safely.

- `packages/app/src/components/ui/isolated-bottom-sheet-modal/back-press.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/isolated-bottom-sheet-modal/host-scope.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/isolated-bottom-sheet-modal/index.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/isolated-bottom-sheet-modal/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/isolated-bottom-sheet-modal/sheet-backdrop.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/isolated-bottom-sheet-modal/sheet-backdrop.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/isolated-bottom-sheet-modal/visibility-tracker.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/isolated-bottom-sheet-modal/visibility-tracker.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/isolated-bottom-sheet-modal/visible-frame-layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/isolated-bottom-sheet-modal/visible-frame-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/isolated-bottom-sheet-modal/visible-frame.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/ui/menu/`

Paseo's files here: The client app implements responsive context menus and dropdown surfaces; hizuri keeps this to offer adaptive actions across desktop popovers and mobile sheets.

- `packages/app/src/components/ui/menu/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-context.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-context.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-geometry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-item.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-navigation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-navigation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-overlay.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-root.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-root.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-sheet-layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-sheet-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-sub.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/menu/menu-surface.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/ui/overlay-scrollbar/`

Paseo's files here: The client app provides custom overlay scrollbars for web and native views; hizuri keeps this to cleanly navigate tall agent chat histories.

- `packages/app/src/components/ui/overlay-scrollbar/dom-overlay-scrollbar.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/overlay-scrollbar/geometry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/overlay-scrollbar/geometry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/overlay-scrollbar/overlay-scrollbar.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/overlay-scrollbar/use-overlay-flat-list-scrollbar.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/overlay-scrollbar/use-overlay-flat-list-scrollbar.web.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/ui/text-input/`

Paseo's files here: The client app manages sheet-aware editable text inputs; hizuri keeps this to ensure the composer remains visible when the mobile software keyboard appears.

- `packages/app/src/components/ui/text-input/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/text-input/sheet-aware.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/text-input/text-input.native.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/text-input/text-input.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/text-input/text-input.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/text-input/text-input.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/ui/text-input/types.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/components/zoomable-viewport/`

Paseo's files here: The client app supports pan and pinch gestures on images and media; hizuri keeps this so the user can inspect stage artifacts and slides.

- `packages/app/src/components/zoomable-viewport/geometry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/zoomable-viewport/geometry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/zoomable-viewport/image.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/zoomable-viewport/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/zoomable-viewport/index.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/zoomable-viewport/toolbar.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/components/zoomable-viewport/types.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/composer/`

Paseo's files here: The client app manages message drafting, clipboard images, and submission lifecycles; hizuri keeps this as the primary text entry interface for coding agents.

- `packages/app/src/composer/action-geometry.ts` — Layout size and spacing constants for composer action buttons and the voice-typing mode switch. Why: Imported by the composer and input components to style touch targets and control layouts across breakpoints. checked: nothing personal
- `packages/app/src/composer/actions.test.ts` — Unit tests for composer actions including streaming file uploads and message queueing. Why: Executed by vitest to verify composer attachment handling, chunked uploads, and agent message dispatching. checked: nothing personal
- `packages/app/src/composer/actions.ts` — Action helper functions for dispatching messages, uploading files, and managing attachments in the composer. Why: Imported by composer components to handle message submission, cancellation, file streaming, and attachment queues. checked: nothing personal
- `packages/app/src/composer/after-paint-publication.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/after-paint-publication.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/clipboard-image.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/clipboard-image.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/diff-stat-pill.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/diff-stat-pill.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/focused-chat-target.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/focused-chat-target.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/forge-auto-attach.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/forge-auto-attach.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/index.tsx` — The primary message composer component integrating text input, voice switches, and attachment controls. Why: Rendered across chat views to handle drafting, editing, dictation, and transmitting prompts to coding agents. checked: nothing personal
- `packages/app/src/composer/input-mode.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/keyboard-scope.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/native-pasted-image.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/native-pasted-image.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/pill-styles.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/submit.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/submit.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/text-source.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/tracks-panel.browser.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/tracks.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/workspace-diff-stat.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/composer/agent-controls/`

Paseo's files here: The client app renders toolbar controls for model selection and modes; hizuri keeps this so the user can easily toggle execution settings before sending instructions.

- `packages/app/src/composer/agent-controls/control.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/control.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/glyph.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/header.tsx` — A header row component presenting agent model settings, effort level, and context window token usage. Why: Mounted in workspace headers to keep agent controls accessible without cluttering the chat composer toolbar. checked: nothing personal
- `packages/app/src/composer/agent-controls/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/layout-context.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/mode-control.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/mode.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/mode.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/model-loading.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/model-loading.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/model-sheet-flow.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/model-sheet-flow.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/model-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/utils.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/agent-controls/utils.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/composer/attachments/`

Paseo's files here: The client app processes dropped files and desktop attachments; hizuri keeps this so the user can provide contextual documents and images to the assistant.

- `packages/app/src/composer/attachments/drop.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/attachments/drop.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/attachments/submit.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/attachments/workspace-cleanup.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/attachments/workspace.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/attachments/workspace.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/composer/dock/`

Paseo's files here: The client app lays out docked and fullscreen composer views across screen sizes; hizuri keeps this to support versatile mobile and desktop input layouts.

- `packages/app/src/composer/dock/index.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/dock/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/composer/dock/internal/`

Paseo's files here: The client app calculates layout capacity and backdrop behaviors for the composer dock; hizuri keeps this to prevent mobile keyboard layout overlap.

- `packages/app/src/composer/dock/internal/background.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/dock/internal/background.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/dock/internal/capacity.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/dock/internal/capacity.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/dock/internal/fullscreen.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/dock/internal/fullscreen.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/composer/draft/`

Paseo's files here: The client app handles agent creation drafts and workspace input persistence; hizuri keeps this so unsubmitted instructions survive workspace switching.

- `packages/app/src/composer/draft/create-agent-request.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/draft/create-flow.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/draft/create-flow.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/draft/import-pill.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/draft/input-draft-core.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/draft/input-draft.live.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/draft/input-draft.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/draft/input-draft.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/draft/workspace-tab-core.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/draft/workspace-tab.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/draft/workspace-tab.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/composer/editing-session/`

Paseo's files here: The client app tracks text selection and active fullscreen editing state; hizuri keeps this to smoothly synchronize focus between voice commands and typed input.

- `packages/app/src/composer/editing-session/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/editing-session/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/composer/input/`

Paseo's files here: The client app handles input height calculation and fullscreen exit gestures; hizuri keeps this to ensure responsive typing across web and mobile platforms.

- `packages/app/src/composer/input/fullscreen-exit.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/input/fullscreen-exit.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/input/height.d.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/input/height.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/input/height.types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/input/height.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/input/input.tsx` — The text input area and overlay container for composer submissions, dictation, and voice mode controls. Why: Imported by the composer to capture keystrokes, trigger attachments, handle paste events, and manage overlays. checked: nothing personal
- `packages/app/src/composer/input/labels.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/input/labels.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/input/presentation.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/input/state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/input/state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/input/text-input.web.browser.test.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/composer/submission/`

Paseo's files here: The client app tracks in-flight chat message submissions and acknowledgments; hizuri keeps this to guarantee reliable delivery of prompt instructions to the daemon.

- `packages/app/src/composer/submission/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/submission/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/submission/writer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/composer/submission/writer.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/composer/task-list/`

Paseo's files here: The client app renders pending agent todo lists directly inside the composer; hizuri keeps this to give the user visibility into remaining subtasks.

- `packages/app/src/composer/task-list/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/constants/`

Paseo's files here: The client app defines platform checks, build targets, and theme constants; hizuri keeps this to isolate environment-specific runtime behavior cleanly.

- `packages/app/src/constants/build-profile.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/constants/layout.test.ts` — Unit tests verifying compact layout resolution across window breakpoints and user layout preferences. Why: Executed by vitest to test layout calculation logic across mobile and desktop responsive views. checked: nothing personal
- `packages/app/src/constants/layout.ts` — Layout dimension constants and responsive breakpoint detection hooks for compact and desktop screens. Why: Imported throughout the client app to adapt navigation, headers, and composer UI to device dimensions. checked: nothing personal
- `packages/app/src/constants/platform.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/constants/theme.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/contexts/`

Paseo's files here: The client app shares horizontal scrolling state, toasts, and agent status tracking; hizuri keeps this to coordinate UI gestures and server updates.

- `packages/app/src/contexts/horizontal-scroll-context.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/contexts/session-context.tsx` — React provider managing daemon WebSocket subscriptions, voice diagnostics, audio playback, and session state updates. Why: Wraps app screens to process real-time events from the daemon and feed session and voice stores. checked: nothing personal
- `packages/app/src/contexts/session-status-tracking.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/contexts/session-status-tracking.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/contexts/session-workspace-upserts.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/contexts/session-workspace-upserts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/contexts/sidebar-callout-context.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/contexts/sidebar-callout-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/contexts/sidebar-callout-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/contexts/toast-api-context.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/contexts/toast-context.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/contexts/voice-context.tsx` — React context provider and hooks managing the audio engine, voice runtime lifecycle, and session keep-awake. Why: Supplies voice mode controls and microphone capture pipelines to audio-enabled UI components. checked: nothing personal
- `packages/app/src/contexts/workspace-directory-reconciliation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/contexts/workspace-directory-reconciliation.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/create-agent-preferences/`

Paseo's files here: The client app manages optimistic form preferences for new agent sessions; hizuri keeps this to remember user setup choices like isolation and model.

- `packages/app/src/create-agent-preferences/optimistic-preferences.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/create-agent-preferences/optimistic-preferences.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/create-agent-preferences/preferences.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/create-agent-preferences/preferences.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/create-agent-preferences/service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/create-agent-preferences/storage.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/create-agent-preferences/test-utils/`

Paseo's files here: The client app provides mock storage utilities for testing agent preference persistence; hizuri keeps this to verify client preferences in unit test suites.

- `packages/app/src/create-agent-preferences/test-utils/fake-preference-storage.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/data/`

Paseo's files here: The client app manages query caches, provider catalogs, and daemon pairing data; hizuri keeps this to communicate smoothly with the backend daemon.

- `packages/app/src/data/acp-provider-catalog.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/data/daemon-config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/data/daemon-pairing.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/data/provider-icons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/data/provider-snapshot-cache.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/data/provider-snapshot-cache.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/data/providers-snapshot.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/data/providers-snapshot.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/data/push-router.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/data/push-router.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/data/query-client.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/data/query.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/`

Paseo's files here: The client app integrates desktop file pickers, window chrome, and navigation events; hizuri keeps this to support full desktop operating system functionality.

- `packages/app/src/desktop/agent-navigation.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/host.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/pick-directory.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/pick-directory.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/window-chrome-presentation.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/attachments/`

Paseo's files here: The client app saves, copies, and previews local desktop attachments; hizuri keeps them so the desktop app can send dropped files and screenshots to agents.

- `packages/app/src/desktop/attachments/desktop-attachment-bridge.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/attachments/desktop-attachment-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/attachments/desktop-attachment-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/attachments/desktop-file-commands.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/attachments/desktop-preview-url.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/attachments/desktop-preview-url.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/attachments/test-utils/`

Paseo's files here: The client app provides mock attachment bridges for unit tests; hizuri keeps them to verify desktop file handling without touching the local disk.

- `packages/app/src/desktop/attachments/test-utils/fake-desktop-attachment-bridge.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/browser/`

Paseo's files here: The client app renders workspace browser panels and manages resident web views; hizuri keeps them so desktop users can browse sites alongside agent chats.

- `packages/app/src/desktop/browser/panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/browser/resident-webviews.browser.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/browser/resident-webviews.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/browser/shortcuts.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/browser/shortcuts.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/browser/automation/`

Paseo's files here: The client app handles browser automation commands from the session; hizuri keeps them so coding agents can inspect pages, capture viewports, and interact with web views.

- `packages/app/src/desktop/browser/automation/handler.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/browser/automation/handler.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/browser/new-tab-requests/`

Paseo's files here: The client app resolves and routes requests to open new browser tabs; hizuri keeps them so links clicked in web views open properly in the desktop layout.

- `packages/app/src/desktop/browser/new-tab-requests/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/browser/new-tab-requests/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/browser/pane/`

Paseo's files here: The client app displays web view panes and manages visual element selection; hizuri keeps them so users can pick page elements to send to the assistant.

- `packages/app/src/desktop/browser/pane/element-selector.electron.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/browser/pane/element-selector.electron.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/browser/pane/index.electron.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/browser/pane/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/browser/pane/index.web.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/browser/settings/`

Paseo's files here: The client app displays browser storage and cache management settings; hizuri keeps them so users can clear cookies and cached web data from desktop browsers.

- `packages/app/src/desktop/browser/settings/browser-data-section.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/browser/store/`

Paseo's files here: The client app manages browser tab state and viewport configurations in Zustand; hizuri keeps them to persist open web tabs across app restarts.

- `packages/app/src/desktop/browser/store/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/browser/store/state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/browser/store/state.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/components/`

Paseo's files here: The client app renders desktop settings cards for notifications, permissions, and device pairing; hizuri keeps them to manage system integrations and companion connections.

- `packages/app/src/desktop/components/desktop-notifications-section.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/components/desktop-permission-row.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/components/desktop-permissions-section.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/components/desktop-updates-section.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/components/integrations-section.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/components/pair-device-modal.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/components/pair-device-section.tsx` — Desktop UI component displaying device pairing QR codes, direct connection links, and relay enablement controls. Why: Rendered in desktop settings to pair mobile devices with the local daemon via QR code or URL. checked: nothing personal

## `packages/app/src/desktop/daemon/`

Paseo's files here: The client app controls the built-in desktop daemon process and local RPC transport; hizuri keeps them so the desktop app can launch and manage its local daemon.

- `packages/app/src/desktop/daemon/daemon-management-error.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/daemon/daemon-management-error.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/daemon/daemon-management-toggle.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/daemon/daemon-management-toggle.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/daemon/desktop-daemon-transport.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/daemon/desktop-daemon-transport.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/daemon/desktop-daemon.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/daemon/local-credential.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/daemon/local-daemon-transport-rpc.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/daemon/test-local-daemon-transport-rpc.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/electron/`

Paseo's files here: The client app bridges IPC events and calls to the Electron main process; hizuri keeps them so the React Native client interacts with desktop window capabilities.

- `packages/app/src/desktop/electron/events.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/electron/host.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/electron/idle.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/electron/idle.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/electron/invoke.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/electron/window.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/hooks/`

Paseo's files here: The client app provides React hooks for daemon lifecycle, installation, and IPC error reporting; hizuri keeps them to display daemon status and handle desktop failures.

- `packages/app/src/desktop/hooks/desktop-ipc-error.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/hooks/use-built-in-daemon-management.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/hooks/use-daemon-status.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/hooks/use-enable-built-in-daemon-option.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/hooks/use-install-status.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/permissions/`

Paseo's files here: The client app queries and requests desktop system permissions like microphone and notifications; hizuri keeps them so the voice assistant can access the desktop mic.

- `packages/app/src/desktop/permissions/desktop-permissions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/permissions/desktop-permissions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/permissions/use-desktop-permissions.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/settings/`

Paseo's files here: The client app loads and mutates desktop configuration options; hizuri keeps them so users can customize desktop-specific preferences like release channels.

- `packages/app/src/desktop/settings/desktop-settings.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/updates/`

Paseo's files here: The client app checks, downloads, and prompts for desktop application updates; hizuri keeps them to notify users when new desktop builds are ready to install.

- `packages/app/src/desktop/updates/desktop-app-updater.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/updates/desktop-app-updater.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/updates/desktop-updates.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/updates/desktop-updates.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/updates/resolve-update-callout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/updates/resolve-update-callout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/updates/rosetta-callout-source.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/updates/update-callout-source.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/desktop/updates/use-desktop-app-updater.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/desktop/updates/test-utils/`

Paseo's files here: The client app provides fake updater ports for automated testing; hizuri keeps them to test desktop update checks and installation flows without running installers.

- `packages/app/src/desktop/updates/test-utils/fake-desktop-app-updater-port.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/diagnostics/`

Paseo's files here: The client app collects daemon logs, sandbox diagnostics, and system reports; hizuri keeps them so users can troubleshoot daemon crashes and environment issues.

- `packages/app/src/diagnostics/app-diagnostic-report.test.ts` — Tests for diagnostic report formatting and secret redaction utilities. Why: Verified by vitest to ensure connection secrets and passwords are scrubbed from diagnostic outputs. checked: nothing personal
- `packages/app/src/diagnostics/app-diagnostic-report.ts` — Formatters and regex sanitizers for generating redacted diagnostic reports and log messages. Why: Used by diagnostic export tools and log uploaders to strip sensitive credentials before sharing reports. checked: nothing personal
- `packages/app/src/diagnostics/app-log-reporter.tsx` — Headless React component periodically gathering console, voice, microphone, connection, JS-freeze and JS-memory logs for daemon upload. Why: Mounted at the app root to continuously flush diagnostic logs to the active daemon host. checked: nothing personal
- `packages/app/src/diagnostics/app-log-uploader.test.ts` — Tests for memory log buffering, console interception, and batched daemon upload flows. Why: Verified by vitest to guarantee log entries are retained and formatted safely across upload cycles. checked: nothing personal
- `packages/app/src/diagnostics/app-log-uploader.ts` — In-memory ring buffer, console monkey-patcher, and periodic uploader for client-side diagnostic logs. Why: Imported by log reporters and crash handlers to queue and transmit client diagnostic entries. checked: nothing personal
- `packages/app/src/diagnostics/crash-box.native.ts` — Native fatal error handler writing unsent diagnostic logs to disk before app termination. Why: Used on iOS and Android to preserve crash state across application restarts. checked: nothing personal
- `packages/app/src/diagnostics/crash-box.ts` — No-op stub for the crash persistence interface on web platforms. Why: Imported on web builds where native filesystem crash dumping is not available. checked: nothing personal
- `packages/app/src/diagnostics/crash-record.test.ts` — Tests for crash state serialization and replay into the memory log buffer. Why: Verified by vitest to ensure unhandled exceptions and prior logs are properly recovered. checked: nothing personal
- `packages/app/src/diagnostics/crash-record.ts` — Serializers and parsers capturing fatal errors and recent log history to disk payloads. Why: Imported by native crash box handlers to store crash context and reload it on restart. checked: nothing personal
- `packages/app/src/diagnostics/desktop-diagnostic-report.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/diagnostics/desktop-diagnostic-report.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/diagnostics/store.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/dictation/`

Paseo's files here: The client app manages chunked audio streaming and protocol acknowledgments; hizuri keeps them so the client can reliably stream microphone audio to the daemon speech pipeline.

- `packages/app/src/dictation/dictation-stream-sender.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/dictation/dictation-stream-sender.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/face/`

- `packages/app/src/face/activity.test.ts` — Tests for face activity state resolution and running tool detection. Why: Runs via vitest to verify that assistant activities and running tools are mapped correctly for avatar body language. checked: nothing personal
- `packages/app/src/face/activity.ts` — Helper functions determining assistant avatar activity states and inspecting active tool calls. Why: Imported by face components to drive avatar body language and posture during listening, thinking, and working. checked: nothing personal
- `packages/app/src/face/bridge.ts` — Message type definitions and parser for communication between the app and the avatar web frame. Why: Imported by face frame components to exchange speech frames, theme updates, gestures, and state changes with the avatar view. checked: nothing personal
- `packages/app/src/face/face-frame-shared.test.ts` — Tests for how long the face waits before loading its page again after a failed load. Why: Runs via vitest so the face comes back by itself after a daemon restart without hammering it. checked: nothing personal
- `packages/app/src/face/face-frame-shared.ts` — Shared hooks and utilities for configuring and synchronizing the avatar web frame. Why: Imported by native and web FaceFrame components to format URLs and synchronize theme and ready events. checked: nothing personal
- `packages/app/src/face/face-frame.tsx` — React Native WebView component embedding the avatar web page on native platforms. Why: Rendered by FaceHost on native mobile platforms to display the animated avatar and pass bridge messages. checked: nothing personal
- `packages/app/src/face/face-frame.web.tsx` — Iframe component embedding the avatar web page on web platforms. Why: Rendered by FaceHost on web browsers to display the animated avatar and handle iframe messaging. checked: nothing personal
- `packages/app/src/face/face-host.tsx` — Container component managing the avatar presentation layer, lifecycle, and voice synchronization. Why: Rendered in agent chat screens and standalone face tabs to present the animated avatar during voice interactions. checked: nothing personal
- `packages/app/src/face/face-owner.test.ts` — Tests for the avatar ownership store and claim priority logic. Why: Runs via vitest to verify that only one agent session holds avatar rendering ownership at any time. checked: nothing personal
- `packages/app/src/face/face-owner.ts` — State store and hook managing exclusive avatar rendering ownership across multiple agent sessions. Why: Imported by face hosting views to prevent multiple 3D avatar instances from running simultaneously. checked: nothing personal
- `packages/app/src/face/loading.test.ts` — Tests for avatar loading state transitions across download, preparation, and readiness. Why: Runs via vitest to verify avatar load progress handling and error fallback states. checked: nothing personal
- `packages/app/src/face/loading.ts` — Types and reducer function for tracking the loading progress of the avatar model. Why: Imported by avatar host views to display progress indicators and status messages while models compile. checked: nothing personal
- `packages/app/src/face/model.test.ts` — Tests for speech tag parsing, tool call selection, telling the page which speak call a stretch of voice belongs to, avatar URL formatting, and message validation. Why: Runs via vitest to verify avatar model URL resolution and speech markup extraction. checked: nothing personal
- `packages/app/src/face/model.ts` — The speech tag parser, the URL builder for the assistant avatar page, and which speak call each stretch of the assistant's voice belongs to (also when the call arrives after the voice). Why: Imported by the avatar view and voice feed to parse spoken emotion tags and construct avatar URLs. checked: nothing personal
- `packages/app/src/face/mouth.test.ts` — Tests for the plain mouth frames: loudness, vowel order by brightness, weights summing to one. Why: Runs via vitest to verify the frames every avatar page gets. checked: nothing personal
- `packages/app/src/face/mouth.ts` — The plain mouth: per 20 ms of played PCM, the loudness and vowel weights from a spectral-centroid estimate. Why: Imported by the face voice feed to send every avatar page its mouth frames. checked: nothing personal
- `packages/app/src/face/use-face-activity.ts` — A hook computing the assistant avatar's listening, speaking, and thinking activity state. Why: Imported by face views and the floating bridge to drive avatar reactions. checked: nothing personal
- `packages/app/src/face/use-face-voice-feed.ts` — A hook streaming speech audio frames and speech metadata to the avatar WebView. Why: Imported by face views and the floating avatar to animate the mouth during speech playback. checked: nothing personal
- `packages/app/src/face/webgl.ts` — The native platform WebGL availability checker. Why: Imported by avatar components on native platforms to check if rendering is supported. checked: nothing personal
- `packages/app/src/face/webgl.web.ts` — The web browser WebGL 2 availability checker. Why: Imported by avatar components on web platforms to prevent crashes when WebGL 2 is disabled. checked: nothing personal

## `packages/app/src/fdroid/`

Paseo's files here: The client app stubs camera and notification permissions for F-Droid builds; hizuri keeps them to compile open-source Android distributions without proprietary services.

- `packages/app/src/fdroid/expo-camera.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/fdroid/expo-notifications.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/file-explorer/`

Paseo's files here: The client app calculates file preview targets and manages file tree visibility; hizuri keeps them to navigate workspace files in the sidebar and stage.

- `packages/app/src/file-explorer/preview-target.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-explorer/preview-target.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-explorer/tree.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-explorer/tree.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-explorer/visibility.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-explorer/visibility.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/file-pane/`

Paseo's files here: The client app renders file tab toolbars and active file preview panes; hizuri keeps them to display editor tabs and file contents inside workspace panes.

- `packages/app/src/file-pane/bar.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-pane/pane.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-pane/tree-toggle.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/file-panels/`

Paseo's files here: The client app provides built-in renderers and security policies for markdown and HTML files; hizuri keeps them so users can view project documents safely.

- `packages/app/src/file-panels/associations.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/builtin.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/catalog.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/catalog.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/html-preview-csp.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/html-preview-csp.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/html-preview-navigation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/html-preview-navigation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/html-preview.tsx` — Native HTML preview panel for workspace files, sandboxed. Why: the file panel opens HTML files with it. checked: nothing personal
- `packages/app/src/file-panels/html-preview.web.tsx` — Web HTML preview panel for workspace files, sandboxed in an iframe. Why: the file panel opens HTML files with it on web. checked: nothing personal
- `packages/app/src/file-panels/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/loading.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/panels.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/plugin-host.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/resolve.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/resolve.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/view.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/file-panels/choice/`

Paseo's files here: The client app manages file-type associations and panel picker switchers; hizuri keeps them so users can choose between preview, rich, or raw source views.

- `packages/app/src/file-panels/choice/hook.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/choice/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/choice/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/choice/open-with.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/choice/picker.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/choice/presentation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/choice/registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/choice/switcher-layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/choice/switcher-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/choice/switcher.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/file-panels/document-frame/`

Paseo's files here: The client app isolates document frames in sandboxed web views across platforms; hizuri keeps them to render untrusted HTML and documentation securely.

- `packages/app/src/file-panels/document-frame/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/document-frame/index.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/document-frame/sandbox.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/document-frame/sandbox.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/file-panels/file/`

Paseo's files here: The client app provides file handle abstractions and daemon session file synchronization; hizuri keeps them so file view panels can read, observe, and save workspace edits.

- `packages/app/src/file-panels/file/daemon-session.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/file/handle.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/file/handle.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/file/hook.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/file/hooks.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/file/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/file/testing.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/file-panels/markdown-preview/`

Paseo's files here: The client app uses these files to parse YAML front matter and preview markdown documents; hizuri keeps them to display formatted markdown notes and documentation clearly.

- `packages/app/src/file-panels/markdown-preview/document.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/markdown-preview/document.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/markdown-preview/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/file-panels/settings/`

Paseo's files here: The client app uses these files to manage file associations and editor settings; hizuri keeps them so the user can configure default panel viewers across connected hosts.

- `packages/app/src/file-panels/settings/hook.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/settings/rows.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/settings/rows.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/file-panels/source/`

Paseo's files here: The client app uses these files to display source code files and file conflict warnings; hizuri keeps them to alert the user about external file modifications.

- `packages/app/src/file-panels/source/conflict-alert.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/status.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/file-panels/source/editor/`

Paseo's files here: The client app uses these files to integrate the CodeMirror text editor; hizuri keeps them to provide complete in-app source code editing with syntax highlighting.

- `packages/app/src/file-panels/source/editor/extensions.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/editor/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/editor/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/editor/view.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/editor/view.web.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/file-panels/source/find/`

Paseo's files here: The client app uses these files to run search and replace inside the editor; hizuri keeps them so the user can locate text strings across open files.

- `packages/app/src/file-panels/source/find/index.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/find/model.web.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/file-panels/source/readonly/`

Paseo's files here: The client app uses these files to display read-only code views safely; hizuri keeps them to render large source files without degrading client device performance.

- `packages/app/src/file-panels/source/readonly/presentation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/readonly/presentation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/readonly/source-lines.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/readonly/source-lines.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/readonly/view.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/readonly/view.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/file-panels/source/readonly/view.web.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/float/`

- `packages/app/src/float/float-behavior.test.ts` — Tests for floating avatar wander decisions and movement bounds. Why: Tests wander availability and walk bounds calculation, run by vitest. checked: nothing personal
- `packages/app/src/float/float-behavior.ts` — The movement logic and window dimensions for the floating overlay avatar. Why: Imported by the floating bridge and floating avatar view to calculate autonomous strolling. checked: nothing personal
- `packages/app/src/float/float-bridge.tsx` — The bridge component managing the native floating overlay lifecycle and state synchronization. Why: Mounted by the agent conversation screen to launch and synchronize the floating overlay service. checked: nothing personal
- `packages/app/src/float/float-native.ts` — TypeScript types and native module binding for the Android floating overlay service. Why: Imported by the floating overlay components to control native window overlay operations on Android. checked: nothing personal
- `packages/app/src/float/float-store.ts` — Zustand store tracking the floating overlay's target, activity, running state, and visibility. Why: Shares state between the main app tree and the floating overlay React root. checked: nothing personal
- `packages/app/src/float/floating-zuri.tsx` — The React Native component rendering the overlay avatar and touch controls. Why: Rendered inside the native overlay window to display the avatar and handle gesture interactions. checked: nothing personal
- `packages/app/src/float/register.android.ts` — Registration helper for the Android floating overlay surface and keep-alive headless task. Why: Called on Android startup to register the floating overlay component and headless background task. checked: nothing personal
- `packages/app/src/float/register.ts` — No-op float registration stub for non-Android platforms. Why: Provides platform-neutral module resolution so non-Android builds do not fail. checked: nothing personal

## `packages/app/src/git/`

Paseo's files here: The client app uses these files to manage version control operations, diffs, and branches; hizuri keeps them so the user can inspect git repositories and pull requests.

- `packages/app/src/git/action-icons.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/actions-split-button.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/actions-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/actions-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/branch-switcher-operations.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/branch-switcher-operations.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/changed-files-tree.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/check-presentation-copy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/check-presentation-copy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/check-presentation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/check-presentation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/check-presentation.view.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/checkout-status-cache.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/checkout-status-cache.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/client-forge-module.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/commit-file-diff-query.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/commit-file-diff-query.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-folder-row.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-order.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-order.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-pane.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-sharing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-sharing.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-too-large-state.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-tree.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-tree.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/file-header-interaction.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/file-header-interaction.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/file-header-presentation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/file-header-presentation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/file-header.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forge-icon.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forge-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forge-refs.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forge-refs.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forge-url.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forge-url.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forge.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forge.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/merge-capability.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/merge-capability.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pr-hint.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pr-hint.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pr-status.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pr-status.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-connection.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-state-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/query-keys.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/query-keys.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/themed-chevron.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/use-actions.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/use-commits-query.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/use-commits-query.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/use-diff-files.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/use-diff-files.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/use-diff-query.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/use-diff-query.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/use-forge-search-query.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/use-forge-search-query.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/use-pr-status-query.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/use-status-query.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/use-working-diff.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/workspace-actions.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/worktree-archive-warning.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/worktree-archive-warning.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/git/commits-section/`

Paseo's files here: The client app uses these files to render the visual commit graph and history; hizuri keeps them so the user can review git commit logs within workspaces.

- `packages/app/src/git/commits-section/commit-graph-node.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/commits-section/commit-row.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/commits-section/commits-section.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/commits-section/commits-section.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/git/diff-document/`

Paseo's files here: The client app uses these files to calculate diff layouts and paint file changes; hizuri keeps them so the user can review line-by-line git code modifications.

- `packages/app/src/git/diff-document/document-file-header.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/header-layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/header-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/hit-testing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/hit-testing.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/horizontal-offsets.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/horizontal-offsets.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/horizontal-scroll.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/horizontal-scroll.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/measurement-cost.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/native-hit-testing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/native-hit-testing.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/native-slabs.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/native-slabs.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/native-text-runs.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/native-text-runs.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/paint.native.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/paint.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/paint.web.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/paint.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/palette.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/palette.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/pointer-gesture.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/pointer-gesture.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/review-paint.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/surface.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/surface.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/surface.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/text-measurement.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/text-measurement.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/text.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/viewport.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/viewport.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/workspace-cache.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/diff-document/workspace-cache.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/git/forges/`

Paseo's files here: The client app uses these files to parse forge URLs and load brand icons; hizuri keeps them to support GitHub, GitLab, Codeberg, and Gitea integrations.

- `packages/app/src/git/forges/codeberg.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forges/codeberg.view.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forges/forgejo.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forges/forgejo.view.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forges/gitea.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forges/gitea.view.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forges/github.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forges/github.view.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forges/gitlab.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forges/gitlab.view.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forges/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forges/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/forges/view.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/git/jump-to-file/`

Paseo's files here: The client app uses this file to show a quick file picker sheet; hizuri keeps it so the user can quickly jump between files in working trees.

- `packages/app/src/git/jump-to-file/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/git/pull-request-panel/`

Paseo's files here: The client app uses these files to display pull request reviews, checks, and threads; hizuri keeps them so the user can inspect pull request activities.

- `packages/app/src/git/pull-request-panel/activity-location.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/activity-location.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/activity-skeleton.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/activity-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/activity-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/check-group-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/check-status.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/checks-ring.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/checks-section.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/checks-summary.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/checks-summary.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/context-attachment.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/context-attachment.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/data.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/data.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/native-data.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/native-data.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/pane-error.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/pane-skeleton.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/pane.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/query-keys.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/section-kit.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/tab-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/tab-label.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/tab-label.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/timeline.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/timeline.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/use-data.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/use-data.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/pull-request-panel/use-pipeline.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/git/working-diff-comparison/`

Paseo's files here: The client app uses these files to track diff comparison targets and state; hizuri keeps them so the user can toggle working tree comparisons seamlessly.

- `packages/app/src/git/working-diff-comparison/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/working-diff-comparison/state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/git/working-diff-comparison/state.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/hooks/`

Paseo's files here: The client app uses these shared hooks to manage UI state, audio capture, and shortcuts; hizuri keeps them to power client interactions and agent views.

- `packages/app/src/hooks/agent-commands-query.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/agent-commands-query.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/agent-history-query-key.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/client-activity-tracker.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/client-activity-tracker.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/feature-preferences.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/feature-preferences.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/hardware-keyboard-submit-controller.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/hardware-keyboard-submit-controller.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/hover-safe-zone-tracker.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/hover-safe-zone-tracker.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/image-attachment-picker.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/image-attachment-picker.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/image-attachment-picker.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/open-project.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/picked-image-normalizer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/picked-image-normalizer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/sidebar-status-view-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/sidebar-status-view-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/sidebar-workspaces-view-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/sidebar-workspaces-view-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-acp-provider-catalog.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-acp-provider-catalog.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-active-worktree-new-action.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-agent-attention-clear.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-agent-autocomplete.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-agent-commands-query.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-agent-commands-query.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-agent-form-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-agent-history.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-agent-history.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-agent-initialization.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-agent-initialization.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-agent-screen-state-machine.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-agent-screen-state-machine.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-aggregated-agents.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-app-visible.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-archive-agent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-archive-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-audio-recorder.d.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-audio-recorder.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-audio-recorder.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-autocomplete.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-branch-switcher.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-client-activity.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-color-scheme.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-color-scheme.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-compact-web-viewport-zoom-lock.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-container-width.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-container-width.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-daemon-config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-debounced-value.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-dictation-audio-source.d.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-dictation-audio-source.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-dictation-audio-source.types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-dictation-audio-source.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-dictation.shared.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-dictation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-draft-agent-features.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-favicon-status.ts` — Paseo's hook that sets the browser tab icon from the agents' state, with one icon per state for both themes. Why: the web app's root layout calls it. checked: nothing personal
- `packages/app/src/hooks/use-file-download.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-file-explorer-actions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-file-picker.ts` — Hook for picking files across desktop, web, and native platforms with streaming source handles. Why: Imported by chat and attachment components to open and stream files into conversations. checked: nothing personal
- `packages/app/src/hooks/use-fine-pointer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-fork-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-form-preferences.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-form-preferences.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-global-new-workspace-action.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-global-workspace-pin-action.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-hover-safe-zone.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-image-attachment-picker.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-import-session.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-ios-hardware-keyboard-submit.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-is-dictation-ready.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-is-local-daemon.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-keyboard-action-handler.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-keyboard-shortcut-overrides.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-keyboard-shortcuts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-keyboard-visibility.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-keyboard-visibility.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-latched-boolean.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-latched-boolean.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-load-older-agent-history.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-load-older-agent-history.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-open-add-project.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-open-project.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-open-project.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-phone-layout-sync.ts` — Hook synchronizing the phoneLayout setting into the phone layout Zustand store. Why: Ensures components checking compact form factor immediately reflect the phone layout setting. checked: nothing personal
- `packages/app/src/hooks/use-preferred-editor.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-preferred-editor.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-projects.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-projects.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-providers-snapshot.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-providers-snapshot.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-revealed-text.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-schedule-mutations.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-schedule-mutations.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-schedules.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-schedules.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-shortcut-keys.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-show-shortcut-badges.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-sidebar-pins.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-sidebar-pins.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-sidebar-shortcut-model.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-sidebar-shortcut-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-sidebar-workspace-entries.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-sidebar-workspace-entries.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-sidebar-workspace-pin.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-sidebar-workspaces-list.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-stable-event.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-time-ago.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-workspace-clipboard-actions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-workspace-read-state.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/hooks/use-changes-preferences/`

Paseo's files here: The client app uses these files to persist review and diff display preferences; hizuri keeps them so the user retains custom view options across restarts.

- `packages/app/src/hooks/use-changes-preferences/fakes.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-changes-preferences/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-changes-preferences/storage.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-changes-preferences/storage.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/hooks/use-settings/`

Paseo's files here: The client app uses these files to store settings keys and execute schema migrations; hizuri keeps them to preserve user preferences across application updates.

- `packages/app/src/hooks/use-settings/fakes.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-settings/index.ts` — React Query hooks for reading, modifying, and resetting application and desktop settings. Why: Used throughout the UI to access and update user preferences and view configurations. checked: nothing personal
- `packages/app/src/hooks/use-settings/keys.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-settings/migrations.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-settings/migrations.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hooks/use-settings/storage.test.ts` — Tests for app settings storage serialization, migration, fallbacks, and defaults. Why: Executed by vitest to verify that setting normalization and migration routines work correctly. checked: nothing personal
- `packages/app/src/hooks/use-settings/storage.ts` — Settings types, schemas, default configurations, and storage persistence functions. Why: Defines core client settings schemas imported by settings hooks and storage adapters. checked: nothing personal

## `packages/app/src/hosts/`

Paseo's files here: The client app uses these files to format host badges, labels, and pairing sheets; hizuri keeps them so the user can identify and connect remote daemons.

- `packages/app/src/hosts/appearance.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hosts/appearance.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hosts/host-badge.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hosts/host-chooser.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hosts/host-confirmation-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hosts/pair-scan-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hosts/pair-scan-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/hosts/use-host-badges.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/i18n/`

Paseo's files here: The client app uses these files to initialize and test localization setups; hizuri keeps them to support localized interface strings reliably without startup stalls.

- `packages/app/src/i18n/assistant-name.test.ts` — Tests for dynamically applying the assistant's name across localized translation bundles. Why: Run by vitest to verify assistant name overrides in active and lazily loaded locales. checked: nothing personal
- `packages/app/src/i18n/assistant-name.ts` — Utilities and a React hook to inject the server-provided assistant name into i18next translations. Why: Used by the app to update localization strings when the connected daemon specifies a custom name. checked: nothing personal
- `packages/app/src/i18n/i18next.startup.test.ts` — Tests that every bundled app language loads synchronously on selection and is reused. Why: Run by vitest; guards the lazy translation loader in i18next.ts. checked: nothing personal
- `packages/app/src/i18n/i18next.ts` — Initialization of the i18next instance configured with lazy resource bundles and store change bindings. Why: Provides translation services imported across the application's React components. checked: nothing personal
- `packages/app/src/i18n/init.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/i18n/init.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/i18n/locales.test.ts` — Tests for the app's language list, label formatting and system-locale mapping. Why: Run by vitest for locales.ts. checked: nothing personal
- `packages/app/src/i18n/locales.ts` — Locale constants, native name records, and helper functions for resolving supported app languages. Why: Used by the i18n subsystem to validate options and map system settings to supported locale codes. checked: nothing personal
- `packages/app/src/i18n/provider.tsx` — A React component providing i18n translation context and assistant name synchronization. Why: Wraps the app tree to supply translation state and default interface language to all UI views. checked: nothing personal
- `packages/app/src/i18n/resources.test.ts` — Tests validating translation completeness, parity with English keys, and placeholder integrity across supported locales. Why: Executed by vitest during test runs to prevent missing or broken translation strings. checked: nothing personal
- `packages/app/src/i18n/sync-language.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/i18n/sync-language.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/i18n/resources/`

- `packages/app/src/i18n/resources/ar.ts` — Arabic translations for app UI strings, assistant settings, voice face, and Show panels. Why: Loaded by i18next to render Arabic interface copy across the mobile and web clients. checked: nothing personal
- `packages/app/src/i18n/resources/en.ts` — English base translation strings and schema types for the entire user interface. Why: Serves as the default language dictionary and typing contract for all other localized resource files. checked: nothing personal
- `packages/app/src/i18n/resources/es.ts` — Spanish translations for app UI strings, voice mode, assistant features, and Show cards. Why: Loaded by i18next to present the application interface to Spanish-speaking users. checked: nothing personal
- `packages/app/src/i18n/resources/fr.ts` — French translations for app interface controls, assistant settings, and Show stage tools. Why: Loaded by i18next to render French UI text across the client application. checked: nothing personal
- `packages/app/src/i18n/resources/ja.ts` — Japanese translations for client UI strings, voice modes, assistant face, and stage tabs. Why: Loaded by i18next to deliver localized Japanese strings across web and mobile platforms. checked: nothing personal
- `packages/app/src/i18n/resources/ko.ts` — Korean localization strings for the app, including voice mode, face, brain, and show panels. Why: Imported by i18n modules to provide Korean translations across the user interface. checked: nothing personal
- `packages/app/src/i18n/resources/plugin-settings.ts` — Localized strings for plugin settings across Arabic, Spanish, French, Japanese, Korean, Portuguese and Chinese. Why: Imported by the locale translation files to supply plugin management UI labels. checked: nothing personal
- `packages/app/src/i18n/resources/pt-BR.ts` — Brazilian Portuguese localization strings for the app, covering voice mode, face, brain, and show panels. Why: Imported by i18n configuration to provide Brazilian Portuguese interface text. checked: nothing personal
- `packages/app/src/i18n/resources/zh-CN.ts` — Simplified Chinese localization strings for the app interface, face, voice mode, brain, and show views. Why: Imported by i18n modules to deliver Simplified Chinese UI text. checked: nothing personal

## `packages/app/src/keyboard/`

Paseo's files here: The client app uses these files to register, route, and dispatch keyboard shortcuts; hizuri keeps them so the user can navigate the workspace using hotkeys.

- `packages/app/src/keyboard/actions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/availability.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/availability.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/focus-scope.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/focus-scope.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/handler-id.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/handler-id.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/keyboard-action-dispatcher-context.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/keyboard-action-dispatcher.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/keyboard-action-dispatcher.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/keyboard-shortcut-routing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/keyboard-shortcut-routing.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/keyboard-shortcuts.test.ts` — Tests for keyboard shortcut parsing, recording and dispatch, with Greek, Arabic and Hebrew layout letters and Dvorak. Why: Run by vitest for keyboard-shortcuts.ts. checked: nothing personal
- `packages/app/src/keyboard/keyboard-shortcuts.ts` — Keyboard shortcut definitions, chord parsing, recording and dispatch, including letters of non-Latin layouts matched by their physical key. Why: The app's keyboard layer and the shortcut settings use it. checked: nothing personal
- `packages/app/src/keyboard/route-shortcut.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/route-shortcut.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shortcut-help-search.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shortcut-help-search.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shortcut-override-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shortcut-override-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shortcut-string.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shortcut-string.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/keyboard/shift/`

Paseo's files here: The client app uses this file to expose keyboard shift context exports; hizuri keeps it to adjust layout views when on-screen software keyboards appear.

- `packages/app/src/keyboard/shift/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/keyboard/shift/internal/`

Paseo's files here: The client app uses these files to calculate bottom insets and animate layout shifts; hizuri keeps them to keep inputs visible during mobile keyboard animations.

- `packages/app/src/keyboard/shift/internal/context.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shift/internal/policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shift/internal/policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shift/internal/provider.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shift/internal/stream.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shift/internal/translate.android.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shift/internal/translate.ios.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/keyboard/shift/internal/translate.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/lib/`

Paseo's files here: The client app uses these files to manage web overlay focus and DOM popovers; hizuri keeps them to handle modal dismissal and escape key navigation.

- `packages/app/src/lib/overlay-root.browser.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/lib/overlay-root.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/lib/overlay-root.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/mobile-panels/`

Paseo's files here: The client app uses these files to resolve touch gesture intents for sidebars; hizuri keeps them to enable smooth swipe interactions on mobile panels.

- `packages/app/src/mobile-panels/explorer-open-gesture.tsx` — Gesture handler component that opens the compact mobile file explorer sidebar unless simple mode is active. Why: Rendered in mobile workspace layouts to enable swipe-to-open gesture support for the file explorer. checked: nothing personal
- `packages/app/src/mobile-panels/gesture-intent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/mobile-panels/gesture-intent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/mobile-panels/gestures.ts` — Pan gesture handlers for opening and closing mobile panels while respecting held swipe locks. Why: Imported by mobile panel components to handle edge swipes without conflicting with stage tab controls. checked: nothing personal
- `packages/app/src/mobile-panels/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/mobile-panels/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/mobile-panels/presentation.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/mobile-panels/provider.tsx` — React context provider and runtime state machine for mobile slide-out panels and swipe lockouts. Why: Wraps the mobile app layout to coordinate panel animations and handle drag conflicts between controls. checked: nothing personal

## `packages/app/src/native/`

Paseo's files here: The client app uses these files to bridge physical keyboard events on iOS; hizuri keeps them so external hardware keyboards can submit prompts correctly.

- `packages/app/src/native/ios-hardware-keyboard-submit.ios.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/native/ios-hardware-keyboard-submit.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/navigation/`

Paseo's files here: The client app uses these files to manage screen routes and workspace resolution; hizuri keeps them so the user can route smoothly to agents and workspaces.

- `packages/app/src/navigation/agent-route-resolution-view.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/navigation/agent-route-resolution.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/navigation/agent-route-resolution.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/navigation/first-open.test.ts` — Tests for the first-open target resolution logic and test-agent filtering. Why: Executed by vitest to verify that app launch routes to active voice sessions instead of project lists. checked: nothing personal
- `packages/app/src/navigation/first-open.ts` — Target selection logic directing initial app launch directly to an active agent or voice session. Why: Used by navigation hooks to skip project selection and resume the user's ongoing conversation. checked: nothing personal
- `packages/app/src/navigation/host-route-context.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/navigation/host-runtime-bootstrap.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/navigation/host-runtime-bootstrap.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/navigation/settings-navigation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/navigation/themed-stack.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/navigation/use-first-open.ts` — React hook determining the startup navigation target and adopting available host voice sessions. Why: Called by top-level navigation routes during app initialization to direct the user to active conversations. checked: nothing personal
- `packages/app/src/navigation/workspace-route-navigation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/navigation/workspace-route-navigation.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/new-workspace-launch/`

Paseo's files here: The client app uses these files to resolve launch targets and manage composer state when opening new workspaces or shells, which hizuri keeps for starting coding sessions smoothly.

- `packages/app/src/new-workspace-launch/composer-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/new-workspace-launch/target.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/new-workspace-launch/target.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/pane-find/`

Paseo's files here: The client app uses these files to handle cross-platform search keyboard shortcuts in panes, which hizuri keeps so users can find text across desktop and mobile screens.

- `packages/app/src/pane-find/find-shortcut.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/pane-find/find-shortcut.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/pane-find/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/panels/`

Paseo's files here: The client app uses these files to register and render workspace panels such as agent chats, diffs, and terminals, which hizuri keeps for organizing multi-pane layouts.

- `packages/app/src/panels/agent-facts-line.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/agent-facts-line.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/agent-panel-descriptor.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/agent-panel-load-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/agent-panel-load-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/agent-panel.tsx` — Chat panel rendering conversation streams, composer inputs, voice indicators, and stage views. Why: Main conversation interface used across phone, web, and desktop clients to interact with agents. checked: nothing personal
- `packages/app/src/panels/agent-tracks.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/diff-panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/draft-panel-descriptor.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/draft-panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/file-panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/files-panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/new-tab-panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pane-context.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pane-context.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pane-subtitle.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/panel-instance-attributes.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/panel-instance-attributes.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/panel-manifest.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/panel-manifest.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/panel-registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/provider-subagent-panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pull-request-availability.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pull-request-panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/register-panels.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/retained-chat-content.browser.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/retained-chat-content.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/retained-chat-content.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/retained-chat-content.web.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/setup-panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/terminal-panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/use-add-file-to-chat.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/use-panel-state.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/panels/changes/`

Paseo's files here: The client app uses these files to manage presentation modes for review changes and tree diffs, which hizuri keeps so users can inspect modified code files.

- `packages/app/src/panels/changes/presentation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/changes/presentation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/changes/state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/changes/state.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/panels/file/`

Paseo's files here: The client app uses this file to define schema and defaults for file panel sidebar visibility, which hizuri keeps to remember user tree preferences across sessions.

- `packages/app/src/panels/file/state.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/panels/pull-request/`

Paseo's files here: The client app uses these files to discover, fetch, and display git pull request summaries and review activity, which hizuri keeps for in-app code review integration.

- `packages/app/src/panels/pull-request/activity.integration.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pull-request/activity.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pull-request/activity.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pull-request/data.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pull-request/descriptor.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pull-request/discovery.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pull-request/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pull-request/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/panels/pull-request/state.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/performance/`

Paseo's files here: The client app uses this file to pipe performance trace sections into optional native profilers, which hizuri keeps to monitor daemon client responsiveness during profile builds.

- `packages/app/src/performance/native-trace.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/`

Paseo's files here: The client app uses these files to load, register, and route third-party plugin contributions, which hizuri keeps to allow extensions to add custom screens and features.

- `packages/app/src/plugins/actions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/catalog-sync.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/client-runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/contribution-host.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/evaluate.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/evaluate.ts` — Plugin client bundle evaluator injecting host APIs, React components, and native modules into plugins. Why: Enables loaded client plugins to render custom UI using the host application's native libraries. checked: nothing personal
- `packages/app/src/plugins/host-navigation-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/host-navigation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/host-navigation.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/host-navigation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/icons.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/icons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/installation-provider.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/installation-provider.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/native-modules.ts` — Module registry exposing native animation, gesture, and rendering packages to plugin bundles. Why: Imported by plugin evaluation runtime to grant plugin components access to native graphics and gestures. checked: nothing personal
- `packages/app/src/plugins/native-modules.web.ts` — Web fallback registry exposing compatible animations and gesture modules to web plugin bundles. Why: Replaces native-modules.ts on web builds to exclude unsupported native engines like Skia and Lottie. checked: nothing personal
- `packages/app/src/plugins/navigation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/platform.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/popover.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/registry-hooks.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/registry-lifecycle.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/registry-requirements.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/registry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/routes.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/routes.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/sidebar-groups.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/sidebar-groups.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/surface-contribution.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/surface-contribution.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/surface-error-boundary.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/surface-error-boundary.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/surface-screen.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/theme.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/theme.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/types.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/attachments/`

Paseo's files here: The client app uses these files to pick and attach external plugin resources to prompt composers, which hizuri keeps so agents can reference tickets and third-party data.

- `packages/app/src/plugins/attachments/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/attachments/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/attachments/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/attachments/picker.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/attachments/pill.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/buttons/`

Paseo's files here: The client app uses these files to register and render custom action buttons provided by plugins, which hizuri keeps to let extensions expose interactive controls in the interface.

- `packages/app/src/plugins/buttons/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/buttons/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/buttons/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/buttons/store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/buttons/validation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/buttons/view.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/client-slash-commands/`

Paseo's files here: The client app uses these files to resolve and run slash commands contributed by installed plugins, which hizuri keeps so users can trigger client-side plugin actions from composer inputs.

- `packages/app/src/plugins/client-slash-commands/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/client-slash-commands/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/client-slash-commands/model.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/client-state/`

Paseo's files here: The client app uses these files to capture immutable snapshots of workspace and agent states for plugins, which hizuri keeps to safely expose environment context without side effects.

- `packages/app/src/plugins/client-state/snapshots.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/client-state/snapshots.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/client-state/source.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/command-center/`

Paseo's files here: The client app uses these files to inject plugin actions into the command palette based on focused tabs, which hizuri keeps for quick keyboard-driven tool execution.

- `packages/app/src/plugins/command-center/context.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/command-center/context.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/command-center/contributions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/command-center/contributions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/command-center/registration.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/hosts/`

Paseo's files here: The client app uses these files to expose available daemon hosts and connection statuses to plugins, which hizuri keeps so plugins can communicate across connected servers.

- `packages/app/src/plugins/hosts/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/hosts/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/react-native/`

Paseo's files here: The client app uses these files to provide UI bridge primitives like clipboards, modals, and toasts to plugin sandboxes, which hizuri keeps so plugins render native components safely.

- `packages/app/src/plugins/react-native/clipboard.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/react-native/clipboard.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/react-native/markdown.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/react-native/modal.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/react-native/scroll-view.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/react-native/streamed-text.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/react-native/text-input.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/react-native/toast.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/react-native/ui.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/settings/`

Paseo's files here: The client app uses these files to display and route configuration screens for installed plugins, which hizuri keeps so users can manage extension options per server.

- `packages/app/src/plugins/settings/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/settings/routes.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/settings/use-settings.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/sidebar-items/`

Paseo's files here: The client app uses these files to render custom navigation rows and popovers supplied by plugins, which hizuri keeps to let extensions attach into the main sidebar.

- `packages/app/src/plugins/sidebar-items/frame.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/sidebar-items/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/sidebar-items/kit.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/sidebar-items/legacy.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/themes/`

Paseo's files here: The client app uses this file to apply custom light and dark color schemes provided by plugins, which hizuri keeps to support user interface theme personalization.

- `packages/app/src/plugins/themes/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/timeline/`

Paseo's files here: The client app uses these files to transform and display custom timeline entries contributed by plugins, which hizuri keeps to enrich session history with external event items.

- `packages/app/src/plugins/timeline/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/timeline/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/timeline/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/timeline/projection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/timeline/projection.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/timeline/view.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/timeline/view.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/plugins/workspace-panels/`

Paseo's files here: The client app uses these files to register and position custom workspace panel tabs contributed by plugins, which hizuri keeps so extensions can embed dedicated panel views.

- `packages/app/src/plugins/workspace-panels/locations.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/workspace-panels/locations.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/workspace-panels/panel.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/workspace-panels/resolution.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/plugins/workspace-panels/resolution.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/polyfills/`

Paseo's files here: The client app uses these files to install web standards like crypto and orientation helpers on mobile runtimes, which hizuri keeps to ensure platform compatibility during app startup.

- `packages/app/src/polyfills/crypto.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/polyfills/crypto.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/polyfills/install-crypto-polyfills.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/polyfills/install-crypto-polyfills.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/polyfills/install-early.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/polyfills/navigator-startup.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/polyfills/navigator.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/polyfills/screen-orientation.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/projects/`

Paseo's files here: The client app uses these files to manage project metadata, icon caching, and workspace directories, which hizuri keeps to let users organize and edit their project lists.

- `packages/app/src/projects/edit-form.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/edit-form.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/host-project-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/host-projects.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/host-projects.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/icon-cache-storage.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/icon-cache-storage.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/icon-cache.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/icon-cache.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/icon-target.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/icon-target.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/icons.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/icons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/import-project-icon.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/import-project-icon.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/project-remove.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/project-remove.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/workspace-structure.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/projects/workspace-structure.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/provider-selection/`

Paseo's files here: The client app uses these files to search model catalogs and resolve matching AI model definitions, which hizuri keeps so users can pick supported provider models.

- `packages/app/src/provider-selection/model-catalog.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/provider-selection/model-catalog.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/provider-selection/provider-selection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/provider-selection/provider-selection.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/provider-selection/resolve-agent-form.test.ts` — Tests for agent configuration form resolution, default model selection, and free brain autoselection. Why: Executed by vitest to ensure draft forms correctly configure providers and fallback defaults. checked: nothing personal
- `packages/app/src/provider-selection/resolve-agent-form.ts` — Form resolution logic for selecting agent providers, models, modes, and thinking options with free starter brain fallback. Why: Imported by agent creation and composer forms to resolve valid agent configuration states and default providers. checked: nothing personal

## `packages/app/src/push-notifications/`

Paseo's files here: The client app uses these files to export platform-specific start and revoke hooks for push alerts, which hizuri keeps so mobile devices receive agent background updates.

- `packages/app/src/push-notifications/index.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/push-notifications/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/push-notifications/index.web.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/push-notifications/internal/`

Paseo's files here: The client app uses these files to register native push tokens with daemon servers and persist storage keys, which hizuri keeps to deliver notifications when agents finish tasks.

- `packages/app/src/push-notifications/internal/subscriptions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/push-notifications/internal/types.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/review/`

Paseo's files here: The client app renders code review sheets, diff comment surfaces, and state stores, letting the user comment on file changes while reviewing agent modifications.

- `packages/app/src/review/comment-sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/review/geometry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/review/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/review/state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/review/store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/review/store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/review/surface.test.tsx` — Tests for the inline diff review editor surface, comments mapping, and review draft controller. Why: Runs via vitest to ensure code review draft comments and diff target gutters function properly. checked: nothing personal
- `packages/app/src/review/surface.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/review/editor/`

Paseo's files here: The client app manages inline comment editing and drafting state for code diffs, enabling the user to write and save precise feedback on code changes.

- `packages/app/src/review/editor/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/review/editor/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/review/feedback/`

Paseo's files here: The client app packages diff review comments into structured feedback attachments, allowing the user to send review findings directly into agent conversation tabs.

- `packages/app/src/review/feedback/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/review/feedback/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/review/feedback/surface.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/review/feedback/use-feedback.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/runtime/`

Paseo's files here: The client app handles daemon startup detection, host confirmations, and WebSocket factory transports, keeping cross-platform client connections to local and remote daemons stable.

- `packages/app/src/runtime/daemon-start-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/daemon-start-service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/host-confirmation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/host-features.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/host-runtime.test.ts` — Tests for host runtime controller, password parsing from URL fragments, and default host bootstrap seeding. Why: Runs under vitest to verify daemon connection logic, password fragment extraction, and host store behaviors. checked: nothing personal
- `packages/app/src/runtime/host-runtime.ts` — Runtime store and controller managing daemon connections, host pairing, directory synchronization, and default host seeding. Why: Imported across the client app to maintain active daemon connections and host directory state. checked: nothing personal
- `packages/app/src/runtime/subscription-fixture.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/websocket-factory.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/websocket-factory.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/websocket-test-global-setup.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/websocket-transport.browser.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/zuri-default-host.test.ts` — Tests for parsing and seeding the default daemon host environment configuration. Why: Runs under vitest to test fallback host address parsing and retry seeding logic. checked: nothing personal
- `packages/app/src/runtime/zuri-default-host.ts` — Helper functions to parse and auto-seed a default build-time daemon host endpoint into storage. Why: Imported by HostRuntimeStore to connect out-of-the-box to a starter daemon without manual pairing. checked: nothing personal

## `packages/app/src/runtime/activity/`

Paseo's files here: The client app schedules and coalesces timestamp updates for agent activity, avoiding UI churn while tracking recent agent interaction times across devices.

- `packages/app/src/runtime/activity/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/activity/last-activity-coalescer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/activity/last-activity-scheduler.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/activity/types.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/runtime/directory-sync/`

Paseo's files here: The client app synchronizes agent lists and workspace replicas with the daemon, keeping the local session store aligned with active background coding tasks.

- `packages/app/src/runtime/directory-sync/agent-replica.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/directory-sync/agent-replica.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/directory-sync/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/directory-sync/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/directory-sync/transaction.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/directory-sync/transaction.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/directory-sync/workspace-replica.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/directory-sync/workspace-replica.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/runtime/directory-sync/internal/`

Paseo's files here: The client app projects agent snapshot changes into local stores and tracks turn liveness, ensuring agent status updates propagate cleanly to UI views.

- `packages/app/src/runtime/directory-sync/internal/agent-store.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/runtime/replica-cache/`

Paseo's files here: The client app stores offline snapshots of projects, workspaces, and agents using SQLite or web storage, enabling rapid app loads before daemon revalidation completes.

- `packages/app/src/runtime/replica-cache/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/legacy-cleanup.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/legacy-cleanup.web.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/legacy-cleanup.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/row-store-factory.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/row-store-factory.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/row-store-factory.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/row-store-schema.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/row-store-sqlite.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/row-store.contract.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/row-store.native.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/row-store.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/row-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/row-store.web.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/runtime/replica-cache/row-store.web.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/schedules/`

Paseo's files here: The client app manages scheduled agent runs, cadence selection, and form state, letting the user configure repeating automated tasks across connected hosts.

- `packages/app/src/schedules/aggregated-schedules.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/schedules/aggregated-schedules.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/schedules/schedule-cadence-options.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/schedules/schedule-cadence-options.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/schedules/schedule-derivation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/schedules/schedule-derivation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/schedules/schedule-form-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/schedules/schedule-form-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/schedules/schedule-project-targets.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/schedules/schedule-project-targets.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/schedules/use-schedule-form-model.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/schedules/use-schedule-form-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/schedules/use-schedule-form-provider-snapshot.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/`

Paseo's files here: The client app provides top-level views for workspace creation, project selection, schedules, and active sessions, giving the user core navigation across coding environments.

- `packages/app/src/screens/new-workspace-empty.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace-empty.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace-fork-context.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace-fork-context.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace-initial-context.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace-initial-context.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace-picker-item.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace-picker-item.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace-picker-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace-picker-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace-screen.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace-terminal.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace-terminal.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/open-project-screen.tsx` — The home screen view for opening projects, importing sessions, configuring providers, and pairing devices. Why: Rendered by the router when a user arrives at the root or project selection screen. checked: nothing personal
- `packages/app/src/screens/project-settings-screen.tsx` — The project settings view displaying project configuration, metadata prompts, scripts, and worktree settings. Why: Rendered by navigation routes when viewing or editing configuration for a project on a host. checked: nothing personal
- `packages/app/src/screens/projects-screen.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/projects-screen.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/schedules-screen-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/schedules-screen-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/schedules-screen.tsx` — The schedules view displaying active and ended agent schedules with filtering and editing support. Why: Rendered by the router when navigating to scheduled agent jobs across hosts. checked: nothing personal
- `packages/app/src/screens/sessions-screen.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings-screen.tsx` — Main settings navigation screen organizing client, host, appearance, and assistant preferences. Why: Loaded by the app router when navigating to settings across desktop, web, and mobile. checked: nothing personal
- `packages/app/src/screens/startup-splash-screen.tsx` — A splash screen component displaying an animated hizuri mark and startup error diagnostic logs. Why: Rendered by the app shell during initial app boot and daemon startup failure screens. checked: nothing personal

## `packages/app/src/screens/agent/`

Paseo's files here: The client app computes route scroll anchors for agent timeline screens, ensuring chat and action streams scroll smoothly to bottom positions upon initial entry.

- `packages/app/src/screens/agent/agent-ready-screen-bottom-anchor.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/agent/agent-ready-screen.bottom-anchor.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/new-workspace/`

Paseo's files here: The client app coordinates background agent creation, project selection, and draft handling, allowing the user to initiate new workspace tasks seamlessly.

- `packages/app/src/screens/new-workspace/background-handoff.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/background-handoff.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/import-session-button.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/project-icon-targets.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/project-icon-targets.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/project-picker.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/project-picker.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/project-selection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/project-selection.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/screen-presence.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/screen-presence.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/new-workspace/form/`

Paseo's files here: The client app provides form controls, triggers, and picker icons for new workspaces, letting the user configure project roots and initial prompt parameters.

- `packages/app/src/screens/new-workspace/form/field-trigger.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/form/icons.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/form/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/form/launch-control.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/new-workspace/form/options.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/settings/`

Paseo's files here: The client app displays daemon configuration cards, host connection options, and plugin settings, enabling the user to customize local and remote runtime options.

- `packages/app/src/screens/settings/app-logs-row.tsx` — Settings row component with a switch to toggle diagnostic log uploads to the daemon. Why: Rendered in SettingsScreen diagnostics section to control the uploadAppLogs setting. checked: nothing personal
- `packages/app/src/screens/settings/browser-tools-card.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/browser-tools-config.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/browser-tools-config.ts` — Configuration helpers and warning text for browser automation tools. Why: Imported by browser settings views to manage daemon browser tool permissions and state patches. checked: nothing personal
- `packages/app/src/screens/settings/daemon-lifecycle.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/daemon-lifecycle.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/daemon-reconnect.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/daemon-reconnect.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/editor-section.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/files-section.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/host-appearance-section.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/host-page.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/keyboard-shortcuts-section.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/metadata-generation-page.tsx` — Settings page component for configuring the model used to generate session metadata. Why: Rendered when configuring daemon metadata generation models via host settings. checked: nothing personal
- `packages/app/src/screens/settings/plugin-install-form-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/plugin-install-form-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/plugins-page-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/plugins-page-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/plugins-page.test.tsx` — Tests for the host plugins settings page and plugin log modal interactions. Why: Verified by vitest to ensure plugin management and log viewing behave correctly. checked: nothing personal
- `packages/app/src/screens/settings/plugins-page.tsx` — Host plugins management screen with reload, enable, logs, and installation controls. Why: Rendered in settings when managing installed plugins and viewing plugin output streams. checked: nothing personal
- `packages/app/src/screens/settings/providers-section.test.tsx` — Tests for the AI provider settings section and model selection triggers. Why: Executed by vitest to verify provider toggling and configuration actions in the settings UI. checked: nothing personal
- `packages/app/src/screens/settings/providers-section.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/terminal-profile-edit-modal.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/terminal-profile-edit-modal.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/settings/appearance/`

Paseo's files here: The client app renders live syntax-highlighted code diff previews, giving the user instant visual feedback when selecting custom editor and theme colors.

- `packages/app/src/screens/settings/appearance/appearance-preview.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/appearance/appearance-section.tsx` — Settings section component for theme, font styling, and stage switcher preferences. Why: Rendered in the app settings screen to let users customize appearance and Show tab controls. checked: nothing personal
- `packages/app/src/screens/settings/appearance/preview-snippet.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/settings/appearance/show-tab-switcher-row.tsx` — Settings select row for picking the stage tab switcher style. Why: Rendered inside AppearanceSection to update the user's chosen Show tab switcher preference. checked: nothing personal

## `packages/app/src/screens/settings/chat/`

- `packages/app/src/screens/settings/chat/chat-section.tsx` — Settings section for assistant presentation options, reasoning visibility, and overlay floating modes. Why: Rendered in SettingsScreen to manage chat details and overlay permissions. checked: nothing personal

## `packages/app/src/screens/settings/free-brain/`

- `packages/app/src/screens/settings/free-brain/free-brain-section.tsx` — Settings section displaying connection status and toggle for the starter model relay provider. Why: Rendered in SettingsScreen to enable or disable the bundled free relay provider. checked: nothing personal

## `packages/app/src/screens/settings/general/`

Paseo's files here: The client app configures message dispatch preferences like interrupt or queue modes, letting the user control how new prompts interact with running agents.

- `packages/app/src/screens/settings/general/sending-section.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/settings/open-location/`

Paseo's files here: The client app configures pane placement preferences for files and diffs, allowing the user to customize where explorer links and pull requests open.

- `packages/app/src/screens/settings/open-location/open-location-section.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/settings/sidebar/`

Paseo's files here: The client app configures sidebar navigation icon order and visibility, letting the user personalize quick-access shortcuts across desktop and tablet interfaces.

- `packages/app/src/screens/settings/sidebar/sidebar-nav-section.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/settings/terminal/`

Paseo's files here: The client app manages terminal scrollback buffer settings, enabling the user to tune console history memory limits according to device capabilities.

- `packages/app/src/screens/settings/terminal/terminal-section.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/workspace/`

Paseo's files here: The client app manages tab rows, side panels, pane splits, and explorer sidebars, organizing complex multi-agent workspaces on desktop and mobile screens.

- `packages/app/src/screens/workspace/explorer-sidebar.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/sheet-tabs.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/use-mounted-tab-set.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/use-mounted-tab-set.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/use-workspace-checkout-status.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/use-workspace-tab-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/use-workspace-tab-rename.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/visible-agent-ids.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/visible-agent-ids.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-bulk-close.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-bulk-close.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-deck-retention.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-deck-retention.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-desktop-tabs-row.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-draft-agent-config.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-draft-agent-config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-draft-pane-focus.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-draft-pane-focus.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-explorer-toggle.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-file-open-command.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-file-open-command.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-header-menu.tsx` — Header dropdown menus for workspace actions and ending voice sessions on desktop and mobile. Why: Imported by workspace header components to trigger workspace actions, script navigation, and voice session termination. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-header-project-row.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-header-source.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-new-tab-menu.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-pane-content.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-pane-content.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-pane-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-pane-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-panel-host.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-route-state-views.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-route-state.test.ts` — Tests for the workspace route state resolver covering offline, recovery, and loading conditions. Why: Executed by vitest to verify correct workspace state transitions and brand-specific update messages. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-route-state.ts` — A state resolver determining whether a workspace route is loading, missing, archived, or ready. Why: Imported by workspace routing screens to gate workspace display against host connection and recovery state. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-screen.tsx` — The main workspace screen component managing tabs, panels, layouts, and agent header controls. Why: Loaded by the app router as the primary view for workspace sessions and agent interactions. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-source-of-truth.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-tab-chip-backdrop.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-tab-layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-tab-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-tab-menu.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-tab-menu.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-tab-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-tab-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-tab-presentation.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-tab-trailing-accessory.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-tab-trailing-accessory.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/workspace-tabs-types.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/workspace/compact-workspace-header/`

Paseo's files here: The client app provides compact header toolbars and tab switchers, giving the user quick navigation between files and agents on narrow mobile screens.

- `packages/app/src/screens/workspace/compact-workspace-header/index.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/compact-workspace-header/tab-switcher.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/workspace/explorer-sidebar/`

Paseo's files here: The client app manages layout geometry and gesture containers for the file explorer sidebar, supporting docked desktop views and mobile overlay panels.

- `packages/app/src/screens/workspace/explorer-sidebar/frame-props.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/explorer-sidebar/frame.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/explorer-sidebar/geometry-types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/explorer-sidebar/geometry.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/explorer-sidebar/geometry.web.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/workspace/scripts/`

Paseo's files here: The client app displays running workspace scripts and service URLs, enabling the user to inspect background commands and launch associated web preview links.

- `packages/app/src/screens/workspace/scripts/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/scripts/script-marks.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/scripts/script-status.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/scripts/script-status.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/scripts/use-workspace-script-actions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/scripts/workspace-scripts-button.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/scripts/workspace-scripts-button.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/scripts/workspace-scripts-menu-pages.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/screens/workspace/terminals/`

Paseo's files here: The client app queries and tracks embedded terminal sessions, letting the user manage and navigate interactive command shells within individual workspaces.

- `packages/app/src/screens/workspace/terminals/state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/terminals/state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/screens/workspace/terminals/use-workspace-terminals.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/show-media/`

- `packages/app/src/show-media/app-lane.ts` — Helper functions for opening external Android media applications and controlling playback via native modules. Why: Imported by media host handlers to route playback commands to external audio and video apps. checked: nothing personal
- `packages/app/src/show-media/model.test.ts` — Tests for parsing media tool calls, stream selection, and media host state transitions. Why: Executed by vitest to ensure agent tool outputs correctly translate into media playback commands. checked: nothing personal
- `packages/app/src/show-media/model.ts` — Types and parsers for agent media playback plans, playback commands, and fresh stream item calls. Why: Imported by show-media hooks and bridge modules to parse media instructions from session streams. checked: nothing personal
- `packages/app/src/show-media/player-handle.ts` — The interface defining control commands passed to media players on the stage. Why: Imported by the show-media hook and YouTube players to command media playback. checked: nothing personal
- `packages/app/src/show-media/use-show-media.ts` — React hook that executes incoming media calls by launching external apps or controlling players. Why: Used by stage components to track stream calls and drive active media playback. checked: nothing personal
- `packages/app/src/show-media/youtube-bridge.test.ts` — Tests for YouTube bridge URL generation, command injection scripts, event parsing, and fallbacks. Why: Runs under vitest to verify YouTube player bridge encoding and message handling. checked: nothing personal
- `packages/app/src/show-media/youtube-bridge.ts` — Helpers to construct YouTube embed URLs, inject control scripts, parse page events, and handle fallback URLs. Why: Imported by YouTube player components to communicate with the embedded player page. checked: nothing personal
- `packages/app/src/show-media/youtube-player.tsx` — Native WebView component rendering YouTube embeds with command injection and event parsing. Why: Renders embedded YouTube media players on native platforms within the stage blocks. checked: nothing personal
- `packages/app/src/show-media/youtube-player.web.tsx` — Web iframe component rendering YouTube playback via window message communication. Why: Renders embedded YouTube video playback on web browsers within the stage blocks. checked: nothing personal

## `packages/app/src/show/`

- `packages/app/src/show/bridge.test.ts` — Tests for Show stage message parsing, CSP security strings, and DOM patch behavior. Why: Executed by vitest to verify safe messaging and in-place DOM updates for Show stage pages. checked: nothing personal
- `packages/app/src/show/bridge.ts` — Types and parsers for messages exchanged between the app and the Show stage page. Why: Imported by Show frame components to synchronize themes, stage data, and ready events safely. checked: nothing personal
- `packages/app/src/show/frame-sync.ts` — A React hook synchronizing theme palettes, localized strings, and render messages with the Show stage. Why: Imported by native and web ShowFrame implementations to coordinate frame lifecycle events. checked: nothing personal
- `packages/app/src/show/frame.tsx` — A React Native WebView container hosting the Show stage page with restricted navigation. Why: Rendered on mobile devices to display agent-driven Show content inside a sandboxed WebView. checked: nothing personal
- `packages/app/src/show/frame.web.tsx` — A web iframe container hosting the Show stage page with strict sandbox policies. Why: Rendered in web browsers to display agent-driven Show content inside an isolated iframe. checked: nothing personal
- `packages/app/src/show/model.test.ts` — Tests for parsing show tool names, limits output, screen URLs, and deriving window state. Why: Runs under vitest to verify that agent timeline items derive the correct stage state. checked: nothing personal
- `packages/app/src/show/model.ts` — Data structures and parser functions that turn agent stream tool calls into UI show state. Why: Imported by stage UI hooks and components to extract widgets, windows, and streaming screens. checked: nothing personal
- `packages/app/src/show/page.ts` — Inline CSS, HTML template, and vanilla JavaScript that render stage widgets inside an isolated frame. Why: Bundled into show frame components to render dynamic widget layouts without external dependencies. checked: nothing personal
- `packages/app/src/show/screen-frame.tsx` — Native WebView component for streaming an agent browser desktop with injected layout overrides. Why: Renders agent browser streams on native mobile devices within the Show window. checked: nothing personal
- `packages/app/src/show/screen-frame.web.tsx` — Sandboxed iframe component for displaying the agent browser desktop stream on web browsers. Why: Renders agent browser streams within the Show window on the web client. checked: nothing personal
- `packages/app/src/show/show-host.tsx` — Overlay component that hosts and displays the assistant's Show window and screen frames. Why: Used by desktop and wide layout chat views to display stage content alongside conversation. checked: nothing personal

## `packages/app/src/sidebar-nav/`

Paseo's files here: The client app resolves and orders sidebar navigation items, ensuring core navigation links and installed plugin entries appear correctly in the main menu.

- `packages/app/src/sidebar-nav/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/sidebar-nav/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/sidebar-nav/use-sidebar-nav-items.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/simple-mode/`

- `packages/app/src/simple-mode/model.test.ts` — Unit tests for simple mode agent selection and section visibility rules. Why: Tested by vitest to verify correct agent picking and settings filtering for simple mode. checked: nothing personal
- `packages/app/src/simple-mode/model.ts` — Helper functions and constants defining visible sections and primary agent selection for simple mode. Why: Used by simple mode UI and navigation components to filter settings and select active agent. checked: nothing personal
- `packages/app/src/simple-mode/page-store.ts` — Zustand store tracking requested and active agent pages for simple mode navigation. Why: Used by simple mode sidebar and pager components to sync selected tabs and navigation states. checked: nothing personal
- `packages/app/src/simple-mode/simple-sidebar.tsx` — Simplified sidebar component providing direct access to primary assistant pages and settings. Why: Rendered in simple mode layout to give quick navigation between face, chat, and show views. checked: nothing personal

## `packages/app/src/stage/`

- `packages/app/src/stage/aurora.tsx` — Animated Skia canvas backdrop rendering floating aurora glow and dot matrix effects. Why: Imported by native stage views to render animated visual atmosphere behind stage components. checked: nothing personal
- `packages/app/src/stage/aurora.web.tsx` — Web-compatible SVG and CSS gradient fallback for the stage backdrop effect. Why: Imported by web stage views where Skia native shaders are unavailable. checked: nothing personal
- `packages/app/src/stage/backdrop.ts` — Utility calculating centered dot matrix coordinate grids for stage backdrops. Why: Imported by both native and web aurora implementations to position backdrop points consistently. checked: nothing personal
- `packages/app/src/stage/chart-geometry.ts` — Geometry calculations, value scales, and path generators for native stage charts and pie slices. Why: Native stage chart blocks import these helpers to project coordinates and draw SVG paths. checked: nothing personal
- `packages/app/src/stage/emoji.test.ts` — Tests for leading emoji extraction, tone mapping, and emoji character detection. Why: Vitest runs this to verify stage titles correctly convert status emojis into semantic theme tones. checked: nothing personal
- `packages/app/src/stage/emoji.ts` — Helper functions to parse leading status emoji into semantic tones and strip them from stage titles. Why: Stage headers and lists use this to maintain consistent brand styling instead of rendering raw emojis. checked: nothing personal
- `packages/app/src/stage/live-scene.tsx` — The live scene renderer for displaying animated dynamic topics, metrics, comparisons, and steps. Why: The visual front tab imports this to animate conversation updates and status changes on screen. checked: nothing personal
- `packages/app/src/stage/lottie-library.ts` — A generator of thematic Lottie animation data structures for loading, success, error, and win states. Why: The stage lottie block player imports this to display dynamic vector animations matching theme colors. checked: nothing personal
- `packages/app/src/stage/model.test.ts` — Tests for stage change application, tab visibility resolution, block layout, and chart geometry. Why: Vitest runs this to ensure stage updates and tab ordering behave correctly across client updates. checked: nothing personal
- `packages/app/src/stage/model.ts` — State types and transformation helpers for stage tabs, block hierarchies, row layouts, and revisions. Why: Stage components use these utilities to parse incoming daemon stage updates and determine active tabs. checked: nothing personal
- `packages/app/src/stage/motion.ts` — Reanimated transition presets, keyframe animations, and timing utilities for stage tabs and blocks. Why: Imported by stage layout components to produce consistent entry and exit animations. checked: nothing personal
- `packages/app/src/stage/palette.tsx` — React context and utility functions providing brand spectrum colors and semantic tones for stage components. Why: All stage blocks and charts consume this context to adapt colors to the active theme. checked: nothing personal
- `packages/app/src/stage/perch-model.ts` — Coordinate geometry, pose dimensions, visibility rules, and hop math for the assistant avatar perched on stage blocks. Why: Imported by perch.tsx to calculate avatar placement, bounding boxes, scrolling targets, and hop trajectories. checked: nothing personal
- `packages/app/src/stage/perch-store.ts` — Zustand store tracking whether the assistant avatar's perch window is currently mounted. Why: Imported across face and stage components to ensure only one WebGL face canvas runs simultaneously. checked: nothing personal
- `packages/app/src/stage/perch.tsx` — React Native components and hooks that render and animate the perched assistant avatar over stage blocks. Why: Imported by stage-page.tsx to render the floating interactive avatar over active stage tab content. checked: nothing personal
- `packages/app/src/stage/stage-cache.test.ts` — Tests for saving, loading, size checking, and cache dropping of stage data in AsyncStorage. Why: Verified by vitest to ensure stage cache adheres to storage limits and recovers from read errors. checked: nothing personal
- `packages/app/src/stage/stage-cache.ts` — Persistence functions to load and save serialized stage state in AsyncStorage within size limits. Why: Imported by use-stage.ts to support offline caching and instant cold starts of the stage view. checked: nothing personal
- `packages/app/src/stage/stage-page.tsx` — Main stage screen component rendering tab tracks, switchers, perched avatar, and block content. Why: Imported by agent page routing to display the agent's secondary visual display stage. checked: nothing personal
- `packages/app/src/stage/type.ts` — Font constants and a hook loading the custom typography families used across the stage. Why: Imported by stage components and tab switchers to load and apply typography consistently. checked: nothing personal
- `packages/app/src/stage/use-stage.ts` — React hook subscribing to daemon stage updates, caching stage state, and sending tab actions. Why: Imported by stage screens and views to synchronize live stage state with the daemon. checked: nothing personal

## `packages/app/src/stage/blocks/`

- `packages/app/src/stage/blocks/basic.tsx` — React components rendering core stage widgets including stats, progress bars, rings, and cards. Why: Used by stage block renderers to display numeric metrics, animated progress, and status panels. checked: nothing personal
- `packages/app/src/stage/blocks/block-context.ts` — React context providing stage block interactions, media origin URLs, and secret submission handlers. Why: Used by stage blocks to trigger actions, access media, and submit sensitive inputs safely. checked: nothing personal
- `packages/app/src/stage/blocks/block-enter.ts` — React context supplying cascade entrance animation delay values to child stage components. Why: Used by nested block items and rows to stagger entrance animations sequentially. checked: nothing personal
- `packages/app/src/stage/blocks/block-view.tsx` — Dispatcher component that selects, wraps, and animates individual stage blocks and block lists. Why: Rendered by stage tabs and pages to construct the complete interactive stage layout. checked: nothing personal
- `packages/app/src/stage/blocks/brand.tsx` — Stage brand block views including verdicts, big figures, side-by-side comparisons, and animated timelines. Why: Imported by stage block registries to render styled story and answer blocks on the stage. checked: nothing personal
- `packages/app/src/stage/blocks/canvas.tsx` — A stage multi-pane canvas view rendering web pages, pictures, videos, or audio blocks simultaneously. Why: Rendered by the stage viewer when a tab contains multiple panes instead of a scrolling block list. checked: nothing personal
- `packages/app/src/stage/blocks/chart.tsx` — Native SVG chart components supporting morphing line, bar, and pie charts with animated transitions. Why: Rendered by the stage view whenever the agent sends a show_chart block. checked: nothing personal
- `packages/app/src/stage/blocks/content.tsx` — Text and status row components, step progression trees, and delayed reveal animations for stage cards. Why: Imported by stage components to render agent text, lists, and job step indicators. checked: nothing personal
- `packages/app/src/stage/blocks/dots.tsx` — SVG dot field backgrounds, bent grid calculations, and animated core bloom graphics. Why: Used by verdict cards, covers, and dividers across stage blocks for background brand visuals. checked: nothing personal
- `packages/app/src/stage/blocks/fill.ts` — Helper function selecting full-screen fill components for single web, image, or media blocks in a tab. Why: Used by stage tab renderers to detect and mount full-bleed view components. checked: nothing personal
- `packages/app/src/stage/blocks/hold-still.ts` — A hook disabling agent page swipe gestures and edge panel gestures during pan or zoom actions. Why: Called by stage media and web views to prevent accidental page transitions during user pinches. checked: nothing personal
- `packages/app/src/stage/blocks/limits.tsx` — Subscription usage block rendering progress rings, countdown timers, and bar meters for API quota windows. Why: Rendered by the stage view when displaying token limits and subscription reset schedules. checked: nothing personal
- `packages/app/src/stage/blocks/lottie-player.tsx` — Native Lottie animation component rendering themed vector animations or remote Lottie JSON assets. Why: Mounted by Lottie stage blocks on native mobile platforms. checked: nothing personal
- `packages/app/src/stage/blocks/lottie-player.web.tsx` — Fallback web component displaying static Unicode glyphs instead of native Lottie animations. Why: Selected by Metro or Webpack bundlers during web builds to avoid native Lottie dependencies. checked: nothing personal
- `packages/app/src/stage/blocks/marks.tsx` — A mapping table resolving icon names to Lucide icon components for stage rows. Why: Imported by stage row renderers to look up and display vector line icons by name. checked: nothing personal
- `packages/app/src/stage/blocks/media.tsx` — Stage media blocks handling video clips, audio tracks, Lottie animations, and cached image displays. Why: Imported by stage block renderers to display video, sound, and animated illustrations sent by the agent. checked: nothing personal
- `packages/app/src/stage/blocks/player-position.ts` — AsyncStorage helper functions to load and save media player playback positions across restarts. Why: Imported by the stage player block to resume media playback from the saved position. checked: nothing personal
- `packages/app/src/stage/blocks/player-spec.test.ts` — Tests for parsing player specs, tab matching, start position logic, and daemon URL resolution. Why: Runs under vitest to verify media player spec extraction and autoplay decisions. checked: nothing personal
- `packages/app/src/stage/blocks/player-spec.ts` — Types and utility functions to read player block specs and compute start positions. Why: Used by the stage media player and player tests to validate media plans and URLs. checked: nothing personal
- `packages/app/src/stage/blocks/player.tsx` — A React Native stage media player component supporting native video, audio, and YouTube. Why: Rendered on the stage to stream media, track playback positions, and respond to remote media commands. checked: nothing personal
- `packages/app/src/stage/blocks/primitives.tsx` — Reusable UI primitives including panels, animated count text, titles, row markers, and pulsing hooks. Why: Imported across stage block components to render cards, headers, and animated values. checked: nothing personal
- `packages/app/src/stage/blocks/ring.tsx` — An animated SVG progress ring gauge component with customizable tone colors. Why: Used by stage metric and progress blocks to display animated circular percentages. checked: nothing personal
- `packages/app/src/stage/blocks/secret.tsx` — A stage block component presenting secure input fields for agent secret requests. Why: Rendered when an agent requests credentials so the user can submit them directly to the vault. checked: nothing personal
- `packages/app/src/stage/blocks/stage-media.test.ts` — Tests for stage media URL resolution, sandboxed HTML page generation, and slide deck drivers. Why: Runs under vitest to verify media URL building and embedded stage document scripts. checked: nothing personal
- `packages/app/src/stage/blocks/stage-media.ts` — Utilities for resolving stage media URLs and preparing sandboxed HTML documents with slide controls. Why: Used by stage media viewers and web views to safely display files and control slides. checked: nothing personal
- `packages/app/src/stage/blocks/table.tsx` — A stage block component that renders animated, horizontally scrollable data tables. Why: Rendered on the stage when an agent outputs tabular data via show_table. checked: nothing personal
- `packages/app/src/stage/blocks/use-image-animation.ts` — A React hook to start and pause animated image playback based on tab visibility. Why: Used by stage media components to save CPU and battery when animated images are off-screen. checked: nothing personal
- `packages/app/src/stage/blocks/use-stage-media-origin.ts` — A React hook to resolve the daemon HTTP origin for active direct connections. Why: Used by stage media components to build full URLs for media files hosted by the daemon. checked: nothing personal
- `packages/app/src/stage/blocks/web.tsx` — The native WebView wrapper for rendering sandboxed HTML stage blocks with zoom, scroll, and slide support. Why: Stage rendering imports this to display secure interactive web content and slide decks on iOS and Android. checked: nothing personal
- `packages/app/src/stage/blocks/web.web.tsx` — The web iframe implementation for displaying sandboxed HTML stage blocks and receiving slide messages. Why: Used by web builds of the app to render isolated HTML content without native WebView dependencies. checked: nothing personal
- `packages/app/src/stage/blocks/zoom.tsx` — A zoomable image viewer component supporting pinch gestures, panning, and double-tap zoom. Why: Stage media blocks import this to let users examine full-tab pictures with animated gestures. checked: nothing personal

## `packages/app/src/stage/tabs/`

- `packages/app/src/stage/tabs/capsule.tsx` — Floating capsule tab switcher component with pan gestures and spring settling. Why: Imported by switcher.tsx to provide the pill-style tab navigation option on the stage. checked: nothing personal
- `packages/app/src/stage/tabs/cards-control.ts` — Hook managing mount state and recede spring animations for the tab cards stack. Why: Imported by capsule.tsx, deck.tsx, and switcher.tsx to coordinate opening and closing card overviews. checked: nothing personal
- `packages/app/src/stage/tabs/cards.tsx` — Cards overview modal displaying 3D stacked tab previews, dismiss gestures, and quick actions. Why: Imported by stage-page.tsx and switcher.tsx to render full-screen interactive tab switcher cards. checked: nothing personal
- `packages/app/src/stage/tabs/deck.tsx` — Chip tab bar and pinch gesture handler for opening the tab cards deck. Why: Imported by switcher.tsx to implement the minimalist chip switcher and pinch-to-reveal gesture. checked: nothing personal
- `packages/app/src/stage/tabs/inside.tsx` — Touch handler and edge indicators for horizontal inside swiping between stage tabs. Why: Imported by switcher.tsx to allow switching tabs via direct content swipes. checked: nothing personal
- `packages/app/src/stage/tabs/model.test.ts` — Unit tests for stage tab navigation physics, drag math, dot rail calculations, and tab classification. Why: Tested by vitest to guarantee tab settling logic, gesture bounds, and layout geometry function correctly. checked: nothing personal
- `packages/app/src/stage/tabs/model.ts` — Calculations, touch zones, geometry constants, and helper functions for tab switchers on the stage. Why: Imported by stage tab switchers and components to handle gesture positions, touch snapping, and layout insets. checked: nothing personal
- `packages/app/src/stage/tabs/parts.tsx` — Shared visual components and styling helpers for tab switchers including frosted glass and page dots. Why: Imported by tab switcher views like TabCapsule, TabRail, and TabDeckChip to render consistent UI elements. checked: nothing personal
- `packages/app/src/stage/tabs/rail.tsx` — The vertical dot-rail tab switcher component for navigating stage tabs along the edge. Why: Imported by TabSwitcherChrome to render the vertical rail navigation option on the stage. checked: nothing personal
- `packages/app/src/stage/tabs/switcher.tsx` — The stage tab switcher dispatcher rendering the active switcher chrome and content wrappers. Why: Imported by stage components to display whichever tab navigation style is selected in settings. checked: nothing personal
- `packages/app/src/stage/tabs/touch-hold.ts` — Touch hold hook and helpers to prevent parent pan gestures during tab switcher interactions. Why: Imported by tab switchers like TabRail and TabCapsule to claim gestures over outer page swipers. checked: nothing personal
- `packages/app/src/stage/tabs/track.tsx` — Reanimated hook and animated slot components managing tab positions and transitions along a track. Why: Imported by tab switchers and stage views to animate tab transitions and position visible tabs. checked: nothing personal

## `packages/app/src/storage/`

Paseo's files here: The client app uses these schemas to validate and persist Zustand storage. Hizuri keeps them to ensure reliable local storage of app settings across restarts.

- `packages/app/src/storage/validated-persist-storage.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/storage/validated-persist-storage.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/storage/validated-storage.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/storage/validated-storage.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/stores/`

Paseo's files here: The client app uses these Zustand stores to track workspaces, layouts, and downloads. Hizuri keeps them to run the client UI state and project management workflows.

- `packages/app/src/stores/add-project-flow-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/create-flow-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/create-flow-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/download-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/download-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/draft-keys.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/draft-keys.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/keyboard-shortcuts-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/keyboard-shortcuts-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/last-workspace-selection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/last-workspace-selection.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/phone-layout-store.ts` — Zustand store tracking whether wide screens should use the phone layout. Why: Imported by layout hooks across the app to determine whether to render mobile or desktop layouts. checked: nothing personal
- `packages/app/src/stores/provider-settings-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/provider-settings-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/session-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/session-store.ts` — Core Zustand session store tracking active daemon sessions, workspaces, agents, and server info. Why: Imported throughout the app to access connected daemon state, features, workspaces, and custom assistant names. checked: nothing personal
- `packages/app/src/stores/sidebar-order-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/sidebar-order-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/sidebar-view-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/sidebar-view-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/voice-live-words-store.ts` — Zustand store holding streaming transcription words received per server during voice interactions. Why: Imported by voice mode views and chat components to show live spoken transcriptions before completion. checked: nothing personal
- `packages/app/src/stores/voice-think-hint-store.ts` — Zustand store tracking expected assistant thinking duration hints sent by the daemon per server. Why: Imported by the voice face page to size thinking animations while waiting for spoken responses. checked: nothing personal
- `packages/app/src/stores/workspace-draft-submission-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/workspace-draft-submission-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/workspace-layout-actions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/workspace-layout-constants.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/workspace-layout-ids.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/workspace-layout-persistence.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/workspace-layout-storage.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/workspace-layout-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/workspace-layout-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/workspace-setup-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/workspace-setup-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/workspace-subagents-integration.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/stores/draft-store/`

Paseo's files here: The client app uses this store to save, restore, and migrate draft user inputs. Hizuri keeps it so unsubmitted messages and attachments survive app reloads.

- `packages/app/src/stores/draft-store/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/draft-store/migration.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/draft-store/migration.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/draft-store/persistence.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/draft-store/persistence.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/draft-store/state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/draft-store/state.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/stores/navigation-active-workspace-store/`

Paseo's files here: The client app uses this store to track and restore active workspace selections. Hizuri keeps it to route the user back to the correct workspace views.

- `packages/app/src/stores/navigation-active-workspace-store/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/navigation-active-workspace-store/navigation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/navigation-active-workspace-store/navigation.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/stores/panel-store/`

Paseo's files here: The client app uses this store to remember sidebar dimensions and panel visibility. Hizuri keeps it to maintain customized panel sizing across mobile and desktop devices.

- `packages/app/src/stores/panel-store/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/panel-store/state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/panel-store/state.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/stores/session-store-hooks/`

Paseo's files here: The client app uses these selector hooks to read daemon sessions and workspaces. Hizuri keeps them to cleanly bind daemon state to the user interface components.

- `packages/app/src/stores/session-store-hooks/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/session-store-hooks/selectors.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/session-store-hooks/selectors.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/stores/sidebar-collapsed-sections-store/`

Paseo's files here: The client app uses this store to remember collapsed sidebar project groups. Hizuri keeps it to preserve the user's workspace folding preferences between sessions.

- `packages/app/src/stores/sidebar-collapsed-sections-store/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/sidebar-collapsed-sections-store/state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/stores/sidebar-collapsed-sections-store/state.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/styles/`

Paseo's files here: The client app uses these styling modules for responsive density and themes. Hizuri keeps them to maintain consistent colors, code surfaces, and layouts across platforms.

- `packages/app/src/styles/code-surface.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/density.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/identity-colors.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/identity-colors.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/install-web-scrollbar-styles.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/install-web-scrollbar-styles.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/settings.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/surface-backdrop.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/syntax-token-styles.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/theme.test.ts` — Tests for theme color palettes, typography scale, sidebar colors, and theme picker options. Why: Runs in vitest to verify light, dark, and pure black theme color tokens and typography values. checked: nothing personal
- `packages/app/src/styles/theme.ts` — Theme configuration defining light and dark semantic color schemes, status tints, and typography options. Why: Imported across app UI components to style backgrounds, text, borders, accents, and syntax highlights. checked: nothing personal
- `packages/app/src/styles/unistyles-inline-style.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/unistyles-inline-style.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/unistyles-inline-style.web.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/unistyles-module-scope.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/unistyles.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/web-scrollbar.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/styles/web-scrollbar.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/subagents/`

Paseo's files here: The client app uses these helpers to track, detach, and archive subagents. Hizuri keeps them so the interface can organize background coding agent child tasks.

- `packages/app/src/subagents/archive-finished.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/archive-finished.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/archive-subagent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/archive-subagent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/close-tab-policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/close-tab-policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/detach-subagent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/detach-subagent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/open-tab-labels.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/open-tab-labels.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/opens-in-sheet.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/opens-in-sheet.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/policies.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/provider-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/provider-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/select.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/select.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/track-presentation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/track-presentation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/track.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/use-archive-finished.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/use-archive-subagent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/use-detach-subagent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/use-open-agent-tab-labels.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/subagents/workspace-root-policy.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/terminal/drop/`

Paseo's files here: The client app uses these utilities to process dropped files into terminal paths. Hizuri keeps them so the user can drag files into running terminal sessions.

- `packages/app/src/terminal/drop/terminal-file-drop.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/drop/terminal-file-drop.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/terminal/find/`

Paseo's files here: The client app uses this component to search text within terminal output. Hizuri keeps it so the user can easily locate log output and command results.

- `packages/app/src/terminal/find/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/terminal/hooks/`

Paseo's files here: The client app uses this hook to retain active workspace terminal sessions. Hizuri keeps it to avoid dropping terminal state while navigating across screens.

- `packages/app/src/terminal/hooks/use-workspace-terminal-session-retention.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/terminal/local-links/`

Paseo's files here: The client app uses these parsers to recognize clickable file paths in terminals. Hizuri keeps them so the user can jump directly to code referenced in output.

- `packages/app/src/terminal/local-links/terminal-local-link-parsing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/local-links/terminal-local-link-parsing.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/local-links/terminal-local-link-provider.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/local-links/terminal-local-link-provider.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/terminal/native-renderer/`

Paseo's files here: The client app uses these renderers to draw terminal grids on mobile devices. Hizuri keeps them to support high-performance terminal views on phones and tablets.

- `packages/app/src/terminal/native-renderer/colors.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/font.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/headless-terminal-output-drain.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/headless-terminal-output-drain.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/headless-terminal-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/headless-terminal-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/native-terminal-benchmark-payload.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-custom-glyph.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-custom-glyph.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-grid-metrics.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-grid-metrics.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-grid-view.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-input-resize-policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-input-resize-policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-input.native.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-input.native.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-key-events.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-mount-policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-mount-policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-performance.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-renderer-capability.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-renderer-capability.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-resize-policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-resize-policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-row-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-row-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-screen-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-screen-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-scrollback.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-selection-gesture.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-selection-gesture.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-selection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-selection.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-size-measurement.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/native-renderer/terminal-size-measurement.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/terminal/runtime/`

Paseo's files here: The client app uses this runtime to coordinate emulator streams and keystrokes. Hizuri keeps it to manage interactive shell sessions across all platforms.

- `packages/app/src/terminal/runtime/terminal-emulator-runtime.browser.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-emulator-runtime.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-emulator-runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-find.browser.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-font.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-key-dispatch.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-key-dispatch.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-paste.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-paste.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-resize-repro.browser.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-restore-options.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-restore-options.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-snapshot.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-snapshot.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-stream-controller.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-stream-controller.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-virtual-keyboard.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/terminal-virtual-keyboard.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/workspace-terminal-session.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/runtime/workspace-terminal-session.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/terminal/webview/`

Paseo's files here: The client app uses this webview wrapper to host browser-based terminal emulators. Hizuri keeps it for web-based terminal rendering fallbacks on mobile systems.

- `packages/app/src/terminal/webview/terminal-emulator-webview-entry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/terminal/webview/terminal-find.browser.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/test/`

Paseo's files here: The client app uses these test harnesses to mock sessions and local storage. Hizuri keeps them to verify client stores and routing logic under unit tests.

- `packages/app/src/test/seed-session.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/test/window-local-storage.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/timeline/`

Paseo's files here: The client app uses these sync policies to stream agent history pages. Hizuri keeps them to display responsive, live-updating agent conversation timelines without redundant fetches.

- `packages/app/src/timeline/fetch-agent-timeline-once.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/fetch-agent-timeline-once.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/replica.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/session-stream-reducers.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/session-stream-reducers.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/sync-status.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/timeline-fetch-policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/timeline-replacement.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/timeline-replacement.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/timeline-sync-plan.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/timeline-sync-plan.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/turn-liveness.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/turn-liveness.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/turn-time.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/turn-time.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/viewed-timeline-sync.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/timeline/viewed-timeline-sync.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/tool-calls/`

Paseo's files here: The client app uses these presenters to format agent tool calls and statuses. Hizuri keeps them so the user can see what tools an agent invokes.

- `packages/app/src/tool-calls/presentation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/tool-calls/presentation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/tool-calls/use-target-agent-title.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/tool-calls/detail-level/`

Paseo's files here: The client app uses these helpers to group and project tool call summaries. Hizuri keeps them to let the user switch between detailed and compact tool views.

- `packages/app/src/tool-calls/detail-level/grouping.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/tool-calls/detail-level/projection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/tool-calls/detail-level/projection.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/tool-calls/detail-level/overview/`

Paseo's files here: The client app uses this modal sheet to present tool call rollups. Hizuri keeps it so the user can inspect batch command executions and modified files.

- `packages/app/src/tool-calls/detail-level/overview/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/tool-calls/detail-level/overview/sheet.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/tool-calls/detail-level/overview/view.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/types/`

Paseo's files here: The client app uses these shared type declarations for activity feeds and terminals. Hizuri keeps them to guarantee type safety across front-end data streams.

- `packages/app/src/types/agent-activity.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/agent-activity.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/agent-directory.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/host-connection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/host-connection.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/react-native-dataset.d.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/react-native-flat-list.d.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/shared.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/stream-event.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/stream.harness.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/stream.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/stream.ts` — Type definitions and helper functions for stream timeline items, user messages, and spoken speech tags. Why: Imported by chat timeline and message presentation components to model and manipulate streaming turn items. checked: nothing personal
- `packages/app/src/types/turndown-plugin-gfm.d.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/use-sync-external-store-with-selector.d.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/types/xterm-addon-ligatures.d.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/updates/`

- `packages/app/src/updates/zuri-updates.native.tsx` — Native component that checks for and applies over-the-air Expo updates during background transitions. Why: Mounted in the native app tree to keep native clients up to date without interrupting voice mode. checked: nothing personal
- `packages/app/src/updates/zuri-updates.tsx` — A dummy fallback component for over-the-air updates on non-native web platforms. Why: Provides a no-op implementation when packages/app is bundled for the web. checked: nothing personal

## `packages/app/src/usage/`

Paseo's files here: The client app uses these visual components to display token balances and quotas. Hizuri keeps them to show the user remaining agent model usage limits.

- `packages/app/src/usage/agent-usage.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/balance-bar.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/bars.browser.test.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/card.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/controls.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/copy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/copy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/display.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/format.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/format.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/host-usage-section.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/hosts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/in-sidebar.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/list.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/meter.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/options.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/pinned.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/pinned.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/preferences.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/preferences.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/queries.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/refresh-button.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/sidebar-item.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/source-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/tone.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/usage-modal.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/usage-section.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/use-relative-time-tick.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/usage/window-bar.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/utils/`

Paseo's files here: The client app uses these utility functions for text formatting, diffs, and routing. Hizuri keeps them to support basic UI helpers and client operations.

- `packages/app/src/utils/agent-attention.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-attention.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-command-autocomplete.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-command-autocomplete.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-directory-reconciliation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-directory-reconciliation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-directory-sync.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-directory-sync.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-directory-update-policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-grouping.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-grouping.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-initialization.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-snapshots.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-snapshots.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-working-directory-suggestions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/agent-working-directory-suggestions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/app-version.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/app-visibility.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/app-visibility.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/assistant-image-source.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/assistant-image-source.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/assistant-markdown-image-source.test.ts` — Tests for resolving the images in the assistant's Markdown to workspace files, a folder name with an accented letter included. Why: Run by vitest for the assistant message renderer. checked: nothing personal
- `packages/app/src/utils/assistant-markdown-parser.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/assistant-markdown-parser.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/assistant-message-height-estimate.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/assistant-message-height-estimate.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/attempt-guard.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/branch-suggestions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/branch-suggestions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/client-id.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/client-id.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/color.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/color.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/command-center-focus-restore.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/confirm-dialog.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/confirm-dialog.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/connection-selection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/connection-selection.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/copy-to-clipboard.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/daemon-endpoints.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/daemons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/decode-utf8.native.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/decode-utf8.native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/decode-utf8.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/desktop-badge-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/desktop-badge-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/desktop-sidebar-toggle.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/desktop-sidebar-toggle.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/desktop-window.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/desktop-window.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/device-timezone.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/diff-highlight.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/diff-highlight.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/diff-layout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/diff-layout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/diff-rendering.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/diff-rendering.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/encode-images.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/error-messages.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/exhaustive.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/explorer-paths.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/explorer-paths.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/extract-agent-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/extract-agent-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/extract-tool-call-file-path.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/extract-tool-call-file-path.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/file-mention-autocomplete.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/file-mention-autocomplete.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/format-file-size.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/format-shortcut.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/format-shortcut.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/highlight-cache.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/highlight-cache.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/host-route-browser.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/host-routes.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/host-routes.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/http-url.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/image-attachments-from-files.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/image-attachments-from-files.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/keyboard-ime.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/keyboard-ime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/latency.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/latency.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/mac-user-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/markdown-parser.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/markdown-parser.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/new-agent-routing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/new-agent-routing.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/notification-routing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/notification-routing.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/open-external-url.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/open-external-url.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/open-service-url.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/os-notifications.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/os-notifications.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/path.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/path.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/pcm16-wav.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/prepare-workspace-tab.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/project-config-form.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/project-config-form.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/project-display-name.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/project-display-name.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/project-placement.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/project-placement.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/project-status-badge-content.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/project-status-badge-content.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/projects.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/projects.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/provider-command-templates.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/provider-command-templates.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/provider-definitions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/provider-notice-toast.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/relative-time-ticker.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/relative-time-ticker.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/render-profiler.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/review-attachments.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/review-attachments.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/rich-clipboard-default-environment.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/rich-clipboard.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/rich-clipboard.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/schedule-cadence-policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/schedule-cadence-policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/schedule-format.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/schedule-format.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/server-info-capabilities.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/server-info-capabilities.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/shortcut-platform.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/shorten-path.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/shorten-path.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/sidebar-agent-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/sidebar-agent-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/sidebar-gesture-arbitration.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/sidebar-gesture-arbitration.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/sidebar-project-row-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/sidebar-project-row-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/sidebar-reorder.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/sidebar-reorder.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/sidebar-shortcuts.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/sidebar-shortcuts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/sidebar-workspace-archive-redirect.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/split-navigation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/split-navigation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/status-dot-color.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/status-indicator-geometry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/status-loader.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/status-loader.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/terminal-keys.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/terminal-keys.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/terminal-list.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/terminal-list.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/terminal-renderer-readiness.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/terminal-renderer-readiness.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/test-daemon-connection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/test-daemon-connection.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/thinking-tone.native-pcm.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/thinking-tone.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/time.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/time.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/to-xterm-theme.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/tool-call-detail-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/tool-call-detail-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/tool-call-display.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/tool-call-display.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/tool-call-icon-name.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/tool-call-icon-name.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/tool-call-icon.ts` — A resolver mapping tool call names and details to their corresponding Lucide or custom icons. Why: Used by timeline and chat components to render distinctive icons for various tool calls. checked: nothing personal
- `packages/app/src/utils/tool-call-parsers.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/tool-call-parsers.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/web-focus.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/web-focus.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/working-directory-suggestions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/working-directory-suggestions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-agent-activity.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-agent-activity.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-archive-navigation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-archive-navigation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-archive-redirect.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-directory.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-directory.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-identity.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-identity.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-navigation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-navigation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-script-links.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/workspace-script-links.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/utils/navigate-to-agent/`

Paseo's files here: The client app uses this router helper to switch screens to a target agent. Hizuri keeps it so links and alerts open the intended agent workspace.

- `packages/app/src/utils/navigate-to-agent/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/navigate-to-agent/resolve.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/utils/navigate-to-agent/resolve.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/voice/`

Paseo's files here: The client app defines default voice activity detection timing and volume thresholds, which hizuri keeps to tune speech pause detection and prevent false interruptions.

- `packages/app/src/voice/live-words.ts` — State management and utilities for accumulating and landing real-time spoken word segments. Why: Imported by voice UI components to display live speech transcription previews before landing them in chat. checked: nothing personal
- `packages/app/src/voice/realtime-voice-config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/voice/voice-background.android.ts` — Android background service manager requesting battery exemptions, notifications, and keep-alive foreground tasks. Why: Used on Android to prevent the operating system from killing microphone capture when backgrounded. checked: nothing personal
- `packages/app/src/voice/voice-background.ts` — Default fallback interface and stub implementation for background voice execution management. Why: Provides the cross-platform contract for background voice handlers, implemented on Android and stubbed elsewhere. checked: nothing personal
- `packages/app/src/voice/voice-contacts.ts` — Persistent store and React hook tracking recently contacted voice agents across servers. Why: Used by voice session navigation to track and seamlessly preserve voice agent connections. checked: nothing personal
- `packages/app/src/voice/voice-diagnostics.ts` — The tracker and publisher for microphone audio levels, system silence detection, and speech recognition latency. Why: Supplies live audio metrics and silence state to the voice context and overlay diagnostics UI. checked: nothing personal
- `packages/app/src/voice/voice-follows-chat-sync.tsx` — A React component synchronizing active voice calls with the currently focused agent chat session. Why: Automatically redirects live voice sessions when the user focuses a different agent chat view. checked: nothing personal
- `packages/app/src/voice/voice-follows-chat.ts` — The rule helper determining if voice mode should transfer to an opened agent chat. Why: Used by VoiceFollowsChatSync to decide whether switching focused chats should move voice audio. checked: nothing personal
- `packages/app/src/voice/voice-runtime.ts` — The voice session coordinator managing capture, playback queues, network reconnection, and persistent state. Why: Drives the client voice pipeline and audio engine lifecycle for active voice interactions. checked: nothing personal
- `packages/app/src/voice/voice-session-store.ts` — The persistence helper for saving and loading active voice session identifiers and modes. Why: Persists voice session state across app reloads and reconnections using async storage. checked: nothing personal

## `packages/app/src/watchdog/`

Paseo's files here: The client app provides an entry point for native runtime tracing, which hizuri keeps to record heartbeat telemetry and native performance metrics during app execution.

- `packages/app/src/watchdog/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/watchdog/internal/`

Paseo's files here: The client app aggregates render durations and trace samples, which hizuri keeps to measure UI render performance safely without exposing private data payloads.

- `packages/app/src/watchdog/internal/recorder.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/watchdog/internal/recorder.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/workspace-labels/`

Paseo's files here: The client app renders and selects colored workspace labels, which hizuri keeps so the user can visually tag and categorize active projects and workspaces.

- `packages/app/src/workspace-labels/chip.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-labels/command-center-icon.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-labels/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-labels/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-labels/manager-modal.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-labels/picker.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-labels/swatch.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/workspace-labels/internal/`

Paseo's files here: The client app replicates and merges label catalogs across multiple daemons, which hizuri keeps to synchronize workspace tags consistently across connected hosts.

- `packages/app/src/workspace-labels/internal/host-replica.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-labels/internal/merge.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-labels/internal/picker-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-labels/internal/workflow-model.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/workspace-recovery/`

Paseo's files here: The client app inspects and resolves recovery actions for broken or archived workspaces, which hizuri keeps to safely restore interrupted project states.

- `packages/app/src/workspace-recovery/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-recovery/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-recovery/use-workspace-recovery.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/workspace-service-routes/`

Paseo's files here: The client app stores route preferences for web links opened from workspaces, which hizuri keeps to respect preferred connection paths per server.

- `packages/app/src/workspace-service-routes/store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-service-routes/store.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/workspace-tabs/`

Paseo's files here: The client app handles tab layouts, agent visibility, and pane navigation, which hizuri keeps to orchestrate multi-pane coding and tool views.

- `packages/app/src/workspace-tabs/agent-visibility.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/agent-visibility.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/compact-sheet.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/explorer-sidebar.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/explorer-sidebar.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/identity.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/identity.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/layout-mode-publisher.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/navigation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/navigation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/new-tab.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/open-beside.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/open-beside.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/open-supporting-view.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/open-supporting-view.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/workspace-tabs/launcher/`

Paseo's files here: The client app displays a modal for opening new workspace tabs, which hizuri keeps so the user can launch terminals, diffs, browsers, or agents.

- `packages/app/src/workspace-tabs/launcher/index.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/workspace-tabs/launcher/internal/`

Paseo's files here: The client app defines ordered lists of built-in launchable tools, which hizuri keeps to organize available tab views in primary and supporting panes.

- `packages/app/src/workspace-tabs/launcher/internal/catalog.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace-tabs/launcher/internal/catalog.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/workspace/`

Paseo's files here: The client app manages workspace lifecycle, focus, and archiving, which hizuri keeps to organize multi-project agent environments across desktop and mobile screens.

- `packages/app/src/workspace/desktop-open-targets.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/desktop-open-targets.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/focus.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/legacy-daemon-workspaces.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/legacy-daemon-workspaces.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/mark-unread.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/project-workspace-archive.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/project-workspace-archive.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/use-workspace-archive.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/workspace-archive.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/workspace-archive.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/workspace/file-open/`

Paseo's files here: The client app parses file paths and line ranges for open requests, which hizuri keeps so the assistant can link directly to specific source code locations.

- `packages/app/src/workspace/file-open/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/file-open/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/workspace/open-in-editor/`

Paseo's files here: The client app plans and launches external code editors for workspaces, which hizuri keeps so the user can easily open project folders in desktop editors.

- `packages/app/src/workspace/open-in-editor/button.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/open-in-editor/directory.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/open-in-editor/planner.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/src/workspace/open-in-editor/planner.ts` — Paseo, unchanged. checked: nothing personal

## `packages/app/src/workspace/open-in-file-manager/`

Paseo's files here: The client app provides a menu item to open directories in the OS file manager, which hizuri keeps for desktop folder navigation.

- `packages/app/src/workspace/open-in-file-manager/menu-item.tsx` — Paseo, unchanged. checked: nothing personal

## `packages/app/test-stubs/`

Paseo's files here: The client app provides simulated native mobile modules for automated tests, which hizuri keeps to run headless tests without crashing on missing React Native features.

- `packages/app/test-stubs/async-storage.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/test-stubs/expo-linking.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/test-stubs/gorhom-bottom-sheet.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/test-stubs/lucide-react-native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/test-stubs/react-native-fabric-shim.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/test-stubs/react-native-safe-area-context.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/test-stubs/react-native-svg.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/test-stubs/react-native-unistyles.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/test-stubs/reanimated-validate-worklets-version.ts` — Paseo, unchanged. checked: nothing personal
- `packages/app/test-stubs/xterm-addon-ligatures.ts` — Paseo, unchanged. checked: nothing personal

## `packages/brain-relay/`

- `packages/brain-relay/README.md` — Documentation covering setup, API endpoints, rate limits, and configuration for the brain relay. Why: Provides operating instructions and configuration references for deploying the starter model proxy. checked: nothing personal
- `packages/brain-relay/package.json` — The package configuration and script definitions for the free brain relay server. Why: Defines dependencies, compilation commands, and test tasks for the brain relay package. checked: nothing personal
- `packages/brain-relay/tsconfig.json` — TypeScript compiler configuration for the brain relay package. Why: Used by tsc to build the brain-relay package into dist. checked: nothing personal

## `packages/brain-relay/src/`

- `packages/brain-relay/src/config.ts` — The configuration loader and limit validator parsing environment variables for the brain relay. Why: Provides validated endpoints, upstream API keys, and usage caps to the brain relay service. checked: nothing personal
- `packages/brain-relay/src/main.ts` — The startup script and process signal handler for the brain relay HTTP server. Why: Serves as the entry point when launching the brain relay process with Node. checked: nothing personal
- `packages/brain-relay/src/server.test.ts` — Tests for the brain relay HTTP server, rate limits, install tokens, and streaming responses. Why: Vitest runs it to verify rate limits and token forwarding in the starter brain relay. checked: nothing personal
- `packages/brain-relay/src/server.ts` — The HTTP server handling starter brain relay requests, usage limits, and upstream proxying. Why: Starts the brain relay service providing free starter model access to clients. checked: nothing personal
- `packages/brain-relay/src/usage-store.ts` — In-memory and file-backed usage store tracking request counts and budget caps. Why: Used by the brain relay server to enforce daily request and spending limits per installation. checked: nothing personal

## `packages/cli/`

Paseo's files here: The command-line tool provides package definitions and configuration, which hizuri keeps to package and run the CLI for controlling background daemons.

- `packages/cli/cli-client-id` — Paseo, unchanged. checked: nothing personal
- `packages/cli/package.json` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tsconfig.json` — Paseo, unchanged. checked: nothing personal

## `packages/cli/bin/`

Paseo's files here: The command-line tool provides the executable entry script, which hizuri keeps so developers can run the CLI directly from their system terminals.

- `packages/cli/bin/paseo` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/`

Paseo's files here: It handles command-line entry points, argument classification, and invocation routing so developers can run CLI commands or launch target projects directly.

- `packages/cli/src/classify.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/classify.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/cli-surface.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/cli.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/run.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/run.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/version.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/`

Paseo's files here: It implements high-level developer commands for repository cloning, project opening, onboarding, and hook execution to interact with the running daemon.

- `packages/cli/src/commands/clone.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hooks.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hooks.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/onboard.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/open.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/agent/`

Paseo's files here: It provides commands to inspect, attach to, run, stop, update, and manage AI coding agent sessions running on the daemon.

- `packages/cli/src/commands/agent/archive.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/attach.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/delete.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/delete.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/detach.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/import.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/import.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/inspect.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/logs.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/logs.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/ls.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/ls.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/mode.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/open.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/reload.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/run.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/run.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/send.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/stop.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/update.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/update.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/agent/wait.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/daemon/`

Paseo's files here: It provides commands to configure, start, stop, restart, pair, and inspect the lifecycle of the local background daemon service.

- `packages/cli/src/commands/daemon/config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/lifecycle.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/local-daemon.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/pair.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/pair.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/reload.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/reload.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/restart.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/runtime-toolchain.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/set-password.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/start.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/status.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/daemon/stop.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/heartbeat/`

Paseo's files here: It provides commands to manage and trigger scheduled heartbeat jobs on the daemon to keep background tasks alive.

- `packages/cli/src/commands/heartbeat/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/host/`

Paseo's files here: It queries and updates registered host machine summaries, allowing the user to manage connected host environments through the CLI.

- `packages/cli/src/commands/host/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/hub/`

Paseo's files here: It manages authentication, project publishing, trigger configurations, and deployments to the external hub service for tool distribution.

- `packages/cli/src/commands/hub/authority.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/client.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/commands.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/connect.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/credentials.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/credentials.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/daemon-client.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/deploy-bundle.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/deploy-bundle.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/deploy-contract.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/deploy-triggers.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/deploy-triggers.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/deploy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/disconnect.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/error.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/export.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/export.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/help.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/init-flow.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/init-plan.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/init-plan.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/init.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/login-flow.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/login-flow.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/login.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/logout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/origin.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/origin.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/permissions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/projects.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/reporter.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/starter-agent-runtime.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/starter-agent-runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/starter-trigger.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/starter-trigger.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/status-output.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/hub/hub-client/`

Paseo's files here: It defines the HTTP client and API schemas used to communicate with the external hub for authentication and tool deployments.

- `packages/cli/src/commands/hub/hub-client/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/hub/hub-client/internal/`

Paseo's files here: It implements HTTP transports, problem details parsing, and validation contracts for requests sent to the external hub service.

- `packages/cli/src/commands/hub/hub-client/internal/contracts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/hub-client/internal/problem.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/hub/hub-client/internal/transport.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/permit/`

Paseo's files here: It allows listing, approving, and denying pending agent permission requests so developers can control tool execution permissions from the terminal.

- `packages/cli/src/commands/permit/allow.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/permit/deny.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/permit/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/permit/ls.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/permit/permit-output.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/permit/permit-response.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/plugin/`

Paseo's files here: It handles listing, scaffolding, updating, and reviewing installed daemon plugins to maintain modular agent integrations.

- `packages/cli/src/commands/plugin/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/plugin/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/plugin/scaffold.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/plugin/scaffold.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/plugin/shared.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/plugin/update.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/project/`

Paseo's files here: It manages project definitions, allowing developers to create, list, rename, and delete registered project directories on the daemon.

- `packages/cli/src/commands/project/create.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/project/delete.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/project/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/project/ls.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/project/project.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/project/rename.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/project/shared.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/provider/`

Paseo's files here: It lists AI model providers, inspects available models, and runs provider connection diagnostics directly from the command line.

- `packages/cli/src/commands/provider/diagnostic.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/provider/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/provider/ls.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/provider/models.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/schedule/`

Paseo's files here: It provides commands to create, update, pause, resume, and inspect automated scheduled jobs managed by the daemon.

- `packages/cli/src/commands/schedule/create.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/delete.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/inspect.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/logs.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/ls.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/pause.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/resume.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/run-once.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/schema.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/shared.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/shared.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/schedule/update.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/script/`

Paseo's files here: It lists, starts, and stops workspace-level scripts managed by the daemon during development tasks.

- `packages/cli/src/commands/script/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/script/ls.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/script/schema.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/script/shared.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/script/start.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/script/stop.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/speech/`

Paseo's files here: It defines placeholder speech command groups to support voice and audio command integration across the command-line interface.

- `packages/cli/src/commands/speech/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/terminal/`

Paseo's files here: It creates, lists, captures output from, and sends keys to virtual terminal instances managed by the daemon.

- `packages/cli/src/commands/terminal/capture.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/terminal/create.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/terminal/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/terminal/kill.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/terminal/ls.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/terminal/schema.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/terminal/send-keys.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/terminal/shared.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/usage/`

Paseo's files here: It fetches and displays usage metrics and billing reports across providers and plugins so developers can monitor tool consumption.

- `packages/cli/src/commands/usage/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/usage/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/usage/presentation.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/workspace/`

Paseo's files here: It manages workspace environments, allowing developers to create, rename, list, and archive project workspaces connected to the daemon.

- `packages/cli/src/commands/workspace/archive.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/workspace/create.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/workspace/create.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/workspace/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/workspace/ls.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/workspace/rename.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/workspace/rename.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/workspace/setup.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/workspace/shared.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/commands/worktree/`

Paseo's files here: It manages Git worktree workspaces, allowing the user to create, list, and archive isolated Git checkouts for agent runs.

- `packages/cli/src/commands/worktree/archive.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/worktree/archive.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/worktree/create-input.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/worktree/create-input.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/worktree/create.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/worktree/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/worktree/ls.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/commands/worktree/repository-directory.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/output/`

Paseo's files here: It formats command results into aligned tables, JSON, YAML, or quiet ID lists for human or automated script consumption.

- `packages/cli/src/output/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/output/json.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/output/pairing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/output/pairing.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/output/quiet.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/output/render.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/output/render.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/output/table.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/output/types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/output/with-output.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/output/yaml.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/ssh/`

Paseo's files here: It re-exports SSH tunneling helpers from the client package so the CLI can connect securely to remote daemon instances.

- `packages/cli/src/ssh/ssh-tunnel.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/src/utils/`

Paseo's files here: The command-line tool uses these utilities for daemon connection, argument parsing, error formatting, and agent resolution, which hizuri keeps so developers can inspect and control the daemon during development and testing.

- `packages/cli/src/utils/agent-directory.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/caller-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/client-id.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/client.ssh.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/client.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/command-options.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/command-options.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/daemon-target.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/daemon-target.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/duration.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/errors.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/paths.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/provider-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/provider-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/timeline.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/src/utils/wait-for-stop.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/tests/`

Paseo's files here: The command-line tool runs these integration tests across core commands and lifecycle flows, which hizuri keeps to verify daemon stability, permission checks, and agent operations without manual verification.

- `packages/cli/tests/01-foundation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/02-output.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/03-daemon.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/04-agent-ls.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/05-agent-run.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/06-agent-send.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/07-agent-stop.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/08-agent-logs.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/09-agent-inspect.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/10-agent-mode.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/11-agent-archive.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/11-agent-wait.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/12-permit-ls.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/13-permit-allow-deny.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/14-worktree.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/15-provider.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/16-agent-update.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/17-onboard.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/19-errors-utils.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/21-run-output-schema-helper.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/22-daemon-stop-supervisor.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/23-daemon-sigint-supervisor.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/24-daemon-stop-ownership.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/25-daemon-restart-supervisor.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/27-agent-delete.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/28-client-ipc-targets.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/29-agent-id-resolution.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/30-cwd-filter-paths.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/31-schedule.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/32-daemon-set-password.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/32-open-project.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/33-daemon-stop-tree-kill.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/34-daemon-status-auth.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/34-daemon-stop-stale-reachable.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/35-daemon-worker-supervisor-disconnect.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/36-daemon-status-windows-process-lookup.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/37-hub-deploy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/38-workspace-rename.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/39-terminal-workspace.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/40-daemon-stale-boot-lock.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/41-daemon-auth-command-errors.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/42-agent-open.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/43-agent-follow-closed-stdout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/44-usage.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/run-all.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/setup.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/tests/e2e/`

Paseo's files here: The command-line tool executes end-to-end scenarios against live daemons and agents, which hizuri keeps to ensure end-to-end execution, message relays, and provider workflows function correctly.

- `packages/cli/tests/e2e/agent-lifecycle.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/e2e/agent-send.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/e2e/opencode-invalid-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/e2e/permissions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/e2e/plugin-lifecycle.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/e2e/relay-host.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/e2e/run-output-schema.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/tests/helpers/`

Paseo's files here: The command-line tool relies on these harness helpers to spawn test daemons, allocate ports, and run CLI binaries, which hizuri keeps to isolate automated test runs reliably.

- `packages/cli/tests/helpers/local-cli.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/helpers/network.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/helpers/terminal.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/helpers/test-daemon.ts` — Paseo, unchanged. checked: nothing personal

## `packages/cli/tests/tmp/`

Paseo's files here: The command-line tool uses these temporary debugging scripts to exercise provider execution and structured outputs, which hizuri keeps to reproduce model issues during test diagnostics.

- `packages/cli/tests/tmp/opencode-simple.ts` — Paseo, unchanged. checked: nothing personal
- `packages/cli/tests/tmp/opencode-structured-debug.ts` — Paseo, unchanged. checked: nothing personal

## `packages/client/`

Paseo's files here: The TypeScript client package provides package configuration and documentation, which hizuri keeps to build and publish the API client library.

- `packages/client/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/client/package.json` — Paseo, unchanged. checked: nothing personal
- `packages/client/tsconfig.examples.json` — Paseo, unchanged. checked: nothing personal
- `packages/client/tsconfig.json` — Paseo, unchanged. checked: nothing personal

## `packages/client/examples/`

Paseo's files here: The TypeScript client provides sample scripts demonstrating API usage, which hizuri keeps as reference implementations for creating agents, subscribing to events, and managing workspaces.

- `packages/client/examples/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/client/examples/agents-and-providers.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/examples/events-and-timeline.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/examples/issue-to-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/examples/parallel-review.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/examples/provider-settings.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/examples/quickstart.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/examples/workspaces.ts` — Paseo, unchanged. checked: nothing personal

## `packages/client/src/`

Paseo's files here: The TypeScript client implements WebSocket connections, encryption, and streaming routers, which hizuri keeps to communicate reliably between client interfaces and daemons.

- `packages/client/src/connection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/daemon-client-relay-e2ee-transport.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/daemon-client-runtime-metrics.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/daemon-client-transport-types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/daemon-client-transport-utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/daemon-client-transport.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/daemon-client-transport.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/daemon-client-websocket-transport.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/daemon-client.test.ts` — Tests for daemon client connection, messaging, streamed file uploads, and capabilities. Why: Vitest runs it to verify client interactions with the daemon. checked: nothing personal
- `packages/client/src/daemon-client.ts` — The main WebSocket API client for communicating with the daemon. Why: Used by the front-end app and CLI to control sessions, voice mode, and file uploads. checked: nothing personal
- `packages/client/src/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/legacy-usage-icons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/terminal-stream-router.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/terminal-stream-router.ts` — Paseo, unchanged. checked: nothing personal

## `packages/client/src/compat/`

Paseo's files here: The TypeScript client normalizes model and provider data structures, which hizuri keeps to maintain backward compatibility across differing daemon protocol versions.

- `packages/client/src/compat/normalize-provider-models.ts` — Paseo, unchanged. checked: nothing personal

## `packages/client/src/connection/`

Paseo's files here: The TypeScript client manages subscriptions and compatibility adapters, which hizuri keeps to track server state, agent snapshots, and workspace events over time.

- `packages/client/src/connection/index.ts` — Connection subscription manager and default client capability definitions. Why: Imported by the daemon client to manage connection state and advertise client capabilities. checked: nothing personal
- `packages/client/src/connection/legacy-workspaces.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/connection/legacy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/connection/owned.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/connection/owned.ts` — Paseo, unchanged. checked: nothing personal

## `packages/client/src/creation/`

Paseo's files here: The TypeScript client tracks asynchronous workspace and agent creation flows, which hizuri keeps to monitor initialization progress and handle startup errors.

- `packages/client/src/creation/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/creation/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/client/src/hosts/`

Paseo's files here: The TypeScript client defines methods to discover and manage remote hosts, which hizuri keeps to list, register, and connect to remote daemon servers.

- `packages/client/src/hosts/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/client/src/node/`

Paseo's files here: The TypeScript client provides Node-specific connection factories, SSH tunnels, and transport buffers, which hizuri keeps for backend and CLI communication with remote daemons.

- `packages/client/src/node/buffering.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/node/connector.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/node/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/node/ssh-tunnel.ts` — Paseo, unchanged. checked: nothing personal

## `packages/client/src/provider-snapshots/`

Paseo's files here: It tracks and coalesces provider snapshot updates from the daemon so client apps and the CLI can observe live provider state changes without dropping rapid events.

- `packages/client/src/provider-snapshots/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/client/src/terminals/`

Paseo's files here: It manages terminal sessions over the daemon API, allowing the CLI and app to create, list, and control daemon terminal instances reliably across different daemon versions.

- `packages/client/src/terminals/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/client/src/terminals/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/client/src/timeline-subscription/`

Paseo's files here: It manages WebSocket subscriptions to agent timeline events, ensuring the app and CLI receive streamed agent output and replacement messages across reconnects.

- `packages/client/src/timeline-subscription/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/`

Paseo's files here: The Electron desktop wrapper package configures project packaging, typescript rules, and runner settings, which hizuri keeps to build and typecheck the desktop shell across platforms.

- `packages/desktop/.gitignore` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/electron-builder.yml` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/package.json` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/playwright.config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/tsconfig.json` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/assets/`

Paseo's files here: The Electron desktop wrapper packages application icons in multiple resolutions, which hizuri keeps to brand desktop executable bundles across operating systems cleanly.

- `packages/desktop/assets/128x128.png` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/128x128@2x.png` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/32x32.png` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/64x64.png` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/icon-dev.png` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/icon.icns` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/icon.ico` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/icon.png` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/assets/editor-targets/`

Paseo's files here: The Electron desktop wrapper displays these editor and IDE icons in the UI, which hizuri keeps so the user can easily recognize external launch targets.

- `packages/desktop/assets/editor-targets/android-studio.png` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/editor-targets/antigravity.png` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/editor-targets/cursor.png` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/editor-targets/finder.png` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/editor-targets/vscode.png` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/editor-targets/webstorm.png` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/assets/editor-targets/zed.png` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/bin/`

Paseo's files here: The Electron desktop wrapper provides bundled launcher scripts for Unix and Windows, which hizuri keeps so the packaged application can invoke the embedded CLI reliably.

- `packages/desktop/bin/paseo` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/bin/paseo.cmd` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/build/`

Paseo's files here: The Electron desktop wrapper supplies macOS entitlement plists, which hizuri keeps to preserve required audio input and executable memory permissions during signing and builds.

- `packages/desktop/build/entitlements.mac.inherit.plist` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/build/entitlements.mac.plist` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/capture-harness/`

Paseo's files here: The Electron desktop wrapper contains harness fixtures for browser window captures, which hizuri keeps to validate snapshot rendering and titlebar drag interactions in automated tests.

- `packages/desktop/capture-harness/.gitignore` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/capture-harness/bright.html` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/capture-harness/delayed-bright.html` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/capture-harness/index.html` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/capture-harness/main.js` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/capture-harness/run.sh` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/capture-harness/titlebar-drag-mouse.m` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/capture-harness/titlebar-drag.js` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/e2e/`

Paseo's files here: The Electron desktop wrapper runs Playwright end-to-end tests across app startup, settings, and workspace switching, which hizuri keeps to guard against desktop regressions in CI.

- `packages/desktop/e2e/appearance-font-size.electron.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/browser-tabs.e2e.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/daemon-lifecycle-renderer.electron.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/daemon-lifecycle.e2e.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/keyboard-shortcut-unassign.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/linux-artifact-smoke.js` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/local-daemon-host.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/open-in-editor.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/packaged-app-smoke.js` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/pair-device-relay.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/plugin-links.electron.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/project-picker.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/settings-memory.electron.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/settings-sidebar-scroll.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/startup.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/updates.spec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/window-startup.e2e.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/e2e/workspace-restart.spec.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/e2e/support/`

Paseo's files here: The Electron desktop wrapper provides testing runtime helpers for Playwright scenarios, which hizuri keeps to automate navigation and inspect daemon states across test suites.

- `packages/desktop/e2e/support/runtime.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/scripts/`

Paseo's files here: The Electron desktop wrapper executes packaging hooks, signing helpers, and local dev runners, which hizuri keeps to bundle binaries and launch dev environments properly.

- `packages/desktop/scripts/after-pack.js` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/after-sign.js` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/dev-runner-args.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/dev-runner-args.test.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/dev-runner-config.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/dev-runner-config.test.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/dev-runner-readiness.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/dev-runner-readiness.test.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/dev-runner.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/dev-runtime-config.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/dev-runtime.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/dev-runtime.test.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/dev.ps1` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/dev.sh` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/verify-electron-cdp.mjs` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/scripts/linux-sandbox/`

Paseo's files here: The Electron desktop wrapper supplies wrapper templates and launchers for Linux sandboxing, which hizuri keeps to handle packaging permissions and launcher alternatives cleanly.

- `packages/desktop/scripts/linux-sandbox/after-install.tpl` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/linux-sandbox/index.js` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/scripts/linux-sandbox/launcher.sh` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/`

Paseo's files here: The Electron desktop wrapper implements application startup, main process setup, deep linking, and preload bridges, which hizuri keeps to run the desktop UI and route project requests.

- `packages/desktop/src/agent-navigation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/agent-navigation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/desktop-startup.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/desktop-startup.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/login-shell-env.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/login-shell-env.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/main.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/open-project-routing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/open-project-routing.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/pending-open-project-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/pending-open-project-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/preload-sandbox.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/preload.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/vendor.d.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/daemon/`

Paseo's files here: The Electron desktop wrapper manages starting, stopping, and connecting to the background daemon, which hizuri keeps so the desktop app can supervise the core agent process.

- `packages/desktop/src/daemon/daemon-manager.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/daemon-manager.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/desktop-packaging.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/linux-launcher.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/local-transport.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/local-transport.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/node-entrypoint-launcher.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/node-entrypoint-launcher.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/node-entrypoint-runner.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/node-entrypoint-runner.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/package-paths.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/quit-lifecycle.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/quit-lifecycle.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/runtime-paths.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/runtime-paths.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/daemon/cli/`

Paseo's files here: The Electron desktop wrapper resolves and executes packaged CLI commands, which hizuri keeps to run daemon operations directly through local child process invocations.

- `packages/desktop/src/daemon/cli/entrypoints.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/cli/external.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/cli/external.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/cli/passthrough.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/daemon/cli/passthrough.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/diagnostics/`

Paseo's files here: The Electron desktop wrapper handles application log tailing, console stream management, and sandbox checks, which hizuri keeps to inspect runtime errors and updater health.

- `packages/desktop/src/diagnostics/app-logs.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/diagnostics/console-streams.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/diagnostics/console-streams.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/diagnostics/sandbox.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/diagnostics/sandbox.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/diagnostics/tail-file.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/diagnostics/tail-file.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/diagnostics/updater.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/diagnostics/updater.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/features/`

Paseo's files here: The Electron desktop wrapper provides native menus, notifications, file attachments, and update management, which hizuri keeps to deliver complete desktop platform integrations.

- `packages/desktop/src/features/app-update-rollout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/app-update-rollout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/app-update-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/app-update-service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/attachments.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/attachments.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/auto-updater.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/auto-updater.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-capture.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-capture.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-profile.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-profile.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/dialogs.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/menu.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/menu.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/notifications.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/opener.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/opener.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/react-devtools.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/stamped-icon.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/stamped-icon.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/features/browser-automation/`

Paseo's files here: The Electron desktop wrapper injects ARIA snapshots and drives browser automation via Chrome DevTools Protocol, which hizuri keeps so agents can inspect and interact with embedded webviews.

- `packages/desktop/src/features/browser-automation/actionability.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-automation/aria-snapshot-script.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-automation/cdp-session-queue.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-automation/dialog-handling.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-automation/ipc.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-automation/ipc.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-automation/service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-automation/service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-automation/snapshot-engine.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-automation/snapshot-engine.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-automation/trusted-input.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-automation/trusted-input.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/features/browser-keyboard/`

Paseo's files here: The Electron desktop wrapper forwards keyboard shortcuts and policy between guest webviews and host windows, which hizuri keeps so embedded browser tabs handle user keybindings correctly.

- `packages/desktop/src/features/browser-keyboard/guest-preload.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-keyboard/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-keyboard/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-keyboard/policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-keyboard/policy.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/features/browser-webviews/`

Paseo's files here: The Electron desktop wrapper tracks active browser webviews and regulates window-open requests, which hizuri keeps to manage agent browsing sessions across tabs safely.

- `packages/desktop/src/features/browser-webviews/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-webviews/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-webviews/registry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-webviews/registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-webviews/window-open.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/browser-webviews/window-open.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/features/editor-targets/`

Paseo's files here: The Electron desktop wrapper detects installed external editors and routes file launch commands, which hizuri keeps so the user can open workspaces in their preferred editor.

- `packages/desktop/src/features/editor-targets/ipc.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/registry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/runtime.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/target.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/features/editor-targets/targets/`

Paseo's files here: The Electron desktop wrapper defines launch command arguments for individual IDEs and file managers, which hizuri keeps to support opening files across dozens of external developer tools.

- `packages/desktop/src/features/editor-targets/targets/android-studio.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/antigravity.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/aqua.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/clion.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/cursor.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/datagrip.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/dataspell.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/file-manager.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/goland.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/intellij-idea.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/kiro.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/phpstorm.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/pycharm.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/rider.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/rubymine.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/rustrover.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/trae.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/vscode-insiders.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/vscode.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/vscodium.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/webstorm.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/features/editor-targets/targets/zed.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/integrations/`

Paseo's files here: The Electron desktop wrapper uses these files to read and remove obsolete skill selection settings; hizuri keeps them to upgrade old configurations without crashing.

- `packages/desktop/src/integrations/legacy-skill-selection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/integrations/legacy-skill-selection.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/integrations/cli-install/`

Paseo's files here: The Electron desktop wrapper uses these files to detect binary paths and symlink the CLI into shell startup scripts; hizuri keeps them to let users run commands from their terminal.

- `packages/desktop/src/integrations/cli-install/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/integrations/cli-install/install.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/integrations/cli-install/path.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/integrations/cli-install/path.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/integrations/cli-install/paths.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/integrations/cli-install/shell-rc.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/settings/`

Paseo's files here: The Electron desktop wrapper uses these files to store, patch, and migrate local desktop preferences; hizuri keeps them to remember window choices and desktop options across restarts.

- `packages/desktop/src/settings/desktop-settings-commands.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/settings/desktop-settings-commands.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/settings/desktop-settings-electron.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/settings/desktop-settings.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/settings/desktop-settings.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/settings/window-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/settings/window-state.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/system/`

Paseo's files here: The Electron desktop wrapper uses these files to check if the app runs through Rosetta emulation; hizuri keeps them to warn about performance issues on Apple Silicon.

- `packages/desktop/src/system/arm64-translation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/system/arm64-translation.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/window/`

Paseo's files here: The Electron desktop wrapper uses these files to choose native title bars and manage window lifecycles; hizuri keeps them to show stable application windows across different operating systems.

- `packages/desktop/src/window/chrome.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/window/chrome.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/window/desktop-window-owner.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/window/desktop-window-owner.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/window/show-when-ready.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/window/show-when-ready.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/window/window-manager.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/window/window-manager.ts` — Paseo, unchanged. checked: nothing personal

## `packages/desktop/src/window/compositor-watchdog/`

Paseo's files here: The Electron desktop wrapper uses these files to detect frozen display frames after sleep; hizuri keeps them to restart stalled GPU processes automatically on macOS.

- `packages/desktop/src/window/compositor-watchdog/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/desktop/src/window/compositor-watchdog/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/expo-two-way-audio/`

Paseo's files here: The native module uses these configuration files and manifests to build the mobile audio package; hizuri keeps them to compile audio drivers into the mobile application.

- `packages/expo-two-way-audio/.eslintrc.js` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/.gitignore` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/.npmignore` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/.nvmrc` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/CODE_OF_CONDUCT.md` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/CONTRIBUTING.md` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/LICENSE` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/expo-module.config.json` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/package-lock.json` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/package.json` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/tsconfig.json` — Paseo, unchanged. checked: nothing personal

## `packages/expo-two-way-audio/.github/workflows/`

Paseo's files here: The native module uses these CI scripts to run tests and publish audio packages; hizuri keeps them to track upstream build configurations and verify native audio code changes.

- `packages/expo-two-way-audio/.github/workflows/cd.yml` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/.github/workflows/ci.yml` — Paseo, unchanged. checked: nothing personal

## `packages/expo-two-way-audio/android/`

- `packages/expo-two-way-audio/android/build.gradle` — Gradle build script for the Android two-way audio native module. Why: Configures dependencies and build settings for the Android two-way audio Expo library. checked: nothing personal

## `packages/expo-two-way-audio/android/src/androidTest/`

Paseo's files here: The native module uses this manifest to grant audio recording permissions in instrumentation tests; hizuri keeps it to verify Android microphone drivers during local automated testing.

- `packages/expo-two-way-audio/android/src/androidTest/AndroidManifest.xml` — Paseo, unchanged. checked: nothing personal

## `packages/expo-two-way-audio/android/src/androidTest/java/expo/modules/twowayaudio/`

- `packages/expo-two-way-audio/android/src/androidTest/java/expo/modules/twowayaudio/AudioEngineTest.kt` — Instrumented Android tests for audio recording, focus changes, and interruption handling. Why: Android test runner runs it to verify audio engine behavior on real or emulated devices. checked: nothing personal

## `packages/expo-two-way-audio/android/src/main/`

- `packages/expo-two-way-audio/android/src/main/AndroidManifest.xml` — Android manifest defining foreground service and microphone permissions for two-way audio. Why: Allows Android builds of the client app to run voice recording in the background. checked: nothing personal

## `packages/expo-two-way-audio/android/src/main/java/expo/modules/twowayaudio/`

Paseo's files here: The native module uses this package class to bind audio lifecycle hooks into Android; hizuri keeps it to connect the microphone stream to React Native runtime events.

- `packages/expo-two-way-audio/android/src/main/java/expo/modules/twowayaudio/AudioEngine.kt` — Android audio engine handling low-latency microphone capture, route switching, and AudioTrack playback clock synchronization. Why: Loaded by ExpoTwoWayAudioModule to stream microphone audio to the assistant and play back incoming voice replies on Android. checked: nothing personal
- `packages/expo-two-way-audio/android/src/main/java/expo/modules/twowayaudio/ExpoTwoWayAudioLifeCycleListener.kt` — Android activity lifecycle listener preserving audio recording and playback while the voice foreground service runs. Why: Invoked by Expo on app pause and resume so background voice assistant sessions are not terminated. checked: nothing personal
- `packages/expo-two-way-audio/android/src/main/java/expo/modules/twowayaudio/ExpoTwoWayAudioModule.kt` — Expo native module bridge exposing audio engine controls and foreground service management to JavaScript. Why: Imported by core.ts to provide React Native with Android microphone, playback, and battery optimization controls. checked: nothing personal
- `packages/expo-two-way-audio/android/src/main/java/expo/modules/twowayaudio/ExpoTwoWayAudioPackage.kt` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/android/src/main/java/expo/modules/twowayaudio/PlaybackClock.kt` — Audio timing clock computing playback latency and audible timestamps from Android AudioTrack frame metrics. Why: Used by AudioEngine to calculate exact output timing so client visualizers and lip movements match audio delivery. checked: nothing personal
- `packages/expo-two-way-audio/android/src/main/java/expo/modules/twowayaudio/VoiceForegroundService.kt` — Android foreground service holding wake locks and displaying notifications to maintain continuous background voice sessions. Why: Started by ExpoTwoWayAudioModule to allow uninterrupted microphone input when the app is minimized or locked. checked: nothing personal
- `packages/expo-two-way-audio/android/src/main/java/expo/modules/twowayaudio/VoiceRoutePolicy.kt` — Audio routing policy selecting between communication and media audio routes based on connected audio devices. Why: Used by AudioEngine to choose optimal microphone and speaker pipelines for Bluetooth headphones, headsets, and speakers. checked: nothing personal

## `packages/expo-two-way-audio/android/src/test/java/expo/modules/twowayaudio/`

- `packages/expo-two-way-audio/android/src/test/java/expo/modules/twowayaudio/PlaybackClockTest.kt` — Unit tests verifying start latency calculation, queue progression, and timestamp resets in PlaybackClock. Why: Executed during Android test suites to prevent regressions in audio synchronization and latency tracking calculations. checked: nothing personal
- `packages/expo-two-way-audio/android/src/test/java/expo/modules/twowayaudio/VoiceRoutePolicyTest.kt` — Unit tests verifying route decisions across headsets, media-only Bluetooth devices, wired outputs, and overrides. Why: Executed during Android test suites to ensure VoiceRoutePolicy picks the correct input and output configurations. checked: nothing personal

## `packages/expo-two-way-audio/examples/basic-usage/`

Paseo's files here: The native module uses this standalone sample app to record and play raw PCM audio; hizuri keeps it to diagnose microphone hardware issues independently from the daemon.

- `packages/expo-two-way-audio/examples/basic-usage/.gitignore` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/basic-usage/App.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/basic-usage/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/basic-usage/app.json` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/basic-usage/babel.config.js` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/basic-usage/metro.config.js` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/basic-usage/package-lock.json` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/basic-usage/package.json` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/basic-usage/tsconfig.json` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/basic-usage/webpack.config.js` — Paseo, unchanged. checked: nothing personal

## `packages/expo-two-way-audio/examples/basic-usage/assets/`

Paseo's files here: The native module uses these image assets for the standalone sample application icon and splash screen; hizuri keeps them to cleanly package and run the audio test project.

- `packages/expo-two-way-audio/examples/basic-usage/assets/adaptive-icon.png` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/basic-usage/assets/favicon.png` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/basic-usage/assets/icon.png` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/basic-usage/assets/splash.png` — Paseo, unchanged. checked: nothing personal

## `packages/expo-two-way-audio/examples/flow-api/`

Paseo's files here: The native module uses this sample app to test streaming audio with volume meters; hizuri keeps it to benchmark real-time voice latency and verify audio playback stability.

- `packages/expo-two-way-audio/examples/flow-api/.gitignore` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/App.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/app.json` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/auth.ts` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/babel.config.js` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/metro.config.js` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/package-lock.json` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/package.json` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/tsconfig.json` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/volume-display.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/webpack.config.js` — Paseo, unchanged. checked: nothing personal

## `packages/expo-two-way-audio/examples/flow-api/assets/`

Paseo's files here: The native module uses these image assets to brand the streaming audio demonstration app; hizuri keeps them to compile the example runner without missing file errors.

- `packages/expo-two-way-audio/examples/flow-api/assets/adaptive-icon.png` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/assets/favicon.png` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/assets/icon.png` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/examples/flow-api/assets/splash.png` — Paseo, unchanged. checked: nothing personal

## `packages/expo-two-way-audio/ios/`

Paseo's files here: The native module uses these Swift files to handle iOS audio sessions, recording, and microphone permissions; hizuri keeps them to run the voice pipeline on Apple phones.

- `packages/expo-two-way-audio/ios/AudioEngine.swift` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/ios/ExpoTwoWayAudio.podspec` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/ios/ExpoTwoWayAudioModule.swift` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/ios/MicrophonePermissionRequester.swift` — Paseo, unchanged. checked: nothing personal

## `packages/expo-two-way-audio/src/`

Paseo's files here: The native module uses these TypeScript hooks and bridge bindings to expose microphone controls; hizuri keeps them so the React Native client can capture speech and play sounds.

- `packages/expo-two-way-audio/src/ExpoTwoWayAudioModule.ts` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/src/core.ts` — TypeScript API wrapper for the native two-way audio module functions, timing, and foreground services. Why: Imported by packages/app voice components to record speech, stream PCM playback, and check device permissions. checked: nothing personal
- `packages/expo-two-way-audio/src/events.ts` — Type definitions and event listener helpers for microphone data, volume changes, interruptions, and audio routes. Why: Imported by voice hooks in packages/app to subscribe to hardware audio events and route changes. checked: nothing personal
- `packages/expo-two-way-audio/src/hooks.ts` — Paseo, unchanged. checked: nothing personal
- `packages/expo-two-way-audio/src/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/highlight/`

Paseo's files here: Syntax highlighting uses these package manifests to configure compiler options and module outputs; hizuri keeps them to bundle shared parser utilities for both desktop and mobile clients.

- `packages/highlight/package.json` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/tsconfig.json` — Paseo, unchanged. checked: nothing personal

## `packages/highlight/src/`

Paseo's files here: Syntax highlighting uses these core engines, color definitions, and parser maps to tokenize source code; hizuri keeps them to render styled code blocks across chat messages and stage screens.

- `packages/highlight/src/colors.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/highlighter.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/js-scanner.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/parsers.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/syntax-roles.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/themes.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/types.ts` — Paseo, unchanged. checked: nothing personal

## `packages/highlight/src/__tests__/`

Paseo's files here: Tests of syntax highlighting: token styling and the check that every grammar's dependencies are bundled; hizuri keeps them so a missing grammar fails in CI, not in the app.

- `packages/highlight/src/__tests__/colors.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/__tests__/dependency-closure.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/__tests__/highlighter.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/__tests__/parsers.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/__tests__/themes.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/highlight/src/astro/`

Paseo's files here: Syntax highlighting uses this parser to tokenize mixed template, style, and script tags; hizuri keeps it so the assistant can display Astro component code correctly.

- `packages/highlight/src/astro/LICENSE` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/astro/parser.ts` — Paseo, unchanged. checked: nothing personal

## `packages/highlight/src/csharp/`

Paseo's files here: Syntax highlighting uses this parser and grammar definition to tokenize C# code; hizuri keeps it to display highlighted backend code and diffs clearly on the screen.

- `packages/highlight/src/csharp/highlight.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/csharp/language.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/csharp/parser.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/csharp/terms.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/csharp/tokens.ts` — Paseo, unchanged. checked: nothing personal

## `packages/highlight/src/nix/`

Paseo's files here: Syntax highlighting uses this grammar and tokenizer to parse Nix configuration files; hizuri keeps it to show formatted package definitions and environment files in the user interface.

- `packages/highlight/src/nix/highlight.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/nix/language.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/nix/parser.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/nix/terms.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/nix/tokens.ts` — Paseo, unchanged. checked: nothing personal

## `packages/highlight/src/svelte/`

Paseo's files here: Syntax highlighting uses this parser to tokenize nested HTML, CSS, and script blocks; hizuri keeps it to display Svelte source files cleanly inside agent stage views.

- `packages/highlight/src/svelte/highlight.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/svelte/nesting.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/svelte/parser.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/svelte/terms.ts` — Paseo, unchanged. checked: nothing personal
- `packages/highlight/src/svelte/tokens.ts` — Paseo, unchanged. checked: nothing personal

## `packages/highlight/src/vue/`

Paseo's files here: Syntax highlighting uses this parser to tokenize template tags and script sections; hizuri keeps it to format Vue single-file components when presenting code to the user.

- `packages/highlight/src/vue/parser.ts` — Paseo, unchanged. checked: nothing personal

## `packages/plugin/`

Paseo's files here: The plugin SDK uses these package manifests to configure type definitions and build rules; hizuri keeps them to compile extensions and maintain compatibility with existing workspace plugins.

- `packages/plugin/package.json` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/tsconfig.examples.json` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/tsconfig.json` — Paseo, unchanged. checked: nothing personal

## `packages/plugin/src/`

Paseo's files here: These files define core plugin contracts, text helpers, and schemas. The plugin SDK uses them to build and validate extensions across the entire ecosystem.

- `packages/plugin/src/attachments.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/boundaries.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/contracts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/icons.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/icons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/rpc.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/settings.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/skill-examples.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/text.ts` — Paseo, unchanged. checked: nothing personal

## `packages/plugin/src/client/`

Paseo's files here: These files provide React hooks, UI bridges, and host contexts. The plugin SDK keeps them so extensions can render interactive controls and read workspace state.

- `packages/plugin/src/client/buttons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/client-state.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/contracts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/file.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/host.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/host.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/paseo-context.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/react-native.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/rpc-context.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/runtime-context-bridge.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/shallow.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/shallow.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/translations.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/translations.tsx` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/ui.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/client/use-sync-external-store.d.ts` — Paseo, unchanged. checked: nothing personal

## `packages/plugin/src/server/`

Paseo's files here: These files implement backend lifecycle management, provider hooks, and usage reporting. The plugin SDK uses them to run external agent backends safely.

- `packages/plugin/src/server/acp.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/server/acp.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/server/contracts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/server/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/server/lifecycle.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/server/process.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/server/process.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/server/provider.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/server/usage.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/server/usage.ts` — Paseo, unchanged. checked: nothing personal

## `packages/plugin/src/server/acp-internal/`

Paseo's files here: These files handle low-level process connections for the Agent Client Protocol. The plugin SDK keeps them to exchange structured messages with external agents.

- `packages/plugin/src/server/acp-internal/connection.ts` — Paseo, unchanged. checked: nothing personal

## `packages/plugin/src/server/process-internal/`

Paseo's files here: These files quote and escape command strings across operating systems. The plugin SDK relies on them to launch subprocesses safely on Windows environments.

- `packages/plugin/src/server/process-internal/windows-command.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/plugin/src/server/process-internal/windows-command.ts` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/`

Paseo's files here: These files configure package dependencies and TypeScript compiler settings. The shared protocol package needs them to build and distribute its schemas cleanly.

- `packages/protocol/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/package.json` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/tsconfig.json` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/codegen/`

Paseo's files here: This file explains the ahead-of-time validator build step. The shared protocol package keeps it to guide developers maintaining generated message parsers.

- `packages/protocol/codegen/README.md` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/scripts/`

Paseo's files here: These scripts generate and watch fast ahead-of-time validation schemas. The shared protocol package uses them to produce efficient runtime WebSocket validators.

- `packages/protocol/scripts/generate-validation-aot.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/scripts/watch-validation-aot.mjs` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/src/`

Paseo's files here: These files define base message schemas, agent entities, and network envelopes. The shared protocol package needs them to coordinate communication between clients and daemons.

- `packages/protocol/src/addresses.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-attention-notification.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-attention-notification.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-deep-link.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-deep-link.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-feature-schemas.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-labels.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-labels.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-lifecycle.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-message.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-profile.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-state-bucket.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-state-bucket.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-title-limits.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/agent-types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/branch-slug.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/branch-slug.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/check-traits.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/client-capabilities.ts` — Constants and types for client capability flags exchanged during protocol handshakes. Why: Imported across client, app, and server packages to negotiate features like live transcripts and subagent streaming. checked: nothing personal
- `packages/protocol/src/connection-offer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/connection-offer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/daemon-endpoints.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/daemon-endpoints.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/error-utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/forge-manifest.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/git-remote.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/git-remote.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/gitea-status.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/gitlab-pipeline.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/host-connection-schema.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/host-target.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/host-target.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/hosts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/literal-union.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.active-turn-behavior.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.agent-skills.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.attachments.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.browser-automation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.checkout-commit-file-diff.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.checkout-commits.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.checkout-pr-schema.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.create-agent-client-message-id.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.create-agent-internal.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.create-agent-worktree-autoarchive.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.create-terminal-size.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.file-context-actions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.file-editing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.hub.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.list-commands.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.plugins.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.project-command-center.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.provider-subagents.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.providers-snapshot.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.pull-request-timeline.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.rename-entities.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.secrets.test.ts` — Vitest tests validating schemas for secret storage requests, secret masking in errors, and server info. Why: Executed by vitest to verify that secret payloads adhere to protocol validation and never leak values in errors. checked: nothing personal
- `packages/protocol/src/messages.stage.test.ts` — Tests for stage-related WebSocket request and response message parsing and schema validation. Why: Vitest runs this test to ensure stage messages serialize and validate correctly between the app and daemon. checked: nothing personal
- `packages/protocol/src/messages.stream-parsing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.terminal-resize.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.terminal-restore.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.tool-call-schema.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.ts` — Zod schemas and TypeScript types for client-daemon WebSocket protocol messages including voice, logs, and stage commands. Why: Imported across client and server packages to validate and type all WebSocket communication. checked: nothing personal
- `packages/protocol/src/messages.wire-compat.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.workspace-labels.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.workspace-recovery.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/messages.workspaces.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/paseo-config-schema.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/paseo-config-schema.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/paseo-tool-call-detail.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/paseo-tool-policy-config.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/path-utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/plugin-config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/plugin-overview.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/plugin-overview.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/plugin-registry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/plugin-registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/plugin-requirements.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/plugin-requirements.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/plugin-source-reference.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/plugin-source-reference.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/provider-config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/provider-icon-names.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/provider-manifest.ts` — Agent provider definitions, mode options, and helper functions for coding and conversational assistants. Why: Imported by the daemon and app to configure available AI providers, including the hizuri free starter model. checked: nothing personal
- `packages/protocol/src/provider-snapshot-codec.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/provider-snapshot-codec.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/ssh-transport.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/ssh-transport.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/stage.ts` — Zod schemas and types for stage data models including tabs, blocks, perches, slides, and updates. Why: Imported by protocol message schemas, server stage logic, and client apps to coordinate the second screen. checked: nothing personal
- `packages/protocol/src/terminal-activity.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-activity.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-input-mode.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-input-mode.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-key-input.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-key-input.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-profile.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-profiles.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-profiles.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-snapshot.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-snapshot.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-stream-protocol.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-stream-protocol.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/terminal-subscription-key.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/timeline-identity.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/timeline-identity.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/tool-call-display.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/tool-call-display.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/tool-name-normalization.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/websocket-message-limit.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/workspace-labels.ts` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/src/binary-frames/`

Paseo's files here: These files serialize and multiplex binary data streams. The shared protocol package relies on them to route terminal output and file transfers efficiently.

- `packages/protocol/src/binary-frames/demux.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/binary-frames/demux.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/binary-frames/file-transfer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/binary-frames/file-transfer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/binary-frames/host-route.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/binary-frames/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/binary-frames/terminal.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/binary-frames/terminal.ts` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/src/browser-automation/`

Paseo's files here: These files define schemas and capability checks for browser automation. The shared protocol package keeps them to coordinate browser actions requested by agents.

- `packages/protocol/src/browser-automation/capabilities.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/browser-automation/rpc-schemas.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/browser-automation/rpc-schemas.ts` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/src/chat/`

Paseo's files here: These files declare legacy room and message schemas. The shared protocol package retains them to preserve compatibility with older peers.

- `packages/protocol/src/chat/rpc-schemas.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/chat/types.ts` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/src/generated/validation/`

Paseo's files here: This document outlines rules for compiling generated schema validators. The shared protocol package retains it to remind developers not to commit build artifacts.

- `packages/protocol/src/generated/validation/README.md` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/src/loop/`

Paseo's files here: These schemas define loop log entries and execution states. The shared protocol package keeps them for backward compatibility with older agent loop formats.

- `packages/protocol/src/loop/rpc-schemas.ts` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/src/paseo-tool-presentation/`

Paseo's files here: These files format tool execution records into clean visual summaries. The shared protocol package uses them to display tool actions inside client user interfaces.

- `packages/protocol/src/paseo-tool-presentation/agent-message.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/paseo-tool-presentation/catalog.ts` — Catalog mapping tool invocations to timeline presentation labels, context extractors, and detail layout specifications. Why: Imported by clients to format agent tool calls in the timeline, incorporating hizuri's custom tools. checked: nothing personal
- `packages/protocol/src/paseo-tool-presentation/detail-sections.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/paseo-tool-presentation/detail-sections.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/paseo-tool-presentation/hizuri-catalog.ts` — Catalog entries defining labels and context extractors for hizuri tools like Show, stage, media, and vault. Why: Imported by catalog.ts to display hizuri-specific tool invocations in client timelines. checked: nothing personal
- `packages/protocol/src/paseo-tool-presentation/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/paseo-tool-presentation/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/paseo-tool-presentation/summary-text.ts` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/src/schedule/`

Paseo's files here: These files validate scheduled jobs and convert interval millisecond timings to cron strings. The shared protocol package keeps them to align job timers.

- `packages/protocol/src/schedule/cadence.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/schedule/cadence.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/schedule/cron-expression.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/schedule/cron-expression.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/schedule/rpc-schemas.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/schedule/rpc-schemas.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/schedule/types.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/schedule/types.ts` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/src/search/`

Paseo's files here: These files rank and score text matches for pickers and history queries. The shared protocol package uses them to sort matching items consistently.

- `packages/protocol/src/search/text-match.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/search/text-match.ts` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/src/validation/`

Paseo's files here: These files wrap compiled ahead-of-time validators around outbound session frames. The shared protocol package relies on them to reject malformed outgoing WebSocket messages.

- `packages/protocol/src/validation/ws-outbound-envelope.ts` — Paseo, unchanged. checked: nothing personal
- `packages/protocol/src/validation/ws-outbound.ts` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/tests/fixtures/`

Paseo's files here: This fixture holds sample HTML and markdown strings. The shared protocol package tests use it to verify safe sanitization of plugin overview displays.

- `packages/protocol/tests/fixtures/plugin-overview.json` — Paseo, unchanged. checked: nothing personal

## `packages/protocol/tests/validation/`

Paseo's files here: This suite tests outgoing WebSocket message validation against compiled schemas. The shared protocol package keeps it to catch protocol regression bugs.

- `packages/protocol/tests/validation/ws-outbound.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/relay/`

Paseo's files here: These configuration files define Cloudflare Worker settings and build steps. The encrypted relay needs them to bundle and run edge services properly.

- `packages/relay/package.json` — Paseo, unchanged. checked: nothing personal
- `packages/relay/tsconfig.json` — Paseo, unchanged. checked: nothing personal
- `packages/relay/wrangler.toml` — Paseo, unchanged. checked: nothing personal

## `packages/relay/src/`

Paseo's files here: These files manage encrypted channels and Durable Object routing. The encrypted relay relies on them to bridge isolated clients and daemons securely.

- `packages/relay/src/base64.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/cloudflare-adapter.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/cloudflare-adapter.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/crypto.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/crypto.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/cutover-proxy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/cutover-proxy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/dist-handshake-parity.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/e2ee.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/encrypted-channel.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/encrypted-channel.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/live-relay.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/package-exports.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/relay/src/types.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/`

Paseo's files here: These files set up build options, environment templates, and developer instructions. The daemon uses them to configure its runtime environment and test suites.

- `packages/server/.env.example` — Paseo, unchanged. checked: nothing personal
- `packages/server/.gitignore` — Paseo, unchanged. checked: nothing personal
- `packages/server/AGENTS.md` — Paseo, unchanged. checked: nothing personal
- `packages/server/CLAUDE.md` — Server package guide for coding agents: commands, style, tests, critical rules. Why: agents working in packages/server read it. checked: nothing personal
- `packages/server/README.md` — Paseo, unchanged. checked: nothing personal
- `packages/server/package.json` — Package manifest and dependency configurations for the daemon backend server. Why: Used by npm to install dependencies and run build, dev, and test scripts for packages/server. checked: nothing personal
- `packages/server/tsconfig.scripts.json` — Paseo, unchanged. checked: nothing personal
- `packages/server/tsconfig.server.json` — Paseo, unchanged. checked: nothing personal
- `packages/server/tsconfig.server.typecheck.json` — Paseo, unchanged. checked: nothing personal
- `packages/server/vitest.config.ts` — The server's vitest config: the @server alias, the test environment (git rate cap off, no language but English), timeouts and the shared setup file. Why: vitest reads it for every server test run. checked: nothing personal

## `packages/server/native/speex-aec/`

- `packages/server/native/speex-aec/COPYING-speexdsp` — BSD license text for SpeexDSP software components. Why: Maintains legal compliance for the vendored and compiled SpeexDSP native code in the repository. checked: nothing personal
- `packages/server/native/speex-aec/aec.c` — C wrapper around SpeexDSP acoustic echo cancellation and preprocessing functions compiled to WebAssembly. Why: Compiled by build.sh into WebAssembly to provide acoustic echo cancellation for the daemon voice pipeline. checked: nothing personal
- `packages/server/native/speex-aec/build.sh` — Shell script that compiles SpeexDSP C code to WebAssembly and generates an embedded TypeScript module. Why: Run to generate speex-aec-wasm.ts for voice echo cancellation in the server. checked: nothing personal

## `packages/server/scripts/`

Paseo's files here: These scripts run performance benchmarks, transcribe voice tests, and check supervisor processes. The daemon retains them to verify internal stability and voice tools.

- `packages/server/scripts/analyze-observer-metrics.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/benchmark-startup-git-real-home.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/build-opencode-bridge-plugin.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/dev-runner.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/dictation-generate-baseline.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/download-speech-models.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/generate-config-schema.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/list-speech-models.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/mcp-echo-test-server.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/mcp-stdio-socket-bridge-cli.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/measure-agent-tools-context.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/measure-file-observer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/measure-file-observer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/measure-git-observation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/process-conversation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/reproduce-file-observer-teardown.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/supervision-parity.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/supervisor-entrypoint.env.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/supervisor-entrypoint.ts` — Entrypoint script that configures runtime environments, manages PID locks, and launches the daemon supervisor. Why: Run by npm start to manage daemon worker processes and ensure native library environments are properly set. checked: nothing personal
- `packages/server/scripts/supervisor-log-config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/supervisor.lifecycle-intents.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/supervisor.logging.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/supervisor.readiness.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/supervisor.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/test-codex-mcp-servers.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/test-mcp-inject.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/transcribe-local-wav.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/transcribe-local-wav.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/voice-main-daemon-e2e.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/scripts/voice-roundtrip-debug.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/executable-resolution/`

Paseo's files here: These files search system paths to locate installed binaries and scripts. The daemon uses them to launch user agent tools across diverse host platforms.

- `packages/server/src/executable-resolution/executable-resolution.probe.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/executable-resolution/executable-resolution.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/executable-resolution/executable-resolution.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/executable-resolution/windows.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/`

Paseo's files here: The daemon hizuri runs; these files manage core server lifecycle, authentication, project paths, and configuration so the daemon boots reliably and hosts backend services.

- `packages/server/src/server/agent-attention-policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent-attention-policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent-history-search.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent-history-search.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/app-logs.ts` — Helper functions for writing client log entries into daily log files. Why: Used by daemon message handlers to persist uploaded client logs under the daemon home directory. checked: nothing personal
- `packages/server/src/server/atomic-file.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/auth.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/auth.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/bootstrap-auth.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/bootstrap-hizuri-routes.test.ts` — Tests for public routing order covering updates, avatar, and stage media endpoints. Why: Runs in vitest to verify public media and update endpoints precede web UI and password gates. checked: nothing personal
- `packages/server/src/server/bootstrap-managed-processes.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/bootstrap-provider-availability.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/bootstrap-web-ui.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/bootstrap.smoke.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/bootstrap.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/bootstrap.ts` — The daemon server bootstrap initializing services, routers, modules, tool hub, and voice runtime. Why: Starts the core backend daemon and attaches HTTP and WebSocket handlers for the application. checked: nothing personal
- `packages/server/src/server/checkout-diff-cache.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/checkout-diff-cache.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/checkout-diff-manager.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/checkout-diff-manager.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/checkout-git-utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/cli-agent-logs.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/cli-run-workspace-precedence.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/client-activity.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/client-message-id.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/client-message-id.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/config-auth.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/config-browser-tools.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/config-environment.ts` — The environment variable whitelist and parsing logic for daemon configuration and speech controls. Why: Filters environment keys for daemon launches to ensure voice and streaming variables are retained. checked: nothing personal
- `packages/server/src/server/config-git.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/config-plugins.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/config-relay.test.ts` — Tests for relay and service proxy configuration resolution from settings and environment variables. Why: Runs in vitest to verify relay fallback rules, endpoint switches, and proxy options. checked: nothing personal
- `packages/server/src/server/config-web-ui.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/config.test.ts` — Tests for configuration loading, CLI overrides, speech tuning parameters, and screen streaming settings. Why: Runs in vitest to ensure configuration properties parse properly from environment and disk. checked: nothing personal
- `packages/server/src/server/config.ts` — Configuration parser and validator loading persisted disk settings and environment overrides. Why: Supplies normalized server settings to the bootstrap process and daemon startup procedures. checked: nothing personal
- `packages/server/src/server/connection-offer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-client.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-config-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-config-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-instance.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-instance.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-keypair.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-keypair.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-version.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-version.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-worker.ts` — The entry point and lifecycle manager for the daemon supervisor worker process. Why: Runs the daemon process, applying user profiles, command flags, and IPC lifecycle controls. checked: nothing personal
- `packages/server/src/server/exports.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/exports.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/face-avatar.test.ts` — Tests for the face avatar static router, covering redirects, ETag headers, and dotfiles. Why: Runs in vitest to guarantee the avatar endpoint serves files and 3D models properly. checked: nothing personal
- `packages/server/src/server/face-avatar.ts` — The Express router serving the assistant's avatar web page and 3D assets. Why: Mounted during daemon bootstrap to provide the front-end face display for client webviews. checked: nothing personal
- `packages/server/src/server/git-filename-diffs.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/git-metadata-event-rules.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/git-metadata-event-rules.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/host-name.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hostnames.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hostnames.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/json-utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/lifecycle-reasons.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/local-credential.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/local-service-connection.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/logger.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/logger.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/messages.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/messages.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/owned-subscriptions-client.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/owned-subscriptions.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/owner-profile.test.ts` — Tests for locating, parsing, and applying personal owner profile environment configurations. Why: Executed by vitest to ensure user profile configurations merge properly into process environment. checked: nothing personal
- `packages/server/src/server/owner-profile.ts` — Functions for locating, loading, and merging personal owner profile settings into the daemon environment. Why: Imported during daemon startup to load user-specific profile overrides from outside the repository. checked: nothing personal
- `packages/server/src/server/package-version.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/pairing-offer.ts` — Function to generate local pairing connection offers and QR codes for client devices. Why: Used by the daemon server to facilitate initial client device pairing through the relay. checked: nothing personal
- `packages/server/src/server/pairing-qr.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/pairing-qr.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/paseo-env.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/paseo-env.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/paseo-home.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/paseo-home.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/paseo-worktree-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/paseo-worktree-service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/path-utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/persisted-config-edit.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/persisted-config-json-schema.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/persisted-config.test.ts` — Tests verifying the validation schema for persisted daemon configuration and feature flags. Why: Run by vitest to ensure persisted config options like Show screen URLs validate correctly. checked: nothing personal
- `packages/server/src/server/persisted-config.ts` — Validation schemas and default values for daemon persisted configuration and feature flags. Why: Imported across the server daemon to validate and load stored settings from disk. checked: nothing personal
- `packages/server/src/server/persistence-hooks.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/persistence-hooks.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/pid-lock.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/pid-lock.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/private-files.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/process-diagnostics.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/project-directory-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/project-directory-service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/project-key.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/project-key.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/relay-runtime.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/relay-runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/relay-transport.latency.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/relay-transport.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/relay-transport.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/resolve-workspace-id-for-path.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/resolve-workspace-id-for-path.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/resolve-worktree-creation-intent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/resolve-worktree-creation-intent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/schedule-run-lifecycle.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/script-health-monitor.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/script-health-monitor.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/script-proxy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/script-proxy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/script-route-branch-handler.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/script-route-branch-handler.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/script-status-projection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/script-status-projection.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/selective-timeline-delivery.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/server-id.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/server-id.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/service-proxy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/service-proxy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session-admission-auth.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session.create-agent-title.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session.create-agent-worktree-autoarchive.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session.hizuri.test.ts` — Tests for Hizuri session features including stage requests, secret forms, voice listings, and log uploads. Why: Executed by vitest to verify that Session delegates Hizuri protocol messages and voice host features properly. checked: nothing personal
- `packages/server/src/server/session.lifecycle-boundary.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session.ts` — The core client session coordinator managing agents, messaging, voice connections, workspace synchronization, and execution lifecycle. Why: Instantiated by the daemon server to handle incoming WebSocket client connections and route messages to agents. checked: nothing personal
- `packages/server/src/server/session.wait-for-finish.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session.workspace-git-watch.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session.workspace-resolution-invariants.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session.workspaces.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/snapshot-mutation-ownership.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/terminal-activity-route.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/voice-config.ts` — System prompt builders and XML wrappers for spoken assistant messages and phrase metadata. Why: Formats voice mode system instructions and spoken user inputs passed into coding agents. checked: nothing personal
- `packages/server/src/server/voice-env.ts` — Environment variable and live settings parser for voice pipeline configuration knobs. Why: Supplies standardized environment and override reading logic across all voice pipeline modules. checked: nothing personal
- `packages/server/src/server/voice-local-agent.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/voice-permission-policy.ts` — The authorization rule allowing speak tools, mark_phrases, and Claude Code ToolSearch. Why: Called by the daemon permission checker to let voice agents speak without text-only fallback. checked: nothing personal
- `packages/server/src/server/voice-roundtrip.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/voice-types.ts` — TypeScript types and interfaces for voice speaking outcomes and caller contexts. Why: Imported across voice handling modules and the WebSocket server to track speech reply execution. checked: nothing personal
- `packages/server/src/server/watcher-liveness-canary.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/watcher-liveness-canary.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/web-ui.test.ts` — Tests for the web UI middleware and static asset delivery. Why: Executed by vitest to ensure correct web asset serving, proxy handling, and header injection. checked: nothing personal
- `packages/server/src/server/web-ui.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket-server.browser-tools.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket-server.file-transfer.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket-server.liveness.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket-server.notifications.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket-server.origin.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket-server.relay-reconnect.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket-server.terminal-notifications.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket-server.ts` — The primary WebSocket server managing client sessions, voice registry, stage state, and secrets. Why: Started by the daemon to handle incoming client connections and coordinate backend services. checked: nothing personal
- `packages/server/src/server/wire-compat.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-archive-record-scoped.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-archive-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-archive-service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-auto-name.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-auto-name.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-automation-gate.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-automation-gate.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-bootstrap-dedupe.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-bootstrap-dedupe.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-create-errors.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-create-git-fanout.local.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-create-worktree-source.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-directory.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-directory.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-git-fetch.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-git-fetch.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-git-metadata.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-git-metadata.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-git-noop-fetch.local.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-git-service.observation.integration.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-git-service.observation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-git-service.primitive.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-git-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-git-service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-reconciliation-observation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-reconciliation-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-reconciliation-service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-registry-bootstrap-legacy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-registry-bootstrap.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-registry-bootstrap.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-registry-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-registry-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-registry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-same-cwd-isolation.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-script-runtime-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-script-runtime-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-service-env.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-service-env.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-service-port-allocator.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-service-port-allocator.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-service-port-registry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-service-port-registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-setup-observation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-setup-runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-source.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/worktree-bootstrap.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/worktree-bootstrap.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/worktree-bootstrap.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/worktree-branch-name-generator.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/worktree-branch-name-generator.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/worktree-core.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/worktree-core.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/worktree-errors.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/worktree-session.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/worktree-session.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/zuri-updates.test.ts` — Tests for the over-the-air update server endpoints and staging logic. Why: Executed by vitest to ensure correct update manifest generation, staging checks, and asset delivery. checked: nothing personal
- `packages/server/src/server/zuri-updates.ts` — The HTTP update server delivering Expo over-the-air JS bundles and staged releases. Why: Mounted onto Express by the daemon to serve application updates to client devices. checked: nothing personal

## `packages/server/src/server/agent/`

Paseo's files here: The daemon hizuri runs; these files supervise AI agent runs, stream events, manage storage, and handle permissions so agents can execute coding tasks safely.

- `packages/server/src/server/agent/activity-curator.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/activity-curator.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-archive.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-archive.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-configuration-validator.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-loading.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-loading.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-manager-stream-coalescing.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-manager.test.ts` — Unit and integration tests for agent management, timeline handling, and daemon permission workflows. Why: Vitest runs this test to verify agent lifecycles and permission prompts inside AgentManager. checked: nothing personal
- `packages/server/src/server/agent/agent-manager.ts` — The central coordinator for agent lifecycle, session state, event streams, and daemon permission requests. Why: Imported across server modules to manage agent sessions, handle tool hub install permissions, and route prompts. checked: nothing personal
- `packages/server/src/server/agent/agent-mcp.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-owner.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-projections.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-projections.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-prompt.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-prompt.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-response-loop.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-response-loop.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-response-loop.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-run-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-sdk-capabilities.md` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-sdk-types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-storage.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-storage.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-stream-coalescer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-stream-coalescer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-timeline-content.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-timeline-content.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-timeline-store-types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-timeline-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-timeline-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/archive-discovery.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/audio-utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/create-agent-lifecycle-dispatch.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/create-agent-lifecycle-dispatch.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/create-agent-mode.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/create-agent-mode.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/create-agent-title.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/dictation-debug.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/directory.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/import-sessions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/import-sessions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/lifecycle-command.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/lifecycle-command.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/mcp-parity.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/mcp-server.test.ts` — Tests for the daemon's internal MCP server, including voice tools and phrase graph signing. Why: Runs under vitest to verify tool dispatch, speak handlers, and mark_phrases phrase-graph operations. checked: nothing personal
- `packages/server/src/server/agent/mcp-server.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/mcp-shared.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/model-catalog.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/mutable-provider-config-owner.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/mutable-provider-config-owner.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/opencode-reasoning.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/paseo-tool-policy.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/paseo-tool-policy.ts` — The policy resolver that enables or disables Paseo and hizuri tools for agent providers. Why: Imported by AgentManager and tool registries to ensure voice tools like speak and mark_phrases stay accessible. checked: nothing personal
- `packages/server/src/server/agent/pcm16-resampler.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/permission-response.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/permission-response.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/plugin-provider.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/plugin-provider.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/projected-timeline-contract.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/prompt-attachments.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/prompt-attachments.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-history-timestamps.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-history-timestamps.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-launch-config.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-launch-config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-notices.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-options.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-options.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-refresh-deadline.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-registry-wrap.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-registry.test.ts` — Tests for provider registry setup and resolving configured secret references into agent environment variables. Why: Vitest runs it to ensure agent providers receive decrypted vault secrets and overrides. checked: nothing personal
- `packages/server/src/server/agent/provider-registry.ts` — The registry mapping provider identifiers to their client factories and runtime configurations. Why: Imported during server startup to instantiate agent providers, including the hizuri-free brain relay provider. checked: nothing personal
- `packages/server/src/server/agent/provider-runtime.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-session-import.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-snapshot-manager.test.ts` — Tests for provider catalog caching, snapshots, and configuration management. Why: Vitest runs it to verify snapshot manager behavior across supported agent providers including hizuri-free. checked: nothing personal
- `packages/server/src/server/agent/provider-snapshot-manager.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/recordings-debug.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/runtime-mcp-config.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/runtime-mcp-config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/speech-queue.ts` — A prioritized playback queue and text chunker for synthesized speech jobs. Why: Used by the voice pipeline to split sentences, pace audio delivery, and manage speech holds. checked: nothing personal
- `packages/server/src/server/agent/stale-provider-session-error.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/structured-generation-providers.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/structured-generation-providers.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/stt-debug.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/stt-manager.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/stt-manager.ts` — A manager that converts incoming audio recordings into text transcripts. Why: Used by agent sessions to process user voice input using configured STT providers. checked: nothing personal
- `packages/server/src/server/agent/system-prompt.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/timeline-projection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/timeline-projection.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/timeline-prompt-index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/timeline-prompt-index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/tool-name-normalization.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/tts-debug.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/tts-gain.ts` — Functions applying decibel gain and soft limiting to synthesized PCM audio. Why: Imported by tts-manager.ts to adjust TTS output volume based on voice configuration. checked: nothing personal
- `packages/server/src/server/agent/tts-manager.ts` — Manager class coordinating speech synthesis, streaming, queueing, and paced playback confirmations. Why: Used by voice sessions to convert agent responses into audio streams sent to client applications. checked: nothing personal
- `packages/server/src/server/agent/tts-pacer.ts` — Audio segmentation and pacing logic cutting PCM at quiet pauses to support playback holds. Why: Used by tts-manager.ts and speech-queue.ts to pause and resume speech playback during interruptions. checked: nothing personal
- `packages/server/src/server/agent/tts-speed.ts` — Time-stretching algorithm adjusting PCM audio playback rate without shifting pitch. Why: Imported by tts-manager.ts to dynamically adjust TTS speaking rate from voice settings. checked: nothing personal

## `packages/server/src/server/agent/agent-messages/`

Paseo's files here: The daemon hizuri runs; these files package, schedule, and route user prompts and agent turn envelopes so conversational messages reach active agents cleanly.

- `packages/server/src/server/agent/agent-messages/delivery.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-messages/delivery.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-messages/envelope.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/agent-messages/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/chat-search/`

Paseo's files here: The daemon hizuri runs; these files index and search agent timeline markdown content so users can find earlier prompts and responses across conversation history.

- `packages/server/src/server/agent/chat-search/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/chat-search/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/create-agent/`

Paseo's files here: The daemon hizuri runs; these files parse user intent and spawn new agent instances with matching workspace paths, options, and initial prompt contexts.

- `packages/server/src/server/agent/create-agent/create.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/create-agent/create.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/create-agent/intent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/create-agent/intent.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/host-operations/`

Paseo's files here: The daemon hizuri runs; these files coordinate cross-host workspace inspection and remote daemon interactions so connected host machines can collaborate on tasks.

- `packages/server/src/server/agent/host-operations/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/provider-subagents/`

Paseo's files here: The daemon runs this store to track subagent state and child timelines, maintaining scoped parent-child relationships across coding providers.

- `packages/server/src/server/agent/provider-subagents/store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/provider-subagents/store.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/`

Paseo's files here: The daemon hizuri runs; these files provide common runners, protocol adapters, and test suites for multi-backend agent protocols such as ACP and external CLIs.

- `packages/server/src/server/agent/providers/acp-agent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/acp-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/acp-options.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/acp-wrapper-smoke.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-app-server-agent.features.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-app-server-agent.local.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-app-server-agent.process-exit.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-app-server-agent.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-app-server-agent.spawn-error.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-app-server-agent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-app-server-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-async-questions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-custom-provider-import.local.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-feature-definitions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-history-lifecycle.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-mcp-agent-commands.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex-plan-mode.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/copilot-acp-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/copilot-allow-all-mode.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/cursor-acp-agent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/cursor-acp-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/cursor-acp-catalog.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/cursor-acp-smoke.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/custom-message.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/diagnostic-utils.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/diagnostic-utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/generic-acp-agent.archived-history.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/generic-acp-agent.commands.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/generic-acp-agent.diagnostic.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/generic-acp-agent.permission-turn-failure.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/generic-acp-agent.request-errors.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/generic-acp-agent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/generic-acp-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/jsonl-frame-decoder.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/jsonl-frame-decoder.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/jsonl-rpc-process.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/jsonl-rpc-process.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/kimi-acp-agent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/kimi-acp-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/kiro-acp-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/mock-load-test-agent-rewind.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/mock-load-test-agent.test.ts` — Tests for the mock load-test agent provider. Why: Vitest runs it to verify simulated streaming, timeline events, and mock Paseo tool calls. checked: nothing personal
- `packages/server/src/server/agent/providers/mock-load-test-agent.ts` — A mock agent client used for load testing and offline QA. Why: Provides synthetic stream and tool call testing without connecting to real external model APIs. checked: nothing personal
- `packages/server/src/server/agent/providers/mock-slow-provider.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-agent-commands.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-agent-commands.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-agent-custom-command.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-agent.error-handling.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-agent.full-access.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-agent.list-models-timeout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-agent.permission-actions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-agent.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-agent.recovery.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-agent.slash-command-timeout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-agent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-assistant-message.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-bridge-adapter.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-bridge.local.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-compact-event-dump.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-reasoning-dedup.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-retry-timeout.local.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-server-manager.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode-v2.local.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/provider-availability.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/provider-availability.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/provider-image-output.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/provider-image-output.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/provider-image-output.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/provider-runner.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/provider-runner.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/provider-windows-launch.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/question-card-answer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/question-card-answer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/tool-call-detail-primitives.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/tool-call-mapper-utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/tool-call-read-gutter.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/trae-acp-agent.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/claude/`

Paseo's files here: The daemon hizuri runs; these files adapt the Claude Code SDK, handling model settings, rewind states, tool calls, and event streams for Claude sessions.

- `packages/server/src/server/agent/providers/claude/agent-commands.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent-commands.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.auto-plan-approval.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.background-subagent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.context-switch.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.context-usage.local.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.context-window.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.env.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.event-stream.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.history-load.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.history.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.image-rendering.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.import-titles.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.interrupt-restart-regression.test.ts` — Tests for Claude agent session interruption, turn cancellation, and queued prompt adoption. Why: Runs under vitest to ensure prompts sent during lost or active turns are safely enqueued without errors. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.live-settings.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.max-effort.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.nested-subagent-ownership.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.redesign.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.rewind-anchors.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.runtime-exit.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.spawn.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.sub-agent-replay.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.sub-agent-sidechain.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.subagent-handback.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.subagent-interrupt.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.test.ts` — Tests for Claude provider session messaging, history conversion, and guardian note processing. Why: Runs under vitest to verify that Claude Code session logs translate into timeline events and guardian notes. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.ts` — The Claude Code agent client implementation handling SDK sessions, plugins, and timeline event streaming. Why: Imported by provider-registry to execute Claude agent sessions, inject the hizuri plugin, and surface guardian notes. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/agent.voice-history-regression.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/context-usage-file.ts` — Saves the context breakdown Claude Code reports for a running session (Query.getContextUsage) into context-usage/<session>.json under the daemon home folder after a turn, at most once a minute. Why: dashboards show what fills the agent's context from Claude Code's own numbers. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/feature-definitions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/guardian-note.test.ts` — Tests for parsing guardian log messages into structured plugin timeline items. Why: Runs under vitest to verify parser extraction of notes, rules, and fixes from checker logs. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/guardian-note.ts` — The parser converting hizuri-guardian log strings into structured timeline items. Why: Imported by the Claude agent provider to capture side-checker rule evaluations and display them in the app. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/hizuri-plugin.test.ts` — Tests for configuring and deduplicating the hizuri Claude Code plugin options. Why: Runs under vitest to ensure local plugin loading and MCP duplicate disabling behave correctly under varied environments. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/hizuri-plugin.ts` — The resolver for loading the local hizuri Claude Code plugin and disabling duplicate MCP server tools. Why: Imported by the Claude agent provider to mount repo plugins and prevent conflicting internal MCP tools. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/hooks.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/hooks.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/model-discovery.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/model-manifest.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/models.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/models.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/options.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/partial-json.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/partial-json.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/project-dir.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/project-dir.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/query.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/question-response.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/rewind.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/rewind.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/sdk-behavior.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/sidechain-tracker.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/sidechain-tracker.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/subagent-handback.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/task-notification-tool-call.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/task-notification-tool-call.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/task-state.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/task-state.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/test-rewind-claude-sdk.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/tool-call-detail-parser.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/tool-call-mapper.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/tool-call-mapper.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/claude/subagents/`

Paseo's files here: The daemon hizuri runs; these files track nested subagent tasks spawned by Claude Code, capturing their live stream progress and replay summaries for display.

- `packages/server/src/server/agent/providers/claude/subagents/live-source.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/subagents/live-source.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/subagents/observation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/subagents/observation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/subagents/presentation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/subagents/presentation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/subagents/replay-source.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/subagents/replay-source.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/subagents/workflow-output.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/subagents/workflow-output.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/subagents/workflow-replay-source.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/claude/subagents/workflow-replay-source.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/claude/test-fixtures/`

Paseo's files here: The daemon hizuri runs; these fixture lines provide canned Claude session events to verify native title extraction during session import tests.

- `packages/server/src/server/agent/providers/claude/test-fixtures/import-session-native-titles.jsonl` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/codex/`

Paseo's files here: The daemon hizuri runs; these files implement transport and command mapping for the Codex app-server protocol, handling async questions and session rewind.

- `packages/server/src/server/agent/providers/codex/app-server-transport.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex/app-server-transport.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex/async-questions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex/options.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex/rewind.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex/rewind.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex/tool-call-detail-parser.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex/tool-call-mapper.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/codex/tool-call-mapper.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/codex/test-utils/`

Paseo's files here: The daemon hizuri runs; this fake app-server simulates Codex JSON-RPC responses and subagent events during unit and integration test runs.

- `packages/server/src/server/agent/providers/codex/test-utils/fake-app-server.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/hizuri-free/`

- `packages/server/src/server/agent/providers/hizuri-free/agent.test.ts` — Tests for the free starter brain agent client and session handling. Why: Vitest runs it to verify streaming, tool execution, and role prompt handling for the free relay client. checked: nothing personal
- `packages/server/src/server/agent/providers/hizuri-free/agent.ts` — The agent client and session implementation for the free starter model relay. Why: Imported by the provider registry to let new users talk to a starter model without setup. checked: nothing personal
- `packages/server/src/server/agent/providers/hizuri-free/relay-client.ts` — An HTTP and SSE client for communicating with the starter model relay. Why: Used by FreeBrainAgentClient to authenticate anonymous installs and stream chat completions from the relay. checked: nothing personal
- `packages/server/src/server/agent/providers/hizuri-free/role-prompt.ts` — The default system instructions guiding the free starter brain. Why: Imported by FreeBrainAgentClient to explain hizuri and help users connect their own Claude Code. checked: nothing personal

## `packages/server/src/server/agent/providers/omp/`

Paseo's files here: The daemon hizuri runs; these files integrate the OMP agent protocol, translating advisor notes, host tools, permissions, and subagent cards into timeline events.

- `packages/server/src/server/agent/providers/omp/advisor-message.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/agent.diagnostic.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/agent.history-purpose.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/agent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/ask.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/cli-runtime.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/cli-runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/commands.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/commands.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/custom-message.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/event-mapper.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/event-mapper.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/history-hooks.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/history-mapper.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/history.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/host-tools.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/host-tools.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/map-omp-model.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/map-omp-model.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/mcp-bridge.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/mcp-bridge.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/message-history.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/protocol-session.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/protocol-session.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/provider-config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/question-ui.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/rpc-types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/rpc-ui-permission-mapper.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/rpc-ui-permission-mapper.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/runtime.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/session-descriptor.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/session-descriptor.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/subagent-card-tracker.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/subagent-card-tracker.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/subagent-index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/subagent-index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/subagent-title.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/system-notice.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/system-notice.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/todo-mapper.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/todo-mapper.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/tool-call-detail.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/tool-call-id.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/tool-call-id.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/tool-call-mapper.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/tool-call-mapper.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/usage-poller.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/usage-poller.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/v17-rpc-compat.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/omp/test-utils/`

Paseo's files here: The daemon hizuri runs; these test harnesses and mock MCP servers exercise OMP protocol interactions, tool calls, and session flows under controlled tests.

- `packages/server/src/server/agent/providers/omp/test-utils/echo-mcp-server.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/test-utils/fake-omp.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/omp/test-utils/omp-harness.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/opencode/`

Paseo's files here: The daemon hizuri runs; these files bridge OpenCode runtime servers, mapping events, notices, rewind steps, and tool invocations into the server timeline.

- `packages/server/src/server/agent/providers/opencode/bridge-input-errors.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/bridge-plugin.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/bridge.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/bridge.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/event-consumer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/event-consumer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/event-translator.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/http-error.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/options.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/paths.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/rewind.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/rewind.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/runtime-client.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/runtime-client.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/runtime-notice.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/server-manager.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/subagent-presentation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/subagent-presentation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/test-server-manager.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/tool-call-detail-parser.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/tool-call-mapper.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/tool-call-mapper.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/opencode/test-utils/`

Paseo's files here: The daemon hizuri runs; these test helpers and mock server harnesses simulate OpenCode event streams and API responses for local end-to-end tests.

- `packages/server/src/server/agent/providers/opencode/test-utils/test-opencode-harness.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/test-utils/v2-harness.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/test-utils/v2-local-e2e-helpers.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/test-utils/v2-streamed-text-memory.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/opencode/v2/`

Paseo's files here: The daemon hizuri runs; these files implement the OpenCode v2 client, handling readiness checks, permission flows, structured outputs, and timeline streaming.

- `packages/server/src/server/agent/providers/opencode/v2/agent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/api.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/bridge-plugin.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/capabilities.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/children.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/commands.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/configuration.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/configuration.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/history.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/mapping.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/mapping.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/permissions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/permissions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/readiness.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/readiness.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/session.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/streaming.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/structured-output-plugin.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/structured-output.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/timeline.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/timeline.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/turns.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/usage.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/opencode/v2/usage.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/`

Paseo's files here: The daemon hizuri runs; these files adapt the Pi coding agent RPC runtime, translating tool calls, usage polling, and session history into daemon events.

- `packages/server/src/server/agent/providers/pi/agent.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/agent.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/cli-runtime.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/cli-runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/history-mapper.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/history-mapper.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/rewind.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/rpc-types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/session-descriptor.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/session-descriptor.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/tool-call-mapper.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/tool-call-mapper.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/usage-poller.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/usage-poller.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/`

Paseo's files here: The daemon hizuri runs; these files host and register modular Pi extensions so custom tools, child sessions, and dialog mappers can extend Pi agents.

- `packages/server/src/server/agent/providers/pi/extensions/child-session.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/contract.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/host.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/subagent-fixture-test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/task-fixture-test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/gotgenes-pi-subagents/`

Paseo's files here: The daemon hizuri runs; these files adapt the gotgenes subagent extension for Pi, tracking child session lifecycles, background forks, and tool outputs.

- `packages/server/src/server/agent/providers/pi/extensions/gotgenes-pi-subagents/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/gotgenes-pi-subagents/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/gotgenes-pi-subagents/runtime-bridge.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/gotgenes-pi-subagents/fixtures/`

Paseo's files here: The daemon hizuri runs; these captured logs and JSON traces verify subagent spawning, foreground turns, and child session streaming against real recordings.

- `packages/server/src/server/agent/providers/pi/extensions/gotgenes-pi-subagents/fixtures/background.json` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/gotgenes-pi-subagents/fixtures/child-session.jsonl` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/gotgenes-pi-subagents/fixtures/foreground.json` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/gotgenes-pi-subagents/fixtures/refused-resume.json` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/pi-ask-user/`

Paseo's files here: The daemon hizuri runs; these files translate Pi ask_user tool requests into interactive permission and selection dialogs for the user to answer.

- `packages/server/src/server/agent/providers/pi/extensions/pi-ask-user/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/pi-ask-user/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/pi-example-todo/`

Paseo's files here: The daemon hizuri runs; these files parse Pi example todo tool calls into structured task checklists displayed on the agent timeline.

- `packages/server/src/server/agent/providers/pi/extensions/pi-example-todo/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/pi-example-todo/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/pi-example-todo/fixtures/`

Paseo's files here: The daemon hizuri runs; this recorded RPC fixture validates that todo tool executions produce expected checklist tasks during replay tests.

- `packages/server/src/server/agent/providers/pi/extensions/pi-example-todo/fixtures/rpc-session.json` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/pi-goal-x/`

Paseo's files here: The daemon hizuri runs; these files map pi-goal-x tool output trees into hierarchical task goals displayed on the agent session interface.

- `packages/server/src/server/agent/providers/pi/extensions/pi-goal-x/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/pi-goal-x/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/pi-goal-x/fixtures/`

Paseo's files here: The daemon runs this fixture to verify parsing of recorded goal tracking events from the Pi agent, ensuring regression test stability.

- `packages/server/src/server/agent/providers/pi/extensions/pi-goal-x/fixtures/rpc-session.json` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/pi-mcp-adapter/`

Paseo's files here: The daemon runs this adapter to translate tool calls between the Pi agent and MCP servers, letting the assistant use external tools seamlessly.

- `packages/server/src/server/agent/providers/pi/extensions/pi-mcp-adapter/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/pi-mcp-adapter/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/pi-subagents/`

Paseo's files here: The daemon runs these files to map subagent tool calls and spawn child processes, enabling the assistant to run background delegation tasks.

- `packages/server/src/server/agent/providers/pi/extensions/pi-subagents/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/pi-subagents/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/pi-subagents/fixtures/`

Paseo's files here: The daemon tests use these subagent session recordings to verify background, foreground, and child process event mapping for the Pi provider.

- `packages/server/src/server/agent/providers/pi/extensions/pi-subagents/fixtures/background.json` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/pi-subagents/fixtures/child-session.jsonl` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/pi-subagents/fixtures/foreground.json` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/pi-subagents/fixtures/wait.json` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/rpiv-ask-user-question/`

Paseo's files here: The daemon runs this extension to map agent clarification questions into UI dialogs, allowing the assistant to collect interactive input from the user.

- `packages/server/src/server/agent/providers/pi/extensions/rpiv-ask-user-question/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/rpiv-ask-user-question/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/rpiv-ask-user-question/fixtures/`

Paseo's files here: The daemon tests use these fixture events to ensure question prompts and cancellations from Pi sessions map accurately to protocol dialog messages.

- `packages/server/src/server/agent/providers/pi/extensions/rpiv-ask-user-question/fixtures/cancel-result.json` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/rpiv-ask-user-question/fixtures/rpc-session.json` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/rpiv-todo/`

Paseo's files here: The daemon runs this adapter to parse task management tool calls, synchronizing the assistant's todo list items with the daemon timeline.

- `packages/server/src/server/agent/providers/pi/extensions/rpiv-todo/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/rpiv-todo/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/rpiv-todo/fixtures/`

Paseo's files here: The daemon tests run this session log to verify that task creation and status changes from Pi extensions parse into valid timeline tasks.

- `packages/server/src/server/agent/providers/pi/extensions/rpiv-todo/fixtures/rpc-session.json` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/tintinweb-pi-subagents/`

Paseo's files here: The daemon runs this adapter to translate alternative subagent tool invocations and artifact outputs, supporting diverse multi-agent execution styles.

- `packages/server/src/server/agent/providers/pi/extensions/tintinweb-pi-subagents/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/tintinweb-pi-subagents/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/extensions/tintinweb-pi-subagents/fixtures/`

Paseo's files here: The daemon tests evaluate these captured subagent sessions to ensure proper event mapping across background agent groups and child outputs.

- `packages/server/src/server/agent/providers/pi/extensions/tintinweb-pi-subagents/fixtures/background-group.json` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/tintinweb-pi-subagents/fixtures/background.json` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/tintinweb-pi-subagents/fixtures/child-session.jsonl` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/providers/pi/extensions/tintinweb-pi-subagents/fixtures/foreground.json` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/pi/test-utils/`

Paseo's files here: The daemon tests use this fake Pi runtime to simulate agent sessions, models, and slash commands without running external binaries.

- `packages/server/src/server/agent/providers/pi/test-utils/fake-pi.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/providers/test-utils/`

Paseo's files here: The daemon tests rely on this stream adapter to convert agent stream events into predictable turn completions and prompt promises.

- `packages/server/src/server/agent/providers/test-utils/session-stream-adapter.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/rewind/`

Paseo's files here: The daemon runs rewind handlers to revert conversation turns or altered workspace files, allowing the user to undo unwanted agent actions.

- `packages/server/src/server/agent/rewind/rewind.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/rewind/rewind.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/rewind/test-rewind-session.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/agent/tools/`

Paseo's files here: The daemon runs tool definition serialization helpers to format schema structures for agent providers and external tool protocol integrations.

- `packages/server/src/server/agent/tools/paseo-tool-serialization.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/agent/tools/paseo-tools.ts` — Tool registry integrating stage, show, tool hub, secrets, voice settings, and model switching into agent tool catalogs. Why: Provides agent tools during agent sessions; without it, agents lack access to stage, secrets, tool hub, and voice settings. checked: nothing personal
- `packages/server/src/server/agent/tools/self-model-tool.test.ts` — Unit tests for the set_my_model agent tool. Why: Verifies that set_my_model switches caller models and thinking options correctly; run by vitest. checked: nothing personal
- `packages/server/src/server/agent/tools/self-model-tool.ts` — The set_my_model tool allowing calling agents to query and change their own LLM model and effort. Why: Imported by paseo-tools.ts to give agents the ability to dynamically switch their active model and thinking effort. checked: nothing personal
- `packages/server/src/server/agent/tools/types.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/authorization/`

Paseo's files here: The daemon runs permission checking logic on inbound and outbound messages, securing agent sessions against unauthorized operations.

- `packages/server/src/server/authorization/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/authorization/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/authorization/operation-permissions.ts` — Permission mapping table assigning required daemon permissions to inbound and outbound protocol messages. Why: Imported by daemon session routers to authorize message requests before processing them. checked: nothing personal

## `packages/server/src/server/auto-archive-on-merge/`

Paseo's files here: The daemon runs auto-archive handlers to clean up workspaces and kill stale terminals when pull requests merge, keeping disk usage lean.

- `packages/server/src/server/auto-archive-on-merge/archive-if-safe.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/auto-archive-on-merge/archive-if-safe.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/auto-archive-on-merge/behavior.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/auto-archive-on-merge/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/auto-archive-on-merge/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/browser-tools/`

Paseo's files here: The daemon runs this browser broker to route web automation commands and screenshots between coding agents and client browsers safely.

- `packages/server/src/server/browser-tools/broker.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/browser-tools/broker.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/browser-tools/errors.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/browser-tools/policy.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/browser-tools/tools.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/browser-tools/tools.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/checkout/`

Paseo's files here: The daemon runs checkout status projection logic to normalize git branches and pull request states into clear messages for client UIs.

- `packages/server/src/server/checkout/status-projection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/checkout/status-projection.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/connected-hosts/`

Paseo's files here: The daemon runs connected host sessions to tunnel commands and file transfers across remote machines, supporting multi-host development.

- `packages/server/src/server/connected-hosts/hosts.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/connected-hosts/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/connected-hosts/link.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/connected-hosts/session.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/creation/`

Paseo's files here: The daemon runs the creation service to initialize workspaces and seed project templates, helping the user start new repositories quickly.

- `packages/server/src/server/creation/creation.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/creation/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/creation/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/daemon-e2e/`

Paseo's files here: The daemon test suite runs end-to-end integration scenarios across providers, git workflows, and terminals to verify system stability.

- `packages/server/src/server/daemon-e2e/agent-archive.native.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/agent-basics.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/agent-configs.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/agent-operations.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/agent-refresh-rehydrates-timeline.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/agent-reload.native.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/agent-rpc-durability.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/auto-archive-unrelated-github-merge.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/background-subagent-action-log.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/checkout-diff-content.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/checkout-diff-subscription.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/checkout-pr-merge.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/checkout-ship.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/claude-autonomous-wake-simple.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/claude-autonomous-wake.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/claude-history-other-project-dir.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/claude-live-usage.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/claude-provider-config-dir-history.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/claude-rewind.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/claude-settings-mid-turn.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/claude-thinking-memory.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/cli-logs-follow.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/codex-auto-review.local.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/codex-custom-provider-archive.local.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/codex-goal-mid-turn.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/codex-rewind.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/connection-offer.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/daemon-restart-resume.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/empty-project-persists.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/file-download.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/filesystem.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/git-diff-bottleneck.local.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/git-operations.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/hoplite-fixture.cjs` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/images.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/live-preferences.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/live-relay.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/mode-switch-propagation.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/model-resolution-on-init.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/model-runtime-reconcile-claude.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/models.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/muse.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/omp.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/open-project-missing-directory.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/open-project-worktree-reclassification.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-custom-agents.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-draft-features.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-import-persistence.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-initial-prompt-wait.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-invalid-mode.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-invalid-model.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-omo-autonomous.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-omo-real-runtime.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-omo-real-runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-plan-and-questions.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-rewind.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-send-interrupt.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/opencode-slow-plugin-readiness.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/orchestration.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/oversized-message.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/permissions-claude.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/permissions-codex.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/persistence.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/pi-rewind.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/pi.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/project-becomes-git.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/project-path-spaces.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/real-provider-test-config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/relay-transport.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/rewind-user-message-dedupe-claude.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/send-during-tool-call-claude.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/send-during-tool-call-codex.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/send-while-running-stuck-claude.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/send-while-running-stuck-test-utils.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/send-while-running-stuck-test-utils.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/send-while-running-stuck.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/streaming.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/terminal-byte-headless-parity.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/terminal-workspace-sdk.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/terminal.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/timeline-reconnect-contract.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/timeline-window.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/tool-calls.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/two-cycle-resume.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/ui-action-stress.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/user-message-contract.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/daemon-e2e/wait-for-idle.e2e.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/daemon-e2e/test-utils/`

Paseo's files here: The daemon test suite uses these rewind helpers to set up workspace files and assert timeline rollback states during rewind tests.

- `packages/server/src/server/daemon-e2e/test-utils/rewind-helpers.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/data-scopes/`

- `packages/server/src/server/data-scopes/config-secrets.test.ts` — Tests for detecting literal secrets and resolving secret references from the vault into configuration fields. Why: Vitest runs it to verify configuration secret resolution, error handling, and leak prevention. checked: nothing personal
- `packages/server/src/server/data-scopes/config-secrets.ts` — Helper functions to inspect configuration for literal secrets and load referenced vault secrets at startup, for config.json fields and the credential env knobs of the user's own settings folder. Why: Imported by server startup routines to sanitize configuration and open referenced secrets securely. checked: nothing personal
- `packages/server/src/server/data-scopes/exportable-setup.test.ts` — Tests for stripping personal data and redacting secrets when exporting configuration setups. Why: Vitest runs it to verify that exported setups pass personal guard validation and contain no private values. checked: nothing personal
- `packages/server/src/server/data-scopes/exportable-setup.ts` — Utility to strip personal paths and null out secret values from configuration for sharing. Why: Used by setup export commands to produce clean, shareable configuration packages. checked: nothing personal
- `packages/server/src/server/data-scopes/load-order.test.ts` — Tests verifying precedence across defaults, setup configuration, personal profile settings, and vault secrets. Why: Vitest runs it to confirm that configuration layering and override precedence work correctly. checked: nothing personal
- `packages/server/src/server/data-scopes/scopes.test.ts` — Tests verifying classification rules for configuration schema fields, environment keys, and token patterns. Why: Vitest runs it to ensure all daemon settings map to valid data scopes. checked: nothing personal
- `packages/server/src/server/data-scopes/scopes.ts` — Definitions and classification rules categorizing daemon settings into setup, personal, or secret scopes. Why: Imported by secret checkers and export tools to distinguish shareable settings from sensitive user data. checked: nothing personal
- `packages/server/src/server/data-scopes/secret-refs.ts` — Types and utility functions to parse and inject opened secret references into target configuration paths and credential env knobs. Why: Imported across server modules to replace reference strings with opened vault values where needed. checked: nothing personal

## `packages/server/src/server/dictation/`

Paseo's files here: The daemon runs the dictation manager to stream raw mic audio into speech-to-text engines, enabling voice transcription for the user.

- `packages/server/src/server/dictation/dictation-stream-manager.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/dictation/dictation-stream-manager.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/directory-sync/`

Paseo's files here: The daemon runs directory sync services to broadcast versioned project, workspace, and agent collections across connected client applications.

- `packages/server/src/server/directory-sync/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/directory-sync/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/directory-sync/internal/`

Paseo's files here: Inside the daemon, this collection tracks entity revisions with incremental cursors so clients can sync directory changes efficiently without full refetches.

- `packages/server/src/server/directory-sync/internal/versioned-collection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/directory-sync/internal/versioned-collection.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/file-download/`

Paseo's files here: Inside the daemon, these helpers format RFC-compliant download headers and manage download tokens so clients can securely download files with non-ASCII names.

- `packages/server/src/server/file-download/content-disposition.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-download/content-disposition.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-download/token-store.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/file-explorer/`

Paseo's files here: Inside the daemon, these services inspect workspace directories and observe file updates so the file explorer UI displays live project changes.

- `packages/server/src/server/file-explorer/observer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-explorer/observer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-explorer/service.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-explorer/service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-explorer/service.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/file-observer/`

Paseo's files here: Inside the daemon, this cross-platform file watcher coordinates filesystem monitoring backends so changes across project trees emit consistent events.

- `packages/server/src/server/file-observer/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-observer/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-observer/native-recursive.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/file-observer/internal/`

Paseo's files here: Inside the daemon, these internal watcher implementations handle Linux inotify and recursive system events so file changes are classified reliably.

- `packages/server/src/server/file-observer/internal/contracts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-observer/internal/linux.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-observer/internal/linux.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-observer/internal/native-recursive.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-observer/internal/native-recursive.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-observer/internal/observation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-observer/internal/paths.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-observer/internal/paths.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/file-upload/`

Paseo's files here: Inside the daemon, this store reassembles binary chunks from client uploads so users can attach workspace files without memory exhaustion.

- `packages/server/src/server/file-upload/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/file-upload/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/hub/`

Paseo's files here: Inside the daemon, these controllers manage remote connections and command executions so central hub servers can orchestrate agents and worktrees.

- `packages/server/src/server/hub/daemon-executions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/daemon-executions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/execution-controller.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/execution-controller.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/execution-session.websocket.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/hub-cli-contract.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/provider-policy.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/relationship-controller.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/relationship-controller.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/relationship-liveness.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/relationship-remote.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/relationship-remote.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/relationship-retry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/relationship-retry.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/hub/test-utils/`

Paseo's files here: Inside the daemon, these test utilities simulate MCP action handlers and hub client commands so connection lifecycles can be validated thoroughly.

- `packages/server/src/server/hub/test-utils/hub-action-sink.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/test-utils/hub-cli-entry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/hub/test-utils/relationship-harness.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/managed-processes/`

Paseo's files here: Inside the daemon, this registry tracks external processes and enforces graceful process termination so background agent tools stop cleanly.

- `packages/server/src/server/managed-processes/managed-processes.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/managed-processes/managed-processes.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/message-receipts/`

Paseo's files here: Inside the daemon, this ledger persists message fingerprints so retransmitted client messages do not trigger duplicate agent executions.

- `packages/server/src/server/message-receipts/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/message-receipts/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/migrations/`

Paseo's files here: Inside the daemon, this migration backfills workspace ownership onto legacy agent records so modern storage schemes remain consistently partitioned.

- `packages/server/src/server/migrations/backfill-workspace-id.migration.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/migrations/backfill-workspace-id.migration.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/modules/`

- `packages/server/src/server/modules/contract.ts` — Type definitions and validation logic for hot-swappable module decision contracts and probes. Why: Imported by the module kernel to validate dynamic modules before loading or execution. checked: nothing personal
- `packages/server/src/server/modules/kernel.test.ts` — Tests for the dynamic module kernel covering module loading, probing, and shadow runs. Why: Runs in vitest to verify that module contract mismatches and shadow evaluations behave safely. checked: nothing personal
- `packages/server/src/server/modules/kernel.ts` — The kernel for hot-swapping and running dynamic server modules without daemon restarts. Why: Used by the voice pipeline to execute modular logic safely with rollback and shadow comparisons. checked: nothing personal
- `packages/server/src/server/modules/settings.ts` — Parser and schema validator for the modules configuration section in voice settings. Why: Imported by voice settings stores and the module kernel to configure active module versions. checked: nothing personal
- `packages/server/src/server/modules/versions.ts` — Functions and errors for writing and dynamically importing content-hashed module version files. Why: Imported by the module kernel to load and manage immutable module code on disk. checked: nothing personal

## `packages/server/src/server/orchestration-skills/`

Paseo's files here: Inside the daemon, this interface exposes installed agent skills so clients can query and manage available assistant abilities.

- `packages/server/src/server/orchestration-skills/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/orchestration-skills/internal/`

Paseo's files here: Inside the daemon, these controllers handle skill installations, filesystem syncing, and selection storage so orchestration tools update safely.

- `packages/server/src/server/orchestration-skills/internal/controller.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/orchestration-skills/internal/controller.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/orchestration-skills/internal/operations.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/orchestration-skills/internal/operations.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/orchestration-skills/internal/paths.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/orchestration-skills/internal/paths.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/orchestration-skills/internal/selection-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/orchestration-skills/internal/selection-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/orchestration-skills/internal/sync.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/orchestration-skills/internal/sync.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/orchestration-skills/internal/transaction.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/pagination/`

Paseo's files here: Inside the daemon, these utilities encode and decode opaque sorting cursors so large entity collections support consistent keyset pagination.

- `packages/server/src/server/pagination/cursor.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/pagination/cursor.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/pagination/sortable-pager.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/pagination/sortable-pager.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/plugins/`

Paseo's files here: Inside the daemon, this runtime loads, isolates, and connects external plugins so extensions can safely hook into daemon events.

- `packages/server/src/server/plugins/agent-configuration.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/bundle-evaluator.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/compiler-imports.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/compiler.test.ts` — Tests for the plugin bundling compiler, boundary validations, and external module mappings. Why: Run by vitest to ensure client and server plugin code compile and isolate properly. checked: nothing personal
- `packages/server/src/server/plugins/compiler.ts` — Compiler bundling client and server plugins with esbuild while enforcing runtime boundary constraints. Why: Imported by plugin management services to compile user and built-in plugins safely. checked: nothing personal
- `packages/server/src/server/plugins/connection-demand.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/daemon-transport.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/daemon-transport.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/index.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/internal-child.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/internal-seam.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/lifecycle-archive.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/lifecycle.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/lifecycle.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/managed-source.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/managed-source.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/manifest.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/manifest.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/plugin-paseo-api.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/plugin-process-protocol.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/plugin-process.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/plugin-process.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/plugin-sdk-specifiers.ts` — Lists and helper checks for plugin SDK and native client module import specifiers. Why: Imported by the plugin compiler to exclude host-provided native modules from bundles. checked: nothing personal
- `packages/server/src/server/plugins/plugin-session-identity.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/preparation.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/preparation.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/provider-icon.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/provider-icon.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/requirements.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/runtime.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/session-socket.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/session-socket.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/session-socket.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/settings.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/usage-sources.e2e.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/plugins/builtin/`

Paseo's files here: Inside the daemon, this loader initializes standard plugins bundled with the release so default model providers and usage sources are available immediately.

- `packages/server/src/server/plugins/builtin/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/builtin/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/plugins/lifecycle/`

Paseo's files here: Inside the daemon, this dispatcher routes lifecycle hooks before and after server events so plugins can validate or adjust agent workflows.

- `packages/server/src/server/plugins/lifecycle/handlers.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/lifecycle/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/plugins/managed-source/`

Paseo's files here: Inside the daemon, these helpers verify packages and query registries so managed plugins install cleanly from npm sources.

- `packages/server/src/server/plugins/managed-source/npm.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/managed-source/registry.ts` — Resolver for plugin registry metadata and artifacts using configured authentication headers. Why: Used by plugin installation routines to fetch plugin definitions from remote registries. checked: nothing personal

## `packages/server/src/server/plugins/settings/`

Paseo's files here: Inside the daemon, this store validates and persists plugin configuration values so extensions remember user settings across restarts.

- `packages/server/src/server/plugins/settings/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/settings/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/plugins/test-fixtures/`

Paseo's files here: Inside the daemon, this echo harness reflects IPC frames so plugin transport and process communication can be verified in tests.

- `packages/server/src/server/plugins/test-fixtures/plugin-session-echo.cjs` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/plugins/test-fixtures/internal-seam/`

Paseo's files here: Inside the daemon, this fixture plugin defines test RPCs and hook listeners so plugin lifecycle tests have a predictable test extension.

- `packages/server/src/server/plugins/test-fixtures/internal-seam/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/test-fixtures/internal-seam/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/plugins/test-fixtures/usage-source-directory/`

Paseo's files here: Inside the daemon, this fixture plugin registers a directory-scoped usage source so usage discovery tests can verify account lookups.

- `packages/server/src/server/plugins/test-fixtures/usage-source-directory/icon.svg` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/test-fixtures/usage-source-directory/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/test-fixtures/usage-source-directory/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/plugins/test-fixtures/usage-source/`

Paseo's files here: Inside the daemon, this fixture provides mock usage accounting metrics so consumption tracking tests run against deterministic sample data.

- `packages/server/src/server/plugins/test-fixtures/usage-source/icon.svg` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/test-fixtures/usage-source/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/test-fixtures/usage-source/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/plugins/usage-sources/`

Paseo's files here: Inside the daemon, this registry aggregates provider resource metrics across plugins so the UI displays consolidated model usage reports.

- `packages/server/src/server/plugins/usage-sources/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/plugins/usage-sources/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/push/`

Paseo's files here: Inside the daemon, this service tracks client device tokens and delivers push notifications so users stay informed about agent updates.

- `packages/server/src/server/push/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/push/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/push/push-service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/push/token-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/push/token-store.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/schedule/`

Paseo's files here: The daemon hizuri runs; these files parse cron cadence rules and store scheduled job definitions so agents can run automated tasks at set intervals.

- `packages/server/src/server/schedule/cron.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/schedule/cron.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/schedule/service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/schedule/service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/schedule/store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/schedule/store.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/secrets/`

- `packages/server/src/server/secrets/bitwarden.test.ts` — Tests for secret vault storage and retrieval using a Bitwarden command-line backend. Why: Run by vitest to verify credentials store and read cleanly without argument leakage. checked: nothing personal
- `packages/server/src/server/secrets/bitwarden.ts` — Bitwarden backend CLI integration and libsecret secret-tool keyring client for managing secrets. Why: Imported by secrets setup to run Bitwarden commands or access the OS keyring without exposing values. checked: nothing personal
- `packages/server/src/server/secrets/forms.ts` — Form field definitions and validation logic for passwords, emails, cards, and payment limits. Why: Imported by SecretService to validate and normalize form inputs submitted through stage secret forms. checked: nothing personal
- `packages/server/src/server/secrets/service.test.ts` — Tests for the SecretService lifecycle, stage integration, agent tool masking, and limits. Why: Executed by vitest to guarantee secret values never leak to logs, stage state, or tool outputs. checked: nothing personal
- `packages/server/src/server/secrets/service.ts` — Service managing stage secret forms, pending user submissions, and secure secret usage. Why: Imported by secrets tools and setup to handle secret creation, listing, forgetting, and invocation. checked: nothing personal
- `packages/server/src/server/secrets/setup.ts` — Initialization helper that resolves the vault directory, key source, and secret service. Why: Called during daemon startup to configure Bitwarden or local encrypted vaults based on environment settings. checked: nothing personal
- `packages/server/src/server/secrets/tools.ts` — Agent tool registrations for requesting, using, listing, and forgetting secrets through Show. Why: Exposes secret management tools to agents while keeping raw secret values hidden from LLMs. checked: nothing personal
- `packages/server/src/server/secrets/use.ts` — Runner that types secrets via xdotool or passes them into child processes with redacted output. Why: Imported by SecretService to safely apply secrets to browser forms and shell commands. checked: nothing personal
- `packages/server/src/server/secrets/vault.test.ts` — Tests for SecretVault encryption, key derivation, OS keyring fallback, and payment limit enforcement. Why: Executed by vitest to verify AES-256-GCM vault security and spending limit rules. checked: nothing personal
- `packages/server/src/server/secrets/vault.ts` — Encrypted file vault implementation with AES-256-GCM, key source resolution, and transaction tracking. Why: Imported by SecretService and setup to store and retrieve secret entries securely. checked: nothing personal

## `packages/server/src/server/session/`

- `packages/server/src/server/session/hizuri-session.ts` — The Hizuri extensions for client sessions handling stage requests, secrets, voice persistence, and agent message compaction. Why: Imported by Session in session.ts to isolate voice companion routing, stage messaging, and compact hold logic. checked: nothing personal

## `packages/server/src/server/session/agent-config/`

Paseo's files here: The daemon hizuri runs; these files handle session commands to inspect and update agent configuration so clients can switch agent modes or models on the fly.

- `packages/server/src/server/session/agent-config/agent-config-session.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/agent-config/agent-config-session.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/agent-updates/`

Paseo's files here: The daemon hizuri runs; these files stream live agent state snapshots and filter matching events to client sessions so clients stay synced with agent progress.

- `packages/server/src/server/session/agent-updates/agent-updates-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/agent-updates/agent-updates-service.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/checkout/`

Paseo's files here: The daemon hizuri runs; these files manage git checkout inspection, commit history, and diff subscriptions over sessions so clients can review and track branch changes.

- `packages/server/src/server/session/checkout/checkout-session.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/checkout/checkout-session.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/checkout/git-metadata-generator.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/checkout/git-metadata-generator.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/daemon/`

Paseo's files here: The daemon hizuri runs; these files manage self-update checks and npm CLI installs so the daemon process can update its own installation safely.

- `packages/server/src/server/session/daemon/daemon-self-update-session-controller.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/daemon/daemon-self-update-session-controller.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/daemon/daemon-self-updater.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/daemon/daemon-self-updater.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/daemon/daemon-session.test.ts` — Tests for DaemonSession RPC handling, including config reload, status checks, and app log uploads. Why: Executed by vitest to verify daemon session request handlers and app log file persistence. checked: nothing personal
- `packages/server/src/server/session/daemon/daemon-session.ts` — Session controller managing daemon-level RPC requests, pairing offers, diagnostics, and app log uploads. Why: Dispatches incoming daemon WebSocket messages from clients, writing uploaded client logs to disk. checked: nothing personal
- `packages/server/src/server/session/daemon/diagnostics.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/daemon/install-origin.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/daemon/npm-global-cli.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/daemon/npm-global-cli.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/files/`

Paseo's files here: The daemon hizuri runs; these files stream workspace file transfers and manage file crud operations so clients can view and edit project files remotely.

- `packages/server/src/server/session/files/workspace-files-session.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/files/workspace-files-session.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/git-mutation/`

Paseo's files here: The daemon hizuri runs; these files execute safe branch creations, checkouts, and reset operations on workspace git repositories requested by client sessions.

- `packages/server/src/server/session/git-mutation/git-mutation-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/git-mutation/git-mutation-service.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/owned-subscriptions/`

Paseo's files here: The daemon hizuri runs; these files track active subscriptions and scoped async operations per connection to prevent memory leaks and cancel abandoned tasks when clients disconnect.

- `packages/server/src/server/session/owned-subscriptions/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/owned-subscriptions/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/owned-subscriptions/replies.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/owned-subscriptions/test-utils/`

Paseo's files here: The daemon hizuri runs; this test script stresses repeated connection allocations under garbage collection to prove session delivery cleans up without retained memory leaks.

- `packages/server/src/server/session/owned-subscriptions/test-utils/memory-repro.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/project-config/`

Paseo's files here: The daemon hizuri runs; these files validate and update project configuration files while verifying uncommitted worktree setup changes remain safe during edits.

- `packages/server/src/server/session/project-config/project-config-session.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/project-config/project-config-session.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/project-config/worktree-setup-commit-status.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/project-config/worktree-setup-commit-status.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/provider/`

Paseo's files here: The daemon hizuri runs; these files aggregate and stream model provider catalog snapshots so connected sessions receive available models and auth status updates.

- `packages/server/src/server/session/provider/provider-catalog-session.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/provider/provider-catalog-session.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/schedule/`

Paseo's files here: The daemon hizuri runs; these files connect websocket sessions to the schedule service so users can list, trigger, or cancel periodic agent jobs.

- `packages/server/src/server/session/schedule/schedule-session.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/schedule/schedule-session.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/usage/`

Paseo's files here: The daemon hizuri runs; these files aggregate and push token consumption reports and provider metrics over sessions so users can monitor AI usage costs.

- `packages/server/src/server/session/usage/usage-session.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/usage/usage-session.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/voice/`

- `packages/server/src/server/session/voice/barge-hold.ts` — The voice barge-in manager detecting spoken interruptions and pausing or stopping assistant speech playback. Why: Imported by the voice session pipeline to pause text-to-speech output when the user speaks. checked: nothing personal
- `packages/server/src/server/session/voice/compact-hold.ts` — The queue coordinator holding spoken phrases while an agent compacts memory and delivering them as one batch. Why: Used by HizuriSession to avoid interrupting or steering agents during memory compaction turns. checked: nothing personal
- `packages/server/src/server/session/voice/echo-canceller.ts` — The acoustic echo cancellation wrapper running Speex WebAssembly or LiveKit WebRTC AEC3 on microphone audio. Why: Imported by the voice pipeline to strip assistant speech feedback from incoming microphone streams. checked: nothing personal
- `packages/server/src/server/session/voice/echo-drop.ts` — The heuristic classifier determining whether a recognized speech transcript is an echoed assistant phrase. Why: Used by the voice processing pipeline to discard echoed speaker audio before routing transcripts to agents. checked: nothing personal
- `packages/server/src/server/session/voice/echo-filter.ts` — The filter detecting speaker echo and assistant self-hearing from microphone transcripts. Why: Imported by voice session modules to drop microphone input echoing the assistant's spoken replies. checked: nothing personal
- `packages/server/src/server/session/voice/echo-route.ts` — Route-aware barge-in decisions and letter-based echo detection for live transcripts. Why: Imported by voice session turn logic to guard barge-in according to speaker or headphones routes. checked: nothing personal
- `packages/server/src/server/session/voice/fallback-stt.ts` — Fallback speech-to-text resolver using local Parakeet or remote HTTP endpoints. Why: Imported by speech pipeline to transcribe speech when the primary recogniser times out or fails. checked: nothing personal
- `packages/server/src/server/session/voice/fast-front.ts` — Fast acknowledgement agent managing Claude Haiku sessions for immediate spoken responses. Why: Imported by voice session to bridge latency with short verified remarks while agents think. checked: nothing personal
- `packages/server/src/server/session/voice/fast-reply.ts` — Small-model speech acknowledgement generator turning user phrases into structured topic labels. Why: Imported by voice session to deliver sub-second acknowledgements using local OpenAI-compatible endpoints. checked: nothing personal
- `packages/server/src/server/session/voice/floor-manager.ts` — The turn coordinator arbitrating conversational floor permissions between user and assistant brains. Why: Imported by voice session to prevent interruptions and manage speech hold pauses. checked: nothing personal
- `packages/server/src/server/session/voice/foreign-queue.ts` — A queue holding phrases identified as other voices until the assistant's current turn finishes. Why: Used by the voice session pipeline to prevent background voices from interrupting active turns. checked: nothing personal
- `packages/server/src/server/session/voice/front-facts.ts` — Builds the fast front's work facts: running helper agents from their board file and the tasks in work and next from the user's task board over HTTP. Why: Imported by the voice session to provide factual context for the fast front. checked: nothing personal
- `packages/server/src/server/session/voice/front-roles.ts` — Default system role prompts for the fast front voice responder and the visual front stage drawer. Why: Supplies fallback persona instructions when customized role configuration files are not provided. checked: nothing personal
- `packages/server/src/server/session/voice/front-stream.ts` — Manages streaming transcription inputs and evaluates speculative answers from the fast front assistant. Why: Used by the voice session to prepare quick spoken responses before the user finishes talking. checked: nothing personal
- `packages/server/src/server/session/voice/index.ts` — Manages active voice sessions and routes incoming voice protocol messages to active handlers. Why: Imported by daemon session handlers to coordinate microphone streams, turn taking, and session persistence. checked: nothing personal
- `packages/server/src/server/session/voice/mic-gain.ts` — An automatic gain controller adjusting PCM audio volume based on detected speech levels. Why: Used by the voice ingestion pipeline to amplify quiet user speech before speech recognition. checked: nothing personal
- `packages/server/src/server/session/voice/number-words.ts` — Helpers to parse spoken and written number words and digits across languages. Why: Imported by visual grounding and voice display routines to match spoken numbers against on-screen items. checked: nothing personal
- `packages/server/src/server/session/voice/raw-recorder.ts` — Continuous raw microphone audio WAV recorder with automatic time-based file rotation. Why: Imported by voice sessions to preserve unprocessed microphone audio streams to disk. checked: nothing personal
- `packages/server/src/server/session/voice/reply-reference.ts` — Reference buffer tracking assistant audio playback aligned with the microphone sample clock, and EchoLag, which moves it to each reply's measured echo lag. Why: Imported by echo cancellation components to align played TTS audio with incoming mic frames. checked: nothing personal
- `packages/server/src/server/session/voice/secretary.ts` — Shadow-mode classifier judging incoming phrases and handoff intent using a fast language model. Why: Imported by voice session pipelines to classify spoken phrases and route direct handoffs. checked: nothing personal
- `packages/server/src/server/session/voice/short-phrase.ts` — Room background audio level tracker and contextual annotations for brief phrases. Why: Imported by voice turn management to prevent dropping short user utterances in low-confidence conditions. checked: nothing personal
- `packages/server/src/server/session/voice/situation.ts` — Tracker maintaining environmental acoustic context including background noise and external speaker presence. Why: Imported by floor managers and prompt builders to adapt turn-taking rules based on room situation. checked: nothing personal
- `packages/server/src/server/session/voice/speaker-gate.ts` — Speaker embedding extractor and verifier that filters out unrecognized voices and noise hallucinations. Why: Imported by voice session pipelines to ensure only the user's voice triggers assistant actions. checked: nothing personal
- `packages/server/src/server/session/voice/speex-aec-wasm.ts` — The Speex acoustic echo canceller compiled into a Base64-encoded WebAssembly binary string. Why: Imported by the voice echo-canceller module to perform audio echo cancellation without native build dependencies. checked: nothing personal
- `packages/server/src/server/session/voice/status-line.ts` — Helper functions for summarizing agent timeline tool calls and tasks into a single status line. Why: Used by the fast front module to speak concise progress updates in the user's language. checked: nothing personal
- `packages/server/src/server/session/voice/stop-spotter.ts` — The stop-word spotter: a small streaming recogniser of the voice language (a sherpa-onnx zipformer the language table names) that turns the mic into live text while a reply plays and reports a stop word or the drop word without waiting for the STT. Why: Built by voice-owner.ts and fed by the voice session so a stop word stops the reply within about a second. checked: nothing personal
- `packages/server/src/server/session/voice/think-hint.ts` — A class tracking recent response latency to estimate upcoming thinking duration for the avatar. Why: Imported by voice session handlers to send thinking duration hints to the client interface. checked: nothing personal
- `packages/server/src/server/session/voice/visual-front.ts` — The visual front manager that transforms speech phrases into live stage scenes using an LLM session. Why: Used by the daemon voice pipeline to display synchronized UI cards while speech happens. checked: nothing personal
- `packages/server/src/server/session/voice/voice-graph.ts` — The phrase graph recorder logging phrases, replies, and sign confirmations to JSONL files. Why: Tracks phrase delivery and conversation history across sessions for agent accountability and voice telemetry. checked: nothing personal
- `packages/server/src/server/session/voice/voice-journal.ts` — A logging utility writing every finalized speech recognition outcome to daily journal log files. Why: Ensures spoken inputs and drop reasons are retained for auditing when filtering drops them. checked: nothing personal
- `packages/server/src/server/session/voice/voice-mode.ts` — A lookup table and resolver determining interruption criteria based on room acoustics and audio route. Why: Used by the voice pipeline turn manager to decide when spoken phrases interrupt playback. checked: nothing personal
- `packages/server/src/server/session/voice/voice-owner.ts` — Resolver functions for user-specific voice configurations including speaker gates, wake words, and recordings. Why: Supplies external voice paths and security settings to the server daemon voice session initialization. checked: nothing personal
- `packages/server/src/server/session/voice/voice-registry.ts` — A registry managing persistent voice sessions mapped to active AI coding agents across connections. Why: Allows client reconnections to adopt ongoing voice sessions without resetting the underlying agent state. checked: nothing personal
- `packages/server/src/server/session/voice/voice-session.ts` — The coordinator managing streaming voice sessions, turn controllers, audio playback, and graph events. Why: Imported by session handlers to run speech recognition, turn management, and text-to-speech output. checked: nothing personal
- `packages/server/src/server/session/voice/voice-turn-controller.ts` — The controller tracking speech turns, filtering noise, buffering raw audio, and handling STT events. Why: Imported by voice-session to detect speech turns, manage barge-ins, and produce final transcripts. checked: nothing personal

## `packages/server/src/server/session/workspace-git-observer/`

Paseo's files here: The daemon hizuri runs; these files observe git repository branch and status changes across workspaces and notify interested client sessions in real time.

- `packages/server/src/server/session/workspace-git-observer/workspace-git-observer-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/workspace-git-observer/workspace-git-observer-service.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/workspace-provisioning/`

Paseo's files here: The daemon hizuri runs; these files create and register new workspace records with correct initial branch placements when projects are initialized or linked.

- `packages/server/src/server/session/workspace-provisioning/workspace-provisioning-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/workspace-provisioning/workspace-provisioning-service.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/workspace-recovery/`

Paseo's files here: The daemon hizuri runs; these files restore missing or corrupted git worktrees and roll back invalid setups to ensure workspaces remain usable.

- `packages/server/src/server/session/workspace-recovery/workspace-recovery-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/workspace-recovery/workspace-recovery-service.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/session/workspace-scripts/`

Paseo's files here: The daemon hizuri runs; these files launch, monitor, and stream output from project scripts and background services run inside workspaces.

- `packages/server/src/server/session/workspace-scripts/workspace-scripts-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/session/workspace-scripts/workspace-scripts-service.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/show-media/`

- `packages/server/src/server/show-media/files.ts` — The persistent file store managing temporary access tokens and links for media files. Why: Imported by show-media routes and tools to allow client video players to access local daemon media files. checked: nothing personal
- `packages/server/src/server/show-media/plan.test.ts` — Tests for media playback planning, URL parsing, and playback control normalization. Why: Runs under vitest to verify that media links route to the correct video, YouTube, or native app lanes. checked: nothing personal
- `packages/server/src/server/show-media/plan.ts` — The planner resolving media play requests into native video, YouTube iframe, or mobile app playback actions. Why: Imported by show-media tools and tests to determine how requested media URLs and queries should play. checked: nothing personal
- `packages/server/src/server/show-media/routes.test.ts` — Tests for HTTP endpoints serving the embedded YouTube player page and granted local media files. Why: Runs under vitest to verify media streaming routes, range headers, and token expiration. checked: nothing personal
- `packages/server/src/server/show-media/routes.ts` — Express router serving the embedded YouTube player page and granted local media files. Why: Imported by the server daemon to serve public media files and YouTube iframe player web pages. checked: nothing personal
- `packages/server/src/server/show-media/tools.test.ts` — Tests for the show_media and media_control agent tools and stage player integration. Why: Verified by vitest to ensure media tools validate inputs, grant files, and update stage state. checked: nothing personal
- `packages/server/src/server/show-media/tools.ts` — The show_media and media_control tool definitions and execution handlers. Why: Imported by the daemon to register media playback tools for agents to control stage video and audio. checked: nothing personal
- `packages/server/src/server/show-media/youtube-page.ts` — An HTML page template with an embedded YouTube iframe player and postMessage bridge. Why: Served by the daemon for client WebViews to play YouTube content cleanly without referer issues. checked: nothing personal

## `packages/server/src/server/show-tools/`

- `packages/server/src/server/show-tools/tools.test.ts` — Tests for Show widget registration, limits reporting, and screen streaming tools. Why: Verified by vitest to ensure agent Show tools generate correct structured responses and usage summaries. checked: nothing personal
- `packages/server/src/server/show-tools/tools.ts` — The registration handlers and schemas for stage widgets, windows, pages, and usage limits tools. Why: Imported by the daemon to register UI control tools that update the user's second screen. checked: nothing personal
- `packages/server/src/server/show-tools/vocabulary.ts` — Zod schemas, types, and descriptions for Show page widgets like stats, charts, and progress bars. Why: Imported by show-tools/tools.ts to validate widget tool payloads and provide model descriptions. checked: nothing personal

## `packages/server/src/server/speech/`

Paseo's files here: The daemon hizuri runs; these files decode audio payloads and route voice processing between active speech engines for hizuri voice pipeline runtime.

- `packages/server/src/server/speech/audio.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/provider-resolver.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/speech-config-resolver.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/speech-config-resolver.ts` — Speech configuration resolver determining providers and options for dictation, turn detection, STT, and TTS. Why: Resolves server speech settings and sub-provider configurations from environment and stored configurations at startup. checked: nothing personal
- `packages/server/src/server/speech/speech-denoiser.ts` — Child process manager for audio denoising using neural speech enhancement models like DPDFNet and GTCRN. Why: Runs heavy audio noise reduction in an isolated process for turn detection and speech recognition. checked: nothing personal
- `packages/server/src/server/speech/speech-provider.ts` — Type definitions, error classes, and comparison utilities for streaming and batch speech-to-text and text-to-speech providers. Why: Defines core interfaces and error classes used across all speech-to-text and text-to-speech implementations. checked: nothing personal
- `packages/server/src/server/speech/speech-runtime.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/speech-runtime.ts` — The speech service: reconciles local and OpenAI-compatible providers, loads a streaming recogniser module, downloads missing local models and publishes readiness. Why: the daemon's voice and dictation get their STT, TTS and turn detection here. checked: nothing personal
- `packages/server/src/server/speech/speech-types.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/turn-detection-provider.ts` — Interfaces and type definitions for voice activity detection and conversational turn detection sessions. Why: Defines the contract for voice turn detection modules to report speech boundaries and dropped voice frames. checked: nothing personal

## `packages/server/src/server/speech/providers/local/`

Paseo's files here: The daemon hizuri runs; these files configure and isolate local speech model execution inside worker processes to handle offline transcription without stalling the main event loop.

- `packages/server/src/server/speech/providers/local/config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/models.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/models.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/runtime.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/worker-bytes.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/worker-bytes.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/worker-client.ts` — Client managing lifecycle and IPC requests for the out-of-process local speech worker. Why: Imported by local speech providers to run offline STT, TTS, and turn detection in a isolated worker process. checked: nothing personal
- `packages/server/src/server/speech/providers/local/worker-process.local.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/worker-process.ts` — Worker process executing Sherpa ONNX models for speech-to-text, text-to-speech, and turn detection. Why: Spawned as a child process by the worker client to isolate heavy native inference libraries and speech runtimes. checked: nothing personal
- `packages/server/src/server/speech/providers/local/worker-protocol.ts` — Type definitions for IPC requests, responses, and events between the speech daemon and worker. Why: Imported by worker client and worker process to type-check messages passing across the child process IPC channel. checked: nothing personal

## `packages/server/src/server/speech/providers/local/sherpa/`

Paseo's files here: The daemon hizuri runs; these files download and run sherpa and silero models for offline voice activity detection, transcription, and speech synthesis in hizuri voice assistant.

- `packages/server/src/server/speech/providers/local/sherpa/model-catalog.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/model-downloader.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/model-downloader.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/sherpa-offline-recognizer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/sherpa-onnx-node-loader.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/sherpa-parakeet-realtime-session.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/sherpa-parakeet-stt.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/sherpa-parakeet-stt.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/sherpa-runtime-env.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/sherpa-tts.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/sherpa-tts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/silero-vad-provider.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/silero-vad-session.ts` — Voice activity detection session implementation wrapping Sherpa Silero with speech boundary thresholds and Smart Turn. Why: Imported by the local speech pipeline to detect user turn boundaries and barge-in states. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/smart-turn.ts` — Whisper log-mel feature extractor and ONNX model runner for Smart Turn end-of-turn prediction. Why: Imported by silero-vad-session.ts to predict when user speech has ended based on audio features. checked: nothing personal
- `packages/server/src/server/speech/providers/local/sherpa/speech-download.e2e.test.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/speech/providers/local/sherpa/assets/`

Paseo's files here: The daemon hizuri runs; this prebuilt onnx model provides local voice activity detection so hizuri can detect speech boundaries without external network requests.

- `packages/server/src/server/speech/providers/local/sherpa/assets/silero_vad.onnx` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/speech/providers/local/test-fixtures/`

Paseo's files here: The daemon hizuri runs; this mock child worker simulates paused ipc message handling during testing of speech worker process communication.

- `packages/server/src/server/speech/providers/local/test-fixtures/paused-ipc-worker.cjs` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/speech/providers/openai/`

Paseo's files here: The daemon hizuri runs; these files configure and run remote openai speech-to-text and text-to-speech services when cloud voice processing is selected.

- `packages/server/src/server/speech/providers/openai/config.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/openai/config.ts` — Configuration parser and secret resolver for OpenAI speech-to-text and text-to-speech services. Why: Imported by the voice pipeline to configure OpenAI audio transcription and synthesis clients. checked: nothing personal
- `packages/server/src/server/speech/providers/openai/english-pass.ts` — Secondary English speech recognition pass and phonetic similarity checker using an offline recognizer. Why: Imported by transcript finishing utilities to fix misrecognized foreign speech and preserve control phrases. checked: nothing personal
- `packages/server/src/server/speech/providers/openai/finish-transcript.ts` — Post-processing pipeline applying English secondary passes and empty phrase fallbacks to speech transcripts. Why: Imported by batch and streaming speech providers to validate and clean up completed transcripts before emitting them. checked: nothing personal
- `packages/server/src/server/speech/providers/openai/mixed-english.ts` — Dictionary-based converter replacing transliterated loanwords with correct English spellings in transcripts. Why: Imported by speech post-processing fixers to repair English words transcribed phonetically in other scripts. checked: nothing personal
- `packages/server/src/server/speech/providers/openai/runtime.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/openai/runtime.ts` — Factory functions initializing OpenAI-compatible STT, TTS, and streaming speech services. Why: Imported by the server speech subsystem to instantiate configured speech providers based on environment credentials. checked: nothing personal
- `packages/server/src/server/speech/providers/openai/stt-stream-module.ts` — The plug-in point for a streaming speech recogniser kept in the user's setup folder ($HIZURI_HOME/setup/modules), with the helpers the daemon lends it. Why: speech-config-resolver and speech-runtime load it when PASEO_VOICE_STT_STREAM is set; the repo itself streams nothing. checked: nothing personal
- `packages/server/src/server/speech/providers/openai/stt-transcript-fixes.ts` — Configuration resolver and pipeline factory for transcript fixes including vocabulary replacement, mixed English, and English pass. Why: Configures and coordinates post-processing fixes for speech-to-text transcripts; imported by OpenAI STT providers. checked: nothing personal
- `packages/server/src/server/speech/providers/openai/stt-vocab.ts` — Vocabulary rule loader and text replacement engine that restores recognized English terms from custom vocabulary files. Why: Corrects misrecognized technical and custom terms in transcriptions; imported by speech-to-text transcript fixers. checked: nothing personal
- `packages/server/src/server/speech/providers/openai/stt.ts` — OpenAI speech-to-text provider implementing session streaming, audio segment buffering, and transcript post-processing fixes. Why: Powers speech recognition through OpenAI-compatible endpoints with segment buffer handling; used by speech managers. checked: nothing personal
- `packages/server/src/server/speech/providers/openai/tts.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/speech/providers/openai/tts.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/stage/`

- `packages/server/src/server/stage/blocks.test.ts` — Tests for stage block validation, block tag lookups, and fallback text generation. Why: Ensures visual stage block schemas properly normalize inputs and produce accessible fallbacks; run by vitest. checked: nothing personal
- `packages/server/src/server/stage/blocks.ts` — Schema catalog, validation rules, and plain text fallbacks for all stage block components and transitions. Why: Defines and validates rich visual blocks rendered by the companion stage UI; used by stage tools. checked: nothing personal
- `packages/server/src/server/stage/live-scenes.test.ts` — Unit tests for live scene parsing, block generation, and stage rendering. Why: Runs under vitest to verify scene answer schemas, block structures, and live tab drawing behavior. checked: nothing personal
- `packages/server/src/server/stage/live-scenes.ts` — Schemas and transforms for visual front live scene templates. Why: Imported by live-tab.ts and visual front modules to validate scene JSON and construct UI blocks. checked: nothing personal
- `packages/server/src/server/stage/live-tab.ts` — Helper function to render live scene updates onto the stage store. Why: Imported by visual front callers to draw the live Now tab without stealing user focus. checked: nothing personal
- `packages/server/src/server/stage/show-file.test.ts` — Unit tests for show_file tool execution, media router endpoints, and asset pruning. Why: Runs under vitest to test file inspection, copying, allowed folder security, and Express serving. checked: nothing personal
- `packages/server/src/server/stage/show-file.ts` — The show_file tool implementation and stage media file server router. Why: Imported by server stage setup to let agents open documents and serve media assets on the stage. checked: nothing personal
- `packages/server/src/server/stage/show-mirror.ts` — Adapter bridging legacy Show widget tool actions to stage store tabs and blocks. Why: Used by show-tools to mirror window and widget commands into persisted stage tabs. checked: nothing personal
- `packages/server/src/server/stage/stage-session.test.ts` — Unit tests for WebSocket stage request handling and owned change subscriptions. Why: Runs under vitest to test stage session message dispatching, state responses, and client events. checked: nothing personal
- `packages/server/src/server/stage/stage-session.ts` — WebSocket session handler for incoming stage requests and outbound change streaming. Why: Imported by server connection routers to manage stage client subscriptions and action delivery. checked: nothing personal
- `packages/server/src/server/stage/store.test.ts` — Unit tests for stage tab persistence, updates, closures, history, and perch positions. Why: Runs under vitest to verify StageStore disk operations, revisioning, and tab limits. checked: nothing personal
- `packages/server/src/server/stage/store.ts` — Disk-backed storage engine managing stage tabs, history revisions, templates, and subscriptions. Why: Imported across stage session, tools, and live tabs to persist agent stage state. checked: nothing personal
- `packages/server/src/server/stage/templates.ts` — Built-in default stage templates for limits, status, result, and comparison views. Why: Imported by stage tool implementations to initialize tabs from predefined block layouts. checked: nothing personal
- `packages/server/src/server/stage/tools.test.ts` — Unit tests for agent-facing stage management tools. Why: Runs under vitest to verify stage_open, stage_update, stage_perch, and stage_focus behavior. checked: nothing personal
- `packages/server/src/server/stage/tools.ts` — Tool definitions for controlling stage tabs, blocks, and presentation layouts. Why: Registered by agent tool catalog to let agents open and update stage tabs on connected clients. checked: nothing personal

## `packages/server/src/server/test-utils/`

Paseo's files here: The daemon hizuri runs; these testing utilities build mock daemons, fake agents, and simulated repositories to test server subsystems without external services.

- `packages/server/src/server/test-utils/agent-messages.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/class-mocks.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/claude-auth.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/claude-config.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/daemon-client.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/daemon-test-context.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/dictation-e2e.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/fake-agent-client.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/index.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/message-collector.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/outdated-daemon-process.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/paseo-daemon.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/paseo-daemon.ts` — Test utility to start and configure an isolated Paseo daemon instance. Why: Imported across daemon integration tests in vitest to run an ephemeral server. checked: nothing personal
- `packages/server/src/server/test-utils/question-response-daemon.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/relay-latency-fixture.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/session-stubs.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/temp-github-repo.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/versioned-daemon.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/test-utils/workspace-git-service-stub.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/tool-hub/`

- `packages/server/src/server/tool-hub/create-tool-hub.ts` — Factory function to initialize and assemble the daemon tool hub. Why: Imported during daemon initialization to start the tool hub store, receipts key, and execution runner. checked: nothing personal
- `packages/server/src/server/tool-hub/pinning.ts` — Hashing and drift comparison utilities for pinning tool contracts and schemas. Why: Used by the tool hub service to detect unapproved modifications to installed tools. checked: nothing personal
- `packages/server/src/server/tool-hub/receipts.ts` — Cryptographic signing, verification, and chaining functions for tool execution receipts. Why: Used by the tool hub service to log and verify signed chains of tool calls. checked: nothing personal
- `packages/server/src/server/tool-hub/runner.ts` — Sandbox detection, npm package installer, and execution runner for sandboxed MCP server tools. Why: Used by the tool hub service to securely install and run third-party tool servers in isolated sandboxes. checked: nothing personal
- `packages/server/src/server/tool-hub/service.ts` — The tool hub service managing catalog searching, installation approvals, tool execution, and signed reviews. Why: Central logic coordinating MCP tool discovery, installation lifecycle, execution receipts, and review records. checked: nothing personal
- `packages/server/src/server/tool-hub/sources.ts` — Clients and caching search helpers for external MCP catalogs like the official registry and review sites. Why: Called by the tool hub search command to query outside registries for runnable tools. checked: nothing personal
- `packages/server/src/server/tool-hub/store.ts` — File storage engine for installed tools, reviews, secrets, cache, and chained call receipts. Why: Persists tool hub state on disk and maintains receipt chains for agent audits. checked: nothing personal
- `packages/server/src/server/tool-hub/tool-hub.test.ts` — Tests for tool hub receipt signing, chain verification, catalog lookups, and sandboxed installations. Why: Verified by vitest to ensure tool hub security, receipt verification, and search behaviors work. checked: nothing personal
- `packages/server/src/server/tool-hub/tools.ts` — Registration wrappers exposing tool hub commands to agent MCP sessions. Why: Registers hub_find, hub_add, hub_call, hub_reviews, and hub_review tools with the agent MCP server. checked: nothing personal

## `packages/server/src/server/utils/`

Paseo's files here: The daemon hizuri runs; these files parse git diff patches and add syntax highlighting tokens so clients can display code changes clearly.

- `packages/server/src/server/utils/diff-highlighter.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/utils/diff-highlighter.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/voice-language/`

- `packages/server/src/server/voice-language/assistant-name.ts` — Helper functions determining the assistant's spoken name, regex aliases, and localized forms. Why: Used across voice recognition and speech generation to detect or pronounce the assistant's name. checked: nothing personal
- `packages/server/src/server/voice-language/detect.ts` — The language detector for spoken phrases and session language switching state. Why: Used by the voice pipeline to identify spoken phrase languages and switch spoken session responses. checked: nothing personal
- `packages/server/src/server/voice-language/en.ts` — The English voice language definition table, wake words, and patterns. Why: Imported by languages.ts to provide default English voice phrases, keywords, and speech configurations. checked: nothing personal
- `packages/server/src/server/voice-language/languages.ts` — The voice language registry: English plus the languages from the user's setup folder (setup-languages.ts), and the matching helpers (whole words in every language, letter folds, Latin spelled natively, the barge and wake patterns). Why: Used across the voice code to look up a language and match its words. checked: nothing personal
- `packages/server/src/server/voice-language/setup-languages.ts` — Reads the voice languages other than English from the user's setup folder ($HIZURI_HOME/setup/languages/<code>.json, or HIZURI_LANGUAGES_DIR): JSON to regexes, the fast-reply example template, a key-by-key check against en.ts. Why: languages.ts adds these tables to English when the voice code loads. checked: nothing personal
- `packages/server/src/server/voice-language/types.ts` — The TypeScript interfaces defining voice language definitions, number parsing, and phonetic tables. Why: Imported by voice language tables and detection modules to type-check language configurations. checked: nothing personal

## `packages/server/src/server/voice-settings/`

- `packages/server/src/server/voice-settings/knobs.ts` — The definitions, default values, and ranges of voice runtime configuration knobs. Why: Imported by voice settings stores and tools to validate and describe runtime voice options. checked: nothing personal
- `packages/server/src/server/voice-settings/store.ts` — The store managing runtime voice settings file watching, parsing, and live environment overrides. Why: Used by the daemon and speech worker to hot-reload voice settings without restarting. checked: nothing personal
- `packages/server/src/server/voice-settings/tool.ts` — The agent tool for inspecting, modifying, and resetting live voice configuration knobs. Why: Registered into the agent tool catalog so the assistant can adjust voice settings during runtime. checked: nothing personal

## `packages/server/src/server/websocket/`

Paseo's files here: The daemon hizuri runs uses these files to manage encrypted relay sockets and track connection metrics, keeping client communications secure and observable.

- `packages/server/src/server/websocket/encrypted-relay-socket.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket/encrypted-relay-socket.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket/physical-socket.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket/physical-socket.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket/runtime-metrics.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/websocket/runtime-metrics.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/workspace-labels/`

Paseo's files here: The daemon hizuri runs uses these files to manage workspace labels and catalog files, allowing users to organize and tag active development workspaces.

- `packages/server/src/server/workspace-labels/index.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-labels/index.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/workspace-labels/internal/`

Paseo's files here: The daemon hizuri runs uses these files to handle internal catalog storage and sequential change tracking for workspace labels.

- `packages/server/src/server/workspace-labels/internal/catalog-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-labels/internal/sequence.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/server/workspace-labels/internal/service.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/server/worktree/`

Paseo's files here: The daemon hizuri runs uses these files to expose worktree creation and archiving commands, letting agents work in isolated git worktrees.

- `packages/server/src/server/worktree/commands.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/services/`

Paseo's files here: The daemon hizuri runs uses these files to interface with git hosting platforms like GitHub, GitLab, and Gitea via CLI probes.

- `packages/server/src/services/forge-cli-command.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/forge-cli-command.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/forge-registry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/forge-registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/forge-resolver.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/forge-resolver.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/forge-service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/gitea-facts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/gitea-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/gitea-service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/github-facts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/github-repository-search.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/github-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/github-service.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/gitlab-facts.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/gitlab-service.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/services/gitlab-service.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/tasks/`

Paseo's files here: The daemon hizuri runs uses these files to schedule task dependency graphs and execution order for structured coding workflows.

- `packages/server/src/tasks/execution-order.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/tasks/execution-order.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/tasks/task-document.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/tasks/task-graph.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/tasks/task-store.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/tasks/task-store.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/tasks/types.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/terminal/`

Paseo's files here: The daemon hizuri runs uses these files to manage pseudo-terminals, handle worker processes, and coalesce output streams for active coding sessions.

- `packages/server/src/terminal/terminal-capture.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-manager-factory.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-manager.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-manager.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-output-coalescer.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-output-coalescer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-restore.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-restore.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-session-controller.resize.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-session-controller.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-session-controller.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-size-ownership.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-size-ownership.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-ts-loader.mjs` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-worker-process.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal-worker-protocol.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/terminal.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/worker-terminal-manager.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/worker-terminal-manager.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/terminal/activity/`

Paseo's files here: The daemon hizuri runs uses these files to track terminal state and attention requests, allowing the daemon to know when an agent needs user input.

- `packages/server/src/terminal/activity/terminal-activity-tracker.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/activity/terminal-activity-tracker.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/terminal/agent-hooks/`

Paseo's files here: The daemon hizuri runs uses these files to install and register terminal shell hooks that report agent status changes back to the system.

- `packages/server/src/terminal/agent-hooks/agent-hook-installer.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/agent-hooks/provider-registry.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/agent-hooks/provider-registry.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/agent-hooks/terminal-agent-hook-setting.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/agent-hooks/terminal-agent-hook-setting.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/terminal/agent-hooks/claude/`

Paseo's files here: The daemon hizuri runs uses these files to install hooks into Claude Code settings, capturing execution status directly from the agent.

- `packages/server/src/terminal/agent-hooks/claude/claude-settings.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/agent-hooks/claude/claude.real.e2e.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/agent-hooks/claude/claude.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/agent-hooks/claude/claude.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/terminal/agent-hooks/codex/`

Paseo's files here: The daemon hizuri runs uses these files to configure command hooks for the Codex agent inside the terminal.

- `packages/server/src/terminal/agent-hooks/codex/codex-settings.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/agent-hooks/codex/codex.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/agent-hooks/codex/codex.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/terminal/agent-hooks/opencode/`

Paseo's files here: The daemon hizuri runs uses these files to install plugins for OpenCode, emitting status snapshots and execution events to the daemon.

- `packages/server/src/terminal/agent-hooks/opencode/opencode-plugin.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/agent-hooks/opencode/opencode.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/agent-hooks/opencode/opencode.ts` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/terminal/shell-integration/zsh/`

Paseo's files here: The daemon hizuri runs uses these files to inject zsh shell integration and command status markers into interactive terminal sessions.

- `packages/server/src/terminal/shell-integration/zsh/.zshenv` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/terminal/shell-integration/zsh/paseo-integration.zsh` — Paseo, unchanged. checked: nothing personal

## `packages/server/src/test-utils/`

Paseo's files here: The daemon hizuri runs uses these files to supply platform checks and silent loggers across daemon test suites.

- `packages/server/src/test-utils/platform.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/test-utils/test-logger.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/test-utils/vitest-setup.ts` — Setup of every server test: clears a daemon's inherited PASEO_* settings, loads test credentials, and turns off interactive git and SSH prompts. Why: vitest.config.ts runs it before each test file. checked: nothing personal

## `packages/server/src/utils/`

Paseo's files here: The daemon hizuri runs uses these files to handle git commands, process killing, and workspace configuration files across the backend.

- `packages/server/src/utils/build-metadata-prompt.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/change-request-checkout.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/change-request-checkout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/checkout-git-batching.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/checkout-git-ref-derived.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/checkout-git-rev-parse.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/checkout-git.commit-file-diff.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/checkout-git.commits.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/checkout-git.patch-format.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/checkout-git.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/checkout-git.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/directory-suggestions.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/directory-suggestions.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/git-command-runtime-metrics.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/git-command-runtime-metrics.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/git-command-trace.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/git-file-contents.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/git-file-contents.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/git-process-scheduler.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/git-process-scheduler.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/git-quoted-path.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/git-rev-parse-path.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/git-rev-parse-path.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/paseo-config-file.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/paseo-config-file.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/path.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/path.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/project-custom-icon.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/project-custom-icon.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/project-icon.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/project-icon.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/promise-timeout.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/run-git-command-trace.integration.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/run-git-command.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/run-git-command.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/run-git-command.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/run-git-command.windows-shell.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/script-hostname.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/script-hostname.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/spawn.launch-regression.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/spawn.percent-escape.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/spawn.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/spawn.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/ssh-hostname.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/string-command-shell.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/string-command-shell.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/tool-call-parsers.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/tool-call-parsers.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/tree-kill.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/tree-kill.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/worktree-metadata.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/worktree-shell-selection.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/worktree.posix.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/worktree.test.ts` — Paseo, unchanged. checked: nothing personal
- `packages/server/src/utils/worktree.ts` — Paseo, unchanged. checked: nothing personal

## `packages/website/public/schemas/`

- `packages/website/public/schemas/paseo.config.v1.json` — The JSON schema of the daemon's config.json, version 1, generated from the daemon's config types. Why: Editors validate config.json against it through its $schema link; the website folder that serves it is on the list of Paseo leftovers to delete. checked: nothing personal

## `patches/`

Paseo's files here: Fixes to npm dependencies patch upstream libraries for gesture handling, bottom sheets, and Markdown rendering. Hizuri keeps them so package installations build reliably on mobile and desktop runtimes.

- `patches/@gorhom+bottom-sheet+5.2.14.patch` — Paseo, unchanged. checked: nothing personal
- `patches/@mattermost+react-native-paste-input+2.0.1.patch` — Paseo, unchanged. checked: nothing personal
- `patches/@opencode-ai+sdk+1.14.46.patch` — Paseo, unchanged. checked: nothing personal
- `patches/@react-native-masked-view+masked-view+0.3.2.patch` — A patch removing the obsolete package attribute from the masked-view Android manifest. Why: Applied by npm or patch-package during install to fix modern Android build compatibility. checked: nothing personal
- `patches/expo-modules-core+57.0.23.patch` — Paseo, unchanged. checked: nothing personal
- `patches/react-native-draggable-flatlist+4.0.3.patch` — Paseo, unchanged. checked: nothing personal
- `patches/react-native-enriched-markdown+1.2.0-nightly-20261014-766fc0e67.patch` — Paseo, unchanged. checked: nothing personal
- `patches/react-native-gesture-handler+2.32.0.patch` — Paseo, unchanged. checked: nothing personal
- `patches/react-native-reanimated+4.5.1.patch` — A backport of Reanimated 4.7.1's synchronous prop update: a view that is not mounted is skipped and a failure logs one line, where 4.5.1 threw and logged a stack trace for every update. Why: the app's UI thread stalled on the face page while those updates failed; scripts/postinstall-patches.mjs applies it. checked: nothing personal
- `patches/react-native-svg+15.15.4.patch` — Paseo, unchanged. checked: nothing personal
- `patches/react-native-unistyles+3.2.4.patch` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/agent-configuration/`

Paseo's files here: Example plugins show how server hooks alter agent setup parameters before launch. Hizuri keeps this fixture to run automated end-to-end plugin tests against the daemon extension system.

- `plugin-examples/agent-configuration/README.md` — README of the agent-configuration plugin example; its reference link points at Paseo's published docs. Why: plugin authors start from the examples. checked: nothing personal
- `plugin-examples/agent-configuration/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/agent-configuration/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/buttons/`

Paseo's files here: Example plugins define interactive client buttons and popovers in chat toolbars. Hizuri retains this fixture to verify UI extension points during integration tests and plugin SDK validation.

- `plugin-examples/buttons/README.md` — README of the buttons plugin example; its reference links point at Paseo's published docs. Why: plugin authors start from the examples. checked: nothing personal
- `plugin-examples/buttons/index.client.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/buttons/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/buttons/client/`

Paseo's files here: Example plugins implement React Native button components and modal menus for chat composers. Hizuri keeps them to execute automated UI test suites verifying client action registration.

- `plugin-examples/buttons/client/examples.tsx` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/buttons/screenshots/`

Paseo's files here: Example plugins store reference visual assets for toolbar button placements. Hizuri keeps them as documentation artifacts showing expected button behavior in the plugin development guides.

- `plugin-examples/buttons/screenshots/actions.png` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/buttons/screenshots/compact.png` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/buttons/screenshots/menu.png` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/buttons/screenshots/popover.png` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/catppuccin/`

Paseo's files here: Example plugins register custom dark color palettes with the client theme system. Hizuri keeps this example to test custom theme loading and verify dynamic styling contracts.

- `plugin-examples/catppuccin/README.md` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/catppuccin/index.client.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/catppuccin/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/hosts/`

Paseo's files here: Example plugins add custom sidebar icons and server management screens to the client. Hizuri retains them to run end-to-end tests covering host switching and navigation extension points.

- `plugin-examples/hosts/index.client.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/hosts/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/hosts/client/`

Paseo's files here: Example plugins implement the React Native view for listing and connecting remote daemon hosts. Hizuri keeps it as a test fixture for verifying plugin sidebar panels and remote connections.

- `plugin-examples/hosts/client/hosts.tsx` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/inline-thinking/`

Paseo's files here: Example plugins transform chat timeline items to render reasoning tokens inside message feeds. Hizuri keeps this fixture to test timeline transformers and timeline hook stability across updates.

- `plugin-examples/inline-thinking/README.md` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/inline-thinking/index.client.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/inline-thinking/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/inline-thinking/client/`

Paseo's files here: Renders streaming and completed thinking indicators on the client timeline; example plugins for the plugin SDK retain this component as a test fixture for verification.

- `plugin-examples/inline-thinking/client/thinking.tsx` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/lifecycle-actions/`

Paseo's files here: Registers server lifecycle hooks to isolate workspaces and run checks; example plugins for the plugin SDK keep these manifests and handlers as test fixtures.

- `plugin-examples/lifecycle-actions/README.md` — README of the lifecycle-actions plugin example; its reference link points at Paseo's published docs. Why: plugin authors start from the examples. checked: nothing personal
- `plugin-examples/lifecycle-actions/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/lifecycle-actions/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/lifecycle-actions/server/`

Paseo's files here: Extracts latest timeline text and runs shell commands for lifecycle actions; example plugins for the plugin SDK use these utilities as test fixtures.

- `plugin-examples/lifecycle-actions/server/inspect.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/lifecycle-actions/server/inspect.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/lifecycle-logger/`

Paseo's files here: Logs workspace creation, archive, and hook events with redacted environment values; example plugins for the plugin SDK keep this fixture for test coverage.

- `plugin-examples/lifecycle-logger/README.md` — README of the lifecycle-logger plugin example; its reference link points at Paseo's published docs. Why: plugin authors start from the examples. checked: nothing personal
- `plugin-examples/lifecycle-logger/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/lifecycle-logger/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/lifecycle-logger/server/`

Paseo's files here: Redacts sensitive environment variables and writes formatted log output; example plugins for the plugin SDK keep this helper as a test fixture.

- `plugin-examples/lifecycle-logger/server/log.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/linear/`

Paseo's files here: Registers issue search attachments on the client and handles remote calls; example plugins for the plugin SDK retain this integration as a test fixture.

- `plugin-examples/linear/README.md` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/linear/index.client.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/linear/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/linear/linear.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/linear/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/linear/server/`

Paseo's files here: Implements Linear API issue search and query schema parsing; example plugins for the plugin SDK preserve this server logic as a test fixture.

- `plugin-examples/linear/server/issues.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/linear/server/linear.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/linear/shared/`

Paseo's files here: Defines schemas and RPC signatures for issue search attachments; example plugins for the plugin SDK keep this shared contract as a test fixture.

- `plugin-examples/linear/shared/issues.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/local-plugin/`

Paseo's files here: Demonstrates workspace panels and server increment actions; example plugins for the plugin SDK retain this entry point as a fixture for tests.

- `plugin-examples/local-plugin/index.client.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/local-plugin/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/local-plugin/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/local-plugin/client/`

Paseo's files here: Renders an interactive counter panel and button with custom icons; example plugins for the plugin SDK use this UI component as a test fixture.

- `plugin-examples/local-plugin/client/icons.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/local-plugin/client/main.tsx` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/local-plugin/server/`

Paseo's files here: Increments incoming numbers within a plugin subprocess RPC handler; example plugins for the plugin SDK use this logic as a test fixture.

- `plugin-examples/local-plugin/server/increment.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/local-plugin/shared/`

Paseo's files here: Defines input and output schemas for the counter increment RPC; example plugins for the plugin SDK retain this definition as a test fixture.

- `plugin-examples/local-plugin/shared/increment.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/markdown-panel/`

Paseo's files here: Registers a file panel dedicated to viewing markdown documents; example plugins for the plugin SDK preserve this panel setup as a test fixture.

- `plugin-examples/markdown-panel/.gitignore` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/markdown-panel/README.md` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/markdown-panel/index.client.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/markdown-panel/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/markdown-panel/package-lock.json` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/markdown-panel/package.json` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/markdown-panel/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/markdown-panel/client/`

Paseo's files here: Provides a CodeMirror web editor interface and markdown document view; example plugins for the plugin SDK retain this client code as a test fixture.

- `plugin-examples/markdown-panel/client/rich-markdown.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/markdown-panel/client/web.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/modal-ui/`

Paseo's files here: Registers modal screens and sidebar navigation entries; example plugins for the plugin SDK keep this demonstration as a fixture for tests.

- `plugin-examples/modal-ui/LICENSE` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/modal-ui/README.md` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/modal-ui/index.client.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/modal-ui/package.json` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/modal-ui/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/modal-ui/client/`

Paseo's files here: Displays interactive modal screens with toast and text inputs; example plugins for the plugin SDK retain this screen as a test fixture.

- `plugin-examples/modal-ui/client/examples.tsx` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/modal-ui/screenshots/`

Paseo's files here: Provides reference images of modal screens across platforms; example plugins for the plugin SDK keep these visuals for UI regression fixtures.

- `plugin-examples/modal-ui/screenshots/android-copy-paste.png` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/modal-ui/screenshots/android-wide-custom-inset.png` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/modal-ui/screenshots/web-custom-inset.png` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/pdf-panel/`

Paseo's files here: Registers file viewers targeting PDF documents; example plugins for the plugin SDK keep this file panel implementation as a test fixture.

- `plugin-examples/pdf-panel/README.md` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/pdf-panel/index.client.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/pdf-panel/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/pdf-panel/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/pdf-panel/client/`

Paseo's files here: Renders PDF documents within an embedded frame; example plugins for the plugin SDK use this document component as a test fixture.

- `plugin-examples/pdf-panel/client/pdf-panel.tsx` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/provider-acp-transformer/`

Paseo's files here: Adapts agent control protocol commands with custom edit transformers; example plugins for the plugin SDK retain this server provider as a test fixture.

- `plugin-examples/provider-acp-transformer/README.md` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/provider-acp-transformer/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/provider-acp-transformer/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/provider-acp-transformer/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/provider-acp-transformer/server/`

Paseo's files here: Normalizes vendor file edit payloads into standard tool calls; example plugins for the plugin SDK retain these transformation tests and utilities as fixtures.

- `plugin-examples/provider-acp-transformer/server/vendor-edit.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/provider-acp-transformer/server/vendor-edit.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/provider-direct/`

Paseo's files here: Registers direct provider backends and custom timeline renderers; example plugins for the plugin SDK keep this provider pattern as a test fixture.

- `plugin-examples/provider-direct/README.md` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/provider-direct/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/provider-direct/index.client.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/provider-direct/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/provider-direct/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/provider-direct/client/`

Paseo's files here: Renders provider output cards in the client timeline; example plugins for the plugin SDK retain this item view as a test fixture.

- `plugin-examples/provider-direct/client/provider-result.tsx` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/provider-direct/server/`

Paseo's files here: Implements custom provider connection logic, sessions, and capability negotiation; example plugins for the plugin SDK keep this engine as a test fixture.

- `plugin-examples/provider-direct/server/provider.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/provider-direct/server/provider.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/provider-direct/shared/`

Paseo's files here: Defines schemas and kinds for direct provider timeline entries; example plugins for the plugin SDK preserve this specification as a test fixture.

- `plugin-examples/provider-direct/shared/provider-result.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/settings/`

Paseo's files here: These files implement an example settings plugin for the plugin SDK, and hizuri keeps them so end-to-end test suites can load them as test fixtures.

- `plugin-examples/settings/README.md` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/settings/index.client.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/settings/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/settings/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/settings/client/`

Paseo's files here: These files provide the React Native settings screen interface, and hizuri keeps them as part of the plugin SDK example fixtures used during client testing.

- `plugin-examples/settings/client/display-settings.tsx` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/settings/screenshots/`

Paseo's files here: These files provide preview images of the settings plugin UI across platforms, and hizuri keeps them as documentation assets for the plugin SDK example fixtures.

- `plugin-examples/settings/screenshots/android.png` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/settings/screenshots/electron.png` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/settings/screenshots/web-compact.png` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/settings/shared/`

Paseo's files here: This file defines the Zod schema for display preferences, and hizuri keeps it to validate settings data within the plugin SDK test fixtures.

- `plugin-examples/settings/shared/preferences.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/timeline-items/`

Paseo's files here: These files create an example timeline contribution plugin, and hizuri keeps them as plugin SDK fixtures to test custom timeline transformers and renderers.

- `plugin-examples/timeline-items/README.md` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/timeline-items/index.client.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/timeline-items/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/timeline-items/pi-tasks.test.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/timeline-items/client/`

Paseo's files here: These files render task lists and transform tool calls on the client, and hizuri keeps them to verify plugin SDK timeline integration during end-to-end tests.

- `plugin-examples/timeline-items/client/pi-tasks.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/timeline-items/client/transform-pi-tasks.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/timeline-items/shared/`

Paseo's files here: This file defines shared task schemas for timeline items, and hizuri keeps it so plugin SDK fixture components share common data models in tests.

- `plugin-examples/timeline-items/shared/pi-tasks.ts` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/translations/`

Paseo's files here: These files provide an example localized notes plugin, and hizuri keeps them to test the plugin SDK localization APIs across multilingual client interfaces.

- `plugin-examples/translations/OVERVIEW.md` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/translations/OVERVIEW.zh-CN.md` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/translations/index.client.tsx` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/translations/package.json` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/translations/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/translations/tsconfig.json` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/translations/client/`

Paseo's files here: These files implement translated UI notes and locale configuration, and hizuri keeps them as plugin SDK test fixtures for validating dynamic interface translation.

- `plugin-examples/translations/client/messages.ts` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/translations/client/notes.tsx` — Paseo, unchanged. checked: nothing personal

## `plugin-examples/translations/client/locales/`

Paseo's files here: These files supply English and Simplified Chinese string dictionaries, and hizuri keeps them so plugin SDK tests can verify fallback and translation switching.

- `plugin-examples/translations/client/locales/en.json` — Paseo, unchanged. checked: nothing personal
- `plugin-examples/translations/client/locales/zh-CN.json` — Paseo, unchanged. checked: nothing personal

## `plugins/`

Paseo's files here: These files configure the package and compiler for built-in plugins, and hizuri keeps them so the daemon can bundle, build, and load agent extensions.

- `plugins/package.json` — Paseo, unchanged. checked: nothing personal
- `plugins/tsconfig.json` — Paseo, unchanged. checked: nothing personal

## `plugins/antigravity-provider/`

Paseo's files here: These files register the Antigravity agent provider plugin, and hizuri keeps them so the daemon can load and run Antigravity coding agents.

- `plugins/antigravity-provider/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugins/antigravity-provider/server/`

Paseo's files here: These files define provider lifecycle and connection logic, and hizuri keeps them so the daemon can launch Antigravity agent sessions and negotiate capabilities.

- `plugins/antigravity-provider/server/provider.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/server/provider.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/antigravity-provider/server/internal/`

Paseo's files here: These files handle process spawning, framing, and catalog management, and hizuri keeps them to communicate with the Antigravity agent binary via stdin and stdout.

- `plugins/antigravity-provider/server/internal/catalog.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/server/internal/process.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/server/internal/prompt.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/server/internal/session.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/server/internal/signals.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/server/internal/timeline.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/server/internal/wire.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/antigravity-provider/test/`

Paseo's files here: This file implements a mock runner for Antigravity tests, and hizuri keeps it to simulate agent process output when validating provider plugins.

- `plugins/antigravity-provider/test/agy.mjs` — Paseo, unchanged. checked: nothing personal

## `plugins/antigravity-provider/test/fixtures/`

Paseo's files here: These files contain recorded streams and process input captures, and hizuri keeps them to replay test scenarios against the Antigravity provider implementation.

- `plugins/antigravity-provider/test/fixtures/README.md` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/agents.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/agents.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/agents.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/agents.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/api-key-env-only.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/api-key-env-only.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/api-key-env-only.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/api-key-env-only.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/api-key-settings.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/api-key-settings.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/api-key-settings.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/api-key-settings.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/cwd-without-add-dir.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/cwd-without-add-dir.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/cwd-without-add-dir.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/cwd-without-add-dir.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/denial-replay.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-encoded-match.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-encoded-match.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-encoded-match.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-encoded-match.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-encoded-mismatch.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-encoded-mismatch.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-encoded-mismatch.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-encoded-mismatch.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-mismatch.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-mismatch.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-mismatch.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-mismatch.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-unsupported-family.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-unsupported-family.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-unsupported-family.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/effort-unsupported-family.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/help.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/help.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/help.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/help.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/image-content.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/image-content.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/image-content.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/image-content.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/image-file-external.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/image-file-external.png` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/image-file-external.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/image-file-external.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/image-file-external.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-add-http.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-add-http.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-add-http.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-add-http.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-add.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-add.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-add.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-add.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-agent-definition.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-agent-definition.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-agent-definition.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-agent-definition.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-agent-discovered.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-agent-discovered.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-agent-discovered.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-agent-discovered.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-agent-file.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-agent-file.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-agent-file.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-agent-file.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-global.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-global.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-global.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-global.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-help.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-help.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-help.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-help.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-http.requests.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-list.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-list.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-list.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-list.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-owned-cwd.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-owned-cwd.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-owned-cwd.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-owned-cwd.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-owned-first-add-dir.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-owned-first-add-dir.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-owned-first-add-dir.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-owned-first-add-dir.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-project-config.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-project-config.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-project-config.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-project-config.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-project-isolated.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-project-isolated.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-project-isolated.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-project-isolated.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-project.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-project.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-project.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-project.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-second-add-dir.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-second-add-dir.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-second-add-dir.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/mcp-second-add-dir.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-invalid.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-invalid.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-invalid.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-invalid.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-network.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-network.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-network.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-network.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-resume.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-resume.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-resume.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-resume.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-valid.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-valid.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-valid.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/model-switch-valid.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/models-api-key.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/models-api-key.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/models-api-key.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/models-api-key.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/models-unauthenticated.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/models-unauthenticated.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/models-unauthenticated.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/models-unauthenticated.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/multi-turn-reasoning.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/multi-turn-reasoning.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/multi-turn-reasoning.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/multi-turn-reasoning.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/not-signed-in.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/not-signed-in.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/not-signed-in.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/not-signed-in.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/parity-inspection.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/project-skill.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/project-skill.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/project-skill.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/project-skill.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/question-auto-denial.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/question-auto-denial.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/question-auto-denial.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/question-auto-denial.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/resume-after-interrupt.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/resume-after-interrupt.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/resume-after-interrupt.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/resume-after-interrupt.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/resume.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/resume.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/resume.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/resume.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/schema-prompt.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/schema-prompt.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/schema-prompt.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/schema-prompt.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/schema-user-message.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/schema-user-message.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/schema-user-message.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/schema-user-message.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/schema-user.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/schema-user.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/schema-user.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/schema-user.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/sigint-mid-text.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/sigint-mid-text.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/sigint-mid-text.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/sigint-mid-text.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/sigint-mid-tool.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/sigint-mid-tool.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/sigint-mid-tool.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/sigint-mid-tool.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/sigterm.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/sigterm.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/sigterm.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/sigterm.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/slash-disabled.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/slash-disabled.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/slash-disabled.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/slash-disabled.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/slash-enabled.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/slash-enabled.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/slash-enabled.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/slash-enabled.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/state-inspection.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/stdin-close-mid-turn.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/stdin-close-mid-turn.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/stdin-close-mid-turn.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/stdin-close-mid-turn.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/stdin-mid-turn.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/stdin-mid-turn.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/stdin-mid-turn.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/stdin-mid-turn.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/subagent.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/subagent.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/subagent.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/subagent.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/text-block.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/text-block.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/text-block.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/text-block.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/text-turn.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/text-turn.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/text-turn.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/text-turn.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-accept-edits.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-accept-edits.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-accept-edits.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-accept-edits.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-default.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-default.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-default.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-default.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-plan.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-plan.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-plan.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-plan.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-sandbox.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-sandbox.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-sandbox.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-sandbox.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-skip-permissions.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-skip-permissions.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-skip-permissions.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/tools-skip-permissions.stdout.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/version.capture.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/version.stderr.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/version.stdin.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/antigravity-provider/test/fixtures/version.stdout.ndjson` — Paseo, unchanged. checked: nothing personal

## `plugins/claude-usage-source/`

Paseo's files here: These files register the Claude token usage source plugin, and hizuri keeps them so the daemon can monitor Claude Code resource consumption.

- `plugins/claude-usage-source/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugins/claude-usage-source/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/claude-usage-source/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugins/claude-usage-source/server/`

Paseo's files here: These files read local credentials and fetch Claude usage metrics, and hizuri keeps them so the daemon tracks agent token limits and costs.

- `plugins/claude-usage-source/server/keychain.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/claude-usage-source/server/stores.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/claude-usage-source/server/stores.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/claude-usage-source/server/usage.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/claude-usage-source/server/usage.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/claude-usage-source/shared/`

Paseo's files here: This file defines input schemas for locating Claude credentials, and hizuri keeps it to validate authentication stores across plugin server routines.

- `plugins/claude-usage-source/shared/input.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/codex-usage-source/`

Paseo's files here: These files register the Codex usage source plugin, and hizuri keeps them so the daemon can track token consumption for Codex agents.

- `plugins/codex-usage-source/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugins/codex-usage-source/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/codex-usage-source/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugins/codex-usage-source/server/`

Paseo's files here: These files inspect local stores and query Codex usage endpoints, and hizuri keeps them to report live token usage to the daemon.

- `plugins/codex-usage-source/server/stores.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/codex-usage-source/server/stores.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/codex-usage-source/server/usage.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/codex-usage-source/server/usage.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/codex-usage-source/shared/`

Paseo's files here: This file specifies credential store routes for Codex usage tracking, and hizuri keeps it so daemon plugins parse configuration paths safely.

- `plugins/codex-usage-source/shared/input.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/copilot-usage-source/`

Paseo's files here: These files register the GitHub Copilot usage source plugin, and hizuri keeps them so the daemon monitors Copilot token usage and quotas.

- `plugins/copilot-usage-source/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugins/copilot-usage-source/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/copilot-usage-source/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugins/copilot-usage-source/server/`

Paseo's files here: These files discover Copilot tokens and fetch account usage statistics, and hizuri keeps them to display Copilot utilization metrics inside the daemon.

- `plugins/copilot-usage-source/server/usage.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/copilot-usage-source/server/usage.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/copilot-usage-source/shared/`

Paseo's files here: This file validates environment and file source configurations, and hizuri keeps it to locate Copilot tokens consistently across the daemon.

- `plugins/copilot-usage-source/shared/input.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/cursor-usage-source/`

Paseo's files here: Paseo's built-in plugins bundle this usage source plugin; hizuri keeps it so the daemon can discover, load, and meter Cursor credit usage directly.

- `plugins/cursor-usage-source/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugins/cursor-usage-source/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/cursor-usage-source/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugins/cursor-usage-source/server/`

Paseo's files here: Paseo's built-in plugins use this server-side logic and test suite; hizuri keeps them to extract, hash, and report Cursor usage metrics from local databases and environments.

- `plugins/cursor-usage-source/server/usage.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/cursor-usage-source/server/usage.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/cursor-usage-source/shared/`

Paseo's files here: Paseo's built-in plugins use this input schema; hizuri keeps it so client and server components validate Cursor usage configuration sources consistently.

- `plugins/cursor-usage-source/shared/input.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/grok-usage-source/`

Paseo's files here: Paseo's built-in plugins include this usage meter manifest; hizuri keeps it so the daemon registers Grok account credit balance tracking.

- `plugins/grok-usage-source/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugins/grok-usage-source/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/grok-usage-source/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugins/grok-usage-source/server/`

Paseo's files here: Paseo's built-in plugins run this server module; hizuri keeps it to discover Grok authentication tokens and query external balance APIs.

- `plugins/grok-usage-source/server/usage.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/grok-usage-source/server/usage.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/grok-usage-source/shared/`

Paseo's files here: Paseo's built-in plugins define this schema; hizuri keeps it to validate file and environment locators for Grok usage monitoring.

- `plugins/grok-usage-source/shared/input.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/hoplite-provider/`

Paseo's files here: Paseo's built-in plugins bundle this agent provider; hizuri keeps it so the daemon exposes and launches the Hoplite coding assistant.

- `plugins/hoplite-provider/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugins/hoplite-provider/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/hoplite-provider/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugins/hoplite-provider/server/`

Paseo's files here: Paseo's built-in plugins execute this provider runner; hizuri keeps it to translate ACP bridge messages and run phases for Hoplite sessions.

- `plugins/hoplite-provider/server/provider.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/hoplite-provider/server/run-phase.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/hoplite-provider/server/run-phase.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/kimi-usage-source/`

Paseo's files here: Paseo's built-in plugins include this usage integration; hizuri keeps it so the daemon registers and loads Kimi balance tracking.

- `plugins/kimi-usage-source/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugins/kimi-usage-source/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/kimi-usage-source/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugins/kimi-usage-source/server/`

Paseo's files here: Paseo's built-in plugins use this fetch logic and tests; hizuri keeps them to read stored Kimi credentials and fetch account quota levels.

- `plugins/kimi-usage-source/server/usage.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/kimi-usage-source/server/usage.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/kimi-usage-source/shared/`

Paseo's files here: Paseo's built-in plugins share this input definition; hizuri keeps it to validate file and environment options for Kimi credential discovery.

- `plugins/kimi-usage-source/shared/input.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/minimax-usage-source/`

Paseo's files here: Paseo's built-in plugins provide this source entry point; hizuri keeps it to register MiniMax usage monitoring inside the daemon.

- `plugins/minimax-usage-source/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugins/minimax-usage-source/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/minimax-usage-source/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugins/minimax-usage-source/server/`

Paseo's files here: Paseo's built-in plugins run this calculation engine; hizuri keeps it to parse MiniMax configuration files and report token usage windows.

- `plugins/minimax-usage-source/server/usage.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/minimax-usage-source/server/usage.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/minimax-usage-source/shared/`

Paseo's files here: Paseo's built-in plugins declare this validation schema; hizuri keeps it to ensure valid store locations for MiniMax account secrets.

- `plugins/minimax-usage-source/shared/input.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/muse-provider/`

Paseo's files here: Paseo's built-in plugins bundle this provider; hizuri keeps it so the daemon registers both the Muse agent provider and its usage tracker.

- `plugins/muse-provider/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugins/muse-provider/server/`

Paseo's files here: Paseo's built-in plugins manage this protocol implementation; hizuri keeps it to handle Muse sessions, subagent timelines, catalogs, and communication streams.

- `plugins/muse-provider/server/catalog.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/children.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/commands.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/connection.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/errors.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/msp.d.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/options.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/provider.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/questions.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/recovery.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/session.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/sessions.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/timeline.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/usage.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/server/wire.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/muse-provider/test/`

Paseo's files here: Paseo's built-in plugins provide these test suites; hizuri keeps them to verify Muse process integration against a mock executable.

- `plugins/muse-provider/test/fake-muse.mjs` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/provider.test.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/muse-provider/test/fixtures/`

Paseo's files here: Paseo's built-in plugins supply these recorded sessions; hizuri keeps them to test protocol parsing across approvals, cancellation, and tool execution.

- `plugins/muse-provider/test/fixtures/README.md` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/auto-review-unavailable.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/catalog-controls.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/image-followup.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/initialize-history.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/interrupt.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/mcp-stdio.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/multi-stage-approval.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/phase3-cancel.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/phase3-child-read.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/phase3-compact-history.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/phase3-compact-limit.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/phase3-compact.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/phase3-controls.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/phase3-default-workflow.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/phase3-project-skill.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/phase3-user-skill.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/resume-reasoning.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/resume-source.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/resume-with-cursor.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/resume-without-cursor.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/skill.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/staged-approval.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/steer.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/subagent.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/text-reasoning.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/tools-edit.ndjson` — Paseo, unchanged. checked: nothing personal
- `plugins/muse-provider/test/fixtures/unsafe-path.ndjson` — Paseo, unchanged. checked: nothing personal

## `plugins/opencode-go-usage-source/`

Paseo's files here: Paseo's built-in plugins load this usage source; hizuri keeps it to register OpenCode Go credit tracking within the server.

- `plugins/opencode-go-usage-source/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugins/opencode-go-usage-source/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/opencode-go-usage-source/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugins/opencode-go-usage-source/server/`

Paseo's files here: Paseo's built-in plugins run these discovery methods; hizuri keeps them to read OpenCode Go credentials and calculate remaining quota.

- `plugins/opencode-go-usage-source/server/usage.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/opencode-go-usage-source/server/usage.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/opencode-go-usage-source/shared/`

Paseo's files here: Paseo's built-in plugins define this input structure; hizuri keeps it to parse file path configurations for OpenCode Go credentials.

- `plugins/opencode-go-usage-source/shared/input.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/zai-usage-source/`

Paseo's files here: Paseo's built-in plugins provide this source manifest; hizuri keeps it so the daemon registers Z.ai credit monitoring.

- `plugins/zai-usage-source/icon.svg` — Paseo, unchanged. checked: nothing personal
- `plugins/zai-usage-source/index.server.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/zai-usage-source/paseo-plugin.json` — Paseo, unchanged. checked: nothing personal

## `plugins/zai-usage-source/server/`

Paseo's files here: Paseo's built-in plugins execute this API client; hizuri keeps it to retrieve and parse Z.ai balance summaries from backend endpoints.

- `plugins/zai-usage-source/server/usage.test.ts` — Paseo, unchanged. checked: nothing personal
- `plugins/zai-usage-source/server/usage.ts` — Paseo, unchanged. checked: nothing personal

## `plugins/zai-usage-source/shared/`

Paseo's files here: Paseo's built-in plugins provide this environment schema; hizuri keeps it to validate the required environment keys for Z.ai tracking.

- `plugins/zai-usage-source/shared/input.ts` — Paseo, unchanged. checked: nothing personal

## `scripts/`

Paseo's files here: These development and release scripts manage packaging, latency benchmarks, and builds; repository-wide npm tasks and CI read them to build and verify hizuri.

- `scripts/benchmark-terminal-latency.ts` — Paseo, unchanged. checked: nothing personal
- `scripts/build-apk.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/build-app-generated.mjs` — Builds the app's two generated bundles (the terminal web view and the Mermaid runtime) after install, or says why it skipped them. Why: the root postinstall runs it; the bundles embed whole third-party libraries and are not tracked. checked: nothing personal
- `scripts/build-daemon-web-ui.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/builtin-plugins-dist.test.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/changelog-utils.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/check-acp-catalog-version-drift.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/ci-workflow.test.mjs` — Contract tests of the CI workflow and its path filters (gating, cancellation, shards, routing). Why: the CI's first job runs it before any other job. checked: nothing personal
- `scripts/clean-package-dist.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/daemon-launch-contract.test.mjs` — Checks that every executable daemon entry point starts through the supervisor. Why: the CI's first job runs it. checked: nothing personal
- `scripts/dev-app.sh` — Paseo, unchanged. checked: nothing personal
- `scripts/dev-daemon.sh` — Paseo, unchanged. checked: nothing personal
- `scripts/dev-home.sh` — Paseo, unchanged. checked: nothing personal
- `scripts/dev.ps1` — Paseo, unchanged. checked: nothing personal
- `scripts/dev.sh` — Paseo, unchanged. checked: nothing personal
- `scripts/files-map.mjs` — The checker of FILES.md: --check, --staged, --update and --list-unlisted --history. Why: The personal guard calls it on every commit and on --tree; the publishing scripts use its list to drop undescribed paths from history. checked: nothing personal
- `scripts/fix-lockfile.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/is-main-module.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/is-main-module.test.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/measure-relay-latency.ts` — Paseo, unchanged. checked: nothing personal
- `scripts/npm-retry.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/paseo-ios-simulator-service.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/paseo-ios-simulator-service.sh` — Paseo, unchanged. checked: nothing personal
- `scripts/personal-guard-media.txt` — Allowlist of reviewed pictures, videos and PDFs: blob id, path, what each shows (the brand mark, the Show demo, the README hero, cast clips and diagram). Why: scripts/personal-guard.mjs refuses any media file whose blob id is not listed here. checked: nothing personal
- `scripts/personal-guard.mjs` — The personal-data guard: deny-list words, generic person and Cyrillic rules (letters and escapes), private paths, models and avatars by extension and bytes, the user's own files by fingerprint, media review, secret scanners and the files map. Why: The global pre-commit and pre-merge-commit hooks and lefthook run it with --staged; publishing and CI run --tree and --history. checked: nothing personal
- `scripts/personal-guard.test.mjs` — Tests for the personal-data guard and the files map checker, each in a throwaway git repo. Why: Node --test runs it after any change to scripts/personal-guard.mjs or scripts/files-map.mjs. checked: nothing personal
- `scripts/postinstall-patches.mjs` — Script that applies dependency patches from the patches directory. Why: Runs during postinstall to apply fixes to node_modules dependencies. checked: nothing personal
- `scripts/postinstall-patches.test.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/prove-relay-prod.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/push-current-release-tag.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/release-version-utils.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/release-version-utils.test.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/seed-ios-native-cache.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/seed-worktree-dev-state.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/set-release-version.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/sync-workspace-versions.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/test-mobile-agent-device.sh` — Paseo, unchanged. checked: nothing personal
- `scripts/trace-daemon-dist.test.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/trace-daemon.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/zuri-promote-update.sh` — Script that moves a staged over-the-air update to live status. Why: Promotes verified staged updates in the daemon updates folder to all client apps. checked: nothing personal
- `scripts/zuri-publish-update.sh` — Script that exports and publishes over-the-air JS bundle updates. Why: Builds and deploys over-the-air Android app updates for the daemon to serve. checked: nothing personal

## `scripts/oxlint/`

Paseo's files here: These custom oxlint plugin rules flag forbidden primitive usage; repository-wide CI and npm linting tasks read them to enforce mobile UI style guidelines.

- `scripts/oxlint/paseo-plugin.mjs` — Paseo, unchanged. checked: nothing personal
- `scripts/oxlint/paseo-plugin.test.mjs` — Paseo, unchanged. checked: nothing personal

## `scripts/test-support/`

Paseo's files here: This local npm registry helper spins up isolated test fixture servers; repository-wide CI and npm test suites read it to validate package behavior.

- `scripts/test-support/npm-registry.mts` — Paseo, unchanged. checked: nothing personal

## `skills/paseo-advisor/`

Paseo's files here: This advisory skill spins up a secondary agent to provide outside technical opinions; the plugin marketplace file installs it for multi-agent consultations.

- `skills/paseo-advisor/SKILL.md` — Paseo, unchanged. checked: nothing personal

## `skills/paseo-committee/`

Paseo's files here: This committee skill pairs contrasting agents to plan solutions during complex tasks; the plugin marketplace file installs it to allow multi-agent planning.

- `skills/paseo-committee/SKILL.md` — Paseo, unchanged. checked: nothing personal

## `skills/paseo-handoff/`

Paseo's files here: This handoff skill bundles current context and instructions to transfer tasks between agents; the plugin marketplace file installs it to enable clean agent transitions.

- `skills/paseo-handoff/SKILL.md` — Paseo, unchanged. checked: nothing personal

## `skills/paseo-help/`

Paseo's files here: This troubleshooting skill guides agents in answering setup and connectivity questions; the plugin marketplace file installs it so agents can assist with base features.

- `skills/paseo-help/SKILL.md` — Paseo, unchanged. checked: nothing personal

## `skills/paseo-plugin/`

Paseo's files here: This development skill guides agents through building and debugging Paseo plugins; the plugin marketplace file installs it so agents can manage custom plugins.

- `skills/paseo-plugin/SKILL.md` — Paseo, unchanged. checked: nothing personal

## `skills/paseo/`

Paseo's files here: This skill instructs agents how to manage projects, workspaces, and daemon tools; the plugin marketplace file installs it to preserve base daemon management.

- `skills/paseo/SKILL.md` — Paseo, unchanged. checked: nothing personal

## `templates/personal/`

- `templates/personal/.gitignore` — Git ignore rules for the personal configuration template. Why: Prevents secret files, environment variables, and private keys from being committed. checked: nothing personal
- `templates/personal/README.md` — Documentation explaining the layout and purpose of the personal data directory. Why: Informs users how personal profiles, settings, rules, and skills are managed outside the repository. checked: nothing personal
- `templates/personal/USER.md` — A blank profile template for the agent to record learned preferences and user context. Why: Copied during setup so the agent has a designated location to store user profile details. checked: nothing personal
- `templates/personal/rules.md` — Template for defining custom user behavior rules and constraints. Why: Provides the starter structure for user-defined rules enforced by the Guardian and agent. checked: nothing personal
- `templates/personal/settings.json` — A starter configuration template with an empty environment object for personal settings. Why: Copied during setup to initialize the user settings file without breaking personal data rules. checked: nothing personal

## `templates/personal/claude/`

- `templates/personal/claude/README.md` — Documentation explaining custom skills and persona output styles in Claude. Why: Guides users on structuring custom agent skills and persona templates. checked: nothing personal

## `templates/personal/claude/.claude-plugin/`

- `templates/personal/claude/.claude-plugin/plugin.json` — Manifest for the user's personal Claude Code skills plugin. Why: Defines the personal Claude plugin metadata loaded from the user's personal directory. checked: nothing personal

## `templates/personal/claude/output-styles/`

- `templates/personal/claude/output-styles/assistant.md` — Template for defining the assistant persona, character, and voice. Why: Provides the initial structure for custom persona definitions loaded by Claude Code. checked: nothing personal

## `templates/personal/claude/skills/`

- `templates/personal/claude/skills/.gitkeep` — Empty placeholder file preserving the custom skills directory in git. Why: Ensures git tracks the skills template directory before any skill files exist. checked: nothing personal

## `templates/personal/skills/`

- `templates/personal/skills/README.md` — Instructions explaining how to override or add custom instructions to default shipped skills. Why: Guides the user on customizing skill behaviors in their personal data directory. checked: nothing personal
