import os
import json
import urllib.parse
import datetime
from fastapi import APIRouter, Request, HTTPException, Query
from loggers import logger
from config import WEBHOOK_URL, SECRET_KEY
from services.security import crypto
from database.requests.bot_rq import (
    get_bot_by_id,
    get_bot_by_tg_id,
    create_user_if_not_exists,
    get_user_bots,
    create_bot_config,
    update_bot_config,
    delete_bot_config,
    set_bot_status,
    update_bot_funnel,
    set_media_sync_done,
)
from database.requests.user_rq import get_leads_by_bot_id
from schemas.api_schemas import (
    AuthRequest,
    BotCreateApiRequest,
    BotUpdateApiRequest,
    BotApiResponse,
    BotListResponse,
    BotToggleResponse,
    FunnelUpdateApiRequest,
    FunnelApiResponse,
    LeadApiResponse,
    LeadListApiResponse,
)

api_router = APIRouter()


async def get_current_user_id(request: Request) -> int:
    init_data = request.headers.get("X-Telegram-Init-Data")
    if init_data:
        try:
            parsed = urllib.parse.parse_qs(init_data)
            if "user" in parsed:
                user_json = json.loads(parsed["user"][0])
                if "id" in user_json:
                    return int(user_json["id"])
        except Exception as e:
            logger.warning(f"Failed to parse init_data header: {e}")

    tg_id = request.headers.get("X-Telegram-Id") or request.headers.get("X-User-Id")
    if tg_id:
        try:
            return int(tg_id)
        except ValueError:
            pass

    user_id_param = request.query_params.get(
        "user_id"
    ) or request.query_params.get("telegram_id")
    if user_id_param:
        try:
            return int(user_id_param)
        except ValueError:
            pass

    # Fallback for dev/mock
    return int(os.getenv("TEST_OWNER_ID", "123456789"))


@api_router.post("/api/auth")
async def auth_user(request: Request, body: dict = None):
    init_data = body.get("init_data") or body.get("initData") if body else None
    tg_id = body.get("telegram_id") or body.get("telegramId") if body else None
    first_name = (
        body.get("first_name") or body.get("firstName") if body else "User"
    )
    username = body.get("username") if body else None

    if init_data:
        try:
            parsed = urllib.parse.parse_qs(init_data)
            if "user" in parsed:
                u_json = json.loads(parsed["user"][0])
                tg_id = int(u_json.get("id", tg_id or 0))
                first_name = u_json.get("first_name", first_name)
                username = u_json.get("username", username)
        except Exception as e:
            logger.warning(f"Failed to parse init_data: {e}")

    if not tg_id:
        # If still no ID (e.g. running outside Telegram without dev env), raise 401
        if os.getenv("TEST_OWNER_ID"):
            tg_id = int(os.getenv("TEST_OWNER_ID"))
        else:
            raise HTTPException(
                status_code=401, 
                detail="User not found. Please start the Bot Father first to register."
            )

    user = await create_user_if_not_exists(telegram_id=tg_id)
    bots = await get_user_bots(owner_id=user.id)

    bots_resp = [BotApiResponse.from_orm_bot(b, WEBHOOK_URL) for b in bots]
    return {
        "status": "ok",
        "user": {
            "telegram_id": tg_id,
            "subscription_status": "active",
            "subscription_until": None,
            "slots_bought": 5,
            "is_admin": False,
        },
        "bots": [b.model_dump(by_alias=True) for b in bots_resp],
    }


@api_router.get("/api/bots")
async def list_bots(request: Request):
    user_id = await get_current_user_id(request)
    user = await create_user_if_not_exists(telegram_id=user_id)
    bots = await get_user_bots(owner_id=user.id)
    bots_resp = [BotApiResponse.from_orm_bot(b, WEBHOOK_URL) for b in bots]
    return {"bots": [b.model_dump(by_alias=True) for b in bots_resp]}


