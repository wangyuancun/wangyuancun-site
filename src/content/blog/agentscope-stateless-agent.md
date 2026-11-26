---
title: "无状态 Agent：状态按会话存取"
date: 2026-11-26T08:30:00+08:00
summary: "Agent 不把状态绑在实例上，每次用 (userId, sessionId) 换一份 AgentState；四组对照实验加重启测试，验证状态到底存在哪。"
tags: ["AgentScope", "Agent", "Java", "源码分析"]
wechatUrl: "https://mp.weixin.qq.com/s/yt36WZ80W10Hk0WlYJU7mg"
cover: /images/blog/agentscope-stateless-agent/cover.png
titleEn: "A Stateless Agent: State Stored and Loaded per Session"
summaryEn: "The agent keeps no state on the instance. Each call trades (userId, sessionId) for an AgentState — proven by four controlled experiments and a restart test."
featured: false
series: agentscope
seriesOrder: 2
---

## 一句话结论

Agent 不把状态绑在自己这个实例上；它每次都用 `RuntimeContext` 里的 `(userId, sessionId)` 去仓库换一份 `AgentState` 出来干活，干完再存回去。

这就是“**逻辑无状态 + 按会话存取状态**”。

“逻辑无状态”这五个字不能省。`ReActAgent` 实例上按会话槽位缓存了 `AgentState`、版本号和权限引擎（`stateCache` / `slotVersions` / `permissionEngineCache`），所以它不是“什么都不记”；准确说法是：**状态不属于 Agent 这个共享实例，而属于 `(userId, sessionId)` 这个槽位**，缓存只是为了避免每次都反序列化。

## 两个核心对象

| 对比项 | RuntimeContext | AgentState |
|---|---|---|
| 角色 | 一次请求的“信封 + 钥匙” | 某个会话长期保存的“档案” |
| 生命周期 | 一次 `call()`，用完即弃 | 跨请求，可持久化 |
| 是否序列化 | 否 | 是：`implements State`，Jackson 通过 `@JsonCreator` + `@JsonProperty` 把 snake_case 字段名映射到构造器；类上另有 `@JsonPropertyOrder` 控制输出顺序 |
| 关键内容 | `sessionId`、`userId`（main 分支 / 2.1.0-SNAPSHOT 另有 `threadId` / `turnId` / `runId`）、临时属性、工具执行上下文、指向档案的引用 | 对话记录 `context`、摘要 `summary`、权限、工具状态、任务、计划 |
| 类比 | 快递单 / 号码牌 | 档案柜里的档案 |

代码位置：

- RuntimeContext：`agentscope-java/agentscope-core/src/main/java/io/agentscope/core/agent/RuntimeContext.java`
- AgentState：`agentscope-java/agentscope-core/src/main/java/io/agentscope/core/state/AgentState.java`

```java
// RuntimeContext.java:41-59（main，节选：省略了字段间的注释与其余字段）
private final String sessionId;
private final String userId;
private final String threadId;   // (main)
private final String turnId;     // (main)
private final String runId;      // (main)
private volatile AgentState agentState;   // 只是指向档案的引用
```

```java
// AgentState.java:60-71（main，节选：省略了 threadId、replyId、shutdownInterrupted）
private final String sessionId;
private final String userId;
private String summary;
private final List<Msg> context;          // 完整对话记录
private int curIter;
private PermissionContextState permissionContext;
private final ToolContextState toolContext;
private final TaskContextState tasksContext;
private final PlanModeContextState planModeContext;
```

> 省略说明：main 的 `AgentState` 实际还有 `threadId`、`replyId`、`shutdownInterrupted` 三个字段，其中 `threadId` 说明键空间已不止 `(userId, sessionId)`。

## 为什么两边都要有 sessionId / userId

| 位置 | 作用 |
|---|---|
| RuntimeContext 里的 | 查询键：拿去 `AgentStateStore` 找“这个用户这个会话的档案” |
| AgentState 里的 | 档案编号：持久化后能自证归属，取出来知道还给谁 |

```java
// ReActAgent.java:760（main）
stateStore.save(userId, sessionId, entry, toSave);
```

