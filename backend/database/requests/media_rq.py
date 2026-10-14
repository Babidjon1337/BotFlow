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


async def get_thumbnail_media_asset(bot_id: int, parent_asset_id: UUID) -> MediaAsset | None:
    async with async_session() as session:
        return await session.scalar(
            select(MediaAsset).where(
                MediaAsset.bot_id == bot_id,
                MediaAsset.node_id == f"thumb:{parent_asset_id}",
            )
        )


async def find_thumbnail_file_id(
    bot_id: int | None,
    asset_id: str | UUID | None = None,
    file_id: str | None = None,
) -> str | None:
    """Find the thumbnail telegram_file_id for a video asset."""
    if not bot_id:
        return None
    async with async_session() as session:
        if asset_id:
            try:
                asset_uuid = UUID(str(asset_id))
                thumb = await session.scalar(
                    select(MediaAsset).where(
                        MediaAsset.bot_id == bot_id,
                        MediaAsset.node_id == f"thumb:{asset_uuid}",
                    )
                )
                if thumb and thumb.telegram_file_id:
                    return thumb.telegram_file_id
            except (ValueError, TypeError):
                pass
        if file_id:
            parent = await session.scalar(
                select(MediaAsset).where(
                    MediaAsset.bot_id == bot_id,
                    MediaAsset.telegram_file_id == file_id,
                )
            )
            if parent:
                thumb = await session.scalar(
                    select(MediaAsset).where(
                        MediaAsset.bot_id == bot_id,
                        MediaAsset.node_id == f"thumb:{parent.id}",
                    )
                )
                if thumb and thumb.telegram_file_id:
                    return thumb.telegram_file_id
    return None

