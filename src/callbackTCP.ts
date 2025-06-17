import * as net from "node:net";

let server = net.createServer();

server.listen({ host: "127.0.0.1", port: 1234 });

server.on("connection", onConnection);

server.on("error", (error: Error): never => {
    throw error;
});

function onConnection(socket: net.Socket): void {
    socket.on("data", (data: Buffer) => {
        console.log("data:", data);
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