> 该行是 `stateStore` 不支持版本化时的直接写入分支；支持版本化时会用 `saveIfVersion(..., expectedVersion)` 做 CAS，冲突再按 `ConflictPolicy` 处理。完整机制见后文「收益与前提」。

关键约束：要存进仓库的东西，只能抄“值”，不能留“引用”。

硬约束是**序列化边界**：`AgentState` 要被转成 JSON 存进 Redis / 数据库，而 JSON 只能表达字符串、数字、列表这类值，表达不了“内存里某个对象的地址”。就算被引用的对象活得很久，反序列化时也没法把一个地址还原回原来的对象。生命周期只是让这件事更难成立——`RuntimeContext` 是一次请求里临时创建的对象：

```java
public String chat(...) {
    RuntimeContext ctx = RuntimeContext.builder()...build();   // 创建
    agent.call(message, ctx).block();
    ...
}   // ← 方法返回，ctx 就没人引用了
```

请求一结束它就被回收了。如果 `AgentState` 里存的是 `RuntimeContext`，等从 Redis 里取档案时，那个对象早就不存在了。

所以 `AgentState` 只能把需要的信息抄成普通字符串存下来：

```java
// ❌ 不行：留的是引用，跨序列化边界后无法还原
class AgentState { RuntimeContext ctx; }

// ✅ 可行：把值抄一份存进来
class AgentState { String sessionId; String userId; }
```

一个只活几毫秒的对象，不能成为活几个月的数据的一部分。

## 一次请求的完整数据流

![图1：一次请求的完整数据流](/images/blog/agentscope-stateless-agent/dataflow.png)

*钥匙在这次请求里，档案在仓库里：按 `(userId, sessionId)` 取出，干完活再存回。*

> main 上这张图需要微调：读档案的入口是 `ThreadKey`（含 `agentId` 与 `threadId`），且启用 journal 时状态来自 committed log 的 detached working copy，而非单个快照文件。

## 为什么不能直接问 Agent 要状态

`ReActAgent` 是单例 Bean，所有请求共用一个实例；而无参的 `getAgentState()` 固定走默认会话：

```java
// ReActAgent.java:5939（main；该重载已标注 @Deprecated）
@Deprecated
@Override
public AgentState getAgentState() {
    return getAgentState(null, defaultSessionId);
}
```

> main 上 `getAgentState()` 在 5939 行，6080 行是清理本地缓存的注释块。该方法已标 `@Deprecated`，注释原文为 "delegates to the default session slot"；2.0.x 尚未标注。

并发场景下，工具或中间件里调用它，可能拿到别人会话的档案，导致对话串台。

`RuntimeContext.java:56` 附近的注释给出了框架自己的说法：

```java
// 原文：... instead of agent.getAgentState(), which is not call-scoped under concurrency
// 意思：并发时，Agent 自己记的那份状态不属于“当前这次请求”，要用 RuntimeContext 上的那份
```

规则：状态要跟着“这一次请求”走，不能跟着“Agent 这个共享实例”走。

| 说法 | 实际指的东西 | 为什么 |
|---|---|---|
| “跟着请求走” | 用这次请求传进来的 `RuntimeContext.getAgentState()` | 每次请求各有一份，互不干扰 |
| “不能跟着服务对象走” | 不要用 `reActAgent.getAgentState()`（单例，只有一份默认状态，且 main 上已废弃） | 所有请求共用，会拿到别人的档案 |

## 实验验证：四组对照

四组实验分别验证：工具是否真的执行、同会话能否复用历史、记忆是否按会话隔离、不给 `sessionId` 时落到哪里。凡允许调用方指定会话键的工程，都能按下面的契约重跑。

### 装置条件

| 条件 | 为什么必须有 | 不满足的后果 |
|---|---|---|
| HTTP 接口接受调用方传入的 `sessionId`，并用它构建 `RuntimeContext` | “同一会话 / 不同会话”是四组实验唯一的自变量 | 若服务端每次 `UUID.randomUUID()` 新建 session，四组实验全部退化成“每次新会话”，记性实验必然失败 |
| 两个有可观测副作用的本地工具（如 `now` 返回时间戳、`add` 返回和） | 要区分“模型凭记忆答出”和“工具真的执行了” | 只有硬编码返回值的工具时，无法从答案判断工具是否调用 |
| `AgentStateStore` 可替换（内存 ↔ `JsonFileAgentStateStore`） | 「持久化实验」靠「换存储 + 重启」证明 | 只测内存存储，证明不了记忆落在外部 |

