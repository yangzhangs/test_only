const state = {
  repoUrl: '',
  token: '',
  owner: '',
  repo: '',
  workflows: [],
  activeWorkflowIndex: -1,
  canvasSteps: [],
  selectedStepIndex: -1
};

const commonComponents = [
  { label: 'Checkout', uses: 'actions/checkout@v4' },
  { label: 'Setup Node.js', uses: 'actions/setup-node@v4' },
  { label: 'Install Dependencies', run: 'npm ci' },
  { label: 'Run Tests', run: 'npm test' },
  { label: 'Build', run: 'npm run build' },
  { label: 'Upload Artifact', uses: 'actions/upload-artifact@v4' }
];

const el = {
  repoUrl: document.getElementById('repoUrl'),
  githubToken: document.getElementById('githubToken'),
  loadBtn: document.getElementById('loadBtn'),
  newWorkflowBtn: document.getElementById('newWorkflowBtn'),
  yamlFile: document.getElementById('yamlFile'),
  pasteYaml: document.getElementById('pasteYaml'),
  parseYamlBtn: document.getElementById('parseYamlBtn'),
  workflowList: document.getElementById('workflowList'),
  syncYamlBtn: document.getElementById('syncYamlBtn'),
  viewYamlBtn: document.getElementById('viewYamlBtn'),
  downloadYamlBtn: document.getElementById('downloadYamlBtn'),
  componentList: document.getElementById('componentList'),
  canvas: document.getElementById('canvas'),
  nodeConfig: document.getElementById('nodeConfig'),
  yamlOutput: document.getElementById('yamlOutput'),
  workflowPath: document.getElementById('workflowPath'),
  branchName: document.getElementById('branchName'),
  commitMessage: document.getElementById('commitMessage'),
  prTitle: document.getElementById('prTitle'),
  prBody: document.getElementById('prBody'),
  createPrBtn: document.getElementById('createPrBtn'),
  marketplaceQuery: document.getElementById('marketplaceQuery'),
  searchMarketplaceBtn: document.getElementById('searchMarketplaceBtn'),
  marketplaceList: document.getElementById('marketplaceList'),
  status: document.getElementById('status')
};

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.style.color = isError ? '#b42318' : '#0f766e';
}

function parseStepsFromYaml(content) {
  const lines = (content || '').split('\n');
  const steps = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('- name:')) {
      if (current) steps.push(current);
      current = { name: line.replace('- name:', '').trim(), uses: '', run: '' };
      continue;
    }

    if (line.startsWith('- uses:')) {
      if (current) steps.push(current);
      current = { name: 'Action step', uses: line.replace('- uses:', '').trim(), run: '' };
      continue;
    }

    if (line.startsWith('- run:')) {
      if (current) steps.push(current);
      current = { name: 'Run command', uses: '', run: line.replace('- run:', '').trim() };
      continue;
    }

    if (current && line.startsWith('uses:')) current.uses = line.replace('uses:', '').trim();
    if (current && line.startsWith('run:')) current.run = line.replace('run:', '').trim();
  }

  if (current) steps.push(current);
  return steps;
}

function rebuildYamlFromCanvas() {
  const currentName = state.workflows[state.activeWorkflowIndex]?.name || 'workflow.yml';
  const workflowName = currentName.replace(/\.ya?ml$/i, '');
  const stepsBlock = state.canvasSteps
    .map((step) => {
      const lines = [`      - name: ${step.name || 'Unnamed step'}`];
      if (step.uses) lines.push(`        uses: ${step.uses}`);
      if (step.run) lines.push(`        run: ${step.run}`);
      return lines.join('\n');
    })
    .join('\n');

  return `name: ${workflowName}\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n${stepsBlock || '      - name: Hello\n        run: echo "Hello from FlowForge"'}\n`;
}

function addDraggableItem(container, item, description = '') {
  const node = document.createElement('div');
  node.className = 'component-item';
  node.draggable = true;
  node.innerHTML = `<strong>${item.label || item.name}</strong>${description ? `<div class="meta">${description}</div>` : ''}`;
  node.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData(
      'application/json',
      JSON.stringify({ name: item.label || item.name, uses: item.uses || '', run: item.run || '' })
    );
  });
  container.appendChild(node);
}

function renderCommonActions() {
  el.componentList.innerHTML = '';
  commonComponents.forEach((component) => addDraggableItem(el.componentList, component));
}

function renderCanvas() {
  el.canvas.innerHTML = '';
  state.canvasSteps.forEach((step, index) => {
    const node = document.createElement('div');
    node.className = `canvas-node ${state.selectedStepIndex === index ? 'active' : ''}`;
    node.innerHTML = `<strong>${index + 1}. ${step.name}</strong><div>${step.uses || step.run || '(empty step)'}</div>`;
    node.addEventListener('click', () => {
      state.selectedStepIndex = index;
      renderCanvas();
      renderNodeConfig();
    });
    el.canvas.appendChild(node);
  });
}

