"""Provider-specific validation for payment notifications.

No notification may grant access before the provider-specific checks in this
module have completed successfully.
"""

import hashlib
import hmac
import json
import re
import urllib.parse
import uuid
from decimal import Decimal, InvalidOperation
from dataclasses import dataclass
from typing import Any, Mapping

import httpx
from loggers import logger


class PaymentWebhookError(ValueError):
    """Raised when a payment notification is malformed or untrusted."""


class PaymentProviderUnavailable(RuntimeError):
    """Raised when a provider cannot be reached for mandatory verification."""


def _robokassa_digest(value: str, credentials: Mapping[str, Any]) -> str:
    algorithm = str(credentials.get("hash_algorithm") or "md5").casefold()
    try:
        digest = hashlib.new(algorithm)
    except ValueError as exc:
        raise PaymentWebhookError("Robokassa hash algorithm is unsupported") from exc
    if algorithm not in {"md5", "sha256", "sha512"}:
        raise PaymentWebhookError("Robokassa hash algorithm is unsupported")
    digest.update(value.encode())
    return digest.hexdigest()


@dataclass(frozen=True)
class VerifiedPayment:
    provider: str
    payment_id: str
    telegram_id: int
    client_payment_id: uuid.UUID | None = None
    amount: Decimal | None = None
    currency: str | None = None


def _get_credentials(bot_config: Any) -> dict[str, Any]:
    if not bot_config.payment_creds_enc:
        raise PaymentWebhookError("Payment credentials are not configured")
    try:
        from services.security import crypto

        credentials = json.loads(crypto.decrypt(bot_config.payment_creds_enc))
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise PaymentWebhookError("Payment credentials are invalid") from exc
    if not isinstance(credentials, dict):
        raise PaymentWebhookError("Payment credentials are invalid")
    return credentials


def _value(data: Mapping[str, Any], *names: str) -> str | None:
    normalized = {str(key).casefold(): value for key, value in data.items()}
    for name in names:
        value = normalized.get(name.casefold())
        if value is not None:
            return str(value)
    return None


def _safe_headers_for_logging(headers: Mapping[str, str] | None) -> dict[str, str]:
    if not headers:
        return {}
    sensitive = {"authorization", "cookie", "x-api-key", "token", "proxy-authorization"}
    return {
        str(k): ("***" if str(k).casefold() in sensitive else str(v))
        for k, v in headers.items()
    }


def _safe_dict_for_logging(d: Mapping[str, Any] | None) -> dict[str, str]:
    if not d:
        return {}
    sensitive = {"secret", "password", "api_key", "token", "key"}
    return {
        str(k): ("***" if any(s in str(k).casefold() for s in sensitive) else str(v))
        for k, v in d.items()
    }


def _php_bracket_to_dict(items: list[tuple[str, Any]] | Mapping[str, Any]) -> dict[str, Any]:
    """Convert PHP array bracket notation (e.g. products[0][price]) to nested dict/list."""
    if isinstance(items, Mapping):
        pairs = list(items.items())
    else:
        pairs = list(items)

    result: dict[str, Any] = {}
    for key, value in pairs:
        key_str = str(key)
        match = re.match(r"^([^\[]+)((?:\[[^\]]*\])*)$", key_str)
        if not match or not match.group(2):
            result[key_str] = value
            continue

        base = match.group(1)
        sub_keys = re.findall(r"\[([^\]]*)\]", match.group(2))
        path = [base] + sub_keys

        curr: Any = result
        for i, part in enumerate(path[:-1]):
            next_part = path[i + 1]
            is_next_digit = next_part.isdigit() or next_part == ""
            if isinstance(curr, dict):
                if part not in curr:
                    curr[part] = [] if is_next_digit else {}
                curr = curr[part]
            elif isinstance(curr, list):
                idx = int(part)
                while len(curr) <= idx:
                    curr.append([] if is_next_digit else {})
                curr = curr[idx]

        last_part = path[-1]
        if isinstance(curr, dict):
            curr[last_part] = value
        elif isinstance(curr, list):
            if last_part == "":
                curr.append(value)
            else:
                idx = int(last_part)
                while len(curr) <= idx:
                    curr.append(None)
                curr[idx] = value

    return result


