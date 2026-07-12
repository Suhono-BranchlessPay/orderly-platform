from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 8090
    orderly_ai_vision_provider: str = "mock"
    openai_api_key: str | None = None
    openai_vision_model: str = "gpt-4o-mini"
    anthropic_api_key: str | None = None
    anthropic_vision_model: str = "claude-sonnet-4-20250514"
    orderly_bridge_base_url: str = "http://127.0.0.1:8080"
    orderly_bridge_api_key: str = ""
    orderly_ai_review_token: str | None = None
    data_dir: str = "data"


settings = Settings()
