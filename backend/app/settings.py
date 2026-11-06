from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-secret-change-me-in-prod-0000"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dealership.db"
    # only a dev default, prod must set its own
    jwt_secret: str = DEV_SECRET
    jwt_ttl_hours: int = 12
    cookie_secure: bool = False
    anthropic_api_key: str | None = None
    ai_model: str = "claude-opus-5-5"
    # used only when there's no anthropic key
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-flash-latest"
    demo_password: str = "demo1234"
    frontend_dist: str = "../frontend/dist"
    # used for canonical links and the sitemap
    public_url: str = "http://localhost:8000"
    # vercel sets VERCEL=1 on its own boxes
    vercel: bool = False


settings = Settings()

# secure cookies means we're live, so the dev secret would let anyone forge a session
if settings.cookie_secure and (settings.jwt_secret == DEV_SECRET or len(settings.jwt_secret) < 32):
    raise RuntimeError("set a real JWT_SECRET (32+ chars) before running with COOKIE_SECURE=true")