### 接口契约骨架

```java
@GetMapping("/api/chat")
public Mono<Map<String, String>> chat(
        @RequestParam String message,
        @RequestParam(required = false) String sessionId) {   // 关键：会话键由调用方控制
    RuntimeContext ctx = RuntimeContext.builder()
            .sessionId(sessionId)   // 允许为空，为空时框架回落到 defaultSessionId
            .userId("alice")
            .build();
    return agent.call(message, ctx)
            .map(reply -> Map.of("answer", reply.getTextContent()));
}
```

`sessionId` 直接透传，不要在 Controller 里替它生成随机 UUID——否则“不给 sessionId”就变成每次一个新会话，前文「为什么不能直接问 Agent 要状态」说的默认会话回落机制就观察不到了。也不必手动 `agentState(...)` 塞一份空档案：call 入口会按会话键加载槽位状态并写回 `ctx`，手动塞的会被覆盖。

工具骨架（两个即可，输出带可辨识标记）：

```java
@Tool(name = "now", description = "Return the current time")
public String now() { return LocalDateTime.now().toString(); }

@Tool(name = "add", description = "Add two integers")
public int add(@ToolParam(name = "a") int a, @ToolParam(name = "b") int b) { return a + b; }
```

### 四组对照实验

统一用 `curl -sG ... --data-urlencode` 发请求，避开中文参数的 URL 编码问题。

| 编号 | 要验证的命题 | 操作 | 观察点 | 判读 |
|---|---|---|---|---|
| E1 | 工具结果不跨请求复用 | 不带 `sessionId`（落到同一默认会话），连问两次“现在几点” | 两次事件流里是否都有 `TOOL_CALL_START` | 都有 → 工具仍被执行；与 E2 对照可见，是否再调工具取决于问题性质，不是框架去重 |
| E2 | 同会话内可利用历史 | `sessionId=calc`，先问“3 加 5 等于几”，再问“刚才 3 加 5 等于几” | 第二次是否跳过 `add` 调用 | 跳过 → 模型从 context 读到结果；这是模型判断，不是框架去重 |
| E3 | 记忆按会话保存 | `sessionId=abc`，先说“我叫小王”，再问“我叫什么” | 是否答出“小王” | 答出 → 同一槽位共享档案 |
| E4 | 换键即换档案 | `sessionId=xyz` 问“我叫什么”；再补一组：全程不带 `sessionId`，先说“我叫小王”再问 | `xyz` 答不出；不带 `sessionId` 那组能答出 | 后者证明“不给 session”是回落到 `defaultSessionId` 的默认槽位，不是新建档案 |

```bash
# E1：不给 sessionId，落到同一默认会话连问两次
curl -sG "http://localhost:8080/api/chat" --data-urlencode "message=现在几点"
curl -sG "http://localhost:8080/api/chat" --data-urlencode "message=现在几点"

# E2：同一 session 两轮（用独立会话键，避免与 E3 互相干扰）
curl -sG "http://localhost:8080/api/chat" --data-urlencode "message=3 加 5 等于几" --data-urlencode "sessionId=calc"
curl -sG "http://localhost:8080/api/chat" --data-urlencode "message=刚才 3 加 5 等于几" --data-urlencode "sessionId=calc"

# E3：同一 session 两轮
curl -sG "http://localhost:8080/api/chat" --data-urlencode "message=我叫小王" --data-urlencode "sessionId=abc"
curl -sG "http://localhost:8080/api/chat" --data-urlencode "message=我叫什么" --data-urlencode "sessionId=abc"

# E4：换一个 session
curl -sG "http://localhost:8080/api/chat" --data-urlencode "message=我叫什么" --data-urlencode "sessionId=xyz"

# E4 补充：全程不给 sessionId
curl -sG "http://localhost:8080/api/chat" --data-urlencode "message=我叫小王"
curl -sG "http://localhost:8080/api/chat" --data-urlencode "message=我叫什么"
```

### 判读标准

