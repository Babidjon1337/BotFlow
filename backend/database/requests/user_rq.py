from typing import Optional, Any
from sqlalchemy import select, update, delete, func, or_, String
from sqlalchemy.orm import selectinload
from database.models import User, BotConfig, ScheduledTask, Lead, async_session
from datetime import datetime, timedelta, timezone

from schemas.funnel import FunnelSchemaV2, FunnelSchemaOld
from services.funnel_schema import parse_stored_funnel_schema
from loggers import logger


async def update_user_notification_settings(
    user_id: int,
    *,
    email: str | None,
    email_receipts_enabled: bool,
    email_billing_notifications_enabled: bool,
) -> User | None:
    async with async_session() as session:
        user = await session.get(User, user_id)
        if not user:
            return None
        user.email = email
        user.email_receipts_enabled = email_receipts_enabled
        user.email_billing_notifications_enabled = email_billing_notifications_enabled
        await session.commit()
        await session.refresh(user)
        return user





async def get_lead(bot_id: int, telegram_id: int) -> Lead | None:
    """Запрашивает лида по bot_id и telegram_id."""
    async with async_session() as session:
        return await session.scalar(
            select(Lead).where(
                Lead.bot_id == bot_id,
                Lead.telegram_id == telegram_id,
                Lead.is_archived.is_(False),
            )
        )


async def archive_leads_by_bot_id(bot_id: int) -> int:
    """Hide active leads and cancel their drips without deleting payment history."""
    async with async_session() as session:
        async with session.begin():
            lead_ids = list(
                (
                    await session.scalars(
                        select(Lead.id)
                        .where(Lead.bot_id == bot_id, Lead.is_archived.is_(False))
                        .with_for_update()
                    )
                ).all()
            )
            if not lead_ids:
                return 0
            await session.execute(
                delete(ScheduledTask).where(ScheduledTask.lead_id.in_(lead_ids))
            )
            await session.execute(
                update(Lead)
                .where(Lead.id.in_(lead_ids))
                .values(is_archived=True, archived_at=datetime.now(timezone.utc))
            )
            return len(lead_ids)


async def get_funnel_by_bot_id(tg_bot_id: int):
    async with async_session() as session:
        result = await session.scalar(
            select(BotConfig).where(BotConfig.tg_bot_id == tg_bot_id)
        )
        if not result or not result.funnel_schema:
            return None
        return parse_stored_funnel_schema(result.funnel_schema)


async def create_lead(
    tg_bot_id: int,
    telegram_id: int,
    agreed: bool = False,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
):
    async with async_session() as session:
        bot = await session.scalar(
            select(BotConfig).where(BotConfig.tg_bot_id == tg_bot_id)
        )
        if not bot:
            logger.warning(f"Бот с tg_bot_id {tg_bot_id} не найден в базе!")
            return None

        existing_lead = await session.scalar(
            select(Lead).where(
                Lead.bot_id == bot.id,
                Lead.telegram_id == telegram_id,
                Lead.is_archived.is_(False),
            )
        )

        if existing_lead:
            updated = False
            if username and existing_lead.username != username:
                existing_lead.username = username
                updated = True
            if first_name and existing_lead.first_name != first_name:
                existing_lead.first_name = first_name
                updated = True
            if updated:
                await session.commit()
                await session.refresh(existing_lead)
            return existing_lead

        start_step = "start" if not isinstance(bot.funnel_schema.get("nodes"), dict) else "node_start"
        new_lead = Lead(
            bot_id=bot.id,
            telegram_id=telegram_id,
            username=username,
            first_name=first_name,
            agreed_to_tos=agreed,
            current_step_id=start_step if agreed else "awaiting_agreement",
        )

        session.add(new_lead)
        await session.flush()
        await session.commit()
        logger.info(f"🔥 Создан новый лид {telegram_id} ({username}) для бота {bot.id}")

        if agreed:
            await create_reminder(bot.id, new_lead.id, step_just_sent=start_step)

        return new_lead


async def update_lead_agreement(tg_bot_id: int, telegram_id: int, agreed: bool = True):
    """Обновляет статус согласия лида и запускает первый таймер воронки."""
    async with async_session() as session:
        bot = await session.scalar(
            select(BotConfig).where(BotConfig.tg_bot_id == tg_bot_id)
        )
        if not bot:
            return

        lead = await session.scalar(
            select(Lead).where(
                Lead.bot_id == bot.id,
                Lead.telegram_id == telegram_id,
                Lead.is_archived.is_(False),
            )
        )

        if lead and not lead.agreed_to_tos and agreed:
            lead.agreed_to_tos = True
            start_step = "start" if not isinstance(bot.funnel_schema.get("nodes"), dict) else "node_start"
            lead.current_step_id = start_step
            await session.commit()
            logger.info(f"✅ Лид {telegram_id} подтвердил согласие с офертой.")

            # После согласия запускаем первый таймер
            await create_reminder(bot.id, lead.id, step_just_sent=start_step)