def _normalize_prodamus_dict(data: dict[str, Any]) -> dict[str, Any]:
    if any("[" in str(k) for k in data.keys()):
        data = _php_bracket_to_dict(list(data.items()))
    submit = data.get("submit")
    if isinstance(submit, str) and submit.strip().startswith("{") and submit.strip().endswith("}"):
        try:
            data["submit"] = json.loads(submit)
        except Exception:
            pass
    return data


def parse_prodamus_notification(
    payload: Mapping[str, Any] | str | bytes,
) -> dict[str, Any]:
    """Parse Prodamus webhook body (JSON, form-urlencoded, or multipart) into a Python dict.

    Recursively converts PHP bracket-notation array keys (e.g. products[0][name]) into
    nested dicts/lists and unpacks 'submit' if present as a JSON string.
    """
    if isinstance(payload, (bytes, bytearray)):
        payload = payload.decode("utf-8", errors="replace")

    if isinstance(payload, str):
        payload_str = payload.strip()
        if payload_str.startswith("{") and payload_str.endswith("}"):
            try:
                data = json.loads(payload_str)
                if isinstance(data, Mapping):
                    return _normalize_prodamus_dict(dict(data))
            except Exception:
                pass
        try:
            pairs = urllib.parse.parse_qsl(payload_str, keep_blank_values=True)
            return _php_bracket_to_dict(pairs)
        except Exception:
            return {}

    if isinstance(payload, Mapping):
        return _normalize_prodamus_dict(dict(payload))

    return {}


def _canonicalize_for_prodamus(data: Any, stringify_leaves: bool = True) -> Any:
    """Canonicalize data for Prodamus signature: optionally convert leaves to strings, sort keys recursively."""
    if isinstance(data, Mapping):
        return {
            str(k): _canonicalize_for_prodamus(v, stringify_leaves=stringify_leaves)
            for k, v in sorted(data.items(), key=lambda item: str(item[0]))
            if str(k).casefold() not in {"signature", "sign", "x-signature", "x_signature"}
        }
    if isinstance(data, (list, tuple)):
        return [_canonicalize_for_prodamus(item, stringify_leaves=stringify_leaves) for item in data]
    if not stringify_leaves:
        return data
    if isinstance(data, bool):
        return "1" if data else ""
    if data is None:
        return ""
    return str(data)


def _flatten_for_query(prefix: str, val: Any) -> list[tuple[str, str]]:
    items: list[tuple[str, str]] = []
    if isinstance(val, Mapping):
        for k, v in sorted(val.items(), key=lambda x: str(x[0])):
            p = f"{prefix}[{k}]" if prefix else str(k)
            items.extend(_flatten_for_query(p, v))
    elif isinstance(val, (list, tuple)):
        for i, v in enumerate(val):
            p = f"{prefix}[{i}]" if prefix else str(i)
            items.extend(_flatten_for_query(p, v))
    else:
        items.append((prefix, str(val)))
    return items


def _extract_prodamus_signature(
    headers: Mapping[str, str] | None,
    query_params: Mapping[str, str] | None,
    payload: Mapping[str, Any] | None,
) -> str | None:
    for source in (headers, query_params, payload if isinstance(payload, Mapping) else None):
        if not source:
            continue
        normalized = {str(k).casefold(): str(v) for k, v in source.items()}
        for key in ("sign", "signature", "x-signature", "x_signature"):
            val = normalized.get(key)
            if val:
                return str(val).strip().strip('"').strip("'")
    return None


