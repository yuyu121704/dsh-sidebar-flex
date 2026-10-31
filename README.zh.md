# dsh-sidebar-flex

给 DeepSeek Harness 的侧栏加一条**可拖拽、会记住**的横向分隔条，把「工作区 / 会话列表」
从两层挤压里救出来。

## 为什么需要它

DSH Web GUI 的侧栏里同时住着两样东西：

- **全局面板列表**：插件、插件市场、自动化任务、MCP 连接器、学习、Remotion、更多。
  它不滚动，在 1234px 高的窗口里吃掉约 396px；
- **工作区 / 会话区域**：只剩 120–140px 左右，也就是两行会话。

外壳没有提供在两者之间重新分配高度的办法，于是会话列表被裁掉、想要的会话点不到。
本插件把这件事做成一个拖拽手柄。

## 有什么用

全局面板列表正下方有一条 10px 的分隔条：

| 操作 | 效果 |
| --- | --- |
| 上下拖动分隔条 | 缩小 / 放大面板列表，省下的高度全给下面的「工作区 + 会话列表」 |
| 双击 / 右键分隔条 | 面板列表恢复自然高度 |
| 分隔条聚焦后 <kbd>↑</kbd> / <kbd>↓</kbd> | 每次 ±24px |
| 刷新、重启、下次启动 | 从 `localStorage["dsh-sidebar-flex:nav-height"]` 恢复高度 |

面板列表最小 54px（一行）；低于自然高度后自动变成可滚动，所以什么都没丢，
只是重新分配了。

侧栏**宽度刻意不动**：外壳保持自己的 264–420px 钳制与自带边缘手柄。
早期"接管宽度"的实验仍留在 `lib/client.js` 里，由顶部的 `ENABLE_WIDTH`
（默认 `false`）控制，当前关闭。

## 安装

DSH 的 profile 位于 `<DSH 数据目录>/profiles/<profile>`
（如 `C:\Users\<你>\.dsh\profiles\desktop`）。客户端插件必须是该 profile
`node_modules` 里的一个包，并登记进 profile 清单。

1. 把本包放进 profile 的 `node_modules`（复制目录，或用 junction / symlink 指向
   源码目录）：

   ```powershell
   # Windows，在本仓库目录下执行
   New-Item -ItemType Junction `
     -Path  "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-sidebar-flex" `
     -Target (Resolve-Path .)
   ```

2. 把包名追加到 profile 的 `package.json` 里的 `dsh.profile.bundles`：

   ```json
   {
     "dsh": {
       "profile": {
         "bundles": ["...", "dsh-sidebar-flex"]
       }
     }
   }
   ```

3. 保存。`@deepseek-ai/dsh-hmr` 会监听 profile 清单、重组 profile，并通过 SSE
   推送新的客户端模块图——**无需重启应用**，分隔条直接出现。若没出现，刷新一次窗口。

> 刻意**不**登记进 `dependencies`：插件管理器的 `reconcile()` 会把
> 「曾经是依赖、现在不在依赖里」的 bundle 删掉，保持非托管反而更稳。

## 实现

只有客户端一半。它轮询找到侧栏列，定位其中的全局面板列表，写入内联 `height`，
并加一个让它可滚动的 class。React 每次重渲染都会重写内联样式，因此用
`MutationObserver` 立刻把高度写回；如果外壳替换了列表节点，手柄会重新挂载。
不依赖任何客户端 service、不接管 React 状态，所以启动阶段也安全。

DSH 的 CSS Module 类名带哈希，选择器用 `[class*='panelList']` /
`[class*='sidebarCol']` 这类子串匹配。

## 备注

- 宿主一半（`lib/index.js`）故意留空：布局在浏览器里渲染，不需要宿主服务，也就不需要重启。
- 主题如果给侧栏底部加了装饰，那段留白属于主题，本插件只改面板列表高度，不碰对话列。
- 宽度接管（`ENABLE_WIDTH = true`）会把第一条 grid track 改成
  `200px … 窗口宽 − 420px` 并隐藏外壳自带的手柄；再关回去时，卸载会把它夹回原生
  264–420px，交还给外壳。

## 卸载

1. 从 `dsh.profile.bundles` 删掉 `"dsh-sidebar-flex"`；
2. 删除 `node_modules/dsh-sidebar-flex`（junction 或副本）；
3. 可选：清掉 `localStorage["dsh-sidebar-flex:nav-height"]`。

## 兼容性

`peerDependencies: @deepseek-ai/dsh >=0.2.0-rc.2 <0.3.0-0`。
在 `@deepseek-ai/dsh-client-ui-layout`、`-ui-sidebar`、`-ui-workspace`
的 0.2.2 客户端产物上实测通过（选择器 `[class*='sidebarCol']`、
`[class*='panelList']`）。

## 许可

MIT © 2026 yuyu121704
