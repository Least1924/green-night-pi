/**
 * footer — 居左紧凑自定义 footer（零依赖本地扩展）
 *
 * 规则（吸取 open-tui 卡顿教训）：
 * - 无每秒渲染：不挂 clock 定时器
 * - 仅 30s 一次 git status 刷新（spawnSync 轻量）+ onBranchChange 触发重绘
 * - 全部内容靠左，竖线分隔，超宽截断
 */
const { execSync } = require("node:child_process");

const GIT_REFRESH_MS = 30_000;
const MAX_CWD = 36;
const SEP = " | ";

let gitStatusCache = "";

/** 剥离 ANSI 转义，得纯可见文本 */
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}

/** 粗略可见宽度：宽字符(中日韩等)算 2，其余 1 */
function visibleWidth(s) {
  const clean = stripAnsi(s);
  let w = 0;
  for (const ch of clean) {
    const cp = ch.codePointAt(0);
    w += cp >= 0x1100 && [0x1100, 0x2e80, 0x3040, 0xac00, 0xff00].some(
      (base, i, arr) => cp >= base && cp < (arr[i + 1] ?? 0x110000),
    ) ? 2 : 1;
    if (cp > 0xffff) { /* astral: 2 */ w += 1; }
  }
  return w;
}

/** 按宽度截断 + 省略号 */
function truncateToWidth(s, maxW, ellipsis = "…") {
  if (visibleWidth(s) <= maxW) return s;
  const ew = visibleWidth(ellipsis);
  let out = "";
  let w = 0;
  for (const ch of s) {
    const cw = visibleWidth(ch);
    if (w + cw + ew > maxW) break;
    out += ch;
    w += cw;
  }
  return out + ellipsis;
}

function fmtTokens(n) {
  if (n < 1000) return `${n}`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1000000).toFixed(1)}M`;
}

function formatCwd(cwd) {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return cwd;
  if (cwd === home) return "~";
  if (cwd.startsWith(home + "/")) return `~${cwd.slice(home.length)}`;
  return cwd;
}

/** git dirty 计数如 !5 ?7；失败或干净返回空 */
function computeGitStatus(cwd) {
  try {
    const out = execSync("git status --porcelain", {
      cwd,
      timeout: 3000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    let modified = 0;
    let untracked = 0;
    let staged = 0;
    for (const line of out.split("\n")) {
      if (line.length < 2) continue;
      const x = line[0];
      const y = line[1];
      if (x === "?" && y === "?") untracked++;
      else if (x !== " " || y !== " ") modified++;
      if (x !== " " && x !== "?") staged++;
    }
    const parts = [];
    if (modified > 0) parts.push(`!${modified}`);
    if (untracked > 0) parts.push(`?${untracked}`);
    if (staged > 0) parts.push(`+${staged}`);
    return parts.length ? parts.join("") : "";
  } catch {
    return "";
  }
}

export default function (pi) {
  let latestCtx = null;

  function install(ctx) {
    try {
      if (!ctx.ui || typeof ctx.ui.setFooter !== "function") return;
      latestCtx = ctx;
      ctx.ui.setFooter((tui, theme, footerData) => {
      let timer;
      const refreshGit = () => {
        try {
          gitStatusCache = computeGitStatus(ctx.sessionManager.getCwd());
          tui.requestRender();
        } catch {
          /* noop */
        }
      };

      const unsubBranch = footerData.onBranchChange(() => {
        try {
          tui.requestRender();
        } catch {
          /* noop */
        }
      });

      timer = setInterval(refreshGit, GIT_REFRESH_MS);
      if (timer && timer.unref) timer.unref();

      return {
        dispose() {
          unsubBranch();
          if (timer) clearInterval(timer);
        },
        invalidate() {},
        render(width) {
          if (width <= 0) return [""];
          const parts = [];
          const dim = (t) => theme.fg("dim", t);

          // 色块 pill：背景 token + 文字，两端补空格
          const pill = (bgToken, text) => {
            try {
              return theme.bg(bgToken, ` ${text} `);
            } catch {
              return text;
            }
          };

          // 1. cwd（accent 字 + 灰块）
          let cwd = formatCwd(ctx.sessionManager.getCwd());
          if (cwd.length > MAX_CWD) cwd = `…${cwd.slice(-MAX_CWD)}`;
          parts.push(pill("toolPendingBg", theme.fg("accent", cwd)));

          // 2. git 分支 + dirty（成功绿块 + 黄字计数）
          const branch = footerData.getGitBranch();
          if (branch) {
            const label = branch === "detached" ? "HEAD" : branch;
            let seg = theme.fg("success", label);
            if (gitStatusCache) seg += theme.fg("warning", `  ${gitStatusCache}`);
            parts.push(pill("toolSuccessBg", seg));
          }

          // 3. 模型名（muted 字 + 深绿块）
          const model = ctx.model;
          if (model && model.id) {
            parts.push(pill("assistantMessageBg", theme.fg("muted", model.id)));
          }

          // 4. 上下文用量（>70% 黄 / >90% 红，灰块），格式 12.4%/1.0M
          try {
            const usage = ctx.getContextUsage ? ctx.getContextUsage() : null;
            if (usage && usage.contextWindow > 0) {
              const pct = usage.percent ?? 0;
              const color = pct > 90 ? "error" : pct > 70 ? "warning" : "dim";
              parts.push(pill("toolPendingBg", `${theme.fg(color, `${pct.toFixed(1)}%`)}${dim(fmtTokens(usage.contextWindow))}`));
            }
          } catch {
            /* noop */
          }

          // pill 间用单空格分隔（色块即分隔，去掉竖线）
          const full = parts.join(" ");
          const line =
            visibleWidth(full) <= width ? full : truncateToWidth(full, width, dim("…"));
          return [line];
        },
      };
      });
    } catch {
      /* noop */
    }
  }

  // 多时机重装（resume/重建会先清除自定义 footer，幂等重装）
  pi.on("session_start", (_e, ctx) => install(ctx));
  pi.on("session_tree", (_e, ctx) => install(ctx));

  // 5s 轻量自检兜底：resume 瞬态清除后自动重装（重建组件不触发重绘，无渲染开销）
  const watchdog = setInterval(() => {
    try {
      if (latestCtx) install(latestCtx);
    } catch {
      /* noop */
    }
  }, 5000);
  if (watchdog && watchdog.unref) watchdog.unref();
}