def verify_prodamus_signature(
    secret: str,
    payload: Mapping[str, Any] | str | bytes,
    received_signature: str | None = None,
    headers: Mapping[str, str] | None = None,
    query_params: Mapping[str, str] | None = None,
    raw_body: str | bytes | None = None,
    raw_data: Mapping[str, Any] | None = None,
) -> bool:
    """Verify Prodamus HMAC-SHA256 signature across all canonical serialization variants."""
    secret_str = str(secret).strip()
    if not secret_str:
        raise PaymentWebhookError("Prodamus signature is missing")

    if not received_signature:
        received_signature = _extract_prodamus_signature(
            headers,
            query_params,
            raw_data if isinstance(raw_data, Mapping) else (payload if isinstance(payload, Mapping) else None),
        )

    if not received_signature:
        raise PaymentWebhookError("Prodamus signature is missing")

    clean_signature = str(received_signature).strip().strip('"').strip("'")

    parsed = parse_prodamus_notification(payload)
    canonical_nested_str = _canonicalize_for_prodamus(parsed, stringify_leaves=True)
    canonical_nested_raw = _canonicalize_for_prodamus(parsed, stringify_leaves=False)

    candidate_strings: dict[str, str] = {}

    # Variant 1: Nested JSON with stringified leaves (PHP SDK default with/without escaped slashes)
    nested_str_json = json.dumps(canonical_nested_str, ensure_ascii=False, separators=(",", ":"))
    candidate_strings["json_nested_str_escaped"] = nested_str_json.replace("/", "\\/")
    candidate_strings["json_nested_str_unescaped"] = nested_str_json

    # Variant 2: Nested JSON with native types (prodamuspy / raw JSON default)
    nested_raw_json = json.dumps(canonical_nested_raw, ensure_ascii=False, separators=(",", ":"))
    candidate_strings["json_nested_raw_escaped"] = nested_raw_json.replace("/", "\\/")
    candidate_strings["json_nested_raw_unescaped"] = nested_raw_json

    # Variant 3: Flat dictionary (from raw_data or if payload arrived flat)
    flat_source = raw_data if isinstance(raw_data, Mapping) else (payload if isinstance(payload, Mapping) else None)
    if flat_source:
        canonical_flat_str = _canonicalize_for_prodamus(dict(flat_source), stringify_leaves=True)
        canonical_flat_raw = _canonicalize_for_prodamus(dict(flat_source), stringify_leaves=False)
        flat_str_json = json.dumps(canonical_flat_str, ensure_ascii=False, separators=(",", ":"))
        flat_raw_json = json.dumps(canonical_flat_raw, ensure_ascii=False, separators=(",", ":"))
        candidate_strings["json_flat_str_escaped"] = flat_str_json.replace("/", "\\/")
        candidate_strings["json_flat_str_unescaped"] = flat_str_json
        candidate_strings["json_flat_raw_escaped"] = flat_raw_json.replace("/", "\\/")
        candidate_strings["json_flat_raw_unescaped"] = flat_raw_json

    # Variant 4: 'submit' field if present in parsed or flat_source
    for sub_candidate in (parsed.get("submit"), (flat_source.get("submit") if flat_source else None)):
        if isinstance(sub_candidate, Mapping):
            sub_str = _canonicalize_for_prodamus(sub_candidate, stringify_leaves=True)
            sub_raw = _canonicalize_for_prodamus(sub_candidate, stringify_leaves=False)
            j_sub_str = json.dumps(sub_str, ensure_ascii=False, separators=(",", ":"))
            j_sub_raw = json.dumps(sub_raw, ensure_ascii=False, separators=(",", ":"))
            candidate_strings["json_submit_str_escaped"] = j_sub_str.replace("/", "\\/")
            candidate_strings["json_submit_str_unescaped"] = j_sub_str
            candidate_strings["json_submit_raw_escaped"] = j_sub_raw.replace("/", "\\/")
            candidate_strings["json_submit_raw_unescaped"] = j_sub_raw
        elif isinstance(sub_candidate, str) and sub_candidate.strip():
            candidate_strings["raw_submit_str"] = sub_candidate.strip()

    # Variant 5: Concatenation / query-string formats
    flat_pairs = _flatten_for_query("", canonical_nested_str)
    if flat_pairs:
        candidate_strings["query_urlencode"] = urllib.parse.urlencode(flat_pairs)
        candidate_strings["query_urlencode_brackets"] = urllib.parse.urlencode(flat_pairs, safe="[]")
        candidate_strings["query_unquoted"] = "&".join(f"{k}={v}" for k, v in flat_pairs)
        candidate_strings["concat_colon"] = ":".join(f"{k}={v}" for k, v in flat_pairs)
        candidate_strings["concat_values"] = "".join(v for k, v in flat_pairs)
        candidate_strings["concat_values_colon"] = ":".join(v for k, v in flat_pairs)

    if flat_source:
        flat_pairs_raw = sorted(
            [
                (str(k), str(v))
                for k, v in flat_source.items()
                if str(k).casefold() not in {"signature", "sign", "x-signature", "x_signature"}
            ],
            key=lambda x: x[0],
        )
        if flat_pairs_raw:
            candidate_strings["query_flat_urlencode"] = urllib.parse.urlencode(flat_pairs_raw)
            candidate_strings["query_flat_urlencode_brackets"] = urllib.parse.urlencode(flat_pairs_raw, safe="[]")
            candidate_strings["query_flat_unquoted"] = "&".join(f"{k}={v}" for k, v in flat_pairs_raw)
            candidate_strings["concat_flat_colon"] = ":".join(f"{k}={v}" for k, v in flat_pairs_raw)

    # Variant 6: Raw body if provided
    if raw_body is not None:
        raw_str = (
            raw_body.decode("utf-8", errors="replace")
            if isinstance(raw_body, (bytes, bytearray))
            else str(raw_body)
        )
        candidate_strings["raw_body"] = raw_str
        candidate_strings["raw_body_stripped"] = raw_str.strip()
        candidate_strings["raw_body_unquoted"] = urllib.parse.unquote_plus(raw_str)
        if "sign=" in raw_str.casefold():
            body_without_sign = re.sub(r"&?sign=[^&]*", "", raw_str, flags=re.IGNORECASE).strip("&")
            candidate_strings["raw_body_without_sign"] = body_without_sign

    candidate_hashes: dict[str, str] = {}
    matched_candidate: str | None = None

    for name, s in candidate_strings.items():
        computed = hmac.new(secret_str.encode("utf-8"), s.encode("utf-8"), hashlib.sha256).hexdigest()
        candidate_hashes[name] = computed
        if hmac.compare_digest(computed.casefold(), clean_signature.casefold()):
            matched_candidate = name
            break

    if matched_candidate:
        logger.debug("Prodamus signature verified successfully using candidate '%s'", matched_candidate)
        return True

    logger.warning(
        "Отклонён платежный webhook [prodamus]: подпись не совпадает! "
        "Получена подпись: '%s'. "
        "Рассчитанные кандидаты: %s. "
        "Заголовки: %s. "
        "Query-параметры: %s. "
        "Ключи payload: %s",
        clean_signature,
        candidate_hashes,
        _safe_headers_for_logging(headers),
        _safe_dict_for_logging(query_params),
        list(payload.keys()) if isinstance(payload, Mapping) else type(payload).__name__,
    )
    return False


