import sqlalchemy.exc
from flask import Flask, jsonify, redirect, url_for, render_template, request, flash
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
import os
import random
import string
from datetime import datetime as dt
from flask_login import LoginManager, login_user, login_required, logout_user, current_user

# Our blueprints
from .auth import auth as auth_blueprint
# Our models
from .models import ShortLink, db, User

app = Flask(__name__)

# Login manager
login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.login_message_category = "danger"
login_manager.init_app(app)

# App config
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', "sqlite://")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', "CHANGEME")
db.init_app(app)
migrate = Migrate(app, db)

random_letters = string.ascii_letters + string.digits

app.register_blueprint(auth_blueprint)


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


def random_string(length):
    return ''.join(random.choice(random_letters) for i in range(length))


def create_alias_till_unique(alias):
    # Check if the alias already exists
    if ShortLink.query.filter_by(short_url=alias).first():
        # If it does, create a new alias
        alias = random_string(15)
        return create_alias_till_unique(alias)
    else:
        return alias


@app.route("/")
def index():
    return render_template("index.html")


@app.route('/create', methods=['POST', 'GET'])
@login_required
def create():
    if request.method == 'POST':
        # Get the form data
        form_data = request.form
        url = form_data.get('url')
        alias = form_data.get('alias', create_alias_till_unique(random_string(15))).replace(' ', '-')
        max_clicks = form_data.get('max_clicks', -1)
        expiration_date = form_data.get('expiration_date', None)
        # Make sure if our expiration date is empty that we set it to None
        if expiration_date == "":
            expiration_date = None
        # If the alias is empty, generate a random one
        if alias == "":
            alias = create_alias_till_unique(random_string(15))
        # Check if the alias already exists
        if ShortLink.query.filter_by(short_url=alias).first():
            flash("Alias already exists. Please try again.", "danger")
            return redirect(url_for('create'))
        # Our expriration date is a milisecond unix timestamp, so we need to convert it to a datetime object
        if expiration_date:
            expiration_date = dt.fromtimestamp(int(expiration_date) / 1000)
        try:
            short_link = ShortLink(url, alias, max_clicks, expiration_date)
            db.session.add(short_link)
            db.session.commit()
            flash('Short link created successfully!', 'success')
            return redirect(url_for('links'))
        except sqlalchemy.exc.DataError as e:
            flash(f'Error: {e}', 'danger')
            return redirect(url_for('create'))
    else:
        return render_template('create.html')


@app.route('/links')
@login_required
def links():
    # Get all short links
    short_links = ShortLink.query.filter_by(deleted=False).all()
    return render_template('links.html', short_links=short_links)


@app.route('/links/deleted')
@login_required
def links_deleted():
    # Get all short links
    short_links = ShortLink.query.filter_by(deleted=True).all()
    return render_template('links.html', short_links=short_links)


@app.route('/links/delete/<int:link_id>', methods=['POST'])
@login_required
def delete_link(link_id):
    # Get the short link
    short_link = ShortLink.query.get(link_id)
    # Delete the short link
    short_link.expired = True
    short_link.deleted = True
    db.session.commit()
    # Return to the links page
    flash('Short link deleted successfully!', 'success')
    return redirect(url_for('links'))


@app.route('/links/hard_delete/<int:link_id>', methods=['POST'])
@login_required
def hard_delete_link(link_id):
    # Get the short link
    short_link = ShortLink.query.get(link_id)
    # Delete the short link
    db.session.delete(short_link)
    db.session.commit()
    # Return to the links page
    flash('Short link deleted successfully!', 'success')
    return redirect(url_for('links'))


@app.route('/links/restore/<int:link_id>', methods=['POST'])
@login_required
def restore_link(link_id):
    # Get the short link
    short_link = ShortLink.query.get(link_id)
    # Delete the short link
    short_link.expired = False
    short_link.deleted = False
    db.session.commit()
    # Return to the links page
    flash('Short link restored successfully!', 'success')
    return redirect(url_for('links_deleted'))


@app.route("/<short_url>")
def redirect_to_short_url(short_url):
    short_link = ShortLink.query.filter_by(short_url=short_url).first()
    if short_link:
        # Check if the link is already expired
        if short_link.expired:
            flash("This link has expired", "danger")
            return redirect(url_for('index'))
        else:
            # Check if the expiration date has passed
            if short_link.expiration_date and short_link.expiration_date < dt.now():
                # Set the link to expired
                short_link.expired = True
                db.session.commit()
                flash("This link has expired", "danger")
                return redirect(url_for('index'))
        # Get the max_clicks value for the link
        max_clicks = short_link.max_clicks
        if max_clicks == -1:
            # Unlimited clicks
            # Increment the current_clicks value
            short_link.current_clicks += 1
            db.session.commit()
            return redirect(short_link.original_url)
        elif max_clicks > short_link.current_clicks:
            # There are still clicks left
            short_link.current_clicks += 1
            db.session.commit()
            return redirect(short_link.original_url)
        else:
            # No more clicks left
            # Mark the link as expired
            short_link.expired = True
            db.session.commit()
            flash("Sorry, this link has been used up.", "danger")
            return redirect(url_for('index'))
    else:
        return redirect(url_for('index'))
