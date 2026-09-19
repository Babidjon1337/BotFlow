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


START_NODE_ID = "start"
REMINDER_NODE_KIND = "reminder"
MAX_REMINDER_NODES = 5
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

    raw_nodes = [_as_dict(node) for node in nodes_value]
    nodes = {node.get("id"): node for node in raw_nodes}
    reminder_nodes = [node for node in raw_nodes if node.get("kind") == REMINDER_NODE_KIND]
    if len(reminder_nodes) > MAX_REMINDER_NODES:
        reasons.append(f"Можно добавить не больше {MAX_REMINDER_NODES} дожимов.")

    message_nodes: list[tuple[dict[str, Any] | None, str]] = [
        (nodes.get(START_NODE_ID), "Старт"),
        *[(node, f"Дожим {index}") for index, node in enumerate(reminder_nodes, start=1)],
    ]
    for node, title in message_nodes:
        if not node:
            reasons.append(f"Добавьте блок «{title}».")
            continue
        if _visible_length(node.get("content")) == 0:
            reasons.append(f"Заполните текст блока «{title}».")
        else:
            media_assets = node.get("mediaAssets")
            has_media = bool(
                node.get("mediaFileId")
                or node.get("media_file_id")
                or node.get("media")
                or (isinstance(media_assets, list) and media_assets)
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
            elif _visible_length(selection_text) > (
                MAX_MEDIA_CAPTION_CHARACTERS
                if payment.get("mediaFileId") or payment.get("media_file_id")
                else MAX_MESSAGE_CHARACTERS
            ):
                reasons.append(
                    "Сократите текст выбора тарифов до "
                    f"{MAX_MEDIA_CAPTION_CHARACTERS if payment.get('mediaFileId') or payment.get('media_file_id') else MAX_MESSAGE_CHARACTERS} символов."
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
            invoice_max_length = (
                MAX_MEDIA_CAPTION_CHARACTERS
                if tariff.get("mediaFileId") or tariff.get("media_file_id")
                else MAX_MESSAGE_CHARACTERS
            )
            if invoice_length > invoice_max_length:
                reasons.append(
                    f"Сократите текст счёта или описание: {label} не помещается в сообщение Telegram."
                )
            has_delivery = tariff.get("hasDelivery", tariff.get("has_delivery", True))
            action_data = _text(tariff.get("actionData", tariff.get("action_data", "")))
            if mode in {"auto", "hybrid"} and has_delivery is not False and not action_data:
                reasons.append(f"Настройте выдачу после оплаты: {label}.")
            action_type = tariff.get("actionType", tariff.get("action_type", "link"))
            if action_type == "group":
                if action_data and connected_chat_ids is not None:
                    # action_data can be a JSON array of strings or a single string
                    try:
                        import json
                        chat_ids = json.loads(action_data) if action_data.startswith("[") else [action_data]
                        if not isinstance(chat_ids, list):
                            chat_ids = [str(chat_ids)]
                    except Exception:
                        chat_ids = [action_data]
                        
                    if any(str(cid) not in connected_chat_ids for cid in chat_ids):
                        reasons.append(
                            f"Выберите подключённый канал или группу для выдачи: {label}."
                        )
                access_mode = tariff.get("chatAccessMode", tariff.get("chat_access_mode", "member"))
                if isinstance(access_mode, str) and access_mode.startswith("{"):
                    pass # It's a per-chat dict, valid
                elif isinstance(access_mode, dict):
                    pass
                elif access_mode not in {"member", "read_only"}:
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
        for node, _title in message_nodes:
            if node and not _text(_node_value(node, "button_text2", "buttonText2")):
                reasons.append("В гибридном режиме заполните вторую кнопку каждого сообщения.")
                break

    if mode in {"auto", "hybrid"}:
        if not has_payment_provider:
            reasons.append("Подключите платёжную систему.")
        elif not has_payment_credentials:
            reasons.append("Сохраните рабочие реквизиты платёжной системы.")

    return FunnelReadiness(tuple(dict.fromkeys(reasons)))


def format_russian_list(items: list[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} и {items[1]}"
    return f"{', '.join(items[:-1])} и {items[-1]}"


def format_readiness_errors(reasons: Iterable[str], header: str = "Нельзя запустить бота:") -> str:
    """Group and format readiness reasons into structured, concise category lines.

    Example:
    Нельзя запустить бота:
    • Сценарий: заполните «Старт», «Дожим 1» и «Дожим 2».
    • Тариф «Тариф 1»: укажите название, цену, описание и выдачу.
    • Оплата: подключите платёжную систему.
    """
    reasons_list = [r.strip() for r in reasons if r and r.strip()]
    if not reasons_list:
        return "Заполните сценарий перед запуском бота."

    lines: list[str] = []

    # 1. Сценарий
    missing_blocks: list[str] = []
    fill_blocks: list[str] = []
    other_scenario: list[str] = []

    for r in reasons_list:
        m_add = re.search(r"Добавьте блок «([^»]+)»", r)
        if m_add:
            missing_blocks.append(f"«{m_add.group(1)}»")
            continue

        m_fill_text = re.search(r"Заполните текст блока «([^»]+)»", r)
        if m_fill_text:
            b = f"«{m_fill_text.group(1)}»"
            if b not in fill_blocks:
                fill_blocks.append(b)
            continue

        m_fill_btn = re.search(r"Заполните кнопку блока «([^»]+)»", r)
        if m_fill_btn:
            b = f"«{m_fill_btn.group(1)}»"
            if b not in fill_blocks:
                fill_blocks.append(b)
            continue

        if "актуальном формате" in r:
            other_scenario.append("сохраните воронку в актуальном формате")
        elif "дожимов" in r and "не больше" in r:
            other_scenario.append("оставьте не больше 5 дожимов")
        elif "вторую кнопку" in r:
            other_scenario.append("в гибридном режиме заполните кнопки связи с менеджером")

    scenario_parts: list[str] = []
    if missing_blocks:
        scenario_parts.append(f"добавьте {format_russian_list(missing_blocks)}")
    if fill_blocks:
        scenario_parts.append(f"заполните {format_russian_list(fill_blocks)}")
    if other_scenario:
        scenario_parts.extend(other_scenario)

    if scenario_parts:
        lines.append(f"Сценарий: {format_russian_list(scenario_parts)}.")

    # 2. Тарифы
    tariff_issues: dict[str, list[str]] = {}
    general_tariff: list[str] = []

    if any("хотя бы один тариф" in r for r in reasons_list):
        general_tariff.append("добавьте хотя бы один тариф")
    if any("текст выбора тарифов" in r for r in reasons_list):
        general_tariff.append("добавьте текст выбора тарифов")

    for r in reasons_list:
        m_t = re.search(r"тариф (\d+)", r, re.IGNORECASE)
        if m_t:
            num = m_t.group(1)
            t_key = f"Тариф {num}"
            missing_fields = tariff_issues.setdefault(t_key, [])
            if "название" in r and "название" not in missing_fields:
                missing_fields.append("название")
            if "цену" in r and "цену" not in missing_fields:
                missing_fields.append("цену")
            if "описание" in r and "описание" not in missing_fields:
                missing_fields.append("описание")
            if ("выдачу" in r or "канал или группу" in r or "профиль доступа" in r) and "выдачу" not in missing_fields:
                missing_fields.append("выдачу")

    if general_tariff:
        lines.append(f"Тарифы: {format_russian_list(general_tariff)}.")

    for t_name, fields in tariff_issues.items():
        if fields:
            lines.append(f"Тариф «{t_name}»: укажите {format_russian_list(fields)}.")

    # 3. Оплата
    payment_parts: list[str] = []
    if any("платёжную систему" in r and "реквизиты" not in r for r in reasons_list):
        payment_parts.append("подключите платёжную систему")
    if any("реквизиты" in r for r in reasons_list):
        payment_parts.append("сохраните реквизиты платёжной системы")
    if any("режим продажи" in r for r in reasons_list):
        payment_parts.append("выберите режим продажи")

    if payment_parts:
        lines.append(f"Оплата: {format_russian_list(payment_parts)}.")

    # 4. Менеджер
    if any("менеджер" in r.lower() for r in reasons_list) and not any("вторую кнопку" in r for r in reasons_list):
        lines.append("Менеджер: укажите ссылку и текст обращения.")

    # 5. Остальные причины
    handled_keywords = [
        "старт", "дожим", "тариф", "платёжн", "реквизит",
        "менеджер", "оплата и выдача", "воронку", "продажи",
    ]
    for r in reasons_list:
        if not any(kw in r.lower() for kw in handled_keywords):
            clean = r.rstrip(".")
            if clean not in lines:
                lines.append(f"{clean}.")

    if not lines:
        lines = [r.rstrip(".") + "." for r in reasons_list[:3]]

    bullet_lines = "\n• ".join(lines)
    if header:
        return f"{header}\n• {bullet_lines}"
    return f"• {bullet_lines}"

