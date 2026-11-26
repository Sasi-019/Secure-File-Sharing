"""company features: employee id, quota, shared files, messages

Revision ID: e5b3c9a2f716
Revises: d7a2e5b81c44
Create Date: 2026-11-19 12:00:00.000000

* users.employee_id (unique) and users.storage_quota_bytes
* movies.visibility may now be 'shared'
* file_shares (who a file is shared with) and messages
* notifications.movie_id
Existing accounts keep working: they have no employee ID yet and sign in
with their email until the administrator adds one.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5b3c9a2f716'
down_revision: Union[str, Sequence[str], None] = 'd7a2e5b81c44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('employee_id', sa.String(length=30), nullable=True))
    op.add_column('users', sa.Column('storage_quota_bytes', sa.BigInteger(), nullable=True))
    op.create_index('ix_users_employee_id', 'users', ['employee_id'], unique=True)

    op.drop_constraint('ck_movies_visibility', 'movies', type_='check')
    op.create_check_constraint(
        'ck_movies_visibility',
        'movies',
        "visibility IN ('private', 'public', 'shared')",
    )

    op.add_column('notifications', sa.Column('movie_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_notifications_movie_id', 'notifications', 'movies',
        ['movie_id'], ['id'], ondelete='SET NULL',
    )

    op.create_table(
        'file_shares',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('movie_id', sa.Integer(), sa.ForeignKey('movies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('movie_id', 'user_id', name='uq_file_shares_movie_user'),
    )
    op.create_index('ix_file_shares_id', 'file_shares', ['id'])
    op.create_index('ix_file_shares_movie_id', 'file_shares', ['movie_id'])
    op.create_index('ix_file_shares_user_id', 'file_shares', ['user_id'])

    op.create_table(
        'messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('sender_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('recipient_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('movie_id', sa.Integer(), sa.ForeignKey('movies.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_messages_id', 'messages', ['id'])
    op.create_index('ix_messages_sender_id', 'messages', ['sender_id'])
    op.create_index('ix_messages_recipient_id', 'messages', ['recipient_id'])


def downgrade() -> None:
    op.drop_table('messages')
    op.drop_table('file_shares')
    op.drop_constraint('fk_notifications_movie_id', 'notifications', type_='foreignkey')
    op.drop_column('notifications', 'movie_id')
    op.execute("UPDATE movies SET visibility = 'private' WHERE visibility = 'shared'")
    op.drop_constraint('ck_movies_visibility', 'movies', type_='check')
    op.create_check_constraint('ck_movies_visibility', 'movies', "visibility IN ('private', 'public')")
    op.drop_index('ix_users_employee_id', table_name='users')
    op.drop_column('users', 'storage_quota_bytes')
    op.drop_column('users', 'employee_id')
