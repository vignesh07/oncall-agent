# Contributing to oncall-agent

Thanks for your interest in contributing! This document outlines how to get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/vignesh07/oncall-agent.git
cd oncall-agent

# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Build
npm run build
```

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Run type check: `npm run typecheck`
6. Commit with a descriptive message
7. Push and open a PR

## Code Style

- TypeScript with strict mode
- Use meaningful variable/function names
- Add tests for new functionality
- Keep functions focused and small

## Adding a New Alert Parser

1. Create `src/parsers/yourparser.ts` implementing the `Parser` interface
2. Add to `src/parsers/index.ts`
3. Create test fixtures in `tests/fixtures/`
4. Add tests in `tests/parsers/yourparser.test.ts`
5. Update README with the new source

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/parsers/pagerduty.test.ts

# Run with coverage
npm test -- --coverage
```

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include tests for new features
- Update documentation if needed
- Ensure all tests pass
- Add a clear description of what and why

## Reporting Issues

When reporting issues, please include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Alert payload (redacted) if relevant
- Error messages/logs

## Questions?

Open an issue with the `question` label.
