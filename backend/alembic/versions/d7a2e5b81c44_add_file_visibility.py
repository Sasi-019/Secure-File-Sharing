"""add file visibility (public / private)

Revision ID: d7a2e5b81c44
Revises: c4f1a7d92b30
Create Date: 2026-11-15 12:00:00.000000

Every existing file becomes PRIVATE, so nothing is exposed by this upgrade.
Owners switch a file to public from the library.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7a2e5b81c44'
down_revision: Union[str, Sequence[str], None] = 'c4f1a7d92b30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'movies',
        sa.Column(
            'visibility',
            sa.String(length=10),
            nullable=False,
            server_default='private',
        ),
    )
    op.create_check_constraint(
        'ck_movies_visibility',
        'movies',
        "visibility IN ('private', 'public')",
    )
    op.create_index('ix_movies_visibility', 'movies', ['visibility'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_movies_visibility', table_name='movies')
    op.drop_constraint('ck_movies_visibility', 'movies', type_='check')
    op.drop_column('movies', 'visibility')
