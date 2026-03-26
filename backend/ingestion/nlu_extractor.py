from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from ingestion.file_parser import ParseResult

# ---------------------------------------------------------------------------
# Column alias table — grows as real mall data comes in
# ---------------------------------------------------------------------------

COLUMN_ALIASES: dict[str, list[str]] = {
    # ---- venue fields ----
    "name": [
        "商户名称", "店铺名", "品牌名", "name", "店名", "商户", "品牌",
        "商家名称", "门店名", "店铺名称", "brand",
    ],
    "floor_code": [
        "楼层", "floor", "所在楼层", "层", "FL", "楼层号",
    ],
    "venue_type": [
        "业态", "类型", "type", "业态类型", "经营类型", "业态分类",
    ],
    "category": [
        "品类", "分类", "category", "细分", "细分品类", "子类",
    ],
    "location_code": [
        "铺位号", "铺位", "位置", "编号", "shop_no", "铺号", "店铺编号",
    ],
    "budget_text": [
        "人均", "人均消费", "客单价", "price", "均价", "消费水平", "人均价格",
    ],
    "description": [
        "简介", "描述", "介绍", "备注", "说明", "商户介绍",
    ],
    "open_hours": [
        "营业时间", "开店时间", "hours", "营业", "运营时间",
    ],
    "rating": [
        "评分", "rating", "评价", "星级",
    ],
    "phone": [
        "电话", "联系方式", "phone", "手机", "tel", "联系电话",
    ],
    # ---- event fields ----
    "title": [
        "活动名称", "标题", "title", "活动", "主题", "名称",
    ],
    "event_type": [
        "活动类型", "event_type", "活动分类",
    ],
    "start_time": [
        "开始时间", "开始日期", "start", "起始", "开始",
    ],
    "end_time": [
        "结束时间", "结束日期", "end", "截止", "结束",
    ],
    # ---- offer fields ----
    "price_text": [
        "优惠价", "活动价", "价格", "deal_price", "售价", "促销价",
    ],
    "venue_name": [
        "所属商户", "关联商户", "关联店铺",
    ],
    # ---- ignore ----
    "ignore": [
        "序号", "合同编号", "租金", "面积", "联系人", "备注2",
        "No", "no", "#", "ID", "id",
    ],
}

VENUE_INDICATOR_FIELDS = {"name", "venue_type", "category", "floor_code", "location_code", "budget_text"}
EVENT_INDICATOR_FIELDS = {"title", "event_type", "start_time", "end_time"}
OFFER_INDICATOR_FIELDS = {"title", "price_text", "venue_name"}


@dataclass
class ExtractedEntity:
    entity_type: str
    confidence: float
    data: dict
    source_row: int | None = None
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Rule-based column matching
# ---------------------------------------------------------------------------

def match_columns(headers: list[str]) -> dict[str, str]:
    """Map raw column headers to standard field names."""
    mapping: dict[str, str] = {}
    alias_lookup: dict[str, str] = {}
    for standard_field, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            alias_lookup[alias.lower().strip()] = standard_field

    for header in headers:
        clean = header.strip().lower()
        if clean in alias_lookup:
            mapping[header] = alias_lookup[clean]

    return mapping


def _column_match_rate(mapping: dict[str, str], headers: list[str]) -> float:
    if not headers:
        return 0.0
    matched = sum(1 for h in headers if h in mapping and mapping[h] != "ignore")
    total = len(headers)
    return matched / total if total > 0 else 0.0


def _classify_entity_type(matched_fields: set[str]) -> str:
    venue_score = len(matched_fields & VENUE_INDICATOR_FIELDS)
    event_score = len(matched_fields & EVENT_INDICATOR_FIELDS)
    offer_score = len(matched_fields & OFFER_INDICATOR_FIELDS)

    if venue_score >= event_score and venue_score >= offer_score and venue_score >= 2:
        return "venue"
    if event_score >= venue_score and event_score >= offer_score and event_score >= 2:
        return "event"
    if offer_score >= 1 and "price_text" in matched_fields:
        return "offer"

    if "name" in matched_fields or "title" in matched_fields:
        return "venue"
    return "knowledge"


