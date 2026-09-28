"""YooKassa payment provider implementation."""

from decimal import Decimal
import json
import logging
from typing import Any, Mapping, Optional
import uuid

import httpx

from services.payment_providers.base import (
    ChargeResult,
    PaymentInitResult,
    PaymentProvider,
    PaymentStatusResult,
    WebhookVerificationResult,
)
from services.security import crypto

logger = logging.getLogger(__name__)


class YooKassaProvider(PaymentProvider):
    """YooKassa provider for one-time and recurring payments."""

    BASE_URL = "https://api.yookassa.ru/v3"

    @staticmethod
    def _get_credentials(bot_config: Any) -> tuple[str, str]:
        creds = bot_config.payment_credentials or {}
        shop_id = creds.get("shop_id") or creds.get("shopId") or ""
        secret_key = (
            creds.get("secret_key")
            or creds.get("secretKey")
            or creds.get("api_key")
            or ""
        )
        if bot_config.payment_credentials_enc and (not shop_id or not secret_key):
            try:
                decrypted = crypto.decrypt_dict(bot_config.payment_credentials_enc)
                shop_id = shop_id or decrypted.get("shop_id") or decrypted.get("shopId") or ""
                secret_key = (
                    secret_key
                    or decrypted.get("secret_key")
                    or decrypted.get("secretKey")
                    or decrypted.get("api_key")
                    or ""
                )
            except Exception:
                pass
        return str(shop_id).strip(), str(secret_key).strip()

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
        shop_id, secret_key = self._get_credentials(bot_config)
        if not shop_id or not secret_key:
            raise ValueError("Учетные данные ЮKassa не настроены для этого бота.")

        clean_username = getattr(bot_config, "username", "").lstrip("@")
        fallback_return = f"https://t.me/{clean_username}" if clean_username else "https://t.me/telegram"
        effective_return = return_url or fallback_return

        is_recurring = (
            tariff_snapshot.get("payment_type") == "recurring"
            or tariff_snapshot.get("paymentType") == "recurring"
        )

        headers = {
            "Idempotence-Key": idempotency_key,
            "Content-Type": "application/json",
        }

        payload: dict[str, Any] = {
            "amount": {"value": f"{float(amount):.2f}", "currency": currency or "RUB"},
            "capture": True,
            "confirmation": {
                "type": "redirect",
                "return_url": effective_return,
            },
            "description": f"Payment {client_payment_id}",
            "metadata": {
                "telegram_id": str(telegram_id),
                "bot_id": str(bot_config.id),
                "client_payment_id": str(client_payment_id),
                "tariff_id": str(tariff_snapshot.get("id") or ""),
            },
        }

        if is_recurring:
            payload["save_payment_method"] = True

        from config import WEBHOOK_URL
        if WEBHOOK_URL:
            payload["notification_url"] = (
                f"{WEBHOOK_URL.rstrip('/')}/webhook/payments/yookassa/{bot_config.tg_bot_id}"
            )

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.BASE_URL}/payments",
                json=payload,
                headers=headers,
                auth=(shop_id, secret_key),
            )

        if resp.status_code != 200:
            logger.error("YooKassa API error %s: %s", resp.status_code, resp.text)
            return PaymentInitResult(confirmation_url=None, raw_response={"error": resp.text})

        data = resp.json()
        confirmation_url = data.get("confirmation", {}).get("confirmation_url")
        return PaymentInitResult(
            confirmation_url=confirmation_url,
            provider_payment_id=data.get("id"),
            raw_response=data,
        )

    async def charge_recurring(
        self,
        bot_config: Any,
        subscription: Any,
        attempt: Any,
        http_session: Any = None,
    ) -> ChargeResult:
        shop_id, secret_key = self._get_credentials(bot_config)
        if not shop_id or not secret_key:
            return ChargeResult(
                success=False,
                status="failed",
                error_code="missing_credentials",
                error_message="Учетные данные ЮKassa не настроены.",
            )

        payment_method_id = subscription.provider_payment_method_id
        if not payment_method_id:
            return ChargeResult(
                success=False,
                status="failed",
                error_code="missing_payment_method",
                error_message="Сохраненный способ оплаты не найден.",
            )

        tariff_name = (
            subscription.tariff_snapshot.get("name")
            or subscription.tariff_snapshot.get("title")
            or "Подписка"
        )
        headers = {
            "Idempotence-Key": attempt.idempotency_key,
            "Content-Type": "application/json",
        }
        payload = {
            "amount": {
                "value": f"{float(attempt.amount):.2f}",
                "currency": attempt.currency or "RUB",
            },
            "capture": True,
            "payment_method_id": payment_method_id,
            "description": f"Продление подписки: {tariff_name}",
            "metadata": {
                "subscription_id": str(subscription.id),
                "attempt_id": str(attempt.id),
                "bot_id": str(bot_config.id),
                "telegram_id": str(subscription.user_id or ""),
            },
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/payments",
                    json=payload,
                    headers=headers,
                    auth=(shop_id, secret_key),
                )
        except Exception as exc:
            logger.exception("Сетевая ошибка при списании YooKassa: %s", exc)
            return ChargeResult(
                success=False,
                status="failed",
                error_code="network_error",
                error_message=str(exc),
            )

        if resp.status_code != 200:
            logger.error("YooKassa charge error %s: %s", resp.status_code, resp.text)
            try:
                err_data = resp.json()
                code = err_data.get("code") or f"http_{resp.status_code}"
                desc = err_data.get("description") or resp.text
            except Exception:
                code = f"http_{resp.status_code}"
                desc = resp.text
            return ChargeResult(
                success=False,
                status="failed",
                error_code=code,
                error_message=desc,
                raw_response={"error": resp.text},
            )

        data = resp.json()
        pmt_id = data.get("id")
        pmt_status = data.get("status")

        if pmt_status == "succeeded":
            return ChargeResult(
                success=True,
                status="succeeded",
                provider_payment_id=pmt_id,
                raw_response=data,
            )
        elif pmt_status in ("pending", "waiting_for_capture"):
            return ChargeResult(
                success=True,
                status="pending",
                provider_payment_id=pmt_id,
                raw_response=data,
            )
        elif pmt_status == "canceled":
            details = data.get("cancellation_details", {})
            reason = details.get("reason", "canceled")
            return ChargeResult(
                success=False,
                status="failed",
                provider_payment_id=pmt_id,
                error_code=reason,
                error_message=f"Платёж отклонён: {reason}",
                raw_response=data,
            )
        else:
            return ChargeResult(
                success=False,
                status=pmt_status or "unknown",
                provider_payment_id=pmt_id,
                raw_response=data,
            )

    async def cancel_recurring(
        self,
        bot_config: Any,
        subscription: Any,
        http_session: Any = None,
    ) -> bool:
        # YooKassa recurring is merchant-scheduled, cancel is handled locally
        return True

    async def check_payment_status(
        self,
        bot_config: Any,
        provider_payment_id: str,
        http_session: Any = None,
    ) -> PaymentStatusResult:
        shop_id, secret_key = self._get_credentials(bot_config)
        if not shop_id or not secret_key:
            return PaymentStatusResult(status="failed", paid=False)

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/payments/{provider_payment_id}",
                    auth=(shop_id, secret_key),
                )
            if resp.status_code == 200:
                data = resp.json()
                st = data.get("status", "pending")
                paid = st == "succeeded"
                amt = Decimal(str(data.get("amount", {}).get("value", "0")))
                curr = data.get("amount", {}).get("currency", "RUB")
                pm_id = data.get("payment_method", {}).get("id")
                return PaymentStatusResult(
                    status=st,
                    paid=paid,
                    amount=amt,
                    currency=curr,
                    payment_method_id=pm_id,
                    raw_response=data,
                )
        except Exception as exc:
            logger.warning("Ошибка проверки статуса YooKassa: %s", exc)

        return PaymentStatusResult(status="unknown", paid=False)

    def verify_webhook(
        self,
        bot_config: Any,
        payload: Mapping[str, Any] | str | bytes,
        headers: Mapping[str, str],
        query_params: Optional[Mapping[str, str]] = None,
        raw_body: Optional[str | bytes] = None,
        raw_data: Optional[Mapping[str, Any]] = None,
    ) -> WebhookVerificationResult:
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}
        if not isinstance(payload, Mapping):
            payload = {}

        event = payload.get("event")
        obj = payload.get("object") or {}
        pmt_id = obj.get("id")
        status = obj.get("status")

        if not pmt_id:
            return WebhookVerificationResult(
                is_valid=False,
                event_type=str(event),
                status="failed",
                error_message="Missing payment id in webhook payload",
            )

        metadata = obj.get("metadata") or {}
        tg_id = None
        if metadata.get("telegram_id"):
            try:
                tg_id = int(metadata["telegram_id"])
            except Exception:
                pass

        client_uuid = None
        if metadata.get("client_payment_id"):
            try:
                client_uuid = uuid.UUID(str(metadata["client_payment_id"]))
            except Exception:
                pass

        sub_id = metadata.get("subscription_id")
        pm_method = obj.get("payment_method") or {}
        pm_id = pm_method.get("id") if isinstance(pm_method, dict) else None

        amt = None
        curr = "RUB"
        if obj.get("amount"):
            try:
                amt = Decimal(str(obj["amount"].get("value", "0")))
                curr = obj["amount"].get("currency", "RUB")
            except Exception:
                pass

        normalized_status = "succeeded" if status == "succeeded" else ("canceled" if status == "canceled" else "pending")

        return WebhookVerificationResult(
            is_valid=True,
            event_type=str(event),
            status=normalized_status,
            provider_payment_id=pmt_id,
            client_payment_id=client_uuid,
            subscription_id=sub_id,
            payment_method_id=pm_id,
            amount=amt,
            currency=curr,
            telegram_id=tg_id,
            raw_data=dict(obj),
        )
