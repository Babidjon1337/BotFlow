"""Prodamus payment provider implementation for one-time and custom-scheduled recurring payments."""

from decimal import Decimal, InvalidOperation
import json
import logging
import re
from typing import Any, Mapping, Optional
import urllib.parse
import uuid

import httpx

from services.payment_providers.base import (
    ChargeResult,
    PaymentInitResult,
    PaymentProvider,
    PaymentStatusResult,
    WebhookVerificationResult,
)
from services.payment_webhook import (
    parse_prodamus_notification,
    verify_prodamus_signature,
    _value,
    _is_valid_uuid,
)
from services.security import crypto

logger = logging.getLogger(__name__)


class ProdamusProvider(PaymentProvider):
    """Prodamus provider with custom in-house scheduler for recurring payments."""

    @staticmethod
    def _get_credentials(bot_config: Any) -> tuple[str, str]:
        creds = bot_config.payment_credentials or {}
        subdomain = creds.get("subdomain") or creds.get("shop_id") or creds.get("payment_page") or ""
        secret = (
            creds.get("secret_key")
            or creds.get("secretKey")
            or creds.get("webhook_secret")
            or creds.get("api_key")
            or creds.get("secret")
            or creds.get("token")
            or ""
        )
        if bot_config.payment_credentials_enc and (not subdomain or not secret):
            try:
                decrypted = crypto.decrypt_dict(bot_config.payment_credentials_enc)
                subdomain = subdomain or decrypted.get("subdomain") or decrypted.get("shop_id") or decrypted.get("payment_page") or ""
                secret = (
                    secret
                    or decrypted.get("secret_key")
                    or decrypted.get("secretKey")
                    or decrypted.get("webhook_secret")
                    or decrypted.get("api_key")
                    or decrypted.get("secret")
                    or decrypted.get("token")
                    or ""
                )
            except Exception:
                pass
        return str(subdomain).strip(), str(secret).strip()

    @classmethod
    def _normalize_payment_page(cls, subdomain: str) -> str:
        s = subdomain.strip().rstrip("/")
        if not s.startswith("http"):
            s = f"https://{s}.payform.ru/"
        if not s.endswith("/"):
            s = f"{s}/"
        return s

    @classmethod
    def _sign_prodamus_data(cls, data: dict[str, Any], secret: str) -> str:
        from prodamuspy import ProdamusPy
        prodamus = ProdamusPy(secret)
        return prodamus.sign(data)

    @classmethod
    def _flatten(cls, prefix: str, value: Any) -> list[tuple[str, str]]:
        items = []
        if isinstance(value, dict):
            for k, v in value.items():
                items.extend(cls._flatten(f"{prefix}[{k}]", v))
        elif isinstance(value, list):
            for i, v in enumerate(value):
                items.extend(cls._flatten(f"{prefix}[{i}]", v))
        else:
            items.append((prefix, str(value)))
        return items

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
        subdomain, secret = self._get_credentials(bot_config)
        if not subdomain or not secret:
            raise ValueError("Учетные данные Prodamus не настроены для этого бота.")

        payment_page = self._normalize_payment_page(subdomain)
        tariff_name = (
            tariff_snapshot.get("name")
            or tariff_snapshot.get("title")
            or description
            or "Доступ"
        )
        is_recurring = (
            tariff_snapshot.get("payment_type") == "recurring"
            or tariff_snapshot.get("paymentType") == "recurring"
        )

        data: dict[str, Any] = {
            "do": "link",
            "order_num": str(client_payment_id),
            "customer_extra": str(telegram_id),
            "tg_user_id": str(telegram_id),
            "products": [
                {
                    "name": tariff_name,
                    "price": f"{float(amount):.2f}",
                    "quantity": "1",
                }
            ],
            "client_payment_id": str(client_payment_id),
        }

        # For our in-house recurring scheduler:
        # We request tokenization / card binding from Prodamus so we can execute
        # subsequent charges directly without handing subscription scheduling over to Prodamus robot.
        if is_recurring:
            data["recurring"] = "1"
            data["binding"] = "1"
            period = (
                tariff_snapshot.get("recurring_period")
                or tariff_snapshot.get("recurringPeriod")
                or tariff_snapshot.get("billing_period")
                or tariff_snapshot.get("billingPeriod")
            )
            if period:
                data["recurring_period"] = str(period)

        if getattr(bot_config, "username", None):
            clean_username = bot_config.username.lstrip("@")
            bot_url = f"https://t.me/{clean_username}"
            data["url_success"] = bot_url
            data["url_return"] = bot_url
        elif return_url:
            data["url_success"] = return_url
            data["url_return"] = return_url

        creds = bot_config.payment_credentials or {}
        demo_mode_val = creds.get("demo_mode")
        if demo_mode_val is None:
            demo_mode_val = creds.get("is_test")
        if demo_mode_val and str(demo_mode_val).strip().lower() in {"1", "true", "yes"}:
            data["demo_mode"] = "1"

        integration_code = creds.get("integration_code") or creds.get("sys")
        if integration_code:
            data["sys"] = str(integration_code)

        data["signature"] = self._sign_prodamus_data(data, secret)

        flat_params = []
        for k, v in data.items():
            if isinstance(v, (dict, list)):
                flat_params.extend(self._flatten(k, v))
            else:
                flat_params.append((k, v))

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(payment_page, params=flat_params)
            if response.status_code == 200:
                content = response.text.strip()
                found = re.findall(r"https?://payform\.ru/[a-zA-Z0-9]+/?", content)
                if found:
                    return PaymentInitResult(
                        confirmation_url=found[0],
                        provider_payment_id=None,
                        raw_response={"payform_url": found[0]},
                    )
            logger.error("Prodamus API error %s: %s", response.status_code, response.text[:200])
        except Exception as exc:
            logger.exception("Ошибка при обращении к Prodamus: %s", exc)

        return PaymentInitResult(confirmation_url=None)

    async def charge_recurring(
        self,
        bot_config: Any,
        subscription: Any,
        attempt: Any,
        http_session: Any = None,
    ) -> ChargeResult:
        """Charge recurring payment using Prodamus card binding / rebill API."""
        subdomain, secret = self._get_credentials(bot_config)
        if not subdomain or not secret:
            return ChargeResult(
                success=False,
                status="failed",
                error_code="missing_credentials",
                error_message="Учетные данные Prodamus не настроены.",
            )

        binding_id = subscription.provider_payment_method_id or subscription.provider_subscription_id
        if not binding_id:
            return ChargeResult(
                success=False,
                status="failed",
                error_code="missing_binding_id",
                error_message="Идентификатор привязки карты Prodamus не найден.",
            )

        payment_page = self._normalize_payment_page(subdomain)
        tariff_name = (
            subscription.tariff_snapshot.get("name")
            or subscription.tariff_snapshot.get("title")
            or "Продление подписки"
        )

        # Prodamus rebill / recurrent charge payload
        data: dict[str, Any] = {
            "do": "rebill",
            "order_num": str(attempt.idempotency_key),
            "parent_order_id": str(binding_id),
            "binding_id": str(binding_id),
            "payment_method_id": str(binding_id),
            "subscription_id": str(subscription.id),
            "customer_extra": str(subscription.user_id or ""),
            "tg_user_id": str(subscription.user_id or ""),
            "products": [
                {
                    "name": f"Продление: {tariff_name}",
                    "price": f"{float(attempt.amount):.2f}",
                    "quantity": "1",
                }
            ],
        }

        creds = bot_config.payment_credentials or {}
        if creds.get("demo_mode") and str(creds.get("demo_mode")).strip().lower() in {"1", "true", "yes"}:
            data["demo_mode"] = "1"

        data["signature"] = self._sign_prodamus_data(data, secret)

        flat_params = []
        for k, v in data.items():
            if isinstance(v, (dict, list)):
                flat_params.extend(self._flatten(k, v))
            else:
                flat_params.append((k, v))

        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                # Prodamus supports POST/GET for rebill operations
                response = await client.post(
                    f"{payment_page.rstrip('/')}/api/v1/payment/rebill",
                    data=dict(flat_params),
                )
                if response.status_code == 404:
                    # Fallback to base endpoint with rebill query
                    response = await client.get(payment_page, params=flat_params)

            if response.status_code == 200:
                text = response.text.strip()
                try:
                    res_json = response.json()
                    status = res_json.get("status") or res_json.get("payment_status")
                    order_id = res_json.get("order_id") or res_json.get("payment_id")
                    if status in ("success", "successful", "paid", "succeeded"):
                        return ChargeResult(
                            success=True,
                            status="succeeded",
                            provider_payment_id=str(order_id) if order_id else None,
                            raw_response=res_json,
                        )
                    elif status in ("pending", "processing"):
                        return ChargeResult(
                            success=True,
                            status="pending",
                            provider_payment_id=str(order_id) if order_id else None,
                            raw_response=res_json,
                        )
                    else:
                        err = res_json.get("error") or res_json.get("message") or "Отказ при списании"
                        return ChargeResult(
                            success=False,
                            status="failed",
                            error_code=str(res_json.get("error_code") or "charge_failed"),
                            error_message=str(err),
                            raw_response=res_json,
                        )
                except Exception:
                    # Non-JSON 200 OK: Prodamus accepted the rebill request and will notify via webhook
                    return ChargeResult(
                        success=True,
                        status="pending",
                        provider_payment_id=None,
                        raw_response={"response_text": text[:200]},
                    )

            logger.error("Prodamus charge HTTP error %s: %s", response.status_code, response.text[:200])
            return ChargeResult(
                success=False,
                status="failed",
                error_code=f"http_{response.status_code}",
                error_message=f"Ошибка сервера Prodamus ({response.status_code})",
                raw_response={"error": response.text[:200]},
            )

        except Exception as exc:
            logger.exception("Исключение при рекуррентном списании Prodamus: %s", exc)
            return ChargeResult(
                success=False,
                status="failed",
                error_code="network_error",
                error_message=str(exc),
            )

    async def cancel_recurring(
        self,
        bot_config: Any,
        subscription: Any,
        http_session: Any = None,
    ) -> bool:
        """Cancel subscription locally (our scheduler will not trigger repeat charges)."""
        return True

    async def check_payment_status(
        self,
        bot_config: Any,
        provider_payment_id: str,
        http_session: Any = None,
    ) -> PaymentStatusResult:
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
        subdomain, secret = self._get_credentials(bot_config)
        if not secret:
            return WebhookVerificationResult(
                is_valid=False,
                event_type="prodamus",
                status="failed",
                error_message="Prodamus secret key is missing",
            )

        is_valid = verify_prodamus_signature(
            secret=secret,
            payload=payload,
            headers=headers,
            query_params=query_params or {},
            raw_body=raw_body,
            raw_data=raw_data,
        )
        if not is_valid:
            return WebhookVerificationResult(
                is_valid=False,
                event_type="prodamus",
                status="failed",
                error_message="Invalid Prodamus signature",
            )

        parsed = parse_prodamus_notification(payload)
        status_val = (
            _value(parsed, "payment_status", "status", "order_status")
            or _value(payload if isinstance(payload, Mapping) else {}, "payment_status", "status", "order_status")
            or (_value(raw_data, "payment_status", "status", "order_status") if raw_data else None)
            or ""
        )
        is_success = status_val.casefold() in {"success", "successful", "paid", "succeeded"}
        status_norm = "succeeded" if is_success else ("canceled" if status_val.casefold() in {"canceled", "cancelled"} else "failed")

        order_id = (
            _value(parsed, "order_id", "order_num")
            or _value(payload if isinstance(payload, Mapping) else {}, "order_id", "order_num")
            or (_value(raw_data, "order_id", "order_num") if raw_data else None)
        )

        # Extract client payment UUID or attempt idempotency key
        client_uuid: Optional[uuid.UUID] = None
        for candidate in (
            _value(parsed, "order_num"),
            _value(parsed, "order_id"),
            _value(parsed, "shp_client_payment_id"),
            _value(parsed, "client_payment_id"),
            _value(payload if isinstance(payload, Mapping) else {}, "order_num"),
            _value(payload if isinstance(payload, Mapping) else {}, "order_id"),
            _value(payload if isinstance(payload, Mapping) else {}, "client_payment_id"),
        ):
            if candidate and _is_valid_uuid(candidate):
                client_uuid = uuid.UUID(str(candidate))
                break

        # Extract binding / token / subscription IDs
        binding_id = (
            _value(parsed, "binding_id", "payment_method_id", "token", "card_token", "subscription_id")
            or _value(payload if isinstance(payload, Mapping) else {}, "binding_id", "payment_method_id", "token", "card_token", "subscription_id")
            or (_value(raw_data, "binding_id", "payment_method_id", "token", "subscription_id") if raw_data else None)
        )
        if not binding_id and order_id:
            # Prodamus order_id can serve as parent_order_id for repeat debits
            binding_id = str(order_id)

        sub_id = (
            _value(parsed, "subscription_id", "subscription")
            or _value(payload if isinstance(payload, Mapping) else {}, "subscription_id", "subscription")
        )

        tg_id_val = (
            _value(parsed, "tg_user_id", "telegram_id", "customer_extra")
            or _value(payload if isinstance(payload, Mapping) else {}, "tg_user_id", "telegram_id", "customer_extra")
        )
        tg_id = None
        if tg_id_val:
            try:
                tg_id = int(str(tg_id_val).strip())
            except Exception:
                pass

        sum_val = (
            _value(parsed, "sum", "amount")
            or _value(payload if isinstance(payload, Mapping) else {}, "sum", "amount")
            or "0"
        )
        try:
            amt = Decimal(str(sum_val))
        except (ValueError, InvalidOperation):
            amt = None

        return WebhookVerificationResult(
            is_valid=True,
            event_type="prodamus",
            status=status_norm,
            provider_payment_id=str(order_id) if order_id else None,
            order_num=str(_value(parsed, "order_num") or ""),
            client_payment_id=client_uuid,
            subscription_id=str(sub_id) if sub_id else None,
            payment_method_id=str(binding_id) if binding_id else None,
            amount=amt,
            currency="RUB",
            telegram_id=tg_id,
            raw_data=parsed,
        )
