// Java test fixture for SQL detection

public class SampleQueries {
    String simpleQuery = "SELECT id, name FROM users WHERE active = true";

    String multiLineConcat = "SELECT u.id, u.name, u.email " +
        "FROM users u " +
        "INNER JOIN orders o ON u.id = o.user_id " +
        "WHERE o.status = 'completed'";

    String insertQuery = "INSERT INTO users (name, email) VALUES (?, ?)";

    // Java 13+ text block
    String textBlockQuery = """
        SELECT u.id, u.name, u.email
        FROM users u
        INNER JOIN orders o ON u.id = o.user_id
        WHERE o.status = 'completed'
        ORDER BY u.name ASC
        """;

    // Non-SQL strings
    String greeting = "Hello, World!";
    String url = "https://api.example.com/users";
    String empty = "";
}
