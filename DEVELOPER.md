# Developer Guide

## Development Setup

### Prerequisites
- Node.js 20.x or higher
- pnpm 9.15.4 (automatically installed via corepack if needed)

### Installation
```bash
# Clone the repository
git clone https://github.com/civicteam/x402-mcp.git
cd x402-mcp

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests
pnpm test
```

## Development Workflow

### Available Scripts
- `pnpm dev` - Start the development server with hot reload
- `pnpm build` - Build the TypeScript project
- `pnpm test` - Run tests in watch mode
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm start` - Start the example server
- `pnpm example:run` - Run the example client
- `pnpm generate-wallet` - Generate a new wallet for testing

### Testing
The project uses Vitest for unit testing. Tests should be placed alongside source files or in a `__tests__` directory.

```bash
# Run tests in watch mode
pnpm test

# Run tests once with coverage
pnpm test:coverage
```

## Release Process

### Prerequisites for Releasing
1. Ensure you have npm publish access to the `@civic` org
2. Set up GitHub repository secrets:
   - `NPM_PUBLISH_TOKEN` - npm automation token for publishing
   - `CODECOV_TOKEN` (optional) - for coverage reporting

### Release Steps

#### 1. Prepare the Release
```bash
# Ensure you're on the main branch with latest changes
git checkout main
git pull origin main

# Run tests and build to verify everything works
pnpm test:coverage
pnpm build

# Update the version in package.json
npm version patch  # or minor/major
# This creates a commit and tag automatically
```

#### 2. Push the Release
```bash
# Push the commit and tag to trigger the release workflow
git push origin main
git push origin --tags
```

#### 3. Automated Release Process
Once you push the tag, GitHub Actions will automatically:
1. Run the full test suite across Node.js 20.x, 22.x, and 24.x
2. Perform type checking
3. Run security audits
4. Build the project
5. Publish to npm with provenance attestation
6. Create a GitHub release

#### 4. Verify the Release
- Check the [GitHub Actions](https://github.com/civicteam/x402-mcp/actions) page for build status
- Verify the package on [npm](https://www.npmjs.com/package/@civic/x402-mcp)
- Check the [GitHub Releases](https://github.com/civicteam/x402-mcp/releases) page

### Version Guidelines
- **Patch** (x.x.1): Bug fixes, documentation updates
- **Minor** (x.1.x): New features, backward-compatible changes
- **Major** (1.x.x): Breaking changes, major refactors

### Pre-release Versions
For testing releases before making them public:

```bash
# Create a pre-release version
npm version prerelease --preid=beta
# Results in: 1.0.1-beta.0

# Publish with beta tag
npm publish --tag beta
```

### Manual Publishing (Emergency Only)
If the automated release fails, you can publish manually:

```bash
# Ensure you're authenticated to npm
npm login

# Build the project
pnpm build

# Publish to npm
npm publish --access public
```

## CI/CD Pipeline

### Continuous Integration
The CI workflow runs on every push to `main` and on pull requests:
- **Test Matrix**: Tests against Node.js 20.x, 22.x, and 24.x
- **Type Checking**: Validates TypeScript types
- **Security Audit**: Checks for known vulnerabilities
- **Coverage**: Reports test coverage to Codecov

### Release Automation
The release workflow triggers on version tags (`v*`):
- Builds and tests the project
- Publishes to npm with provenance
- Creates a GitHub release

## Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clean build artifacts
rm -rf dist/
pnpm build
```

#### Test Failures
```bash
# Run tests with verbose output
pnpm test -- --reporter=verbose
```

#### Publishing Issues
- Ensure you're logged into npm: `npm whoami`
- Check npm access: `npm access ls-packages @civic`
- Verify the package name isn't taken: `npm view @civic/x402-mcp`

## Contributing

### Pull Request Process
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `pnpm test:coverage`
5. Commit with descriptive messages
6. Push to your fork and create a PR

### Code Style
- TypeScript with strict typing
- No use of `any` type
- Functional programming preferred
- Small, focused functions
- JSDoc comments for public APIs

### Commit Guidelines
- Clear, descriptive commit messages
- Present tense ("Add feature" not "Added feature")
- Reference issues when applicable
