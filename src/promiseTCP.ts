import * as net from "node:net";
import { bufferPush, cutMessage, fieldGet, bufferPop } from "./dynamicBuffer";
import { HTTPError } from "./errors";

let server = net.createServer({ pauseOnConnect: true, noDelay: true });

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
		console.log("Data");
		console.log("DATA: ", data);
		console.log("DATA LEN: ", data.length);
		console.assert(conn.reader);
		conn.socket.pause();
		conn.reader!.resolve(data);
		conn.reader = null;
		console.log("Resolved the promise");
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
	console.log("Created socket read promise");
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
	console.log("In socketWrite");
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
			const res: HTTPRes = {
				code: error.code,
				headers: [],
				body: readerFromMemory(Buffer.from(error.message + "\n")),
			};
			try {
				await writeHTTPRes(conn, res);
			} catch (error) {
				console.log(error);
			}
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

	while (true) {
		// Try to get 1 request header from the buffer
		console.log(
			"***************************Start************************************"
		);
		const msg: null | HTTPReq = cutMessage(buffer);
		if (!msg) {
			console.log("********* Getting Header Packet ****************");
			const data: Buffer = await socketRead(conn);
			bufferPush(buffer, data);
			console.log("Buffer: ", buffer.data.toString());
			console.log(
				"Buffer: ",
				buffer.data.subarray(buffer.length - 2, buffer.length)
			);
			if (data.length === 0) {
				return;
			}
			console.log("********* Got Header Packet ********************");
		} else {
			console.log("Processing the request");
			// Process the message and send the response
			const reqBody: BodyReader = readerFromReq(conn, buffer, msg);
			console.log("reqBody: ", reqBody);
			const response: HTTPRes = await handleReq(msg, reqBody);
			console.log("response: ", response);
			await writeHTTPRes(conn, response);
		}
		console.log(
			"**************************End***************************************"
		);
	}
}

function readerFromReq(conn: TCPConn, buffer: DynamicBuffer, req: HTTPReq) {
	console.log("In readerFromReq");
	let bodyLen = -1;
	const contentLen = fieldGet(req.headers, "Content-Length");
	if (contentLen) {
		bodyLen = parseDec(contentLen.toString("latin1"));
		if (isNaN(bodyLen)) {
			throw new HTTPError(400, "bad Content-Length");
		}
	}

	const bodyAllowed = !(req.method === "GET" || req.method === "HEAD");

	// Check for Transfer-Encoding header
	let chunked = false;
	if (fieldGet(req.headers, "Transfer-Encoding")) {
		const fieldValue = fieldGet(req.headers, "Transfer-Encoding");
		if (fieldValue?.equals(Buffer.from("chunked"))) {
			chunked = true;
		}
	}

	if (!bodyAllowed && (bodyLen > 0 || chunked)) {
		throw new HTTPError(400, "HTTP body not allowed.");
	}

	if (!bodyAllowed) {
		bodyLen = 0;
	}

	if (bodyLen >= 0) {
		console.log("Content-Length is present");
		// "Content-Length" is present
		return readerFromConnLength(conn, buffer, bodyLen);
	} else if (chunked) {
		console.log("Chunked encoding is present");
		// Chunked encoding
		throw new HTTPError(500, "TODO");
	} else {
		console.log("Neither Content-Length or Chunked encoding is present");
		// read the rest of the connection
		throw new HTTPError(500, "TODO");
	}
}

function readerFromConnLength(
	conn: TCPConn,
	buffer: DynamicBuffer,
	remain: number
): BodyReader {
	console.log("In readerFromConnLength");
	return {
		length: remain,
		read: async (): Promise<Buffer> => {
			console.log("In body.read");
			if (remain === 0) {
				return Buffer.from("");
			}
			if (buffer.length - buffer.start === 0) {
				// Try to get some data if there is none
				console.log("Getting some data");
				const data = await socketRead(conn);
				console.log("Got em");
				bufferPush(buffer, data);

				if (data.length === 0) {
					// Expected more data!
					throw new Error("Unexpected EOF from HTTP body");
				}
			}

			// Consume data from the buffer
			const consume = Math.min(buffer.length - buffer.start, remain);
			console.log("Consume: ", consume);
			remain -= consume;
			const data = Buffer.from(
				buffer.data.subarray(buffer.start, buffer.start + consume)
			);
			bufferPop(buffer, consume);
			console.log("This is the remain: ", remain);
			return data;
		},
	};
}

function parseDec(data: string): number {
	return parseInt(data);
}

async function handleReq(req: HTTPReq, body: BodyReader): Promise<HTTPRes> {
	let response: BodyReader;

	switch (req.uri.toString("latin1")) {
		case "/echo":
			response = body;
			break;
		default:
			response = readerFromMemory(Buffer.from("hello world.\n"));
			break;
	}

	return {
		code: 200,
		headers: [Buffer.from("Server: my_first_http_server")],
		body: response,
	};
}

function readerFromMemory(data: Buffer): BodyReader {
	let done = false;
	return {
		length: data.length,
		read: async (): Promise<Buffer> => {
			if (done) {
				return Buffer.from("");
			} else {
				done = true;
				return data;
			}
		},
	};
}

// Send an HTTP response through the socket
async function writeHTTPRes(conn: TCPConn, response: HTTPRes): Promise<void> {
	if (response.body.length < 0) {
		throw new Error("TODO: chunked encoding");
	}
	// Set the "Content-Length" field
	console.assert(!fieldGet(response.headers, "Content-Length"));
	response.headers.push(Buffer.from(`Content-Length: ${response.body.length}`));
	// Write the headers
	await socketWrite(conn, encodeHTTPRes(response));
	// Write the body
	while (true) {
		console.log("write");
		const data = await response.body.read();
		if (data.length === 0) {
			break;
		}
		await socketWrite(conn, data);
	}
}

function encodeHTTPRes(response: HTTPRes) {
	const headerLines = [];

	headerLines.push(Buffer.from(`HTTP/1.1 ${response.code} OK`));
	for (const header of response.headers) {
		headerLines.push(header);
	}
	// Join all the header lines with CRLF and add the final CRLF for the
	// header/body separator
	const fullHeader = Buffer.concat([
		Buffer.concat(
			headerLines.map((line) => Buffer.concat([line, Buffer.from("\r\n")]))
		),
		Buffer.from("\r\n"),
	]);
	return fullHeader;
}
