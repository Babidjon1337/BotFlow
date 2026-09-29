"""Synchronization and hydration utilities between relational Tariffs and funnel schemas."""

from copy import deepcopy
import logging
from typing import Any
import uuid

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from database.models import BotConfig, Tariff, async_session

logger = logging.getLogger(__name__)


def _extract_tariff_dict(tariff: Tariff) -> dict[str, Any]:
    """Convert an ORM Tariff instance to a dict compatible with FunnelSchema/TariffSchema."""
    price_val = float(tariff.price or 0)
    old_price_val = float(tariff.old_price) if tariff.old_price is not None else None
    deliverables = list(tariff.deliverables or [])
    media_assets = list(tariff.media_assets or [])

    # Determine action_type and action_data from deliverables for backward compatibility
    action_type = "link"
    action_data = ""
    chat_type = None
    if deliverables:
        d0 = deliverables[0]
        dtype = d0.get("type")
        if dtype in ("channel", "group"):
            action_type = "group"
            action_data = str(d0.get("chatId") or "")
            chat_type = d0.get("chatType") or ("channel" if dtype == "channel" else "group")
        elif dtype == "file":
            action_type = "file"
            action_data = str(d0.get("fileUrl") or d0.get("fileId") or d0.get("filePath") or "")
        elif dtype == "link":
            action_type = "link"
            action_data = str(d0.get("url") or "")

    return {
        "id": str(tariff.id),
        "name": tariff.name,
        "price": price_val,
        "oldPrice": old_price_val,
        "old_price": old_price_val,
        "description": tariff.description or "",
        "deliverables": deliverables,
        "mediaAssets": media_assets,
        "media_assets": media_assets,
        "paymentType": tariff.payment_type or "one_time",
        "payment_type": tariff.payment_type or "one_time",
        "recurringPeriod": tariff.recurring_period,
        "recurring_period": tariff.recurring_period,
        "salesMode": tariff.sales_mode or "auto",
        "sales_mode": tariff.sales_mode or "auto",
        "managerUrl": tariff.manager_url,
        "manager_url": tariff.manager_url,
        "buttonText": tariff.button_text,
        "button_text": tariff.button_text,
        "hasDelivery": bool(deliverables),
        "has_delivery": bool(deliverables),
        "actionType": action_type,
        "action_type": action_type,
        "actionData": action_data,
        "action_data": action_data,
        "chatType": chat_type,
        "chat_type": chat_type,
    }


def hydrate_funnel_tariffs(
    raw_schema: dict[str, Any] | None, db_tariffs: list[Tariff]
) -> dict[str, Any] | None:
    """Hydrate raw funnel schema nodes with up-to-date tariff data from the DB.

    Tariffs in payment nodes have their name, price, description, deliverables,
    and settings updated to match the DB row. Inactive or deleted tariffs are removed.
    """
    if not raw_schema or not isinstance(raw_schema, dict):
        return raw_schema

    schema = deepcopy(raw_schema)
    nodes = schema.get("nodes")
    if not nodes:
        return schema

    db_map: dict[str, Tariff] = {str(t.id): t for t in db_tariffs}

    def _hydrate_node_tariffs(node: dict[str, Any]) -> None:
        if not isinstance(node, dict):
            return
        node_id = str(node.get("id", ""))
        current_tariffs = node.get("tariffs")
        if node_id != "payment" and current_tariffs is None:
            return

        if isinstance(current_tariffs, list) and current_tariffs:
            hydrated: list[dict[str, Any]] = []
            for item in current_tariffs:
                if not isinstance(item, dict):
                    continue
                tid = str(item.get("id", ""))
                db_t = db_map.get(tid)
                if not db_t or not db_t.is_active:
                    # Inactive or deleted from database -> omit from funnel
                    continue

                # Merge: start with fresh DB data, preserve node-specific overrides like custom media if set
                merged = {**item, **_extract_tariff_dict(db_t)}
                if item.get("mediaFileId"):
                    merged["mediaFileId"] = item["mediaFileId"]
                if item.get("media_file_id"):
                    merged["media_file_id"] = item["media_file_id"]
                hydrated.append(merged)

            node["tariffs"] = hydrated
        elif (not current_tariffs) and node_id == "payment" and db_tariffs:
            active_tariffs = [t for t in db_tariffs if t.is_active]
            if active_tariffs:
                node["tariffs"] = [_extract_tariff_dict(t) for t in active_tariffs]

    if isinstance(nodes, list):
        for n in nodes:
            _hydrate_node_tariffs(n)
    elif isinstance(nodes, dict):
        for n in nodes.values():
            _hydrate_node_tariffs(n)

    return schema


