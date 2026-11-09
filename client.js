window.__ModuleLoader__.load({
  id: 'dsh-decide',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useState } = React

    /* ------------------------------------------------------------------ *
     * Transport
     * ------------------------------------------------------------------ */

    function apiBase() {
      try {
        const boot = window.__DSH_BOOT__
        const origin = boot && ((boot.connection && boot.connection.origin) || boot.origin || boot.apiOrigin)
        if (typeof origin === 'string' && origin) {
          return String(origin).replace(/\/+$/, '') + '/dsh-decide/api'
        }
      } catch (error) {
        /* same-origin fallback */
      }
      return '/dsh-decide/api'
    }

    const BASE = apiBase()
    const AUTHOR = {
      name: '老陈聊AI',
      url: 'https://www.xiaohongshu.com/search_result?keyword=%E8%80%81%E9%99%88%E8%81%8AAI',
    }

    async function request(path, body, method) {
      const init = {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers: { accept: 'application/json' },
      }
      if (body !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      const response = await fetch(BASE + path, init)
      const text = await response.text()
      let payload = null
      if (text) {
        try {
          payload = JSON.parse(text)
        } catch {
          throw new Error(text.slice(0, 200))
        }
      }
      if (!response.ok) {
        throw new Error((payload && (payload.error || payload.code)) || 'HTTP ' + response.status)
      }
      return payload
    }

    /* ------------------------------------------------------------------ *
     * Locale
     * ------------------------------------------------------------------ */

    const DICT = {
      en: {
        title: 'Decisions',
        subtitle: 'typed answers from Jev, NeoHorse-Jev, OpenAI, or a local model',
        tabProviders: 'Providers',
        tabExamples: 'Examples',
        tabBehavior: 'Behavior',
        tabUsage: 'Usage',
        refresh: 'Refresh',
        save: 'Save',
        saved: 'Saved',
        test: 'Test',
        testing: 'Testing…',
        models: 'List models',
        defaultBadge: 'default',
        useAsDefault: 'Use as default',
        enable: 'Enable',
        disable: 'Disable',
        enabled: 'Enabled',
        disabled: 'Disabled',
        model: 'Model',
        baseURL: 'Base URL',
        path: 'Path',
        apiKey: 'API key',
        keySet: 'key set',
        keyEnv: 'from environment',
        keyStore: 'stored',
        keyMissing: 'no key',
        keyPlaceholder: 'paste the key (never shown again)',
        saveKey: 'Save key',
        clearKey: 'Clear key',
        sourceFile: 'credentials store',
        sourceStore: 'credentials store',
        sourceEnv: 'environment',
        sourceNone: 'not required',
        sourceMissing: 'not set',
        keyEnvHint: 'Currently supplied by the environment. Saving a key here stores an override in the credentials store.',
        keyMissingHint: 'Paste a key, or export the variable before starting DSH.',
        keyStoredHint: 'Stored in the DSH credentials store; rotated keys apply on the next request.',
        keylessHint: 'No key required for this provider.',
        auto: 'Auto (first configured)',
        keyless: 'keyless',
        keyRef: 'Credential reference (env name)',
        tokens: 'tokens',
        advanced: 'Connection',
        addProvider: 'Add a custom provider',
        providerId: 'Provider id',
        displayName: 'Display name',
        dialect: 'Dialect',
        add: 'Add',
        remove: 'Remove',
        status: 'Status',
        problem: 'Configuration problem',
        noProviders: 'No providers configured.',
        testOk: 'Connection OK',
        testFail: 'Connection failed',
        modelsTitle: 'Models',
        noModels: 'No models returned.',
        defaultProvider: 'Default provider',
        thresholds: 'Confidence thresholds',
        choiceThreshold: 'Choice: top probability below',
        scoreThreshold: 'Score: confidence below',
        yesnoLow: 'Yes/no: allow below',
        yesnoHigh: 'Yes/no: deny at or above',
        limits: 'Request limits',
        maxQuestions: 'Max questions',
        timeoutMs: 'Timeout (ms)',
        maxRetries: 'Retries',
        cache: 'Result cache',
        cacheEnabled: 'Cache identical requests',
        cacheTtl: 'Cache TTL (ms)',
        audit: 'Audit',
        auditEnabled: 'Record decisions',
        auditStore: 'Store state',
        storeHash: 'hash only',
        storeFull: 'full text',
        storeNone: 'nothing',
        guardTitle: 'Execution guard',
        guardEnabled: 'Ask before running shell commands',
        guardProvider: 'Guard provider',
        guardLow: 'Allow below',
        guardHigh: 'Deny at or above',
        guardOnError: 'If the provider fails',
        guardFailOpen: 'allow the command',
        guardFailClosed: 'deny the command',
        guardWarning: 'Off by default. Only bash/pwsh are checked; the command text is sent to the provider. Do not enable this and dsh-jev-guard at the same time.',
        usageTitle: 'Usage',
        today: 'Today',
        last7: 'Last 7 days',
        requests: 'requests',
        tokensIn: 'input tokens',
        tokensOut: 'output tokens',
        errors: 'errors',
        cost: 'estimated cost',
        recent: 'Recent decisions',
        noDecisions: 'No decisions recorded yet.',
        time: 'Time',
        provider: 'Provider',
        tool: 'Tool',
        outcome: 'Outcome',
        uncertain: 'uncertain',
        loading: 'Loading…',
        settingsSaved: 'Settings saved.',
        saveFailed: 'Save failed',
        keySaved: 'Key saved.',
        keyCleared: 'Key cleared.',
        confirmRemove: 'Remove this provider?',
        privacy: 'The state you judge is sent to the selected provider. Keys stay in the DSH credential store.',
        guardNote: 'Pre-execute guard is available in this build; it stays off until you enable it.',
        examplesTitle: 'How to use',
        examplesIntro: 'Configure one provider, then ask the agent in plain language. The tools are model-facing, so you never call an API by hand.',
        step1Title: 'Configure a provider',
        step1Body: 'Settings → Decisions → Providers. Choose a provider, paste a key if it needs one, press Test, then Use as default.',
        step2Title: 'Ask for a decision',
        step2Body: 'Name the decision and the options. The agent turns your sentence into typed questions and shows the probabilities.',
        step3Title: 'Gate risky actions',
        step3Body: 'Ask the agent to call decide_gate before destructive commands, or enable the execution guard in Behavior.',
        exampleRoutingTitle: 'Route a ticket',
        exampleRoutingPrompt: 'Use decide to route this support ticket to billing, technical, or sales, and score its urgency from 0 (not urgent) to 2 (today).',
        exampleClassifyTitle: 'Classify a message',
        exampleClassifyPrompt: 'Classify this message with the decision model: is it a refund request (yes/no), how frustrated is the customer (calm / annoyed / angry), and which team should own it?',
        exampleGateTitle: 'Gate a command',
        exampleGatePrompt: 'Before running any shell command that deletes or overwrites files, call decide_gate. Continue only when the verdict is allow; otherwise ask me.',
        exampleJsonLabel: 'What the agent sends',
        copy: 'Copy',
        copied: 'Copied',
        examplePrivacy: 'Only send text you are comfortable sending to the selected provider. A local provider keeps it on this machine.',
        exampleDocs: 'Full guide: docs/usage.md',
        website: 'Website',
        tipHomepage: 'Opens the provider website. The link carries the aichen referral tag.',
        tipModel: 'Model id sent to this provider, for example jev-latest, NeoHorse-Jev-4B, or gpt-6-luna.',
        tipBaseURL: 'API root. TokenRhythm uses https://tokenrhythm.studio/v1; TypeSafe uses https://api.typesafe.ai.',
        tipPath: 'Endpoint path appended to the base URL, usually /v1/systemone or /v1/decisions.',
        tipApiKey: 'Stored in the DSH credentials store and never shown again. An environment variable works too.',
        tipDialect: 'System One (Jev, NeoHorse-Jev, Laya) or OpenAI Decisions. The request shape differs.',
        tipDefault: 'Tools use this provider unless the call names another one.',
        tipTest: 'Sends one tiny real decision request. It costs a few tokens.',
        tipModels: 'Asks the provider for GET /v1/models. A decision model may not be listed; you can still type its id.',
        tipThresholds: 'An answer is marked uncertain when its probability or confidence falls below these values. Tune per provider.',
        tipYesno: 'Below low means allow, at or above high means deny; the band between them is uncertain / needs review.',
        tipGuard: 'Asks the decision model before bash/pwsh runs. Off by default; costs one call per command.',
        tipCache: 'Identical requests are served from cache for the TTL and are not billed again.',
        tipAudit: 'Hash-only by default. Choose full text only if you accept storing the judged text.',
        tipUncertain: 'The model is not confident enough. Escalate, add context, or switch provider.',
        tipState: 'The text sent to the provider. JSON must be serialized to a string first.',
        tipQuestions: 'Each question has a name, a type, and instructions. Keep the set small; cost grows with questions.',
        tipNoSkill: 'No skill is installed. The agent picks tools from their descriptions; naming decide makes the choice deterministic.',
        tipExampleJson: 'state is the text being judged. Every question has a name, a type, and instructions; the answer comes back under the same name.',
        tipTriage: 'Experimental: classifies each new user message and adds a short quick/deep/tool hint to the turn. Off by default.',
        experimentalTitle: 'Experimental',
        experimentalBadge: 'experimental',
        triageEnabled: 'Triage each new message in the agent loop',
        triageProvider: 'Triage provider',
        triageWarning: 'Adds one decision call at the start of each turn and a short hint to the context. Behavior may change between releases.',
        exampleRagTitle: 'Rerank retrieved passages (RAG)',
        exampleRagPrompt: 'Before answering, call decide_rerank on these retrieved passages with my question, keep the top 3, then answer from them.',
        exampleJudgeTitle: 'Judge a result',
        exampleJudgePrompt: 'Use decide_judge to check whether the answer satisfies: cites sources, answers the question, and contains no invented facts.',
        exampleTriageTitle: 'Loop triage (experimental)',
        exampleTriagePrompt: 'Turn on loop triage in Behavior; it classifies each new message and adds a quick / deep / tool hint to the turn.',
        exampleNoSkill: 'No skill is installed. The agent chooses tools from their descriptions; naming decide just makes the choice deterministic.',
        footerMaintained: 'Maintained by',
        footerCoop: 'partnerships and feedback',
      },
      'zh-CN': {
        title: '决策模型',
        subtitle: 'Jev、NeoHorse-Jev、OpenAI 或本地模型的结构化答案',
        tabProviders: '提供商',
        tabExamples: '示例',
        tabBehavior: '行为',
        tabUsage: '用量',
        refresh: '刷新',
        save: '保存',
        saved: '已保存',
        test: '测试',
        testing: '测试中…',
        models: '获取模型',
        defaultBadge: '默认',
        useAsDefault: '设为默认',
        enable: '启用',
        disable: '停用',
        enabled: '已启用',
        disabled: '已停用',
        model: '模型',
        baseURL: '接口地址',
        path: '路径',
        apiKey: 'API Key',
        keySet: '已配置',
        keyEnv: '来自环境变量',
        keyStore: '已存储',
        keyMissing: '未配置',
        keyPlaceholder: '粘贴 Key（之后不再显示）',
        saveKey: '保存 Key',
        clearKey: '清除 Key',
        sourceFile: '凭据库',
        sourceStore: '凭据库',
        sourceEnv: '环境变量',
        sourceNone: '无需 Key',
        sourceMissing: '未配置',
        keyEnvHint: '当前来自环境变量；在这里保存会写入凭据库覆盖它。',
        keyMissingHint: '粘贴一个 Key，或在启动 DSH 前导出对应环境变量。',
        keyStoredHint: '保存在 DSH 凭据库；轮换后下一次请求即生效。',
        keylessHint: '该提供商不需要 Key。',
        auto: '自动（第一个已配置）',
        keyless: '免 Key',
        keyRef: '凭据引用（环境变量名）',
        tokens: 'tokens',
        advanced: '连接',
        addProvider: '添加自定义提供商',
        providerId: '提供商 ID',
        displayName: '显示名称',
        dialect: '协议',
        add: '添加',
        remove: '删除',
        status: '状态',
        problem: '配置问题',
        noProviders: '尚未配置提供商。',
        testOk: '连接成功',
        testFail: '连接失败',
        modelsTitle: '模型列表',
        noModels: '没有返回模型。',
        defaultProvider: '默认提供商',
        thresholds: '置信度阈值',
        choiceThreshold: '选择：最高概率低于',
        scoreThreshold: '评分：置信度低于',
        yesnoLow: '是否：低于此值判为允许',
        yesnoHigh: '是否：达到此值判为拒绝',
        limits: '请求限制',
        maxQuestions: '最大问题数',
        timeoutMs: '超时（毫秒）',
        maxRetries: '重试次数',
        cache: '结果缓存',
        cacheEnabled: '缓存相同请求',
        cacheTtl: '缓存时长（毫秒）',
        audit: '审计',
        auditEnabled: '记录判定',
        auditStore: '记录 state',
        storeHash: '仅哈希',
        storeFull: '全文',
        storeNone: '不记录',
        guardTitle: '执行守门',
        guardEnabled: '执行 shell 命令前先判定',
        guardProvider: '守门使用的提供商',
        guardLow: '低于此值放行',
        guardHigh: '达到此值拒绝',
        guardOnError: '提供商失败时',
        guardFailOpen: '放行命令',
        guardFailClosed: '拒绝命令',
        guardWarning: '默认关闭。只检查 bash/pwsh；命令文本会发送给提供商。不要与 dsh-jev-guard 同时启用。',
        usageTitle: '用量',
        today: '今天',
        last7: '最近 7 天',
        requests: '请求',
        tokensIn: '输入 tokens',
        tokensOut: '输出 tokens',
        errors: '错误',
        cost: '估算成本',
        recent: '最近判定',
        noDecisions: '还没有判定记录。',
        time: '时间',
        provider: '提供商',
        tool: '工具',
        outcome: '结果',
        uncertain: '不确定',
        loading: '加载中…',
        settingsSaved: '设置已保存。',
        saveFailed: '保存失败',
        keySaved: 'Key 已保存。',
        keyCleared: 'Key 已清除。',
        confirmRemove: '确定删除这个提供商吗？',
        privacy: 'judge 的 state 会发送给所选提供商；Key 保存在 DSH 凭据库中。',
        guardNote: '执行前守门已可用；在你打开之前不会生效。',
        examplesTitle: '怎么用',
        examplesIntro: '先配置一个提供商，然后用自然语言让 agent 去判定。工具是给模型调用的，你不需要手写 API 请求。',
        step1Title: '配置提供商',
        step1Body: '设置 → 决策模型 → 提供商。选择提供商，需要 Key 就粘贴，点“测试”，再点“设为默认”。',
        step2Title: '提出判定',
        step2Body: '说清楚要判什么、有哪些选项。agent 会把它变成结构化问题，并展示概率。',
        step3Title: '危险操作前守门',
        step3Body: '让 agent 在执行破坏性命令前调用 decide_gate；或者在“行为”里打开执行守门。',
        exampleRoutingTitle: '给工单分团队',
        exampleRoutingPrompt: '用 decide 把这条客服工单分给账单 / 技术 / 销售，并给出 0（不急）到 2（今天）的紧急度。',
        exampleClassifyTitle: '分类一条消息',
        exampleClassifyPrompt: '用决策模型判断这条消息：是否要求退款（是/否）、客户情绪（平静 / 不满 / 愤怒）、应该由哪个团队处理。',
        exampleGateTitle: '命令执行前判定',
        exampleGatePrompt: '在执行任何删除或覆盖文件的 shell 命令前，先调用 decide_gate；只有 allow 才继续，否则先问我。',
        exampleJsonLabel: 'agent 实际发送的内容',
        copy: '复制',
        copied: '已复制',
        examplePrivacy: '只发送你愿意交给所选提供商的文本；本地提供商会把内容留在本机。',
        exampleDocs: '完整说明：docs/usage.zh.md',
        website: '官网',
        tipHomepage: '打开提供商官网；链接会带上 aichen 推广参数。',
        tipModel: '发给该提供商的模型 id，例如 jev-latest、NeoHorse-Jev-4B、gpt-6-luna。',
        tipBaseURL: 'API 根地址。基元律动用 https://tokenrhythm.studio/v1；TypeSafe 用 https://api.typesafe.ai。',
        tipPath: '拼在根地址后的接口路径，通常是 /v1/systemone 或 /v1/decisions。',
        tipApiKey: '保存在 DSH 凭据库，之后不再显示；也可以用环境变量。',
        tipDialect: 'System One（Jev / NeoHorse-Jev / Laya）或 OpenAI Decisions，两者请求格式不同。',
        tipDefault: '除非工具调用指定了别的提供商，否则都用这个。',
        tipTest: '真的发一次很小的判定请求，会消耗少量 token。',
        tipModels: '向提供商的 GET /v1/models 拉取列表。决策模型可能不在列表里，仍可手动填写。',
        tipThresholds: '概率或置信度低于这些值时，答案会标记为 uncertain。不同提供商应分别校准。',
        tipYesno: '低于 low 判为允许，达到 high 判为拒绝；中间的灰区是 uncertain / 需要人工看。',
        tipGuard: 'bash/pwsh 执行前先问决策模型。默认关闭，每条命令会多一次调用。',
        tipCache: '相同请求在 TTL 内直接走缓存，不会重复计费。',
        tipAudit: '默认只存哈希；只有接受保存原文时才选全文。',
        tipUncertain: '模型不够确定。应该升级给人、补充上下文，或换提供商。',
        tipState: '发送给提供商的文本；JSON 需要先序列化成字符串。',
        tipQuestions: '每个问题有名字、类型和说明。问题越少越省。',
        tipNoSkill: '没有安装任何 skill。agent 是依据工具描述自己选的；点名 decide 只是让选择更确定。',
        tipExampleJson: 'state 是被判定的文本；每个问题有名字、类型和说明，答案会以同一个名字返回。',
        tipTriage: '实验性：对新消息分类，并在本轮上下文里加一句 quick/deep/tool 提示。默认关闭。',
        experimentalTitle: '实验性功能',
        experimentalBadge: '实验性',
        triageEnabled: '在 agent loop 中分诊每条新消息',
        triageProvider: '分诊使用的提供商',
        triageWarning: '每轮开头多一次判定调用，并向上下文追加一句提示；行为可能随版本变化。',
        exampleRagTitle: '检索结果重排（RAG）',
        exampleRagPrompt: '回答之前，先用 decide_rerank 把这几段检索结果按与问题的相关性排序，只保留前 3 段再作答。',
        exampleJudgeTitle: '给结果打分/验收',
        exampleJudgePrompt: '用 decide_judge 检查这个回答是否满足：引用了来源、回答了问题、没有编造事实。',
        exampleTriageTitle: 'Loop 分诊（实验性）',
        exampleTriagePrompt: '在“行为”里打开 Loop 分诊；它会分类每条新消息，并在本轮加入 quick / deep / tool 提示。',
        exampleNoSkill: '没有安装任何 skill。agent 依据工具描述自己选择；点名 decide 只是让选择更确定。',
        footerMaintained: '由',
        footerCoop: '维护 · 合作与反馈',
      },
    }

    // DSH ships English, Chinese, Japanese, Spanish, French, German, Russian
    // and Portuguese. English and Chinese are complete; the other packs cover
    // the main chrome and fall back to English for longer help text.
    const LANG_PACKS = {
      ja: {
        ...DICT.en,
        title: '判定モデル',
        subtitle: 'Jev・NeoHorse-Jev・OpenAI・ローカルモデルの型付き回答',
        tabProviders: 'プロバイダー',
        tabExamples: '例',
        tabBehavior: '動作',
        tabUsage: '使用量',
        refresh: '更新', save: '保存', saved: '保存しました', test: 'テスト', testing: 'テスト中…',
        models: 'モデル一覧', useAsDefault: '既定に設定', enable: '有効化', disable: '無効化',
        enabled: '有効', disabled: '無効', model: 'モデル', baseURL: 'ベースURL', path: 'パス',
        apiKey: 'APIキー', keyPlaceholder: 'キーを貼り付け（再表示されません）', saveKey: 'キーを保存',
        clearKey: 'キーを削除', keyMissing: 'キーなし', keySet: '設定済み', sourceFile: '認証情報ストア',
        sourceEnv: '環境変数', sourceNone: '不要', auto: '自動（最初の設定済み）', keyless: 'キー不要',
        addProvider: 'カスタムプロバイダーを追加', providerId: 'プロバイダーID', displayName: '表示名',
        dialect: 'プロトコル', add: '追加', remove: '削除', problem: '設定エラー', noProviders: 'プロバイダーがありません',
        testOk: '接続OK', testFail: '接続失敗', modelsTitle: 'モデル', noModels: 'モデルが返されませんでした',
        defaultProvider: '既定のプロバイダー', thresholds: '信頼度しきい値', limits: 'リクエスト制限',
        guardTitle: '実行ガード', guardEnabled: 'シェル実行前に確認', guardProvider: 'ガードのプロバイダー',
        guardOnError: 'プロバイダー障害時', guardFailOpen: 'コマンドを許可', guardFailClosed: 'コマンドを拒否',
        usageTitle: '使用量', today: '今日', last7: '過去7日', requests: 'リクエスト',
        tokensIn: '入力トークン', tokensOut: '出力トークン', errors: 'エラー', cost: '推定コスト',
        recent: '最近の判定', noDecisions: 'まだ記録がありません', loading: '読み込み中…',
        examplesTitle: '使い方', exampleRoutingTitle: 'チケットの振り分け',
        exampleClassifyTitle: 'メッセージの分類', exampleGateTitle: 'コマンドの実行判定',
        copy: 'コピー', copied: 'コピーしました', exampleJsonLabel: 'agent が送信する内容',
        exampleDocs: '詳細: docs/usage.md',
      },
      es: {
        ...DICT.en,
        title: 'Decisiones',
        subtitle: 'respuestas tipadas de Jev, NeoHorse-Jev, OpenAI o un modelo local',
        tabProviders: 'Proveedores', tabExamples: 'Ejemplos', tabBehavior: 'Comportamiento', tabUsage: 'Uso',
        refresh: 'Actualizar', save: 'Guardar', saved: 'Guardado', test: 'Probar', testing: 'Probando…',
        models: 'Listar modelos', useAsDefault: 'Usar por defecto', enable: 'Activar', disable: 'Desactivar',
        enabled: 'Activado', disabled: 'Desactivado', model: 'Modelo', baseURL: 'URL base', path: 'Ruta',
        apiKey: 'Clave API', keyPlaceholder: 'pega la clave (no se volverá a mostrar)', saveKey: 'Guardar clave',
        clearKey: 'Borrar clave', keyMissing: 'sin clave', keySet: 'configurada', sourceFile: 'almacén de credenciales',
        sourceEnv: 'entorno', sourceNone: 'no requerida', auto: 'Automático (primero configurado)', keyless: 'sin clave',
        addProvider: 'Añadir proveedor', providerId: 'ID del proveedor', displayName: 'Nombre visible',
        dialect: 'Protocolo', add: 'Añadir', remove: 'Eliminar', problem: 'Error de configuración',
        noProviders: 'Sin proveedores', testOk: 'Conexión correcta', testFail: 'Error de conexión',
        modelsTitle: 'Modelos', noModels: 'Sin modelos', defaultProvider: 'Proveedor por defecto',
        thresholds: 'Umbrales de confianza', limits: 'Límites de solicitud',
        guardTitle: 'Guardia de ejecución', guardEnabled: 'Preguntar antes de comandos shell',
        guardProvider: 'Proveedor de guardia', guardOnError: 'Si falla el proveedor',
        guardFailOpen: 'permitir comando', guardFailClosed: 'denegar comando',
        usageTitle: 'Uso', today: 'Hoy', last7: 'Últimos 7 días', requests: 'solicitudes',
        tokensIn: 'tokens de entrada', tokensOut: 'tokens de salida', errors: 'errores', cost: 'coste estimado',
        recent: 'Decisiones recientes', noDecisions: 'Sin registros', loading: 'Cargando…',
        examplesTitle: 'Cómo usar', exampleRoutingTitle: 'Enrutar un ticket',
        exampleClassifyTitle: 'Clasificar un mensaje', exampleGateTitle: 'Evaluar un comando',
        copy: 'Copiar', copied: 'Copiado', exampleJsonLabel: 'Lo que envía el agent',
        exampleDocs: 'Guía: docs/usage.md',
      },
      fr: {
        ...DICT.en,
        title: 'Décisions',
        subtitle: 'réponses typées de Jev, NeoHorse-Jev, OpenAI ou un modèle local',
        tabProviders: 'Fournisseurs', tabExamples: 'Exemples', tabBehavior: 'Comportement', tabUsage: 'Utilisation',
        refresh: 'Actualiser', save: 'Enregistrer', saved: 'Enregistré', test: 'Tester', testing: 'Test…',
        models: 'Lister les modèles', useAsDefault: 'Par défaut', enable: 'Activer', disable: 'Désactiver',
        enabled: 'Activé', disabled: 'Désactivé', model: 'Modèle', baseURL: 'URL de base', path: 'Chemin',
        apiKey: 'Clé API', keyPlaceholder: 'collez la clé (jamais réaffichée)', saveKey: 'Enregistrer la clé',
        clearKey: 'Supprimer la clé', keyMissing: 'sans clé', keySet: 'configurée', sourceFile: 'stockage des identifiants',
        sourceEnv: 'environnement', sourceNone: 'non requise', auto: 'Auto (premier configuré)', keyless: 'sans clé',
        addProvider: 'Ajouter un fournisseur', providerId: 'ID', displayName: 'Nom affiché',
        dialect: 'Protocole', add: 'Ajouter', remove: 'Supprimer', problem: 'Erreur de configuration',
        noProviders: 'Aucun fournisseur', testOk: 'Connexion OK', testFail: 'Échec de connexion',
        modelsTitle: 'Modèles', noModels: 'Aucun modèle', defaultProvider: 'Fournisseur par défaut',
        thresholds: 'Seuils de confiance', limits: 'Limites de requête',
        guardTitle: 'Garde d’exécution', guardEnabled: 'Demander avant les commandes shell',
        guardProvider: 'Fournisseur de garde', guardOnError: 'Si le fournisseur échoue',
        guardFailOpen: 'autoriser la commande', guardFailClosed: 'refuser la commande',
        usageTitle: 'Utilisation', today: 'Aujourd’hui', last7: '7 derniers jours', requests: 'requêtes',
        tokensIn: 'tokens entrée', tokensOut: 'tokens sortie', errors: 'erreurs', cost: 'coût estimé',
        recent: 'Décisions récentes', noDecisions: 'Aucun enregistrement', loading: 'Chargement…',
        examplesTitle: 'Comment utiliser', exampleRoutingTitle: 'Router un ticket',
        exampleClassifyTitle: 'Classer un message', exampleGateTitle: 'Évaluer une commande',
        copy: 'Copier', copied: 'Copié', exampleJsonLabel: 'Ce que l’agent envoie',
        exampleDocs: 'Guide : docs/usage.md',
      },
      de: {
        ...DICT.en,
        title: 'Entscheidungen',
        subtitle: 'typisierte Antworten von Jev, NeoHorse-Jev, OpenAI oder einem lokalen Modell',
        tabProviders: 'Anbieter', tabExamples: 'Beispiele', tabBehavior: 'Verhalten', tabUsage: 'Nutzung',
        refresh: 'Aktualisieren', save: 'Speichern', saved: 'Gespeichert', test: 'Testen', testing: 'Teste…',
        models: 'Modelle laden', useAsDefault: 'Als Standard', enable: 'Aktivieren', disable: 'Deaktivieren',
        enabled: 'Aktiv', disabled: 'Inaktiv', model: 'Modell', baseURL: 'Basis-URL', path: 'Pfad',
        apiKey: 'API-Schlüssel', keyPlaceholder: 'Schlüssel einfügen (wird nie erneut angezeigt)',
        saveKey: 'Schlüssel speichern', clearKey: 'Schlüssel löschen', keyMissing: 'kein Schlüssel',
        keySet: 'gesetzt', sourceFile: 'Anmeldedaten-Speicher', sourceEnv: 'Umgebung', sourceNone: 'nicht nötig',
        auto: 'Auto (erster konfigurierter)', keyless: 'ohne Schlüssel',
        addProvider: 'Anbieter hinzufügen', providerId: 'Anbieter-ID', displayName: 'Anzeigename',
        dialect: 'Protokoll', add: 'Hinzufügen', remove: 'Entfernen', problem: 'Konfigurationsfehler',
        noProviders: 'Keine Anbieter', testOk: 'Verbindung OK', testFail: 'Verbindung fehlgeschlagen',
        modelsTitle: 'Modelle', noModels: 'Keine Modelle', defaultProvider: 'Standardanbieter',
        thresholds: 'Konfidenzschwellen', limits: 'Anfragegrenzen',
        guardTitle: 'Ausführungsguard', guardEnabled: 'Vor Shell-Befehlen fragen',
        guardProvider: 'Guard-Anbieter', guardOnError: 'Wenn der Anbieter ausfällt',
        guardFailOpen: 'Befehl erlauben', guardFailClosed: 'Befehl verweigern',
        usageTitle: 'Nutzung', today: 'Heute', last7: 'Letzte 7 Tage', requests: 'Anfragen',
        tokensIn: 'Eingabe-Tokens', tokensOut: 'Ausgabe-Tokens', errors: 'Fehler', cost: 'geschätzte Kosten',
        recent: 'Letzte Entscheidungen', noDecisions: 'Noch keine Einträge', loading: 'Lädt…',
        examplesTitle: 'So funktioniert es', exampleRoutingTitle: 'Ticket routen',
        exampleClassifyTitle: 'Nachricht klassifizieren', exampleGateTitle: 'Befehl prüfen',
        copy: 'Kopieren', copied: 'Kopiert', exampleJsonLabel: 'Was der Agent sendet',
        exampleDocs: 'Anleitung: docs/usage.md',
      },
      ru: {
        ...DICT.en,
        title: 'Решения',
        subtitle: 'типизированные ответы от Jev, NeoHorse-Jev, OpenAI или локальной модели',
        tabProviders: 'Провайдеры', tabExamples: 'Примеры', tabBehavior: 'Поведение', tabUsage: 'Использование',
        refresh: 'Обновить', save: 'Сохранить', saved: 'Сохранено', test: 'Проверить', testing: 'Проверка…',
        models: 'Список моделей', useAsDefault: 'По умолчанию', enable: 'Включить', disable: 'Отключить',
        enabled: 'Включено', disabled: 'Отключено', model: 'Модель', baseURL: 'Базовый URL', path: 'Путь',
        apiKey: 'API-ключ', keyPlaceholder: 'вставьте ключ (больше не показывается)',
        saveKey: 'Сохранить ключ', clearKey: 'Удалить ключ', keyMissing: 'нет ключа', keySet: 'задан',
        sourceFile: 'хранилище учётных данных', sourceEnv: 'окружение', sourceNone: 'не требуется',
        auto: 'Авто (первый настроенный)', keyless: 'без ключа',
        addProvider: 'Добавить провайдера', providerId: 'ID провайдера', displayName: 'Отображаемое имя',
        dialect: 'Протокол', add: 'Добавить', remove: 'Удалить', problem: 'Ошибка конфигурации',
        noProviders: 'Нет провайдеров', testOk: 'Соединение OK', testFail: 'Ошибка соединения',
        modelsTitle: 'Модели', noModels: 'Модели не получены', defaultProvider: 'Провайдер по умолчанию',
        thresholds: 'Пороги уверенности', limits: 'Ограничения запроса',
        guardTitle: 'Защита выполнения', guardEnabled: 'Спрашивать перед командами shell',
        guardProvider: 'Провайдер защиты', guardOnError: 'При сбое провайдера',
        guardFailOpen: 'разрешить команду', guardFailClosed: 'запретить команду',
        usageTitle: 'Использование', today: 'Сегодня', last7: 'Последние 7 дней', requests: 'запросы',
        tokensIn: 'входные токены', tokensOut: 'выходные токены', errors: 'ошибки', cost: 'оценка стоимости',
        recent: 'Последние решения', noDecisions: 'Записей пока нет', loading: 'Загрузка…',
        examplesTitle: 'Как использовать', exampleRoutingTitle: 'Маршрутизация тикета',
        exampleClassifyTitle: 'Классификация сообщения', exampleGateTitle: 'Проверка команды',
        copy: 'Копировать', copied: 'Скопировано', exampleJsonLabel: 'Что отправляет агент',
        exampleDocs: 'Руководство: docs/usage.md',
      },
      pt: {
        ...DICT.en,
        title: 'Decisões',
        subtitle: 'respostas tipadas do Jev, NeoHorse-Jev, OpenAI ou um modelo local',
        tabProviders: 'Provedores', tabExamples: 'Exemplos', tabBehavior: 'Comportamento', tabUsage: 'Uso',
        refresh: 'Atualizar', save: 'Salvar', saved: 'Salvo', test: 'Testar', testing: 'Testando…',
        models: 'Listar modelos', useAsDefault: 'Usar como padrão', enable: 'Ativar', disable: 'Desativar',
        enabled: 'Ativado', disabled: 'Desativado', model: 'Modelo', baseURL: 'URL base', path: 'Caminho',
        apiKey: 'Chave de API', keyPlaceholder: 'cole a chave (nunca será exibida novamente)',
        saveKey: 'Salvar chave', clearKey: 'Limpar chave', keyMissing: 'sem chave', keySet: 'configurada',
        sourceFile: 'armazenamento de credenciais', sourceEnv: 'ambiente', sourceNone: 'não necessária',
        auto: 'Automático (primeiro configurado)', keyless: 'sem chave',
        addProvider: 'Adicionar provedor', providerId: 'ID do provedor', displayName: 'Nome de exibição',
        dialect: 'Protocolo', add: 'Adicionar', remove: 'Remover', problem: 'Erro de configuração',
        noProviders: 'Sem provedores', testOk: 'Conexão OK', testFail: 'Falha na conexão',
        modelsTitle: 'Modelos', noModels: 'Nenhum modelo', defaultProvider: 'Provedor padrão',
        thresholds: 'Limiares de confiança', limits: 'Limites de requisição',
        guardTitle: 'Guarda de execução', guardEnabled: 'Perguntar antes de comandos shell',
        guardProvider: 'Provedor da guarda', guardOnError: 'Se o provedor falhar',
        guardFailOpen: 'permitir comando', guardFailClosed: 'negar comando',
        usageTitle: 'Uso', today: 'Hoje', last7: 'Últimos 7 dias', requests: 'requisições',
        tokensIn: 'tokens de entrada', tokensOut: 'tokens de saída', errors: 'erros', cost: 'custo estimado',
        recent: 'Decisões recentes', noDecisions: 'Sem registros', loading: 'Carregando…',
        examplesTitle: 'Como usar', exampleRoutingTitle: 'Encaminhar um ticket',
        exampleClassifyTitle: 'Classificar uma mensagem', exampleGateTitle: 'Avaliar um comando',
        copy: 'Copiar', copied: 'Copiado', exampleJsonLabel: 'O que o agent envia',
        exampleDocs: 'Guia: docs/usage.md',
      },
    }

    let t = key => key

    /* ------------------------------------------------------------------ *
     * Small UI pieces
     * ------------------------------------------------------------------ */

    const STYLE = `
.dec-root{display:flex;flex-direction:column;gap:12px;padding:2px 0 28px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.dec-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dec-title{font-size:15px;font-weight:600}
.dec-sub{color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:2px}
.dec-tabs{display:flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dec-tab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:7px 10px;border-radius:6px 6px 0 0;cursor:pointer;font:inherit}
.dec-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.dec-tab[data-active="true"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary)}
.dec-card{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.dec-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dec-card-body{padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.dec-name{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-weight:600;font-size:13px}
.dec-badge{display:inline-flex;align-items:center;font-size:11px;line-height:16px;padding:0 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);white-space:nowrap;font-weight:400}
.dec-badge-ok{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.dec-badge-warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.dec-badge-brand{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dec-btn{appearance:none;font:inherit;font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}
.dec-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l2)}
.dec-btn:disabled{opacity:.5;cursor:default}
.dec-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}
.dec-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.dec-input{font:inherit;font-size:12px;padding:5px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);min-width:0;width:100%;box-sizing:border-box}
.dec-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.dec-field{display:flex;flex-direction:column;gap:3px}
.dec-label{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dec-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dec-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.dec-banner{font-size:12px;padding:7px 10px;border-radius:6px;border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dec-banner-info{border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.dec-banner-ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}
.dec-table{width:100%;border-collapse:collapse;font-size:12px}
.dec-table th,.dec-table td{text-align:left;padding:5px 6px;border-top:1px solid var(--dsw-alias-border-l1);vertical-align:top}
.dec-table th{color:var(--dsw-alias-label-secondary);font-weight:500;border-top:0}
.dec-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;word-break:break-all}
.dec-empty{padding:16px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}
.dec-chip{font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);cursor:pointer}
.dec-chip:hover{border-color:var(--dsw-alias-brand-primary)}
`

    const POLISH = `
.dec-root{max-width:980px;margin:0 auto;gap:14px;padding:6px 2px 40px}
.dec-panel{display:flex;flex-direction:column;gap:12px;min-width:0}
.dec-hero{display:flex;align-items:center;gap:12px;padding:2px 0 4px}
.dec-mark{width:42px;height:42px;flex:none;border-radius:13px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:19px;font-weight:700;background:linear-gradient(135deg,var(--dsw-alias-brand-primary),#8a5cff);box-shadow:0 6px 16px rgba(77,107,254,.22)}
.dec-hero-text{min-width:0}
.dec-hero-meta{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.dec-title{font-size:18px;font-weight:650;letter-spacing:-.01em}
.dec-sub{margin-top:3px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dec-tabs{display:inline-flex;gap:2px;padding:3px;width:fit-content;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-2)}
.dec-tab{padding:6px 14px;border-radius:8px;font-size:12px}
.dec-tab[data-active="true"]{background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 3px rgba(0,0,0,.08);box-shadow:0 1px 3px color-mix(in srgb, #000 10%, transparent)}
.dec-provider{border:1px solid var(--dsw-alias-border-l1);border-radius:13px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:border-color .15s,box-shadow .15s}
.dec-provider:hover{border-color:var(--dsw-alias-border-l2)}
.dec-provider-default{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary) inset,0 2px 10px rgba(77,107,254,.08)}
.dec-provider-off{opacity:.82}
.dec-provider-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);background:linear-gradient(180deg,var(--dsw-alias-bg-layer-2),transparent)}
.dec-provider-id{display:flex;align-items:center;gap:11px;min-width:0}
.dec-avatar{width:38px;height:38px;flex:none;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;letter-spacing:.02em;color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l1)}
.dec-provider-meta{min-width:0;display:flex;flex-direction:column;gap:4px}
.dec-provider-sub{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);min-width:0}
.dec-sub-sep{opacity:.5}
.dec-sub-url{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px}
.dec-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-label-secondary)}
.dec-dot.is-ok{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary) 15%,transparent)}
.dec-dot.is-warn{background:var(--dsw-alias-state-warn-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 15%,transparent)}
.dec-provider-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.dec-provider-body{display:flex;flex-direction:column;gap:12px;padding:14px 16px 12px}
.dec-provider-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:2px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}
.dec-keyrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.dec-keyrow .dec-input{flex:1;min-width:160px}
.dec-keyless{font-size:12px;color:var(--dsw-alias-label-secondary);padding:7px 10px;border-radius:8px;border:1px dashed var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}
.dec-key-state{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dec-models{padding:10px 12px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:6px}
.dec-note{font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary);padding:2px 0 2px 9px;border-left:2px solid var(--dsw-alias-border-l1)}
.dec-card{border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.dec-card-head{padding:12px 16px}
.dec-card-body{padding:14px 16px}
.dec-grid{gap:12px}
.dec-label{font-size:11px;font-weight:500;letter-spacing:.015em;display:flex;align-items:center;gap:4px}
.dec-help{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;flex:none;border-radius:50%;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-size:9.5px;line-height:1;cursor:help;background:var(--dsw-alias-bg-layer-2);font-weight:600;user-select:none}
.dec-help:hover,.dec-help:focus{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);outline:none}
.dec-site{display:inline-flex;align-items:center;gap:3px;color:var(--dsw-alias-brand-primary);text-decoration:none;font-size:11px;font-weight:500}
.dec-site:hover{text-decoration:underline}
.dec-callout{font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary);padding:9px 11px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);margin-top:8px}
.dec-experimental{border-color:var(--dsw-alias-state-warn-primary)}
.dec-footer{display:flex;align-items:center;justify-content:center;gap:4px;padding:10px 0 2px;font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:.85}
.dec-footer a{color:var(--dsw-alias-label-secondary);text-decoration:none;border-bottom:1px dotted var(--dsw-alias-border-l2)}
.dec-footer a:hover{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary)}
.dec-input{height:34px;padding:0 10px;border-radius:8px;transition:border-color .12s,box-shadow .12s}
.dec-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}
select.dec-input{padding-right:26px;cursor:pointer}
.dec-btn{border-radius:8px;padding:6px 12px;font-size:12px;font-weight:500;transition:border-color .12s,background .12s,color .12s}
.dec-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base)}
.dec-btn-primary{box-shadow:0 1px 2px rgba(77,107,254,.25)}
.dec-btn-primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);color:#fff;filter:brightness(1.06)}
.dec-btn-danger{background:transparent}
.dec-btn-danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.dec-badge{padding:1px 7px;font-size:10.5px;line-height:17px}
.dec-badge-ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}
.dec-badge-warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent)}
.dec-badge-brand{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent)}
.dec-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.dec-stat{padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px rgba(0,0,0,.03)}
.dec-stat-value{font-size:20px;font-weight:650;letter-spacing:-.02em;line-height:1.15}
.dec-stat-label{margin-top:4px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dec-stat-hint{margin-top:2px;font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:.8}
.dec-table th{font-size:10.5px;text-transform:none;letter-spacing:.02em}
.dec-table td{padding:7px 6px}
.dec-table tbody tr:hover{background:var(--dsw-alias-bg-layer-2)}
.dec-banner{border-radius:9px;padding:8px 11px}
.dec-empty{padding:26px}
.dec-examples{display:flex;flex-direction:column;gap:10px}
.dec-example{border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.dec-example-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dec-example-title{font-size:12.5px;font-weight:600}
.dec-code{margin:0;padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.65;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);overflow:auto;max-height:360px}
.dec-card-body>.dec-code{border:1px solid var(--dsw-alias-border-l1);border-radius:8px}
.dec-steps{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.dec-step{display:flex;align-items:flex-start;gap:10px}
.dec-step-num{width:22px;height:22px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.dec-step-title{font-size:12px;font-weight:600;margin-bottom:1px}
@media (max-width:820px){
  .dec-grid{grid-template-columns:1fr}
  .dec-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .dec-hero-meta{display:none}
  .dec-provider-head{align-items:flex-start;flex-direction:column}
  .dec-provider-actions{justify-content:flex-start}
  .dec-sub-url{max-width:220px}
}
`

    function Styles() {
      return h('style', null, STYLE + POLISH)
    }

    function Badge({ tone, title, children }) {
      const cls = 'dec-badge' + (tone ? ' dec-badge-' + tone : '')
      return h('span', { className: cls, title }, children)
    }

    function Hint({ text }) {
      return h('span', {
        className: 'dec-help',
        role: 'img',
        tabIndex: 0,
        title: text,
        'aria-label': text,
      }, '?')
    }

    function Button({ kind, children, ...rest }) {
      const cls = 'dec-btn' + (kind ? ' dec-btn-' + kind : '')
      return h('button', { type: 'button', className: cls, ...rest }, children)
    }

    function Field({ label, hint, tip, children }) {
      return h('label', { className: 'dec-field' },
        h('span', { className: 'dec-label' }, label, tip ? h(Hint, { text: tip }) : null),
        children,
        hint ? h('span', { className: 'dec-hint' }, hint) : null)
    }

    function Input(props) {
      return h('input', { className: 'dec-input', ...props })
    }

    function Banner({ tone, children }) {
      const cls = 'dec-banner' + (tone ? ' dec-banner-' + tone : '')
      return h('div', { className: cls }, children)
    }

    function formatCost(cost) {
      if (!cost || typeof cost.amount !== 'number') return '—'
      return cost.amount.toFixed(6) + ' ' + (cost.currency || 'USD')
    }

    function formatTime(value) {
      try {
        return new Date(value).toLocaleString()
      } catch {
        return value
      }
    }

    function initials(name) {
      const text = String(name ?? '').trim()
      const words = text.split(/\s+/).filter(Boolean)
      if (words.length > 1) {
        return (words[0][0] + words[1][0]).toUpperCase()
      }
      return text.slice(0, 2).toUpperCase()
    }

    function keyStateLabel(provider) {
      if (!provider.apiKeyEnv) return t('sourceNone')
      if (!provider.key?.configured) return t('sourceMissing')
      const source = provider.key?.source
      if (source === 'env') return t('sourceEnv')
      return t('sourceFile')
    }

    function keyHint(provider) {
      if (!provider.apiKeyEnv) return t('keylessHint')
      if (!provider.key?.configured) return t('keyMissingHint')
      if (provider.key?.source === 'env') return t('keyEnvHint')
      return t('keyStoredHint')
    }

    function Stat({ label, value, hint }) {
      return h('div', { className: 'dec-stat' },
        h('div', { className: 'dec-stat-value' }, value),
        h('div', { className: 'dec-stat-label' }, label),
        hint ? h('div', { className: 'dec-stat-hint' }, hint) : null)
    }

    /* ------------------------------------------------------------------ *
     * Providers
     * ------------------------------------------------------------------ */

    function ProvidersView() {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState('')
      const [edits, setEdits] = useState({})
      const [keyInput, setKeyInput] = useState({})
      const [tests, setTests] = useState({})
      const [models, setModels] = useState({})
      const [notice, setNotice] = useState('')
      const [custom, setCustom] = useState({
        id: '', displayName: '', dialect: 'systemone', baseURL: '', path: '/v1/systemone',
        model: '', apiKeyEnv: '', enabled: true,
      })

      async function load() {
        try {
          const next = await request('/providers')
          setData(next)
          setError('')
        } catch (cause) {
          setError(cause.message)
        }
      }

      useEffect(() => {
        load()
      }, [])

      function editFor(provider) {
        return edits[provider.id] ?? {
          model: provider.model,
          baseURL: provider.baseURL,
          path: provider.path,
          enabled: provider.enabled,
        }
      }

      function setEdit(id, field, value) {
        setEdits(current => {
          const provider = data.providers.find(item => item.id === id)
          const base = current[id] ?? {
            model: provider.model,
            baseURL: provider.baseURL,
            path: provider.path,
            enabled: provider.enabled,
          }
          return { ...current, [id]: { ...base, [field]: value } }
        })
      }

      async function act(name, fn) {
        setBusy(name)
        setNotice('')
        try {
          await fn()
        } catch (cause) {
          setError(cause.message)
        } finally {
          setBusy('')
        }
      }

      async function save(provider) {
        await act('save:' + provider.id, async () => {
          await request('/providers/' + encodeURIComponent(provider.id), editFor(provider))
          setNotice(t('saved'))
          await load()
        })
      }

      async function toggle(provider) {
        await act('toggle:' + provider.id, async () => {
          await request('/providers/' + encodeURIComponent(provider.id), { enabled: !provider.enabled })
          await load()
        })
      }

      async function setDefault(provider) {
        await act('default:' + provider.id, async () => {
          await request('/settings', { defaultProvider: provider.id })
          await load()
        })
      }

      async function saveKey(provider) {
        const value = keyInput[provider.id] ?? ''
        if (!value.trim()) return
        await act('key:' + provider.id, async () => {
          await request('/providers/' + encodeURIComponent(provider.id) + '/key', { value })
          setKeyInput(current => ({ ...current, [provider.id]: '' }))
          setNotice(t('keySaved'))
          await load()
        })
      }

      async function clearKey(provider) {
        await act('clear:' + provider.id, async () => {
          await request('/providers/' + encodeURIComponent(provider.id) + '/key', undefined, 'DELETE')
          setNotice(t('keyCleared'))
          await load()
        })
      }

      async function test(provider) {
        await act('test:' + provider.id, async () => {
          const result = await request('/providers/' + encodeURIComponent(provider.id) + '/test', {})
          setTests(current => ({ ...current, [provider.id]: result }))
        })
      }

      async function loadModels(provider) {
        await act('models:' + provider.id, async () => {
          const result = await request('/providers/' + encodeURIComponent(provider.id) + '/models')
          setModels(current => ({ ...current, [provider.id]: result.models ?? [] }))
        })
      }

      async function remove(provider) {
        if (!window.confirm(t('confirmRemove'))) return
        await act('remove:' + provider.id, async () => {
          await request('/providers/' + encodeURIComponent(provider.id), undefined, 'DELETE')
          await load()
        })
      }

      async function addCustom() {
        await act('add', async () => {
          await request('/providers', {
            id: custom.id.trim(),
            displayName: custom.displayName.trim() || custom.id.trim(),
            dialect: custom.dialect,
            baseURL: custom.baseURL.trim(),
            path: custom.path.trim(),
            model: custom.model.trim(),
            apiKeyEnv: custom.apiKeyEnv.trim(),
            enabled: true,
          })
          setCustom({ id: '', displayName: '', dialect: 'systemone', baseURL: '', path: '/v1/systemone', model: '', apiKeyEnv: '', enabled: true })
          await load()
        })
      }

      if (!data) {
        return h('div', null, h(Styles), error ? h(Banner, null, error) : h('div', { className: 'dec-empty' }, t('loading')))
      }

      return h('div', { className: 'dec-panel' },
        error ? h(Banner, null, error) : null,
        notice ? h(Banner, { tone: 'ok' }, notice) : null,
        data.providers.map(provider => {
          const edit = editFor(provider)
          const testResult = tests[provider.id]
          const providerModels = models[provider.id]
          const removable = !['typesafe', 'tokenrhythm', 'openai', 'local'].includes(provider.id)
          return h('div', {
            key: provider.id,
            className: 'dec-provider'
              + (provider.isDefault ? ' dec-provider-default' : '')
              + (provider.enabled ? '' : ' dec-provider-off'),
          },
            h('div', { className: 'dec-provider-head' },
              h('div', { className: 'dec-provider-id' },
                h('div', { className: 'dec-avatar', 'data-id': provider.id }, initials(provider.displayName)),
                h('div', { className: 'dec-provider-meta' },
                  h('div', { className: 'dec-name' },
                    h('span', null, provider.displayName),
                    provider.isDefault ? h(Badge, { tone: 'brand', title: t('tipDefault') }, t('defaultBadge')) : null,
                    provider.enabled ? h(Badge, { tone: 'ok' }, t('enabled')) : h(Badge, null, t('disabled')),
                    h(Badge, { title: t('tipDialect') }, provider.dialect)),
                  h('div', { className: 'dec-provider-sub' },
                    h('span', { className: 'dec-dot ' + (provider.key.configured ? 'is-ok' : 'is-warn'), title: keyHint(provider) }),
                    h('span', null, provider.apiKeyEnv || t('keyless')),
                    h('span', { className: 'dec-sub-sep' }, '·'),
                    h('span', { className: 'dec-sub-url' }, provider.baseURL)))),
              h('div', { className: 'dec-provider-actions' },
                provider.homepage
                  ? h('a', {
                    className: 'dec-site',
                    href: provider.homepage,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    title: t('tipHomepage'),
                  }, t('website') + ' ↗')
                  : null,
                h(Button, { onClick: () => toggle(provider), disabled: busy === 'toggle:' + provider.id },
                  provider.enabled ? t('disable') : t('enable')),
                h(Button, {
                  onClick: () => setDefault(provider),
                  disabled: provider.isDefault || busy === 'default:' + provider.id,
                  title: t('tipDefault'),
                }, t('useAsDefault')))),
            h('div', { className: 'dec-provider-body' },
              provider.problem ? h(Banner, null, t('problem') + ': ' + provider.problem) : null,
              h('div', { className: 'dec-grid' },
                h(Field, { label: t('model'), tip: t('tipModel') },
                  h(Input, { value: edit.model, onChange: event => setEdit(provider.id, 'model', event.target.value) })),
                h(Field, { label: t('baseURL'), tip: t('tipBaseURL') },
                  h(Input, { value: edit.baseURL, onChange: event => setEdit(provider.id, 'baseURL', event.target.value) }))),
              h('div', { className: 'dec-grid' },
                h(Field, { label: t('path'), tip: t('tipPath') },
                  h(Input, { value: edit.path, onChange: event => setEdit(provider.id, 'path', event.target.value) })),
                provider.apiKeyEnv
                  ? h(Field, { label: t('apiKey'), hint: keyHint(provider), tip: t('tipApiKey') },
                    h('div', { className: 'dec-keyrow' },
                      h(Input, {
                        type: 'password',
                        placeholder: t('keyPlaceholder'),
                        value: keyInput[provider.id] ?? '',
                        onChange: event => setKeyInput(current => ({ ...current, [provider.id]: event.target.value })),
                      }),
                      h(Button, { onClick: () => saveKey(provider), disabled: busy === 'key:' + provider.id, title: t('tipApiKey') }, t('saveKey')),
                      h(Button, {
                        kind: 'danger',
                        onClick: () => clearKey(provider),
                        disabled: !provider.key.configured || busy === 'clear:' + provider.id,
                      }, t('clearKey'))))
                  : h(Field, { label: t('apiKey'), hint: t('keylessHint') },
                    h('div', { className: 'dec-keyless' }, t('keyless')))),
              h('div', { className: 'dec-provider-foot' },
                h('div', { className: 'dec-row' },
                  h(Button, { kind: 'primary', onClick: () => save(provider), disabled: busy === 'save:' + provider.id }, t('save')),
                  h(Button, { onClick: () => test(provider), disabled: busy === 'test:' + provider.id, title: t('tipTest') },
                    busy === 'test:' + provider.id ? t('testing') : t('test')),
                  h(Button, { onClick: () => loadModels(provider), disabled: busy === 'models:' + provider.id, title: t('tipModels') }, t('models')),
                  removable
                    ? h(Button, { kind: 'danger', onClick: () => remove(provider), disabled: busy === 'remove:' + provider.id }, t('remove'))
                    : null),
                h('div', { className: 'dec-key-state' },
                  h('span', { className: 'dec-dot ' + (provider.key.configured || !provider.apiKeyEnv ? 'is-ok' : 'is-warn') }),
                  h('span', null, t('apiKey') + ' · ' + keyStateLabel(provider)))),
              testResult ? h(Banner, { tone: testResult.ok ? 'ok' : undefined },
                testResult.ok
                  ? t('testOk') + ' · ' + testResult.result.model + ' · ' + testResult.result.latencyMs + ' ms'
                  : t('testFail') + ' · ' + (testResult.error?.code || '') + ' · ' + (testResult.error?.message || '')) : null,
              providerModels
                ? h('div', { className: 'dec-models' },
                  h('div', { className: 'dec-label' }, t('modelsTitle')),
                  providerModels.length
                    ? h('div', { className: 'dec-row' },
                      providerModels.slice(0, 40).map(item => h('button', {
                        key: item.id,
                        type: 'button',
                        className: 'dec-chip',
                        onClick: () => setEdit(provider.id, 'model', item.id),
                      }, item.id)))
                    : h('span', { className: 'dec-hint' }, t('noModels')))
                : null,
              provider.note ? h('div', { className: 'dec-note' }, provider.note) : null))
        }),
        h('div', { className: 'dec-card' },
          h('div', { className: 'dec-card-head' },
            h('div', { className: 'dec-name' }, t('addProvider')),
            h('div', { className: 'dec-hint' }, t('privacy'))),
          h('div', { className: 'dec-card-body' },
            h('div', { className: 'dec-grid' },
              h(Field, { label: t('providerId') },
                h(Input, { value: custom.id, onChange: event => setCustom({ ...custom, id: event.target.value }) })),
              h(Field, { label: t('displayName') },
                h(Input, { value: custom.displayName, onChange: event => setCustom({ ...custom, displayName: event.target.value }) })),
              h(Field, { label: t('dialect') },
                h('select', {
                  className: 'dec-input',
                  value: custom.dialect,
                  onChange: event => setCustom({
                    ...custom,
                    dialect: event.target.value,
                    path: event.target.value === 'openai-decisions' ? '/v1/decisions' : '/v1/systemone',
                  }),
                },
                h('option', { value: 'systemone' }, 'System One'),
                h('option', { value: 'openai-decisions' }, 'OpenAI Decisions'))),
              h(Field, { label: t('model') },
                h(Input, { value: custom.model, onChange: event => setCustom({ ...custom, model: event.target.value }) }))),
            h('div', { className: 'dec-grid' },
              h(Field, { label: t('baseURL') },
                h(Input, { value: custom.baseURL, onChange: event => setCustom({ ...custom, baseURL: event.target.value }) })),
              h(Field, { label: t('path') },
                h(Input, { value: custom.path, onChange: event => setCustom({ ...custom, path: event.target.value }) })),
              h(Field, { label: t('keyRef') },
                h(Input, { value: custom.apiKeyEnv, onChange: event => setCustom({ ...custom, apiKeyEnv: event.target.value }) }))),
            h('div', { className: 'dec-row' },
              h(Button, { kind: 'primary', onClick: addCustom, disabled: busy === 'add' }, t('add')))),
        ))
    }

    /* ------------------------------------------------------------------ *
     * Examples
     * ------------------------------------------------------------------ */

    const EXAMPLE_JSON = `{
  "state": "I was charged twice for my March subscription.",
  "questions": [
    {
      "name": "billing",
      "type": "yesno",
      "instructions": "Is this about billing?"
    },
    {
      "name": "team",
      "type": "choice",
      "instructions": "Which team should handle this?",
      "choices": [
        { "label": "billing" },
        { "label": "technical" },
        { "label": "sales" }
      ]
    },
    {
      "name": "urgency",
      "type": "score",
      "instructions": "How urgent is this?",
      "levels": [
        { "label": "not urgent" },
        { "label": "this week" },
        { "label": "today" }
      ]
    }
  ]
}`

    function ExamplesView() {
      const [copied, setCopied] = useState('')

      async function copy(text, key) {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(key)
          setTimeout(() => setCopied(''), 1600)
        } catch {
          setCopied('')
        }
      }

      function promptCard(key, title, prompt, badge) {
        return h('div', { className: 'dec-example', key },
          h('div', { className: 'dec-example-head' },
            h('div', { className: 'dec-example-title' },
              title,
              badge ? h(Badge, { tone: 'warn' }, badge) : null),
            h(Button, { onClick: () => copy(prompt, key), title: t('copy') },
              copied === key ? t('copied') : t('copy'))),
          h('pre', { className: 'dec-code' }, prompt))
      }

      const steps = [
        [t('step1Title'), t('step1Body')],
        [t('step2Title'), t('step2Body')],
        [t('step3Title'), t('step3Body')],
      ]

      return h('div', { className: 'dec-panel' },
        h('div', { className: 'dec-card' },
          h('div', { className: 'dec-card-head' }, h('div', { className: 'dec-name' }, t('examplesTitle'))),
          h('div', { className: 'dec-card-body' },
            h('div', { className: 'dec-hint' }, t('examplesIntro')),
            h('div', { className: 'dec-callout' }, t('exampleNoSkill')),
            h('div', { className: 'dec-steps' },
              steps.map(([title, body], index) => h('div', { className: 'dec-step', key: title },
                h('div', { className: 'dec-step-num' }, String(index + 1)),
                h('div', null,
                  h('div', { className: 'dec-step-title' }, title),
                  h('div', { className: 'dec-hint' }, body))))))),
        h('div', { className: 'dec-examples' },
          promptCard('routing', t('exampleRoutingTitle'), t('exampleRoutingPrompt')),
          promptCard('classify', t('exampleClassifyTitle'), t('exampleClassifyPrompt')),
          promptCard('gate', t('exampleGateTitle'), t('exampleGatePrompt')),
          promptCard('rag', t('exampleRagTitle'), t('exampleRagPrompt')),
          promptCard('judge', t('exampleJudgeTitle'), t('exampleJudgePrompt')),
          promptCard('triage', t('exampleTriageTitle'), t('exampleTriagePrompt'), t('experimentalBadge'))),
        h('div', { className: 'dec-card' },
          h('div', { className: 'dec-card-head' },
            h('div', { className: 'dec-name' }, t('exampleJsonLabel'), h(Hint, { text: t('tipExampleJson') })),
            h(Button, { onClick: () => copy(EXAMPLE_JSON, 'json') },
              copied === 'json' ? t('copied') : t('copy'))),
          h('div', { className: 'dec-card-body' },
            h('pre', { className: 'dec-code' }, EXAMPLE_JSON))),
        h('div', { className: 'dec-note' },
          t('examplePrivacy') + ' ' + t('exampleDocs')))
    }

    /* ------------------------------------------------------------------ *
     * Behavior
     * ------------------------------------------------------------------ */

    function BehaviorView() {
      const [settings, setSettings] = useState(null)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [busy, setBusy] = useState('')
      const [providers, setProviders] = useState([])

      useEffect(() => {
        Promise.all([request('/settings'), request('/providers')])
          .then(([nextSettings, nextProviders]) => {
            setSettings(nextSettings)
            setProviders(nextProviders.providers)
          })
          .catch(cause => setError(cause.message))
      }, [])

      function update(patch) {
        setSettings(current => ({ ...current, ...patch }))
      }

      async function save() {
        setBusy('save')
        setNotice('')
        try {
          await request('/settings', {
            defaultProvider: settings.defaultProvider,
            maxQuestions: Number(settings.maxQuestions),
            timeoutMs: Number(settings.timeoutMs),
            maxRetries: Number(settings.maxRetries),
            thresholds: {
              choice: Number(settings.thresholds.choice),
              score: Number(settings.thresholds.score),
              yesnoLow: Number(settings.thresholds.yesnoLow),
              yesnoHigh: Number(settings.thresholds.yesnoHigh),
            },
            cache: {
              enabled: settings.cache.enabled === true,
              ttlMs: Number(settings.cache.ttlMs),
            },
            audit: {
              enabled: settings.audit.enabled === true,
              storeState: settings.audit.storeState,
            },
            guard: {
              enabled: settings.guard.enabled === true,
              provider: settings.guard.provider ?? '',
              low: Number(settings.guard.low),
              high: Number(settings.guard.high),
              onError: settings.guard.onError,
            },
            experimental: {
              triage: {
                enabled: settings.experimental.triage.enabled === true,
                provider: settings.experimental.triage.provider ?? '',
              },
            },
          })
          setNotice(t('settingsSaved'))
        } catch (cause) {
          setError(cause.message)
        } finally {
          setBusy('')
        }
      }

      if (!settings) {
        return h('div', null, h(Styles), error ? h(Banner, null, error) : h('div', { className: 'dec-empty' }, t('loading')))
      }

      return h('div', { className: 'dec-panel' },
        error ? h(Banner, null, error) : null,
        notice ? h(Banner, { tone: 'ok' }, notice) : null,
        h('div', { className: 'dec-card' },
          h('div', { className: 'dec-card-head' }, h('div', { className: 'dec-name' }, t('defaultProvider'))),
          h('div', { className: 'dec-card-body' },
            h('select', {
              className: 'dec-input',
              value: settings.defaultProvider ?? '',
              onChange: event => update({ defaultProvider: event.target.value }),
            },
            h('option', { value: '' }, t('auto')),
            providers.map(provider => h('option', { key: provider.id, value: provider.id }, provider.displayName))))),
        h('div', { className: 'dec-card' },
          h('div', { className: 'dec-card-head' },
            h('div', { className: 'dec-name' }, t('thresholds'), h(Hint, { text: t('tipThresholds') }))),
          h('div', { className: 'dec-card-body' },
            h('div', { className: 'dec-grid' },
              h(Field, { label: t('choiceThreshold') },
                h(Input, { type: 'number', step: '0.05', min: '0', max: '1', value: settings.thresholds.choice, onChange: event => update({ thresholds: { ...settings.thresholds, choice: event.target.value } }) })),
              h(Field, { label: t('scoreThreshold') },
                h(Input, { type: 'number', step: '0.05', min: '0', max: '1', value: settings.thresholds.score, onChange: event => update({ thresholds: { ...settings.thresholds, score: event.target.value } }) })),
              h(Field, { label: t('yesnoLow'), tip: t('tipYesno') },
                h(Input, { type: 'number', step: '0.05', min: '0', max: '1', value: settings.thresholds.yesnoLow, onChange: event => update({ thresholds: { ...settings.thresholds, yesnoLow: event.target.value } }) })),
              h(Field, { label: t('yesnoHigh'), tip: t('tipYesno') },
                h(Input, { type: 'number', step: '0.05', min: '0', max: '1', value: settings.thresholds.yesnoHigh, onChange: event => update({ thresholds: { ...settings.thresholds, yesnoHigh: event.target.value } }) }))),
            h('div', { className: 'dec-hint' }, t('guardNote')))),
        h('div', { className: 'dec-card' },
          h('div', { className: 'dec-card-head' }, h('div', { className: 'dec-name' }, t('limits'))),
          h('div', { className: 'dec-card-body' },
            h('div', { className: 'dec-grid' },
              h(Field, { label: t('maxQuestions') },
                h(Input, { type: 'number', min: '1', max: '64', value: settings.maxQuestions, onChange: event => update({ maxQuestions: event.target.value }) })),
              h(Field, { label: t('timeoutMs') },
                h(Input, { type: 'number', min: '1000', max: '300000', value: settings.timeoutMs, onChange: event => update({ timeoutMs: event.target.value }) })),
              h(Field, { label: t('maxRetries') },
                h(Input, { type: 'number', min: '0', max: '5', value: settings.maxRetries, onChange: event => update({ maxRetries: event.target.value }) }))))),
        h('div', { className: 'dec-card' },
          h('div', { className: 'dec-card-head' }, h('div', { className: 'dec-name' }, t('cache'), h(Hint, { text: t('tipCache') }))),
          h('div', { className: 'dec-card-body' },
            h('div', { className: 'dec-row' },
              h('label', { className: 'dec-row' },
                h('input', { type: 'checkbox', checked: settings.cache.enabled === true, onChange: event => update({ cache: { ...settings.cache, enabled: event.target.checked } }) }),
                h('span', null, t('cacheEnabled'))),
              h(Field, { label: t('cacheTtl') },
                h(Input, { type: 'number', min: '0', max: '3600000', value: settings.cache.ttlMs, onChange: event => update({ cache: { ...settings.cache, ttlMs: event.target.value } }) }))))),
        h('div', { className: 'dec-card' },
          h('div', { className: 'dec-card-head' }, h('div', { className: 'dec-name' }, t('audit'), h(Hint, { text: t('tipAudit') }))),
          h('div', { className: 'dec-card-body' },
            h('div', { className: 'dec-row' },
              h('label', { className: 'dec-row' },
                h('input', { type: 'checkbox', checked: settings.audit.enabled === true, onChange: event => update({ audit: { ...settings.audit, enabled: event.target.checked } }) }),
                h('span', null, t('auditEnabled'))),
              h(Field, { label: t('auditStore') },
                h('select', {
                  className: 'dec-input',
                  value: settings.audit.storeState,
                  onChange: event => update({ audit: { ...settings.audit, storeState: event.target.value } }),
                },
                h('option', { value: 'hash' }, t('storeHash')),
                h('option', { value: 'full' }, t('storeFull')),
                h('option', { value: 'none' }, t('storeNone'))))))),
        h('div', { className: 'dec-card' },
          h('div', { className: 'dec-card-head' }, h('div', { className: 'dec-name' }, t('guardTitle'), h(Hint, { text: t('tipGuard') }))),
          h('div', { className: 'dec-card-body' },
            h('div', { className: 'dec-row' },
              h('label', { className: 'dec-row' },
                h('input', {
                  type: 'checkbox',
                  checked: settings.guard.enabled === true,
                  onChange: event => update({ guard: { ...settings.guard, enabled: event.target.checked } }),
                }),
                h('span', null, t('guardEnabled')))),
            h('div', { className: 'dec-grid' },
              h(Field, { label: t('guardProvider') },
                h('select', {
                  className: 'dec-input',
                  value: settings.guard.provider ?? '',
                  onChange: event => update({ guard: { ...settings.guard, provider: event.target.value } }),
                },
                h('option', { value: '' }, t('defaultProvider')),
                providers.map(provider => h('option', { key: provider.id, value: provider.id }, provider.displayName)))),
              h(Field, { label: t('guardOnError') },
                h('select', {
                  className: 'dec-input',
                  value: settings.guard.onError,
                  onChange: event => update({ guard: { ...settings.guard, onError: event.target.value } }),
                },
                h('option', { value: 'allow' }, t('guardFailOpen')),
                h('option', { value: 'deny' }, t('guardFailClosed'))))),
            h('div', { className: 'dec-grid' },
              h(Field, { label: t('guardLow') },
                h(Input, { type: 'number', step: '0.05', min: '0', max: '1', value: settings.guard.low, onChange: event => update({ guard: { ...settings.guard, low: event.target.value } }) })),
              h(Field, { label: t('guardHigh') },
                h(Input, { type: 'number', step: '0.05', min: '0', max: '1', value: settings.guard.high, onChange: event => update({ guard: { ...settings.guard, high: event.target.value } }) }))),
            h('div', { className: 'dec-hint' }, t('guardWarning')))),
        h('div', { className: 'dec-card dec-experimental' },
          h('div', { className: 'dec-card-head' },
            h('div', { className: 'dec-name' },
              t('experimentalTitle'),
              h(Badge, { tone: 'warn' }, t('experimentalBadge')),
              h(Hint, { text: t('tipTriage') }))),
          h('div', { className: 'dec-card-body' },
            h('div', { className: 'dec-row' },
              h('label', { className: 'dec-row' },
                h('input', {
                  type: 'checkbox',
                  checked: settings.experimental.triage.enabled === true,
                  onChange: event => update({ experimental: { ...settings.experimental, triage: { ...settings.experimental.triage, enabled: event.target.checked } } }),
                }),
                h('span', null, t('triageEnabled')))),
            h('div', { className: 'dec-grid' },
              h(Field, { label: t('triageProvider') },
                h('select', {
                  className: 'dec-input',
                  value: settings.experimental.triage.provider ?? '',
                  onChange: event => update({ experimental: { ...settings.experimental, triage: { ...settings.experimental.triage, provider: event.target.value } } }),
                },
                h('option', { value: '' }, t('defaultProvider')),
                providers.map(provider => h('option', { key: provider.id, value: provider.id }, provider.displayName))))),
            h('div', { className: 'dec-hint' }, t('triageWarning')))),
        h('div', { className: 'dec-row' },
          h(Button, { kind: 'primary', onClick: save, disabled: busy === 'save' }, t('save'))))
    }

    /* ------------------------------------------------------------------ *
     * Usage
     * ------------------------------------------------------------------ */

    function UsageView() {
      const [stats, setStats] = useState(null)
      const [decisions, setDecisions] = useState([])
      const [error, setError] = useState('')

      async function load() {
        try {
          const [nextStats, nextDecisions] = await Promise.all([
            request('/stats'),
            request('/decisions?limit=50'),
          ])
          setStats(nextStats)
          setDecisions(nextDecisions.decisions ?? [])
          setError('')
        } catch (cause) {
          setError(cause.message)
        }
      }

      useEffect(() => {
        load()
      }, [])

      function bucket(label, value) {
        const providers = Object.entries(value.providers ?? {})
        return h('div', { className: 'dec-card' },
          h('div', { className: 'dec-card-head' }, h('div', { className: 'dec-name' }, label)),
          h('div', { className: 'dec-card-body' },
            value.total.requests === 0
              ? h('span', { className: 'dec-hint' }, t('noDecisions'))
              : providers.map(([id, item]) => h('div', { key: id, className: 'dec-row' },
                h('strong', null, id),
                h('span', null, item.requests + ' ' + t('requests')),
                h('span', null, t('tokensIn') + ' ' + item.inputTokens),
                h('span', null, t('tokensOut') + ' ' + item.outputTokens),
                item.errors ? h('span', null, t('errors') + ' ' + item.errors) : null,
                h('span', null, t('cost') + ' ' + formatCost(item.cost))))))
      }

      if (!stats) {
        return h('div', null, h(Styles), error ? h(Banner, null, error) : h('div', { className: 'dec-empty' }, t('loading')))
      }

      const total = stats.last7.total
      return h('div', { className: 'dec-panel' },
        error ? h(Banner, null, error) : null,
        h('div', { className: 'dec-stats' },
          h(Stat, { label: t('requests'), value: total.requests, hint: t('last7') }),
          h(Stat, { label: t('tokens'), value: (total.inputTokens + total.outputTokens).toLocaleString() }),
          h(Stat, { label: t('errors'), value: total.errors }),
          h(Stat, { label: t('cost'), value: formatCost(total.cost) })),
        bucket(t('today'), stats.today),
        bucket(t('last7'), stats.last7),
        h('div', { className: 'dec-card' },
          h('div', { className: 'dec-card-head' },
            h('div', { className: 'dec-name' }, t('recent')),
            h(Button, { onClick: load }, t('refresh'))),
          h('div', { className: 'dec-card-body' },
            decisions.length === 0
              ? h('div', { className: 'dec-empty' }, t('noDecisions'))
              : h('table', { className: 'dec-table' },
                h('thead', null, h('tr', null,
                  h('th', null, t('time')),
                  h('th', null, t('provider')),
                  h('th', null, t('tool')),
                  h('th', null, t('outcome')),
                  h('th', null, t('tokens')))),
                h('tbody', null, decisions.map((record, index) => h('tr', { key: index },
                  h('td', null, formatTime(record.ts)),
                  h('td', null, record.provider ?? '—'),
                  h('td', null, record.tool ?? '—'),
                  h('td', null, (record.outcome ?? '') + (record.uncertainCount ? ' · ' + t('uncertain') : '')),
                  h('td', null, record.usage ? (record.usage.inputTokens ?? 0) + '/' + (record.usage.outputTokens ?? 0) : '—'))))))))
    }

    /* ------------------------------------------------------------------ *
     * Page
     * ------------------------------------------------------------------ */

    function Page() {
      const [tab, setTab] = useState('providers')
      const tabs = [
        ['providers', 'tabProviders'],
        ['examples', 'tabExamples'],
        ['behavior', 'tabBehavior'],
        ['usage', 'tabUsage'],
      ]
      return h('div', { className: 'dec-root' },
        h(Styles),
        h('div', { className: 'dec-hero' },
          h('div', { className: 'dec-mark', 'aria-hidden': 'true' }, '✓'),
          h('div', { className: 'dec-hero-text' },
            h('div', { className: 'dec-title' }, t('title')),
            h('div', { className: 'dec-sub' }, t('subtitle'))),
          h('div', { className: 'dec-hero-meta' },
            h(Badge, { tone: 'brand' }, 'System One'),
            h(Badge, null, 'OpenAI Decisions'))),
        h('div', { className: 'dec-tabs' },
          tabs.map(([id, key]) => h('button', {
            key: id,
            type: 'button',
            className: 'dec-tab',
            'data-active': tab === id ? 'true' : 'false',
            onClick: () => setTab(id),
          }, t(key)))),
        tab === 'providers' ? h(ProvidersView) : null,
        tab === 'examples' ? h(ExamplesView) : null,
        tab === 'behavior' ? h(BehaviorView) : null,
        tab === 'usage' ? h(UsageView) : null,
        h('div', { className: 'dec-footer' },
          t('footerMaintained') + ' ',
          h('a', {
            href: AUTHOR.url,
            target: '_blank',
            rel: 'noopener noreferrer',
            title: t('footerCoop'),
          }, AUTHOR.name),
          ' · ' + t('footerCoop')))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const bound = ctx.locale.bind('dsh-decide')
        t = key => {
          try {
            return bound(key)
          } catch (error) {
            return key
          }
        }
        const dictionaries = {
          en: DICT.en,
          zh: DICT['zh-CN'],
          'zh-CN': DICT['zh-CN'],
          ...LANG_PACKS,
        }
        for (const [language, dictionary] of Object.entries(dictionaries)) {
          ctx.effect(() => ctx.locale.register('dsh-decide', language, dictionary))
        }
        ctx.effect(() => ctx.slots.inject('settings.section', () =>
          ctx.slots.register({
            name: 'settings.section',
            id: 'dsh-decide',
            order: 19,
            label: () => t('title'),
          }, Page)))
      },
    }
  },
})