- **以事件流为准，不以答案文本为准**：出现 `TOOL_CALL_START` / `TOOL_CALL_END` 才算工具真执行；答案里出现“8”也可能是模型推算的。
- **E1、E2 是观察，不是保证**：真实模型有随机性，换措辞或调温度可能得到相反结果。它们说明“这次发生了什么”，不是框架层机制。
- **E4 的补充组比主组更有说服力**：它能区分“新会话”和“默认会话”这两种解释。
- 结论应写成“**会话键不同，档案不同**”，而不是“不给 session 就新建一份档案”。

## 持久化实验：重启不失忆

思路：把“记忆在不在外部”变成一个可证伪的操作——**换存储实现 + 真正杀掉进程 + 用同一个 sessionId 再问**。若仍答得出，说明记忆不在进程内存里。

```java
@Bean
ReActAgent demoAgent(Model model, Toolkit toolkit) {
    return ReActAgent.builder()
            .name("DemoAssistant")
            .model(model)
            .toolkit(toolkit)
            .stateStore(new JsonFileAgentStateStore(Paths.get(".agentscope", "state")))
            .build();
}
```

| 步骤 | 操作 | 期望结果 | 这一步排除什么 |
|---|---|---|---|
| 1 | `sessionId=abc` 说“我叫小王” | 记住 | — |
| 2 | `kill` 进程，确认端口释放后重新启动 | 内存清空 | 排除“进程内存仍在” |
| 3 | `sessionId=abc` 问“我叫什么” | 仍答“小王” | 证明状态来自外部存储 |
| 4 | `sessionId=xyz` 问“我叫什么” | 答不出 | 排除“模型记住了 prompt / 全局只有一份记忆” |

第 4 步不能省：只做第 3 步，无法排除“答案来自模型或全局状态”。

磁盘检查：

```bash
$ find .agentscope/state -type f
.agentscope/state/alice/abc/agent_state.json
.agentscope/state/alice/xyz/agent_state.json
```

`agent_state.json` 顶层字段就是 `AgentState`：`session_id`、`user_id`、`summary`、`context`、`tool_context` 等（main 上还多一个 `thread_id`）。

这是 `threadId=main` 时的布局；新版本上其他线程的 `agentId` / `threadId` 会被编进状态 key，写成 `thread.<agentId>.<threadId>.<component>.json` 这样的平铺文件。

重启前务必确认旧进程已退出：`JsonFileAgentStateStore` 的锁只在 JVM 内生效，不跨进程（见「收益与前提」）。

结论：Agent 逻辑无状态，记忆全在外部存储；换掉 `AgentStateStore` 就等于换了记忆的介质。

## 收益与前提

**收益：**

- 逻辑无状态 → Agent 不在实例上保存某一份全局状态；只要存储层允许，任意副本都能进入任意会话。
- 状态集中在 `AgentState` → 可替换存储：内存 / 文件 / Redis / MySQL / 对象存储，换实现即可。
- 按 `(userId, sessionId)` 隔离 → 多会话互不干扰；多租户还要靠 `userId` 这一维。
- 可持久化 → 进程重启后能接着聊。

**但有两个前提：**

1. **并发写必须有版本控制。** `AgentStateStore` 定义了 `UNVERSIONED` 常量和 `supportsVersioning()` / `getVersioned()` / `saveIfVersion()` 三个方法，`ReActAgent` 用 `slotVersions` 记录槽位版本；冲突时按 `ConflictPolicy` 处理，共三种策略：`OVERWRITE`、`FAIL`、`APPEND_MERGE`，并以 `stateConflictCount` 计数。缺了这层，两个副本同时写同一会话就会丢更新。
2. **文件存储不支持跨进程。** 「持久化实验」用的 `JsonFileAgentStateStore` 只靠 JVM 内的 `ReentrantLock` 保护同一个 session 目录，源码注释明确写着锁不跨进程："a session must be owned by one process at a time"，跨进程共享会话应改用数据库实现的 `AgentStateStore`。

所以“任何副本都能处理任何请求”要加限定语：**同一时刻该会话只能有一个进程持有**。文件存储不满足多副本并发；“滚动发布后接着聊”同样以旧进程释放会话、新进程接管为前提。

这正是 AgentScope 能“恢复会话”的根本原因——无状态只解决了“状态在哪”，真正让多副本安全工作的，是外部存储的版本控制与并发策略。
