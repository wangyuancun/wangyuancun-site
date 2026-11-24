---
title: "Spring Boot 是怎么把 Agent「装」起来的？"
date: 2026-11-24T08:30:00+08:00
summary: "三个注解、五个步骤、一条 Bean 链——读懂 starter 到底替你做了什么。"
tags: ["AgentScope", "Spring Boot", "Java", "源码分析"]
wechatUrl: "https://mp.weixin.qq.com/s/8uHxfm_iuk0DQmflcbXggw"
cover: /images/blog/agentscope-spring-boot-autoconfig/cover.png
titleEn: "How Spring Boot Wires an Agent: Inside AgentScope's Auto-Configuration"
summaryEn: "Three annotations, five steps, one bean chain — what the starter actually does behind a few lines of application.yml."
featured: false
series: agentscope
seriesOrder: 1
---

## 写一个 Agent 很容易，把 Agent 装进项目很难

我最近在啃 AgentScope 的源码，越看越觉得有意思。

它的能力其实很清楚：给个模型、给个工具包、给个系统提示词，一个 `ReActAgent` 就能转起来——思考、调工具、再思考、出答案。核心逻辑就那么几行。

但真正落到工程里，问题立刻变了形状：

模型从哪里来？密钥写在哪？工具怎么注册？会话历史存哪儿？一个 Spring Boot 项目里几十个 Service 都在抢着要一个 Agent，谁负责把它 new 出来、配好、再交出去？

这已经不是“Agent 怎么思考”的问题了，而是**“Agent 怎么被装配”**的问题。

AgentScope 对这件事的分工很干脆，一句话：

> **Agent 怎么运行，去 `core` 找；Spring Boot 怎么把 Agent 装起来，去 `extensions` 找。**

`core` 是那个会思考的引擎，`extensions` 是一整套“适配宿主”的胶水层。Spring Boot 的自动装配，全部落在后者。

这篇文章只讲一件事：**当你只写了几行 `application.yml`，Spring Boot 在背后到底做了多少事。**

## 先记住这五个步骤

整套机制可以压缩成一句话：

> **找到自动配置类 → 读取配置 → 检查依赖 → 创建 Bean → 把各组件组装成 Agent。**

展开就是五个动作：

1. **找到它**：Spring Boot 启动时扫描一份清单文件，认出“这里有个自动配置类”；
2. **读配置**：把 `application.yml` 里 `agentscope.*` 的内容，绑到一个 Java 对象上；
3. **查依赖**：确认 classpath 里真的有 `ReActAgent` 这个类，没有就整段跳过；
4. **建 Bean**：条件全满足，才执行 `@Bean` 方法，把 `Memory`、`Toolkit` 交给容器；
5. **组装**：最后把 `Model` + `Memory` + `Toolkit` + 配置项，塞进 `ReActAgent` 的 builder，产出那个你真正会用的 Bean。

如果你只想要一个心智模型，记这句就够：**声明身份 → 接收配置 → 检查依赖 → 创建并组装**。

下面我们一个一个拆。

## 三个注解，其实是三句话

入口类是 `AgentscopeAutoConfiguration`。它的类头上只挂了三个注解：

```java
@AutoConfiguration
@EnableConfigurationProperties(AgentscopeProperties.class)
@ConditionalOnClass(ReActAgent.class)
public class AgentscopeAutoConfiguration {
    // ...
}
```

别看它短，这三行把“我是谁、我要什么、我什么时候才生效”全说完了。

| 注解 | 用大白话理解 |
| --- | --- |
| `@AutoConfiguration` | 这是一个自动配置类，里面定义了怎么装配对象 |
| `@EnableConfigurationProperties(...)` | 启用一个配置对象，用来承接外部配置 |
| `@ConditionalOnClass(...)` | 只有 classpath 里存在目标类，这套配置才生效 |

你可以把它想成“给项目装一个 AgentScope 插件”：先挂牌子，再领参数，最后验票进场。

### 3.1 @AutoConfiguration：让 Spring 认识它

它对着 Spring Boot 说的是：

> “这是一个自动配置说明，请在启动时处理这个类。”

没有这一句，Spring Boot 不会把它当成自动配置入口——类写得再漂亮，也只是一个躺在那儿没人调用的普通类。

### 3.2 @EnableConfigurationProperties：把 yml 变成对象

假设你的配置文件里写了：

```yaml
agentscope:
  agent:
    name: Assistant
    max-iters: 10
```

这个注解的意思是：