function renderNodeConfig() {
  if (state.selectedStepIndex < 0) {
    el.nodeConfig.innerHTML = 'Select a node to edit name, uses, and run command.';
    return;
  }

  const step = state.canvasSteps[state.selectedStepIndex];
  el.nodeConfig.innerHTML = '';

  const nameInput = document.createElement('input');
  nameInput.value = step.name;
  nameInput.placeholder = 'Step name';

  const usesInput = document.createElement('input');
  usesInput.value = step.uses;
  usesInput.placeholder = 'uses (example: actions/checkout@v4)';

  const runInput = document.createElement('textarea');
  runInput.value = step.run;
  runInput.placeholder = 'run (example: npm test)';

  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save Node';
  saveButton.addEventListener('click', () => {
    step.name = nameInput.value.trim() || 'Unnamed step';
    step.uses = usesInput.value.trim();
    step.run = runInput.value.trim();
    renderCanvas();
    setStatus('Node updated');
  });

  const deleteButton = document.createElement('button');
  deleteButton.textContent = 'Delete Node';
  deleteButton.className = 'secondary';
  deleteButton.addEventListener('click', () => {
    state.canvasSteps.splice(state.selectedStepIndex, 1);
    state.selectedStepIndex = -1;
    renderCanvas();
    renderNodeConfig();
    setStatus('Node deleted');
  });

  [nameInput, usesInput, runInput, saveButton, deleteButton].forEach((item) => el.nodeConfig.appendChild(item));
}

function loadWorkflowIntoCanvas(workflow, index) {
  state.activeWorkflowIndex = index;
  state.canvasSteps = parseStepsFromYaml(workflow.content);
  state.selectedStepIndex = -1;
  el.workflowPath.value = workflow.path;
  el.yamlOutput.value = workflow.content;
  renderCanvas();
  renderNodeConfig();
}

