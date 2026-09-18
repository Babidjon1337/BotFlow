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
    BotSubscription,
    User,
    async_session,
)
from loggers import logger

TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
LINK_KINDS = ("period", "permanent", "one_bot")
SUPPORTED_LINK_KINDS = ("period", "permanent", "one_bot", "vip", "free_bots")


def _generate_token() -> str:
    return "".join(secrets.choice(TOKEN_ALPHABET) for _ in range(10))


async def create_access_link(
    *,
    kind: str,
    days: Optional[int] = None,
    expires_at: Optional[datetime] = None,
    note: Optional[str] = None,
    max_activations: int = 1,
    valid_until: Optional[datetime] = None,
    free_bots_count: int = 1,
    is_permanent: bool = False,
) -> AccessLink:
    if kind not in SUPPORTED_LINK_KINDS:
        raise ValueError("Неизвестный тип ссылки")
    if kind == "vip":
        if not is_permanent and days is None and expires_at is None:
            raise ValueError("Укажите срок VIP-доступа или выберите бессрочный доступ")
    elif kind == "free_bots":
        if free_bots_count < 1:
            raise ValueError("Количество бесплатных ботов должно быть не менее 1")
        if not is_permanent and days is None and expires_at is None:
            raise ValueError("Укажите срок бесплатного доступа или выберите бессрочный доступ")
    elif kind == "period" and days is None and expires_at is None:
        raise ValueError("Укажите срок доступа")
    elif kind == "one_bot":
        if free_bots_count < 1:
            raise ValueError("Количество бесплатных ботов должно быть не менее 1")
    if max_activations < 1 or max_activations > 10_000:
        raise ValueError("Количество активаций — от 1 до 10 000")
    async with async_session() as session:
        effective_permanent = is_permanent or (kind in ("permanent", "one_bot"))
        link = AccessLink(
            token=_generate_token(),
            note=(note or "").strip() or None,
            kind=kind,
            days=days if (kind in ("period", "vip", "free_bots") and not effective_permanent) else None,
            expires_at=expires_at if (kind in ("period", "vip", "free_bots") and not effective_permanent) else None,
            max_activations=max_activations,
            valid_until=valid_until,
            free_bots_count=free_bots_count if kind in ("free_bots", "one_bot") else 1,
            is_permanent=effective_permanent,
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
    if link.kind not in ("period", "vip"):
        return None
    if getattr(link, "is_permanent", False):
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

        if (link.kind == "permanent") or (link.kind == "vip" and link.is_permanent):
            user.is_vip_permanent = True
            user.subscription_auto_renew = False
            message = (
                "🎉 <b>Бессрочный VIP-доступ к BotFlow активирован!</b>\n\n"
                "Публикация всех ваших ботов бесплатна навсегда."
            )
        elif link.kind in ("free_bots", "one_bot"):
            count = link.free_bots_count if link.kind == "free_bots" else 1
            user.lifetime_slots = (user.lifetime_slots or 0) + count
            if link.is_permanent or link.kind == "one_bot":
                unlicensed_bots = list((await session.scalars(
                    select(BotConfig)
                    .where(BotConfig.owner_id == user.id, BotConfig.has_lifetime_license.is_(False))
                    .order_by(BotConfig.id)
                    .limit(count)
                )).all())
                for first_bot in unlicensed_bots:
                    first_bot.has_lifetime_license = True
                if count == 1:
                    if unlicensed_bots:
                        message = (
                            "🎉 <b>Один бот навсегда бесплатно!</b>\n\n"
                            f"Лицензия применена к боту «{unlicensed_bots[0].display_name}». "
                            "Его публикация не требует подписки."
                        )
                    else:
                        message = (
                            "🎉 <b>Один бот навсегда бесплатно!</b>\n\n"
                            "Создайте бота в BotFlow — лицензия применится к нему автоматически."
                        )
                else:
                    message = (
                        f"🎉 <b>Бесплатные боты ({count} шт.) активированы!</b>\n\n"
                        f"Вам начислено {count} свободных слотов для ботов навсегда."
                    )
            else:
                days = link.days or 30
                existing_bots = list((await session.scalars(
                    select(BotConfig)
                    .where(BotConfig.owner_id == user.id)
                    .order_by(BotConfig.id)
                    .limit(count)
                )).all())
                for bot_item in existing_bots:
                    sub = await session.scalar(
                        select(BotSubscription).where(BotSubscription.bot_id == bot_item.id)
                    )
                    sub_ends = sub.ends_at if sub and sub.ends_at else None
                    if sub_ends and sub_ends.tzinfo is None:
                        sub_ends = sub_ends.replace(tzinfo=timezone.utc)
                    sub_start = max(sub_ends, now) if sub_ends else now
                    next_ends = sub_start + timedelta(days=days)
                    if sub is None:
                        sub = BotSubscription(
                            bot_id=bot_item.id,
                            status="active",
                            starts_at=now,
                            ends_at=next_ends,
                            product_code=f"link_{days}d",
                            amount_rub=0,
                            auto_renew=False,
                        )
                        session.add(sub)
                    else:
                        sub.status = "active"
                        sub.ends_at = next_ends
                        sub.auto_renew = False
                slots_word = "бота" if count < 5 else "ботов"
                message = (
                    f"🎉 <b>Бесплатный доступ на {count} {slots_word} активирован!</b>\n\n"
                    f"Срок действия бесплатного доступа: {days} дн."
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
                "🎉 <b>VIP-доступ к BotFlow активирован!</b>\n\n"
                f"Действует до {expires_at.strftime('%d.%m.%Y')}. "
                "Публикация всех ботов в этот период — бесплатна."
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
