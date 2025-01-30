import { Buffer } from "node:buffer";

const buffer1 = Buffer.from("something");
const buffer2 = Buffer.from(buffer1);
console.log(buffer1.toString());
console.log(buffer2.toString());
