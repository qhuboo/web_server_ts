export class HTTPError extends Error {
	public code: number;

	constructor(code: number, message: string) {
		super(message);
		this.code = code;
		this.name = "HTTPError";
	}
}
