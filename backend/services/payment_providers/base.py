"""Unified PaymentProvider abstraction layer for BotFlow."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Mapping, Optional
import uuid


@dataclass
class PaymentInitResult:
    confirmation_url: Optional[str]
    provider_payment_id: Optional[str] = None
    raw_response: Optional[dict[str, Any]] = None


@dataclass
class ChargeResult:
    success: bool
    status: str  # "succeeded", "pending", "failed"
    provider_payment_id: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    raw_response: Optional[dict[str, Any]] = None


@dataclass
class PaymentStatusResult:
    status: str  # "succeeded", "pending", "failed", "canceled"
    paid: bool
    amount: Optional[Decimal] = None
    currency: str = "RUB"
    payment_method_id: Optional[str] = None
    raw_response: Optional[dict[str, Any]] = None


@dataclass
class WebhookVerificationResult:
    is_valid: bool
    event_type: str
    status: str  # "succeeded", "failed", "canceled", "pending"
    provider_payment_id: Optional[str] = None
    order_num: Optional[str] = None
    client_payment_id: Optional[uuid.UUID] = None
    subscription_id: Optional[str] = None
    payment_method_id: Optional[str] = None
    amount: Optional[Decimal] = None
    currency: str = "RUB"
    telegram_id: Optional[int] = None
    raw_data: dict[str, Any] = field(default_factory=dict)
    error_message: Optional[str] = None


class PaymentProvider(ABC):
    """Abstract base class for all payment providers."""

    @abstractmethod
    async def create_initial_payment(
        self,
        bot_config: Any,
        amount: Decimal | float,
        currency: str,
        description: str,
        telegram_id: int,
        tariff_snapshot: dict[str, Any],
        idempotency_key: str,
        client_payment_id: uuid.UUID,
        return_url: Optional[str] = None,
        http_session: Any = None,
    ) -> PaymentInitResult:
        """Create initial payment link/invoice for user."""
        pass

    @abstractmethod
    async def charge_recurring(
        self,
        bot_config: Any,
        subscription: Any,
        attempt: Any,
        http_session: Any = None,
    ) -> ChargeResult:
        """Execute automated recurring charge using saved token/binding."""
        pass

    @abstractmethod
    async def cancel_recurring(
        self,
        bot_config: Any,
        subscription: Any,
        http_session: Any = None,
    ) -> bool:
        """Cancel recurring payment on provider side if required."""
        pass

    @abstractmethod
    async def check_payment_status(
        self,
        bot_config: Any,
        provider_payment_id: str,
        http_session: Any = None,
    ) -> PaymentStatusResult:
        """Check status of a payment directly with provider."""
        pass

    @abstractmethod
    def verify_webhook(
        self,
        bot_config: Any,
        payload: Mapping[str, Any] | str | bytes,
        headers: Mapping[str, str],
        query_params: Optional[Mapping[str, str]] = None,
        raw_body: Optional[str | bytes] = None,
        raw_data: Optional[Mapping[str, Any]] = None,
    ) -> WebhookVerificationResult:
        """Verify webhook authenticity and extract normalized payment data."""
        pass
