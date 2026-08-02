"""Server-side readiness rules for publishing a client bot.

The Mini App may show helpful local hints, but it must never be the authority
that decides whether an incomplete funnel can receive real traffic.
"""

from __future__ import annotations

from dataclasses import dataclass
from html import unescape
import re
from typing import Any, Iterable

from services.manager_link import build_manager_deep_link


REQUIRED_MESSAGE_NODE_IDS = ("start", "push1", "push2")
PAYMENT_NODE_ID = "payment"
MAX_MESSAGE_CHARACTERS = 4096
MAX_MEDIA_CAPTION_CHARACTERS = 1024
MAX_TARIFF_NAME_CHARACTERS = 128
MAX_TARIFF_DESCRIPTION_CHARACTERS = 3000
INVOICE_PRICE_RESERVE_CHARACTERS = 48


@dataclass(frozen=True)
class FunnelReadiness:
    """Publishability result with stable, user-facing reasons."""

    reasons: tuple[str, ...]

    @property
    def is_ready(self) -> bool:
        return not self.reasons


def _as_dict(node: Any) -> dict[str, Any]:
    if isinstance(node, dict):
        return node
    if hasattr(node, "model_dump"):
        return node.model_dump(by_alias=True)
    return {}


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _visible_length(value: Any) -> int:
    """Approximate Telegram's character count after parsing editor HTML."""
    return len(unescape(re.sub(r"<[^>]*>", "", _text(value))).replace("\u00a0", " ").strip())


def _node_value(node: dict[str, Any], snake_case: str, camel_case: str) -> Any:
    return node.get(camel_case, node.get(snake_case))


