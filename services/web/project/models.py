from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin, current_user
import json

db = SQLAlchemy()


def load_country_names():
    with open('project/names.json', 'r') as f:
        return json.load(f)


country_names = load_country_names()
country_names["XX"] = "Unknown"


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
    visits = db.relationship('Visit', backref='shortlink', lazy=False)

    # Timestamps
    created_at = db.Column(db.DateTime, nullable=False, default=db.func.now())
    updated_at = db.Column(db.DateTime, nullable=False, default=db.func.now(), onupdate=db.func.now())

    def __init__(self, original_url, short_url, max_clicks=-1, expiration_date=None, created_by=None):
        self.original_url = original_url
        self.short_url = short_url
        self.max_clicks = max_clicks
        self.expiration_date = expiration_date
        if created_by:
            self.created_by = created_by
        else:
            self.created_by = current_user.id

    def __repr__(self):
        return '<ShortLink %r>' % self.short_url

    def to_dict(self):
        return {
            'id': self.id,
            'short_url': self.short_url,
            'original_url': self.original_url,
            'expired': self.expired,
            'expiration_date': self.expiration_date,
            'max_clicks': self.max_clicks,
            'current_clicks': self.current_clicks,
            'deleted': self.deleted,
            'created_by': self.created_by,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }


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


class Visit(db.Model):
    __tablename__ = 'visits'

    id = db.Column(db.Integer, primary_key=True)
    short_url_id = db.Column(db.Integer, db.ForeignKey('shortlinks.id'), nullable=False)
    ip_address = db.Column(db.String(255), nullable=False)
    user_agent = db.Column(db.String(255), nullable=False)
    country = db.Column(db.String(255), nullable=False)
    country_name = db.Column(db.String(255), nullable=False, default="Unknown")

    # Timestamps
    created_at = db.Column(db.DateTime, nullable=False, default=db.func.now())
    updated_at = db.Column(db.DateTime, nullable=False, default=db.func.now(), onupdate=db.func.now())

    def __init__(self, short_url_id, ip_address, user_agent, country):
        self.short_url_id = short_url_id
        self.ip_address = ip_address
        self.user_agent = user_agent
        self.country = country
        self.country_name = country_names[country]

    def __repr__(self):
        return '<Visit %r>' % self.id

    def to_dict(self):
        return {
            'id': self.id,
            'shortlink': self.shortlink.to_dict(),
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'country': self.country,
            'country_name': self.country_name,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }
