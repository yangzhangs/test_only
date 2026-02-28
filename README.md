# GHAFlow

GHAFlow is a powerful web application for visual GitHub Actions workflow authoring and management. It simplifies the creation and editing of GitHub Actions workflows with an intuitive, canvas-based interface.

## Features

- **Repository Integration**: Load any GitHub repository and automatically detect existing `.github/workflows/*.yml|*.yaml` files
- **Visual Canvas Editor**: Visualize workflow steps on an interactive canvas with side panel editing for each node
- **Multiple Creation Methods**: 
  - Start from scratch and generate workflows from the ground up
  - Import existing YAML files via paste or upload for automatic parsing
- **Action Management**: Browse built-in common actions and search GitHub Marketplace for actions to add to your pipeline
- **Code Generation**: Generate updated YAML, preview online, or download locally for offline use
- **Git Integration**: Create branches, commit workflow changes, and open Pull Requests directly in your target repository

## Getting Started

### Run Locally

```bash
node server.js
```

Then open your browser and navigate to: `http://localhost:3000`

## Requirements

- A GitHub token (required for private repositories and Pull Request creation)
- Node.js installed on your system

## How It Works

GHAFlow provides a seamless workflow editing experience:
1. Connect your GitHub account and select a repository
2. Create a new workflow or import an existing one
3. Use the visual canvas to design your workflow steps
4. Add actions from the Marketplace or use pre-built templates
5. Review the generated YAML code
6. Commit and push directly to your repository

## Additional Notes

- A valid GitHub token is required for private repositories and for Pull Request creation
- Marketplace action search is powered by GitHub's repository search filtered by `topic:github-action`
- Supports both YAML (.yml) and YAML (.yaml) workflow file formats