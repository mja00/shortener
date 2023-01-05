import os
from flask import Blueprint, request, render_template, flash, redirect, url_for
from flask_login import login_required, login_user, logout_user
from werkzeug.security import check_password_hash, generate_password_hash

from .models import User, db

auth = Blueprint('auth', __name__)


@auth.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        # Get the form data
        username = request.form.get('username', None)
        password = request.form.get('password', None)

        # Check for errors
        if not username or not password:
            flash('Please fill out all fields.', "danger")
            return redirect(url_for('auth.login'))

        # Check if user exists
        user = User.query.filter_by(username=username).first()
        
        if not user:
            flash('Incorrect details.', "danger")
            return redirect(url_for('auth.login'))

        # Check password
        if not check_password_hash(user.password, password) or not user:
            flash('Incorrect details.', "danger")
            return redirect(url_for('auth.login'))

        # Login the user
        login_user(user, remember=True)

        flash('You are now logged in.', "success")
        return redirect(url_for('index'))
    else:
        return render_template('login.html')


@auth.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You are now logged out.', "success")
    return redirect(url_for('index'))


@auth.route('/register', methods=['GET', 'POST'])
def register():
    if os.environ.get("DISABLE_REGISTRATION", "False").lower() in ["true", "1", "t"]:
        redirect(url_for('index'))
    if request.method == 'POST':
        # Get form data
        username = request.form.get('username', None)
        password = request.form.get('password', None)
        confirm = request.form.get('confirm', None)

        # Check for errors
        if not username or not password or not confirm:
            flash('Please fill out all fields.', "danger")
            return redirect(url_for('auth.register'))

        if password != confirm:
            flash('Passwords do not match.', "danger")
            return redirect(url_for('auth.register'))

        # Check if username is taken
        if User.query.filter_by(username=username).first():
            flash('Username is taken.', "danger")
            return redirect(url_for('auth.register'))

        # Hash password
        password = generate_password_hash(password)

        # Create user
        try:
            user = User(username=username, password=password)
            db.session.add(user)
            db.session.commit()
        except Exception as e:
            flash(str(e), "danger")
            return redirect(url_for('auth.register'))

        flash('Account created!', "success")
        return redirect(url_for('auth.login'))
    else:
        return render_template('register.html')
