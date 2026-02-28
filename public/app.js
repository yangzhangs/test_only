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

const defaultComponents = [
  { label: 'Checkout', uses: 'actions/checkout@v4' },
  { label: 'Setup Node', uses: 'actions/setup-node@v4' },
  { label: 'Install Dependencies', run: 'npm ci' },
  { label: 'Run Tests', run: 'npm test' },
  { label: 'Build', run: 'npm run build' }
];

const el = {
  repoUrl: document.getElementById('repoUrl'),
  githubToken: document.getElementById('githubToken'),
  loadBtn: document.getElementById('loadBtn'),
  workflowList: document.getElementById('workflowList'),
  componentList: document.getElementById('componentList'),
  canvas: document.getElementById('canvas'),
  nodeConfig: document.getElementById('nodeConfig'),
  yamlOutput: document.getElementById('yamlOutput'),
  syncYamlBtn: document.getElementById('syncYamlBtn'),
  createPrBtn: document.getElementById('createPrBtn'),
  branchName: document.getElementById('branchName'),
  commitMessage: document.getElementById('commitMessage'),
  prTitle: document.getElementById('prTitle'),
  prBody: document.getElementById('prBody'),
  status: document.getElementById('status')
};

function setStatus(msg, isError = false) {
  el.status.textContent = msg;
  el.status.style.color = isError ? '#de350b' : '#006644';
}

function parseStepsFromWorkflow(content) {
  const lines = (content || '').split('\n');
  const steps = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('- name:')) {
      if (current) steps.push(current);
      current = { name: line.replace('- name:', '').trim(), uses: '', run: '' };
      continue;
    }

    if (!current && (line.startsWith('- uses:') || line.startsWith('- run:'))) {
      current = { name: 'New Step', uses: '', run: '' };
    }

    if (current && line.startsWith('uses:')) current.uses = line.replace('uses:', '').trim();
    if (current && line.startsWith('- uses:')) current.uses = line.replace('- uses:', '').trim();
    if (current && line.startsWith('run:')) current.run = line.replace('run:', '').trim();
    if (current && line.startsWith('- run:')) current.run = line.replace('- run:', '').trim();
  }

  if (current) steps.push(current);

  return steps;
}

function renderComponents() {
  el.componentList.innerHTML = '';
  defaultComponents.forEach((component) => {
    const item = document.createElement('div');
    item.className = 'component-item';
    item.draggable = true;
    item.textContent = component.label;
    item.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('application/json', JSON.stringify(component));
    });
    el.componentList.appendChild(item);
  });
}

