from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.filters import CommandStart, Command

from keyboard.main_kb import *
from database.requests import *
from config import MAIN_BOT_TG_ID
from loggers import logger

main_bot_router = Router()

main_bot_router.message.filter(F.bot.id == MAIN_BOT_TG_ID)


@main_bot_router.message(CommandStart())
async def start_command_handler(message: Message):
    if not message.from_user:
        return

    # The main BotFlow registers SaaS owners. Client bots use their own
    # /start handler and only create leads for the configured funnel.
    try:
        await create_user_if_not_exists(message.from_user.id)
    except Exception:
        logger.exception("Не удалось зарегистрировать пользователя главного бота: %s", message.from_user.id)
        await message.answer("Не удалось создать аккаунт. Попробуйте ещё раз через минуту.")
        return

    await message.answer(
        """👋 <b>Добро пожаловать в BotFlow</b>

Здесь вы создадите Telegram-бота, который знакомит с продуктом, показывает тарифы, принимает оплату и напоминает тем, кто ещё не принял решение.

Всё настраивается в одном месте: сообщения, медиа, кнопки, тарифы и выдача доступа после оплаты.

Посмотрите короткое видео — в нём покажем путь от токена BotFather до первого запущенного бота.""",
        reply_markup=main_video_learning_button(),
    )


@main_bot_router.callback_query(F.data == "main_video_learning")
async def main_video_learning_handler(callback_query: CallbackQuery):
    await callback_query.answer()
    await callback_query.message.delete_reply_markup()
    await callback_query.message.answer(
        """🚀 <b>Готовы создать первого бота?</b>

В конструкторе вы:
• подключите бота через токен BotFather;
• настроите стартовое сообщение и два напоминания;
• добавите тарифы и способ выдачи доступа;
• проверите готовность и запустите бота.

Не нужно собирать всё за один раз: черновик сохранится, а BotFlow подскажет, что осталось заполнить.""",
        reply_markup=main_create_bot_button(),
    )


@main_bot_router.callback_query(F.data == "main_create_bot")
async def main_create_bot_handler(callback_query: CallbackQuery):
    await callback_query.answer()
    await callback_query.message.delete_reply_markup()
    await callback_query.message.answer(
        """🚀 <b>Готов создать своего первого бота-продавца?</b>

Нажми кнопку ниже, чтобы перейти к конструктору и собрать свою первую автоворонку за 15 минут! 

<i>Твой бот будет работать 24/7, продавая твои услуги, курсы или товары на автопилоте, пока ты спишь или пьешь кофе.</i>""",
    )
