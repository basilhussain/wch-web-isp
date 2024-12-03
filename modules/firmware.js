/*******************************************************************************
 *
 * WCH RISC-V Microcontroller Web Serial ISP
 * Copyright (c) 2024 Basil Hussain
 * 
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
 * details.
 * 
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 * 
 ******************************************************************************/

import { ContentDispositionDecoder } from "./util.js";

const MAX_SIZE_BYTES = 1048576;

export class Firmware {
	#bytes;
	#name;
	#extension;
	#format;
	
	constructor(bytes, name, format) {
		this.#bytes = bytes;
		this.#name = name;
		this.#extension = this.#getFilenameExtension(name);
		this.#format = format;
	}
	
	#getFilenameExtension(name) {
		const nameDotPos = name.lastIndexOf(".");
		return (nameDotPos >= 0 ? name.slice(nameDotPos + 1).toLowerCase() : "");
	}
	
	fillToEndOfSegment(segmentSize, fillVal = 0xFF) {
		if(this.#bytes.length % segmentSize != 0) {
			const oldSize = this.#bytes.length;
			const newSize = Math.ceil(this.#bytes.length / segmentSize) * segmentSize;
			// We need to use transfer() here to make a new buffer of the
			// desired new size, because we might have a non-resizeable
			// ArrayBuffer (because a raw binary was loaded by parse()), so
			// can't use resize(). If it was resizeable, and of big-enough
			// capacity, then the same buffer is reused by transfer().
			this.#bytes = new Uint8Array(this.#bytes.buffer.transfer(newSize));
			this.#bytes.fill(fillVal, oldSize);
		}
	}
	
	getPageCount(pageSize) {
		return Math.ceil(this.#bytes.length / pageSize);
	}
	
	getSectorCount(sectorSize) {
		return Math.ceil(this.#bytes.length / sectorSize);
	}
	
	get fileName() {
		return this.#name;
	}
	
	get fileExtension() {
		return this.#extension;
	}
	
	get size() {
		return this.#bytes.length;
	}
	
	get bytes() {
		return this.#bytes;
	}
	
	get format() {
		return this.#format;
	}
}

export class FirmwareLoader extends EventTarget {
	#parsers = new Map();
	
	constructor() {
		super();
	}
	
	#getFilenameExtension(name) {
		const nameDotPos = name.lastIndexOf(".");
		return (nameDotPos >= 0 ? name.slice(nameDotPos + 1).toLowerCase() : "");
	}
	
	#getUrlResponseFilename(response) {
		// First, try to extract a filename given in any Content-Disposition
		// header present in the HTTP response.
		if(response.headers.has("Content-Disposition")) {
			return ContentDispositionDecoder.getFilename(response.headers.get("Content-Disposition"));
		}
		
		// Otherwise, try to extract a filename from the last part of the URL
		// path.
		const url = new URL(response.url);
		const slashPos = url.pathname.lastIndexOf("/");
		if(url.pathname.length > 1 && slashPos >= 0) {
			return url.pathname.slice(slashPos + 1);
		}
		
		// Failing all the above, just return a default name.
		return "[unknown]";
	}
	
	#progressEvent(incr, total) {
		this.dispatchEvent(new CustomEvent("progress", {
			detail: {
				increment: incr,
				total: total
			}
		}));
	}
	
	async #parseBlob(blob, name) {
		if(blob.size == 0) throw new Error("No data to parse; file is empty");
		
		const extension = this.#getFilenameExtension(name);
		let bytes, format;
		
		if(this.#parsers.has(extension)) {
			// We have a parser for the file extension, so use it on the
			// contents of the blob. If the parser is for text-based files, read
			// the blob as a string; otherwise read binary bytes.
			const parser = this.#parsers.get(extension);
			if(parser.forText) {
				bytes = parser.parse(await blob.text(), MAX_SIZE_BYTES);
			} else {
				bytes = parser.parse(await blob.arrayBuffer(), MAX_SIZE_BYTES);
			}
			format = parser.formatName;
		} else {
			// No parser, just use the raw bytes of the file.
			if(blob.size > MAX_SIZE_BYTES) {
				throw new Error("Maximum size of " + MAX_SIZE_BYTES.toLocaleString() + " bytes exceeded");
			}
			bytes = new Uint8Array(await blob.arrayBuffer());
			format = "Raw Binary";
		}
		
		return { bytes: bytes, format: format };
	}

	addParser(extensions, parser) {
		for(const ext of extensions) {
			this.#parsers.set(ext.trim().toLowerCase(), parser);
		}
	}
	
	async fromFile(file) {
		const { bytes, format } = await this.#parseBlob(file, file.name);
		
		return new Firmware(bytes, file.name, format);
	}
	
	async fromUrl(urlStr) {
		// See if the given URL string starts with a protocol. If not, then add
		// "http://" prefix. If it does, but it's not HTTP, then error.
		const protoMatch = urlStr.match(/^([a-z]+):\/\//i);
		if(!protoMatch) {
			urlStr = "http://" + urlStr;
		} else if(protoMatch[1].toLowerCase() !== "http" && protoMatch[1].toLowerCase() !== "https") {
			throw new Error("Loading from non-HTTP protocol URLs not supported");
		}
		
		// Parse the given URL to check that it's actually valid.
		const url = URL.parse(urlStr);
		if(!url) throw new Error("URL \"" + urlStr + "\" is not valid");
		
		// Trigger an initial progress event with indeterminate state in case of
		// slow-responding server.
		this.#progressEvent(null, null);
		
		// Make the HTTP request.
		const response = await window.fetch(url);
		if(!response.ok) {
			throw new Error("Server response: " + response.status + " " + response.statusText);
		}
		
		const reader = response.body.getReader();
		
		// Get the length of the content (if stated by server). When the
		// response body is encoded (e.g. gzip), we don't know what the actual
		// uncompressed length will be, so estimate it to be 2:1 compressed.
		let totalLength = Number.parseInt(response.headers.get("Content-Length")) || 0;
		if(response.headers.has("Content-Encoding")) totalLength *= 2;

		let chunks = [];
		let receivedLength = 0;
		
		this.#progressEvent(receivedLength, totalLength);
		
		while(true) {
			const { value: chunk, done } = await reader.read();
			if(done) break;

			// Append the chunk to the list. In the unusual case that the
			// received length is now greater than the total length, then just
			// set the total length to be the received length so far.
			chunks.push(chunk);
			receivedLength += chunk.length;
			totalLength = Math.max(receivedLength, totalLength);
			
			this.#progressEvent(receivedLength, totalLength);
		}

		// One last progress call to ensure we finish off to 100%.
		this.#progressEvent(totalLength, totalLength);
		
		// Create our own Blob object out of all the chunks received.
		const name = this.#getUrlResponseFilename(response);
		const blob = new Blob(chunks, {
			type: response.headers.get("Content-Type"),
			endings: "native"
		});
		
		const { bytes, format } = await this.#parseBlob(blob, name);
		
		return new Firmware(bytes, name, format);
	}
}
