"""Server-side readiness rules for publishing a client bot.

The Mini App may show helpful local hints, but it must never be the authority
that decides whether an incomplete funnel can receive real traffic.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


REQUIRED_MESSAGE_NODE_IDS = ("start", "push1", "push2")
PAYMENT_NODE_ID = "payment"


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


def _node_value(node: dict[str, Any], snake_case: str, camel_case: str) -> Any:
    return node.get(camel_case, node.get(snake_case))


def evaluate_funnel_readiness(
    funnel_schema: dict[str, Any] | None,
    *,
    has_payment_provider: bool,
    has_payment_credentials: bool,
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
        if not _text(_node_value(node, "button_text", "buttonText")):
            reasons.append(f"Заполните кнопку блока «{title}».")

    payment = nodes.get(PAYMENT_NODE_ID)
    if not payment:
        reasons.append("Добавьте блок «Оплата и выдача».")
        return FunnelReadiness(tuple(reasons))

    mode = _node_value(payment, "payment_mode", "paymentMode") or "auto"
    tariffs = payment.get("tariffs")
    if not isinstance(tariffs, list) or not tariffs:
        reasons.append("Добавьте хотя бы один тариф.")
    else:
        if len(tariffs) > 1 and not _text(
            _node_value(payment, "tariff_selection_text", "tariffSelectionText")
        ):
            reasons.append("Добавьте текст выбора тарифов.")
        for index, raw_tariff in enumerate(tariffs, start=1):
            tariff = _as_dict(raw_tariff)
            label = f"тариф {index}"
            if not _text(tariff.get("name")):
                reasons.append(f"Укажите название: {label}.")
            try:
                price_is_valid = float(tariff.get("price", 0)) > 0
            except (TypeError, ValueError):
                price_is_valid = False
            if not price_is_valid:
                reasons.append(f"Укажите цену больше нуля: {label}.")
            if not _text(tariff.get("description")):
                reasons.append(f"Добавьте описание: {label}.")
            has_delivery = tariff.get("hasDelivery", tariff.get("has_delivery", True))
            action_data = _text(tariff.get("actionData", tariff.get("action_data", "")))
            if mode in {"auto", "hybrid"} and has_delivery is not False and not action_data:
                reasons.append(f"Настройте выдачу после оплаты: {label}.")

    if mode not in {"auto", "application", "hybrid"}:
        reasons.append("Выберите корректный режим продажи.")
    if mode in {"application", "hybrid"} and not _text(
        _node_value(payment, "manager_text", "managerText")
    ):
        reasons.append("Добавьте текст для обращения к менеджеру.")
    if mode == "hybrid":
        for node_id in REQUIRED_MESSAGE_NODE_IDS:
            node = nodes.get(node_id)
            if node and not _text(_node_value(node, "button_text2", "buttonText2")):
                reasons.append("В гибридном режиме заполните вторую кнопку каждого сообщения.")
                break

    if not has_payment_provider:
        reasons.append("Подключите платёжную систему.")
    elif not has_payment_credentials:
        reasons.append("Сохраните рабочие реквизиты платёжной системы.")

    return FunnelReadiness(tuple(dict.fromkeys(reasons)))
