#!/bin/bash
# oncall-agent setup script
# Run: curl -fsSL https://raw.githubusercontent.com/vignesh07/oncall-agent/main/setup.sh | bash

set -e

echo "🤖 Setting up oncall-agent..."

# Create workflows directory
mkdir -p .github/workflows

# Download workflow files
echo "📥 Downloading workflow files..."

curl -fsSL https://raw.githubusercontent.com/vignesh07/oncall-agent/main/examples/workflows/oncall.yml \
  -o .github/workflows/oncall.yml

curl -fsSL https://raw.githubusercontent.com/vignesh07/oncall-agent/main/examples/workflows/oncall-pr-review.yml \
  -o .github/workflows/oncall-pr-review.yml

# Create config directory
mkdir -p .oncall-agent

# Create example config if it doesn't exist
if [ ! -f .oncall-agent/config.yml ]; then
  echo "📝 Creating example config..."
  cat > .oncall-agent/config.yml << 'EOF'
# oncall-agent configuration
# See: https://github.com/vignesh07/oncall-agent#configuration

# Paths that should never be modified by automated fixes
protected_paths:
  - "*.lock"
  - "migrations/**"

# Context for Claude (describe your codebase)
context: |
  # Add context about your codebase here
  # Example: This is a Node.js API using Express and PostgreSQL.

# Deduplication settings
deduplication:
  enabled: true
  similarity_threshold: 0.7
  lookback_hours: 24
EOF
fi

echo ""
echo "✅ oncall-agent setup complete!"
echo ""
echo "Next steps:"
echo "  1. Add ANTHROPIC_API_KEY secret to your repo:"
echo "     https://github.com/YOUR_ORG/YOUR_REPO/settings/secrets/actions"
echo ""
echo "  2. Enable 'Allow GitHub Actions to create pull requests' in:"
echo "     https://github.com/YOUR_ORG/YOUR_REPO/settings/actions"
echo ""
echo "  3. Edit .oncall-agent/config.yml with your settings"
echo ""
echo "  4. Set up webhook forwarding from your alert source:"
echo "     https://github.com/vignesh07/oncall-agent#webhook-setup"
echo ""
echo "  5. Commit and push the new files:"
echo "     git add .github/workflows .oncall-agent && git commit -m 'Add oncall-agent' && git push"
echo ""
