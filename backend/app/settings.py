from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dealership.db"
    # only a dev default, prod must set its own
    jwt_secret: str = "dev-only-secret-change-me-in-prod-0000"
    jwt_ttl_hours: int = 12
    cookie_secure: bool = False
    anthropic_api_key: str | None = None
    ai_model: str = "claude-opus-5-5"
    demo_password: str = "demo1234"
    frontend_dist: str = "../frontend/dist"


settings = Settings()
