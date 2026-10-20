# 真 HDR 高亮方案（方案 2 / 3）

> **状态：设计文档，未实现。**
> 当前插件采用 **SDR 像素阵列**：深色主题为蓝→白，浅色主题为深蓝→柔和低饱和蓝（均非物理 HDR）；SDR HDR-like 实验未保留。
> 本文只讨论两条“物理上超过 SDR 白”的路线，供后续立项/评估使用，不影响当前插件。

## 0. 结论

| 方案 | 能否物理超过 SDR 白 | 可行性 | 适合谁 |
| --- | --- | --- | --- |
| 当前 SDR 双主题像素 | 否 | 已实现，稳定 | 插件默认 |
| **方案 2：Web HDR 渲染** | 理论上可以 | 实验性；依赖 Chromium/Electron、HDR canvas 合成和系统 EDR | 愿意做特性开关、可接受回退的 Web 实现 |
| **方案 3：macOS 原生 EDR 覆盖层** | 可以，最可靠 | 工程量大；需要原生代码、IPC、窗口/多屏管理 | 把“真 HDR”当产品能力，而非插件 |

**建议**：插件继续保留当前 SDR 蓝白像素效果；先把方案 2 作为实验分支验证目标 Electron 是否支持；只有“真 EDR”成为明确产品需求时才做方案 3。

## 1. 前提：为什么现在只是普通白

- SDR 内容的最亮颜色就是 CSS `white`，即 **HDR reference white**；SDR 的 HDR headroom 为 0。
- `<canvas>` 默认是 sRGB、8-bit、SDR 合成；`rgba(255,255,255,1)` 已经是 1.0。
- `filter: brightness()`、`mix-blend-mode: screen/plus-lighter`、多层白色叠加都会 clamp 到 SDR 白，不会产生更高的物理亮度。
- `color(display-p3 1 1 1)` 是**广色域**，不是 HDR；它不能超过 SDR reference white。
- 要看到“超过 SDR 白”的高光，需要同时满足：
  1. HDR 显示器（macOS XDR / mini-LED / HDR 显示器）；
  2. HDR 内容与 HDR 合成路径（canvas/WebGL/WebGPU 或原生 layer）；
  3. 操作系统/窗口/合成器允许该内容使用 EDR headroom。
- 即使三者都满足，面向整个侧边栏的大面积高亮也会被 tone map 或让人不适；HDR 高光应当**小面积、稀疏、短时**。

## 2. 方案 2：Web HDR 渲染路径

### 2.1 先探测环境

在目标 DSH 桌面版的 DevTools 里执行：

```js
matchMedia("(dynamic-range: high)").matches;
CSS.supports("dynamic-range-limit", "no-limit");
CSS.supports("color", "color(rec2100-pq 1 1 1)");
// 如果存在（提案 API，未必有）：
window.screen?.highDynamicRangeHeadroom;
```

注意：

- DevTools 的 `dynamic-range: high` 模拟只改变媒体查询结果，**不会**给窗口真实的 EDR headroom。
- `dynamic-range-limit` 只控制 HDR 内容的最大亮度，不会把 SDR 白色变亮。
- 需要记录目标 Electron/Chromium 版本、macOS 版本、显示器型号和 HDR 设置。

### 2.2 Canvas 2D HDR（提案路径）

