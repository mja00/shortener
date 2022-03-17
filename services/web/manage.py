from flask.cli import FlaskGroup

from project import app, db, ShortLink

cli = FlaskGroup(app)


@cli.command("create_db")
def create_db():
    db.drop_all()
    db.create_all()
    db.session.commit()


@cli.command("seed_db")
def seed_db():
    db.session.add(ShortLink(original_url="https://www.google.com", short_url="google"))
    db.session.add(ShortLink(original_url="https://www.youtube.com", short_url="youtube", max_clicks=5))
    db.session.commit()


if __name__ == '__main__':
    cli()
