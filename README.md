# GitHub Actions 可视化配置网站

一个轻量级网页工具，支持：

- 输入 GitHub 仓库地址自动检测 `.github/workflows`。
- 将 workflow 步骤加载到可视化画布（左侧组件、中央画布、右侧配置）。
- 从画布生成 YAML。
- 使用 GitHub Token 将配置更新提交到目标仓库并自动创建 Pull Request。

## 启动

```bash
node server.js
```

默认地址：`http://localhost:3000`

> 创建 PR 需要用户提供具有对应仓库写权限的 Token。
