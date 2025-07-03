import { HTTPError } from "./errors";

export const HTTPMethods = new Set<HTTPMethod>([
	"CONNECT",
	"DELETE",
	"GET",
	"HEAD",
	"OPTIONS",
	"POST",
	"PUT",
]);

export function bufferPush(buffer: DynamicBuffer, data: Buffer): void {
	console.log("In bufferPush");
	const newLength = buffer.length + data.length;

	if (buffer.data.length < newLength) {
		// Grow the capacity by a factor of two
		let capacity = Math.max(buffer.data.length, 32);
		// Double the size of capacity until it's larger than newLength
		while (capacity < newLength) {
			capacity *= 2;
		}

		// Create a new buffer with size of capacity
		const grown = Buffer.alloc(capacity);
		// Copy the buffer data into this new buffer
		buffer.data.copy(grown, 0, 0);
		// Set this new buffer as the data
		buffer.data = grown;
	}

	// Append the data to the new buffer starting at the end of the old data
	data.copy(buffer.data, buffer.length, 0);
	// Set the new length of the buffer data
	buffer.length = newLength;
}

export function cutMessage(buffer: DynamicBuffer): null | HTTPReq {
	console.log("In cutMessage");
	const bufferView = buffer.data.subarray(buffer.start, buffer.length);
	const idx = bufferView.indexOf("\r\n\r\n");
	if (idx < 0) {
		if (buffer.length - buffer.start >= 1024 * 8) {
			throw new HTTPError(400, "Header is too large.");
		}
		return null;
	}

	// Parse and remove the header
	const msg = parseHTTPReq(bufferView.subarray(0, idx + 4));
	buffer.start += idx + 4;

	// TODO: Implement a bufferPop to remove the header from the buffer.
	return msg;
}

export function bufferPop(
	buffer: DynamicBuffer,
	amountToConsume: number
): void {
	console.log("In bufferPop");
	buffer.start += amountToConsume;
	// if (buffer.start > 512) {
	// 	// Move the remaining data to the front
	// 	buffer.data.copyWithin(0, buffer.start, buffer.length);
	// 	buffer.length = buffer.length - buffer.start;
	// 	buffer.start = 0;
	// }
}

export function parseHTTPReq(data: Buffer): HTTPReq {
	// Split the data into lines
	const lines: Buffer[] = splitLines(data);
	// The fist line is "METHOD URI VERSION"
	const [method, uri, version] = parseRequestLine(lines[0]);
	// Followed by header fields is the format of "Name: value"
	const headers: Buffer[] = [];

	for (let i = 1; i < lines.length; i++) {
		// TODO: header name/value validators
		headers.push(lines[i]);
	}

	// The header ends by an empty line
	console.assert(lines[lines.length - 1].length === 0);
	return {
		method: method,
		uri: uri,
		version: version,
		headers: headers,
	};
}

// Split each line and return an array of Buffers
function splitLines(data: Buffer): Buffer[] {
	const lines: Buffer[] = [];
	let start = 0;
	let idx = 0;
	while (idx !== -1) {
		let bufferView = data.subarray(start, data.length);
		idx = bufferView.indexOf("\r\n");
		if (idx !== -1) {
			const line = bufferView.subarray(0, idx);
			lines.push(line);
			start += idx + 2;
		}
	}
	return lines;
}

// Take the first line of the request header, validate the HTTP method, the URI, and
// the HTTP version.
function parseRequestLine(data: Buffer): [string, Buffer, string] {
	const headerString = data.toString();
	const split = headerString.split(" ");
	const [method, uri, version] = split;
	const bufferUri = Buffer.from(uri);

	return [method, bufferUri, version];
}

export function fieldGet(headers: Buffer[], headerName: string) {
	const headerLines = [];
	for (const header of headers) {
		const headerString = header.toString();
		if (headerString.toLowerCase().startsWith(headerName.toLowerCase())) {
			headerLines.push(headerString);
		}
	}
	if (headerLines.length === 0) return null;

	// Split and validate the header name/value
	const colonIdx = headerLines[0].indexOf(":");
	if (colonIdx === -1) return null;

	const headerName_2 = headerLines[0].substring(0, colonIdx).trim();

	const headerValue = headerLines[0].substring(colonIdx + 1).trim();

	return Buffer.from(headerValue);
}

function validateHeaderName(data: string): boolean {
	return isValidHttpToken(data);
}

function validateHeaderValue(data: string): boolean {
	return !containsInvalidHeaderChar(data);
}

function isValidHttpToken(str: string) {
	const tokenRegExp = /^[\^_`a-zA-Z\-0-9!#$%&'*+.|~]+$/;
	return typeof str === "string" && tokenRegExp.test(str);
}

function containsInvalidHeaderChar(str: string) {
	const headerCharRegex = /[^\t\x20-\x7e\x80-\xff]/;
	return typeof str === "string" && str.length > 0 && headerCharRegex.test(str);
}
