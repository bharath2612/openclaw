#!/bin/bash
# Hook: Block git commits unless CHANGELOG.md is updated.
# Runs as a PreToolUse hook on the Bash tool.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only check git commit commands
if ! echo "$COMMAND" | grep -qE 'git commit'; then
  exit 0
fi

# Allow if CHANGELOG.md is staged
if git diff --cached --name-only | grep -q 'CHANGELOG.md'; then
  exit 0
fi

# Allow if CHANGELOG.md is modified (will likely be staged with the commit)
if git diff --name-only | grep -q 'CHANGELOG.md'; then
  echo "CHANGELOG.md is modified but not staged. Stage it with 'git add CHANGELOG.md' before committing." >&2
  exit 2
fi

# CHANGELOG.md was not touched at all — block
echo "CHANGELOG.md must be updated before committing. Add an entry under today's date (## YYYY.M.D) with what changed, why, and any learnings." >&2
exit 2