def evaluate_funnel_readiness(
    funnel_schema: dict[str, Any] | None,
    *,
    has_payment_provider: bool,
    has_payment_credentials: bool,
    connected_chat_ids: set[str] | None = None,
) -> FunnelReadiness:
    """Validate all conditions required to make a bot public.

    This function deliberately accepts raw stored JSON so the same invariant is
    applied both on save and on activation, including legacy or malformed data.
    """
    reasons: list[str] = []
    nodes_value = (funnel_schema or {}).get("nodes")
    if not isinstance(nodes_value, list):
        return FunnelReadiness(("Сохраните воронку в актуальном формате.",))

    nodes = {_as_dict(node).get("id"): _as_dict(node) for node in nodes_value}
    for node_id in REQUIRED_MESSAGE_NODE_IDS:
        node = nodes.get(node_id)
        title = {"start": "Старт", "push1": "Дожим 1", "push2": "Дожим 2"}[node_id]
        if not node:
            reasons.append(f"Добавьте блок «{title}».")
            continue
        if not _text(node.get("content")):
            reasons.append(f"Заполните текст блока «{title}».")
        else:
            has_media = bool(
                node.get("mediaFileId")
                or node.get("media_file_id")
                or node.get("media")
            )
            max_length = (
                MAX_MEDIA_CAPTION_CHARACTERS if has_media else MAX_MESSAGE_CHARACTERS
            )
            if _visible_length(node.get("content")) > max_length:
                kind = "подпись с медиа" if has_media else "сообщение"
                reasons.append(
                    f"Сократите {kind} блока «{title}» до {max_length} символов."
                )
        if not _text(_node_value(node, "button_text", "buttonText")):
            reasons.append(f"Заполните кнопку блока «{title}».")

    payment = nodes.get(PAYMENT_NODE_ID)
    if not payment:
        reasons.append("Добавьте блок «Оплата и выдача».")
        return FunnelReadiness(tuple(reasons))

    mode = _node_value(payment, "payment_mode", "paymentMode") or "auto"
    selection_text = _node_value(payment, "tariff_selection_text", "tariffSelectionText")
    tariffs = payment.get("tariffs")
    if not isinstance(tariffs, list) or not tariffs:
        reasons.append("Добавьте хотя бы один тариф.")
    else:
        if len(tariffs) > 1:
            if not _text(selection_text):
                reasons.append("Добавьте текст выбора тарифов.")
            elif _visible_length(selection_text) > MAX_MESSAGE_CHARACTERS:
                reasons.append(
                    f"Сократите текст выбора тарифов до {MAX_MESSAGE_CHARACTERS} символов."
                )
        for index, raw_tariff in enumerate(tariffs, start=1):
            tariff = _as_dict(raw_tariff)
            label = f"тариф {index}"
            if not _text(tariff.get("name")):
                reasons.append(f"Укажите название: {label}.")
            elif _visible_length(tariff.get("name")) > MAX_TARIFF_NAME_CHARACTERS:
                reasons.append(f"Сократите название: {label} до {MAX_TARIFF_NAME_CHARACTERS} символов.")
            try:
                price_is_valid = float(tariff.get("price", 0)) > 0
            except (TypeError, ValueError):
                price_is_valid = False
            if not price_is_valid:
                reasons.append(f"Укажите цену больше нуля: {label}.")
            if not _text(tariff.get("description")):
                reasons.append(f"Добавьте описание: {label}.")
            elif _visible_length(tariff.get("description")) > MAX_TARIFF_DESCRIPTION_CHARACTERS:
                reasons.append(
                    f"Сократите описание: {label} до {MAX_TARIFF_DESCRIPTION_CHARACTERS} символов."
                )
            invoice_length = (
                _visible_length(payment.get("content"))
                + (_visible_length(payment.get("content")) and 2 or 0)
                + _visible_length(tariff.get("name"))
                + 2
                + _visible_length(tariff.get("description"))
                + INVOICE_PRICE_RESERVE_CHARACTERS
            )
            if invoice_length > MAX_MESSAGE_CHARACTERS:
                reasons.append(
                    f"Сократите текст счёта или описание: {label} не помещается в сообщение Telegram."
                )
            has_delivery = tariff.get("hasDelivery", tariff.get("has_delivery", True))
            action_data = _text(tariff.get("actionData", tariff.get("action_data", "")))
            if mode in {"auto", "hybrid"} and has_delivery is not False and not action_data:
                reasons.append(f"Настройте выдачу после оплаты: {label}.")
            action_type = tariff.get("actionType", tariff.get("action_type", "link"))
            if action_type == "group":
                if action_data and connected_chat_ids is not None and action_data not in connected_chat_ids:
                    reasons.append(
                        f"Выберите подключённый канал или группу для выдачи: {label}."
                    )
                access_mode = tariff.get("chatAccessMode", tariff.get("chat_access_mode", "member"))
                if access_mode not in {"member", "read_only"}:
                    reasons.append(f"Выберите профиль доступа к чату: {label}.")

    if mode not in {"auto", "application", "hybrid"}:
        reasons.append("Выберите корректный режим продажи.")
    if mode in {"application", "hybrid"}:
        manager_text = _text(_node_value(payment, "manager_text", "managerText"))
        manager_url = _text(_node_value(payment, "manager_url", "managerUrl"))
        if not manager_text:
            reasons.append("Добавьте текст для обращения к менеджеру.")
        if manager_url and not build_manager_deep_link(manager_url, manager_text or "черновик"):
            reasons.append("Укажите корректную ссылку на публичный Telegram username менеджера.")
        elif not manager_url:
            reasons.append("Добавьте ссылку на Telegram менеджера.")
    if mode == "hybrid":
        for node_id in REQUIRED_MESSAGE_NODE_IDS:
            node = nodes.get(node_id)
            if node and not _text(_node_value(node, "button_text2", "buttonText2")):
                reasons.append("В гибридном режиме заполните вторую кнопку каждого сообщения.")
                break

    if mode in {"auto", "hybrid"}:
        if not has_payment_provider:
            reasons.append("Подключите платёжную систему.")
        elif not has_payment_credentials:
            reasons.append("Сохраните рабочие реквизиты платёжной системы.")

    return FunnelReadiness(tuple(dict.fromkeys(reasons)))