function renderCanvas() {
  el.canvas.innerHTML = '';
  state.canvasSteps.forEach((step, index) => {
    const node = document.createElement('div');
    node.className = `canvas-node ${state.selectedStepIndex === index ? 'active' : ''}`;
    node.innerHTML = `<strong>${index + 1}. ${step.name}</strong><div>${step.uses || step.run || ''}</div>`;
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
    el.nodeConfig.innerHTML = '点击节点后可编辑配置';
    return;
  }

  const step = state.canvasSteps[state.selectedStepIndex];
  el.nodeConfig.innerHTML = '';

  const nameInput = document.createElement('input');
  nameInput.value = step.name;
  nameInput.placeholder = 'step name';

  const usesInput = document.createElement('input');
  usesInput.value = step.uses;
  usesInput.placeholder = 'uses (如 actions/checkout@v4)';

  const runInput = document.createElement('textarea');
  runInput.value = step.run;
  runInput.placeholder = 'run command';

  [nameInput, usesInput, runInput].forEach((node) => el.nodeConfig.appendChild(node));

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '保存节点配置';
  saveBtn.addEventListener('click', () => {
    step.name = nameInput.value.trim() || 'New Step';
    step.uses = usesInput.value.trim();
    step.run = runInput.value.trim();
    renderCanvas();
    setStatus('节点配置已更新');
  });

  el.nodeConfig.appendChild(saveBtn);
}

function buildWorkflowYaml() {
  const workflow = state.workflows[state.activeWorkflowIndex];
  const defaultName = workflow?.name?.replace(/\.ya?ml$/i, '') || 'Generated Workflow';
  const stepYaml = state.canvasSteps
    .map((step) => {
      const lines = [`      - name: ${step.name || 'New Step'}`];
      if (step.uses) lines.push(`        uses: ${step.uses}`);
      if (step.run) lines.push(`        run: ${step.run}`);
      return lines.join('\n');
    })
    .join('\n');

  return `name: ${defaultName}\non:\n  push:\n    branches: [main]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n${stepYaml || '      - name: Placeholder\n        run: echo "No steps yet"'}\n`;
}

el.loadBtn.addEventListener('click', async () => {
  try {
    state.repoUrl = el.repoUrl.value.trim();
    state.token = el.githubToken.value.trim();

    setStatus('正在加载 workflows...');
    const response = await fetch('/api/repo/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: state.repoUrl, token: state.token })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '加载失败');

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
      setStatus('该仓库未检测到 GitHub Actions Workflow');
      return;
    }

    state.workflows.forEach((wf, idx) => {
      const option = document.createElement('option');
      option.value = idx;
      option.textContent = wf.path;
      el.workflowList.appendChild(option);
    });

    state.activeWorkflowIndex = 0;
    state.canvasSteps = parseStepsFromWorkflow(state.workflows[0].content);
    state.selectedStepIndex = -1;
    renderCanvas();
    renderNodeConfig();
    el.yamlOutput.value = state.workflows[0].content;
    setStatus(`已加载 ${state.workflows.length} 个 workflow`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

el.workflowList.addEventListener('change', () => {
  state.activeWorkflowIndex = Number(el.workflowList.value);
  const wf = state.workflows[state.activeWorkflowIndex];
  state.canvasSteps = parseStepsFromWorkflow(wf.content);
  state.selectedStepIndex = -1;
  renderCanvas();
  renderNodeConfig();
  el.yamlOutput.value = wf.content;
  setStatus(`切换到 ${wf.path}`);
});

el.canvas.addEventListener('dragover', (event) => event.preventDefault());
el.canvas.addEventListener('drop', (event) => {
  event.preventDefault();
  const raw = event.dataTransfer.getData('application/json');
  if (!raw) return;
  const component = JSON.parse(raw);
  state.canvasSteps.push({
    name: component.label,
    uses: component.uses || '',
    run: component.run || ''
  });
  renderCanvas();
  setStatus(`已添加步骤: ${component.label}`);
});

el.syncYamlBtn.addEventListener('click', () => {
  if (state.activeWorkflowIndex < 0) {
    setStatus('请先加载 workflow', true);
    return;
  }
  const yaml = buildWorkflowYaml();
  el.yamlOutput.value = yaml;
  setStatus('已根据画布生成 YAML');
});

el.createPrBtn.addEventListener('click', async () => {
  if (state.activeWorkflowIndex < 0) {
    setStatus('请先加载 workflow', true);
    return;
  }
  if (!state.token) {
    setStatus('创建 PR 需要 GitHub Token', true);
    return;
  }

  try {
    const workflow = state.workflows[state.activeWorkflowIndex];
    const workflowContent = el.yamlOutput.value.trim() || buildWorkflowYaml();

    setStatus('正在创建 PR...');
    const response = await fetch('/api/repo/create-pr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoUrl: state.repoUrl,
        token: state.token,
        workflowPath: workflow.path,
        workflowContent,
        branchName: el.branchName.value.trim() || undefined,
        commitMessage: el.commitMessage.value.trim() || undefined,
        prTitle: el.prTitle.value.trim() || undefined,
        prBody: el.prBody.value.trim() || undefined
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '创建 PR 失败');

    setStatus(`PR 创建成功: ${data.prUrl}`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

renderComponents();
renderCanvas();
renderNodeConfig();
