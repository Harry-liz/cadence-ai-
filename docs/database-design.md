# Cadence AI Database Baseline

## 当前概览

当前这版数据库 baseline 已经支持一条完整闭环：

1. frontend 携带 `user_id` 和 `session_id` 发起请求
2. backend 提供 `chat`、`dining`、`plan` 三条主功能链路
3. operational tables 记录消息、事件和结果快照
4. rollup 派生出 summaries、preferences、profiles、memories
5. Agent1 再读取这些整理后的用户上下文，做轻量个性化

## 当前分层

### 在线 Baseline

当前已经在实际使用：

- 商场业务数据：`malls`、`floors`、`venues`、`offers`、`events`
- 身份与会话：`users`、`sessions`
- 运行历史：`messages`、`interaction_events`、`recommendation_results`、`plan_results`、`feedback`

### 用户记忆闭环

这些表由 rollup 写入，并已回流给 Agent1 使用：

- `session_summaries`
- `user_profiles`
- `user_preferences`
- `agent_memories`

当前规则：

- `chat`、`dining`、`plan` 都可以参考这部分历史
- 如果历史信息和用户当前明确需求冲突，以当前需求为准

### Analytics 扩展层

这层有价值，但不是当前阶段的重点：

- `venue_performance_daily`
- `venue_engagement_daily`
- `mall_demand_daily`
- `fact_recommendation`
- `fact_interest_signal`

## 核心设计规则

- 商场业务数据和用户交互历史分开存放。
- 原始历史和摘要化记忆分开存放。
- 在线 serving 表和 analytics 表分开存放。
- 精确约束优先使用结构化 SQL 字段。
- 向量检索只用于 memories、knowledge chunks 这类语义文本。

## 可选下一步

如果后面还要继续深化数据库能力，优先方向可以是：

- 更深入的 analytics rollups
- 更稳定的 memory extraction 质量
- 更统一的 user-context route contract

## Session 生命周期策略

`users` 和 `sessions` 的职责不同：

- `user_id`: long-lived user identity
- `session_id`: one continuous visit or conversation window

Cadence 当前建议遵循这套规则：

1. Reuse the current `session_id` when the user is still actively chatting.
2. Create a new `session_id` when the client explicitly starts a new conversation.
3. Create a new `session_id` when the previous session has been idle for more than 30 minutes.

实现说明：

- store `last_activity_at` on `sessions`
- update `last_activity_at` whenever a new message is written
- if a stale session is reused by the client, mark the old row as `expired` and create a new session row

这样可以给系统提供有意义的 session 边界，用于：

- short-term conversational context
- session summaries
- mall-side analytics
- future agent memory extraction

## Interaction Event 策略

仅靠 raw messages 不足以支持商场侧分析，产品还需要把结构化交互事件写入 `interaction_events`。

建议的第一批 event：

- `view_venue`: user opened a store, restaurant, or event detail
- `click_recommendation`: user clicked one item from a recommendation list
- `select_plan`: user accepted or entered a route flow
- `open_navigation`: user requested wayfinding or directions
- `expand_offer`: user opened an offer or package detail
- `submit_feedback`: user gave explicit feedback

当前 V1 已实现重点：

- `view_venue`: open an event detail card
- `filter_events`: apply an event scene filter
- `request_dining_recommendation`: submit the dining recommendation form
- `view_venue`: record one restaurant card dwell time inside dining recommendations
- `select_plan`: open the plan builder or choose a quick-plan preset
- `generate_plan`: successfully receive a day plan result
- `edit_plan_step`: successfully update one step in a generated plan
- `open_plan_followup_chat`: continue asking AI from an existing plan result
- `ask_event_question`: open chat from an event detail question
- `click_chat_suggestion`: click an AI suggestion chip from chat or plan
- `click_ai_action`: click an AI CTA such as dining or events

建议的 payload 结构：

- `event_type`
- `target_type`
- `target_id`
- `payload`
- `created_at`

设计规则：

- `messages` 用来保存对话历史
- `interaction_events` 用来保存结构化动作
- analytics facts 优先从 `interaction_events` 构建，只有必要时才回退到 message parsing

这样可以降低 Agent2 回答以下业务问题时的歧义：

