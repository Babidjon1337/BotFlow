from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Dict, List, Optional, Literal, Any


# ==========================================
# СТАРАЯ СХЕМА (для обратной совместимости, если потребуется)
# ==========================================
class MediaConfig(BaseModel):
    type: Literal["video", "photo"] | None
    file_id: Optional[str] = None


class ContentConfig(BaseModel):
    media: MediaConfig
    text: str = ""


class ButtonConfig(BaseModel):
    type: Literal["payment", "url", "next_step"]
    text: str
    url: Optional[str] = None
    next_node_id: Optional[str] = None


class TimerConfig(BaseModel):
    delay_seconds: int
    next_node_id: str


class NodeConfig(BaseModel):
    type: str = "message"
    loading_text: Optional[str] = None
    content: ContentConfig
    button: Optional[ButtonConfig] = None
    timer: Optional[TimerConfig] = None


class GlobalSettings(BaseModel):
    legal_offer_url: Optional[str] = None
    legal_privacy_url: Optional[str] = None
    agreement_text: str = "Для продолжения работы с ботом, пожалуйста, ознакомьтесь и подтвердите согласие с юридическими документами."
    payment_amount: float


class FunnelSchemaOld(BaseModel):
    global_settings: GlobalSettings
    nodes: Dict[str, NodeConfig]


# ==========================================
# НОВАЯ СХЕМА V2 (Совместимая с Frontend React)
# ==========================================
class TariffSchema(BaseModel):
    id: str
    name: str
    price: float
    description: str = ""
    has_delivery: bool = Field(default=True, alias="hasDelivery")
    action_type: Literal["link", "group", "text", "file"] = Field(default="link", alias="actionType")
    action_data: str = Field(default="", alias="actionData")

    model_config = ConfigDict(populate_by_name=True)


class FunnelNodeSchema(BaseModel):
    id: str                        # "start" | "push1" | "push2" | "payment"
    step: str                      # отображаемое название
    subtitle: str = ""
    delay_seconds: int = Field(default=0, alias="delay_seconds")
    kind: Literal["message", "reminder", "delivery", "payment"]
    content: str = ""              # HTML-текст (Telegram поддерживает parse_mode="HTML")
    button_text: str = Field(default="", alias="buttonText")
    button_text2: str = Field(default="", alias="buttonText2")
    payment_mode: Literal["auto", "application", "hybrid"] = Field(default="auto", alias="paymentMode")
    manager_text: str = Field(default="", alias="managerText")
    tariffs: list[TariffSchema] = []
    tariff_selection_text: str = Field(default="", alias="tariffSelectionText")
    media_file_id: Optional[str] = Field(default=None, alias="mediaFileId")
    media_type: Optional[Literal["photo", "video"]] = Field(default=None, alias="mediaType")
    media: Optional[bool] = False
    x: Optional[float] = 0
    y: Optional[float] = 0

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("delay_seconds", mode="before")
    @classmethod
    def parse_delay(cls, v: Any) -> int:
        if isinstance(v, int):
            return v
        if isinstance(v, str):
            mapping = {
                "0 мин": 0, "0м": 0, "0": 0,
                "1ч": 3600, "1 час": 3600,
                "6ч": 21600, "6 часов": 21600,
                "12ч": 43200, "12 часов": 43200,
                "24ч": 86400, "24 часа": 86400,
                "48ч": 172800, "48 часов": 172800,
            }
            return mapping.get(v.strip(), 0)
        return 0


class FunnelSchemaV2(BaseModel):
    version: int = 2
    nodes: list[FunnelNodeSchema] = []

    model_config = ConfigDict(populate_by_name=True)

    def get_node(self, node_id: str) -> Optional[FunnelNodeSchema]:
        """Возвращает узел воронки по его ID."""
        return next((n for n in self.nodes if n.id == node_id), None)

    def get_next_node(self, current_node_id: str) -> Optional[FunnelNodeSchema]:
        """Возвращает следующий узел воронки в массиве после current_node_id."""
        for i, n in enumerate(self.nodes):
            if n.id == current_node_id:
                if i + 1 < len(self.nodes):
                    return self.nodes[i + 1]
                break
        return None


# Алиас для новой схемы, чтобы импорт FunnelSchema использовал V2
FunnelSchema = FunnelSchemaV2

