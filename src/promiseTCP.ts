import * as net from "node:net";
import { bufferPush, cutMessage } from "./dynamicBuffer";
import { HTTPError } from "./errors";

let server = net.createServer({ pauseOnConnect: true });

server.listen({ host: "127.0.0.1", port: 1234 });
server.on("connection", newConn);

function socketInit(socket: net.Socket): TCPConn {
	const conn: TCPConn = {
		socket: socket,
		error: null,
		ended: false,
		reader: null,
	};

	socket.on("data", (data: Buffer) => {
		console.assert(conn.reader);
		conn.socket.pause();
		conn.reader!.resolve(data);
		conn.reader = null;
	});

	socket.on("end", () => {
		conn.ended = true;

		if (conn.reader) {
			conn.reader.resolve(Buffer.from(""));
			conn.reader = null;
		}
	});

	socket.on("error", (error: Error) => {
		conn.error = error;

		if (conn.reader) {
			conn.reader.reject(error);
			conn.reader = null;
		}
	});

	return conn;
}

function socketRead(conn: TCPConn): Promise<Buffer> {
	console.assert(!conn.reader);
	return new Promise((resolve, reject) => {
		if (conn.error) {
			reject(conn.error);
			return;
		}

		if (conn.ended) {
			resolve(Buffer.from(""));
			return;
		}

		conn.reader = { resolve: resolve, reject: reject };

		conn.socket.resume();
	});
}

function socketWrite(conn: TCPConn, data: Buffer): Promise<void> {
	console.assert(data.length > 0);
	return new Promise((resolve, reject) => {
		if (conn.error) {
			reject(conn.error);
			return;
		}

		conn.socket.write(data, (error?: Error) => {
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
}

async function newConn(socket: net.Socket): Promise<void> {
	const conn: TCPConn = socketInit(socket);
	try {
		await serveClient(conn);
	} catch (error) {
		console.log("Error: ", error);
		if (error instanceof HTTPError) {
			// intended to send an error response
			// const res: HTTPRes = {
			//     code: error.code,
			//     headers: [],
			//     body: readerFromMemory(Buffer.from(error.message + "\n"));
			// };
			// try {
			//     await writeHTTPRes(conn, res);
			// } catch (error) {
			//     console.log(error);
			// }
		}
	} finally {
		socket.destroy();
	}
}

async function serveClient(conn: TCPConn): Promise<void> {
	const buffer: DynamicBuffer = {
		data: Buffer.alloc(0),
		length: 0,
		start: 0,
	};

	let count = 0;
	while (count < 10) {
		count++;
		// Try to get 1 request header from the buffer
		const msg: null | HTTPReq = cutMessage(buffer);
		if (!msg) {
			console.log("Need more data");
			const data: Buffer = await socketRead(conn);
			bufferPush(buffer, data);
		}

		console.log("msg: ", msg);
	}
}
