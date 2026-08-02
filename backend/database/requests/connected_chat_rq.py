"""Connected private-chat targets available for a client's tariffs."""

from sqlalchemy import select

from database.models import ConnectedChat, async_session


async def upsert_connected_chat(*, bot_id: int, chat_id: str, title: str, chat_type: str) -> ConnectedChat:
    async with async_session() as session:
        chat = await session.scalar(
            select(ConnectedChat).where(ConnectedChat.bot_id == bot_id, ConnectedChat.chat_id == str(chat_id))
        )
        if chat:
            chat.title = title or chat.title
            chat.chat_type = chat_type
        else:
            chat = ConnectedChat(bot_id=bot_id, chat_id=str(chat_id), title=title or "Без названия", chat_type=chat_type)
            session.add(chat)
        await session.commit()
        await session.refresh(chat)
        return chat


async def list_connected_chats(bot_id: int) -> list[ConnectedChat]:
    async with async_session() as session:
        result = await session.scalars(
            select(ConnectedChat).where(ConnectedChat.bot_id == bot_id).order_by(ConnectedChat.connected_at.desc())
        )
        return list(result)
