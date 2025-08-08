declare global {
	type TCPConn = {
		socket: net.Socket;
		error: null | Error;
		ended: boolean;
		reader: null | {
			resolve: (value: Buffer) => void;
			reject: (value: Error) => void;
		};
	};

	type DynamicBuffer = {
		data: Buffer;
		length: number;
		start: number;
	};

	type HTTPReq = {
		method: string;
		uri: Buffer;
		version: string;
		headers: Buffer[];
	};

	type HTTPRes = {
		code: number;
		headers: Buffer[];
		body: BodyReader;
	};

	type BodyReader = {
		length: number;
		read: () => Promise<Buffer>;
		close?: () => Promise<void>;
	};

	type HTTPMethod =
		| "CONNECT"
		| "DELETE"
		| "GET"
		| "HEAD"
		| "OPTIONS"
		| "POST"
		| "PUT";

	type BufferGenerator = AsyncGenerator<Buffer, void, void>;
}

export {};
