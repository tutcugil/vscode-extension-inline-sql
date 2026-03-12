# Python test fixture for SQL detection

simple_query = "SELECT id, name FROM users WHERE active = true"

multi_line_query = """
    SELECT u.id, u.name, u.email
    FROM users u
    INNER JOIN orders o ON u.id = o.user_id
    WHERE o.status = 'completed'
    ORDER BY u.name ASC
"""

f_string_query = f"SELECT * FROM users WHERE id = {user_id} AND name = {user_name}"

insert_query = 'INSERT INTO users (name, email) VALUES (%s, %s)'

raw_query = r"SELECT * FROM users WHERE name LIKE '\%test\%'"

# Non-SQL strings (should NOT be detected)
greeting = "Hello, World!"
message = f"Welcome to the application, {username}!"
empty_string = ""
url = "https://api.example.com/users"
