"""Admin special access links: create / list / deactivate / redeem."""
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, update

from database.models import AccessLink, User, async_session
from loggers import logger

TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def _generate_token() -> str:
    return "".join(secrets.choice(TOKEN_ALPHABET) for _ in range(10))


async def create_access_link(
    *, kind: str, days: Optional[int], expires_at: Optional[datetime], note: Optional[str]
) -> AccessLink:
    if kind not in ("period", "permanent"):
        raise ValueError("Неизвестный тип ссылки")
    if kind == "period" and days is None and expires_at is None:
        raise ValueError("Укажите срок доступа")
    async with async_session() as session:
        link = AccessLink(
            token=_generate_token(),
            note=(note or "").strip() or None,
            kind=kind,
            days=days if kind == "period" else None,
            expires_at=expires_at if kind == "period" else None,
        )
        session.add(link)
        await session.commit()
        await session.refresh(link)
        return link


async def list_access_links(limit: int = 50) -> list[AccessLink]:
    async with async_session() as session:
        links = await session.scalars(
            select(AccessLink)
            .order_by(AccessLink.created_at.desc())
            .limit(max(min(limit, 100), 1))
        )
        return list(links)


async def deactivate_access_link(link_id: uuid.UUID) -> bool:
    async with async_session() as session:
        result = await session.execute(
            update(AccessLink)
            .where(AccessLink.id == link_id)
            .values(is_active=False)
        )
        await session.commit()
        return result.rowcount > 0


def _effective_expires_at(link: AccessLink) -> Optional[datetime]:
    if link.kind != "period":
        return None
    if link.expires_at is not None:
        return link.expires_at
    if link.days is not None:
        return datetime.now(timezone.utc) + timedelta(days=link.days)
    return None


async def redeem_access_link(token: str, telegram_id: int) -> tuple[bool, str]:
    """Применяет спец-ссылку при /start gl_<token> у главного бота.

    Активирует доступ: расширяет подписку аккаунта или делает её бессрочной.
    Одноразовая ссылка деактивируется после первого применения.
    Возвращает (успех, текст для пользователя).
    """
    token = (token or "").strip()
    async with async_session() as session:
        link = await session.scalar(select(AccessLink).where(AccessLink.token == token))
        if link is None or not link.is_active:
            return False, "Ссылка недействительна или уже использована."

        if link.activated_by is not None and link.activated_by != telegram_id:
            return False, "Эта ссылка уже активирована другим пользователем."

        user = await session.scalar(select(User).where(User.telegram_id == telegram_id))
        if user is None:
            return False, "Сначала откройте BotFlow Mini App, затем отправьте ссылку снова."

        now = datetime.now(timezone.utc)
        if link.kind == "permanent":
            user.subscription_ends_at = None
            user.subscription_auto_renew = False
            message = (
                "🎉 <b>Бессрочный доступ к BotFlow активирован!</b>\n\n"
                "Публикация ваших ботов — бесплатна."
            )
        else:
            expires_at = _effective_expires_at(link)
            if expires_at is None:
                return False, "У ссылки не указан срок действия."
            current = user.subscription_ends_at
            if current is not None and current > now and current > expires_at:
                expires_at = current
            user.subscription_ends_at = expires_at
            message = (
                "🎉 <b>Бесплатный доступ активирован!</b>\n\n"
                f"Действует до {expires_at.strftime('%d.%m.%Y')}. "
                "Публикация ботов в этот период — бесплатна."
            )

        link.activated_by = telegram_id
        link.activated_at = now
        link.is_active = False
        await session.commit()
        logger.info("Access link %s redeemed by %s", link.token, telegram_id)
        return True, message
