from sqlalchemy import select

from database.models import GatewayConnection, async_session


async def list_gateway_connections(owner_id: int) -> list[GatewayConnection]:
    async with async_session() as session:
        result = await session.scalars(
            select(GatewayConnection)
            .where(GatewayConnection.owner_id == owner_id)
            .order_by(GatewayConnection.created_at.desc())
        )
        return list(result)


async def create_gateway_connection(
    owner_id: int, provider: str, display_name: str, credentials_enc: bytes
) -> GatewayConnection:
    async with async_session() as session:
        connection = GatewayConnection(
            owner_id=owner_id,
            provider=provider,
            display_name=display_name,
            credentials_enc=credentials_enc,
            status="pending",
        )
        session.add(connection)
        await session.commit()
        await session.refresh(connection)
        return connection
