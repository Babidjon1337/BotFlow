"""Single entry point for parsing stored funnel schemas.

The database still contains V1 funnels, while new writes use V2. Keeping the
version switch here prevents handlers and repositories from drifting apart.
"""

from typing import Any

from schemas.funnel import FunnelSchemaOld, FunnelSchemaV2


StoredFunnelSchema = FunnelSchemaOld | FunnelSchemaV2


def parse_stored_funnel_schema(raw_schema: dict[str, Any]) -> StoredFunnelSchema:
    """Parse a stored V1 or V2 funnel without silently accepting bad data."""
    nodes = raw_schema.get("nodes")
    if isinstance(nodes, dict):
        return FunnelSchemaOld.model_validate(raw_schema)
    return FunnelSchemaV2.model_validate(raw_schema)
