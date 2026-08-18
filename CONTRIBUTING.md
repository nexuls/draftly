# Contributing to Draftly

Thank you for your interest in contributing to Draftly! We welcome contributions from the community and are excited to have you on board.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Coding Guidelines](#coding-guidelines)
- [Reporting Issues](#reporting-issues)

---

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone. Please be kind and constructive in all interactions.

---

## Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/draftly.git
   cd draftly
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/NeuroNexul/draftly.git
   ```

---

## Development Setup

### Prerequisites

- **Node.js** >= 20
- **Bun** >= 1.3.5 (package manager)

### Install Dependencies

```bash
bun install
```

### Start Development Server

```bash
bun dev
```

This starts the development server with hot reloading for both the web app and the draftly package.

### Build

```bash
bun run build
```

### Lint & Format

```bash
# Lint all packages (read-only; fails on errors)
bun run lint

# Apply Biome's safe lint fixes across all packages
bun run lint:fix

# Format code with Biome
bun run format

# Lint + format the whole repo in one pass, from the root
bun run check          # report only
bun run check:fix      # write fixes
```

---

## Project Structure

This is a monorepo managed with [Turborepo](https://turbo.build/repo).

```
draftly/
├── apps/
│   └── web/              # Next.js web application (playground)
├── packages/
│   └── draftly/          # Core library (published to npm)
│       ├── src/
│       │   ├── editor/   # CodeMirror editor integration
│       │   ├── plugins/  # Built-in plugins
│       │   └── preview/  # Static HTML renderer
│       └── package.json
├── package.json          # Root workspace config
├── turbo.json            # Turborepo config
└── README.md
```

---

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/add-table-plugin` – New features
- `fix/image-rendering-bug` – Bug fixes
- `docs/update-readme` – Documentation
- `refactor/plugin-architecture` – Code refactoring

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add table plugin support
fix: resolve image widget rendering issue
docs: update installation instructions
refactor: simplify plugin registration
chore: update dependencies
```

### Changesets

We use [Changesets](https://github.com/changesets/changesets) for versioning. If your change affects the public API or fixes a bug, add a changeset:

```bash
bun run changeset
```

Follow the prompts to describe your changes. This creates a file in `.changeset/` that will be used to generate the changelog.

---

## Submitting a Pull Request

1. **Sync with upstream**:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push your branch**:

   ```bash
   git push origin your-branch-name
   ```

3. **Open a Pull Request** on GitHub against the `main` branch.

4. **Fill out the PR template** with:
   - A clear description of the changes
   - Related issue numbers (if any)
   - Screenshots for UI changes

5. **Wait for review** – maintainers will review your PR and may request changes.

---

## Coding Guidelines

### TypeScript

- Use strict TypeScript – avoid `any` where possible.
- Export types from `index.ts` files.
- Use descriptive variable and function names.

### Code Style

- We use **[Biome](https://biomejs.dev)** for both linting and formatting – run `bun run check:fix`
  before committing.
- Shared configuration lives in `packages/biome-config`; each workspace has a small `biome.json`
  that extends it. See that package's README for the layer breakdown.
- Formatting matches the repository's previous Prettier settings: 2 spaces, double quotes,
  semicolons, `printWidth`/`lineWidth` 120, ES5 trailing commas, LF.

### Plugins

When creating a new plugin:

1. Create a new file in `packages/draftly/src/plugins/`.
2. Extend the `DraftlyPlugin` base class.
3. Export the plugin from `packages/draftly/src/plugins/index.ts`.
4. Add the plugin to the `createEssentialPlugins()` factory if it should be included by default.
5. Update documentation if needed.

### Testing

- Test your changes in the playground app (`apps/web`).
- Ensure the build passes: `bun run build`.
- Ensure linting passes: `bun run lint`.

---

## Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/NeuroNexul/draftly/issues/new) with:

- **Bug reports**: Steps to reproduce, expected behavior, actual behavior, screenshots if applicable.
- **Feature requests**: Clear description of the feature and its use case.

---

## Questions?

Feel free to open a [Discussion](https://github.com/NeuroNexul/draftly/discussions) or reach out to the maintainers.

Thank you for contributing! 🎉
