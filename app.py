import os
import re
import sqlite3
from functools import wraps

import jwt
from flask import Flask, jsonify, request, send_from_directory
from flask_bcrypt import Bcrypt

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'data', 'homora.db')
PORT = int(os.environ.get('PORT', '8001'))
SECRET_KEY = os.environ.get('HOMORA_JWT_SECRET', 'homora-finance-super-secret-key-1234567890')

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

app = Flask(__name__, static_folder='.', static_url_path='')
app.config['SECRET_KEY'] = SECRET_KEY
bcrypt = Bcrypt(app)


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db_connection() as conn:
        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            '''
        )
        conn.commit()


init_db()


def generate_token(user_id, email):
    payload = {'sub': str(user_id), 'email': email}
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')


def require_auth(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '', 1).strip() if auth_header.startswith('Bearer ') else None

        if not token:
            token = request.cookies.get('homora_token')

        if not token:
            return jsonify({'message': 'Authentication required.'}), 401

        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        except jwt.PyJWTError:
            return jsonify({'message': 'Session expired or invalid.'}), 401

        with get_db_connection() as conn:
            user = conn.execute('SELECT id, email FROM users WHERE id = ?', (payload.get('sub'),)).fetchone()

        if not user:
            return jsonify({'message': 'Session expired or invalid.'}), 401

        request.user = {'id': user['id'], 'email': user['email']}
        return view_func(*args, **kwargs)

    return wrapped


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'ok': True, 'service': 'Homora Finance API'})


@app.route('/api/auth/signup', methods=['POST'])
def signup():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email', '')).strip().lower()
    password = str(payload.get('password', '')).strip()

    if not email or not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
        return jsonify({'message': 'A valid email is required.'}), 400

    if len(password) < 6:
        return jsonify({'message': 'Password must be at least 6 characters long.'}), 400

    with get_db_connection() as conn:
        existing = conn.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()
        if existing:
            return jsonify({'message': 'An account with this email already exists.'}), 409

        password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
        cursor = conn.execute(
            'INSERT INTO users (email, password_hash) VALUES (?, ?)',
            (email, password_hash),
        )
        user_id = cursor.lastrowid
        token = generate_token(user_id, email)

    response = jsonify({
        'message': 'Account created successfully.',
        'token': token,
        'user': {'email': email},
    })
    response.set_cookie('homora_token', token, httponly=True, samesite='Lax', secure=False, max_age=60 * 60 * 24 * 7)
    return response, 201


@app.route('/api/auth/login', methods=['POST'])
def login():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email', '')).strip().lower()
    password = str(payload.get('password', '')).strip()

    if not email or not password:
        return jsonify({'message': 'Email and password are required.'}), 400

    with get_db_connection() as conn:
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()

    if not user or not bcrypt.check_password_hash(user['password_hash'], password):
        return jsonify({'message': 'Invalid email or password.'}), 401

    token = generate_token(user['id'], user['email'])
    response = jsonify({
        'message': 'Login successful.',
        'token': token,
        'user': {'email': user['email']},
    })
    response.set_cookie('homora_token', token, httponly=True, samesite='Lax', secure=False, max_age=60 * 60 * 24 * 7)
    return response, 200


@app.route('/api/auth/me', methods=['GET'])
@require_auth
def current_user():
    return jsonify({'user': {'email': request.user['email']}})


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    response = jsonify({'message': 'Logged out successfully.'})
    response.delete_cookie('homora_token', samesite='Lax', secure=False)
    return response


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_app(path):
    if path.startswith('api/'):
        return jsonify({'message': 'Not found.'}), 404

    if path and os.path.isfile(os.path.join(BASE_DIR, path)):
        return send_from_directory(BASE_DIR, path)

    return send_from_directory(BASE_DIR, 'index.html')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=False)
