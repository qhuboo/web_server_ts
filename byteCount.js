const jsonString =
	'{"message":"This is a test request with a substantial body to demonstrate how to send POST data through netcat. The body contains various fields including user information, preferences, and metadata.","user":{"id":12345,"name":"John Doe","email":"john.doe@example.com","preferences":{"theme":"dark","notifications":true,"language":"en-US"}},"metadata":{"timestamp":"2025-06-28T10:30:00Z","version":"1.0","client":"netcat-test"},"data":[{"key":"value1"},{"key":"value2"},{"key":"value3"}]}';

// Using Buffer.byteLength (Node.js) to get the length in bytes (UTF-8 by default)
console.log(Buffer.byteLength(jsonString, "utf8"));

// Or creating a Buffer and checking its length (Node.js)
console.log(Buffer.from(jsonString).length);
