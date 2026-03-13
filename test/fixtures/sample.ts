// TypeScript test fixture for SQL detection

const simpleQuery = `SELECT id, name FROM users WHERE active = true`;

const multiLineQuery = `
  SELECT u.id, u.name, u.email
  FROM users u
  INNER JOIN orders o ON u.id = o.user_id
  WHERE o.status = 'completed'
  ORDER BY u.name ASC
`;

const insertQuery = "INSERT INTO users (name, email) VALUES ('John', 'john@example.com')";

const updateQuery = `UPDATE products SET price = ${newPrice} WHERE id = ${productId}`;

const deleteQuery = "DELETE FROM sessions WHERE expires_at < NOW()";

const withCte = `
  WITH active_users AS (
    SELECT id, name FROM users WHERE active = true
  )
  SELECT * FROM active_users
`;

// Non-SQL strings (should NOT be detected)
const greeting = "Hello, World!";
const message = `Welcome to the application, ${username}!`;
const emptyString = "";
const url = "https://api.example.com/users";
const selectText = "Please select an option from the dropdown";
const template = `<div class="container"><span>${value}</span></div>`;