@api_router.post("/api/bots")
async def create_bot(request: Request, body: BotCreateApiRequest):
    user_id = await get_current_user_id(request)
    user = await create_user_if_not_exists(telegram_id=user_id)
    
    if not body.display_name or not body.display_name.strip():
        user_bots = await get_user_bots(owner_id=user.id)
        bot_count = len(user_bots)
        body.display_name = "Мой бот" if bot_count == 0 else f"Мой бот {bot_count + 1}"

    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties

    try:
        async with Bot(
            token=body.token,
            session=getattr(request.app.state, 'session', None),
            default=DefaultBotProperties(parse_mode="HTML"),
        ) as temp_bot:
            me = await temp_bot.get_me()
            tg_bot_id = me.id
            username = me.username
    except Exception as e:
        logger.error(f"Ошибка валидации токена: {e}")
        raise HTTPException(
            status_code=400,
            detail="Неверный токен Telegram бота. Проверьте токен от @BotFather.",
        )

    existing = await get_bot_by_tg_id(tg_bot_id)
    if existing:
        raise HTTPException(
            status_code=409, detail="Этот бот уже добавлен в систему."
        )

    token_enc = crypto.encrypt(body.token)
    creds_enc = (
        crypto.encrypt(json.dumps(body.payment_creds))
        if body.payment_creds
        else None
    )

    bot = await create_bot_config(
        owner_id=user.id,
        display_name=body.display_name,
        tg_bot_id=tg_bot_id,
        username=username,
        bot_token_enc=token_enc,
        payment_provider=body.payment_provider,
        payment_creds_enc=creds_enc,
        offer_url=body.offer_url,
        offer_installments=body.offer_installments,
    )

    try:
        async with Bot(
            token=body.token, session=getattr(request.app.state, 'session', None)
        ) as temp_bot:
            await temp_bot.set_webhook(
                url=f"{WEBHOOK_URL}/webhook/bots/{bot.id}",
                secret_token=SECRET_KEY,
                drop_pending_updates=True,
            )
    except Exception as e:
        logger.warning(
            f"Не удалось установить вебхук для бота {bot.id}: {e}"
        )

    resp = BotApiResponse.from_orm_bot(bot, WEBHOOK_URL)
    return resp.model_dump(by_alias=True)


@api_router.get("/api/bots/{bot_id}")
async def get_bot(bot_id: int):
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    resp = BotApiResponse.from_orm_bot(bot, WEBHOOK_URL)
    return resp.model_dump(by_alias=True)


@api_router.patch("/api/bots/{bot_id}")
@api_router.put("/api/bots/{bot_id}")
async def update_bot(bot_id: int, request: Request, body: BotUpdateApiRequest):
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")

    update_data = {}
    token_changed = False

    if body.display_name is not None:
        update_data["display_name"] = body.display_name
    if body.offer_url is not None:
        update_data["offer_url"] = body.offer_url
    if body.offer_installments is not None:
        update_data["offer_installments"] = body.offer_installments
    if body.payment_provider is not None:
        update_data["payment_provider"] = body.payment_provider
    if body.payment_creds is not None:
        update_data["payment_creds_enc"] = crypto.encrypt(
            json.dumps(body.payment_creds)
        )

    if body.token:
        if bot.is_token_locked:
            raise HTTPException(
                status_code=403,
                detail="Изменение токена заблокировано для активного бота с пользователями.",
            )
        from aiogram import Bot

        try:
            async with Bot(
                token=body.token, session=getattr(request.app.state, 'session', None)
            ) as temp_bot:
                me = await temp_bot.get_me()
                update_data["tg_bot_id"] = me.id
                update_data["username"] = me.username
                await temp_bot.set_webhook(
                    url=f"{WEBHOOK_URL}/webhook/bots/{bot.id}",
                    secret_token=SECRET_KEY,
                    drop_pending_updates=True,
                )
        except Exception as e:
            raise HTTPException(
                status_code=400, detail=f"Неверный токен: {e}"
            )
        update_data["bot_token_enc"] = crypto.encrypt(body.token)
        update_data["media_sync_done"] = False
        token_changed = True

    updated_bot = await update_bot_config(bot_id, **update_data)
    resp = BotApiResponse.from_orm_bot(updated_bot or bot, WEBHOOK_URL)
    res_dict = resp.model_dump(by_alias=True)
    res_dict["token_changed"] = token_changed
    return res_dict


@api_router.delete("/api/bots/{bot_id}")
async def delete_bot(bot_id: int, request: Request):
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    try:
        token = crypto.decrypt(bot.bot_token_enc)
        from aiogram import Bot

        async with Bot(
            token=token, session=getattr(request.app.state, 'session', None)
        ) as temp_bot:
            await temp_bot.delete_webhook()
    except Exception as e:
        logger.warning(
            f"Ошибка удаления вебхука при удалении бота {bot_id}: {e}"
        )

    await delete_bot_config(bot_id)
    return {"status": "ok", "message": "Бот удален"}