# ---------------------------------------------------------------------------
# Rule-based extraction (Excel/CSV with recognizable headers)
# ---------------------------------------------------------------------------

def _extract_structured_by_rules(
    parse_result: ParseResult,
    mapping: dict[str, str],
    entity_type: str,
) -> list[ExtractedEntity]:
    entities: list[ExtractedEntity] = []

    for row_idx, row in enumerate(parse_result.structured_rows):
        data: dict = {}
        tags: list[list[str]] = []

        for raw_col, standard_field in mapping.items():
            if standard_field == "ignore":
                continue
            value = row.get(raw_col, "").strip()
            if not value:
                continue
            data[standard_field] = value

        if not data.get("name") and not data.get("title"):
            continue

        if entity_type == "venue" and data.get("venue_type"):
            tags.append(["venue_type_raw", data["venue_type"]])
        if entity_type == "venue" and data.get("category"):
            tags.append(["category_raw", data["category"]])
        if tags:
            data["tags"] = tags

        warnings: list[str] = []
        if entity_type == "venue" and not data.get("name"):
            warnings.append("Missing venue name")
        if entity_type == "event" and not data.get("title"):
            warnings.append("Missing event title")

        entities.append(ExtractedEntity(
            entity_type=entity_type,
            confidence=0.90,
            data=data,
            source_row=row_idx,
            warnings=warnings,
        ))

    return entities


# ---------------------------------------------------------------------------
# LLM-based extraction
# ---------------------------------------------------------------------------

HEADER_MAPPING_PROMPT = """你是商场数据提取助手。

这是一张商场数据表格的表头和前几行样本数据：

表头：{headers}
{sample_lines}

请判断：
1. 这张表的 entity_type 是什么？(venue / event / offer)
2. 每个列名对应哪个标准字段？

标准字段列表：
- venue: name, venue_type, category, floor_code, location_code, budget_text, description, open_hours, rating, phone
- event: title, event_type, description, start_time, end_time
- offer: title, venue_name, price_text, description, start_time, end_time

如果某列不属于以上任何字段，映射为 "ignore"。

输出 JSON：
{{"entity_type": "venue", "column_mapping": {{"原列名": "标准字段名"}}}}"""


TEXT_EXTRACTION_PROMPT = """你是商场数据提取助手。

以下是从 {file_type} 文件中提取的文本：
---
{raw_text}
---
{hint_line}
请完成：
1. 判断包含哪些实体（venue / event / offer / knowledge）
2. 按 schema 提取所有实体

每种 entity_type 的标准字段：
- venue:
  - name: 商户名称
  - venue_type: 必须是以下之一 → restaurant, cafe, bar, retail, entertainment, cinema, bookstore, arcade, gym, salon, supermarket, service, unknown
  - category: 细分品类，用中文（如 川菜、粤菜、日料、火锅、潮玩、服装、美妆）
  - floor_code: 楼层（如 B1, L1, L2）
  - location_code: 铺位号
  - budget_text: 人均消费，保留原文
  - description: 简介
  - open_hours: 营业时间
  - rating: 评分（0-5 的数字）
  - tags: 标签数组，每个元素为 [tag_type, tag_value]，tag_type 可以是 cuisine/ambiance/facility/scene/feature/theme
- event:
  - title, event_type (exhibition/promotion/workshop/pop_up/performance), description, start_time, end_time
- offer:
  - title, venue_name, price_text, description, start_time, end_time
- knowledge:
  - title, content

输出格式：
{{
  "entities": [
    {{
      "entity_type": "venue",
      "confidence": 0.95,
      "data": {{...}}
    }}
  ]
}}

规则：
- venue_type 必须从上面的枚举值中选择，不要用其他写法
- category 用中文表述（如"粤菜"而不是"Cantonese"）
- 原文找不到的字段输出 null，绝对不要猜测
- 时间保留原始文本（如"五一期间"），不要编造精确 ISO 日期
- 价格保留原始表述
- 不确定 entity_type 的内容归为 "knowledge"
- 只输出纯 JSON，不要 markdown 包裹"""