> “请把这些配置，读进 `AgentscopeProperties` 这个对象里。”

之后代码里就不用再去 `@Value("${...}")` 一个个抠字符串了，直接 `properties.getAgent().getName()`，类型安全、还能写注释、IDE 还能提示。

这里有个设计细节值得看一眼：`AgentscopeProperties` 是个**根对象**，下面挂了 `AgentProperties` 和 `ModelProperties` 两个子节点。

```java
@ConfigurationProperties(prefix = "agentscope")
public class AgentscopeProperties {
    private final AgentProperties agent = new AgentProperties();
    private final ModelProperties model = new ModelProperties();
}
```

这就是为什么你在 yml 里可以用 `agentscope.agent.*` 和 `agentscope.model.*` 这种层级写法——**配置的层级结构，是 Java 对象的字段结构映射过去的**。

### 3.3 @ConditionalOnClass：先确认“零件在不在”

它说的是：

> “只有项目里确实有 `ReActAgent` 这个类，才启用这套自动配置。”

这行是整个机制的**安全阀**。

想象一下：你只是引入了 AgentScope 的某个外围模块，`core` 根本没进来。如果这时 Spring 硬要执行 `new ReActAgent(...)`，那就是一句干脆的 `NoClassDefFoundError`，应用起不来。加了 `@ConditionalOnClass`，遇到这种情况它会安静地跳过——**不报错，只是不生效**。

这是 Spring Boot 生态里非常经典的一条原则：**自动配置要“善于缺席”**。存在就装配，不存在就当没这回事，绝不因为“我猜你可能需要”而把应用搞崩。

### 3.4 补一个很多人漏掉的环节：清单文件

`@AutoConfiguration` 只是给类贴了标签。Spring Boot 启动时不会把整个 classpath 扫一遍找标签——那样太慢了。

它读的是一份**约定路径下的清单**：

```
META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

里面一行一个全限定类名。这个 starter 的所有自动配置类，都在这份文件里排队登记。

所以真实链路是：**清单文件登记 → 类上的注解声明 → 条件判断 → Bean 注册**。

如果你自己写过 starter 却发现配置死活不生效，八成不是注解写错了，而是忘了往这份文件里加一行。这是我踩过的坑，写在这儿给后来人省点时间。

## 真正干活的，是那几个 @Bean

三个注解只解决“要不要启用”。**对象是谁 new 出来的，还得看 `@Bean` 方法。**

`AgentscopeAutoConfiguration` 里提供了三个 Bean，逻辑非常干净：

```java
@Bean
@ConditionalOnProperty(prefix = "agentscope.agent", name = "enabled", havingValue = "true")
@ConditionalOnMissingBean
@Scope(ConfigurableBeanFactory.SCOPE_PROTOTYPE)
public Memory agentscopeMemory() {
    return new InMemoryMemory();
}

@Bean
@ConditionalOnProperty(prefix = "agentscope.agent", name = "enabled", havingValue = "true")
@ConditionalOnMissingBean
@Scope(ConfigurableBeanFactory.SCOPE_PROTOTYPE)
public Toolkit agentscopeToolkit() {
    return new Toolkit();
}
```

前两个很朴素：给了个默认的内存实现 `InMemoryMemory`，给了个空的 `Toolkit`。都是“先给你一个能跑的默认值，不满意你自己换”。

第三个才是主角：

```java
@Bean
@ConditionalOnMissingBean
@ConditionalOnBean(Model.class)
@ConditionalOnProperty(prefix = "agentscope.agent", name = "enabled", havingValue = "true")
public ReActAgent agentscopeReActAgent(
        Model model,
        Memory memory,
        Toolkit toolkit,
        AgentscopeProperties properties) {

    AgentProperties config = properties.getAgent();

    return ReActAgent.builder()
            .name(config.getName())
            .sysPrompt(config.getSysPrompt())
            .model(model)
            .toolkit(toolkit)
            .maxIters(config.getMaxIters())
            .build();
}
```

注意这个方法的参数列表——**装配关系全写在这儿了**：

- `Model` 从容器里拿（由模型相关的 starter 提供）；
- `Memory`、`Toolkit` 从容器里拿（上面那两个 Bean）；
- `AgentscopeProperties` 从容器里拿（`@EnableConfigurationProperties` 注册的那个）。

然后新对象的三个关键部位——名字、人格、最多想几轮——全部从配置里读；模型和工具包，直接从容器里注进来。

**这就是“组装”的意思**：不是自己造零件，而是把容器里现成的零件按正确的方式拧在一起。

对应到 yml，你只需要写这么多：

```yaml
agentscope:
  agent:
    enabled: true
    name: Assistant
    sys-prompt: You are a helpful AI assistant.
    max-iters: 10
  model:
    provider: dashscope
  dashscope:
    api-key: ${DASHSCOPE_API_KEY}
    model-name: qwen-plus
