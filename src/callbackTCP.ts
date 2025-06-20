import * as net from "node:net";

let server = net.createServer();

server.listen({ host: "127.0.0.1", port: 1234 });

server.on("connection", onConnection);

server.on("error", (error: Error): never => {
	throw error;
});

function onConnection(socket: net.Socket): void {
	console.log("We are connected!");
	console.log(socket);

	socket.on("data", (data: Buffer) => {
		console.log("We have data!");
		console.log("data:", data);
		console.log("data string: ", data.toString());
		socket.write(data);

		if (data.includes("q")) {
			console.log("closing");
			socket.end();
		}
	});

	socket.on("end", () => {
		console.log("EOF.");
	});
}
