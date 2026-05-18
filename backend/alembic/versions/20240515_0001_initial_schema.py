"""Initial schema: tickers, price_points, forecasts.

Revision ID: 0001
Revises:
Create Date: 2024-05-15

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tickers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("asset_type", sa.String(length=100), nullable=True),
        sa.Column("exchange", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("symbol"),
    )
    op.create_index(op.f("ix_tickers_symbol"), "tickers", ["symbol"], unique=False)

    op.create_table(
        "price_points",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticker_id", sa.Integer(), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("open_price", sa.Float(), nullable=True),
        sa.Column("high_price", sa.Float(), nullable=True),
        sa.Column("low_price", sa.Float(), nullable=True),
        sa.Column("close_price", sa.Float(), nullable=True),
        sa.Column("volume", sa.BigInteger(), nullable=True),
        sa.Column("source", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["ticker_id"], ["tickers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticker_id", "ts", name="uix_ticker_ts"),
    )
    op.create_index(
        "ix_price_points_ticker_ts_desc",
        "price_points",
        ["ticker_id", "ts"],
        unique=False,
        postgresql_ops={"ts": "DESC"},
    )

    op.create_table(
        "forecasts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticker_id", sa.Integer(), nullable=False),
        sa.Column("forecast_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("predicted_price", sa.Float(), nullable=True),
        sa.Column("lower_bound", sa.Float(), nullable=True),
        sa.Column("upper_bound", sa.Float(), nullable=True),
        sa.Column("model_name", sa.String(length=100), nullable=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["ticker_id"], ["tickers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "ticker_id",
            "forecast_for",
            "generated_at",
            name="uix_ticker_forecast_for_generated_at",
        ),
    )
    op.create_index(
        "ix_forecasts_ticker_forecast_for",
        "forecasts",
        ["ticker_id", "forecast_for"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_forecasts_ticker_forecast_for", table_name="forecasts")
    op.drop_table("forecasts")
    op.drop_index("ix_price_points_ticker_ts_desc", table_name="price_points")
    op.drop_table("price_points")
    op.drop_index(op.f("ix_tickers_symbol"), table_name="tickers")
    op.drop_table("tickers")
