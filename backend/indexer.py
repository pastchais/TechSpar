"""LlamaIndex indexing for resume and interview knowledge base."""
import json
import logging
from pathlib import Path

from llama_index.core import (
    SimpleDirectoryReader,
    VectorStoreIndex,
    StorageContext,
    load_index_from_storage,
    Settings as LlamaSettings,
)

from backend.config import settings
from backend.llm_provider import get_llama_llm, get_embedding
from backend.query_hints import expand_query_terms

logger = logging.getLogger("uvicorn")

# In-memory index cache keyed by (user_id, topic_or_resume)
_index_cache: dict[tuple[str, str], "VectorStoreIndex"] = {}


def load_topics(user_id: str) -> dict:
    """Load topics from user's topics.json. Returns {key: {name, icon, dir}}."""
    path = settings.user_topics_path(user_id)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def save_topics(topics: dict, user_id: str):
    """Write topics back to user's topics.json."""
    path = settings.user_topics_path(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(topics, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def get_topic_map(user_id: str) -> dict[str, str]:
    """Returns {key: dir_name}."""
    return {k: v["dir"] for k, v in load_topics(user_id).items()}


def _init_llama_settings():
    LlamaSettings.llm = get_llama_llm()
    LlamaSettings.embed_model = get_embedding()


def build_resume_index(user_id: str, force_rebuild: bool = False) -> VectorStoreIndex:
    """Build or load the resume index."""
    cache_key = (user_id, "resume")
    if cache_key in _index_cache and not force_rebuild:
        return _index_cache[cache_key]

    _init_llama_settings()
    resume_path = settings.user_resume_path(user_id)
    cache_dir = settings.user_index_cache_path(user_id) / "resume"

    if cache_dir.exists() and not force_rebuild:
        storage_context = StorageContext.from_defaults(persist_dir=str(cache_dir))
        index = load_index_from_storage(storage_context)
    else:
        docs = SimpleDirectoryReader(
            input_dir=str(resume_path),
            recursive=True,
        ).load_data()
        index = VectorStoreIndex.from_documents(docs)
        cache_dir.mkdir(parents=True, exist_ok=True)
        index.storage_context.persist(persist_dir=str(cache_dir))

    _index_cache[cache_key] = index
    return index


def build_topic_index(topic: str, user_id: str, force_rebuild: bool = False) -> VectorStoreIndex:
    """Build or load index for a specific knowledge topic."""
    cache_key = (user_id, topic)
    if cache_key in _index_cache and not force_rebuild:
        return _index_cache[cache_key]

    _init_llama_settings()

    topic_map = get_topic_map(user_id)
    if topic not in topic_map:
        raise ValueError(f"Unknown topic: {topic}. Available: {list(topic_map.keys())}")

    dir_name = topic_map[topic]
    topic_dir = settings.user_knowledge_path(user_id) / dir_name
    cache_dir = settings.user_index_cache_path(user_id) / topic

    if cache_dir.exists() and not force_rebuild:
        storage_context = StorageContext.from_defaults(persist_dir=str(cache_dir))
        index = load_index_from_storage(storage_context)
    else:
        if not topic_dir.exists():
            raise FileNotFoundError(f"Knowledge directory not found: {topic_dir}")

        docs = SimpleDirectoryReader(
            input_dir=str(topic_dir),
            recursive=True,
            required_exts=[".md", ".txt", ".py"],
        ).load_data()

        if not docs:
            raise ValueError(f"No documents found in {topic_dir}")

        index = VectorStoreIndex.from_documents(docs)
        cache_dir.mkdir(parents=True, exist_ok=True)
        index.storage_context.persist(persist_dir=str(cache_dir))

    _index_cache[cache_key] = index
    return index


def _build_effective_query(query: str) -> str:
    terms = expand_query_terms(query)
    return " ".join(terms) if terms else query


def _load_topic_docs_fallback(topic: str, user_id: str, max_chars: int = 8000, query: str | None = None) -> list[str]:
    """Fallback local-doc loader when vector indexing/embedding is unavailable."""
    topic_map = get_topic_map(user_id)
    if topic not in topic_map:
        return []

    topic_dir = settings.user_knowledge_path(user_id) / topic_map[topic]
    if not topic_dir.exists():
        return []

    terms = expand_query_terms(query)
    scored_chunks: list[tuple[int, str]] = []
    total = 0
    for path in sorted(topic_dir.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".md", ".txt", ".py"}:
            continue
        try:
            text = path.read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if not text:
            continue
        snippet = f"# {path.relative_to(topic_dir)}\n{text[:1800]}"
        lower = snippet.lower()
        score = 0
        for term in terms:
            t = str(term).lower()
            if t and t in lower:
                score += 1
        scored_chunks.append((score, snippet))

    scored_chunks.sort(key=lambda x: (-x[0], x[1][:80]))
    chunks = []
    for score, snippet in scored_chunks:
        if total >= max_chars:
            break
        chunks.append(snippet)
        total += len(snippet)
    return chunks


def query_resume(question: str, user_id: str, top_k: int = 3) -> str:
    """Query the resume index."""
    index = build_resume_index(user_id)
    engine = index.as_query_engine(similarity_top_k=top_k)
    response = engine.query(question)
    return str(response)


def query_topic(topic: str, question: str, user_id: str, top_k: int = 5) -> str:
    """Query a topic knowledge base."""
    effective_query = _build_effective_query(question)
    try:
        index = build_topic_index(topic, user_id)
        engine = index.as_query_engine(similarity_top_k=top_k)
        response = engine.query(effective_query)
        return str(response)
    except Exception as e:
        logger.warning(f"query_topic fallback for topic={topic}: {e}")
        return "\n\n---\n\n".join(_load_topic_docs_fallback(topic, user_id, max_chars=5000, query=question))


def retrieve_topic_context(topic: str, question: str, user_id: str, top_k: int = 5) -> list[str]:
    """Retrieve raw text chunks from topic index (for answer evaluation).

    Falls back to local docs when embeddings/index build are unavailable, so drill/review
    can still proceed under degraded retrieval quality instead of hard failing.
    """
    effective_query = _build_effective_query(question)
    try:
        index = build_topic_index(topic, user_id)
        retriever = index.as_retriever(similarity_top_k=top_k)
        nodes = retriever.retrieve(effective_query)
        return [node.get_content() for node in nodes]
    except Exception as e:
        logger.warning(f"retrieve_topic_context fallback for topic={topic}: {e}")
        return _load_topic_docs_fallback(topic, user_id, query=question)
