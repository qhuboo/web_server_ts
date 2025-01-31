import { start } from "repl";

export type DynamicBuffer = {
  data: Buffer;
  length: number;
  start: number;
};

export function bufferPush(buffer: DynamicBuffer, data: Buffer): void {
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

export function cutMessage(buffer: DynamicBuffer): null | Buffer {
  // messages are separated by '\n'
  //   console.log("******* NEW ********");
  //   console.log("buffer:", buffer);
  //   console.log("buffer size:", buffer.data.length);
  const bufferView = buffer.data.subarray(buffer.start, buffer.length);
  //   console.log("bufferView:", bufferView);
  const idx = bufferView.indexOf("\n");
  //   console.log("idx: ", idx);
  if (idx < 0) {
    return null;
  }

  // Make a copy of the message and move the remaining data to the front
  let msg: Buffer;
  if (idx === bufferView.length - 1) {
    msg = bufferView;
    // Set the new buffer start to the end of the data
    buffer.start = buffer.length;
  } else {
    msg = Buffer.from(bufferView.subarray(0, idx + 1));
    // Set the new buffer start
    buffer.start += idx + 1;
  }

  //   console.log("msg:", msg.toString());
  //   console.log("start:", buffer.start);

  // Calculate if we need to pop the buffer
  if (buffer.start >= Math.round(buffer.data.length / 2)) {
    // console.log("We need to pop the buffer");
    bufferPop(buffer);
  }
  return msg;
}

export function bufferPop(buffer: DynamicBuffer): void {
  // Move the remaining data to the front
  buffer.data.copyWithin(0, buffer.start, buffer.length);
  buffer.length = buffer.length - buffer.start;
  buffer.start = 0;
}
