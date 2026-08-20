# green-night-pi

绿色系夜间主题 + 居左色块 footer 扩展，来自一台容器里被反复调教的 pi。

## 特性

### 主题 `green-night`（themes/green-night.json）

- 绿色系暗色主题，text 亮白
- **thinking 暗绿斜体**：思考过程与回复一眼可辨（`thinkingText`）
- 输入框 thinking 边框 `thinkingHigh` 用亮绿（无黄色突兀）
- 引用块 `mdQuote` 归入绿色系
- **消息分色背景**：
  - 用户消息 `userMessageBg`（亮绿灰块）
  - 助手消息 `assistantMessageBg`（深绿灰块）⚠️ 见下方"内核补丁"
  - 工具输出 `toolPendingBg` / `toolSuccessBg` / `toolErrorBg`（灰/深绿/深红）

### footer 扩展（extensions/footer.ts）

居左紧凑色块（pill）状态栏，零依赖、无渲染循环：

```
[ ~/akagent ]  [ dev !5?7 ]  [ DeepSeek V4 Flash (AK internal) ]  [ 14.8%/1.0M ]
```

- cwd 灰块绿字 / git 分支深绿块（dirty 黄字计数）/ 模型深绿灰块 / 上下文用量灰块（>70% 黄字、>90% 红字）
- 性能纪律：**无每秒渲染**，仅 30s 一次 `git status` 轻量刷新 + 分支变化触发重绘

### header 扩展（extensions/header.ts）——Claude Code 风格启动头部

动画 π logo + 信息栏（vendor 自 pi-cc-header v1.0.3，MIT，见 THIRD_PARTY_NOTICES.md）：

```
  ██████      Pi v0.84.2
  ██  ██      Pi
  ████  ██    deepseek-v4-flash-0731 · high
  ██    ██    0 skills · 0 prompts · 5 extensions
```

- 默认已适配本主题：**logo 绿色（g）**、**标语 "Pi"**，开箱即用
- 九色调色板（a/c/r/o/y/g/w/b/p）、IBM 横线、Minecraft 渐变、14 帧动画（25~100ms）
- 信息栏：版本 / 模型 / thinking 级别 / skills / prompts / 扩展数 / AGENTS.md 标记 / cwd / 标语
- 自动写 `quietStartup` + `clearOnStart`，全屏清爽起屏（Claude Code 观感）
- 配置兼容 pi-cc-header（settings.json → `ccHeader`），命令 `/hc` `/hs` `/hi` `/hm` `/hsp` `/hv` `/hdf` `/htg` `/hcl` `/hps`

## 安装

```bash
pi install npm:green-night-pi
```

> 若之前单独装过 `npm:pi-cc-header`，请先卸载避免头部扩展冲突：`pi uninstall npm:pi-cc-header`（配置 `ccHeader` 会保留并被本包继续使用）。

启用主题（settings.json 或 `/settings` 主题选择器）：

```json
{ "theme": "green-night" }
```

## 可选配置

折叠思考块（思考显示为一行 `Thinking...`，`ctrl+t` 切换）：

```json
{ "hideThinkingBlock": true }
```

启动头部常用命令：

| 命令 | 作用 |
|------|------|
| `/hc g` | logo 颜色（a/c/r/o/y/g/w/b/p，默认 g 适配主题） |
| `/hs <文字>` | 标语（默认 "Pi"，最长 85 字符；`/hs` 开关、`/hs -c` 颜色、`/hs -d` 删除） |
| `/hsp 100` | 动画速度 25/50/75/100ms |
| `/hi` / `/hm` | IBM 横线 / Minecraft 渐变开关 |
| `/hv` | 版本号颜色（off / Pi / Pi+ver） |
| `/htg` | 整体开关；`/hcl` 卸载前清配置 |

## ⚠️ 助手消息背景（assistantMessageBg）需要内核补丁

`assistantMessageBg` 不是 pi 主题 schema 的合法背景 token——背景 token 集合（`bgColorKeys`）硬编码在 pi 内核源码。**发行版内核不含此 token 时，助手消息只是无背景（降级静默），其余功能不受影响。**

本地已打补丁的启用方式（供参考，`pi update` 会覆盖）：

```diff
# dist/modes/interactive/theme/theme.js
   const bgColorKeys = new Set([
     "selectedBg",
     "scrollbarThumb",
     "searchMatchBg",
     "userMessageBg",
     "customMessageBg",
     "toolPendingBg",
     "toolSuccessBg",
     "toolErrorBg",
+    "assistantMessageBg",
   ]);

# dist/modes/interactive/components/assistant-message.js
   this.contentContainer.addChild(new Markdown(
     content.text.trim(), this.outputPad, 0, this.markdownTheme,
-    undefined,
+    {
+      bgColor: (text) => {
+        try { return theme.bg("assistantMessageBg", text); } catch { return text; }
+      },
+    },
     { transform: createMarkdownTransform("assistant", this.isStreaming, this.markdownTransformers) }));
```

期待 pi 上游把该 token 官方化（PR 提案中），届时主题文件无需改动。

## License

MIT，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)（含 vendor 的 pi-cc-header 版权声明）。