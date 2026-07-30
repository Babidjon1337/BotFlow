from typing import Optional, Any
from sqlalchemy import select, delete, update
from sqlalchemy.orm import joinedload, selectinload
from database.models import BotConfig, User, async_session


async def get_bot_by_id(id: int) -> BotConfig | None:
    """Запрашивает конфигурацию бота по его внутреннему ID вместе с владельцем."""
    async with async_session() as session:
        return await session.scalar(
            select(BotConfig)
            .options(joinedload(BotConfig.owner))
            .where(BotConfig.id == id)
        )


async def get_bot_by_tg_id(tg_bot_id: int) -> BotConfig | None:
    """Запрашивает конфигурацию бота по его Telegram ID вместе с владельцем."""
    async with async_session() as session:
        return await session.scalar(
            select(BotConfig)
            .options(joinedload(BotConfig.owner))
            .where(BotConfig.tg_bot_id == tg_bot_id)
        )


async def create_user_if_not_exists(telegram_id: int) -> User:
    """Создает пользователя, если его еще нет в базе."""
    async with async_session() as session:
        user = await session.scalar(select(User).where(User.telegram_id == telegram_id))
        if not user:
            user = User(telegram_id=telegram_id)
            session.add(user)
            await session.commit()
            await session.refresh(user)
        return user


async def get_user_by_tg_id(telegram_id: int) -> User | None:
    """Получает пользователя по Telegram ID с загруженными ботами."""
    async with async_session() as session:
        return await session.scalar(
            select(User)
            .options(selectinload(User.bots))
            .where(User.telegram_id == telegram_id)
        )


async def get_user_by_id(user_id: int) -> User | None:
    """Получает пользователя по внутреннему ID в БД."""
    async with async_session() as session:
        return await session.scalar(select(User).where(User.id == user_id))


async def get_user_bots(owner_id: int) -> list[BotConfig]:
    """Возвращает список всех ботов пользователя."""
    async with async_session() as session:
        result = await session.scalars(
            select(BotConfig).where(BotConfig.owner_id == owner_id).order_by(BotConfig.id)
        )
        return list(result.all())


async def register_bot_config(
    owner_id: int,
    tg_bot_id: int,
    bot_token_enc: bytes,
    payment_provider: str = None,
    payment_creds_enc: bytes = None,
) -> BotConfig:
    """Регистрирует нового бота в системе (старый метод для совместимости)."""
    async with async_session() as session:
        bot = BotConfig(
            owner_id=owner_id,
            tg_bot_id=tg_bot_id,
            bot_token_enc=bot_token_enc,
            payment_provider=payment_provider,
            payment_creds_enc=payment_creds_enc,
        )
        session.add(bot)
        await session.commit()
        await session.refresh(bot)
        return bot


async def create_bot_config(
    owner_id: int,
    display_name: str,
    tg_bot_id: int,
    username: str,
    bot_token_enc: bytes,
    payment_provider: Optional[str] = None,
    payment_creds_enc: Optional[bytes] = None,
    offer_url: Optional[str] = None,
    offer_installments: bool = False,
) -> BotConfig:
    """Создает нового бота через конструктор API."""
    async with async_session() as session:
        # Схема по умолчанию (пустой V2)
        default_funnel = {
            "version": 2,
            "nodes": [
                {
                    "id": "start",
                    "step": "Старт",
                    "subtitle": "Первое сообщение",
                    "delay_seconds": 0,
                    "kind": "message",
                    "content": "",
                    "button_text": "",
                }
            ],
        }

        bot = BotConfig(
            owner_id=owner_id,
            display_name=display_name,
            tg_bot_id=tg_bot_id,
            username=username,
            bot_token_enc=bot_token_enc,
            payment_provider=payment_provider,
            payment_creds_enc=payment_creds_enc,
            offer_url=offer_url,
            offer_installments=offer_installments,
            status="draft",
            funnel_schema=default_funnel,
        )
        session.add(bot)
        await session.commit()
        await session.refresh(bot)
        return bot


async def update_bot_config(bot_id: int, **kwargs: Any) -> BotConfig | None:
    """Обновляет поля конфигурации бота."""
    async with async_session() as session:
        bot = await session.get(BotConfig, bot_id)
        if not bot:
            return None
        for key, val in kwargs.items():
            if hasattr(bot, key) and val is not None:
                setattr(bot, key, val)
        await session.commit()
        await session.refresh(bot)
        return bot


async def delete_bot_config(bot_id: int) -> bool:
    """Удаляет бота из базы данных."""
    async with async_session() as session:
        bot = await session.get(BotConfig, bot_id)
        if not bot:
            return False
        await session.delete(bot)
        await session.commit()
        return True


async def set_bot_status(bot_id: int, status: str) -> BotConfig | None:
    """Меняет статус бота (active/draft/archived)."""
    async with async_session() as session:
        bot = await session.get(BotConfig, bot_id)
        if not bot:
            return None
        bot.status = status
        await session.commit()
        await session.refresh(bot)
        return bot


async def assign_lifetime_license(bot_id: int) -> BotConfig | None:
    async with async_session() as session:
        bot = await session.get(BotConfig, bot_id)
        if not bot:
            return None
        bot.has_lifetime_license = True
        await session.commit()
        await session.refresh(bot)
        return bot


async def enforce_non_pro_bot_limits(owner_id: int) -> None:
    """After PRO ends, keep at most one licensed bot public and stop all others."""
    async with async_session() as session:
        bots = list(
            (
                await session.scalars(
                    select(BotConfig)
                    .where(BotConfig.owner_id == owner_id, BotConfig.status == "active")
                    .order_by(BotConfig.id)
                )
            ).all()
        )
        licensed_active = [bot for bot in bots if bot.has_lifetime_license]
        keep_bot_id = licensed_active[0].id if licensed_active else None
        for bot in bots:
            if bot.id != keep_bot_id:
                bot.status = "draft"
        await session.commit()


async def update_bot_funnel(
    bot_id: int, funnel_schema: dict, funnel_complete: bool
) -> BotConfig | None:
    """Сохраняет новую схему воронки в формате V2 и флаг готовности."""
    async with async_session() as session:
        bot = await session.get(BotConfig, bot_id)
        if not bot:
            return None
        bot.funnel_schema = funnel_schema
        bot.funnel_complete = funnel_complete
        await session.commit()
        await session.refresh(bot)
        return bot


async def set_media_sync_done(bot_id: int, done: bool = True) -> None:
    """Отмечает, что владелец выполнил синхронизацию в своем боте через /start."""
    async with async_session() as session:
        bot = await session.get(BotConfig, bot_id)
        if bot:
            bot.media_sync_done = done
            await session.commit()


async def increment_bot_users_count(bot_id: int) -> None:
    """Увеличивает счетчик пользователей и проверяет блокировку токена."""
    async with async_session() as session:
        bot = await session.scalar(select(BotConfig).where(BotConfig.id == bot_id))
        if bot:
            bot.users_count += 1
            if bot.users_count >= 10 and not bot.is_token_locked:
                bot.is_token_locked = True
            await session.commit()
