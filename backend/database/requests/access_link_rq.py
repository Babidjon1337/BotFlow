"""Admin special access links: create / list / deactivate / redeem.

Виды доступа:
  period    — подписка аккаунта на срок (days от активации или до expires_at),
  permanent — бессрочная подписка (публикация всех ботов бесплатна),
  one_bot   — один бот навсегда бесплатно (лицензия ставится первому боту).

Ссылку можно выдать нескольким людям: max_activations задаёт лимит,
valid_until — до какого момента ссылка вообще активируется.
"""
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, update

from database.models import (
    AccessLink,
    AccessLinkActivation,
    BotConfig,
    User,
    async_session,
)
from loggers import logger

TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
LINK_KINDS = ("period", "permanent", "one_bot")


def _generate_token() -> str:
    return "".join(secrets.choice(TOKEN_ALPHABET) for _ in range(10))


async def create_access_link(
    *,
    kind: str,
    days: Optional[int],
    expires_at: Optional[datetime],
    note: Optional[str],
    max_activations: int = 1,
    valid_until: Optional[datetime] = None,
) -> AccessLink:
    if kind not in LINK_KINDS:
        raise ValueError("Неизвестный тип ссылки")
    if kind == "period" and days is None and expires_at is None:
        raise ValueError("Укажите срок доступа")
    if max_activations < 1 or max_activations > 10_000:
        raise ValueError("Количество активаций — от 1 до 10 000")
    async with async_session() as session:
        link = AccessLink(
            token=_generate_token(),
            note=(note or "").strip() or None,
            kind=kind,
            days=days if kind == "period" else None,
            expires_at=expires_at if kind == "period" else None,
            max_activations=max_activations,
            valid_until=valid_until,
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

    Возвращает (успех, текст для пользователя). Повторная активация одним
    и тем же человеком не расходует лимит и не выдаёт доступ дважды.
    """
    token = (token or "").strip()
    async with async_session() as session:
        link = await session.scalar(select(AccessLink).where(AccessLink.token == token))
        if link is None or not link.is_active:
            return False, "Ссылка недействительна или уже закрыта."

        now = datetime.now(timezone.utc)
        if link.valid_until is not None and link.valid_until <= now:
            return False, "Срок действия ссылки истёк."

        already = await session.scalar(
            select(AccessLinkActivation).where(
                AccessLinkActivation.link_id == link.id,
                AccessLinkActivation.telegram_id == telegram_id,
            )
        )
        if already is not None:
            return False, "Вы уже активировали эту ссылку."

        if link.activations_count >= link.max_activations:
            return False, "Лимит активаций этой ссылки исчерпан."

        user = await session.scalar(select(User).where(User.telegram_id == telegram_id))
        if user is None:
            return False, "Сначала откройте BotFlow Mini App, затем отправьте ссылку снова."

        if link.kind == "permanent":
            user.subscription_ends_at = None
            user.subscription_auto_renew = False
            message = (
                "🎉 <b>Бессрочный доступ к BotFlow активирован!</b>\n\n"
                "Публикация ваших ботов — бесплатна."
            )
        elif link.kind == "one_bot":
            user.lifetime_slots = (user.lifetime_slots or 0) + 1
            # Если бот уже есть — сразу привязываем бесплатную лицензию к нему.
            first_bot = await session.scalar(
                select(BotConfig)
                .where(BotConfig.owner_id == user.id, BotConfig.has_lifetime_license.is_(False))
                .order_by(BotConfig.id)
                .limit(1)
            )
            if first_bot is not None:
                first_bot.has_lifetime_license = True
                message = (
                    "🎉 <b>Один бот навсегда бесплатно!</b>\n\n"
                    f"Лицензия применена к боту «{first_bot.display_name}». "
                    "Его публикация не требует подписки."
                )
            else:
                message = (
                    "🎉 <b>Один бот навсегда бесплатно!</b>\n\n"
                    "Создайте бота в BotFlow — лицензия применится к нему автоматически."
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

        session.add(AccessLinkActivation(link_id=link.id, telegram_id=telegram_id))
        link.activations_count += 1
        link.activated_by = telegram_id
        link.activated_at = now
        if link.activations_count >= link.max_activations:
            link.is_active = False
        await session.commit()
        logger.info(
            "Access link %s redeemed by %s (%s/%s)",
            link.token,
            telegram_id,
            link.activations_count,
            link.max_activations,
        )
        return True, message