async def _llm_header_mapping(
    headers: list[str],
    sample_rows: list[dict],
) -> tuple[str, dict[str, str]]:
    """Use LLM to map unrecognized column headers. Returns (entity_type, mapping)."""
    from services.openrouter import call_openrouter

    sample_lines = ""
    for i, row in enumerate(sample_rows[:3]):
        values = [str(row.get(h, "")) for h in headers]
        sample_lines += f"第{i+1}行：{values}\n"

    prompt = HEADER_MAPPING_PROMPT.format(
        headers=headers,
        sample_lines=sample_lines,
    )

    raw = await call_openrouter(
        [{"role": "user", "content": prompt}],
        json_mode=True,
    )

    try:
        result = json.loads(raw)
        entity_type = result.get("entity_type", "venue")
        column_mapping = result.get("column_mapping", {})
        return entity_type, column_mapping
    except (json.JSONDecodeError, KeyError):
        return "venue", {}


async def _llm_text_extraction(
    raw_text: str,
    file_type: str,
    hint: str | None = None,
) -> list[ExtractedEntity]:
    """Use LLM to extract entities from unstructured text."""
    from services.openrouter import call_openrouter

    truncated = raw_text[:6000]
    hint_line = f"用户提示：{hint}\n" if hint else ""

    prompt = TEXT_EXTRACTION_PROMPT.format(
        file_type=file_type,
        raw_text=truncated,
        hint_line=hint_line,
    )

    raw = await call_openrouter(
        [{"role": "user", "content": prompt}],
        json_mode=True,
    )

    try:
        result = json.loads(raw)
        raw_entities = result.get("entities", [])
    except (json.JSONDecodeError, KeyError):
        return [ExtractedEntity(
            entity_type="knowledge",
            confidence=0.5,
            data={"title": "Unparsed content", "content": truncated[:2000]},
            warnings=["LLM returned invalid JSON"],
        )]

    entities: list[ExtractedEntity] = []
    for raw_entity in raw_entities:
        entity_type = raw_entity.get("entity_type", "knowledge")
        confidence = raw_entity.get("confidence", 0.7)
        data = raw_entity.get("data", {})

        if data is None:
            continue

        cleaned = {k: v for k, v in data.items() if v is not None}
        entities.append(ExtractedEntity(
            entity_type=entity_type,
            confidence=float(confidence),
            data=cleaned,
        ))

    return entities


# ---------------------------------------------------------------------------
# Multimodal extraction (scanned PDFs, images without OCR)
# ---------------------------------------------------------------------------

MULTIMODAL_PROMPT = """你是商场数据提取助手。

请仔细查看这个文件的内容，识别其中所有文字，并提取出商场相关的实体数据。
{hint_line}
每种 entity_type 的标准字段：
- venue:
  - name: 商户名称
  - venue_type: 必须是以下之一 → restaurant, cafe, bar, retail, entertainment, cinema, bookstore, arcade, gym, salon, supermarket, service, unknown
  - category: 细分品类，用中文（如 川菜、粤菜、日料、火锅、潮玩、服装、美妆）
  - floor_code: 楼层（如 B1, L1, L2）
  - location_code: 铺位号
  - budget_text: 人均消费，保留原文
  - description: 简介
  - open_hours: 营业时间
  - rating: 评分（0-5 的数字）
  - tags: 标签数组，每个元素为 [tag_type, tag_value]
- event:
  - title, event_type (exhibition/promotion/workshop/pop_up/performance), description, start_time, end_time
- offer:
  - title, venue_name, price_text, description, start_time, end_time
- knowledge:
  - title, content

输出格式：
{{
  "entities": [
    {{
      "entity_type": "venue",
      "confidence": 0.95,
      "data": {{...}}
    }}
  ]
}}

规则：
- venue_type 必须从上面的枚举值中选择，不要用其他写法
- category 用中文表述
- 先识别文件中的所有文字，再从中提取实体
- 原文找不到的字段输出 null，绝对不要猜测
- 时间保留原始文本，不要编造精确 ISO 日期
- 价格保留原始表述
- 不确定 entity_type 的内容归为 "knowledge"
- 如果文件内容无法识别或没有商场相关数据，返回 {{"entities": []}}
- 只输出纯 JSON"""


