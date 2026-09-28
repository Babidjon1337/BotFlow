"""Factory for retrieving payment provider instances."""

from services.payment_providers.base import PaymentProvider
from services.payment_providers.yookassa import YooKassaProvider
from services.payment_providers.prodamus import ProdamusProvider

_PROVIDERS: dict[str, PaymentProvider] = {
    "yookassa": YooKassaProvider(),
    "prodamus": ProdamusProvider(),
}


def get_payment_provider(provider_name: str) -> PaymentProvider:
    """Retrieve the payment provider implementation by name."""
    norm = str(provider_name or "").strip().lower()
    if norm in _PROVIDERS:
        return _PROVIDERS[norm]
    raise ValueError(f"Неподдерживаемый платёжный провайдер: '{provider_name}'")
