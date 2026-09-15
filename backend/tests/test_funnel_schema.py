import pytest
from pydantic import ValidationError

from schemas.api_schemas import FunnelUpdateApiRequest
from schemas.funnel import FunnelSchemaV2


def test_frontend_delay_is_normalized_to_seconds():
    schema = FunnelUpdateApiRequest.model_validate(
        {
            "version": 2,
            "nodes": [
                {
                    "id": "start",
                    "step": "Старт",
                    "kind": "message",
                    "delay": "1 час",
                }
            ],
        }
    )

    assert schema.as_schema().model_dump(by_alias=True)["nodes"][0]["delay_seconds"] == 3600


def test_funnel_rejects_duplicate_node_ids():
    with pytest.raises(ValidationError, match="must be unique"):
        FunnelSchemaV2.model_validate(
            {
                "nodes": [
                    {"id": "start", "step": "Старт", "kind": "message"},
                    {"id": "start", "step": "Ещё раз", "kind": "message"},
                ]
            }
        )
