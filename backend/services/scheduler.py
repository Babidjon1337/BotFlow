from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram import Bot
from aiogram.exceptions import (
    TelegramForbiddenError,
    TelegramBadRequest,
    TelegramRetryAfter,
    TelegramAPIError,
)
import asyncio
from datetime import datetime, timezone

from schemas.funnel import FunnelSchemaV2, FunnelSchemaOld
from database.requests import *
from services.security import crypto
from loggers import logger
from keyboard.user_kb import *
from services.funnel_message import send_funnel_node_message
from services.manager_link import build_manager_deep_link
from database.requests.billing_rq import get_users_due_for_subscription_renewal
from services.billing_notifications import notify_billing_user
from services.saas_billing import BillingError, create_recurring_payment
from database.requests.bot_rq import enforce_non_pro_bot_limits
from database.models import Lead, ClientPayment
from config import PROXY_URL
from database.requests.client_payment_rq import get_due_client_payment_delivery_ids
from services.payment_fulfillment import process_client_payment_fulfillment

scheduler = AsyncIOScheduler()
shared_scheduler_session = AiohttpSession(proxy=PROXY_URL) if PROXY_URL else AiohttpSession()
scheduler_runtime: dict[str, dict[str, str | None]] = {}


async def check_reminders_job():
    tasks = await get_reminder_tasks()
    if not tasks:
        return

    tasks_by_bot = {}
    for task in tasks:
        if task.bot_id not in tasks_by_bot:
            tasks_by_bot[task.bot_id] = []
        tasks_by_bot[task.bot_id].append(task)

    coroutines = [
        send_bot_reminders(bot_id, bot_tasks)
        for bot_id, bot_tasks in tasks_by_bot.items()
    ]
    grouped_results = await asyncio.gather(*coroutines)

    task_ids_to_delete = []
    for bot_results in grouped_results:
        for result_dict in bot_results:
            for task_id, status in result_dict.items():
                if status != "keep_for_retry":
                    task_ids_to_delete.append(task_id)

    if task_ids_to_delete:
        await delete_list_tasks(task_ids_to_delete)


async def renew_pro_subscriptions_job():
    """Attempt due automatic PRO renewals; each attempt is idempotent in YooKassa."""
    users = await get_users_due_for_subscription_renewal()
    for user in users:
        try:
            was_applied, renewed_user = await create_recurring_payment(user)
            if was_applied and renewed_user:
                await notify_billing_user(
                    renewed_user.telegram_id,
                    "✅ С карты списано <b>3 000 ₽</b>. PRO-подписка продлена на 30 дней.",
                )
        except BillingError as exc:
            logger.warning("Не удалось запустить продление PRO для %s: %s", user.id, exc)
            if user.subscription_retry_count >= 2:
                await enforce_non_pro_bot_limits(user.id)
                await notify_billing_user(
                    user.telegram_id,
                    "❌ Не удалось продлить PRO после трёх попыток. Подписка завершена; доступны только ваши лицензированные боты.",
                )
            else:
                await notify_billing_user(
                    user.telegram_id,
                    "⚠️ Не удалось автоматически продлить <b>PRO</b>. Мы повторим попытку завтра.",
                )


async def retry_client_payment_fulfillments_job():
    """Retry paid access and owner notifications from durable payment state."""
    payment_ids = await get_due_client_payment_delivery_ids()
    for payment_id in payment_ids:
        await process_client_payment_fulfillment(
            payment_id, shared_scheduler_session
        )


