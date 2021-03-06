"""Initial

Revision ID: e92788369ba9
Revises: 
Create Date: 2022-03-17 15:20:34.412552

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e92788369ba9'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('shortlinks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('original_url', sa.Text(), nullable=False),
    sa.Column('short_url', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('shortlinks')
    # ### end Alembic commands ###
