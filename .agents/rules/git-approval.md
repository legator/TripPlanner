---
description: Strict requirement for user approval before any git commit or push
---

# Git Commit & Push Approval Policy

1. **No Autonomous Commits**: Never execute `git commit`, `git push`, `git tag`, `git reset`, `git rebase`, or destructive git commands without explicit, clear approval from the user in the prompt.
2. **Review First**: Always leave modified, staged, or generated files in the working tree for the user to review.
3. **Ask for Confirmation**: Provide a concise summary of changes and ask the user for confirmation if a commit/push is desired.
