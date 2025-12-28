# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by emailing the maintainers directly rather than opening a public issue.

## Security Best Practices

When using oncall-agent:

1. **API Keys**: Always use GitHub Secrets for your Anthropic API key. Never commit API keys to your repository.

2. **Protected Paths**: Configure `protected_paths` in your config to prevent modifications to sensitive files:
   ```yaml
   protected_paths:
     - src/core/security/**
     - .env*
     - config/secrets/**
   ```

3. **Review PRs**: oncall-agent never auto-merges. Always review generated PRs before merging.

4. **Confidence Thresholds**: Set appropriate `confidence_threshold` to control when PRs are created.

5. **File Limits**: Use `max_files_changed` to limit the scope of automated changes.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| v1.x    | :white_check_mark: |
