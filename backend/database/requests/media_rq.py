from uuid import UUID

from sqlalchemy import select

from database.models import MediaAsset, async_session

async def create_media_asset(
    bot_id: int,
    node_id: str,
    media_type: str,
    telegram_file_id: str,
    *,
    mime_type: str | None = None,
    file_name: str | None = None,
) -> MediaAsset:
    async with async_session() as session:
        asset = MediaAsset(
            bot_id=bot_id,
            node_id=node_id,
            media_type=media_type,
            telegram_file_id=telegram_file_id,
            mime_type=mime_type,
            file_name=file_name,
        )
        session.add(asset)
        await session.commit()
        await session.refresh(asset)
        return asset


async def get_bot_media_asset(bot_id: int, asset_id: UUID) -> MediaAsset | None:
    async with async_session() as session:
        return await session.scalar(
            select(MediaAsset).where(
                MediaAsset.id == asset_id,
                MediaAsset.bot_id == bot_id,
            )
        )
