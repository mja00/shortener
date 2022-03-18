from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin, current_user

db = SQLAlchemy()


class ShortLink(db.Model):
    __tablename__ = 'shortlinks'

    id = db.Column(db.Integer, primary_key=True)
    original_url = db.Column(db.Text, nullable=False)
    short_url = db.Column(db.Text, nullable=False)
    expired = db.Column(db.Boolean, nullable=False, default=False)
    expiration_date = db.Column(db.DateTime, nullable=True)
    max_clicks = db.Column(db.Integer, nullable=False, default=-1)
    current_clicks = db.Column(db.Integer, nullable=False, default=0)
    deleted = db.Column(db.Boolean, nullable=False, default=False)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))

    # Timestamps
    created_at = db.Column(db.DateTime, nullable=False, default=db.func.now())
    updated_at = db.Column(db.DateTime, nullable=False, default=db.func.now(), onupdate=db.func.now())

    def __init__(self, original_url, short_url, max_clicks=-1, expiration_date=None):
        self.original_url = original_url
        self.short_url = short_url
        self.max_clicks = max_clicks
        self.expiration_date = expiration_date
        self.created_by = current_user.id

    def __repr__(self):
        return '<ShortLink %r>' % self.short_url


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(255), nullable=False, unique=True)
    password = db.Column(db.String(255), nullable=False)
    links = db.relationship('ShortLink', backref='owner', lazy=False)

    # Timestamps
    created_at = db.Column(db.DateTime, nullable=False, default=db.func.now())
    updated_at = db.Column(db.DateTime, nullable=False, default=db.func.now(), onupdate=db.func.now())

    def __init__(self, username, password):
        self.username = username
        self.password = password

    def __repr__(self):
        return '<User %r>' % self.username
