from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)
from typing import Dict, List, Optional, Literal, Any
import re


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
class FunnelMediaAssetSchema(BaseModel):
    media_file_id: str = Field(
        default="",
        validation_alias=AliasChoices("mediaFileId", "media_file_id", "fileId", "file_id"),
        serialization_alias="mediaFileId",
    )
    media_asset_id: str = Field(
        default="",
        validation_alias=AliasChoices("mediaAssetId", "media_asset_id", "id", "asset_id"),
        serialization_alias="mediaAssetId",
    )
    media_type: Literal["photo", "video", "document"] = Field(
        default="photo",
        validation_alias=AliasChoices("mediaType", "media_type", "type"),
        serialization_alias="mediaType",
    )
    file_name: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("fileName", "file_name", "filename"),
        serialization_alias="fileName",
    )

    model_config = ConfigDict(populate_by_name=True)


class TariffSchema(BaseModel):
    id: str
    name: str
    price: float
    old_price: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("old_price", "oldPrice"),
        serialization_alias="oldPrice",
    )
    description: str = ""
    has_delivery: bool = Field(default=True, alias="hasDelivery")
    action_type: Literal["link", "group", "text", "file"] = Field(default="link", alias="actionType")
    action_data: str = Field(default="", alias="actionData")
    chat_access_mode: str = Field(
        default="member", alias="chatAccessMode"
    )
    invite_expires_hours: int = Field(default=24, ge=1, le=168, alias="inviteExpiresHours")
    chat_type: Optional[Literal["channel", "group", "supergroup"]] = Field(
        default=None, alias="chatType"
    )
    media_file_id: Optional[str] = Field(default=None, alias="mediaFileId")
    media_asset_id: Optional[str] = Field(default=None, alias="mediaAssetId")
    media_type: Optional[Literal["photo", "video"]] = Field(default=None, alias="mediaType")
    media_assets: list[FunnelMediaAssetSchema] = Field(
        default_factory=list,
        validation_alias=AliasChoices("mediaAssets", "media_assets"),
        serialization_alias="mediaAssets",
    )
    deliverables: list[dict[str, Any]] = Field(default_factory=list)
    payment_type: Optional[str] = Field(
        default="one_time",
        validation_alias=AliasChoices("payment_type", "paymentType"),
        serialization_alias="paymentType",
    )
    recurring_period: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("recurring_period", "recurringPeriod"),
        serialization_alias="recurringPeriod",
    )
    sales_mode: Optional[str] = Field(
        default="auto",
        validation_alias=AliasChoices("sales_mode", "salesMode"),
        serialization_alias="salesMode",
    )
    manager_url: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("manager_url", "managerUrl"),
        serialization_alias="managerUrl",
    )
    button_text: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("button_text", "buttonText"),
        serialization_alias="buttonText",
    )

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("media_assets", mode="before")
    @classmethod
    def parse_tariff_media_assets(cls, v: Any) -> list:
        if v is None:
            return []
        if isinstance(v, list):
            return [item for item in v if item]
        return []


