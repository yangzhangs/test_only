# FlowForge Actions Studio

FlowForge Actions Studio is a web app for visual GitHub Actions authoring and updates.

## What it supports

- Load any GitHub repository and detect existing `.github/workflows/*.yml|*.yaml` files.
- Visualize workflow steps on a canvas and edit each node in a side panel.
- Start from scratch and generate a new workflow without existing files.
- Paste or upload YAML and automatically parse it into the canvas pipeline.
- Browse common actions and search GitHub Marketplace actions, then add them to the pipeline.
- Generate updated YAML, view it online, or download it locally.
- Create a branch, commit workflow changes, and open a Pull Request in the target repository.

## Run locally


```bash
node server.js
```

Open: `http://localhost:3000`

## Notes

- A GitHub token is required for private repositories and for Pull Request creation.
- Marketplace search uses GitHub repository search filtered by `topic:github-action`.
