// C# test fixture for SQL detection

public class SampleQueries
{
    string simpleQuery = "SELECT id, name FROM users WHERE active = true";

    string verbatimQuery = @"
        SELECT u.id, u.name, u.email
        FROM users u
        INNER JOIN orders o ON u.id = o.user_id
        WHERE o.status = 'completed'
        ORDER BY u.name ASC";

    string interpolatedQuery = $"SELECT * FROM users WHERE id = {userId}";

    string interpolatedVerbatim = $@"
        SELECT * FROM users
        WHERE id = {userId}
        AND name = {userName}";

    string insertQuery = "INSERT INTO users (name, email) VALUES (@name, @email)";

    // Non-SQL strings
    string greeting = "Hello, World!";
    string url = "https://api.example.com/users";
    string empty = "";
}