async def send_bot_reminders(bot_id: int, tasks: list[ScheduledTask]) -> list[dict]:
    results = []
    bot_config = tasks[0].lead.bot

    token = crypto.decrypt(bot_config.bot_token_enc)
    bot = Bot(
        token=token,
        session=shared_scheduler_session,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )

    for task in tasks:
        step_id = task.step_to_send

        try:
            node = None
            if task.raw_node_json:
                node = task.raw_node_json
            else:
                funnel_schema = bot_config.funnel_schema
                if isinstance(funnel_schema, dict):
                    nodes = funnel_schema.get("nodes")
                    if isinstance(nodes, list):
                        node = next((n for n in nodes if n.get("id") == step_id), None)
                    elif isinstance(nodes, dict):
                        node = nodes.get(step_id)

            if node:
                funnel_schema = bot_config.funnel_schema if isinstance(bot_config.funnel_schema, dict) else {}
                nodes_value = funnel_schema.get("nodes") or []
                payment_node = next(
                    (item for item in nodes_value if isinstance(item, dict) and item.get("id") == "payment"),
                    {},
                ) if isinstance(nodes_value, list) else {}
                mode = payment_node.get("paymentMode") or payment_node.get("payment_mode") or "auto"
                primary_text = node.get("buttonText") or node.get("button_text") or "Продолжить"
                secondary_text = node.get("buttonText2") or node.get("button_text2") or "Связаться с менеджером"
                manager_url = build_manager_deep_link(
                    payment_node.get("managerUrl") or payment_node.get("manager_url"),
                    payment_node.get("managerText") or payment_node.get("manager_text"),
                )
                await send_funnel_node_message(
                    bot,
                    task.lead.telegram_id,
                    node,
                    reply_markup=user_funnel_action_keyboard(
                        mode, primary_text, secondary_text, manager_url
                    ),
                )
                await create_reminder(
                    bot_id=bot_id, lead_id=task.lead.id, step_just_sent=step_id
                )
                results.append({task.id: "success"})
            else:
                results.append({task.id: "delete"})

        except TelegramForbiddenError:
            logger.info(
                f"🚫 Бот {bot_id} заблокирован пользователем {task.lead.telegram_id}. Удаляем задачу."
            )
            results.append({task.id: "delete"})

        except TelegramBadRequest as e:
            logger.warning(
                f"⚠️ Кривая ошибка запроса (чат удален или битый медиафайл): {e}"
            )
            results.append({task.id: "delete"})

        except (TelegramRetryAfter, TelegramAPIError) as e:
            logger.warning(
                f"⏳ Временный сбой/флуд-лимит у бота {bot_id}. Попробуем позже. Ошибка: {e}"
            )
            results.append({task.id: "keep_for_retry"})

        except Exception as e:
            logger.error(f"❌ Непредвиденная ошибка у бота {bot_id}: {e}")
            results.append({task.id: "keep_for_retry"})

        finally:
            await asyncio.sleep(0.05)

    return results


def apscheduler_listener(event):
    scheduler_runtime[event.job_id] = {
        "last_finished_at": datetime.now(timezone.utc).isoformat(),
        "last_error": str(event.exception) if event.exception else None,
    }
    if event.exception:
        logger.error(f"❌ Задача '{event.job_id}' упала с ошибкой: {event.exception}")
    else:
        logger.info(f"⚡ Задача '{event.job_id}' успешно выполнена.")


def start_scheduler():
    if scheduler.running:
        logger.info("⏳ Планировщик уже запущен.")
        return
    scheduler.add_listener(apscheduler_listener, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)
    scheduler.add_job(
        check_reminders_job,
        trigger="interval",
        seconds=60,
        max_instances=1,
        coalesce=True,
        id="bot-reminders",
        replace_existing=True,
    )
    scheduler.add_job(
        renew_pro_subscriptions_job,
        trigger="interval",
        minutes=15,
        max_instances=1,
        coalesce=True,
        id="pro-renewals",
        replace_existing=True,
    )
    scheduler.add_job(
        retry_client_payment_fulfillments_job,
        trigger="interval",
        seconds=60,
        max_instances=1,
        coalesce=True,
        id="client-payment-fulfillment",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("⏳ Планировщик успешно запущен и следит за дожимами!")


def get_scheduler_health() -> dict:
    """Return the scheduler state for this application process only."""
    jobs = []
    for job in scheduler.get_jobs():
        runtime = scheduler_runtime.get(job.id, {})
        jobs.append(
            {
                "id": job.id,
                "next_run_at": job.next_run_time.isoformat() if job.next_run_time else None,
                "last_finished_at": runtime.get("last_finished_at"),
                "last_error": runtime.get("last_error"),
            }
        )
    return {"running": scheduler.running, "jobs": jobs}


async def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
    await shared_scheduler_session.close()
    logger.info("🛑 APScheduler и его сессия успешно остановлены.")
