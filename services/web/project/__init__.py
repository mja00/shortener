from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config.from_object('project.config.Config')
db = SQLAlchemy(app)


class ShortLink(db.Model):
    __tablename__ = 'shortlinks'

    id = db.Column(db.Integer, primary_key=True)
    original_url = db.Column(db.Text, nullable=False)
    short_url = db.Column(db.Text, nullable=False)

    # Timestamps
    created_at = db.Column(db.DateTime, nullable=False, default=db.func.now())
    updated_at = db.Column(db.DateTime, nullable=False, default=db.func.now(), onupdate=db.func.now())

    def __init__(self, original_url, short_url):
        self.original_url = original_url
        self.short_url = short_url

    def __repr__(self):
        return '<ShortLink %r>' % self.short_url


@app.route("/")
def hello():
    return jsonify({"message": "Hello World!"})