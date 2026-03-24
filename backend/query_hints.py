from __future__ import annotations

import re

BUCKET_LABELS = {
    "spring_transaction": "事务",
    "spring_aop": "AOP",
    "spring_ioc_di": "IOC/DI",
    "spring_circular_dependency": "循环依赖",
    "spring_startup": "Spring 启动",
    "mysql_lock": "MySQL 锁",
    "mysql_mvcc_txn": "MVCC/隔离",
    "mysql_index_sql": "索引/SQL",
    "redis_cache_consistency": "缓存一致性",
    "redis_breakdown": "缓存异常",
    "mq_core": "MQ",
    "mq_reliability": "MQ 可靠性",
    "java_concurrency": "并发",
    "jvm_runtime": "JVM",
    "microservice_governance": "微服务治理",
    "distributed_ai": "AI/RAG",
}

BUCKET_DOC_HINTS = {
    "spring_transaction": ["boot_transaction", "ioc_aop", "scenario_questions_playbook", "standard_answer_examples"],
    "spring_aop": ["ioc_aop", "boot_transaction", "interview_followups_framework", "standard_answer_examples"],
    "spring_ioc_di": ["ioc_aop", "circular_dependency", "spring_startup_flow", "standard_answer_examples"],
    "spring_circular_dependency": ["circular_dependency", "ioc_aop", "spring_startup_flow", "interview_followups_framework"],
    "spring_startup": ["spring_startup_flow", "mvc_request_flow", "ioc_aop", "training_roadmap"],
    "mysql_lock": ["mysql_transaction_lock", "mysql_index_transaction", "sql_tuning", "scenario_questions_playbook"],
    "mysql_mvcc_txn": ["mysql_transaction_lock", "mysql_index_transaction", "standard_answer_examples", "interview_followups_framework"],
    "mysql_index_sql": ["sql_tuning", "mysql_index_transaction", "sharding_readwrite", "standard_answer_examples"],
    "redis_cache_consistency": ["redis_cache_consistency", "redis_consistency_hotkey", "scenario_questions_playbook", "standard_answer_examples"],
    "redis_breakdown": ["redis_consistency_hotkey", "redis_cache_consistency", "scenario_questions_playbook", "mock_interview_script"],
    "mq_core": ["message_queue_basics", "kafka_rabbitmq_compare", "service_governance", "standard_answer_examples"],
    "mq_reliability": ["idempotency_retry", "mq_idempotency", "message_queue_basics", "scenario_questions_playbook"],
    "java_concurrency": ["locks_and_cas", "thread_pool_aqs", "java_memory_model", "concurrent_collections"],
    "jvm_runtime": ["jvm_gc", "java_memory_model", "training_roadmap", "mock_interview_script"],
    "microservice_governance": ["service_governance", "rpc_registry_config", "scenario_questions_playbook", "standard_answer_examples"],
    "distributed_ai": ["vector_retrieval_basics", "ai_backend_rag", "ai_platform_engineering", "distributed_basics"],
}