def _prodamus_signature_payload(payload: Mapping[str, Any]) -> str:
    """Match Prodamus Hmac canonical JSON: sorted keys and escaped slashes."""
    normalized = _canonicalize_for_prodamus(dict(payload), stringify_leaves=True)
    return json.dumps(
        normalized,
        ensure_ascii=False,
        separators=(",", ":"),
    ).replace("/", "\\/")


async def verify_payment_notification(
    provider: str,
    bot_config: Any,
    payload: Mapping[str, Any],
    headers: Mapping[str, str],
    query_params: Mapping[str, str] | None = None,
    raw_payload: Any | None = None,
    raw_body: str | bytes | None = None,
    raw_data: Mapping[str, Any] | None = None,
) -> VerifiedPayment:
    """Verify a successful notification and return its trusted payment data."""
    normalized_provider = provider.casefold()
    credentials = _get_credentials(bot_config)

    if normalized_provider == "yookassa":
        return await _verify_yookassa(bot_config, credentials, payload)
    if normalized_provider == "robokassa":
        return _verify_robokassa(credentials, payload, bot_config)
    if normalized_provider == "prodamus":
        return _verify_prodamus(
            credentials,
            payload,
            headers,
            bot_config,
            query_params=query_params,
            raw_payload=raw_payload,
            raw_body=raw_body,
            raw_data=raw_data,
        )
    raise PaymentWebhookError("Unsupported payment provider")