- 哪些 venues 有曝光但点击低
- 哪些 recommendations 被打开了，哪些被忽略了
- 哪些用户路径最终走到了 route generation 或 feedback

建议的写入路径：

- frontend 调用 `POST /api/interactions/event`
- backend 解析 `user_id` 和 `session_id`
- backend 向 `interaction_events` 写入一行
- daily jobs 再把这些数据聚合成 analytics facts

## Feedback 策略

`feedback` 应该被视为一等信号，而不只是另一个 event payload。

建议的 feedback target：

- recommendation result
- venue
- event
- plan
- overall session

写入路径：

1. frontend submits feedback to `POST /api/feedback`
2. backend writes one row to `feedback`
3. backend also writes one `submit_feedback` event into `interaction_events`

为什么要同时保留两者：

- `feedback` 是显式情绪反馈的干净 fact table
- `interaction_events` 保留完整的时间序 event stream

建议的 feedback 语义：

- `rating = 1-2`: negative signal
- `rating = 3`: neutral or weakly useful
- `rating = 4-5`: positive signal
- `comment`: optional natural-language explanation

建议的 target mapping：

- `target_type = venue`
- `target_type = recommendation`
- `target_type = plan`
- `target_type = event`
- `target_type = session`

这可以支持后续这类 analytics：

- 哪些 recommendations 经常展示但评分很差
- 哪些 venues 更容易转化成正向 feedback
- 哪类 itinerary style 更容易带来更好的 session outcome

## Analytics 聚合方案

analytics layer 应该定时从 operational tables 派生出来，而不是直接由产品 route 写入。

### Source tables

- `sessions`
- `messages`
- `interaction_events`
- `recommendation_results`
- `plan_results`
- `feedback`

### 第一批 aggregation jobs

1. `session_summary_job`
2. `venue_performance_job`
3. `mall_demand_job`
4. `recommendation_fact_job`
5. `interest_signal_job`

### 1. Session Summary Job

输入：

- one finished or idle `session`
- its `messages`
- its `interaction_events`
- its `feedback`

输出：

- one row in `session_summaries`

派生字段：

- `primary_intent`
- `scene_tag`
- `budget_segment`
- `duration_seconds`
- `venue_count_viewed`
- `recommendation_count`
- `feedback_score`
- `summary_text`

### 2. Venue Performance Job

输入：

- `interaction_events`
- `feedback`

输出：

- daily rows in `venue_performance_daily`
- daily rows in `venue_engagement_daily`

建议指标：

- `exposure_count`: count of `view_venue`
- `click_count`: count of clicks on venue-related results
- `recommend_count`: count of recommendations containing the venue
- `route_add_count`: count of plans or selections involving the venue
- `positive_feedback_count`
- `negative_feedback_count`
- `view_count`: dwell-qualified `view_venue` rows for recommendation cards
- `meaningful_view_count`: count of views with stronger engagement
- `quick_skip_count`: count of near-immediate skips
- `avg_dwell_ms` / `median_dwell_ms` / `max_dwell_ms`

### 3. Mall Demand Job

输入：

- `messages`
- `session_summaries`
- extracted tags or intent classifiers

输出：

- daily rows in `mall_demand_daily`

常见维度：

- `intent`
- `scene`
- `budget_segment`

这会成为 Agent2 处理类似 "today's top user demand themes" 这类问题时的基础数据层。

### 4. Recommendation Fact Job

输入：

- `recommendation_results`
- `interaction_events`
- `feedback`

输出：

- `fact_recommendation`

这张表应该回答的问题包括：

- was the recommendation shown
- was it clicked
- was it selected
- did it receive feedback

当前实现方向：

- rebuild recommendation facts from `recommendation_results`
- match recommended items back to `venues` by name or `venue_id`
- infer clicks and selections from `interaction_events`
- attach session-level anonymized identity from `session_summaries`

### 5. Interest Signal Job

输入：

- `messages`
- `session_summaries`
- optional extraction model output

输出：

- `fact_interest_signal`

示例：

- `signal_type = scene`, `signal_value = 两个人约会`
- `signal_type = taste`, `signal_value = 想吃辣`
- `signal_type = ambiance`, `signal_value = 安静`
- `signal_type = budget`, `signal_value = 100-150`