async def _llm_multimodal_extraction(
    file_path: str,
    mime_type: str = "application/pdf",
    hint: str | None = None,
) -> list[ExtractedEntity]:
    """Send a file (scanned PDF or image) to multimodal LLM for extraction."""
    import base64
    from services.openrouter import call_openrouter

    with open(file_path, "rb") as f:
        file_bytes = f.read()

    b64 = base64.b64encode(file_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    hint_line = f"用户提示：{hint}\n" if hint else ""
    prompt_text = MULTIMODAL_PROMPT.format(hint_line=hint_line)

    messages = [{
        "role": "user",
        "content": [
            {"type": "text", "text": prompt_text},
            {"type": "image_url", "image_url": {"url": data_url}},
        ],
    }]

    raw = await call_openrouter(messages, json_mode=True)

    try:
        result = json.loads(raw)
        raw_entities = result.get("entities", [])
    except (json.JSONDecodeError, KeyError):
        return [ExtractedEntity(
            entity_type="knowledge",
            confidence=0.5,
            data={"title": "Multimodal extraction failed", "content": raw[:2000]},
            warnings=["LLM returned invalid JSON from multimodal input"],
        )]

    entities: list[ExtractedEntity] = []
    for raw_entity in raw_entities:
        entity_type = raw_entity.get("entity_type", "knowledge")
        confidence = raw_entity.get("confidence", 0.7)
        data = raw_entity.get("data", {})
        if data is None:
            continue
        cleaned = {k: v for k, v in data.items() if v is not None}
        entities.append(ExtractedEntity(
            entity_type=entity_type,
            confidence=float(confidence),
            data=cleaned,
        ))

    return entities


# ---------------------------------------------------------------------------
# Main extraction dispatcher
# ---------------------------------------------------------------------------

MATCH_RATE_THRESHOLD = 0.5

MIME_MAP = {
    "pdf": "application/pdf",
    "image": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}


async def extract(
    parse_result: ParseResult,
    hint: str | None = None,
) -> list[ExtractedEntity]:
    """
    Extract structured entities from a ParseResult.

    For structured data (Excel/CSV), tries rule-based column matching first.
    Falls back to LLM for unrecognized headers or unstructured text.
    For scanned PDFs and images, uses multimodal LLM.
    """

    # Path A: structured rows available (Excel, CSV, PDF tables)
    if parse_result.structured_rows and parse_result.headers:
        mapping = match_columns(parse_result.headers)
        match_rate = _column_match_rate(mapping, parse_result.headers)

        if match_rate >= MATCH_RATE_THRESHOLD:
            matched_fields = set(mapping.values()) - {"ignore"}
            entity_type = _classify_entity_type(matched_fields)
            return _extract_structured_by_rules(parse_result, mapping, entity_type)

        # Fallback: LLM header mapping (1 call for the whole table)
        entity_type, llm_mapping = await _llm_header_mapping(
            parse_result.headers,
            parse_result.structured_rows,
        )
        if llm_mapping:
            return _extract_structured_by_rules(parse_result, llm_mapping, entity_type)

    # Path B: unstructured text (PDF body, Word, OCR output)
    if parse_result.raw_text and len(parse_result.raw_text.strip()) > 20:
        return await _llm_text_extraction(
            parse_result.raw_text,
            parse_result.file_type,
            hint=hint,
        )

    # Path C: scanned PDF or image — send to multimodal LLM
    if parse_result.metadata.get("needs_multimodal"):
        file_path = parse_result.metadata.get("file_path", "")
        if file_path:
            mime_type = MIME_MAP.get(parse_result.file_type, "application/octet-stream")
            return await _llm_multimodal_extraction(file_path, mime_type, hint=hint)

    return []