```

一行 Java 代码都不用写，`ReActAgent` 就在容器里等着你 `@Autowired` 了。

## 五个源码级的坑，官方注释里都写着

上面是“顺利路径”。但真实的自动装配，麻烦大多出在条件判断上。以下五点，是我读源码时觉得最值得记下来的。

### 坑 1：`enabled` 必须显式写 true

`@ConditionalOnProperty` 这里是这么写的：

```java
@ConditionalOnProperty(prefix = "agentscope.agent", name = "enabled", havingValue = "true")
```

**没有 `matchIfMissing = true`。**

意思是：即使你的 Java 配置类里字段默认值是 `true`，只要 `application.yml` 里没出现 `agentscope.agent.enabled=true` 这一行，条件就不成立，三个 Bean 一个都不会注册。

第一次用很容易卡在这儿：代码没错、依赖没错、启动也不报错，就是注入不到 Agent。原因往往就是**那个 `enabled` 忘了写**。

### 坑 2：谁先谁后，是有讲究的

第三个 `@Bean` 上有一个容易被忽略的注解：`@ConditionalOnBean(Model.class)`。

翻译过来：**容器里得先有一个 `Model`，我才会创建 Agent。**

而 `Model` 不是核心 starter 造的，是模型 starter（DashScope / OpenAI / Anthropic …）造的。所以顺序不能乱。官方在模型侧的自动配置类上明确加了这一句：

```java
@AutoConfiguration(before = AgentscopeAutoConfiguration.class)
```

**模型先装配，Agent 后装配。** 顺序反了，`@ConditionalOnBean(Model.class)` 判断时容器里还空着，Agent 就被静默跳过。

这也是为什么“没配 API Key 就起不来”这个现象看起来那么粗暴：模型 Bean 创建失败 → Agent 的条件不成立 → 整条链断在源头。

### 坑 3：`@ConditionalOnMissingBean` 是一张“让位声明”

三个 `@Bean` 上都有它。它的语义是：

> “如果用户自己已经定义了这个类型的 Bean，我就退位，不跟你抢。”

这条规则决定了 starter 的定位：**默认值提供者，而不是唯一答案**。

想换成 Redis 存会话？自己写一个 `Memory` Bean，starter 那个 `InMemoryMemory` 自动消失。想让 Agent 用你自己的工具集？自己 `new Toolkit()` 注册好，官方那个空的就让开。

这是 Spring Boot 生态里很优雅的一条约定：**约定优于配置，但配置永远赢**。

### 坑 4：prototype 注入 singleton，只生效一次

这个坑跟 Agent 没直接关系，但在这里格外致命。

`Memory` 和 `Toolkit` 被声明为 `SCOPE_PROTOTYPE`——每次注入都建一个新实例。原因很实在：**它们是有状态、且非线程安全的**。`Memory` 装着对话历史，`Toolkit` 装着工具注册表，做成单例，并发请求就会互相踩。

但 `ReActAgent` 是单例。而 Spring 创建单例的时候，只会把 prototype 依赖**取一次就固定住**。之后这个单例被复用一万次，它手里那个 `Memory` 还是最初那一个。

“prototype 注入 singleton 只生效一次”——这不是 bug，是 Spring 作用域的基本规则。官方源码的 Javadoc 里对此写得很直白：这两个对象非线程安全，Web 环境下建议用 `ObjectProvider` 或方法注入，**每次懒取新实例**。

### 坑 5：单例 Agent，怎么服务成千上万个用户？

既然 Agent 是单例、`Memory` 又有状态，那多用户会话怎么隔离？

答案是：**状态不放在 Agent 身上**。

Agent 实例本身做成无状态的执行器，每次调用时把身份信息通过 `RuntimeContext` 传进去（`userId`、`sessionId`），状态按 `(userId, sessionId)` 落到 `AgentStateStore`。

> `RuntimeContext` 就是这一轮 Agent 任务的“运行时身份包”。Harness 拿着它，在 ReAct 推理之外，自动给 KV、文件工作区、沙箱切出独立空间，实现 user / session 两个维度的隔离——而推理内核一行都不用改。

`ReActAgent` 的 builder 不会替你配 stateStore，不设置就是纯内存，重启即丢；本地文件版的 `JsonFileAgentStateStore` 是 `HarnessAgent` 的内置默认后端，单机跑 Demo 够用。上了集群，记得换成 Redis 之类的分布式实现，否则多副本之间会话对不上。

顺带一个细节：在 2.0 的源码里，`InMemoryMemory` 已被标记为 `@Deprecated(forRemoval = true)`，仅为兼容 1.x 保留；`ReActAgent.builder()` 里其实也没有 `.memory(...)` 可调。会话状态的正经载体是 `AgentStateStore`。所以那个注入进来的 `Memory` 参数，更像是一个**兼容位**——读源码时看到“注入了却没用上”，别怀疑自己看错了。

## 自动装配给你的，是「能跑」，不是「能上线」

到这里，`ReActAgent` 已经能在你的 Spring Boot 项目里跑起来了。但有必要泼一点冷水：

**starter 自动装配出来的，是“最小可用”，不是“生产可用”。**

两者的差距，就在 `ReActAgent` 和 `HarnessAgent` 之间。它们底下是同一套推理循环——`Harness` 并没有改变 Agent 怎么思考，只是在每一轮 ReAct 开始前、结束后，用中间件和 Hook 挂了一层工程能力：

| 能力 | ReActAgent（裸核心） | HarnessAgent（生产版） |
| --- | --- | --- |
| 模型调用、工具调用 | 有 | 有（同一套） |
| 单次对话上下文 | 有 | 有 |
| 会话持久化、重启恢复 | 需自己接 | 自带 |
| 上下文自动压缩 | 无 | 自带 |
| Workspace 工作区 | 无 | 自带 |
| 子 Agent 编排 | 无 | 自带 |
| 沙箱隔离、权限审核 | 无 | 自带 |
| 技能沉淀、跨会话复用 | 无 | 自带 |

一个类比：`ReActAgent` 是裸发动机，能转，但没有油箱、没有冷却、没有行车电脑；`HarnessAgent` 是整车，发动机还是那台，但辅助系统全配齐了。

所以选型其实很简单：

- **写 Demo、验证一次工具调用、只想搞懂 ReAct 逻辑** → `ReActAgent`，自动装配开箱即用；
- **要连续多轮对话、要记住历史、要开子 Agent、准备部署上线** → `HarnessAgent`，自己在 `@Configuration` 里显式声明 `@Bean`。

而且这个迁移是平滑的：因为推理逻辑没变，业务提示词和工具代码都不用动，你只是从“用自动配置的快捷入口”，换成“自己装配一套生产底座”。

**自动装配负责让你 5 分钟看到效果；能不能上线，取决于你在它之上补了多少工程件。**

## 收个尾

回头看，AgentScope 在 Spring Boot 里做的事，其实可以用一句话说完：

> **它把“创建一个 Agent”从一段命令式代码，变成了一组声明式条件。**

你声明“我要一个叫 Assistant、最多想 10 轮的 Agent”，声明“我有 DashScope 的 Key”，剩下的——什么时候建、依赖谁、缺什么就跳过、用户想换就让他换——全部交给条件注解去裁决。

这套机制并不神秘，甚至有点朴素。但它解决了工程里最烦的那类问题：**让框架知道该在什么时候出现，也知道该在什么时候闭嘴。**

最后留一份自检清单，给正在接 AgentScope 的你：

1. `agentscope.agent.enabled=true` 写了吗？（没写，三个 Bean 都不会来）
2. 模型 starter 在了吗？`Model` Bean 有了吗？（`@ConditionalOnBean` 在等它）
3. 自定义 Bean 覆盖成功了吗？（成功的话，官方那个应该已经退位）
4. `Memory` / `Toolkit` 是在单例里被固定住了，还是每次懒取？（后者才安全）
5. 上集群了吗？（上了就把 `JsonFileAgentStateStore` 换掉）
6. 真的要上线吗？（换成 `HarnessAgent`，把持久化、压缩、沙箱补齐）

一条一条对下来，比读十遍文档都管用。

*环境说明：本文基于 AgentScope Java 2.1.0-SNAPSHOT（main 分支）的 `agentscope-extensions/agentscope-spring-boot-starters` 源码，JDK 17+。不同版本的 Bean 定义和配置项可能有微调，具体以你锁定的版本源码为准。*