当前实现方向：

- 先从 `session_summaries` 产出第一版 scene 和 budget signals
- 用 rule-based extraction 从用户消息中提取显式 preference signals
- 在 dedicated extraction model 引入前，先把这版作为 baseline

## Agent2 消费层

默认情况下，Agent2 不应该直接读取 raw conversations，而应该优先读取 analytics views 和 summary tables。

建议读取顺序：

1. `vw_mall_daily_summary`
2. `vw_top_venues_by_day`
3. `vw_recommendation_effectiveness`
4. `vw_feedback_summary`
5. `vw_top_interest_signals`

如果 Agent2 需要示例，优先提供 `session_summaries`，而不是完整 raw chats。

设计规则：

- 默认访问：views 和 fact tables
- 限制访问：raw `messages`
- 仅人工审批后访问：可识别用户身份的细节

## Memory 生成策略

`agent_memories` 不应该是 chat history 的完整副本，而应该只保存紧凑、可复用、能帮助未来服务的知识。

### Memory source priority

推荐的来源优先级，从强到弱：

1. 显式的用户偏好
2. 跨 session 重复出现的用户约束
3. 明确的 session outcome
4. 高信号 feedback
5. 摘要化的行为模式

避免从以下内容直接生成 memory：

- 一次性的随口评论
- 低置信度的模型猜测
- 很快过期的临时运营细节
- 已经存在于 master data tables 中的 raw mall facts

### 建议的 memory type

- `preference`: 相对稳定的喜欢或不喜欢
- `constraint`: 行动能力、家庭、预算、饮食、时间等约束
- `fact`: 对规划有用的长期用户事实
- `summary`: 一次已完成 session 的有效摘要

示例：

- `preference`: 用户偏好安静、适合聊天的餐厅
- `constraint`: 用户带老人时希望少换楼层
- `fact`: 用户常在工作日傍晚来商场
- `summary`: 上次最终接受了咖啡+晚餐路线组合

### Memory 写入时机

不要每条消息都写 memory。更合适的时机是：

1. session 自然结束
2. session 进入 idle 并被总结
3. 用户给出明确的正向或负向 feedback
4. 同一个 preference 多次出现

### Memory extraction pipeline

建议流程：

1. 读取一个已完成或 idle 的 session
2. 把该 session 总结进 `session_summaries`
3. 运行 extraction rules 或一次 LLM pass
4. 把稳定结论写入 `user_preferences`
5. 把紧凑的自然语言记忆写入 `agent_memories`
6. 视情况为高价值 memory 生成 embeddings

当前实现方向：

- rollup job 会扫描 ended、expired，或 idle 至少 30 分钟的 sessions
- 每个 session 生成一条 `session_summaries`
- 把显式的 rule-based signals 提升到 `user_preferences`
- 把紧凑的第一版 memories 写入 `agent_memories`

这是一个很好的第一阶段里程碑，因为它先让 memory layer 真正存在，再逐步接入 prompt assembly。

### Memory 提升规则

满足以下任一条件时，可以提升到 `agent_memories`：

- 用户明确表达了 preference 或 constraint
- 同一个 signal 出现在 2 个及以上的 sessions 中
- 用户给出了与某个结果强相关的反馈
- 这个 signal 会实质影响未来的 recommendations

否则，只保留在这些层：

- `messages`
- `session_summaries`
- `fact_interest_signal`

### Memory 过期与新鲜度

不是所有 memories 都应该永久保留。

建议的过期策略：

- stable preferences: 默认不过期
- soft preferences: 90 天后回看
- short-term constraints: 在相关访问窗口结束后过期
- session summaries: 在 recall layer 短保留，在 analytics layer 长保留

建议的运行规则：

- 按 `importance` 给 memories 排序
- 优先召回最高价值的 memories
- 在 prompt assembly 过程中归档或忽略陈旧的低价值 memories

### Memory 质量规则

为了让 memory 保持有用：

- 一条 memory row 只表达一个意思
- 尽量使用具体语言，不写空泛总结
- 用 `source_ref_type` 和 `source_ref_id` 保存 provenance
- 避免用不同措辞重复写入同一个 preference
- 对精确的结构化事实，优先更新 `user_preferences`

