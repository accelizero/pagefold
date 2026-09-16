# 拾页 · Pagefold 0.4.2

## 0.4.2 更新

主导航精简为工作空间、AI 分析和常用项目；统计收进工作空间，窗口、重复候选和布局恢复收进“更多整理工具”，本机连接位于“设置 → 连接 Codex”。

页面右侧新增直接关闭按钮，以及撤销关闭。固定页或播放中的页面需要确认；关闭记录仅保存在当前浏览器会话，最多 20 条。撤销会重新打开网址并尽量恢复位置和分类，无法恢复未保存的页面内容。

## 项目、AI 分析与有序活动

新增可编辑常用项目和细分、多标签 AI 分类、逐次活动报告、统计总览、可选 Chrome 历史导入、工具栏页数与可恢复的工作空间移除。[使用与范围说明](docs/projects-and-activities.md)。

一个本地优先的 Chrome 扩展，把散落在不同窗口的标签页重新组织成工作上下文。产品来自“Chrome窗口管理建议”的讨论，核心是允许窗口混乱存在，再通过全局视图、真实访问顺序与可审阅方案找回线索。

## Codex 直接接入

0.2 新增标准 MCP：Codex 可直接读取标签、时间线和指定网页正文，提交并应用整理方案，或恢复上次操作。使用 MCP 前需在自己的机器注册本机连接，并加载扩展。完整说明见 [docs/mcp.md](docs/mcp.md)。首次部署其他 Mac 可运行 `npm ci` 和 `npm run setup:mcp`。

## 直接体验

专用安装包 `pagefold-chrome-v0.4.2.zip` 解压后，直接选择解压出来的文件夹；其中顶层就有 `manifest.json`。源码包则选择内部的 `extension` 子文件夹。

本项目的 `extension` 文件夹就是可安装成品。浏览、记录与手动整理可独立运行；AI 分类与 MCP 需要本机 Node.js 服务。AI 分类调用你自行配置的模型服务（不内置服务商、地址或模型，详见 [配置说明](docs/ai-classification.md)），MCP 使用你当前的 Codex 对话。

1. 在 Chrome 地址栏打开 `chrome://extensions`，启用右上角“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择本项目的 **extension 文件夹**（其中有 manifest.json）。
3. 点击工具栏里的“拾页”，或按 `⌥ Shift P`。也可从 Chrome 侧边栏选择拾页。
4. 先查看工作空间；统计在工作空间内切换，窗口和重复候选在“更多整理工具”中，关联线索从 AI 分析页进入。需要整理时，修改名称或用每个页面右侧的下拉菜单调整归属，点击“预览整理方案”，最后应用。

