import * as net from "node:net";
import { Buffer } from "node:buffer";
import {
    DynamicBuffer,
    bufferPush,
    cutMessage,
    bufferPop,
} from "./dynamicBuffer";

let server = net.createServer({ pauseOnConnect: true });

server.listen({ host: "127.0.0.1", port: 1234 });
server.on("connection", newConn);

type TCPConn = {
    socket: net.Socket;
    error: null | Error;
    ended: boolean;
    reader: null | {
        resolve: (value: Buffer) => void;
        reject: (reason: Error) => void;
    };
};

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
    console.log("new connection", socket.remoteAddress, socket.remotePort);
    try {
        await serveClient(socket);
    } catch (error) {
        console.log(error);
    } finally {
        socket.destroy();
    }
}

async function serveClient(socket: net.Socket): Promise<void> {
    const conn: TCPConn = socketInit(socket);
    const buffer: DynamicBuffer = {
        data: Buffer.alloc(0),
        length: 0,
        start: 0,
    };

    while (true) {
        // Try to get 1 message from the buffer
        const msg: null | Buffer = cutMessage(buffer);
        if (!msg) {
            const data: Buffer = await socketRead(conn);
            bufferPush(buffer, data);

            if (data.length === 0) {
                console.log("end connection");
                break;
            }
        } else if (msg.equals(Buffer.from("quit\n"))) {
            await socketWrite(conn, Buffer.from("Bye.\n"));
            socket.destroy();
            return;
        } else {
            const reply = Buffer.concat([Buffer.from("Echo: "), msg]);
            await socketWrite(conn, reply);
        }
    }
}
