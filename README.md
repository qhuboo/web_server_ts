Build Your Own Web Server From Scratch In Node.JS (Work in Progress)


This repository serves as the accompanying codebase where I am following along with the book "Build Your Own Web Server From Scratch In Node.JS" by James Smith.


### Progress Tracker: Table of Contents

**Part I: Make A Basic HTTP Server**
*   [x] 1. Introduction
*   [x] 2. HTTP Overview
*   [x] 3. Code A TCP Server
*   [x] 4. Promises and Events
*   [x] 5. A Simple Network Protocol
*   [x] 6. HTTP Semantics and Syntax
*   [x] 7. Code A Basic HTTP Server

**Part II: Applications & Extensions**
*   [ ] 8. Dynamic Content and Streaming
*   [ ] 9. File IO & Resource Management
*   [ ] 10. Range Requests
*   [ ] 11. HTTP Caching
*   [ ] 12. Compression & the Stream API
*   [ ] 13. WebSocket & Concurrency

---

## Project Goal & Learning Focus

The aim is to progress incrementally:

1.  **Basic TCP Server:** Start with establishing and managing raw TCP connections.
2.  **Promisified I/O:** Transform callback-based Node.js `net.Socket` operations into a more manageable, asynchronous Promise-based API.
3.  **HTTP/1.1 Protocol Implementation:** Manually parse and serialize HTTP requests and responses, including:
    *   Request line and headers.
    *   Handling `Content-Length`.
    *   Implementing `Transfer-Encoding: chunked`.
    *   Basic routing (e.g., an `/echo` endpoint).
4.  **WebSocket Protocol Implementation:** Implement the WebSocket handshake and frame protocol for real-time bidirectional communication.
5.  **Error Handling & Edge Cases:** Develop robust error handling and consider various edge cases in network communication.