async function loadRepoWorkflows() {
  try {
    state.repoUrl = el.repoUrl.value.trim();
    state.token = el.githubToken.value.trim();

    if (!state.repoUrl) throw new Error('Repository URL is required');

    setStatus('Loading workflows...');
    const response = await fetch('/api/repo/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: state.repoUrl, token: state.token })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load workflows');

    state.owner = data.owner;
    state.repo = data.repo;
    state.workflows = data.workflows || [];

    el.workflowList.innerHTML = '';
    if (!data.hasActions || state.workflows.length === 0) {
      state.activeWorkflowIndex = -1;
      state.canvasSteps = [];
      renderCanvas();
      renderNodeConfig();
      el.yamlOutput.value = '';
      el.workflowPath.value = '.github/workflows/ci.yml';
      setStatus('No workflows found. You can start from scratch.', false);
      return;
    }

    state.workflows.forEach((workflow, idx) => {
      const option = document.createElement('option');
      option.value = idx;
      option.textContent = workflow.path;
      el.workflowList.appendChild(option);
    });

    loadWorkflowIntoCanvas(state.workflows[0], 0);
    setStatus(`Loaded ${state.workflows.length} workflow file(s)`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function startFromScratch() {
  state.workflows = [{ name: 'ci.yml', path: '.github/workflows/ci.yml', content: '' }];
  el.workflowList.innerHTML = '<option value="0">.github/workflows/ci.yml</option>';
  loadWorkflowIntoCanvas(state.workflows[0], 0);
  state.canvasSteps = [];
  el.yamlOutput.value = rebuildYamlFromCanvas();
  setStatus('Started a new workflow from scratch');
}

function parseYamlIntoCanvas(yamlContent, source = 'YAML input') {
  const steps = parseStepsFromYaml(yamlContent);
  if (!steps.length) {
    setStatus(`No steps found in ${source}`, true);
    return;
  }

  if (state.activeWorkflowIndex < 0) {
    state.workflows = [{ name: 'imported.yml', path: '.github/workflows/imported.yml', content: yamlContent }];
    el.workflowList.innerHTML = '<option value="0">.github/workflows/imported.yml</option>';
    state.activeWorkflowIndex = 0;
  }

  state.canvasSteps = steps;
  state.selectedStepIndex = -1;
  el.yamlOutput.value = yamlContent;
  if (!el.workflowPath.value) el.workflowPath.value = '.github/workflows/imported.yml';
  renderCanvas();
  renderNodeConfig();
  setStatus(`Parsed ${steps.length} step(s) from ${source}`);
}

function downloadYaml() {
  const yaml = el.yamlOutput.value.trim() || rebuildYamlFromCanvas();
  const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fileName = (el.workflowPath.value || '.github/workflows/ci.yml').split('/').pop();
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('YAML downloaded');
}

function viewYaml() {
  const yaml = el.yamlOutput.value.trim() || rebuildYamlFromCanvas();
  const win = window.open('', '_blank');
  if (!win) {
    setStatus('Popup blocked. Please allow popups to view YAML.', true);
    return;
  }

  win.document.write(`<pre style="white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace;padding:24px;">${yaml
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')}</pre>`);
  win.document.close();
}

async function searchMarketplaceActions() {
  try {
    const query = el.marketplaceQuery.value.trim();
    const token = el.githubToken.value.trim();
    setStatus('Searching GitHub Marketplace actions...');

    const response = await fetch(`/api/marketplace/search-actions?q=${encodeURIComponent(query)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Search failed');

    el.marketplaceList.innerHTML = '';
    data.actions.forEach((action) => {
      const card = document.createElement('div');
      card.className = 'market-item';
      card.innerHTML = `
        <div class="name">${action.name}</div>
        <div class="meta">${action.description}</div>
        <div class="meta">⭐ ${action.stars}</div>
        <a href="${action.url}" target="_blank" rel="noreferrer">Open repository</a>
      `;

      const addBtn = document.createElement('button');
      addBtn.textContent = 'Add to Canvas';
      addBtn.addEventListener('click', () => {
        state.canvasSteps.push({ name: action.name, uses: action.uses, run: '' });
        renderCanvas();
        setStatus(`Added ${action.name} to canvas`);
      });

      card.appendChild(addBtn);
      addDraggableItem(card, action, `uses: ${action.uses}`);
      el.marketplaceList.appendChild(card);
    });

    if (!data.actions.length) setStatus('No matching actions found');
    else setStatus(`Found ${data.actions.length} action(s)`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function createPullRequest() {
  try {
    if (state.activeWorkflowIndex < 0) throw new Error('Load or create a workflow first');

    state.repoUrl = el.repoUrl.value.trim();
    state.token = el.githubToken.value.trim();
    if (!state.repoUrl || !state.token) {
      throw new Error('Repository URL and GitHub token are required to create a PR');
    }

    const workflowContent = el.yamlOutput.value.trim() || rebuildYamlFromCanvas();
    const workflowPath = el.workflowPath.value.trim() || '.github/workflows/ci.yml';

    setStatus('Creating pull request...');
    const response = await fetch('/api/repo/create-pr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoUrl: state.repoUrl,
        token: state.token,
        workflowPath,
        workflowContent,
        branchName: el.branchName.value.trim() || undefined,
        commitMessage: el.commitMessage.value.trim() || undefined,
        prTitle: el.prTitle.value.trim() || undefined,
        prBody: el.prBody.value.trim() || undefined
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'PR creation failed');

    setStatus(`Pull request created: ${data.prUrl}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

el.loadBtn.addEventListener('click', loadRepoWorkflows);
el.newWorkflowBtn.addEventListener('click', startFromScratch);
el.parseYamlBtn.addEventListener('click', () => parseYamlIntoCanvas(el.pasteYaml.value.trim(), 'pasted YAML'));
el.syncYamlBtn.addEventListener('click', () => {
  if (state.activeWorkflowIndex < 0) {
    setStatus('Load, parse, or create a workflow first', true);
    return;
  }
  el.yamlOutput.value = rebuildYamlFromCanvas();
  setStatus('YAML generated from canvas');
});

el.viewYamlBtn.addEventListener('click', viewYaml);
el.downloadYamlBtn.addEventListener('click', downloadYaml);
el.searchMarketplaceBtn.addEventListener('click', searchMarketplaceActions);
el.createPrBtn.addEventListener('click', createPullRequest);

el.workflowList.addEventListener('change', () => {
  const idx = Number(el.workflowList.value);
  const workflow = state.workflows[idx];
  if (!workflow) return;
  loadWorkflowIntoCanvas(workflow, idx);
  setStatus(`Switched to ${workflow.path}`);
});

el.yamlFile.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const content = await file.text();
  el.pasteYaml.value = content;
  parseYamlIntoCanvas(content, `uploaded file ${file.name}`);
});

el.canvas.addEventListener('dragover', (event) => event.preventDefault());
el.canvas.addEventListener('drop', (event) => {
  event.preventDefault();
  const raw = event.dataTransfer.getData('application/json');
  if (!raw) return;
  const component = JSON.parse(raw);
  state.canvasSteps.push({ name: component.name || 'Unnamed step', uses: component.uses || '', run: component.run || '' });
  renderCanvas();
  setStatus(`Added ${component.name || 'step'} to canvas`);
});

renderCommonActions();
renderCanvas();
renderNodeConfig();
el.workflowPath.value = '.github/workflows/ci.yml';
