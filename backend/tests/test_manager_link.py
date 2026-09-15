from services.manager_link import build_manager_deep_link, extract_telegram_username


def test_manager_link_creates_prefilled_public_username_url():
    assert build_manager_deep_link(
        "https://t.me/sales_manager", "Здравствуйте! Хочу консультацию"
    ) == "https://t.me/sales_manager?text=%D0%97%D0%B4%D1%80%D0%B0%D0%B2%D1%81%D1%82%D0%B2%D1%83%D0%B9%D1%82%D0%B5%21%20%D0%A5%D0%BE%D1%87%D1%83%20%D0%BA%D0%BE%D0%BD%D1%81%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%86%D0%B8%D1%8E"


def test_manager_link_rejects_non_telegram_or_invalid_contacts():
    assert extract_telegram_username("https://example.com/sales_manager") is None
    assert build_manager_deep_link("@no", "Здравствуйте") is None
