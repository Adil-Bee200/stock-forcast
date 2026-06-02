"""Allow one forecast row per ticker, horizon, and model (Prophet + naive).

Revision ID: 0002
Revises: 0001
Create Date: 2024-06-02

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "uix_ticker_forecast_for_generated_at",
        "forecasts",
        type_="unique",
    )
    op.create_unique_constraint(
        "uix_ticker_forecast_for_model",
        "forecasts",
        ["ticker_id", "forecast_for", "model_name"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uix_ticker_forecast_for_model",
        "forecasts",
        type_="unique",
    )
    op.create_unique_constraint(
        "uix_ticker_forecast_for_generated_at",
        "forecasts",
        ["ticker_id", "forecast_for", "generated_at"],
    )