async def mark_lead_as_successful(tg_bot_id: int, telegram_id: int) -> bool:
    """
    Вызывается вебхуком, когда прошла оплата!
    Переводит человека на шаг успеха и стирает все его предстоящие дожимы.
    """
    async with async_session() as session:
        bot = await session.scalar(
            select(BotConfig).where(BotConfig.tg_bot_id == tg_bot_id)
        )
        if not bot:
            return False

        result = await session.execute(
            update(Lead)
            .where(
                Lead.bot_id == bot.id,
                Lead.telegram_id == telegram_id,
                Lead.has_purchased.is_(False),
                Lead.is_archived.is_(False),
            )
            .values(current_step_id="node_success", has_purchased=True)
            .returning(Lead.id)
        )
        lead_id = result.scalar_one_or_none()
        if lead_id is None:
            return False

        await session.execute(delete(ScheduledTask).where(ScheduledTask.lead_id == lead_id))
        await session.commit()
        logger.info(f"🎉 Лид {telegram_id} успешно оплатил! Дожимы отменены.")
        return True


async def get_leads_by_bot_id(
    bot_id: int,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    include_archived: bool = False,
) -> tuple[list[Lead], int]:
    """Возвращает список лидов для CRM с пагинацией и поиском."""
    async with async_session() as session:
        query = select(Lead).where(Lead.bot_id == bot_id)
        if not include_archived:
            query = query.where(Lead.is_archived.is_(False))
        if search:
            search_str = f"%{search.lower()}%"
            query = query.where(
                or_(
                    func.lower(Lead.username).like(search_str),
                    func.lower(Lead.first_name).like(search_str),
                    func.cast(Lead.telegram_id, String).like(search_str),
                )
            )
        total_query = select(func.count()).select_from(query.subquery())
        total = await session.scalar(total_query) or 0

        items_query = (
            query.order_by(Lead.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        items = await session.scalars(items_query)
        return list(items.all()), total


async def create_reminder(
    bot_id: int,
    lead_id: int,
    step_just_sent: str,
):
    async with async_session() as session:
        lead = await session.scalar(
            select(Lead).options(selectinload(Lead.bot)).where(Lead.id == lead_id)
        )

        if not lead:
            return

        if lead.is_archived or lead.has_purchased or lead.current_step_id == "node_success":
            logger.info(f"Лид {lead_id} уже совершил покупку. Игнорируем логику таймеров.")
            return

        lead.current_step_id = step_just_sent
        logger.info(f"Обновил запись лида: теперь он на шаге {step_just_sent}")

        funnel_data = lead.bot.funnel_schema
        step_to_send = None
        reminder_after = 0
        funnel_node_json = None

        if isinstance(funnel_data.get("nodes"), dict):
            # Старая логика V1
            old_funnel = FunnelSchemaOld.model_validate(funnel_data)
            step_now = old_funnel.nodes.get(step_just_sent)
            if step_now and step_now.timer:
                step_to_send = step_now.timer.next_node_id
                reminder_after = step_now.timer.delay_seconds
                funnel_node = old_funnel.nodes.get(step_to_send)
                if funnel_node:
                    funnel_node_json = funnel_node.model_dump()
        else:
            # Новая логика V2
            v2_funnel = FunnelSchemaV2.model_validate(funnel_data)
            step_now = v2_funnel.get_node(step_just_sent)
            next_node = v2_funnel.get_next_node(step_just_sent)
            if step_now and next_node and next_node.kind != "payment":
                step_to_send = next_node.id
                reminder_after = next_node.delay_seconds
                if reminder_after <= 0 and step_now.delay_seconds > 0:
                    reminder_after = step_now.delay_seconds
                funnel_node_json = next_node.model_dump(by_alias=True)

        if step_to_send and reminder_after > 0:
            existing_task = await session.scalar(
                select(ScheduledTask).where(
                    ScheduledTask.bot_id == bot_id,
                    ScheduledTask.lead_id == lead_id,
                    ScheduledTask.step_to_send == step_to_send,
                )
            )

            if not existing_task:
                execute_at = datetime.now(timezone.utc) + timedelta(seconds=reminder_after)

                task = ScheduledTask(
                    bot_id=bot_id,
                    lead_id=lead_id,
                    step_to_send=step_to_send,
                    raw_node_json=funnel_node_json,
                    execute_at=execute_at,
                )

                session.add(task)
                logger.info(f"Новая задача запланирована: {step_to_send} через {reminder_after} сек")

        await session.commit()


async def get_reminder_tasks():
    async with async_session() as session:
        result = await session.scalars(
            select(ScheduledTask)
            .options(selectinload(ScheduledTask.lead).selectinload(Lead.bot))
            .join(Lead)
            .where(
                ScheduledTask.execute_at <= datetime.now(timezone.utc),
                Lead.is_archived.is_(False),
            )
        )

        return result.all()


async def delete_list_tasks(task_ids: list):
    async with async_session() as session:
        await session.execute(
            delete(ScheduledTask).where(ScheduledTask.id.in_(task_ids))
        )
        logger.info(f"Удалил записи {task_ids}")
        await session.commit()


async def delete_task(task_id: int):
    async with async_session() as session:
        task = await session.get(ScheduledTask, task_id)

        if task:
            await session.delete(task)
            await session.commit()
