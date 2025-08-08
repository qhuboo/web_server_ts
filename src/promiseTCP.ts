import * as net from "node:net";
import { bufferPush, cutMessage, fieldGet, bufferPop } from "./dynamicBuffer";
import { HTTPError } from "./errors";
import { resolve } from "node:path";

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
		console.log("Data Event");
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
			console.log(buffer);
			// Process the message and send the response
			const reqBody: BodyReader = readerFromReq(conn, buffer, msg);
			console.log("reqBody: ", reqBody);
			const response: HTTPRes = await handleReq(msg, reqBody);
			console.log("response: ", response);
			try {
				await writeHTTPRes(conn, response);
			} finally {
				await response.body.close?.();
			}
		}
		console.log(
			"**************************End***************************************"
		);
	}
}

function readerFromReq(
	conn: TCPConn,
	buffer: DynamicBuffer,
	req: HTTPReq
): BodyReader {
	console.log("In readerFromReq");
	let bodyLen = -1;
	const contentLen = fieldGet(req.headers, "Content-Length");
	if (contentLen) {
		bodyLen = parseInt(contentLen.toString("latin1"));
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
		return readerFromGenerator(readChunks(conn, buffer));
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
				console.log("No more data to read.");
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
function readerFromGenerator(gen: BufferGenerator): BodyReader {
	return {
		length: -1,
		read: async (): Promise<Buffer> => {
			const r = await gen.next();
			if (r.done) {
				return Buffer.from("");
			} else {
				console.assert(r.value.length > 0);
				return r.value;
			}
		},
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

// Creates a buffer generator
async function* readChunks(
	conn: TCPConn,
	buffer: DynamicBuffer
): BufferGenerator {
	for (let last = false; !last; ) {
		console.log("In heo");
		console.log(buffer);
		// Read the chunk-size line
		const idx = buffer.data
			.subarray(buffer.start, buffer.length)
			.indexOf("\r\n");
		console.log("idx: ", idx);
		if (idx < 0) {
			console.log("We need more chunk size data");
			// Need more data
			const data = await socketRead(conn);
			console.log("data: ", data);
			bufferPush(buffer, data);
			console.log(buffer);
			continue;
		}
		// Parse the chunk-size and remove the line
		console.log(
			"current buffer: ",
			buffer.data.subarray(buffer.start, buffer.start + idx)
		);
		console.log(buffer);
		let remain = parseInt(
			buffer.data.subarray(buffer.start, buffer.start + idx).toString("latin1"),
			16
		);
		console.log("remain: ", remain);
		bufferPop(buffer, idx + 2);
		// Is this the last one?
		last = remain === 0;
		// Read and yield data
		console.log("The new buffer: ", buffer);
		while (remain > 0) {
			console.log("We are now getting the actual data chunk");
			if (buffer.length - buffer.start === 0) {
				// We still need more data
				console.log("The buffer was empty, getting a chunk");
				const data = await socketRead(conn);
				bufferPush(buffer, data);
				console.log("This is now the new buffer: ", buffer);
			}

			const consume = Math.min(remain, buffer.length);
			console.log("consume: ", consume);
			const data = Buffer.from(
				buffer.data.subarray(buffer.start, buffer.start + consume)
			);
			console.log("the data we are gonna consume: ", data);
			bufferPop(buffer, consume);
			remain -= consume;
			console.log("this is the final buffer: ", buffer);
			console.log("the remain: ", remain);
			yield data;
		}
		// The chunk data is followed by CRLF
		console.log("we need to remove the crlf");
		if (!last) {
			console.log("We are popping");
			bufferPop(buffer, 2);
		}
		console.log("THE FINAL BUFFER: ", buffer);
	}
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

// Send an HTTP response through the socket
async function writeHTTPRes(conn: TCPConn, response: HTTPRes): Promise<void> {
	// Set the "Content-Length" or "Transfer-Encoding" field
	if (response.body.length < 0) {
		response.headers.push(Buffer.from("Transfer-Encoding: chunked"));
	} else {
		response.headers.push(
			Buffer.from(`Content-Length: ${response.body.length}`)
		);
	}
	// Write the headers
	await socketWrite(conn, encodeHTTPRes(response));
	// Write the body
	const crlf = Buffer.from("\r\n");
	for (let last = false; !last; ) {
		let data = await response.body.read();
		last = data.length === 0;
		// Chunked encoding ?
		if (response.body.length < 0) {
			console.log("We are here");
			data = Buffer.concat([
				Buffer.from(data.length.toString(16)),
				crlf,
				data,
				crlf,
			]);
		}
		if (data.length) {
			await socketWrite(conn, data);
		}
	}
}

function encodeHTTPRes(response: HTTPRes) {
	const headerLines: Buffer[] = [];

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
