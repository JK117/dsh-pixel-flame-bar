# dsh-plugin-session-lightbar

侧边栏底部的「会话运行灯光条」：不再有滑轨、端点或 effort 开关，只剩一块**透明背景上的像素阵列**。所有会话空闲时，阵列仍在，但每个像素只有 3.5%–9% 的深蓝不透明度，几乎透明；任一会话运行时，像素按各自的随机噪声闪动。深色主题下从 DeepSeek 主题蓝逐级提亮，峰值闪成白色；浅色主题下单独使用深蓝 → 柔和低饱和蓝，低亮度提高一点蓝色存在感，峰值不再高饱和，也不出现白色。

视觉参考：[Crow5 复刻 Claude 璀星动画](https://www.xiaohongshu.com/discovery/item/6a47ccae000000001003e397?source=webshare&xhsshare=pc_web&xsec_token=ABjxQzN9DEl1QdEK8JQApDuaB2YbkMHZHVqnGlO4dZF-o=&xsec_source=pc_share) 的像素阵列语言；按你的要求已去掉滑块结构、波纹和紫色火光，改为透明底上的 DeepSeek 蓝随机火花，峰值白。

![深色主题：DeepSeek 蓝 → 白](preview/preview.png)

![浅色主题：深蓝 → 柔和低饱和蓝](preview/light.png)

## 效果

- **无滑轨**：没有胶囊底、圆点、白色端点或 effort 开关；只有 5 行 × 约 64 列（256px 宽时）的像素块。
- **点击点亮**：熄灭时单击阵列（或键盘 Enter/Space）点亮 5 秒；再次点击会重新计时，5 秒后淡回空闲。运行中点击忽略。
- **熄灭**：每个像素都在，alpha 约 3.5%–9%，形成一层几乎透明的深蓝点阵；不跑动画。
- **运行**：每个像素独立按 9Hz / 2.1Hz 两层随机噪声闪动，各自有最多 0.5 秒的随机点火延迟；没有从左到右的前沿，也没有涟漪。
- **底阵**：运行时保留一层约为空闲 alpha 90% 的底阵，阵列不会在火花之间变暗或消失。
- **火花**：约 0.18 的像素被稀疏掩码压暗（只压到 45%，不会消失）；其余像素按噪声明暗；另有一层 6.5Hz 的稀有白色闪光。
- **颜色阶梯（深色）**：从 `deepseek-500` 逐级升到 `450 / 400 / 300 / 200`，峰值纯白；色值优先读取 DSH 主题的 `--dsw-static-deepseek-*`，读不到时使用同一组 fallback。浅色主题使用独立的深蓝 → 柔和低饱和蓝色阶。
- **亮度与色相**：亮度同时由 alpha 和色相表达——越暗越透明、越偏深蓝；深色主题越亮越浅、接近纯白，浅色主题始终保持蓝色，但峰值降低饱和度，不会出现黑色块。
- **双主题配色**：深色主题（`body[data-ds-dark-theme]`）保持 DeepSeek 蓝 → 白；浅色主题（无该标记）使用 `#1d4ed8` → `#2563eb` → `#3b6bf5` → `#5f7ef2` → `#7a93f0`。低亮度端用更饱和的深蓝，避免浅底上发灰；峰值端主动降低饱和度。
- **自动切换**：`drawPixels` 每帧读取主题，并用 `MutationObserver` 监听 `data-ds-dark-theme`；空闲、静态或运行中切换主题都会重绘。
- **蓝色光晕**：深色用 `brightness(1.15) + 3px 蓝晕`；浅色用 `saturate(0.95) + 2px 柔和蓝阴影`，避免在白底上洗掉。
- **过渡**：由空闲阵列淡入随机火花、再淡回空闲阵列，约 0.35 秒；空闲后立即停止 `requestAnimationFrame`。
- **边缘**：阵列最左、最右各 5px 用 mask 渐隐，避免像素在侧栏边缘硬切。
- **减少动态效果**：`prefers-reduced-motion: reduce` 下只绘制一帧静态随机阵列，不跑循环。

> 真 HDR 的 Web 渲染与 macOS EDR 方案见 [docs/hdr-options.md](docs/hdr-options.md)，仅为独立设计文档，未实现；当前渲染仍是 SDR。

## 插在哪里

| 项目 | 值 |
| --- | --- |
| 插槽 | `sidebar.footer.action` |
| 位置 | `sidebar.settings`（账户/设置行，即用户头像所在行）**上方** |
| 运行状态 | 根级 hook `useSessionStatus`，遍历 `Map<sessionId, { running, … }>` |
| 点亮条件 | 任意会话 `running === true`；熄灭时点击也可手动点亮 5 秒 |
| 渲染 | 2D canvas，5 行 × 约 64 列像素；3px 像素块 + 1px 缝隙；无第三方依赖 |
| 交互 | 根元素是 `<button>`；熄灭时可点击/Enter/Space 亮 5 秒 |
| Host half | 空实现，纯浏览器插件 |

`ui-sidebar` 的 footer 结构是：

```text
sidebar.footer.action   <- 本插件
sidebar.settings        <- 设置 / 用户头像行
```

所以像素阵列正好落在会话列表下方、头像上方。

## 目录

```text
dsh-plugin-session-lightbar/
├── package.json           # dsh.client 声明，exports ./client
├── lib/
│   ├── index.js           # Host half（空实现）
│   └── client.js          # 构建产物：CSS + flame.js + React 组件
├── src/
│   ├── client.js          # 浏览器 half 源码（React.createElement，无 JSX）
│   ├── flame.js           # 像素阵列渲染器（纯 canvas 2D，可独立预览）
│   └── lightbar.css       # 透明容器、边缘 mask、reduced-motion
├── scripts/
│   ├── build.mjs          # 把 CSS 和 flame.js 内联进 lib/client.js
│   └── smoke-test.mjs     # 无浏览器冒烟测试
├── docs/
│   └── hdr-options.md     # 真 HDR 方案 2/3（设计文档，未实现）
├── preview/
│   ├── index.html         # 深色主题预览
│   ├── light.html         # 浅色主题预览
│   ├── preview.png        # 深色截图
│   └── light.png          # 浅色截图
└── cordis.patch.yml.before-lightbar  # 不含本插件的 profile 补丁快照
```

## 开发

浏览器 bundle 就是一个 `window.__ModuleLoader__.load({ id, factory })` 工厂，注册 `apply` / `inject` 即可。`scripts/build.mjs` 把 `src/lightbar.css` 变成字符串、把 `src/flame.js` 内联进工厂。

```bash
# 修改 src/ 后重新生成 lib/client.js
node scripts/build.mjs

# 语法检查
node --check lib/client.js

# 冒烟测试：注册选项、运行/空闲判定、折叠时 hook 顺序
node scripts/smoke-test.mjs

# 本地预览（默认定格在 1.2 秒）
open preview/index.html

# 播放随机点火 / 淡出
open "preview/index.html?live"

# 定格在指定秒数：0.1 / 0.4 / 1.2
open "preview/index.html?at=0.4"
```

预览页的「重新点火」按钮会让运行中的示例重新播放随机点火。

## 安装到桌面版

本机已经安装，配置写在：

```text
~/.dsh/profiles/desktop/cordis.patch.yml
```

追加的内容是：

```yaml
- insert:
    - id: session-lightbar
      name: /Users/jkfan/AgentProjects/ToolsResearcher/dsh-plugin-session-lightbar/lib/index.js
```

`name` 是入口文件的**绝对路径**，不是 npm 包名；因此不需要 `pnpm add`，也不会改动 profile 的依赖清单。

### 需要重启吗？

**不需要。** 桌面版启用了 HMR：修改 `cordis.patch.yml` 后，Host 会重新组合 profile，客户端模块图随即把新插件推给已打开的页面。

如果当前窗口没有出现新样式，按 `Cmd+R` 刷新窗口即可；只有以下情况才需要重启应用：

- 在 profile 补丁里关闭了 HMR；
- DSH 应用升级后需要重新加载 Host；
- 你把插件目录移动到了新路径，且修改了 `name` 后仍不生效。

### 移动插件目录

`name` 指向绝对路径。如果移动了 `dsh-plugin-session-lightbar/`，同步修改上面这一行；然后刷新窗口（必要时重启）。

## 可调参数

| 想改什么 | 位置 |
| --- | --- |
| 像素大小 / 缝隙 | `src/flame.js` 中的 `cell`、`gap` |
| 行数 | `src/flame.js` 中的 `Math.min(5, …)` |
| 空闲透明度 | `src/flame.js` 中的 `0.035 + hash(...) * 0.055` |
| 运行底阵亮度 | `src/flame.js` 中的 `idleAlpha * 0.9` |
| 快/慢噪声频率 | `src/flame.js` 中的 `time * 9`、`time * 2.1` |
| 随机点火延迟 | `src/flame.js` 中的 `seed * 0.5` 与 `/ 0.32` |
| 疏密 | `src/flame.js` 中的 `mask < 0.18`、`mask` 压暗系数 `0.45`、`energy < 0.04` |
| 深色白色火花频率 | `src/flame.js` 中的 `sparkle > 0.985` |
| 深色蓝色阶梯 / 白光阈值 | `src/flame.js` 的 `pixelColor` 中 0.8 / 0.58 / 0.38 / 0.22 / 0.08 阈值 |
| 点击点亮时长 | `src/client.js` 中 `setTimeout(..., 5000)` |
| 深色光晕 | `.dsh-sl[data-active="true"] .dsh-sl__pixels` 的 `brightness(1.15) + drop-shadow(...)` |
| 浅色色阶 | `src/flame.js` 的 `lightPalette`：deep / navy / royal / blue / peak |
| 浅色低亮度 | `src/flame.js` 的 `idleAlpha` 浅色 ×1.4、alpha 增益浅色 ×1.6 |
| 浅色阈值 | `pixelColor` 的 light 分支：0.8 / 0.58 / 0.38 / 0.18 |
| 浅色光晕 | `:root:not([data-ds-dark-theme]) body:not([data-ds-dark-theme])` 下的 `saturate(0.95) + 2px 柔和蓝 drop-shadow` |
| 主题切换 | `src/flame.js` 的 `isLightTheme()` 与 `MutationObserver`（`data-ds-dark-theme`） |
| 像素颜色 / 亮度曲线 | `src/flame.js` 的 `pixelColor` 与 `Math.pow(noise, 1.45)` |
| 深色运行亮度增益 | `src/flame.js` 的 `min(energy, 1) * 1.5` 与 CSS `brightness(1.15)` |
| 全局淡入/淡出 | `src/flame.js` 中的 `delta / 0.35` |
| 边缘渐隐 | `src/lightbar.css` 的 `mask-image`（5px） |

改完执行 `node scripts/build.mjs`，刷新窗口。

真 HDR 的 Web 渲染与 macOS EDR 两条路线见 [docs/hdr-options.md](docs/hdr-options.md)。

## 卸载

删除 `cordis.patch.yml` 中 `session-lightbar` 的整个 `- insert:` 块（连同上面的两行注释），刷新窗口即可。也可以用不含本插件的快照恢复：

```bash
cp /Users/jkfan/AgentProjects/ToolsResearcher/dsh-plugin-session-lightbar/cordis.patch.yml.before-lightbar \
  ~/.dsh/profiles/desktop/cordis.patch.yml
```

该快照是本机文件，包含主题/模型等个人配置，已加入 `.gitignore`，不会提交到仓库。

## 已知限制

- **双主题配色**：深色是蓝→白；浅色是内置的深蓝→柔和低饱和蓝 `lightPalette`，低亮度用更饱和的深蓝避免发灰，峰值降低饱和度，不出现白色。浅色色值不依赖 DSH 语义 token，换主题 token 不会自动改浅色色值。
- 只对 Web 客户端生效（`dsh.client.platform: "web"`），不影响 TUI/ACP。
- 以绝对路径挂载，适合本地开发；要分发给别人，建议按官方 bundle 规范打包。
- 它是一条普通 Loader 行，不是 bundle，因此不会出现在侧边栏「插件」页的 bundle 列表里；开关方式是编辑 profile 补丁。
- 灯条反映的是 Host 的 Session `running` 状态，不额外推断「等待审批」「后台任务」等语义。
- 点击点亮只是本地 5 秒预览，不改变 Host 的会话状态；运行中点击被忽略，不会延长或切换会话。
- 像素阵列是 canvas 2D 近似，没有 WebGL 的逐帧高斯 bloom；亮度来自 alpha 与 `pixelColor` 的蓝→白色阶，光晕来自 CSS `drop-shadow`。
- 真 HDR 方案（Web HDR / macOS EDR）见 [docs/hdr-options.md](docs/hdr-options.md)，独立设计文档，未实现。

## 实现备注

- 组件通过 `sidebar.footer.action` 的根作用域拿到 `useSessionStatus`，用一个 selector 把整个 Map 归约成布尔值；只有布尔值变化才会触发 React 重渲染。
- `useSessionStatus`、`useRef`、`useState`、`useEffect` 都在 `wide` 判断之前调用，保证侧边栏折叠/展开时 hook 顺序稳定；折叠时 `display: none` 并停止渲染循环，画布保持挂载，展开后可继续。
- 根元素是 `<button type="button">`，所以 Enter/Space 与单击走同一路径；熄灭点击设置 `previewing=true` 并启动 5 秒定时器，`active = running || previewing` 驱动画布；再次点击会清除旧定时器并重新计时。
- 画布在 `start` / `renderAt` / `resize` 时用 `getBoundingClientRect` 同步 backing buffer 尺寸（`syncSize`），DPR 上限为 2；`ResizeObserver` 负责布局变化后的重绘。
- 每个像素的亮度来自 `hash(column, row, time-slice)` 的独立随机值，再用相邻时间片插值；代码里没有 `distance`、前沿、正弦空间波或方向性，因此不会出现波纹。
- 空闲时只画一层固定的低 alpha 深蓝点阵；运行时用 `level` 在 0.35 秒内淡入/淡出。每格先保留 `baseAlpha = idleAlpha * 0.9` 的底阵，再按 `level × local × energy × 1.5` 叠加随机火花。深色由 `pixelColor` 选择 deepseek-500 → 450 → 400 → 300 → 200 → white；浅色选择 deep → navy → royal → blue → peak，低亮度 alpha 额外 ×1.4，运行增益 ×1.6，峰值不出现白色。
- `isLightTheme()` 读取 `body[data-ds-dark-theme]`（兼容 `html`），并用 `MutationObserver` 监听属性变化；切换主题时 `resize()` 重绘当前帧。深色 palette 读取 `--dsw-static-deepseek-*`，浅色 `lightPalette` 是内置色值。空闲后 `requestAnimationFrame` 立即停止。
- 画布背景透明，CSS 不设轨道/胶囊/边框；像素的 alpha 决定亮度，`pixelColor` 决定蓝→白的色相。根按钮在熄灭时有 `cursor: pointer` 与 hover 提亮，运行中改为 `cursor: default`。样式用 `<style data-plugin="dsh-plugin-session-lightbar">` 注入，插件模块被卸载时由 DSH 模块系统按 `data-plugin` 清理。
- 画布最左/最右 5px 用 CSS `mask-image` 渐隐；像素网格本身按设备像素对齐，避免半像素发虚。
