"""add transfer events for analytics

Revision ID: c4f1a7d92b30
Revises: 863bd380e605
Create Date: 2026-10-26 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4f1a7d92b30'
down_revision: Union[str, Sequence[str], None] = '863bd380e605'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'transfer_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('movie_id', sa.Integer(), nullable=True),
        sa.Column('user_name', sa.String(length=100), nullable=True),
        sa.Column('movie_title', sa.String(length=200), nullable=True),
        sa.Column('bytes_transferred', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('total_bytes', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=12), server_default='completed', nullable=False),
        sa.Column('via', sa.String(length=20), server_default='dashboard', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("kind IN ('upload', 'download')", name='ck_transfer_events_kind'),
        sa.CheckConstraint("status IN ('started', 'completed', 'aborted')", name='ck_transfer_events_status'),
        sa.ForeignKeyConstraint(['movie_id'], ['movies.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_transfer_events_id'), 'transfer_events', ['id'], unique=False)
    op.create_index(op.f('ix_transfer_events_kind'), 'transfer_events', ['kind'], unique=False)
    op.create_index(op.f('ix_transfer_events_user_id'), 'transfer_events', ['user_id'], unique=False)
    op.create_index(op.f('ix_transfer_events_movie_id'), 'transfer_events', ['movie_id'], unique=False)
    op.create_index(op.f('ix_transfer_events_created_at'), 'transfer_events', ['created_at'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_transfer_events_created_at'), table_name='transfer_events')
    op.drop_index(op.f('ix_transfer_events_movie_id'), table_name='transfer_events')
    op.drop_index(op.f('ix_transfer_events_user_id'), table_name='transfer_events')
    op.drop_index(op.f('ix_transfer_events_kind'), table_name='transfer_events')
    op.drop_index(op.f('ix_transfer_events_id'), table_name='transfer_events')
    op.drop_table('transfer_events')
