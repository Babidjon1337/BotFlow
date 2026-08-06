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
        """🤖 <b>Привет! На связи BotFlow.</b> Мы стерли границы между сложным программированием и автоворонками, которые приносят деньги. Больше никаких программистов с огромными чеками, ТЗ на 50 страниц и багов в коде.

Здесь ты можешь собрать свою идеальную автоворонку с продающим видео, кнопками тарифов и автоматическими дожимами (напоминалками) всего за <b>15 минут</b>.

<i>Твой бот будет продавать твои услуги, курсы или товары на автопилоте 24/7, пока ты спишь или пьешь кофе.</i>

👇 Чтобы понять, как устроен этот зверь изнутри и как настроить его под себя за пару кликов, посмотри наше короткое видео-обучение:""",
        reply_markup=main_video_learning_button(),
    )


@main_bot_router.callback_query(F.data == "main_video_learning")
async def main_video_learning_handler(callback_query: CallbackQuery):
    await callback_query.answer()
    await callback_query.message.delete_reply_markup()
    await callback_query.message.answer(
        """🎬 <b>Как запустить бота, который будет окупать себя с первого дня?</b>

В этом видео мы без воды показали:
1. Как привязать токен от BotFather за 30 секунд.
2. Как загрузить твое продающее видео и настроить тарифную сетку.
3. <b>Главная фишка:</b> Как работают автоматические напоминалки, которые «дожимают» до оплаты тех пользователей, кто ушел думать.

Готов запустить своего первого робота-продавца? Жми кнопку ниже!""",
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
