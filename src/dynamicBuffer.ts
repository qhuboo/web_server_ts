export type DynamicBuffer = {
  data: Buffer;
  length: number;
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
