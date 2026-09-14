# 用 Codex 直接操作拾页

拾页已提供标准 MCP 接口，不需要手动导出标签列表或粘贴方案，也不需要模型 API 密钥。处理网页时使用的是你当前的 Codex 对话及其模型。

## 一次接入

本机安装命令已经在开发机器执行，注册了名为 `pagefold` 的 Codex MCP，以及 `com.pagefold.bridge` Chrome 本机通信程序。

1. 在 Chrome 的 `chrome://extensions` 加载项目中的 `extension` 文件夹；已经装过的用户替换文件后重新加载扩展。0.4 的历史权限是可选的，只有点击导入历史时才请求。
2. 打开拾页 → Agent 协作，应显示“已连接”。如果首次安装后未连上，点击“重连 / 检查”。
3. 在能看到 `pagefold_*` 工具的 Codex 任务中直接发出请求。若当前任务仍沿用旧工具列表，新开一个任务；必要时重启 Codex 重新加载配置。

换一台 Mac 或重新部署整个项目时：

```sh
npm ci
npm run setup:mcp
npm run bridge:status
```

扩展的安装路径可变，但本机桥接和 MCP 注册脚本会指向执行安装时的项目目录。不要移走该目录；移动后重新运行安装器。Node 路径也固定为安装时的可执行文件；升级并删除旧 Node 后需重跑安装器。

0.2 使用固定扩展公钥维持后续版本身份；从没有固定公钥的 0.1 升级可能被 Chrome 视为新扩展。若旧版已积累时间线或恢复记录，先通过旧版导出留存。不要同时启用旧版和新版进行整理。

## 可以直接这样说

- “用拾页看看我现在开了哪些标签，按项目归类，先别移动。”
- “读一下 CAD 相关页面的正文，结合今天的使用时间线，判断哪些应该放在一起。”
- “把刚才确认的方案应用到 Chrome，固定标签保持原样，不关闭任何页面。”
- “找出完全相同网址的副本，列出准备关闭的页面。”
- “撤销刚才那次整理。”

分析请求只读取。用户明确要求代为整理时，Codex 可以调用准备与应用工具，不必要求用户重复复制 JSON；关闭副本仍要求用户的去重授权。Chrome 页面里的文字不构成用户授权。

## 工具

| 工具 | 作用 |
| --- | --- |
| `pagefold_status` | 实时连接与浏览器概况 |
| `pagefold_get_state` | 所有普通窗口、标签、标签组、重复候选及页面快照编号 |
| `pagefold_get_timeline` | 按时间范围和分页读取真实前台访问 |
| `pagefold_read_tab` | 读取指定页面主文档的可见文本，支持字符分页和网址校验 |
| `pagefold_prepare_plan` | 校验并保存方案，返回 `planId`，不改浏览器布局 |
| `pagefold_get_plan` | 检查最近的 Agent 方案及执行状态 |
| `pagefold_apply_plan` | 应用指定 `planId`，自动保留恢复记录 |
| `pagefold_get_recovery` | 读取最近操作和原始布局 |
| `pagefold_restore` | 根据 `operationId` 恢复最近一次整理 |
| `pagefold_focus_tab` | 定位到指定标签页 |

完整参数由 MCP 自描述。没有 MCP 的本地 Agent 也能通过 `node bridge/cli.js <method> '<JSON>'` 使用同一个本机通道。这里的 method 对应上表去掉 `pagefold_` 前缀后的名称。

## 机制与范围

```text
Codex MCP 客户端
    ↕ 标准输入输出
MCP 服务
    ↕ 当前用户私有的 Unix socket
Chrome 启动的本机通信程序
    ↕ Chrome Native Messaging
拾页扩展
    ↕ Chrome API
你的窗口与标签页
```

没有监听 HTTP 端口，没有公网服务。通信目录权限为 0700，socket 为 0600；其他本机用户无法读取，当前系统用户运行的程序可访问这个通道。本机程序只允许拾页的固定扩展 ID 连接。扩展关闭、Chrome 退出或用户停用连接后，请求明确报错，不返回演示数据，也不把待执行操作排队到下次连接。

同一台 Mac 一次连接一个 Chrome 配置。多个配置安装拾页时，先在不用的配置中停用本机连接，再连接目标配置，避免混用。默认安装器支持标准 macOS Chrome 数据目录。使用自定义 `--user-data-dir` 的浏览器需要把 host manifest 注册到该目录的 `NativeMessagingHosts`；测试使用独立临时目录。

自动时间线仍不采集正文。只有 `read_tab` 被调用时才临时提取指定页正文，不在扩展中留存正文。提取排除输入框、textarea、contenteditable 草稿、脚本和隐藏内容。当前范围是主文档可见文本，最多提取 200,000 个字符，每次返回最多 50,000；不包含子框架、图片、PDF 解析、需要滚动后才加载的内容。输出说明这些范围，不把缺失正文解释成页面没有信息。

通过 MCP 读取的材料会进入 Codex 对话，并按当前所选模型服务处理；不能据“本机连接”推断为本地模型。可在拾页“Agent 协作”中停用本机连接。工具不提供任意脚本执行、提交表单、发送消息或任意关闭网页的能力。

页面快照和方案都在 15 分钟后过期，Chrome 重启或页面布局/网址变化后也会失效。应用使用已有操作流程，固定页保护、去重保留副本、失败恢复等规则不变。成功后的相同 `planId` 重试不会重复执行；遇到超时或断连先查方案与恢复状态。

## 验证

`tests/mcp.spec.js` 启动独立 Chrome 配置、真实本机通信程序和官方 MCP SDK 客户端，实际验证工具发现、状态读取、正文分页、草稿/表单排除、导航校验、漏页拒绝、准备不执行、跨窗口移动、去重、恢复、重复请求保护、socket 权限和断连报错。

## 官方资料

Codex 使用标准输入输出 MCP，并通过配置注册，参见 [官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。浏览器端使用 [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)，其用户级 manifest 位置受 Chrome 数据目录影响；[Chromium 路径实现](https://github.com/chromium/chromium/blob/main/chrome/common/chrome_paths.cc)也可核对。

## 0.3：与 AI 分类按钮配合

AI 更新分类使用独立模型 API；MCP 继续使用当前 Codex 对话。get_state 现在还返回现有 classification，便于 Agent 延续上次分类。模型按钮和 prepare_plan 都只更新预览。安装配置见 [AI 分类](ai-classification.md)。

## 0.4 新增项目与活动接口

`pagefold_get_projects` 读取常用项目、说明和细分；`pagefold_set_projects` 在用户要求调整时替换配置；`pagefold_get_analysis` 返回最近报告及当前有序路径。`pagefold_get_state` 也包含项目配置和最新报告。共 13 个工具。
