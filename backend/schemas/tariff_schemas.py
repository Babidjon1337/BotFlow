"""Pydantic schemas for the Tariffs and Deliverables system."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

DeliverableType = Literal["channel", "group", "file", "link"]
PaymentType = Literal["one_time", "recurring", "subscription"]
SalesMode = Literal["auto", "manual", "hybrid", "application"]


class DeliverableSchema(BaseModel):
    """Deliverable item for a tariff (channel, group, file, or link)."""

    type: DeliverableType
    # Channel & group fields
    chat_id: Optional[str] = Field(None, alias="chatId")
    title: Optional[str] = None
    access_mode: Optional[str] = Field(default="member", alias="accessMode")
    invite_link_settings: Optional[Dict[str, Any]] = Field(
        default_factory=dict, alias="inviteLinkSettings"
    )

    # File fields
    file_path: Optional[str] = Field(None, alias="filePath")
    url: Optional[str] = None
    filename: Optional[str] = None
    size_bytes: Optional[int] = Field(None, alias="sizeBytes")
    size: Optional[int] = None

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    @model_validator(mode="before")
    @classmethod
    def normalize_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Normalise path / filePath / fileUrl
            if "path" in data and "filePath" not in data and "file_path" not in data:
                data["filePath"] = data["path"]
            if "file_path" in data and "filePath" not in data:
                data["filePath"] = data["file_path"]
            if "fileUrl" in data and "filePath" not in data and "url" not in data:
                data["url"] = data["fileUrl"]
                data["filePath"] = data["fileUrl"]

            # Normalise size / sizeBytes / fileSize
            if "fileSize" in data and "sizeBytes" not in data and "size_bytes" not in data:
                data["sizeBytes"] = data["fileSize"]
            if "size" in data and "sizeBytes" not in data and "size_bytes" not in data:
                data["sizeBytes"] = data["size"]

            # Normalise originalName / filename / fileName
            if "fileName" in data and "filename" not in data:
                data["filename"] = data["fileName"]
            if "originalName" in data and "filename" not in data:
                data["filename"] = data["originalName"]
            if "original_name" in data and "filename" not in data:
                data["filename"] = data["original_name"]

            # Normalise linkUrl
            if "linkUrl" in data and not data.get("url"):
                data["url"] = data["linkUrl"]

            # Normalise url / file_path for files
            if data.get("type") == "file":
                if not data.get("url") and (data.get("filePath") or data.get("file_path")):
                    data["url"] = data.get("filePath") or data.get("file_path")
                if not (data.get("filePath") or data.get("file_path")) and data.get("url"):
                    data["filePath"] = data.get("url")
                if not data.get("filename") and data.get("title"):
                    data["filename"] = data.get("title")
        return data

    @model_validator(mode="after")
    def validate_deliverable_fields(self) -> "DeliverableSchema":
        if self.type in ("channel", "group"):
            if not self.chat_id or not str(self.chat_id).strip():
                raise ValueError(f"Для выдачи типа '{self.type}' необходимо указать chatId (ID чата/канала).")
        elif self.type == "file":
            path = self.file_path or self.url
            if not path or not str(path).strip():
                raise ValueError("Для выдачи типа 'file' необходимо указать путь или URL к файлу.")
            if not self.filename or not str(self.filename).strip():
                raise ValueError("Для выдачи типа 'file' необходимо указать имя файла.")
        elif self.type == "link":
            if not self.url or not str(self.url).strip():
                raise ValueError("Для выдачи типа 'link' необходимо указать URL ссылки.")
        return self


class TariffCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Название тарифа")
    description: Optional[str] = Field(None, max_length=4096, description="Описание тарифа")
    price: float = Field(default=0.0, ge=0, description="Стоимость в рублях")
    old_price: Optional[float] = Field(None, ge=0, alias="oldPrice", description="Старая зачёркнутая цена")
    payment_type: PaymentType = Field(default="one_time", alias="paymentType")
    recurring_period: Optional[str] = Field(None, alias="recurringPeriod")
    sales_mode: SalesMode = Field(default="auto", alias="salesMode")
    manager_url: Optional[str] = Field(None, max_length=512, alias="managerUrl", description="Ссылка на менеджера")
    button_text: Optional[str] = Field(None, max_length=255, alias="buttonText", description="Кастомный текст кнопки")
    is_active: bool = Field(default=True, alias="isActive")
    media_assets: List[Dict[str, Any]] = Field(default_factory=list, alias="mediaAssets")
    deliverables: List[DeliverableSchema] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_create_request(cls, data: Any) -> Any:
        if isinstance(data, dict):
            pt = data.get("paymentType") or data.get("payment_type")
            if pt == "subscription":
                data["paymentType"] = "recurring"
                data["payment_type"] = "recurring"
            sm = data.get("salesMode") or data.get("sales_mode")
            if sm == "application":
                data["salesMode"] = "manual"
                data["sales_mode"] = "manual"
        return data

    @model_validator(mode="after")
    def validate_recurring(self) -> "TariffCreateRequest":
        if self.payment_type == "recurring" and not self.recurring_period:
            self.recurring_period = "1_month"
        return self


class TariffUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=4096)
    price: Optional[float] = Field(None, ge=0)
    old_price: Optional[float] = Field(None, ge=0, alias="oldPrice")
    payment_type: Optional[PaymentType] = Field(None, alias="paymentType")
    recurring_period: Optional[str] = Field(None, alias="recurringPeriod")
    sales_mode: Optional[SalesMode] = Field(None, alias="salesMode")
    manager_url: Optional[str] = Field(None, max_length=512, alias="managerUrl")
    button_text: Optional[str] = Field(None, max_length=255, alias="buttonText")
    is_active: Optional[bool] = Field(None, alias="isActive")
    media_assets: Optional[List[Dict[str, Any]]] = Field(None, alias="mediaAssets")
    deliverables: Optional[List[DeliverableSchema]] = None

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_update_request(cls, data: Any) -> Any:
        if isinstance(data, dict):
            pt = data.get("paymentType") or data.get("payment_type")
            if pt == "subscription":
                data["paymentType"] = "recurring"
                data["payment_type"] = "recurring"
            sm = data.get("salesMode") or data.get("sales_mode")
            if sm == "application":
                data["salesMode"] = "manual"
                data["sales_mode"] = "manual"
        return data


class TariffApiResponse(BaseModel):
    id: str
    bot_id: int = Field(..., alias="botId")
    name: str
    description: Optional[str] = None
    price: float
    old_price: Optional[float] = Field(None, alias="oldPrice")
    payment_type: str = Field(..., alias="paymentType")
    recurring_period: Optional[str] = Field(None, alias="recurringPeriod")
    sales_mode: str = Field(..., alias="salesMode")
    manager_url: Optional[str] = Field(None, alias="managerUrl")
    button_text: Optional[str] = Field(None, alias="buttonText")
    is_active: bool = Field(..., alias="isActive")
    is_active_in_funnel: bool = Field(default=True, alias="isActiveInFunnel")
    media_assets: List[Dict[str, Any]] = Field(default_factory=list, alias="mediaAssets")
    deliverables: List[Dict[str, Any]] = Field(default_factory=list)
    total_buyers: int = Field(default=0, alias="totalBuyers")
    buyers_count: int = Field(default=0, alias="buyersCount")
    total_revenue: float = Field(default=0.0, alias="totalRevenue")
    revenue: float = Field(default=0.0, alias="revenue")
    created_at: Optional[str] = Field(None, alias="createdAt")
    updated_at: Optional[str] = Field(None, alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True)

    @classmethod
    def from_orm_tariff(cls, tariff) -> "TariffApiResponse":
        created_str = (
            tariff.created_at.isoformat()
            if getattr(tariff, "created_at", None)
            else None
        )
        updated_str = (
            tariff.updated_at.isoformat()
            if getattr(tariff, "updated_at", None)
            else None
        )
        raw_deliverables = getattr(tariff, "deliverables", []) or []
        price_val = float(tariff.price) if tariff.price is not None else 0.0
        old_price_val = (
            float(tariff.old_price)
            if getattr(tariff, "old_price", None) is not None
            else None
        )
        revenue_val = float(tariff.total_revenue) if tariff.total_revenue is not None else 0.0
        is_act = bool(tariff.is_active)
        buyers = int(tariff.total_buyers or 0)
        media_assets_val = list(getattr(tariff, "media_assets", []) or [])
        return cls(
            id=str(tariff.id),
            bot_id=tariff.bot_id,
            name=tariff.name,
            description=tariff.description,
            price=price_val,
            old_price=old_price_val,
            payment_type=tariff.payment_type,
            recurring_period=tariff.recurring_period,
            sales_mode=tariff.sales_mode,
            manager_url=getattr(tariff, "manager_url", None),
            button_text=getattr(tariff, "button_text", None),
            is_active=is_act,
            is_active_in_funnel=is_act,
            media_assets=media_assets_val,
            deliverables=list(raw_deliverables),
            total_buyers=buyers,
            buyers_count=buyers,
            total_revenue=revenue_val,
            revenue=revenue_val,
            created_at=created_str,
            updated_at=updated_str,
        )


class TariffStatsResponse(BaseModel):
    total_tariffs: int = Field(..., alias="totalTariffs")
    total_count: int = Field(..., alias="totalCount")
    active_count: int = Field(..., alias="activeCount")
    active_in_funnel_count: int = Field(..., alias="activeInFunnelCount")
    total_buyers: int = Field(..., alias="totalBuyers")
    buyers_count: int = Field(..., alias="buyersCount")
    total_revenue: float = Field(..., alias="totalRevenue")

    model_config = ConfigDict(populate_by_name=True)


class TariffListResponse(BaseModel):
    tariffs: List[TariffApiResponse]
    total: int
    stats: TariffStatsResponse

    model_config = ConfigDict(populate_by_name=True)


class TariffFileUploadResponse(BaseModel):
    id: Optional[str] = None
    path: str
    file_path: Optional[str] = Field(None, alias="filePath")
    url: str
    file_url: Optional[str] = Field(None, alias="fileUrl")
    filename: str
    file_name: Optional[str] = Field(None, alias="fileName")
    original_name: str = Field(..., alias="originalName")
    size: int
    size_bytes: int = Field(..., alias="sizeBytes")

    model_config = ConfigDict(populate_by_name=True)
