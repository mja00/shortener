"""Adding visits

Revision ID: d6c01b84c43a
Revises: 693653e7e142
Create Date: 2022-04-04 16:36:48.835473

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd6c01b84c43a'
down_revision = '693653e7e142'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('visits',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('short_url_id', sa.Integer(), nullable=False),
    sa.Column('ip_address', sa.String(length=255), nullable=False),
    sa.Column('user_agent', sa.String(length=255), nullable=False),
    sa.Column('country', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['short_url_id'], ['shortlinks.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('visits')
    # ### end Alembic commands ###