RULES = [
    {
        "name": "spring_transaction",
        "test": re.compile(r"(事务|transaction|propagation|传播行为|隔离级别|isolation|回滚|rollback|transactional)", re.I),
        "terms": ["事务", "transaction", "@Transactional", "propagation", "传播行为", "隔离级别", "rollback", "回滚"],
    },
    {
        "name": "spring_aop",
        "test": re.compile(r"(aop|切面|代理|动态代理|cglib|jdk 代理|切点|通知)", re.I),
        "terms": ["AOP", "切面", "代理", "动态代理", "CGLIB", "JDK 代理", "切点", "通知"],
    },
    {
        "name": "spring_ioc_di",
        "test": re.compile(r"(ioc|依赖注入|di|bean 注入|bean装配|autowired|resource)", re.I),
        "terms": ["IOC", "依赖注入", "DI", "Bean", "@Autowired", "@Resource"],
    },
    {
        "name": "spring_circular_dependency",
        "test": re.compile(r"(循环依赖|circular dependency|三级缓存|early reference|singleton factories)", re.I),
        "terms": ["循环依赖", "circular dependency", "三级缓存", "early reference", "singleton factories"],
    },
    {
        "name": "spring_startup",
        "test": re.compile(r"(启动|startup|springapplication|refresh|beanfactory|beanpostprocessor|自动配置|autoconfiguration)", re.I),
        "terms": ["启动", "startup", "SpringApplication", "refresh", "BeanFactory", "BeanPostProcessor", "自动配置", "AutoConfiguration"],
    },
    {
        "name": "mysql_lock",
        "test": re.compile(r"(锁|lock|死锁|间隙锁|gap lock|next-key|next key|行锁|表锁)", re.I),
        "terms": ["锁", "lock", "死锁", "间隙锁", "gap lock", "next-key", "行锁", "表锁"],
    },
    {
        "name": "mysql_mvcc_txn",
        "test": re.compile(r"(mvcc|事务隔离|read committed|repeatable read|可重复读|读已提交|幻读)", re.I),
        "terms": ["MVCC", "事务隔离", "read committed", "repeatable read", "可重复读", "读已提交", "幻读"],
    },
    {
        "name": "mysql_index_sql",
        "test": re.compile(r"(索引|index|sql优化|sql 优化|执行计划|explain|回表|覆盖索引|最左前缀)", re.I),
        "terms": ["索引", "index", "SQL", "执行计划", "EXPLAIN", "回表", "覆盖索引", "最左前缀"],
    },
    {
        "name": "redis_cache_consistency",
        "test": re.compile(r"(redis|缓存一致性|cache consistency|双写|延迟双删|旁路缓存|cache aside)", re.I),
        "terms": ["Redis", "缓存一致性", "cache consistency", "双写", "延迟双删", "cache aside", "旁路缓存"],
    },
    {
        "name": "redis_breakdown",
        "test": re.compile(r"(击穿|穿透|雪崩|hot key|big key|缓存击穿|缓存穿透|缓存雪崩)", re.I),
        "terms": ["缓存击穿", "缓存穿透", "缓存雪崩", "hot key", "big key"],
    },
    {
        "name": "mq_core",
        "test": re.compile(r"(mq|消息队列|kafka|rabbitmq|rocketmq|消息堆积|消费模型)", re.I),
        "terms": ["MQ", "消息队列", "Kafka", "RabbitMQ", "RocketMQ", "消息堆积", "消费模型"],
    },
    {
        "name": "mq_reliability",
        "test": re.compile(r"(幂等|重试|重复消费|至少一次|at-least-once|顺序消息|死信)", re.I),
        "terms": ["幂等", "重试", "重复消费", "at-least-once", "顺序消息", "死信"],
    },
    {
        "name": "java_concurrency",
        "test": re.compile(r"(并发|concurrent|cas|aqs|线程|thread|线程池|可见性|原子性|有序性)", re.I),
        "terms": ["并发", "concurrent", "CAS", "AQS", "线程", "thread", "线程池", "可见性", "原子性", "有序性"],
    },
    {
        "name": "jvm_runtime",
        "test": re.compile(r"(jvm|gc|垃圾回收|内存模型|堆|栈|类加载|jmm)", re.I),
        "terms": ["JVM", "GC", "垃圾回收", "内存模型", "堆", "栈", "类加载", "JMM"],
    },
    {
        "name": "microservice_governance",
        "test": re.compile(r"(微服务|service governance|服务治理|注册发现|熔断|限流|降级|链路追踪)", re.I),
        "terms": ["微服务", "service governance", "服务治理", "注册发现", "熔断", "限流", "降级", "链路追踪"],
    },
    {
        "name": "distributed_ai",
        "test": re.compile(r"(ai|rag|向量|embedding|检索|prompt|agent|模型路由)", re.I),
        "terms": ["AI", "RAG", "向量", "embedding", "检索", "prompt", "agent", "模型路由"],
    },
]


def _normalize(text: str | None) -> str:
    return (text or "").strip()


def _match_rules(query: str | None) -> list[dict]:
    raw = _normalize(query)
    if not raw:
        return []
    return [rule for rule in RULES if rule["test"].search(raw)]


def get_bucket_terms(bucket: str | None) -> list[str]:
    if not bucket:
        return []
    for rule in RULES:
        if rule["name"] == bucket:
            return list(rule["terms"])
    return []


def get_bucket_label(bucket: str | None) -> str:
    return BUCKET_LABELS.get(bucket or "", bucket or "")


def get_bucket_doc_hints(bucket: str | None) -> list[str]:
    return list(BUCKET_DOC_HINTS.get(bucket or "", []))


def expand_query_terms(query: str | None) -> list[str]:
    raw = _normalize(query)
    if not raw:
        return []

    terms: list[str] = []
    seen: set[str] = set()

    def add(term: str):
        value = _normalize(term)
        key = value.lower()
        if not value or key in seen:
            return
        seen.add(key)
        terms.append(value)

    add(raw)
    for rule in _match_rules(raw):
        for term in rule["terms"]:
            add(term)
    return terms


def build_query_hints(query: str | None) -> dict:
    raw = _normalize(query)
    matched_rules = _match_rules(raw)
    terms = expand_query_terms(raw)
    matched_bucket_names = [rule["name"] for rule in matched_rules]
    semantic_bucket = matched_bucket_names[0] if len(matched_bucket_names) == 1 else None

    merged_terms: list[str] = []
    merged_doc_hints: list[str] = []
    seen_terms: set[str] = set()
    seen_docs: set[str] = set()
    for bucket in matched_bucket_names:
        for term in get_bucket_terms(bucket):
            key = term.lower()
            if key not in seen_terms:
                seen_terms.add(key)
                merged_terms.append(term)
        for hint in get_bucket_doc_hints(bucket):
            key = hint.lower()
            if key not in seen_docs:
                seen_docs.add(key)
                merged_doc_hints.append(hint)

    return {
        "query": raw,
        "canonical_query": terms[0] if terms else "",
        "aliases": terms,
        "semantic_bucket": semantic_bucket,
        "semantic_bucket_label": get_bucket_label(semantic_bucket) if semantic_bucket else "",
        "semantic_bucket_labels": [get_bucket_label(bucket) for bucket in matched_bucket_names],
        "semantic_bucket_terms": merged_terms if matched_bucket_names else get_bucket_terms(semantic_bucket),
        "semantic_bucket_doc_hints": merged_doc_hints if matched_bucket_names else get_bucket_doc_hints(semantic_bucket),
        "semantic_buckets": matched_bucket_names,
    }
