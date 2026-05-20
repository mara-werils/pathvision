from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://pathvision:pathvision_dev@db:5432/pathvision"
    DATABASE_URL_SYNC: str = "postgresql://pathvision:pathvision_dev@db:5432/pathvision"
    REDIS_URL: str = "redis://redis:6379/0"
    DATA_DIR: str = "/data"
    SECRET_KEY: str = "dev-secret-key"
    HF_TOKEN: str = ""

    PATCH_SIZE: int = 224
    EMBEDDING_DIM: int = 384
    EMBEDDING_BATCH_SIZE: int = 64
    TISSUE_THRESHOLD: float = 0.15

    class Config:
        env_file = ".env"


settings = Settings()