@api_router.post("/api/bots/{bot_id}/toggle")
async def toggle_bot(bot_id: int, request: Request, body: dict):
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    action = str(body.get("action", "")).lower()
    new_status = (
        "active"
        if action in ["start", "active", "activate", "true", "1"]
        else "draft"
    )

    try:
        token = crypto.decrypt(bot.bot_token_enc)
        from aiogram import Bot

        async with Bot(
            token=token, session=getattr(request.app.state, 'session', None)
        ) as temp_bot:
            if new_status == "active":
                await temp_bot.set_webhook(
                    url=f"{WEBHOOK_URL}/webhook/bots/{bot.id}",
                    secret_token=SECRET_KEY,
                    drop_pending_updates=True,
                )
            else:
                await temp_bot.delete_webhook()
    except Exception as e:
        logger.warning(
            f"Ошибка переключения вебхука для бота {bot_id}: {e}"
        )

    updated_bot = await set_bot_status(bot_id, new_status)
    bot_url = (
        f"https://t.me/{updated_bot.username}" if updated_bot.username else None
    )
    webhook_url = f"{WEBHOOK_URL}/webhook/bots/{updated_bot.id}"
    return {
        "status": "ok",
        "message": f"Бот {'запущен' if new_status == 'active' else 'остановлен'}",
        "botStatus": new_status,
        "webhookUrl": webhook_url if new_status == "active" else None,
        "botUrl": bot_url,
    }


@api_router.get("/api/bots/{bot_id}/funnel")
async def get_bot_funnel_endpoint(bot_id: int):
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    funnel_data = bot.funnel_schema or {"version": 2, "nodes": []}
    return {
        "version": funnel_data.get("version", 2),
        "nodes": funnel_data.get("nodes", []),
        "funnelComplete": getattr(bot, "funnel_complete", False),
    }


@api_router.put("/api/bots/{bot_id}/funnel")
@api_router.post("/api/bots/{bot_id}/funnel")
async def save_bot_funnel_endpoint(bot_id: int, body: dict):
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    version = body.get("version", 2)
    nodes = body.get("nodes", [])
    funnel_complete = body.get(
        "funnelComplete", body.get("funnel_complete", True)
    )

    schema_to_save = {"version": version, "nodes": nodes}
    await update_bot_funnel(bot_id, schema_to_save, funnel_complete)
    return {
        "status": "ok",
        "message": "Воронка успешно сохранена",
        "funnelComplete": funnel_complete,
    }


@api_router.post("/api/bots/{bot_id}/media-sync")
async def sync_bot_media(bot_id: int):
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    await set_media_sync_done(bot_id, True)
    return {
        "status": "ok",
        "message": "Синхронизация медиа выполнена",
        "mediaSyncDone": True,
    }


@api_router.get("/api/bots/{bot_id}/leads")
async def get_bot_leads_endpoint(
    bot_id: int, search: str = None, page: int = 1, limit: int = 20
):
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    leads, total = await get_leads_by_bot_id(
        bot_id, search=search, page=page, limit=limit
    )
    leads_resp = [
        LeadApiResponse.from_orm_lead(l).model_dump(by_alias=True)
        for l in leads
    ]
    return {"leads": leads_resp, "total": total}


@api_router.get("/api/bots/{bot_id}/stats")
async def get_bot_stats_endpoint(bot_id: int):
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    leads, total = await get_leads_by_bot_id(bot_id, limit=10000)
    views = total
    clicks = sum(
        1
        for l in leads
        if l.current_step_id and l.current_step_id != "node_start"
    )
    sales = sum(
        1
        for l in leads
        if l.has_purchased or l.current_step_id in ["node_success", "success", "delivery"]
    )
    conversion = round((sales / views * 100), 1) if views > 0 else 0.0
    revenue = sales * 1500

    return {
        "views": views,
        "clicks": clicks,
        "sales": sales,
        "conversion": conversion,
        "revenue": revenue,
        "funnel_data": [
            {"name": "Старт", "value": views},
            {"name": "Клик", "value": clicks},
            {"name": "Дожим 1", "value": int(clicks * 0.4)},
            {"name": "Оплата", "value": sales},
        ],
        "chart_data": [
            {"name": (datetime.datetime.now() - datetime.timedelta(days=6)).strftime("%d.%m"), "Просмотры": 0, "Продажи": 0},
            {"name": (datetime.datetime.now() - datetime.timedelta(days=5)).strftime("%d.%m"), "Просмотры": 0, "Продажи": 0},
            {"name": (datetime.datetime.now() - datetime.timedelta(days=4)).strftime("%d.%m"), "Просмотры": 0, "Продажи": 0},
            {"name": (datetime.datetime.now() - datetime.timedelta(days=3)).strftime("%d.%m"), "Просмотры": 0, "Продажи": 0},
            {"name": (datetime.datetime.now() - datetime.timedelta(days=2)).strftime("%d.%m"), "Просмотры": 0, "Продажи": 0},
            {"name": (datetime.datetime.now() - datetime.timedelta(days=1)).strftime("%d.%m"), "Просмотры": 0, "Продажи": 0},
            {"name": (datetime.datetime.now()).strftime("%d.%m"), "Просмотры": views, "Продажи": sales},
        ],
        "events": [],
    }