class FunnelNodeSchema(BaseModel):
    id: str                        # "start" | reminder id | "payment"
    step: str                      # отображаемое название
    subtitle: str = ""
    delay: Optional[str] = Field(default=None)
    delay_seconds: int = Field(
        default=0,
        validation_alias=AliasChoices("delay_seconds", "delay"),
        serialization_alias="delay_seconds",
    )
    kind: Literal["message", "reminder", "delivery", "payment"]
    content: str = ""              # HTML-текст (Telegram поддерживает parse_mode="HTML")
    button_text: str = Field(default="", alias="buttonText")
    button_text2: str = Field(default="", alias="buttonText2")
    payment_mode: Literal["auto", "application", "hybrid"] = Field(default="auto", alias="paymentMode")
    manager_text: str = Field(default="", alias="managerText")
    manager_url: str = Field(default="", alias="managerUrl")
    tariffs: list[TariffSchema] = Field(default_factory=list)
    tariff_selection_text: str = Field(default="", alias="tariffSelectionText")
    media_file_id: Optional[str] = Field(default=None, alias="mediaFileId")
    media_asset_id: Optional[str] = Field(default=None, alias="mediaAssetId")
    media_type: Optional[Literal["photo", "video", "document"]] = Field(default=None, alias="mediaType")
    media: Optional[bool] = False
    media_assets: list[FunnelMediaAssetSchema] = Field(
        default_factory=list,
        validation_alias=AliasChoices("mediaAssets", "media_assets"),
        serialization_alias="mediaAssets",
    )
    x: Optional[float] = 0
    y: Optional[float] = 0

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("media_assets", mode="before")
    @classmethod
    def parse_node_media_assets(cls, v: Any) -> list:
        if v is None:
            return []
        if isinstance(v, list):
            return [item for item in v if item]
        return []

    @model_validator(mode="before")
    @classmethod
    def resolve_delay_and_seconds(cls, data: Any) -> Any:
        if isinstance(data, dict):
            raw_delay = data.get("delay")
            if raw_delay is not None and isinstance(raw_delay, str) and raw_delay.strip():
                data["delay_seconds"] = cls.parse_delay(raw_delay)
            elif "delay_seconds" in data and not raw_delay:
                data["delay_seconds"] = cls.parse_delay(data.get("delay_seconds"))
        return data

    @model_validator(mode="after")
    def sync_primary_media_fields(self):
        if self.media_assets and len(self.media_assets) > 0:
            self.media = True
            if not self.media_file_id:
                self.media_file_id = self.media_assets[0].media_file_id
            if not self.media_asset_id:
                self.media_asset_id = self.media_assets[0].media_asset_id
            if not self.media_type:
                self.media_type = self.media_assets[0].media_type
        elif self.media_file_id and self.media_asset_id and not self.media_assets:
            self.media = True
            self.media_assets = [
                FunnelMediaAssetSchema(
                    mediaFileId=self.media_file_id,
                    mediaAssetId=self.media_asset_id,
                    mediaType=self.media_type or "photo",
                )
            ]
        if self.delay_seconds > 0:
            h = self.delay_seconds // 3600
            m = (self.delay_seconds % 3600) // 60
            if h > 0 and m > 0:
                self.delay = f"{h}ч {m} мин"
            elif h > 0:
                self.delay = f"{h}ч"
            elif m > 0:
                self.delay = f"{m} мин"
            else:
                self.delay = f"{self.delay_seconds} сек"
        elif not self.delay or self.delay in ("0", "0м", "0 мин"):
            self.delay = "0 мин"
        return self

    @field_validator("delay_seconds", mode="before")
    @classmethod
    def parse_delay(cls, v: Any) -> int:
        if isinstance(v, int):
            return v
        if isinstance(v, float):
            return int(v)
        if isinstance(v, str):
            normalized = v.strip().lower()
            if not normalized:
                return 0
            mapping = {
                "0 мин": 0, "0м": 0, "0": 0,
                "1м": 60, "1 мин": 60, "1 минута": 60, "1m": 60, "1min": 60, "1 minute": 60,
                "2м": 120, "2 мин": 120, "2 минуты": 120,
                "3м": 180, "3 мин": 180, "3 минуты": 180,
                "5м": 300, "5 мин": 300, "5 минут": 300,
                "10м": 600, "10 мин": 600, "10 минут": 600,
                "15м": 900, "15 мин": 900, "15 минут": 900,
                "30м": 1800, "30 мин": 1800, "30 минут": 1800,
                "1ч": 3600, "1 час": 3600,
                "2ч": 7200, "2 часа": 7200,
                "3ч": 10800, "3 часа": 10800,
                "6ч": 21600, "6 часов": 21600,
                "12ч": 43200, "12 часов": 43200,
                "24ч": 86400, "24 часа": 86400,
                "48ч": 172800, "48 часов": 172800,
            }
            if normalized in mapping:
                return mapping[normalized]

            hours = 0
            minutes = 0

            h_match = re.search(r"(\d+)\s*(?:ч|час|часа|часов|h|hours?)\b", normalized, re.IGNORECASE)
            if not h_match:
                h_match = re.search(r"(\d+)\s*(?:ч|час|часа|часов|h)", normalized, re.IGNORECASE)

            m_match = re.search(r"(\d+)\s*(?:мин|минута|минуты|минут|m|mins?|minutes?)\b", normalized, re.IGNORECASE)
            if not m_match:
                m_match = re.search(r"(\d+)\s*м(?![а-яa-z])", normalized, re.IGNORECASE)

            if h_match or m_match:
                if h_match:
                    hours = int(h_match.group(1))
                if m_match:
                    minutes = int(m_match.group(1))
                return hours * 3600 + minutes * 60

            if normalized.isdigit():
                return int(normalized)

            return 0
        return 0


class FunnelSchemaV2(BaseModel):
    version: int = 2
    nodes: list[FunnelNodeSchema] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_node_ids(self):
        node_ids = [node.id for node in self.nodes]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("Funnel node IDs must be unique")
        return self

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