async def sync_tariff_to_funnel(bot_id: int, tariff: Tariff) -> bool:
    """Synchronize an updated or created tariff into the bot's funnel_schema in PostgreSQL."""
    async with async_session() as session:
        bot = await session.get(BotConfig, bot_id)
        if not bot or not bot.funnel_schema or not isinstance(bot.funnel_schema, dict):
            return False

        schema = deepcopy(bot.funnel_schema)
        nodes = schema.get("nodes")
        if not nodes:
            return False

        tariff_id_str = str(tariff.id)
        changed = False

        def _update_node(node: dict[str, Any]) -> None:
            nonlocal changed
            if not isinstance(node, dict):
                return
            current_tariffs = node.get("tariffs")
            if not isinstance(current_tariffs, list):
                return

            new_list: list[dict[str, Any]] = []
            found = False
            for item in current_tariffs:
                if isinstance(item, dict) and str(item.get("id")) == tariff_id_str:
                    found = True
                    if not tariff.is_active:
                        # Deactivated tariff -> remove from active funnel
                        changed = True
                        continue
                    else:
                        merged = {**item, **_extract_tariff_dict(tariff)}
                        new_list.append(merged)
                        changed = True
                else:
                    new_list.append(item)

            if found:
                node["tariffs"] = new_list

        if isinstance(nodes, list):
            for n in nodes:
                _update_node(n)
        elif isinstance(nodes, dict):
            for n in nodes.values():
                _update_node(n)

        if changed:
            bot.funnel_schema = schema
            flag_modified(bot, "funnel_schema")

            # Re-evaluate funnel readiness
            from database.requests.connected_chat_rq import list_connected_chats
            from database.requests.tariff_rq import list_tariffs_by_bot_id
            from services.funnel_readiness import evaluate_funnel_readiness

            connected_chats = await list_connected_chats(bot_id)
            all_tariffs = await list_tariffs_by_bot_id(bot_id)
            readiness = evaluate_funnel_readiness(
                schema,
                has_payment_provider=bool(bot.payment_provider),
                has_payment_credentials=bool(bot.payment_creds_enc),
                connected_chat_ids={chat.chat_id for chat in connected_chats},
                bot_tariffs=all_tariffs,
            )
            bot.funnel_complete = readiness.is_ready

            await session.commit()
            logger.info(
                "Funnel schema updated for bot_id=%s with tariff_id=%s (active=%s)",
                bot_id,
                tariff_id_str,
                tariff.is_active,
            )
            return True

        return False


async def remove_tariff_from_funnel(bot_id: int, tariff_id: str | uuid.UUID) -> bool:
    """Remove a deleted tariff from the bot's funnel_schema in PostgreSQL."""
    tariff_id_str = str(tariff_id)
    async with async_session() as session:
        bot = await session.get(BotConfig, bot_id)
        if not bot or not bot.funnel_schema or not isinstance(bot.funnel_schema, dict):
            return False

        schema = deepcopy(bot.funnel_schema)
        nodes = schema.get("nodes")
        if not nodes:
            return False

        changed = False

        def _filter_node(node: dict[str, Any]) -> None:
            nonlocal changed
            if not isinstance(node, dict):
                return
            current_tariffs = node.get("tariffs")
            if not isinstance(current_tariffs, list):
                return

            original_len = len(current_tariffs)
            filtered = [
                item
                for item in current_tariffs
                if isinstance(item, dict) and str(item.get("id")) != tariff_id_str
            ]
            if len(filtered) != original_len:
                node["tariffs"] = filtered
                changed = True

        if isinstance(nodes, list):
            for n in nodes:
                _filter_node(n)
        elif isinstance(nodes, dict):
            for n in nodes.values():
                _filter_node(n)

        if changed:
            bot.funnel_schema = schema
            flag_modified(bot, "funnel_schema")

            from database.requests.connected_chat_rq import list_connected_chats
            from database.requests.tariff_rq import list_tariffs_by_bot_id
            from services.funnel_readiness import evaluate_funnel_readiness

            connected_chats = await list_connected_chats(bot_id)
            all_tariffs = await list_tariffs_by_bot_id(bot_id)
            readiness = evaluate_funnel_readiness(
                schema,
                has_payment_provider=bool(bot.payment_provider),
                has_payment_credentials=bool(bot.payment_creds_enc),
                connected_chat_ids={chat.chat_id for chat in connected_chats},
                bot_tariffs=all_tariffs,
            )
            bot.funnel_complete = readiness.is_ready

            await session.commit()
            logger.info("Tariff %s removed from funnel of bot_id=%s", tariff_id_str, bot_id)
            return True

        return False


async def sync_funnel_tariffs_to_db(bot_id: int, active_tariff_ids: set[str]) -> None:
    """Synchronize Tariff.is_active status in DB based on tariffs selected in the funnel."""
    async with async_session() as session:
        result = await session.scalars(select(Tariff).where(Tariff.bot_id == bot_id))
        all_tariffs = list(result.all())
        if not all_tariffs:
            return

        modified = False
        for t in all_tariffs:
            is_active_in_funnel = str(t.id) in active_tariff_ids
            if t.is_active != is_active_in_funnel:
                t.is_active = is_active_in_funnel
                modified = True

        if modified:
            await session.commit()
            logger.info(
                "Synchronized Tariff.is_active for bot_id=%s (active_ids=%s)",
                bot_id,
                active_tariff_ids,
            )