W3C ColorWeb-CG 的 [HDR HTML Canvas 提案](https://raw.githubusercontent.com/w3c/ColorWeb-CG/e5bb8a46c32865fc61776b7ed85a1a17f135001a/hdr_html_canvas_element.md) 提出：

- 新增 `rec2100-pq` / `rec2100-hlg` 颜色空间；
- `colorMetadata`（2D/WebGL/WebGPU）与 `mode: 'extended'`；
- float16 / 10-bit 存储；
- `screen.highDynamicRangeHeadroom`。

伪代码（API 名称以提案为准，不代表当前稳定版可用）：

```js
const ctx = canvas.getContext("2d", {
  colorSpace: "rec2100-pq",
  storageFormat: "float16",
});
ctx.colorMetadata = { mode: "extended" };

// PQ 编码的高光；具体编码需按 BT.2100 / 参考白换算
ctx.fillStyle = "color(rec2100-pq 0.75 0.82 1.0)";
ctx.fillRect(x, y, 3, 3);
```

现状：这是**提案**，稳定版 Web 平台支持有限。必须先在实际 Electron 里验证 `getContext` 是否接受这些参数、canvas 是否真的以 HDR 合成，而不能只看 CSS 媒体查询。

### 2.3 WebGL2 / WebGPU 扩展亮度（更现实的实验路径）

相比 2D canvas，WebGL/WebGPU 更容易拿到 float16 和扩展范围：

```js
const gl = canvas.getContext("webgl2");
gl.drawingBufferStorage(gl.RGBA16F, width, height);
gl.drawingBufferColorMetadata = { mode: "extended" };
gl.drawingBufferColorSpace = "srgb-linear";

// 峰值可以 > 1.0（相对于 SDR 白），由合成器/显示器 tone map
gl.clearColor(4.0, 4.0, 4.0, 1.0);
```

WebGPU 侧对应 `rgba16float`、`GPUCanvasConfiguration.colorSpace`、以及提案中的 `GPUCanvasContext.colorMetadata`。

关键点：

- 仅把像素值写成 >1.0 **不够**；canvas 必须被标记/合成为 HDR，否则仍会被裁到 SDR 白。
- 需要确认 Electron/Chromium 的 `drawingBufferColorMetadata`、`rec2100-*`、`display-p3` 支持情况；不同版本差异很大。
- 即使 API 存在，窗口可能仍按 SDR 合成；需要实测屏幕上的实际亮度，而不是看截图。

### 2.4 HDR 场景的渲染设计

如果 API 可用，建议把 canvas 内部当作 **linear extended range** 场景：

- 普通像素：0–1（SDR 蓝）；
- 高光核心：2–6× SDR white（具体按显示器 headroom）；
- 多层 bloom：在 HDR 线性空间做，最后 tone map 到显示器的 headroom；
- 只让极小的核心超过 1.0，其余保持 SDR；避免整条亮带。
- 用 `dynamic-range-limit: constrained`/`no-limit` 控制该区域的 HDR 上限（如果可用）。

### 2.5 原型步骤

1. 新建实验插件/分支，不改变当前 SDR 实现；通过 query flag 或设置开关启用。
2. 探测 HDR 能力；失败则回退当前 SDR 蓝白像素效果。
3. WebGL2 优先（比 2D canvas HDR 更可能可用）；WebGPU 作为备选。
4. 实现一个 3×3/5×5 的 HDR 峰值 + 在线性空间做 bloom；用当前像素阵列的随机逻辑。
5. 在 XDR 显示器、HDR 开/关、浅色/深色、不同窗口位置下验证；记录 nits/截图/功耗。
6. 若 API 不存在或合成器拒绝，停止在实验分支，不进入正式插件。

### 2.6 风险

- API 不稳定/未实现；Electron 升级即失效。
- Chromium 支持 HDR 视频 ≠ 支持 HDR canvas；不能把视频能力当成 canvas 能力。
- 窗口/合成器可能不给 EDR headroom；同一代码在不同显示器上表现不同。
- 截图/录屏通常看不到 HDR 差异，必须实机看。
- 峰值过高会造成刺眼、烧屏风险和用户不适；需要上限和偏好开关。

## 3. 方案 3：macOS 原生 EDR 覆盖层

### 3.1 原理

在 Electron 窗口之上放一个**原生透明覆盖层**，用 `CAMetalLayer` 渲染：

- `wantsExtendedDynamicRangeContent = true`
- `colorspace = CGColorSpaceCreateWithName(kCGColorSpaceExtendedLinearDisplayP3)`
- `pixelFormat = .rgba16Float`
- 写入 >1.0 的线性值；由 macOS EDR 合成器映射到显示器 headroom。

这条路径不依赖 Chromium 的 HDR canvas 支持，是“真 EDR”最可靠的方式。

### 3.2 架构

```text
Electron main
  ├─ BrowserWindow (现有 DSH UI，SDR)
  ├─ 读取侧边栏/按钮的 DOMRect（renderer → main IPC）
  ├─ 原生 helper（Swift/Obj-C++ N-API addon 或独立进程）
  │    ├─ 无边框透明 NSWindow / NSView
  │    ├─ CAMetalLayer（EDR）
  │    └─ Metal shader：像素阵列 + HDR 峰值 + bloom
  └─ 状态 IPC：running / previewing / theme / bounds / display
```

需要处理：

- 覆盖层位置：侧边栏 DOMRect + `BrowserWindow.getContentBounds()` + `screen.getDisplayNearestPoint` + scale factor；窗口移动/缩放/侧边栏折叠/主题切换都要同步。
- 鼠标：`ignoresMouseEvents = true` 让点击穿透到 Electron 的按钮；或者自己转发点击。
- 层级/空间：`NSWindow.Level.floating`、`collectionBehavior`、全屏/多桌面/其他显示器时隐藏。
- 渲染：Metal 里复刻当前像素阵列、随机噪声、白芯、bloom；状态由 IPC 驱动。
- 回退：非 macOS/非 HDR/EDR 不可用时，隐藏覆盖层，继续用 Electron 内的 SDR canvas。

### 3.3 优点

- 真正超过 SDR 白；峰值亮度可由显示器 headroom 决定。
- 不依赖 Web HDR API 的成熟度；可用 Metal 做更高质量的 bloom。
- 可以只在覆盖层内做 HDR，不改变 DSH 的 SDR UI。

### 3.4 代价

- macOS-only；Windows/Linux 需要另做（Windows HDR10/DXGI、Linux 更复杂）。
- 原生代码 + 签名/公证 + Electron 打包/更新；不是插件包能完成的。
- 窗口层级、点击穿透、多显示器、全屏、屏幕录制、辅助功能都要单独处理。
- 随 DSH 主题/布局/侧边栏宽度变化维护两套渲染；调试成本高。
- 覆盖层与 Electron 的合成可能不同步；需要处理掉帧/延迟。
- 工程规模显著大于当前插件；更适合作为桌面端产品能力，而不是社区插件。

### 3.5 原型步骤

1. 用 Swift/Obj-C++ 做一个最小 `NSWindow` + `CAMetalLayer` EDR demo，确认在 XDR 上能显示 >SDR 白。
2. 固定覆盖在 Electron 窗口上方，读取一个矩形区域，验证点击穿透和位置同步。
3. 用 IPC 把 running/previewing/theme/bounds 传进来；Metal 渲染一个静态 HDR 白点。
4. 加入当前像素阵列/随机噪声/bloom；做 SDR 回退。
5. 测试多显示器、全屏、浅色/深色、窗口缩放、录屏、功耗；再决定是否产品化。

## 4. 对比

| 维度 | 当前 SDR 双主题像素 | 方案 2 Web HDR | 方案 3 原生 EDR |
| --- | --- | --- | --- |
| 物理超过 SDR 白 | 否 | 取决于 canvas 合成/HDR 支持 | 是 |
| 平台 | 所有 Web/Electron | 需要 HDR 屏 + Chromium HDR 能力 | macOS + HDR 屏 |
| 集成方式 | 纯插件 | 插件内 WebGL/WebGPU 实验 | 原生 helper/覆盖层 |
| 工程量 | 已完成 | 中高 | 高 |
| 风险 | 低 | 高（API/合成器） | 高（原生集成/维护） |
| 用户可见收益 | 常规 SDR 观感 | 真高光（若成功） | 真高光，质量最高 |
| 回退 | 无 | 必须有 SDR 回退 | 必须有 SDR 回退 |

## 5. 测试矩阵

- 显示器：SDR、XDR/mini-LED、外接 HDR 显示器。
- 系统：macOS HDR 开/关、不同亮度、不同 SDR white 设置。
- 应用：浅色/深色、全屏/窗口、侧边栏折叠、多显示器移动。
- 内容：峰值 nits、色域、tone mapping、截图/录屏差异。
- 性能：GPU/CPU、功耗、风扇、长时间运行的烧屏风险。
- 回退：不支持时不得阻塞 UI，不得报错。

## 6. 参考

- [MDN: dynamic-range-limit](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/dynamic-range-limit)（HDR reference white、headroom、limited availability）
- [W3C ColorWeb-CG: HDR HTML Canvas proposal](https://raw.githubusercontent.com/w3c/ColorWeb-CG/e5bb8a46c32865fc61776b7ed85a1a17f135001a/hdr_html_canvas_element.md)（rec2100-pq/hlg、colorMetadata、float16、extended mode）
- [WebGPU canvas configuration](https://www.w3.org/TR/webgpu/#canvas-configuration)
- [Apple: CAMetalLayer.wantsExtendedDynamicRangeContent](https://developer.apple.com/documentation/quartzcore/cametallayer/wantsextendeddynamicrangecontent)
- [Apple: extendedLinearDisplayP3](https://developer.apple.com/documentation/coregraphics/cgcolorspace/extendedlineardisplayp3)
