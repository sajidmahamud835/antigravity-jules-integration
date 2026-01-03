# Contributing to Jules for Antigravity

Thank you for your interest in## Contributing

We welcome contributions! Please follow our development workflow:

1.  **Read the Guide**: Check `DEVELOPMENT.md` for architecture details and coding conventions.
2.  **Fork & Branch**: Create a feature branch for your work.
3.  **Test**: Ensure your changes compile and pass basic verification.
4.  **Submit PR**: Pull requests should be descriptive and reference any related issues.ween local agents and Jules.

## Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/sajidmahamud835/antigravity-jules-integration.git
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Open in VS Code**:
   ```bash
   code .
   ```

## Development Workflow

1. **Make changes** in `src/`.
2. **Compile** using the watch task or manual compile:
   ```bash
   npm run watch
   # or
   npm run compile
   ```
3. **Test Extension**: Press `F5` to open a new Extension Development Host window with your changes loaded.

## Architectural Guidelines

- **ContextGatherer (`src/context/`)**: Any logic for reading files or git state belongs here. Keep it read-only and safe.
- **JulesClient (`src/julesClient.ts`)**: Handles all HTTP communication. Ensure 4xx/5xx errors are sanitized.
- **BridgeServer (`src/mcp/`)**: The MCP implementation. Must strictly follow JSON-RPC 2.0.

## Pull Requests

- Use clear, descriptive titles.
- Describe *why* you are making the change, not just *what* caused it.
- Ensure `npm run compile` passes without errors.

## Code of Conduct

Please be respectful and constructive in all interactions.
