# CLAUDE.md — Project Guidelines for AI Assistants

## Changelog Rule

**Every time you make a change (feature, fix, refactor, docs, etc.), you MUST add an entry to `CHANGELOG.md` before committing.**

- Add entries under the current date section (format: `## YYYY.M.D`)
- If today's section doesn't exist, create it at the top (below the header)
- Use subsections: `### Added`, `### Fixes`, `### Changed`, `### Docs`, `### Learnings`
- Include a short summary of what changed and why
- Include any learnings or insights discovered during the work
- Include the timestamp in the entry

## Commit Workflow

1. Make the code changes
2. Run tests to verify nothing broke
3. Add a changelog entry with date, time, summary, and learnings
4. Stage all relevant files (including CHANGELOG.md)
5. Commit with a clear conventional commit message
6. Push only when explicitly asked

## Code Style

- Follow existing patterns in the codebase
- TypeScript with strict types
- Tests alongside source files (`*.test.ts`)
- Conventional commits: `feat()`, `fix()`, `docs()`, `refactor()`