也可先看网页演示：在项目目录运行 `npm start`，打开 [本地预览](http://127.0.0.1:4173)。网页演示使用虚构示例数据，操作与真实 Chrome 分离；顶部有明确的演示标识。演示数据保存在此站点本地存储，可在“设置”重置。

## 已实现

- 可读时间线：按秒显示访问顺序、项目归属、返回与分段原因；一分钟内短暂离开合并展示，长列表可以展开，手机可用。原始事件不改动。

- 全局搜索与跨窗口定位；完整工作台和窄屏侧边栏共用一个界面。
- AI 按项目和用途生成分类，参考上次方案和最近 300 条访问；不以物理窗口聚类。手动改名和归属在下次分析时保留。分析期间的手动编辑不会被迟到的结果覆盖。
- 编辑空间名称、增加空间、调整页面归属；方案保存在本地，同一浏览器会话中页面变化后也保留有效归属。
- 自动时间线：前台激活、聚焦、导航；离开 Chrome、120 秒空闲/锁屏、暂停记录或间隔超过 15 分钟时分段。不会把“窗口内活动但窗口处于后台”的标签算作真实前台访问。
- 完全相同网址的重复候选，默认全部保留；逐项选中后，应用方案时关闭。活动、播放声音、固定及浏览器内部页面不可作为关闭项。
- 仅已知追踪参数不同的候选单列，不自动关闭。保留 `ref`、其他查询参数、锚点与路径语义。
- 可审阅执行：每个非空空间新建窗口和同名标签组，跨窗口移动现有页面，保留固定页所在窗口。
- 最近一次操作恢复：窗口、顺序、固定状态、标签组名称/颜色/折叠、活动页与窗口位置。中途失败会保留恢复点。
- Agent 协作：标准 MCP 直接读取/处理；也可导出标题、完整网址和最近 1,500 条事件；导入 Agent 返回的 JSON，检查页面全集、唯一归属、固定页排除、布局是否过期和字段格式。导入不会执行整理，也不会接受 Agent 的关闭列表。
- 暂停、清空、导出时间线；原始事件保留最近 30 天，最多 12,000 条，另设约 4 MB 字节上限，先到上限者生效。

## 清楚的边界

这是可运行的 0.4 版。主入口“AI 更新分类”由本机服务调用模型 API，只写回预览；本地关键词建议作为备用。Codex 通过 MCP 按请求读取指定页正文并参与判断，也保留文件协作。通过 MCP 读取的内容会进入当前 Codex 对话并按所选模型服务处理。未实现扩展内的语义重复判定、自动归档、长期跨重启空间身份与跨设备同步。

时间线从安装后开始，不能补回安装前的完整标签切换历史。显示的时间跨度不是持续工作时长。只有最近一次恢复点；应用新方案会替换前一个。移动页面保留活标签；关闭副本后只能重新打开原网址，不能还原表单、滚动位置或网页内状态。浏览器重启后旧标签 ID 失效，会禁止自动恢复，仍可导出原布局与网址。用户后来新开的页面会保留，用户自行关闭的页面不会自动复活。

页面增删、移动或导航时会保留仍有效的分类；新增及导航后的页面进入“新增待分析”，去重选择清空。实际执行前仍会校验最新布局。当前版本执行多个 Chrome API 调用，无法让浏览器级操作成为原子事务；失败后应使用恢复记录，避免整理时同时拖动标签页。

## 数据与权限

扩展申请 `tabs`、`tabGroups`、`storage`、`sidePanel`、`idle`、`nativeMessaging`、`scripting`、`alarms` 以及 HTTP(S) 页面权限；`history` 是按需授权的可选权限。没有常驻内容脚本、远程脚本或扩展侧网络请求。正文仅在 MCP 请求时读取，表单值和可编辑草稿排除；标题、网址和正文可能包含私人信息。可在“设置 → 连接 Codex”中停用本机连接。无痕窗口禁用，其他扩展页面和非普通窗口排除。时间线与恢复记录使用 `chrome.storage.local`，当前浏览器会话身份使用 `chrome.storage.session`。卸载扩展会删除其本地数据。

## 开发与验证

```sh
npm ci
npm test
npx playwright install chromium
npm run test:e2e
npm start
```

可以设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向已有 Chrome for Testing 可执行文件。浏览器测试创建并删除独立临时配置，不连接个人 Chrome 配置。

- `tests/mcp.spec.js`：真实 MCP 客户端 → 本机程序 → Chrome 扩展，验证正文、整理、恢复与断连。
- `tests/bridge.test.js`：通信分帧、长度限制、固定身份与不改其他设置的安装器。
- `tests/core.test.js`：聚类覆盖、窗口独立性、去重保护、时间分段、过期方案、Agent 协议与容量上限。
- `tests/ui.spec.js`：搜索、改名持久化、改归属、去重选择、应用与恢复、Agent 错误校验、时间线、暂停和窄屏导航。
- `tests/extension.spec.js`：真实扩展后台与 Chrome API，包括跨窗口前台事件、移动活标签、关闭副本、恢复原组和顺序、保留后来新开的页面、故障注入后的恢复及重启拦截。

产品规格见 [docs/product.md](docs/product.md)，运行 `npm run package:extension` 可在 `artifacts/` 生成安装包；发布包见 GitHub Releases。

## API 依据

核对日期：2026-09-14。直接使用 Chrome 官方的 [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)、[Windows API](https://developer.chrome.com/docs/extensions/reference/api/windows)、[Tab Groups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups)、[Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) 与 [Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)。特别注意创建标签组时显式传入目标 `windowId`，以及标签 ID 只在当前浏览器会话中有效。

## 不接 API 也能用吗？

可以。只加载扩展即可使用全局搜索、跨窗口定位、手动创建和调整工作空间、重复候选检查、整理预览与应用、最近一次恢复、项目标签、基础统计、可暂停的切换线索及按需历史导入。无需 Node.js 或模型密钥。

在“设置 → 连接 Codex”的协作设置中点击“生成本地建议”，可以用关键词与时间线生成初步分组；它不具备模型的语义理解能力。AI 分类和活动解读需要模型 API。也可以连接 Codex 的 MCP，由当前 Codex 对话参与分析，无需给扩展另配模型 API，但仍需 Codex 服务与本机连接。

## 接入自己的模型 API（macOS）

1. 安装 Node.js，在完整源码目录运行 `npm ci` 和 `npm run setup:mcp`，然后重新加载扩展。安装器目前支持 macOS。
2. 在本机创建 `~/.config/pagefold/.env`，写入以下三项，替换示例值：

```dotenv
PAGEFOLD_API_KEY=replace-with-your-key
PAGEFOLD_BASE_URL=https://api.example.com/v1
PAGEFOLD_MODEL=your-model-id
```

3. 运行 `chmod 600 ~/.config/pagefold/.env`，然后点击扩展中的“AI 分析并更新”。

地址填写服务的 API 根地址，程序会追加 `/chat/completions`。服务必须使用 HTTPS，并兼容 Chat Completions、严格 JSON Schema 结构化输出及当前请求参数（包括 `reasoning_effort: low`）；并非所有兼容接口或模型都支持，接入后应先验证。示例域名不可直接使用，项目没有默认服务商或模型。

密钥仅放在本机文件，不要写进源码或提交到 GitHub。分析会将筛选后的页面线索发送给你配置的服务；未配置或请求失败时保留原方案。详细配置与数据范围见 [AI 分类说明](docs/ai-classification.md)。