## Agent2 查询边界与权限

默认情况下，Agent2 应该运行在去标识化、面向业务分析的数据层之上。

### 默认可读层

Agent2 可以读取：

- `session_summaries`
- `venue_performance_daily`
- `venue_engagement_daily`
- `mall_demand_daily`
- `fact_recommendation`
- `fact_interest_signal`
- 例如 `vw_mall_daily_summary` 这类 analytics views
- 从 `session_summaries` 派生出的 safe example views

### 限制层

除非明确批准，否则 Agent2 不应直接读取：

- `messages`
- `users`
- 带有 user linkage 的 raw `sessions` metadata
- 含有可识别个人细节的 `agent_memories`
- `raw_source_records`

### 高权限层

仅限人工或强控制访问：

- personally identifiable user information
- 含有私有字段的 external source payloads
- 任何可以重建完整具名用户旅程的表

### 建议的权限模型

优先使用逻辑数据产品，而不是给很宽的表访问权限：

1. operational app layer
2. memory layer
3. analytics safe layer
4. privileged raw layer

默认情况下，Agent2 只应该接到 layer 3。

### Agent2-safe 示例数据

如果 Agent2 需要用户旅程示例，可以暴露：

- summarized session examples
- top repeated complaints
- top positive themes
- top venue interaction patterns

不要暴露：

- full raw chat logs
- exact user identifiers
- cross-session raw message history

### 升级规则

如果 Agent2 因为调试或定性分析确实需要 raw text：

1. 先从 `session_summaries` 开始
2. 再升级到 curated sample
3. 只有在人工批准后才允许受限的 raw access

这样可以避免 analytics agent 变成一个拥有无限 chat 访问权限的“影子客服系统”。

## 最终设计状态

到这个阶段，数据库设计被组织成以下几层：

- master data
- interaction history
- results and feedback
- memory and preference extraction
- analytics facts and views
- Agent2-safe consumption boundaries

这个顺序是有意设计的：

1. 先 capture raw facts
2. 再 derive reusable memory
3. 再 aggregate safe analytics
4. 最后只向每个 downstream agent 暴露所需的最小层

### Phase 3: Add Semantic Recall

目标：提升连续性和知识召回能力。

交付物：

- enable `pgvector`
- generate embeddings for memories and knowledge chunks
- add retrieval flow before LLM prompting

完成标准：

- the model can recall relevant prior preferences without reading full chat history

### Phase 4: Build the Analytics Layer

目标：支持面向商场侧的分析，以及下游 reporting agents。

交付物：

- anonymize or segment users for analytics
- generate session summaries and daily aggregates
- expose analytics views and reporting tables to Agent2

完成标准：

- Agent2 no longer needs raw user chat data
- mall-side analysis can run on summarized facts

## 按使用场景划分的查询策略

### 实时用户服务

读取来源：

- `venues`, `offers`, `events`
- `user_profiles`, `user_preferences`
- `agent_memories` and semantic recall results
- recent `sessions` and `messages`

### 商场运营分析

读取来源：

- `session_summaries`
- `venue_performance_daily`
- `venue_engagement_daily`
- `mall_demand_daily`
- `fact_recommendation`
- `fact_interest_signal`

### 数据质量与同步排查

读取来源：

- `data_sources`
- `raw_source_records`
- `sync_jobs`

## 建议的初始技术栈

- 主数据库：PostgreSQL
- 灵活字段：JSONB
- 语义检索：`pgvector`
- API 层：FastAPI + SQLAlchemy 或 SQLModel
- 后台任务：APScheduler、Celery，或简单的 cron 驱动 task runner

## 建议的下一步实现顺序

1. 在 `backend/db/schema.sql` 中创建 schema。
2. 增加 `backend/db` 模块，用来组织 engine、session 和 model wiring。
3. 先打通 `sessions`、`messages`、`recommendation_results`、`plan_results` 的写入链路。
4. 用 database seed process 替换 hardcoded mall data。
5. 增加一个 summarization job，把完成的 session 转成 memory 和 analytics rows。
