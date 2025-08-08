import * as fs from "node:fs/promises";

async function serveStaticFile(path: string): Promise<HTTPRes> {
	let fp: null | fs.FileHandle = null;
	try {
		// open the file
		fp = await fs.open(path, "r");
		const stat = await fp.stat();
		const reader: BodyReader = readerFromStaticFile(fp, stat.size);
		fp = null;
		return {
			code: 200,
			headers: [],
			body: reader,
		};
	} catch (err) {
		// cannot open the file
		console.info(`error serving file: `, err);
		return res404();
	} finally {
		// Make sure the file is closed
		await fp?.close();
	}
}

function readerFromStaticFile(fp: fs.FileHandle, size: number): BodyReader {
	let got = 0;

	return {
		length: size,
		read: async (): Promise<Buffer> => {
			const r: fs.FileReadResult<Buffer> = await fp.read();
			got += r.bytesRead;
			if (got > size || (got < size && r.bytesRead === 0)) {
				// unhappy case: file size changed.
				// cannot continue since we have sent the 'Content-Length'.
				throw new Error("File size changed, abandon it!");
			}
			// NOTE: the automatically allocated buffer may be larger
			return r.buffer.subarray(0, r.bytesRead);
		},
		close: async () => await fp.close(),
	};
}