async def _verify_yookassa(
    bot_config: Any, credentials: Mapping[str, Any], payload: Mapping[str, Any]
) -> VerifiedPayment:
    payment = payload.get("object")
    payment_id = payment.get("id") if isinstance(payment, Mapping) else None
    if payload.get("event") != "payment.succeeded" or not payment_id:
        raise PaymentWebhookError("Unexpected YooKassa notification")

    shop_id = credentials.get("shop_id") or credentials.get("shopId")
    secret_key = credentials.get("secret_key") or credentials.get("secretKey") or credentials.get("api_key")
    if not shop_id or not secret_key:
        raise PaymentWebhookError("YooKassa credentials are incomplete")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"https://api.yookassa.ru/v3/payments/{payment_id}",
                auth=(str(shop_id), str(secret_key)),
            )
    except httpx.HTTPError as exc:
        raise PaymentProviderUnavailable("YooKassa verification is unavailable") from exc

    if response.status_code >= 500:
        raise PaymentProviderUnavailable("YooKassa verification is unavailable")
    if response.status_code != 200:
        raise PaymentWebhookError("YooKassa payment was not found")

    try:
        verified_payment = response.json()
        metadata = verified_payment["metadata"]
        telegram_id = int(metadata["telegram_id"])
        client_payment_id = uuid.UUID(str(metadata["client_payment_id"]))
        amount = Decimal(str(verified_payment["amount"]["value"]))
        currency = str(verified_payment["amount"]["currency"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise PaymentWebhookError("YooKassa payment metadata is invalid") from exc

    if (
        verified_payment.get("id") != payment_id
        or verified_payment.get("status") != "succeeded"
        or verified_payment.get("paid") is not True
    ):
        raise PaymentWebhookError("YooKassa payment is not successful")

    payment_bot_id = metadata.get("bot_id")
    if str(payment_bot_id) != str(bot_config.id):
        raise PaymentWebhookError("YooKassa payment belongs to another bot")

    return VerifiedPayment("yookassa", str(payment_id), telegram_id, client_payment_id, amount, currency)


def _verify_robokassa(
    credentials: Mapping[str, Any], payload: Mapping[str, Any], bot_config: Any | None = None
) -> VerifiedPayment:
    out_sum = _value(payload, "OutSum")
    invoice_id = _value(payload, "InvId", "InvID")
    signature = _value(payload, "SignatureValue")
    password_2 = credentials.get("password_2") or credentials.get("password2")
    if not out_sum or invoice_id is None or not signature or not password_2:
        raise PaymentWebhookError("Robokassa notification is incomplete")

    custom_parameters = sorted(
        (
            (str(key), str(value))
            for key, value in payload.items()
            if str(key).casefold().startswith("shp_")
        ),
        key=lambda item: item[0].casefold(),
    )
    signature_parts = [out_sum, invoice_id, str(password_2)]
    signature_parts.extend(f"{key}={value}" for key, value in custom_parameters)
    expected_signature = _robokassa_digest(":".join(signature_parts), credentials)
    if not hmac.compare_digest(expected_signature.casefold(), signature.casefold()):
        raise PaymentWebhookError("Robokassa signature is invalid")

    telegram_id = _value(payload, "shp_telegram_id")
    client_payment_id = _value(payload, "shp_client_payment_id")
    payment_bot_id = _value(payload, "shp_bot_id")
    if bot_config is None:
        return VerifiedPayment("robokassa", invoice_id, int(telegram_id or ""))
    if payment_bot_id != str(bot_config.id):
        raise PaymentWebhookError("Robokassa payment belongs to another bot")
    try:
        return VerifiedPayment(
            "robokassa",
            invoice_id,
            int(telegram_id or ""),
            uuid.UUID(client_payment_id or ""),
            Decimal(out_sum),
            "RUB",
        )
    except (ValueError, InvalidOperation) as exc:
        raise PaymentWebhookError("Robokassa payment metadata is invalid") from exc


def _is_valid_uuid(val: Any) -> bool:
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError):
        return False


def _verify_prodamus(
    credentials: Mapping[str, Any],
    payload: Mapping[str, Any] | str | bytes,
    headers: Mapping[str, str] | None = None,
    bot_config: Any | None = None,
    query_params: Mapping[str, str] | None = None,
    raw_payload: Any | None = None,
    raw_body: str | bytes | None = None,
    raw_data: Mapping[str, Any] | None = None,
) -> VerifiedPayment:
    if raw_body is None and isinstance(raw_payload, (str, bytes, bytearray)):
        raw_body = raw_payload
    if raw_data is None and isinstance(raw_payload, Mapping):
        raw_data = raw_payload

    parsed_payload = parse_prodamus_notification(payload)

    status = (
        _value(parsed_payload, "payment_status", "status", "order_status")
        or _value(payload if isinstance(payload, Mapping) else {}, "payment_status", "status", "order_status")
        or (_value(raw_data, "payment_status", "status", "order_status") if raw_data else None)
        or ""
    )
    if status.casefold() not in {"success", "successful", "paid", "succeeded"}:
        raise PaymentWebhookError("Prodamus payment is not successful")

    secret = (
        credentials.get("webhook_secret")
        or credentials.get("secret_key")
        or credentials.get("secretKey")
        or credentials.get("api_key")
        or credentials.get("apiKey")
        or credentials.get("secret")
        or credentials.get("token")
    )
    if not secret:
        raise PaymentWebhookError("Prodamus signature is missing")

    is_valid = verify_prodamus_signature(
        secret=str(secret).strip(),
        payload=payload,
        headers=headers or {},
        query_params=query_params or {},
        raw_body=raw_body,
        raw_data=raw_data,
    )
    if not is_valid:
        raise PaymentWebhookError("Prodamus signature is invalid")

    # Look for client payment UUID in order_num (where we pass client_payment.id) or order_id
    client_payment_uuid: uuid.UUID | None = None
    for candidate in (
        _value(parsed_payload, "order_num"),
        _value(parsed_payload, "order_id"),
        _value(parsed_payload, "shp_client_payment_id"),
        _value(parsed_payload, "client_payment_id"),
        _value(payload if isinstance(payload, Mapping) else {}, "order_num"),
        _value(payload if isinstance(payload, Mapping) else {}, "order_id"),
        _value(payload if isinstance(payload, Mapping) else {}, "shp_client_payment_id"),
        _value(payload if isinstance(payload, Mapping) else {}, "client_payment_id"),
        (_value(raw_data, "order_num", "order_id", "shp_client_payment_id") if raw_data else None),
    ):
        if candidate and _is_valid_uuid(candidate):
            client_payment_uuid = uuid.UUID(str(candidate))
            break

    order_id = (
        _value(parsed_payload, "order_id", "order_num")
        or _value(payload if isinstance(payload, Mapping) else {}, "order_id", "order_num")
        or (_value(raw_data, "order_id", "order_num") if raw_data else None)
    )
    if not order_id:
        raise PaymentWebhookError("Prodamus order ID is missing")

    tg_user_id_val = (
        _value(parsed_payload, "tg_user_id", "telegram_id", "customer_extra")
        or _value(payload if isinstance(payload, Mapping) else {}, "tg_user_id", "telegram_id", "customer_extra")
        or (_value(raw_data, "tg_user_id", "telegram_id", "customer_extra") if raw_data else None)
    )
    telegram_id = 0
    if tg_user_id_val:
        try:
            telegram_id = int(str(tg_user_id_val).strip())
        except (ValueError, TypeError):
            pass

    if telegram_id == 0:
        for candidate in (_value(parsed_payload, "order_num"), order_id):
            if candidate and "_" in candidate:
                try:
                    telegram_id = int(candidate.split("_", 1)[0])
                    break
                except (ValueError, TypeError):
                    pass

    if bot_config is not None:
        try:
            sum_val = (
                _value(parsed_payload, "sum", "amount")
                or _value(payload if isinstance(payload, Mapping) else {}, "sum", "amount")
                or (_value(raw_data, "sum", "amount") if raw_data else None)
                or "0"
            )
            amount = Decimal(str(sum_val))
            client_uuid_final = client_payment_uuid
            if client_uuid_final is None and order_id and _is_valid_uuid(order_id):
                client_uuid_final = uuid.UUID(str(order_id))

            return VerifiedPayment(
                "prodamus",
                order_id,
                telegram_id,
                client_uuid_final,
                amount,
                "RUB",
            )
        except (ValueError, InvalidOperation) as exc:
            raise PaymentWebhookError("Prodamus payment metadata is invalid") from exc

    return VerifiedPayment("prodamus", order_id, telegram_id)
