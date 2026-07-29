from cryptography.fernet import Fernet

from config import ENCRYPTION_KEY


class CryptoManager:
    def __init__(self):
        # Инициализация Fernet с ключом из конфигурации
        self.fernet = Fernet(ENCRYPTION_KEY.encode())

    def encrypt(self, data: str) -> bytes:
        """Шифрует строку токена для безопасного хранения в базе данных (в формате байт)"""
        if not data:
            return b""
        return self.fernet.encrypt(data.encode())

    def decrypt(self, data: bytes | str) -> str:
        """Расшифровывает строку из базы данных в рабочий токен"""
        if not data:
            return ""

        if isinstance(data, str):
            data = data.encode()

        return self.fernet.decrypt(data).decode()


crypto = CryptoManager()
